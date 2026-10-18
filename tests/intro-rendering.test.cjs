'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const available = fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const requiresBrowser = {skip:!available && 'Chromium is not installed'};

async function entry(browser, options = {}, {failController = false, authenticated = true, path = '/'} = {}) {
  const api = loadServer();
  let ready = false;
  try {
    await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + api.httpServer.address().port;
    const items = Array.from({length:18}, (_, index) => ({id:100 + index, title:'Film ' + index,
      backdrop_path:'/scene.jpg', poster_path:'/poster.jpg', release_date:'2026-01-01', vote_average:7.2, overview:'A featured film.'}));
    api.setTmdb(async () => ({results:items}));
    let html; await api.homePage({}, {send(value) {html = value;}});
    const page = await browser.newPage({viewport:{width:1440, height:960}, colorScheme:'dark', ...options});
    await page.addInitScript(authenticated => {
      // Retain the real keyboard navigation code. Only physical controller
      // discovery is unavailable in the Chromium test container.
      const add = window.addEventListener.bind(window);
      window.addEventListener = (type, listener, options) => {
        if (type !== 'gamepadconnected' && type !== 'gamepaddisconnected') add(type, listener, options);
      };
      Object.defineProperty(navigator, 'getGamepads', {value:() => []});
      const back = history.back.bind(history);
      history.back = () => {window.__introBackCalls = (window.__introBackCalls || 0) + 1; back();};
      if (authenticated) {
        localStorage.setItem('swiflytv.session', JSON.stringify({email:'intro@example.test'}));
        localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id:'fixture', name:'Viewer'}));
      }
    }, authenticated);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/') return route.fulfill({body:html, contentType:'text/html'});
      if (url.origin === origin && url.pathname.startsWith('/assets/')) {
        if (failController && url.pathname === '/assets/clean/intro.js') return route.abort();
        return route.continue();
      }
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'image.tmdb.org') return route.fulfill({contentType:'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900"><defs><linearGradient id="sky"><stop stop-color="#21364d"/><stop offset="1" stop-color="#10131f"/></linearGradient></defs><rect width="1500" height="900" fill="url(#sky)"/><circle cx="1100" cy="350" r="180" fill="#49617b"/></svg>'});
      return route.fulfill({body:'', contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain'});
    });
    await page.goto(origin + path, {waitUntil:'domcontentloaded'});
    page.once('close', () => api.io.close());
    ready = true;
    return page;
  } finally {if (!ready) await new Promise(resolve => api.io.close(resolve));}
}

test('the real catalog presents a finite intro, restores keyboard access and does not replay on navigation', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await entry(browser);
    await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running');
    const skip = page.getByRole('button', {name:'Skip intro'});
    assert.equal(await page.locator('.svIntroLetterClip').count(), 8);
    assert.equal(await page.locator('main').evaluate(node => !!node.closest('[inert]')), true);
    assert.equal(await skip.locator('.svLiquidPane').count(), 0, 'the temporary skip action never mounts expensive optics');
    await page.keyboard.press('Tab');
    assert.equal(await skip.evaluate(node => document.activeElement === node), true);
    await page.locator('[data-sv-intro-root]').waitFor({state:'detached', timeout:4000});
    assert.equal(await page.locator('main').evaluate(node => !!node.closest('[inert]')), false);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-sv-intro')), false);
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('[data-sv-intro-root]').count(), 0, 'a second page in the same visit opens directly');
  } finally {await browser.close();}
});

test('a real wheel gesture skips the intro and continues through the weighted scroll engine', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await entry(browser);
    await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running' && document.documentElement.classList.contains('lenis'));
    await page.mouse.move(1400, 450); await page.mouse.wheel(0, 180);
    await page.locator('[data-sv-intro-root]').waitFor({state:'detached', timeout:1000});
    await page.waitForFunction(() => scrollY === 180 && !document.documentElement.classList.contains('lenis-smooth'));
    assert.equal(await page.locator('main').evaluate(node => node.inert), false);
  } finally {await browser.close();}
});

test('the visible skip action and Escape both release the real catalog immediately', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const action of ['click', 'escape']) {
      const page = await entry(browser);
      await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running');
      if (action === 'click') await page.getByRole('button', {name:'Skip intro'}).click();
      else await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-sv-intro-root]').count(), 0);
      assert.equal(await page.locator('main').evaluate(node => node.inert), false);
      assert.equal(await page.evaluate(() => window.__introBackCalls || 0), 0);
      assert.notEqual(await page.evaluate(() => localStorage.getItem('swiflytv.tvFocusMode')), 'true');
      await page.close();
    }
  } finally {await browser.close();}
});

test('the mobile intro fits its viewport and a touch releases the page', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await entry(browser, {viewport:{width:390, height:844}, isMobile:true, hasTouch:true});
    await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running');
    const box = await page.locator('.svIntroWordmark').boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 390);
    const skip = await page.getByRole('button', {name:'Skip intro'}).boundingBox();
    assert(skip.height >= 44 && skip.y + skip.height <= 844);
    await page.touchscreen.tap(195, 400);
    assert.equal(await page.locator('[data-sv-intro-root]').count(), 0);
    assert.equal(await page.locator('main').evaluate(node => node.inert), false);
  } finally {await browser.close();}
});

test('reduced motion and disabled JavaScript expose the catalog without an intro', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const options of [{reducedMotion:'reduce'}, {javaScriptEnabled:false}]) {
      const page = await entry(browser, options);
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-sv-intro')), false);
      assert.equal(await page.locator('main').evaluate(node => node.inert), false);
      assert.equal(await page.locator('[data-sv-intro-root]:not([hidden])').count(), 0);
      await page.close();
    }
  } finally {await browser.close();}
});

test('a failed intro script cannot leave the real page behind a black cover', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await entry(browser, {}, {failController:true});
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-sv-intro'), null, {timeout:4500});
    assert.equal(await page.locator('[data-sv-intro-root]').count(), 0);
    assert.equal(await page.locator('main').evaluate(node => node.inert), false);
  } finally {await browser.close();}
});

test('entry redirects preserve the intro for the destination page', requiresBrowser, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const visit of [{authenticated:false, path:'/'}, {authenticated:true, path:'/welcome'}]) {
      const page = await entry(browser, {}, visit);
      await page.waitForURL(url => url.pathname === (visit.authenticated ? '/profiles' : '/welcome'));
      await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running');
      assert.equal(await page.locator('[data-sv-intro-root]').count(), 1);
      await page.close();
    }
  } finally {await browser.close();}
});
