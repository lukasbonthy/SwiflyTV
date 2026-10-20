'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser,source,cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

test('hidden movie-card quick actions avoid allocating dozens of invisible SVG lenses',()=>{
  const markup = Array.from({length:20},(_,i)=>
    '<article class="movieCard dsCard"><div class="dsCardArtwork" data-card="'+i+'">'+
    '<div class="dsCardQuickActions"><a class="dsMiniBtn">Play</a><button class="dsMiniBtn">Save</button><button class="dsMiniBtn">Like</button></div>'+
    '</div></article>').join('')+
    '<div class="dsHeroActions"><button class="dsPrimaryBtn">Watch</button></div>';
  const env=browser(markup),w=env.window,d=w.document;
  const original=w.matchMedia;
  w.matchMedia=query=>query==='(hover: hover)'?{matches:true,addEventListener(){},removeEventListener(){}}:original(query);
  const observed=new Set();let callback;
  w.IntersectionObserver=class {
    constructor(cb){callback=cb;}
    observe(node){observed.add(node);}
    unobserve(node){observed.delete(node);}
    disconnect(){observed.clear();}
  };
  const mounts=new Set();
  w.SwiflyLiquidGlass={
    mount(node){mounts.add(node);return {supported:true,enabled:true,destroy(){mounts.delete(node);}};}
  };
  w.boot('liquid-glass/surfaces.js');
  const quick=[...d.querySelectorAll('.dsMiniBtn')],hero=d.querySelector('.dsPrimaryBtn');
  assert.equal(quick.length,60);
  callback([...observed].map(target=>({target,isIntersecting:true})));
  assert(quick.every(node=>node.querySelector(':scope > .svNavMatchedLens')),'quick actions still get immediate native glass');
  assert(hero.querySelector(':scope > .svNavMatchedLens'),'hero buttons retain glass');
  assert(mounts.has(hero.querySelector('.svNavMatchedLens')),'primary hero refraction is not postponed');
  assert(quick.every(node=>!mounts.has(node.querySelector('.svNavMatchedLens'))),'invisible catalog actions must not allocate SVG');
  const firstCard=d.querySelector('[data-card="0"]');
  firstCard.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(quick.filter(node=>mounts.has(node.querySelector('.svNavMatchedLens'))).length,3,'the three hovered controls use the real optical graph');
  firstCard.dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true,relatedTarget:d.body}));
  assert.equal(quick.filter(node=>mounts.has(node.querySelector('.svNavMatchedLens'))).length,0,'moving away frees card optics');
  assert(mounts.has(hero.querySelector('.svNavMatchedLens')),'navigation and hero optics remain untouched');
  env.finish();
});

