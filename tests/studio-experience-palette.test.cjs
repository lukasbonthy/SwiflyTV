'use strict';
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');afterEach(cleanup);
function fixture({timers}={}){
 const b=browser('<main data-st-home><section class="dsHero" data-sv-palette-src="https://image.tmdb.org/t/p/w300/red.jpg"></section></main>'),w=b.window,images=[];let reads=0;
 if(timers){w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.clearTimeout=()=>{};}
 w.Image=class{set src(value){this.url=value;images.push(this);}get src(){return this.url;}};
 w.HTMLCanvasElement.prototype.getContext=function(){let src;return {drawImage(image){src=image.url;},getImageData(){reads++;if(src.includes('cors'))throw Error('tainted');const rgb=src.includes('blue')?[30,80,220]:[220,55,35],data=new Uint8ClampedArray(36*24*4);for(let i=0;i<data.length;i+=4)data.set([...rgb,255],i);return {data};}};};
 w.boot('hero-palette.js');return {...b,w,images,reads:()=>reads};
}
test('the palette sampler is opt-in and shares one sampled result for concurrent/repeated artwork',async()=>{
 const b=fixture(),w=b.w;assert.equal(b.images.length,0,'loading the sampler does not request artwork');assert(w.SwiflyHeroPalette,'the reusable sampler is available');
 const first=w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/red.jpg'),same=w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/red.jpg');assert.equal(b.images.length,1);b.images[0].onload();const red=await first;assert.deepEqual(await same,red);assert.equal(b.reads(),1);assert.equal(b.images[0].crossOrigin,'anonymous');assert.match(red.primary,/^\d+ \d+ \d+$/);
 assert.deepEqual(await w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/red.jpg'),red);assert.equal(b.images.length,1);
 const pending=w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/blue.jpg');b.images[1].onload();const blue=await pending;assert.notEqual(red.primary,blue.primary);
});
test('CORS and unavailable images have a cached neutral fallback and unsafe schemes never load',async()=>{
 const b=fixture(),w=b.w;assert(w.SwiflyHeroPalette,'the reusable sampler is available');
 const cors=w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/cors.jpg');b.images[0].onload();assert.equal(await cors,null);assert.equal(await w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/cors.jpg'),null);assert.equal(b.reads(),1);assert.equal(b.images.length,1);
 const missing=w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/missing.jpg');b.images[1].onerror();assert.equal(await missing,null);assert.equal(await w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/missing.jpg'),null);assert.equal(b.images.length,2);
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg/>','https://user:secret@example.test/art.jpg'])assert.equal(await w.SwiflyHeroPalette.sample(value),null);assert.equal(b.images.length,2);
});
test('sampling times out once and keeps its neutral result for an unresponsive image',async()=>{
 const timers=[],b=fixture({timers}),src='https://image.tmdb.org/t/p/w300/slow.jpg',pending=b.w.SwiflyHeroPalette.sample(src);
 assert.equal(timers.length,1);assert(timers[0].ms<=6000);timers[0].fn();assert.equal(await pending,null);assert.equal(b.images[0].onload,null);assert.equal(b.images[0].onerror,null);assert.equal(await b.w.SwiflyHeroPalette.sample(src),null);assert.equal(b.images.length,1);
});
test('the palette cache remains bounded while recently used artwork keeps its cached result',async()=>{
 const b=fixture(),sample=index=>b.w.SwiflyHeroPalette.sample('https://image.tmdb.org/t/p/w300/'+index+'.jpg');
 for(let index=0;index<97;index++){const pending=sample(index);b.images.at(-1).onerror();assert.equal(await pending,null);}
 assert.equal(await sample(96),null);assert.equal(b.images.length,97);const evicted=sample(0);assert.equal(b.images.length,98,'the oldest result is evicted after 96 unique entries');b.images.at(-1).onerror();assert.equal(await evicted,null);
});
test('adaptive cinema changes actual ambient tokens, ignores stale selected-art results and cancels to the saved palette',async()=>{
 const b=fixture(),w=b.w,d=w.document;w.SwiflyAppearance={adaptiveCinema:true,adaptiveStrength:40,performancePreset:'desktop'};w.boot('studio/experience.js');assert.equal(b.images.length,1);
 const detail=d.createElement('dialog');detail.open=true;detail.innerHTML='<article class="svTitleDetails" data-sv-palette-src="https://image.tmdb.org/t/p/w300/blue.jpg"></article>';d.body.append(detail);await tick();assert.equal(b.images.length,2);
 b.images[1].onload();await tick();const blue=d.body.style.getPropertyValue('--st-adaptive-primary');assert(blue);b.images[0].onload();await tick();assert.equal(d.body.style.getPropertyValue('--st-adaptive-primary'),blue,'a late hero result cannot replace selected details');
 detail.close();await tick();assert.notEqual(d.body.style.getPropertyValue('--st-adaptive-primary'),blue,'closing details returns to the real hero palette');assert.equal(b.images.length,2,'cached hero result is reused');
 d.dispatchEvent(new w.CustomEvent('swifly:studio-change',{detail:{effective:{adaptiveCinema:false,adaptiveStrength:40,performancePreset:'desktop'}}}));assert.equal(d.body.dataset.stAdaptiveActive,'false');assert.equal(d.body.style.getPropertyValue('--st-adaptive-primary'),'');
});
test('reduced motion, lightweight and playback prevent adaptive artwork requests',()=>{
 for(const values of [{reduceMotion:true},{performancePreset:'xbox'},{performancePreset:'minimal'}]){const b=fixture();b.w.SwiflyAppearance={adaptiveCinema:true,adaptiveStrength:35,...values};b.w.boot('studio/experience.js');assert.equal(b.images.length,0);b.finish();}
 const b=fixture();b.w.document.body.insertAdjacentHTML('beforeend','<main class="svPlayerPage" data-player-root></main>');b.w.SwiflyAppearance={adaptiveCinema:true,adaptiveStrength:35};b.w.boot('studio/experience.js');assert.equal(b.images.length,0);
});
