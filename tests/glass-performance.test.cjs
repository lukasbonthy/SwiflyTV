const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, source, tick, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

function wheel(w, target, options = {}) {
  const event = new w.WheelEvent('wheel', {deltaY:120, bubbles:true, cancelable:true, ...options});
  target.dispatchEvent(event);
  return event;
}
function settle(w, start = 16) {for (let time = start; time < 2000; time += 16) w.flush(time);}
function glass(markup = '') {
  const env = browser(markup), w = env.window, intersections = [], sizes = [];
  Object.defineProperty(w.navigator, 'userAgent', {value:'Chrome/130.0.0.0'});
  w.CSS = {supports:() => true};
  w.HTMLElement.prototype.getBoundingClientRect = function () {return {width:200, height:40, top:0, left:0, bottom:40, right:200};};
  w.IntersectionObserver = class {
    constructor(callback) {this.callback = callback; this.nodes = new Set(); intersections.push(this);}
    observe(node) {this.nodes.add(node);}
    unobserve(node) {this.nodes.delete(node);}
    disconnect() {this.nodes.clear();}
  };
  w.ResizeObserver = class {
    constructor(callback) {this.callback = callback; this.nodes = new Set(); sizes.push(this);}
    observe(node) {this.nodes.add(node);}
    disconnect() {this.nodes.clear();}
  };
  env.intersect = (value, target) => {for (const observer of intersections) observer.callback([...observer.nodes].filter(node => !target || node === target).map(node => ({target:node, isIntersecting:value})));};
  env.resize = () => {for (const observer of sizes) if (observer.nodes.size) observer.callback([...observer.nodes].map(target => ({target})));};
  env.watched = () => sizes.reduce((count, observer) => count + observer.nodes.size, 0);
  const finish = env.finish;
  env.finish = () => {w.SwiflyGlassSurfaces?.destroy(); for (const node of w.document.querySelectorAll('[data-swifly-glass]')) w.SwiflyLiquidGlass?.mount(node).destroy(); finish();};
  return env;
}

