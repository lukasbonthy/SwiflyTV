'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const {loadServer}=require('./ui-helpers.cjs');
const {recommendationsMarkup}=require('../ui/discovery');
const {loadingHead}=require('../ui/loading');
const root=path.join(__dirname,'../public'),asset=name=>fs.readFileSync(path.join(root,name),'utf8');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api;
test.before(async()=>{if(available){api=loadServer();browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});}});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));});
// Render the real shared shell and its exact stylesheet order. Its controllers
// are isolated here so external account/catalog data cannot drive layout tests.
async function open({viewport={width:1440,height:900},body='<main data-st-home><section class="dsHero"><div class="dsHeroContent"><h1>A real title</h1><a href="/watch/movie/42">Play</a></div></section><section class="dsContent" data-st-home-rows></section></main>',values={},loading=false,tv=false,palette=false}={}) {
 const context=await browser.newContext({viewport}),page=await context.newPage();
 let html=api.pageShell({body,active:'home'}).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 if(loading)html=html.replace('</head>',loadingHead()+'</head>');
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),type=route.request().resourceType();if(type==='document')return route.fulfill({contentType:'text/html',body:html});
  if(url.hostname==='art.swifly.test')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="24"><rect width="36" height="24" fill="'+(url.pathname.includes('blue')?'#1e50dc':'#dc3723')+'"/></svg>'});
  if(url.pathname.startsWith('/assets/')&&/\.(css|svg)$/.test(url.pathname)){const file=path.join(root,url.pathname.slice(8));if(fs.existsSync(file))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(file)});}
  return route.fulfill({contentType:type==='stylesheet'?'text/css':'image/svg+xml',body:''});
 });
 await page.goto('https://swifly.test/');if(tv)await page.evaluate(()=>document.documentElement.dataset.svTv='true');
 await page.evaluate(values=>window.SwiflyAppearance=values,values);if(palette)await page.addScriptTag({content:asset('clean/hero-palette.js')});await page.addScriptTag({content:asset('studio/experience.js')});
 return {context,page};
}
async function change(page,effective){await page.evaluate(effective=>{window.SwiflyAppearance=effective;document.dispatchEvent(new CustomEvent('swifly:studio-change',{detail:{values:effective,effective}}));},effective);}

test('desktop sidebar fits the real shell and returns to top navigation on a phone and TV',{skip},async()=>{
 const {context,page}=await open({values:{navLayout:'sidebar'}});try {
  const desktop=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,bottom:r.bottom};};return {nav:rect('.netflixNav'),scene:rect('.svBrowseScene'),links:[...document.querySelectorAll('.navLinks > a')].map(n=>({visible:n.getClientRects().length>0,right:n.getBoundingClientRect().right})),account:rect('.dsProfileMenu')};});
  assert(desktop.nav.width<=220,'the legacy centered navbar must become a sidebar');assert(desktop.nav.height>=800);assert(desktop.scene.left>=220);assert(desktop.links.every(n=>n.visible&&n.right<=220));assert(desktop.account.bottom<=900);
  await page.setViewportSize({width:320,height:568});const phone=await page.locator('.netflixNav').boundingBox();assert(phone.width<=320&&phone.height<100);assert.equal(await page.locator('.navLinks').isVisible(),false);
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>document.documentElement.dataset.svTv='true');const television=await page.locator('.netflixNav').boundingBox();assert(television.width>220&&television.height<140);assert.equal((await page.locator('.svBrowseScene').boundingBox()).x,0);
 }finally{await context.close();}
});

test('all six mobile routes share one visible row at 320px',{skip},async()=>{
 const {context,page}=await open({viewport:{width:320,height:568},values:{navOrder:['study','list','home','movies','tv','discover']}});try {
  const targets=await page.locator('.mobileNav > a').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {key:n.dataset.stNav,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};}));
  assert.deepEqual(targets.map(n=>n.key),['study','list','home','movies','tv','discover']);assert(Math.max(...targets.map(n=>n.y))-Math.min(...targets.map(n=>n.y))<2,'Study must fit beside the existing five routes');
  for(const target of targets)assert(target.x>=0&&target.right<=320&&target.width>=40&&target.height>=40);
 }finally{await context.close();}
});

