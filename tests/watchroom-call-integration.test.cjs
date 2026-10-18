'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,tick,cleanup}=require('./ui-helpers.cjs');
const {partyMarkup}=require('../ui/party');
const api=loadServer();
test.afterEach(cleanup);

test('Room pages load the shared call runtime before their parent controllers',()=>{
  for(const options of [{active:'social'},{active:'watch',player:true}]){
    const env=browser(api.pageShell({...options,body:'<main>Watch together</main>'})),doc=env.window.document;
    const scripts=[...doc.querySelectorAll('script[src]')].map(node=>node.getAttribute('src'));
    const call=scripts.findIndex(src=>src.startsWith('/assets/party/watchroom-call.js?'));
    const parent=scripts.findIndex(src=>src.startsWith(options.player?'/assets/player/watch-party.js?':'/assets/party/party.js?'));
    assert(call>=0,'The optional call runtime is delivered on '+options.active);
    assert(call<parent,'The call runtime is ready before the room controller');
    assert(doc.querySelector('link[href^="/assets/party/watchroom-call.css?"]'),'Shared call controls have their stylesheet');
  }
  const normal=browser(api.pageShell({active:'movies',body:'<main>Browse movies</main>'}));
  assert.equal(normal.window.document.querySelector('script[src^="/assets/party/watchroom-call.js?"]'),null,'Ordinary browsing does not load call code');
});

function setupHub(){
  const env=browser(partyMarkup({initialTab:'rooms',openRoomCreation:true}),{path:'/social?tab=watchrooms'}),w=env.window;
  const listeners=new Map(),sent=[],captures=[];
  const socket={id:'socket-a',connected:true,on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return this;},off(name,fn){listeners.get(name)?.delete(fn);},emit(name,data){sent.push({name,data});return this;},disconnect(){this.connected=false;receive('disconnect');},connect(){this.connected=true;receive('connect');}};
  function receive(name,data){for(const fn of listeners.get(name)||[])fn(data);}
  w.io=()=>socket;w.RTCPeerConnection=class {};
  w.MediaStream=class {constructor(){this.tracks=[];}getTracks(){return this.tracks;}getAudioTracks(){return [];}getVideoTracks(){return [];}addTrack(track){this.tracks.push(track);}removeTrack(track){this.tracks=this.tracks.filter(value=>value!==track);}};
  Object.defineProperty(w,'isSecureContext',{value:true});
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async constraints=>{captures.push(constraints);throw Error('No device should be requested by joining.');}}});
  w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/permissions')?{ok:true,permissions:{canCreateWatchRooms:true}}:String(url).endsWith('/watchrooms')?{ok:true,rooms:[]}:String(url).includes('/featured')?{ok:true,movies:[],results:[]}:{ok:true}});
  w.boot('party/watchroom-call.js');w.boot('party/party.js');
  return {...env,w,socket,sent,captures,receive};
}

test('Party Hub enables optional calls only after room acknowledgement and clears them on leave',async()=>{
  const env=setupHub();await tick();const d=env.w.document,room={id:'friends-night',name:'Series night',mediaKind:'blank'};
  const panel=d.querySelector('[data-watchroom-call]');assert(panel,'The native room has a call panel');
  const join=panel.querySelector('[data-call-join]');assert(join.disabled,'No call can start from the lobby');
  env.w.SwiflySocial.openNativeWatchRoom(room);assert(join.disabled,'An unacknowledged room cannot start calls');
  env.receive('watchroom:joined',{room,isHost:true,messages:[]});join.click();
  assert.equal(env.sent.filter(event=>event.name==='watchroom:call-join').length,1);
  assert.equal(env.sent.find(event=>event.name==='watchroom:call-join').data.roomId,room.id);
  assert.equal(env.captures.length,0,'Joining the call never requests a device');
  env.receive('watchroom:call-joined',{roomId:room.id,selfId:'socket-a',sessionId:'session-one',requestId:env.sent.find(event=>event.name==='watchroom:call-join').data.requestId,iceServers:[],maxParticipants:8,members:[{id:'socket-a',name:'Ava',sessionId:'session-one',audio:false,video:false}]});
  d.querySelector('[data-action="leave-native-room"]').click();
  assert(join.disabled,'Leaving the room disables its call');
  assert.equal(env.sent.filter(event=>event.name==='watchroom:call-leave').length,1,'Leaving the room also leaves its call');
  env.receive('watchroom:call-members',{roomId:room.id,members:[{id:'stale-peer',name:'Old room',sessionId:'old-session',audio:true,video:true}]});
  assert(!panel.textContent.includes('Old room'),'Late room events cannot restore old participants');
});

test('Party Hub reconnect requires fresh room acknowledgement and never restarts a call',async()=>{
  const env=setupHub();await tick();const room={id:'reconnect-night',name:'Movie night',mediaKind:'blank'},d=env.w.document;
  env.w.SwiflySocial.openNativeWatchRoom(room);env.receive('watchroom:joined',{room,isHost:true,messages:[]});
  const panel=d.querySelector('[data-watchroom-call]');assert(panel,'The native room has a call panel');
  const join=panel.querySelector('[data-call-join]');assert(!join.disabled);
  env.socket.connected=false;env.receive('disconnect');assert(join.disabled);
  env.socket.connected=true;env.receive('connect');assert(join.disabled,'A socket connection alone is not a room acknowledgement');
  env.receive('watchroom:joined',{room,isHost:true,messages:[]});assert(!join.disabled);
  assert.equal(env.sent.filter(event=>event.name==='watchroom:call-join').length,0);
  assert.equal(env.captures.length,0);
});

test('Switching from a watchroom to Community ends its call before hiding its controls',async()=>{
  const env=setupHub();await tick();const room={id:'community-night',name:'Friends',mediaKind:'blank'};
  env.w.SwiflySocial.openNativeWatchRoom(room);env.receive('watchroom:joined',{room,isHost:true,messages:[]});
  const panel=env.w.document.querySelector('[data-watchroom-call]');panel.querySelector('[data-call-join]').click();
  const requestId=env.sent.find(event=>event.name==='watchroom:call-join').data.requestId;
  env.receive('watchroom:call-joined',{roomId:room.id,selfId:'socket-a',sessionId:'community-session',requestId,iceServers:[],maxParticipants:8,members:[{id:'socket-a',name:'Ava',sessionId:'community-session',audio:false,video:false}]});
  env.w.SwiflySocial.switchTab('chat');
  assert(env.sent.some(event=>event.name==='watchroom:call-leave'&&event.data.sessionId==='community-session'),'A hidden room must not retain its active call');
  env.w.SwiflySocial.switchTab('rooms');
  assert.equal(panel.querySelector('[data-call-controls]').hidden,true,'Returning keeps devices off');
  assert.equal(env.sent.filter(event=>event.name==='watchroom:call-join').length,1,'Returning never automatically rejoins the call');
});
