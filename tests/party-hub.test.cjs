const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(async()=>{await tick();await tick();cleanup();});const api=loadServer();
const room={id:'movie-night',name:'Friday with friends',host:'Ava',mediaKind:'blank',viewers:1,syncedMovie:{status:'idle',movieId:'',proxyVideo:'',sync:{playing:false,offset:0,startedAt:0}}};
function setup(options={}){
 let html;api.socialPage({query:{tab:'watchrooms'}},{send:value=>html=value});
 const parsed=browser(html),markup=parsed.window.document.querySelector('main.svPartyHub').outerHTML;parsed.finish();
 const env=browser(markup,{path:'/social?tab=watchrooms'+(options.movieId?'&movieId='+options.movieId:''),referrer:options.referrer}),w=env.window,events=new Map(),sent=[],calls=[];
 if(options.movieId)w.document.querySelector('.svPartyHub').dataset.selectedMovieId=options.movieId;
 if(options.partyReturn)w.sessionStorage.setItem('swiflytv.partyReturn',options.partyReturn);
 const socket={id:'socket-ava',connected:options.connected!==false,on(name,fn){events.set(name,fn);return this;},emit(name,data){sent.push({name,data});return this;},receive(name,data){events.get(name)?.(data);}};
 w.io=()=>socket;w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({name:'Ava'}));
 const mediaStates=new WeakMap(),mediaState=video=>{if(!mediaStates.has(video))mediaStates.set(video,{paused:true,currentTime:0,duration:120,readyState:0,volume:1,muted:false,playbackRate:1,seekable:{length:1,start:()=>0,end:()=>120},buffered:{length:0},textTracks:[]});return mediaStates.get(video);};
 for(const name of ['paused','currentTime','duration','readyState','volume','muted','playbackRate','seekable','buffered','textTracks'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return mediaState(this)[name];},set(value){mediaState(this)[name]=value;}});
 w.HTMLMediaElement.prototype.pause=function(){const changed=!this.paused;this.paused=true;if(changed)this.dispatchEvent(new w.Event('pause'));};w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLMediaElement.prototype.play=function(){this.paused=false;this.dispatchEvent(new w.Event('play'));this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};w.HTMLMediaElement.prototype.canPlayType=()=>'';
 assert(w.document.getElementById('partyPlayerTemplate'),'Production Party Hub must provide the shared player template');
 w.eval(source('player/player.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

 w.fetch=async(url,init={})=>{
  calls.push({url:String(url),init});let data;
  if(String(url).includes('/permissions'))data={permissions:{canCreateWatchRooms:options.allowed!==false,canCreateGroups:false,canCreateChannels:false,canManageSocial:false}};
  else if(String(url).endsWith('/create')){const body=JSON.parse(init.body);data={ok:true,room:{...room,name:body.name}};}
  else if(String(url).includes('/date-room/movie-night/state'))data={ok:true,room};
  else if(String(url).includes('/movies/search'))data={results:[{id:101,title:'Arrival',year:'2016',poster:''}]};
  else if(String(url).endsWith('/movies/featured'))data={ok:true,movies:[{id:202,title:'Interstellar',year:'2014',poster:'https://image.tmdb.org/t/p/w342/interstellar.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/interstellar.jpg',overview:'A journey beyond Earth.'}]};
  else if(String(url).endsWith('/movies/101')){if(options.movieFails)return {ok:false,json:async()=>({ok:false,message:'This movie is unavailable. Try again.'})};data={ok:true,movie:{id:101,title:'Arrival',year:'2016',poster:'https://image.tmdb.org/t/p/w342/arrival.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/arrival.jpg',overview:'A linguist makes first contact.'}};}
  else {if(options.listFails)throw new Error('Party service unavailable');data={rooms:[room]};}
  return {ok:true,json:async()=>data};
 };
 const code=source('party/party.js')||[...browser(html).window.document.querySelectorAll('script:not([src])')].find(s=>s.textContent.includes('window.SwiflySocial'))?.textContent;
 assert(code);w.eval(code);return {...env,socket,sent,calls,mediaState,readyVideo(){const video=w.document.getElementById('sv103Video');video.readyState=3;video.dispatchEvent(new w.Event('loadedmetadata'));video.dispatchEvent(new w.Event('canplay'));return video;},finish(){}};
}
function submit(w,form){const event=new w.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(event);return event;}
async function ready(env){await tick();await tick();return env;}
async function enter(env){await ready(env);env.window.SwiflySocial.openNativeWatchRoom(room);env.socket.receive('watchroom:joined',{room,isHost:true,messages:[]});await tick();}
test('Party artwork belongs to the page atmosphere and retains the selected-film hook',async()=>{
 const env=await ready(setup({movieId:'101'})),d=env.window.document,app=d.querySelector('.svPartyHub'),atmosphere=app.querySelector(':scope > .partyPageAtmosphere');
 assert(atmosphere,'The shared artwork must back the page identity and lobby');assert.equal(atmosphere.getAttribute('aria-hidden'),'true');
 assert(atmosphere.compareDocumentPosition(d.querySelector('.partyPageHeader'))&env.window.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(d.querySelectorAll('[data-party-hero-art]').length,1);assert(atmosphere.contains(d.querySelector('[data-party-hero-art]')));assert(!d.querySelector('.partyLobbyStart [data-party-hero-art]'));
 assert.match(d.querySelector('[data-party-hero-art]').style.backgroundImage,/arrival\.jpg/);env.finish();
});
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

test('Visible community channels announce the active conversation and send only to that channel',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document;d.querySelector('[data-tab="chat"]').click();
 const nav=d.querySelector('[data-nav-panel="chat"]');assert(nav&&!nav.closest('details'),'Channel choices must be visible without opening a menu');
 const recommendations=d.querySelector('[data-room="channel-recommendations"]');recommendations.click();
 assert.equal(recommendations.getAttribute('aria-current'),'true');assert.equal(d.querySelector('[data-room="channel-general"]').getAttribute('aria-current'),'false');
 assert.equal(d.querySelector('[data-party-channel-title]').textContent,'Recommendations');assert.match(d.querySelector('[data-party-chat-description]').textContent,/recommend|watch/i);
 assert.match(d.querySelector('.partyChatEmpty').textContent,/recommend|worth watching/i);assert.equal(d.getElementById('sv100Input').placeholder,'Message Recommendations…');
 d.getElementById('sv100Input').value='Try Arrival';submit(w,d.getElementById('sv100Composer'));
 assert(env.sent.some(event=>event.name==='social:message'&&event.data.roomId==='channel-recommendations'&&event.data.text==='Try Arrival'));
 env.finish();
});

test('A featured film is clearly identified as inspiration until explicitly selected for hosting',async()=>{
 const env=await ready(setup()),d=env.window.document;
 assert.equal(d.getElementById('partyHeroTitle').textContent,'Interstellar');assert.match(d.querySelector('[data-party-hero-label]').textContent,/inspiration/i);
 assert.equal(d.getElementById('partySelectedMovie').hidden,true);assert(!env.calls.some(call=>call.url.endsWith('/create')));
 d.querySelector('[data-party-featured-host]').click();assert.match(d.querySelector('[data-party-hero-label]').textContent,/selected/i);assert.match(d.getElementById('partySelectedMovie').textContent,/Interstellar/);
 d.querySelector('[data-action="clear-party-movie"]').click();assert.equal(d.getElementById('partySelectedMovie').hidden,true);assert.match(d.querySelector('[data-party-hero-label]').textContent,/inspiration/i);env.finish();
});
test('Guests cannot trigger host controls, including a dispatched click',async()=>{
 const env=setup();await enter(env);env.socket.receive('watchroom:joined',{room,isHost:false,messages:[]});env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'/movie.mp4'}});env.readyVideo();const w=env.window,d=w.document,play=d.querySelector('[data-player-play]');
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
test('Only explicit shared player actions can control the current connected room',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 const media=(id,path)=>env.socket.receive('watchroom:movie-sync',{roomId:id,movie:{movieId:'101',status:'ready',playbackUrl:'https://media.example/'+path+'.mp4'}});
 media(room.id,'first');const first=env.readyVideo(),oldRoot=d.querySelector('.svPlayerEmbedded');first.currentTime=55;
 media(room.id,'second');const second=env.readyVideo();
 const before=env.sent.length;first.dispatchEvent(new w.Event('pause'));first.dispatchEvent(new w.Event('seeked'));second.dispatchEvent(new w.Event('play'));assert.equal(env.sent.length,before,'Native and detached events cannot broadcast transport');
 const next={...room,id:'new-night',name:'Another night'};w.SwiflySocial.openNativeWatchRoom(next);env.socket.receive('watchroom:joined',{room:next,isHost:true,messages:[]});media(next.id,'third');const current=env.readyVideo();
 const sentBeforeRoom=env.sent.length;oldRoot.dispatchEvent(new w.CustomEvent('swiflyplayer:action',{detail:{action:'set',time:25}}));assert.equal(env.sent.length,sentBeforeRoom,'A previous room controller must not control the new room');
 current.currentTime=12;d.querySelector('[data-player-forward]').click();const command=env.sent.at(-1);assert.equal(command.name,'watchroom:movie-control');assert.equal(command.data.roomId,next.id);assert.equal(command.data.action,'set');assert.equal(command.data.time,22);assert.equal(command.data.clientTime,22);
 env.socket.connected=false;env.socket.receive('disconnect');const offline=env.sent.length;d.querySelector('[data-player-play]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(env.sent.length,offline,'Disconnected controllers must not queue playback commands');env.finish();
});
test('Party movies mount the shared controller once and never initialize Video.js',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;let legacyCalls=0;w.videojs=()=>legacyCalls++;
 const movie={movieId:'101',status:'ready',playbackUrl:'https://media.example/movie.mp4',sync:{playing:false,offset:20}};
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie});const root=d.querySelector('.svPlayerEmbedded');assert(root,'Direct party playback must use production shared stage markup');const controller=w.SwiflyPlayer.mount(root),video=env.readyVideo();
 assert.equal(controller.getState().source,movie.playbackUrl);assert.equal(video.currentTime,20);assert.equal(d.querySelectorAll('#sv103Player video').length,1);assert.equal(d.querySelectorAll('#sv103Player [data-player-controls]').length,1);assert.equal(d.querySelector('.sv103ControlDock').hidden,true);assert.equal(legacyCalls,0);
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie});assert.equal(d.querySelector('.svPlayerEmbedded'),root);assert.equal(d.getElementById('sv103Video'),video,'Repeated source snapshots must preserve playback');
 env.socket.receive('watchroom:trailer',{roomId:room.id,videoId:'abcdefghijk',mediaKind:'youtube'});assert.equal(controller.getState().ready,false);assert(d.querySelector('#sv103Player iframe[src*="youtube.com"]'));assert.equal(d.querySelector('.sv103ControlDock').hidden,false);env.finish();
});
test('Delayed HLS callbacks cannot alter or recover the next shared party film',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document,players=[];
 w.Hls=class {static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};static isSupported(){return true;}constructor(){this.events=new Map();this.starts=0;this.recoveries=0;players.push(this);}on(name,fn){this.events.set(name,fn);}loadSource(){}attachMedia(){}destroy(){this.destroyed=true;}startLoad(){this.starts++;}recoverMediaError(){this.recoveries++;}receive(name,data){this.events.get(name)?.(name,data);}};
 const media=path=>env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'https://media.example/'+path+'.m3u8'}});
 media('first');await tick();const old=players[0];media('second');await tick();const current=players[1],video=d.getElementById('sv103Video'),html=d.getElementById('sv103Player').innerHTML;
 assert.equal(old.destroyed,true);old.receive('manifest');old.receive('error',{fatal:true,type:'network'});old.receive('error',{fatal:true,type:'media'});assert.equal(current.starts,0);assert.equal(current.recoveries,0);assert.equal(d.getElementById('sv103Video'),video);assert.equal(d.getElementById('sv103Player').innerHTML,html);
 current.receive('error',{fatal:true,type:'network'});assert.equal(current.starts,1);current.receive('error',{fatal:true,type:'network'});assert.equal(d.querySelector('.svPlayerEmbedded').dataset.playerState,'error');assert.equal(current.destroyed,true);env.finish();
});
test('Guests retain local volume and a gesture join while shared play and seeking remain host only',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;env.socket.receive('watchroom:host',{roomId:room.id,isHost:false});
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'/guest.mp4',sync:{playing:false,offset:5}}});const video=env.readyVideo(),root=d.querySelector('.svPlayerEmbedded'),controller=w.SwiflyPlayer.mount(root);
 assert(d.querySelector('[data-player-play]').disabled);assert(d.querySelector('[data-player-seek]').disabled);const before=env.sent.length;
 const volume=d.querySelector('[data-player-volume]');volume.value='0.3';volume.dispatchEvent(new w.Event('input'));assert.equal(video.volume,0.3);assert.equal(env.sent.length,before);
 video.play=()=>Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));env.socket.receive('watchroom:movie-sync-state',{roomId:room.id,sync:{playing:true,offset:8,startedAt:Date.now()}});await tick();assert.equal(d.querySelector('[data-player-unlock]').hidden,false);
 video.play=w.HTMLMediaElement.prototype.play;d.querySelector('[data-player-unlock]').click();await tick();assert.equal(controller.getState().paused,false);assert.equal(env.sent.length,before,'A guest gesture joins playback without echoing host commands');
 env.socket.receive('watchroom:movie-sync-state',{roomId:'old-room',sync:{playing:false,offset:80}});assert.equal(controller.getState().paused,false);env.finish();
});
test('Shared preparing and failed sources keep Retry host only and a ready replacement cancels the old film',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 const movie={movieId:'101',status:'ready',playbackUrl:'/old.mp4'};env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie});const old=env.readyVideo();
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'102',status:'loading',playbackUrl:'/stale.mp4'}});const root=d.querySelector('.svPlayerEmbedded');assert.equal(root.dataset.playerState,'loading');assert.equal(old.getAttribute('src'),null);assert.notEqual(d.getElementById('sv103Video'),old);
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'102',status:'error',code:'timeout'}});assert.equal(root.dataset.playerState,'error');d.querySelector('[data-player-retry]').click();assert(env.sent.some(e=>e.name==='watchroom:movie-select'&&e.data.movieId==='102'&&e.data.retry===true));
 env.socket.receive('watchroom:host',{roomId:room.id,isHost:false});const count=env.sent.length;d.querySelector('[data-player-retry]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(env.sent.length,count);env.finish();
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
test('Movie details entry loads the selected film without creating a room on page load',async()=>{
 const env=await ready(setup({movieId:'101'})),d=env.window.document;
 assert(env.calls.some(c=>c.url.endsWith('/movies/101')));assert.match(d.getElementById('partySelectedMovie').textContent,/Arrival/);assert(d.querySelector('#partySelectedMovie img[src*="arrival.jpg"]'));assert.equal(d.getElementById('partyRoomName').value,'Arrival — movie night');assert(!env.calls.some(c=>c.url.endsWith('/create')));env.finish();
});
test('Creating from a title selects that film once after the new room confirms hosting',async()=>{
 const env=await ready(setup({movieId:'101'})),w=env.window,d=w.document;submit(w,d.getElementById('sv100CreateRoomForm'));await ready(env);
 assert(!env.sent.some(e=>e.name==='watchroom:movie-select'),'Selection waits for host acknowledgement');env.socket.receive('watchroom:joined',{room,isHost:true,messages:[]});env.socket.receive('watchroom:joined',{room,isHost:true,messages:[]});
 assert.equal(env.sent.filter(e=>e.name==='watchroom:movie-select').length,1);assert.equal(env.sent.find(e=>e.name==='watchroom:movie-select').data.movieId,'101');assert.equal(env.sent.find(e=>e.name==='watchroom:movie-select').data.roomId,room.id);env.finish();
});
test('Unavailable selected films offer retry or clear before hosting another party',async()=>{
 const env=await ready(setup({movieId:'101',movieFails:true})),w=env.window,d=w.document;
 assert.match(d.getElementById('partySelectedMovie').textContent,/unavailable/i);assert(d.getElementById('sv100CreateRoomForm').querySelector('button[type="submit"]').disabled);
 d.querySelector('[data-action="clear-party-movie"]').click();assert.equal(d.getElementById('sv100CreateRoomForm').querySelector('button[type="submit"]').disabled,false);env.finish();
});
test('A title selected in the lobby is never sent to a party joined as a guest',async()=>{
 const env=await ready(setup({movieId:'101'}));env.window.SwiflySocial.openNativeWatchRoom(room);env.socket.receive('watchroom:joined',{room,isHost:false,messages:[]});assert(!env.sent.some(e=>e.name==='watchroom:movie-select'));env.finish();
});
test('Leaving before host acknowledgement cancels the title queued for that party',async()=>{
 const env=await ready(setup({movieId:'101'})),w=env.window,d=w.document;submit(w,d.getElementById('sv100CreateRoomForm'));await ready(env);d.querySelector('[data-action="leave-native-room"]').click();
 const next={...room,id:'new-night'};w.SwiflySocial.openNativeWatchRoom(next);env.socket.receive('watchroom:joined',{room:next,isHost:true,messages:[]});assert(!env.sent.some(e=>e.name==='watchroom:movie-select'));env.finish();
});
test('Featured films can be chosen in the lobby and a late previous selection cannot replace them',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document,original=w.fetch;let release;
 w.fetch=(url,options)=>String(url).endsWith('/movies/101')?new Promise(resolve=>release=resolve):original(url,options);
 const query=d.getElementById('partyLobbyMovieQuery');query.value='Arrival';submit(w,d.getElementById('partyLobbyMovieForm'));await ready(env);d.querySelector('[data-party-lobby-movie-id="101"]').click();assert(release);
 d.querySelector('[data-party-featured-id="202"]').click();release({ok:true,json:async()=>({ok:true,movie:{id:101,title:'Old Arrival',year:'2016'}})});await ready(env);assert.match(d.getElementById('partySelectedMovie').textContent,/Interstellar/);assert(!d.getElementById('partySelectedMovie').textContent.includes('Old Arrival'));env.finish();
});
test('Party return links preserve a local selected-title route and reject external destinations',async()=>{
 const local=await ready(setup({partyReturn:'/movies?genre=878&media=movie-101#popular'}));assert.equal(local.window.document.querySelector('[data-party-return]').getAttribute('href'),'/movies?genre=878&media=movie-101#popular');
 const unsafe=await ready(setup({partyReturn:'https://elsewhere.example/'}));assert.equal(unsafe.window.document.querySelector('[data-party-return]').getAttribute('href'),'/movies');local.finish();unsafe.finish();
});
test('Party Back uses browser history only when its real referrer matches the saved destination',async()=>{
 const env=await ready(setup({partyReturn:'/movies?genre=878&media=movie-101#popular',referrer:'http://localhost:3000/movies?genre=878&media=movie-101'})),w=env.window;let calls=0;w.history.pushState({},'','/social?tab=watchrooms');w.history.back=()=>calls++;
 const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});w.document.querySelector('[data-party-return]').dispatchEvent(click);assert.equal(click.defaultPrevented,true);assert.equal(calls,1);
 const unknown=await ready(setup({partyReturn:'/movie/101',referrer:'http://localhost:3000/account'})),u=unknown.window;u.history.pushState({},'','/social?tab=watchrooms');u.history.back=()=>calls++;const fallback=new u.MouseEvent('click',{bubbles:true,cancelable:true});u.document.querySelector('[data-party-return]').dispatchEvent(fallback);assert.equal(fallback.defaultPrevented,false);assert.equal(calls,1);env.finish();unknown.finish();
});
test('Connection updates keep Create disabled during an unfinished room request',async()=>{
 const env=await ready(setup()),w=env.window,d=w.document,original=w.fetch;let release;
 w.fetch=(url,options)=>String(url).endsWith('/create')?new Promise(resolve=>release=resolve):original(url,options);const form=d.getElementById('sv100CreateRoomForm');submit(w,form);assert(release);env.socket.receive('connect');assert(form.querySelector('button[type="submit"]').disabled,'A connection update must not enable a duplicate creation');release({ok:true,json:async()=>({ok:true,room})});await ready(env);env.finish();
});
test('Incoming movie setup uses its current referrer and keeps the hash only for a matching saved view',async()=>{
 const fresh=await ready(setup({movieId:'101',partyReturn:'/movie/202',referrer:'http://localhost:3000/movie/101?source=search'}));assert.equal(fresh.window.document.querySelector('[data-party-return]').getAttribute('href'),'/movie/101?source=search');
 const saved=await ready(setup({movieId:'101',partyReturn:'/movies?genre=878&media=movie-101#popular',referrer:'http://localhost:3000/movies?genre=878&media=movie-101'}));assert.equal(saved.window.document.querySelector('[data-party-return]').getAttribute('href'),'/movies?genre=878&media=movie-101#popular');fresh.finish();saved.finish();
});
test('A shared movie setup cannot borrow the return destination of an unrelated title',async()=>{
 for(const partyReturn of ['/movie/202','/movies?media=movie-202','/tv/101']){const env=await ready(setup({movieId:'101',partyReturn}));assert.equal(env.window.document.querySelector('[data-party-return]').getAttribute('href'),'/movie/101');env.finish();}
});


