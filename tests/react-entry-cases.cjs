'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const {compileDocument,renderDocument}=require('../lib/react-document.cjs');
const {loadingHead,loadingMarkup}=require('../ui/loading');
const {readShellStyle}=require('../lib/shell-styles');
const root=path.resolve(__dirname,'..');

module.exports=({available,getBrowser})=>{
 let output,manifest;
 test.before(async()=>{
  if(!available)return;
  output=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-entry-'));
  await promisify(execFile)(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config',path.join(root,'vite.config.mjs'),'--outDir',output,'--emptyOutDir'],{cwd:root,timeout:30000,maxBuffer:1024*1024});
  manifest=Object.values(JSON.parse(fs.readFileSync(path.join(output,'.vite/manifest.json'),'utf8'))).find(item=>item.isEntry);
 });
 test.after(()=>{if(output)fs.rmSync(output,{recursive:true,force:true});});
 const skip=!available&&'Chromium is not installed';
 const contentType=file=>file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'application/octet-stream';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#344953"/></svg>';
 async function fixture({production=false,viewport={width:1200,height:800}}={}){
  const context=await getBrowser().newContext({viewport,reducedMotion:'no-preference'}),page=await context.newPage();
  let release,released=false,api;
  const pending=new Promise(resolve=>{release=()=>{released=true;resolve();};});
  let original;
  if(production){
   api=require('./ui-helpers.cjs').loadServer();
   const rows=Array.from({length:14},(_,i)=>({id:346698+i,title:'A quiet story '+(i+1),release_date:'2026-01-01',poster_path:'/poster.jpg',backdrop_path:'/scene.jpg',vote_average:8}));
   api.setTmdb(async endpoint=>/^\/movie\/\d+$/.test(endpoint)?{...rows[0],images:{logos:[]}}:{results:rows,genres:[]});
   await api.homePage({},{send:html=>{original=html;}});
  }else original='<!doctype html><html><head>'+loadingHead({artwork:true})+'<style>body{margin:0;background:#000;color:white}#tools{padding:0;display:flex;gap:20px}button{position:relative;min-height:44px;min-width:90px;padding:12px;background:#ddd;border:0;border-radius:14px;font:16px system-ui}#offset{translate:0 -50%}</style></head><body class="svCleanShell">'+loadingMarkup()+'<main><div id="tools"><button id="details" class="dsSecondaryBtn">More details</button><button id="offset">Offset action</button><button id="disabled" disabled>Disabled</button></div></main><script defer src="/assets/clean/layout-fixture.js"></script><script defer src="/assets/clean/press.js"></script><script defer src="/optional/tool.js"></script></body></html>';
  const html=await renderDocument(compileDocument(original),{entry:'/'+manifest.file,css:(manifest.css||[]).map(file=>'/'+file)});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),pathname=url.pathname;
   try{
    if(pathname==='/')return await route.fulfill({contentType:'text/html',body:html});
    if(pathname.startsWith('/react-assets/'))return await route.fulfill({contentType:contentType(pathname),body:fs.readFileSync(path.join(output,pathname))});
    if(pathname==='/assets/clean/layout-fixture.js'){
     await new Promise(resolve=>setTimeout(resolve,650));
     return await route.fulfill({contentType:'text/javascript',body:`document.addEventListener('DOMContentLoaded',async()=>{await new Promise(r=>setTimeout(r,80));const tools=document.querySelector('#tools');tools.style.padding='24px';tools.dataset.ready='true';for(const button of tools.querySelectorAll('button'))button.addEventListener('click',()=>button.dataset.clicks=String(Number(button.dataset.clicks||0)+1));});`});
    }
    if(pathname==='/optional/tool.js'||production&&pathname==='/assets/clean/download.js'){
     if(!released)await pending;
     if(pathname==='/optional/tool.js')return await route.fulfill({contentType:'text/javascript',body:`document.addEventListener('DOMContentLoaded',()=>document.documentElement.dataset.optionalReady='true');`});
    }
    if(pathname.startsWith('/api/'))return await route.fulfill({json:{user:null,ok:true,results:[],items:[],friends:[],notifications:[]}});
    const shell=readShellStyle(pathname);if(shell!==undefined)return await route.fulfill({contentType:'text/css',body:shell});
    if(pathname.startsWith('/assets/')){const file=path.join(root,'public',pathname.slice(8));if(fs.existsSync(file)&&fs.statSync(file).isFile())return await route.fulfill({contentType:contentType(pathname),body:fs.readFileSync(file)});}
    return await route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:svg});
   }catch{if(!page.isClosed())await route.abort().catch(()=>{});}
  });
  await page.goto('https://swifly.test/',{waitUntil:'commit'});
  return {page,release,async close(){release();await context.close();if(api)await new Promise(resolve=>api.io.close(resolve));}};
 }

 test('the real React entry settles visual setup before the curtain and ignores a stalled optional tool',{skip},async()=>{
  const f=await fixture();try{
   await f.page.waitForSelector('#tools');
   assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'loading');
   await f.page.waitForFunction(()=>document.documentElement.dataset.svArtworkState==='reveal');
   assert.equal(await f.page.locator('#tools').getAttribute('data-ready'),'true','the visible controls must initialize behind the curtain');
   assert.equal(await f.page.evaluate(()=>document.readyState),'complete','optional scripts cannot spoof parsing on a usable page');
   await f.page.waitForFunction(()=>document.documentElement.dataset.svArtworkState==='ready');
   const before=await f.page.locator('#details').boundingBox();
   await f.page.locator('#details').click();assert.equal(await f.page.locator('#details').getAttribute('data-clicks'),'1');
   await f.page.waitForTimeout(240);
   f.release();await f.page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready');
   assert.deepEqual(await f.page.locator('#details').boundingBox(),before,'finishing an optional download must not move the revealed controls');
  }finally{await f.close();}
 });

 test('button presses preserve native activation, target size, centering and reduced motion',{skip},async()=>{
  const f=await fixture();try{
   f.release();await f.page.waitForFunction(()=>document.documentElement.dataset.svArtworkState==='ready');
   for(const id of ['details','offset']){
    const button=f.page.locator('#'+id),before=await button.boundingBox();
    await f.page.mouse.move(before.x+before.width/2,before.y+before.height/2);await f.page.mouse.down();
    await f.page.waitForFunction(({id,y})=>document.getElementById(id).getBoundingClientRect().y>y+.25,{id,y:before.y});
    const down=await button.boundingBox();assert.equal(down.height,before.height);assert.equal(down.width,before.width);assert(down.y-before.y<3,'press feedback must add to existing centering instead of replacing it');
    await f.page.mouse.up();assert.equal(await button.getAttribute('data-clicks'),'1');
    await f.page.waitForFunction(({id,y})=>Math.abs(document.getElementById(id).getBoundingClientRect().y-y)<.1&&!document.getElementById(id).getAnimations().length,{id,y:before.y});
   }
   await f.page.locator('#details').focus();await f.page.keyboard.down(' ');await f.page.waitForTimeout(70);await f.page.keyboard.up(' ');assert.equal(await f.page.locator('#details').getAttribute('data-clicks'),'2');
   await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.locator('#details').click();assert.equal(await f.page.locator('#details').getAttribute('data-clicks'),'3');
   assert.equal(await f.page.locator('#details').evaluate(node=>node.getAnimations().length),0);
   assert.equal(await f.page.locator('#disabled').evaluate(node=>node.getAnimations().length),0);
  }finally{await f.close();}
 });

 test('production Home keeps its revealed hero, navigation and rows stable through React startup',{skip},async()=>{
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const f=await fixture({production:true,viewport});try{
    await f.page.waitForFunction(()=>document.documentElement.dataset.svArtworkState==='ready');
    const geometry=()=>f.page.evaluate(()=>['.netflixNav','.dsHeroActions','[data-st-home-rows]'].map(selector=>{const node=document.querySelector(selector),r=node?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;}));
    const before=await geometry();assert(before[0]&&before[1]&&before[2],'the real Home composition must be present');
    f.release();await f.page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready');
    await f.page.waitForTimeout(250);
    const after=await geometry();for(let i=0;i<before.length;i++)for(const key of ['x','y','width','height'])assert(Math.abs(before[i][key]-after[i][key])<1,'revealed '+i+' '+key+' must not snap after startup');
    assert.equal(await f.page.evaluate(()=>(window.__swiflyReactErrors||[]).length+(window.__swiflyControllerErrors||[]).length),0,'production hydration and controller startup must succeed');
   }finally{await f.close();}
  }
 });
};
