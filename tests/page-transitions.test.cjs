'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {browser, loadServer, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

const api = loadServer();
const template = api.pageShell({active:'home', body:'<main>Catalog</main>'});
api.io.close();

function setup(options = {}) {
  const shell = new JSDOM(template);
  const gate = shell.window.document.querySelector('script[data-sv-navigation-gate]');
  assert(gate, 'navigation guards must be installed in the head before the first render');
  const code = gate.textContent;
  shell.window.close();
  const env = browser('<main><a href="/movies">Movies</a></main>', options), w = env.window;
  if (options.appearance !== undefined) w.localStorage.setItem('swiflytv.appearance', options.appearance);
  if (options.legacyReduced) w.localStorage.setItem('movieverse.reduceMotion', 'on');
  w.eval(code);
  env.transition = (type = 'pagereveal', activation) => {
    let skipped = 0;
    const event = new w.Event(type, {cancelable:true});
    Object.defineProperties(event, {
      viewTransition:{value:{skipTransition() {skipped++;}}},
      activation:{value:activation}
    });
    w.dispatchEvent(event);
    return {skipped, canceled:event.defaultPrevented};
  };
  return env;
}

test('ordinary navigation keeps its native event, history and scroll state', () => {
  const env = setup(), w = env.window;
  w.history.scrollRestoration = 'auto';
  env.page.scrollTop = 420;
  const length = w.history.length;
  assert.deepEqual(env.transition(), {skipped:0, canceled:false});
  assert.deepEqual(env.transition('pageswap', {entry:{url:'http://localhost:3000/movies'}}), {skipped:0, canceled:false});
  assert.equal(w.history.length, length);
  assert.equal(w.history.scrollRestoration, 'auto');
  assert.equal(w.scrollY, 420);
  assert.equal(w.frameCount(), 0, 'navigation must not create a JavaScript animation loop');
  env.finish();
});

test('intro guards skip the document transition without consuming or changing the intro', () => {
  const env = setup(), w = env.window, root = w.document.documentElement;
  for (const state of ['pending', 'running']) {
    root.dataset.svIntro = state;
    assert.equal(env.transition().skipped, 1);
    assert.equal(env.transition('pageswap').skipped, 1);
    assert.equal(root.dataset.svIntro, state);
    assert.equal(w.sessionStorage.getItem('swiflytv.intro.v2'), null);
  }
  delete root.dataset.svIntro;
  assert.equal(env.transition().skipped, 0, 'the finished intro must not disable future transitions');
  env.finish();
});

test('system, stored, legacy and live reduced motion skip navigation animation', () => {
  for (const options of [
    {reduced:true},
    {appearance:JSON.stringify({version:1, values:{reduceMotion:true}})},
    {legacyReduced:true}
  ]) {
    const env = setup(options);
    assert.equal(env.transition().skipped, 1, JSON.stringify(options));
    env.finish();
  }
  const env = setup(), w = env.window;
  w.document.body.classList.add('reduceMotion');
  assert.equal(env.transition().skipped, 1);
  w.document.body.classList.remove('reduceMotion');
  w.reduceMotion(true);
  assert.equal(env.transition('pageswap').skipped, 1);
  w.reduceMotion(false);
  assert.equal(env.transition().skipped, 0);
  env.finish();
});

test('missing transitions and restricted storage leave navigation usable', () => {
  const env = setup(), w = env.window;
  Object.defineProperty(w, 'localStorage', {get() {throw new Error('Storage blocked');}});
  assert.doesNotThrow(() => w.dispatchEvent(new w.Event('pagereveal')));
  assert.deepEqual(env.transition(), {skipped:0, canceled:false});
  env.finish();
});

test('playback and party URLs are excluded on departure and arrival', () => {
  const urls = ['/watch/movie/1', '/watch/m3u8', '/embed/1', '/social?tab=watchrooms',
    '/watchrooms/room', '/movies?party=1', '/movies?party=create', '/movies?roomId=room'];
  for (const path of urls) {
    const current = setup({path});
    assert.equal(current.transition().skipped, 1, path + ' current page');
    current.finish();
    const target = setup();
    assert.equal(target.transition('pageswap', {entry:{url:'http://localhost:3000' + path}}).skipped, 1, path + ' destination');
    Object.defineProperty(target.window, 'navigation', {value:{activation:{from:{url:'http://localhost:3000' + path}}}});
    assert.equal(target.transition().skipped, 1, path + ' source');
    target.finish();
  }
});

test('bfcache page events do not leave a sticky navigation state', () => {
  const env = setup(), w = env.window;
  w.dispatchEvent(new w.PageTransitionEvent('pagehide', {persisted:true}));
  w.dispatchEvent(new w.PageTransitionEvent('pageshow', {persisted:true}));
  assert.deepEqual(env.transition(), {skipped:0, canceled:false});
  assert.equal(w.document.documentElement.attributes.length, 0);
  assert.equal(w.frameCount(), 0);
  env.finish();
});

test('the shell opts in ordinary pages and excludes playback, party and party browse', () => {
  const server = loadServer();
  try {
    for (const active of ['home', 'movies', 'tv', 'account', 'profiles', 'welcome', 'login', 'signup']) {
      const html = server.pageShell({active});
      const document = new JSDOM(html).window.document;
      const gate = document.querySelector('script[data-sv-navigation-gate]');
      const stylesheet = document.querySelector('link[href*="/assets/clean/navigation.css?"]');
      assert(gate && stylesheet, active + ' must opt in');
      assert.equal(gate.hasAttribute('defer'), false);
      assert.equal(gate.hasAttribute('async'), false);
      assert.equal(gate.getAttribute('type'), null);
      assert(html.indexOf('data-sv-navigation-gate') < html.indexOf('rel="stylesheet"'), 'the guard must be parser-installed before styles');
      document.defaultView.close();
    }
    for (const options of [{player:true}, {active:'watch'}, {active:'social'}, {active:'watchrooms'}, {active:'movies', partyBrowse:true}]) {
      const html = server.pageShell(options);
      assert.doesNotMatch(html, /data-sv-navigation-gate|\/assets\/clean\/navigation\.css/);
    }
  } finally {server.io.close();}
});
