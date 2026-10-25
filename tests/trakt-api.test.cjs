'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const express=require('express');
const {createAccountStore}=require('../lib/account-store');
const {createConnect}=require('../lib/connect');

async function listen(app){return new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});}
async function fixture(t,options={}){
 const {createTrakt}=require('../lib/trakt');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swifly-trakt-'));
 const store=createAccountStore({directory:dir}),connect=createConnect({store});
 const calls=[],handlers=new Map();
 const provider=express();provider.use(express.json());provider.use((req,res)=>{
  calls.push({path:req.path,query:req.query,body:req.body,authorization:req.get('authorization'),at:Date.now()});
  const handle=handlers.get(req.path);if(handle)return handle(req,res);
  if(req.path==='/oauth/token')return res.json({access_token:'private-access-'+calls.length,refresh_token:'private-refresh-'+calls.length,created_at:Math.floor(Date.now()/1000),expires_in:86400});
  if(req.path==='/oauth/revoke')return res.status(200).end();
  if(req.path.startsWith('/sync/')&&req.method==='GET')return res.set('X-Pagination-Page-Count','1').json([]);
  if(req.path.startsWith('/sync/'))return res.json({added:{movies:1,episodes:1},deleted:{movies:1,episodes:1},not_found:{movies:[],shows:[],episodes:[]}});
  res.status(404).json({error:'fixture_route_not_found'});
 });
 const upstream=await listen(provider),upstreamBase='http://127.0.0.1:'+upstream.address().port;
 const env={TRAKT_CLIENT_ID:'fixture-client',TRAKT_CLIENT_SECRET:'fixture-secret',TRAKT_REDIRECT_URI:'https://swifly.example/api/trakt/callback',TRAKT_REQUEST_TIMEOUT_MS:'1200',...options.env};
 const service=createTrakt({...options,store,authenticate:connect.identity,env,fetch:(url,init)=>{const u=new URL(url);assert(['api.trakt.tv','auth.trakt.tv'].includes(u.hostname));return fetch(upstreamBase+u.pathname+u.search,init);}});
 const app=express();app.use(express.json());app.use('/api/connect',connect.router);app.use('/api/trakt',service.router);
 const server=await listen(app),base='http://127.0.0.1:'+server.address().port;
 async function call(route,{cookie='',body,method=body?'POST':'GET',origin,account,redirect='manual'}={}){
  const r=await fetch(base+route,{method,redirect,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{}),...(account?{'X-Swifly-Account':account}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
 }
 async function signup(handle){const r=await call('/api/connect/auth/signup',{body:{name:handle,handle,email:handle+'@example.com',password:'correct-horse-123'}});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
 async function link(user){const r=await call('/api/trakt/link',{cookie:user.cookie,body:{}});assert.equal(r.status,200,JSON.stringify(r.data));const u=new URL(r.data.url);const done=await call('/api/trakt/callback?state='+u.searchParams.get('state')+'&code=single-use-code',{cookie:user.cookie});assert.equal(done.status,303,JSON.stringify(done.data));return u;}
 t.after(async()=>{await service.close?.();await connect.close();server.closeAllConnections?.();upstream.closeAllConnections?.();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);await store.close();await fs.rm(dir,{recursive:true,force:true});});
 return {store,dir,call,signup,link,calls,handlers};
}

test('Trakt endpoints require verified sessions and report missing configuration without exposing credentials',async t=>{
 const f=await fixture(t,{env:{TRAKT_CLIENT_ID:'',TRAKT_CLIENT_SECRET:'',TRAKT_REDIRECT_URI:''}});
 assert.equal((await f.call('/api/trakt/status')).status,401);
 const a=await f.signup('alice'),status=await f.call('/api/trakt/status',{cookie:a.cookie});
 assert.equal(status.data.configured,false);assert.equal(status.data.linked,false);assert.match(status.headers.get('cache-control'),/no-store/);
 assert.equal((await f.call('/api/trakt/link',{cookie:a.cookie,body:{}})).status,503);
});

test('OAuth state is random, PKCE protected, single-use and bound to the initiating account and session',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');
 const start=await f.call('/api/trakt/link',{cookie:a.cookie,body:{}}),url=new URL(start.data.url),state=url.searchParams.get('state');
 assert.equal(url.origin,'https://auth.trakt.tv');assert.equal(url.searchParams.get('redirect_uri'),'https://swifly.example/api/trakt/callback');assert.match(state,/^[A-Za-z0-9_-]{43}$/);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(!start.data.url.includes('fixture-secret'));
 assert.equal((await f.call('/api/trakt/callback?state='+state+'&code=code',{cookie:b.cookie})).status,400);
 const login=await f.call('/api/connect/auth/login',{body:{email:'alice@example.com',password:'correct-horse-123'}});
 assert.equal((await f.call('/api/trakt/callback?state='+state+'&code=code',{cookie:login.cookie})).status,400);
 assert.equal((await f.call('/api/trakt/callback?state='+state+'&code=code',{cookie:a.cookie})).status,303);
 assert.equal((await f.call('/api/trakt/callback?state='+state+'&code=code',{cookie:a.cookie})).status,400);
 const exchange=f.calls.find(c=>c.path==='/oauth/token');assert.equal(exchange.body.grant_type,'authorization_code');assert.equal(crypto.createHash('sha256').update(exchange.body.code_verifier).digest('base64url'),url.searchParams.get('code_challenge'));
 const bootstrap=await f.call('/api/connect/bootstrap',{cookie:a.cookie}),remote=await f.call('/api/connect/state',{cookie:a.cookie});assert(!JSON.stringify([bootstrap.data,remote.data]).includes('private-'));
 assert.equal((await f.call('/api/trakt/status',{cookie:b.cookie})).data.linked,false);
 assert.equal((await f.call('/api/trakt/link',{cookie:a.cookie,body:{},origin:'https://evil.example'})).status,403);
 assert.equal((await f.call('/api/trakt/status',{cookie:a.cookie,account:b.user.id})).status,409);
});

test('expired OAuth attempts cannot exchange a code and callback addresses must be fixed HTTPS URLs',async t=>{
 const f=await fixture(t),a=await f.signup('alice');
 const start=await f.call('/api/trakt/link',{cookie:a.cookie,body:{}}),state=new URL(start.data.url).searchParams.get('state');
 await f.store.transaction(s=>{s.users[a.user.id].traktOAuth.expiresAt=Date.now()-1;});
 assert.equal((await f.call('/api/trakt/callback?state='+state+'&code=code',{cookie:a.cookie})).status,400);assert.equal(f.calls.length,0);
 const g=await fixture(t,{env:{TRAKT_REDIRECT_URI:'http://attacker.example/api/trakt/callback'}}),b=await g.signup('alice');
 assert.equal((await g.call('/api/trakt/status',{cookie:b.cookie})).data.configured,false);
});

test('pull follows pagination and merges TMDB watchlist and exact watched episodes into only the selected profile',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);
 await f.store.transaction(s=>{const u=s.users[a.user.id];u.state={'swiflytv.library.main':{version:1,watchlist:[{id:'99',type:'movie',key:'movie:99',title:'Existing'}],watched:[{id:'42',type:'movie',key:'movie:42',titleKey:'movie:42',watchedAt:'2026-10-25T00:00:00.000Z'}],folders:[{id:'saved',name:'Keep',members:['movie:99']}],preferences:{spoilerMode:true},episodeRead:['stay']},'swiflytv.library.kids':{watched:[]}};u.revision=3;});
 f.handlers.set('/sync/watchlist',(req,res)=>res.set('X-Pagination-Page-Count','2').json(Number(req.query.page)===1?[{movie:{title:'Imported',year:2020,ids:{tmdb:42}}},{movie:{title:'Unmapped',ids:{trakt:1}}}]:[{show:{title:'Series',ids:{tmdb:101}}}]));
 f.handlers.set('/sync/watched/movies',(req,res)=>res.set('X-Pagination-Page-Count','1').json([{movie:{title:'Imported',ids:{tmdb:42}},last_watched_at:'2020-01-01T00:00:00.000Z'}]));
 f.handlers.set('/sync/watched/shows',(req,res)=>res.set('X-Pagination-Page-Count','1').json([{show:{title:'Series',ids:{tmdb:101}},seasons:[{number:2,episodes:[{number:8,last_watched_at:'2026-09-20T00:00:00.000Z'},{number:9,last_watched_at:'2026-09-21T00:00:00.000Z'}]}]}]));
 const imported=await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.skipped,1);
 const u=(await f.store.read()).users[a.user.id],library=u.state['swiflytv.library.main'];assert.deepEqual(library.watchlist.map(x=>x.key).sort(),['movie:42','movie:99','tv:101']);assert.deepEqual(library.watched.map(x=>x.key).sort(),['movie:42','tv:101:2:8','tv:101:2:9']);assert.equal(library.watched.find(x=>x.key==='movie:42').watchedAt,'2026-10-25T00:00:00.000Z');assert.equal(library.preferences.spoilerMode,true);assert.deepEqual(library.episodeRead,['stay']);assert.equal(library.folders[0].name,'Keep');assert.deepEqual(u.state['swiflytv.library.kids'],{watched:[]});assert.equal(u.revision,4);
 const gets=f.calls.filter(x=>x.path.startsWith('/sync/'));assert.equal(gets.filter(x=>x.path==='/sync/watchlist').length,2);assert(gets.every(x=>x.query.page&&x.query.limit));assert.equal(gets.find(x=>x.path==='/sync/watched/shows').query.extended,'progress');
 await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});const repeated=(await f.store.read()).users[a.user.id].state['swiflytv.library.main'];assert.equal(repeated.watched.length,3);assert.equal(repeated.watchlist.length,3);
});

