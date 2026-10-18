'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {browser, loadServer, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);
const templateApi = loadServer();
const templateHtml = templateApi.pageShell({active:'home', body:'<main>Catalog</main>'});
templateApi.io.close();

function setup(options = {}) {
  const shell = new JSDOM(templateHtml);
  const intro = shell.window.document.querySelector('[data-sv-intro-root]');
  const gate = shell.window.document.querySelector('script[data-sv-intro-gate]');
  assert(intro && gate, 'the shared shell must provide the cinematic intro and its first-paint gate');
  const markup = intro.outerHTML;
  const code = gate.textContent;
  shell.window.close();
  const env = browser(markup + '<main id="catalog"><a id="browse" href="/movies">Browse films</a></main><aside inert>Hidden panel</aside>', options);
  const w = env.window;
  let now = 0, next = 0;
  const timers = new Map();
  w.performance.now = () => now;
  w.setTimeout = (callback, delay) => {timers.set(++next, {callback, at:now + delay}); return next;};
  w.clearTimeout = id => timers.delete(id);
  env.advance = time => {now = time; for (const [id, timer] of [...timers]) if (timer.at <= time) {timers.delete(id); timer.callback();}};
  env.timerCount = () => timers.size;
  if (options.seen) w.sessionStorage.setItem('swiflytv.intro.v2', '1');
  if (options.priorSeen) w.sessionStorage.setItem('swiflytv.intro.v1', '1');
  if (options.authenticated !== false) w.localStorage.setItem('swiflytv.session', '{"email":"intro@example.test"}');
  if (options.storedReduced) w.localStorage.setItem('swiflytv.appearance', JSON.stringify({version:1, values:{reduceMotion:true}}));
  if (options.savedReduced) w.document.body.classList.add('reduceMotion');
  w.document.querySelector('#browse').focus();
  w.eval(code);
  env.start = () => w.boot('intro.js');
  return env;
}

test('the intro covers the first entry and restores existing focus and inert state when its curtains open', () => {
  const env = setup(), w = env.window, d = w.document;
  assert.equal(d.documentElement.dataset.svIntro, 'pending');
  env.start();
  assert.equal(d.documentElement.dataset.svIntro, 'running');
  assert.equal(d.querySelector('[data-sv-intro-root]').hidden, false);
  assert.equal(d.querySelector('#catalog').hasAttribute('inert'), true);
  assert.equal(d.activeElement, d.querySelector('[data-sv-intro-skip]'));
  const end = new w.Event('animationend', {bubbles:true});
  Object.defineProperty(end, 'animationName', {value:'svIntroOpenBottom'});
  d.querySelector('.svIntroCurtainBottom').dispatchEvent(end);
  assert.equal(d.querySelector('[data-sv-intro-root]'), null);
  assert.equal(d.documentElement.dataset.svIntro, undefined);
  assert.equal(d.querySelector('#catalog').hasAttribute('inert'), false);
  assert.equal(d.querySelector('aside').hasAttribute('inert'), true);
  assert.equal(d.activeElement, d.querySelector('#browse'));
  assert.equal(env.timerCount(), 0);
  assert.equal(w.frameCount(), 0, 'the intro must leave no animation loop behind');
  env.finish();
});

test('the redesigned intro plays once even when the previous ident was seen', () => {
  const env = setup({priorSeen:true}), w = env.window;
  assert.equal(w.document.documentElement.dataset.svIntro, 'pending');
  env.start();
  assert.equal(w.document.documentElement.dataset.svIntro, 'running');
  env.finish();
});

for (const action of ['skip', 'escape', 'wheel', 'pagehide']) test(`the intro immediately releases the page on ${action}`, () => {
  const env = setup(), w = env.window, d = w.document;
  env.start();
  if (action === 'skip') d.querySelector('[data-sv-intro-skip]').click();
  else if (action === 'escape') d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  else if (action === 'wheel') {
    const event = new w.WheelEvent('wheel', {deltaY:120, bubbles:true, cancelable:true});
    d.querySelector('[data-sv-intro-root]').dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'skipping must preserve the original scroll gesture');
  } else w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  assert.equal(d.querySelector('[data-sv-intro-root]'), null);
  assert.equal(d.documentElement.hasAttribute('data-sv-intro'), false);
  assert.equal(d.querySelector('#catalog').hasAttribute('inert'), false);
  assert.equal(env.timerCount(), 0);
  env.finish();
});

