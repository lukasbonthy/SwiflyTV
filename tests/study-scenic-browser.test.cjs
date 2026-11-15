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
async function assertPanels(page,name){
 const dock=await page.locator('.studyToolsDock').boundingBox(),player=await page.locator('.studyPlayer').boundingBox();
 assert(dock.y+dock.height<=player.y-10,name+' tools must clear the player by at least10px: '+JSON.stringify({dock,player}));
 const fullscreen=await page.evaluate(()=>Boolean(document.fullscreenElement)),nav=page.locator('.mobileNav').first();
 if(!fullscreen&&await nav.isVisible()){const box=await nav.boundingBox();assert(player.y+player.height<=box.y-10,name+' player must clear site navigation: '+JSON.stringify({player,nav:box}));}
 const workspace=page.locator('[data-study-workspace]');if(await workspace.isVisible()){const box=await workspace.boundingBox();assert(box.y+box.height<=dock.y-10,name+' drawer must clear tools');}
 const timer=page.locator('.studyTimer');if(await timer.isVisible()){const box=await timer.boundingBox();assert(box.y+box.height<=dock.y-10||box.x+box.width<=dock.x-10||box.x>=dock.x+dock.width+10,name+' timer must clear tools');}
 const caption=page.locator('.studySceneCaption');if(await caption.isVisible()){const box=await caption.boundingBox();assert(box.y+box.height<=dock.y-4,name+' scene caption must clear the tools');}
}
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
 for(const [name,viewport]of [['desktop',{width:1440,height:900}],['small-tablet',{width:720,height:1000}],['short-tablet',{width:720,height:800}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}],['ipad',{width:1024,height:1366}]]){
  const f=await open(viewport);try{
   const root=await f.page.locator('[data-study-root]').boundingBox(),stage=await f.page.locator('[data-study-stage]').boundingBox();
   await capture(f.page,'study-shell-'+name);await assertPanels(f.page,name);
   assert(stage.width>=viewport.width-2,name+' scene fills the shell: '+JSON.stringify({root,stage,viewport}));assert(stage.height>=viewport.height-2,name+' scene fills viewport height');assert(root.y<=2,name+' scenery begins behind the existing fixed navigation');
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' has no horizontal overflow');
   for(const selector of ['.studyHeading','.studyPlayer','.studyToolsDock','.studyTimer']){const box=await f.page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1,name+' '+selector+' fits the viewport');}
   assert.equal(await f.page.locator('[data-study-workspace]').isVisible(),false);
   const heading=await f.page.locator('.studyHeading').boundingBox(),sceneTop=await f.page.locator('.studyStageTop').boundingBox();assert(heading.y+heading.height<=sceneTop.y-4,name+' page controls must not overlap the scene status');
   await f.page.locator('[data-study-tab="scenes"]').click();await assertPanels(f.page,name+' drawer');assert(await f.page.locator('#study-panel-scenes').isVisible());await capture(f.page,'study-shell-'+name+'-scenes');
   await f.page.locator('[data-study-scene="moon-cat"]').click();assert.equal(await f.page.locator('[data-study-scene-name]').textContent(),'pink city cat');
   await f.page.locator('[data-study-close-tools]').click();assert(await f.page.locator('[data-study-tab="scenes"]').evaluate(element=>element===document.activeElement));
   await f.page.locator('[data-study-tab="focus"]').click();await f.page.locator('[data-study-task-input]').fill('Read a little');await f.page.locator('[data-study-task-input]').press('Enter');assert.match(await f.page.locator('[data-study-tasks]').textContent(),/Read a little/);await capture(f.page,'study-shell-'+name+'-tasks');
   await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-study-workspace]').isVisible(),false);
   assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
 }
});


test('Saved Scenic layout keeps every timer control within its panel at wide and narrow widths',{skip:!available},async()=>{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['ipad',{width:834,height:1112}],['small-tablet',{width:720,height:1000}],['short-tablet',{width:720,height:800}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}]]){
  const f=await open(viewport);try{
   await f.page.locator('[data-study-tab="sound"]').click();
   await f.page.locator('select[data-study-layout]').selectOption('scenic');
   await f.page.locator('[data-study-close-tools]').click();
   assert.equal(await f.page.locator('[data-study-root]').getAttribute('data-study-layout'),'scenic');
   const geometry=await f.page.locator('.studyTimer').evaluate(timer=>{const box=timer.getBoundingClientRect();return{box:box.toJSON(),scrollWidth:timer.scrollWidth,clientWidth:timer.clientWidth,children:[...timer.querySelectorAll('button,output,input')].map(child=>child.getBoundingClientRect().toJSON())};});
   assert(geometry.scrollWidth<=geometry.clientWidth,name+' Scenic timer must not overflow');
   assert(geometry.children.every(box=>box.left>=geometry.box.left&&box.right<=geometry.box.right+1),name+' Scenic timer controls must fit their panel');
   const timer=await f.page.locator('.studyTimer').boundingBox(),caption=await f.page.locator('.studySceneCaption').boundingBox();assert(!caption||timer.y+timer.height<=caption.y-4||timer.x+timer.width<=caption.x,name+' Scenic timer must clear its scene caption');
   await capture(f.page,'study-shell-'+name+'-scenic');await assertPanels(f.page,name+' Scenic');
   await f.page.evaluate(()=>{window.SwiflyAppearance={largeTargets:true};document.dispatchEvent(new CustomEvent('swifly:studio-change',{detail:{effective:window.SwiflyAppearance}}));});
   const accessible=await f.page.locator('.studyTimer').evaluate(timer=>{const box=timer.getBoundingClientRect();return[...timer.querySelectorAll('button,output,input')].every(child=>{const r=child.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right+1;});});assert(accessible,name+' Scenic large targets must fit the timer');
   await capture(f.page,'study-shell-'+name+'-scenic-large');await assertPanels(f.page,name+' Scenic large');
   await f.page.locator('[data-study-tab="sound"]').click();await f.page.locator('select[data-study-layout]').selectOption('focus');await f.page.locator('[data-study-close-tools]').click();
   const focus=await f.page.locator('.studyTimer').boundingBox();assert(focus.y>=180,name+' large Focus timer must clear navigation and page controls');
   await capture(f.page,'study-shell-'+name+'-focus-large');await assertPanels(f.page,name+' Focus large');
   await f.page.evaluate(()=>{window.SwiflyAppearance={};document.dispatchEvent(new CustomEvent('swifly:studio-change',{detail:{effective:{}}}));});
   await f.page.locator('[data-study-fullscreen]').click();await f.page.waitForFunction(()=>document.fullscreenElement===document.querySelector('[data-study-root]'));
   const fullscreen=await f.page.locator('.studyTimer').boundingBox();assert(fullscreen.y>=140,name+' fullscreen Focus timer must clear its room controls');
   await capture(f.page,'study-shell-'+name+'-focus-fullscreen');await assertPanels(f.page,name+' fullscreen Focus');
   await f.page.evaluate(()=>document.exitFullscreen());assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
 }
});
