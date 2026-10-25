'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const {loadServer}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const available=fs.existsSync(chromium.executablePath());let api,browser,origin,jobs;
test.before(async()=>{
 if(!available)return;api=loadServer();
 const titles=Array.from({length:12},(_,i)=>({id:101+i,title:'Cinema chapter '+(i+1),poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview:'A story for the big screen.',vote_average:8.2,release_date:'2026-06-01',media_type:'movie'}));
 api.setTmdb(async endpoint=>/^\/movie\/\d+$/.test(endpoint)?{...titles[0],runtime:118,genres:[],credits:{cast:[]},videos:{results:[]},recommendations:{results:titles},similar:{results:[]},images:{logos:[]}}:{results:titles,total_pages:1});
 jobs=createSourceJobs({resolve:async()=>({status:'error',message:'Local controller fixture: playback unavailable.'}),deadlineMs:1000});api.setSourceJobs(jobs);
 await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();jobs?.destroy();if(api)await new Promise(resolve=>api.io.close(resolve));});
async function open(motion='reduce'){
 const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:motion,userAgent:'Mozilla/5.0 (Xbox; Xbox One; Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'});
 await context.addInitScript(()=>{
  const Base=window.IntersectionObserver;
  window.__svXboxNearObservers={observed:0,targets:[]};
  window.IntersectionObserver=class extends Base {
   constructor(callback,options){super(callback,options);this._near=options?.rootMargin==='320px 120px';}
   observe(element){if(this._near){window.__svXboxNearObservers.observed++;window.__svXboxNearObservers.targets.push(element.className);}return super.observe(element);}
  };
 });
 await context.addInitScript(()=>{
  localStorage.setItem('swiflytv.session',JSON.stringify({email:'xbox-browser@example.test'}));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'xbox',name:'Xbox Viewer'}));localStorage.setItem('swiflytv.tvFocusMode','true');
  const listeners=new Map(),add=window.addEventListener.bind(window);
  window.addEventListener=(type,listener,options)=>{if(['gamepadconnected','gamepaddisconnected'].includes(type)){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);}else add(type,listener,options);};
  const p={id:'Xbox Wireless Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  window.xbox={pad:p,set(index,value){p.buttons[index]={pressed:value,value:Number(value)};},disconnect(){p.connected=false;for(const fn of listeners.get('gamepaddisconnected')||[])fn({gamepad:p});}};
  Object.defineProperty(navigator,'getGamepads',{value:()=>p.connected?[p]:[]});
 });
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();const image=route.request().resourceType()==='image';return route.fulfill({contentType:image?'image/svg+xml':route.request().resourceType()==='stylesheet'?'text/css':'text/plain',body:image?'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960"><rect width="640" height="960" fill="#203347"/></svg>':''});});
 const page=await context.newPage();await page.goto(origin+'/');await page.locator('#swiflyTvGuide[data-input="gamepad"]').waitFor();return {context,page};
}
// One polling frame represents a tap; keeping the button down over several
// slow CI frames would correctly start the player's held-trigger repeat.
async function press(page,index){await page.evaluate(async index=>{const frame=()=>new Promise(requestAnimationFrame);xbox.set(index,true);await frame();xbox.set(index,false);await frame();},index);}

test('Xbox uses lightweight hero imagery and avoids decorative full-screen compositing',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();
 try{
  await page.locator('main .dsHeroBg').waitFor();
  const sampled=await page.evaluate(()=>{
   const hero=document.querySelector('main .dsHeroBg');
   const nav=document.querySelector('.netflixNav > .svLiquidPane');
   const light=document.querySelector('.svHeroSpill');
   return {art:getComputedStyle(hero).backgroundImage,
    nav:!!nav && getComputedStyle(nav).display!=='none',
    spill:light?getComputedStyle(light).display:'absent',
    canvas:document.documentElement.dataset.svXbox};
  });
  assert.match(sampled.art,/\/w780\/backdrop\.jpg/,'Xbox must not paint the full-size original hero image');
  assert.equal(sampled.nav,false,'the Xbox policy avoids a decorative blur pane');assert.equal(await page.locator('.netflixNav').isVisible(),true,'the solid navigation remains available');assert.equal(await page.evaluate(()=>window.SwiflyStudio.getRawSettings().glass),'liquid','device safeguards retain the original appearance choice');
  assert.equal(sampled.spill,'none','Decorative full-screen artwork is removed from Xbox compositor');
  assert.equal(sampled.canvas,'true');
 }finally{await context.close();}
});

