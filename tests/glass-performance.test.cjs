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
  const encode=w.encodeURIComponent;
  w.encodeURIComponent=value=>{if(String(value).startsWith('<svg'))env.textures.push(String(value));return encode(value);};
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

test('Desktop wheel motion has weight and preserves ordinary wheel distance', () => {
  const env = browser('<main>Catalog</main>'), w = env.window;
  w.boot('motion.js');
  assert.equal(wheel(w, w.document.querySelector('main')).defaultPrevented, true);
  w.flush(16);
  assert(env.page.scrollTop > 6 && env.page.scrollTop < 18, 'The first frame should start a measured glide');
  for (let time = 32; time <= 128; time += 16) w.flush(time);
  assert(env.page.scrollTop > 50 && env.page.scrollTop < 80, 'The first 128ms should leave distance for an inertial settle');
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
 assert.equal(d.querySelectorAll('.dsHeroActions > .svNavMatchedOptic > .svNavMatchedLens').length,3,'native panes exist before any hover/intersection');
 assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length,0,'invisible buttons do not allocate SVG geometry');
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

test('Standalone buttons and action links get native glass at rest without a filter-graph burst',()=>{
 const env=glass('<section class="dsAccountActions"><a class="dsSecondaryBtn">Profile</a><a class="btn">Browse</a></section><form><input type="submit" value="Save"></form><div class="dsCardQuickActions"><button class="dsMiniBtn">Save</button></div>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 for(const node of d.querySelectorAll('.dsAccountActions>a')){
  assert(node.classList.contains('svNavMatchedOptic'),'standalone action missing nav material: '+node.outerHTML);
  assert(node.querySelector(':scope>.svNavMatchedLens'),'pane should not depend on hover or intersection');
 }
 assert(d.querySelector('form>input').classList.contains('svGlassControl'),'submit inputs use native glass');
 assert.equal(d.querySelector('form>input>.svNavMatchedLens'),null,'void form inputs must never receive child panes');
 assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length,0,'offscreen panes cost no SVG filter graphs');
 assert.equal(d.querySelector('.dsCardQuickActions .svNavMatchedLens'),null,'dense repeats remain native');
 env.intersect(true);w.flush(16);
 assert.equal(d.querySelectorAll('.dsAccountActions .svNavMatchedLens[data-swifly-renderer="svg"],form .svNavMatchedLens[data-swifly-renderer="svg"]').length,2);
 env.finish();
});

