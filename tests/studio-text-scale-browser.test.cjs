'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const {playerMarkup}=require('../ui/player');
const root=path.join(__dirname,'../public'),asset=name=>fs.readFileSync(path.join(root,name),'utf8');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api;
test.before(async()=>{if(available){api=loadServer();browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});}});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));});

// Silent VP8 fixture shared in content with the native-caption player regression.
const captionFilm=Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAUmEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEfTbuMU6uEHFO7a1OsggUQ7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEDHcAAAAAAAFlSua8KuAQAAAAAAADnXgQFzxYjOhJu2Xmg6cpyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhB3NZQDgirCCAUC6gbSagQISVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PWY8CLY8WIzoSbtl5oOnJnyKFFo4dFTkNPREVSRIeUTGF2YzYwLjMxLjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjEyLjAwMDAwMDAwMAAfQ7Z1QcXngQCjQIqBAACA8A4AnQEqQAG0AABHCIWFiIWEiAICAAYWBPcGgWSfa9ubJzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jy4A/v+rUICjnYEB9ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BA+gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQXcALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEH0ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BCcQAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQu4ALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnIENrACRAgABEBAUYABhYL/QACIAEM1+tck+VgCjnYEPoACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BEZQAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgROIALECAAEQEAAYABhYL/QACIAEM1+tck+VgAAfQ7Z1QVjnghV8o52BAAAAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQH0ALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYED6ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BBdwAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQfQALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEJxACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BC7gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOcgQ2sAJECAAEQEBRgAGFgv9AAIgAQzX61yT5WAKOdgQ+gALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYERlACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BE4gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAB9DtnXC54Iq+KOdgQAAALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEB9ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAHFO7a5G7j7OBALeK94EB8YIBoPCBAw==','base64');
const pageBody='<main class="svLibraryPage"><header class="svLibraryHeader"><span class="svLibraryEyebrow">YOUR COLLECTION</span><h1>Your library.</h1><p>Films and shows, ready when you are. <em data-scale-relative style="font-size:.75em">Saved for later.</em></p></header><button class="svLibraryTab">Watchlist</button><p data-scale-inherited>Everything in one place.</p></main>';
async function open({viewport={width:1440,height:900},values={},tv=false,records={},player=false}={}){
 const context=await browser.newContext({viewport}),page=await context.newPage();
 await context.addInitScript(records=>{
  if(localStorage.getItem('scaleFixtureSeeded'))return;
  for(const [key,value]of Object.entries(records))localStorage.setItem(key,JSON.stringify(value));
  localStorage.setItem('scaleFixtureSeeded','yes');
 },{'swiflytv.appearance':{version:2,values},...records});
 // Keep the actual inline configuration and prepaint prime. Other controllers
 // are loaded explicitly so this test needs no account, catalog or CDN data.
 let html=api.pageShell({active:'list',body:player?playerMarkup({id:'42',type:'movie',title:'Scale fixture',managed:true}):pageBody,player})
  .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attributes)=>/data-sv-studio-(?:config|prime)/.test(attributes)?script:'');
 if(tv)html=html.replace('<html lang="en">','<html lang="en" data-sv-tv="true">');
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),type=route.request().resourceType();
  if(type==='document')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/scale-film.webm')return route.fulfill({contentType:'video/webm',body:captionFilm});
  if(url.pathname==='/scale-captions.vtt')return route.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:11.500\nText scale caption fixture\n'});
  if(url.pathname.startsWith('/assets/')&&/\.(css|svg)$/.test(url.pathname)){
   const file=path.join(root,url.pathname.slice(8));if(fs.existsSync(file))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(file)});
  }
  return route.fulfill({contentType:type==='stylesheet'?'text/css':'image/svg+xml',body:''});
 });
 await page.goto('https://swifly.test/library');
 return {context,page};
}
async function studio(page){
 await page.addScriptTag({content:asset('studio/studio.js')});
 await page.addScriptTag({content:asset('studio/experience.js')});
 await page.evaluate(()=>SwiflyStudio.open());
 await page.locator('[data-st-tab="access"]').click();
}
const shellFonts=page=>page.evaluate(()=>{
 const size=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
 const navigation=[...document.querySelectorAll('[data-st-nav="home"]')].find(n=>n.getClientRects().length);
 return {navigation:parseFloat(getComputedStyle(navigation).fontSize),heading:size('.svLibraryHeader h1'),copy:size('.svLibraryHeader p'),button:size('.svLibraryTab'),relative:size('[data-scale-relative]'),inherited:size('[data-scale-inherited]')};
});
function near(actual,expected,message){assert(Math.abs(actual-expected)<.03,message+': expected '+expected+', got '+actual);}
function scaled(actual,baseline,factor,label){for(const key of Object.keys(baseline))near(actual[key],baseline[key]*factor,label+' '+key);}
async function workspaceFonts(page){return page.evaluate(()=>{
 const size=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
 return {heading:size('#stPanel-access .stPanelTitle h2'),label:size('[data-st-output="uiScale"]'),control:size('[data-st-save]'),tab:size('[data-st-tab="access"]')};
});}

