'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
afterEach(cleanup);
function setup(options={}){
 assert(fs.existsSync(require('node:path').join(__dirname,'../ui/loading.js')),'site-wide loading UI must be available');
 const {loadingHead,loadingMarkup}=require('../ui/loading');
 const b=browser(loadingMarkup()+'<a id="next" href="/movies">Movies</a><a id="detail" href="/movie/1">Details</a><a id="hash" href="#section">Section</a><a id="file" download href="/api/download/1">Download</a><a id="external" href="https://example.test">External</a><a id="newtab" target="_blank" href="/tv">Series in another tab</a><form action="/search"><input name="q" value="space"></form>'+(options.markup||''),options);
 const tasks=new Map();let id=0;b.window.setTimeout=(fn,ms)=>{tasks.set(++id,{fn,ms});return id;};b.window.clearTimeout=id=>tasks.delete(id);
 b.window.eval(loadingHead().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
 return {...b,w:b.window,tasks,advance(ms){for(const [id,task] of [...tasks])if(task.ms===ms){tasks.delete(id);task.fn();}}};
}
test('real navigation gets a destination skeleton and restores immediately from history',async()=>{
 const b=setup();await tick();b.w.document.querySelector('#next').click();await tick();
 b.advance(0);assert.equal(b.w.document.documentElement.dataset.svLoading,'pending');
 b.advance(160);assert.equal(b.w.document.documentElement.dataset.svLoading,'navigate');assert.equal(b.w.document.querySelector('#svSiteLoading').dataset.layout,'catalog');
 assert.equal(b.w.document.body.inert,undefined,'a loader never locks the document');
 const restored=new b.w.Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});b.w.dispatchEvent(restored);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);
});
test('slow navigation names its destination and selects books, AI and catalog placeholders',async()=>{
 const b=setup();await tick();
 for(const [href,layout,message] of [['/movies','catalog','Opening Movies'],['/tv','catalog','Opening Series'],['/audiobooks','books','Opening Audiobooks'],['/recommendations','ai','Opening AI Search'],['/friends','friends','Opening Connect']]){
  const link=b.w.document.querySelector('#next');link.href=href;link.click();b.advance(0);b.advance(160);
  assert.equal(b.w.document.querySelector('#svSiteLoading').dataset.layout,layout,href);
  assert.equal(b.w.document.querySelector('#svLoadingStatus').textContent,message,href);
  assert.equal(b.w.document.querySelector('#svSiteLoading').getAttribute('aria-hidden'),null,'only the decorative placeholders are hidden from assistive technology');
  b.w.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Escape'}));
 }
});
test('cancelled detail clicks, anchors, downloads and external links never open the loader',async()=>{
 const b=setup();await tick();b.w.document.addEventListener('click',e=>{if(e.target.id==='detail')e.preventDefault();});
 for(const id of ['detail','hash','file','external','newtab']){b.w.document.querySelector('#'+id).click();await tick();b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,id);}
});
test('a cancelled search submit does not flash a loader and native search receives one',async()=>{
 const b=setup();await tick();const form=b.w.document.querySelector('form'),cancel=e=>e.preventDefault();form.addEventListener('submit',cancel);
 form.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);
 form.removeEventListener('submit',cancel);form.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();b.advance(0);assert.equal(b.w.document.documentElement.dataset.svLoading,'pending');
 b.advance(10000);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,'a stalled navigation releases its loading surface');
});
test('a base target and submitter target retain native new-tab form behavior',async()=>{
 const b=setup({markup:'<base target="_blank"><button type="submit" form="target-form" formtarget="_blank" id="submit-other">Search elsewhere</button><form id="target-form" action="/search"></form>'});await tick();
 b.w.document.querySelector('#next').click();b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);
 const form=b.w.document.querySelector('#target-form');form.dispatchEvent(new b.w.SubmitEvent('submit',{bubbles:true,cancelable:true}));b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,'a base target applies to form submissions too');
 form.target='_self';form.dispatchEvent(new b.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:b.w.document.querySelector('#submit-other')}));b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,'the submit button can override a form target');
});
test('initial asynchronous feature data can hold the skeleton without imposing a minimum wait',async()=>{
 const b=setup(),release=b.w.SwiflySiteLoading.hold();await tick();b.advance(120);
 assert.equal(b.w.document.documentElement.dataset.svLoading,'initial');release();release();assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);assert.equal(b.w.document.querySelector('#svLoadingStatus').textContent,'');
});
test('named critical holds remain visible until every owner releases and release is idempotent',async()=>{
 const b=setup({path:'/audiobooks'}),first=b.w.SwiflySiteLoading.hold('Loading the audiobook library…'),second=b.w.SwiflySiteLoading.hold('Restoring your library…');await tick();b.advance(120);
 assert.equal(b.w.document.querySelector('#svLoadingStatus').textContent,'Restoring your library…');
 first();first();assert.equal(b.w.document.documentElement.dataset.svLoading,'initial');
 second();assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);assert.equal(b.tasks.size,0,'readiness clears reveal and safety timers immediately');
});
test('fast initial content clears its reveal timer without imposing a minimum wait',async()=>{
 const b=setup(),release=b.w.SwiflySiteLoading.hold('Loading titles…');release();await tick();b.advance(120);
 assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);assert.equal(b.tasks.size,0);
});
test('audiobook first fetch owns a named hold and releases on success or failure without blocking later searches',async()=>{
 const {audiobooksMarkup}=require('../ui/discovery');
 for(const fails of [false,true]){
  const b=setup({path:'/audiobooks',markup:audiobooksMarkup()}),w=b.w;let finish;
  w.fetch=()=>new Promise((resolve,reject)=>{finish=()=>fails?reject(Error('Library unavailable')):resolve({ok:true,json:async()=>({books:[{id:'52',title:'A story',author:'An author'}]})});});
  w.boot('discovery/audiobooks.js');await tick();b.advance(120);
  assert.equal(w.document.querySelector('#svLoadingStatus').textContent,'Loading the audiobook library…');
  finish();await tick();assert.equal(w.document.documentElement.hasAttribute('data-sv-loading'),false);
  w.document.querySelector('[data-book-search]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();b.advance(120);
  assert.equal(w.document.documentElement.hasAttribute('data-sv-loading'),false,'subsequent book searches use their inline status');
  finish();await tick();
 }
});
test('a replacement audiobook request keeps the initial hold when an older fetch is aborted',async()=>{
 const {audiobooksMarkup}=require('../ui/discovery'),b=setup({path:'/audiobooks',markup:audiobooksMarkup()}),w=b.w,pending=[];
 w.fetch=(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new w.DOMException('Aborted','AbortError')),{once:true});pending.push(()=>resolve({ok:true,json:async()=>({books:[]})}));});
 w.boot('discovery/audiobooks.js');await tick();b.advance(120);
 w.document.querySelector('[data-book-search]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(w.document.documentElement.dataset.svLoading,'initial','an aborted stale response does not announce that the current content is ready');pending[1]();await tick();assert.equal(w.document.documentElement.hasAttribute('data-sv-loading'),false);
});
