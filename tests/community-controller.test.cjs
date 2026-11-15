'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {communityService}=require('./community-test-helpers.cjs');

test('Duplicate authenticated creator names never grant creation rights to another account',async()=>{
 const service=communityService({permissionsForName:name=>({canCreateChannels:name==='Lukas',canCreateGroups:name==='Lukas'}),permissionsForIdentity:user=>({canCreateChannels:user.id==='trusted-account',canCreateGroups:user.id==='trusted-account'})});
 const imposter=service.connect({id:'different-account',name:'Lukas'});
 assert.equal((await imposter.send('social:join',{roomId:'channel-restricted',name:'Lukas'})).code,'creation-disabled');
 assert.equal(service.rooms.has('channel-restricted'),false);
 const owner=service.connect({id:'trusted-account',name:'Renamed creator'});
 assert.equal((await owner.send('social:join',{roomId:'channel-restricted',name:'Untrusted submitted name'})).ok,true);
 assert.equal((await owner.send('social:join',{roomId:'group-restricted'})).ok,true);
 assert.equal(owner.last('social:history').selfName,'Renamed creator');
});

test('Server history, presence, messages and typing distinguish guests from signed-in accounts with the same name',async()=>{
 const service=communityService({now:()=>1800000000000}),guest=service.connect(),account=service.connect({id:'signed-in-account',name:'Lukas'});
 await guest.send('social:join',{roomId:'channel-general',name:'Lukas'});
 await account.send('social:join',{roomId:'channel-general',name:'Fake name'});
 const guestSelf=guest.last('social:history').self;
 assert.deepEqual(guestSelf,{id:'guest:'+guest.socket.id,name:'Lukas',authenticated:false});
 assert.deepEqual(account.last('social:history').self,{id:'signed-in-account',name:'Lukas',authenticated:true});
 assert.deepEqual(account.last('social:members').members,['Lukas','Lukas']);
 assert.deepEqual(account.last('social:members').people,[guestSelf,{id:'signed-in-account',name:'Lukas',authenticated:true}]);
 const guestSend=await guest.send('social:message',{roomId:'channel-general',text:'Guest fixture',authorId:'signed-in-account',authenticated:true});
 assert.equal(guestSend.message.authorId,guestSelf.id);assert.equal(guestSend.message.authenticated,false);
 const accountSend=await account.send('social:message',{roomId:'channel-general',text:'Account fixture',authorId:guestSelf.id,authenticated:false});
 assert.equal(accountSend.message.authorId,'signed-in-account');assert.equal(accountSend.message.authenticated,true);
 await guest.send('social:typing',{roomId:'channel-general'});
 assert.deepEqual(account.last('social:typing'),{roomId:'channel-general',id:guestSelf.id,name:'Lukas',authenticated:false});
 await guest.send('social:leave');
 assert.deepEqual(account.last('social:members').people,[{id:'signed-in-account',name:'Lukas',authenticated:true}]);
});

test('A same-named account cannot claim another account’s confirmed draft',async()=>{
 const service=communityService(),first=service.connect({id:'first-account',name:'Ava'}),second=service.connect({id:'second-account',name:'Ava'});
 for(const client of [first,second])await client.send('social:join',{roomId:'channel-general'});
 const original=await first.send('social:message',{roomId:'channel-general',text:'First account fixture',clientId:'shared-client-id'});
 const other=await second.send('social:message',{roomId:'channel-general',text:'Second account fixture',clientId:'shared-client-id'});
 assert.notEqual(other.message.id,original.message.id);
 assert.equal(other.message.text,'Second account fixture');
 assert.equal(service.rooms.get('channel-general').messages.length,2);
});
