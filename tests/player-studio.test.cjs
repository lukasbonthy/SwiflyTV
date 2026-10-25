'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {playerMarkup}=require('../ui/player');
const script=fs.readFileSync(path.join(__dirname,'../public/player/player.js'),'utf8');
const environments=new Set();
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const ranges={length:1,start:()=>0,end:()=>120};

// The media platform and clock are the only doubles: DOM, player, controls,
// source attachment, caption selection and lifecycle are the production code.
function setup(initial,customize=()=>{}) {
 const dom=new JSDOM('<!doctype html><body class="svCleanShell">'+playerMarkup({id:'42',type:'movie',title:'A quiet evening',managed:true,backdrop:'https://image.test/scene.jpg'})+'</body>',{url:'https://swifly.test/watch/movie/42',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document,states=new WeakMap(),timers=new Map(),queries=new Map();let now=100000,id=0,requests=0;
 const state=v=>{if(!states.has(v))states.set(v,{paused:true,currentTime:0,duration:NaN,readyState:0,ended:false,seeking:false,volume:1,muted:false,playbackRate:1,buffered:{length:0},seekable:{length:0},textTracks:[],audioTracks:[],error:null});return states.get(v);};
 for(const name of ['paused','currentTime','duration','readyState','ended','seeking','volume','muted','playbackRate','buffered','seekable','textTracks','audioTracks','error'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;}});
 w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLMediaElement.prototype.canPlayType=()=>'';
 w.HTMLMediaElement.prototype.play=function(){state(this).paused=false;this.dispatchEvent(new w.Event('play'));this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};
 w.HTMLMediaElement.prototype.pause=function(){const wasPlaying=!state(this).paused;state(this).paused=true;if(wasPlaying)this.dispatchEvent(new w.Event('pause'));};
 w.setTimeout=(fn,delay=0)=>{timers.set(++id,{at:now+Math.max(0,Number(delay)||0),fn});return id;};
 w.clearTimeout=id=>timers.delete(id);w.Date.now=()=>now;
 w.matchMedia=query=>{if(!queries.has(query)){const listeners=new Set();queries.set(query,{matches:false,addEventListener(_name,fn){listeners.add(fn);},removeEventListener(_name,fn){listeners.delete(fn);},change(value){this.matches=value;for(const fn of listeners)fn({matches:value});},listeners});}return queries.get(query);};
 w.fetch=async()=>{requests++;throw Error('Studio changes must not resolve media');};
 if(initial)w.SwiflyAppearance=initial;
 const app=d.querySelector('[data-player-root]'),actions=[];
 app.addEventListener('swiflyplayer:action',event=>actions.push(event.detail));
 app.dataset.playerStallTimeoutMs='45000';
 const e={dom,w,d,state,timers,queries,app,actions,requests:()=>requests,video:()=>app.querySelector('video'),event(name,node=e.video()){node.dispatchEvent(new w.Event(name));},change(effective,values=effective){d.dispatchEvent(new w.CustomEvent('swifly:studio-change',{detail:{values,effective}}));},ready(){Object.assign(state(e.video()),{duration:120,readyState:3,seekable:ranges});e.event('loadedmetadata');e.event('canplay');},async advance(ms){const end=now+ms;await flush();let guard=0;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert(++guard<1000);timers.delete(next[0]);now=next[1].at;next[1].fn();await flush();}now=end;await flush();},close(){w.SwiflyPlayer?.destroy();dom.window.close();environments.delete(e);}};
 environments.add(e);customize(e);w.eval(script);d.dispatchEvent(new w.Event('DOMContentLoaded'));e.api=w.SwiflyPlayer;return e;
}
test.afterEach(()=>{for(const e of environments)e.close();});
const query=(e,name)=>e.app.querySelector('[data-player-'+name+']');
async function playing(e){await e.api.loadSource({status:'ok',playbackUrl:'/film.mp4'});e.ready();await e.api.play({remote:true});}

test('Studio changes alter mounted chrome without replacing or transporting a playing guest video',async()=>{
 const e=setup();await playing(e);e.api.setRemoteMode({enabled:true,isHost:false});Object.assign(e.state(e.video()),{currentTime:47,volume:.37,muted:true});
 const original=e.video(),before=JSON.stringify(e.api.getState());query(e,'settings').querySelector('summary').focus();
 e.change({playerStyle:'classic',playerProgress:7,playerTime:false,playerIconScale:125,playerOpacity:60,playerPosition:'bottom',playerAutoHide:6000});
 assert.equal(e.app.dataset.playerStyle,'classic');assert.equal(e.app.dataset.playerPosition,'bottom');
 assert.equal(e.app.style.getPropertyValue('--player-progress-size'),'7px');
 assert.equal(e.app.style.getPropertyValue('--player-icon-scale'),'1.25');
 assert.equal(e.app.style.getPropertyValue('--player-chrome-opacity'),'0.6');
 assert.equal(query(e,'current').hidden,true);assert.equal(query(e,'duration').hidden,true);
 assert.equal(e.video(),original);assert.equal(JSON.stringify(e.api.getState()),before);assert.equal(e.video().volume,.37);assert.equal(e.video().muted,true);
 assert.equal(e.d.activeElement,query(e,'settings').querySelector('summary'));assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 assert.equal(query(e,'play').disabled,true);assert.equal(query(e,'seek').disabled,true);assert.equal(query(e,'speed').disabled,true);
 assert.equal(e.requests(),0);assert.equal(e.actions.length,0);
});

