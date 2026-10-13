'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadServer, browser } = require('./ui-helpers.cjs');

function controller(t) {
  const api = loadServer();
  const env = browser(api.pageShell({ title: 'Catalog', body: '<main>Catalog</main>' }));
  const w = env.window, d = w.document;
  let hidden = false, pads = [];
  Object.defineProperty(d, 'hidden', { configurable: true, get: () => hidden });
  w.navigator.getGamepads = () => pads;
  const script = [...d.querySelectorAll('script:not([src])')].find(node => node.textContent.includes('var FOCUSABLE_SELECTOR'));
  w.eval(script.textContent); d.dispatchEvent(new w.Event('DOMContentLoaded'));
  t.after(() => { env.finish(); api.io.close(); api.httpServer.close(); });
  return { w, d, hide(value) { hidden = value; d.dispatchEvent(new w.Event('visibilitychange')); }, connect() {
    pads = [{ id: 'Fixture controller', axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }];
    const event = new w.Event('gamepadconnected'); event.gamepad = pads[0]; w.dispatchEvent(event);
  }};
}

test('the catalog does not run a controller animation loop while TV mode is off', t => {
  const { w } = controller(t);
  assert.equal(w.frameCount(), 0);
  w.flush(16); assert.equal(w.frameCount(), 0);
});

test('controller polling pauses in a hidden tab and resumes on return', t => {
  const env = controller(t); env.connect();
  assert.equal(env.w.frameCount(), 1);
  env.hide(true); assert.equal(env.w.frameCount(), 0);
  env.hide(false); assert.equal(env.w.frameCount(), 1);
  env.w.flush(16); assert.equal(env.w.frameCount(), 1);
});

test('turning TV mode off cancels controller animation work', t => {
  const env = controller(t); env.connect();
  env.d.dispatchEvent(new env.w.KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }));
  assert.equal(env.w.frameCount(), 0);
  assert.equal(env.w.localStorage.getItem('swiflytv.tvFocusMode'), 'false');
});
