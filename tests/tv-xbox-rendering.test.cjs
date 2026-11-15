'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const {loadServer}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const available=fs.existsSync(chromium.executablePath());let api,browser,origin,jobs;
// Each upstream collection owns a full page of canonical identities. Returning
// the same titles for every endpoint makes real cross-row deduplication turn
// a populated layout fixture into a sparse-catalog test.
function createCatalogFixture(){
 const sources=new Map([['/trending/movie/week','Cinema'],['/trending/tv/week','Trending series'],['/movie/popular','Popular cinema'],['/tv/popular','Popular series'],['/movie/top_rated','Acclaimed cinema'],['/tv/top_rated','Acclaimed series'],['/movie/now_playing','New cinema']]),titles=new Map();
 const overview='An extraordinary journey across a changing world, where a small team discovers the meaning of home and the stories that connect us.';
 function collection(endpoint,params={}){
  if(!sources.has(endpoint))sources.set(endpoint,endpoint.split('/').filter(Boolean).join(' '));
  const source=[...sources.keys()].indexOf(endpoint),page=Math.max(1,Number(params.page)||1),type=endpoint.includes('/tv')?'tv':'movie',label=sources.get(endpoint);
  return Array.from({length:20},(_,index)=>{
   const id=source*1000000+(page-1)*1000+101+index,name=endpoint==='/trending/movie/week'&&page===1&&index===0?'Beyond the Northern Lights':label+(page>1?' page '+page:'')+' chapter '+(index+1);
   const item={id,[type==='tv'?'name':'title']:name,poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview,vote_average:8.2,vote_count:300,popularity:100-index,adult:false,media_type:type,...(type==='tv'?{first_air_date:'2026-06-01'}:{release_date:'2026-06-01'})};
   titles.set(type+':'+id,item);return item;
  });
 }
 return async(endpoint,params={})=>{
  if(endpoint.startsWith('/genre/'))return{genres:[{id:12,name:'Adventure'},{id:18,name:'Drama'}]};
  const detail=/^\/(movie|tv)\/(\d+)$/.exec(endpoint);
  if(detail){
   const type=detail[1],id=Number(detail[2]),item=titles.get(type+':'+id)||{id,[type==='tv'?'name':'title']:'A Separate Featured Journey',media_type:type,poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview,vote_average:8.2,...(type==='tv'?{first_air_date:'2026-06-01'}:{release_date:'2026-06-01'})};
   return{...item,id,runtime:118,genres:[{id:12,name:'Adventure'}],credits:{cast:[]},videos:{results:[]},recommendations:{results:collection('/'+type+'/'+id+'/recommendations')},similar:{results:[]},images:{logos:[]}};
  }
  return{page:Math.max(1,Number(params.page)||1),total_pages:3,total_results:60,results:collection(endpoint,params)};
 };
}
test.before(async()=>{
 if(!available)return;api=loadServer();
 api.setTmdb(createCatalogFixture());
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
async function captureCatalog(page,name,geometry={}){
 const directory=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(!directory)return;
 const path=require('node:path');fs.mkdirSync(directory,{recursive:true});
 const state=await page.evaluate(()=>{
  const box=node=>node?.getBoundingClientRect().toJSON(),selected=document.activeElement;
  return{url:location.href,viewport:{width:innerWidth,height:innerHeight},pageWidth:document.documentElement.scrollWidth,scrollY,selected:{href:selected?.getAttribute('href'),text:selected?.closest('.movieCard')?.querySelector('.dsCardTitle')?.textContent,box:box(selected)},preview:box(document.getElementById('swiflyTvSpotlight')),previewTitle:document.querySelector('.svTvSpotlightTitle')?.textContent,guide:box(document.getElementById('swiflyTvGuide')),rows:[...document.querySelectorAll('[data-st-home-rows] > .svCatalogRow')].map(row=>{const rail=row.querySelector('.movieRail'),cards=[...rail.querySelectorAll('.movieCard')];return{heading:row.querySelector('h2')?.textContent,count:cards.length,box:box(rail),scrollLeft:rail.scrollLeft,first:cards.slice(0,4).map(card=>({title:card.querySelector('.dsCardTitle')?.textContent,href:card.querySelector('.posterWrap')?.getAttribute('href'),box:box(card)}))};})};
 });
 fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify({...state,geometry},null,2));await page.screenshot({path:path.join(directory,name+'.png')});
}

// One polling frame represents a tap; keeping the button down over several
// slow CI frames would correctly start the player's held-trigger repeat.
async function press(page,index){await page.evaluate(async index=>{const frame=()=>new Promise(requestAnimationFrame);xbox.set(index,true);await frame();xbox.set(index,false);await frame();},index);}

test('Xbox uses lightweight hero imagery and avoids decorative full-screen compositing',{skip:!available&&'Chromium is not installed'},async()=>{
 const {context,page}=await open();
 try{
  await page.locator('main .dsHeroBg[data-sv-featured-active="true"]').waitFor();
  const sampled=await page.evaluate(()=>{
   const hero=document.querySelector('main .dsHeroBg[data-sv-featured-active="true"]');
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
  await press(page,5);let selected=await page.evaluate(()=>document.activeElement.closest('.movieRail')&&[...document.activeElement.closest('.movieRail').querySelectorAll('.posterWrap')].indexOf(document.activeElement));await captureCatalog(page,'tv-xbox-rb-gallery',{selected});assert(selected>=3,'RB advances a visible page of titles');
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
  await captureCatalog(page,'tv-xbox-optics-gallery',stats);
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