test('saved text sizes affect real navigation, page copy, shorthand and inherited fonts before Studio boots',{skip},async()=>{
 const readings={};
 for(const uiScale of [100,90,120]){
  const {context,page}=await open({values:{uiScale}});try{
   assert.equal(await page.evaluate(()=>typeof window.SwiflyStudio),'undefined','prepaint works without the interactive controller');
   readings[uiScale]=await shellFonts(page);
  }finally{await context.close();}
 }
 near(readings[100].copy,14,'the 100% page-copy baseline');
 near(readings[100].button,12,'the 100% shorthand baseline');
 near(readings[100].relative,10.5,'relative text uses its parent once');
 scaled(readings[90],readings[100],.9,'90% first paint');
 scaled(readings[120],readings[100],1.2,'120% first paint');
});

test('the real text-size slider previews Studio and page typography, Save survives reload and Cancel restores it',{skip},async()=>{
 const {context,page}=await open();try{
  await studio(page);const shellBaseline=await shellFonts(page),workspaceBaseline=await workspaceFonts(page);
  near(workspaceBaseline.heading,27,'the 100% Studio heading baseline');near(workspaceBaseline.control,13,'the 100% Studio control baseline');
  await page.evaluate(()=>{window.scaleInput=document.querySelector('[data-st-input="uiScale"]');window.scaleOrderRow=document.querySelector('[data-st-order-row]');});
  await page.locator('[data-st-input="uiScale"]').fill('120');
  scaled(await shellFonts(page),shellBaseline,1.2,'120% live page');scaled(await workspaceFonts(page),workspaceBaseline,1.2,'120% live Studio');
  assert(await page.evaluate(()=>scaleInput===document.querySelector('[data-st-input="uiScale"]')&&scaleOrderRow===document.querySelector('[data-st-order-row]')),'dragging retains the controls and existing order rows');
  await page.locator('[data-st-input="uiScale"]').focus();await page.keyboard.press('ArrowLeft');
  assert(await page.locator('[data-st-input="uiScale"]').evaluate(n=>n===document.activeElement),'native keyboard focus survives live scaling');
  await page.locator('[data-st-input="uiScale"]').fill('120');await page.locator('[data-st-save]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('swiflytv.appearance')).values.uiScale),120);
  await page.reload();scaled(await shellFonts(page),shellBaseline,1.2,'saved reload');
  await studio(page);await page.locator('[data-st-input="uiScale"]').fill('90');
  scaled(await shellFonts(page),shellBaseline,.9,'90% draft page');scaled(await workspaceFonts(page),workspaceBaseline,.9,'90% draft Studio');
  await page.locator('.stFooter [data-st-cancel]').click();scaled(await shellFonts(page),shellBaseline,1.2,'Cancel rollback');
  await page.reload();scaled(await shellFonts(page),shellBaseline,1.2,'Cancel leaves the saved size intact');
 }finally{await context.close();}
});

test('profile changes discard the text-size draft and render the new profile size immediately',{skip},async()=>{
 const secondKey='swiflytv.appearance.v2.guest:profile:second';
 const {context,page}=await open({records:{[secondKey]:{version:2,values:{uiScale:120}}}});try{
  const baseline=await shellFonts(page);await studio(page);await page.locator('[data-st-input="uiScale"]').fill('90');
  scaled(await shellFonts(page),baseline,.9,'profile-one draft');
  await page.evaluate(()=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'second',name:'Second'}));document.dispatchEvent(new CustomEvent('swifly:profile-changed'));});
  assert.equal(await page.locator('#controlPanel').evaluate(n=>n.open),false);
  scaled(await shellFonts(page),baseline,1.2,'second profile');
  await page.reload();scaled(await shellFonts(page),baseline,1.2,'second profile first paint');
 }finally{await context.close();}
});

test('maximum text size keeps all Studio panels inside 320px, desktop and TV screens with visible footer actions',{skip},async()=>{
 for(const screen of [{viewport:{width:320,height:568}},{viewport:{width:1440,height:900}},{viewport:{width:960,height:540},tv:true},{viewport:{width:1920,height:1080},tv:true}]){
  const {context,page}=await open(screen);try{
   await studio(page);
   const shellBaseline=await shellFonts(page),workspaceBaseline=await workspaceFonts(page);
   for(const uiScale of ['90','120']){
    await page.locator('[data-st-input="uiScale"]').fill(uiScale);
    // Existing reduced-motion CSS gives all descendants a 10µs transition.
    // Wait for inherited typography to settle before measuring that contract.
    await page.waitForFunction(expected=>Math.abs(parseFloat(getComputedStyle(document.querySelector('[data-scale-inherited]')).fontSize)-expected)<.03,shellBaseline.inherited*Number(uiScale)/100);
    scaled(await shellFonts(page),shellBaseline,Number(uiScale)/100,screen.viewport.width+'px page');
    scaled(await workspaceFonts(page),workspaceBaseline,Number(uiScale)/100,screen.viewport.width+'px Studio');
   }
   for(const tab of await page.locator('[data-st-tab]').all()){
    const key=await tab.getAttribute('data-st-tab');await tab.click();
    const geometry=await page.locator('#stPanel-'+key).evaluate(node=>{
     const bounds=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     return {panel:bounds(node),contentWidth:node.clientWidth,scrollWidth:node.scrollWidth,pageWidth:document.documentElement.scrollWidth,footer:bounds(document.querySelector('.stFooter')),actions:[...document.querySelectorAll('.stFooter > div > button')].filter(n=>!n.hidden).map(bounds)};
    });
    const label=screen.viewport.width+'px '+key;
    assert(geometry.scrollWidth<=geometry.contentWidth+1,label+' has no horizontal panel overflow');
    assert(geometry.pageWidth<=screen.viewport.width,label+' has no page overflow');
    assert(geometry.panel.left>=0&&geometry.panel.right<=screen.viewport.width,label+' panel fits');
    assert(geometry.footer.top>=0&&geometry.footer.bottom<=screen.viewport.height+1,label+' footer fits');
    for(const action of geometry.actions)assert(action.left>=0&&action.right<=screen.viewport.width&&action.top>=0&&action.bottom<=screen.viewport.height+1,label+' footer action stays on screen');
   }
  }finally{await context.close();}
 }
});