test('Desktop wheel motion has a weighted onset and preserves ordinary wheel distance', () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.boot('motion.js');
  assert.equal(wheel(w, w.document.querySelector('main')).defaultPrevented, true);
  w.flush(16);
  assert(env.page.scrollTop > 12 && env.page.scrollTop < 23, 'The first frame should respond with roughly 110ms damping');
  for (let time = 32; time <= 128; time += 16) w.flush(time);
  assert(env.page.scrollTop > 75 && env.page.scrollTop < 89, 'Motion should retain some weight during the first 128ms');
  settle(w, 144);
  assert.equal(env.page.scrollTop, 120, 'A 120px wheel input must travel exactly 120px');
  assert.equal(w.frameCount(), 0);
  env.finish();
});
test('Reversing a wheel gesture reverses the next frame without stale forward momentum', () => {
  const env = browser('<main>Catalog</main>'), w = env.window, target = w.document.querySelector('main');
  env.page.scrollTop = 600; w.boot('motion.js');
  for (let i = 0; i < 3; i++) wheel(w, target);
  w.flush(16); const before = env.page.scrollTop;
  wheel(w, target, {deltaY:-120}); w.flush(32);
  assert(env.page.scrollTop < before, 'A direction change must interrupt the pending forward distance');
  settle(w, 48); assert.equal(w.frameCount(), 0); env.finish();
});
test('A burst of mouse wheel input caps outstanding momentum', () => {
  const env = browser('<main>Catalog</main>'), w = env.window, target = w.document.querySelector('main');
  w.boot('motion.js'); for (let i = 0; i < 24; i++) wheel(w, target);
  settle(w);
  assert(env.page.scrollTop > 120 && env.page.scrollTop <= 720, 'Fast wheel bursts must not queue screens of unconsumed travel');
  assert.equal(w.frameCount(), 0); env.finish();
});
test('Wheel motion settles when browser scroll positions round to whole pixels', () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.scrollTo = options => {env.page.scrollTop = Math.round(options.top); env.page.scrollLeft = Math.round(options.left);};
  w.boot('motion.js'); wheel(w, w.document.querySelector('main')); settle(w);
  assert.equal(env.page.scrollTop, 120, 'The damped tail must reach its destination on integer scroll positions');
  assert.equal(w.frameCount(), 0, 'Subpixel rounding must not leave a perpetual animation loop');
  env.finish();
});
test('High resolution trackpad input stays native without computing ancestor styles', () => {
  const env = browser('<main><div><section><p><span>Catalog</span></p></section></div></main>'), w = env.window;
  w.boot('motion.js'); let reads = 0; const computed = w.getComputedStyle;
  w.getComputedStyle = (...args) => {reads++; return computed(...args);};
  for (let i = 0; i < 8; i++) assert.equal(wheel(w, w.document.querySelector('span'), {deltaY:2.5}).defaultPrevented, false);
  assert.equal(reads, 0, 'Native trackpad gestures should leave the style/layout hot path immediately');
  assert.equal(w.frameCount(), 0); env.finish();
});
test('A recognized trackpad gesture remains native when later deltas become large integers', () => {
  const env = browser('<main>Catalog</main>'), w = env.window, target = w.document.querySelector('main');
  let now = 0; w.performance.now = () => now; w.boot('motion.js');
  assert.equal(wheel(w, target, {deltaY:2.5}).defaultPrevented, false);
  now = 16; assert.equal(wheel(w, target, {deltaY:120}).defaultPrevented, false, 'An accelerated trackpad sample must not switch into mouse-wheel inertia');
  assert.equal(w.frameCount(), 0);
  now = 500; assert.equal(wheel(w, target, {deltaY:120}).defaultPrevented, true, 'The device heuristic must expire without a background timer');
  env.finish();
});
test('Repeated mouse wheel input avoids re-reading unchanged ancestor overflow', () => {
  const env = browser('<main><div><p><span>Catalog</span></p></div></main>'), w = env.window, main = w.document.querySelector('main');
  Object.defineProperties(main, {scrollHeight:{value:1200}, clientHeight:{value:800}});
  w.boot('motion.js'); let reads = 0; const computed = w.getComputedStyle;
  w.getComputedStyle = (...args) => {reads++; return computed(...args);};
  for (let i = 0; i < 4; i++) wheel(w, w.document.querySelector('span'));
  assert(reads <= 1, 'Only ancestors with overflow extent need an initial style read');
  env.finish();
});
test('A newly scrollable nested panel immediately retains native wheel behavior', () => {
  const env = browser('<div><p>Messages</p></div>'), w = env.window, panel = w.document.querySelector('div');
  Object.defineProperties(panel, {scrollHeight:{value:900}, clientHeight:{value:200}});
  w.boot('motion.js'); wheel(w, panel.firstElementChild); w.flush(16);
  panel.style.overflowY = 'auto';
  const current = env.page.scrollTop;
  assert.equal(wheel(w, panel.firstElementChild).defaultPrevented, false);
  w.flush(32); assert.equal(env.page.scrollTop, current); env.finish();
});
test('Horizontal page-mode wheel input uses the rail width and respects its boundary', () => {
  const env = browser('<div class="movieRail"><button>Movie</button></div>'), w = env.window, rail = w.document.querySelector('.movieRail');
  Object.defineProperties(rail, {scrollWidth:{value:1800}, clientWidth:{value:600}, scrollHeight:{value:150}, clientHeight:{value:150}});
  w.boot('motion.js'); assert.equal(wheel(w, rail.firstElementChild, {deltaY:1, deltaMode:2, shiftKey:true}).defaultPrevented, true);
  settle(w); assert.equal(rail.scrollLeft, 540); assert.equal(env.page.scrollTop, 0);
  rail.scrollLeft = 1200;
  assert.equal(wheel(w, rail.firstElementChild, {deltaX:120, deltaY:0}).defaultPrevented, false);
  assert.equal(w.frameCount(), 0); env.finish();
});
test('Reduced motion and hidden tabs never schedule scroll presentation work', () => {
  const env = browser('<main>Catalog</main><div class="dsHero"></div>'), w = env.window, d = w.document;
  w.boot('motion.js'); w.reduceMotion(true);
  d.dispatchEvent(new w.Event('scroll')); assert.equal(w.frameCount(), 0);
  w.reduceMotion(false); w.flush(16);
  Object.defineProperty(d, 'hidden', {value:true, configurable:true});
  d.dispatchEvent(new w.Event('visibilitychange'));
  d.dispatchEvent(new w.Event('scroll'));
  assert.equal(wheel(w, d.querySelector('main')).defaultPrevented, false);
  w.SwiflyMotion.scrollBy(env.page, {top:100});
  assert.equal(w.frameCount(), 0, 'Hidden pages must not keep animation or presentation frames queued');
  env.finish();
});
test('Hero geometry observation pauses in hidden tabs and resumes when visible', () => {
  const env = browser('<div class="dsHero"></div>'), w = env.window, d = w.document, watched = new Set();
  w.ResizeObserver = class {observe(node) {watched.add(node);} unobserve(node) {watched.delete(node);} disconnect() {watched.clear();}};
  w.boot('motion.js'); assert.equal(watched.size, 1);
  Object.defineProperty(d, 'hidden', {value:true, configurable:true}); d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(watched.size, 0, 'Hidden pages must suspend hero geometry observation'); assert.equal(w.frameCount(), 0);
  Object.defineProperty(d, 'hidden', {value:false, configurable:true}); d.dispatchEvent(new w.Event('visibilitychange')); w.flush(16);
  assert.equal(watched.size, 1); assert.equal(w.frameCount(), 0); env.finish();
});
test('Changing the native-scroll preference stops queued motion and keeps future scroll events native', async () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.boot('motion.js'); w.SwiflyMotion.scrollBy(env.page, {top:400}); w.flush(16);
  const current = env.page.scrollTop;
  w.document.body.dataset.svScroll = 'native'; await tick();
  assert.equal(w.frameCount(), 0, 'The app scroll preference must interrupt active motion without relying on Studio');
  w.document.dispatchEvent(new w.Event('scroll'));
  assert.equal(w.frameCount(), 0); assert.equal(env.page.scrollTop, current);
  env.finish();
});
test('Hero presentation uses cached geometry and ignores unrelated nested scrolls', () => {
  const env = browser('<div class="dsHero"></div><div class="movieRail"><p>Rail</p></div>'), w = env.window, d = w.document;
  let geometry = 0, queries = 0;
  d.querySelector('.dsHero').getBoundingClientRect = () => {geometry++; return {top:-200, height:500};};
  w.boot('motion.js'); geometry = 0;
  const query = d.querySelectorAll.bind(d);
  d.querySelectorAll = selector => {if (selector.includes('.dsHero')) queries++; return query(selector);};
  d.querySelector('.movieRail').dispatchEvent(new w.Event('scroll')); w.flush(16);
  assert.equal(geometry, 0, 'Rail movement must not measure page heroes');
  env.page.scrollTop = 100; d.dispatchEvent(new w.Event('scroll')); w.flush(32);
  assert.equal(queries, 0, 'Scrolling must not rescan hero selectors');
  assert.equal(geometry, 0, 'Scrolling uses the measured hero anchor until layout changes');
  assert.equal(d.querySelector('.dsHero').style.getPropertyValue('--sv-hero-offset'), '22.50px');
  env.finish();
});
test('Destroying motion before DOM ready prevents later boot and animation scheduling', () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.eval(source('motion.js')); w.SwiflyMotion.destroy();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(wheel(w, w.document.querySelector('main')).defaultPrevented, false);
  w.SwiflyMotion.scrollBy(env.page, {top:100}); assert.equal(w.frameCount(), 0);
  env.finish();
});
test('Destroying motion leaves pending reveal sections visible', () => {
  const env = browser('<section class="svCatalogRow">Movies</section>'), w = env.window, section = w.document.querySelector('section');
  section.getBoundingClientRect = () => ({top:1600, height:400}); w.boot('motion.js');
  assert.equal(section.classList.contains('svMotionReveal'), true);
  w.SwiflyMotion.destroy();
  assert.equal(section.classList.contains('svMotionVisible'), true, 'Cleanup must not strand content in the hidden reveal state');
  assert.equal(w.frameCount(), 0); env.finish();
});

