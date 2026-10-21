'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function setup(options={}) {
 const env=browser('<header class="topbar" data-sv-liquid-nav></header><div class="svBrowseScene" data-sv-browse-scene><main><a id="open" href="/movie/101">Details</a></main><footer class="footer">Footer</footer></div><nav class="mobileNav" data-sv-liquid-nav></nav>',options);
 const w=env.window,d=w.document,animations=[];
 Object.defineProperties(w,{innerWidth:{value:1024,configurable:true},innerHeight:{value:768,configurable:true}});
 Object.defineProperty(d.body,'clientWidth',{value:1014,configurable:true});
 const scene=d.querySelector('[data-sv-browse-scene]'),header=d.querySelector('.topbar'),mobile=d.querySelector('.mobileNav');
 w.HTMLElement.prototype.animate=function(keyframes,settings){let resolve,reject;const animation={target:this,keyframes,settings,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},cancel(){reject(new Error('cancelled'));}};animations.push(animation);return animation;};
 w.fetch=async()=>({ok:true,text:async()=>'<article class="svTitleDetails"><h1>A title</h1><a href="/movie/202">Next</a></article>'});
 env.page.scrollTop=640;w.boot('details.js');return {...env,scene,header,mobile,animations};
}
async function finish(animations){animations.forEach(a=>a.finish());await tick();}

test('The inner panel rises while catalog artwork, fixed navigation and the native scroll area stay stationary',async()=>{
 const env=setup(),w=env.window,d=w.document;
 const resting=[env.scene,env.header,env.mobile].map(node=>node.getAttribute('style'));
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));w.flush(16);
 const dialog=d.querySelector('.svDetailDialog'),panel=dialog.querySelector('.svDetailPanel');
 assert.equal(dialog.parentElement,d.body);assert.equal(panel.parentElement.className,'svDetailStage');
 assert.equal(panel.closest('.svDetailViewport').parentElement,dialog);
 assert.equal(env.animations.length,2,'Only the panel and scrim animate');
 assert.equal(env.animations[0].target,panel);assert.equal(env.animations[0].settings.duration,560);
 assert.equal(env.animations[1].target,d.querySelector('.svDetailScrim'));
 assert.deepEqual([env.scene,env.header,env.mobile].map(node=>node.getAttribute('style')),resting);
 assert.equal(env.page.scrollTop,640);
 await finish(env.animations);assert.equal(dialog.dataset.svDetailState,'open');env.finish();
});

test('Closing keeps the native modal and catalog lock through the shorter exit, then restores focus',async()=>{
 const env=setup(),w=env.window,d=w.document,trigger=d.getElementById('open');trigger.focus();
 await w.SwiflyDetails.open('/movie/101',trigger);await finish(env.animations);
 const start=env.animations.length;w.history.back=()=>{};w.SwiflyDetails.close();w.flush(16);
 assert(d.querySelector('dialog').open);assert(d.documentElement.classList.contains('svDetailsOpen'));
 assert.equal(env.animations[start].target,d.querySelector('.svDetailPanel'));
 assert.equal(env.animations[start].settings.duration,320);
 await finish(env.animations.slice(start));
 assert(!d.querySelector('dialog').open);assert(!d.documentElement.classList.contains('svDetailsOpen'));
 assert.equal(d.activeElement,trigger);assert.equal(env.page.scrollTop,640);env.finish();
});

test('An interrupted exit retains native modality and ignores the old completion',async()=>{
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 const start=env.animations.length;w.SwiflyDetails.close();const stale=env.animations.slice(start);
 await w.SwiflyDetails.open('/movie/202');await finish(stale);w.flush(16);
 const dialog=d.querySelector('dialog');assert(dialog.open);assert.equal(dialog.dataset.svDetailState,'opening');
 assert(dialog.querySelector('.svDetailChrome'));assert(dialog.querySelector('.svDetailContent h1'));
 await finish(env.animations);assert.equal(dialog.dataset.svDetailState,'open');env.finish();
});

test('Reduced motion settles the panel immediately without animating catalog geometry',async()=>{
 const reduced=setup({reduced:true}),rw=reduced.window;
 await rw.SwiflyDetails.open('/movie/101',rw.document.getElementById('open'));
 assert.equal(reduced.animations.length,0);assert.equal(rw.document.querySelector('dialog').dataset.svDetailState,'open');reduced.finish();
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));w.reduceMotion(true);
 assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert.equal(env.scene.getAttribute('style'),null);env.finish();
});

test('Resize never writes catalog or navigation transforms and preserves scroll',async()=>{
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 Object.defineProperty(d.body,'clientWidth',{value:758});
 Object.defineProperties(w,{innerWidth:{value:768,configurable:true},innerHeight:{value:1024,configurable:true}});w.dispatchEvent(new w.Event('resize'));
 assert.equal(env.header.getAttribute('style'),null);assert.equal(env.mobile.getAttribute('style'),null);
 assert.equal(env.scene.getAttribute('style'),null);assert.equal(env.page.scrollTop,640);env.finish();
});

test('Detail glass activates the whole dialog, including chrome, after the entrance settles',async()=>{
 const env=setup(),w=env.window,d=w.document,refreshed=[];
 w.SwiflyGlassSurfaces={refresh(root){refreshed.push(root);}};
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const dialog=d.querySelector('.svDetailDialog');assert(!refreshed.includes(dialog));
 await finish(env.animations);assert.equal(refreshed.filter(root=>root===dialog).length,1);env.finish();
});

test('The full-window scroll area clips panel travel without becoming a moving inset scroller',async()=>{
 const env=setup(),w=env.window,d=w.document,style=d.createElement('style');style.textContent=source('details.css');d.head.append(style);
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const modal=w.getComputedStyle(d.querySelector('.svDetailDialog')),panel=w.getComputedStyle(d.querySelector('.svDetailPanel'));
 assert.equal(modal.inset,'0');assert.equal(modal.width,'100vw');assert.equal(modal.height,'100%');
 assert.equal(panel.borderRadius,'22px 22px 0 0');assert.equal(w.getComputedStyle(d.querySelector('.svDetailStage')).overflow,'clip');env.finish();
});
