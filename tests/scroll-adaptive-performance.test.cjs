'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
function scene() {
  const env=browser('<main>Scroll testing</main>');
  const w=env.window;
  let instance,disposed=0;
  w.Lenis=class {
    constructor(options){this.options=options;this.isScrolling='smooth';instance=this;}
    raf(){this.isScrolling=this.finishNext?'stopped':'smooth';}
    on(name,fn){if(name==='virtual-scroll')this.wake=fn;}
    stop(){this.isScrolling='stopped';}
    start(){this.isScrolling='smooth';}
    destroy(){disposed++;}
    resize(){}
  };
  w.boot('scroll.js');
  return {...env,get instance(){return instance;},get disposed(){return disposed;}};
}
test('normal 60fps scroll retains premium easing and a single RAF',()=>{
  const env=scene(),w=env.window;
  assert(env.instance,'premium engine should start for fine-pointer desktop');
  env.instance.wake();
  for(let i=0;i<25;i++)w.flush(16*(i+1));
  assert.equal(env.disposed,0,'healthy frame pacing should never trigger a fallback');
  assert.equal(w.frameCount(),1,'one shared frame remains active during easing');
  w.SwiflyPremiumScroll.destroy();env.finish();
});
test('slow frames switch to native only after the active glide settles',()=>{
  const env=scene(),w=env.window;
  env.instance.wake();
  for(let i=0;i<100;i++)w.flush(16+i*48);
  assert.equal(env.disposed,0,'never snap out of the middle of an active wheel glide');
  env.instance.finishNext=true;
  w.flush(16+100*48);
  assert.equal(env.disposed,1,'after the slow glide ends, native scroll takes over');
  assert.equal(w.frameCount(),0,'fallback must leave no animation loop behind');
  w.SwiflyPremiumScroll.refresh();
  assert.equal(env.disposed,1,'fallback remains lightweight until page navigation');
  env.finish();
});
