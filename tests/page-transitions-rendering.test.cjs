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
  const {authenticated = true, storedReduced = false, ...contextOptions} = options;
  const context = await browser.newContext({viewport:{width:1440, height:960}, ...contextOptions});
  await context.addInitScript(({authenticated, storedReduced}) => {
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
    if (storedReduced) localStorage.setItem('swiflytv.appearance', JSON.stringify({version:1, values:{reduceMotion:true}}));
  }, {authenticated, storedReduced});
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
  assert.equal(animation.duration, (await page.evaluate(()=>window.SwiflyStudio.getSettings().transitionSpeed))/1000+'s', 'native navigation follows the configured Studio duration');
  assert.equal(animation.filter, 'none');
  assert.equal(animation.transform, 'none');
}

test('slow native navigation shows a destination skeleton and releases it when the page is ready', requiresBrowser, async()=>{
 const page=await entry();let release,click;
 try{
  assert.equal(await page.locator('.svLoadProgress i').evaluate(n=>getComputedStyle(n).animationName),'none','progress does no work while the page is ready');
  await page.emulateMedia({reducedMotion:'reduce'});
  const gate=new Promise(resolve=>release=resolve);
  await page.route(origin+'/movies',async route=>{await gate;await route.continue();});
  // Start observing before navigation; new Playwright evaluations otherwise wait
  // for the deliberately held document to commit.
  const observed=page.evaluate(()=>new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.documentElement.dataset.svLoading!=='navigate')return;observer.disconnect();const n=document.querySelector('#svSiteLoading'),nav=document.querySelector('.topbar'),link=nav.querySelector('a'),rect=link.getBoundingClientRect();resolve({layout:n.dataset.layout,rect:n.getBoundingClientRect().toJSON(),opacity:getComputedStyle(n).opacity,transition:getComputedStyle(n).transition,nav:getComputedStyle(nav).zIndex,layer:getComputedStyle(n).zIndex,navReachable:!!document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('.topbar'),status:document.querySelector('#svLoadingStatus').textContent,statusVisible:getComputedStyle(document.querySelector('#svLoadingStatus')).clipPath,animation:getComputedStyle(document.querySelector('.svLoadCanvas')).animationName});});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-sv-loading']});}));
  click=page.locator('.netflixLinks a[href="/movies"]').click({noWaitAfter:true});click.catch(()=>{});
  const loading=await observed;
  assert.equal(loading.layout,'catalog');assert.equal(loading.opacity,'1',JSON.stringify(loading));assert(loading.rect.width<=1440);assert(Number(loading.nav)>Number(loading.layer),'the existing glass navigation remains above the skeleton');
  assert.equal(loading.navReachable,true,'navigation links remain reachable through the loading state');assert.equal(loading.status,'Opening Movies');assert.equal(loading.statusVisible,'none','the status is visible on screen');
  assert.equal(loading.animation,'none');
  release();await page.waitForURL(origin+'/movies');await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));assert.equal(await page.locator('body').getAttribute('inert'),null);
 }finally{release?.();await click?.catch(()=>{});await page.context().close();}
});

test('critical content readiness clears loading before optional images finish',requiresBrowser,async()=>{
 const {loadingHead,loadingMarkup}=require('../ui/loading');
 const context=await browser.newContext({viewport:{width:320,height:740}});let releaseCritical,releaseImage;
 const critical=new Promise(resolve=>releaseCritical=resolve),image=new Promise(resolve=>releaseImage=resolve);
 try{
  await context.route(origin+'/api/loading-fixture',async route=>{await critical;await route.fulfill({contentType:'application/json',body:'{}'});});
  await context.route(origin+'/optional-loading-image.svg',async route=>{await image;await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});});
  await context.route(origin+'/audiobooks',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head>'+loadingHead()+'</head><body>'+loadingMarkup()+'<main><img src="/optional-loading-image.svg" alt=""><p id="fixture-content">Waiting for books</p></main><script>const release=window.SwiflySiteLoading.hold("Loading the audiobook library…");fetch("/api/loading-fixture").then(()=>{document.querySelector("#fixture-content").textContent="Books ready";}).finally(release);</script></body></html>'}));
  const page=await context.newPage();await page.goto(origin+'/audiobooks',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('html[data-sv-loading=initial]');
  const state=await page.evaluate(()=>{const root=document.querySelector('#svSiteLoading'),status=document.querySelector('#svLoadingStatus'),bar=document.querySelector('.svLoadProgress i');return {layout:root.dataset.layout,status:status.textContent,statusRect:status.getBoundingClientRect().toJSON(),statusClip:getComputedStyle(status).clipPath,width:document.documentElement.scrollWidth,animation:getComputedStyle(bar).animationIterationCount,progress:document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),books:document.querySelector('.svLoadBooks')?getComputedStyle(document.querySelector('.svLoadBooks')).display:'none',ai:getComputedStyle(document.querySelector('.svLoadDiscovery')).display};});
  assert.equal(state.layout,'books');assert.equal(state.status,'Loading the audiobook library…');assert(state.statusRect.height>10);assert.equal(state.statusClip,'none');assert.equal(state.width,320);assert.equal(state.animation,'infinite','loading reports indeterminate activity');assert.equal(state.progress,null,'no completion percentage is invented');assert.notEqual(state.books,'none');assert.equal(state.ai,'none');
  releaseCritical();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
  assert.equal(await page.locator('#fixture-content').textContent(),'Books ready');assert.equal(await page.evaluate(()=>document.readyState),'interactive','optional images must not hold up critical content');
 }finally{releaseCritical?.();releaseImage?.();await context.close();}
});

