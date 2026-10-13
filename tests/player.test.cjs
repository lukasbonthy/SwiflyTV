const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.resolve(__dirname, '..');
const markupFile = path.join(root, 'ui/player.js');
const scriptFile = path.join(root, 'public/player/player.js');
const markup = options => fs.existsSync(markupFile) ? require(markupFile).playerMarkup(options) : '';
const base = {id:'42',type:'movie',title:'A quiet evening',year:'2026',poster:'https://image.tmdb.org/t/p/w342/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/scene.jpg',mode:'movie',managed:true};
const environments = new Set();
const flush = async () => {for (let i=0;i<12;i++) await Promise.resolve();};
const ranges = values => ({length:values.length,start:i=>values[i][0],end:i=>values[i][1]});
function setup(options={}, customize=()=>{}) {
  const dom=new JSDOM('<!doctype html><html><body class="svCleanShell">'+markup({...base,...options})+'</body></html>',{url:'https://swifly.test/watch/movie/42',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window,d=w.document,states=new WeakMap(),timers=new Map();let id=0,now=1800000000000;
  const state=v=>{if(!states.has(v))states.set(v,{paused:true,currentTime:0,duration:NaN,readyState:0,ended:false,volume:1,muted:false,playbackRate:1,buffered:ranges([]),seekable:ranges([]),textTracks:[],error:null});return states.get(v);};
  for(const name of ['paused','currentTime','duration','readyState','ended','volume','muted','playbackRate','buffered','seekable','textTracks','error'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;if(['volume','muted'].includes(name))this.dispatchEvent(new w.Event('volumechange'));}});
  w.HTMLMediaElement.prototype.load=function(){};
  w.HTMLMediaElement.prototype.play=function(){state(this).paused=false;state(this).ended=false;this.dispatchEvent(new w.Event('play'));this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};
  w.HTMLMediaElement.prototype.pause=function(){const playing=!state(this).paused;state(this).paused=true;if(playing)this.dispatchEvent(new w.Event('pause'));};
  w.HTMLMediaElement.prototype.canPlayType=()=>'';
  w.Date.now=()=>now;
  w.setTimeout=(fn,delay=0)=>{timers.set(++id,{at:now+Math.max(0,Number(delay)||0),fn});return id;};
  w.clearTimeout=id=>timers.delete(id);
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.fetch=async()=>({ok:true,json:async()=>({status:'error',message:'Unavailable'})});
  const app=d.querySelector('.svPlayerPage');
  if(app)Object.assign(app.dataset,{playerResolveTimeoutMs:'800',playerRequestTimeoutMs:'120',playerStallTimeoutMs:'200',playerLibraryTimeoutMs:'100',playerPollMinMs:'20',playerPollMaxMs:'80'});
  const env={dom,w,d,state,timers,app,video:()=>d.querySelector('[data-player-video]'),event:(name,v=env.video())=>v.dispatchEvent(new w.Event(name)),ready:(v=env.video())=>{Object.assign(state(v),{duration:120,readyState:3,seekable:ranges([[0,120]])});env.event('loadedmetadata',v);env.event('canplay',v);},async advance(ms){const end=now+ms;await flush();let guard=0;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert(++guard<1000,'Timer loop must remain bounded');timers.delete(next[0]);now=next[1].at;next[1].fn();await flush();}now=end;await flush();},close(){w.SwiflyPlayer?.destroy();dom.window.close();environments.delete(env);}};
  environments.add(env);customize(env);
  if(fs.existsSync(scriptFile))w.eval(fs.readFileSync(scriptFile,'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert(w.SwiflyPlayer,'The movie player controller must initialize');assert(Object.isFrozen(w.SwiflyPlayer),'The public API must be immutable');env.api=w.SwiflyPlayer;return env;
}
test.afterEach(()=>{for(const env of environments)env.close();});
function hlsMock(w) {
  class Hls {static Events={MANIFEST_PARSED:'manifest',ERROR:'error',LEVEL_SWITCHED:'level',SUBTITLE_TRACKS_UPDATED:'subtitles'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};static isSupported(){return true;}constructor(){this.listeners=new Map();this.levels=[{height:720,bitrate:1800000},{height:1080,bitrate:4000000}];this.subtitleTracks=[];Hls.instances.push(this);}on(n,fn){this.listeners.set(n,fn);}off(n){this.listeners.delete(n);}attachMedia(v){this.video=v;}loadSource(url){this.url=url;}emit(n,data={}){this.listeners.get(n)?.(n,data);}recoverMediaError(){this.recoveries=(this.recoveries||0)+1;}startLoad(){this.starts=(this.starts||0)+1;}destroy(){this.destroyed=true;this.listeners.clear();}}Hls.instances=[];w.Hls=Hls;return Hls;
}

test('Movie markup exposes one accessible player and escapes text, attributes and URLs',()=>{
  const html=markup({...base,id:'42\" onmouseover="bad',title:'<img src=x onerror="bad">',year:'<2026>',poster:'javascript:alert(1)',backdrop:'\" onerror="bad'}),d=new JSDOM(html).window.document;
  assert.equal(d.querySelectorAll('.svPlayerPage').length,1);assert.equal(d.querySelectorAll('video').length,1);assert.equal(d.querySelectorAll('[data-player-controls]').length,1);
  assert.equal(d.querySelector('h1').textContent,'<img src=x onerror="bad">');assert.equal(d.querySelector('[onmouseover],[onerror]'),null);assert.equal(d.querySelector('[src^="javascript:"]'),null);
  assert(d.querySelector('video[controls][playsinline]'),'Native controls must remain available before initialization');assert(d.querySelector('[data-player-party-open].dsSecondaryBtn'));assert(d.querySelector('[data-player-party-slot]'));
  for(const node of d.querySelectorAll('button,input,select,summary'))assert(node.textContent.trim()||node.getAttribute('aria-label')||node.labels?.length,'Every control needs an accessible name');
  assert(!/m3u8|proxy|library|vidstack/i.test(d.body.textContent));
});
test('TV mode links preserve the selected episode and trailer mode has only its official frame',()=>{
  const d=new JSDOM(markup({...base,type:'tv',season:3,episode:7,mode:'trailer',trailerUrl:'https://www.youtube.com/embed/official',episodePickerHtml:'<select aria-label="Episode"><option>Episode 7</option></select>'})).window.document;
  assert.equal(d.querySelectorAll('video').length,0);assert(d.querySelector('iframe'),'Trailer markup must expose its official iframe');assert.equal(d.querySelector('iframe').getAttribute('src'),'https://www.youtube.com/embed/official');assert(d.querySelector('[data-sv-player-back][href="/tv/42"]'));
  for(const a of d.querySelectorAll('[data-player-mode-link]')){const u=new URL(a.href,'https://swifly.test');assert.equal(u.searchParams.get('s'),'3');assert.equal(u.searchParams.get('e'),'7');assert.equal(u.searchParams.has('season'),false);assert.match(u.search,/^\?mode=(movie|trailer)&s=3&e=7/);}
  assert.equal(d.querySelector('[data-player-party-open]'),null);
});
test('Managed playback waits for room media without resolving a solo source',async()=>{
  let calls=0;const e=setup({},e=>e.w.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:'loading'})};});await e.advance(900);
  assert.equal(calls,0);assert.equal(e.api.getState().ready,false);assert.equal(e.app.dataset.playerState,'waiting');assert.match(e.d.querySelector('[data-player-status-title]').textContent,/host|party/i);
});
test('Native source preference keeps authenticated playback URLs ahead of raw URLs',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/api/media/authorized.mp4',m3u8:'https://raw.test/source.m3u8',movieId:'42'});
  assert.equal(e.video().getAttribute('src'),'/api/media/authorized.mp4');assert.equal(e.api.getState().source,'/api/media/authorized.mp4');assert.equal(e.api.getState().ready,false);
  e.event('loadedmetadata');assert.equal(e.api.getState().ready,false,'Metadata alone is not playable');e.ready();assert.equal(e.api.getState().ready,true);assert.equal(e.app.dataset.playerState,'ready');
});
test('Loading snapshots poll serially and become playable without reloading the page',async()=>{
  const urls=[],e=setup({managed:false,type:'tv',season:2,episode:4,provider:'choice'},e=>e.w.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>urls.length===1?{status:'loading',deadlineAt:e.w.Date.now()+600,retryAfterMs:30,jobId:'same'}:{status:'ok',playbackUrl:'/episode.webm'}};});
  await e.advance(50);assert.equal(urls.length,2);assert.match(urls[0],/\/api\/proxy-video-wait\/tv\/42/);const u=new URL(urls[0],'https://swifly.test');assert.equal(u.searchParams.get('season'),'2');assert.equal(u.searchParams.get('episode'),'4');assert.equal(u.searchParams.get('provider'),'choice');assert.equal(e.video().getAttribute('src'),'/episode.webm');assert.equal(e.api.getState().ready,false);
});
test('Default playback requests a bounded ready response within its HTTP deadline',async()=>{
 let requested;
 const e=setup({managed:false},e=>{
   e.app.dataset.playerResolveTimeoutMs='90000';e.app.dataset.playerRequestTimeoutMs='12000';
   e.w.fetch=async url=>{requested=new URL(url,'https://swifly.test');return {ok:true,json:async()=>({status:'ok',playbackUrl:'/ready.mp4'})};};
 });
 await e.advance(0);
 const wait=Number(requested.searchParams.get('wait'));
 assert(wait>0&&wait<=8000&&wait<12000,'Wait must deliver media promptly and leave HTTP timeout headroom');
 assert.equal(e.api.getState().source,'/ready.mp4');
});
test('A browser clock ahead of the server can poll a live source job without expiring it early',async()=>{
  let calls=0;const e=setup({managed:false},e=>e.w.fetch=async()=>{calls++;const serverTime=e.w.Date.now()-3600000;return {ok:true,json:async()=>calls===1?{status:'loading',serverTime,startedAt:serverTime,deadlineAt:serverTime+600,retryAfterMs:30}:{status:'ok',playbackUrl:'/clock-safe.mp4'}};});await e.advance(50);assert.equal(calls,2);assert.equal(e.api.getState().source,'/clock-safe.mp4');assert.equal(e.app.dataset.playerState,'loading');
});
test('A browser clock behind the server still respects the remaining source job deadline',async()=>{
  let deadline,calls=0;const e=setup({managed:false},e=>e.w.fetch=async()=>{calls++;const serverTime=e.w.Date.now()+3600000;deadline??=serverTime+60;return {ok:true,json:async()=>({status:'loading',serverTime,deadlineAt:deadline,retryAfterMs:20})};});await e.advance(80);assert.equal(e.app.dataset.playerState,'error');const count=calls;await e.advance(900);assert.equal(calls,count);
});
test('Resolver loading ends at the deadline and Retry starts one fresh lookup',async()=>{
  const urls=[],e=setup({managed:false},e=>e.w.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>({status:'loading',deadlineAt:e.w.Date.now()+5000,retryAfterMs:20})};});
  await e.advance(900);const count=urls.length;assert.equal(e.app.dataset.playerState,'error');assert.equal(e.d.querySelector('[data-player-retry]').hidden,false);assert.match(e.d.querySelector('[data-player-status-copy]').textContent,/retry|try again/i);
  await e.advance(900);assert.equal(urls.length,count,'Terminal errors must stop polling');e.d.querySelector('[data-player-retry]').click();await e.advance(50);const retried=urls.slice(count);assert(retried.length>1);assert.equal(new URL(retried[0],'https://swifly.test').searchParams.get('retry'),'1');assert.equal(new URL(retried[1],'https://swifly.test').searchParams.has('retry'),false);
});
test('A response whose JSON body hangs is aborted and presents a terminal error',async()=>{
  let signal;const e=setup({managed:false},e=>e.w.fetch=async(_url,options)=>{signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};});await e.advance(150);
  assert.equal(signal.aborted,true);assert.equal(e.app.dataset.playerState,'error');assert.match(e.d.querySelector('[data-player-status-copy]').textContent,/connection|respond|try again|retry/i);
});
test('Retry cancels the prior request and ignores its delayed source result',async()=>{
  let first,signal,calls=0;const e=setup({managed:false},e=>e.w.fetch=(_url,options)=>{calls++;if(calls===1){signal=options.signal;return new Promise(resolve=>first=resolve);}return Promise.resolve({ok:true,json:async()=>({status:'ok',playbackUrl:'/new.mp4'})});});
  await flush();e.api.resolve({retry:true});await flush();assert.equal(signal.aborted,true);first({ok:true,json:async()=>({status:'ok',playbackUrl:'/old.mp4'})});await flush();assert.equal(e.api.getState().source,'/new.mp4');assert.equal(calls,2);
});
test('Server disabled and network errors stop lookup and leave a useful Retry action',async()=>{
  let calls=0;const e=setup({managed:false},e=>e.w.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:'disabled',message:'m3u8 proxy is disabled'})};});await e.advance(900);
  assert.equal(calls,1);assert.equal(e.app.dataset.playerState,'error');assert(!/m3u8|proxy/i.test(e.d.querySelector('[data-player-status-copy]').textContent));assert.equal(e.d.querySelector('[data-player-retry]').hidden,false);
});
test('HLS uses the proxy URL, real rendition metadata and finite fatal recovery',async()=>{
  let Hls;const e=setup({},e=>Hls=hlsMock(e.w));await e.api.loadSource({status:'ok',hlsProxyUrl:'/protected/master.m3u8',m3u8:'https://raw.test/movie.m3u8'});const h=Hls.instances[0];assert.equal(h.url,'/protected/master.m3u8');h.emit(Hls.Events.MANIFEST_PARSED);assert.equal(e.api.getState().ready,false);
  const q=e.d.querySelector('[data-player-quality]');assert(q.querySelector('option[value="1"]').textContent.includes('1080'));q.value='1';q.dispatchEvent(new e.w.Event('change',{bubbles:true}));assert.equal(h.currentLevel,1);
  h.emit(Hls.Events.ERROR,{fatal:true,type:Hls.ErrorTypes.MEDIA_ERROR});assert.equal(h.recoveries,1);h.emit(Hls.Events.ERROR,{fatal:true,type:Hls.ErrorTypes.MEDIA_ERROR});assert.equal(e.app.dataset.playerState,'error');assert.equal(h.destroyed,true);
});
test('A blocked playback script ends with Retry and releases its script and timers',async()=>{
  const e=setup();const pending=e.api.loadSource({status:'ok',playbackUrl:'/movie.m3u8'});await flush();const loader=e.d.querySelector('script[data-player-library]');assert(loader,'Playback libraries should load only when required');await e.advance(110);await pending;
  assert.equal(e.app.dataset.playerState,'error');assert.equal(e.d.querySelector('script[data-player-library]'),null);assert.equal(e.timers.size,0);
});
test('DASH media remains supported and uses DASH rendition metadata',async()=>{
  let player;const e=setup({},e=>{const listeners=new Map();player={initialize(v,url,autoplay){this.video=v;this.url=url;this.autoplay=autoplay;},on(n,fn){listeners.set(n,fn);},off(n){listeners.delete(n);},emit(n){listeners.get(n)?.({});},getBitrateInfoListFor(){return [{qualityIndex:0,height:720,bitrate:2000000},{qualityIndex:1,height:1080,bitrate:5000000}];},getTracksFor(){return [];},updateSettings(v){this.settings=v;},setQualityFor(type,index){this.quality=index;},destroy(){this.destroyed=true;}};const MediaPlayer=()=>({create:()=>player});MediaPlayer.events={STREAM_INITIALIZED:'stream',ERROR:'error'};e.w.dashjs={MediaPlayer};});await e.api.loadSource({status:'ok',playbackUrl:'/movie.mpd'});
  assert.equal(player.url,'/movie.mpd');assert.equal(player.autoplay,false);player.emit('stream');assert.equal(e.api.getState().ready,false);const q=e.d.querySelector('[data-player-quality]');q.value='1';q.dispatchEvent(new e.w.Event('change',{bubbles:true}));assert.equal(player.quality,1);e.api.destroy();assert.equal(player.destroyed,true);
});
test('Native codec errors are terminal and offer an actionable browser suggestion',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mkv'});e.state(e.video()).error={code:4};e.event('error');assert.equal(e.app.dataset.playerState,'error');assert.match(e.d.querySelector('[data-player-status-copy]').textContent,/browser|format|support/i);assert.equal(e.api.getState().ready,false);
});
test('Transport emits only explicit user actions and remote actions never echo',async()=>{
  const e=setup(),actions=[];e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.d.querySelector('[data-player-play]').click();await flush();assert.equal(e.api.getState().paused,false);e.api.pause({remote:true});e.api.seek(40,{remote:true});await e.api.play({remote:true});assert.equal(actions.length,1);
  e.d.querySelector('[data-player-forward]').click();e.d.querySelector('[data-player-play]').click();assert.deepEqual(actions.map(x=>x.action),['play','set','pause']);assert.equal(actions[1].time,50);e.event('pause');assert.equal(actions.length,3,'Native/internal media events must not generate room commands');
});
test('Guests cannot change shared transport but volume and captions remain local',async()=>{
  const e=setup(),actions=[];e.app.addEventListener('swiflyplayer:action',ev=>actions.push(ev.detail));await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4',subtitles:[{url:'/captions.vtt',language:'en',label:'English'}]});e.ready();e.api.setRemoteMode({enabled:true,isHost:false});
  assert.equal(e.d.querySelector('[data-player-play]').disabled,true);assert.equal(e.d.querySelector('[data-player-seek]').disabled,true);assert.equal(e.d.querySelector('[data-player-speed]').disabled,true);assert.equal(await e.api.play(),false);e.api.seek(70);e.api.pause();assert.equal(e.api.getState().currentTime,0);assert.equal(actions.length,0);
  const vol=e.d.querySelector('[data-player-volume]');assert.equal(vol.disabled,false);vol.value='0.35';vol.dispatchEvent(new e.w.Event('input',{bubbles:true}));assert.equal(e.video().volume,.35);assert.equal(e.d.querySelector('[data-player-captions]').disabled,false);await e.api.play({remote:true});assert.equal(e.api.getState().paused,false);e.api.setRemoteMode({enabled:true,isHost:true});assert.equal(e.d.querySelector('[data-player-play]').disabled,false);
});
test('Keyboard shortcuts work in the active player and respect inputs, menus and dialogs',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();const key=(node,k)=>{const event=new e.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true});node.dispatchEvent(event);return event;};e.d.querySelector('[data-player-stage]').focus();assert.equal(key(e.d.activeElement,'l').defaultPrevented,true);assert.equal(e.api.getState().currentTime,10);
  const chat=e.d.createElement('input');e.app.append(chat);chat.focus();key(chat,'l');assert.equal(e.api.getState().currentTime,10);const details=e.d.querySelector('[data-player-settings]');details.open=true;key(e.d.querySelector('[data-player-speed]'),'l');assert.equal(e.api.getState().currentTime,10);key(e.d.querySelector('[data-player-speed]'),'Escape');assert.equal(details.open,false);
  const dialog=e.d.createElement('dialog');dialog.open=true;dialog.innerHTML='<button>Modal action</button>';e.d.body.append(dialog);e.d.querySelector('[data-player-stage]').focus();assert.equal(key(e.d.activeElement,'l').defaultPrevented,false);assert.equal(e.api.getState().currentTime,10);
});
test('Live seek controls use the current seekable window instead of a zero or infinite duration',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/live.mp4'});const s=e.state(e.video());Object.assign(s,{duration:Infinity,readyState:3,currentTime:160,seekable:ranges([[120,180]])});e.event('loadedmetadata');e.event('canplay');const seek=e.d.querySelector('[data-player-seek]');assert.equal(seek.min,'120');assert.equal(seek.max,'180');assert.equal(seek.disabled,false);e.api.seek(0);assert.equal(e.api.getState().currentTime,120);e.api.seek(999);assert.equal(e.api.getState().currentTime,180);assert.match(e.d.querySelector('[data-player-duration]').textContent,/live/i);
});
test('Repeated waiting events cannot renew a stall deadline without real media progress',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();e.event('waiting');await e.advance(140);e.event('waiting');e.event('progress');await e.advance(80);assert.equal(e.app.dataset.playerState,'error');assert.equal(e.api.getState().ready,false);
});
test('Real buffered progress renews a stall deadline and paused ready movies need no watchdog',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.advance(300);assert.equal(e.app.dataset.playerState,'ready');await e.api.play();e.event('waiting');await e.advance(130);e.state(e.video()).buffered=ranges([[0,20]]);e.event('progress');await e.advance(130);assert.equal(e.app.dataset.playerState,'buffering');await e.advance(80);assert.equal(e.app.dataset.playerState,'error');
});
test('Replacing a source detaches old video callbacks and deferred play completions',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/first.mp4'});e.ready();const old=e.video();let completed;old.play=()=>new Promise(resolve=>completed=resolve);const pending=e.api.play();await e.api.loadSource({status:'ok',playbackUrl:'/second.mp4'});completed();await pending;Object.assign(e.state(old),{readyState:3,duration:120});e.event('canplay',old);e.state(old).error={code:4};e.event('error',old);
  assert.equal(e.api.getState().source,'/second.mp4');assert.equal(e.api.getState().ready,false);assert.equal(e.app.dataset.playerState,'loading');
});
test('Ended media reports paused and offers replay without an empty buffering screen',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();Object.assign(e.state(e.video()),{ended:true,currentTime:120,paused:false});e.event('ended');assert.equal(e.api.getState().paused,true);assert.equal(e.app.dataset.playerState,'ended');assert.match(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),/replay|play/i);await e.api.play();assert.equal(e.api.getState().currentTime,0);
});
test('Managed failures request a room retry and never start a solo lookup',async()=>{
  let calls=0,retries=0;const e=setup({},e=>e.w.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:'ok',playbackUrl:'/wrong.mp4'})};});e.app.addEventListener('swiflyplayer:retry',()=>retries++);await e.api.loadSource({status:'error'});e.d.querySelector('[data-player-retry]').click();await e.advance(300);assert.equal(retries,1);assert.equal(calls,0);assert.equal(e.app.dataset.playerState,'error');
});
test('Known discovery failures show useful safe messages in both solo and party playback',async()=>{
  const e=setup();
  await e.api.loadSource({status:'error',code:'browser_unavailable',message:'SECRET provider path'});
  assert.match(e.d.querySelector('[data-player-status-copy]').textContent,/service|browser/i);
  assert.doesNotMatch(e.d.querySelector('[data-player-status-copy]').textContent,/SECRET/);
  assert.equal(e.app.dataset.playerFailureCode,'browser_unavailable');
  assert.match(e.d.querySelector('[data-player-status-label]').textContent,/BROWSER UNAVAILABLE/);
  const solo=setup({managed:false},env=>env.w.fetch=async()=>({ok:true,json:async()=>({status:'error',code:'provider_blocked',message:'SECRET'})}));
  await solo.advance(50);
  assert.match(solo.d.querySelector('[data-player-status-copy]').textContent,/source.*respond|source.*reject|provider|restricted/i);
  assert.doesNotMatch(solo.d.querySelector('[data-player-status-copy]').textContent,/SECRET/);
  assert.equal(solo.app.dataset.playerFailureCode,'provider_blocked');
  assert.match(solo.d.querySelector('[data-player-status-label]').textContent,/PROVIDER BLOCKED/);
});
test('Joining a party cancels solo resolution and guest Retry cannot request shared transport',async()=>{
  let signal,calls=0,retries=0;const e=setup({managed:false},e=>e.w.fetch=(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});});await flush();e.app.addEventListener('swiflyplayer:retry',()=>retries++);e.api.setRemoteMode({enabled:true,isHost:false});assert.equal(signal.aborted,true);await e.api.loadSource({status:'error'});assert.equal(e.d.querySelector('[data-player-retry]').disabled,true);e.api.resolve({retry:true});assert.equal(retries,0);assert.equal(calls,1);e.api.setRemoteMode({enabled:true,isHost:true});e.api.resolve({retry:true});assert.equal(retries,1);e.api.setRemoteMode({enabled:false,isHost:false});e.api.resolve();await flush();assert.equal(calls,2);
});
test('BFCache suspend stops requests and returns with one bounded fresh source lifecycle',async()=>{
  let signal,calls=0;const e=setup({managed:false},e=>e.w.fetch=(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});});await flush();const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);assert.equal(signal.aborted,true);assert.equal(e.timers.size,0);const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await flush();assert.equal(calls,2);await e.advance(130);assert.equal(e.app.dataset.playerState,'error');
});
test('Destroy clears loaders and pending requests and ignores future media events',async()=>{
  let signal;const e=setup({managed:false},e=>e.w.fetch=(_url,options)=>{signal=options.signal;return new Promise(()=>{});});await flush();e.api.destroy();assert.equal(signal.aborted,true);assert.equal(e.timers.size,0);e.event('canplay');await e.advance(1000);assert.equal(e.api.getState().ready,false);
});
test('A room preparing its next movie stops the previous film and cannot use stale source fields',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/previous.mp4'});e.ready();await e.api.play({remote:true});const previous=e.video();await e.api.loadSource({status:'loading',playbackUrl:'/previous.mp4',movieId:'99',jobId:'next'});assert.equal(previous.paused,true);assert.equal(e.api.getState().source,'');assert.equal(e.api.getState().ready,false);assert.equal(e.app.dataset.playerState,'loading');await e.api.loadSource({status:'error',playbackUrl:'/previous.mp4'});assert.equal(e.app.dataset.playerState,'error');assert.equal(e.api.getState().ready,false);
});
test('Cached ready media attaches again and restores its position after BFCache return',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/cached.mp4'});e.ready();e.api.seek(45,{remote:true});const old=e.video();const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await flush();assert.notEqual(e.video(),old);assert.equal(e.video().getAttribute('src'),'/cached.mp4');e.ready();assert.equal(e.api.getState().currentTime,45);assert.equal(e.api.getState().paused,true);
});
test('Autoplay blocking offers a local join action for guests without emitting shared commands',async()=>{
  const e=setup(),actions=[];await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.api.setRemoteMode({enabled:true,isHost:false});e.app.addEventListener('swiflyplayer:action',ev=>actions.push(ev.detail));e.video().play=()=>Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));await e.api.play({remote:true});const join=e.d.querySelector('[data-player-unlock]');assert(join&&!join.hidden,'A blocked guest needs a local playback gesture');e.video().play=e.w.HTMLMediaElement.prototype.play;join.click();await flush();assert.equal(e.api.getState().paused,false);assert.equal(join.hidden,true);assert.equal(actions.length,0);
});
test('A blocked host play preserves its user intent when the local gesture succeeds',async()=>{
  const e=setup(),actions=[];await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.api.setRemoteMode({enabled:true,isHost:true});e.app.addEventListener('swiflyplayer:action',ev=>actions.push(ev.detail));e.video().play=()=>Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));await e.api.play();e.video().play=e.w.HTMLMediaElement.prototype.play;e.d.querySelector('[data-player-unlock]').click();await flush();assert.equal(e.api.getState().paused,false);assert.deepEqual(actions.map(item=>item.action),['play']);
});
test('A source replacing cached playback cannot inherit a stale resume play completion',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/cached.mp4'});e.ready();await e.api.play({remote:true});const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await e.api.loadSource({status:'ok',playbackUrl:'/new-paused.mp4'});e.ready();await flush();assert.equal(e.api.getState().source,'/new-paused.mp4');assert.equal(e.api.getState().paused,true);
});
test('Remote pause cannot remove the watchdog while a new movie is still becoming playable',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/silent.mp4'});e.api.pause({remote:true});await e.advance(250);assert.equal(e.app.dataset.playerState,'error');assert.equal(e.api.getState().ready,false);
});
test('Repeated readiness events cannot bypass the watchdog without advancing playback',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();e.event('waiting');await e.advance(130);e.event('canplay');await e.advance(130);assert.equal(e.app.dataset.playerState,'error');
});
test('Remote pause supersedes a pending local play promise without emitting a late room command',async()=>{
  const e=setup(),actions=[];await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.app.addEventListener('swiflyplayer:action',ev=>actions.push(ev.detail));let done;e.video().play=()=>new Promise(resolve=>done=resolve);const pending=e.api.play();e.api.pause({remote:true});done();await pending;assert.equal(actions.length,0);assert.equal(e.api.getState().paused,true);
});
test('Editable player content keeps letter and space keys available for text entry',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();const editor=e.d.createElement('div');editor.setAttribute('contenteditable','');editor.textContent='A note';e.d.querySelector('[data-player-stage]').append(editor);const event=new e.w.KeyboardEvent('keydown',{key:'l',bubbles:true,cancelable:true});editor.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(e.api.getState().currentTime,0);
});
test('BFCache return keeps a terminal source error terminal until the user retries',async()=>{
  let calls=0;const e=setup({managed:false},e=>e.w.fetch=async()=>{calls++;return {ok:true,json:async()=>({status:'error'})};});await flush();assert.equal(e.app.dataset.playerState,'error');const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await e.advance(900);assert.equal(calls,1);assert.equal(e.app.dataset.playerState,'error');
});
test('Caption selection uses the loaded native tracks and settings Escape restores focus',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});const tracks=[{label:'English',language:'en',mode:'disabled'},{label:'French',language:'fr',mode:'disabled'}];e.state(e.video()).textTracks=tracks;e.ready();const captions=e.d.querySelector('[data-player-captions]');assert.equal(captions.disabled,false);captions.value='1';captions.dispatchEvent(new e.w.Event('change',{bubbles:true}));assert.equal(tracks[0].mode,'disabled');assert.equal(tracks[1].mode,'showing');const menu=e.d.querySelector('[data-player-settings]');menu.open=true;captions.focus();captions.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(menu.open,false);assert.equal(e.d.activeElement,menu.querySelector('summary'));
});
test('Player styling integrates the room grid and makes controls readable over dark artwork',()=>{
  const file=path.join(root,'public/player/player.css');assert(fs.existsSync(file),'The player needs its own cohesive stylesheet');const css=fs.readFileSync(file,'utf8');const dom=new JSDOM('<body class="svCleanShell"><style>'+css+'</style>'+markup(base)+'</body>'),w=dom.window,d=w.document;const app=d.querySelector('.svPlayerPage');assert.equal(w.getComputedStyle(d.querySelector('[data-player-stage]')).aspectRatio,'16 / 9');assert.notEqual(w.getComputedStyle(d.querySelector('[data-player-controls]')).backgroundColor,'rgba(0, 0, 0, 0)');app.dataset.partyActive='true';assert.match(w.getComputedStyle(d.querySelector('.svPlayerLayout')).gridTemplateColumns,/320px/);assert.match(css,/focus-visible[^}]*outline[^}]*!important/s);assert.match(css,/prefers-reduced-motion/);dom.window.close();
});
test('Player support-hidden controls stay hidden despite the glass control display rule',()=>{
  const css=fs.readFileSync(path.join(root,'public/player/player.css'),'utf8');const dom=new JSDOM('<body class="svCleanShell"><style>'+css+'</style>'+markup(base)+'</body>'),w=dom.window,d=w.document;
  for(const name of ['pip','fullscreen']){const node=d.querySelector('[data-player-'+name+']');assert.equal(node.hidden,true);assert.equal(w.getComputedStyle(node).display,'none','Unavailable '+name+' must not render');}dom.window.close();
});
test('Supported mobile controls fit a 320px screen and picture in picture stays hidden',()=>{
  const css=fs.readFileSync(path.join(root,'public/player/player.css'),'utf8');const dom=new JSDOM('<body class="svCleanShell"><style>'+css+'</style>'+markup(base)+'</body>'),w=dom.window,d=w.document,style=d.querySelector('style'),sheet=style.sheet;
  // jsdom has no viewport layout: evaluate actual width media rules through CSSOM.
  const active=[];for(const rule of sheet.cssRules){if(!rule.media){active.push(rule.cssText);continue;}const query=rule.conditionText;const bounds=[...query.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)];if(bounds.length&&bounds.every(([,kind,size])=>kind==='max'?320<=Number(size):320>=Number(size)))for(const child of rule.cssRules)active.push(child.cssText);}style.textContent=active.join('\n');
  // jsdom does not model selector specificity consistently; rank the matching
  // display declarations by importance, specificity and actual stylesheet order.
  const display=node=>{let order=0,winner;for(const rule of style.sheet.cssRules){order++;if(!rule.style?.getPropertyValue('display')||!rule.selectorText)continue;for(const selector of rule.selectorText.split(',')){let matches=false;try{matches=node.matches(selector);}catch{}if(!matches)continue;const attributes=selector.match(/\[[^\]]+\]/g)||[],withoutAttributes=selector.replace(/\[[^\]]+\]/g,''),ids=withoutAttributes.match(/#[\w-]+/g)||[],classes=withoutAttributes.match(/\.[\w-]+|:(?!:)[\w-]+/g)||[],types=withoutAttributes.replace(/#[\w-]+|\.[\w-]+|::?[\w-]+(?:\([^)]*\))?/g,'').match(/\b[a-zA-Z][\w-]*\b/g)||[],rank=[rule.style.getPropertyPriority('display')==='important'?1:0,ids.length,classes.length+attributes.length,types.length,order];if(!winner||rank.some((value,index)=>value!==winner.rank[index]&&rank.slice(0,index).every((prior,k)=>prior===winner.rank[k])&&value>winner.rank[index]))winner={rank,value:rule.style.getPropertyValue('display')};}}return winner?.value||w.getComputedStyle(node).display;};
  d.querySelector('[data-player-controls]').hidden=false;d.querySelector('[data-player-pip]').hidden=false;d.querySelector('[data-player-fullscreen]').hidden=false;assert.equal(display(d.querySelector('[data-player-pip]')),'none','Mobile PiP must not compete for toolbar space');
  const px=(node,property)=>parseFloat(w.getComputedStyle(node)[property])||0,page=d.querySelector('.svPlayerPage'),stage=d.querySelector('[data-player-stage]'),dock=d.querySelector('[data-player-controls]'),row=d.querySelector('.svPlayerDockRow');
  const available=320-px(page,'paddingLeft')-px(page,'paddingRight')-px(stage,'borderLeftWidth')-px(stage,'borderRightWidth')-px(dock,'left')-px(dock,'right')-px(dock,'borderLeftWidth')-px(dock,'borderRightWidth')-px(dock,'paddingLeft')-px(dock,'paddingRight');
  const buttons=[...d.querySelectorAll('.svPlayerTransport > button,.svPlayerTools > button,.svPlayerTools > details > summary')].filter(node=>display(node)!=='none'),needed=buttons.reduce((sum,node)=>sum+px(node,'width'),0)+px(row,'gap');assert(needed<=available,'Visible controls need '+needed+'px but only '+available+'px is available');dom.window.close();
});
