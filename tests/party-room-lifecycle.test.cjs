const test=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {loadServer}=require('./ui-helpers.cjs');
function connect(port){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/socket.io/?EIO=4&transport=websocket'),queue=[],waiters=[];
 const client={ws,send(name,data){ws.send('42'+JSON.stringify([name,data]));},wait(name,predicate=()=>true){return new Promise((res,rej)=>{
  const index=queue.findIndex(e=>e.name===name&&predicate(e.data));if(index>=0)return res(queue.splice(index,1)[0].data);
  const waiter={name,predicate,res,rej};waiter.timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);rej(new Error('No '+name+' event matched'));},1500);waiters.push(waiter);
 });}};
 ws.on('error',reject);ws.on('message',raw=>{
  const value=raw.toString();if(value.startsWith('0')){ws.send('40');return;}if(value.startsWith('40')){resolve(client);return;}if(value==='2'){ws.send('3');return;}
  if(!value.startsWith('42'))return;const [name,data]=JSON.parse(value.slice(2));const i=waiters.findIndex(w=>w.name===name&&w.predicate(data));
  if(i>=0){const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.res(data);}else queue.push({name,data});
 });
});}
test('Leaving a live watch room updates actual presence and hands hosting to the remaining viewer',{timeout:6500},async t=>{
 const api=loadServer();await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));const port=api.httpServer.address().port,clients=[];
 t.after(async()=>{clients.forEach(c=>c.ws.close());await new Promise(resolve=>api.io.close(resolve));});
 const host=await connect(port),guest=await connect(port);clients.push(host,guest);
 host.send('watchroom:join',{roomId:'party-lifecycle-test',name:'Test night',user:'Ava'});assert.equal((await host.wait('watchroom:joined')).isHost,true);
 guest.send('watchroom:join',{roomId:'party-lifecycle-test',name:'Test night',user:'Ben'});assert.equal((await guest.wait('watchroom:joined')).isHost,false);await host.wait('watchroom:viewers',d=>d.viewers===2);
 host.send('watchroom:leave',{roomId:'party-lifecycle-test'});
 assert.equal((await guest.wait('watchroom:host')).isHost,true);assert.equal((await guest.wait('watchroom:viewers',d=>d.viewers===1)).roomId,'party-lifecycle-test');
 const members=await guest.wait('watchroom:members',d=>d.members.length===1);assert.equal(members.members[0].name,'Ben');assert.equal(members.members[0].isHost,true);
});
test('Moving to another room releases the old subscription before joining',{timeout:6500},async t=>{
 const api=loadServer();await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));const port=api.httpServer.address().port,clients=[];
 t.after(async()=>{clients.forEach(c=>c.ws.close());await new Promise(resolve=>api.io.close(resolve));});
 const first=await connect(port),second=await connect(port);clients.push(first,second);
 first.send('watchroom:join',{roomId:'party-old-test',name:'Old room',user:'Ava'});await first.wait('watchroom:joined');
 second.send('watchroom:join',{roomId:'party-old-test',name:'Old room',user:'Ben'});await second.wait('watchroom:joined');await first.wait('watchroom:viewers',d=>d.viewers===2);
 first.send('watchroom:join',{roomId:'party-new-test',name:'New room',user:'Ava'});assert.equal((await first.wait('watchroom:joined',d=>d.room.id==='party-new-test')).room.id,'party-new-test');
 assert.equal((await second.wait('watchroom:viewers',d=>d.roomId==='party-old-test'&&d.viewers===1)).viewers,1);
});
