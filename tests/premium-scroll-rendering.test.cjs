'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const {welcomeMarkup} = require('../ui/welcome');
const available = fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

async function catalog(browser, options = {}) {
  const {detailHTML,welcome=false,grid='',...pageOptions}=options;
  const api = loadServer();
  let ready = false;
  try {
    await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + api.httpServer.address().port;
    const items = Array.from({length:18}, (_, index) => ({id:100 + index, title:'Film ' + index,
      backdrop_path:'/scene.jpg', poster_path:'/poster.jpg', release_date:'2026-01-01', vote_average:7.2, overview:'A featured film.'}));
    api.setTmdb(async endpoint => /^\/movie\/\d+$/.test(endpoint) ? {...items[0],runtime:118,genres:[],
      credits:{cast:[],crew:[]},videos:{results:[]},recommendations:{results:items},similar:{results:[]},images:{logos:[]}} : ({results:items}));
    let html;
    if(welcome)html=api.pageShell({active:'welcome',body:welcomeMarkup({hero:items[0]})});
    else if(grid){
      const cards=items.map(item=>api.movieCard(item,'movie')).join('');
      html=api.pageShell({active:grid==='movieGrid'?'movies':'search',body:grid==='movieGrid'
        ? '<main><div class="container netflixCatalog"><div class="movieGrid">'+cards+'</div></div></main>'
        : '<main class="dsPlainPage"><section class="dsContent noHero"><div class="dsGrid">'+cards+'</div></section></main>'});
    }
    else await api.homePage({}, {send(value) {html = value;}});
    let detail; await api.detailPage({params:{id:'100'},query:{view:'modal'},headers:{},protocol:'http',get:()=> 'localhost:3000'},
      {send(value) {detail=value;}}, 'movie');
    // Registering gamepad listeners initializes physical device discovery in
    // Chromium 131, which is unavailable in the Linux test container. Retain
    // every other real shell script, asset, catalog row, and optical surface.
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g,
      (tag, code) => /^<script\b[^>]*\bdata-sv-tv-navigation\b/i.test(tag) || code.includes('function swiflyTvFocusNavigation') ? '' : tag);
    const page = await browser.newPage({viewport:{width:1280, height:900}, colorScheme:'dark', ...pageOptions});
    await page.addInitScript(() => {
      localStorage.setItem('swiflytv.session', JSON.stringify({email:'scroll@example.test'}));
      localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id:'fixture', name:'Viewer'}));
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/') return route.fulfill({body:html, contentType:'text/html'});
      if (url.origin === origin && url.pathname === '/movie/100') return route.fulfill({body:detailHTML||detail,contentType:'text/html'});
      // Assets must traverse Express. Serving files directly here masked the
      // missing production route and let the engine silently fail to load.
      if (url.origin === origin && url.pathname.startsWith('/assets/')) return route.continue();
      if (url.hostname === 'image.tmdb.org') return route.fulfill({contentType:'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#325776"/><circle cx="280" cy="240" r="180" fill="#afc3d7"/></svg>'});
      return route.fulfill({body:'', contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain'});
    });
    await page.goto(origin);
    page.once('close', () => api.io.close());
    ready = true;
    return page;
  } finally {if (!ready) await new Promise(resolve => api.io.close(resolve));}
}

test('detail motion keeps the scrollbar at the window edge and the catalog fade stationary', {skip:!available&&'Chromium is not installed'}, async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  const page=await catalog(browser);
  const before=await page.evaluate(async()=>{
   await document.fonts.ready;SwiflyMotion.stop();scrollTo({top:240,behavior:'instant'});await new Promise(requestAnimationFrame);
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,width:r.width,top:r.top};};
   return {nav:rect('.netflixNav'),fade:rect('.svHeroLightBridge'),gutter:innerWidth-document.documentElement.clientWidth,y:scrollY};
  });
  assert(before.gutter>0,'the test must exercise a classic visible scrollbar');
  await page.evaluate(async()=>{
   const opening=SwiflyDetails.open('/movie/100',document.querySelector('.dsHeroActions a'));
   const dialog=document.querySelector('.svDetailDialog'),panel=dialog.querySelector('.svDetailPanel')||dialog;
   const animation=panel.getAnimations().find(a=>a.effect.target===panel);
   window.__sheetEntry={frames:animation.effect.getKeyframes(),timing:animation.effect.getTiming()};
   animation.finish();await opening;
  });
  await page.waitForFunction(()=>document.querySelector('.svDetailDialog').dataset.svDetailState==='open');
  const result=await page.evaluate(()=>{
   const dialog=document.querySelector('.svDetailDialog'),panel=dialog.querySelector('.svDetailPanel')||dialog;
   const animation=panel.animate(__sheetEntry.frames,__sheetEntry.timing),duration=__sheetEntry.timing.duration;
   animation.pause();
   const viewport=document.querySelector('.svDetailViewport'),samples=[];
   for(const time of [0,80,160,240,400,duration]){
    animation.currentTime=time;
    const v=viewport.getBoundingClientRect(),nav=document.querySelector('.netflixNav').getBoundingClientRect(),fade=document.querySelector('.svHeroLightBridge').getBoundingClientRect();
    samples.push({left:v.left,right:v.right,top:v.top,height:v.height,scrollHeight:viewport.scrollHeight,contentWidth:viewport.clientWidth,
     nav:{left:nav.left,width:nav.width,top:nav.top},fade:{left:fade.left,width:fade.width,top:fade.top},panelTop:panel.getBoundingClientRect().top,y:scrollY});
   }
   animation.cancel();return {samples,duration,width:innerWidth,height:innerHeight};
  });
  assert(result.duration>=500&&result.duration<=580,'the sheet should be slightly quicker while retaining a full glide');
  for(const sample of result.samples){
   assert.equal(sample.left,0,'the scroll area stays at the window edge');
   assert.equal(sample.right,result.width);
   assert.equal(sample.top,0,'the scrollbar must not slide up with the panel');
   assert.equal(sample.height,result.height);
   assert.equal(sample.contentWidth,result.width-before.gutter,'the modal and catalog reserve the same scrollbar width');
   assert.equal(sample.scrollHeight,result.samples[0].scrollHeight,'animation overflow must not resize the scrollbar thumb');
   assert.equal(sample.y,before.y);
   for(const field of ['left','width','top']){
    assert(Math.abs(sample.nav[field]-before.nav[field])<.5,'fixed navigation must not shift on open');
    assert(Math.abs(sample.fade[field]-before.fade[field])<.5,'the artwork/fade seam must not be resampled by a background zoom');
   }
  }
  assert(Math.abs(result.samples.at(-1).panelTop-result.height*.07)<1,'the rounded panel settles with a small view of the catalog above it');
  assert(result.samples[0].panelTop>result.samples.at(-1).panelTop+700,'the content panel still rises into place');
  const viewport=page.locator('.svDetailViewport');
  await page.mouse.click(result.width-5,result.height*.7);
  await page.waitForFunction(()=>document.querySelector('.svDetailViewport').scrollTop>100);
  assert.equal(await page.evaluate(()=>scrollY),before.y,'the visible edge scrollbar must control the modal, not the catalog');
  await viewport.evaluate(node=>node.scrollTop=0);
  await viewport.hover({position:{x:600,y:600}});await page.mouse.wheel(0,260);
  await page.waitForFunction(()=>document.querySelector('.svDetailViewport').scrollTop>100);
  assert.equal(await page.evaluate(()=>scrollY),before.y,'the modal scrolls natively while the catalog stays put');
  await viewport.evaluate(node=>node.scrollTop=node.scrollHeight);
  await page.mouse.move(3,450);await page.mouse.wheel(0,260);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>scrollY),before.y,'overscroll on the outside margin cannot chain to the catalog');
  const exit=await page.evaluate(()=>{
   const dialog=document.querySelector('.svDetailDialog'),panel=dialog.querySelector('.svDetailPanel');
   const scroll=document.querySelector('.svDetailViewport').scrollTop;
   dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
   const animation=panel.getAnimations().find(a=>a.effect.target===panel),duration=animation.effect.getTiming().duration;
   animation.pause();animation.currentTime=duration;
   const top=panel.getBoundingClientRect().top;
   for(const a of [...panel.getAnimations(),...document.querySelector('.svDetailScrim').getAnimations()])a.finish();
   return {top,duration,scroll,height:innerHeight};
  });
  assert(exit.scroll>500,'exercise the exit after scrolling deep into the movie');
  assert(exit.top>=exit.height,'the entire visible panel must leave the window before the dialog closes');
  assert.equal(exit.duration,320);
  await page.waitForFunction(()=>!document.querySelector('.svDetailDialog').open);
  const after=await page.locator('.netflixNav').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,width:r.width,rootWidth:document.documentElement.clientWidth,bodyWidth:document.body.clientWidth,headerWidth:node.parentElement.getBoundingClientRect().width};});
  assert(Math.abs(after.left-before.nav.left)<.5,JSON.stringify({before,after}));assert.equal(after.width,before.nav.width);
 }finally{await browser.close();}
});