test('refresh rotates once under concurrent imports and merge retains changes saved while upstream is running',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);
 await f.store.transaction(s=>{const u=s.users[a.user.id];u.trakt.expiresAt=0;u.state['swiflytv.library.main']={watchlist:[],watched:[],folders:[]};});
 let unblock,started;const hold=new Promise(r=>{unblock=r;}),seen=new Promise(r=>{started=r;});let first=true;
 f.handlers.set('/sync/watchlist',async(req,res)=>{if(first){first=false;started();await hold;}res.set('X-Pagination-Page-Count','1').json([{movie:{title:'Remote',ids:{tmdb:42}}}]);});
 const pull=f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});await seen;
 await f.store.transaction(s=>{const u=s.users[a.user.id];u.state['swiflytv.library.main'].watchlist.push({id:'90',type:'movie',key:'movie:90',title:'Saved during pull'});u.revision++;});
 const second=f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});unblock();const results=await Promise.all([pull,second]);assert(results.every(r=>r.status===200));
 assert.equal(f.calls.filter(c=>c.path==='/oauth/token'&&c.body.grant_type==='refresh_token').length,1);
 const u=(await f.store.read()).users[a.user.id];assert.deepEqual(u.state['swiflytv.library.main'].watchlist.map(x=>x.id).sort(),['42','90']);assert.match(u.trakt.refreshToken,/private-refresh-/);
});

