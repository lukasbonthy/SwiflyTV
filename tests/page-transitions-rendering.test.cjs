'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const available = fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const requiresBrowser = {skip:!available && 'Chromium is not installed'};
let server, browser, origin;

test.before(async () => {
  if (!available) return;
  server = loadServer();
  const items = Array.from({length:3}, (_, index) => ({id:100 + index, title:'Film ' + index, name:'Series ' + index,
    backdrop_path:'/scene.jpg', poster_path:'/poster.jpg', release_date:'2026-01-01', vote_average:7.2, overview:'A featured film.'}));
  server.setTmdb(async () => ({results:items, total_pages:2, genres:[]}));
  await new Promise(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({headless:true});
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.io.close(resolve));
});

function probe() {
  window.__navigationProbe = {finished:false, reveals:[], shows:[]};
  window.addEventListener('pageshow', event => window.__navigationProbe.shows.push(event.persisted));
  window.addEventListener('pagereveal', event => {
    if (!event.viewTransition) {window.__navigationProbe.finished = true; return;}
    event.viewTransition.ready.then(() => {
      const style = getComputedStyle(document.documentElement, '::view-transition-new(root)');
      window.__navigationProbe.reveals.push({ready:true, name:style.animationName, duration:style.animationDuration,
        filter:style.filter, transform:style.transform});
    }, error => window.__navigationProbe.reveals.push({ready:false, error:error.name}));
    event.viewTransition.finished.then(() => {window.__navigationProbe.finished = true;});
  });
}

