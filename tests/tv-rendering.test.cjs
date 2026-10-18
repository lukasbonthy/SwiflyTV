'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright-core');
const {loadServer} = require('./ui-helpers.cjs');
const available = fs.existsSync(chromium.executablePath());
let api, browser, origin;
test.before(async () => {
  if (!available) return;
  api = loadServer();
  api.setTmdb(async endpoint => {
    const titles = Array.from({length:12}, (_, i) => ({id:101+i,title:i === 0 ? 'Beyond the Northern Lights' : 'Cinema chapter '+(i+1),poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview:'An extraordinary journey across a changing world, where a small team discovers the meaning of home and the stories that connect us.',vote_average:8.2,release_date:'2026-06-01',media_type:'movie'}));
    if (/^\/movie\/\d+$/.test(endpoint)) return {...titles[0],runtime:118,genres:[{id:1,name:'Adventure'}],credits:{cast:[]},videos:{results:[]},recommendations:{results:titles},similar:{results:[]},images:{logos:[]}};
    return {results:titles,total_pages:1};
  });
  await new Promise(resolve => api.httpServer.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:'+api.httpServer.address().port;
  browser = await chromium.launch({headless:true});
});
test.after(async () => {await browser?.close(); if (api) await new Promise(resolve => api.io.close(resolve));});

async function open(viewport, tv = true, controller = false) {
  const context = await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.addInitScript(({tv,controller}) => {
    localStorage.setItem('swiflytv.session', JSON.stringify({email:'tv-layout@example.test'}));
    localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id:'fixture',name:'Viewer'}));
    if(localStorage.getItem('swiflytv.tvFocusMode')===null)localStorage.setItem('swiflytv.tvFocusMode', String(tv));
    const add = window.addEventListener.bind(window);
    window.addEventListener = (type,listener,options) => {if(type !== 'gamepadconnected' && type !== 'gamepaddisconnected') add(type,listener,options);};
    window.__tvLayoutPad={id:'Xbox layout fixture',mapping:'standard',index:0,connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0,0,0]};
    Object.defineProperty(navigator,'getGamepads',{value:() => controller?[window.__tvLayoutPad]:[]});
  }, {tv,controller});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.origin === origin) return route.continue();
    if(route.request().resourceType() === 'image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960"><rect width="640" height="960" fill="#203347"/><circle cx="360" cy="280" r="170" fill="#718492"/></svg>'});
    return route.fulfill({contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain',body:''});
  });
  const page = await context.newPage();
  await page.goto(origin+'/');
  await page.locator('.movieCard .posterWrap').first().waitFor();
  if (tv) await page.waitForFunction(() => document.documentElement.dataset.svTv==='true' && document.body.classList.contains('swifly-tv-focus-mode'));
  return {context,page};
}

