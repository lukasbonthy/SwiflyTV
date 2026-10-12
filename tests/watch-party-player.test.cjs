const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, tick, cleanup} = require('./ui-helpers.cjs');
const {playerMarkup} = require('../ui/player');
const {watchPartyMarkup, partyBrowseMarkup} = require('../ui/watch-party');
test.afterEach(cleanup);
function setup(path='/watch/movie/101?mode=movie', room={id:'room-one',name:'Friday film',syncedMovie:{status:'idle',movieId:'101'}}) {
 const env=browser(playerMarkup({id:'101',title:'Arrival',type:'movie',mode:'movie',partyPanelHtml:watchPartyMarkup({movieId:'101',title:'Arrival'})}),{path});
 const w=env.window, handlers={}, sent=[], calls=[];
 const socket={connected:true,on(name,fn){handlers[name]=fn;return this;},off(name){delete handlers[name];},emit(name,data){sent.push({name,data});},disconnect(){this.connected=false;},connect(){this.connected=true;}};
 w.io=()=>socket;
 w.SwiflyPlayer={setRemoteMode:value=>calls.push(['remote',value]),loadSource:value=>calls.push(['source',value]),resolve:()=>calls.push(['resolve']),pause:value=>calls.push(['pause',value]),play:value=>calls.push(['play',value]),seek:(time,value)=>calls.push(['seek',time,value]),getState:()=>({currentTime:0,paused:true,ready:true})};
 w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/create')?{ok:true,room}:{ok:true,room}});
 const receive=(name,data)=>handlers[name]?.(data);
 env.window.boot('player/watch-party.js');
 return {...env,w,handlers,sent,calls,room,receive};
}
async function join(env){env.w.document.querySelector('[data-player-party-open]').click();const form=env.w.document.querySelector('[data-party-join-form]');form.querySelector('input').value=env.room.id;form.dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));await tick();}
function ack(env,isHost=false){env.receive('watchroom:joined',{room:env.room,isHost,messages:[]});}
test('Party setup shares the normal player and escapes title and room data',()=>{
 const html=watchPartyMarkup({movieId:'101',title:'A <film> & "friends"'}), env=browser(html);
 assert.equal(env.window.document.querySelector('[data-party-selected-title]').textContent,'A <film> & "friends"');
 assert.equal(env.window.document.querySelector('film'),null);
 assert(env.window.document.querySelector('dialog.svWatchPartyDialog'));
 assert(!html.includes('Party Hub'));
});
test('Party browsing uses compact catalog tools without a second movie gallery',()=>{
 const env=browser(partyBrowseMarkup()),d=env.window.document;
 assert(d.querySelector('[data-party-browse]'));
 assert(d.querySelector('[data-party-join-form]'));
 assert(d.querySelector('[data-party-directory]'));
 assert.equal(d.querySelector('h1'),null);
 assert.equal(d.querySelector('video'),null);
});
test('The details create deep link opens setup and does not create a room',()=>{
 const env=setup('/watch/movie/101?mode=movie&party=create');
 assert.equal(env.w.document.querySelector('dialog').open,true);
 assert.equal(env.sent.length,0);
 assert.equal(env.calls.length,0);
});
test('Creating a party requires form submission then matching host acknowledgement before selecting',async()=>{
 const env=setup();env.w.document.querySelector('[data-player-party-open]').click();
 env.w.document.querySelector('[data-party-create-form]').dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(env.sent.filter(x=>x.name==='watchroom:movie-select').length,0);
 assert.equal(env.sent.filter(x=>x.name==='watchroom:join').length,1);
 env.receive('watchroom:joined',{room:{...env.room,id:'wrong-room'},isHost:true,messages:[]});
 assert.equal(env.sent.filter(x=>x.name==='watchroom:movie-select').length,0);
 ack(env,true);
 assert.equal(env.sent.filter(x=>x.name==='watchroom:movie-select').length,1);
 assert.equal(env.sent.at(-1).data.movieId,'101');
 assert.equal(env.w.document.querySelector('.svPlayerPage').dataset.partyActive,'true');
 assert(env.w.location.search.includes('roomId=room-one'));
});
test('Joining pauses solo playback and moves player into remote mode',async()=>{
 const env=setup();await join(env);
 assert(env.calls.some(x=>x[0]==='pause'&&x[1].remote));
 assert(env.calls.some(x=>x[0]==='remote'&&x[1].enabled));
 ack(env,false);
 assert(env.calls.some(x=>x[0]==='remote'&&x[1].enabled&&!x[1].isHost));
});
test('A join input rejects external invite URLs before contacting services',async()=>{
 const env=setup();let requested=0;env.w.fetch=async()=>{requested++;throw Error('bad');};
 env.w.document.querySelector('[data-player-party-open]').click();
 const form=env.w.document.querySelector('[data-party-join-form]');form.querySelector('input').value='https://another.example/watch/movie/101?roomId=room-one';form.dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(requested,0);assert(env.w.document.querySelector('[data-party-setup-status]').textContent.includes('invite'));
});
test('A join input preserves valid same-origin player invites',async()=>{
 const env=setup();const form=env.w.document.querySelector('[data-party-join-form]');form.querySelector('input').value='http://localhost:3000/watch/movie/101?roomId=room-one';form.dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(env.sent[0].data.roomId,'room-one');
});
test('Guest playback actions cannot emit host controls or source retry',async()=>{
 const env=setup();await join(env);ack(env,false);
 const app=env.w.document.querySelector('.svPlayerPage');
 app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'play',time:32}}));
 app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:retry',{bubbles:true,detail:{mediaId:'101'}}));
 assert.equal(env.sent.filter(x=>['watchroom:movie-control','watchroom:movie-select'].includes(x.name)).length,0);
});
test('Host actions and Retry use the active room and current movie',async()=>{
 const env=setup();await join(env);ack(env,true);const app=env.w.document.querySelector('.svPlayerPage');
 app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'set',time:32}}));
 app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:retry',{bubbles:true,detail:{mediaId:'101'}}));
 assert.deepEqual(JSON.parse(JSON.stringify(env.sent.find(x=>x.name==='watchroom:movie-control').data)),{roomId:'room-one',action:'set',time:32,clientTime:32,intent:'user'});
 assert.equal(env.sent.find(x=>x.name==='watchroom:movie-select').data.retry,true);
});
test('Room source states replace media honestly and foreign room events are ignored',async()=>{
 const env=setup();await join(env);ack(env,false);env.calls.length=0;
 env.receive('watchroom:movie-sync',{roomId:'wrong-room',movie:{status:'ready',movieId:'101',playbackUrl:'/fake.mp4'}});
 assert.equal(env.calls.length,0);
 env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:{status:'loading',movieId:'101'}});
 assert.equal(env.calls.at(-1)[1].status,'loading');
 env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:{status:'error',movieId:'101',message:'Could not start'}});
 assert.equal(env.calls.at(-1)[1].status,'error');
 env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:{status:'ready',movieId:'101',playbackUrl:'/movie.mp4',sync:{playing:false,offset:20}}});
 assert(env.calls.some(x=>x[0]==='source'&&x[1].status==='ok'&&x[1].playbackUrl==='/movie.mp4'));
});
test('Remote synchronization seeks and pauses with remote flags',async()=>{
 const env=setup();await join(env);ack(env,false);env.calls.length=0;
 env.w.SwiflyPlayer.getState=()=>({currentTime:0,paused:false,ready:true});
 env.receive('watchroom:movie-sync-state',{roomId:env.room.id,movieId:'101',sync:{playing:false,offset:45,startedAt:0}});
 assert(env.calls.some(x=>x[0]==='seek'&&x[1]===45&&x[2].remote));
 assert(env.calls.some(x=>x[0]==='pause'&&x[1].remote));
 assert.equal(env.sent.filter(x=>x.name==='watchroom:movie-control').length,0);
});
test('Shared start times use the server clock when this device clock differs',async()=>{
 const env=setup();await join(env);ack(env,false);env.calls.length=0;const deviceNow=env.w.Date.now();
 env.receive('watchroom:movie-sync-state',{roomId:env.room.id,movieId:'101',serverTime:deviceNow+3600000,sync:{playing:true,offset:40,startedAt:deviceNow+3595000}});
 assert(env.calls.some(x=>x[0]==='seek'&&x[1]>=45&&x[1]<46&&x[2].remote));assert(env.calls.some(x=>x[0]==='play'&&x[1].remote));
});
test('Source events cannot reload an identical ready source on duplicate acknowledgements',async()=>{
 const env=setup();env.room.syncedMovie={status:'ready',movieId:'101',playbackUrl:'/film.mp4',requestId:'source-one'};await join(env);ack(env,false);
 env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:env.room.syncedMovie});
 assert.equal(env.calls.filter(x=>x[0]==='source'&&x[1].status==='ok').length,1);
});
test('A ready snapshot can restore playback after a local guest media error',async()=>{
 const env=setup();env.room.syncedMovie={status:'ready',movieId:'101',playbackUrl:'/film.mp4',requestId:'source-one'};await join(env);ack(env,false);
 env.w.SwiflyPlayer.getState=()=>({currentTime:0,paused:true,ready:false,status:'error'});
 env.receive('disconnect');env.receive('connect');ack(env,false);
 assert.equal(env.calls.filter(x=>x[0]==='source'&&x[1].status==='ok').length,2);
});
test('Leaving and joining another party clears previous chat, members, and unfinished text',async()=>{
 const env=setup();await join(env);ack(env,false);
 env.receive('watchroom:message',{roomId:env.room.id,name:'Ava',text:'First room conversation',createdAt:1});
 env.receive('watchroom:members',{roomId:env.room.id,members:[{name:'Ava',isHost:true}]});
 env.w.document.querySelector('[data-party-chat-form] input').value='Unsent first room text';
 env.w.document.querySelector('[data-party-leave]').click();env.room.id='room-two';await join(env);ack(env,false);
 env.receive('watchroom:message',{roomId:env.room.id,name:'Ben',text:'Second room conversation',createdAt:2});
 const d=env.w.document;assert(!d.querySelector('[data-party-messages]').textContent.includes('First room conversation'));assert(!d.querySelector('[data-party-members]').textContent.includes('Ava'));assert.equal(d.querySelector('[data-party-chat-form] input').value,'');assert(d.querySelector('[data-party-messages]').textContent.includes('Second room conversation'));
});
test('Chat text uses DOM text content and messages from other rooms are ignored',async()=>{
 const env=setup();await join(env);ack(env,false);
 env.receive('watchroom:message',{roomId:'other',name:'X',text:'Foreign message',createdAt:1});
 env.receive('watchroom:message',{roomId:env.room.id,name:'<script>',text:'<img src=x onerror=alert(1)>',createdAt:2});
 const log=env.w.document.querySelector('[data-party-messages]');assert(!log.textContent.includes('Foreign message'));assert(log.textContent.includes('<img'));assert.equal(log.querySelector('img'),null);
});
test('Presence and host transfer keep guest transport mode correct',async()=>{
 const env=setup();await join(env);ack(env,false);
 env.receive('watchroom:members',{roomId:env.room.id,members:[{name:'Lukas',isHost:true},{name:'Guest'}]});
 assert(env.w.document.querySelector('[data-party-members]').textContent.includes('Lukas'));
 env.receive('watchroom:host',{roomId:env.room.id,isHost:true});
 assert(env.calls.some(x=>x[0]==='remote'&&x[1].isHost));
});
test('Leaving removes room history, disables remote mode, and restores solo resolution',async()=>{
 const env=setup();await join(env);ack(env,true);env.w.document.querySelector('[data-party-leave]').click();
 assert.equal(env.sent.filter(x=>x.name==='watchroom:leave').length,1);
 assert(env.calls.some(x=>x[0]==='remote'&&!x[1].enabled));assert(env.calls.some(x=>x[0]==='resolve'));
 assert.equal(env.w.location.search.includes('roomId'),false);assert.equal(env.w.document.querySelector('.svPlayerPage').dataset.partyActive,'false');
 env.calls.length=0;env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:{status:'ready',movieId:'101',playbackUrl:'/old.mp4'}});assert.equal(env.calls.length,0);
});
test('Disconnect disables host commands and reconnect rejoins only the active room',async()=>{
 const env=setup();await join(env);ack(env,true);env.receive('disconnect');const app=env.w.document.querySelector('.svPlayerPage');
 app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'play',time:2}}));
 assert.equal(env.sent.filter(x=>x.name==='watchroom:movie-control').length,0);
 env.receive('connect');assert.equal(env.sent.filter(x=>x.name==='watchroom:join').length,2);
});
test('Closing during a pending create invalidates its completion',async()=>{
 const env=setup();let complete;env.w.fetch=()=>new Promise(resolve=>{complete=resolve;});env.w.document.querySelector('[data-player-party-open]').click();
 env.w.document.querySelector('[data-party-create-form]').dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));
 env.w.document.querySelector('[data-party-dialog-close]').click();complete({ok:true,json:async()=>({ok:true,room:env.room})});await tick();assert.equal(env.sent.length,0);
});
test('Page exit tears down active room subscription and ignores late events',async()=>{
 const env=setup();await join(env);ack(env,true);env.w.dispatchEvent(new env.w.PageTransitionEvent('pagehide'));env.calls.length=0;
 env.receive('watchroom:movie-sync',{roomId:env.room.id,movie:{status:'ready',movieId:'101',playbackUrl:'/late.mp4'}});assert.equal(env.calls.length,0);assert.equal(env.sent.filter(x=>x.name==='watchroom:leave').length,1);
});
