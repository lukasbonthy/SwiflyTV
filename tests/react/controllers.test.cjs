'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {JSDOM,VirtualConsole}=require('jsdom');

test('visible controllers settle before layout readiness while optional downloads remain pending',async t=>{
  let released=false,releaseSlow,slowRequested=false;
  const slow=new Promise(resolve=>{releaseSlow=()=>{released=true;resolve();};});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('content-type','text/javascript');
    if(req.url==='/assets/clean/shell.js')return res.end(`window.shellFactory=()=> 'Ready';window.boots=[];document.addEventListener('DOMContentLoaded',async()=>{await new Promise(r=>setTimeout(r,120));document.querySelector('#tools').textContent=shellFactory();window.boots.push('shell');});`);
    if(req.url==='/assets/studio/layout.js')return res.end(`document.addEventListener('DOMContentLoaded',()=>{document.querySelector('#tools').style.padding='24px';window.boots.push('layout');});`);
    slowRequested=true;if(!released)await slow;
    res.end(`document.addEventListener('DOMContentLoaded',()=>{window.optionalBooted=true;});`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const dom=new JSDOM('<!doctype html><html data-sv-layout-state="pending"><body><main id="tools">Initial</main></body></html>',{url:'http://127.0.0.1:'+server.address().port,runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const previous=Object.fromEntries(['window','document','Event'].map(name=>[name,Object.getOwnPropertyDescriptor(global,name)]));
  for(const name of ['window','document','Event'])Object.defineProperty(global,name,{configurable:true,writable:true,value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window.Event});
  let boot;
  t.after(async()=>{releaseSlow();await boot?.catch(()=>{});dom.window.close();await new Promise(resolve=>server.close(resolve));for(const[name,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(global,name,descriptor);else delete global[name];}});
  const {startControllers}=await import('../../frontend/controllers.mjs?settled-entry-test');
  const descriptors=['/assets/clean/shell.js','/assets/studio/layout.js','/optional/slow.js'].map(src=>({src,attrs:{src,defer:''},code:''}));
  boot=startControllers(descriptors);
  const deadline=Date.now()+2000;
  while(document.documentElement.dataset.svLayoutState!=='ready'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(document.documentElement.dataset.svLayoutState,'ready','the visible page must finish without waiting for an optional script');
  assert.equal(document.querySelector('#tools').textContent,'Ready','async layout initialization must finish before the reveal signal');
  assert.equal(document.querySelector('#tools').style.padding,'24px');
  assert.notEqual(document.readyState,'loading','optional downloads must not make the live document pretend to be parsing');
  assert.equal(dom.window.optionalBooted,undefined);
  assert.equal(startControllers(descriptors),boot,'startup must remain idempotent');
  while(!slowRequested)await new Promise(resolve=>setTimeout(resolve,5));
  releaseSlow();await boot;
  assert.deepEqual([...dom.window.boots],['layout','shell']);
  assert.equal(dom.window.optionalBooted,true,'late explicit DOMContentLoaded callbacks must still initialize once');
  assert.equal(document.documentElement.dataset.swiflyReact,'ready');
});