test('only actual watchlist and watched deltas are pushed; remove, episode identity, revocation and logout stay isolated',async t=>{
 const f=await fixture(t),a=await f.signup('alice'),b=await f.signup('bob');await f.link(a);
 const push=await f.call('/api/trakt/changes',{cookie:a.cookie,body:{profileId:'main',changes:[{action:'watchlist',item:{id:'42',type:'movie'},removed:false},{action:'watched',item:{id:'101',type:'tv',season:2,episode:8,watchedAt:'2026-10-25T01:00:00.000Z'},removed:false}]}});assert.equal(push.status,200,JSON.stringify(push.data));
 const history=f.calls.find(c=>c.path==='/sync/history');assert.deepEqual(history.body.shows[0].ids,{tmdb:101});assert.equal(history.body.shows[0].seasons[0].episodes[0].number,8);assert.equal(history.body.shows[0].seasons[0].number,2);
 const removed=await f.call('/api/trakt/changes',{cookie:a.cookie,body:{profileId:'main',changes:[{action:'watchlist',item:{id:'42',type:'movie'},removed:true},{action:'watched',item:{id:'101',type:'tv',season:2,episode:8},removed:true}]}});assert.equal(removed.status,200);assert(f.calls.some(c=>c.path==='/sync/watchlist/remove'));assert(f.calls.some(c=>c.path==='/sync/history/remove'));
 assert.equal((await f.call('/api/trakt/changes',{cookie:b.cookie,body:{profileId:'main',changes:[{action:'watched',item:{id:'42',type:'movie'}}]}})).status,409);
 assert.equal((await f.call('/api/trakt/changes',{cookie:a.cookie,body:{changes:[{action:'preferences',item:{id:'42',type:'movie'}}]}})).status,400);
 const disconnected=await f.call('/api/trakt/unlink',{cookie:a.cookie,body:{}});assert.equal(disconnected.status,200);assert.equal(disconnected.data.revoked,true);assert(f.calls.some(c=>c.path==='/oauth/revoke'));assert.equal((await f.call('/api/trakt/status',{cookie:a.cookie})).data.linked,false);
 await f.link(a);await f.call('/api/connect/auth/logout',{cookie:a.cookie,body:{}});const before=f.calls.length;assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,401);assert.equal(f.calls.length,before);
});