test('finished hero copy releases its filter and transform layers before browsing', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await catalog(browser);
    await page.evaluate(async()=>{
      const nodes=[...document.querySelectorAll('.dsHeroContent > :is(.dsEyebrow,h1,.dsHeroMeta,p)')];
      for(const node of nodes)for(const animation of node.getAnimations())animation.finish();
      await new Promise(requestAnimationFrame);
    });
    const copy=await page.locator('.dsHeroContent > :is(.dsEyebrow,h1,.dsHeroMeta,p)').evaluateAll(nodes=>nodes.map(node=>{
      const style=getComputedStyle(node);return {text:node.textContent,filter:style.filter,transform:style.transform,opacity:style.opacity,entrance:style.animationName,duration:parseFloat(style.animationDuration)};
    }));
    assert.equal(copy.length,4);
    for(const node of copy){
      assert.equal(node.filter,'none',node.text+' must not retain an offscreen blur surface after its entrance');
      assert.equal(node.transform,'none',node.text+' must release the finished transform');
      assert.equal(node.opacity,'1');
      assert.notEqual(node.entrance,'none','keep the existing text entrance');
      assert(node.duration>0,'keep the existing text entrance timing');
    }
  }finally{await browser.close();}
});

test('the first real catalog scroll frame follows the display clock after idle', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await catalog(browser);
    await page.waitForFunction(()=>[...document.querySelectorAll('.dsHeroContent > :is(.dsEyebrow,h1,.dsHeroMeta,p)')]
      .every(node=>getComputedStyle(node).filter==='none'));
    const first=await page.evaluate(async()=>{
      let display,input;
      // Select a fresh inter-frame phase after startup/GC work. A stale
      // timeline correctly takes the fallback, covered in the unit suite.
      for(let attempt=0;attempt<20;attempt++){
        await new Promise(requestAnimationFrame);
        await new Promise(resolve=>setTimeout(resolve,8));
        display=document.timeline.currentTime;input=performance.now();
        if(input-display>2&&input-display<40)break;
      }
      const wheel=new WheelEvent('wheel',{deltaY:360,bubbles:true,cancelable:true});
      // Keep this synthetic gesture in the fresh input phase selected above.
      // CPU contention can otherwise age the clock during synchronous wheel
      // listeners, legitimately selecting the separately unit-tested stale
      // clock fallback rather than the display-clock path under test here.
      const ownNow=Object.getOwnPropertyDescriptor(performance,'now');
      Object.defineProperty(performance,'now',{configurable:true,value:()=>input});
      try{document.querySelector('.dsHeroContent').dispatchEvent(wheel);}
      finally{if(ownNow)Object.defineProperty(performance,'now',ownNow);else delete performance.now;}
      return new Promise(resolve=>requestAnimationFrame(time=>resolve({display,input,time,y:scrollY,consumed:wheel.defaultPrevented})));
    });
    assert(first.consumed,'the real catalog wheel controller owns the gesture');
    assert(first.input-first.display>2&&first.input-first.display<40,'exercise a fresh inter-frame input phase');
    const reference=360*(1-Math.exp(-6*(first.time-first.display)/1000));
    assert(Math.abs(first.y-reference)<=1,'first visible movement must match the reference display-frame damping instead of waiting from the later wheel event');
  }finally{await browser.close();}
});

