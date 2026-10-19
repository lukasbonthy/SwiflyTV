'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, loadServer, tick, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

function setup(markup = '<main>Catalog</main>', options = {}) {
  const env = browser(markup, options), w = env.window;
  let now = 0, reference, referenceFrame;
  const flush = w.flush;
  Object.defineProperty(w.performance, 'now', {value:() => now});
  env.at = time => {now = time;};
  w.flush = time => {now = time; flush(time);};
  Object.defineProperties(w, {innerHeight:{value:800}, innerWidth:{value:1200}});
  // jsdom's outside-only Window proxy fails its own instanceof check.
  // Lenis uses that browser check to choose document vs element dimensions.
  Object.defineProperty(w.Window, Symbol.hasInstance, {value:node => node === w});
  w.boot('vendor/lenis/lenis.min.js');
  w.boot('motion.js');
  if (options.reference) {
    // ShuttleTV's public controller uses this pinned engine's defaults and
    // feeds browser RAF timestamps directly to it. Keep it independent of
    // the adapter so changes to our routing or clock cannot change the oracle.
    reference = new w.Lenis({allowNestedScroll:true});
    reference.raf(1);
    const step = time => {reference.raf(time + 1); referenceFrame = w.requestAnimationFrame(step);};
    referenceFrame = w.requestAnimationFrame(step);
  } else w.boot('scroll.js');
  env.wheel = (deltaY = 120, target = w.document.querySelector('main'), extra = {}) => {
    const event = new w.WheelEvent('wheel', {deltaY, bubbles:true, cancelable:true, ...extra});
    target.dispatchEvent(event); return event;
  };
  env.settle = (start = 16) => {for (let time = start; time <= start + 1800; time += 16) w.flush(time);};
  const finish = env.finish;
  env.finish = () => {w.SwiflyPremiumScroll?.destroy(); reference?.destroy(); w.cancelAnimationFrame(referenceFrame); finish();};
  return env;
}

test('desktop wheel notches glide through intermediate positions and settle at the original distance', () => {
  const env = setup(), w = env.window;
  assert.equal(w.frameCount(), 0, 'the premium engine must be idle before input');
  assert.equal(env.wheel().defaultPrevented, true);
  assert.equal(env.page.scrollTop, 0, 'the input must not jump the page immediately');
  w.flush(16);
  assert(env.page.scrollTop > 0 && env.page.scrollTop < 30, 'the first frame starts the glide');
  w.flush(116);
  assert(env.page.scrollTop > 30 && env.page.scrollTop < 80, 'a notch retains a weighted glide after input ends');
  env.settle(132);
  assert.equal(env.page.scrollTop, 120, 'easing keeps the original wheel travel distance');
  assert.equal(w.frameCount(), 0, 'settled scrolling must not retain an animation loop');
  env.finish();
});