test('Repeated catalog controls stay lightweight without expensive SVG filters or style reads', () => {
  const env = glass('<div class="svLiquidPane" data-swifly-glass></div><div class="dsCardQuickActions">' + '<button class="dsMiniBtn">Save</button>'.repeat(60) + '</div><div class="dsAccountCard">Account</div>'), w = env.window, d = w.document;
  w.boot('liquid-glass/liquid-glass.js'); w.flush(16);
  let reads = 0; const computed = w.getComputedStyle;
  w.getComputedStyle = (...args) => {reads++; return computed(...args);};
  w.boot('liquid-glass/surfaces.js'); env.intersect(true); w.flush(32);
  assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 1, 'Only the navigation pane should own a complex filter');
  assert([...d.querySelectorAll('.dsMiniBtn,.dsAccountCard')].every(node => node.classList.contains('svGlassSurface') && node.dataset.swiflyRenderer === 'blur'));
  assert.equal(reads, 0, 'Ordinary glass controls do not need computed-style measurements');
  assert.equal(w.frameCount(), 0); env.finish();
});
test('Surface mutations scan coalesced added subtrees instead of their catalog parent', async () => {
  const env = glass('<main><button class="dsPrimaryBtn">Existing</button></main>'), w = env.window, d = w.document;
  w.boot('liquid-glass/liquid-glass.js'); w.boot('liquid-glass/surfaces.js');
  let bodyScans = 0, subtreeScans = 0;
  const bodyQuery = d.body.querySelectorAll.bind(d.body);
  d.body.querySelectorAll = selector => {bodyScans++; return bodyQuery(selector);};
  const section = d.createElement('section'), subtreeQuery = section.querySelectorAll.bind(section);
  section.querySelectorAll = selector => {subtreeScans++; return subtreeQuery(selector);};
  d.body.append(section);
  const button = d.createElement('button'); button.className = 'dsSecondaryBtn'; section.append(button);
  await tick(); assert.equal(w.frameCount(), 1); w.flush(16);
  assert.equal(button.classList.contains('svGlassControl'), true);
  assert.equal(bodyScans, 0, 'Adding one control must not rescan every catalog surface');
  assert.equal(subtreeScans, 1, 'A parent and its added child should be scanned once as a single subtree');
  assert.equal(w.frameCount(), 0); env.finish();
});
test('Text-only changes do not queue a surface reconciliation frame', async () => {
  const env = glass('<div id="status">Ready</div>'), w = env.window;
  w.boot('liquid-glass/liquid-glass.js'); w.boot('liquid-glass/surfaces.js');
  w.document.getElementById('status').textContent = 'Updated'; await tick();
  assert.equal(w.frameCount(), 0); env.finish();
});
test('Opted-in important panels pause offscreen and reuse their refraction filter on return', () => {
  const env = glass('<div class="svSearchPopup" data-glass-refraction="true">Search</div>'), w = env.window, panel = w.document.querySelector('.svSearchPopup');
  w.boot('liquid-glass/liquid-glass.js'); w.boot('liquid-glass/surfaces.js');
  env.intersect(true, panel); w.flush(16); const original = panel.querySelector('svg.svLiquidPane__filters'); assert(original);
  env.intersect(false, panel);
  assert.equal(panel.querySelector('svg.svLiquidPane__filters'), original, 'Leaving the viewport should pause the filter rather than destroy it');
  assert.equal(panel.dataset.swiflyRenderer, 'blur'); env.resize(); assert.equal(w.frameCount(), 0);
  env.intersect(true, panel); w.flush(32);
  assert.equal(panel.querySelector('svg.svLiquidPane__filters'), original); assert.equal(panel.dataset.swiflyRenderer, 'svg');
  env.finish();
});
test('Glass off/subtle skip SVG creation and dynamically release complex filter work', async () => {
  for (const mode of ['off', 'subtle']) {
    const env = glass('<div class="svLiquidPane" data-swifly-glass></div>'), w = env.window, d = w.document;
    d.body.dataset.stGlass = mode; w.boot('liquid-glass/liquid-glass.js');
    assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 0);
    assert.equal(w.frameCount(), 0); assert.equal(env.watched(), 0);
    d.body.dataset.stGlass = 'liquid'; await tick(); w.flush(16);
    assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 1);
    d.body.dataset.stGlass = mode; await tick();
    assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 0);
    assert.equal(w.frameCount(), 0); assert.equal(env.watched(), 0); env.finish();
  }
});
test('A preference applied before the first paint cancels unneeded navigation refraction', async () => {
  const env = glass('<div class="svLiquidPane" data-swifly-glass></div>'), w = env.window, d = w.document;
  w.boot('liquid-glass/liquid-glass.js');
  assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 0, 'Initial refraction is deferred until a paint can use it');
  d.body.dataset.stGlass = 'off'; await tick(); w.flush(16);
  assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 0); assert.equal(w.frameCount(), 0);
  env.finish();
});
test('Hidden tabs and reduced-transparency preferences suspend complex map updates', () => {
  const env = glass('<div class="svLiquidPane" data-swifly-glass></div>'), w = env.window, d = w.document;
  w.boot('liquid-glass/liquid-glass.js'); w.flush(16);
  Object.defineProperty(d, 'hidden', {value:true, configurable:true}); d.dispatchEvent(new w.Event('visibilitychange'));
  env.resize(); w.dispatchEvent(new w.Event('resize')); assert.equal(w.frameCount(), 0); assert.equal(env.watched(), 0);
  Object.defineProperty(d, 'hidden', {value:false, configurable:true}); d.dispatchEvent(new w.Event('visibilitychange')); w.flush(32);
  const transparency = w.matchMedia('(prefers-reduced-transparency: reduce)'); transparency.matches = true;
  for (const listener of transparency.listeners) listener({matches:true});
  assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length, 0);
  env.resize(); assert.equal(w.frameCount(), 0); assert.equal(env.watched(), 0); env.finish();
});
test('Removing a mounted navigation pane releases queued work and resize observation', async () => {
  const env = glass('<div class="svLiquidPane" data-swifly-glass></div>'), w = env.window;
  w.boot('liquid-glass/liquid-glass.js'); w.document.querySelector('.svLiquidPane').remove(); await tick();
  assert.equal(w.frameCount(), 0); assert.equal(env.watched(), 0); env.finish();
});
test('Unsupported refraction refresh remains idle', () => {
  const env = glass('<div class="svLiquidPane" data-swifly-glass></div>'), w = env.window;
  w.CSS.supports = () => false; w.boot('liquid-glass/liquid-glass.js');
  const controller = w.SwiflyLiquidGlass.mount(w.document.querySelector('.svLiquidPane'));
  assert.equal(controller.supported, false); controller.refresh();
  assert.equal(w.frameCount(), 0); env.finish();
});


