const test=require('node:test'),assert=require('node:assert/strict');
const {partyMarkup}=require('../ui/party');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const room={id:'movie-night',name:'Friday with friends',host:'Ava',mediaKind:'blank',viewers:1};
async function setup(options={}){
 const requestedRoomId=options.invite||'',path='/social?tab=watchrooms'+(requestedRoomId?'&roomId='+requestedRoomId:'');
 const env=browser(partyMarkup({initialTab:'rooms',openRoomCreation:true,requestedRoomId}),{path}),w=env.window,sent=[],calls=[],handlers=new Map();
 const socket={connected:options.connected!==false,active:true,attempts:0,connect(){this.attempts++;},on(name,fn){handlers.set(name,fn);return this;},emit(name,data){sent.push({name,data});return this;},receive(name,data){handlers.get(name)?.(data);}};
 w.io=()=>socket;w.HTMLMediaElement.prototype.pause=function(){};w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({name:'Ava'}));
 w.fetch=async(url,init={})=>{calls.push({url:String(url),init});let data;
  if(String(url).includes('/permissions'))data={permissions:{canCreateWatchRooms:options.allowed!==false,canCreateGroups:false,canCreateChannels:false}};
  else if(String(url).endsWith('/movies/featured'))data={movies:[{id:101,title:'Arrival',year:'2016',poster:'https://image.tmdb.org/t/p/w342/arrival.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/arrival.jpg'}]};
  else if(String(url).endsWith('/create'))data={room:{...room,name:JSON.parse(init.body).name}};
  else if(String(url).includes('/date-room/')){
   if(!String(url).endsWith('/'+room.id+'/state'))return {ok:false,json:async()=>({ok:false,error:'room_not_found'})};
   data={room};
  }
  else data={rooms:[]};
  return {ok:true,json:async()=>data};
 };
 w.eval(source('party/party.js'));w.eval(source('party/lobby.js'));await tick();await tick();return {...env,sent,calls,socket};
}
function tab(d,mode){return d.querySelector('[data-party-entry="'+mode+'"]');}
function panel(d,mode){return d.querySelector('[data-party-entry-panel="'+mode+'"]');}
function submit(w,form){form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}

test('Entry tabs expose one form, preserve drafts, and leave room creation to submission',async()=>{
 const env=await setup(),w=env.window,d=w.document,host=d.getElementById('sv100CreateRoomForm');
 assert(tab(d,'create'),'The host entry must be available');assert.equal(tab(d,'create').getAttribute('aria-selected'),'true');assert.equal(panel(d,'join').hidden,true);
 d.getElementById('partyRoomName').value='Saturday movie night';tab(d,'join').click();assert.equal(panel(d,'create').hidden,true);assert.equal(panel(d,'join').hidden,false);
 d.getElementById('partyInvite').value='movie-night';tab(d,'create').click();assert.equal(d.getElementById('partyRoomName').value,'Saturday movie night');assert.equal(d.getElementById('partyInvite').value,'movie-night');
 assert(!env.calls.some(call=>call.url.endsWith('/create')||call.url.includes('/date-room/')),'Switching entry methods must never create or join a room');
 submit(w,host);await tick();await tick();assert.equal(env.calls.filter(call=>call.url.endsWith('/create')).length,1);assert.equal(JSON.parse(env.calls.find(call=>call.url.endsWith('/create')).init.body).name,'Saturday movie night');
});

test('Entry tabs support arrow, Home and End keys with one keyboard stop',async()=>{
 const env=await setup(),w=env.window,d=w.document,host=tab(d,'create'),join=tab(d,'join');assert(host&&join,'Both entry tabs must be present');
 host.focus();host.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(d.activeElement,join);assert.equal(join.tabIndex,0);assert.equal(host.tabIndex,-1);assert.equal(panel(d,'join').hidden,false);
 join.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.equal(d.activeElement,host);assert.equal(panel(d,'create').hidden,false);
 host.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(d.activeElement,join);
 join.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(d.activeElement,host);
 const event=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});host.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
});

test('Choosing a film reveals hosting before the existing selection handler focuses its field',async()=>{
 const env=await setup(),d=env.window.document;assert(tab(d,'join'),'Join entry must be available');tab(d,'join').click();
 const film=d.querySelector('[data-party-featured-id="101"]');assert(film);film.click();
 assert.equal(panel(d,'create').hidden,false);assert.equal(panel(d,'join').hidden,true);assert.equal(d.activeElement,d.getElementById('partyRoomName'));assert.match(d.getElementById('partySelectedMovie').textContent,/Arrival/);assert(!env.calls.some(call=>call.url.endsWith('/create')));
});

