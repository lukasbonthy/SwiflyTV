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
  Object.defineProperty(w.navigator, 'userAgent', {value:'Chrome/130.0.0.0', configurable:true});
  w.CSS = {supports:() => true};
  const computed=w.getComputedStyle;
  w.getComputedStyle=(node,pseudo)=>pseudo?{display:'none',content:'none'}:computed(node);
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
  env.textures = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const canvas=this;
    return {
      createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
      putImageData:image=>env.textures.push({canvas,...image})
    };
  };
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,procedural-lens-map';
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

test('Genres mounts the SAME physical SVG pane as the navbar and stays keyboard accessible',()=>{
 const env=glass('<section class="dsBrowseTop"><details class="genreDropdown"><summary>Genres <span>▾</span></summary><div class="genreDropdownMenu"><a href="/genre/movie/1">Action</a></div></details></section>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 env.intersect(true);w.flush(16);
 const summary=d.querySelector('.genreDropdown > summary'),pane=summary.querySelector(':scope > .svNavMatchedLens.svLiquidPane');
 assert(summary.classList.contains('svNavMatchedOptic'),'Genres should no longer be only frosted');
 assert(pane && pane.dataset.swiflyRenderer==='svg','use the navbar optical renderer');
 assert.equal(pane.querySelectorAll('feDisplacementMap').length,3);
 assert.equal(summary.textContent.includes('Genres'),true);
 assert(!pane.hasAttribute('tabindex'),'optical backdrop is not a focus target');
 env.finish();
});

test('Owned Party surfaces retain their DOM while catalog actions receive shared optics',()=>{
 const {partyMarkup}=require('../ui/party');
 const env=glass(partyMarkup({initialTab:'rooms'})+'<div class="dsHeroActions"><button class="dsPrimaryBtn">Play movie</button></div>'),w=env.window,d=w.document;
 const hub=d.querySelector('.svPartyHub'),original=hub.innerHTML;
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 env.intersect(true);w.flush(16);
 assert.equal(hub.querySelectorAll('.svLiquidPane').length,0,'The shared renderer must not inject competing panes into owned controls');
 assert(hub.innerHTML===original,'Enhancing catalog actions must preserve the Party component and its labels');
 assert(d.querySelector('.dsHeroActions .svLiquidPane[data-swifly-renderer="svg"]'),'Catalog actions retain their shared optical renderer');
 env.finish();
});

test('SVG lens maps move along BOTH sampled channels in navbar and shared controls',()=>{
 const env=glass('<nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass></div><a href="/">Home</a></nav><div class="dsHeroActions"><a class="dsPrimaryBtn">Play</a></div>');
 const w=env.window,d=w.document;d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 env.intersect(true);w.flush(16);
 const nav=d.querySelector('.netflixNav > .svLiquidPane');
 assert.equal(nav.dataset.swiflyRenderer,'svg','navbar must render an SVG displacement graph');
 const navFilter=nav.querySelector('svg.svLiquidPane__filters');
 assert(navFilter);
 assert.equal(navFilter.querySelectorAll('feDisplacementMap').length,3);
 for(const displaced of navFilter.querySelectorAll('feDisplacementMap')){
  assert.equal(displaced.getAttribute('xChannelSelector'),'R');
  assert.equal(displaced.getAttribute('yChannelSelector'),'G');
 }
 const navMap=navFilter.querySelector('feImage').getAttribute('href');
 const mapXml=decodeURIComponent(navMap.slice('data:image/svg+xml,'.length));
 assert.match(mapXml,/stop-color="red"/,'horizontal lens map samples red');
 assert.match(mapXml,/stop-color="lime"/,'vertical lens map must sample green');
 assert.doesNotMatch(mapXml,/stop-color="blue"/,'blue gradient leaves green displacement stuck at zero');
 const shared=d.querySelector('.svSharedGlassDefinitions feImage');
 assert(shared,'shared button refraction definitions should mount once');
 const sharedMap=decodeURIComponent(shared.getAttribute('href').slice('data:image/svg+xml,'.length));
 assert.match(sharedMap,/stop-color="lime"/,'shared controls must have real vertical refraction too');
 assert.equal(d.querySelectorAll('.svSharedGlassDefinitions').length,1,'do not allocate extra shared filter graphs');
 env.finish();
});

test('iPad Chrome and Safari mount SVG liquid optics without unsupported backdrop URL filters',()=>{
 const env=glass('<nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass></div></nav>'+
   '<div class="dsHeroActions"><a class="dsPrimaryBtn">Play</a><button class="dsIconBtn">Save</button></div>'+
   '<div class="dsCardQuickActions">'+ '<button class="dsMiniBtn">Save</button>'.repeat(20)+'</div>');
 const w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/155.0.0 Mobile/15E148 Safari/604.1'});
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 env.intersect(true);w.flush(16);
 const pane=d.querySelector('.netflixNav > .svLiquidPane');
 assert.equal(pane.dataset.swiflyRenderer,'webkit-svg');
 assert.equal(w.SwiflyLiquidGlass.mount(pane).mode,'webkit-svg');
 assert(pane.querySelector('svg.svWebkitGlassOptics'),'real SVG optical overlay');
 assert(pane.querySelector('feDisplacementMap'),'SVG refracts the optical highlights');
 assert.equal(pane.querySelector('.svLiquidPane__filters'),null,'no unsupported SVG backdrop filter');
 for(const button of d.querySelectorAll('.dsHeroActions > *')){
   const lens=button.querySelector('.svNavMatchedLens.svLiquidPane');
   assert(lens);
   assert.equal(lens.dataset.swiflyRenderer,'webkit-svg');
   assert(lens.querySelector('svg.svWebkitGlassOptics'));
 }
 assert.equal(d.querySelectorAll('.dsCardQuickActions svg.svWebkitGlassOptics').length,0);
 env.finish();
});
test('macOS Safari SVG optic resizes, pauses and obeys Reduce Transparency',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass></div>');
 const w=env.window,d=w.document,pane=d.querySelector('.svLiquidPane');
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const lens=pane.querySelector('svg.svWebkitGlassOptics');
 assert(lens);
 const controller=w.SwiflyLiquidGlass.mount(pane);
 assert.equal(controller.supported,true);
 pane.getBoundingClientRect=()=>({width:300,height:48});
 env.resize();w.flush(32);
 assert.equal(pane.querySelectorAll('svg.svWebkitGlassOptics').length,1);
 assert.notEqual(pane.querySelector('svg.svWebkitGlassOptics'),lens);
 Object.defineProperty(d,'hidden',{value:true,configurable:true});
 d.dispatchEvent(new w.Event('visibilitychange'));
 assert.equal(pane.dataset.swiflyRenderer,'blur');
 assert.equal(w.frameCount(),0);
 Object.defineProperty(d,'hidden',{value:false,configurable:true});
 d.dispatchEvent(new w.Event('visibilitychange'));w.flush(48);
 assert.equal(pane.dataset.swiflyRenderer,'webkit-svg');
 const reduced=w.matchMedia('(prefers-reduced-transparency: reduce)');
 reduced.matches=true;for(const listener of reduced.listeners)listener({matches:true});
 assert.equal(pane.querySelector('svg.svWebkitGlassOptics'),null);
 assert.equal(pane.dataset.swiflyRenderer,'blur');
 assert.equal(w.frameCount(),0);
 controller.destroy();env.finish();
});
test('WebKit optical CSS includes live blur and reduced-transparency fallback',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/liquid-glass.css'),'utf8');
 const controls=fs.readFileSync(path.join(__dirname,'../public/liquid-glass/controls.css'),'utf8');
 assert(css.includes('svg.svWebkitGlassOptics'));
 assert(css.includes('data-swifly-renderer="webkit-svg"'));
 assert(css.includes('-webkit-backdrop-filter:blur(2px)'));
 assert(controls.includes('netflixNav > .svLiquidPane[data-swifly-renderer="webkit-svg"]'));
 assert(controls.includes('prefers-reduced-transparency:reduce'));
});

