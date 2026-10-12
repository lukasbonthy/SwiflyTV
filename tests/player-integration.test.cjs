const test=require('node:test');
const assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const api=loadServer();let base,jobs;
const metadata=async endpoint=>{
 if(endpoint.endsWith('/videos'))return {results:[{site:'YouTube',type:'Trailer',key:'official01'}]};
 if(endpoint.startsWith('/genre/'))return {genres:[{id:28,name:'Action'}]};
 if(/^\/tv\/\d+$/.test(endpoint))return {id:101,name:'Severance',first_air_date:'2022-02-18',poster_path:'/series.jpg',backdrop_path:'/series-wide.jpg',seasons:[{season_number:1,episode_count:9},{season_number:2,episode_count:10}]};
 if(/^\/movie\/\d+$/.test(endpoint))return {id:Number(endpoint.split('/').at(-1)),title:'Arrival',release_date:'2016-11-11',poster_path:'/arrival.jpg',backdrop_path:'/arrival-wide.jpg'};
 return {results:[{id:101,title:'Arrival',release_date:'2016-11-11',poster_path:'/arrival.jpg',backdrop_path:'/arrival-wide.jpg',vote_average:7.9}]};
};
test.before(async()=>{api.setTmdb(metadata);await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{jobs?.destroy();await new Promise(resolve=>api.io.close(resolve));});
test.afterEach(cleanup);
const parse=html=>browser(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,''));
function inject(resolve,deadlineMs=1000){jobs=createSourceJobs({resolve,deadlineMs});api.setSourceJobs(jobs);return jobs;}
test('The normal watch route renders one native movie player with shared assets and inline party setup',async()=>{
 const response=await fetch(base+'/watch/movie/101?mode=movie'),env=parse(await response.text()),d=env.window.document;
 assert.equal(response.status,200);assert(d.querySelector('.dsHeader, .dsTopBar, .topbar'));
 assert.equal(d.querySelectorAll('.svPlayerPage video').length,1);
 assert.equal(d.querySelector('.svPlayerPage').dataset.playerId,'101');assert.equal(d.querySelector('h1').textContent.trim(),'Arrival');
 assert(d.querySelector('script[src="/assets/player/player.js?v=160"]'));assert(d.querySelector('script[src="/assets/player/watch-party.js?v=160"]'));
 assert(d.querySelector('link[href="/assets/player/player.css?v=160"]'));assert(d.querySelector('dialog.svWatchPartyDialog'));
 assert.equal(d.querySelector('.dsProxyVideoWaitingShell'),null);assert.equal(d.querySelector('.svPartyHub'),null);
 assert.equal(d.querySelector('[data-sv-player-back]').getAttribute('href'),'/movie/101');
});
test('A room invite enters managed movie playback and a create link waits for explicit submission',async()=>{
 for(const [query,managed]of[['roomId=room-one','true'],['party=create','false']]){
  const env=parse(await(await fetch(base+'/watch/movie/101?mode=movie&'+query)).text());assert.equal(env.window.document.querySelector('.svPlayerPage').dataset.playerManaged,managed);
 }
});
test('TV player preserves selected season and episode in links without claiming movie party support',async()=>{
 const env=parse(await(await fetch(base+'/watch/tv/101?mode=movie&s=2&e=8')).text()),d=env.window.document,app=d.querySelector('.svPlayerPage');
 assert.equal(app.dataset.playerSeason,'2');assert.equal(app.dataset.playerEpisode,'8');assert.equal(d.querySelector('[data-player-party-open]'),null);
 assert(d.querySelector('a[href="/watch/tv/101?mode=movie&s=2&e=9"]'));assert(d.querySelector('a[href="/watch/tv/101?mode=trailer&s=2&e=8"]'));
});
test('Trailer mode keeps an official trailer and never renders a movie loading controller surface',async()=>{
 const env=parse(await(await fetch(base+'/watch/movie/101?mode=trailer')).text()),d=env.window.document;
 assert.equal(d.querySelector('.svPlayerPage').dataset.playerMode,'trailer');assert(d.querySelector('iframe.svPlayerTrailer')?.src.includes('official01'));
 assert.equal(d.querySelector('video'),null);assert.equal(d.querySelector('[data-player-party-open]'),null);
});
test('Party navigation opens the same movie catalog with its existing hero, genres, and rows',async()=>{
 const redirect=await fetch(base+'/social',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/movies?party=1');
 const env=parse(await(await fetch(base+'/movies?party=1')).text()),d=env.window.document;
 assert.equal(d.querySelector('.dsBrowseTop h1').textContent.trim(),'Movies');assert(d.querySelector('.genreDropdown'));assert(d.querySelector('.dsHero'));
 assert(d.querySelector('[data-party-browse]'));assert(d.querySelector('.dsContent'));assert.equal(d.querySelector('.svPartyHub'),null);
 assert(d.querySelector('script[src="/assets/player/watch-party.js?v=160"]'));assert.equal(d.querySelector('script[src*="player/player.js"]'),null);
});
test('Old movie party setup links redirect to the regular movie player',async()=>{
 const response=await fetch(base+'/social?tab=watchrooms&movieId=101',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/watch/movie/101?mode=movie&party=create');
});
test('Explicit community and legacy empty rooms remain compatible',async()=>{
 const created=await(await fetch(base+'/api/social/watchrooms/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Legacy room',creator:'Guest'})})).json();
 for(const url of ['/social?tab=chat','/social?tab=watchrooms&roomId='+created.room.id]){const response=await fetch(base+url),env=parse(await response.text());assert.equal(response.status,200);assert(env.window.document.querySelector('.svPartyHub'));}
});
test('Source polling returns pending immediately while one provider job remains shared',async()=>{
 let complete,starts=0;inject(()=>{starts++;return new Promise(resolve=>complete=resolve);});
 const first=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(first.status,'loading');assert(first.deadlineAt>first.startedAt);assert.equal(starts,1);
 const again=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(again.jobId,first.jobId);assert.equal(starts,1);
 complete({status:'ok',playbackUrl:'/api/hls-proxy/source/master.m3u8',m3u8:'https://provider.example/raw.m3u8'});await tick();
 const ready=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(ready.status,'ok');assert.equal(ready.playbackUrl,'/api/hls-proxy/source/master.m3u8');
});
test('An expired provider job becomes terminal and explicit retry gets a new deadline',async()=>{
 let starts=0;inject(()=>{starts++;return new Promise(()=>{});},40);
 const loading=await(await fetch(base+'/api/proxy-video-wait/movie/102')).json();assert.equal(loading.status,'loading');await new Promise(resolve=>setTimeout(resolve,55));
 const expired=await(await fetch(base+'/api/proxy-video-wait/movie/102')).json();assert.equal(expired.status,'error');assert.equal(expired.code,'timeout');assert.equal(starts,1);
 const retried=await(await fetch(base+'/api/proxy-video-wait/movie/102?retry=1')).json();assert.equal(retried.status,'loading');assert.notEqual(retried.jobId,loading.jobId);assert(retried.deadlineAt>loading.deadlineAt);assert.equal(starts,2);
});
test('Invalid media IDs and types do not reach providers, and direct lookups are bounded',async()=>{
 let started=0;inject(()=>{started++;return new Promise(()=>{});},25);
 for(const url of ['/api/proxy-video-wait/invalid/101','/api/proxy-video-wait/movie/abc','/api/proxy-video-wait/tv/101?s=bad']){const response=await fetch(base+url),data=await response.json();assert.equal(data.status,'error');assert.equal(data.code,'invalid_request');}
 assert.equal(started,0);const data=await(await fetch(base+'/api/proxy-video/movie/103')).json();assert.equal(data.status,'error');assert.equal(data.code,'timeout');
});