test('six-link TV navigation keeps search, Studio, TV exit and account within a compact screen',{skip},async()=>{
 const {context,page}=await open({viewport:{width:960,height:540},tv:true,values:{navLayout:'sidebar',tvControls:'large'}});try {
  const geometry=await page.evaluate(()=>{const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};return {nav:bounds(document.querySelector('.netflixNav')),controls:['#svNavSearchToggle','#controlToggleTop','.svTvModePill','.dsProfileMenu > summary'].map(selector=>bounds(document.querySelector(selector))),links:[...document.querySelectorAll('.navLinks > a')].map(bounds)};});
  assert(geometry.nav.left>=0&&geometry.nav.right<=960);assert.equal(geometry.links.length,6);
  for(const box of [...geometry.controls,...geometry.links])assert(box.left>=0&&box.right<=960&&box.width>=40&&box.height>=40,'visible routes and critical controls stay inside the screen');
 }finally{await context.close();}
});

test('compact AI spacing reduces the actual form while preserving every live field',{skip},async()=>{
 const {context,page}=await open({body:recommendationsMarkup()});try {
  await page.locator('[name="prompt"]').fill('A story to remember');const read=()=>page.evaluate(()=>({input:document.querySelector('.svMoodInput').getBoundingClientRect().height,chip:document.querySelector('[data-mood]').getBoundingClientRect().height,fields:[...document.querySelector('[data-recommendation-form]').elements].map(n=>n.name)}));
  const comfortable=await read();await change(page,{aiSpacing:'compact',aiOptions:true});const compact=await read();assert(compact.input<comfortable.input);assert(compact.chip<=comfortable.chip);assert.deepEqual(compact.fields,comfortable.fields);assert.equal(await page.locator('[name="prompt"]').inputValue(),'A story to remember');assert(await page.locator('.svRecommendationPreferences').evaluate(n=>n.open));
 }finally{await context.close();}
});

test('basic loading has no decorative animation and all styles release immediately when ready',{skip},async()=>{
 const {context,page}=await open({loading:true,values:{loaderStyle:'basic'}});try {
  await page.evaluate(()=>{window.releaseFixture=window.SwiflySiteLoading.hold('Loading fixture catalog');document.documentElement.dataset.svLoading='initial';});
  assert.equal(await page.locator('.svLoadProgress i').evaluate(n=>getComputedStyle(n).animationName),'none');
  for(const loaderStyle of ['basic','minimal','cinematic','artwork','aurora']){await change(page,{loaderStyle});assert.equal(await page.locator('#svLoadingStatus').getAttribute('role'),'status');assert.equal(await page.locator('.svLoadProgress').getAttribute('aria-valuenow'),null);}
  await page.evaluate(()=>window.releaseFixture());assert.equal(await page.locator('#svSiteLoading').evaluate(n=>getComputedStyle(n).visibility),'hidden');
 }finally{await context.close();}
});

test('real cross-origin artwork changes visible ambient gradients and Cancel restores them',{skip},async()=>{
 const {context,page}=await open({palette:true,body:'<main data-st-home><section class="dsHero" data-sv-palette-src="https://art.swifly.test/red.svg"><div class="dsHeroContent"><h1>Artwork fixture</h1></div></section><section class="dsContent" data-st-home-rows></section></main>',values:{adaptiveCinema:true,adaptiveStrength:40,performancePreset:'desktop'}});try {
  await page.evaluate(()=>document.body.dataset.stBackdrop='smooth');
  await page.waitForFunction(()=>document.body.dataset.stAdaptiveActive==='true');const red=await page.evaluate(()=>document.body.style.getPropertyValue('--st-adaptive-primary')),redGradient=await page.locator('.stAdaptiveGlow').evaluate(n=>getComputedStyle(n).backgroundImage);
  assert.equal(await page.locator('.dsHero').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','the ambient layer must remain visible when the saved backdrop is not Aurora');assert(await page.locator('.stAdaptiveGlow').isVisible());
  await page.locator('.dsHero').evaluate(n=>n.dataset.svPaletteSrc='https://art.swifly.test/blue.svg');await page.waitForFunction(red=>document.body.style.getPropertyValue('--st-adaptive-primary')!==red,red);const blue=await page.evaluate(()=>document.body.style.getPropertyValue('--st-adaptive-primary'));assert.notEqual(red,blue);assert.notEqual(await page.locator('.stAdaptiveGlow').evaluate(n=>getComputedStyle(n).backgroundImage),redGradient);
  await change(page,{adaptiveCinema:false});assert.equal(await page.locator('.stAdaptiveGlow').isVisible(),false);assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--st-adaptive-primary')),'');
 }finally{await context.close();}
});