test('Safari displacement receives native artwork while text stays in the live backdrop',()=>{
 const env=glass('<main><div class="dsHeroBg" style="background-image:url(/movie-art.jpg)"></div><h1>Featured movie</h1></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>');
 const w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const lens=d.querySelector('svg.svWebkitGlassOptics'),scene=lens.querySelector('[data-sv-glass-scene]');
 assert(scene,'the SVG must have real backdrop content to refract');
 assert.match(scene.innerHTML,/movie-art\.jpg/);
 assert.equal(scene.textContent,'');
 assert(scene.querySelector('image'));
 assert(lens.querySelector('feImage'),'displacement must sample a spatial map');
 const displaced=scene.closest('[filter]');
 assert(displaced,'actual artwork must pass through the SVG filter');
 assert(lens.querySelector('feDisplacementMap[in2="map"]'));
 env.finish();
});

test('Safari scene tracks scrolling and changed artwork without rebuilding the filter or running idle frames',async()=>{
 const env=glass('<main><div class="art" style="background-image:url(/before.jpg)"></div></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>');
 const w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 let top=0;
 for(const node of d.querySelectorAll('main,.art'))node.getBoundingClientRect=()=>({width:400,height:200,top,left:0,bottom:top+200,right:400});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();
 const pane=d.querySelector('.svLiquidPane'),lens=pane.querySelector('svg'),scene=lens.querySelector('[data-sv-glass-scene]');
 assert(scene,'a real background scene is required');
 const position=()=>Number(scene.querySelector('image').getAttribute('y'));
 const before=position();
 top=-64;d.dispatchEvent(new w.Event('scroll'));w.flush(32);await tick();
 assert.equal(pane.querySelector('svg'),lens,'scrolling must reuse the optical graph');
 assert.equal(position(),before-64);
 d.querySelector('.art').style.backgroundImage='url(/after.jpg)';await tick();w.flush(48);await tick();
 assert.match(scene.innerHTML,/after\.jpg/);
 assert.equal(w.frameCount(),0,'sampling must settle without its own mutation feedback loop');
 d.body.dataset.stGlass='off';await tick();w.flush(64);await tick();
 d.dispatchEvent(new w.Event('scroll'));
 assert.equal(w.frameCount(),0,'disabled glass must not sample scrolling content');
 assert.equal(pane.querySelector('svg'),null);
 env.finish();
});