for (const options of [{seen:true}, {reduced:true}, {savedReduced:true}, {storedReduced:true}]) test(`repeat visits and reduced motion expose the page immediately: ${JSON.stringify(options)}`, () => {
  const env = setup(options), w = env.window, d = w.document;
  env.start();
  assert.equal(d.querySelector('[data-sv-intro-root]'), null);
  assert.equal(d.documentElement.hasAttribute('data-sv-intro'), false);
  assert.equal(d.querySelector('#catalog').hasAttribute('inert'), false);
  assert.equal(env.timerCount(), 0);
  env.finish();
});

test('documents that redirect for authentication do not consume the first intro', () => {
  for (const options of [{path:'/', authenticated:false}, {path:'/welcome'}, {path:'/login'}]) {
    const env = setup(options), w = env.window;
    env.start();
    assert.equal(w.document.documentElement.hasAttribute('data-sv-intro'), false);
    assert.equal(w.sessionStorage.getItem('swiflytv.intro.v2'), null, 'the destination document must still be able to present the intro');
    env.finish();
  }
});

test('skipping with Escape takes precedence over the real TV navigation handler', () => {
  const env = setup(), w = env.window;
  const tvScript = [...templateHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .find(([, code]) => code.includes('function swiflyTvFocusNavigation'))[1];
  let backCalls = 0;
  w.history.pushState({}, '', '/movies');
  w.history.back = () => {backCalls++;};
  w.navigator.getGamepads = () => [];
  w.eval(tvScript);
  env.start();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
  assert.equal(backCalls, 0, 'Escape skips the intro without navigating away');
  assert.notEqual(w.localStorage.getItem('swiflytv.tvFocusMode'), 'true');
  assert.equal(w.document.querySelector('[data-sv-intro-root]'), null);
  env.finish();
});

test('changing motion preference during the intro immediately restores the page', () => {
  const env = setup(), w = env.window;
  env.start(); w.reduceMotion(true);
  assert.equal(w.document.querySelector('[data-sv-intro-root]'), null);
  assert.equal(env.timerCount(), 0);
  env.finish();
});

test('a missing intro controller fails open and a missing animation event cannot strand the page', () => {
  for (const start of [false, true]) {
    const env = setup(), d = env.window.document;
    if (start) env.start();
    env.advance(3600);
    assert.equal(d.documentElement.hasAttribute('data-sv-intro'), false);
    assert.equal(d.querySelector('[data-sv-intro-root]'), null);
    assert.equal(d.querySelector('#catalog').hasAttribute('inert'), false);
    assert.equal(env.timerCount(), 0);
    env.finish();
  }
});

test('the shell serves the exact versioned intro assets and excludes playback and watch parties', async () => {
  const api = loadServer();
  await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
  try {
    const html = api.pageShell({active:'welcome'});
    const origin = 'http://127.0.0.1:' + api.httpServer.address().port;
    for (const file of ['intro.css', 'intro.js']) {
      const match = html.match(new RegExp('/assets/clean/' + file.replace('.', '\\.') + '\\?v=2'));
      assert(match, 'the entry shell must reference ' + file);
      const response = await fetch(origin + match[0]);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), file.endsWith('.css') ? /text\/css/ : /javascript/);
      assert.equal(await response.text(), fs.readFileSync(path.join(__dirname, '../public/clean', file), 'utf8'));
    }
    for (const options of [{active:'watch', player:true}, {active:'watch'}, {active:'social'}]) {
      assert.doesNotMatch(api.pageShell(options), /data-sv-intro-root|\/assets\/clean\/intro\./);
    }
  } finally {await new Promise(resolve => api.io.close(resolve));}
});
