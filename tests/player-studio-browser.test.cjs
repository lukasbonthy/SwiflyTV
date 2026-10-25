'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {playerMarkup}=require('../ui/player');
const asset=name=>fs.readFileSync(path.join(__dirname,'../public/player',name),'utf8');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath());
// Twelve seconds of silent black VP8, 320×180 at two frames per second.
// Kept inline so the real native-caption check needs no external media/network.
const fixture=Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAUmEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEfTbuMU6uEHFO7a1OsggUQ7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEDHcAAAAAAAFlSua8KuAQAAAAAAADnXgQFzxYjOhJu2Xmg6cpyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhB3NZQDgirCCAUC6gbSagQISVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PWY8CLY8WIzoSbtl5oOnJnyKFFo4dFTkNPREVSRIeUTGF2YzYwLjMxLjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjEyLjAwMDAwMDAwMAAfQ7Z1QcXngQCjQIqBAACA8A4AnQEqQAG0AABHCIWFiIWEiAICAAYWBPcGgWSfa9ubJzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jy4A/v+rUICjnYEB9ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BA+gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQXcALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEH0ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BCcQAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQu4ALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnIENrACRAgABEBAUYABhYL/QACIAEM1+tck+VgCjnYEPoACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BEZQAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgROIALECAAEQEAAYABhYL/QACIAEM1+tck+VgAAfQ7Z1QVjnghV8o52BAAAAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQH0ALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYED6ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BBdwAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQfQALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEJxACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BC7gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOcgQ2sAJECAAEQEBRgAGFgv9AAIgAQzX61yT5WAKOdgQ+gALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYERlACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAo52BE4gAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAB9DtnXC54Iq+KOdgQAAALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEB9ACxAgABEBAAGAAYWC/0AAiABDNfrXJPlYAAHFO7a5G7j7OBALeK94EB8YIBoPCBAw==','base64');
let browser;
test.before(async()=>{if(available)browser=await chromium.launch({headless:true,executablePath});});
test.after(async()=>{await browser?.close();});
async function open(viewport={width:1440,height:900}) {
 const context=await browser.newContext({viewport}),page=await context.newPage();
 const html='<!doctype html><html><head><style>body{margin:0;background:#090b0f}'+asset('player.css')+'</style></head><body class="svCleanShell">'+playerMarkup({id:'42',type:'movie',title:'Studio fixture',managed:true,backdrop:'https://swifly.test/art.svg'})+'</body></html>';
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname==='/film.webm')return route.fulfill({contentType:'video/webm',body:fixture});if(url.pathname==='/captions.vtt')return route.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:11.500\nStudio caption fixture\n'});if(url.pathname==='/art.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#384b88"/></svg>'});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('https://swifly.test/');await page.addScriptTag({content:asset('player.js')});
 return {context,page};
}
async function change(page,effective){await page.evaluate(effective=>document.dispatchEvent(new CustomEvent('swifly:studio-change',{detail:{values:effective,effective}})),effective);}
const skip=!available&&'Chromium is not installed';

test('Player themes, progress, timestamps, icons, opacity and placement change the rendered transport',{skip},async()=>{
 const {context,page}=await open();try {
  const read=()=>page.evaluate(()=>{const s=selector=>getComputedStyle(document.querySelector(selector));const dock=document.querySelector('.svPlayerDock').getBoundingClientRect(),stage=document.querySelector('.svPlayerStage').getBoundingClientRect();return {progress:s('.svPlayerTimelineTrack').height,icon:s('.svPlayerControl .svPlayerIcon').width,current:s('[data-player-current]').display,background:s('.svPlayerDockGlass').backgroundColor,filter:s('.svPlayerDockGlass').backdropFilter,radius:s('.svPlayerDock').borderRadius,inset:stage.bottom-dock.bottom};});
  await change(page,{playerStyle:'classic',playerProgress:7,playerTime:false,playerIconScale:125,playerOpacity:60,playerPosition:'bottom'});
  const classic=await read();assert.equal(classic.progress,'7px');assert.equal(classic.icon,'27.5px');assert.equal(classic.current,'none');assert.equal(classic.filter,'none');assert.match(classic.background, /0\.6\)/);assert(classic.inset<=2,'bottom placement meets the stage edge');
  await change(page,{playerStyle:'minimal',playerProgress:2,playerIconScale:85,playerOpacity:100,playerTime:true,playerPosition:'floating'});
  const minimal=await read();assert.equal(minimal.progress,'2px');assert(Math.abs(parseFloat(minimal.icon)-18.7)<.02,'the smallest icon scale must render at 85%');assert.notEqual(minimal.current,'none');assert.equal(minimal.filter,'none');assert.notEqual(minimal.background,classic.background);assert(minimal.inset>=10);
  await change(page,{playerStyle:'cinema',playerOpacity:85});const cinema=await read();assert.notEqual(cinema.filter,'none');assert.notEqual(cinema.radius,classic.radius);
 }finally{await context.close();}
});

