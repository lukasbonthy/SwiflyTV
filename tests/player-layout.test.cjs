'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const {chromium} = require('playwright-core');
const {playerMarkup, episodePickerMarkup} = require('../ui/player');
const {loadServer} = require('./ui-helpers.cjs');

const executablePath = process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available = fs.existsSync(executablePath || chromium.executablePath()) || (!executablePath && fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell')));
const asset = file => fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
const options = {
  id:'101', type:'tv', title:'A very long series title for a small screen', managed:true,
  season:2, episode:3, episodeCount:8, trailerUrl:'https://example.test/trailer',
  seasons:Array.from({length:6}, (_, index) => ({season_number:index + 1, episode_count:8})),
  episodes:Array.from({length:8}, (_, index) => ({episode_number:index + 1, name:'The next chapter in the story'}))
};
let browser, api;

// Use pageShell's real stylesheet order: component-only CSS misses global nav,
// containment and legacy rules. No media is loaded; these are layout checks.
function documentFor(embedded = false, overrides = {}) {
  const markup = playerMarkup({...options, ...overrides, embedded,
    episodePickerHtml:embedded ? '' : episodePickerMarkup(options)});
  const body = embedded
    ? '<main class="svPartyHub" data-party-media="video"><div class="sv103Player" style="width:min(100%,500px)">' + markup + '</div></main>'
    : markup;
  const dom = new JSDOM(api.pageShell({body, player:!embedded, active:embedded ? 'social' : 'watch'}), {virtualConsole:new VirtualConsole()});
  const d = dom.window.document;
  for (const script of d.querySelectorAll('script')) script.remove();
  for (const link of d.querySelectorAll('link')) {
    const url = new URL(link.href, 'https://swifly.test');
    if (link.rel === 'stylesheet' && url.pathname.startsWith('/assets/')) {
      const style = d.createElement('style');
      style.textContent = asset(url.pathname.slice('/assets/'.length));
      link.replaceWith(style);
    } else link.remove();
  }
  const html = '<!doctype html>' + d.documentElement.outerHTML;
  dom.window.close();
  return html;
}

test.before(async () => {
  if (!available) return;
  api = loadServer();
  browser = await chromium.launch({headless:true, executablePath});
});
test.after(async () => {
  await browser?.close();
  if (api) await new Promise(resolve => api.io.close(resolve));
});

async function open(viewport, embedded = false, overrides = {}) {
  const context = await browser.newContext({viewport, isMobile:viewport.width <= 430, hasTouch:viewport.width <= 430});
  const page = await context.newPage();
  await page.route('**/*', route => route.fulfill({status:200, body:''}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent(documentFor(embedded,overrides));
  await page.addScriptTag({content:asset('player/player.js')});
  await page.evaluate(embedded => {
    const root = document.querySelector('[data-player-root]');
    if (embedded) SwiflyPlayer.mount(root, {managed:true});
    root.dataset.playerState = 'ready';
    root.dataset.playerControlsVisibility = 'visible';
    root.querySelector('[data-player-status]').hidden = true;
    for (const node of root.querySelectorAll('.svPlayerDock button,input')) node.disabled = false;
  }, embedded);
  return {page, context};
}

async function assertMenuReachable(page) {
  const controls = page.locator('.svPlayerSettingsBody button,.svPlayerSettingsBody select');
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    const hit = await control.evaluate(node => {
      const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width >= 44 && r.height >= 44 && (target === node || node.contains(target));
    });
    assert(hit, 'every settings control must be reachable by scrolling and receive pointer input');
  }
}

test('The complete theater and transport fit the page viewport without cropping the film', {skip:!available && 'Chromium is not installed'}, async () => {
  for (const viewport of [
    {width:1911,height:938}, {width:1440,height:900}, {width:1024,height:768}, {width:768,height:1024},
    {width:320,height:568}, {width:390,height:844}, {width:980,height:440}, {width:844,height:390}
  ]) {
    const {page, context} = await open(viewport);
    try {
      const geometry = await page.evaluate(() => {
        const rect = node => {const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};};
        const stage = document.querySelector('[data-player-stage]');
        const nav = document.querySelector('.mobileNav');
        const navBox = nav?.getClientRects().length ? rect(nav) : null;
        const video = stage.querySelector('video');
        return {
          viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth,
          stage:rect(stage), video:rect(video), fit:getComputedStyle(video).objectFit,
          dock:rect(stage.querySelector('.svPlayerDock')), seek:rect(stage.querySelector('[data-player-seek]')),
          availableBottom:navBox ? navBox.top : innerHeight,
          targets:[...stage.querySelectorAll('.svPlayerDockRow > div > .svPlayerControl,.svPlayerDockRow > div > details > summary')]
            .filter(node => node.getClientRects().length).map(rect)
        };
      });
      const label = `${viewport.width}×${viewport.height}`;
      assert(geometry.scrollWidth <= viewport.width + 1, `${label}: page must not overflow horizontally`);
      assert(geometry.stage.left >= -.5 && geometry.stage.right <= geometry.viewport + .5, `${label}: both sides of the theater must stay visible`);
      assert(geometry.stage.bottom <= geometry.availableBottom + .5, `${label}: the entire theater must clear fixed navigation`);
      assert(geometry.dock.bottom <= geometry.availableBottom + .5, `${label}: transport must be visible without page scrolling`);
      if (viewport.height <= 600 && viewport.width > viewport.height) {
        assert(geometry.stage.height >= viewport.height - 120, `${label}: landscape cinema must leave most of the viewport for the picture`);
      }
      assert.equal(geometry.fit, 'contain', `${label}: retain every film edge and its original aspect ratio`);
      assert(Math.abs(geometry.stage.width / geometry.stage.height - 16 / 9) < .015,
        `${label}: a height-limited theater must narrow with the picture instead of adding internal side mattes`);
      assert(geometry.video.left >= geometry.stage.left && geometry.video.right <= geometry.stage.right + .5, `${label}: video bounds must stay inside the stage`);
      assert(geometry.seek.height >= 44, `${label}: seeking needs a 44px touch area`);
      for (const [index, target] of geometry.targets.entries()) {
        assert(target.width >= 44 && target.height >= 44, `${label}: transport targets must be at least 44px`);
        assert(Math.min(target.right, geometry.seek.right) - Math.max(target.left, geometry.seek.left) <= .5 ||
          Math.min(target.bottom, geometry.seek.bottom) - Math.max(target.top, geometry.seek.top) <= .5,
          `${label}: the seek hit area must not overlap transport targets`);
        for (const other of geometry.targets.slice(index + 1)) {
          assert(Math.min(target.right, other.right) - Math.max(target.left, other.left) <= .5 ||
            Math.min(target.bottom, other.bottom) - Math.max(target.top, other.top) <= .5, `${label}: transport targets must not overlap`);
        }
      }
    } finally {await context.close();}
  }
});

test('The ambient artwork dissolves into the canvas at every edge of a bounded wide page', {skip:!available && 'Chromium is not installed'}, async () => {
  const context=await browser.newContext({viewport:{width:2200,height:1100}}),page=await context.newPage();
  try {
    await page.route('**/*',route=>route.fulfill({status:200,body:''}));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setContent(documentFor(false,{backdrop:'https://swifly.test/ambient.jpg'}));
    await page.addStyleTag({content:'.svPlayerPage > :not(.svPlayerAmbient) {visibility:hidden !important;}'});
    const bounds=await page.locator('.svPlayerAmbient').evaluate(async element=>{
      const img=element.querySelector('img');img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><path fill="white" d="M0 0h1600v900H0z"/></svg>');
      await img.decode();const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
    });
    const visible=(await page.screenshot()).toString('base64');
    await page.locator('.svPlayerAmbient').evaluate(element=>element.hidden=true);
    const baseline=(await page.screenshot()).toString('base64');
    const differences=await page.evaluate(async({visible,baseline,bounds})=>{
      const read=async src=>{const img=new Image();img.src='data:image/png;base64,'+src;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.drawImage(img,0,0);return c;};
      const a=await read(visible),b=await read(baseline),{x,y,width:w,height:h}=bounds;
      return [[x+4,y+h/2],[x+w-4,y+h/2],[x+w/2,y+4],[x+w/2,y+h-4],[x+w/2,y+h/2]].map(([px,py])=>{
        const first=a.getImageData(Math.floor(px),Math.floor(py),1,1).data,second=b.getImageData(Math.floor(px),Math.floor(py),1,1).data;
        return Math.max(...[0,1,2].map(i=>Math.abs(first[i]-second[i])));
      });
    },{visible,baseline,bounds});
    assert(differences[4]>10,'The ambient scene must remain visible toward its center');
    assert(differences.slice(0,4).every(value=>value<=2),`Ambient color must reach the canvas before all four layer boundaries, without a rectangular cutoff (${differences})`);
  } finally {await context.close();}
});

test('Player actions and menus use native glass and honor opaque transparency preferences', {skip:!available && 'Chromium is not installed'}, async () => {
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const {page,context}=await open(viewport,false,{type:'movie'});
    try {
      const materials=()=>page.evaluate(()=>[...document.querySelectorAll('.svPlayerAction,.svPlayerBack,.svPlayerPartyButton,.svPlayerPopoverBody,.svPlayerDockGlass')].map(element=>{
        const style=getComputedStyle(element),channels=style.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(',');
        return {name:element.className,alpha:channels?.length===4?Number(channels[3]):1,filter:style.backdropFilter};
      }));
      for(const material of await materials()){
        assert(material.alpha>0&&material.alpha<=.85,`${viewport.width}: ${material.name} must retain a translucent face`);
        assert.match(material.filter,/blur\(/,`${viewport.width}: native glass needs a readable frosted backdrop`);
      }
      await page.evaluate(()=>document.body.dataset.stGlass='off');
      for(const material of await materials()){
        assert.equal(material.alpha,1,`${material.name}: glass-off must be opaque`);
        assert.equal(material.filter,'none',`${material.name}: glass-off must release backdrop filtering`);
      }
      await page.evaluate(()=>delete document.body.dataset.stGlass);
      const session=await context.newCDPSession(page);
      await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
      for(const material of await materials()){
        assert.equal(material.alpha,1,`${material.name}: reduced transparency must be opaque`);
        assert.equal(material.filter,'none',`${material.name}: reduced transparency must release backdrop filtering`);
      }
    } finally {await context.close();}
  }
});

test('Fullscreen fills every viewport edge and keeps playback settings reachable', {skip:!available && 'Chromium is not installed'}, async () => {
  for (const viewport of [{width:844,height:390}, {width:390,height:844}, {width:320,height:240}, {width:1440,height:900}]) {
    const {page, context} = await open(viewport);
    try {
      await page.evaluate(() => {
        const root = document.querySelector('[data-player-root]');
        root.dataset.playerState = 'waiting';
        root.querySelector('[data-player-status]').hidden = false;
      });
      const initialGutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
      await page.locator('[data-player-fullscreen]').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await page.locator('[data-player-stage]').evaluate(stage => {
        const r = stage.getBoundingClientRect(), video = stage.querySelector('video').getBoundingClientRect();
        return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, videoWidth:video.width,
          videoHeight:video.height, viewportWidth:innerWidth, viewportHeight:innerHeight, documentWidth:document.documentElement.clientWidth};
      });
      assert.equal(geometry.width, geometry.viewportWidth, 'fullscreen must fill window.innerWidth, including space reserved by the document scrollbar gutter');
      assert.equal(geometry.height, geometry.viewportHeight, 'compact loading min-height must not overflow fullscreen');
      assert.equal(geometry.left, 0);
      assert.equal(geometry.top, 0);
      assert.equal(geometry.right, geometry.viewportWidth, 'no blank gutter may remain beside the fullscreen picture');
      assert.equal(geometry.bottom, geometry.viewportHeight);
      assert.equal(geometry.videoWidth, geometry.viewportWidth, 'the video must use the complete fullscreen canvas');
      assert(geometry.videoHeight <= geometry.viewportHeight, 'the whole video must fit the fullscreen stage');
      await page.locator('[data-player-settings] > summary').click();
      await page.locator('.svPlayerSettingsBody').waitFor({state:'visible'});
      const menu = await page.locator('.svPlayerSettingsBody').evaluate(panel => {
        const r = panel.getBoundingClientRect();
        return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, viewportWidth:innerWidth, viewportHeight:innerHeight,
          closeHeight:panel.querySelector('button').getBoundingClientRect().height};
      });
      assert(menu.left >= 0 && menu.right <= menu.viewportWidth && menu.top >= 0 && menu.bottom <= menu.viewportHeight, 'settings must fit landscape fullscreen');
      assert(menu.closeHeight >= 44, 'settings dismissal needs a 44px touch target');
      await assertMenuReachable(page);
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter), initialGutter,
        'exiting fullscreen must restore the page scrollbar reservation');
    } finally {await context.close();}
  }
});