async function entry(pathname = '/', options = {}) {
  const {authenticated = true, seenIntro = true, storedReduced = false, ...contextOptions} = options;
  const context = await browser.newContext({viewport:{width:1440, height:960}, ...contextOptions});
  await context.addInitScript(({authenticated, seenIntro, storedReduced}) => {
    // The browser container has no physical gamepad service. Keep the site's
    // keyboard handler and all navigation, scroll and glass scripts intact.
    const add = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type !== 'gamepadconnected' && type !== 'gamepaddisconnected') add(type, listener, options);
    };
    Object.defineProperty(navigator, 'getGamepads', {value:() => []});
    if (authenticated) {
      localStorage.setItem('swiflytv.session', JSON.stringify({email:'navigation@example.test'}));
      localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id:'fixture', name:'Viewer'}));
    }
    if (seenIntro && !sessionStorage.getItem('navigation-fixture-seeded')) sessionStorage.setItem('swiflytv.intro.v2', '1');
    sessionStorage.setItem('navigation-fixture-seeded', '1');
    if (storedReduced) localStorage.setItem('swiflytv.appearance', JSON.stringify({version:1, values:{reduceMotion:true}}));
  }, {authenticated, seenIntro, storedReduced});
  await context.addInitScript(probe);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'image.tmdb.org') return route.fulfill({contentType:'image/svg+xml', body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900"><rect width="1500" height="900" fill="#21364d"/></svg>'});
    return route.fulfill({body:'', contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain'});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  await page.goto(origin + pathname, {waitUntil:'domcontentloaded'});
  return page;
}

async function settled(page) {
  await page.waitForFunction(() => window.__navigationProbe.finished);
  return page.evaluate(() => window.__navigationProbe.reveals);
}

async function navigate(page, selector, pathname) {
  await page.locator(selector).click();
  await page.waitForURL(origin + pathname);
  const records = await settled(page);
  assert(records.some(record => record.ready), pathname + ' should run a native document transition: ' + JSON.stringify(records));
  const animation = records.find(record => record.ready);
  assert.equal(animation.name, 'svNavigationIn');
  assert.equal(animation.duration, '0.32s');
  assert.equal(animation.filter, 'none');
  assert.equal(animation.transform, 'none');
}

test('Home, Movies and Series use one finite native dissolve and keep their live glass', requiresBrowser, async () => {
  const page = await entry();
  try {
    await navigate(page, '.netflixLinks a[href="/movies"]', '/movies');
    await navigate(page, '.netflixLinks a[href="/tv"]', '/tv');
    const state = await page.evaluate(() => {
      const body = getComputedStyle(document.body), scene = getComputedStyle(document.querySelector('.svBrowseScene'));
      const lens = document.querySelector('.netflixNav>.svLiquidPane');
      return {bodyAnimation:body.animationName, bodyOpacity:body.opacity, sceneAnimation:scene.animationName,
        bodyFilter:body.filter, sceneFilter:scene.filter, renderer:lens.dataset.swiflyRenderer,
        backdrop:getComputedStyle(lens).backdropFilter, restoration:history.scrollRestoration,
        intro:document.documentElement.hasAttribute('data-sv-intro')};
    });
    assert.equal(state.bodyAnimation, 'none');
    assert.equal(state.bodyOpacity, '1');
    assert.equal(state.sceneAnimation, 'none');
    assert.equal(state.bodyFilter, 'none');
    assert.equal(state.sceneFilter, 'none');
    assert.equal(state.renderer, 'svg');
    assert.match(state.backdrop, /url\(/, 'the navigation must keep its real SVG refraction');
    assert.equal(state.restoration, 'auto');
    assert.equal(state.intro, false);
  } finally {await page.context().close();}
});

test('account/profile navigation and the public authentication switch share the dissolve', requiresBrowser, async () => {
  const account = await entry('/account');
  try {
    await navigate(account, '.dsAccountCard[href="/profiles"]', '/profiles');
    await navigate(account, '.dsProfilesQuickActions a[href="/profiles/manage"]', '/profiles/manage');
  } finally {await account.context().close();}
  const login = await entry('/login', {authenticated:false});
  try {
    await navigate(login, '.dsAuthSwitch a[href="/signup"]', '/signup');
    await navigate(login, '.dsAuthSwitch a[href="/login"]', '/login');
  } finally {await login.context().close();}
});

test('system and saved reduced motion preserve normal navigation without a dissolve', requiresBrowser, async () => {
  for (const options of [{reducedMotion:'reduce'}, {storedReduced:true}]) {
    const page = await entry('/', options);
    try {
      await page.locator('.netflixLinks a[href="/movies"]').click();
      await page.waitForURL(origin + '/movies');
      assert.equal((await settled(page)).some(record => record.ready), false);
      assert.equal(await page.locator('main').count(), 1);
    } finally {await page.context().close();}
  }
});

test('an unseen intro on the destination takes precedence over a document transition', requiresBrowser, async () => {
  const page = await entry();
  try {
    // Reset the visit marker after the source has opened, forcing the next
    // document to present its intro while both documents otherwise opt in.
    await page.evaluate(() => sessionStorage.removeItem('swiflytv.intro.v2'));
    await page.locator('.netflixLinks a[href="/tv"]').click();
    await page.waitForURL(origin + '/tv');
    await page.waitForFunction(() => document.documentElement.dataset.svIntro === 'running');
    assert.equal((await page.evaluate(() => window.__navigationProbe.reveals)).some(record => record.ready), false);
    await page.getByRole('button', {name:'Skip intro'}).click();
    await navigate(page, '.netflixLinks a[href="/movies"]', '/movies');
    assert.equal(await page.locator('[data-sv-intro-root]').count(), 0);
  } finally {await page.context().close();}
});

test('JavaScript-disabled and modified-click navigation retain normal links', requiresBrowser, async () => {
  const plain = await entry('/login', {authenticated:false, javaScriptEnabled:false});
  try {
    await plain.locator('.dsAuthSwitch a[href="/signup"]').click();
    await plain.waitForURL(origin + '/signup');
    assert.equal(await plain.getByRole('heading', {name:'Create account'}).count(), 1);
  } finally {await plain.context().close();}
  const page = await entry();
  try {
    const opened = page.context().waitForEvent('page');
    await page.locator('.netflixLinks a[href="/movies"]').click({modifiers:['Control']});
    const tab = await opened;
    await tab.bringToFront();
    // Playwright 1.49 can retain about:blank in its cached URL for a routed
    // background tab even after Chrome commits the destination document.
    const session = await page.context().newCDPSession(tab);
    const {frameTree} = await session.send('Page.getFrameTree');
    assert.equal(frameTree.frame.url, origin + '/movies');
    await session.detach();
    assert.equal(new URL(page.url()).pathname, '/');
    await tab.close();
  } finally {await page.context().close();}
});

test('native back/forward restores scroll positions without navigation state or scroll writes', requiresBrowser, async () => {
  const {navigationHead} = require('../ui/navigation');
  const css = fs.readFileSync(path.join(__dirname, '../public/clean/navigation.css'), 'utf8');
  const fixture = http.createServer((request, response) => {
    const next = request.url === '/one' ? '/two' : '/one';
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><head>' + navigationHead() + '<style>' + css +
      'html{scroll-behavior:auto}body{margin:0;min-height:4000px;background:#17212e}a{position:fixed;top:20px;color:white}</style></head><body><a href="' + next + '">Next page</a></body></html>');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.addInitScript(probe);
    const base = 'http://127.0.0.1:' + fixture.address().port;
    await page.goto(base + '/one');
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.locator('a').click();
    await page.waitForURL(base + '/two');
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 350));
    await page.goBack();
    await page.waitForFunction(() => scrollY === 700);
    await settled(page);
    assert.equal(await page.evaluate(() => document.documentElement.attributes.length), 0);
    await page.goForward();
    await page.waitForFunction(() => scrollY === 350);
    assert.equal(await page.evaluate(() => history.scrollRestoration), 'auto');
  } finally {
    await context.close();
    await new Promise(resolve => fixture.close(resolve));
  }
});
