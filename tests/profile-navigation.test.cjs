'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { browser, loadServer, cleanup } = require('./ui-helpers.cjs');

const api = loadServer();
test.afterEach(cleanup);
test.after(() => { api.io.close(); api.httpServer.close(); });

function page(path) {
  let html;
  const route = api.app._router.stack.find(layer => layer.route?.path === path);
  assert(route, 'Page route exists: ' + path);
  route.route.stack.at(-1).handle({ query: {}, params: {} }, { send(value) { html = value; } });
  return html;
}

test('the shared top navigation opens Party Hub directly and marks its active page', () => {
  for (const active of ['home', 'profiles', 'account', 'social']) {
    const env = browser(api.pageShell({ active }));
    const link = env.window.document.querySelector('.navRightCluster > a[href="/social?tab=watchrooms"]');
    assert(link, 'Party Hub must be reachable beside the other top navigation icons');
    assert.equal(link.getAttribute('aria-label'), 'Party Hub');
    assert.equal(link.getAttribute('title'), 'Party Hub');
    assert(link.querySelector('svg[aria-hidden="true"]'), 'Party Hub uses the shared SVG icon style');
    assert.equal(link.getAttribute('aria-current'), active === 'social' ? 'page' : null);
    env.finish();
  }
});
test('the compact profile menu keeps every destination behind clearly named groups',()=>{
 const env=browser(api.pageShell({active:'home'})),w=env.window,d=w.document;
 const before=[...d.querySelectorAll('.dsProfileDropdown a[href]')].map(a=>a.getAttribute('href')).sort();w.boot('clean.js');
 const groups=[...d.querySelectorAll('.svAccountGroup')];assert.equal(groups.length,3);assert.deepEqual(groups.map(g=>g.querySelector('summary').textContent.trim()),['Your library','Watch together','Discover more']);
 assert(groups.every(g=>!g.open),'the initial menu remains compact');assert.deepEqual([...d.querySelectorAll('.dsProfileDropdown a[href]')].map(a=>a.getAttribute('href')).sort(),before);
 const library=groups[0];library.open=true;assert(library.querySelector('a[href="/continue-watching"]'));assert(library.querySelector('a[href="/my-list"]'));assert(library.querySelector('a[href="/liked"]'));
 d.documentElement.dataset.svTv='true';return new Promise(resolve=>setImmediate(()=>{assert(groups.every(g=>g.open),'TV mode exposes the original full destination list');env.finish();resolve();}));
});

test('the profile chooser keeps the selected identity and saves the chosen viewer', () => {
  const env = browser(page('/profiles'));
  const w = env.window;
  const profiles = [{ id: 'main', name: 'Alex', mode: 'standard' }, { id: 'kids', name: 'Little viewer', mode: 'kids' }];
  w.localStorage.setItem('swiflytv.profiles', JSON.stringify(profiles));
  w.localStorage.setItem('swiflytv.activeProfile', JSON.stringify(profiles[0]));
  w.eval(w.document.querySelector('main script').textContent);
  w.boot('avatars.js');
  w.boot('profiles.js');
  const selected = w.document.querySelector('[data-current="true"]');
  assert.match(selected.textContent, /Alex/);
  assert.equal(selected.getAttribute('aria-pressed'), 'true');
  w.document.querySelector('button[data-index="1"]').click();
  assert.deepEqual(JSON.parse(w.localStorage.getItem('swiflytv.activeProfile')), profiles[1]);
  env.finish();
});

test('profile settings preserve creation, rename, mode, deletion and reset actions', () => {
  const env = browser(page('/profiles/manage'));
  const w = env.window, d = w.document;
  w.eval(d.querySelector('main script').textContent);
  w.boot('avatars.js');
  w.boot('profiles.js');
  const saved = () => JSON.parse(w.localStorage.getItem('swiflytv.profiles'));
  const form = d.getElementById('profileCreateForm');
  form.elements.name.value = 'Another viewer';
  form.elements.mode.value = 'kids';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(saved().at(-1).name, 'Another viewer');
  assert.equal(saved().at(-1).mode, 'kids');
  w.prompt = () => 'Renamed viewer';
  d.querySelector('[data-index="2"] [data-action="rename"]').click();
  assert.equal(saved()[2].name, 'Renamed viewer');
  d.querySelector('[data-index="2"] [data-action="mode"]').click();
  assert.equal(saved()[2].mode, 'standard');
  w.confirm = () => true;
  d.querySelector('[data-index="2"] [data-action="delete"]').click();
  assert.equal(saved().length, 2);
  d.getElementById('resetProfilesBtn').click();
  assert.deepEqual(saved().map(profile => profile.name), ['Main', 'Kids']);
  env.finish();
});
