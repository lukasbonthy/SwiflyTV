const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {playerMarkup}=require('../ui/player');
const {tvScript}=require('../ui/tv');
const source=fs.readFileSync(path.join(__dirname,'../public/player/player.js'),'utf8');
const environments=new Set();
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const ranges={length:1,start:()=>0,end:()=>120};
function setup(){
  const dom=new JSDOM('<!doctype html><html data-sv-tv="true"><body class="swifly-tv-focus-mode">'+playerMarkup({id:'42',type:'movie',title:'TV evening',mode:'movie',managed:true})+'</body></html>',{url:'https://swifly.test/watch/movie/42',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window,d=w.document,states=new WeakMap(),timers=new Map();let nextTimer=0;
  const state=v=>{if(!states.has(v))states.set(v,{paused:true,currentTime:37,duration:120,readyState:3,ended:false,seeking:false,volume:1,muted:false,playbackRate:1,buffered:ranges,seekable:ranges,textTracks:[],audioTracks:[],error:null});return states.get(v);};
  for(const name of Object.keys(state(d.querySelector('video'))))Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;}});
  w.HTMLMediaElement.prototype.load=function(){};
  w.HTMLMediaElement.prototype.canPlayType=()=>'';
  w.HTMLMediaElement.prototype.play=function(){state(this).paused=false;this.dispatchEvent(new w.Event('play'));this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};
  w.HTMLMediaElement.prototype.pause=function(){const changed=!state(this).paused;state(this).paused=true;if(changed)this.dispatchEvent(new w.Event('pause'));};
  w.setTimeout=(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;};w.clearTimeout=id=>timers.delete(id);
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const app=d.querySelector('[data-player-root]'),find=name=>app.querySelector('[data-player-'+name+']');
  app.dataset.playerControlsTimeoutMs='40';
  const lens={enabled:null,setEnabled(value){this.enabled=value;},destroy(){}};
  w.SwiflyLiquidGlass={mount:()=>lens};w.eval(source);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const e={w,d,dom,app,find,state,timers,lens,api:w.SwiflyPlayer,
    tv(action){app.dispatchEvent(new w.CustomEvent('swiflyplayer:tv-controls',{bubbles:true,detail:{action}}));},
    event(name){find('video').dispatchEvent(new w.Event(name));},
    async playing(){await this.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});this.event('loadedmetadata');this.event('canplay');await this.api.play({remote:true});},
    idle(){for(const [id,timer]of [...timers])if(timer.delay===40){timers.delete(id);timer.fn();}},
    close(){this.api.destroy();dom.window.close();environments.delete(this);}
  };environments.add(e);return e;
}
test.afterEach(()=>{for(const e of environments)e.close();});
function controller(e){
 e.w.localStorage.setItem('swiflytv.tvFocusMode','true');e.w.navigator.getGamepads=()=>[];
 for(const n of e.app.querySelectorAll('button,summary,input,video,[tabindex]'))n.getBoundingClientRect=()=>({left:100,top:200,width:120,height:50,right:220,bottom:250});
 e.w.eval(tvScript().replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));e.d.dispatchEvent(new e.w.Event('DOMContentLoaded'));
 let clock=1000;e.w.Date.now=()=>clock;
 e.key=(key,{repeat=false,up=false}={})=>{clock+=180;const event=new e.w.KeyboardEvent(up?'keyup':'keydown',{key,repeat,bubbles:true,cancelable:true});e.d.activeElement.dispatchEvent(event);return event;};
}
test('stage directions seek immediately and vertical input reveals controls without pausing',async()=>{
 const e=setup();controller(e);await e.playing();e.find('stage').focus();e.key('ArrowRight');assert.equal(e.api.getState().currentTime,47);assert.equal(e.d.activeElement,e.find('stage'));e.key('ArrowLeft');assert.equal(e.api.getState().currentTime,37);e.key('ArrowUp');assert.equal(e.d.activeElement,e.find('seek'));assert.equal(e.api.getState().paused,false);
});
test('timeline repeats preview and commit a single party seek on release',async()=>{
 const e=setup();controller(e);await e.playing();const actions=[];e.app.addEventListener('swiflyplayer:action',v=>actions.push(v.detail));e.find('seek').focus();e.key('ArrowRight');e.key('ArrowRight',{repeat:true});e.key('ArrowRight',{repeat:true});assert.equal(e.api.getState().currentTime,37);assert.equal(Number(e.find('seek').value),67);assert.equal(actions.length,0);e.key('ArrowRight',{up:true});assert.equal(e.api.getState().currentTime,67);assert.equal(actions.filter(v=>v.action==='set').length,1);
});
test('Back cancels a timeline preview while Enter commits without a second playback action',async()=>{
 const e=setup();controller(e);await e.playing();e.find('seek').focus();e.key('ArrowRight');e.key('BrowserBack');assert.equal(e.api.getState().currentTime,37);assert.equal(Number(e.find('seek').value),37);assert.equal(e.app.dataset.playerControlsVisibility,'visible');e.key('ArrowRight');e.key('Enter');assert.equal(e.api.getState().currentTime,47);assert.equal(e.api.getState().paused,false);
});
test('TV inactivity parks dock focus and vertical reveal restores the last control',async()=>{
 const e=setup();controller(e);await e.playing();e.find('forward').focus();e.idle();assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.equal(e.d.activeElement,e.find('stage'));e.key('ArrowDown');assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(e.d.activeElement,e.find('forward'));
});
test('controller Back takes over from a parked mouse hover before leaving fullscreen',async()=>{
 const e=setup();controller(e);await e.playing();e.find('play').focus();e.find('controls').dispatchEvent(new e.w.Event('pointerenter'));e.key('BrowserBack');assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.equal(e.d.activeElement,e.find('stage'));
});
test('focused assist and active calls keep their controls visible during playback',async()=>{
 const e=setup();await e.playing();e.app.querySelector('[data-assist-song]').focus();e.idle();assert.equal(e.app.dataset.playerControlsVisibility,'visible');e.find('stage').focus();const call=e.d.createElement('section');call.dataset.watchroomCall='';call.innerHTML='<button data-call-leave>Leave call</button>';e.find('stage').append(call);e.find('stage').dispatchEvent(new e.w.Event('pointermove'));e.idle();assert.equal(e.app.dataset.playerControlsVisibility,'visible');
});
test('TV capture does not steal media keys or fullscreen from call, chat or open menus',async()=>{
 const e=setup();controller(e);await e.playing();let fullscreen=0;e.find('stage').requestFullscreen=()=>{fullscreen++;return Promise.resolve();};const call=e.d.createElement('section');call.dataset.watchroomCall='';call.innerHTML='<button>Mute</button>';e.find('stage').append(call);call.querySelector('button').getBoundingClientRect=()=>({left:0,top:0,width:80,height:50});call.querySelector('button').focus();for(const key of ['MediaPlayPause','f']){const event=e.key(key);assert.equal(event.defaultPrevented,false);}assert.equal(e.api.getState().paused,false);assert.equal(fullscreen,0);const settings=e.find('settings');settings.open=true;settings.querySelector('summary').focus();assert.equal(e.key('MediaPlayPause').defaultPrevented,false);assert.equal(e.api.getState().paused,false);
});