test('Initial effective settings style each newly mounted player and ignore unsaved raw values',()=>{
 const e=setup({playerStyle:'minimal',playerProgress:5,playerTime:false,playerIconScale:85,playerOpacity:70,playerPosition:'bottom',captionSize:150,captionColor:'#ffdd00',captionBg:20,captionEdge:'outline',playerBackdrop:'ambient'});
 assert.equal(e.app.dataset.playerStyle,'minimal');assert.equal(query(e,'current').hidden,true);assert.equal(e.app.style.getPropertyValue('--player-progress-size'),'5px');
 e.change({playerStyle:'cinema',playerProgress:3,playerTime:true,playerBackdrop:'dark'},{playerStyle:'classic',playerProgress:7,playerTime:false});
 assert.equal(e.app.dataset.playerStyle,'cinema');assert.equal(query(e,'current').hidden,false);assert.equal(e.app.style.getPropertyValue('--player-progress-size'),'3px');
 assert.equal(e.app.dataset.playerLoadingBackdrop,'dark');
});

test('Player appearance preserves the real backdrop metadata used by watch history and parties',()=>{
 const e=setup({playerBackdrop:'ambient'});
 assert.equal(e.app.dataset.playerBackdrop,'https://image.test/scene.jpg');
 e.change({playerBackdrop:'artwork',playerStyle:'classic'});
 assert.equal(e.app.dataset.playerBackdrop,'https://image.test/scene.jpg');
 assert.equal(query(e,'art').getAttribute('src'),'https://image.test/scene.jpg');
});

test('Changing the idle timeout replaces a pending deadline instead of hiding on the old timer',async()=>{
 const e=setup({playerAutoHide:1800});await playing(e);await e.advance(1000);
 e.change({playerAutoHide:4000});await e.advance(1000);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 await e.advance(2999);assert.equal(e.app.dataset.playerControlsVisibility,'visible');await e.advance(1);assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
 e.change({playerAutoHide:1800});assert.equal(e.app.dataset.playerControlsVisibility,'visible');await e.advance(1800);assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
 query(e,'stage').dispatchEvent(new e.w.Event('pointerdown'));assert.equal(e.app.dataset.playerControlsVisibility,'visible');
});

test('Hovered controls remain reachable through a cosmetic update and hide only after pointer leave',async()=>{
 const e=setup({playerAutoHide:1800});await playing(e);query(e,'controls').dispatchEvent(new e.w.Event('pointerenter'));
 e.change({playerAutoHide:1800,playerStyle:'minimal'});await e.advance(3500);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 query(e,'controls').dispatchEvent(new e.w.Event('pointerleave'));await e.advance(1800);assert.equal(e.app.dataset.playerControlsVisibility,'hidden');
});

test('Focused, open-menu, paused, buffering and error controls survive all timeout changes',async()=>{
 const e=setup({playerAutoHide:1800});await playing(e);
 query(e,'play').focus();e.change({playerAutoHide:1800,playerStyle:'classic'});await e.advance(1900);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 query(e,'stage').focus();query(e,'settings').open=true;e.change({playerAutoHide:1800});await e.advance(1900);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 query(e,'settings').open=false;e.api.pause({remote:true});e.change({playerAutoHide:1800});await e.advance(1900);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 await e.api.play({remote:true});e.event('waiting');e.change({playerAutoHide:1800});await e.advance(1900);assert.equal(e.app.dataset.playerControlsVisibility,'visible');
 await e.api.loadSource({status:'error',code:'no_source'});e.change({playerAutoHide:1800,playerBackdrop:'ambient'});await e.advance(1900);
 assert.equal(e.app.dataset.playerControlsVisibility,'visible');assert.equal(query(e,'status').hidden,false);assert.equal(query(e,'retry').hidden,false);
});

