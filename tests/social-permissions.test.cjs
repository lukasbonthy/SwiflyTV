'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-social-permissions-'));
process.env.SWIFLY_DATA_DIR=directory;process.env.SOCIAL_OPEN_ROOM_CREATION='false';process.env.SOCIAL_LOCK_WATCHROOM_CREATION='true';delete process.env.SWIFLY_ACCESS_PIN;
const {loadServer}=require('./ui-helpers.cjs');const api=loadServer();let origin;
test.before(async()=>{await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{await new Promise(resolve=>api.io.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
async function request(route,body,cookie=''){const response=await fetch(origin+route,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});return response;}
test('Social permission and creation routes cannot trust a supplied creator display name',async()=>{
 const response=await request('/api/social/permissions?name=Lukas'),value=await response.json();
 assert.equal(value.permissions.canCreateChannels,false);assert.equal(value.permissions.canCreateWatchRooms,false);
 assert.equal((await request('/api/social/watchrooms/create',{creator:'Lukas',name:'Impersonated room'})).status,403);
 assert.equal((await request('/watchrooms/new?creator=Lukas')).headers.get('location'),'/social?tab=watchrooms&denied=create-party');
});
test('Only an allowlisted immutable account ID grants social creator permissions',async()=>{
 async function signup(email,handle){const response=await request('/api/connect/auth/signup',{name:'Lukas',handle,email,password:'a sufficiently long test passphrase'});assert.equal(response.status,201);return {user:(await response.json()).user,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};}
 const owner=await signup('owner@social.example','actualowner'),imposter=await signup('imposter@social.example','differentviewer');
 process.env.SOCIAL_CREATOR_ACCOUNT_IDS=owner.user.id;
 for(const [account,allowed]of [[owner,true],[imposter,false]]){
  const permissions=await(await request('/api/social/permissions?name=Lukas',null,account.cookie)).json();assert.equal(permissions.permissions.canCreateChannels,allowed);
  assert.equal((await request('/api/social/watchrooms/create',{creator:'Lukas',name:'Account room'},account.cookie)).status,allowed?200:403);
 }
});
