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

test('offscreen catalog rendering is isolated without hiding player or detail sections',()=>{
  const css=source('performance.css');
  assert.match(css,/\.dsContent > \.dsRow\.svCatalogRow\s*\{\s*content-visibility: auto/);
  assert.match(css,/contain-intrinsic-size: auto 440px/);
  assert.match(css,/@media \(max-width: 860px\)/);
  assert.doesNotMatch(css,/\.svDetailSection\s*\{\s*content-visibility/);
});
