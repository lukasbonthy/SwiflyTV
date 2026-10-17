'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const available = fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

async function catalog(browser, options = {}) {
  const api = loadServer();
  try {
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
      if (url.hostname === 'catalog.test' && url.pathname === '/') return route.fulfill({body:html, contentType:'text/html'});
      if (url.hostname === 'catalog.test' && url.pathname.startsWith('/assets/')) {
        const file = path.join(__dirname, '../public', url.pathname.slice(8));
        if (fs.existsSync(file)) return route.fulfill({path:file});
      }
      if (url.hostname === 'image.tmdb.org') return route.fulfill({contentType:'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#325776"/><circle cx="280" cy="240" r="180" fill="#afc3d7"/></svg>'});
      return route.fulfill({body:'', contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain'});
    });
    await page.goto('http://catalog.test/');
    return page;
  } finally {await new Promise(resolve => api.io.close(resolve));}
}

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
        return {top:bounds.top, bottom:bounds.bottom, visibility:getComputedStyle(node).contentVisibility,
          dates:[...node.querySelectorAll('.dsCardMeta')].map(meta => {
            const rect = meta.getBoundingClientRect(); return {text:meta.textContent, top:rect.top, bottom:rect.bottom, height:rect.height};
          })};
      });
      assert.equal(result.visibility, 'auto', 'offscreen rendering containment stays enabled');
      assert.equal(result.dates.length, 18);
      for (const date of result.dates) {
        assert(date.height >= 12, 'date glyphs retain their full line height');
        assert(date.top >= result.top && date.bottom <= result.bottom + .5,
          `${variant.layout}/${variant.density}: ${date.text} must not extend beyond the row's paint clip (${date.bottom} > ${result.bottom})`);
      }
    }
  } finally {await browser.close();}
});