test('Hero controls mount the SAME size-aware navbar renderer, not only a global filter URL',async()=>{
 const markup='<nav class="netflixNav"><button class="svNavButton">Search</button></nav>'+
  '<div class="dsHeroActions"><a class="dsPrimaryBtn">Play</a><a class="dsSecondaryBtn">Trailer</a><button class="dsIconBtn">Save</button></div>'+
  '<div class="dsCardQuickActions">'+ '<button class="dsMiniBtn">Add</button>'.repeat(50) +'</div>';
 const env=glass(markup),w=env.window,d=w.document;d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 assert.equal(d.querySelectorAll('.dsHeroActions > .svNavMatchedOptic').length,3);
 assert.equal(d.querySelectorAll('.svNavMatchedLens').length,0,'only visible controls mount real optical panes');
 env.intersect(true);w.flush(16);
 const controls=[...d.querySelectorAll('.dsHeroActions > *')];
 for(const control of controls){
  const pane=control.querySelector(':scope > .svLiquidPane.svNavMatchedLens');
  assert(pane,'button uses an actual child pane exactly like navbar');
  assert.equal(pane.dataset.swiflyRenderer,'svg');
  assert.equal(pane.querySelectorAll('feDisplacementMap').length,3,'reuse real three-channel navbar distortion');
  assert(control.querySelector('.svNavMatchedLabel'),'direct labels remain above the pane');
  assert(!control.classList.contains('svSharedGlass'),'no duplicate CSS filter on button host');
 }
 assert.equal(d.querySelectorAll('.dsCardQuickActions .svLiquidPane').length,0);
 env.intersect(false);w.flush(32);
 for(const pane of d.querySelectorAll('.dsHeroActions .svLiquidPane'))assert.equal(pane.dataset.swiflyRenderer,'blur','offscreen effects pause');
 env.intersect(true);w.flush(48);
 assert.equal(d.querySelectorAll('.dsHeroActions .svLiquidPane[data-swifly-renderer="svg"]').length,3);
 d.body.dataset.stGlass='off';await tick();w.flush(64);
 assert.equal(w.frameCount(),0);
 env.finish();
});

