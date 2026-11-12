'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core'),{loadingHead,loadingMarkup}=require('../ui/loading');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
let browser;
test.before(async()=>{if(available)browser=await chromium.launch({headless:true,executablePath});});
test.after(async()=>{await browser?.close();});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#647a92"/></svg>';
async function open({reducedMotion='no-preference',body='',root='',deferred=false}={}){
 const context=await browser.newContext({viewport:{width:1200,height:800},reducedMotion}),page=await context.newPage(),gates=new Map(),released=new Set();
 await page.addInitScript(()=>{window.framesRequested=0;window.domReady=false;document.addEventListener('DOMContentLoaded',()=>window.domReady=true);const request=window.requestAnimationFrame;window.requestAnimationFrame=fn=>{framesRequested++;return request(fn);};});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html '+root+'><head>'+loadingHead({artwork:true})+'<style>.dsHero{height:600px}.dsHeroBg{height:600px;position:absolute;inset:0;background-image:url(/hero.svg)}.dsHeroContent{position:relative;padding:200px 50px 0}.dsHeroLogo{width:250px;height:70px}#optional{margin-top:2000px}img{display:block}</style>'+(deferred?'<script defer src="/delayed.js"></script>':'')+'</head><body class="svCleanShell" '+body+'>'+loadingMarkup()+'<main><section class="dsHero"><div class="dsHeroBg"></div><div class="dsHeroContent"><h1 class="dsHeroTitleArt"><span class="dsHeroTitleText">Featured film</span><img class="dsHeroLogo" src="/logo.svg" alt="" width="250" height="70"></h1><p>A ready catalog.</p><div class="dsHeroActions"><a href="/watch/movie/1">Play</a></div></div></section><div id="dynamic"></div><img id="optional" loading="lazy" src="/optional.svg" width="100" height="150" alt="Optional poster"></main></body></html>'});
  if(!released.has(url.pathname))await new Promise(resolve=>gates.set(url.pathname,resolve));
  try{await route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml',body:url.pathname.endsWith('.js')?'':svg});}catch{}
 });
 await page.goto('https://swifly.test/',{waitUntil:deferred?'commit':'domcontentloaded'});
 await page.waitForSelector('.dsHeroActions');
 return {page,context,gates,release(path){released.add(path);gates.get(path)?.();},async close(){for(const resolve of gates.values())resolve();await context.close();}};
}

test('black entry waits for visible artwork, dissolves smoothly and ignores a lazy poster',{skip:!available},async()=>{
 const f=await open();try{
  const initial=await f.page.evaluate(()=>({state:document.documentElement.dataset.svArtworkState,fill:getComputedStyle(document.querySelector('#svArtworkCurtain')).backgroundColor,opacity:getComputedStyle(document.querySelector('#svArtworkCurtain')).opacity,copy:getComputedStyle(document.querySelector('h1')).opacity}));
  assert.equal(initial.state,'loading');assert.equal(initial.fill,'rgb(0, 0, 0)');assert.equal(initial.opacity,'1');assert.equal(initial.copy,'0');
  f.release('/hero.svg');f.release('/logo.svg');await f.page.waitForSelector('html[data-sv-artwork-state="reveal"]');
  const during=await f.page.evaluate(()=>({duration:getComputedStyle(document.querySelector('#svArtworkCurtain')).transitionDuration,art:getComputedStyle(document.querySelector('.dsHeroBg')).transitionProperty,ancestors:[document.body,document.querySelector('main'),document.querySelector('.dsHeroContent'),document.querySelector('.dsHeroActions')].map(node=>({opacity:getComputedStyle(node).opacity,filter:getComputedStyle(node).filter}))}));
  assert.match(during.duration,/0.44s/);assert.equal(during.art,'none','the curtain owns the initial fade');assert(during.ancestors.every(node=>node.opacity==='1'&&node.filter==='none'));
  await f.page.waitForSelector('html[data-sv-artwork-state="ready"]');assert.equal(await f.page.locator('html').getAttribute('aria-busy'),null);assert.equal(await f.page.locator('h1').evaluate(node=>getComputedStyle(node).opacity),'1');
  assert.equal(await f.page.locator('#optional').evaluate(image=>image.complete),false,'a lazy poster must not hold the entry curtain');
  const frames=await f.page.evaluate(()=>framesRequested);await f.page.waitForTimeout(100);assert.equal(await f.page.evaluate(()=>framesRequested),frames,'entry must not leave an idle animation-frame loop');
 }finally{await f.close();}
});

