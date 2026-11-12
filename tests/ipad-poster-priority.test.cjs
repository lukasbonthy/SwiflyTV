'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const entry=require('../ui/artwork-entry.js');

function fixture(tablet=true){
 const cards=Array.from({length:18},(_,i)=>
  '<article class="movieCard"><a class="dsThumb"><img src="/poster-'+i+'.png" loading="lazy" decoding="async" fetchpriority="low" width="342" height="513"></a></article>').join('');
 const dom=new JSDOM('<!doctype html><html><body class="svCleanShell"><main>'+
  '<section class="dsContent"><div class="movieRail" data-sv-page-size="4" id="first">'+cards+'</div>'+
  '<div class="movieRail" data-sv-page-size="4" id="second">'+cards+'</div></section></main>'+
  '</body></html>',{url:'https://swifly.example/',pretendToBeVisual:true,runScripts:'outside-only'});
 const w=dom.window, observers=[],frames=[];
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.IntersectionObserver=class {
  constructor(callback,options){this.callback=callback;this.options=options;this.tracked=new Set();observers.push(this);}
  observe(node){this.tracked.add(node);}unobserve(node){this.tracked.delete(node);}disconnect(){this.tracked.clear();}
 };
 w.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
 w.cancelAnimationFrame=()=>{};
 if(tablet){Object.defineProperty(w.navigator,'platform',{configurable:true,value:'MacIntel'});
  Object.defineProperty(w.navigator,'maxTouchPoints',{configurable:true,value:5});}
 w.eval(entry);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {w,dom,observers,flush(){const tasks=frames.splice(0);for(const task of tasks)task(16);},close(){dom.window.close();}};
}

test('only nearby iPad catalog posters are promoted, not every image on the page',()=>{
 const f=fixture();try{
  const d=f.w.document,first=d.querySelector('#first'),second=d.querySelector('#second');
  const images=[...first.querySelectorAll('img')],far=second.querySelector('img');
  const observer=f.observers.find(o=>o.options.rootMargin==='1100px 0px');
  assert(observer,'one tablet rail-observer should be installed');
  assert(observer.tracked.has(first)&&observer.tracked.has(second));
  assert.equal(images[0].getAttribute('loading'),'lazy');
  observer.callback([{target:first,isIntersecting:true}]);
  assert.equal(images[0].getAttribute('loading'),'eager');
  assert(['auto','high'].includes(images[0].getAttribute('fetchpriority')));
  assert.equal(images[7].getAttribute('loading'),'eager');
  assert.equal(images[13].getAttribute('loading'),'lazy','distant sideways posters stay lazy');
  assert.equal(far.getAttribute('loading'),'lazy','distant vertical rows stay lazy');
  first.scrollLeft=580;first.dispatchEvent(new f.w.Event('scroll'));
  f.flush();
  assert.equal(images[10].getAttribute('loading'),'eager','sideways scrolling warms the upcoming page');
  assert.equal(images[15].getAttribute('loading'),'lazy','scrolling does not make the whole rail eager');
  assert.strictEqual(first.querySelectorAll('img')[0],images[0],'poster DOM nodes must never be replaced');
 }finally{f.close();}
});

test('non-iPad poster priority stays unchanged',()=>{
 const f=fixture(false);try{
  assert.equal(f.observers.some(o=>o.options.rootMargin==='1100px 0px'),false);
  const image=f.w.document.querySelector('#first img');
  assert.equal(image.getAttribute('loading'),'lazy');
  assert.equal(image.getAttribute('fetchpriority'),'low');
 }finally{f.close();}
});
