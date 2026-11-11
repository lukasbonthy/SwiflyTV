'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function entry(){
 const f=browser('<div id="svArtworkCurtain"></div><main><section class="dsHero"><div class="dsHeroBg" style="background-image:url(/hero.jpg)"></div><div class="dsHeroContent"><h1 class="dsHeroTitleArt"><span class="dsHeroTitleText">Ready film</span><img class="dsHeroLogo" src="/logo.png" width="250" height="70"></h1><p>A ready page.</p></div></section><div id="dynamic"></div></main>'),w=f.window,d=w.document;
 let state='loading',timerId=0;const tasks=new Map(),assets=[];
 Object.defineProperty(d,'readyState',{get:()=>state});
 d.addEventListener('DOMContentLoaded',event=>{if(state!=='complete')event.stopImmediatePropagation();},true);
 w.setTimeout=(fn,ms)=>{const id=++timerId;tasks.set(id,{fn,ms});return id;};w.clearTimeout=id=>tasks.delete(id);
 w.Image=class{constructor(){const img=d.createElement('img');assets.push(img);return img;}};
 w.eval(require('../ui/artwork-entry'));
 return {...f,tasks,assets,advance(ms){for(const [id,t]of [...tasks])if(t.ms===ms){tasks.delete(id);t.fn();}},parsed(){state='interactive';d.dispatchEvent(new w.Event('readystatechange'));},ready(){state='complete';d.dispatchEvent(new w.Event('DOMContentLoaded'));}};
}

test('artwork starts preparing at parsed readiness while deferred scripts still delay DOMContentLoaded',async()=>{
 const f=entry(),d=f.window.document;f.parsed();await tick();
 assert(d.querySelector('.dsHeroBg').classList.contains('svArtworkAsset'),'parsed server artwork must prepare before deferred application scripts finish');
 assert(d.querySelector('h1').classList.contains('svArtworkCopy'));assert.equal(d.documentElement.dataset.svArtworkState,'loading');f.finish();
});

test('a safety-released page never hides its initial artwork when parsing finally completes',async()=>{
 const f=entry(),d=f.window.document;f.advance(2200);f.advance(460);
 assert.equal(d.documentElement.dataset.svArtworkState,'ready');f.parsed();f.ready();await tick();
 assert(d.querySelector('.dsHeroBg').classList.contains('svArtworkReady'),'the visible backdrop must not be hidden for another decode fade');
 assert(d.querySelector('.dsHeroLogo').classList.contains('svArtworkReady'),'the visible title artwork must not be hidden again');
 assert.equal(d.documentElement.hasAttribute('aria-busy'),false);f.finish();
});

test('Escape before parsing preserves initial assets while later additions still wait for decode',async()=>{
 const f=entry(),w=f.window,d=w.document;w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));f.parsed();f.ready();await tick();
 assert(d.querySelector('.dsHeroBg').classList.contains('svArtworkReady'));
 const added=d.createElement('img');added.src='/later.png';d.querySelector('#dynamic').append(added);await tick();
 assert(added.classList.contains('svArtworkAsset'));assert.equal(added.classList.contains('svArtworkReady'),false);
 added.dispatchEvent(new w.Event('load'));await tick();assert(added.classList.contains('svArtworkReady'));f.finish();
});

test('interactive and DOMContentLoaded share one artwork boot and history releases pending work',async()=>{
 const f=entry(),w=f.window,d=w.document;f.parsed();await tick();
 assert.equal(f.assets.length,1);f.ready();f.ready();await tick();assert.equal(f.assets.length,1,'readiness events must not rescan or create another background loader');
 w.dispatchEvent(new w.Event('pagehide'));assert.equal(d.documentElement.dataset.svArtworkState,'ready');assert.equal(f.tasks.size,0);assert.equal(w.frameCount(),0);f.finish();
});

test('ready initial artwork uses the curtain dissolve without a second opacity transition',async()=>{
 const f=entry(),w=f.window,d=w.document,style=d.createElement('style');
 style.textContent=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/clean/loading.css'),'utf8');d.head.append(style);
 f.ready();f.assets[0].dispatchEvent(new w.Event('load'));d.querySelector('.dsHeroLogo').dispatchEvent(new w.Event('load'));await tick();w.flush();w.flush();
 assert.equal(d.documentElement.dataset.svArtworkState,'reveal');
 assert.equal(w.getComputedStyle(d.querySelector('.dsHeroBg')).transition,'none','the opaque initial scene is revealed by the curtain alone');f.finish();
});

test('a decoded title logo is presented before deferred application scripts finish',async()=>{
 const f=entry(),w=f.window,d=w.document;f.parsed();const logo=d.querySelector('.dsHeroLogo');
 Object.defineProperty(logo,'naturalWidth',{value:500});logo.dispatchEvent(new w.Event('load'));await tick();
 assert.equal(d.readyState,'interactive');assert(d.querySelector('h1').classList.contains('hasLogo'),'ready title art must join the curtain reveal');f.finish();
});

test('a failed title logo keeps its text fallback',async()=>{
 const f=entry(),w=f.window,d=w.document;f.parsed();d.querySelector('.dsHeroLogo').dispatchEvent(new w.Event('error'));await tick();
 assert.equal(d.querySelector('h1').classList.contains('hasLogo'),false);assert.equal(d.querySelector('.dsHeroTitleText').textContent,'Ready film');f.finish();
});
