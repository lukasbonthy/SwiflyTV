'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { browser, cleanup } = require('./ui-helpers.cjs');
test.afterEach(cleanup);

test('cinema sections reveal once as they enter the viewport', () => {
  const env = browser('<main data-cinema-page><section data-cinema-reveal>Room controls</section></main>');
  const { window: w } = env;
  const section = w.document.querySelector('section');
  section.getBoundingClientRect = () => ({ top: 1200 });
  const watched = [], released = [];
  let observe;
  w.IntersectionObserver = class {
    constructor(callback) { observe = callback; }
    observe(node) { watched.push(node); }
    unobserve(node) { released.push(node); }
    disconnect() {}
  };
  w.boot('motion.js');
  assert.deepEqual(watched, [section]);
  assert(section.classList.contains('svMotionReveal'));
  observe([{ target: section, isIntersecting: true }]);
  assert(section.classList.contains('svMotionVisible'));
  assert.deepEqual(released, [section]);
  w.SwiflyMotion.refresh();
  assert.equal(watched.length, 1);
  env.finish();
});

test('switching to reduced motion reveals pending cinema content immediately', () => {
  const env = browser('<main data-cinema-page><section data-cinema-reveal>Profile actions</section></main>');
  const w = env.window, section = w.document.querySelector('section');
  section.getBoundingClientRect = () => ({ top: 1200 });
  w.boot('motion.js');
  assert(section.classList.contains('svMotionReveal'));
  w.reduceMotion(true);
  assert(section.classList.contains('svMotionVisible'));
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('reduced motion and missing observer support leave cinema content visible', () => {
  for (const reduced of [true, false]) {
    const env = browser('<main data-cinema-page><section data-cinema-reveal>Movie controls</section></main>', { reduced });
    env.window.IntersectionObserver = undefined;
    env.window.document.querySelector('section').getBoundingClientRect = () => ({ top: 1200 });
    env.window.boot('motion.js');
    assert.equal(env.window.document.querySelector('section').classList.contains('svMotionReveal'), false);
    env.finish();
  }
});