test('decoded artwork reveals before an optional deferred script completes',{skip:!available},async()=>{
 const f=await open({deferred:true});try{
  f.release('/hero.svg');f.release('/logo.svg');
  await f.page.waitForSelector('html[data-sv-artwork-state="reveal"]',{timeout:1500});
  assert.equal(await f.page.evaluate(()=>domReady),false,'deferred application code must not own a ready entry scene');
  const initial=await f.page.locator('.dsHeroBg').evaluate(node=>({opacity:getComputedStyle(node).opacity,transition:getComputedStyle(node).transitionProperty}));
  assert.equal(initial.opacity,'1');assert.equal(initial.transition,'none');
  assert.equal(await f.page.locator('h1').evaluate(node=>node.classList.contains('hasLogo')),true,'the loaded title logo must be presented before deferred catalog setup');
  f.release('/delayed.js');await f.page.waitForFunction(()=>domReady);await f.page.waitForSelector('html[data-sv-artwork-state="ready"]');
  assert.equal(await f.page.locator('.dsHeroBg').evaluate(node=>getComputedStyle(node).opacity),'1');
 }finally{await f.close();}
});



test('a stalled deferred script cannot hold the black surface beyond its safety deadline',{skip:!available},async()=>{
 const f=await open({deferred:true});try{
  await f.page.waitForSelector('html[data-sv-artwork-state="ready"]',{timeout:4000});
  assert.equal(await f.page.evaluate(()=>domReady),false);assert.equal(await f.page.locator('#svArtworkCurtain').evaluate(node=>getComputedStyle(node).pointerEvents),'none');
  f.release('/hero.svg');f.release('/logo.svg');f.release('/delayed.js');await f.page.waitForFunction(()=>document.readyState!=='loading');
  await f.page.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).opacity==='1');assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'ready','late DOM readiness must not replay entry');
 }finally{await f.close();}
});

test('newly inserted artwork fades after decode, while Escape and history never replay the curtain',{skip:!available},async()=>{
 const f=await open();try{
  await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'ready');
  await f.page.evaluate(()=>{const image=document.createElement('img');image.id='late';image.src='/late.svg';image.width=160;image.height=90;document.querySelector('#dynamic').append(image);});
  await f.page.waitForFunction(()=>document.querySelector('#late').classList.contains('svArtworkAsset'));assert.equal(await f.page.locator('#late').evaluate(node=>getComputedStyle(node).opacity),'0');f.release('/late.svg');
  await f.page.waitForFunction(()=>{const opacity=Number(getComputedStyle(document.querySelector('#late')).opacity);return opacity>0&&opacity<1;});
  await f.page.waitForFunction(()=>getComputedStyle(document.querySelector('#late')).opacity==='1');
  await f.page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'ready');assert.equal(await f.page.locator('h1').evaluate(node=>getComputedStyle(node).opacity),'1');
 }finally{await f.close();}
});

test('reduced motion, Studio motion choices and TV open immediately without artwork transitions',{skip:!available},async()=>{
 for(const options of [{reducedMotion:'reduce'},{body:'data-st-page-motion="false"'},{body:'data-st-loader-style="minimal"'},{root:'data-sv-tv="true"'},{body:'data-st-loader-style="basic"'}]){
  const f=await open(options);try{assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'ready');assert.equal(await f.page.locator('h1').evaluate(node=>getComputedStyle(node).opacity),'1');assert.equal(await f.page.locator('.svArtworkAsset').count(),0);}finally{await f.close();}
 }
});
test('comfort and TV settings bypass entry even while a deferred script is stalled',{skip:!available},async()=>{
 for(const options of [{reducedMotion:'reduce'},{body:'data-st-page-motion="false"'},{body:'data-st-loader-style="minimal"'},{root:'data-sv-tv="true"'},{root:'data-sv-xbox="true"'}]){
  const f=await open({...options,deferred:true});try{
   assert.equal(await f.page.evaluate(()=>domReady),false);assert.equal(await f.page.locator('html').getAttribute('data-sv-artwork-state'),'ready');assert.equal(await f.page.locator('#svArtworkCurtain').evaluate(node=>getComputedStyle(node).opacity),'0');
  }finally{await f.close();}
 }
});