test('Hero glass has identical nav RGB refraction and keeps its graph when resized',()=>{
 const env=glass('<nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass></div></nav><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button><button class="dsIconBtn">Save</button></div>');
 const w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const nav=d.querySelector('.netflixNav>.svLiquidPane');
 const hero=d.querySelector('.dsHeroActions>.dsPrimaryBtn>.svNavMatchedLens');
 const scales=pane=>[...pane.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')));
 assert.deepEqual(scales(nav),[-180,-170,-160],'navbar must keep the original reference field');
 assert.deepEqual(scales(hero),scales(nav),'hero Play must have exactly the same real RGB refraction as navbar');
 const originalGraph=hero.querySelector('svg.svLiquidPane__filters');
 hero.getBoundingClientRect=()=>({width:60,height:40,top:0,left:0,right:60,bottom:40});
 env.resize();w.flush(32);
 assert.deepEqual(scales(hero),scales(nav),'button resize must preserve the identical navbar optical field');
 assert.equal(hero.querySelector('svg.svLiquidPane__filters'),originalGraph,'resize reuses filter graph without leaking DOM nodes');
 assert.deepEqual(scales(nav),[-180,-170,-160],'resizing a hero must never change navbar optics');
 assert.equal(w.frameCount(),0,'button refraction must not start an idle animation loop');
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

test('Party optical enhancement preserves live controls, labels and player-owned surfaces',()=>{
 const {partyMarkup}=require('../ui/party');
 const env=glass(partyMarkup({initialTab:'rooms'})+'<div class="dsHeroActions"><button class="dsPrimaryBtn">Play movie</button></div>'),w=env.window,d=w.document;
 const hub=d.querySelector('.svPartyHub'),original=[...hub.querySelectorAll('button,a,input,select')].map(node=>({node,text:node.textContent}));
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 env.intersect(true);w.flush(16);
 assert(hub.querySelector('.partyModeNav > .svLiquidPane'),'Party navigation should receive its own bounded optical surface');
 assert(original.every(({node,text})=>node.isConnected&&node.textContent===text),'enhancement must preserve the original interactive nodes and labels');
 assert.equal(hub.querySelectorAll('[data-player-root] .svLiquidPane').length,0,'the embedded player keeps its own optical treatment');
 assert.equal(hub.querySelectorAll('.partySetup.svNavMatchedOptic,.partyConversation.svNavMatchedOptic').length,0,'owned content panels must not receive competing panes');
 assert(d.querySelector('.dsHeroActions .svLiquidPane[data-swifly-renderer="svg"]'),'Catalog actions retain their shared optical renderer');
 env.finish();
});



for (const [name, identity, platform, points] of [
 ['macOS Safari','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15','MacIntel',0],
 ['iPad Chrome','Mozilla/5.0 (iPad) AppleWebKit/605.1.15 CriOS/155.0.0 Mobile/15E148 Safari/604.1','iPad',5],
 ['iPad desktop Chrome','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Chrome/155.0.0.0 Safari/605.1.15','MacIntel',5]
]) test(name+' keeps native backdrop glass without scene sampling or geometry work',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"><img src="/poster.jpg"></main><nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass></div></nav><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button></div>'),w=env.window,d=w.document;
 Object.defineProperties(w.navigator,{userAgent:{configurable:true,value:identity},platform:{configurable:true,value:platform},maxTouchPoints:{configurable:true,value:points}});
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);await tick();w.flush(32);
 const pane=d.querySelector('.netflixNav > .svLiquidPane'),controller=w.SwiflyLiquidGlass.mount(pane);
 assert.equal(controller.mode,'blur','unsupported live SVG backdrops use the browser native blur');
 assert.equal(controller.supported,false);
 assert.equal(d.querySelectorAll('svg,.svSharedGlassDefinitions').length,0,'fallback glass must not copy page artwork or allocate an optical graph');
 assert.equal(d.querySelector('.dsPrimaryBtn .svNavMatchedLens').dataset.swiflyRenderer,'blur');
 assert.equal(env.textures.length,0);assert.equal(env.watched(),0);
 let reads=0;const computed=w.getComputedStyle;w.getComputedStyle=(...args)=>{reads++;return computed(...args);};
 for(const event of ['scroll','load','transitionend','animationend'])d.querySelector('main').dispatchEvent(new w.Event(event,{bubbles:true}));
 d.querySelector('main').style.backgroundImage='url(/changed.jpg)';await tick();
 w.dispatchEvent(new w.Event('resize'));controller.refresh();env.resize();
 assert.equal(w.frameCount(),0,'native glass follows browser paint without JavaScript frames');assert.equal(reads,0);
 controller.destroy();assert.equal(pane.dataset.swiflyRenderer,undefined);env.finish();
});

test('Android Chrome never allocates RGB SVG graphs for hero, detail or mobile navigation',()=>{
 const env=glass('<nav class="netflixNav"><span class="svLiquidPane" data-swifly-glass></span></nav><div class="dsHeroActions"><a class="dsPrimaryBtn">Play</a><a class="dsSecondaryBtn">Details</a><button class="dsIconBtn">Save</button></div><div class="svDetailActions"><button class="dsPrimaryBtn">Play</button><button class="dsIconBtn">Like</button></div><nav class="mobileNav"><span class="svLiquidPane" data-swifly-glass></span><a>Home</a></nav>'),w=env.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'});
 d.body.dataset.stGlass='liquid';
 w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const lenses=[...d.querySelectorAll('.netflixNav>.svLiquidPane,.mobileNav>.svLiquidPane,.dsHeroActions>.svNavMatchedOptic>.svLiquidPane,.svDetailActions>.svNavMatchedOptic>.svLiquidPane')];
 assert.equal(lenses.length,7,'all navigation, hero and detail lenses exist');
 assert(lenses.every(l=>l.dataset.swiflyRenderer==='blur'),'touch UI uses native live frost, never broken SVG displacement');
 assert.equal(d.querySelectorAll('feDisplacementMap').length,0,'mobile must not generate the rainbow RGB graph');
 assert.equal(env.textures.length,0,'touch navigation does not allocate any lens maps');
 assert.equal(w.frameCount(),0,'native frost does not require continuous animation');
 env.finish();
});

test('Desktop navigation retains original SVG optics while mobile navigation uses clean native glass',()=>{
 const env=glass('<nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass></div></nav><nav class="mobileNav"><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const desktop=d.querySelector('.netflixNav>.svLiquidPane'),mobile=d.querySelector('.mobileNav>.svLiquidPane');
 assert.equal(desktop.dataset.swiflyRenderer,'svg');
 assert.deepEqual([...desktop.querySelectorAll('feDisplacementMap')].map(n=>Number(n.getAttribute('scale'))),[-180,-170,-160]);
 assert.equal(mobile.dataset.swiflyRenderer,'blur','bottom navigation never uses RGB distortion, even under a desktop UA');
 assert.equal(mobile.querySelectorAll('feDisplacementMap').length,0,'mobile panel is never over-distorted');
 assert.equal(env.textures.length,1,'only the desktop navbar allocates an optical map');
 assert.equal(w.frameCount(),0);env.finish();
});

test('Vector lens geometry is cached, bounded and independent of canvas or page artwork',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass></div>'),w=env.window,d=w.document;
 w.HTMLCanvasElement.prototype.getContext=()=>{throw Error('glass must not rasterize or sample artwork');};
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const create=w.SwiflyLiquidGlass.createTexture,first=create(240,60,24);
 assert.equal(create(240,60,24),first,'same geometry reuses the cached object');
 assert.notEqual(create(240,60,24,11),first,'different shoulder widths must not alias');
 const map=d.querySelector('feImage').getAttribute('href');assert.match(map,/^data:image\/svg\+xml,/);
 assert(decodeURIComponent(map).length<2000,'vector complexity stays small');
 const large=create(16000,9000,24);assert(large.map.length<4000,'large panes do not allocate page-size bitmaps');
 for(let i=0;i<49;i++)create(300+i,50,20);
 assert.notEqual(create(240,60,24),first,'old maps leave the bounded LRU cache');
 for(const geometry of [[0,60,24],[-1,60,24],[NaN,60,24],[Infinity,60,24]])assert.equal(create(...geometry),null);
 const generated=env.textures.length;w.dispatchEvent(new w.Event('resize'));w.flush(32);
 assert.equal(env.textures.length,generated,'unchanged geometry does not regenerate its map');
 assert.equal(w.frameCount(),0);env.finish();
});

test('Rising detail sheets retain native glass and defer optical geometry until the sheet settles',()=>{
 const env=glass('<dialog open class="svDetailDialog" data-sv-detail-state="opening"><div class="svDetailChrome"><button class="svDetailBack">Back</button><button class="svDetailDismiss">Close</button></div><div class="svDetailActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Watch party</button></div></dialog>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const panes=[...d.querySelectorAll('.svNavMatchedLens')];
 assert.equal(panes.length,4,'both the chrome and action panes remain visible throughout the entrance');
 assert(panes.every(pane=>pane.dataset.swiflyRenderer==='blur'));
 assert.equal(env.textures.length,0,'opening the sheet must not allocate displacement maps on the animation frame');
 assert.equal(w.frameCount(),0,'deferred optics must not poll while the sheet is moving');
 d.querySelector('dialog').dataset.svDetailState='open';w.SwiflyGlassSurfaces.refresh(d.querySelector('dialog'));w.flush(32);
 assert(panes.every(pane=>pane.dataset.swiflyRenderer==='svg'),'settling the sheet enables its live rounded rims');
 assert.equal(env.textures.length,1,'identically sized lenses share one generated geometry map');env.finish();
});

test('Party navigation containers and standalone actions gain bounded lenses while player controls keep their own renderer',async()=>{
 const env=glass('<main class="svPartyHub"><nav class="partyModeNav"><button>Rooms</button><button>Community</button></nav><div class="partyEntryTabs"><button>Host</button><button>Join</button></div><button class="partySecondaryBtn">Invite friends</button><button class="partyIconBtn">Copy room link</button><button class="partyHeroPick">Choose film</button><section class="partySetup"><button>Setup</button></section><div data-player-root class="svPlayerEmbedded"><button class="partyIconBtn">Play</button><button class="dsPrimaryBtn">Player action</button></div></main>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 assert.equal(d.querySelectorAll('.svPartyHub>.svNavMatchedOptic').length,5,'only the selected Party surfaces should own lenses');
 assert.equal(d.querySelectorAll('.svNavMatchedLens').length,6,'offscreen Party actions already have their native glass panes');
 assert.equal(d.querySelectorAll('svg.svLiquidPane__filters').length,0,'offscreen panes do not allocate optical geometry');
 env.intersect(true);w.flush(16);
 assert.equal(d.querySelectorAll('.svPartyHub>.svNavMatchedOptic>.svNavMatchedLens[data-swifly-renderer="svg"]').length,5);
 assert.equal(d.querySelectorAll(':is(.partyModeNav,.partyEntryTabs)>.svNavMatchedLens[data-swifly-renderer="svg"]').length,2,'segmented controls share one shallow optical surface');
 assert.equal(d.querySelectorAll('.partyModeNav button .svLiquidPane,.partyEntryTabs button .svLiquidPane,.svPlayerEmbedded .svLiquidPane').length,0,'tab children and player controls must not stack additional lenses');
 const removed=d.querySelector('.partySecondaryBtn');removed.remove();await tick();w.flush(32);
 assert.equal(removed.querySelector('.svLiquidPane'),null,'removed Party actions must release their child pane');
 assert.equal(d.querySelectorAll('.svNavMatchedLens').length,5,'the setup action also owns its visible lens');env.finish();
});

test('Chromium glass does not require a canvas context',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass></div>'),w=env.window,d=w.document;
 w.HTMLCanvasElement.prototype.getContext=()=>null;d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 assert.equal(d.querySelector('.svLiquidPane').dataset.swiflyRenderer,'svg');
 assert(d.querySelector('.svLiquidPane svg'),'vector glass remains available without a canvas');env.finish();
});

test('Chromium rebuilds an externally detached optical graph on the next refresh',async()=>{
 const env=glass('<main style="background-image:url(/art.jpg)"></main><nav><div class="svLiquidPane" data-swifly-glass></div></nav>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);await tick();w.flush(20);await tick();
 const pane=d.querySelector('.svLiquidPane'),original=pane.querySelector('svg');assert(original);original.remove();await tick();
 w.dispatchEvent(new w.Event('resize'));w.flush(32);
 assert(pane.querySelector('svg'),'an unchanged box must still replace a detached graph in the same update');
 assert.equal(pane.querySelectorAll(':scope > svg').length,1);assert.equal(pane.dataset.swiflyRenderer,'svg');env.finish();
});


test('Repeated secondary actions use native material without shared displacement graphs',async()=>{
 const env=glass('<button class="dsRowArrow">Next</button><div class="dsCardQuickActions"><button class="dsMiniBtn">Save</button></div>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');w.flush(16);
 const control=d.createElement('button');control.className='dsRowArrow';d.body.append(control);await tick();w.flush(32);
 assert([...d.querySelectorAll('button')].every(node=>node.classList.contains('svGlassControl')));
 assert.equal(d.querySelectorAll('svg,.svLiquidPane').length,0,'repeat controls must not stack displacement filters while scrolling');
 assert.equal(env.textures.length,0);assert.equal(env.watched(),0);assert.equal(w.frameCount(),0);env.finish();
});

test('A renderable pane prepares its geometry before an opacity entrance becomes visible',async()=>{
 const env=glass('<section style="opacity:0"><div class="svLiquidPane" data-swifly-glass></div></section>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
 const pane=d.querySelector('.svLiquidPane');
 assert.equal(pane.dataset.swiflyRenderer,'svg','an opacity fade must begin with the rounded optical graph already ready, without later input');
 assert.equal(env.textures.length,1);assert.equal(w.frameCount(),0,'a hidden entrance must not require a repaint loop');
 d.querySelector('section').style.opacity='1';await tick();w.flush(32);
 assert.equal(pane.dataset.swiflyRenderer,'svg');assert.equal(env.textures.length,1,'opacity changes reuse the same geometry');
 assert.equal(w.frameCount(),0);env.finish();
});

test('Non-renderable ancestors still avoid allocating optical geometry',()=>{
 for(const declaration of ['display:none','visibility:hidden']){
  const env=glass('<section style="'+declaration+'"><div class="svLiquidPane" data-swifly-glass></div></section>'),w=env.window,d=w.document;
  d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.flush(16);
  assert.equal(d.querySelector('.svLiquidPane').dataset.swiflyRenderer,'blur');assert.equal(env.textures.length,0);assert.equal(w.frameCount(),0);env.finish();
 }
});

test('Ordinary buttons, Party primary actions and disclosure controls share glass without filtering page panels',()=>{
 const env=glass('<main><button id="plain">Refresh</button><details><summary>Options</summary><p>Panel content</p></details><div id="controlPanel"><button class="stChoice">Appearance</button></div><button class="svAvatarClose">Close avatar picker</button><div class="dsAccountActions"><a class="dsPrimaryBtn">Continue watching</a></div></main><main class="svPartyHub"><button class="partyPrimaryBtn">Create watch party</button><button class="sv100Channel">General</button><button id="sv103RoomCode">ABCD</button><details class="partyLinkChoice"><summary>Use a video link</summary></details><div class="sv100RoomItem"><button class="partySecondaryBtn">Join party</button></div><div data-player-root><button>Player-owned</button></div></main>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');
 for(const node of d.querySelectorAll('button:not([data-player-root] button),summary,.dsAccountActions a'))assert(node.classList.contains('svGlassControl'),'missing glass material on '+node.outerHTML);
 env.intersect(true);w.flush(16);
 assert(d.querySelector('.partyPrimaryBtn > .svNavMatchedLens[data-swifly-renderer="svg"]'),'the main Party action uses the real bounded optical pane');
 assert(d.querySelector('.dsAccountActions .dsPrimaryBtn > .svNavMatchedLens'),'account primary actions share the prominent optical material');
 assert.equal(d.querySelector('.sv100RoomItem .svNavMatchedLens'),null,'repeated directory actions stay native rather than multiplying SVG filters');
 assert.equal(d.querySelectorAll('main.svGlassSurface,details.svGlassSurface,[data-player-root] .svGlassSurface').length,0,'only interactive surfaces are enhanced');
 assert(d.querySelector('#plain .svLiquidPane'));assert(d.querySelector('#sv103RoomCode .svLiquidPane'));
 assert.equal(d.querySelectorAll('.stChoice .svLiquidPane,.sv100Channel .svLiquidPane').length,0,'dense repeated controls keep clear lightweight material');
 assert.equal(w.frameCount(),0);env.finish();
});


test('Secondary account, profile and dialog actions receive real lenses while the transport retains ownership',()=>{
 const env=glass('<div class="dsAccountActions"><a class="dsSecondaryBtn">Switch profile</a><a class="dsGhostPill">Movie night</a></div><form id="profileCreateForm" class="dsStackedForm"><button class="dsPrimaryBtn">Add profile</button></form><button id="resetProfilesBtn">Reset</button><div class="dsManageProfileActions"><button>Icon</button><button>Rename</button><button>Make Kids</button><button>Delete</button></div><dialog open class="svAvatarDialog"><button class="svAvatarClose">Close</button><button class="svAvatarUpload dsSecondaryBtn">Upload</button><button class="svAvatarInitial">Initial</button><button data-avatar-cancel>Cancel</button></dialog><div class="dsTabs"><a>All</a><a>Movies</a></div><main data-player-root><nav class="svPlayerModes"><a>Movie</a><a>Trailer</a></nav><a class="dsSecondaryBtn svPlayerBack">Back</a><button class="dsSecondaryBtn svPlayerPartyButton">Watch together</button><div class="svPlayerStage"><button class="svPlayerControl">Play</button></div></main>'),w=env.window,d=w.document;
 d.body.dataset.stGlass='liquid';w.boot('liquid-glass/liquid-glass.js');w.boot('liquid-glass/surfaces.js');env.intersect(true);w.flush(16);
 const targets=[...d.querySelectorAll('.dsAccountActions>a,#profileCreateForm button,#resetProfilesBtn,.dsManageProfileActions button,.svAvatarDialog button,.dsTabs>a,.svPlayerBack,.svPlayerPartyButton')];
 assert.equal(targets.length,16);
 for(const host of targets)assert(host.querySelector(':scope>.svLiquidPane[data-swifly-renderer="svg"]'),'missing real clear lens on '+host.textContent);
 assert(d.querySelector('.svPlayerModes>.svLiquidPane[data-swifly-renderer="svg"]'),'watch mode tabs share a clear lens');
 assert.equal(d.querySelector('.svPlayerModes a .svLiquidPane'),null,'mode tabs share one pane');
 assert.equal(d.querySelector('.svPlayerControl .svLiquidPane'),null,'transport controls already share their player-owned dock');
 assert.equal(env.textures.length,1,'same-size controls reuse their geometry instead of allocating a map per button');
 assert.equal(w.frameCount(),0,'complete coverage must not introduce idle rendering');env.finish();
});

test('Resizing a live pane keeps finite reference optics and refreshes its geometry',()=>{
 const env=glass('<div class="svLiquidPane" data-swifly-glass></div>'),w=env.window,d=w.document,pane=d.querySelector('.svLiquidPane');
 w.boot('liquid-glass/liquid-glass.js');w.flush(16);const previous=pane.querySelector('feImage').getAttribute('href');
 pane.getBoundingClientRect=()=>({width:340,height:60,left:0,top:0,right:340,bottom:60});env.resize();w.flush(32);
 assert.notEqual(pane.querySelector('feImage').getAttribute('href'),previous);
 assert.deepEqual([...pane.querySelectorAll('feDisplacementMap')].map(n=>Number(n.getAttribute('scale'))),[-180,-170,-160]);
 assert.equal(w.frameCount(),0);env.finish();
});