test('Existing host and join shortcuts reveal their input before the core focus handler',async()=>{
 const env=await setup(),d=env.window.document,app=d.querySelector('.svPartyHub');assert(panel(d,'join'),'Join panel must be present');
 for(const [action,mode,input] of [['native-join-room','join','partyInvite'],['native-create-party','create','partyRoomName']]){const button=d.createElement('button');button.dataset.action=action;app.append(button);button.click();assert.equal(panel(d,mode).hidden,false);assert.equal(d.activeElement,d.getElementById(input));}
});

test('Presentation switching preserves permission-owned hidden states and keeps joining usable',async()=>{
 const env=await setup({allowed:false}),w=env.window,d=w.document,form=d.getElementById('sv100CreateRoomForm');assert(tab(d,'join'),'Join entry must be available');
 assert.equal(form.hidden,true);assert.equal(d.querySelector('.lockedOnly').hidden,false);tab(d,'join').click();d.getElementById('partyInvite').value='movie-night';submit(w,d.getElementById('partyJoinForm'));await tick();await tick();assert(env.sent.some(event=>event.name==='watchroom:join'&&event.data.roomId===room.id));
 tab(d,'create').click();assert.equal(form.hidden,true);assert.equal(d.querySelector('.lockedOnly').hidden,false);assert(!env.calls.some(call=>call.url.endsWith('/create')));
});

test('Both service forms remain reachable when the presentation helper is unavailable',()=>{
 const env=browser(partyMarkup({initialTab:'rooms'})),d=env.window.document;
 for(const id of ['sv100CreateRoomForm','partyJoinForm'])assert.equal(d.getElementById(id).closest('[hidden]'),null,id+' must not depend on JavaScript to be shown');
});

test('A missing room opened from an invite displays its error beside the reusable code',async()=>{
 const env=await setup({invite:'stale-room',connected:false}),d=env.window.document;
 assert.equal(panel(d,'join').hidden,false);
 assert.equal(d.querySelector('#partyInvite').value,'stale-room');
 assert.match(d.querySelector('[data-party-join-status]').textContent,/fresh invite/);
 assert.equal(d.querySelector('#partyJoinForm button').disabled,false);
 assert.equal(env.sent.some(event=>event.name==='watchroom:join'),false);
});

test('A party invite waits for the socket and allows recovery after a connection error',async()=>{
 const env=await setup({invite:room.id,connected:false}),w=env.window,d=w.document;
 const status=d.querySelector('[data-party-join-status]');
 assert.match(status.textContent,/Room found.*Connecting/);
 assert.equal(env.sent.some(event=>event.name==='watchroom:join'),false);
 env.socket.active=false;env.socket.receive('connect_error');
 assert.match(status.textContent,/connection is unavailable/);
 submit(w,d.getElementById('partyJoinForm'));await tick();await tick();assert.equal(env.socket.attempts,1);
 env.socket.connected=true;env.socket.receive('connect');
 const join=env.sent.find(event=>event.name==='watchroom:join');
 assert.equal(join.data.roomId,room.id);assert.equal(join.data.existingOnly,true);
 assert.equal(d.querySelector('#sv103RoomCode').disabled,true);
 env.socket.receive('watchroom:joined',{room,isHost:false});
 assert.match(d.querySelector('#sv103HostStatus').textContent,/Watching with the host/);
 assert.equal(d.querySelector('#sv103RoomCode').disabled,false);
});

test('A fallback join URL safely joins an existing room and exposes a rejection during admission',async()=>{
 const env=await setup(),w=env.window,d=w.document,form=d.getElementById('partyJoinForm'),input=d.querySelector('#partyInvite');
 input.value='/watchrooms/join?code=movie-night&code=another-room';submit(w,form);await tick();
 assert.equal(env.calls.some(call=>call.url.includes('/date-room/')),false);
 input.value='http://localhost:3000/watchrooms/join?code=Movie-Night';submit(w,form);await tick();await tick();
 assert.equal(env.sent.find(event=>event.name==='watchroom:join').data.roomId,room.id);
 env.socket.receive('watchroom:join-error',{roomId:'another-room',error:'room_not_found'});
 assert.equal(d.querySelector('#sv103NativeRoom').hidden,false);
 env.socket.receive('watchroom:join-error',{roomId:room.id,error:'room_not_found'});
 assert.equal(d.querySelector('#sv103NativeRoom').hidden,true);
 assert.equal(panel(d,'join').hidden,false);
 assert.equal(input.value,room.id);
 assert.match(d.querySelector('[data-party-join-status]').textContent,/fresh invite/);
});