for(const width of [1280,390])test(width+'px short details keep keyboard scrolling off the catalog',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  const page=await catalog(browser,{viewport:{width,height:900},hasTouch:width<500,isMobile:width<500,
   detailHTML:'<article class="svTitleDetails"><h1>Short details</h1><p>A loading or error panel fits without scrolling.</p></article>'});
  await page.emulateMedia({reducedMotion:'reduce'});
  const before=await page.evaluate(async()=>{await document.fonts.ready;SwiflyMotion.stop();scrollTo({top:240,behavior:'instant'});await new Promise(requestAnimationFrame);return scrollY;});
  await page.evaluate(()=>SwiflyDetails.open('/movie/100',document.querySelector('.dsHeroActions a')));
  assert(await page.locator('.svDetailViewport').evaluate(node=>node.scrollHeight<=node.clientHeight+1),'exercise a sheet with no scrollable overflow');
  await page.locator('.svDetailDismiss').focus();
  for(const key of ['PageDown','End','Home']){await page.keyboard.press(key);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>scrollY),before,key+' must not scroll the locked catalog');}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.svDetailDialog').open);
  assert.equal(await page.evaluate(()=>scrollY),before);
 }finally{await browser.close();}
});

for(const width of [820,390])test(width+'px fixed mobile navigation keeps its position and width through details',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  const page=await catalog(browser,{viewport:{width,height:900}});await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>document.fonts.ready);
  const box=()=>page.locator('.mobileNav').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};});
  const before=await box();
  await page.evaluate(()=>SwiflyDetails.open('/movie/100',document.querySelector('.dsHeroActions a')));
  assert.deepEqual(await box(),before,'the modal lock must not expand or recenter the bottom bar');
  await page.evaluate(()=>SwiflyDetails.close());await page.waitForFunction(()=>!document.querySelector('.svDetailDialog').open);
  assert.deepEqual(await box(),before);
  await page.setViewportSize({width:width-20,height:900});
  const resized=await box(),content=await page.evaluate(()=>document.documentElement.clientWidth);
  assert(Math.abs((resized.left+resized.right)/2-content/2)<.5,'the retained frame remains responsive after closing');
 }finally{await browser.close();}
});

test('wheel scrolling does not construct approaching rows or animate invisible button finishes', {skip:!available&&'Chromium is not installed'}, async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await catalog(browser);
  await page.waitForFunction(()=>document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const result=await page.evaluate(async()=>{
   await document.fonts.ready;
   const nextFrame=()=>new Promise(requestAnimationFrame);
   await nextFrame();await nextFrame();
   let added=0;const animated=new Set();
   const observer=new MutationObserver(changes=>{
    for(const change of changes)for(const node of change.addedNodes){
     if(node instanceof Element&&node.matches('.svNavMatchedLens')&&node.closest('.dsRow'))added++;
    }
   });observer.observe(document.body,{subtree:true,childList:true});
   for(let index=0;index<12;index++){
    document.querySelector('.dsHeroContent').dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
    await nextFrame();await nextFrame();
    for(const animation of document.getAnimations())if(animation.effect?.target?.matches('.dsCardQuickActions .dsMiniBtn,.dsRowBtn'))animated.add(animation.transitionProperty||animation.animationName);
   }
   observer.disconnect();
   return {added,animated:[...animated],y:scrollY};
  });
  assert(result.y>500,'the measurement must cross catalog rows');
  assert.equal(result.added,0,'approaching rows must not build controls on scrolling frames');
  assert.deepEqual(result.animated,[],'hidden button colors and borders must not run hundreds of transitions');
  await page.waitForFunction(()=>!document.documentElement.dataset.svCardScrolling&&!document.documentElement.dataset.svScrollGlass);
  await page.waitForFunction(()=>document.querySelectorAll('.svCatalogRow .svNavMatchedLens').length>56);
 }finally{await browser.close();}
});

for (const width of [1280,390]) test(width+'px catalog keeps its scroll geometry stable as distant rows render', {skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await catalog(browser,{viewport:{width,height:900},hasTouch:width<500,isMobile:width<500});
  await page.waitForFunction(renderer=>document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer===renderer,width<500?'blur':'svg');
  if(width<500){
   const material=await page.evaluate(()=>({raw:SwiflyStudio.getRawSettings().glass,effective:SwiflyStudio.getSettings().glass,blur:SwiflyStudio.getSettings().glassBlur,filter:getComputedStyle(document.querySelector('.netflixNav > .svLiquidPane')).backdropFilter}));
   assert.equal(material.raw,'liquid','mobile balancing must preserve the saved glass choice');
   assert.equal(material.effective,'subtle','Auto uses the balanced mobile material');
   assert(material.blur<=12,'mobile glass keeps its bounded blur');assert.match(material.filter,/blur\(/);
  }
  const heights=await page.evaluate(async()=>{
   await document.fonts.ready;
   const heights=[document.documentElement.scrollHeight];
   for(const top of [600,1000,1500,2000,2500]){
    SwiflyMotion.stop();window.scrollTo({top,behavior:'instant'});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    heights.push(document.documentElement.scrollHeight);
   }
   return heights;
  });
  assert(Math.max(...heights)-Math.min(...heights)<2,'Rendering the next row must not shrink the page under an active scroll: '+JSON.stringify(heights));
 }finally{await browser.close();}
});

test('distant catalog controls defer their panes and prime immediately for keyboard focus',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await catalog(browser);
  await page.waitForFunction(()=>document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const last=page.locator('.svCatalogRow').last();
  assert.equal(await last.locator('.svNavMatchedLens').count(),0,'Distant rows must not build hidden optical controls at startup');
  await last.locator('.dsMiniBtn').first().focus();
  await page.waitForFunction(()=>document.activeElement?.querySelector('.svCardActionLens')?.dataset.swiflyRenderer==='blur');
  assert.equal(await last.locator('.dsCardQuickActions').first().evaluate(n=>getComputedStyle(n).opacity),'1');
  // Focus primes the lens synchronously, before the browser starts its native
  // scroll into view. Wait for that scroll as well as the glass to settle.
  await page.waitForFunction(()=>{
   const box=document.activeElement.getBoundingClientRect();
   return box.top>=0&&box.bottom<=innerHeight&&!document.documentElement.dataset.svScrollGlass&&!document.documentElement.dataset.svCardScrolling;
  });
  assert.match(await last.locator('.dsMiniBtn').first().evaluate(n=>getComputedStyle(n.querySelector('.svNavMatchedLens')).backdropFilter),/blur\(10px\)/);
 }finally{await browser.close();}
});