test('successive wheel pulses accumulate without restarting the glide or losing distance', () => {
  const env = setup(), w = env.window;
  for (let index = 0; index < 5; index++) {
    assert.equal(env.wheel().defaultPrevented, true); w.flush(16 + index * 16);
  }
  assert(env.page.scrollTop > 100 && env.page.scrollTop < 500);
  env.settle(96);
  assert.equal(env.page.scrollTop, 600);
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('wheel onset and deceleration match the reference at 60, 144 and 240 Hz', () => {
  for (const hz of [60, 144, 240]) {
    const env = setup(), reference = setup('<main>Catalog</main>', {reference:true});
    env.wheel(360); reference.wheel(360);
    for (let time = 1000 / hz; time <= 1200; time += 1000 / hz) {
      env.window.flush(time); reference.window.flush(time);
      assert(Math.abs(env.page.scrollTop - reference.page.scrollTop) <= 1,
        `${hz} Hz at ${time} ms: ${env.page.scrollTop} should follow ${reference.page.scrollTop}`);
    }
    env.finish(); reference.finish();
  }
});

test('a new gesture after a long idle starts smoothly instead of jumping to its target', () => {
  const env = setup(), w = env.window;
  env.wheel(); env.settle();
  const before = env.page.scrollTop;
  env.at(9999);
  env.wheel(); w.flush(10000);
  assert(env.page.scrollTop > before && env.page.scrollTop < before + 30);
  env.settle(10016);
  assert.equal(env.page.scrollTop, 240);
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('reversing a wheel gesture reverses the eased movement without a position jump', () => {
  const env = setup(), w = env.window;
  env.wheel(); w.flush(16); w.flush(116);
  const before = env.page.scrollTop;
  env.wheel(-120);
  assert.equal(env.page.scrollTop, before);
  w.flush(132);
  assert(env.page.scrollTop < before, 'the next frame moves in the new direction');
  env.settle(148);
  assert.equal(env.page.scrollTop, 0);
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('reversing a burst preserves the reference momentum and net wheel distance', () => {
  const env = setup(), w = env.window;
  const reference = setup('<main>Catalog</main>', {reference:true});
  env.page.scrollTop = 800; w.dispatchEvent(new w.Event('scroll'));
  reference.page.scrollTop = 800; reference.window.dispatchEvent(new reference.window.Event('scroll'));
  for (let index = 0; index < 4; index++) {
    env.wheel(120); reference.wheel(120);
    w.flush(16 + index * 16); reference.window.flush(16 + index * 16);
  }
  const before = env.page.scrollTop;
  env.wheel(-120); reference.wheel(-120);
  assert.equal(env.page.scrollTop, before, 'reversing cannot jump to a queued destination');
  for (let time = 80; time < 1500; time += 16) {
    w.flush(time); reference.window.flush(time);
    assert(Math.abs(env.page.scrollTop - reference.page.scrollTop) <= 1,
      'a reversal must decelerate the existing momentum without discarding queued distance');
  }
  env.settle(1504);
  assert.equal(env.page.scrollTop, 1160, 'four 120px notches down and one up keep their 360px net travel');
  assert.equal(w.frameCount(), 0); env.finish(); reference.finish();
});

test('diagonal page gestures keep vertical easing instead of jumping natively', () => {
  const env = setup(), w = env.window;
  assert.equal(env.wheel(120, w.document.querySelector('main'), {deltaX:140}).defaultPrevented, true);
  assert.equal(env.page.scrollTop, 0);
  w.flush(16);
  assert(env.page.scrollTop > 0 && env.page.scrollTop < 30);
  env.settle(32); assert.equal(env.page.scrollTop, 120); env.finish();
});

test('horizontal rail gestures with vertical noise stay native', () => {
  const env = setup('<main><div class="movieRail" style="overflow-x:auto;overflow-y:hidden"><span>Poster</span></div></main>');
  const rail = env.window.document.querySelector('.movieRail');
  Object.defineProperties(rail, {scrollWidth:{value:2000}, clientWidth:{value:300}, scrollHeight:{value:300}, clientHeight:{value:300}});
  assert.equal(env.wheel(20, rail.querySelector('span'), {deltaX:120}).defaultPrevented, false,
    'a predominantly sideways trackpad gesture must reach the horizontal rail');
  env.settle(); assert.equal(env.page.scrollTop, 0); assert.equal(env.window.frameCount(), 0); env.finish();
});

test('small wheel deltas use the same continuous easing as the reference', () => {
  const env = setup(), w = env.window;
  for (let index = 0; index < 12; index++) {env.wheel(3); w.flush(index * 8);}
  env.settle(104);
  assert.equal(env.page.scrollTop, 36);
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('keyboard, pointer and programmatic navigation interrupt pending wheel inertia', () => {
  for (const action of ['keyboard', 'pointer', 'programmatic']) {
    const env = setup(), w = env.window, d = w.document;
    env.wheel(360); w.flush(16); w.flush(64);
    const before = env.page.scrollTop;
    assert(before > 0, 'start with active inertia before interrupting it');
    if (action === 'keyboard') d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'PageDown', bubbles:true}));
    if (action === 'pointer') d.dispatchEvent(new w.Event('pointerdown', {bubbles:true}));
    if (action === 'programmatic') w.SwiflyMotion.scrollTo(null, {top:700, behavior:'instant'});
    env.settle(80);
    assert.equal(env.page.scrollTop, action === 'programmatic' ? 700 : before, action);
    assert.equal(w.frameCount(), 0);
    env.finish();
  }
});

test('modal opening stops the background glide and all modal wheel input stays native', () => {
  const env = setup('<main>Catalog</main><dialog><div class="svDetailViewport">Details</div></dialog>'), w = env.window, d = w.document;
  env.wheel(360); w.flush(16);
  const before = env.page.scrollTop;
  w.SwiflyMotion.stop(); d.querySelector('dialog').showModal();
  assert.equal(env.wheel(120, d.querySelector('.svDetailViewport')).defaultPrevented, false);
  env.settle(32);
  assert.equal(env.page.scrollTop, before);
  assert.equal(w.frameCount(), 0);
  d.querySelector('dialog').close();
  assert.equal(env.wheel().defaultPrevented, true, 'premium scrolling resumes after closing the sheet');
  env.finish();
});

test('nested scroll panels, horizontal rails, inputs and zoom gestures retain native input', () => {
  const env = setup('<main><div id="chat" style="overflow-y:auto"><p>Chat</p></div><div class="movieRail"><span>Poster</span></div><input><div contenteditable="true">Editor</div><div data-player-root>Player</div></main>'), w = env.window, d = w.document;
  const chat = d.querySelector('#chat');
  Object.defineProperties(chat, {scrollHeight:{value:1800}, clientHeight:{value:300}, scrollWidth:{value:300}, clientWidth:{value:300}});
  const inputs = [
    [d.querySelector('#chat p'), {}], [d.querySelector('input'), {}],
    [d.querySelector('[contenteditable]'), {}], [d.querySelector('[data-player-root]'), {}],
    [d.querySelector('.movieRail span'), {deltaX:120, deltaY:0}],
    [d.querySelector('main'), {ctrlKey:true}], [d.querySelector('main'), {shiftKey:true}],
    [d.querySelector('main'), {cancelable:false}]
  ];
  for (const [target, extra] of inputs) assert.equal(env.wheel(120, target, extra).defaultPrevented, false);
  env.settle(); assert.equal(env.page.scrollTop, 0); assert.equal(w.frameCount(), 0);
  env.finish();
});

test('scrolling a nested panel stops earlier background inertia', () => {
  const env = setup('<main><div style="overflow-y:auto"><p>Chat</p></div></main>'), w = env.window, d = w.document;
  const panel = d.querySelector('div');
  Object.defineProperties(panel, {scrollHeight:{value:1800}, clientHeight:{value:300}, scrollWidth:{value:300}, clientWidth:{value:300}});
  env.wheel(360); w.flush(16); w.flush(64);
  const before = env.page.scrollTop; assert(before > 0);
  assert.equal(env.wheel(120, d.querySelector('p')).defaultPrevented, false);
  env.settle(80);
  assert.equal(env.page.scrollTop, before, 'a native panel gesture must not keep the page gliding behind it');
  assert.equal(w.frameCount(), 0); env.finish();
});

test('reduced motion, native preference, hidden tabs and touch devices suspend premium scrolling', async () => {
  for (const change of ['reduced', 'native', 'hidden', 'touch']) {
    const env = setup(), w = env.window, d = w.document;
    env.wheel(360); w.flush(16); const before = env.page.scrollTop;
    if (change === 'reduced') w.reduceMotion(true);
    if (change === 'native') d.body.dataset.svScroll = 'native';
    if (change === 'hidden') {Object.defineProperty(d, 'hidden', {value:true, configurable:true}); d.dispatchEvent(new w.Event('visibilitychange'));}
    if (change === 'touch') {const fine = w.matchMedia('(pointer: fine)'); fine.matches = false; for (const fn of fine.listeners) fn();}
    await tick(); env.settle(32);
    assert.equal(env.page.scrollTop, before, change);
    assert.equal(env.wheel().defaultPrevented, false, change);
    assert.equal(d.documentElement.classList.contains('lenis'), false, change);
    assert.equal(w.frameCount(), 0, change);
    if (change === 'reduced') {w.reduceMotion(false); assert.equal(env.wheel().defaultPrevented, true, 'motion can be reenabled');}
    env.finish();
  }
});

test('touch, player routes and an unavailable smoothing engine keep working natively', () => {
  for (const route of ['/watch/movie/1', '/embed/movie/1']) {
    const env = setup('<main>Player</main>', {path:route});
    assert.equal(env.wheel().defaultPrevented, false);
    assert.equal(env.window.frameCount(), 0); env.finish();
  }
  const env = browser('<main>Catalog</main>'); env.window.boot('scroll.js');
  const event = new env.window.WheelEvent('wheel', {deltaY:120, bubbles:true, cancelable:true});
  env.window.document.querySelector('main').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false); assert.equal(env.window.frameCount(), 0);
  env.finish();
});

test('the shell loads the pinned local engine and adapter in order on catalog pages', () => {
  const api = loadServer();
  try {
    const html = api.pageShell({active:'home', body:'<main>Catalog</main>'});
    const vendor = html.indexOf('/assets/vendor/lenis/lenis.min.js?v=1.3.16-r1');
    const adapter = html.search(/\/assets\/clean\/scroll\.js\?v=\d+/);
    assert(vendor > 0 && adapter > vendor, 'the controller loads after the locally served Lenis engine');
    assert(html.includes('/assets/vendor/lenis/lenis.css?v=1.3.16-r1'));
    assert(html.includes('/assets/clean/clean.css?v=154'));
  } finally {api.io.close(); api.httpServer.close();}
});
