'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browser, loadServer, cleanup, tick } = require('./ui-helpers.cjs');
const api = loadServer();
test.afterEach(cleanup);
test.after(() => { api.io.close(); api.httpServer.close(); });

function html(routePath) {
  let value;
  const route = api.app._router.stack.find(layer => layer.route?.path === routePath);
  assert(route, 'Page route exists: ' + routePath);
  route.route.stack.at(-1).handle({ query: {}, params: {} }, { send(body) { value = body; } });
  return value;
}
const profiles = [{ id: 'main', name: 'Alex', mode: 'standard', avatar: { type: 'preset', id: 'orbit' } }, { id: 'kids', name: 'Kids', mode: 'kids', icon: '🐱' }];
function setup(route = '/profiles/manage', seed = profiles) {
  const env = browser(html(route), { path: route });
  const w = env.window;
  w.localStorage.setItem('swiflytv.profiles', JSON.stringify(seed));
  w.localStorage.setItem('swiflytv.activeProfile', JSON.stringify(seed[0]));
  for (const script of w.document.querySelectorAll('main script:not([src])')) w.eval(script.textContent);
  w.boot('avatars.js');
  w.boot('profiles.js');
  return { ...env, w, d: w.document, saved: () => JSON.parse(w.localStorage.getItem('swiflytv.profiles')), active: () => JSON.parse(w.localStorage.getItem('swiflytv.activeProfile')) };
}
function click(env, selector) {
  const el = env.d.querySelector(selector);
  assert(el, 'Visible flow control exists: ' + selector);
  el.click();
  return el;
}
function submit(env, selector) {env.d.querySelector(selector).dispatchEvent(new env.w.Event('submit', { bubbles: true, cancelable: true }));}
function selectFile(env, file) {
  const input = env.d.querySelector('[data-avatar-file]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new env.w.Event('change', { bubbles: true }));
}
const pngHeader = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
function rasterFile(w) {
  const f = new w.File([pngHeader], 'portrait.png', { type: 'image/png' });
  f.slice = () => ({ arrayBuffer: async () => pngHeader.buffer });
  return f;
}
function decodeFixture(env, createBitmap = async () => ({ width: 640, height: 480, close() {} })) {
  env.w.createImageBitmap = createBitmap;
  env.w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {}, imageSmoothingEnabled: true });
  env.w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/webp;base64,' + 'A'.repeat(180);
}

test('preset changes apply only on Save and keep the active identity through rename, mode and reload', () => {
  const env = setup();
  click(env, '[data-index="0"] [data-action="icon"]');
  assert.equal(env.d.querySelector('#profileAvatarDialog').open, true);
  assert.equal(env.d.querySelectorAll('[data-avatar-preset]').length, 8);
  click(env, '[data-avatar-preset="ember"]');
  click(env, '[data-avatar-cancel]');
  assert.equal(env.saved()[0].avatar.id, 'orbit');
  click(env, '[data-index="0"] [data-action="icon"]');
  click(env, '[data-avatar-preset="ember"]');
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[0].avatar.id, 'ember');
  env.w.prompt = () => 'Alex again';
  click(env, '[data-index="0"] [data-action="rename"]');
  click(env, '[data-index="0"] [data-action="mode"]');
  assert.equal(env.active().name, 'Alex again');
  assert.equal(env.active().mode, 'kids');
  assert.equal(env.active().avatar.id, 'ember');
  const reloaded = setup('/profiles', env.saved());
  assert.match(reloaded.d.querySelector('[data-index="0"] .dsProfileAvatarBig img').src, /ember\.svg/);
  assert.match(reloaded.d.querySelector('.profilePill img').src, /ember\.svg/);
  env.finish(); reloaded.finish();
});

test('a new viewer can choose a preset before creation and legacy emoji and initials still render safely', () => {
  const env = setup();
  click(env, '#profileCreateAvatar');
  click(env, '[data-avatar-preset="pixel"]');
  click(env, '[data-avatar-save]');
  assert.equal(env.saved().length, 2);
  const form = env.d.getElementById('profileCreateForm');
  form.elements.name.value = '<Alex & Friends>';
  submit(env, '#profileCreateForm');
  assert.equal(env.saved().at(-1).avatar.id, 'pixel');
  assert.equal(env.d.querySelector('[data-index="2"] strong').textContent, '<Alex & Friends>');
  assert.equal(env.d.querySelector('[data-index="1"] .dsProfileAvatarBig').textContent, '🐱');
  const initial = env.d.createElement('span');
  env.w.SwiflyAvatars.render(initial, { name: '<Someone>' });
  assert.equal(initial.textContent, '<');
  assert.equal(initial.querySelector('someone'), null);
  env.finish();
});

