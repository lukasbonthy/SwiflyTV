'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const available = fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

async function catalog(browser, options = {}) {
  const api = loadServer();
  let ready = false;
  try {
    await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + api.httpServer.address().port;
    const items = Array.from({length:18}, (_, index) => ({id:100 + index, title:'Film ' + index,
      backdrop_path:'/scene.jpg', poster_path:'/poster.jpg', release_date:'2026-01-01', vote_average:7.2, overview:'A featured film.'}));
    api.setTmdb(async () => ({results:items}));
    let html; await api.homePage({}, {send(value) {html = value;}});
    // Registering gamepad listeners initializes physical device discovery in
    // Chromium 131, which is unavailable in the Linux test container. Retain
    // every other real shell script, asset, catalog row, and optical surface.
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g,
      (tag, code) => code.includes('function swiflyTvFocusNavigation') ? '' : tag);
    const page = await browser.newPage({viewport:{width:1280, height:900}, colorScheme:'dark', ...options});
    await page.addInitScript(() => {
      localStorage.setItem('swiflytv.session', JSON.stringify({email:'scroll@example.test'}));
      localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id:'fixture', name:'Viewer'}));
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/') return route.fulfill({body:html, contentType:'text/html'});
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
  await page.waitForFunction(()=>document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer==='svg');
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
  await page.waitForFunction(()=>document.activeElement?.querySelector('.svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  assert.equal(await last.locator('.dsCardQuickActions').first().evaluate(n=>getComputedStyle(n).opacity),'1');
  await page.waitForFunction(()=>!document.documentElement.dataset.svScrollGlass);
  assert.match(await last.locator('.dsMiniBtn').first().evaluate(n=>getComputedStyle(n.querySelector('.svNavMatchedLens')).backdropFilter),/url\(/);
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
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svLiquidPane')?.dataset.swiflyRenderer === 'svg');
    assert.match(await pane.evaluate(node => getComputedStyle(node).backdropFilter), /url\(/, 'hovered actions retain the full refractive lens');
    await page.mouse.move(1260, 30);
    assert.equal(await pane.evaluate(node => getComputedStyle(node).backdropFilter), 'none');
    await artwork.locator('.dsThumb').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.dsCardQuickActions')), true, 'quick actions stay reachable by keyboard');
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svLiquidPane')?.dataset.swiflyRenderer === 'svg');
    assert.match(await pane.evaluate(node => getComputedStyle(node).backdropFilter), /url\(/, 'focused actions retain the same glass');
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
    await page.waitForFunction(() => document.querySelector('.dsCardQuickActions .svLiquidPane')?.dataset.swiflyRenderer === 'svg');
    const result = await artwork.evaluate(art => {
      const actions = art.querySelector('.dsCardQuickActions');
      const button = actions.querySelector('button');
      const lens = button.querySelector('.svLiquidPane');
      const graph = lens.querySelector('svg');
      let clicked = false;
      button.addEventListener('click', event => {event.preventDefault();event.stopImmediatePropagation();clicked = true;}, {once:true});
      art.dispatchEvent(new WheelEvent('wheel', {deltaY:80,bubbles:true,cancelable:true}));
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      hit?.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
      return {scrolling:document.documentElement.dataset.svCardScrolling,
        opacity:getComputedStyle(actions).opacity, clickable:clicked,
        backdrop:getComputedStyle(lens).backdropFilter, sameGraph:graph === lens.querySelector('svg')};
    });
    assert.equal(result.scrolling, 'true', 'exercise the live scrolling state');
    assert.equal(result.opacity, '1', 'hover controls must not disappear during scrolling');
    assert(result.clickable, 'a visible quick action must receive a real hit-tested click');
    assert.match(result.backdrop, /blur\(4px\)/, 'moving controls use the inexpensive soft-glass tier');
    assert(result.sameGraph, 'an existing lens is cached across the gesture');
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


test('movie catalog uses soft-glass optics during wheel motion and restores the original SVG lens near rest', {skip:!available && 'Chromium is not installed'}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await catalog(browser);
    await page.waitForFunction(() => document.querySelector('.netflixNav > .svLiquidPane')?.dataset.swiflyRenderer === 'svg');
    const result = await page.evaluate(() => {
      const nav = document.querySelector('.netflixNav > .svLiquidPane');
      const full = getComputedStyle(nav).backdropFilter;
      const wheel = new WheelEvent('wheel', {deltaY:260,bubbles:true,cancelable:true});
      document.querySelector('.dsHeroContent').dispatchEvent(wheel);
      return {consumed:wheel.defaultPrevented, soft:document.documentElement.dataset.svScrollGlass,
        full, moving:getComputedStyle(nav).backdropFilter};
    });
    assert(result.consumed);
    assert.match(result.full,/url\(/,'initial navigation must have the real liquid refraction');
    assert.equal(result.soft,'soft');
    assert.match(result.moving,/blur\(4px\)/,'movement should use inexpensive frosted glass rather than the SVG filter');
    await page.waitForFunction(() => !document.documentElement.dataset.svScrollGlass, null,{timeout:4500});
    const restored=await page.locator('.netflixNav > .svLiquidPane').evaluate(node=>getComputedStyle(node).backdropFilter);
    assert.match(restored,/url\(/,'the original full lens returns after deceleration');
    // The separate poster-hover cooldown may still be active when the much
    // earlier near-rest glass transition completes; it is intentionally independent.
  } finally {await browser.close();}
});