test('featured artwork uses a bounded image on phones and preserves full resolution on wide screens',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await catalog(browser,{viewport:{width:390,height:900}});
  for(const [width,size] of [[390,'w780'],[1280,'w1280'],[1920,'original']]){
   await page.setViewportSize({width,height:900});
   const image=await page.locator('.dsHeroBg').evaluate(n=>getComputedStyle(n).backgroundImage);
   assert(image.includes('/'+size+'/'),'Artwork should match the display size: '+width+'px '+image);
  }
 }finally{await browser.close();}
});

test('the real catalog shell eases wheel input without changing its glass and preserves native modal scrolling', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    await page.waitForFunction(() => document.documentElement.classList.contains('lenis') &&
      document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer === 'svg');
    await page.evaluate(() => {
      window.__wheelPositions = [];
      const native = window.scrollTo.bind(window);
      window.scrollTo = options => {window.__wheelPositions.push(options.top); return native(options);};
    });
    const initial = await page.evaluate(() => {
      const event = new WheelEvent('wheel', {deltaY:240, bubbles:true, cancelable:true});
      document.querySelector('.dsHeroContent').dispatchEvent(event);
      return {consumed:event.defaultPrevented, y:scrollY};
    });
    assert(initial.consumed); assert.equal(initial.y, 0, 'the wheel starts a glide without an immediate page jump');
    await page.waitForFunction(() => scrollY > 1 && scrollY < 235);
    await page.waitForFunction(() => scrollY === 240 && !document.documentElement.classList.contains('lenis-smooth'));
    const positions = await page.evaluate(() => window.__wheelPositions);
    assert(positions.length >= 5, 'a wheel notch is spread over rendered frames');
    assert(positions.every((y, index) => index === 0 || y >= positions[index - 1]), 'a single glide never jitters backward');

    await page.mouse.move(1220, 430);
    for (let index = 0; index < 4; index++) await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => scrollY === 640 && !document.documentElement.classList.contains('lenis-smooth'));
    await page.mouse.wheel(0, -160);
    await page.waitForFunction(() => scrollY === 480 && !document.documentElement.classList.contains('lenis-smooth'));
    assert.equal(await page.locator('.netflixNav > .svLiquidPane').evaluate(node => node.dataset.swiflyRenderer), 'svg');
    assert.match(await page.locator('.netflixNav > .svLiquidPane').evaluate(node => getComputedStyle(node).backdropFilter), /url\(/);
    assert.equal(await page.locator('.dsHero').evaluate(node => node.style.getPropertyValue('--sv-hero-offset')), '');

    await page.evaluate(() => {
      window.SwiflyMotion.stop();
      const dialog = document.createElement('dialog');
      dialog.id = 'scrollTestDialog';
      dialog.style.cssText = 'padding:20px;width:600px;height:400px';
      dialog.innerHTML = '<div id="scrollTestViewport" style="height:300px;overflow-y:auto"><div style="height:3000px">Movie details</div></div>';
      document.body.append(dialog); dialog.showModal();
    });
    await page.locator('#scrollTestViewport').hover();
    await page.mouse.wheel(0, 240);
    await page.waitForFunction(() => document.querySelector('#scrollTestViewport').scrollTop >= 200);
    assert.equal(await page.evaluate(() => scrollY), 480, 'modal wheel input cannot move the background page');
    await page.evaluate(() => {document.querySelector('#scrollTestDialog').close(); document.querySelector('#scrollTestDialog').remove();});
    await page.mouse.move(1220, 430); await page.mouse.wheel(0, 120);
    await page.waitForFunction(() => scrollY === 600 && !document.documentElement.classList.contains('lenis-smooth'));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis-smooth')), false, 'the engine settles after returning from the dialog');
  } finally {await browser.close();}
});

test('real diagonal wheel input eases the page through intermediate positions', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    await page.waitForFunction(() => document.documentElement.classList.contains('lenis'));
    await page.evaluate(() => {
      window.__diagonalPositions = [];
      const native = window.scrollTo.bind(window);
      window.scrollTo = options => {window.__diagonalPositions.push(options.top); return native(options);};
    });
    await page.mouse.move(1220, 430);
    await page.mouse.wheel(140, 120);
    await page.waitForFunction(() => scrollY === 120 && !document.documentElement.classList.contains('lenis-smooth'));
    const positions = await page.evaluate(() => window.__diagonalPositions);
    assert(positions.some(y => y > 0 && y < 119), 'diagonal input must glide instead of falling back to an instant native jump');
    assert.equal(await page.evaluate(() => scrollX), 0, 'vertical page input cannot move the page sideways');
  } finally {await browser.close();}
});

test('mixed-axis horizontal rail input reaches the movie row', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    const rail = page.locator('.movieRail').first();
    await rail.scrollIntoViewIfNeeded();
    await rail.hover({position:{x:300, y:100}});
    await page.mouse.wheel(160, 20);
    await page.waitForFunction(() => document.querySelector('.movieRail').scrollLeft >= 150, null, {timeout:1500});
  } finally {await browser.close();}
});

