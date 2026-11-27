const test=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {loadServer}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const api=loadServer();let base,port,jobs;const clients=[];
function connect({socketPort=port,cookie}={}){return new Promise((resolve,reject)=>{
 const headers=cookie?{cookie}:{};
 const ws=new WebSocket('ws://127.0.0.1:'+socketPort+'/socket.io/?EIO=4&transport=websocket',{headers}),queue=[],waiters=[];
 const client={ws,send(name,data){ws.send('42'+JSON.stringify([name,data]));},wait(name,predicate=()=>true,timeoutMs=1500){return new Promise((yes,no)=>{const index=queue.findIndex(event=>event.name===name&&predicate(event.data));if(index>=0)return yes(queue.splice(index,1)[0].data);const pending={name,predicate,yes,no};pending.timer=setTimeout(()=>{const at=waiters.indexOf(pending);if(at>=0)waiters.splice(at,1);no(Error('Missing '+name));},timeoutMs);waiters.push(pending);});}};
 ws.on('error',reject);ws.on('message',raw=>{const value=raw.toString();if(value.startsWith('0')){ws.send('40');return;}if(value.startsWith('40')){clients.push(client);resolve(client);return;}if(value.startsWith('44')){ws.close();reject(new Error(JSON.parse(value.slice(2)).message));return;}if(value==='2'){ws.send('3');return;}if(!value.startsWith('42'))return;const [name,data]=JSON.parse(value.slice(2)),index=waiters.findIndex(pending=>pending.name===name&&pending.predicate(data));if(index<0)queue.push({name,data});else{const pending=waiters.splice(index,1)[0];clearTimeout(pending.timer);pending.yes(data);}});
});}
function inject(resolve,deadlineMs=1000,options={}){jobs=createSourceJobs({resolve,deadlineMs,...options});api.setSourceJobs(jobs);}
async function join(client,id,user){client.send('watchroom:join',{roomId:id,user});return client.wait('watchroom:joined',data=>data.room.id===id);}
test.before(async()=>{await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));port=api.httpServer.address().port;base='http://127.0.0.1:'+port;});
test.after(async()=>{jobs?.destroy();clients.forEach(client=>client.ws.close());await new Promise(resolve=>api.io.close(resolve));});
test('Party selection shares the catalog source job and preserves proxy playback and captions',{timeout:5000},async()=>{
 let complete,starts=0;inject(()=>{starts++;return new Promise(resolve=>complete=resolve);});const host=await connect(),guest=await connect();await join(host,'same-player-party','Ava');await join(guest,'same-player-party','Ben');
 const pending=await(await fetch(base+'/api/proxy-video-wait/movie/301')).json();assert.equal(pending.status,'loading');host.send('watchroom:movie-select',{roomId:'same-player-party',movieId:'301'});await guest.wait('watchroom:movie-sync',data=>data.movie.status==='loading');assert.equal(starts,1);
 complete({status:'ok',playbackUrl:'/api/hls-proxy/movie/master.m3u8',m3u8:'https://media.example/raw.m3u8',streamType:'hls',captions:[{src:'/captions.vtt',label:'English'}]});
 const ready=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');assert.equal(ready.movie.playbackUrl,'/api/hls-proxy/movie/master.m3u8');assert.equal(ready.movie.proxyVideo,ready.movie.playbackUrl);assert.equal(ready.movie.captions[0].label,'English');assert(ready.serverTime>0);
 const redirect=await fetch(base+'/social?tab=watchrooms&roomId=same-player-party',{redirect:'manual'});assert.equal(redirect.headers.get('location'),'/watch/movie/301?mode=movie&roomId=same-player-party');
});
test('The host’s explicit provider shares its source job with solo playback',{timeout:5000},async()=>{
 const host=await connect(),guest=await connect(),roomId='shared-provider-party',lookups=[];
 let complete;
 inject(params=>{
  lookups.push(params);
  return new Promise(resolve=>complete=resolve);
 });
 await join(host,roomId,'Ava');
 await join(guest,roomId,'Ben');
 const pending=await (await fetch(base+'/api/proxy-video-wait/tv/306?season=4&episode=2&provider=vidlink')).json();
 assert.equal(pending.status,'loading');
 host.send('watchroom:movie-select',{roomId,movieId:'306',type:'tv',season:'4',episode:'2',provider:'vidlink'});
 await guest.wait('watchroom:movie-sync',data=>data.movie.status==='loading');
 assert.deepEqual(lookups,[{type:'tv',id:'306',season:'4',episode:'2',provider:'vidlink'}]);
 complete({status:'ok',playbackUrl:'/provider-source.mp4',streamType:'mp4'});
 const ready=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 assert.equal(ready.movie.playbackUrl,'/provider-source.mp4');
 assert.equal(ready.movie.provider,'vidlink');
 host.send('watchroom:movie-select',{roomId,movieId:'306',type:'tv',season:'4',episode:'3'});
 await guest.wait('watchroom:movie-sync',data=>data.movie.status==='loading'&&data.movie.episode==='3');
 assert.deepEqual(lookups.at(-1),{type:'tv',id:'306',season:'4',episode:'3',provider:'vidlink'});
 complete({status:'ok',playbackUrl:'/next-episode.mp4',streamType:'mp4'});
 await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready'&&data.movie.episode==='3');
});
test('Intentional short host seeks work while guests and other rooms cannot change transport',{timeout:5000},async()=>{
 inject(async()=>({status:'ok',playbackUrl:'https://media.example/movie.mp4'}));const host=await connect(),guest=await connect(),outsider=await connect();await join(host,'short-seek-party','Ava');await join(guest,'short-seek-party','Ben');await join(outsider,'other-party-room','Chris');host.send('watchroom:movie-select',{roomId:'short-seek-party',movieId:'302'});await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 host.send('watchroom:movie-control',{roomId:'short-seek-party',action:'pause',clientTime:0,intent:'user'});await guest.wait('watchroom:movie-sync-state',data=>!data.sync.playing);
 host.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:5,clientTime:5,intent:'user'});const update=await guest.wait('watchroom:movie-sync-state',data=>data.sync.offset===5);assert.equal(update.sync.playing,false);assert(update.serverTime>0);
 guest.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:70,intent:'user'});await guest.wait('watchroom:message',data=>data.text.includes('Only the host'));
 outsider.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:100,intent:'user'});await join(outsider,'other-party-room','Chris');const state=await(await fetch(base+'/api/date-room/short-seek-party/state')).json();assert.equal(state.room.syncedMovie.sync.offset,5);
});
test('A transient discovery failure recovers for both viewers without a manual Retry',{timeout:5000},async()=>{
 let starts=0;
 inject(async()=>++starts===1
  ? {status:'error',code:'no_source'}
  : {status:'ok',playbackUrl:'/recovered.mp4',streamType:'mp4'},12000);
 const host=await connect(),guest=await connect(),roomId='automatic-source-recovery';
 await join(host,roomId,'Ava');
 await join(guest,roomId,'Ben');
 host.send('watchroom:movie-select',{roomId,movieId:'307'});
 const [hostResult,guestResult]=await Promise.all([
  host.wait('watchroom:movie-sync',data=>data.movie.status!=='loading'),
  guest.wait('watchroom:movie-sync',data=>data.movie.status!=='loading'),
 ]);
 assert.equal(starts,2);
 assert.equal(guestResult.movie.status,'ready');
 assert.equal(guestResult.movie.playbackUrl,'/recovered.mp4');
 assert.deepEqual(hostResult.movie,guestResult.movie);
});
test('A party waits for a busy source service to become available',{timeout:5000},async()=>{
 let release;
 const lookups=[];
 inject(({id})=>{
  lookups.push(id);
  if(id==='309')return new Promise(resolve=>release=resolve);
  return {status:'ok',playbackUrl:'/room-after-busy.mp4',streamType:'mp4'};
 },12000,{maxConcurrentResolvers:1});
 const host=await connect(),guest=await connect(),roomId='wait-for-source-party';
 await join(host,roomId,'Ava');
 await join(guest,roomId,'Ben');
 const busy=await (await fetch(base+'/api/proxy-video-wait/movie/309')).json();
 assert.equal(busy.status,'loading');
 host.send('watchroom:movie-select',{roomId,movieId:'310'});
 await guest.wait('watchroom:movie-sync',data=>data.movie.status==='loading');
 assert.deepEqual(lookups,['309']);
 release({status:'ok',playbackUrl:'/finished-solo.mp4',streamType:'mp4'});
 const result=await guest.wait('watchroom:movie-sync',data=>data.movie.status!=='loading',4000);
 assert.equal(result.movie.status,'ready');
 assert.equal(result.movie.playbackUrl,'/room-after-busy.mp4');
 assert.deepEqual(lookups,['309','310']);
});
test('A room source failure keeps its safe error code and host Retry starts a fresh shared lookup',{timeout:6500},async()=>{
 let starts=0;
 inject(async()=>++starts<=2
  ? {status:'error',code:'provider_blocked',message:'private-provider-error'}
  : {status:'ok',playbackUrl:'/retried.mp4',streamType:'mp4'},12000);
 const host=await connect(),guest=await connect(),roomId='retry-source-party';
 await join(host,roomId,'Ava');
 await join(guest,roomId,'Ben');
 host.send('watchroom:movie-select',{roomId,movieId:'303'});
 const failed=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='error');
 assert.equal(failed.movie.code,'provider_blocked');
 assert(!JSON.stringify(failed).includes('private-provider-error'));
 host.send('watchroom:movie-select',{roomId,movieId:'303',requestId:failed.movie.requestId,retry:true});
 const ready=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 assert.equal(starts,3);
 assert.equal(ready.movie.playbackUrl,'/retried.mp4');
});
test('Retrying a ready room shares its fresh source without restarting the playback clock',{timeout:5000},async()=>{
 let starts=0;
 inject(async()=>({status:'ok',playbackUrl:'/source-'+(++starts)+'.mp4',streamType:'mp4'}));
 const host=await connect(),guest=await connect(),roomId='retry-playing-source-party';
 await join(host,roomId,'Ava');
 await join(guest,roomId,'Ben');
 host.send('watchroom:movie-select',{roomId,movieId:'308',provider:'vidlink'});
 const first=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 assert.equal(first.movie.playbackUrl,'/source-1.mp4');
 host.send('watchroom:movie-control',{roomId,movieId:'308',requestId:first.movie.requestId,action:'pause',clientTime:42,intent:'user'});
 await guest.wait('watchroom:movie-sync-state',data=>data.sync.offset===42&&!data.sync.playing);
 host.send('watchroom:movie-select',{roomId,movieId:'308',requestId:first.movie.requestId,retry:true});
 const second=await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready'&&data.movie.requestId!==first.movie.requestId);
 assert.equal(second.movie.playbackUrl,'/source-2.mp4');
 assert.equal(second.movie.provider,'vidlink');
 assert.equal(second.movie.sync.offset,42);
 assert.equal(second.movie.sync.playing,false);
});
test('Room discovery times out and malformed host selections reach no providers',{timeout:5000},async()=>{
 let starts=0;inject(()=>{starts++;return new Promise(()=>{});},35);const host=await connect();await join(host,'finite-source-party','Ava');host.send('watchroom:movie-select',{roomId:'finite-source-party',movieId:'304junk'});await join(host,'finite-source-party','Ava');assert.equal(starts,0);
 host.send('watchroom:movie-select',{roomId:'finite-source-party',movieId:'304'});const failed=await host.wait('watchroom:movie-sync',data=>data.movie.status==='error');assert.equal(starts,1);assert.equal(failed.movie.movieId,'304');assert.equal(failed.movie.proxyVideo,'');
});