test('A same-room sync for the previous movie cannot move a replacement and direct-link fallback clears it',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'/first.mp4',sync:{playing:false,offset:40}}});env.readyVideo();
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'102',status:'ready',playbackUrl:'/second.mp4',sync:{playing:false,offset:5}}});const second=env.readyVideo();
 env.socket.receive('watchroom:movie-sync-state',{roomId:room.id,movieId:'101',sync:{playing:true,offset:90,startedAt:Date.now()}});assert.equal(second.currentTime,5);assert.equal(second.paused,true);
 env.socket.receive('watchroom:trailer',{roomId:room.id,embedUrl:'https://media.example/direct.webm',mediaKind:'embed'});const direct=env.readyVideo();assert.equal(direct.currentTime,0);assert.equal(direct.paused,true);assert.equal(d.querySelector('#sv103Player iframe'),null);
 for(const movieId of ['102',undefined])env.socket.receive('watchroom:movie-sync-state',{roomId:room.id,movieId,sync:{playing:true,offset:80,startedAt:Date.now()}});
 assert.equal(direct.currentTime,0,'Previous movie clocks must not seek a direct link');assert.equal(direct.paused,true);env.finish();
});
test('A real empty-room snapshot retains the empty stage instead of mounting a failed movie',async()=>{
 const env=setup();await enter(env);const d=env.window.document;
 assert.equal(d.querySelector('.svPlayerEmbedded'),null);assert.match(d.getElementById('sv103Player').textContent,/No media selected/);assert.equal(d.getElementById('sv103ControlDock').hidden,true);env.finish();
});
test('A joined room with an idle movie placeholder preserves its direct or iframe link',async()=>{
 for(const embedUrl of ['https://media.example/direct.mp4','https://video.example/embed/123']){
  const env=await ready(setup()),w=env.window,d=w.document,linked={...room,embedUrl,mediaKind:'embed'};
  w.SwiflySocial.openNativeWatchRoom(linked);env.socket.receive('watchroom:joined',{room:linked,isHost:false,messages:[]});
  if(embedUrl.endsWith('.mp4'))assert.equal(w.SwiflyPlayer.mount(d.querySelector('.svPlayerEmbedded')).getState().source,embedUrl);
  else {assert.equal(d.querySelector('#sv103Player iframe')?.src,embedUrl);assert.match(d.getElementById('sv103ControlDock').textContent,/own controls|manual/i);assert.equal(d.getElementById('sv103ControlDock').querySelector('button'),null);}
  env.finish();
 }
});
test('Direct-link guests have honest manual transport and retry locally without movie commands',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 env.socket.receive('watchroom:trailer',{roomId:room.id,embedUrl:'https://media.example/direct.mp4',mediaKind:'embed'});env.socket.receive('watchroom:host',{roomId:room.id,isHost:false});const video=env.readyVideo();
 assert.equal(d.querySelector('[data-player-play]').disabled,false);assert.equal(d.querySelector('[data-player-seek]').disabled,false);assert.match(d.querySelector('[data-player-transport-note]').textContent,/manual|not synchronized/i);assert.equal(d.querySelector('[data-player-sync]').hidden,true);
 const count=env.sent.length;d.querySelector('[data-player-play]').click();await tick();assert.equal(video.paused,false);d.querySelector('[data-player-forward]').click();assert.equal(video.currentTime,10);assert.equal(env.sent.length,count);
 video.dispatchEvent(new w.Event('error'));d.querySelector('[data-player-retry]').click();env.readyVideo();assert.equal(d.querySelector('.svPlayerEmbedded').dataset.playerState,'ready');assert.equal(env.sent.length,count);assert(!env.calls.some(call=>call.url.includes('proxy-video-wait')));env.finish();
});
test('Party source formats share native HLS and DASH loading while retaining protected URL preference',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;
 w.HTMLMediaElement.prototype.canPlayType=()=> 'probably';
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'/authorized.m3u8',proxyVideo:'https://raw.example/other.m3u8',m3u8:'https://raw.example/master.m3u8'}});const native=env.readyVideo();assert.equal(native.getAttribute('src'),'/authorized.m3u8');
 let dash;const MediaPlayer=()=>({create:()=>dash={initialize(video,url,auto){this.video=video;this.url=url;this.auto=auto;},on(){},getTracksFor(){return [];},getBitrateInfoListFor(){return [];},destroy(){this.destroyed=true;}}});MediaPlayer.events={};w.dashjs={MediaPlayer};
 env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'102',status:'ready',playbackUrl:'/authorized.mpd',m3u8:'https://raw.example/unused.m3u8'}});await tick();assert.equal(dash.url,'/authorized.mpd');assert.equal(dash.auto,false);
 d.querySelector('[data-action="leave-native-room"]').click();assert.equal(dash.destroyed,true);assert.equal(d.getElementById('sv103Video'),null);env.finish();
});
test('Guests can request manual sync from shared settings without acquiring host transport',async()=>{
 const env=setup();await enter(env);const w=env.window,d=w.document;env.socket.receive('watchroom:host',{roomId:room.id,isHost:false});env.socket.receive('watchroom:movie-sync',{roomId:room.id,movie:{movieId:'101',status:'ready',playbackUrl:'/movie.mp4'}});env.readyVideo();
 d.querySelector('[data-player-settings]').open=true;d.querySelector('[data-player-sync]').click();assert.equal(env.sent.at(-1).name,'watchroom:movie-control');assert.equal(env.sent.at(-1).data.action,'sync-me');assert.equal(d.querySelector('[data-player-settings]').open,false);assert.equal(d.querySelector('[data-player-play]').disabled,true);env.finish();
});
