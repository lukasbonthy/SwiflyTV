'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {loadServer,browser,tick,cleanup}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const {playerMarkup,episodePickerMarkup}=require('../ui/player');
const {watchPartyMarkup}=require('../ui/watch-party');
const {partyMarkup}=require('../ui/party');
const api=loadServer();let base,port,jobs;const clients=[];
const series={id:101,name:'The Office',first_air_date:'2005-03-24',seasons:[{season_number:1,episode_count:6},{season_number:2,episode_count:4}]};
const episodes=[{episode_number:1,name:'The Dundies'},{episode_number:2,name:'Sexual Harassment'},{episode_number:3,name:'Office Olympics'},{episode_number:4,name:'The Fire'}];
function metadata(endpoint){if(endpoint==='/tv/101')return series;if(endpoint==='/tv/101/season/2')return {episodes};if(endpoint==='/tv/101/season/1')return {episodes:episodes.slice(0,2)};return {results:[]};}
function inject(resolve){jobs?.destroy();jobs=createSourceJobs({resolve,deadlineMs:1000});api.setSourceJobs(jobs);}
function connect(){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/socket.io/?EIO=4&transport=websocket'),queue=[],waiters=[];
 const client={ws,send(name,data){ws.send('42'+JSON.stringify([name,data]));},wait(name,predicate=()=>true){return new Promise((yes,no)=>{const index=queue.findIndex(event=>event.name===name&&predicate(event.data));if(index>=0)return yes(queue.splice(index,1)[0].data);const pending={name,predicate,yes};pending.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(pending),1);no(Error('Missing '+name));},1500);waiters.push(pending);});}};
 ws.on('error',reject);ws.on('message',raw=>{const value=raw.toString();if(value.startsWith('0')){ws.send('40');return;}if(value.startsWith('40')){clients.push(client);resolve(client);return;}if(value==='2'){ws.send('3');return;}if(!value.startsWith('42'))return;const [name,data]=JSON.parse(value.slice(2)),index=waiters.findIndex(pending=>pending.name===name&&pending.predicate(data));if(index<0)queue.push({name,data});else{const pending=waiters.splice(index,1)[0];clearTimeout(pending.timer);pending.yes(data);}});
});}
async function join(client,id,user){client.send('watchroom:join',{roomId:id,user});return client.wait('watchroom:joined',data=>data.room.id===id);}
const selection={movieId:'101',type:'tv',season:'2',episode:'3'};
test.before(async()=>{api.setTmdb(async endpoint=>metadata(endpoint));await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));port=api.httpServer.address().port;base='http://127.0.0.1:'+port;});
test.after(async()=>{jobs?.destroy();clients.forEach(client=>client.ws.close());await new Promise(resolve=>api.io.close(resolve));});
test.afterEach(cleanup);

