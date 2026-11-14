'use strict';
const {createCommunityController}=require('../lib/community');

// Exercise the real controller without opening a listening socket. The paired
// transport preserves Socket.IO room broadcasts, acknowledgements and leaves.
function communityService(options={}){
 const sockets=new Set();let sequence=0;
 const broadcast=(room,event,data,except)=>{for(const socket of sockets)if(socket!==except&&socket.subscriptions.has(room))socket.emit(event,data);};
 const io={to:room=>({emit:(event,data)=>broadcast(room,event,data)})};
 const rooms=new Map(),controller=createCommunityController({io,rooms,...options});
 function connect(identity=null,onEvent=()=>{}){
  const handlers=new Map(),events=[],socket={id:'community-test-'+(++sequence),connected:true,data:{communityIdentity:identity},subscriptions:new Set(),
   on(event,handler){handlers.set(event,handler);return this;},
   emit(event,data){events.push({event,data});onEvent(event,data);return this;},
   join(room){this.subscriptions.add(room);},leave(room){this.subscriptions.delete(room);},
   to:room=>({emit:(event,data)=>broadcast(room,event,data,socket)})};
  sockets.add(socket);controller.attach(socket);
  return {socket,events,async send(event,data){let response;await handlers.get(event)?.(data,value=>{response=value;});return response;},last(event){return events.findLast(row=>row.event===event)?.data;}};
 }
 return {rooms,connect};
}
module.exports={communityService};
