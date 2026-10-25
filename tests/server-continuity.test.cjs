'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup,source}=require('./ui-helpers.cjs');
const {playerMarkup}=require('../ui/player');
afterEach(cleanup);
const settled=async()=>{await tick();await tick();};
function setup({stored={},profile='main',owner='account-a',remember=true,managed=false,provider='',episode=1,type='tv',respond,sourceInfo={server:'vidlink'},requestTimeout=100}={}){
 const b=browser(playerMarkup({id:'42',type,season:1,episode,episodeCount:10,mode:'movie',managed,provider,title:'Continuity fixture'}),{path:'/watch/'+type+'/42?s=1&e='+episode}),w=b.window,d=w.document,app=d.querySelector('[data-player-root]'),states=new WeakMap(),requests=[];
 for(const [key,value]of Object.entries(stored))w.localStorage.setItem(key,value);
 const state=node=>{if(!states.has(node))states.set(node,{paused:true,currentTime:0,duration:NaN,readyState:0,ended:false,seeking:false,volume:1,muted:false,playbackRate:1,buffered:{length:0},seekable:{length:0},textTracks:[],audioTracks:[]});return states.get(node);};
 for(const name of ['paused','currentTime','duration','readyState','ended','seeking','volume','muted','playbackRate','buffered','seekable','textTracks','audioTracks'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;}});
 w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.canPlayType=()=>'';w.HTMLMediaElement.prototype.pause=function(){state(this).paused=true;};w.HTMLMediaElement.prototype.play=function(){state(this).paused=false;this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};
 let selectedProfile=profile,selectedOwner=owner,preference=remember;
 w.SwiflyLibrary={active:true,profileId:()=>selectedProfile,ownerId:()=>selectedOwner,preferences:()=>({rememberLastServer:preference})};
 const payload=(extra={})=>({status:'ok',movieId:'42',type,season:1,episode,playbackUrl:'/episode-'+episode+'.mp4',...sourceInfo,...extra});
 w.fetch=async(value,options)=>{const url=new URL(value,w.location.href);requests.push({url,options});const data=respond?await respond(url,options,payload):payload();return {ok:true,json:async()=>data};};
 app.dataset.playerRequestTimeoutMs=String(requestTimeout);app.dataset.playerResolveTimeoutMs='1000';w.eval(source('player/player.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {...b,w,d,app,requests,api:w.SwiflyPlayer,payload,video:()=>d.querySelector('[data-player-video]'),ready(){const video=d.querySelector('[data-player-video]');Object.assign(state(video),{duration:1200,readyState:4,seekable:{length:1,start:()=>0,end:()=>1200}});video.dispatchEvent(new w.Event('canplay'));},snapshot(){return Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const key=w.localStorage.key(i);return [key,w.localStorage.getItem(key)];}));},setPreference(value){preference=value;w.dispatchEvent(new w.CustomEvent('swifly:library-change',{detail:{action:'preferences'}}));},setProfile(value){selectedProfile=value;},setOwner(value){selectedOwner=value;}};
}
const continuityValues=fixture=>Object.entries(fixture.snapshot()).filter(([key])=>key.startsWith('swiflytv.player.lastServer.')).map(([,value])=>value);
async function prime(sourceInfo={server:'vidlink'}){const b=setup({sourceInfo});await settled();assert.deepEqual(continuityValues(b),[],'resolving alone must never save a server');b.ready();return b;}

test('only native readiness remembers the real server, including normalized Nuvio source identities',async()=>{
 for(const sourceInfo of [{server:'vidlink'},{providerKind:'api_nuvio-videasy_hls_proxy'},{apiProvider:'nuvio-vidrock'},{server:'default',providerKind:'api_nuvio-vidfast_direct_hls'}]){
  const first=await prime(sourceInfo);assert.equal(continuityValues(first).length,1);
  const next=setup({stored:first.snapshot(),episode:2});await settled();assert.equal(next.requests[0].url.pathname,'/api/player/server/tv/42');assert(['vidlink','videasy','vidrock','vidfast'].includes(next.requests[0].url.searchParams.get('provider')));assert.equal(next.requests[0].url.searchParams.get('episode'),'2');first.finish();next.finish();
 }
});
test('an unavailable preferred server falls back once without adding its provider to default discovery',async()=>{
 const first=await prime(),next=setup({stored:first.snapshot(),episode:2,respond:async(url,_options,payload)=>url.pathname.startsWith('/api/player/server/')?{status:'unavailable'}:payload({server:'vidfast',playbackUrl:'/default.mp4'})});await settled();
 assert.equal(next.requests.length,2);assert.equal(next.requests[0].url.pathname,'/api/player/server/tv/42');assert.equal(next.requests[1].url.pathname,'/api/proxy-video-wait/tv/42');assert.equal(next.requests[1].url.searchParams.has('provider'),false);assert.equal(next.api.getState().source,'/default.mp4');
 await next.api.retry();await settled();assert.equal(next.requests.filter(r=>r.url.pathname.startsWith('/api/player/server/')).length,1,'retrying the same entry does not repeat a failed preferred-server probe');next.ready();assert.deepEqual(continuityValues(next),['vidfast']);
});
test('disabling remember-server clears device state and neither resolves nor saves with the previous choice',async()=>{
 const first=await prime();assert.deepEqual(continuityValues(first),['vidlink']);first.setPreference(false);assert.deepEqual(continuityValues(first),[]);
 const next=setup({stored:(await prime()).snapshot(),remember:false,episode:2});await settled();assert.equal(next.requests[0].url.pathname,'/api/proxy-video-wait/tv/42');next.ready();assert.deepEqual(continuityValues(next),[]);
});
test('stored choices remain account/profile-local and explicit, movie and party playback bypass them',async()=>{
 const first=await prime(),stored=first.snapshot();
 for(const options of [{profile:'kids'},{owner:'account-b'},{provider:'cineby'},{type:'movie'},{managed:true}]){
  const next=setup({stored,episode:2,...options});await settled();assert(next.requests.every(r=>!r.url.pathname.startsWith('/api/player/server/')));if(options.managed){await next.api.loadSource(next.payload({server:'vidrock'}));next.ready();assert.deepEqual(continuityValues(next),['vidlink'],'managed media cannot replace a solo preference');}next.finish();
 }
});
test('unknown or credential-like source identities never become remembered server requests',async()=>{
 for(const sourceInfo of [{server:'https://user:secret@evil.test/'},{providerKind:'api_other-service_direct_hls'},{apiProvider:'__proto__'}]){const first=await prime(sourceInfo);assert.deepEqual(continuityValues(first),[]);const next=setup({stored:first.snapshot(),episode:2});await settled();assert.equal(next.requests[0].url.pathname,'/api/proxy-video-wait/tv/42');first.finish();next.finish();}
});
test('late preferred results cannot cross a profile change or a remote party transition',async()=>{
 const stored=(await prime()).snapshot();let release;
 const next=setup({stored,episode:2,respond:async(url,_options,payload)=>{if(url.pathname.startsWith('/api/player/server/'))return new Promise(resolve=>release=()=>resolve(payload({server:'vidrock',playbackUrl:'/preferred.mp4'})));return payload({playbackUrl:'/default.mp4'});}});await settled();assert(release);next.setProfile('kids');release();await settled();assert.equal(next.api.getState().source,'/default.mp4');next.ready();assert.deepEqual(continuityValues(next),['vidlink']);
 let releaseRemote;const remote=setup({stored,episode:3,respond:async(_url,_options,payload)=>new Promise(resolve=>releaseRemote=()=>resolve(payload({playbackUrl:'/late.mp4'})))});await settled();assert(releaseRemote);remote.api.setRemoteMode({enabled:true,isHost:false});releaseRemote();await settled();assert.equal(remote.api.getState().source,'');assert.equal(remote.api.getState().status,'waiting');assert.deepEqual(continuityValues(remote),['vidlink']);
});
test('preferred requests have a deadline and mismatched episode replies return to default discovery',async()=>{
 const stored=(await prime()).snapshot();let signal;
 const timed=setup({stored,episode:2,requestTimeout:25,respond:async(url,options,payload)=>{if(url.pathname.startsWith('/api/player/server/')){signal=options.signal;return new Promise(()=>{});}return payload({playbackUrl:'/default.mp4'});}});
 const until=Date.now()+500;while(timed.api.getState().source!=='/default.mp4'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(timed.api.getState().source,'/default.mp4');assert(signal.aborted);
 const mismatch=setup({stored,episode:2,respond:async(url,_options,payload)=>payload(url.pathname.startsWith('/api/player/server/')?{episode:99,playbackUrl:'/wrong-episode.mp4'}:{playbackUrl:'/default.mp4'})});await settled();assert.equal(mismatch.api.getState().source,'/default.mp4');
});
test('selecting a provider keeps the previous remembered server until the replacement is actually ready',async()=>{
 const b=setup({respond:async(url,_options,payload)=>url.pathname==='/api/nuvio/providers'?{providers:[{id:'vidrock',name:'VidRock',installed:true,selected:true}]}:payload(url.pathname.startsWith('/api/player/server/')?{server:'vidrock',playbackUrl:'/alternate.mp4'}:{server:'vidlink'})});await settled();b.ready();assert.deepEqual(continuityValues(b),['vidlink']);
 const menu=b.d.querySelector('[data-player-servers]');menu.open=true;menu.dispatchEvent(new b.w.Event('toggle'));await settled();const select=b.d.querySelector('[data-player-server-provider]');assert.equal(select.disabled,false);select.value='vidrock';select.dispatchEvent(new b.w.Event('change'));b.d.querySelector('[data-player-server-try]').click();await settled();assert.equal(b.api.getState().source,'/alternate.mp4');assert.deepEqual(continuityValues(b),['vidlink']);b.ready();assert.deepEqual(continuityValues(b),['vidrock']);
});