test('catalog paint is isolated without substituting estimated row heights',()=>{
  const css=source('performance.css');
  assert.match(css,/\.dsContent > \.dsRow\.svCatalogRow\s*\{\s*contain: layout style paint/);
  assert.doesNotMatch(css,/contain-intrinsic-size/);
  assert.doesNotMatch(css,/\.svDetailSection\s*\{\s*content-visibility/);
});

test('approaching rows wait for scrolling to settle while focused controls prepare immediately',()=>{
  const env=browser('<main class="dsContent"><section class="dsRow"><div class="dsCardArtwork"><div class="dsCardQuickActions"><button class="dsMiniBtn">Save</button><button class="dsMiniBtn">Like</button></div></div></section></main>');
  const w=env.window,d=w.document,observers=[];
  w.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
    observe(){} unobserve(){} disconnect(){}
  };
  w.SwiflyLiquidGlass={mount(){return {enabled:true,supported:true,destroy(){}};}};
  w.boot('liquid-glass/surfaces.js');
  const row=d.querySelector('.dsRow'),control=row.querySelector('button');
  const near=observers.find(observer=>observer.options.rootMargin==='320px 120px');
  d.documentElement.dataset.svScrollGlass='soft';
  near.callback([{target:row,isIntersecting:true}]);
  assert.equal(row.querySelectorAll('.svNavMatchedLens').length,0,'approaching a row must not construct dozens of controls during motion');
  control.focus();
  assert(control.querySelector('.svNavMatchedLens'),'keyboard focus prepares controls immediately during motion');
  delete d.documentElement.dataset.svScrollGlass;
  d.dispatchEvent(new w.Event('swifly:scroll-glass-end'));
  assert.equal(row.querySelectorAll('.svNavMatchedLens').length,2,'the near row finishes preparing once movement settles');
  w.SwiflyGlassSurfaces.destroy();env.finish();
});

test('a row passed during a fling stays unprepared until it approaches again',()=>{
  const env=browser('<main class="dsContent"><section class="dsRow"><button class="dsRowBtn">Next</button></section></main>');
  const w=env.window,d=w.document,observers=[];
  w.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
    observe(){} unobserve(){} disconnect(){}
  };
  w.SwiflyLiquidGlass={mount(){return {enabled:true,supported:true,destroy(){}};}};
  w.boot('liquid-glass/surfaces.js');
  const row=d.querySelector('.dsRow'),near=observers.find(observer=>observer.options.rootMargin==='320px 120px');
  d.documentElement.dataset.svScrollGlass='soft';
  near.callback([{target:row,isIntersecting:true},{target:row,isIntersecting:false}]);
  delete d.documentElement.dataset.svScrollGlass;
  d.dispatchEvent(new w.Event('swifly:scroll-glass-end'));
  assert.equal(row.querySelectorAll('.svNavMatchedLens').length,0,'settling must not prepare every row already passed');
  near.callback([{target:row,isIntersecting:true}]);
  assert.equal(row.querySelectorAll('.svNavMatchedLens').length,1);
  w.SwiflyGlassSurfaces.destroy();env.finish();
});

test('already prepared controls defer new SVG graphs during motion and resume at rest',()=>{
  const env=browser('<button class="dsRowBtn">Next</button>'),w=env.window,d=w.document;
  const observers=[],mounts=new Set();
  w.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
    observe(){} unobserve(){} disconnect(){}
  };
  w.SwiflyLiquidGlass={mount(node){mounts.add(node);return {enabled:true,supported:true,destroy(){mounts.delete(node);}};}};
  w.boot('liquid-glass/surfaces.js');
  const host=d.querySelector('button'),pane=host.querySelector('.svNavMatchedLens');
  assert(pane,'native glass is already available');
  const visibility=observers.find(observer=>observer.options.rootMargin==='80px');
  d.documentElement.dataset.svScrollGlass='soft';
  visibility.callback([{target:host,isIntersecting:true}]);
  assert.equal(mounts.size,0,'entering the viewport must not create SVG graphs on a scrolling frame');
  delete d.documentElement.dataset.svScrollGlass;
  d.dispatchEvent(new w.Event('swifly:scroll-glass-end'));
  assert(mounts.has(pane),'the same native pane acquires its real refraction at rest');
  d.documentElement.dataset.svScrollGlass='soft';
  visibility.callback([{target:host,isIntersecting:true}]);
  assert(mounts.has(pane),'movement preserves an existing cached optical graph');
  w.SwiflyGlassSurfaces.destroy();env.finish();
});

test('focusing an existing deferred row control prepares its lens during motion',()=>{
  const env=browser('<button class="dsRowBtn">Next</button>'),w=env.window,d=w.document;
  const observers=[],mounts=new Set();
  w.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
    observe(){} unobserve(){} disconnect(){}
  };
  w.SwiflyLiquidGlass={mount(node){mounts.add(node);return {enabled:true,supported:true,destroy(){mounts.delete(node);}};}};
  w.boot('liquid-glass/surfaces.js');
  const host=d.querySelector('button'),pane=host.querySelector('.svNavMatchedLens');
  d.documentElement.dataset.svScrollGlass='soft';
  observers.find(observer=>observer.options.rootMargin==='80px').callback([{target:host,isIntersecting:true}]);
  assert.equal(mounts.size,0);
  host.focus();
  assert(mounts.has(pane),'focus must immediately mount the existing deferred lens');
  w.SwiflyGlassSurfaces.destroy();env.finish();
});