test('interface size leaves video geometry and caption previews independent of the caption-size control',{skip},async()=>{
 const {context,page}=await open({player:true});try{
  await studio(page);await page.locator('[data-st-tab="player"]').click();
  await page.locator('[data-st-input="captionSize"]').fill('150');
  const read=()=>page.evaluate(()=>{
   const video=document.querySelector('video'),style=getComputedStyle(video),r=video.getBoundingClientRect();
   return {video:{width:r.width,height:r.height,fit:style.objectFit,transform:style.transform},captions:[...document.querySelectorAll('[data-st-caption-preview],[data-st-caption-mini]')].map(n=>parseFloat(getComputedStyle(n).fontSize))};
  });
  const baseline=await read();
  for(const uiScale of ['90','120']){
   await page.locator('[data-st-tab="access"]').click();await page.locator('[data-st-input="uiScale"]').fill(uiScale);
   assert.deepEqual(await read(),baseline,uiScale+'% typography leaves video and caption presentation unchanged');
  }
  await page.locator('[data-st-tab="player"]').click();await page.locator('[data-st-input="captionSize"]').fill('200');
  const larger=await read();assert.deepEqual(larger.video,baseline.video);
  larger.captions.forEach((size,index)=>near(size,baseline.captions[index]*4/3,'caption-size still controls preview '+index));
 }finally{await context.close();}
});

async function nativeCaptionSize(page){
 const client=await page.context().newCDPSession(page);try{
  await client.send('DOM.enable');await client.send('CSS.enable');
  const {root}=await client.send('DOM.getDocument',{depth:-1,pierce:true});let cue;
  function find(node){
   if(node.children?.some(child=>child.nodeName==='#text'&&child.nodeValue==='Text scale caption fixture'))cue=node;
   for(const child of [...(node.children||[]),...(node.shadowRoots||[])])find(child);
  }
  find(root);assert(cue,'Chromium must render the actual active caption');
  const {computedStyle}=await client.send('CSS.getComputedStyleForNode',{nodeId:cue.nodeId});
  return parseFloat(computedStyle.find(row=>row.name==='font-size').value);
 }finally{await client.detach();}
}
test('native video captions retain their actual rendered size at 90% and 120% interface typography',{skip},async()=>{
 const {context,page}=await open({player:true});try{
  await page.addScriptTag({content:asset('player/player.js')});
  await page.evaluate(async()=>SwiflyPlayer.loadSource({status:'ok',playbackUrl:'/scale-film.webm',subtitles:[{url:'/scale-captions.vtt',language:'en',label:'Fixture captions'}]}));
  await page.waitForFunction(()=>SwiflyPlayer.getState().ready&&[...document.querySelector('[data-player-captions]').options].some(o=>o.textContent==='Fixture captions'));
  await page.evaluate(async()=>{
   const select=document.querySelector('[data-player-captions]');select.value=[...select.options].find(o=>o.textContent==='Fixture captions').value;select.dispatchEvent(new Event('change'));
   document.querySelector('video').muted=true;await SwiflyPlayer.play({remote:true});
  });
  await page.waitForFunction(()=>document.querySelector('video').textTracks[0]?.activeCues?.length===1);
  const baseline=await nativeCaptionSize(page);await studio(page);
  for(const uiScale of ['90','120']){
   await page.locator('[data-st-input="uiScale"]').fill(uiScale);
   near(await nativeCaptionSize(page),baseline,uiScale+'% leaves the native cue independent');
  }
  await page.locator('[data-st-tab="player"]').click();await page.locator('[data-st-input="captionSize"]').fill('200');
  near(await nativeCaptionSize(page),baseline*2,'the caption-size slider still doubles the native cue');
  assert(await page.evaluate(()=>!document.querySelector('video').paused&&SwiflyPlayer.getState().source==='/scale-film.webm'),'typography changes preserve playback');
 }finally{await context.close();}
});
