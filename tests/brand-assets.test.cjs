'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadServer,browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
test('navigation uses the supplied transparent bird and page heads declare the favicon',async()=>{
 const api=loadServer();try{
  const f=browser(api.pageShell({title:'Home',active:'home',body:'<main>Home</main>'})),d=f.window.document,brand=d.querySelector('.netflixBrand');
  assert.equal(brand.getAttribute('aria-label'),'SwiflyTV home');assert.equal(brand.getAttribute('href'),'/');assert.equal(brand.textContent.trim(),'');
  assert.equal(brand.querySelector('img')?.getAttribute('src'),'/assets/brand/swiflytv-nav-logo.svg?v=180');assert.equal(brand.querySelector('img').getAttribute('alt'),'');
  assert.equal(d.querySelector('link[rel="icon"]')?.getAttribute('href'),'/assets/brand/swiflytv-favicon.png?v=181');f.finish();
  const welcome=browser(require('../ui/welcome').welcomeMarkup());assert.equal(welcome.window.document.querySelector('.dsWelcomeBrand img')?.getAttribute('src'),'/assets/brand/swiflytv-nav-logo.svg?v=180');welcome.finish();
  const access=browser(require('../ui/access-page').accessPage('/'));assert.equal(access.window.document.querySelector('link[rel="icon"]')?.getAttribute('href'),'/assets/brand/swiflytv-favicon.png?v=181');access.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});
test('public branding loads before the access gate while browsing stays protected',async()=>{
 const previous=process.env.SWIFLY_ACCESS_PIN;let api;
 try{process.env.SWIFLY_ACCESS_PIN='123456';api=loadServer();}finally{if(previous===undefined)delete process.env.SWIFLY_ACCESS_PIN;else process.env.SWIFLY_ACCESS_PIN=previous;}
 try{
  await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+api.httpServer.address().port;
  const locked=await fetch(origin+'/',{redirect:'manual'});assert.equal(locked.status,302);assert.match(locked.headers.get('location'),/^\/access\?/);
  const icon=await fetch(origin+'/assets/brand/swiflytv-favicon.png?v=181',{redirect:'manual'});assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/png/);
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()),fs.readFileSync(path.join(__dirname,'../public/brand/swiflytv-favicon.png')));
  const logo=await fetch(origin+'/assets/brand/swiflytv-nav-logo.svg?v=180',{redirect:'manual'});assert.equal(logo.status,200);assert.match(logo.headers.get('content-type'),/image\/svg\+xml/);
  const legacy=await fetch(origin+'/favicon.ico',{redirect:'manual'});assert.equal(legacy.status,302);assert.equal(legacy.headers.get('location'),'/assets/brand/swiflytv-favicon.png?v=181');
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});
