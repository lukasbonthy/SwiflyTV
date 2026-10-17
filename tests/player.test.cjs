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
  const state=v=>{if(!states.has(v))states.set(v,{paused:true,currentTime:0,duration:NaN,readyState:0,ended:false,seeking:false,volume:1,muted:false,playbackRate:1,buffered:ranges([]),seekable:ranges([]),textTracks:[],audioTracks:[],error:null});return states.get(v);};
  for(const name of ['paused','currentTime','duration','readyState','ended','seeking','volume','muted','playbackRate','buffered','seekable','textTracks','audioTracks','error'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;if(['volume','muted'].includes(name))this.dispatchEvent(new w.Event('volumechange'));}});
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
  class Hls {static Events={MANIFEST_PARSED:'manifest',ERROR:'error',LEVEL_SWITCHED:'level',SUBTITLE_TRACKS_UPDATED:'subtitles',SUBTITLE_TRACK_SWITCH:'subtitle-switch',AUDIO_TRACKS_UPDATED:'audio-tracks',AUDIO_TRACK_SWITCHED:'audio-switch'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};static isSupported(){return true;}constructor(){this.listeners=new Map();this.levels=[{height:720,bitrate:1800000},{height:1080,bitrate:4000000}];this.subtitleTracks=[];this.audioTracks=[];this.audioTrack=0;Hls.instances.push(this);}on(n,fn){this.listeners.set(n,fn);}off(n){this.listeners.delete(n);}attachMedia(v){this.video=v;}loadSource(url){this.url=url;}emit(n,data={}){this.listeners.get(n)?.(n,data);}recoverMediaError(){this.recoveries=(this.recoveries||0)+1;}startLoad(){this.starts=(this.starts||0)+1;}destroy(){this.destroyed=true;this.listeners.clear();}}Hls.instances=[];w.Hls=Hls;return Hls;
}

function observableTracks(w, tracks=[]) {
  const list=new w.EventTarget();Object.assign(list,tracks);list.length=tracks.length;list[Symbol.iterator]=function*(){for(let i=0;i<this.length;i++)yield this[i];};
  list.add=track=>{list[list.length++]=track;list.dispatchEvent(new w.Event('addtrack'));};return list;
}

test('The theater follows real video dimensions and ignores detached source events',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/wide.mp4'});
  const original=e.video();let width=1920,height=800;
  Object.defineProperties(original,{videoWidth:{get:()=>width},videoHeight:{get:()=>height}});
  e.event('loadedmetadata');
  assert.equal(Number(e.app.style.getPropertyValue('--player-aspect')),2.4);
  width=1440;height=1080;e.event('resize');
  assert(Math.abs(Number(e.app.style.getPropertyValue('--player-aspect'))-4/3)<.00001);
  await e.api.loadSource({status:'ok',playbackUrl:'/next.mp4'});
  width=800;height=1920;e.event('resize',original);
  assert.notEqual(Number(e.app.style.getPropertyValue('--player-aspect')),width/height,'discarded video elements cannot resize a new source');
});