test('A shared player fills its narrow host and keeps settings inside the viewport', {skip:!available && 'Chromium is not installed'}, async () => {
  for (const [viewport, fallback] of [
    [{width:320,height:568},false], [{width:390,height:844},false], [{width:1440,height:900},false],
    [{width:320,height:568},true], [{width:1440,height:900},true]
  ]) {
    const {page, context} = await open(viewport, true);
    try {
      const widths = await page.evaluate(() => ({host:document.querySelector('.svPlayerEmbedded').getBoundingClientRect().width,
        stage:document.querySelector('[data-player-stage]').getBoundingClientRect().width}));
      assert(Math.abs(widths.host - widths.stage) < 1, 'shared theater must fill the host without legacy side cutoffs');
      if (fallback) await page.evaluate(() => {
        for (const panel of document.querySelectorAll('.svPlayerPopoverBody')) {
          panel.showPopover = undefined;
          panel.hidePopover = undefined;
        }
      });
      await page.locator('[data-player-settings] > summary').click();
      await page.locator('.svPlayerSettingsBody').waitFor({state:'visible'});
      const menu = await page.locator('.svPlayerSettingsBody').boundingBox();
      assert(menu.x >= 0 && menu.x + menu.width <= viewport.width + .5 && menu.y >= 0 && menu.y + menu.height <= viewport.height, 'shared settings must remain in the viewport');
      await assertMenuReachable(page);
    } finally {await context.close();}
  }
});