test('An Xbox controller browses real catalog rows, opens help, searches, and recovers after disconnect',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();try{
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.svXbox),'true','The real Xbox browser profile activates the graphics fast path');
  const rail=page.locator('.movieRail').first();await rail.locator('.posterWrap').first().focus();
  await press(page,5);let selected=await page.evaluate(()=>document.activeElement.closest('.movieRail')&&[...document.activeElement.closest('.movieRail').querySelectorAll('.posterWrap')].indexOf(document.activeElement));assert(selected>=3,'RB advances a visible page of titles');
  const previous=await page.evaluate(()=>document.activeElement.getAttribute('href'));await press(page,7);assert.equal(await page.evaluate(()=>document.activeElement.closest('.movieRail')===document.querySelectorAll('.movieRail')[1]),true,'RT moves to the next actual row');await press(page,6);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),previous);
  const geometry=await page.evaluate(()=>({caption:document.activeElement.closest('.movieCard').querySelector('.dsCardMeta').getBoundingClientRect().bottom,guide:document.getElementById('swiflyTvGuide').getBoundingClientRect().top}));assert(geometry.caption<geometry.guide,'Selected movie date stays above the control guide');
  await press(page,8);await page.locator('#swiflyTvHelp[open]').waitFor();assert.equal(await page.locator('#swiflyTvHelp [data-sv-tv-help-close]').evaluate(node=>node===document.activeElement),true);await press(page,1);await page.locator('#swiflyTvHelp').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),previous);
  await press(page,3);await page.locator('#svNavSearchInput').waitFor({state:'visible'});assert.equal(await page.locator('#svNavSearchInput').evaluate(node=>node===document.activeElement),true);
  await page.locator('#svNavSearchInput').fill('Northern lights');await press(page,8);await page.locator('#swiflyTvHelp[open]').waitFor();await press(page,1);await page.waitForFunction(()=>document.activeElement?.id==='svNavSearchInput');assert.equal(await page.locator('#svNavSearchInput').inputValue(),'Northern lights','Returning from help preserves the search context');
  await press(page,1);assert.equal(await page.locator('#svNavSearchPopup').getAttribute('hidden'),'');
  await page.evaluate(()=>xbox.disconnect());assert.equal(await page.locator('#swiflyTvGuide').getAttribute('data-input'),'remote');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.documentElement.dataset.svTv),'true');
 }finally{await context.close();}
});
test('Xbox player settings and unavailable playback remain navigable without leaving the movie',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();try{
  await page.goto(origin+'/watch/movie/101?mode=movie');await page.locator('[data-player-stage]').waitFor();
  // The unavailable case starts after resolution finishes. A late error tears
  // down an open loading-state menu before Back can close that same menu.
  await page.waitForFunction(()=>document.querySelector('[data-player-root]').dataset.playerState==='error');
  await page.locator('[data-player-stage]').focus();
  const before=page.url();await press(page,2);await press(page,7);assert.equal(page.url(),before);assert.equal(await page.evaluate(()=>document.querySelector('[data-player-video]').paused),true,'Unavailable transport cannot start raw video');
  await press(page,8);await page.locator('#swiflyTvHelp[open]').waitFor();await press(page,1);assert.equal(page.url(),before);assert.equal(await page.locator('[data-player-stage]').evaluate(node=>node===document.activeElement),true);
  await press(page,9);const options=page.locator('.svPlayerPopover[open],.dsProfileMenu[open]');await options.waitFor();assert.equal(await options.evaluate(node=>node.contains(document.activeElement)),true,'Menu remains useful while playback is unavailable');await press(page,1);assert.equal(await options.count(),0);
 }finally{await context.close();}
});
test('Xbox search leaves real browser fullscreen before focusing the search field',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();try{
  await page.goto(origin+'/watch/movie/101?mode=movie');await page.locator('[data-player-stage]').focus();await page.keyboard.press('f');await page.waitForFunction(()=>document.fullscreenElement?.matches('[data-player-stage]'));
  await press(page,3);await page.waitForFunction(()=>!document.fullscreenElement&&document.activeElement?.id==='svNavSearchInput');assert.equal(await page.locator('#svNavSearchPopup').getAttribute('hidden'),null);
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.getElementById('svNavSearchPopup').contains(document.activeElement)),true,'Directional focus stays in the now visible search');
 }finally{await context.close();}
});