test('Native audio prefers a known English track and keeps a chosen language across source changes',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/multilingual.mp4'});
  const tracks=observableTracks(e.w,[{language:'fr',label:'Français',enabled:true},{language:'en',label:'English',enabled:false}]);e.state(e.video()).audioTracks=tracks;e.ready();
  const audio=e.d.querySelector('[data-player-audio]');assert(audio,'Playback settings must expose audio language');assert.equal(audio.disabled,false);assert.equal(tracks[1].enabled,true);assert.equal(tracks[0].enabled,false);assert.equal(audio.selectedOptions[0].textContent,'English');
  audio.value='0';audio.dispatchEvent(new e.w.Event('change'));assert.equal(tracks[0].enabled,true);assert.equal(tracks[1].enabled,false);
  await e.api.loadSource({status:'ok',playbackUrl:'/next.mp4'});const next=[{language:'en',label:'English',enabled:true},{language:'fr',label:'Français',enabled:false}];e.state(e.video()).audioTracks=next;e.ready();assert.equal(next[1].enabled,true);assert.equal(audio.value,'1');
});
test('Late native audio tracks are selectable and unknown languages are never labeled English',async()=>{
  let tracks;const e=setup({},e=>{const load=e.w.HTMLMediaElement.prototype.load;e.w.HTMLMediaElement.prototype.load=function(){load.call(this);e.state(this).audioTracks=tracks=observableTracks(e.w);};});
  await e.api.loadSource({status:'ok',playbackUrl:'/late.mp4'});e.ready();const audio=e.d.querySelector('[data-player-audio]');assert(audio);assert.equal(audio.disabled,true);assert.doesNotMatch(audio.textContent,/English/i);
  tracks.add({language:'',label:'',enabled:true});assert.doesNotMatch(audio.textContent,/English/i);tracks.add({language:'en-US',label:'English',enabled:false});assert.equal(audio.disabled,false);assert.equal(audio.value,'1');assert.equal(tracks[1].enabled,true);
  tracks[1].enabled=false;tracks[0].enabled=true;tracks.dispatchEvent(new e.w.Event('change'));assert.equal(audio.value,'0','The selection follows native track changes');
});
test('Stored audio preferences preserve the selected regional language when it is available',async()=>{
  const e=setup({},e=>e.w.localStorage.setItem('swifly.player.audioLanguage','en-gb'));await e.api.loadSource({status:'ok',playbackUrl:'/regional.mp4'});const tracks=[{language:'en-US',label:'English (US)',enabled:true},{language:'en-GB',label:'English (UK)',enabled:false}];e.state(e.video()).audioTracks=tracks;e.ready();assert.equal(tracks[1].enabled,true);assert.equal(e.d.querySelector('[data-player-audio]').value,'1');
});
test('HLS audio uses available track metadata and applies local selection without changing transport',async()=>{
  let Hls;const e=setup({},e=>Hls=hlsMock(e.w));await e.api.loadSource({status:'ok',playbackUrl:'/multi.m3u8'});const h=Hls.instances[0];h.audioTracks=[{lang:'fr',name:'Français'},{lang:'eng',name:'English'}];h.emit(Hls.Events.AUDIO_TRACKS_UPDATED);
  const audio=e.d.querySelector('[data-player-audio]');assert(audio);assert.equal(h.audioTrack,1);assert.equal(audio.value,'1');e.api.setRemoteMode({enabled:true,isHost:false});audio.value='0';audio.dispatchEvent(new e.w.Event('change'));assert.equal(h.audioTrack,0,'Guests retain local audio choices');assert.equal(e.api.getState().source,'/multi.m3u8');
  h.audioTrack=1;h.emit(Hls.Events.AUDIO_TRACK_SWITCHED);assert.equal(audio.value,'1');
});
test('DASH audio selects the actual track object and follows rendered track changes',async()=>{
  let player,current;const tracks=[{lang:'de',labels:[{text:'Deutsch'}]},{lang:'en',labels:[{text:'English'}]}];const e=setup({},e=>{const listeners=new Map();player={initialize(){},on(n,fn){listeners.set(n,fn);},off(n){listeners.delete(n);},emit(n){listeners.get(n)?.({});},getBitrateInfoListFor(){return [];},getTracksFor(type){return type==='audio'?tracks:[];},getCurrentTrackFor(){return current;},setCurrentTrack(track){current=track;},destroy(){}};const MediaPlayer=()=>({create:()=>player});MediaPlayer.events={STREAM_INITIALIZED:'stream',TRACK_CHANGE_RENDERED:'track'};e.w.dashjs={MediaPlayer};});
  await e.api.loadSource({status:'ok',playbackUrl:'/multi.mpd'});player.emit('stream');const audio=e.d.querySelector('[data-player-audio]');assert(audio);assert.equal(current,tracks[1]);audio.value='0';audio.dispatchEvent(new e.w.Event('change'));assert.equal(current,tracks[0]);current=tracks[1];player.emit('track');assert.equal(audio.value,'1');
});
test('Provider captions remain selectable alongside HLS subtitles and never enable two caption renderers',async()=>{
  let Hls;const e=setup({},e=>Hls=hlsMock(e.w));await e.api.loadSource({status:'ok',playbackUrl:'/movie.m3u8',subtitles:[{id:'en',url:'/captions/en.vtt',language:'en',label:'English captions'}]});const h=Hls.instances[0];h.subtitleTracks=[{lang:'fr',name:'Français'}];h.subtitleTrack=-1;h.emit(Hls.Events.SUBTITLE_TRACKS_UPDATED);
  const external=e.video().querySelector('track');assert(external);const track={language:'en',label:'English captions',mode:'disabled'};Object.defineProperty(external,'track',{configurable:true,value:track});e.ready();
  const captions=e.d.querySelector('[data-player-captions]'),option=[...captions.options].find(option=>option.textContent==='English captions');assert(option,'External provider captions must remain in the HLS caption menu');captions.value=option.value;captions.dispatchEvent(new e.w.Event('change'));assert.equal(track.mode,'showing');assert.equal(h.subtitleTrack,-1);assert.equal(h.subtitleDisplay,false);
  captions.value='0';captions.dispatchEvent(new e.w.Event('change'));assert.equal(h.subtitleTrack,0);assert.equal(h.subtitleDisplay,true);assert.equal(track.mode,'disabled');captions.value='-1';captions.dispatchEvent(new e.w.Event('change'));assert.equal(h.subtitleDisplay,false);assert.equal(track.mode,'disabled');
});
test('Native captions follow late track changes and disable safely when a provider caption fails',async()=>{
  let tracks;const e=setup({},e=>{e.w.HTMLMediaElement.prototype.load=function(){e.state(this).textTracks=tracks=observableTracks(e.w);};});await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4',subtitles:[{url:'/captions/late.vtt',language:'en',label:'English captions'}]});e.ready();
  const captions=e.d.querySelector('[data-player-captions]'),external=e.video().querySelector('track'),track={language:'en',label:'English captions',mode:'disabled'};Object.defineProperty(external,'track',{configurable:true,value:track});tracks.add(track);const option=[...captions.options].find(option=>option.textContent==='English captions');assert(option);captions.value=option.value;captions.dispatchEvent(new e.w.Event('change'));assert.equal(track.mode,'showing');
  track.mode='disabled';tracks.dispatchEvent(new e.w.Event('change'));assert.equal(captions.value,'-1','The menu follows native caption controls');external.dispatchEvent(new e.w.Event('error'));assert.equal(captions.disabled,true);assert.equal(captions.selectedOptions[0].textContent,'Unavailable');assert.equal(e.api.getState().ready,true,'A failed caption must not stop the movie');
});
const fileChoices=()=>({status:'ok',movieId:'42',playbackUrl:'/media/1080.mp4',streamType:'mp4',streamQuality:'1080p',audioLanguage:'en',playbackSources:[{id:'full',playbackUrl:'/media/1080.mp4',streamType:'mp4',streamQuality:'1080p',audioLanguage:'en',selected:true},{id:'small',playbackUrl:'/media/720.mp4',streamType:'mp4',streamQuality:'720p',audioLanguage:'en'}],subtitles:[{url:'/captions/english.vtt',language:'en',label:'English captions'}]});
test('File quality changes preserve playback and local track choices without resolving or emitting party commands',async()=>{
  let calls=0;const e=setup({},e=>e.w.fetch=async()=>{calls++;throw new Error('A quality change must not discover a new source');});const data=fileChoices(),actions=[];await e.api.loadSource(data);e.ready();e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));e.api.setRemoteMode({enabled:true,isHost:false});await e.api.play({remote:true});Object.assign(e.state(e.video()),{currentTime:47,volume:.37,muted:true});
  const caption=e.video().querySelector('track'),captionTrack={language:'en',label:'English captions',mode:'disabled'};Object.defineProperty(caption,'track',{configurable:true,value:captionTrack});e.event('loadedmetadata');const captions=e.d.querySelector('[data-player-captions]');captions.value=[...captions.options].find(option=>option.textContent==='English captions').value;captions.dispatchEvent(new e.w.Event('change'));
  const quality=e.d.querySelector('[data-player-quality]'),option=[...quality.options].find(option=>/720p/.test(option.textContent));assert(option,'Prepared MP4 alternatives must appear in picture quality');assert.equal(quality.disabled,false);quality.value=option.value;quality.dispatchEvent(new e.w.Event('change'));await flush();assert.equal(e.api.getState().source,'/media/720.mp4');assert.equal(e.video().volume,.37);assert.equal(e.video().muted,true);const nextTrack={language:'en',label:'English captions',mode:'disabled'};Object.defineProperty(e.video().querySelector('track'),'track',{configurable:true,value:nextTrack});e.ready();await flush();assert.equal(e.api.getState().currentTime,47);assert.equal(e.api.getState().paused,false);assert.equal(nextTrack.mode,'showing');assert.equal(calls,0);assert.equal(actions.length,0);
  const current=e.video();await e.api.loadSource(data);assert.equal(e.video(),current,'An unchanged room snapshot preserves the local rendition');
});
test('Paused file quality changes retain speed and a stale rendition cannot resume a replacement episode',async()=>{
  const e=setup();await e.api.loadSource(fileChoices());e.ready();Object.assign(e.state(e.video()),{currentTime:62,playbackRate:1.5});const quality=e.d.querySelector('[data-player-quality]'),option=[...quality.options].find(option=>/720p/.test(option.textContent));assert(option);quality.value=option.value;quality.dispatchEvent(new e.w.Event('change'));await flush();const stale=e.video();e.ready();await flush();assert.equal(e.api.getState().paused,true);assert.equal(e.api.getState().currentTime,62);assert.equal(e.video().playbackRate,1.5);
  await e.api.play({remote:true});const high=[...quality.options].find(option=>/1080p/.test(option.textContent));quality.value=high.value;quality.dispatchEvent(new e.w.Event('change'));await flush();const replaced=e.video();await e.api.loadSource({status:'ok',movieId:'99',type:'tv',season:2,episode:4,playbackUrl:'/episode.mp4'});e.ready(replaced);e.ready(stale);e.ready();await flush();assert.equal(e.api.getState().source,'/episode.mp4');assert.equal(e.api.getState().paused,true);assert.equal(e.api.getState().currentTime,0);
});
test('File audio alternatives expose known languages and source captions merge without duplicate tracks',async()=>{
  const e=setup();const data=fileChoices();data.audioLanguage='fr';Object.assign(data.playbackSources[0],{audioLanguage:'fr',subtitles:[{url:'/captions/english.vtt',language:'en',label:'English captions'}]});data.playbackSources[1].subtitles=[{url:'/captions/french.vtt',language:'fr',label:'Français'}];await e.api.loadSource(data);e.ready();const audio=e.d.querySelector('[data-player-audio]');assert.equal(audio.disabled,false);const english=[...audio.options].find(option=>/English/.test(option.textContent));assert(english);audio.value=english.value;audio.dispatchEvent(new e.w.Event('change'));await flush();assert.equal(e.api.getState().source,'/media/720.mp4');e.ready();assert.equal(e.video().querySelectorAll('track').length,2);assert.equal([...e.video().querySelectorAll('track')].filter(track=>track.src.endsWith('/captions/english.vtt')).length,1);assert.match(audio.selectedOptions[0].textContent,/English/);
});
test('Safari keeps native HLS while server rendition alternatives make picture quality usable',async()=>{
  let Hls;const e=setup({},e=>{Hls=hlsMock(e.w);e.w.HTMLMediaElement.prototype.canPlayType=type=>type==='application/vnd.apple.mpegurl'?'probably':'';});const data=fileChoices();data.playbackUrl='/hls/master.m3u8';data.streamType='hls';data.playbackSources=[{id:'master',playbackUrl:'/hls/master.m3u8',streamType:'hls',streamQuality:'Auto',selected:true},{id:'720',playbackUrl:'/hls/720.m3u8',streamType:'hls',streamQuality:'720p'}];await e.api.loadSource(data);e.ready();const quality=e.d.querySelector('[data-player-quality]'),option=[...quality.options].find(option=>/720p/.test(option.textContent));assert(option);quality.value=option.value;quality.dispatchEvent(new e.w.Event('change'));await flush();assert.equal(e.video().getAttribute('src'),'/hls/720.m3u8');assert.equal(Hls.instances.length,0,'Safari must retain native hardware playback');
});
test('Tentative native HLS support uses the MSE engine instead of sending a playlist to the file demuxer',async()=>{
  let Hls;const e=setup({},e=>{Hls=hlsMock(e.w);e.w.HTMLMediaElement.prototype.canPlayType=type=>/mpegurl/.test(type)?'maybe':'';});
  await e.api.loadSource({status:'ok',playbackUrl:'/hls/coco.m3u8'});
  assert.equal(Hls.instances.length,1,'A maybe answer must not bypass the working HLS engine');
  assert.equal(Hls.instances[0].url,'/hls/coco.m3u8');assert.equal(e.video().getAttribute('src'),null);
  e.ready();assert.equal(e.api.getState().ready,true);
});
test('Native HLS remains available when tentative support is the only supported transport',async()=>{
  let Hls;const e=setup({},e=>{Hls=hlsMock(e.w);Hls.isSupported=()=>false;e.w.HTMLMediaElement.prototype.canPlayType=type=>/mpegurl/.test(type)?'maybe':'';});
  await e.api.loadSource({status:'ok',playbackUrl:'/hls/movie.m3u8'});
  assert.equal(Hls.instances.length,0);assert.equal(e.video().getAttribute('src'),'/hls/movie.m3u8');e.ready();assert.equal(e.api.getState().ready,true);
});
test('A blocked HLS library still permits native playback when the browser offers it',async()=>{
  const e=setup({},e=>{e.w.HTMLMediaElement.prototype.canPlayType=type=>/mpegurl/.test(type)?'maybe':'';});
  const loading=e.api.loadSource({status:'ok',playbackUrl:'/hls/movie.m3u8'});await flush();
  const script=e.d.querySelector('script[data-player-library="hls"]');assert(script,'Tentative support should try the HLS engine');
  script.dispatchEvent(new e.w.Event('error'));await loading;
  assert.equal(e.video().getAttribute('src'),'/hls/movie.m3u8');e.ready();assert.equal(e.api.getState().ready,true);
});
test('Unknown current file audio is displayed truthfully when another source declares a language',async()=>{
  const e=setup(),data=fileChoices();data.audioLanguage='';data.playbackSources[0].audioLanguage='';data.playbackSources[1].audioLanguage='fr';await e.api.loadSource(data);e.ready();assert.equal(e.api.getState().source,'/media/1080.mp4');const audio=e.d.querySelector('[data-player-audio]');assert.match(audio.selectedOptions[0].textContent,/language unavailable/i);assert.doesNotMatch(audio.selectedOptions[0].textContent,/English|French/);assert.equal(audio.disabled,false);
});
test('Selecting HLS captions leaves the library controlled text renderer enabled',async()=>{
  let Hls;const e=setup({},e=>Hls=hlsMock(e.w));await e.api.loadSource({status:'ok',playbackUrl:'/movie.m3u8'});const h=Hls.instances[0],renderer={language:'en',label:'English',mode:'disabled'};e.state(e.video()).textTracks=[renderer];h.subtitleTracks=[{lang:'en',name:'English'}];h.subtitleTrack=-1;Object.defineProperty(h,'subtitleDisplay',{configurable:true,get(){return renderer.mode==='showing';},set(value){renderer.mode=value?'showing':'disabled';}});h.emit(Hls.Events.SUBTITLE_TRACKS_UPDATED);const captions=e.d.querySelector('[data-player-captions]');captions.value='0';captions.dispatchEvent(new e.w.Event('change'));assert.equal(renderer.mode,'showing','Native tracks created by HLS are owned by its subtitle renderer');
});
test('BFCache restores a locally chosen file rendition and subsequent room snapshots keep it',async()=>{
  const e=setup(),data=fileChoices();await e.api.loadSource(data);e.ready();const quality=e.d.querySelector('[data-player-quality]');quality.value=[...quality.options].find(option=>/720p/.test(option.textContent)).value;quality.dispatchEvent(new e.w.Event('change'));await flush();e.ready();e.api.seek(23,{remote:true});const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await flush();assert.equal(e.api.getState().source,'/media/720.mp4');e.ready();assert.equal(e.api.getState().currentTime,23);const current=e.video();await e.api.loadSource(data);assert.equal(e.video(),current);
});
test('Loading the next item clears the previous file quality and audio options',async()=>{
  const e=setup();await e.api.loadSource(fileChoices());e.ready();await e.api.loadSource({status:'loading',movieId:'99',jobId:'next'});const quality=e.d.querySelector('[data-player-quality]'),audio=e.d.querySelector('[data-player-audio]');assert.equal(quality.disabled,true);assert.doesNotMatch(quality.textContent,/720|1080/);assert.equal(audio.disabled,true);assert.doesNotMatch(audio.textContent,/English/);
});
test('Rapid file rendition changes retain the original position and play intent until metadata arrives',async()=>{
  const e=setup(),data=fileChoices();data.playbackSources.push({id:'tiny',playbackUrl:'/media/480.mp4',streamType:'mp4',streamQuality:'480p',audioLanguage:'en'});await e.api.loadSource(data);e.ready();e.api.seek(58,{remote:true});await e.api.play({remote:true});const quality=e.d.querySelector('[data-player-quality]');quality.value=[...quality.options].find(option=>/720p/.test(option.textContent)).value;quality.dispatchEvent(new e.w.Event('change'));await flush();quality.value=[...quality.options].find(option=>/480p/.test(option.textContent)).value;quality.dispatchEvent(new e.w.Event('change'));await flush();e.ready();await flush();assert.equal(e.api.getState().source,'/media/480.mp4');assert.equal(e.api.getState().currentTime,58);assert.equal(e.api.getState().paused,false);
});
test('A failed language file restores the server default instead of repeating the failed preference',async()=>{
  const e=setup(),data=fileChoices();data.playbackSources[1].audioLanguage='fr';await e.api.loadSource(data);e.ready();const audio=e.d.querySelector('[data-player-audio]');audio.value=[...audio.options].find(option=>/French/.test(option.textContent)).value;audio.dispatchEvent(new e.w.Event('change'));await flush();assert.equal(e.api.getState().source,'/media/720.mp4');e.state(e.video()).error={code:4};e.event('error');await flush();assert.equal(e.api.getState().source,'/media/1080.mp4');e.ready();const restored=e.video();await e.api.loadSource(data);assert.equal(e.video(),restored,'Recovery must not loop on a failed local language alternative');
});

