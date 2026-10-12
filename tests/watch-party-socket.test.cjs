const test=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {loadServer}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const api=loadServer();let base,port,jobs;const clients=[];
function connect(){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/socket.io/?EIO=4&transport=websocket'),queue=[],waiters=[];
 const client={ws,send(name,data){ws.send('42'+JSON.stringify([name,data]));},wait(name,predicate=()=>true){return new Promise((yes,no)=>{const index=queue.findIndex(event=>event.name===name&&predicate(event.data));if(index>=0)return yes(queue.splice(index,1)[0].data);const pending={name,predicate,yes,no};pending.timer=setTimeout(()=>{const at=waiters.indexOf(pending);if(at>=0)waiters.splice(at,1);no(Error('Missing '+name));},1500);waiters.push(pending);});}};
 ws.on('error',reject);ws.on('message',raw=>{const value=raw.toString();if(value.startsWith('0')){ws.send('40');return;}if(value.startsWith('40')){clients.push(client);resolve(client);return;}if(value==='2'){ws.send('3');return;}if(!value.startsWith('42'))return;const [name,data]=JSON.parse(value.slice(2)),index=waiters.findIndex(pending=>pending.name===name&&pending.predicate(data));if(index<0)queue.push({name,data});else{const pending=waiters.splice(index,1)[0];clearTimeout(pending.timer);pending.yes(data);}});
});}
function inject(resolve,deadlineMs=1000){jobs=createSourceJobs({resolve,deadlineMs});api.setSourceJobs(jobs);}
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
test('Intentional short host seeks work while guests and other rooms cannot change transport',{timeout:5000},async()=>{
 inject(async()=>({status:'ok',playbackUrl:'https://media.example/movie.mp4'}));const host=await connect(),guest=await connect(),outsider=await connect();await join(host,'short-seek-party','Ava');await join(guest,'short-seek-party','Ben');await join(outsider,'other-party-room','Chris');host.send('watchroom:movie-select',{roomId:'short-seek-party',movieId:'302'});await guest.wait('watchroom:movie-sync',data=>data.movie.status==='ready');
 host.send('watchroom:movie-control',{roomId:'short-seek-party',action:'pause',clientTime:0,intent:'user'});await guest.wait('watchroom:movie-sync-state',data=>!data.sync.playing);
 host.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:5,clientTime:5,intent:'user'});const update=await guest.wait('watchroom:movie-sync-state',data=>data.sync.offset===5);assert.equal(update.sync.playing,false);assert(update.serverTime>0);
 guest.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:70,intent:'user'});await guest.wait('watchroom:message',data=>data.text.includes('Only the host'));
 outsider.send('watchroom:movie-control',{roomId:'short-seek-party',action:'set',time:100,intent:'user'});await join(outsider,'other-party-room','Chris');const state=await(await fetch(base+'/api/date-room/short-seek-party/state')).json();assert.equal(state.room.syncedMovie.sync.offset,5);
});
test('A room source failure ends and host Retry starts a fresh shared lookup',{timeout:5000},async()=>{
 let starts=0;inject(async()=>++starts===1?{status:'error',message:'private-provider-error'}:{status:'ok',playbackUrl:'https://media.example/retried.mp4',streamType:'mp4'});const host=await connect();await join(host,'retry-source-party','Ava');host.send('watchroom:movie-select',{roomId:'retry-source-party',movieId:'303'});const failed=await host.wait('watchroom:movie-sync',data=>data.movie.status==='error');assert(!JSON.stringify(failed).includes('private-provider-error'));
 host.send('watchroom:movie-select',{roomId:'retry-source-party',movieId:'303',retry:true});const ready=await host.wait('watchroom:movie-sync',data=>data.movie.status==='ready');assert.equal(starts,2);assert.equal(ready.movie.playbackUrl,'https://media.example/retried.mp4');
});
test('Room discovery times out and malformed host selections reach no providers',{timeout:5000},async()=>{
 let starts=0;inject(()=>{starts++;return new Promise(()=>{});},35);const host=await connect();await join(host,'finite-source-party','Ava');host.send('watchroom:movie-select',{roomId:'finite-source-party',movieId:'304junk'});await join(host,'finite-source-party','Ava');assert.equal(starts,0);
 host.send('watchroom:movie-select',{roomId:'finite-source-party',movieId:'304'});const failed=await host.wait('watchroom:movie-sync',data=>data.movie.status==='error');assert.equal(starts,1);assert.equal(failed.movie.movieId,'304');assert.equal(failed.movie.proxyVideo,'');
});
