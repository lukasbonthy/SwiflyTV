'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const {studioMarkup}=require('../ui/studio');
afterEach(cleanup);
function setup(options={}){
 const {window:w}=browser('<button id="controlToggleTop">Studio</button>'+studioMarkup(),options);
 let intersect;w.IntersectionObserver=class{constructor(fn){intersect=fn;}observe(){}disconnect(){}};
 w.boot('studio/studio.js');w.boot('clean/aurora.js');
 return{w,body:w.document.body,offscreen(){intersect([{target:w.document.querySelector('.svAuroraBackground'),isIntersecting:false}]);}};
}
test('native Studio animates independently when the page Aurora is offscreen',async()=>{
 const {w,body,offscreen}=setup();offscreen();assert.equal(body.dataset.svAuroraState,'still');
 w.SwiflyStudio.open();await tick();assert.equal(body.dataset.svAuroraPreviewState,'live');assert.equal(body.dataset.svAuroraState,'still');assert.equal(w.frameCount(),0);
 w.SwiflyStudio.close();await tick();assert.equal(body.dataset.svAuroraPreviewState,'off');
});
test('covering the page with a native dialog pauses it and closing restores it',async()=>{
 const {w,body}=setup();assert.equal(body.dataset.svAuroraState,'live');
 w.SwiflyStudio.open();await tick();assert.equal(body.dataset.svAuroraState,'still');
 w.SwiflyStudio.close();await tick();assert.equal(body.dataset.svAuroraState,'live');
});
test('hidden pages and page-cache suspension stop Aurora without reopening a cancelled Studio draft',async()=>{
 const {w,body}=setup();w.SwiflyStudio.open();await tick();
 Object.defineProperty(w.document,'hidden',{value:true,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(body.dataset.svAuroraPreviewState,'still');
 Object.defineProperty(w.document,'hidden',{value:false,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(body.dataset.svAuroraPreviewState,'live');
 w.dispatchEvent(new w.Event('pagehide'));await tick();assert.equal(body.dataset.svAuroraState,'still');assert.equal(body.dataset.svAuroraPreviewState,'off');
 w.dispatchEvent(new w.Event('pageshow'));await tick();assert.equal(body.dataset.svAuroraState,'live');assert.equal(body.dataset.svAuroraPreviewState,'off');
});
test('runtime Xbox, explicit still, high contrast and playback suppress decorative motion',async()=>{
 const {w,body}=setup();w.SwiflyStudio.open();await tick();w.document.documentElement.dataset.svXbox='true';await tick();assert.equal(body.dataset.svAuroraPreviewState,'still');
 w.document.documentElement.dataset.svXbox='false';body.dataset.stAuroraMotion='still';await tick();assert.equal(body.dataset.svAuroraPreviewState,'still');
 body.dataset.stHighContrast='true';await tick();assert.equal(body.dataset.svAuroraPreviewState,'off');
 const player=w.document.createElement('main');player.className='svPlayerPage';body.append(player);w.SwiflyAurora.refresh();assert.equal(body.dataset.svAuroraState,'off');
});
