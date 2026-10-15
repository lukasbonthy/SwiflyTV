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

test('A discrete wheel step responds on the first frame and finishes within a quarter second', () => {
  for (const interval of [8, 16]) {
    const env = browser('<main>Catalog</main>'), w = env.window;
    w.boot('motion.js');
    assert.equal(wheel(w, w.document.querySelector('main')).defaultPrevented, true);
    w.flush(interval);
    assert(env.page.scrollTop >= 24 && env.page.scrollTop < 65, 'The first frame should feel responsive without jumping the full wheel distance');
    for (let time = interval * 2; time <= 240; time += interval) w.flush(time);
    assert.equal(env.page.scrollTop, 120, 'The browser must receive the ordinary wheel distance by 240ms');
    assert.equal(w.frameCount(), 0, 'The easing must have a bounded finish with no idle frame');
    env.finish();
  }
});

test('A delayed frame finishes wheel motion without adding a long settling tail', () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.boot('motion.js');
  wheel(w, w.document.querySelector('main'));
  w.flush(16); w.flush(300);
  assert.equal(env.page.scrollTop, 120, 'Elapsed time should finish the gesture after a delayed frame');
  assert.equal(w.frameCount(), 0);
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

test('Fine scrolling past an offscreen hero leaves no presentation frame queued', () => {
  const env = browser('<div class="dsHero"></div>'), w = env.window, d = w.document, hero = d.querySelector('.dsHero');
  let boxes = 0, writes = 0, schedules = 0;
  hero.getBoundingClientRect = () => {boxes++; return {top:0, height:500};};
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

test('Section reveals finish promptly and remain visible without JavaScript or after preference changes', () => {
  const env = browser('<section class="svCatalogRow">Movies</section>'), w = env.window, d = w.document, section = d.querySelector('section');
  const style = d.createElement('style'); style.textContent = source('motion.css'); d.head.append(style);
  assert.notEqual(w.getComputedStyle(section).opacity, '0', 'Content is available before motion initializes');
  section.getBoundingClientRect = () => ({top:1600, height:400});
  w.boot('motion.js');
  const durations = [...w.getComputedStyle(section).transition.matchAll(/([.\d]+)(ms|s)\b/g)].map(([, value, unit]) => Number(value) * (unit === 's' ? 1000 : 1));
  assert(durations.length > 0 && Math.max(...durations) <= 450, 'An entering section should finish its subtle reveal within 450ms');
  w.reduceMotion(true);
  assert.equal(w.getComputedStyle(section).opacity, '1', 'A preference change must reveal pending content immediately');
  env.finish();
});

test('The native scroll preference immediately exposes pending reveals through CSS', () => {
  const env = browser('<section class="svCatalogRow svMotionReveal">Movies</section>'), w = env.window, d = w.document;
  const style = d.createElement('style'); style.textContent = source('motion.css'); d.head.append(style);
  d.body.dataset.svScroll = 'native';
  const computed = w.getComputedStyle(d.querySelector('section'));
  assert.equal(computed.opacity, '1', 'Content must become visible before asynchronous preference handling');
  assert.equal(computed.transition, 'none');
  env.finish();
});