test('invisible poster actions skip backdrop work and retain glass on hover and keyboard focus', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    const artwork = page.locator('.dsCardArtwork').first();
    await artwork.scrollIntoViewIfNeeded();
    await page.mouse.move(1260, 30);
    const pane = artwork.locator('.dsCardQuickActions .svLiquidPane').first();
    await pane.waitFor({state:'attached'});
    assert.equal(await pane.evaluate(node => getComputedStyle(node).backdropFilter), 'none', 'opacity-hidden buttons must not keep rendering blur filters');
    assert.equal(await artwork.locator('.dsPlayDot').evaluate(node => getComputedStyle(node).backdropFilter), 'none');
    await artwork.hover();
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svCardActionLens')?.dataset.swiflyRenderer === 'blur');
    assert.match(await pane.evaluate(node => getComputedStyle(node).backdropFilter), /blur\(10px\)/, 'hovered actions retain dark native frost');
    await page.mouse.move(1260, 30);
    assert.equal(await pane.evaluate(node => getComputedStyle(node).backdropFilter), 'none');
    await artwork.locator('.dsThumb').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.dsCardQuickActions')), true, 'quick actions stay reachable by keyboard');
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svCardActionLens')?.dataset.swiflyRenderer === 'blur');
    assert.match(await pane.evaluate(node => getComputedStyle(node).backdropFilter), /blur\(10px\)/, 'focused actions retain the same dark frost');
    const materials=await artwork.evaluate(art=>{
      const controls=[...art.querySelectorAll('.dsMiniBtn')];
      const panes=controls.map(control=>control.querySelector('.svCardActionLens'));
      art.querySelector('[data-watch-id]').click();art.querySelector('[data-like-id]').click();
      return controls.map((control,index)=>{const pane=control.querySelector('.svCardActionLens'),s=getComputedStyle(panes[index]);return {samePane:pane===panes[index],pressed:control.getAttribute('aria-pressed'),fill:s.backgroundColor,filter:s.backdropFilter,graphs:panes[index].querySelectorAll('svg').length};});
    });
    for(const material of materials){assert(material.samePane,'Save and Like must update their labels without replacing the native glass');assert.equal(material.fill,'rgba(10, 13, 17, 0.82)');assert.match(material.filter,/blur\(10px\)/);assert.equal(material.graphs,0);}
    assert.deepEqual(materials.slice(1).map(material=>material.pressed),['true','true'],'both selected icons reflect their real saved state');
    for(const preference of ['subtle','off','liquid']){
      await page.evaluate(value=>document.body.dataset.stGlass=value,preference);
      const material=await pane.evaluate(node=>{const style=getComputedStyle(node),host=getComputedStyle(node.parentElement);return {display:style.display,fill:style.backgroundColor,host:host.backgroundColor,graphs:node.querySelectorAll('svg').length};});
      assert.equal(material.graphs,0,'poster actions stay native in every appearance preference');
      if(preference==='off')assert.equal(material.host,'rgb(16, 19, 24)');
      else{assert.notEqual(material.display,'none');assert.equal(material.fill,'rgba(10, 13, 17, 0.82)');}
    }
    await page.waitForFunction(()=>document.querySelector('.netflixNav > .svLiquidPane').dataset.swiflyRenderer==='svg');
    assert.match(await page.locator('.netflixNav > .svLiquidPane').evaluate(node => getComputedStyle(node).backdropFilter), /url\(/, 'navigation refraction remains active');
  } finally {await browser.close();}
});

test('visible quick actions retain glass in a narrow desktop catalog', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser, {viewport:{width:800, height:900}});
    const artwork = page.locator('.dsCardArtwork').first();
    await artwork.scrollIntoViewIfNeeded();
    await page.mouse.move(790, 30);
    const actions = artwork.locator('.dsCardQuickActions');
    const pane = actions.locator('.svLiquidPane').first();
    await pane.waitFor({state:'attached'});
    assert.equal(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), true);
    assert.equal(await actions.evaluate(node => getComputedStyle(node).opacity), '1', 'narrow desktop controls are visible without hover');
    assert.notEqual(await pane.evaluate(node => getComputedStyle(node).backdropFilter), 'none', 'visible quick actions keep their glass while idle');
    assert.equal(await artwork.locator('.dsPlayDot').evaluate(node => getComputedStyle(node).backdropFilter), 'none', 'the hidden play overlay still skips its filter');
  } finally {await browser.close();}
});

test('movie actions stay visible and clickable during a wheel glide without rebuilding their lenses', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    const artwork = page.locator('.dsCardArtwork').first();
    await artwork.scrollIntoViewIfNeeded();
    await artwork.hover();
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svCardActionLens')?.dataset.swiflyRenderer === 'blur');
    const result = await artwork.evaluate(art => {
      const actions = art.querySelector('.dsCardQuickActions');
      const button = actions.querySelector('button');
      const lens = button.querySelector('.svLiquidPane');
      const pane = lens;
      let clicked = false;
      button.addEventListener('click', event => {event.preventDefault();event.stopImmediatePropagation();clicked = true;}, {once:true});
      art.dispatchEvent(new WheelEvent('wheel', {deltaY:80,bubbles:true,cancelable:true}));
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      hit?.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
      return {scrolling:document.documentElement.dataset.svCardScrolling,
        opacity:getComputedStyle(actions).opacity, clickable:clicked,
        backdrop:getComputedStyle(lens).backdropFilter, samePane:pane === button.querySelector('.svLiquidPane'),graphs:actions.querySelectorAll('.svLiquidPane svg').length,fill:getComputedStyle(lens).backgroundColor};
    });
    assert.equal(result.scrolling, 'true', 'exercise the live scrolling state');
    assert.equal(result.opacity, '1', 'hover controls must not disappear during scrolling');
    assert(result.clickable, 'a visible quick action must receive a real hit-tested click');
    assert.match(result.backdrop, /blur\(10px\)/, 'moving controls retain the same native material');
    assert(result.samePane, 'the same native pane survives the gesture');assert.equal(result.graphs,0);
    assert.equal(result.fill,'rgba(10, 13, 17, 0.82)');
    await page.waitForFunction(() => !document.documentElement.classList.contains('lenis-smooth'));
  } finally {await browser.close();}
});

test('poster hover shades with opacity instead of filtering the entire image', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    const artwork = page.locator('.dsCardArtwork').first();
    await artwork.scrollIntoViewIfNeeded();
    await artwork.hover();
    const style = await artwork.locator('.dsThumb').evaluate(poster => ({
      filter:getComputedStyle(poster).filter,
      transition:getComputedStyle(poster).transitionProperty,
      shadeDisplay:getComputedStyle(poster, '::after').display,
      shadeTransition:getComputedStyle(poster, '::after').transitionProperty,
      shadeWidth:parseFloat(getComputedStyle(poster, '::after').width),
      posterWidth:poster.getBoundingClientRect().width
    }));
    assert.equal(style.filter, 'none', 'a parked pointer must not create a full-poster filter layer');
    assert.doesNotMatch(style.transition, /filter/, 'crossing posters cannot schedule image filter transitions');
    assert.notEqual(style.shadeDisplay, 'none', 'keep the hover shading visible');
    assert.equal(style.shadeTransition, 'opacity');
    assert(Math.abs(style.shadeWidth - style.posterWidth) < .05, 'the shade covers the whole poster rather than a legacy shimmer strip');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await artwork.locator('.dsThumb').evaluate(poster =>
      getComputedStyle(poster, '::after').transitionDuration), '0s', 'reduced motion skips the new hover fade');
  } finally {await browser.close();}
});

