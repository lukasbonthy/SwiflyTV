'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const root=path.join(__dirname,'../public'),asset=name=>fs.readFileSync(path.join(root,name),'utf8');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api;test.before(async()=>{if(available){api=loadServer();browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});}});test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));});
async function open(viewport={width:1440,height:900},tv=false,context,primeOnly=false){
 context=context||await browser.newContext({viewport});const page=await context.newPage();let html=api.pageShell({title:'Studio fixture',body:'<main data-st-home><section class="dsHero"><div class="dsHeroContent"><h1>Movie night, your way.</h1></div></section><section class="dsContent" data-st-home-rows><section data-st-home-section="continue"><h2>Continue watching</h2></section><section data-st-home-section="trending-movies"><h2>Trending movies</h2></section></section></main>'}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attributes)=>/data-sv-studio-(?:config|prime)/.test(attributes)?script:'');
 await page.route('**/*',route=>{const url=new URL(route.request().url()),type=route.request().resourceType();if(type==='document')return route.fulfill({contentType:'text/html',body:html});if(url.pathname.startsWith('/assets/')&&url.pathname.endsWith('.css')){const file=path.join(root,url.pathname.slice(8));if(fs.existsSync(file))return route.fulfill({contentType:'text/css',body:fs.readFileSync(file)});}return route.fulfill({contentType:type==='stylesheet'?'text/css':'image/svg+xml',body:''});});
 await page.goto('https://swifly.test/');if(primeOnly)return {context,page};if(tv)await page.evaluate(()=>{document.documentElement.dataset.svTv='true';document.body.classList.add('swifly-tv-focus-mode');});await page.addScriptTag({content:asset('studio/config.js')});await page.addScriptTag({content:asset('studio/studio.js')});await page.evaluate(()=>window.SwiflyStudio.open());return {context,page};
}
test('all ten sections fit the real desktop and 320px mobile shell without horizontal overflow',{skip},async()=>{
 for(const viewport of [{width:1440,height:900},{width:320,height:568}]){const {context,page}=await open(viewport);try{
  await page.locator('[data-st-advanced-toggle]').check();
  for(const tab of await page.locator('[data-st-tab]').all()){
   const key=await tab.getAttribute('data-st-tab');await tab.click();const panel=page.locator('#stPanel-'+key);assert(await panel.isVisible(),key+' panel visible');
   const bounds=await panel.evaluate(n=>{const r=n.getBoundingClientRect();return {width:n.clientWidth,scroll:n.scrollWidth,left:r.left,right:r.right};});assert(bounds.scroll<=bounds.width+1,key+' has no horizontal content overflow');assert(bounds.left>=0&&bounds.right<=viewport.width,key+' inside screen');
   const footer=await page.locator('.stFooter').boundingBox();assert(footer.y>=0&&footer.y+footer.height<=viewport.height+1,'footer stays on screen');
   if(key==='player'){await page.locator('[data-st-input="captionSize"]').fill('150');assert.equal(await page.locator('[data-st-caption-preview]').evaluate(n=>n.style.fontSize),'1.5em');}
  }
  assert.equal(await page.locator('[role="tablist"]').getAttribute('aria-orientation'),viewport.width===320?'horizontal':'vertical');
  if(viewport.width===320)await page.screenshot({path:'/tmp/swifly-studio-320.png'});else await page.screenshot({path:'/tmp/swifly-studio-desktop.png'});
 }finally{await context.close();}}
});
test('TV Studio keeps native controls readable, focusable and inside the workspace',{skip},async()=>{
 const {context,page}=await open({width:1920,height:1080},true);try{for(const name of ['layout','player','devices','themes']){await page.locator('[data-st-tab="'+name+'"]').click();const panel=page.locator('#stPanel-'+name);assert(await panel.isVisible());assert.equal(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);if(name==='layout')await panel.locator('.stSimpleDetails > summary').click();const input=panel.locator('select,input:not([type="hidden"]),textarea').first();await input.focus();assert.equal(await input.evaluate(n=>document.activeElement===n),true,name+' focus: '+await input.evaluate(n=>JSON.stringify({field:n.dataset,detailsOpen:n.closest('details')?.open,rects:n.getClientRects().length})));}assert.equal(await page.evaluate(()=>window.SwiflyStudio.getSettings().glass),'off');await page.screenshot({path:'/tmp/swifly-studio-tv.png'});}finally{await context.close();}
});
test('Simple and Advanced keep keyboard focus safe and retain a cancellable draft on phone and desktop',{skip},async()=>{
 for(const viewport of [{width:1440,height:900},{width:320,height:568}]){const {context,page}=await open(viewport);try{
  assert.equal(await page.locator('[data-st-tab]:visible').count(),6);assert(await page.locator('[data-st-input="accentColor"]').isHidden());
  await page.locator('[data-st-tab="player"]').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.stTab),'devices');
  await page.locator('[data-st-advanced-toggle]').check();await page.locator('[data-st-tab="looks"]').click();await page.locator('[data-st-input="glassBlur"]').fill('25');
  await page.locator('[data-st-tab="hud"]').click();await page.locator('[data-st-input="aiWidth"]').fill('800');await page.locator('[data-st-advanced-toggle]').uncheck();
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[hidden]')),null);assert(await page.locator('#stPanel-looks').isVisible());assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().aiWidth),800);
  const header=await page.locator('.stHeader').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(header.scroll<=header.width+1,'mode switch fits');
  await page.locator('[data-st-preset="halloween"]').click();await page.locator('.stContent').evaluate(n=>n.scrollTop=0);await page.locator('#controlPanel').evaluate(n=>Promise.all(n.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'/tmp/swifly-studio-simple-'+viewport.width+'.png'});await page.locator('[data-st-cancel]').last().click();assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().themeId),'pure');
 }finally{await context.close();}}
});
test('seasonal themes persist through the prepaint path and decorative light obeys comfort and TV policies',{skip},async()=>{
 const {context,page}=await open();try{
  await page.locator('[data-st-preset="halloween"]').click();assert.equal(await page.locator('.svAppearanceTexture').evaluate(n=>getComputedStyle(n).display),'block');
  await page.locator('[data-st-save]').click();const values=await page.evaluate(()=>SwiflyStudio.getRawSettings());const second=await open(undefined,false,context,true);assert.equal(await second.page.evaluate(()=>document.body.dataset.stThemeId),'halloween');assert.equal(await second.page.evaluate(()=>!!window.SwiflyStudio),false);await second.page.close();
  for(const preference of [{highContrast:true},{reduceTransparency:true},{performancePreset:'xbox'},{performancePreset:'minimal'}]){
   await page.evaluate(value=>SwiflyStudioConfig.apply(value),{...values,...preference});assert.equal(await page.locator('.svAppearanceTexture').evaluate(n=>getComputedStyle(n).display),'none');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(value=>SwiflyStudioConfig.apply(value),values);assert.equal(await page.evaluate(()=>SwiflyAppearance.auroraMotion),'still');
 }finally{await context.close();}
});
test('supported light canvases and dark accents keep the editor readable through Save and Cancel',{skip},async()=>{
 const {context,page}=await open();try{
  await page.locator('[data-st-advanced-toggle]').check();await page.locator('[data-st-input="customColors"]').check();
  await page.locator('[data-st-input="canvasColor"]').fill('#ffffff');await page.locator('[data-st-input="accentColor"]').fill('#223344');await page.locator('[data-st-input="accentColor"]').press('Tab');
  const contrast=()=>page.evaluate(async()=>{
   await Promise.all(document.querySelector('#controlPanel').getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
   const hex=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return '#'+[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');};
   const panel=getComputedStyle(document.querySelector('#controlPanel')),heading=getComputedStyle(document.querySelector('#stTitle')),save=getComputedStyle(document.querySelector('[data-st-save]'));
   return {heading:SwiflyStudioConfig.contrast(hex(heading.color),hex(panel.backgroundColor)),button:SwiflyStudioConfig.contrast(hex(save.color),hex(save.backgroundColor))};
  });
  let ratios=await contrast();assert(ratios.heading>=4.5,'Editor heading remains readable on a supported light canvas: '+JSON.stringify(ratios));assert(ratios.button>=4.5,'Save text remains readable on a dark accent: '+JSON.stringify(ratios));
  await page.locator('[data-st-save]').click();await page.evaluate(()=>SwiflyStudio.open());assert.equal(await page.locator('[data-st-input="canvasColor"]').inputValue(),'#ffffff');assert.equal(await page.locator('[data-st-input="accentColor"]').inputValue(),'#223344');
  for(const accent of ['#000000','#ffffff','#777777']){await page.locator('[data-st-input="accentColor"]').fill(accent);await page.locator('[data-st-input="accentColor"]').press('Tab');ratios=await contrast();assert(ratios.heading>=4.5&&ratios.button>=4.5,accent+' keeps readable editor and Save text: '+JSON.stringify(ratios));}
  await page.locator('.stFooter [data-st-cancel]').click();assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().accentColor),'#223344');assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().canvasColor),'#ffffff');
 }finally{await context.close();}
});
test('portable file export imports into another browser only after review and Preview then persists on Save',{skip},async()=>{
 const first=await open();let second;try{
  await first.page.locator('[data-st-field="theme"][data-st-value="purple"]').click();await first.page.locator('[data-st-tab="devices"]').click();await first.page.locator('[data-st-input="performancePreset"]').selectOption('xbox');await first.page.locator('[data-st-tab="themes"]').click();await first.page.locator('[data-st-look-name]').fill('Portable purple');
  const downloadPromise=first.page.waitForEvent('download');await first.page.locator('[data-st-export-download]').click();const download=await downloadPromise,file=await download.path(),json=fs.readFileSync(file,'utf8'),parsed=JSON.parse(json);assert.equal(parsed.name,'Portable purple');assert.equal(parsed.values.theme,'purple');assert(!('performancePreset' in parsed.values));
  second=await open();await second.page.locator('[data-st-tab="themes"]').click();await second.page.locator('[data-st-import-file]').setInputFiles({name:'portable.json',mimeType:'application/json',buffer:Buffer.from(json)});await second.page.locator('[data-st-import-summary]').filter({hasText:'Portable purple'}).waitFor();assert.equal(await second.page.evaluate(()=>window.SwiflyStudio.getSettings().theme),'default');await second.page.locator('[data-st-import-preview]').click();assert.equal(await second.page.evaluate(()=>window.SwiflyStudio.getSettings().theme),'purple');assert.equal(await second.page.evaluate(()=>window.SwiflyStudio.getRawSettings().performancePreset),'auto');await second.page.locator('[data-st-save]').click();
  const saved=await second.page.evaluate(()=>JSON.parse(localStorage.getItem('swiflytv.appearance')));assert.equal(saved.values.theme,'purple');const again=await open(undefined,false,second.context);assert.equal(await again.page.evaluate(()=>window.SwiflyStudio.getSettings().theme),'purple');
 }finally{await first.context.close();await second?.context.close();}
});
