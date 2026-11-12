'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const fragment='<article class="svTitleDetails"><h1>Prepared movie</h1><p>The story</p></article>';
function setup(options={}){
  const env=browser('<a href="/movie/101" id="open">Details</a>',options),w=env.window,animations=[],timers=new Map();let id=0;
  Object.defineProperty(w,'innerWidth',{value:390,configurable:true});
  w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};w.clearTimeout=id=>timers.delete(id);
  w.HTMLElement.prototype.animate=function(frames,settings){
    let resolve,reject,ready;const animation={frames,settings,paused:false,pause(){this.paused=true;},play(){this.paused=false;},cancel(){reject(new Error('cancelled'));},finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},...(options.deferReady?{ready:new Promise(yes=>ready=yes),commit(){ready();}}:{})};animations.push(animation);return animation;
  };
  w.fetch=async()=>({ok:true,text:async()=>fragment});w.boot('details.js');
  return {...env,animations,timers,fire(delay){const timer=[...timers].find(([,timer])=>timer.delay===delay);assert(timer,'Expected preparation timer '+delay);timers.delete(timer[0]);timer[1].fn();}};
}

test('mobile details prepare content and a painted frame before the softer entrance',async()=>{
  const env=setup(),w=env.window,d=w.document;
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  assert(d.querySelector('.svDetailDialog h1'));
  assert(env.animations.every(animation=>animation.paused));
  w.flush(16);assert(env.animations.every(animation=>animation.paused),'One frame must paint prepared content before it moves');
  w.flush(32);assert(env.animations.every(animation=>!animation.paused));
  assert(env.animations.every(animation=>animation.settings.duration===560));
  for(const animation of env.animations)animation.finish();await tick();
  assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');env.finish();
});

test('late mobile metadata waits until the moving sheet settles',async()=>{
  const env=setup(),w=env.window,d=w.document;let respond;
  w.fetch=()=>new Promise(resolve=>respond=resolve);
  const opening=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  assert.equal(d.documentElement.hasAttribute('data-sv-detail-depth'),false,'background depth waits with the prepared sheet');
  env.fire(400);w.flush(16);assert.equal(d.documentElement.hasAttribute('data-sv-detail-depth'),false,'the preparation paint cannot start the background early');w.flush(32);
  assert.equal(d.documentElement.dataset.svDetailDepth,'back','background and sheet launch together');
  assert(env.animations.every(animation=>!animation.paused));
  respond({ok:true,text:async()=>fragment});await tick();
  assert.equal(d.querySelector('.svDetailDialog h1'),null,'A network response cannot rebuild a moving sheet');
  for(const animation of env.animations)animation.finish();await opening;
  assert.equal(d.querySelector('.svDetailDialog h1').textContent,'Prepared movie');env.finish();
});

test('closing a prepared mobile entry cancels its launch and stale metadata',async()=>{
  const env=setup(),w=env.window,d=w.document;let respond;
  w.fetch=()=>new Promise(resolve=>respond=resolve);
  const opening=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  w.SwiflyDetails.close();respond({ok:true,text:async()=>fragment});await opening;
  assert.equal(d.querySelector('.svDetailDialog h1'),null);
  assert(![...env.timers.values()].some(timer=>timer.delay===400),'A closed preparation cannot launch later');
  for(const animation of env.animations)animation.finish();await tick();
  assert.equal(d.querySelector('dialog').open,false);assert.equal(w.frameCount(),0);env.finish();
});

test('mobile reduced motion does not wait for preparation or animate the sheet',async()=>{
  const env=setup({reduced:true}),w=env.window,d=w.document;
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert.equal(env.animations.length,0);assert.equal(env.timers.size,0);env.finish();
});

test('a newer mobile title reuses preparation without launching stale content',async()=>{
  const env=setup(),w=env.window,d=w.document,responses=new Map();
  w.fetch=url=>new Promise(resolve=>responses.set(url,resolve));
  const first=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  const second=w.SwiflyDetails.open('/movie/202');
  responses.get('/movie/101?view=modal')({ok:true,text:async()=>fragment});await first;
  assert.equal(d.querySelector('.svDetailDialog h1')?.textContent,undefined);
  responses.get('/movie/202?view=modal')({ok:true,text:async()=>fragment.replace('Prepared movie','New title')});await second;
  assert.equal(d.querySelector('.svDetailDialog h1')?.textContent,'New title');
  w.flush(16);w.flush(32);assert(env.animations.every(animation=>!animation.paused));
  assert(![...env.timers.values()].some(timer=>timer.delay===400));env.finish();
});

test('changing reduced motion during preparation releases the sheet immediately',async()=>{
  const env=setup(),w=env.window,d=w.document;let respond;
  w.fetch=()=>new Promise(resolve=>respond=resolve);
  const opening=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  w.reduceMotion(true);respond({ok:true,text:async()=>fragment});await opening;
  assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert.equal(env.timers.size,0);assert.equal(w.frameCount(),0);env.finish();
});

test('touching posters to begin scrolling does not prefetch or parse movie details',async()=>{
  const env=setup(),w=env.window,d=w.document;let requests=0;
  w.fetch=async()=>{requests++;return {ok:true,text:async()=>fragment};};
  for(const type of ['pointerover','pointerdown']){
    const event=new w.MouseEvent(type,{bubbles:true,button:0});Object.defineProperty(event,'pointerType',{value:'touch'});d.getElementById('open').dispatchEvent(event);
  }
  assert.equal(requests,0,'A finger-down can become a swipe and is not a request for movie metadata');
  assert(![...env.timers.values()].some(timer=>timer.delay===100),'Touch hover must not queue a delayed prefetch');
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));assert.equal(requests,1,'Opening the title still loads its real details');env.finish();
});

test('choosing a newer title does not replace content during a moving mobile entrance',async()=>{
  const env=setup(),w=env.window,d=w.document;
  w.fetch=async url=>({ok:true,text:async()=>url.includes('/202')?fragment.replace('Prepared movie','New title'):fragment});
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));w.flush(16);w.flush(32);
  const second=w.SwiflyDetails.open('/movie/202');await tick();
  assert.equal(d.querySelector('.svDetailDialog h1')?.textContent,'Prepared movie','A title change must wait for the current glide');
  for(const animation of env.animations)animation.finish();await second;
  assert.equal(d.querySelector('.svDetailDialog h1')?.textContent,'New title');env.finish();
});

test('the mobile watchdog waits for compositor readiness before timing the glide',async()=>{
  const env=setup({deferReady:true}),w=env.window,d=w.document;
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));w.flush(16);w.flush(32);
  assert(![...env.timers.values()].some(timer=>timer.delay<2000),'Slow compositor startup must not consume the animation watchdog');
  for(const animation of env.animations)animation.commit();await tick();
  assert([...env.timers.values()].some(timer=>timer.delay===1060),'The glide receives its duration plus a generous completion margin after readiness');
  for(const animation of env.animations)animation.finish();await tick();
  assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert.equal(env.timers.size,0);env.finish();
});