test('TV reveal synchronously exposes hidden playing controls and their glass',async()=>{
  const e=setup();await e.playing();e.idle();assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.equal(e.lens.enabled,false);
  const before=e.api.getState();e.tv('show');
  assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(e.lens.enabled,true);assert.deepEqual(e.api.getState(),before);
});

test('TV hide returns transport focus to stage without pausing, seeking or party commands',async()=>{
  const e=setup();await e.playing();const actions=[];e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));
  e.find('play').focus();const before=e.api.getState();e.tv('hide');
  assert.equal(e.d.activeElement,e.find('stage'));assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.equal(e.lens.enabled,false);
  await flush();assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.deepEqual(e.api.getState(),before);assert.deepEqual(actions,[]);
  assert.equal([...e.timers.values()].some(timer=>timer.delay===40),false,'Explicit hide cancels the inactivity timer');
});

test('Remote Back stays hidden after the TV event bubbles through the real player',async()=>{
  const e=setup();e.w.localStorage.setItem('swiflytv.tvFocusMode','true');e.w.navigator.getGamepads=()=>[];
  e.w.eval(tvScript().replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));e.d.dispatchEvent(new e.w.Event('DOMContentLoaded'));
  for(const element of e.app.querySelectorAll('button,summary,input,video,[tabindex]'))element.getBoundingClientRect=()=>({left:100,top:200,width:120,height:50,right:220,bottom:250});
  await e.playing();e.find('play').focus();
  const before=e.api.getState(),key=new e.w.KeyboardEvent('keydown',{key:'BrowserBack',bubbles:true,cancelable:true});e.find('play').dispatchEvent(key);await flush();
  assert.equal(key.defaultPrevented,true);assert.equal(e.d.activeElement,e.find('stage'));assert.equal(e.app.dataset.playerControlsVisibility,'hidden');assert.deepEqual(e.api.getState(),before);
});