test('the real touch catalog keeps OS scrolling and all glass surfaces', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser, {viewport:{width:390, height:844}, isMobile:true, hasTouch:true});
    await page.waitForFunction(() => !!window.SwiflyPremiumScroll && !!window.SwiflyMotion);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis')), false);
    assert.equal(await page.evaluate(() => {
      const event = new WheelEvent('wheel', {deltaY:120, bubbles:true, cancelable:true});
      document.querySelector('main').dispatchEvent(event); return event.defaultPrevented;
    }), false, 'touch devices never acquire desktop wheel smoothing');
    assert.equal(await page.locator('.mobileNav > .svLiquidPane').count(), 1, 'the touch navigation keeps its optical pane');
  } finally {await browser.close();}
});

for (const width of [390, 1440, 1920]) test(`catalog dates fit completely inside painted rows at ${width}px`, {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser, {viewport:{width, height:960}});
    for (const variant of [{layout:'default', density:'comfy'}, {layout:'default', density:'compact'}, {layout:'posterwall', density:'comfy'}]) {
      await page.evaluate(({layout, density}) => {
        document.body.dataset.stLayout = layout; document.body.dataset.stDensity = density;
        document.body.style.setProperty('--sv-poster-width', density === 'compact' ? 'clamp(126px,12vw,174px)' : 'clamp(150px,14vw,210px)');
      }, variant);
      const row = page.locator('.svCatalogRow').first();
      await row.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await row.evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return {top:bounds.top, bottom:bounds.bottom, containment:getComputedStyle(node).contain,
          dates:[...node.querySelectorAll('.dsCardMeta')].map(meta => {
            const rect = meta.getBoundingClientRect(); return {text:meta.textContent, top:rect.top, bottom:rect.bottom, height:rect.height};
          })};
      });
      assert.match(result.containment,/paint|content/,'each row keeps its paint boundary');
      assert.equal(result.dates.length, 18);
      for (const date of result.dates) {
        assert(date.height >= 12, 'date glyphs retain their full line height');
        assert(date.top >= result.top && date.bottom <= result.bottom + .5,
          `${variant.layout}/${variant.density}: ${date.text} must not extend beyond the row's paint clip (${date.bottom} > ${result.bottom})`);
      }
    }
  } finally {await browser.close();}
});


for(const layout of [{name:'Desktop',width:1280},{name:'Mobile',width:800},{name:'Welcome',width:1280,welcome:true}])
test(layout.name+' navigation and featured actions keep their liquid glass throughout wheel motion', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser,{viewport:{width:layout.width,height:900},welcome:layout.welcome});
    await page.waitForFunction(() => [...document.querySelectorAll('.netflixNav > .svLiquidPane,.mobileNav > .svLiquidPane,.dsWelcomeNav > .svLiquidPane,.dsHeroActions .svNavMatchedLens,.dsWelcomeActions .svNavMatchedLens,.dsHeroMuteToggle .svNavMatchedLens')]
      .filter(node=>node.getClientRects().length).every(node=>node.dataset.swiflyRenderer==='svg'));
    const result = await page.evaluate(welcome => {
      const panes=[...document.querySelectorAll('.netflixNav > .svLiquidPane,.mobileNav > .svLiquidPane,.dsWelcomeNav > .svLiquidPane')].filter(node=>node.getClientRects().length);
      const original=panes.map(node=>({filter:getComputedStyle(node).backdropFilter,fill:getComputedStyle(node).backgroundColor,graph:node.querySelector('svg')}));
      const actions=[...document.querySelectorAll(welcome?'.dsWelcomeActions .svNavMatchedLens':'.dsHeroActions .svNavMatchedLens,.dsHeroMuteToggle .svNavMatchedLens')];
      const actionOriginal=actions.map(node=>({filter:getComputedStyle(node).backdropFilter,fill:getComputedStyle(node).backgroundColor,graph:node.querySelector('svg')}));
      const wheel = new WheelEvent('wheel', {deltaY:260,bubbles:true,cancelable:true});
      document.querySelector(welcome?'.dsWelcomeHeroCopy':'.dsHeroContent').dispatchEvent(wheel);
      return {consumed:wheel.defaultPrevented,soft:document.documentElement.dataset.svScrollGlass,
        navs:panes.map((node,index)=>({full:original[index].filter,moving:getComputedStyle(node).backdropFilter,fill:original[index].fill,movingFill:getComputedStyle(node).backgroundColor,sameGraph:node.querySelector('svg')===original[index].graph})),
        actions:actions.map((node,index)=>({full:actionOriginal[index].filter,moving:getComputedStyle(node).backdropFilter,fill:actionOriginal[index].fill,movingFill:getComputedStyle(node).backgroundColor,sameGraph:node.querySelector('svg')===actionOriginal[index].graph}))};
    },Boolean(layout.welcome));
    assert(result.consumed,'exercise the real weighted wheel handler');
    assert.equal(result.soft,'soft','content controls retain their scroll optimization');
    assert(result.navs.length>0,'exercise a visible navigation surface');
    assert(result.actions.length>=2,'exercise all featured actions');
    for(const surface of [...result.navs,...result.actions]){
      assert.match(surface.full,/url\(/,'initial glass uses real liquid refraction');
      assert.equal(surface.moving,surface.full,'scrolling must not replace the navigation or featured filter');
      assert.equal(surface.movingFill,surface.fill,'scrolling must not change the navigation or featured tint');
      assert(surface.sameGraph,'the original lens remains mounted throughout the gesture');
    }
    await page.waitForFunction(() => !document.documentElement.dataset.svScrollGlass, null,{timeout:4500});
    const settled=await page.locator(layout.welcome?'.dsWelcomeActions .svNavMatchedLens':'.dsHeroActions .svNavMatchedLens,.dsHeroMuteToggle .svNavMatchedLens').evaluateAll(nodes=>nodes.map(node=>({filter:getComputedStyle(node).backdropFilter,fill:getComputedStyle(node).backgroundColor})));
    assert.deepEqual(settled,result.actions.map(action=>({filter:action.full,fill:action.fill})),'settling must not switch the featured material back on');
  } finally {await browser.close();}
});

