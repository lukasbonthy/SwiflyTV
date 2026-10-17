'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, source, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

function wheel(w, target, options = {}) {
  const event = new w.WheelEvent('wheel', {deltaY:120, bubbles:true, cancelable:true, ...options});
  target.dispatchEvent(event);
  return event;
}

test('Desktop wheel and trackpad scroll stay compositor-native without JS scroll writes',()=>{
 const env=browser('<main>Catalog</main>'),w=env.window,d=w.document;
 let writes=0;const native=w.scrollTo;
 w.scrollTo=options=>{writes++;return native(options);};
 w.boot('motion.js');
 const target=d.querySelector('main');
 for(const delta of [120,120,120,-120,2.5,180,-240]) {
   const gesture=wheel(w,target,{deltaY:delta,deltaMode:0});
   assert.equal(gesture.defaultPrevented,false,'never cancel native scroll input');
 }
 assert.equal(writes,0,'wheel input does not synthesize scrollTo calls');
 assert.equal(w.frameCount(),0,'wheel input needs no JavaScript frame loop');
 env.finish();
});
test('No document-level blocking wheel handler remains in the motion controller',()=>{
 const code=source('motion.js');
 assert.match(code,/addEventListener\('wheel', onWheel, \{passive:true\}\)/);
 assert.doesNotMatch(code,/event\.preventDefault\(\)/);
 assert.doesNotMatch(code,/wheelBursts|sendWheelTarget|wheelWriteInterval/);
});
test('Programmatic carousel/navigation glides are interrupted by manual native wheel input',()=>{
 const env=browser('<main>Catalog</main>'),w=env.window,d=w.document;
 w.boot('motion.js');
 w.SwiflyMotion.scrollBy(null,{top:120});
 assert.equal(w.frameCount(),1);
 w.flush(16);assert(env.page.scrollTop>0);
 w.flush(240);assert(env.page.scrollTop>100);
 w.flush(480);assert.equal(env.page.scrollTop,120);
 assert.equal(w.frameCount(),0);
 w.SwiflyMotion.scrollBy(null,{top:240});w.flush(496);
 const current=env.page.scrollTop;
 assert.equal(wheel(w,d.querySelector('main')).defaultPrevented,false);
 assert.equal(w.frameCount(),0,'the native wheel cancels programmed glides');
 assert.equal(env.page.scrollTop,current,'browser-native motion is not simulated by jsdom');
 w.flush(560);assert.equal(env.page.scrollTop,current);
 env.finish();
});

test('Native coarse scrolling changes navigation state without hero measurements, writes or RAFs', () => {
  const env = browser('<div class="dsHero"></div>'), w = env.window, d = w.document, hero = d.querySelector('.dsHero');
  w.matchMedia('(pointer: fine)').matches = false;
  let boxes = 0, writes = 0, schedules = 0;
  hero.getBoundingClientRect = () => {boxes++; return {top:0, height:500};};
  const set = hero.style.setProperty.bind(hero.style), raf = w.requestAnimationFrame;
  hero.style.setProperty = (...args) => {writes++; return set(...args);};
  w.requestAnimationFrame = callback => {schedules++; return raf(callback);};
  w.boot('motion.js');
  for (let i = 1; i <= 100; i++) {
    env.page.scrollTop = i * 10; d.dispatchEvent(new w.Event('scroll')); w.flush(i * 16);
  }
  assert.equal(d.body.dataset.svScrolled, 'true');
  assert.equal(boxes, 0, 'Coarse pointers should keep the existing art without measuring decorative parallax');
  assert.equal(writes, 0, 'Native touch momentum should never write hero offsets');
  assert.equal(schedules, 0, 'Navigation threshold changes do not need presentation frames');
  env.finish();
});

test('A visible desktop hero does not repaint its masked artwork during manual scroll by default',()=>{
  const env=browser('<div class="dsHero"></div>'),w=env.window,d=w.document,hero=d.querySelector('.dsHero');
  let measurements=0,writes=0,schedules=0;
  hero.getBoundingClientRect=()=>{measurements++;return {top:0,height:500};};
  const previous=hero.style.setProperty.bind(hero.style),raf=w.requestAnimationFrame;
  hero.style.setProperty=(...args)=>{writes++;return previous(...args);};
  w.requestAnimationFrame=fn=>{schedules++;return raf(fn);};
  w.boot('motion.js');
  for(let i=0;i<140;i++){
    env.page.scrollTop=i*4;
    d.dispatchEvent(new w.Event('scroll'));
    w.flush(i*7);
  }
  assert.equal(measurements,0,'no frame-time hero geometry reads on high-refresh catalog scrolls');
  assert.equal(writes,0,'large hero image stays compositor-static instead of repainting every frame');
  assert.equal(schedules,0,'hero art should not compete with native wheel animation');
  env.finish();
});