test('TV hide preserves paused, loading, buffering, unlock, scrub, seeking, error and open menu controls',async()=>{
  const e=setup();await e.api.loadSource({status:'ok',playbackUrl:'/movie.mp4'});
  const protectedHide=()=>{const before=e.api.getState(),focus=e.d.activeElement;e.tv('hide');assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(e.d.activeElement,focus);assert.deepEqual(e.api.getState(),before);};
  protectedHide();e.event('canplay');e.find('play').focus();protectedHide();
  await e.api.play({remote:true});e.event('waiting');protectedHide();e.event('canplay');
  e.find('unlock').hidden=false;protectedHide();e.find('unlock').hidden=true;
  e.find('seek').dispatchEvent(new e.w.Event('input'));protectedHide();e.find('seek').dispatchEvent(new e.w.Event('pointercancel'));
  e.state(e.find('video')).seeking=true;protectedHide();e.state(e.find('video')).seeking=false;
  for(const name of ['settings','volume-menu']){const menu=e.find(name);menu.open=true;menu.querySelector('summary').focus();protectedHide();menu.open=false;}
  e.state(e.find('video')).error={code:4};e.event('error');assert.equal(e.api.getState().status,'error');protectedHide();
});

test('TV visibility commands preserve guest ownership and playback state',async()=>{
  const e=setup();await e.playing();e.api.setRemoteMode({enabled:true,isHost:false});const actions=[];e.app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));
  e.find('volume-menu').querySelector('summary').focus();const before=e.api.getState();e.tv('hide');assert.equal(e.app.dataset.playerControlsVisibility,'hidden');e.tv('show');
  assert.deepEqual(e.api.getState(),before);assert.deepEqual(actions,[]);assert.equal(e.find('play').disabled,true);assert.equal(e.app.dataset.playerHost,'false');
  e.api.pause({remote:true});e.tv('hide');assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(e.api.getState().paused,true);
});

test('TV visibility commands ignore disabled TV mode, suspension and destroyed players',async()=>{
  const e=setup();await e.playing();
  for(const disable of [()=>delete e.d.documentElement.dataset.svTv,()=>e.d.body.classList.remove('swifly-tv-focus-mode')]){
    disable();e.idle();assert.equal(e.app.dataset.playerControlsVisibility,'hidden');e.tv('show');assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
    e.find('stage').dispatchEvent(new e.w.Event('pointermove'));e.find('play').focus();e.tv('hide');assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(e.d.activeElement,e.find('play'));
    e.d.documentElement.dataset.svTv='true';e.d.body.classList.add('swifly-tv-focus-mode');e.find('stage').focus();
  }
  const pagehide=new e.w.Event('pagehide');Object.defineProperty(pagehide,'persisted',{value:true});e.w.dispatchEvent(pagehide);
  e.app.dataset.playerControlsVisibility='hidden';e.tv('show');assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
  e.app.dataset.playerControlsVisibility='visible';e.tv('hide');assert.equal(e.app.dataset.playerControlsVisibility,'visible');
  e.api.destroy();e.app.dataset.playerControlsVisibility='hidden';e.tv('show');assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
});