for(const viewport of [{width:1280,height:720},{width:1920,height:1080}])test('Xbox guide fits the TV safe frame and leaves selected card captions visible at '+viewport.width+'px',{skip:!available&&'Chromium is not installed'},async()=>{
  const {context,page}=await open(viewport,true,true);
  try{
    await page.locator('.movieCard .posterWrap').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#swiflyTvGuide[data-input="gamepad"]').waitFor({state:'visible'});
    await page.waitForFunction(()=>{const card=document.querySelector('.movieCard:has(.swifly-tv-focus-target)');return card&&getComputedStyle(card.querySelector('.dsCardInfo')).backgroundColor!=='rgba(0, 0, 0, 0)';});
    const geometry=await page.evaluate(()=>{
      const bounds=node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height};};
      const guide=document.getElementById('swiflyTvGuide'),focused=document.querySelector('.movieCard:has(.swifly-tv-focus-target)'),other=[...focused.parentElement.querySelectorAll('.movieCard')].find(card=>card!==focused),caption=focused.querySelector('.dsCardInfo'),heading=focused.closest('.dsRow').querySelector('.svSectionHead h2,.dsRowHead h2');
      return {scrollY,scrollMargin:getComputedStyle(focused).scrollMarginBottom,card:bounds(focused),railScroll:focused.parentElement.scrollTop,nav:bounds(document.querySelector('.netflixNav')),heading:bounds(heading),guide:bounds(guide),caption:bounds(caption),meta:bounds(focused.querySelector('.dsCardMeta')),commands:[...guide.querySelectorAll('.svTvCommand')].map(node=>({...bounds(node),font:parseFloat(getComputedStyle(node).fontSize),client:node.clientWidth,scroll:node.scrollWidth})),selectedBackground:getComputedStyle(caption).backgroundColor,otherBackground:getComputedStyle(other.querySelector('.dsCardInfo')).backgroundColor,rowMarker:{width:parseFloat(getComputedStyle(heading).borderInlineStartWidth),color:getComputedStyle(heading).borderInlineStartColor},posterTransform:getComputedStyle(focused.querySelector('.posterWrap')).transform,pageWidth:document.documentElement.scrollWidth};
    });
    assert(geometry.guide.left>=viewport.width*.035&&geometry.guide.right<=viewport.width*.965,'Controller guide stays within television safe edges: '+JSON.stringify(geometry));
    assert(geometry.guide.height>=68&&geometry.guide.height<=100,'Guide remains compact enough for catalog browsing');
    assert(geometry.guide.bottom<=viewport.height-20,'Guide clears the lower TV safe edge');
    assert(geometry.commands.every(command=>command.font>=17&&command.scroll<=command.client+1&&command.left>=geometry.guide.left&&command.right<=geometry.guide.right),'Every Xbox command remains readable and unclipped');
    assert(geometry.caption.bottom<=geometry.guide.top-14&&geometry.meta.bottom<=geometry.guide.top-14,'Title and year clear the persistent controller guide: '+JSON.stringify(geometry));
    assert(geometry.heading.top>=geometry.nav.bottom+12,'The selected row heading clears fixed navigation: '+JSON.stringify(geometry));
    assert.notEqual(geometry.selectedBackground,geometry.otherBackground,'Selected title has a clear identity beyond its poster outline: '+JSON.stringify(geometry));
    assert(geometry.rowMarker.width>=3&&geometry.rowMarker.color==='rgb(255, 255, 255)','The current row has a visible heading marker');
    assert.equal(geometry.posterTransform,'none','Selection never scales a poster beyond its rail');
    assert(geometry.pageWidth<=viewport.width,'Guide does not introduce horizontal page overflow');
    await page.keyboard.press('ArrowLeft');
    const longCaption=await page.locator('.movieCard').first().locator('.dsCardInfo').evaluate(node=>({bottom:node.getBoundingClientRect().bottom,guideTop:document.getElementById('swiflyTvGuide').getBoundingClientRect().top}));
    assert(longCaption.bottom<=longCaption.guideTop-14,'A selected two-line title also clears the controller guide: '+JSON.stringify(longCaption));
    await page.keyboard.press('F8');
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-tv'));
    await page.locator('#swiflyTvGuide').evaluate(node=>{node.hidden=false;});
    assert.equal(await page.locator('#swiflyTvGuide').evaluate(node=>getComputedStyle(node).display),'none','A retained guide cannot cover the desktop after TV mode is disabled');
  }finally{await context.close();}
});