test('provider throttling is returned with Retry-After and does not discard local library or hang requests',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);
 f.handlers.set('/sync/watchlist',(req,res)=>res.set('Retry-After','12').status(429).json({error:'slow_down'}));
 const pull=await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});assert.equal(pull.status,429);assert.equal(pull.headers.get('retry-after'),'12');assert.equal(pull.data.code,'trakt_rate_limited');
 const before=f.calls.length;assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,429);assert.equal(f.calls.length,before);
 const g=await fixture(t,{env:{TRAKT_REQUEST_TIMEOUT_MS:'150'}}),b=await g.signup('alice');await g.link(b);g.handlers.set('/sync/watchlist',()=>{});
 const began=Date.now(),timeout=await g.call('/api/trakt/sync',{cookie:b.cookie,body:{profileId:'main'}});assert.equal(timeout.status,504);assert(Date.now()-began<2000);assert.equal((await g.store.read()).users[b.user.id].revision,0);
});

test('logout during a pull prevents its later result from changing the signed-out account',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);let unblock,started;const hold=new Promise(r=>{unblock=r;}),seen=new Promise(r=>{started=r;});
 f.handlers.set('/sync/watchlist',async(req,res)=>{started();await hold;res.set('X-Pagination-Page-Count','1').json([{movie:{title:'Late',ids:{tmdb:42}}}]);});
 const pull=f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});await seen;await f.call('/api/connect/auth/logout',{cookie:a.cookie,body:{}});unblock();assert.equal((await pull).status,401);assert.equal((await f.store.read()).users[a.user.id].revision,0);
});

test('invalid refresh grants require reconnection without replaying the used refresh token',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);await f.store.transaction(s=>{s.users[a.user.id].trakt.expiresAt=0;});
 f.handlers.set('/oauth/token',(req,res)=>res.status(400).json({error:'invalid_grant',error_description:'session not found'}));
 assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,401);
 assert.equal((await f.call('/api/trakt/status',{cookie:a.cookie})).data.reconnectRequired,true);
 const count=f.calls.length;assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,401);assert.equal(f.calls.length,count,'an invalidated refresh token is not replayed');
});