test('reduced motion, TV and Xbox keep destination status and use a static activity indicator',requiresBrowser,async()=>{
 const {loadingHead,loadingMarkup}=require('../ui/loading');
 for(const options of [{reducedMotion:'reduce'}, {tv:true}, {xbox:true}, {savedReduced:true}]){
  const {tv,xbox,savedReduced,...contextOptions}=options,context=await browser.newContext({viewport:{width:320,height:740},...contextOptions});
  try{
   await context.route(origin+'/recommendations',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html'+(tv?' data-sv-tv="true"':xbox?' data-sv-xbox="true"':'')+'><head>'+loadingHead()+'</head><body'+(savedReduced?' class="reduceMotion"':'')+'>'+loadingMarkup()+'<script>window.SwiflySiteLoading.hold();</script></body></html>'}));
   const page=await context.newPage();await page.goto(origin+'/recommendations',{waitUntil:'domcontentloaded'});await page.waitForSelector('html[data-sv-loading=initial]');
   const state=await page.evaluate(()=>({layout:document.querySelector('#svSiteLoading').dataset.layout,status:document.querySelector('#svLoadingStatus').textContent,animation:getComputedStyle(document.querySelector('.svLoadProgress i')).animationName,ai:getComputedStyle(document.querySelector('.svLoadDiscovery')).display,books:document.querySelector('.svLoadBooks')?getComputedStyle(document.querySelector('.svLoadBooks')).display:'none',width:document.documentElement.scrollWidth}));
   assert.equal(state.layout,'ai');assert.equal(state.status,'Opening AI Search');assert.equal(state.animation,'none');assert.notEqual(state.ai,'none');assert.equal(state.books,'none');assert.equal(state.width,320);
   await page.keyboard.press('Escape');assert.equal(await page.locator('html').getAttribute('data-sv-loading'),null);
  }finally{await context.close();}
 }
});

test('a trusted click canceled by a later details handler never opens a loading overlay', requiresBrowser, async()=>{
 const page=await entry();try{
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/movie/100';a.id='cancelled-loading-probe';a.textContent='Open test details';a.style.cssText='position:fixed;top:120px;left:30px;z-index:1600';document.body.append(a);document.addEventListener('click',event=>{if(event.target.id==='cancelled-loading-probe')event.preventDefault();});});
  await page.locator('#cancelled-loading-probe').click();await page.waitForTimeout(220);assert.equal(await page.locator('html').getAttribute('data-sv-loading'),null);assert.equal(new URL(page.url()).pathname,'/','details can update their query without loading a new document');
 }finally{await page.context().close();}
});

test('Home, Movies and Series use one finite native dissolve and keep their live glass', requiresBrowser, async () => {
  const page = await entry();
  try {
    assert.equal(await page.locator('[data-sv-intro-root],[data-sv-intro-gate],body[inert]').count(),0,'First entry must open directly without an intro or locked page');
    await navigate(page, '.netflixLinks a[href="/movies"]', '/movies');
    await navigate(page, '.netflixLinks a[href="/tv"]', '/tv');
    // Lens decoding and its render frame can finish after the dissolve.
    await page.waitForFunction(() => document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer === 'svg');
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
    assert.equal(await page.locator('html').getAttribute('data-sv-loading'),null,'a modified click does not put the original tab into loading');
    await tab.close();
  } finally {await page.context().close();}
});

test('native back/forward restores scroll positions without navigation state or scroll writes', requiresBrowser, async () => {
  const {navigationHead} = require('../ui/navigation');
  const {loadingHead,loadingMarkup} = require('../ui/loading');
  const css = fs.readFileSync(path.join(__dirname, '../public/clean/navigation.css'), 'utf8');
  const fixture = http.createServer((request, response) => {
    const next = request.url === '/one' ? '/two' : '/one';
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><head><script>new MutationObserver(()=>{if(["initial","navigate"].includes(document.documentElement.dataset.svLoading))sessionStorage.setItem("loading-revealed","yes");}).observe(document.documentElement,{attributes:true,attributeFilter:["data-sv-loading"]});</script>'+ loadingHead() + navigationHead() + '<style>' + css +
      'html{scroll-behavior:auto}body{margin:0;min-height:4000px;background:#17212e}a{position:fixed;top:20px;color:white}</style></head><body>'+loadingMarkup()+'<a href="' + next + '">Next page</a></body></html>');
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
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('loading-revealed')),null,'fast document readiness never flashes the loading surface');
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
