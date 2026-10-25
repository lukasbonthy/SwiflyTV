'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const {Server} = require('socket.io');
const WebSocket = require('ws');
const path = require('node:path');
const fs = require('node:fs');
const {createHash} = require('node:crypto');

async function fixture() {
  const {createStudy} = require('../lib/study');
  let now = 1000000;
  const app = express(), server = http.createServer(app), io = new Server(server);
  app.use(express.json());
  const study = createStudy({io, authorizeSocket: socket => socket.handshake.headers.cookie === 'study_test=ok', now: () => now});
  app.use('/api/study', study.router);
  app.use('/assets/study', express.static(path.resolve(__dirname, '../public/study')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, clients = [];
  async function connect(authorized = true) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`, {headers: authorized ? {Cookie: 'study_test=ok'} : {}});
      const queue = [], waiting = [], acks = new Map(); let requestId = 0;
      const client = {ws, queue, send(name, data) {ws.send('42/study,' + JSON.stringify([name, data]));}, request(name, data) {
        return new Promise((yes, no) => {const id = ++requestId, timer = setTimeout(() => no(Error('Missing acknowledgement: '+name)), 1500); acks.set(id, value => {clearTimeout(timer);yes(value);});ws.send('42/study,'+id+JSON.stringify([name,data]));});
      }, wait(name, predicate = () => true) {
        return new Promise((yes, no) => {const at = queue.findIndex(row => row.name === name && predicate(row.data));if(at >= 0)return yes(queue.splice(at,1)[0].data);const row={name,predicate,yes};row.timer=setTimeout(()=>{waiting.splice(waiting.indexOf(row),1);no(Error('Missing '+name));},1500);waiting.push(row);});
      }};
      clients.push(client); ws.on('error',reject);
      ws.on('message',raw=>{const value=raw.toString();if(value.startsWith('0'))return ws.send('40/study,{}');if(value==='2')return ws.send('3');if(value.startsWith('44/study,')){ws.close();return reject(Error(JSON.parse(value.slice(9)).message));}if(value.startsWith('40/study,')){client.id=JSON.parse(value.slice(9)).sid;return resolve(client);}if(value.startsWith('43/study,')){const m=/^43\/study,(\d+)(\[.*)$/s.exec(value);if(m){acks.get(+m[1])?.(JSON.parse(m[2])[0]);acks.delete(+m[1]);}return;}if(!value.startsWith('42/study,'))return;const[name,data]=JSON.parse(value.slice(9)),at=waiting.findIndex(row=>row.name===name&&row.predicate(data));if(at<0)queue.push({name,data});else{const row=waiting.splice(at,1)[0];clearTimeout(row.timer);row.yes(data);}});
    });
  }
  return {study,connect,advance(ms){now+=ms;},async json(route){return (await fetch(`http://127.0.0.1:${port}/api/study${route}`)).json();},port,async close(){clients.forEach(c=>c.ws.close());study.close();await new Promise(resolve=>io.close(resolve));}};
}
const join = (client,roomId='focus-1') => client.request('study:join',{roomId,name:'Ava',intention:'Read one chapter'});
const signal = (a,ac,b,bc) => a.request('study:signal',{roomId:ac.room.id,sessionId:ac.sessionId,to:b.id,targetSessionId:bc.sessionId,description:{type:'offer',sdp:'v=0\r\n'}});

test('Study namespace rejects missing authorization, including an omitted authorization callback', async () => {
  const f=await fixture();try{await assert.rejects(f.connect(false),/Access/);}finally{await f.close();}
  const {createStudy}=require('../lib/study');const io=new Server();assert.throws(()=>createStudy({io}),/authoriz/i);
});

test('Catalog exposes nineteen actual seekable audio files and seven local loops with posters', async () => {
  const f=await fixture();try{const catalog=await f.json('/catalog');assert.equal(catalog.tracks.length,19);assert.equal(catalog.scenes.length,7);assert.equal(catalog.rooms.length,9);assert.equal(catalog.tracks.find(t=>t.title==='Something In the Air').artist,'HoliznaCC0');for(const entry of [...catalog.tracks.map(t=>t.url),...catalog.scenes.flatMap(s=>[s.video,s.poster])]){assert.match(entry,/^\/assets\/study\/media\//);const p=path.join(__dirname,'../public/study',decodeURIComponent(entry.replace('/assets/study/','')));assert(fs.statSync(p).size>1000);}const response=await fetch(`http://127.0.0.1:${f.port}${catalog.tracks[0].url}`,{headers:{Range:'bytes=0-31'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);}finally{await f.close();}
});

test('Room presence is real and leave/switch/disconnect remove membership and stale signaling', async () => {
  const f=await fixture();try{const a=await f.connect(),b=await f.connect(),c=await f.connect();const ac=await join(a),bc=await join(b),cc=await join(c,'coding');assert.equal(ac.members.length,1);assert.equal(bc.members.length,2);assert.equal(bc.members[0].audio,false);assert.equal(bc.members[0].video,false);assert.equal((await signal(a,ac,c,cc)).ok,false);assert.equal((await signal(a,ac,b,bc)).ok,true);assert.equal((await b.wait('study:signal')).from,a.id);const switched=await join(b,'coding');assert.notEqual(switched.sessionId,bc.sessionId);assert.equal((await signal(a,ac,b,bc)).ok,false);assert.equal((await f.json('/rooms')).rooms.find(r=>r.id==='focus-1').online,1);await b.request('study:leave',{sessionId:switched.sessionId});assert.equal((await f.json('/rooms')).rooms.find(r=>r.id==='coding').online,1);a.queue.length=0;c.ws.close();await a.wait('study:presence',data=>data.rooms.find(r=>r.id==='coding').online===0);assert.equal((await f.json('/rooms')).rooms.find(r=>r.id==='coding').online,0);}finally{await f.close();}
});

test('Stale sessions, malformed media and oversized SDP cannot mutate a new room', async () => {
  const f=await fixture();try{const a=await f.connect(),b=await f.connect();const old=await join(a),bc=await join(b),current=await join(a);assert.equal((await a.request('study:leave',{sessionId:old.sessionId})).ok,false);assert.equal((await a.request('study:media',{sessionId:current.sessionId,audio:'true',video:false,screen:false})).ok,false);assert.equal((await a.request('study:signal',{roomId:current.room.id,sessionId:current.sessionId,to:b.id,targetSessionId:bc.sessionId,description:{type:'offer',sdp:'x'.repeat(65537)}})).ok,false);const roster=await a.request('study:media',{sessionId:current.sessionId,audio:true,video:false,screen:false});assert.equal(roster.ok,true);assert.equal(roster.members.find(row=>row.id===a.id).audio,true);assert.equal((await f.json('/rooms')).rooms[0].online,2);}finally{await f.close();}
});

test('The server-session focus board accepts completed elapsed timers once, including pause/resume', async () => {
  const f=await fixture();try{const a=await f.connect();await a.request('study:focus',{action:'start',duration:60,name:'Ava'});f.advance(20000);assert.equal((await a.request('study:focus',{action:'complete'})).ok,false);await a.request('study:focus',{action:'pause'});f.advance(200000);assert.equal((await f.json('/focus')).communityMinutes,0);await a.request('study:focus',{action:'start'});f.advance(40000);assert.equal((await a.request('study:focus',{action:'complete'})).ok,true);assert.equal((await a.request('study:focus',{action:'complete'})).ok,false);const board=await f.json('/focus');assert.equal(board.communityMinutes,1);assert.equal(board.board[0].name,'Ava');assert.equal(board.board[0].minutes,1);}finally{await f.close();}
});
test('A timer finishing just before its server deadline gets the remaining real delay', async () => {
  const f=await fixture();try{const a=await f.connect();await a.request('study:focus',{action:'start',duration:60});f.advance(59950);const early=await a.request('study:focus',{action:'complete'});assert.equal(early.ok,false);assert.equal(early.code,'not-complete');assert.equal(early.remainingMs,50);f.advance(50);assert.equal((await a.request('study:focus',{action:'complete'})).ok,true);}finally{await f.close();}
});
test('Every copied scene, poster and music file matches its recorded original Git blob',()=>{
  const attribution=require('../public/study/attribution.json');assert.equal(attribution.assets.length,33);assert.equal(attribution.sourceCommit,'46ecda8c69f2818978bfd9e94fc48e164e7b0bf4');assert.equal(attribution.music.license,'CC0 1.0');assert.equal(attribution.scenes.license,null);
  for(const asset of attribution.assets){const bytes=fs.readFileSync(path.join(__dirname,'../public/study',asset.path));assert.equal(bytes.length,asset.bytes,asset.path);assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),asset.gitBlobSha,asset.path);}
});