test('Guests recover failed local qualities without host discovery and keep pending timeline and play intent',async()=>{
  for(const playing of [false,true]) {
    const e=setup(),data=fileChoices(),actions=[];let requests=0;
    e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));e.w.fetch=async()=>{requests++;throw Error('No discovery expected');};
    await e.api.loadSource(data);e.ready();e.api.seek(47,{remote:true});if(playing)await e.api.play({remote:true});
    e.api.setRemoteMode({enabled:true,isHost:false});
    const quality=e.d.querySelector('[data-player-quality]');quality.value=[...quality.options].find(option=>/720p/.test(option.textContent)).value;quality.dispatchEvent(new e.w.Event('change'));await flush();
    const failed=e.video();assert.equal(failed.currentTime,0,'Failure occurs before alternate metadata');e.state(failed).error={code:4};e.event('error');await flush();
    assert.equal(e.api.getState().source,'/media/1080.mp4','A guest must recover locally from an unavailable choice');e.ready();await flush();
    assert.equal(e.api.getState().currentTime,47);assert.equal(e.api.getState().paused,!playing);assert.equal(e.d.querySelector('[data-player-quality]').disabled,false);
    assert.equal(requests,0);assert.equal(actions.length,0);const restored=e.video();e.event('error',failed);assert.equal(e.video(),restored,'A late failed rendition cannot disturb recovery');
  }
});