test('a revoked connection that also rejects its refreshed token becomes reconnect-required',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);f.handlers.set('/sync/watchlist',(req,res)=>res.status(401).json({error:'unauthorized'}));
 assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,401);assert.equal((await f.call('/api/trakt/status',{cookie:a.cookie})).data.reconnectRequired,true);
 const count=f.calls.length;assert.equal((await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}})).status,401);assert.equal(f.calls.length,count);
});

test('unlink clears local credentials even if upstream revocation fails and tells the user',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);f.handlers.set('/oauth/revoke',(req,res)=>res.status(503).json({error:'unavailable'}));
 const result=await f.call('/api/trakt/unlink',{cookie:a.cookie,body:{}});assert.equal(result.status,200);assert.equal(result.data.revoked,false);assert.match(result.data.warning,/could not confirm revocation/i);assert.equal((await f.store.read()).users[a.user.id].trakt,undefined);
});

test('bounded imports report truncation and do not silently treat a huge watchlist as complete',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);
 f.handlers.set('/sync/watchlist',(req,res)=>res.set({'X-Pagination-Page-Count':'25','X-Pagination-Limit':'100'}).json([{movie:{title:'Page '+req.query.page,ids:{tmdb:Number(req.query.page)}}}]));
 const result=await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});assert.equal(result.status,200);assert.equal(result.data.truncated,true);assert.equal(f.calls.filter(c=>c.path==='/sync/watchlist').length,20);
});

test('replaying a delivered client change does not create another Trakt watched event',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);const body={profileId:'main',changes:[{eventId:'one-viewing-event',action:'watched',item:{id:'42',type:'movie',watchedAt:'2026-10-25T01:00:00.000Z'}}]};
 assert.equal((await f.call('/api/trakt/changes',{cookie:a.cookie,body})).status,200);assert.equal((await f.call('/api/trakt/changes',{cookie:a.cookie,body})).status,200);assert.equal(f.calls.filter(c=>c.path==='/sync/history').length,1);
});

test('an import respects browser library capacity and reports the titles it could not fit',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);
 await f.store.transaction(s=>{s.users[a.user.id].state['swiflytv.library.main']={version:1,watchlist:Array.from({length:299},(_,i)=>({id:String(i+1),type:'movie',key:'movie:'+(i+1)})),watched:[]};});
 f.handlers.set('/sync/watchlist',(req,res)=>res.set('X-Pagination-Page-Count','1').json([{movie:{title:'Fit',ids:{tmdb:500}}},{movie:{title:'Beyond capacity',ids:{tmdb:501}}}]));
 const result=await f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});assert.equal(result.status,200);assert.equal(result.data.truncated,true);assert.equal(result.data.imported.watchlist,1);const library=(await f.store.read()).users[a.user.id].state['swiflytv.library.main'];assert.equal(library.watchlist.length,300);assert(library.watchlist.some(x=>x.id==='1'));
});

test('a title removed locally during an import is not restored by the in-flight Trakt page',async t=>{
 const f=await fixture(t),a=await f.signup('alice');await f.link(a);await f.store.transaction(s=>{s.users[a.user.id].state['swiflytv.library.main']={version:1,watchlist:[{id:'42',type:'movie',key:'movie:42'}],watched:[]};});
 let release,started;const held=new Promise(r=>release=r),seen=new Promise(r=>started=r);f.handlers.set('/sync/watchlist',async(req,res)=>{started();await held;res.set('X-Pagination-Page-Count','1').json([{movie:{title:'Removed during pull',ids:{tmdb:42}}}]);});
 const pull=f.call('/api/trakt/sync',{cookie:a.cookie,body:{profileId:'main'}});await seen;await f.store.transaction(s=>{const u=s.users[a.user.id];u.state['swiflytv.library.main'].watchlist=[];u.revision++;});release();assert.equal((await pull).status,200);assert.deepEqual((await f.store.read()).users[a.user.id].state['swiflytv.library.main'].watchlist,[]);
});