test('iPad desktop Chrome identity never installs an unsupported shared backdrop URL lens',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass></div><button class="dsRowArrow">Next</button>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Chrome/155.0.0 Safari/605.1.15'});
 Object.defineProperty(w.navigator,'platform',{configurable:true,value:'MacIntel'});
 Object.defineProperty(w.navigator,'maxTouchPoints',{configurable:true,value:5});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');w.flush(16);
 assert.equal(d.querySelector('.svLiquidPane').dataset.swiflyRenderer,'webkit-svg');
 assert.equal(d.querySelector('.svSharedGlassDefinitions'),null);
 assert(!d.body.classList.contains('svSharedGlassReady'));
 env.finish();
});

test('Safari ignores its sampled image loads while refreshing for an original image load',async()=>{
 const env=glass('<main><img src="/poster.jpg" alt="Poster"></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 const sampled=d.querySelector('[data-sv-glass-scene] image');assert(sampled);assert.equal(w.frameCount(),0);
 sampled.dispatchEvent(new w.Event('load'));
 assert.equal(w.frameCount(),0,'cloned image loads must not recursively schedule scene sampling');
 d.querySelector('main img').dispatchEvent(new w.Event('load'));
 assert.equal(w.frameCount(),1,'an original loaded image should refresh the lens');
 w.flush(32);await tick();assert.equal(w.frameCount(),0);
 env.finish();
});

test('Safari refreshes settled transitions and animations without listening to its own optics',async()=>{
 const env=glass('<main><div class="art" style="background-image:url(/movie.jpg)"></div></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 const art=d.querySelector('.art'),original=w.getComputedStyle;let opacity='0';
 w.getComputedStyle=node=>{
  const computed=original(node);if(node!==art)return computed;
  return new Proxy(computed,{get(target,key){if(key==='opacity')return opacity;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 };
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 const scene=d.querySelector('[data-sv-glass-scene]');assert(!scene.innerHTML.includes('movie.jpg'));assert.equal(w.frameCount(),0);
 opacity='1';art.dispatchEvent(new w.Event('transitionend',{bubbles:true}));
 assert.equal(w.frameCount(),1,'finished transitions must sample their final paint');
 w.flush(32);await tick();assert(scene.innerHTML.includes('movie.jpg'));
 art.dispatchEvent(new w.Event('animationend',{bubbles:true}));assert.equal(w.frameCount(),1);
 w.flush(48);await tick();
 scene.querySelector('image').dispatchEvent(new w.Event('transitionend',{bubbles:true}));
 assert.equal(w.frameCount(),0,'sampled content must not schedule another capture');
 env.finish();
});

test('Safari bounds large artwork captures to the lens band while preserving source layout and mask',()=>{
 const env=glass('<main><div class="art" style="background-image:url(/wide.jpg);background-position:center 43%;mask-image:linear-gradient(black,transparent)"></div></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 for(const node of d.querySelectorAll('main,.art'))node.getBoundingClientRect=()=>({width:3000,height:3000,left:-400,top:-200,right:2600,bottom:2800});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const scene=d.querySelector('[data-sv-glass-scene]'),clip=scene.querySelector('clipPath rect'),copy=scene.querySelector('image');assert(clip&&copy);
 assert(Number(clip.getAttribute('width'))<=328 && Number(clip.getAttribute('height'))<=168,'a large hero must not rasterize outside the sampled lens band');
 assert.equal(copy.getAttribute('width'),'3000');assert.equal(copy.getAttribute('height'),'3000');
 assert.equal(Number(copy.getAttribute('x')),-400);assert.equal(Number(copy.getAttribute('y')),-200);
 const mask=scene.querySelector('mask rect');assert.equal(mask.getAttribute('height'),'3000');
 env.finish();
});

test('Safari refracts native SVG artwork without copying paragraphs into its action lenses',()=>{
 const env=glass('<main><div class="dsHeroBg" style="background-image:url(/actual-art.jpg);filter:brightness(1.1) saturate(1.24) contrast(1.035);mask-image:linear-gradient(black,transparent)"></div><p>side of their lives they never intended to expose</p><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button></div></main>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const scene=d.querySelector('[data-sv-glass-scene]');assert(scene);
 assert(scene.querySelector('image[href="/actual-art.jpg"]'),'art must be an SVG image that participates in the SVG filter');
 assert.equal(scene.querySelector('foreignObject'),null,'composited HTML must not escape the clipping or bypass refraction');
 assert.equal(scene.textContent,'','caption text must remain in its original page layout');
 assert(scene.querySelector('feComponentTransfer'),'brightness/contrast belong in the SVG paint graph');
 assert(scene.querySelector('mask'),'the source fade must be an SVG mask, not a composited HTML layer');
 env.finish();
});

test('Safari preserves artwork wrapper fades and color filters on descendant images',()=>{
 const env=glass('<main><div class="dsWelcomeHeroBg" style="mask-image:linear-gradient(transparent,transparent);filter:brightness(.7)"><img src="/welcome-art.jpg" alt="Welcome"></div></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const scene=d.querySelector('[data-sv-glass-scene]'),image=scene.querySelector('image');assert.match(image.getAttribute('href'),/\/welcome-art\.jpg$/);
 const masked=image.closest('[mask]');
 assert(masked&&scene.contains(masked),'a wrapper fade must cover its descendant artwork even when the wrapper has no paint of its own');
 const mask=scene.querySelector(masked.getAttribute('mask').slice(4,-1));
 assert(mask.querySelector('rect'),'the source wrapper mask must retain its geometry');
 const filtered=image.closest('[filter]');assert(filtered&&scene.contains(filtered),'source wrapper color filters must include descendant artwork');
 assert(scene.querySelector(filtered.getAttribute('filter').slice(4,-1)).querySelector('feFuncR[slope="0.7"]'));
 env.finish();
});

test('Safari lens follows the rounded surface normals and leaves the center neutral',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"></main><div class="svLiquidPane" data-swifly-glass></div>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.querySelector('.svLiquidPane').getBoundingClientRect=()=>({width:200,height:60,top:0,left:0,bottom:60,right:200});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();
 assert(env.textures.length,'refraction must be derived from the shape, not two full-pane linear gradients');
 const {width,height,data}=env.textures[0];
 const pixel=(x,y)=>[...data.slice((y*width+x)*4,(y*width+x)*4+2)];
 const cx=Math.floor(width/2),cy=Math.floor(height/2);
 const center=pixel(cx,cy),top=pixel(cx,2),bottom=pixel(cx,height-3),left=pixel(2,cy),right=pixel(width-3,cy),corner=pixel(7,7);
 assert(center.every(channel=>Math.abs(channel-128)<=1),'the clear center must not translate the artwork');
 assert(Math.abs(top[0]-128)<=1&&top[1]>128&&bottom[1]<128,'straight horizontal edges bend vertically in opposite directions');
 assert(Math.abs(left[1]-128)<=1&&left[0]>128&&right[0]<128,'straight vertical edges bend horizontally in opposite directions');
 assert(corner[0]>128&&corner[1]>128,'rounded corners must bend along both channels');
 const generated=env.textures.length;
 d.dispatchEvent(new w.Event('scroll'));w.flush(32);await tick();
 assert.equal(env.textures.length,generated,'scrolling updates source artwork without regenerating lens geometry');
 assert.equal(w.frameCount(),0);env.finish();
});

test('Safari glass preserves the hero ambient radial glow and its source fade',()=>{
 const env=glass('<main><section class="dsHero"><div style="background-image:url(/hero.jpg)"></div></section></main><div class="svLiquidPane" data-swifly-glass></div>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 const original=w.getComputedStyle;
 w.getComputedStyle=(node,pseudo)=>node.classList.contains('dsHero')&&pseudo==='::after'?{
  display:'block',content:'""',backgroundImage:'radial-gradient(ellipse 65% 78% at 19% 49%,rgba(181,97,54,.28) 0%,transparent 79%)',backgroundColor:'transparent',
  left:'0px',right:'0px',top:'auto',bottom:'0px',width:'200px',height:'20px',filter:'none',opacity:'1',zIndex:'-1',maskImage:'linear-gradient(to bottom,transparent,black,transparent)'
 }:original(node,pseudo);
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');
 w.flush(16);
 const scene=d.querySelector('[data-sv-glass-scene]'),glow=scene.querySelector('radialGradient');
 assert(glow,'the visible colored hero glow must participate in the lens, rather than exposing a different picture beneath it');
 const coordinates=glow.getAttribute('gradientTransform').match(/-?[\d.]+/g).map(Number);
 assert.deepEqual(coordinates,[38,29.8,130,15.6]);
 assert.match(glow.querySelector('stop').getAttribute('stop-color'),/181,97,54/);
 assert(scene.querySelector('mask rect[y="20"][height="20"]'),'the ambient glow must retain its source fade');
 assert.equal(scene.textContent,'');env.finish();
});

test('Safari pill clipping uses the same radius as its rounded optical field',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass style="border-top-left-radius:999px"></div>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const clip=d.querySelector('.svWebkitGlassOptics clipPath[id$="-clip"] rect');
 assert.equal(Number(clip.getAttribute('rx')),20,'a CSS pill is capped by half its height, rather than becoming a wide SVG ellipse');
 env.finish();
});

test('Safari lenses share one frame and finish scene reads before committing either lens',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"></main><nav><div class="svLiquidPane" data-swifly-glass></div><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();
 const order=[],computed=w.getComputedStyle;
 w.getComputedStyle=(...args)=>{order.push('read');return computed(...args);};
 for(const scene of d.querySelectorAll('[data-sv-glass-scene]')){
  const replace=scene.replaceChildren.bind(scene);scene.replaceChildren=(...args)=>{order.push('commit');return replace(...args);};
 }
 d.dispatchEvent(new w.Event('scroll'));
 assert.equal(w.frameCount(),1,'several lenses must share one scene update frame');
 w.flush(32);await tick();
 assert.equal(order.filter(value=>value==='commit').length,2);
 assert(order.lastIndexOf('read')<order.indexOf('commit'),'no style read may follow the first SVG scene write');
 assert.equal(w.frameCount(),0);env.finish();
});

test('Safari ignores text-only page mutations because its lens samples artwork rather than text',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"><span id="status">Ready</span></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 assert.equal(w.frameCount(),0,'initial page load must settle before the text changes');
 const status=d.getElementById('status');status.firstChild.data='1:24';await tick();
 assert.equal(w.frameCount(),0,'a playback clock must not recapture every lens');
 status.textContent='1:25';await tick();assert.equal(w.frameCount(),0);
 d.querySelector('main').style.backgroundImage='url(/changed.jpg)';await tick();
 assert.equal(w.frameCount(),1,'changed artwork must continue to refresh');w.flush(32);
 assert.match(d.querySelector('[data-sv-glass-scene]').innerHTML,/changed\.jpg/);env.finish();
});

test('Safari does not build or sample panes hidden by an ancestor',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"></main><nav style="visibility:hidden"><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();
 assert.equal(d.querySelector('.svWebkitGlassOptics'),null,'a closed profile menu needs no SVG scene');
 d.querySelector('nav').style.visibility='visible';await tick();w.flush(32);await tick();
 assert(d.querySelector('.svWebkitGlassOptics'),'opening the menu restores its original glass');env.finish();
});

test('Touch Safari bounds repeated scroll sampling and captures the final position without an idle frame loop',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 w.matchMedia('(pointer: coarse)').matches=true;
 let clock=0;Object.defineProperty(w.performance,'now',{configurable:true,value:()=>clock});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 const timers=new Map();let timerId=0;
 w.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,at:clock+delay});return timerId;};w.clearTimeout=id=>timers.delete(id);
 const runTimers=()=>{for(const [id,timer] of timers)if(timer.at<=clock){timers.delete(id);timer.fn();}};
 const scene=d.querySelector('[data-sv-glass-scene]'),replace=scene.replaceChildren.bind(scene);let captures=0,top=0;
 scene.replaceChildren=(...args)=>{captures++;return replace(...args);};
 d.querySelector('main').getBoundingClientRect=()=>({width:400,height:1000,left:0,top,right:400,bottom:top+1000});
 for(let i=1;i<=20;i++){clock=i*16;top=-i*4;d.dispatchEvent(new w.Event('scroll'));runTimers();w.flush(clock);}
 clock+=60;runTimers();w.flush(clock);await tick();
 assert(captures>0&&captures<=7,'20 scroll events should require at most seven artwork captures');
 assert.equal(Number(scene.querySelector('image').getAttribute('y')),top,'the settled frame must sample the latest artwork position');
 assert.equal(w.frameCount(),0);assert.equal(timers.size,0,'sampling must stop once the queued scene is current');env.finish();
});

