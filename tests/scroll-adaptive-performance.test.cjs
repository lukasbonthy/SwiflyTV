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
test('repeated short laggy glides accumulate evidence instead of resetting at every pause',()=>{
 const env=scene(),w=env.window;let now=100;
 w.performance.now=()=>now;
 for(let gesture=0;gesture<10&&env.disposed===0;gesture++){
  env.instance.finishNext=false;env.instance.wake();
  for(let frame=0;frame<10;frame++){now+=48;w.flush(now);}
  assert.equal(env.disposed,0,'fallback waits until the current gesture settles');
  env.instance.finishNext=true;now+=48;w.flush(now);now+=120;
 }
 assert.equal(env.disposed,1,'ordinary short wheel gestures must be able to trigger sustained-jank recovery');
 assert.equal(w.frameCount(),0);env.finish();
});
test('an isolated slow gesture and a long pause do not poison later healthy glides',()=>{
 const env=scene(),w=env.window;let now=100;w.performance.now=()=>now;
 env.instance.wake();for(let frame=0;frame<10;frame++){now+=48;w.flush(now);}
 env.instance.finishNext=true;now+=48;w.flush(now);now+=12000;
 for(let gesture=0;gesture<12;gesture++){
  env.instance.finishNext=false;env.instance.wake();
  for(let frame=0;frame<20;frame++){now+=16;w.flush(now);}
  env.instance.finishNext=true;now+=16;w.flush(now);now+=100;
 }
 assert.equal(env.disposed,0,'healthy scrolling keeps premium easing after a transient stall');
 w.SwiflyPremiumScroll.destroy();env.finish();
});
test('healthy glides do not prime a fallback from one subsequent short stall',()=>{
 const env=scene(),w=env.window;let now=100;w.performance.now=()=>now;
 for(let gesture=0;gesture<12;gesture++){
  env.instance.finishNext=false;env.instance.wake();
  for(let frame=0;frame<20;frame++){now+=16;w.flush(now);}
  env.instance.finishNext=true;now+=16;w.flush(now);now+=100;
 }
 env.instance.finishNext=false;env.instance.wake();
 for(let frame=0;frame<4;frame++){now+=48;w.flush(now);}
 env.instance.finishNext=true;now+=16;w.flush(now);
 assert.equal(env.disposed,0,'one short interruption after healthy movement is not sustained jank');
 w.SwiflyPremiumScroll.destroy();env.finish();
});
