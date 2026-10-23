'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
afterEach(cleanup);
function setup(){
 assert(fs.existsSync(require('node:path').join(__dirname,'../ui/loading.js')),'site-wide loading UI must be available');
 const {loadingHead,loadingMarkup}=require('../ui/loading');
 const b=browser(loadingMarkup()+'<a id="next" href="/movies">Movies</a><a id="detail" href="/movie/1">Details</a><a id="hash" href="#section">Section</a><a id="file" download href="/api/download/1">Download</a><a id="external" href="https://example.test">External</a><form action="/search"><input name="q" value="space"></form>');
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
test('cancelled detail clicks, anchors, downloads and external links never open the loader',async()=>{
 const b=setup();await tick();b.w.document.addEventListener('click',e=>{if(e.target.id==='detail')e.preventDefault();});
 for(const id of ['detail','hash','file','external']){b.w.document.querySelector('#'+id).click();await tick();b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,id);}
});
test('a cancelled search submit does not flash a loader and native search receives one',async()=>{
 const b=setup();await tick();const form=b.w.document.querySelector('form'),cancel=e=>e.preventDefault();form.addEventListener('submit',cancel);
 form.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();b.advance(0);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);
 form.removeEventListener('submit',cancel);form.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();b.advance(0);assert.equal(b.w.document.documentElement.dataset.svLoading,'pending');
 b.advance(10000);assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false,'a stalled navigation releases its loading surface');
});
test('initial asynchronous feature data can hold the skeleton without imposing a minimum wait',async()=>{
 const b=setup(),release=b.w.SwiflySiteLoading.hold();await tick();b.advance(120);
 assert.equal(b.w.document.documentElement.dataset.svLoading,'initial');release();release();assert.equal(b.w.document.documentElement.hasAttribute('data-sv-loading'),false);assert.equal(b.w.document.querySelector('#svLoadingStatus').textContent,'');
});
