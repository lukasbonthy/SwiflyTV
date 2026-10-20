'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser,source,cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

test('wheel motion switches full liquid refraction to soft glass and restores at native idle', async () => {
  const env=browser('<section class="movieRail"><article class="movieCard"><a class="dsThumb" href="/movie/5">Film</a></article></section>'),w=env.window,d=w.document;
  w.boot('scroll.js');
  const poster=d.querySelector('.dsThumb');
  poster.dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:240}));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  assert.equal(w.frameCount(),0,'native fallback adds no scripted frames');
  await new Promise(resolve=>setTimeout(resolve,190));
  assert.equal(d.documentElement.dataset.svScrollGlass,undefined);
  w.SwiflyPremiumScroll.destroy();env.finish();
});

test('native scroll speed restores real glass before movement fully ends', () => {
  const env=browser('<main>Catalog</main>'),w=env.window,d=w.document;
  let clock=100; w.performance.now=()=>clock;
  w.boot('scroll.js');
  d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:160}));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  clock=116;w.scrollTo({top:110});d.dispatchEvent(new w.Event('scroll'));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  clock=225;w.scrollTo({top:111});d.dispatchEvent(new w.Event('scroll'));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  clock=245;w.scrollTo({top:112});d.dispatchEvent(new w.Event('scroll'));
  assert.equal(d.documentElement.dataset.svScrollGlass,undefined,'tiny positive motion reactivates full refraction');
  w.SwiflyPremiumScroll.destroy();env.finish();
});

test('high velocity Lenis frames use soft glass; slow frames restore original lens before glide ends', () => {
  const env=browser('<main>Films</main>'),w=env.window,d=w.document;
  let clock=100,engine;
  w.performance.now=()=>clock;
  w.Lenis=class {
    constructor(){engine=this;this.isScrolling=false;this.positions=[];}
    on(_event,callback){this.wake=callback;}
    raf(){if(!this.positions.length)return; const delta=this.positions.shift();w.scrollTo({top:w.scrollY+delta});this.isScrolling='smooth';}
    stop(){this.isScrolling=false;} start(){}
    destroy(){this.isScrolling=false;}
  };
  w.boot('scroll.js');
  d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:200}));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  engine.positions=[50,30,2,1,1,1,1]; engine.wake();
  const frames=[116,132,148,164,180,196,212];
  const result=[];
  for(const now of frames){clock=now;w.flush(now);result.push(d.documentElement.dataset.svScrollGlass);}
  assert.equal(result[0],'soft');
  assert.equal(result[1],'soft');
  assert.equal(result[result.length-1],undefined,'slow frames resume the original glass even during a continued Lenis glide');
  assert.equal(engine.isScrolling,'smooth');
  w.SwiflyPremiumScroll.destroy();env.finish();
});

test('adaptive CSS bypasses SVG shaders with frosted blur and respects appearance preferences', () => {
  const css=source('performance.css');
  const js=source('scroll.js');
  assert.match(css,/data-sv-scroll-glass="soft"/);
  assert.match(css,/\.svLiquidPane\.svLiquidPane/);
  assert.match(css,/backdrop-filter:\s*blur\(4px\) saturate\(1\.10\) !important/);
  assert.match(css,/data-st-glass="off"/);
  assert.match(css,/data-st-glass="subtle"/);
  assert.match(css,/prefers-reduced-transparency: no-preference/);
  assert.match(js,/glassSpeedThreshold = \.115/);
  assert.match(js,/sampleLenisGlass\(elapsed\)/);
  assert.doesNotMatch(js,/setInterval\(/);
});

test('Xbox, player and explicit glass-off preferences do not acquire the adaptive layer', () => {
  const env=browser('<main>Films</main>'),w=env.window,d=w.document;
  w.boot('scroll.js');
  d.documentElement.dataset.svXbox='true';
  d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{deltaY:150,bubbles:true,cancelable:true}));
  assert.equal(d.documentElement.dataset.svScrollGlass,undefined);
  delete d.documentElement.dataset.svXbox;
  d.body.dataset.stGlass='off';
  d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{deltaY:150,bubbles:true,cancelable:true}));
  assert.equal(d.documentElement.dataset.svScrollGlass,undefined);
  d.body.dataset.stGlass='liquid';
  d.querySelector('main').dispatchEvent(new w.WheelEvent('wheel',{deltaY:150,bubbles:true,cancelable:true}));
  assert.equal(d.documentElement.dataset.svScrollGlass,'soft');
  w.SwiflyPremiumScroll.destroy();
  assert.equal(d.documentElement.dataset.svScrollGlass,undefined,'destroy leaves no page-wide override');
  env.finish();
});
