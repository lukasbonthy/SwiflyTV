'use strict';
const {randomUUID}=require('node:crypto');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const builtins=new Set(['channel-general','channel-recommendations','channel-movie-night']);
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';

/* Uses the existing room map so the directory and socket history agree. */
function createCommunityController({io,rooms=new Map(),permissionsForIdentity=()=>({}),resolveIdentity=socket=>socket.data?.communityIdentity||null,now=Date.now}={}){
 if(!io)throw Error('Community requires the existing Socket.IO server.');
 function roomFor(id){if(!rooms.has(id))rooms.set(id,{id,messages:[],members:new Map(),createdAt:now()});const room=rooms.get(id);if(!room.people)room.people=new Map();return room;}
 const members=id=>({roomId:id,members:Array.from(rooms.get(id)?.members.values()||[]),people:Array.from(rooms.get(id)?.people?.values()||[])});
 function attach(socket){
  let joined='',name='Guest',person={id:'guest:'+socket.id,name,authenticated:false},joinGeneration=0;const buckets=new Map(),drafts=new Map();
  const allowance=(key,limit,windowMs)=>{const time=now(),previous=buckets.get(key),bucket=previous&&time-previous.at<windowMs?previous:{at:time,count:0};bucket.count++;buckets.set(key,bucket);return bucket.count<=limit;};
  const reject=(code,roomId,ack)=>{const value={ok:false,code,roomId};socket.emit('social:error',value);if(typeof ack==='function')ack(value);};
  function leave(){if(!joined)return;const previous=joined;joined='';rooms.get(previous)?.members.delete(socket.id);rooms.get(previous)?.people?.delete(socket.id);socket.leave('social:'+previous);io.to('social:'+previous).emit('social:members',members(previous));}
  socket.on('social:join',async(payload={},ack)=>{
   if(!object(payload))return reject('invalid-channel','',ack);
   const id=clean(payload.roomId,80)||'channel-general',displayName=clean(payload.name,40)||'Guest';
   if(!/^(?:channel|group)-[a-z0-9][a-z0-9-]{0,63}$/.test(id))return reject('invalid-channel',id,ack);
   if(!allowance('join',30,60000))return reject('rate-limit',id,ack);
   const generation=++joinGeneration;let identity=null;try{const resolved=await resolveIdentity(socket);identity=resolved?.user||resolved;}catch{}if(generation!==joinGeneration||socket.connected===false)return;
   const authenticated=identity&&typeof identity.id==='string'&&identity.id.length>0,trustedName=authenticated?clean(identity.name,40):'';
   if(!builtins.has(id)&&!rooms.has(id)){
    const permissions=authenticated?permissionsForIdentity(identity)||{}:{};
    if(!(id.startsWith('group-')?permissions.canCreateGroups:permissions.canCreateChannels))return reject('creation-disabled',id,ack);
    if(rooms.size>=256)return reject('channel-limit',id,ack);
   }
   if(joined!==id)leave();joined=id;name=trustedName||displayName;person={id:authenticated?identity.id:'guest:'+socket.id,name,authenticated:Boolean(authenticated)};const room=roomFor(id);room.members.set(socket.id,name);room.people.set(socket.id,person);socket.join('social:'+id);
   socket.emit('social:history',{roomId:id,messages:room.messages.slice(-160),selfName:name,self:person,scope:'server-session'});
   io.to('social:'+id).emit('social:members',members(id));if(typeof ack==='function')ack({ok:true,roomId:id});
  });
  socket.on('social:leave',()=>{joinGeneration++;leave();});
  socket.on('social:message',(payload={},ack)=>{
   if(!object(payload))return reject('invalid-message',joined,ack);
   const id=clean(payload.roomId,80),room=rooms.get(id);if(!joined||id!==joined||!room?.members.has(socket.id))return reject('not-in-room',id,ack);
   const clientId=clean(payload.clientId,80),draftKey=id+':'+person.id+':'+clientId,confirmed=clientId&&(drafts.get(draftKey)||room.messages.find(message=>message.clientId===clientId&&(person.authenticated?message.authenticated===true&&message.authorId===person.id:message.authenticated===false&&message.author===name)));if(confirmed){if(typeof ack==='function')ack({ok:true,message:confirmed});return;}
   const text=clean(payload.text,1200);if(!text)return reject('empty-message',id,ack);
   if(!allowance('message',12,10000))return reject('rate-limit',id,ack);
   const message={id:randomUUID(),roomId:id,author:name,authorId:person.id,authenticated:person.authenticated,text,createdAt:now(),...(clientId?{clientId}:{})};
   room.messages.push(message);if(room.messages.length>200)room.messages.splice(0,room.messages.length-200);
   if(clientId){drafts.set(draftKey,message);if(drafts.size>200)drafts.delete(drafts.keys().next().value);}
   io.to('social:'+id).emit('social:message',message);if(typeof ack==='function')ack({ok:true,message});
  });
  socket.on('social:typing',(payload={})=>{if(object(payload)&&joined&&payload.roomId===joined&&allowance('typing',8,10000))socket.to('social:'+joined).emit('social:typing',{roomId:joined,...person});});
  socket.on('disconnect',()=>{joinGeneration++;leave();});
 }
 return Object.freeze({attach});
}
module.exports={createCommunityController};