test('Unsupported SVG filters retain interactive frosted controls without standalone navbar glass',()=>{
  const env=glass('<nav class="netflixNav"><button class="svNavButton">Search</button></nav><div class="dsHeroActions"><a class="dsPrimaryBtn">Play</a></div>'),w=env.window,d=w.document;
  d.body.dataset.stGlass='liquid';
  w.CSS.supports=()=>false;
  w.boot('liquid-glass/liquid-glass.js');
  w.boot('liquid-glass/surfaces.js');
  env.intersect(true);w.flush(16);
  const play=d.querySelector('.dsHeroActions .dsPrimaryBtn');
  assert(play.classList.contains('svGlassControl'));
  assert.equal(play.dataset.swiflyRenderer,'blur');
  assert(!d.querySelector('.netflixNav .svNavButton').classList.contains('svGlassControl'));
  assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length,0);
  env.finish();
});

test('All five movie detail actions refract through independent, navbar-sized pane maps',async()=>{
 const env=glass('<div class="svDetailActions"><a class="dsPrimaryBtn">Play</a><a class="dsSecondaryBtn">Trailer</a><a class="dsSecondaryBtn">Start a watch party</a><button class="dsIconBtn">Save</button><button class="dsIconBtn">Like</button></div>');
 const w=env.window,d=w.document;d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const controls=[...d.querySelectorAll('.svDetailActions > *')];
 assert.equal(controls.length,5);
 for(const control of controls){
  assert(control.classList.contains('svNavMatchedOptic'));
  assert(control.querySelector('.svLiquidPane[data-swifly-renderer="svg"]'));
 }
 assert.equal(d.querySelectorAll('.svDetailActions .svLiquidPane__filters').length,5);
 d.body.dataset.stGlass='subtle';await tick();w.flush(32);
 for(const pane of d.querySelectorAll('.svDetailActions .svLiquidPane'))assert.equal(pane.dataset.swiflyRenderer,'blur');
 assert.equal(w.frameCount(),0);
 env.finish();
});