test('mobile header and dock keep navigation, search and account controls reachable by touch', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [320,390,820]){
      const page=await catalog(browser,{viewport:{width,height:844},isMobile:true,hasTouch:true});
      await page.emulateMedia({reducedMotion:'reduce'});
      const geometry=await page.evaluate(()=>{
        const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        return {width:innerWidth,overflow:document.documentElement.scrollWidth,header:box(document.querySelector('.netflixNav')),
          tabs:[...document.querySelectorAll('.mobileNav > a')].map(node=>({...box(node),href:node.getAttribute('href'),icon:!!node.querySelector('svg'),current:node.getAttribute('aria-current')})),
          search:box(document.querySelector('#svNavSearchToggle')),account:box(document.querySelector('.dsProfileMenu > summary'))};
      });
      assert.equal(geometry.overflow,width,'the shell must fit the phone without sideways page scroll');
      assert(geometry.header.left>=12&&geometry.header.right<=width-12,'the floating header needs breathing room at both edges');
      assert.deepEqual(geometry.tabs.map(tab=>tab.href),['/','/movies','/tv','/trending','/my-list','/study']);
      assert.equal(geometry.tabs[0].current,'page');
      for(const target of [...geometry.tabs,geometry.search,geometry.account]){
        assert(target.width>=44&&target.height>=44,'mobile controls must offer a full 44px touch target: '+JSON.stringify(target));
      }
      assert(geometry.tabs.every(tab=>tab.icon),'each bottom destination must be recognizable by its icon and label');
      await page.locator('#svNavSearchToggle').tap();
      await page.waitForFunction(()=>document.activeElement?.id==='svNavSearchInput');
      const search=await page.locator('#svNavSearchPopup').boundingBox();
      assert(search.x>=8&&search.x+search.width<=width-8,'expanded search must stay inside the screen');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#svNavSearchToggle').getAttribute('aria-expanded'),'false');
      await page.locator('.dsProfileMenu > summary').tap();
      const account=await page.locator('.dsProfileDropdown').boundingBox();
      assert(account.x>=8&&account.x+account.width<=width-8,'the account menu must remain visible beside the compact header');
      const audit=await page.evaluate(()=>{
        const panel=document.querySelector('.dsProfileDropdown'),r=panel.getBoundingClientRect();
        const links=[...panel.querySelectorAll(':scope > a[href]')];
        const logout=panel.querySelector('.dsDropdownLogout');
        const close=panel.querySelector('.svAccountMenuClose');
        return {
          bottom:r.bottom,viewport:innerHeight,client:panel.clientHeight,scroll:panel.scrollHeight,
          labels:[...panel.querySelectorAll('.svAccountGroup>summary')].map(n=>n.textContent.trim()),
          smallestLink:Math.min(...links.map(n=>n.getBoundingClientRect().height)),
          logoutWrap:logout?getComputedStyle(logout).whiteSpace:null,
          closeVisible:!!close&&getComputedStyle(close).display!=='none',
          outsideNavbar:panel.parentElement===document.body,
          fullyOpaque:getComputedStyle(panel).backgroundColor.startsWith('rgb('),
          noGlass:getComputedStyle(panel).backdropFilter==='none'&&!panel.querySelector(':scope > .svLiquidPane'),
          scrimVisible:!!document.querySelector('body > .svMobileAccountScrim')&&getComputedStyle(document.querySelector('body > .svMobileAccountScrim')).display!=='none',
          horizontalFit:r.left>=8&&r.right<=innerWidth-8,
          cssPosition:getComputedStyle(panel).position
        };
      });
      assert(audit.bottom<=audit.viewport-8,'account sheet must not fall below the phone viewport');
      assert(audit.scroll>=audit.client,'expanded account contents stay inside a bounded sheet');
      assert.deepEqual(audit.labels,['Your library','Watch together','Discover more'],'secondary destinations stay inside compact disclosure groups');
      assert(audit.smallestLink>=44,'every account link must be touch-friendly');
      if(audit.logoutWrap)assert.equal(audit.logoutWrap,'nowrap','log out must stay on one line');
      assert(audit.closeVisible,'account menu must have an explicit close control');
      assert(audit.outsideNavbar,'mobile menu must escape liquid nav containing/stacking contexts');
      assert(audit.fullyOpaque,'menu must have solid matte color independent of backdrop artwork');
      assert(audit.noGlass,'menu must not retain a live optical pane or blur');
      assert(audit.scrimVisible,'screen-level menu must dim the artwork underneath');
      assert(audit.horizontalFit,'account overlay must fit the phone viewport');
      assert.equal(audit.cssPosition,'fixed','account overlay must attach to viewport');
      await page.locator('.svAccountMenuClose').tap();
      assert.equal(await page.locator('.dsProfileMenu').getAttribute('open'),null,'close should restore the browse page');
      await page.locator('.dsProfileMenu > summary').tap();
      const studio=page.locator('.dsProfileDropdown [data-st-open]');
      assert(await studio.isVisible(),'Studio must remain reachable when the mobile header is simplified');
      await studio.tap();
      await page.waitForFunction(()=>document.querySelector('#controlPanel')?.open);
      await page.close();
    }
  }finally{await browser.close();}
});

test('mobile featured copy stays centered with play, details and save on one touch-friendly row', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const [width,height] of [[320,568],[390,844],[430,932],[820,1180]]){
      const page=await catalog(browser,{viewport:{width,height},isMobile:true,hasTouch:true});
      await page.emulateMedia({reducedMotion:'reduce'});
      const layout=await page.evaluate(()=>{
        const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        return {width:innerWidth,hero:box(document.querySelector('.dsHero')),copy:box(document.querySelector('.dsHeroContent')),
          align:getComputedStyle(document.querySelector('.dsHeroContent')).textAlign,
          controls:[...document.querySelectorAll('.dsHeroActions > a,.dsHeroActions > button')].map(box)};
      });
      assert.equal(layout.align,'center','featured metadata and title should share a centered mobile composition');
      assert(Math.abs((layout.copy.left+layout.copy.right)/2-width/2)<1,'copy should be centered inside the artwork');
      assert(layout.controls.every(control=>control.width>=44&&control.height>=44),'featured actions need usable touch targets');
      assert(layout.controls.every(control=>Math.abs(control.top-layout.controls[0].top)<1),'featured actions must fit on one row');
      assert(layout.controls.every(control=>control.left>=16&&control.right<=width-16&&control.bottom<=layout.hero.bottom),'no action can escape the featured artwork');
      await page.close();
    }
  }finally{await browser.close();}
});