test('A new room source failure never restores the preceding local rendition',async()=>{
  const e=setup(),data=fileChoices();await e.api.loadSource(data);e.ready();const quality=e.d.querySelector('[data-player-quality]');quality.value=[...quality.options].find(option=>/720p/.test(option.textContent)).value;quality.dispatchEvent(new e.w.Event('change'));await flush();e.ready();
  await e.api.loadSource({status:'error',movieId:'99',code:'no_source'});assert.equal(e.api.getState().status,'error');assert.equal(e.api.getState().mediaId,'99');assert.equal(e.video().getAttribute('src'),null);
});

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
test('Movie and episode theater identity stays outside playable media and uses safe decorative artwork',()=>{
  for(const type of ['movie','tv']){
    const dom=new JSDOM(markup({...base,type,season:2,episode:8,episodeTitle:'A <new> chapter'})),d=dom.window.document;
    const app=d.querySelector('main.svCinemaPage[data-cinema-page="player"]'),stage=d.querySelector('[data-player-stage]');
    assert(app,'Both players should participate in the shared cinema experience');
    assert.equal(d.querySelector('.svPlayerAmbient')?.getAttribute('aria-hidden'),'true');
    assert.equal(stage.closest('.svPlayerTheater')?.hasAttribute('data-cinema-reveal'),true);
    assert(!stage.contains(d.querySelector('#svPlayerTitle')),'The title must never cover playable frames');
    assert.equal(d.querySelectorAll('video').length,1);
    if(type==='tv')assert.equal(d.querySelector('.svPlayerChapter')?.textContent,'S02 · E08');
    dom.window.close();
  }
  const dom=new JSDOM(markup({...base,backdrop:'javascript:alert(1)',poster:''}));
  assert.equal(dom.window.document.querySelector('.svPlayerAmbient'),null);
  dom.window.close();
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
test('A slow movie fallback survives network latency around each long poll without losing the shared job',async()=>{
 let calls=0,aborts=0;
 const e=setup({managed:false,id:'354912'},e=>{
   e.app.dataset.playerResolveTimeoutMs='90000';
   e.app.dataset.playerRequestTimeoutMs='12000';
   e.app.dataset.playerStallTimeoutMs='45000';
   e.w.fetch=(url,{signal})=>new Promise((resolve,reject)=>{
     calls++;
     const wait=Number(new URL(url,'https://swifly.test').searchParams.get('wait')||0);
     const timer=e.w.setTimeout(()=>resolve({ok:true,json:async()=>calls<3
       ?{status:'loading',jobId:'coco-fallback',serverTime:e.w.Date.now(),deadlineAt:e.w.Date.now()+60000,retryAfterMs:250}
       :{status:'ok',movieId:'354912',playbackUrl:'/verified-coco.webm'}}),wait+5000);
     signal.addEventListener('abort',()=>{aborts++;e.w.clearTimeout(timer);reject(new Error('request aborted'));},{once:true});
   });
 });
 await e.advance(35000);
 assert.equal(e.api.getState().source,'/verified-coco.webm');
 assert.equal(calls,3,'Polling stays serial and keeps the same shared lookup');
 assert.equal(aborts,0,'The network and server wait both fit in the HTTP budget');
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
test('Episode HLS playback uses episode copy and accessible labels throughout playback',async()=>{
  let Hls;const e=setup({type:'tv',season:2,episode:4},e=>Hls=hlsMock(e.w));await e.api.loadSource({status:'ok',hlsProxyUrl:'/protected/episode.m3u8',type:'tv'});
  assert.equal(Hls.instances[0].url,'/protected/episode.m3u8');assert.equal(e.api.getState().type,'tv');assert.equal(e.d.querySelector('[data-player-status-title]').textContent,'Getting your episode ready');assert.equal(e.d.querySelector('[data-player-status-label]').textContent,'YOUR EPISODE');
  assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-label'),'Episode player');assert.equal(e.d.querySelector('[data-player-seek]').getAttribute('aria-label'),'Seek through episode');e.ready();assert.equal(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),'Play episode');
  await e.api.play();assert.equal(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),'Pause episode');e.video().muted=true;assert.equal(e.d.querySelector('[data-player-mute]').getAttribute('aria-label'),'Unmute episode');e.event('ended');assert.equal(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),'Replay episode');
  e.video().play=()=>Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));await e.api.play();assert.equal(e.d.querySelector('[data-player-unlock] span').textContent,'Play episode');
  await e.api.loadSource({status:'error',code:'timeout'});assert.equal(e.d.querySelector('[data-player-status-title]').textContent,'This episode couldn’t start.');assert.match(e.d.querySelector('[data-player-status-copy]').textContent,/episode.*too long/i);assert.doesNotMatch(e.d.querySelector('[data-player-status-copy]').textContent,/movie/i);
});
test('Runtime player labels follow the media type of replacement sources',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/episode.mp4',type:'tv'});e.ready();assert.equal(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),'Play episode');assert.equal(e.d.querySelector('[data-player-mute]').getAttribute('aria-label'),'Mute episode');assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-label'),'Episode player');
  await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4',type:'movie'});e.ready();assert.equal(e.d.querySelector('[data-player-play]').getAttribute('aria-label'),'Play movie');assert.equal(e.d.querySelector('[data-player-mute]').getAttribute('aria-label'),'Mute movie');assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-label'),'Movie player');assert.equal(e.d.querySelector('[data-player-seek]').getAttribute('aria-label'),'Seek through movie');
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
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();e.event('waiting');await e.advance(140);e.event('waiting');e.event('progress');await e.advance(80);assert.equal(e.app.dataset.playerState,'loading');assert.equal(e.api.getState().ready,false);
});
test('Real buffered progress renews a stall deadline and paused ready movies need no watchdog',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.advance(300);assert.equal(e.app.dataset.playerState,'ready');await e.api.play();e.event('waiting');await e.advance(130);e.state(e.video()).buffered=ranges([[0,20]]);e.event('progress');await e.advance(130);assert.equal(e.app.dataset.playerState,'buffering');await e.advance(80);assert.equal(e.app.dataset.playerState,'loading');
});
for(const name of ['waiting','stalled'])test('Paused ready media ignores background '+name+' events',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.event(name);
  assert.equal(e.app.dataset.playerState,'ready');assert.equal(e.d.querySelector('[data-player-status]').hidden,true);assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-busy'),'false');
  await e.advance(300);assert.equal(e.api.getState().ready,true);assert.equal(e.app.dataset.playerState,'ready');assert.equal(e.timers.size,0);
});
test('A download stall leaves buffered playback visible while its playback watchdog remains active',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();Object.assign(e.state(e.video()),{currentTime:10,buffered:ranges([[0,60]])});await e.api.play();e.event('timeupdate');e.event('stalled');
  assert.equal(e.app.dataset.playerState,'ready');assert.equal(e.d.querySelector('[data-player-status]').hidden,true);assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-busy'),'false');
  await e.advance(130);e.state(e.video()).currentTime=11;e.event('timeupdate');await e.advance(130);assert.equal(e.app.dataset.playerState,'ready');await e.advance(80);assert.equal(e.app.dataset.playerState,'loading');
});
test('Advancing playback dismisses buffering without another readiness event',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();Object.assign(e.state(e.video()),{currentTime:10,readyState:2});e.event('waiting');e.event('timeupdate');
  assert.equal(e.app.dataset.playerState,'buffering','An unchanged playback position cannot claim recovery');assert.equal(e.d.querySelector('[data-player-status]').hidden,false);
  await e.advance(130);Object.assign(e.state(e.video()),{currentTime:11,readyState:3});e.event('timeupdate');
  assert.equal(e.app.dataset.playerState,'ready');assert.equal(e.d.querySelector('[data-player-status]').hidden,true);assert.equal(e.d.querySelector('[data-player-stage]').getAttribute('aria-busy'),'false');
  await e.advance(130);assert.equal(e.app.dataset.playerState,'ready');await e.advance(80);assert.equal(e.app.dataset.playerState,'loading','Resuming playback should automatically reconnect rather than requiring a restart');
});
test('A stall without future playback data shows buffering and ends at its original deadline',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();e.state(e.video()).readyState=2;e.event('stalled');assert.equal(e.app.dataset.playerState,'buffering');
  await e.advance(130);e.event('stalled');await e.advance(80);assert.equal(e.app.dataset.playerState,'loading');assert.equal(e.api.getState().ready,false);
});
test('Seeking position changes keep buffering visible until playback advances after the seek',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();Object.assign(e.state(e.video()),{currentTime:20,readyState:2,seeking:true});e.event('seeking');e.event('timeupdate');assert.equal(e.app.dataset.playerState,'buffering');
  Object.assign(e.state(e.video()),{currentTime:21,readyState:3,seeking:false});e.event('timeupdate');assert.equal(e.app.dataset.playerState,'ready');
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
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();e.event('waiting');await e.advance(130);e.event('canplay');await e.advance(130);assert.equal(e.app.dataset.playerState,'loading');
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
// jsdom 22 cannot parse @container and rejects the whole sheet. These two
// assertions inspect base styles only; actual container layouts use Chromium QA.
function basePlayerCss(css) {
  return css.replace(/@container[^{}]+\{(?:[^{}]|\{[^{}]*\})*\}/g,'');
}
test('Player styling integrates the room grid and preserves visible focus',()=>{
  const file=path.join(root,'public/player/player.css');assert(fs.existsSync(file),'The player needs its own cohesive stylesheet');const css=fs.readFileSync(file,'utf8');const dom=new JSDOM('<body class="svCleanShell"><style>'+basePlayerCss(css)+'</style>'+markup(base)+'</body>'),w=dom.window,d=w.document;const app=d.querySelector('.svPlayerPage');assert.equal(w.getComputedStyle(d.querySelector('[data-player-stage]')).aspectRatio,'var(--player-aspect)');app.dataset.partyActive='true';assert.match(w.getComputedStyle(d.querySelector('.svPlayerLayout')).gridTemplateColumns,/320px/);assert.match(css,/focus-visible[^}]*outline[^}]*!important/s);assert.match(css,/prefers-reduced-motion/);dom.window.close();
});
test('Player support-hidden controls stay hidden despite the shared control display rule',()=>{
  const css=fs.readFileSync(path.join(root,'public/player/player.css'),'utf8');const dom=new JSDOM('<body class="svCleanShell"><style>'+basePlayerCss(css)+'</style>'+markup(base)+'</body>'),w=dom.window,d=w.document;
  for(const name of ['pip','fullscreen']){const node=d.querySelector('[data-player-'+name+']');assert.equal(node.hidden,true);assert.equal(w.getComputedStyle(node).display,'none','Unavailable '+name+' must not render');}dom.window.close();
});
test('Picture in picture stays reachable in settings without crowding the transport',async()=>{
  let requested=0;
  const e=setup({},e=>{
    Object.defineProperty(e.d,'pictureInPictureEnabled',{value:true,configurable:true});
    e.w.HTMLVideoElement.prototype.requestPictureInPicture=async()=>{requested++;};
  });
  await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
  const menu=e.d.querySelector('[data-player-settings]'),pip=e.d.querySelector('[data-player-pip]');
  assert.equal(e.d.querySelectorAll('[data-player-pip]').length,1);
  assert(menu.contains(pip),'The display action belongs in the reachable settings menu at every player width');
  assert.match(pip.textContent,/picture in picture/i);assert.equal(pip.hidden,false);
  menu.open=true;pip.focus();pip.click();await flush();
  assert.equal(requested,1);assert.equal(menu.open,false);assert.equal(e.d.activeElement,menu.querySelector('summary'));
});
test('Volume has an explicit dismissal that restores its trigger focus',()=>{
  const e=setup(),menu=e.d.querySelector('[data-player-volume-menu]');menu.open=true;
  const close=e.d.querySelector('[data-player-volume-close]');assert(close,'Volume needs a reachable close control in its compact sheet');
  e.d.querySelector('[data-player-volume]').focus();close.click();
  assert.equal(menu.open,false);assert.equal(e.d.activeElement,menu.querySelector('summary'));
});