test('Safari rejects offscreen catalog row branches before resolving their styles or sort order',()=>{
 const env=glass('<main style="background-image:url(/hero.jpg)">'+('<section class="dsRow"><div>'+('<article class="movieCard"><img src="/poster.jpg"></article>'.repeat(20))+'</div></section>').repeat(40)+'</main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 for(const row of d.querySelectorAll('.dsRow'))row.getBoundingClientRect=()=>({width:800,height:400,left:0,top:2000,bottom:2400,right:800});
 const computed=w.getComputedStyle;let offscreenStyles=0;
 w.getComputedStyle=(node,...args)=>{if(node.closest('.dsRow'))offscreenStyles++;return computed(node,...args);};
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 assert.equal(offscreenStyles,0,'rows below the sampled lens band must not resolve all their sibling styles for z-order');
 assert.match(d.querySelector('[data-sv-glass-scene]').innerHTML,/hero\.jpg/);env.finish();
});

test('Safari does not recapture navigation for a settled paint change outside its sampled band',async()=>{
 const env=glass('<main style="background-image:url(/hero.jpg)"><section class="below">More movies</section></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
 const below=d.querySelector('.below');below.getBoundingClientRect=()=>({width:400,height:200,left:0,top:2000,bottom:2200,right:400});
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 const scene=d.querySelector('[data-sv-glass-scene]'),replace=scene.replaceChildren.bind(scene);let captures=0;
 scene.replaceChildren=(...args)=>{captures++;return replace(...args);};
 below.dispatchEvent(new w.Event('transitionend',{bubbles:true}));w.flush(32);await tick();
 assert.equal(captures,0,'an offscreen rail reveal must not redraw a fixed navigation lens');
 below.style.backgroundImage='url(/below.jpg)';await tick();w.flush(48);await tick();assert.equal(captures,0);
 d.querySelector('main').style.backgroundImage='url(/updated-hero.jpg)';await tick();w.flush(64);await tick();assert.equal(captures,1);
 assert.match(scene.innerHTML,/updated-hero\.jpg/);env.finish();
});