test('Auth card, tabs, modal chrome and details buttons use real panes without boxing navbar icons',()=>{
 const markup='<nav class="netflixNav"><button class="svNavButton">Search</button></nav>'+
  '<div class="svDetailChrome"><button class="dsIconBtn svDetailBack">Back</button><button class="dsIconBtn svDetailDismiss">Close</button></div>'+
  '<div class="svDetailActions"><a class="dsPrimaryBtn">Play</a><a class="dsSecondaryBtn">Trailer</a><button class="dsSecondaryBtn">Watch Party</button><button class="dsIconBtn">Save</button><button class="dsIconBtn">Like</button></div>'+
  '<a class="dsSecondaryBtn svDetailReturn">Return to browsing</a>'+
  '<main class="dsAuthPageSafe"><div class="dsAuthCard"><div class="dsAuthSwitch"><a href="/login">Log in</a></div><form class="dsSafeAuthForm"><button class="dsPrimaryBtn">Continue</button></form></div></main>';
 const env=glass(markup),w=env.window,d=w.document;d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const targets=[...d.querySelectorAll('.svDetailActions > *, .svDetailChrome > button, .svDetailReturn,.dsAuthSwitch > a,.dsSafeAuthForm > button,.dsAuthCard')];
 assert.equal(targets.length,11);
 for(const node of targets){
  assert(node.classList.contains('svNavMatchedOptic'),node.textContent+' should be truly refractive');
  assert(node.querySelector(':scope > .svLiquidPane.svNavMatchedLens'));
  assert(node.querySelector('.svLiquidPane__filters'),'navbar renderer owns a real SVG graph');
 }
 assert(!d.querySelector('.netflixNav .svNavButton').classList.contains('svGlassSurface'));
 env.finish();
});