test('Xbox help keeps readable commands and both actions within a 720p safe frame',{skip:!available&&'Chromium is not installed'},async()=>{
  const {context,page}=await open({width:1280,height:720},true,true);
  try{
    await page.evaluate(()=>{window.__tvLayoutPad.buttons[8]={pressed:true,value:1};});
    await page.locator('#swiflyTvHelp').waitFor({state:'visible'});
    await page.evaluate(()=>{window.__tvLayoutPad.buttons[8]={pressed:false,value:0};});
    const geometry=await page.locator('#swiflyTvHelp').evaluate(node=>{
      const bounds=el=>{const b=el.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height};};
      const focus=document.activeElement,style=getComputedStyle(focus);
      return {...bounds(node),heading:bounds(node.querySelector('h2')),descriptionFont:parseFloat(getComputedStyle(node.querySelector('p')).fontSize),commands:[...node.querySelectorAll('.svTvHelpItem')].map(el=>({...bounds(el),font:parseFloat(getComputedStyle(el.querySelector('span')).fontSize)})),actions:[...node.querySelectorAll('button')].map(bounds),focus:bounds(focus),focusOutset:parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset),client:node.clientWidth,scroll:node.scrollWidth};
    });
    assert(geometry.left>=40&&geometry.right<=1240&&geometry.top>=24&&geometry.bottom<=696,'Help fits the television safe frame: '+JSON.stringify(geometry));
    assert(geometry.descriptionFont>=20&&geometry.commands.every(command=>command.font>=20),'Help can be read from the sofa');
    assert(geometry.heading.top>=geometry.top&&geometry.commands.every(command=>command.top>=geometry.top&&command.bottom<=geometry.bottom),'The controller map is visible without scrolling away its heading: '+JSON.stringify(geometry));
    assert(geometry.actions.length===2&&geometry.actions.every(action=>action.height>=52&&action.top>=geometry.top&&action.bottom<=geometry.bottom),'Continue and Exit TV mode remain visible and usable');
    assert(geometry.focus.top-geometry.focusOutset>=geometry.top+8&&geometry.focus.bottom+geometry.focusOutset<=geometry.bottom-8&&geometry.focus.left-geometry.focusOutset>=geometry.left+8&&geometry.focus.right+geometry.focusOutset<=geometry.right-8,'The complete help action focus ring fits inside its panel: '+JSON.stringify(geometry));
    assert(geometry.scroll<=geometry.client+1,'Help has no horizontal scrolling');
  }finally{await context.close();}
});

for (const viewport of [{width:1920,height:1080},{width:1280,height:720}]) test('TV catalog has safe framing and readable, clearly focused posters at '+viewport.width+'px', {skip:!available && 'Chromium is not installed'}, async () => {
  const {context,page} = await open(viewport);
  try {
    const poster = page.locator('.movieCard .posterWrap').first();
    await poster.focus();
    await page.waitForFunction(() => document.querySelector('.movieCard .posterWrap').classList.contains('swifly-tv-focus-target'));
    const geometry = await page.evaluate(() => {
      const box = node => {const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,top:r.top,bottom:r.bottom};};
      const nav=document.querySelector('.netflixNav'),rail=document.querySelector('.svCatalogRow .movieRail,.dsRow .movieRail'),poster=document.querySelector('.movieCard .posterWrap'),title=document.querySelector('.dsCardTitle');
      return {nav:box(nav),row:box(rail.closest('.dsRow')),rail:box(rail),poster:box(poster),title:{font:parseFloat(getComputedStyle(title).fontSize),whiteSpace:getComputedStyle(title).whiteSpace},meta:parseFloat(getComputedStyle(document.querySelector('.dsCardMeta')).fontSize),outline:getComputedStyle(poster).outlineWidth,outlineStyle:getComputedStyle(poster).outlineStyle,outlineColor:getComputedStyle(poster).outlineColor,quick:getComputedStyle(document.querySelector('.dsCardQuickActions')).display,overflow:document.documentElement.scrollWidth,visible:[...rail.querySelectorAll('.movieCard')].filter(node=>{const b=box(node),r=box(rail);return b.left>=r.left && b.right<=r.right+1;}).length};
    });
    assert(geometry.nav.left >= viewport.width*.035 && geometry.nav.right <= viewport.width*.965,'Navigation stays inside TV safe edges');
    assert(geometry.nav.width >= viewport.width*.87,'Navigation fills the TV safe frame');
    assert(geometry.nav.height >= 68,'Navigation controls are readable from a sofa');
    assert(geometry.rail.left >= viewport.width*.035,'Posters keep TV safe margins');
    assert(geometry.visible >= 4 && geometry.visible <= 5,'A TV rail shows four or five full portrait cards: '+geometry.visible);
    assert(geometry.title.font >= 21 && geometry.meta >= 17,'Card labels and year remain readable');
    assert.notEqual(geometry.title.whiteSpace,'nowrap','Long title labels can wrap');
    assert.equal(geometry.outline,'3px'); assert.equal(geometry.outlineStyle,'solid'); assert.equal(geometry.outlineColor,'rgb(255, 255, 255)');
    assert(geometry.poster.left-8>=geometry.row.left,'The first focus ring fits inside its paint-contained row');
    assert.equal(geometry.quick,'none','TV cards have one clear detail entry');
    assert(geometry.overflow<=viewport.width,'TV catalog has no page-wide horizontal overflow');
    const pill=await page.locator('.svTvModePill').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));
    assert(pill.scroll<=pill.client+1,'TV mode exit label fits inside its header button');
    await page.keyboard.press('ArrowRight');
    const caption=await page.locator('.movieCard').nth(1).locator('.dsCardMeta').evaluate(node=>node.getBoundingClientRect().toJSON());
    assert(caption.bottom<=viewport.height-20,'Remote navigation brings the selected card title and year into view');
  } finally {await context.close();}
});