test('custom raster uploads are cropped to bounded local image data and survive a saved edit', async () => {
  const env = setup(); let crop;
  decodeFixture(env);
  env.w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage(...args) { crop = args; }, fillRect() {} });
  click(env, '[data-index="0"] [data-action="icon"]');
  selectFile(env, rasterFile(env.w)); await tick(); await tick();
  assert.equal(env.d.querySelector('[data-avatar-save]').disabled, false);
  assert.match(env.d.querySelector('[data-avatar-preview] img').src, /^data:image\/webp;base64,/);
  assert.deepEqual(crop.slice(1), [80,0,480,480,0,0,256,256]);
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[0].avatar.type, 'upload');
  assert.equal(env.active().avatar.data, env.saved()[0].avatar.data);
  const account = setup('/account', env.saved());
  assert.equal(account.d.querySelector('[data-account-avatar] img').src, env.saved()[0].avatar.data);
  env.finish(); account.finish();
});

test('a browser without WebP canvas export falls back to a bounded JPEG upload', async () => {
  const env = setup(); decodeFixture(env);
  env.w.HTMLCanvasElement.prototype.toDataURL = type => 'data:' + (type === 'image/webp' ? 'image/png' : type) + ';base64,' + 'A'.repeat(180);
  const avatar = await env.w.SwiflyAvatars.prepareUpload(rasterFile(env.w));
  assert.match(avatar.data, /^data:image\/jpeg;base64,/);
  assert.equal(avatar.type, 'upload');
  env.finish();
});

test('invalid, oversized and corrupt upload inputs show a recoverable error and preserve the saved icon', async () => {
  const env = setup(); decodeFixture(env);
  click(env, '[data-index="0"] [data-action="icon"]');
  for (const file of [new env.w.File(['<svg/>'], 'x.svg', {type:'image/svg+xml'}), { name:'large.png', type:'image/png', size:6*1024*1024 }, new env.w.File(['not a png'], 'bad.png', {type:'image/png'})]) {
    selectFile(env, file); await tick(); await tick();
    assert(env.d.querySelector('[data-avatar-error]').textContent.length > 0);
    assert.equal(env.saved()[0].avatar.id, 'orbit');
  }
  env.w.createImageBitmap = async () => {throw new Error('corrupt raster');};
  selectFile(env, rasterFile(env.w)); await tick(); await tick();
  assert.match(env.d.querySelector('[data-avatar-error]').textContent, /read|valid|image/i);
  assert.equal(env.d.querySelector('[data-avatar-save]').disabled, false);
  env.finish();
});

test('a cancelled asynchronous upload cannot alter another profile or save after the dialog closes', async () => {
  const env = setup(); let resolveDecode;
  decodeFixture(env, () => new Promise(resolve => {resolveDecode = resolve;}));
  click(env, '[data-index="0"] [data-action="icon"]');
  selectFile(env, rasterFile(env.w)); await tick();
  click(env, '[data-avatar-cancel]');
  click(env, '[data-index="1"] [data-action="icon"]');
  click(env, '[data-avatar-preset="bloom"]');
  resolveDecode({ width: 500, height: 500, close() {} }); await tick(); await tick();
  assert.match(env.d.querySelector('[data-avatar-preview] img').src, /bloom\.svg/);
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[0].avatar.id, 'orbit');
  assert.equal(env.saved()[1].avatar.id, 'bloom');
  env.finish();
});

test('a delayed close event cannot invalidate an editor reopened for another viewer', () => {
  const env = setup();
  click(env, '[data-index="0"] [data-action="icon"]');
  click(env, '[data-avatar-cancel]');
  click(env, '[data-index="1"] [data-action="icon"]');
  env.d.querySelector('#profileAvatarDialog').dispatchEvent(new env.w.Event('close'));
  click(env, '[data-avatar-preset="drift"]');
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[1].avatar?.id, 'drift');
  assert.equal(env.saved()[0].avatar.id, 'orbit');
  env.finish();
});

test('saving an unchanged legacy emoji keeps it until Use initial is explicitly chosen', () => {
  const env = setup();
  click(env, '[data-index="1"] [data-action="icon"]');
  assert.equal(env.d.querySelector('[data-avatar-preview]').textContent, '🐱');
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[1].icon, '🐱');
  click(env, '[data-index="1"] [data-action="icon"]');
  click(env, '[data-avatar-initial]');
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[1].icon, undefined);
  assert.equal(env.d.querySelector('[data-index="1"] .dsProfileAvatarBig').textContent, 'K');
  env.finish();
});

