'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function optic(){
 const env=browser('<div class="svLiquidPane" data-swifly-glass></div>'),w=env.window;
 Object.defineProperty(w.navigator,'userAgent',{value:'Chrome/130',configurable:true});
 w.CSS={supports:()=>true};
 w.HTMLElement.prototype.getBoundingClientRect=()=>({width:340,height:60,left:0,top:0,right:340,bottom:60});
 w.boot('liquid-glass/liquid-glass.js');w.flush(16);return env;
}

test('moving glass retains live refraction with one sample and no channel-compositing passes',()=>{
 const env=optic(),w=env.window,pane=w.document.querySelector('.svLiquidPane');
 const full=pane.querySelector('filter:not([data-sv-motion-filter])'),light=pane.querySelector('filter[data-sv-motion-filter]');
 assert(light,'Prepare a cheaper optical field before movement starts');
 assert.equal(full.querySelectorAll('feDisplacementMap').length,3);
 assert.equal(light.querySelectorAll('feDisplacementMap').length,1);
 assert.equal(light.querySelectorAll('feColorMatrix,feBlend').length,0);
 assert.equal(light.querySelector('feDisplacementMap').getAttribute('scale'),'-170');
 assert.equal(light.querySelector('feImage').getAttribute('href'),full.querySelector('feImage').getAttribute('href'));
 assert.equal(light.querySelector('feGaussianBlur').getAttribute('stdDeviation'),full.querySelector('feGaussianBlur').getAttribute('stdDeviation'));
 assert.equal(pane.style.getPropertyValue('--sv-glass-motion-filter'),'url(#'+light.id+')');
 assert.equal(w.frameCount(),0,'The second field adds no animation loop');
 w.SwiflyLiquidGlass.mount(pane).destroy();assert.equal(pane.style.getPropertyValue('--sv-glass-motion-filter'),'');env.finish();
});

test('native horizontal momentum gets the moving material without intercepting input',()=>{
 const env=browser('<div class="movieRail">Posters</div>'),w=env.window,d=w.document,rail=d.querySelector('.movieRail');
 w.boot('scroll.js');const gesture=new w.WheelEvent('wheel',{deltaX:120,bubbles:true,cancelable:true});rail.dispatchEvent(gesture);rail.dispatchEvent(new w.Event('scroll'));
 assert.equal(gesture.defaultPrevented,false);assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
 assert.equal(w.frameCount(),0);rail.dispatchEvent(new w.Event('scrollend'));
 assert.equal(d.documentElement.dataset.svScrollGlass,undefined);w.SwiflyPremiumScroll.destroy();env.finish();
});

test('one nested scroll ending cannot restore full optics while another is moving',()=>{
 const env=browser('<div class="movieRail">Posters</div><div class="svDetailViewport">Details</div>'),w=env.window,d=w.document;
 w.boot('scroll.js');const a=d.querySelector('.movieRail'),b=d.querySelector('.svDetailViewport');
 a.dispatchEvent(new w.Event('scroll'));b.dispatchEvent(new w.Event('scroll'));a.dispatchEvent(new w.Event('scrollend'));
 assert.equal(d.documentElement.dataset.svScrollGlass,'soft');b.dispatchEvent(new w.Event('scrollend'));
 assert.equal(d.documentElement.dataset.svScrollGlass,undefined);w.SwiflyPremiumScroll.destroy();env.finish();
});

test('the default mobile native-glass preset participates in the motion budget',()=>{
 const env=browser('<main>Films</main>'),w=env.window,d=w.document;d.body.dataset.stGlass='subtle';
 w.boot('scroll.js');d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
 assert.equal(d.documentElement.dataset.svScrollGlass,'soft');d.dispatchEvent(new w.Event('scrollend'));
 assert.equal(d.documentElement.dataset.svScrollGlass,undefined);w.SwiflyPremiumScroll.destroy();env.finish();
});

test('canceling a glide after its idle watchdog fired still restores the resting material',()=>{
 const env=browser('<main>Films</main>'),w=env.window,d=w.document,timers=new Map();let now=0,id=0,engine;
 w.performance.now=()=>now;w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;};w.clearTimeout=key=>timers.delete(key);
 const advance=value=>{now=value;for(const [key,timer]of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}};
 w.Lenis=class{constructor(options){engine=this;this.options=options;this.isScrolling=false;}on(_event,fn){this.wake=fn;}raf(){}stop(){this.isScrolling=false;}start(){}destroy(){this.isScrolling=false;}};
 w.boot('scroll.js');const main=d.querySelector('main');main.dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));engine.isScrolling='smooth';engine.wake();w.flush(16);
 advance(200);assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
 const event=new w.WheelEvent('wheel',{deltaY:120,ctrlKey:true,bubbles:true,cancelable:true});main.dispatchEvent(event);engine.options.virtualScroll({event,deltaY:120,deltaX:0});
 advance(2000);assert.equal(d.documentElement.dataset.svScrollGlass,undefined,'Cancellation must leave a rest callback even after the old watchdog returned');
 assert.equal(w.frameCount(),0);w.SwiflyPremiumScroll.destroy();env.finish();
});