test('Party search includes movies and TV series with distinct media identity',async()=>{
 let requested;api.setTmdb(async(endpoint,params)=>{requested={endpoint,params};return {results:[{id:101,media_type:'movie',title:'The Office',release_date:'2015-01-01'},{...series,media_type:'tv'},{id:202,media_type:'person',name:'An actor'},{...series,id:303,media_type:'tv',adult:true}]};});
 const response=await fetch(base+'/api/social/media/search?q=Office');assert.equal(response.status,200);const data=await response.json();assert.equal(requested.endpoint,'/search/multi');assert.equal(requested.params.include_adult,false);assert.deepEqual(data.results.map(row=>[row.type,row.id]),[['movie',101],['tv',101]]);assert.equal(data.results[1].title,'The Office');assert.equal(data.results[1].year,'2005');
});
test('Series party metadata returns the actual selected season and escaped reusable episode picker',async()=>{
 api.setTmdb(async endpoint=>metadata(endpoint));const response=await fetch(base+'/api/social/media/tv/101?season=2&episode=3');assert.equal(response.status,200);const data=await response.json();assert.equal(data.media.type,'tv');assert.equal(data.media.season,'2');assert.equal(data.media.episode,'3');assert.equal(data.media.episodes[2].name,'Office Olympics');const env=browser(data.episodePickerHtml);assert.match(env.window.document.querySelector('[aria-current="page"]').textContent,/Office Olympics/);
});
test('Malformed TV episode metadata requests do not reach TMDB',async()=>{
 let calls=0;api.setTmdb(async()=>{calls++;return series;});for(const query of ['season=0','season=2junk','episode=-1','episode=1.5']){const response=await fetch(base+'/api/social/media/tv/101?'+query);assert.equal(response.status,400,query);}assert.equal(calls,0);
});
test('TV category searches query TV directly so movies cannot crowd the show results out',async()=>{
 let endpoint;api.setTmdb(async path=>{endpoint=path;return {results:[series]};});const response=await fetch(base+'/api/social/media/search?type=tv&q=Office');assert.equal(response.status,200);assert.equal(endpoint,'/search/tv');assert.equal((await response.json()).results[0].type,'tv');
});
test('Unspecified TV party choices use the first available numbered season',async()=>{
 api.setTmdb(async endpoint=>endpoint==='/tv/101'?{...series,seasons:[{season_number:0,episode_count:1},{season_number:3,episode_count:4}]}:endpoint==='/tv/101/season/3'?{episodes}:metadata(endpoint));
 const response=await fetch(base+'/api/social/media/tv/101');assert.equal(response.status,200);assert.equal((await response.json()).media.season,'3');const explicit=await fetch(base+'/api/social/media/tv/101?season=1');assert.equal(explicit.status,404);
 const details=await fetch(base+'/tv/101?view=modal'),env=browser(await details.text());assert.equal(new URL(env.window.document.querySelector('[data-sv-party-type="tv"]').href).searchParams.get('s'),'3');
});
test('TV party watch pages and series details expose shared playback for the selected episode',async()=>{
 api.setTmdb(async endpoint=>metadata(endpoint));const response=await fetch(base+'/watch/tv/101?mode=movie&s=2&e=3&roomId=tv-page-room');const env=browser((await response.text()).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'')),d=env.window.document;assert.equal(d.querySelector('.svPlayerPage').dataset.playerManaged,'true');assert(d.querySelector('[data-watch-party]'));assert(d.querySelector('[data-player-party-open]'));assert.equal(new URL(d.querySelector('[data-player-episode-next]').href).searchParams.get('roomId'),'tv-page-room');
 const details=await fetch(base+'/tv/101?view=modal'),detailEnv=browser(await details.text()),action=detailEnv.window.document.querySelector('[data-sv-party-type="tv"]');assert(action);assert.equal(new URL(action.href).pathname,'/watch/tv/101');assert.equal(new URL(action.href).searchParams.get('party'),'create');
});
test('TV party selection shares one exact episode source with guests, late joiners and invites',{timeout:6000},async()=>{
 api.setTmdb(async endpoint=>metadata(endpoint));const discoveries=[];let complete;inject(params=>{discoveries.push(params);return new Promise(resolve=>complete=resolve);});
 const host=await connect(),guest=await connect();await join(host,'tv-shared-party','Ava');await join(guest,'tv-shared-party','Ben');
 await fetch(base+'/api/proxy-video-wait/tv/101?season=2&episode=3');host.send('watchroom:movie-select',{roomId:'tv-shared-party',...selection});const loading=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='loading');assert.equal(loading.movie.type,'tv');assert.equal(loading.movie.episode,'3');assert.equal(discoveries.length,1);assert.deepEqual(discoveries[0],{type:'tv',id:'101',season:'2',episode:'3',provider:''});
 complete({status:'ok',playbackUrl:'/episode-2-3.mp4',type:'movie',season:'9',episode:'9'});const ready=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');assert.equal(ready.movie.type,'tv');assert.equal(ready.movie.season,'2');assert.equal(ready.movie.episode,'3');assert.equal(ready.movie.playbackUrl,'/episode-2-3.mp4');
 const late=await connect(),ack=await join(late,'tv-shared-party','Chris');assert.equal(ack.room.syncedMovie.requestId,ready.movie.requestId);assert.equal(ack.room.syncedMovie.episode,'3');
 const redirect=await fetch(base+'/social?roomId=tv-shared-party',{redirect:'manual'}),url=new URL(redirect.headers.get('location'),base);assert.equal(url.pathname,'/watch/tv/101');assert.equal(url.searchParams.get('s'),'2');assert.equal(url.searchParams.get('e'),'3');assert.equal(url.searchParams.get('roomId'),'tv-shared-party');
});
test('Only the host can select TV episodes and stale episode transports cannot change the room',{timeout:6000},async()=>{
 let starts=0;inject(async()=>{starts++;return {status:'ok',playbackUrl:'/episode.mp4'};});const host=await connect(),guest=await connect();await join(host,'tv-permissions-party','Ava');await join(guest,'tv-permissions-party','Ben');
 host.send('watchroom:movie-select',{roomId:'tv-permissions-party',...selection});const first=await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 guest.send('watchroom:movie-select',{roomId:'tv-permissions-party',...selection,episode:'4'});await guest.wait('watchroom:message',data=>data.text.includes('Only the host'));assert.equal(starts,1);
 host.send('watchroom:movie-select',{roomId:'tv-permissions-party',...selection,episode:'4'});const second=await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready'&&data.movie.episode==='4');assert.equal(starts,2);
 host.send('watchroom:movie-control',{roomId:'tv-permissions-party',...selection,requestId:first.movie.requestId,action:'set',time:99,intent:'user'});
 host.send('watchroom:movie-control',{roomId:'tv-permissions-party',...selection,episode:'4',requestId:first.movie.requestId,action:'set',time:88,intent:'user'});
 host.send('watchroom:movie-control',{roomId:'tv-permissions-party',...selection,episode:'4',requestId:second.movie.requestId,action:'set',time:5,intent:'user'});const state=await guest.wait('watchroom:movie-sync-state',data=>data.sync.offset===5);assert.equal(state.episode,'4');assert.equal(state.requestId,second.movie.requestId);
 host.send('watchroom:movie-select',{roomId:'tv-permissions-party',...selection,season:'0'});await join(host,'tv-permissions-party','Ava');assert.equal(starts,2);
});
test('A slow previous TV episode cannot replace a newer choice',{timeout:6000},async()=>{
 const pending=new Map();inject(params=>new Promise(resolve=>pending.set(params.episode,resolve)));const host=await connect();await join(host,'tv-race-party','Ava');host.send('watchroom:movie-select',{roomId:'tv-race-party',...selection});await host.wait('watchroom:movie-sync',data=>data.movie.status==='loading');host.send('watchroom:movie-select',{roomId:'tv-race-party',...selection,episode:'4'});await host.wait('watchroom:movie-sync',data=>data.movie.status==='loading'&&data.movie.episode==='4');
 pending.get('4')({status:'ok',playbackUrl:'/four.mp4'});await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready');pending.get('3')({status:'ok',playbackUrl:'/three.mp4'});const ack=await join(host,'tv-race-party','Ava');assert.equal(ack.room.syncedMovie.episode,'4');assert.equal(ack.room.syncedMovie.playbackUrl,'/four.mp4');
});
test('Legacy REST movie controls cannot claim hosting over an active socket party',{timeout:5000},async()=>{
 inject(async()=>({status:'ok',playbackUrl:'/episode.mp4'}));const host=await connect();await join(host,'tv-rest-guard-party','Ava');host.send('watchroom:movie-select',{roomId:'tv-rest-guard-party',...selection});await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 for(const [route,body]of [['movie-control',{action:'set',time:99,intent:'user'}],['movie-select',{movieId:'202'}]]){const response=await fetch(base+'/api/date-room/tv-rest-guard-party/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'unrelated-client',...body})});assert.equal(response.status,403,route);}
 const ack=await join(host,'tv-rest-guard-party','Ava');assert.equal(ack.room.syncedMovie.type,'tv');assert.equal(ack.room.syncedMovie.episode,'3');
 const rest=await fetch(base+'/api/date-room/rest-movie-only/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'rest-host',name:'Ava'})});assert.equal(rest.status,200);assert.equal((await rest.json()).isHost,true,'Legacy REST-only movie rooms retain their host claim');
});

function playerEnv(isHost=true,options={}){
 const picker=episodePickerMarkup({id:'101',season:2,episode:3,seasons:series.seasons,episodes,episodeCount:4});
 const env=browser(playerMarkup({id:'101',type:'tv',title:series.name,season:2,episode:3,managed:true,episodePickerHtml:picker,partyPanelHtml:watchPartyMarkup({movieId:'101',type:'tv',title:series.name,season:2,episode:3}),...options}),{path:'/watch/tv/101?mode=movie&s=2&e=3&roomId=tv-browser-room'}),w=env.window,handlers={},sent=[],calls=[];
 const room={id:'tv-browser-room',name:'Series night',syncedMovie:{...selection,status:'ready',requestId:'episode-three',playbackUrl:'/three.mp4',sync:{playing:false,offset:0}}};
 const socket={connected:true,on(name,fn){handlers[name]=fn;return this;},emit(name,data){sent.push({name,data});},disconnect(){this.connected=false;},connect(){this.connected=true;}};w.io=()=>socket;
 w.SwiflyPlayer={setRemoteMode:value=>calls.push(['remote',value]),loadSource:value=>calls.push(['source',value]),pause(){},play(){},seek:time=>calls.push(['seek',time]),resolve(){},getState:()=>({ready:true,paused:true,currentTime:0})};
 w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/api/social/media/')?{ok:true,media:{id:101,type:'tv',title:series.name,season:'2',episode:'4',seasons:series.seasons,episodes},episodePickerHtml:episodePickerMarkup({id:'101',season:2,episode:4,seasons:series.seasons,episodes,episodeCount:4})}:{ok:true,room}});
 w.boot('player/watch-party.js');return {...env,w,handlers,sent,calls,room,ack(){handlers['watchroom:joined']?.({room,isHost,messages:[]});}};
}
test('A TV party host changes episodes in place while guests cannot leave through episode controls',async()=>{
 const env=playerEnv();await tick();env.ack();const d=env.w.document,next=d.querySelector('[data-player-episode-next]'),click=new env.w.MouseEvent('click',{bubbles:true,cancelable:true});next.dispatchEvent(click);assert.equal(click.defaultPrevented,true);const selected=env.sent.find(row=>row.name==='watchroom:movie-select');assert(selected);assert.equal(selected.data.type,'tv');assert.equal(selected.data.season,'2');assert.equal(selected.data.episode,'4');assert.equal(env.sent.filter(row=>row.name==='watchroom:leave').length,0);
 const movie={...selection,episode:'4',status:'ready',requestId:'episode-four',playbackUrl:'/four.mp4',sync:{playing:false,offset:0}};env.handlers['watchroom:movie-sync']({roomId:env.room.id,movie});await tick();assert.equal(d.querySelector('.svPlayerPage').dataset.playerEpisode,'4');assert.equal(new URL(env.w.location.href).searchParams.get('e'),'4');assert.equal(new URL(env.w.location.href).searchParams.get('roomId'),env.room.id);assert.equal(env.calls.filter(row=>row[0]==='source'&&row[1].playbackUrl==='/four.mp4').length,1);
 const guest=playerEnv(false);await tick();guest.ack();const blocked=new guest.w.MouseEvent('click',{bubbles:true,cancelable:true});guest.w.document.querySelector('[data-player-episode-next]').dispatchEvent(blocked);assert.equal(blocked.defaultPrevented,true);assert.equal(guest.sent.filter(row=>row.name==='watchroom:movie-select').length,0);
});
test('TV player Retry and synchronization retain episode identity and ignore stale request events',async()=>{
 const env=playerEnv();await tick();env.ack();const app=env.w.document.querySelector('.svPlayerPage');app.dispatchEvent(new env.w.CustomEvent('swiflyplayer:retry',{detail:{}}));const retry=env.sent.find(row=>row.name==='watchroom:movie-select');assert.equal(retry.data.episode,'3');assert.equal(retry.data.type,'tv');
 env.calls.length=0;for(const identity of [{...selection,episode:'2',requestId:'episode-three'},{...selection,requestId:'old-request'}])env.handlers['watchroom:movie-sync-state']({roomId:env.room.id,...identity,sync:{playing:false,offset:90}});assert.equal(env.calls.length,0);
 env.handlers['watchroom:movie-sync-state']({roomId:env.room.id,...selection,requestId:'episode-three',sync:{playing:false,offset:30}});assert(env.calls.some(row=>row[0]==='seek'&&row[1]===30));
});
test('A loading and ready episode transition refreshes the visible picker to the same shared episode',async()=>{
 const env=playerEnv();await tick();env.ack();const next={...selection,episode:'4',requestId:'episode-four'};env.handlers['watchroom:movie-sync']({roomId:env.room.id,movie:{...next,status:'loading'}});env.handlers['watchroom:movie-sync']({roomId:env.room.id,movie:{...next,status:'ready',playbackUrl:'/four.mp4',sync:{playing:false,offset:0}}});await tick();await tick();const selected=env.w.document.querySelector('[data-player-episode-link][aria-current="page"]');assert.equal(new URL(selected.href).searchParams.get('e'),'4');
});

test('A shared episode switch refreshes metadata and mode links without leaving the party',async()=>{
 const env=playerEnv(true,{year:'2005',provider:'fixture',trailerUrl:'https://www.youtube.com/embed/official'});await tick();env.ack();
 env.handlers['watchroom:movie-sync']({roomId:env.room.id,movie:{...selection,episode:'4',requestId:'episode-four',status:'ready',playbackUrl:'/four.mp4',sync:{playing:false,offset:0}}});await tick();await tick();
 const d=env.w.document,episodeLink=d.querySelector('[data-player-mode-link][aria-current="page"]'),trailerLink=[...d.querySelectorAll('[data-player-mode-link]')].find(link=>new URL(link.href).searchParams.get('mode')==='trailer');
 assert.match(d.querySelector('.svPlayerMetadata').textContent,/2005.*Season 2 · Episode 4.*Now watching/);
 for(const link of [episodeLink,trailerLink]){const url=new URL(link.href);assert.equal(url.searchParams.get('s'),'2');assert.equal(url.searchParams.get('e'),'4');assert.equal(url.searchParams.get('provider'),'fixture');}
 assert.equal(new URL(episodeLink.href).searchParams.get('roomId'),env.room.id);
 const click=new env.w.MouseEvent('click',{bubbles:true,cancelable:true});episodeLink.dispatchEvent(click);assert.equal(click.defaultPrevented,true,'The current Episode tab keeps the connected room in place');assert.equal(env.sent.filter(row=>row.name==='watchroom:leave').length,0);
 env.w.SwiflyWatchParty.leave();for(const link of [episodeLink,trailerLink]){const url=new URL(link.href);assert.equal(url.searchParams.get('roomId'),null);assert.equal(url.searchParams.get('e'),'4');}
});


test('Rejoining during an unfinished episode picker refresh starts a fresh picker request',async()=>{
 const env=playerEnv();await tick();env.ack();const movie={...selection,episode:'4',requestId:'episode-four',status:'ready',playbackUrl:'/four.mp4',sync:{playing:false,offset:0}},room={...env.room,syncedMovie:movie};let pickerCalls=0,finishPrevious;
 const pickerData={ok:true,media:{id:101,type:'tv',title:series.name,season:'2',episode:'4',seasons:series.seasons,episodes},episodePickerHtml:episodePickerMarkup({id:'101',season:2,episode:4,seasons:series.seasons,episodes,episodeCount:4})};
 env.w.fetch=async url=>{if(!String(url).includes('/api/social/media/'))return {ok:true,json:async()=>({ok:true,room})};pickerCalls++;if(pickerCalls===1)return new Promise(resolve=>finishPrevious=()=>resolve({ok:true,json:async()=>pickerData}));return {ok:true,json:async()=>pickerData};};
 env.handlers['watchroom:movie-sync']({roomId:room.id,movie});await tick();env.w.SwiflyWatchParty.leave();const form=env.w.document.querySelector('[data-party-join-form]');form.querySelector('input').value=room.id;form.dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));await tick();env.handlers['watchroom:joined']({room,isHost:true,messages:[]});await tick();await tick();finishPrevious();await tick();
 assert.equal(pickerCalls,2);const selected=env.w.document.querySelector('[data-player-episode-link][aria-current="page"]');assert.equal(new URL(selected.href).searchParams.get('e'),'4');
});

function hubEnv(){
 const env=browser(partyMarkup({initialTab:'rooms',openRoomCreation:true}),{path:'/social?tab=watchrooms'}),w=env.window,handlers={},sent=[];
 const room={id:'tv-hub-room',name:'Series night',mediaKind:'blank',syncedMovie:{status:'idle',movieId:''}};
 w.io=()=>({connected:true,on(name,fn){handlers[name]=fn;return this;},emit(name,data){sent.push({name,data});}});
 w.fetch=async(url)=>{let data;const u=new URL(String(url),w.location.href);
  if(u.pathname.endsWith('/permissions'))data={permissions:{canCreateWatchRooms:true}};
  else if(u.pathname.endsWith('/movies/featured'))data={movies:[]};
  else if(u.pathname.endsWith('/media/search'))data={results:[{id:101,type:'tv',title:series.name,year:'2005'}]};
  else if(u.pathname.endsWith('/media/tv/101')){const season=u.searchParams.get('season')||'1',episode=u.searchParams.get('episode')||'1';data={media:{id:101,type:'tv',title:series.name,season,episode,seasons:series.seasons,episodes},episodePickerHtml:episodePickerMarkup({id:'101',season,episode,seasons:series.seasons,episodes,episodeCount:4})};}
  else if(u.pathname.endsWith('/create')||u.pathname.includes('/api/date-room/'))data={room};else data={rooms:[]};
  return {ok:true,json:async()=>({ok:true,...data})};
 };
 w.SwiflyPlayer={mount(){return {setRemoteMode(){},loadSource(){},destroy(){},getState:()=>({currentTime:0,status:'loading'}),seek(){},pause(){}};}};
 w.boot('party/party.js');return {...env,w,sent,handlers,room};
}
const submit=(w,form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
test('Party Hub offers TV season and episode choices before hosting and sends that exact episode after acknowledgement',async()=>{
 const env=hubEnv();await tick();await tick();const d=env.w.document,type=d.querySelector('[data-party-lobby-media-type]');assert(type,'Lobby search needs a discoverable TV shows choice');type.value='tv';d.querySelector('#partyLobbyMovieQuery').value='Office';submit(env.w,d.querySelector('#partyLobbyMovieForm'));await tick();d.querySelector('[data-party-lobby-movie-id="101"][data-party-type="tv"]').click();await tick();await tick();
 const season=d.querySelector('[data-party-lobby-season]');assert(season);season.value='2';season.dispatchEvent(new env.w.Event('change',{bubbles:true}));await tick();await tick();const episode=d.querySelector('[data-party-lobby-episode]');episode.value='3';episode.dispatchEvent(new env.w.Event('change',{bubbles:true}));submit(env.w,d.querySelector('#sv100CreateRoomForm'));await tick();await tick();assert.equal(env.sent.filter(row=>row.name==='watchroom:movie-select').length,0);env.handlers['watchroom:joined']({room:env.room,isHost:true,messages:[]});const selected=env.sent.find(row=>row.name==='watchroom:movie-select');assert(selected);assert.equal(selected.data.type,'tv');assert.equal(selected.data.season,'2');assert.equal(selected.data.episode,'3');
});
test('Party Hub host episode controls share the next episode without leaving the room',async()=>{
 const env=hubEnv();await tick();await tick();env.w.SwiflySocial.openNativeWatchRoom(env.room);env.handlers['watchroom:joined']({room:{...env.room,syncedMovie:{...selection,status:'loading',requestId:'third'}},isHost:true,messages:[]});await tick();await tick();const picker=env.w.document.querySelector('[data-party-room-episodes]');assert(picker);const next=picker.querySelector('[data-player-episode-next]');assert(next);const event=new env.w.MouseEvent('click',{bubbles:true,cancelable:true});next.dispatchEvent(event);assert.equal(event.defaultPrevented,true);const selected=env.sent.find(row=>row.name==='watchroom:movie-select');assert.equal(selected.data.episode,'4');assert.equal(selected.data.season,'2');assert.equal(env.sent.filter(row=>row.name==='watchroom:leave').length,0);
});
test('Party Hub joins a same-site TV player invite',async()=>{
 const env=hubEnv();await tick();await tick();env.w.document.querySelector('#partyInvite').value='http://localhost:3000/watch/tv/101?mode=movie&s=2&e=3&roomId=tv-hub-room';submit(env.w,env.w.document.querySelector('#partyJoinForm'));await tick();await tick();assert(env.sent.some(row=>row.name==='watchroom:join'&&row.data.roomId==='tv-hub-room'));
});
test('TV party creation sends the season and episode selected in setup after host acknowledgement',async()=>{
 const env=playerEnv(),d=env.w.document;await tick();env.ack();d.querySelector('[data-party-leave]').click();env.sent.length=0;d.querySelector('[data-player-party-open]').click();await tick();await tick();d.querySelector('[data-party-setup-episode]').value='2';d.querySelector('[data-party-setup-episode]').dispatchEvent(new env.w.Event('change',{bubbles:true}));const emptyRoom={...env.room,syncedMovie:{status:'idle',movieId:''}};env.w.fetch=async()=>({ok:true,json:async()=>({ok:true,room:emptyRoom})});submit(env.w,d.querySelector('[data-party-create-form]'));await tick();assert.equal(env.sent.filter(row=>row.name==='watchroom:movie-select').length,0);env.handlers['watchroom:joined']({room:emptyRoom,isHost:true,messages:[]});const selected=env.sent.find(row=>row.name==='watchroom:movie-select');assert.equal(selected.data.season,'2');assert.equal(selected.data.episode,'2');assert.equal(selected.data.type,'tv');
});
test('A guest in the Party Hub cannot choose a different episode',async()=>{
 const env=hubEnv();await tick();await tick();env.w.SwiflySocial.openNativeWatchRoom(env.room);env.handlers['watchroom:joined']({room:{...env.room,syncedMovie:{...selection,status:'loading',requestId:'third'}},isHost:false,messages:[]});await tick();await tick();const next=env.w.document.querySelector('[data-party-room-episodes] [data-player-episode-next]');assert.equal(next.getAttribute('aria-disabled'),'true');const event=new env.w.MouseEvent('click',{bubbles:true,cancelable:true});next.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(env.sent.filter(row=>row.name==='watchroom:movie-select').length,0);
});
test('Party Hub hosts can find a TV show and choose an episode inside an existing room',async()=>{
 const env=hubEnv();await tick();await tick();env.w.SwiflySocial.openNativeWatchRoom(env.room);env.handlers['watchroom:joined']({room:env.room,isHost:true,messages:[]});const d=env.w.document;d.querySelector('[data-party-room-media-type]').value='tv';d.querySelector('#partyMovieQuery').value='Office';submit(env.w,d.querySelector('#sv103MovieForm'));await tick();d.querySelector('[data-party-movie-id="101"][data-party-type="tv"]').click();await tick();await tick();assert.equal(env.sent.filter(row=>row.name==='watchroom:movie-select').length,0,'The series result must wait for an episode choice');const season=d.querySelector('[data-party-room-season]');season.value='2';season.dispatchEvent(new env.w.Event('change',{bubbles:true}));await tick();await tick();const episode=d.querySelector('[data-party-room-episode]');episode.value='3';episode.dispatchEvent(new env.w.Event('change',{bubbles:true}));submit(env.w,d.querySelector('#partyRoomEpisodeForm'));const selected=env.sent.find(row=>row.name==='watchroom:movie-select');assert.equal(selected.data.type,'tv');assert.equal(selected.data.season,'2');assert.equal(selected.data.episode,'3');
});
