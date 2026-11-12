'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

const markup='<div class="netflixNav"><button id="navButton">Search</button></div>'+
 '<main class="dsContent"><section class="dsRow"><button class="dsRowBtn" id="rowNext">Next</button>'+
 '<div class="movieRail">'+Array.from({length:24},(_,i)=>
 '<article class="movieCard"><div class="dsCardArtwork"><a class="dsThumb">Poster '+i+'</a>'+
 '<div class="dsCardQuickActions"><a class="dsMiniBtn" href="/watch/movie/'+i+'">Play</a>'+
 '<button class="dsMiniBtn" type="button">Save</button><button class="dsMiniBtn" type="button">Like</button></div>'+
 '</div></article>').join('')+'</div></section></main>';

function setup(ipad){
 const env=browser(markup),w=env.window,d=w.document;
 if(ipad){
   Object.defineProperty(w.navigator,'platform',{configurable:true,value:'MacIntel'});
   Object.defineProperty(w.navigator,'maxTouchPoints',{configurable:true,value:5});
   d.documentElement.dataset.svAppleTablet='true';
 }
 const observed=new Set(),observers=[];
 w.IntersectionObserver=class {
   constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
   observe(node){observed.add(node);}unobserve(node){observed.delete(node);}
   disconnect(){observed.clear();}
 };
 const mounts=new Set();
 w.SwiflyLiquidGlass={mount(node){mounts.add(node);return {enabled:true,supported:true,destroy(){mounts.delete(node);}};}};
 w.boot('liquid-glass/surfaces.js');
 return {env,w,d,observed,observers,mounts};
}

test('iPad skips every offscreen poster action glass entry, while nav glass remains',()=>{
 const {env,d,observed,observers,mounts,w}=setup(true);
 try{
   const actions=[...d.querySelectorAll('.dsCardQuickActions .dsMiniBtn')];
   assert.equal(actions.length,72);
   assert(actions.every(node=>!node.querySelector('.svNavMatchedLens')&&!node.classList.contains('svGlassControl')));
   assert(actions.every(node=>!observed.has(node)),'do not retain 72 observed per-poster elements');
   assert(d.querySelector('#navButton .svNavMatchedLens'),'fixed navigation still uses its glass pane');
   assert(mounts.size>0,'nav keeps real optical controller');
   const near=observers.find(o=>o.options.rootMargin==='320px 120px');
   near.callback([{target:d.querySelector('.dsRow'),isIntersecting:true}]);
   actions[5].focus();
   assert(actions.every(node=>!node.querySelector('.svNavMatchedLens')),'re-entering or focusing a poster never builds the expensive subtree');
   assert(actions.every(node=>!observed.has(node)),'no new action observers after re-entry');
   w.SwiflyGlassSurfaces.destroy();
 }finally{env.finish();}
});

test('non-iPad poster action native lens behavior stays unchanged',()=>{
 const {env,d,observers,w}=setup(false);
 try{
   const near=observers.find(o=>o.options.rootMargin==='320px 120px');
   near.callback([{target:d.querySelector('.dsRow'),isIntersecting:true}]);
   assert(d.querySelector('.dsCardQuickActions .svNavMatchedLens'),'other devices retain native glass actions');
   w.SwiflyGlassSurfaces.destroy();
 }finally{env.finish();}
});

test('iPad-only CSS disables quick-action blur without changing nav or detail rules',()=>{
 const css=source('performance.css');
 assert(css.includes('html[data-sv-apple-tablet="true"] body.svCleanShell .dsCardQuickActions .dsMiniBtn {'));
 assert(!/html\\[data-sv-apple-tablet="true"\\][^{]*\\.netflixNav/.test(css));
});
