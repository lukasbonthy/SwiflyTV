'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright-core');
const {appReady,menuTargetsReady}=require('./browser-conditions.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH||chromium.executablePath();
const skip=!fs.existsSync(executablePath)&&'Chromium is not installed';
let browser,server,origin;
before(async()=>{
  if(skip)return;
  server=http.createServer((req,res)=>{
    const pending=req.url==='/ready';
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><body><script>'+ (pending
      ? `const pending=new Promise(()=>{});let scheduled=false;window.SwiflyAccount={get ready(){if(!scheduled){scheduled=true;setTimeout(()=>location.replace('/ready?settled=1'),0);}return pending;}};window.SwiflyLibrary={ready:pending};`
      : `window.SwiflyAccount={ready:Promise.resolve({user:null,available:true})};window.SwiflyLibrary={ready:Promise.resolve({active:true})};`)+ '</script></body>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(t){const context=await browser.newContext();t.after(()=>context.close());return context.newPage();}

test('application readiness survives replacement of a document while identity is pending',{skip},async t=>{
  const page=await pageFor(t);await page.goto(origin+'/ready',{waitUntil:'domcontentloaded'});
  const state=await appReady(page,'/ready');
  assert.equal(state.session.available,true);assert.equal(state.session.user,null);assert.equal(state.library.active,true);
  assert.equal(new URL(page.url()).search,'?settled=1');
});
test('application readiness never accepts a ready document at the wrong route',{skip},async t=>{
  const page=await pageFor(t);await page.goto(origin+'/other');
  await assert.rejects(appReady(page,'/ready',{timeout:200}),/Timeout/);
});
test('menu measurement waits for a replacement entrance animation to finish',{skip},async t=>{
  const page=await pageFor(t);
  await page.setContent('<div id="menu" style="transform-origin:top"><a href="/" style="display:block;height:44px">Account</a></div>');
  await page.evaluate(()=>{
    const menu=document.querySelector('#menu'),native=menu.getAnimations.bind(menu);
    menu.getAnimations=(...args)=>{window.captured=true;return native(...args);};
    window.first=menu.animate([{transform:'none'},{transform:'none'}],{duration:100000});
    first.finished.then(()=>menu.animate([{transform:'translateY(-8px) scale(.98)'},{transform:'translateY(0) scale(1)'}],{duration:300,fill:'both'}));
  });
  const waiting=menuTargetsReady(page,'#menu');
  await page.waitForFunction(()=>window.captured);await page.evaluate(()=>first.finish());await waiting;
  assert((await page.locator('#menu a').boundingBox()).height>=44);
});
test('menu readiness still rejects an undersized permanent click target',{skip},async t=>{
  const page=await pageFor(t);await page.setContent('<div id="menu"><a href="/" style="display:block;height:30px">Account</a></div>');
  await assert.rejects(menuTargetsReady(page,'#menu',{timeout:200}),/Timeout/);
});