test('mobile poster actions stay visible while the rail swipes independently of the page', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [320,390]){
      const page=await catalog(browser,{viewport:{width,height:844},isMobile:true,hasTouch:true});
      await page.emulateMedia({reducedMotion:'reduce'});
      const rail=page.locator('.svCatalogRow .movieRail').first();
      await rail.scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>scrollY),bounds=await rail.boundingBox();
      const client=await page.context().newCDPSession(page);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+width-40,y:bounds.y+90}]});
      for(let step=1;step<=12;step++){
        await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+width-40-step*15,y:bounds.y+90}]});
        await page.waitForTimeout(20); // Deliver the gesture across real compositor frames.
      }
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert(await rail.evaluate(node=>node.scrollLeft>100),'a horizontal touch gesture must advance the movie rail');
      assert(Math.abs(await page.evaluate(()=>scrollY)-before)<2,'a horizontal swipe must not drag the page diagonally');
      const actions=await rail.locator('.movieCard').nth(2).locator('.dsCardQuickActions').evaluate(node=>({opacity:getComputedStyle(node).opacity,
        buttons:[...node.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height,renderer:button.querySelector('.svLiquidPane')?.dataset.swiflyRenderer};})}));
      const fitting=await rail.locator('.movieCard').nth(2).locator('.dsCardArtwork').evaluate(node=>{
        const poster=node.getBoundingClientRect(),actions=node.querySelector('.dsCardQuickActions').getBoundingClientRect();
        return actions.left>=poster.left&&actions.right<=poster.right;
      });
      assert(fitting,'all quick actions must fit inside a narrow poster without crossing into the next title');
      assert.equal(actions.opacity,'1','touch controls cannot depend on hover');
      assert(actions.buttons.every(button=>button.width>=44&&button.height>=44),'save and like actions need usable touch targets');
      assert(actions.buttons.every(button=>button.renderer!=='svg'),'poster actions retain the permanent dark frosted material');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'rail overflow must stay inside the rail');
      await page.close();
    }
  }finally{await browser.close();}
});


test('mobile search and genre grids keep every quick action inside its own poster', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const grid of ['dsGrid','movieGrid']){
      const page=await catalog(browser,{grid,viewport:{width:461,height:844},isMobile:true,hasTouch:true});
      await page.emulateMedia({reducedMotion:'reduce'});
      for(const width of [320,461,500,640,820]){
        await page.setViewportSize({width,height:844});
        // Mobile media queries settle on the rendering frame after a resize.
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const cards=await page.locator('.'+grid+' .dsCardArtwork').evaluateAll(nodes=>nodes.slice(0,6).map(node=>{
          const art=node.getBoundingClientRect(),actions=node.querySelector('.dsCardQuickActions').getBoundingClientRect();
          return {left:art.left,right:art.right,actionsLeft:actions.left,actionsRight:actions.right,
            buttons:[...node.querySelectorAll('.dsMiniBtn')].map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height};})};
        }));
        assert.equal(cards.length,6);
        for(const card of cards){
          assert(card.actionsLeft>=card.left&&card.actionsRight<=card.right,grid+' at '+width+'px must not clip actions or spill onto a neighboring movie: '+JSON.stringify(card));
          assert(card.buttons.every(button=>button.width>=44&&button.height>=44),'grid actions retain usable touch targets');
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'the grid must not create horizontal page overflow');
      }
      await page.close();
    }
  }finally{await browser.close();}
});


test('desktop account dropdown remains opaque over movie artwork without changing navbar glass', {skip:!available&&'Chromium is not installed'}, async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [894,1280]){
      const height=width===894?690:720;
      const page=await catalog(browser,{viewport:{width,height}});
      await page.locator('.dsProfileMenu > summary').click();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dsProfileDropdown')).opacity==='1');
      // The opaque desktop surface forces opacity to 1 during its pop animation.
      // Measure settled targets rather than the animation's temporary scale.
      await page.locator('.dsProfileDropdown').evaluate(async menu=>{
        await Promise.allSettled(menu.getAnimations().map(animation=>animation.finished));
      });
      const state=await page.evaluate(()=>{
        const menu=document.querySelector('.dsProfileDropdown');
        const pane=menu.querySelector(':scope > .svLiquidPane');
        const navPane=document.querySelector('.netflixNav > .svLiquidPane');
        const rect=menu.getBoundingClientRect();
        const css=getComputedStyle(menu);
        return {
          background:css.backgroundColor,
          opacity:css.opacity,
          backdrop:css.backdropFilter,
          bounds:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
          viewport:{width:innerWidth,height:innerHeight},
          lensHidden:!pane||getComputedStyle(pane).display==='none',
          navbarStillGlass:!!navPane&&getComputedStyle(navPane).display!=='none',
          groups:menu.querySelectorAll('.svAccountGroup').length,collapsedGroups:[...menu.querySelectorAll('.svAccountGroup')].every(group=>!group.open),
          canScroll:menu.scrollHeight>menu.clientHeight,
          firstLink:menu.querySelector('a[href]')?.getAttribute('href'),
          logoutWhiteSpace:menu.querySelector('.dsDropdownLogout') ? getComputedStyle(menu.querySelector('.dsDropdownLogout')).whiteSpace : null,
          visibleControls:[...menu.querySelectorAll(':scope > a[href]')].filter(node=>node.getBoundingClientRect().height>=44).length,
          links:menu.querySelectorAll(':scope > a[href]').length,
          parentIsBody:menu.parentElement===document.body
        };
      });
      assert(state.background.startsWith('rgb('),'desktop account surface must be physically opaque: '+JSON.stringify(state));
      assert.equal(state.opacity,'1','account menu should never be faded into hero artwork');
      assert.equal(state.backdrop,'none','account text must not use a backdrop refractive filter');
      assert(state.lensHidden,'account dropdown must not render its own transparent liquid layer');
      assert(state.navbarStillGlass,'top navbar retains its separate liquid glass effect');
      assert(state.bounds.left>=8&&state.bounds.right<=width-8&&state.bounds.top>=0&&state.bounds.bottom<=height-8,
        'desktop account menu must fit visible browser viewport: '+JSON.stringify(state));
      assert.equal(state.groups,3,'library, social and discovery remain easy to find');
      assert(state.collapsedGroups,'the initial menu fits without a long directory of destinations');
      assert(state.visibleControls===state.links,'all menu links need full-size clickable targets');
      if(state.logoutWhiteSpace) assert.equal(state.logoutWhiteSpace,'nowrap','log out should never wrap on desktop');
      assert.equal(state.parentIsBody,false,'the desktop dropdown should stay attached to its details menu');
      await page.locator('.dsProfileMenu > summary').click();
      assert.equal(await page.locator('.dsProfileMenu').getAttribute('open'),null);
      await page.close();
    }
  } finally {await browser.close();}
});