test('Native caption styles follow actual tracks and apply to replacement videos without creating tracks',async()=>{
 const e=setup({captionSize:150,captionColor:'#ffdd00',captionBg:20,captionEdge:'outline'});await playing(e);
 const ruleFor=video=>[...e.d.styleSheets].flatMap(sheet=>[...sheet.cssRules]).find(rule=>rule.selectorText?.endsWith('video::cue')&&video.matches(rule.selectorText.replace('::cue','')));
 const original=e.video();let rule=ruleFor(original);assert(rule,'The real video must match a native cue style rule');
 assert.equal(rule.style.getPropertyValue('font-size'),'150%');assert.equal(rule.style.getPropertyValue('color'),'#ffdd00');assert.equal(rule.style.getPropertyValue('background-color'),'rgba(0,0,0,0.2)');assert.match(rule.style.getPropertyValue('text-shadow'),/-1px/);
 assert.equal(original.querySelectorAll('track').length,0);assert.equal(query(e,'captions').disabled,true);
 const native={kind:'subtitles',language:'en',label:'English',mode:'disabled'};e.state(original).textTracks=[native];e.event('loadedmetadata');query(e,'captions').value='0';query(e,'captions').dispatchEvent(new e.w.Event('change'));
 e.change({captionSize:200,captionColor:'#00ffcc',captionBg:0,captionEdge:'none'});assert.equal(native.mode,'showing');assert.equal(query(e,'captions').disabled,false);
 await e.api.loadSource({status:'ok',playbackUrl:'/next.mp4'});e.ready();assert.notEqual(e.video(),original);rule=ruleFor(e.video());
 assert.equal(rule.style.getPropertyValue('font-size'),'200%');assert.equal(rule.style.getPropertyValue('color'),'#00ffcc');assert.equal(rule.style.getPropertyValue('text-shadow'),'none');assert.equal(e.video().querySelectorAll('track').length,0);
});

test('Invalid cosmetic values cannot inject cue CSS and restore safe bounds and defaults',()=>{
 const e=setup();e.change({playerStyle:'unsafe',playerProgress:999,playerIconScale:-5,playerOpacity:999,playerPosition:'top',captionSize:999,captionColor:'red;}body{display:none',captionBg:-1,captionEdge:'url(evil)',playerBackdrop:'url(evil)',playerAutoHide:1});
 assert.equal(e.app.dataset.playerStyle,'cinema');assert.equal(e.app.dataset.playerPosition,'floating');assert.equal(e.app.dataset.playerLoadingBackdrop,'dark');
 assert.equal(e.app.style.getPropertyValue('--player-progress-size'),'7px');assert.equal(e.app.style.getPropertyValue('--player-icon-scale'),'0.85');assert.equal(e.app.style.getPropertyValue('--player-chrome-opacity'),'1');
 const rules=[...e.d.styleSheets].flatMap(sheet=>[...sheet.cssRules]);assert.equal(rules.length,1);assert.equal(rules[0].style.getPropertyValue('color'),'#ffffff');assert.equal(rules[0].style.getPropertyValue('font-size'),'200%');
});

test('Low power and reduced transparency flatten player glass and changing presets restores one lens',()=>{
 const mounted=[];const e=setup({performancePreset:'xbox',playerBackdrop:'artwork',playerStyle:'cinema'},e=>{e.w.SwiflyLiquidGlass={mount(){const lens={enabled:false,destroyed:false,setEnabled(value){this.enabled=value;},destroy(){this.destroyed=true;}};mounted.push(lens);return lens;}};});
 assert.equal(e.app.dataset.playerEffects,'flat');assert.equal(e.app.dataset.playerLoadingBackdrop,'dark');assert.equal(mounted.length,0);
 e.change({performancePreset:'desktop',playerStyle:'cinema'});assert.equal(e.app.dataset.playerEffects,'full');assert.equal(mounted.length,1);assert.equal(mounted[0].enabled,true);
 e.change({performancePreset:'desktop',reduceTransparency:true});assert.equal(e.app.dataset.playerEffects,'flat');assert.equal(mounted[0].enabled,false);
 e.change({performancePreset:'desktop',reduceTransparency:false,playerStyle:'classic'});assert.equal(mounted[0].enabled,false);
 e.change({performancePreset:'desktop',playerStyle:'cinema'});assert.equal(mounted.length,1);assert.equal(mounted[0].enabled,true);
 e.api.destroy();assert.equal(mounted[0].destroyed,true);
});

test('OS transparency requirements override a theme live and release their listeners on destroy',()=>{
 const e=setup({reduceTransparency:false,playerBackdrop:'artwork'}),os=e.w.matchMedia('(prefers-reduced-transparency: reduce)');
 os.change(true);assert.equal(e.app.dataset.playerEffects,'flat');assert.equal(e.app.dataset.playerLoadingBackdrop,'dark');
 e.change({reduceTransparency:false,playerBackdrop:'ambient'});assert.equal(e.app.dataset.playerEffects,'flat');
 os.change(false);assert.equal(e.app.dataset.playerEffects,'full');assert.equal(e.app.dataset.playerLoadingBackdrop,'ambient');
 e.api.destroy();assert.equal(os.listeners.size,0);assert.equal(e.d.querySelector('style[data-player-cue-style]'),null);
 const previous=e.app.getAttribute('style');e.change({playerProgress:7});assert.equal(e.app.getAttribute('style'),previous,'Destroyed players must unsubscribe from Studio');
});
