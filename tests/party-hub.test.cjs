const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(async()=>{await tick();await tick();cleanup();});const api=loadServer();
const room={id:'movie-night',name:'Friday with friends',host:'Ava',mediaKind:'blank',viewers:1};
function setup(options={}){
 let html;api.socialPage({query:{tab:'watchrooms'}},{send:value=>html=value});
 const parsed=browser(html),markup=parsed.window.document.querySelector('main.sv100').outerHTML;parsed.finish();
 const env=browser(markup,{path:'/social?tab=watchrooms'}),w=env.window,events=new Map(),sent=[],calls=[];
 const socket={id:'socket-ava',connected:options.connected!==false,on(name,fn){events.set(name,fn);return this;},emit(name,data){sent.push({name,data});return this;},receive(name,data){events.get(name)?.(data);}};
 w.io=()=>socket;w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({name:'Ava'}));
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.fetch=async(url,init={})=>{
  calls.push({url:String(url),init});let data;
  if(String(url).includes('/permissions'))data={permissions:{canCreateWatchRooms:options.allowed!==false,canCreateGroups:false,canCreateChannels:false,canManageSocial:false}};
  else if(String(url).endsWith('/create')){const body=JSON.parse(init.body);data={ok:true,room:{...room,name:body.name}};}
  else if(String(url).includes('/date-room/movie-night/state'))data={ok:true,room};
  else if(String(url).includes('/movies/search'))data={results:[{id:101,title:'Arrival',year:'2016',poster:''}]};
  else {if(options.listFails)throw new Error('Party service unavailable');data={rooms:[room]};}
  return {ok:true,json:async()=>data};
 };
 const code=source('party/party.js')||[...browser(html).window.document.querySelectorAll('script:not([src])')].find(s=>s.textContent.includes('window.SwiflySocial'))?.textContent;
 assert(code);w.eval(code);return {...env,socket,sent,calls,finish(){}};
}
function submit(w,form){const event=new w.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(event);return event;}
async function ready(env){await tick();await tick();return env;}
async function enter(env){await ready(env);env.window.SwiflySocial.openNativeWatchRoom(room);env.socket.receive('watchroom:joined',{room,isHost:true,messages:[]});await tick();}
test('Creating a party submits the room form and opens its room without a page reload',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document,form=d.getElementById('sv100CreateRoomForm');
 form.elements.namedItem('name').value='Saturday movie night';form.elements.namedItem('watchLink').value='https://youtu.be/abcdefghijk';const event=submit(w,form);await ready(env);
 assert(event.defaultPrevented);const request=env.calls.find(c=>c.url.endsWith('/create'));assert(request,'Create should use the existing room API');
 assert.equal(request.init.method,'POST');assert.equal(JSON.parse(request.init.body).name,'Saturday movie night');assert.equal(JSON.parse(request.init.body).creator,'Ava');
 assert(env.sent.some(e=>e.name==='watchroom:join'&&e.data.roomId===room.id));assert.equal(d.getElementById('sv103RoomTitle').textContent,'Saturday movie night');env.finish();
});
test('Joining accepts a full invite and uses the existing room metadata',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document,form=d.querySelector('form[action="/watchrooms/join"]');form.elements.namedItem('code').value='http://localhost:3000/social?tab=watchrooms&roomId=movie-night';const event=submit(w,form);await ready(env);
 assert(event.defaultPrevented);assert(env.calls.some(c=>c.url.endsWith('/date-room/movie-night/state')));assert(env.sent.some(e=>e.name==='watchroom:join'&&e.data.roomId==='movie-night'));assert.equal(d.getElementById('sv103RoomTitle').textContent,room.name);env.finish();
});
test('Watch-room chat stays beside the player and sends to the selected room',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 assert(d.querySelector('[data-party-chat-dock]')?.contains(d.getElementById('sv100ChatPanel')),'Chat must remain in the room view');
 d.getElementById('sv100Input').value='Ready for the movie';submit(w,d.getElementById('sv100Composer'));assert(env.sent.some(e=>e.name==='watchroom:message'&&e.data.roomId===room.id&&e.data.text==='Ready for the movie'));env.finish();
});
test('Guests cannot trigger host controls, including a dispatched click',async()=>{
 const env=setup();await enter(env);env.socket.receive('watchroom:joined',{room,isHost:false,messages:[]});const w=env.window,d=w.document,play=d.querySelector('[data-action="native-play"]');
 assert(play.disabled);const count=env.sent.length;play.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(env.sent.length,count);env.finish();
});
test('Leaving releases the room subscription and stops its media',async()=>{
 const env=setup();await enter(env);const d=env.window.document,video=d.createElement('video');video.id='sv103Video';let stopped=0;video.pause=()=>stopped++;d.getElementById('sv103Player').replaceChildren(video);
 d.querySelector('[data-action="leave-native-room"]').click();assert(env.sent.some(e=>e.name==='watchroom:leave'&&e.data.roomId===room.id));assert.equal(stopped,1);assert(d.getElementById('sv103NativeRoom').hidden);env.finish();
});
test('A late join event after Leave cannot reopen or refill the old room',async()=>{
 const env=setup();await enter(env);const d=env.window.document;d.querySelector('[data-action="leave-native-room"]').click();env.socket.receive('watchroom:joined',{room:{...room,videoId:'abcdefghijk'},isHost:true,messages:[{name:'Old room',text:'Late message'}]});
 assert(d.getElementById('sv103NativeRoom').hidden);assert(!d.getElementById('sv103Player').querySelector('iframe'));assert(!d.getElementById('sv100Messages').textContent.includes('Late message'));env.finish();
});
test('An offline client does not create a phantom party',async()=>{
 const env=await ready(setup({connected:false})),w=env.window,d=w.document,form=d.getElementById('sv100CreateRoomForm');form.elements.namedItem('name').value='My room';assert(submit(w,form).defaultPrevented);await ready(env);
 assert(!env.calls.some(c=>c.url.endsWith('/create')));assert(!env.sent.some(e=>e.name==='watchroom:join'));assert.equal(d.getElementById('sv103NativeRoom').hidden,true);assert.match(d.getElementById('sv100Status').textContent,/connect|offline/i);env.finish();
});
test('A room-list failure offers retry instead of pretending there are no parties',async()=>{
 const env=await ready(setup({listFails:true})),d=env.window.document;
 assert.match(d.getElementById('sv100RoomsList').textContent,/unavailable|could not|try again/i);assert(d.getElementById('sv100RoomsList').querySelector('[data-action="refresh-rooms"]'));env.finish();
});
test('Room creation permissions produce an honest disabled state',async()=>{
 const env=await ready(setup({allowed:false})),w=env.window,d=w.document,form=d.getElementById('sv100CreateRoomForm');assert(submit(w,form).defaultPrevented);await ready(env);
 assert(!env.calls.some(c=>c.url.endsWith('/create')));assert.match(d.getElementById('sv100PermText').textContent,/disabled|unavailable|join existing/i);env.finish();
});
test('The host can find a movie by title and select its actual catalog result',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document,form=d.getElementById('sv103MovieForm');form.elements.namedItem('movieId').value='Arrival';submit(w,form);await ready(env);
 assert(env.calls.some(c=>c.url.includes('/movies/search?q=Arrival')));const result=d.querySelector('[data-party-movie-id="101"]');assert(result,'Title search should offer the returned movie');result.click();
 assert(env.sent.some(e=>e.name==='watchroom:movie-select'&&e.data.roomId===room.id&&e.data.movieId==='101'));env.finish();
});
test('A movie search from the previous room cannot fill the new room after switching',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document,original=w.fetch;let release;
 w.fetch=(url,options)=>String(url).includes('/movies/search')?new Promise(resolve=>release=resolve):original(url,options);
 const form=d.getElementById('sv103MovieForm');form.elements.namedItem('movieId').value='Arrival';submit(w,form);assert(release);
 d.querySelector('[data-action="leave-native-room"]').click();const next={...room,id:'new-night',name:'Another night'};w.SwiflySocial.openNativeWatchRoom(next);env.socket.receive('watchroom:joined',{room:next,isHost:true,messages:[]});
 release({ok:true,json:async()=>({results:[{id:101,title:'Old result',year:'2016'}]})});await ready(env);assert(!d.getElementById('partyMovieResults').textContent.includes('Old result'));env.finish();
});
test('Only the current connected video can send playback controls after media or room replacement',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 const media=(id,path)=>env.socket.receive('watchroom:movie-sync',{roomId:id,movie:{status:'ready',playbackUrl:'https://media.example/'+path+'.mp4'}});
 media(room.id,'first');const first=d.getElementById('sv103Video');first.currentTime=55;
 media(room.id,'second');const second=d.getElementById('sv103Video');
 const sentBeforeMedia=env.sent.length;first.dispatchEvent(new w.Event('pause'));first.dispatchEvent(new w.Event('seeked'));assert.equal(env.sent.length,sentBeforeMedia,'Detached media must not control its replacement');
 const next={...room,id:'new-night',name:'Another night'};w.SwiflySocial.openNativeWatchRoom(next);env.socket.receive('watchroom:joined',{room:next,isHost:true,messages:[]});media(next.id,'third');
 const current=d.getElementById('sv103Video'),sentBeforeRoom=env.sent.length;second.currentTime=25;second.dispatchEvent(new w.Event('play'));second.dispatchEvent(new w.Event('seeked'));assert.equal(env.sent.length,sentBeforeRoom,'A previous room video must not control the new room');
 current.currentTime=12;current.dispatchEvent(new w.Event('seeked'));assert.deepEqual(JSON.parse(JSON.stringify(env.sent.at(-1))),{name:'watchroom:movie-control',data:{roomId:next.id,action:'set',clientTime:12,name:'Ava',time:12}});
 env.socket.connected=false;const sentBeforeOffline=env.sent.length;current.dispatchEvent(new w.Event('pause'));assert.equal(env.sent.length,sentBeforeOffline,'Disconnected media events must not queue controls');env.finish();
});
test('Video.js callbacks work after wrapping the current video and ignore the previous film',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document,players=[];
 w.videojs=video=>{const wrapper=d.createElement('div');wrapper.id=video.id;video.id+='_html5_api';video.replaceWith(wrapper);wrapper.append(video);const events=new Map(),player={video,disposed:0,on(name,fn){events.set(name,fn);},ready(fn){this.finishReady=fn;},dispose(){this.disposed++;this.video.parentElement.remove();},error(){return {message:'Source failed'};},receive(name){events.get(name)?.();}};players.push(player);return player;};
 const media=path=>env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{status:'ready',playbackUrl:'https://media.example/'+path+'.m3u8'}});
 media('first');const old=players[0];media('second');const current=players[1],video=d.getElementById('sv103Video'),html=d.getElementById('sv103Player').innerHTML;
 old.finishReady();old.receive('error');assert.equal(current.disposed,0,'Old callbacks must not dispose the active player');assert.equal(d.getElementById('sv103Video'),video);assert.equal(d.getElementById('sv103Player').innerHTML,html,'Old callbacks must not rewrite the new player');
 current.finishReady();assert.match(d.getElementById('sv106HlsStatus').textContent,/Ready to watch/,'Current wrapped Video.js callbacks must remain active');w.Hls={isSupported:()=>false};current.receive('error');assert.equal(current.disposed,1);assert.equal(d.getElementById('sv103Video').tagName,'VIDEO');assert.equal(d.getElementById('sv103Video').src,'https://media.example/second.m3u8');env.finish();
});
test('Delayed HLS callbacks cannot alter or recover the next film',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document,players=[];
 w.Hls=class {static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};static isSupported(){return true;}constructor(){this.events=new Map();this.starts=0;this.recoveries=0;players.push(this);}on(name,fn){this.events.set(name,fn);}loadSource(){}attachMedia(){}destroy(){}startLoad(){this.starts++;}recoverMediaError(){this.recoveries++;}receive(name,data){this.events.get(name)?.(name,data);}};
 const media=path=>env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{status:'ready',playbackUrl:'https://media.example/'+path+'.m3u8'}});
 media('first');const old=players[0];media('second');const current=players[1],video=d.getElementById('sv103Video'),html=d.getElementById('sv103Player').innerHTML;
 old.receive('manifest');old.receive('error',{fatal:true,type:'network'});old.receive('error',{fatal:true,type:'media'});assert.equal(current.starts,0);assert.equal(current.recoveries,0);assert.equal(d.getElementById('sv103Video'),video);assert.equal(d.getElementById('sv103Player').innerHTML,html);env.finish();
});
test('Device preview retains TV focus and Back closes it without navigating away',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document;let stopped=0,backCalls=0;
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})};w.history.pushState({},'','/social?tab=watchrooms#device-test');w.history.back=()=>backCalls++;
 w.localStorage.setItem('swiflytv.tvFocusMode','true');for(const button of d.querySelectorAll('button'))button.getBoundingClientRect=()=>({width:80,height:40,top:100,left:100,bottom:140,right:180});
 const shell=browser(api.pageShell({title:'Party Hub',body:''})),controller=[...shell.window.document.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('var FOCUSABLE_SELECTOR'));assert(controller);w.eval(controller.textContent);shell.finish();d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const mic=d.querySelector('[data-action="voice"]'),modal=d.getElementById('sv100CallModal');mic.focus();mic.click();await ready(env);
 modal.querySelector('[data-action="close-call"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(backCalls,0,'Escape must not invoke browser history from the device check');assert.equal(stopped,1);assert.equal(d.activeElement,mic);
 mic.click();await ready(env);const connected=new w.Event('gamepadconnected');connected.gamepad={id:'Party controller'};w.dispatchEvent(connected);assert.equal(modal.tagName,'DIALOG');assert(modal.open);assert(modal.contains(d.activeElement),'TV focus must stay inside the native modal');
 w.navigator.getGamepads=()=>[{id:'Party controller',axes:[0,0,0,0],buttons:Array.from({length:17},(_,index)=>({pressed:index===1,value:index===1?1:0}))}];w.flush(16);assert.equal(modal.open,false);assert.equal(backCalls,0);assert.equal(stopped,2);assert.equal(d.activeElement,mic);env.finish();
});
test('Dismissed device previews stop a media stream that arrives after closing',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document;let release,stopped=0;
 w.navigator.mediaDevices={getUserMedia:()=>new Promise(resolve=>release=resolve)};d.querySelector('[data-action="video"]').click();assert(release);d.querySelector('#sv100CallModal [data-action="close-call"]').click();release({getTracks:()=>[{stop(){stopped++;}}]});await ready(env);
 assert.equal(stopped,1);assert.equal(d.getElementById('sv100LocalVideo').srcObject,null);assert.equal(d.getElementById('sv100CallModal').open,false);env.finish();
});
