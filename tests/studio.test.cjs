const {tvControllerSource}=require('./ui-helpers.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser,loadServer,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const api=loadServer();
const shell=api.pageShell({title:'Catalog',body:'<main>Catalog</main>'});
const markup=shell.match(/<dialog\b[^>]*id="controlPanel"[\s\S]*?<\/dialog>/)?.[0]||'';
const key='swiflytv.appearance';
function setup(values={}) {
  const env=browser('<button id="controlToggleTop">Studio</button><main><div class="dsHeroContent"><h1>A complete movie title</h1></div><div class="dsHeroBg" style="background-image:url(https://image.tmdb.org/t/p/w1280/scene.jpg)"></div><div class="movieCard"><a class="posterWrap"><img src="https://image.tmdb.org/t/p/w342/poster.jpg" alt="Movie poster"></a></div></main>'+markup),w=env.window;
  for(const [name,value] of Object.entries(values))w.localStorage.setItem(name,value);
  w.boot('studio/studio.js');assert(w.SwiflyStudio,'The rebuilt Studio must initialize');return env;
}
function click(env,selector){const element=env.window.document.querySelector(selector);assert(element,'Missing Studio control '+selector);element.click();return element;}
test('Studio is an accessible workspace with preview, grouped controls and explicit save actions',()=>{
  const env=browser(shell),d=env.window.document;
  assert(d.querySelector('dialog#controlPanel[aria-labelledby]'),'Studio should use a dialog');
  assert.equal(d.querySelectorAll('#controlPanel [role="tab"]').length,11);
  assert(d.querySelector('#controlPanel [data-st-preview]'));assert(d.querySelector('[data-st-save]'));assert(d.querySelector('[data-st-cancel]'));
  assert(!shell.includes('function applyTheme(theme)'), 'The obsolete inline Studio controller must be replaced');env.finish();
});
test('Valid existing preferences migrate without clearing other browser data',()=>{
  const env=setup({'movieverse.theme':'blue','movieverse.font':'soft','movieverse.reduceMotion':'on','movieverse.layout':'posterwall','movieverse.watchlist':'keep my titles'}),d=env.window.document;
  assert.equal(d.body.dataset.stTheme,'blue');assert.equal(d.body.dataset.stFont,'soft');assert.equal(d.body.dataset.stLayout,'posterwall');
  assert(d.body.classList.contains('reduceMotion'));assert.equal(env.window.localStorage.getItem('movieverse.watchlist'),'keep my titles');env.finish();
});
test('Studio opens from the header, retains background scroll and restores opener focus',()=>{
  const env=setup(),d=env.window.document;env.page.scrollTop=600;click(env,'#controlToggleTop');
  assert(d.querySelector('#controlPanel').open);assert(d.documentElement.classList.contains('svStudioOpen'));assert.equal(env.page.scrollTop,600);
  assert.equal(d.getElementById('controlToggleTop').getAttribute('aria-expanded'),'true');click(env,'[data-st-cancel]');
  assert.equal(d.querySelector('#controlPanel').open,false);assert.equal(d.activeElement.id,'controlToggleTop');assert.equal(env.page.scrollTop,600);env.finish();
});
test('A visual preset previews live but only Save persists it',()=>{
  const env=setup(),w=env.window,d=w.document;click(env,'#controlToggleTop');click(env,'[data-st-preset="cinema"]');
  assert.equal(d.body.dataset.stTheme,'red');assert.equal(d.body.dataset.stLayout,'default');assert.equal(w.localStorage.getItem(key),null);
  assert.equal(d.querySelector('[data-st-save]').disabled,false);click(env,'[data-st-save]');
  assert.equal(d.querySelector('#controlPanel').open,false);const saved=JSON.parse(w.localStorage.getItem(key));assert.equal(saved.values.theme,'red');assert.equal(saved.values.layout,'default');env.finish();
});
test('Cancel restores every draft change and leaves saved settings untouched',()=>{
  const stored=JSON.stringify({version:1,values:{theme:'blue',layout:'posterwall',reduceMotion:true}});
  const env=setup({[key]:stored}),w=env.window,d=w.document;click(env,'#controlToggleTop');click(env,'[data-st-preset="cinema"]');click(env,'[data-st-cancel]');
  assert.equal(d.body.dataset.stTheme,'blue');assert.equal(d.body.dataset.stLayout,'posterwall');assert(d.body.classList.contains('reduceMotion'));
  assert.equal(w.localStorage.getItem(key),stored);env.finish();
});
test('Preset selection preserves an existing Reduce motion preference',()=>{
  const env=setup({'movieverse.reduceMotion':'on'}),d=env.window.document;click(env,'#controlToggleTop');click(env,'[data-st-preset="midnight"]');
  assert(d.body.classList.contains('reduceMotion'));assert.equal(d.querySelector('[data-st-setting="reduceMotion"]').checked,true);env.finish();
});
test('Keyboard tabs switch panels and expose the selected tab',()=>{
  const env=setup(),w=env.window,d=w.document;click(env,'#controlToggleTop');const first=d.querySelector('[role="tab"]');first.focus();
  first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  const active=d.activeElement;assert.equal(active.dataset.stTab,'wallpapers');assert.equal(active.getAttribute('aria-selected'),'true');
  assert.equal(d.getElementById(active.getAttribute('aria-controls')).hidden,false);assert.equal(first.getAttribute('aria-selected'),'false');env.finish();
});
test('Reset only previews defaults and never clears sessions or saved titles',()=>{
  const env=setup({'movieverse.theme':'green','swiflytv.session':'session data','movieverse.watchlist':'saved movies'}),w=env.window,d=w.document;
  click(env,'#controlToggleTop');click(env,'[data-st-reset]');assert.equal(d.body.dataset.stTheme,'default');click(env,'[data-st-cancel]');assert.equal(d.body.dataset.stTheme,'green');
  assert.equal(w.localStorage.getItem('swiflytv.session'),'session data');assert.equal(w.localStorage.getItem('movieverse.watchlist'),'saved movies');env.finish();
});
test('Storage failure keeps the workspace open and offers an honest error',()=>{
  const env=setup(),w=env.window,d=w.document;click(env,'#controlToggleTop');click(env,'[data-st-preset="midnight"]');
  w.Storage.prototype.setItem=function(){throw new Error('Storage blocked');};click(env,'[data-st-save]');
  assert(d.querySelector('#controlPanel').open);assert.match(d.querySelector('[data-st-status]').textContent,/could not save/i);assert.equal(w.localStorage.getItem(key),null);env.finish();
});
test('Invalid saved values fall back to valid appearance defaults',()=>{
  const env=setup({[key]:JSON.stringify({version:1,values:{theme:'broken',font:'bad',smooth:'yes',reduceMotion:'on'}})}),d=env.window.document;
  assert.equal(d.body.dataset.stTheme,'default');assert.equal(d.body.dataset.stFont,'default');assert.equal(d.body.dataset.svScroll,'smooth');assert.equal(d.body.classList.contains('reduceMotion'),false);env.finish();
});
test('The preview uses the current title and existing artwork',()=>{
  const env=setup(),d=env.window.document;click(env,'#controlToggleTop');
  assert.equal(d.querySelector('[data-st-preview-title]').textContent,'A complete movie title');assert.equal(d.querySelector('[data-st-preview] img').getAttribute('src'),'https://image.tmdb.org/t/p/w342/poster.jpg');env.finish();
});
test('A delayed close event does not undo a newly reopened Studio draft',()=>{
  const env=setup(),w=env.window,d=w.document,queued=[];w.HTMLDialogElement.prototype.close=function(){this.open=false;queued.push(()=>this.dispatchEvent(new w.Event('close')));};
  click(env,'#controlToggleTop');click(env,'[data-st-cancel]');click(env,'#controlToggleTop');click(env,'[data-st-preset="cinema"]');queued.shift()();
  assert(d.querySelector('#controlPanel').open);assert(d.documentElement.classList.contains('svStudioOpen'));assert.equal(d.body.dataset.stTheme,'red');env.finish();
});
test('Native scrolling selected in Studio disables the mouse-wheel glide after saving',async()=>{
  const env=setup(),w=env.window,d=w.document;w.boot('motion.js');click(env,'#controlToggleTop');click(env,'[data-st-tab-link="motion"]');
  click(env,'[data-st-setting="smooth"]');click(env,'[data-st-save]');await tick();
  const wheel=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});d.querySelector('main').dispatchEvent(wheel);w.flush(16);
  assert.equal(wheel.defaultPrevented,false);assert.equal(env.page.scrollTop,0);env.finish();
});
test('Controller navigation and Back target Studio when it opens above movie details',()=>{
  const env=setup(),w=env.window,d=w.document;
  const details=d.createElement('dialog');details.className='svDetailDialog';details.open=true;details.innerHTML='<button id="moviePlay">Play movie</button>';d.body.append(details);
  for(const button of d.querySelectorAll('button'))button.getBoundingClientRect=()=>({width:80,height:40,top:100,left:100,bottom:140,right:180});
  w.localStorage.setItem('swiflytv.tvFocusMode','true');
  const controller=tvControllerSource(browser(shell).window.document);
  assert(controller);w.eval(controller);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  click(env,'#controlToggleTop');const connected=new w.Event('gamepadconnected');connected.gamepad={id:'Studio controller'};w.dispatchEvent(connected);
  assert(d.getElementById('controlPanel').contains(d.activeElement),'The active Studio must retain controller focus');
  w.navigator.getGamepads=()=>[{id:'Studio controller',axes:[0,0,0,0],buttons:Array.from({length:17},(_,index)=>({pressed:index===1,value:index===1?1:0}))}];
  w.flush(16);assert.equal(d.getElementById('controlPanel').open,false,'Back should close the foreground Studio');assert.equal(details.open,true,'Movie details underneath should stay open');env.finish();
});
test('TV navigation can reach and toggle both Motion switches',()=>{
  const env=setup(),w=env.window,d=w.document;
  const style=d.createElement('style');style.textContent=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/studio/studio.css'),'utf8');d.head.append(style);
  click(env,'#controlToggleTop');click(env,'[data-st-tab="motion"]');
  const nav=d.querySelector('[data-st-tab="motion"]'),smooth=d.querySelector('[data-st-setting="smooth"]'),reduce=d.querySelector('[data-st-setting="reduceMotion"]');
  for(const [node,top] of [[nav,100],[smooth,200],[reduce,300]])node.getBoundingClientRect=()=>({width:40,height:24,top,left:100,bottom:top+24,right:140});
  w.localStorage.setItem('swiflytv.tvFocusMode','true');
  const controller=tvControllerSource(browser(shell).window.document);
  w.eval(controller);d.dispatchEvent(new w.Event('DOMContentLoaded'));nav.focus();
  nav.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(d.activeElement,smooth,'The smooth-scrolling switch must be reachable by D-pad');
  smooth.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(smooth.checked,false,'TV Select should toggle the switch');
  smooth.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(d.activeElement,reduce);
  reduce.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert(d.body.classList.contains('reduceMotion'));env.finish();
});
test('Solid glass keeps the profile dropdown opaque after its glass pane is hidden',()=>{
  const env=setup(),w=env.window,d=w.document,fs=require('node:fs'),path=require('node:path');
  const header=d.createElement('header');header.dataset.svLiquidNav='';header.innerHTML='<details open class="dsProfileMenu"><div class="dsProfileDropdown svLiquidDropdown"><div class="svLiquidPane"></div><a href="/account">Account</a></div></details>';d.body.append(header);
  for(const file of ['liquid-glass/liquid-glass.css','clean/clean.css','studio/studio.css']){const style=d.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');d.head.append(style);}
  click(env,'#controlToggleTop');click(env,'[data-st-field="glass"][data-st-value="off"]');click(env,'[data-st-save]');
  assert.equal(w.getComputedStyle(header.querySelector('.svLiquidPane')).display,'none');
  assert.notEqual(w.getComputedStyle(header.querySelector('.svLiquidDropdown')).backgroundColor,'rgba(0, 0, 0, 0)','Solid surfaces need an opaque menu background');env.finish();
});
test('Switching Studio panels resets the mobile content scroller',()=>{
  const env=setup(),d=env.window.document;click(env,'#controlToggleTop');
  const workspace=d.querySelector('.stWorkspaceBody');workspace.scrollTop=500;
  click(env,'[data-st-tab="motion"]');assert.equal(workspace.scrollTop,0,'A new panel must start at the top on small screens');env.finish();
});

test('Studio restores native button styling and selected tabs',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../public/studio/studio.css'),'utf8');
 assert(css.includes('.stNavigation > button[aria-selected="true"]'));
 assert(css.includes('.stChoice[aria-pressed="true"]'));
 assert(!css.includes("/* A small polish to Studio's existing layout."),'temporary button overrides are removed');
 const env=setup(),d=env.window.document;click(env,'#controlToggleTop');
 assert(d.querySelector('#controlPanel').open);
 assert(d.querySelectorAll('#controlPanel [data-st-tab]').length>=3);
 env.finish();
});