test('A playback error remains readable and Retry reachable in very short landscape windows', {skip:!available && 'Chromium is not installed'}, async () => {
  for (const viewport of [{width:640,height:280}, {width:320,height:240}, {width:568,height:320}, {width:844,height:390}]) {
    const {page, context} = await open(viewport);
    try {
      await page.evaluate(async () => {
        const root = document.querySelector('[data-player-root]');
        await SwiflyPlayer.mount(root, {managed:true}).loadSource({status:'error', code:'no_source'});
      });
      const initial = await page.evaluate(() => ({
        titleTop:document.querySelector('[data-player-status-title]').getBoundingClientRect().top,
        stageTop:document.querySelector('[data-player-stage]').getBoundingClientRect().top,
        statusBottom:document.querySelector('[data-player-status]').getBoundingClientRect().bottom,
        dockTop:document.querySelector('.svPlayerDock').getBoundingClientRect().top
      }));
      assert(initial.titleTop >= initial.stageTop, 'the initial error message must not rise above the theater or cover the return link');
      if(viewport.height <= 360 && viewport.width > viewport.height) assert(initial.statusBottom <= initial.dockTop, 'the scrollable error panel must clear the actual tool dock');
      for (const selector of ['[data-player-status-title]', '[data-player-status-copy]', '[data-player-retry]']) {
        const node = page.locator(selector);
        await node.scrollIntoViewIfNeeded();
        const geometry = await node.evaluate(node => {
          const r = node.getBoundingClientRect(), stage = node.closest('[data-player-stage]').getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return {top:r.top, bottom:r.bottom, stageTop:stage.top, stageBottom:stage.bottom, receivesPointer:hit === node || node.contains(hit)};
        });
        assert(geometry.top >= geometry.stageTop && geometry.bottom <= geometry.stageBottom, 'error copy and Retry must be readable inside the theater');
        if (selector === '[data-player-retry]') assert(geometry.receivesPointer, 'Retry must receive input after scrolling the error message');
      }
      for (const selector of ['.svPlayerBack', '[data-player-fullscreen]']) {
        const target = await page.locator(selector).evaluate(node => {
          const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return {width:r.width, height:r.height, top:r.top, bottom:r.bottom, scrollY,
            hit:hit?.className?.baseVal ?? hit?.className, receivesPointer:hit === node || node.contains(hit)};
        });
        assert(target.width >= 44 && target.height >= 44 && target.receivesPointer,
          `${viewport.width}×${viewport.height} ${selector}: the return link and fullscreen control must stay reachable beside the error message (${JSON.stringify(target)})`);
      }
    } finally {await context.close();}
  }
});

test('Mobile episode navigation keeps its glass pane visible while hiding only the text label', {skip:!available && 'Chromium is not installed'}, async () => {
  const {page,context}=await open({width:390,height:844});
  try {
    for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
    const step=page.locator('.svPlayerEpisodeStep').first();await step.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.svPlayerEpisodeStep>.svLiquidPane'));
    const pane=await step.locator(':scope>.svLiquidPane').evaluate(node=>{const r=node.getBoundingClientRect();return {display:getComputedStyle(node).display,width:r.width,height:r.height};});
    assert.notEqual(pane.display,'none','the mobile label rule must not hide the glass pane');
    assert(pane.width>=44&&pane.height>=44,'episode navigation needs a visible 44px glass surface');
  }finally{await context.close();}
});