test('Reduced effects and accessible large targets apply to small and TV player layouts',{skip},async()=>{
 for(const viewport of [{width:320,height:568},{width:1920,height:1080}]){
  const {context,page}=await open(viewport);try {
   await change(page,{performancePreset:'xbox',reduceTransparency:true,largeTargets:true,playerBackdrop:'ambient',playerStyle:'cinema',playerPosition:'bottom',playerIconScale:125});
   const result=await page.evaluate(()=>{const controls=[...document.querySelectorAll('.svPlayerDockRow .svPlayerControl')].filter(n=>n.getClientRects().length);return {width:document.documentElement.scrollWidth,blur:getComputedStyle(document.querySelector('.svPlayerDockGlass')).backdropFilter,ambient:getComputedStyle(document.querySelector('.svPlayerAmbient')).display,controls:controls.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right};})};});
   assert.equal(result.blur,'none');assert.equal(result.ambient,'none');assert(result.width<=viewport.width);
   for(const target of result.controls){assert(target.width>=44&&target.height>=44);assert(target.left>=0&&target.right<=viewport.width);}
   await page.locator('[data-player-settings] > summary').focus();await change(page,{playerStyle:'minimal',playerIconScale:85,playerAutoHide:1800,largeTargets:true});assert(await page.locator('[data-player-settings] > summary').evaluate(n=>n===document.activeElement));
   await page.locator('[data-player-settings] > summary').click();await page.locator('[data-player-speed]').scrollIntoViewIfNeeded();assert(await page.locator('[data-player-speed]').isVisible());
  }finally{await context.close();}
 }
});

test('Loading artwork and ambient backgrounds stay static and clear the playing frame',{skip},async()=>{
 const {context,page}=await open();try {
  const appearance=()=>page.evaluate(()=>{const art=document.querySelector('[data-player-art]'),video=document.querySelector('video');return {metadata:document.querySelector('[data-player-root]').dataset.playerBackdrop,art:art.currentSrc,opacity:getComputedStyle(art).opacity,filter:getComputedStyle(art).filter,shade:getComputedStyle(document.querySelector('.svPlayerShade')).backgroundImage,videoOpacity:getComputedStyle(video).opacity,videoFilter:getComputedStyle(video).filter};});
  await page.locator('[data-player-art]').evaluate(image=>image.decode());
  const dark=await appearance();assert.equal(dark.opacity,'0');
  await change(page,{playerBackdrop:'artwork'});
  const artwork=await appearance();assert.equal(artwork.opacity,'0.42');assert.equal(artwork.filter,'blur(12px)');assert.equal(artwork.art,'https://swifly.test/art.svg');assert.equal(artwork.metadata,artwork.art);
  await change(page,{playerBackdrop:'ambient'});
  const ambient=await appearance();assert.equal(ambient.opacity,'0');assert.match(ambient.shade,/radial-gradient/);
  await page.evaluate(async()=>{await SwiflyPlayer.loadSource({status:'ok',playbackUrl:'/film.webm'});});
  await page.waitForFunction(()=>SwiflyPlayer.getState().ready);
  await page.evaluate(async()=>{document.querySelector('video').muted=true;await SwiflyPlayer.play({remote:true});});
  await change(page,{playerBackdrop:'artwork'});
  const playing=await appearance();assert.equal(playing.opacity,'0');assert.equal(playing.filter,'none');assert.equal(playing.videoOpacity,'1');assert.equal(playing.videoFilter,'none');assert.equal(playing.metadata,artwork.metadata);
  assert(await page.evaluate(()=>!document.querySelector('video').paused&&SwiflyPlayer.getState().source==='/film.webm'));
 }finally{await context.close();}
});

async function nativeCueStyle(page) {
 const client=await page.context().newCDPSession(page);try{
  await client.send('DOM.enable');await client.send('CSS.enable');const {root}=await client.send('DOM.getDocument',{depth:-1,pierce:true});let cue;
  function find(node){if(node.children?.some(child=>child.nodeName==='#text'&&child.nodeValue==='Studio caption fixture'))cue=node;for(const child of [...(node.children||[]),...(node.shadowRoots||[])])find(child);}find(root);
  assert(cue,'The actual browser renderer must contain an active fixture cue');const {computedStyle}=await client.send('CSS.getComputedStyleForNode',{nodeId:cue.nodeId});return Object.fromEntries(computedStyle.map(row=>[row.name,row.value]));
 }finally{await client.detach();}
}

test('Chromium native captions really render the selected color, size, background and edge during playback',{skip},async()=>{
 const {context,page}=await open();try {
  await page.evaluate(async()=>{await SwiflyPlayer.loadSource({status:'ok',playbackUrl:'/film.webm',subtitles:[{url:'/captions.vtt',language:'en',label:'Fixture captions'}]});});
  await page.waitForFunction(()=>SwiflyPlayer.getState().ready&&[...document.querySelector('[data-player-captions]').options].some(o=>o.textContent==='Fixture captions'));
  await page.evaluate(async()=>{const select=document.querySelector('[data-player-captions]');select.value=[...select.options].find(o=>o.textContent==='Fixture captions').value;select.dispatchEvent(new Event('change'));document.querySelector('video').muted=true;await SwiflyPlayer.play({remote:true});});
  await page.waitForFunction(()=>document.querySelector('video').textTracks[0]?.activeCues?.length===1);
  const before=await nativeCueStyle(page);
  await change(page,{captionSize:200,captionColor:'#00ffcc',captionBg:20,captionEdge:'outline',playerStyle:'minimal'});
  const after=await nativeCueStyle(page);assert.equal(after.color,'rgb(0, 255, 204)');assert.equal(after['background-color'],'rgba(0, 0, 0, 0.2)');assert.equal(parseFloat(after['font-size']),2*parseFloat(before['font-size']));assert.match(after['text-shadow'],/-1px/);
  assert(await page.evaluate(()=>!document.querySelector('video').paused&&SwiflyPlayer.getState().source==='/film.webm'));
 }finally{await context.close();}
});