test('Invite-only socket joins reject missing rooms and preserve existing room details',{timeout:5000},async()=>{
 const host=await connect(),guest=await connect();
 const roomId='real-invite-room',missingId='expired-invite-room';
 host.send('watchroom:join',{roomId,name:'Ava’s Movie Night',user:'Ava',videoId:'real-video',mediaKind:'youtube'});
 await host.wait('watchroom:joined',data=>data.room.id===roomId);
 guest.send('watchroom:join',{roomId,existingOnly:true,name:'Different title',user:'Ben',videoId:'other-video',mediaKind:'embed'});
 const joined=await guest.wait('watchroom:joined',data=>data.room.id===roomId);
 assert.equal(joined.isHost,false);
 assert.equal(joined.room.host,'Ava');
 assert.equal(joined.room.name,'Ava’s Movie Night');
 assert.equal(joined.room.videoId,'real-video');
 assert.equal(joined.room.mediaKind,'youtube');
 await host.wait('watchroom:viewers',data=>data.roomId===roomId&&data.viewers===2);

 guest.send('watchroom:join',{roomId:missingId,existingOnly:true,user:'Ben'});
 assert.deepEqual(await guest.wait('watchroom:join-error'),{roomId:missingId,error:'room_not_found'});
 assert.equal((await fetch(base+'/api/date-room/'+missingId+'/state')).status,404);
 const roomState=await (await fetch(base+'/api/date-room/'+roomId+'/state')).json();
 assert.equal(roomState.room.viewers,2);
});

