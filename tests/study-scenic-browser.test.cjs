'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const {studyMarkup}=require('../ui/study');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath());
const publicRoot=path.resolve(__dirname,'../public');
let browser,api;
test.before(async()=>{if(!available)return;api=loadServer();browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();api?.io.close();});
async function capture(page,name){const directory=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR||process.env.SWIFLY_STUDY_SCREENSHOT_DIR;if(!directory)return;fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});}
async function open(viewport){
 const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const html=api.pageShell({active:'study',title:'SwiflyTV — Study',body:studyMarkup(),extraHead:'<link rel="stylesheet" href="/assets/study/study.css">'}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attributes)=>/data-sv-studio-(?:config|prime)/.test(attributes)?script:'');
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),kind=route.request().resourceType(),bundled=readShellStyle(url.pathname);
  if(kind==='document')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/study/catalog')return route.fulfill({json:require('../public/study/catalog.json')});
  if(url.pathname==='/api/study/focus')return route.fulfill({json:{board:[],communityMinutes:0,scope:'this-server-session'}});
  if(bundled!==undefined)return route.fulfill({contentType:'text/css',body:bundled});
  if(url.pathname.startsWith('/assets/')){const file=path.resolve(publicRoot,url.pathname.slice(8));if(file.startsWith(publicRoot+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){const extension=path.extname(file),types={'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.mp3':'audio/mpeg','.json':'application/json'};return route.fulfill({contentType:types[extension]||'application/octet-stream',body:fs.readFileSync(file)});}}
  return route.fulfill({contentType:kind==='stylesheet'?'text/css':'text/plain',body:''});
 });
 await page.goto('https://swifly.test/study');
 await page.evaluate(()=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main'}));window.SwiflyAccount={ready:Promise.resolve({user:{id:'scenic-test'}}),user:{id:'scenic-test'}};});
 await page.addScriptTag({content:fs.readFileSync(path.join(publicRoot,'studio/config.js'),'utf8')});
 await page.addScriptTag({content:fs.readFileSync(path.join(publicRoot,'study/study.js'),'utf8')});
 await page.waitForFunction(()=>document.querySelectorAll('[data-study-track]').length===19);
 await page.locator('[data-study-poster]').evaluate(image=>image.decode());
 return {page,context,errors};
}

test('Scenic Study fills the actual shell while dock, timer and drawers fit phone, iPad and desktop',{skip:!available},async()=>{
 for(const [name,viewport]of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}],['ipad',{width:1024,height:1366}]]){
  const f=await open(viewport);try{
   const root=await f.page.locator('[data-study-root]').boundingBox(),stage=await f.page.locator('[data-study-stage]').boundingBox();
   await capture(f.page,'study-shell-'+name);
   assert(stage.width>=viewport.width-2,name+' scene fills the shell: '+JSON.stringify({root,stage,viewport}));assert(stage.height>=viewport.height-2,name+' scene fills viewport height');assert(root.y<=2,name+' scenery begins behind the existing fixed navigation');
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' has no horizontal overflow');
   for(const selector of ['.studyHeading','.studyPlayer','.studyToolsDock','.studyTimer']){const box=await f.page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1,name+' '+selector+' fits the viewport');}
   assert.equal(await f.page.locator('[data-study-workspace]').isVisible(),false);
   await f.page.locator('[data-study-tab="scenes"]').click();assert(await f.page.locator('#study-panel-scenes').isVisible());await capture(f.page,'study-shell-'+name+'-scenes');
   await f.page.locator('[data-study-scene="moon-cat"]').click();assert.equal(await f.page.locator('[data-study-scene-name]').textContent(),'pink city cat');
   await f.page.locator('[data-study-close-tools]').click();assert(await f.page.locator('[data-study-tab="scenes"]').evaluate(element=>element===document.activeElement));
   await f.page.locator('[data-study-tab="focus"]').click();await f.page.locator('[data-study-task-input]').fill('Read a little');await f.page.locator('[data-study-task-input]').press('Enter');assert.match(await f.page.locator('[data-study-tasks]').textContent(),/Read a little/);await capture(f.page,'study-shell-'+name+'-tasks');
   await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-study-workspace]').isVisible(),false);
   assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
 }
});
