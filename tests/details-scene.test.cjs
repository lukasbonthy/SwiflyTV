'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function setup(options={}) {
 const env=browser('<header class="topbar" data-sv-liquid-nav></header><div class="svBrowseScene" data-sv-browse-scene><main><a id="open" href="/movie/101">Details</a></main><footer class="footer">Footer</footer></div><nav class="mobileNav" data-sv-liquid-nav></nav>',options);
 const w=env.window,d=w.document,animations=[];
 Object.defineProperties(w,{innerWidth:{value:1024,configurable:true},innerHeight:{value:768,configurable:true}});
 const scene=d.querySelector('[data-sv-browse-scene]'),header=d.querySelector('.topbar'),mobile=d.querySelector('.mobileNav');
 Object.defineProperties(scene,{offsetTop:{value:0},offsetHeight:{value:3600}});
 Object.defineProperty(header,'offsetTop',{value:0});Object.defineProperty(mobile,'offsetTop',{value:690});
 w.HTMLElement.prototype.animate=function(keyframes,settings){let resolve,reject;const animation={target:this,keyframes,settings,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},cancel(){reject(new Error('cancelled'));}};animations.push(animation);return animation;};
 w.fetch=async()=>({ok:true,text:async()=>'<article class="svTitleDetails"><h1>A title</h1><a href="/movie/202">Next</a></article>'});
 env.page.scrollTop=640;w.boot('details.js');return {...env,scene,header,mobile,animations};
}
async function finish(animations){animations.forEach(a=>a.finish());await tick();}

test('The catalog scene and fixed navigation recede around the visible viewport, while the modal stays outside',async()=>{
 const env=setup(),w=env.window,d=w.document,html=d.documentElement;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 assert.equal(html.dataset.svDetailScene,'closed','The catalog holds its resting pose until the sheet can render');w.flush(16);
 assert.equal(html.dataset.svDetailScene,'opening');
 assert.equal(html.style.getPropertyValue('--sv-detail-scene-scale'),'','Scene geometry must not invalidate the entire document by inheritance');
 for(const target of [env.scene,env.header,env.mobile])assert.equal(Number(target.style.getPropertyValue('--sv-detail-scene-scale')),1-26/1024);
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-origin-y'),'640px');
 assert.equal(env.header.style.getPropertyValue('--sv-detail-scene-origin-y'),'0px');
 assert.equal(env.mobile.style.getPropertyValue('--sv-detail-scene-origin-y'),'-690px');
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-clip'),'inset(640px 0px 2192px round 8px)');
 assert.equal(d.querySelector('dialog').parentElement,d.body,'The native modal must not inherit catalog scaling');
 assert.equal(env.page.scrollTop,640);
 await finish(env.animations);assert.equal(html.dataset.svDetailScene,'open');env.finish();
});

test('Background recession reverses with the weighted exit, then releases all temporary geometry and restores focus',async()=>{
 const env=setup(),w=env.window,d=w.document,trigger=d.getElementById('open');trigger.focus();
 await w.SwiflyDetails.open('/movie/101',trigger);await finish(env.animations);
 const start=env.animations.length;w.history.back=()=>{};w.SwiflyDetails.close();
 w.flush(16);
 assert.equal(d.documentElement.dataset.svDetailScene,'closing');assert(d.querySelector('dialog').open);
 assert(env.scene.style.getPropertyValue('--sv-detail-scene-clip'),'The visible catalog remains clipped through the exit');
 assert.equal(env.animations[start].settings.duration,360);
 await finish(env.animations.slice(start));
 assert.equal(d.documentElement.dataset.svDetailScene,undefined);
 assert.equal(d.documentElement.style.getPropertyValue('--sv-detail-scene-scale'),'');
 for(const target of [env.scene,env.header,env.mobile])assert.equal(target.style.getPropertyValue('--sv-detail-scene-origin-y'),'');
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-clip'),'');
 assert.equal(d.activeElement,trigger);assert.equal(env.page.scrollTop,640);env.finish();
});

test('An interrupted exit retains scene geometry for the new entrance and ignores the old completion',async()=>{
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 const start=env.animations.length;w.SwiflyDetails.close();const stale=env.animations.slice(start);
 await w.SwiflyDetails.open('/movie/202');await finish(stale);
 w.flush(16);
 assert.equal(d.documentElement.dataset.svDetailScene,'opening');assert(d.querySelector('dialog').open);
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-origin-y'),'640px');
 await finish(env.animations);assert.equal(d.documentElement.dataset.svDetailScene,'open');env.finish();
});

test('Reduced motion avoids catalog scaling and clears recession immediately when enabled mid-entrance',async()=>{
 const reduced=setup({reduced:true}),rw=reduced.window;
 await rw.SwiflyDetails.open('/movie/101',rw.document.getElementById('open'));
 assert.equal(rw.document.documentElement.dataset.svDetailScene,undefined);
 assert.equal(reduced.scene.style.getPropertyValue('--sv-detail-scene-clip'),'');reduced.finish();
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));w.reduceMotion(true);
 assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');
 assert.equal(d.documentElement.dataset.svDetailScene,undefined);
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-clip'),'');env.finish();
});

test('A viewport resize updates the clipped scene without changing the underlying catalog scroll position',async()=>{
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 Object.defineProperties(w,{innerWidth:{value:768,configurable:true},innerHeight:{value:1024,configurable:true}});w.dispatchEvent(new w.Event('resize'));
 assert.equal(Number(env.scene.style.getPropertyValue('--sv-detail-scene-scale')),1-26/768);
 assert.equal(env.scene.style.getPropertyValue('--sv-detail-scene-clip'),'inset(640px 0px 1936px round 8px)');
 assert.equal(env.page.scrollTop,640);env.finish();
});

test('The mobile nav scales about its existing translated anchor so its center stays on the viewport',async()=>{
 const env=setup(),w=env.window,d=w.document,style=d.createElement('style');style.textContent=source('details.css');d.head.append(style);
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 assert.match(w.getComputedStyle(env.mobile).transformOrigin,/^0(?:%|px)?\s/);
 env.finish();
});

test('Detail glass activates the whole dialog, including sibling chrome, after the weighted entrance settles',async()=>{
 const env=setup(),w=env.window,d=w.document,refreshed=[];
 w.SwiflyGlassSurfaces={refresh(root){refreshed.push(root);}};
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const dialog=d.querySelector('.svDetailDialog');assert(!refreshed.includes(dialog));
 await finish(env.animations);assert.equal(refreshed.filter(root=>root===dialog).length,1);env.finish();
});

test('The details sheet sits at the bottom and leaves the recessed catalog visible above its top corners',async()=>{
 const env=setup(),w=env.window,d=w.document,style=d.createElement('style');style.textContent=source('details.css');d.head.append(style);
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));const css=w.getComputedStyle(d.querySelector('.svDetailDialog'));
 assert.equal(css.inset,'auto 0 0');assert.equal(css.maxHeight,'90svh');
 assert.equal(parseFloat(css.borderBottomWidth),0);assert.equal(css.borderRadius,'22px 22px 0 0');env.finish();
});