test('storage quota failures keep existing profiles and an open draft with a visible error', () => {
  const env = setup();
  const before = env.w.localStorage.getItem('swiflytv.profiles');
  click(env, '[data-index="0"] [data-action="icon"]');
  click(env, '[data-avatar-preset="nova"]');
  const originalSet = env.w.Storage.prototype.setItem;
  env.w.Storage.prototype.setItem = function () {throw new env.w.DOMException('quota exceeded','QuotaExceededError');};
  click(env, '[data-avatar-save]');
  assert.equal(env.w.localStorage.getItem('swiflytv.profiles'), before);
  assert.equal(env.d.querySelector('#profileAvatarDialog').open, true);
  assert.match(env.d.querySelector('[data-avatar-error]').textContent, /save|storage|space/i);
  env.w.Storage.prototype.setItem = originalSet;
  click(env, '[data-avatar-save]');
  assert.equal(env.saved()[0].avatar.id, 'nova');
  env.finish();
});

test('a legacy active profile without an id keeps its identity when renamed outside the first slot', () => {
  const env = setup('/profiles/manage', [{name:'Main',icon:'☺',kids:false},{name:'Legacy viewer',icon:'★',kids:true}]);
  env.w.localStorage.setItem('swiflytv.activeProfile', JSON.stringify({name:'Legacy viewer',icon:'★',kids:true}));
  env.w.prompt = () => 'The same viewer';
  click(env, '[data-index="1"] [data-action="rename"]');
  assert.equal(env.active().name, 'The same viewer');
  assert.equal(env.active().icon, '★');
  click(env, '[data-index="1"] [data-action="mode"]');
  assert.equal(env.active().mode, 'standard');
  assert.equal(env.active().kids, false);
  env.finish();
});

test('an active-profile write failure rolls back both persisted records and keeps the draft', () => {
  const env = setup();
  const beforeProfiles = env.w.localStorage.getItem('swiflytv.profiles');
  const beforeActive = env.w.localStorage.getItem('swiflytv.activeProfile');
  click(env, '[data-index="0"] [data-action="icon"]');
  click(env, '[data-avatar-preset="nova"]');
  const originalSet = env.w.Storage.prototype.setItem;
  let rejectActive = true;
  env.w.Storage.prototype.setItem = function (key, value) {
    if (key === 'swiflytv.activeProfile' && rejectActive) {rejectActive = false;throw new env.w.DOMException('quota exceeded','QuotaExceededError');}
    return originalSet.call(this, key, value);
  };
  click(env, '[data-avatar-save]');
  assert.equal(env.w.localStorage.getItem('swiflytv.profiles'), beforeProfiles);
  assert.equal(env.w.localStorage.getItem('swiflytv.activeProfile'), beforeActive);
  assert.equal(env.d.querySelector('#profileAvatarDialog').open, true);
  env.w.Storage.prototype.setItem = originalSet;
  env.finish();
});

test('renaming refreshes the navbar profile label without replacing the account owner name', () => {
  const env = setup();
  const identity = env.d.createElement('div');
  identity.className = 'dsDropdownUser';
  const avatar = env.d.createElement('span');
  const accountName = env.d.createElement('b'); accountName.textContent = 'Account owner';
  const label = env.d.createElement('small'); label.textContent = 'Alex profile';
  identity.append(avatar, accountName, label);
  env.d.querySelector('.dsProfileDropdown').prepend(identity);
  env.w.prompt = () => 'Morgan';
  click(env, '[data-index="0"] [data-action="rename"]');
  assert.equal(label.textContent, 'Morgan profile');
  assert.equal(accountName.textContent, 'Account owner');
  assert.match(avatar.querySelector('img').src, /orbit\.svg/);
  env.finish();
});

test('all original preset assets exist as standalone SVG without external resources', () => {
  const env = setup();
  assert(env.w.SwiflyAvatars, 'The shared avatar renderer is available');
  for (const preset of env.w.SwiflyAvatars.presets) {
    const asset = fs.readFileSync(path.join(__dirname, '..', 'public', 'clean', 'avatars', preset.id + '.svg'), 'utf8');
    assert.match(asset, /<svg/);
    assert(!/https?:\/\/(?!www\.w3\.org)|<script|<foreignObject|<image/i.test(asset));
  }
  env.finish();
});
