'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {createAccountStore}=require('../lib/account-store');
const {createConnect}=require('../lib/connect');

async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swifly-connect-'));
 const store=createAccountStore({directory:dir});
 const service=createConnect({store,resolveMedia:async(type,id)=>({type,id,title:'A <film>',poster:'https://image.tmdb.org/t/p/w342/a.jpg',href:`/${type}/${id}`}),createParty:()=>'/social?tab=watchrooms&roomId=abc-def'});
 const app=express();app.use(express.json());app.use('/api/connect',service.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}`;
 async function call(route,{cookie='',body,method=body?'POST':'GET',origin,account}={}){
  const response=await fetch(base+'/api/connect'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{}),...(account?{'X-Swifly-Account':account}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
 }
 async function signup(handle){const r=await call('/auth/signup',{body:{name:handle,handle,email:handle+'@example.com',password:'correct-horse-123'}});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
 t.after(async()=>{service.close();await new Promise(resolve=>server.close(resolve));await store.close();await fs.rm(dir,{recursive:true,force:true});});
 return {store,dir,call,signup};
}
async function befriend(f,a,b){assert.equal((await f.call('/friends/request',{cookie:a.cookie,body:{handle:b.user.handle}})).status,201);assert.equal((await f.call(`/friends/${a.user.id}/accept`,{cookie:b.cookie,body:{}})).status,200);}

test('accounts use hashed passwords, HttpOnly sessions, login validation and revocation',async t=>{
 const f=await fixture(t),a=await f.signup('alice');
 const session=await f.call('/session',{cookie:a.cookie});assert.equal(session.data.user.handle,'alice');assert.match(session.headers.get('cache-control'),/no-store/);
 const disk=await fs.readFile(path.join(f.dir,'accounts.json'),'utf8');assert(!disk.includes('correct-horse-123'));assert(!disk.includes(a.cookie.split('=')[1]));assert(!JSON.stringify(session.data).includes('password'));
 assert.equal((await f.call('/auth/login',{body:{email:'alice@example.com',password:'wrong'}})).status,401);
 const login=await f.call('/auth/login',{body:{email:'alice@example.com',password:'correct-horse-123'}});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/i);
 assert.equal((await f.call('/auth/logout',{cookie:a.cookie,body:{}})).status,200);assert.equal((await f.call('/bootstrap',{cookie:a.cookie})).status,401);
});
test('file transactions survive restart and concurrent updates',async t=>{
 const f=await fixture(t);await f.signup('alice');
 await Promise.all(Array.from({length:12},()=>f.store.transaction(s=>{s.testCount=(s.testCount||0)+1;})));
 const restored=createAccountStore({directory:f.dir});assert.equal((await restored.read()).testCount,12);assert.equal(Object.keys((await restored.read()).users).length,1);await restored.close();
});
test('duplicate accounts and malformed credentials are rejected and cross-origin writes fail',async t=>{
 const f=await fixture(t);await f.signup('alice');
 assert.equal((await f.call('/auth/signup',{body:{name:'x',handle:'alice',email:'alice@example.com',password:'correct-horse-123'}})).status,409);
 assert.equal((await f.call('/auth/signup',{body:{name:'x',handle:'ok',email:'bad',password:'1'}})).status,400);
 assert.equal((await f.call('/auth/login',{body:{email:'alice@example.com',password:'correct-horse-123'},origin:'https://evil.example'})).status,403);
});
test('friendship requires acceptance; strangers cannot send messages or see a third-party conversation',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob'),c=await f.signup('carol');
 assert.equal((await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{text:'hello'}})).status,403);
 await befriend(f,a,b);assert.equal((await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{text:'<script>secret</script>'}})).status,201);
 const thread=await f.call(`/messages/${a.user.id}`,{cookie:b.cookie});assert.equal(thread.data.messages[0].text,'<script>secret</script>');
 assert.equal((await f.call(`/messages/${a.user.id}`,{cookie:c.cookie})).status,403);
 const people=await f.call('/people?q=alice',{cookie:c.cookie});assert.equal(people.data.people[0].handle,'alice');assert(!JSON.stringify(people.data).includes('@example.com'));
});
test('notifications and unread state persist and only the owner may mark them read',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');await befriend(f,a,b);
 await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{text:'Movie night?'}});
 const inbox=await f.call('/bootstrap',{cookie:b.cookie});assert(inbox.data.notifications.some(n=>n.kind==='message'&&!n.readAt));
 await f.call('/notifications/read',{cookie:a.cookie,body:{all:true}});assert((await f.call('/bootstrap',{cookie:b.cookie})).data.notifications.some(n=>!n.readAt));
 await f.call('/notifications/read',{cookie:b.cookie,body:{all:true}});assert((await f.call('/bootstrap',{cookie:b.cookie})).data.notifications.every(n=>n.readAt));
 await f.call(`/messages/${a.user.id}/read`,{cookie:b.cookie,body:{}});assert.equal((await f.call('/bootstrap',{cookie:b.cookie})).data.friends[0].unread,0);
});
test('unfriend and block immediately revoke sending and hide watching activity',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');await befriend(f,a,b);
 await f.call('/settings',{cookie:a.cookie,body:{shareWatching:true}});await f.call('/presence',{cookie:a.cookie,body:{playing:true,media:{id:'101',type:'movie'}}});
 assert.equal((await f.call('/bootstrap',{cookie:b.cookie})).data.friends[0].activity.media.id,'101');
 await f.call(`/friends/${b.user.id}/block`,{cookie:a.cookie,body:{}});
 assert.equal((await f.call(`/messages/${a.user.id}`,{cookie:b.cookie,body:{text:'no'}})).status,403);
 assert.equal((await f.call('/bootstrap',{cookie:b.cookie})).data.friends.length,0);
 assert.equal((await f.call('/people?q=alice',{cookie:b.cookie})).data.people.length,0);
});
test('movie cards are resolved on the server and watchparty invites use a real room URL',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');await befriend(f,a,b);
 const msg=await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{kind:'title',media:{id:'101',type:'movie',title:'Spoof',href:'javascript:evil()'}}});assert.equal(msg.status,201);assert.equal(msg.data.message.media.title,'A <film>');assert.equal(msg.data.message.media.href,'/movie/101');
 assert.equal((await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{kind:'party',media:{id:'101',type:'movie'}}})).data.message.partyUrl,'/social?tab=watchrooms&roomId=abc-def');
 assert.equal((await f.call(`/messages/${b.user.id}`,{cookie:a.cookie,body:{kind:'title',media:{id:'../../secrets',type:'movie'}}})).status,400);
});
test('a shared home invite is expiring, single use, and limited to two accounts under concurrent acceptance',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob'),c=await f.signup('carol');
 const invite=await f.call('/home/invite',{cookie:a.cookie,body:{}});assert.equal(invite.status,201);assert(invite.data.token);
 const attempts=await Promise.all([b,c].map(p=>f.call('/home/accept',{cookie:p.cookie,body:{token:invite.data.token}})));assert.equal(attempts.filter(r=>r.status===200).length,1);assert.equal(attempts.filter(r=>r.status===409).length,1);
 const home=(await f.call('/bootstrap',{cookie:a.cookie})).data.home;assert.equal(home.members.length,2);
 const winner=attempts[0].status===200?b:c;await f.call('/home/leave',{cookie:winner.cookie,body:{}});assert.equal((await f.call('/bootstrap',{cookie:a.cookie})).data.home.members.length,1);
 assert.equal((await f.call('/home/accept',{cookie:c.cookie,body:{token:invite.data.token}})).status,409);
 const stale=await f.call('/home/invite',{cookie:a.cookie,body:{}});await f.store.transaction(s=>{for(const row of Object.values(s.invites))row.expiresAt=0;});assert.equal((await f.call('/home/accept',{cookie:c.cookie,body:{token:stale.data.token}})).status,410);
});
test('shared home list is shared but private messages and profile state remain separate',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');
 const invite=await f.call('/home/invite',{cookie:a.cookie,body:{}});await f.call('/home/accept',{cookie:b.cookie,body:{token:invite.data.token}});
 assert.equal((await f.call('/home/titles',{cookie:a.cookie,body:{media:{id:'101',type:'movie'}}})).status,200);assert.equal((await f.call('/bootstrap',{cookie:b.cookie})).data.home.titles[0].id,'101');
 assert.equal((await f.call('/state',{cookie:a.cookie,method:'PATCH',body:{revision:0,patch:{'swiflytv.profiles':[{name:'Alice'}]}}})).status,200);
 assert.deepEqual((await f.call('/state',{cookie:b.cookie})).data.state,{});
 assert.equal((await f.call('/state',{cookie:a.cookie,method:'PATCH',body:{revision:0,patch:{'swiflytv.profiles':[]}}})).status,409);
 assert.equal((await f.call('/state',{cookie:a.cookie,method:'PATCH',body:{revision:1,patch:{'swiflytv.accounts':['plaintext']}}})).status,400);
 assert.equal((await f.call('/state',{cookie:a.cookie,method:'PATCH',body:{revision:1,patch:{'movieverse.liked':{bad:'shape'}}}})).status,400);
});
test('a stale page cannot write an old account’s state after another tab switches the session',async t=>{const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');assert.equal((await f.call('/state',{cookie:b.cookie,account:a.user.id,method:'PATCH',body:{revision:0,patch:{'movieverse.liked':[{id:101,type:'movie'}]}}})).status,409);assert.deepEqual((await f.call('/state',{cookie:b.cookie})).data.state,{});});
test('ephemeral production storage exposes setup state and refuses account creation',async t=>{
 const store=createAccountStore({available:false});const service=createConnect({store});const app=express();app.use(express.json());app.use(service.router);const server=app.listen(0,'127.0.0.1');t.after(()=>{service.close();server.close();});await new Promise(resolve=>server.on('listening',resolve));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/auth/signup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'x@example.com',handle:'abc',name:'X',password:'password123'})});assert.equal(response.status,503);
});