test('TV detail actions have readable labels and fit above the 720p safe bottom',{skip:!available && 'Chromium is not installed'},async()=>{
  const {context,page}=await open({width:1280,height:720});
  try {
    await page.goto(origin+'/movie/101');
    await page.locator('.svDetailActions .svNavMatchedLabel').first().waitFor();
    const actions=await page.locator('.svDetailActions').evaluate(node=>({bottom:node.getBoundingClientRect().bottom,labels:[...node.querySelectorAll('.svNavMatchedLabel')].map(label=>({font:parseFloat(getComputedStyle(label).fontSize),width:label.clientWidth,scroll:label.scrollWidth}))}));
    assert(actions.bottom<=690,'Primary detail actions fit above TV safe bottom');
    assert(actions.labels.every(label=>label.font>=20),'Actual glass-wrapped action labels are readable from the sofa');
    assert(actions.labels.every(label=>label.scroll<=label.width+1),'Action labels do not clip');
  }finally{await context.close();}
});

test('TV styling leaves desktop sizing intact and restores it immediately when disabled',{skip:!available && 'Chromium is not installed'},async()=>{
  const {context,page}=await open({width:1280,height:720},false);
  try {
    const measure=()=>page.evaluate(()=>({nav:document.querySelector('.netflixNav').getBoundingClientRect().width,poster:document.querySelector('.posterWrap').getBoundingClientRect().width,title:getComputedStyle(document.querySelector('.dsCardTitle')).fontSize}));
    const desktop=await measure();
    assert(desktop.nav<1000); assert.equal(desktop.title,'14px');
    await page.keyboard.press('F8');
    await page.waitForFunction(()=>document.documentElement.dataset.svTv==='true');
    const tv=await measure(); assert(tv.poster>desktop.poster*1.2,'Enabling TV grows posters: '+JSON.stringify({desktop,tv}));
    await page.keyboard.press('F8');
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-tv')&&getComputedStyle(document.querySelector('.dsCardTitle')).fontSize==='14px');
    assert.deepEqual(await measure(),desktop,'Disabling TV restores exact desktop geometry');
  }finally{await context.close();}
});

test('The profile TV switch enables the couch layout and the header pill exits it',{skip:!available&&'Chromium is not installed'},async()=>{
  const {context,page}=await open({width:1280,height:720},false);
  try{
    await page.locator('.dsProfileMenu > summary').click();
    await page.locator('.svTvMenuToggle').click();
    await page.waitForFunction(()=>document.documentElement.dataset.svTv==='true');
    assert.equal(await page.locator('.svTvModePill').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.dsProfileMenu').getAttribute('open'),null);
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.svTv==='true');
    await page.locator('.svTvModePill').click();
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-tv'));
    assert.equal(await page.locator('.dsProfileMenu > summary').evaluate(node=>node===document.activeElement),true,'Exiting TV mode keeps keyboard focus on a visible control');
  }finally{await context.close();}
});