test('Xbox catalog defers hidden optic allocation while preserving visible nav glass and row positions',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();
 try{
  await page.waitForFunction(()=>document.querySelectorAll('.movieCard').length>=12);
  const stats=await page.evaluate(()=>{
   const quick=[...document.querySelectorAll('.dsCardQuickActions')];
   return {quick:quick.length,hiddenOptics:quick.reduce((n,node)=>n+node.querySelectorAll('.svLiquidPane').length,0),
    navPane:!!document.querySelector('.netflixNav > .svLiquidPane'),
    materials:document.querySelectorAll('.svLiquidPane').length,
    xbox:document.documentElement.dataset.svXbox, tv:document.documentElement.dataset.svTv,
    ua:navigator.userAgent, io:typeof IntersectionObserver,
    firstQuick:quick[0]?.outerHTML.slice(0,1300),
    glassLoaded:!!window.SwiflyGlassSurfaces,
    near:window.__svXboxNearObservers?.observed,
    nearTargets:window.__svXboxNearObservers?.targets?.slice(0,15),
    catalogRows:document.querySelectorAll('.dsContent .dsRow,.dsContent .dsGrid,.svPlayerEpisodePicker').length};
  });
  assert(stats.quick>0,'Catalog includes poster quick actions');
  assert.equal(stats.hiddenOptics,0,'Invisible Xbox poster actions never allocate backdrop panes: '+JSON.stringify(stats));
  assert(stats.navPane,'The visible shared navigation material remains present');
  assert(stats.near>0 && stats.near<=stats.catalogRows+12,'Near-viewport glass allocation must observe rows instead of hundreds of individual buttons: '+JSON.stringify(stats));
  const first=page.locator('.movieRail').first().locator('.posterWrap');
  await first.nth(3).focus();await press(page,7);
  assert.equal(await page.evaluate(()=>{
   const selected=document.activeElement,rail=selected.closest('.movieRail');return [...rail.querySelectorAll('.posterWrap')].indexOf(selected);
  }),3,'Down from a title retains its column without measuring offscreen geometry');
 }finally{await context.close();}
});

test('An Xbox A press shows movie details without waiting for the 900ms entrance',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open('no-preference');
 try{
  const first=page.locator('.movieRail').first().locator('.posterWrap').first();
  await first.focus();
  await press(page,0);
  const result=await page.evaluate(()=>({
    modalOpen:!!document.querySelector('.svDetailDialog[open]'),
    motionState:document.querySelector('.svDetailDialog')?.dataset.svDetailState,
    catalogScene:document.documentElement.dataset.svDetailScene
  }));
  assert.equal(result.modalOpen,true,'A opens movie details on the first press');
  assert.equal(result.motionState,'open','Xbox skips the 900ms dialog entrance even with full-motion preferences');
  assert.equal(result.catalogScene,undefined,'Heavy background scale/clip transition never runs on Xbox');
 }finally{await context.close();}
});
