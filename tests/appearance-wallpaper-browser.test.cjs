'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const root=path.join(__dirname,'../public'),executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api;
test.before(async()=>{if(!available)return;api=loadServer();browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));});
async function fixture(width=1440,values){
 const context=await browser.newContext({viewport:{width,height:width<801?844:900}}),page=await context.newPage();
 if(values)await context.addInitScript(v=>localStorage.setItem('swiflytv.appearance',JSON.stringify({version:2,values:v})),values);
 const html=api.pageShell({title:'Your screen',body:'<main class="dsProfilesPage"><h1>Who’s watching?</h1><p>Choose your profile. Make yourself comfortable.</p></main>'}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(s,a)=>/data-sv-studio-(?:config|prime)/.test(a)?s:'');
 await page.route('**/*',route=>{const url=new URL(route.request().url()),type=route.request().resourceType();if(type==='document')return route.fulfill({contentType:'text/html',body:html});const file=path.join(root,url.pathname.replace(/^\/assets\//,''));if(url.pathname.startsWith('/assets/')&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'application/javascript'});return route.fulfill({body:'',contentType:type==='stylesheet'?'text/css':'text/plain'});});
 const boot=async()=>{for(const name of ['studio/wallpapers.js','clean/aurora.js','studio/theme-details.js','studio/studio.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});};
 await page.goto('https://swifly.test/profiles');await boot();return{context,page,boot};
}
async function picture(page,width=3000,height=2000){const data=await page.evaluate(([width,height])=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,width,height);g.addColorStop(0,'#254d68');g.addColorStop(.5,'#987d9d');g.addColorStop(1,'#d8be9b');x.fillStyle=g;x.fillRect(0,0,width,height);x.fillStyle='#243b52';x.beginPath();x.moveTo(0,height);x.lineTo(width*.4,height*.45);x.lineTo(width*.72,height*.85);x.lineTo(width,height*.6);x.lineTo(width,height);x.fill();return c.toDataURL('image/png').split(',')[1];},[width,height]);return Buffer.from(data,'base64');}
test('seasonal profiles retain Aurora and native Studio has independent visible ribbon motion',{skip},async()=>{
 const {context,page}=await fixture();try{
  assert.equal(await page.locator('.svAuroraBackground').isVisible(),true);await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-preset="halloween"]').click();await page.locator('[data-st-save]').click();assert.equal(await page.locator('.svAuroraBackground').isVisible(),true);
  await page.evaluate(()=>{document.body.style.minHeight='3000px';scrollTo(0,1500);});await page.waitForFunction(()=>document.body.dataset.svAuroraState==='still');await page.evaluate(()=>SwiflyStudio.open());await page.waitForFunction(()=>document.body.dataset.svAuroraPreviewState==='live');
  const ribbon=page.locator('.stStudioAtmosphere>.svAuroraRibbon'),before=await ribbon.evaluate(n=>getComputedStyle(n).transform);await page.waitForFunction(previous=>getComputedStyle(document.querySelector('.stStudioAtmosphere>.svAuroraRibbon')).transform!==previous,before);
 }finally{await context.close();}
});
test('real uploads optimize, preview, survive theme switches and reload, and Cancel restores the saved wallpaper',{skip},async()=>{
 const {context,page,boot}=await fixture();try{
  await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-tab="wallpapers"]').click();await page.locator('[data-st-wallpaper-file]').setInputFiles({name:'My mountains.png',mimeType:'image/png',buffer:await picture(page)});await page.waitForFunction(()=>SwiflyStudio.getRawSettings().wallpaper==='upload');
  const v=await page.evaluate(()=>SwiflyStudio.getRawSettings());assert(v.wallpaperData.length<=160000);assert.match(v.wallpaperData,/^data:image\/(webp|jpeg);base64,/);assert.equal(v.wallpaperName,'My mountains.png');assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-st-wallpaper-data')),false);
  const dims=await page.evaluate(async data=>{const i=new Image();i.src=data;await i.decode();return[i.width,i.height];},v.wallpaperData);assert(dims[0]<=1920&&dims[1]<=1440);
  assert.equal(await page.locator('.stWallpaperPreview').isVisible(),true);await page.locator('[data-st-tab="looks"]').click();await page.locator('[data-st-preset="blossom"]').click();assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaperData),v.wallpaperData);await page.locator('[data-st-save]').click();assert.equal(await page.locator('.svWallpaperBackdrop').isVisible(),true);
  await page.reload();await boot();assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaperData),v.wallpaperData);await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-tab="wallpapers"]').click();await page.locator('[data-st-field="wallpaper"][data-st-value="winter"]').click();await page.locator('[data-st-cancel]').last().click();assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaperData),v.wallpaperData);assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaper),'upload');
 }finally{await context.close();}
});
test('invalid file types, signatures, oversized files and giant dimensions preserve the existing draft',{skip},async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-tab="wallpapers"]').click();await page.locator('[data-st-field="wallpaper"][data-st-value="velvet"]').click();
  for(const [name,mimeType,buffer]of [['bad.svg','image/svg+xml',Buffer.from('<svg/>')],['fake.png','image/png',Buffer.from('not an image')],['big.jpg','image/jpeg',Buffer.alloc(8*1024*1024+1)],['wide.png','image/png',await picture(page,9000,1)]]){
   await page.locator('[data-st-wallpaper-file]').setInputFiles({name,mimeType,buffer});await page.waitForFunction(()=>document.querySelector('[data-st-wallpaper-status]').dataset.error==='true');assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaper),'velvet');assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaperData),'');
  }
 }finally{await context.close();}
});
test('wallpaper Studio remains readable and within phone and desktop bounds',{skip},async()=>{
 for(const width of [390,1440]){const {context,page}=await fixture(width,{wallpaper:'winter',themeId:'winter'});try{
  await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-tab="wallpapers"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await page.locator('[data-st-save]').isVisible(),true);assert.equal(await page.locator('.stWallpaperPreview').isVisible(),true);
  if(process.env.SWIFLY_CAPTURE_EVIDENCE){const dir=path.join(__dirname,'../docs/evidence/wallpapers-tv');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'wallpapers-'+width+'.png')});}
 }finally{await context.close();}}
});

test('Studio rejects a structurally bounded PNG with undecodable image data before import confirmation',{skip},async()=>{
 const {context,page}=await fixture();try{
  const bytes=await picture(page,2,2);bytes[26]=255;const data='data:image/png;base64,'+bytes.toString('base64');
  await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-advanced-toggle]').check();await page.locator('[data-st-tab="themes"]').click();await page.locator('[data-st-import-text]').fill(JSON.stringify({schemaVersion:2,name:'Broken pixels',values:{wallpaper:'upload',wallpaperData:data}}));await page.locator('[data-st-import-read]').click();await page.waitForFunction(()=>document.querySelector('[data-st-status]').classList.contains('stStatusError'),null,{timeout:2000});assert.equal(await page.locator('[data-st-import-confirm]').isVisible(),false);assert.equal(await page.evaluate(()=>SwiflyStudio.getRawSettings().wallpaperData),'');
 }finally{await context.close();}
});