for(const viewport of [{width:390,height:844},{width:960,height:540}])test('Narrow TV header keeps its exit and controls reachable at '+viewport.width+'px',{skip:!available&&'Chromium is not installed'},async()=>{
  const {context,page}=await open(viewport,false);
  try{
    const normal=await page.locator('.netflixNav').evaluate(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
    await page.keyboard.press('F8');
    await page.waitForFunction(()=>document.documentElement.dataset.svTv==='true');
    const geometry=await page.evaluate(()=>{
      const bounds=node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
      return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,nav:bounds(document.querySelector('.netflixNav')),controls:['#svNavSearchToggle','#controlToggleTop','.svTvModePill','.dsProfileMenu > summary'].map(selector=>bounds(document.querySelector(selector))),links:[...document.querySelectorAll('.navLinks > a')].filter(node=>getComputedStyle(node).display!=='none').map(bounds)};
    });
    assert(geometry.pageWidth<=viewport.width,'TV mode does not overflow the narrow page');
    for(const box of geometry.controls){assert(box.left>=0&&box.right<=viewport.width,'Search, Studio, TV exit and profile stay within the screen');assert(box.width>=44&&box.height>=44,'Header controls retain usable touch targets');}
    assert(geometry.nav.left>=0&&geometry.nav.right<=viewport.width,'The full header fits the viewport');
    if(viewport.width===960)assert(geometry.links.length>=5&&geometry.links.every(box=>box.width>0&&box.left>=geometry.nav.left&&box.right<=geometry.nav.right),'Compact TV widths retain visible category navigation');
    await page.locator('.svTvModePill').click();
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-tv')&&getComputedStyle(document.querySelector('.dsCardTitle')).fontSize==='14px');
    assert.deepEqual(await page.locator('.netflixNav').evaluate(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),normal,'Touching exit restores the normal header');
  }finally{await context.close();}
});

for(const viewport of [{width:1280,height:720},{width:1920,height:1080}])test('TV watch header clears navigation and its theater fits the screen at '+viewport.width+'px',{skip:!available&&'Chromium is not installed'},async t=>{
  const {context,page}=await open(viewport);
  try{
    await context.route('**/api/proxy-video-wait/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'Local layout fixture'})}));
    await page.goto(origin+'/watch/movie/101?provider=fixture');
    await page.waitForFunction(()=>Boolean(window.SwiflyPlayer));
    const geometry=await page.evaluate(()=>{
      const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
      return {nav:box('.netflixNav'),head:box('.svPlayerPageHead'),theater:box('.svPlayerTheater'),dock:box('.svPlayerDock'),overflow:document.documentElement.scrollWidth};
    });
    assert(geometry.head.top>=geometry.nav.bottom+12,'Watch heading clears fixed navigation: '+JSON.stringify(geometry));
    assert(geometry.theater.top>=geometry.head.bottom,'Theater sits below the watch heading');
    assert(geometry.theater.bottom<=viewport.height-16,'The entire theater fits above the safe bottom: '+JSON.stringify(geometry));
    assert(geometry.dock.bottom<=viewport.height-16&&geometry.dock.top>=geometry.theater.top,'Transport stays inside the visible theater');
    assert(geometry.overflow<=viewport.width,'Watch page has no horizontal overflow');
    await page.locator('[data-player-settings] > summary').click();
    const settings=page.locator('.svPlayerSettingsBody');
    await settings.waitFor({state:'visible'});
    const menu=await settings.boundingBox();
    assert(menu.x>=16&&menu.y>=16&&menu.x+menu.width<=viewport.width-16&&menu.y+menu.height<=viewport.height-16,'Playback settings stay inside screen safe edges: '+JSON.stringify(menu));
    t.diagnostic('TV watch geometry '+JSON.stringify({...geometry,settings:menu}));
  }finally{await context.close();}
});