test('Embedded party markup renders the same stage without a second watch-page shell',()=>{
  const dom=new JSDOM(markup({...base,embedded:true,videoId:'sv103Video'})),d=dom.window.document;
  assert(d.querySelector('.svPlayerEmbedded[data-player-root]'),'Embedded markup needs its own mount boundary');
  assert.equal(d.querySelectorAll('video#sv103Video').length,1);
  assert.equal(d.querySelector('.svPlayerPage'),null);
  assert.equal(d.querySelector('[data-player-party-slot],.svPlayerBelow,.svPlayerPageHead'),null);
  assert(d.querySelector('[data-player-transport-note]'));
  assert.equal(d.querySelector('.dsIconBtn'),null,'Transport controls must be owned by the player');
  dom.window.close();
});
test('Mounting an embedded controller keeps solo playback independent and tears it down safely',async()=>{
  const e=setup(),host=e.d.createElement('div');host.innerHTML=markup({...base,embedded:true,videoId:'sv103Video'});e.d.body.append(host);
  assert.equal(typeof e.w.SwiflyPlayer.mount,'function','The shared runtime must be available outside solo watch pages');
  const root=host.firstElementChild,party=e.w.SwiflyPlayer.mount(root,{managed:true,isHost:false});
  assert.equal(e.w.SwiflyPlayer.mount(root),party,'A boundary has one controller');
  assert(Object.isFrozen(party));assert.notEqual(party,e.api);
  await e.api.loadSource({status:'ok',playbackUrl:'/solo.mp4'});
  await party.loadSource({status:'ok',playbackUrl:'/party.mp4',movieId:'43'});
  const v=root.querySelector('video');e.ready(v);e.ready(e.video());
  assert.equal(e.api.getState().source,'/solo.mp4');assert.equal(party.getState().source,'/party.mp4');
  assert.equal(root.querySelector('[data-player-play]').disabled,true);assert.equal(e.d.querySelector('[data-player-play]').disabled,false);
  party.destroy();v.dispatchEvent(new e.w.Event('canplay'));assert.equal(party.getState().ready,false);assert.equal(e.api.getState().ready,true);
  assert.equal(e.w.SwiflyPlayer.mount(e.d.createElement('section')),null,'Detached or incomplete roots must not create controllers');
});
test('Playing controls settle after inactivity and stay visible for pause, focus, menus and buffering',async()=>{
  const e=setup({},e=>e.app.dataset.playerControlsTimeoutMs='40');await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
  await e.api.play();await e.advance(50);assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
  const stage=e.d.querySelector('[data-player-stage]');stage.dispatchEvent(new e.w.Event('pointermove'));assert.equal(e.app.dataset.playerControlsVisibility,'visible');
  e.d.querySelector('[data-player-settings]').open=true;await e.advance(50);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
  e.d.querySelector('[data-player-settings]').open=false;e.d.querySelector('[data-player-volume]').focus();await e.advance(50);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
  e.d.activeElement.blur();e.event('waiting');await e.advance(30);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
  e.api.pause();await e.advance(60);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
});
test('One player-owned glass lens follows visible controls and releases its renderer across the page lifecycle',async()=>{
  const mounted=[];
  const e=setup({},e=>{
    e.app.dataset.playerControlsTimeoutMs='40';
    e.w.SwiflyLiquidGlass={mount(element){
      const lens={element,enabled:null,destroyed:false,setEnabled(value){this.enabled=value;},destroy(){this.destroyed=true;}};
      mounted.push(lens);return lens;
    }};
  });
  assert.equal(mounted.length,1,'The complete transport must share one optical surface');
  const lens=mounted[0];
  assert.equal(lens.element,e.d.querySelector('[data-player-glass]'));
  assert.equal(lens.element.hasAttribute('data-swifly-glass'),false,'The player owns its lens lifecycle instead of global auto-mounting');
  assert.equal(lens.enabled,true,'Visible controls start with their static glass lens');
  await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();await e.advance(50);
  assert.equal(lens.enabled,false,'Hidden playing controls must release optical work');
  e.d.querySelector('[data-player-stage]').dispatchEvent(new e.w.Event('pointermove'));
  assert.equal(lens.enabled,true,'Interaction restores the same lens');
  e.api.pause();assert.equal(lens.enabled,true,'Paused visible controls retain static optics');
  Object.defineProperty(e.d,'hidden',{configurable:true,value:true});e.d.dispatchEvent(new e.w.Event('visibilitychange'));
  assert.equal(lens.enabled,false,'A background document must disable the lens');
  Object.defineProperty(e.d,'hidden',{configurable:true,value:false});e.d.dispatchEvent(new e.w.Event('visibilitychange'));
  assert.equal(lens.enabled,true);
  const hide=new e.w.Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});e.w.dispatchEvent(hide);
  assert.equal(lens.enabled,false,'BFCache suspension stops the same renderer');
  const show=new e.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});e.w.dispatchEvent(show);await flush();
  assert.equal(lens.enabled,true,'BFCache return restores visible control optics');
  assert.equal(mounted.length,1,'Source replacement and BFCache return must not duplicate a lens');
  e.api.destroy();assert.equal(lens.destroyed,true,'Destroy must release the renderer');
});
test('An unavailable optional glass renderer preserves usable native playback controls',async()=>{
  const e=setup({},e=>{e.w.SwiflyLiquidGlass={mount(){throw new Error('Unsupported renderer');}};});
  await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
  assert.equal(await e.api.play(),true);assert.equal(e.api.getState().paused,false);
  assert.equal(e.d.querySelector('[data-player-controls]').hidden,false);
  e.api.pause();assert.equal(e.api.getState().paused,true);
});
test('Seek previews remain steady during timeupdates and commit one explicit shared action',async()=>{
  const e=setup(),actions=[];await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
  e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));
  const seek=e.d.querySelector('[data-player-seek]');seek.value='75';seek.dispatchEvent(new e.w.Event('input',{bubbles:true}));
  e.state(e.video()).currentTime=9;e.event('timeupdate');assert.equal(seek.value,'75');assert.equal(e.d.querySelector('[data-player-current]').textContent,'1:15');
  assert.equal(e.api.getState().currentTime,9,'Scrubbing must not seek on every input');
  seek.dispatchEvent(new e.w.Event('change',{bubbles:true}));assert.equal(e.api.getState().currentTime,75);assert.deepEqual(actions.map(x=>[x.action,x.time]),[['set',75]]);
  seek.value='90';seek.dispatchEvent(new e.w.Event('input'));e.api.setRemoteMode({enabled:true,isHost:false});seek.dispatchEvent(new e.w.Event('change'));assert.equal(e.api.getState().currentTime,75,'Losing hosting during a scrub cannot move the party');
});