test('all optical modes have explicit dark-surface shine, blur fallback and noninteractive highlights',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/controls.css'),'utf8');
 const finish=fs.readFileSync(path.join(__dirname,'../public/clean/finish.css'),'utf8');
 const detail=fs.readFileSync(path.join(__dirname,'../public/clean/polish.css'),'utf8');
 assert.match(css,/\.svGlassSurface\.svGlassControl::before/);
 assert.match(css,/\.svGlassSurface\.svGlassControl::after/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/mask-composite:exclude/);
 assert.match(css,/data-swifly-renderer="svg"/);
 assert.match(css,/var\(--sv-glass-filter\)/);
 assert.match(css,/url\(#sv-shared-action-lens\)/,'shared real SVG filter, not a CSS-only approximation');
 assert.match(css,/data-st-glass="subtle"/);
 assert.match(css,/data-st-glass="off"/);
 assert.match(css,/prefers-reduced-transparency:reduce/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(finish,/\/\* A consistent, visibly refractive surface/,'remove conflicting v175 control material');
 assert.doesNotMatch(detail,/\/\* Every DETAILS action uses the same liquid styling/,'remove conflicting v176 material');
});

test('Logout in the nav dropdown uses real navbar optics without boxing nav icons',()=>{
 const env=glass('<nav class="netflixNav"><button class="svNavButton">Search</button><div class="dsProfileDropdown"><button class="dsDropdownLogout">Log out</button></div></nav>');
 const w=env.window,d=w.document;d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const logout=d.querySelector('.dsDropdownLogout');
 assert(logout.classList.contains('svNavMatchedOptic'));
 assert(logout.querySelector('.svLiquidPane[data-swifly-renderer="svg"]'));
 assert(!d.querySelector('.svNavButton').classList.contains('svGlassSurface'));
 env.finish();
});

test('Auth password Show stays positioned INSIDE its input while sharing glass lens',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/controls.css'),'utf8');
 const match=css.match(/body\.svCleanShell main\.dsAuthPageSafe \.svAuthPasswordToggle\.svGlassControl \{([^}]+)\}/);
 assert(match,'show toggle needs a higher-specificity positioning rule');
 assert.match(match[1],/position:absolute !important/);
 assert.match(match[1],/top:50% !important/);
 assert.match(match[1],/right:9px !important/);
 assert.match(match[1],/transform:translateY\(-50%\) !important/);
 assert.match(css,/\.dsAuthCard\.svGlassPanel \{/);
 assert.match(css,/url\(#sv-shared-panel-lens\)/,'auth panel uses the lighter shared SVG refraction');
 assert.match(css,/\.svWelcomeClean \.dsWelcomeActions > a\.dsPrimaryBtn\.svGlassControl/,'welcome CTA uses navbar material');
 assert.match(css,/background:rgb\(5 8 15 \/ \.38\)/,'match actual nav smoky surface');
 assert.doesNotMatch(css,/radial-gradient\(ellipse 115% 155%/,'remove old silver-white button gradients');
});

test('Shared refraction uses the navbar map geometry, not the previous radial canvas',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/surfaces.js'),'utf8');
 const nav=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/liquid-glass.js'),'utf8');
 assert.match(nav,/mix-blend-mode:\$\{blend\}/,'navbar map mixes directional channels');
 assert.match(src,/mix-blend-mode:screen/,'controls use the same directional map construction');
 assert.match(src,/feDisplacementMap/,'shared graph refracts the real backdrop');
 assert.match(src,/scale:'-118'/,'button refraction is stronger than the old barely visible effect');
 assert.doesNotMatch(src,/document\.createElement\('canvas'\)/,'no heavyweight canvas redraw');
});

test('Password show/hide text replacement repairs its real refractive pane',async()=>{
 const env=glass('<main class="dsAuthPageSafe"><button class="svAuthPasswordToggle">Show</button></main>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const toggle=d.querySelector('button'),original=toggle.querySelector('.svLiquidPane');
 assert(original);
 toggle.textContent='Hide';await tick();w.flush(32);await tick();w.flush(48);
 const replacement=toggle.querySelector('.svLiquidPane');
 assert(replacement && replacement!==original,'resetting button text must restore the physical lens');
 assert.equal(replacement.dataset.swiflyRenderer,'svg');
 env.finish();
});
