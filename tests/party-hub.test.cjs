const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(async()=>{await tick();await tick();cleanup();});const api=loadServer();
const room={id:'movie-night',name:'Friday with friends',host:'Ava',mediaKind:'blank',viewers:1};
function setup(options={}){
 let html;api.socialPage({query:{tab:'watchrooms'}},{send:value=>html=value});
 const parsed=browser(html),markup=parsed.window.document.querySelector('main.svPartyHub').outerHTML;parsed.finish();
 const env=browser(markup,{path:'/social?tab=watchrooms'+(options.movieId?'&movieId='+options.movieId:''),referrer:options.referrer}),w=env.window,events=new Map(),sent=[],calls=[];
 if(options.movieId)w.document.querySelector('.svPartyHub').dataset.selectedMovieId=options.movieId;
 if(options.partyReturn)w.sessionStorage.setItem('swiflytv.partyReturn',options.partyReturn);
 const socket={id:'socket-ava',connected:options.connected!==false,on(name,fn){events.set(name,fn);return this;},emit(name,data){sent.push({name,data});return this;},receive(name,data){events.get(name)?.(data);}};
 w.io=()=>socket;w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({name:'Ava'}));
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
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