test('The volume button reflects local mute and settings can dismiss explicitly',async()=>{
 const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
 const summary=e.d.querySelector('[data-player-volume-menu] summary'),volume=e.d.querySelector('[data-player-volume]');volume.value='0.35';volume.dispatchEvent(new e.w.Event('input'));assert.match(summary.getAttribute('aria-label'),/35 percent/);
 e.d.querySelector('[data-player-mute]').click();assert.match(summary.getAttribute('aria-label'),/muted/);
 const menu=e.d.querySelector('[data-player-settings]');menu.open=true;e.d.querySelector('[data-player-settings-close]').click();assert.equal(menu.open,false);assert.equal(e.d.activeElement,menu.querySelector('summary'));
});

test('Source replacement and fullscreen transitions dismiss stale playback menus',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/first.mp4'});e.ready();
  const settings=e.d.querySelector('[data-player-settings]'),volume=e.d.querySelector('[data-player-volume-menu]');
  settings.open=true;await e.api.loadSource({status:'ok',playbackUrl:'/second.mp4'});
  assert.equal(settings.open,false,'A replacement source must not keep its previous settings sheet open');
  volume.open=true;e.d.dispatchEvent(new e.w.Event('fullscreenchange'));
  assert.equal(volume.open,false,'A fullscreen transition must dismiss the old menu coordinates');
});
test('Destroy removes open playback menus along with the player controls',()=>{
  const e=setup(),settings=e.d.querySelector('[data-player-settings]');settings.open=true;
  e.api.destroy();assert.equal(settings.open,false);assert.equal(e.d.querySelector('[data-player-controls]').hidden,true);
});

