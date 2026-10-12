const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, tick, cleanup} = require('./ui-helpers.cjs');
const {studioMarkup} = require('../ui/studio');
test.afterEach(cleanup);

function setup(options = {}) {
  const env = browser('<button id="controlToggleTop">Studio</button>' + studioMarkup(), options);
  const {window: w} = env, animations = [];
  // JSDOM lacks Web Animations; keep its platform boundary observable while
  // running the real Studio controller and its user-facing controls.
  w.document.querySelector('[data-st-preview]').animate = function () {
    const animation = {
      playState: 'running',
      cancel() {this.playState = 'idle';},
      finish() {this.playState = 'finished'; this.onfinish?.();}
    };
    animations.push(animation);
    return animation;
  };
  w.boot('studio/studio.js');
  const click = selector => {
    const node = w.document.querySelector(selector);
    assert(node, 'Missing Studio control ' + selector);
    node.click();
  };
  click('#controlToggleTop');
  return {...env, animations, click};
}

test('Visual drafts update immediately and replace unfinished preview feedback', () => {
  const env = setup(), d = env.window.document;
  env.click('[data-st-preset="cinema"]');
  assert.equal(d.body.dataset.stTheme, 'red');
  assert.equal(env.animations.length, 1, 'A changed look should receive preview feedback');
  const first = env.animations[0];
  env.click('[data-st-field="theme"][data-st-value="green"]');
  assert.equal(d.body.dataset.stTheme, 'green');
  assert.equal(first.playState, 'idle', 'Rapid changes should replace the previous fade');
  assert.equal(env.animations.length, 2);
  env.click('[data-st-field="theme"][data-st-value="green"]');
  assert.equal(env.animations.length, 2, 'Reselecting the current value needs no new fade');
  env.click('[data-st-reset]');
  assert.equal(d.body.dataset.stTheme, 'default');
  assert.equal(env.animations[1].playState, 'idle');
  assert.equal(env.animations.length, 3);
});

test('Save cancels preview feedback and restores focus without waiting for motion', () => {
  const env = setup(), w = env.window, d = w.document;
  env.click('[data-st-preset="midnight"]');
  assert.equal(env.animations.length, 1);
  env.click('[data-st-save]');
  assert.equal(d.getElementById('controlPanel').open, false);
  assert.equal(env.animations[0].playState, 'idle');
  assert.equal(d.activeElement.id, 'controlToggleTop');
  assert.equal(JSON.parse(w.localStorage.getItem('swiflytv.appearance')).values.theme, 'blue');
});

test('Native dismissal cancels preview feedback and restores the saved look', () => {
  const env = setup(), w = env.window, d = w.document;
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.animations.length, 1);
  const dialog = d.getElementById('controlPanel');
  dialog.dispatchEvent(new w.Event('cancel'));
  dialog.close();
  assert.equal(d.body.dataset.stTheme, 'default');
  assert.equal(env.animations[0].playState, 'idle');
  assert.equal(d.activeElement.id, 'controlToggleTop');
});

test('Device reduced motion cancels active feedback and keeps new drafts still', () => {
  const env = setup(), w = env.window, d = w.document;
  w.boot('motion.js');
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.animations.length, 1);
  w.reduceMotion(true);
  assert.equal(env.animations[0].playState, 'idle');
  env.click('[data-st-preset="midnight"]');
  assert.equal(d.body.dataset.stTheme, 'blue');
  assert.equal(env.animations.length, 1);
  w.reduceMotion(false);
  env.click('[data-st-preset="pure"]');
  assert.equal(env.animations.length, 2);
});

test('A device starting in reduced motion stays still until that preference changes', () => {
  const env = setup({reduced: true});
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.window.document.body.dataset.stTheme, 'red');
  assert.equal(env.animations.length, 0);
  env.window.reduceMotion(false);
  env.click('[data-st-preset="midnight"]');
  assert.equal(env.animations.length, 1);
});

test('The Studio reduced-motion switch cancels feedback immediately', () => {
  const env = setup(), d = env.window.document;
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.animations.length, 1);
  env.click('[data-st-tab="motion"]');
  env.click('[data-st-setting="reduceMotion"]');
  assert(d.body.classList.contains('reduceMotion'));
  assert.equal(env.animations[0].playState, 'idle');
  env.click('[data-st-tab="looks"]');
  env.click('[data-st-preset="midnight"]');
  assert.equal(d.body.dataset.stTheme, 'blue');
  assert.equal(env.animations.length, 1);
});

test('External reduced-motion changes cancel active feedback without changing the draft', async () => {
  const env = setup(), d = env.window.document;
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.animations.length, 1);
  d.body.classList.add('reduceMotion');
  await tick();
  assert.equal(env.animations[0].playState, 'idle');
  assert.equal(d.body.dataset.stTheme, 'red');
});

test('Late close and finished-animation events do not cancel feedback in a reopened Studio', () => {
  const env = setup(), w = env.window, d = w.document, closed = [];
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    closed.push(() => this.dispatchEvent(new w.Event('close')));
  };
  env.click('[data-st-preset="cinema"]');
  assert.equal(env.animations.length, 1);
  const previous = env.animations[0];
  env.click('[data-st-cancel]');
  env.click('#controlToggleTop');
  env.click('[data-st-preset="midnight"]');
  assert.equal(env.animations.length, 2);
  previous.finish();
  closed.shift()();
  assert.equal(d.getElementById('controlPanel').open, true);
  assert.equal(d.body.dataset.stTheme, 'blue');
  assert.equal(env.animations[1].playState, 'running');
  env.click('[data-st-cancel]');
  assert.equal(env.animations[1].playState, 'idle');
});