test('A fresh guest keeps a running party invite through site access and a metadata outage',{timeout:6500},async t=>{
 const pin='123456',previousPin=process.env.SWIFLY_ACCESS_PIN;
 process.env.SWIFLY_ACCESS_PIN=pin;
 let gated;
 try{gated=loadServer();}
 finally{
  if(previousPin===undefined)delete process.env.SWIFLY_ACCESS_PIN;
  else process.env.SWIFLY_ACCESS_PIN=previousPin;
 }
 const gatedClients=[],fixtureJobs=createSourceJobs({resolve:async()=>({status:'ok',playbackUrl:'/fixture.mp4',streamType:'mp4'}),deadlineMs:1000});
 gated.setSourceJobs(fixtureJobs);
 gated.setTmdb(async()=>({__error:true,message:'Metadata test outage'}));
 t.after(async()=>{
  fixtureJobs.destroy();
  for(const client of gatedClients)client.ws.close();
  await new Promise(resolve=>gated.io.close(resolve));
 });
 await new Promise(resolve=>gated.httpServer.listen(0,'127.0.0.1',resolve));
 const socketPort=gated.httpServer.address().port,origin='http://127.0.0.1:'+socketPort;
 const unlock=async next=>{
  const response=await fetch(origin+'/access',{method:'POST',redirect:'manual',body:new URLSearchParams({code:pin,next})});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),next);
  return response.headers.get('set-cookie').split(';')[0];
 };
 const hostCookie=await unlock('/social');
 const created=await fetch(origin+'/api/social/watchrooms/create',{
  method:'POST',headers:{cookie:hostCookie,'content-type':'application/json'},body:JSON.stringify({name:'Ava’s party',creator:'Ava',movieId:'305',type:'movie'}),
 });
 assert.equal(created.status,200);
 const {room}=await created.json();
 assert.equal(room.syncedMovie.movieId,'305');
 assert.equal(room.syncedMovie.status,'idle');
 const invite='/social?tab=watchrooms&roomId='+room.id;
 const inviteBeforePlayback=await fetch(origin+invite,{headers:{cookie:hostCookie},redirect:'manual'});
 assert.equal(inviteBeforePlayback.headers.get('location'),'/watch/movie/305?mode=movie&roomId='+room.id);
 const host=await connect({socketPort,cookie:hostCookie});gatedClients.push(host);
 await join(host,room.id,'Ava');
 host.send('watchroom:movie-select',{roomId:room.id,movieId:'305'});
 await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready');

 const locked=await fetch(origin+invite,{redirect:'manual'});
 assert.equal(locked.status,302);
 assert.equal(new URL(locked.headers.get('location'),origin).searchParams.get('next'),invite);
 await assert.rejects(connect({socketPort}),/Access code required/);
 const guestCookie=await unlock(invite),headers={cookie:guestCookie};
 const inviteResponse=await fetch(origin+invite,{headers});
 assert.equal(inviteResponse.status,200);
 assert.equal(new URL(inviteResponse.url).pathname,'/watch/movie/305');
 assert(/data-player-id="305"[^>]*data-player-managed="true"/.test(await inviteResponse.text()),'A current room invite must render the managed player');
 const stale=await fetch(origin+'/watch/movie/306?roomId='+room.id,{headers,redirect:'manual'});
 assert.equal(stale.status,302);
 assert.equal(stale.headers.get('location'),'/watch/movie/305?mode=movie&roomId='+room.id);
 for(const unrelated of ['/watch/movie/305?roomId=expired-room','/watch/movie/305']){
  const response=await fetch(origin+unrelated,{headers});
  assert(!/data-player-id=/.test(await response.text()),'Missing or unrelated rooms cannot substitute title metadata: '+unrelated);
 }

 const lookup=await fetch(origin+'/api/date-room/'+room.id+'/state',{headers});
 assert.equal((await lookup.json()).room.id,room.id);
 const guest=await connect({socketPort,cookie:guestCookie});gatedClients.push(guest);
 guest.send('watchroom:join',{roomId:room.id,existingOnly:true,user:'Ben'});
 const joined=await guest.wait('watchroom:joined',data=>data.room.id===room.id);
 assert.equal(joined.isHost,false);
 assert.equal(joined.room.syncedMovie.playbackUrl,'/fixture.mp4');
 await host.wait('watchroom:viewers',data=>data.roomId===room.id&&data.viewers===2);
});