test('A buffering movie reconnects at the saved timestamp and resumes without a click',async()=>{
 const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();
 Object.assign(e.state(e.video()),{currentTime:57,readyState:2});await e.api.play();e.event('waiting');
 const old=e.video();await e.advance(210);
 assert.notEqual(e.video(),old);assert.equal(e.app.dataset.playerState,'loading');
 assert.equal(e.api.getState().source,'/movie.mp4');assert.equal(e.d.querySelector('[data-player-retry]').hidden,true);
 e.ready();assert.equal(e.api.getState().currentTime,57);assert.equal(e.api.getState().paused,false);
 await e.advance(210);assert.equal(e.app.dataset.playerState,'error','a broken source cannot reconnect endlessly');
});
test('Episode buffering falls back to a second rendition without losing the episode timestamp',async()=>{
 const e=setup({type:'tv',season:2,episode:3});
 await e.api.loadSource({status:'ok',type:'tv',playbackUrl:'/episode-a.mp4',playbackSources:[{playbackUrl:'/episode-a.mp4'},{playbackUrl:'/episode-b.mp4'}]});
 e.ready();e.state(e.video()).currentTime=62;await e.api.play();e.event('waiting');
 await e.advance(205);assert.equal(e.api.getState().source,'/episode-a.mp4');e.ready();
 await e.advance(205);assert.equal(e.api.getState().source,'/episode-b.mp4');
 e.ready();assert.equal(e.api.getState().currentTime,62);assert.equal(e.api.getState().type,'tv');
 assert.equal(e.api.getState().paused,false);
 await e.advance(205);assert.equal(e.app.dataset.playerState,'error','source recovery is bounded');
});
test('A native network error reconnects but a codec failure does not retry the same source',async()=>{
 const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();e.state(e.video()).currentTime=30;await e.api.play();
 const first=e.video();e.state(first).error={code:2};e.event('error',first);
 assert.notEqual(e.video(),first);e.ready();assert.equal(e.api.getState().currentTime,30);
 const second=e.video();e.state(second).error={code:4};e.event('error',second);
 assert.equal(e.app.dataset.playerState,'error');
});

test('Throttled timeupdate events cannot restart a healthy advancing film',async()=>{
 const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});e.ready();await e.api.play();
 const original=e.video();
 e.state(original).currentTime=10; // Clock advanced without a timeupdate event.
 await e.advance(210);
 assert.equal(e.video(),original,'an advancing video must not be destroyed on an expired watchdog');
 assert.equal(e.app.dataset.playerState,'ready');
 e.state(original).currentTime=12;await e.advance(210);
 assert.equal(e.video(),original,'subsequent throttled events remain harmless when time advances');
});