test('Fine scrolling past an offscreen hero leaves no presentation frame queued', () => {
  const env = browser('<div class="dsHero"></div>'), w = env.window, d = w.document, hero = d.querySelector('.dsHero');
  let boxes = 0, writes = 0, schedules = 0;
  hero.getBoundingClientRect = () => {boxes++; return {top:0, height:500};};
  d.body.dataset.svScrollArt = 'on'; // Explicit opt-in to the legacy decorative hero presentation.
  w.boot('motion.js'); boxes = 0;
  const set = hero.style.setProperty.bind(hero.style), raf = w.requestAnimationFrame;
  hero.style.setProperty = (...args) => {writes++; return set(...args);};
  w.requestAnimationFrame = callback => {schedules++; return raf(callback);};
  for (let i = 0; i < 100; i++) {
    env.page.scrollTop = 900 + i; d.dispatchEvent(new w.Event('scroll')); w.flush(i * 16);
  }
  assert.equal(boxes, 0, 'Offscreen scrolls use the last measured hero bounds');
  assert.equal(writes, 0, 'An offscreen hero needs no transform updates');
  assert.equal(schedules, 0, 'An offscreen hero must not keep the presentation path active');
  env.page.scrollTop = 100; d.dispatchEvent(new w.Event('scroll')); w.flush(1600);
  assert.equal(hero.style.getPropertyValue('--sv-hero-offset'), '7.50px', 'Visible hero motion resumes with the current page position');
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('A pointer change to touch interrupts motion and releases decorative hero work', () => {
  const env = browser('<main>Catalog</main><div class="dsHero"></div>'), w = env.window, d = w.document;
  const hero = d.querySelector('.dsHero');
  hero.getBoundingClientRect = () => ({top:0, height:500});
  w.boot('motion.js'); wheel(w, d.querySelector('main')); w.flush(16);
  const current = env.page.scrollTop, fine = w.matchMedia('(pointer: fine)');
  fine.matches = false; for (const listener of fine.listeners) listener({matches:false});
  d.dispatchEvent(new w.Event('scroll')); w.flush(32);
  assert.equal(env.page.scrollTop, current);
  assert.equal(hero.style.getPropertyValue('--sv-hero-offset'), '');
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('Non-cancelable wheel delivery and player surfaces retain native input', () => {
  for (const [markup, options] of [['<main>Catalog</main>', {cancelable:false}], ['<main data-player-root><p>Video controls</p></main>', {}]]) {
    const env = browser(markup), w = env.window;
    w.boot('motion.js');
    assert.equal(wheel(w, w.document.querySelector('main'), options).defaultPrevented, false);
    assert.equal(w.frameCount(), 0, 'The controller must not compete with native playback or non-cancelable wheel input');
    env.finish();
  }
});

test('Catalog rails stay visible and do not queue costly opacity/transform reveals',()=>{
  const env=browser('<section class="svCatalogRow">Movies</section><section class="svResumeSection">Continue</section><section class="svDetailSection">Extra details</section>'),w=env.window,d=w.document;
  for(const section of d.querySelectorAll('section'))section.getBoundingClientRect=()=>({top:2200,height:400});
  w.boot('motion.js');
  assert.equal(d.querySelector('.svCatalogRow').classList.contains('svMotionReveal'),false);
  assert.equal(d.querySelector('.svResumeSection').classList.contains('svMotionReveal'),false);
  assert.equal(d.querySelector('.svDetailSection').classList.contains('svMotionReveal'),true,'theater details can keep premium entrance reveals');
  env.finish();
});

test('Section reveals have a measured settle and remain visible without JavaScript or after preference changes', () => {
  const env = browser('<section class="svDetailSection">Details</section>'), w = env.window, d = w.document, section = d.querySelector('section');
  const style = d.createElement('style'); style.textContent = source('motion.css'); d.head.append(style);
  assert.notEqual(w.getComputedStyle(section).opacity, '0', 'Content is available before motion initializes');
  section.getBoundingClientRect = () => ({top:1600, height:400});
  w.boot('motion.js');
  const durations = [...w.getComputedStyle(section).transition.matchAll(/([.\d]+)(ms|s)\b/g)].map(([, value, unit]) => Number(value) * (unit === 's' ? 1000 : 1));
  assert(durations.length > 0 && Math.max(...durations) >= 650 && Math.max(...durations) <= 1000, 'Entering sections should settle gradually without keeping content in motion indefinitely');
  w.reduceMotion(true);
  assert.equal(w.getComputedStyle(section).opacity, '1', 'A preference change must reveal pending content immediately');
  env.finish();
});

test('The native scroll preference immediately exposes pending reveals through CSS', () => {
  const env = browser('<section class="svDetailSection svMotionReveal">Details</section>'), w = env.window, d = w.document;
  const style = d.createElement('style'); style.textContent = source('motion.css'); d.head.append(style);
  d.body.dataset.svScroll = 'native';
  const computed = w.getComputedStyle(d.querySelector('section'));
  assert.equal(computed.opacity, '1', 'Content must become visible before asynchronous preference handling');
  assert.equal(computed.transition, 'none');
  env.finish();
});

test('Motion preference observer ignores dynamic catalog subtree mutations',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/clean/motion.js'),'utf8');
 assert(src.includes("preferenceObserver.observe(document.body, {attributes:true, attributeFilter:['class','style','data-sv-scroll','data-sv-scroll-art']});"));
 assert(!src.includes("attributeFilter:['class','style','data-sv-scroll'], childList:true, subtree:true"),'new SVG, poster and player elements cannot invalidate every wheel-style cache');
});
