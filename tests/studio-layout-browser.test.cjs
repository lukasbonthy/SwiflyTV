'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const root=path.join(__dirname,'../public'),asset=name=>fs.readFileSync(path.join(root,name),'utf8');
let browser,api;
test.before(async()=>{if(available){api=loadServer();browser=await chromium.launch({headless:true,executablePath});}});
test.after(async()=>{await browser?.close();api?.io.close();});
async function open(viewport={width:1440,height:900},tv=false){
 const context=await browser.newContext({viewport}),page=await context.newPage();
 const cards=Array.from({length:12},(_,i)=>api.movieCard({id:i+1,title:'Film '+(i+1),poster_path:'/poster.jpg',backdrop_path:'/art.jpg'},'movie')).join('');
 const row='<section class="dsRow svCatalogRow" data-st-home-section="trending-movies"><div class="svSectionHead"><h2>Trending movies</h2><div class="svSectionActions"><div class="dsRowControls"><button class="dsRowBtn">Previous</button><button class="dsRowBtn">Next</button></div></div></div><div class="movieRail dsRail">'+cards+'</div></section>';
 let html=api.pageShell({active:'home',body:'<main data-st-home><section class="dsContent noHero" data-st-home-rows>'+row+'</section></main>'}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attrs)=>/data-sv-studio-(?:config|prime)/.test(attrs)?script:'');
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),type=route.request().resourceType(),bundled=readShellStyle(url.pathname);
  if(type==='document')return route.fulfill({contentType:'text/html',body:html});
  if(bundled!==undefined)return route.fulfill({contentType:'text/css',body:bundled});
  if(url.pathname.startsWith('/assets/')&&/\.(css|svg)$/.test(url.pathname)){const file=path.join(root,url.pathname.slice(8));if(fs.existsSync(file))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(file)});}
  return route.fulfill({contentType:type==='stylesheet'?'text/css':'image/svg+xml',body:type==='stylesheet'?'':'<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#345"/></svg>'});
 });
 async function controllers(){for(const file of ['studio/config.js','studio/studio.js','studio/experience.js','clean/catalog.js'])await page.addScriptTag({content:asset(file)});}
 await page.goto('https://swifly.test/');if(tv)await page.evaluate(()=>document.documentElement.dataset.svTv='true');await controllers();
 async function studio(){await page.evaluate(()=>SwiflyStudio.open());await page.locator('[data-st-tab="layout"]').click();}
 await studio();
 return {page,context,studio,reload:async()=>{await page.reload();await controllers();}};
}
const geometry=page=>page.locator('.movieCard').first().evaluate(card=>{const art=card.querySelector('.dsThumb'),rail=card.parentElement;return {width:art.getBoundingClientRect().width,height:art.getBoundingClientRect().height,radius:parseFloat(getComputedStyle(art).borderRadius),gap:parseFloat(getComputedStyle(rail).columnGap),railWidth:rail.clientWidth,columns:getComputedStyle(rail).gridTemplateColumns,flow:getComputedStyle(rail).gridAutoFlow,overflow:document.documentElement.scrollWidth>innerWidth+1};});

test('Cinema rows visibly change artwork shape and survive Save, reload and Cancel',{skip:!available},async()=>{
 const f=await open();try{
  const before=await geometry(f.page);await f.page.locator('[data-st-field="layout"][data-st-value="cinema"]').click();const cinema=await geometry(f.page);
  assert(Math.abs(cinema.width/cinema.height-16/9)<.02,'Cinema must produce landscape cards: '+JSON.stringify({before,cinema}));assert(cinema.width>before.width+20,'Cinema should show larger cards');
  await f.page.locator('[data-st-save]').click();await f.reload();const saved=await geometry(f.page);assert(Math.abs(saved.width/saved.height-16/9)<.02);
  await f.studio();await f.page.locator('[data-st-field="layout"][data-st-value="default"]').click();assert(Math.abs((await geometry(f.page)).width/(await geometry(f.page)).height-2/3)<.02);await f.page.locator('[data-st-cancel]').last().click();assert(Math.abs((await geometry(f.page)).width/(await geometry(f.page)).height-16/9)<.02);
 }finally{await f.context.close();}
});

test('poster width controls rails independently of the grid column control',{skip:!available},async()=>{
 const f=await open();try{
  await f.page.locator('[data-st-advanced-toggle]').check();
  await f.page.locator('[data-st-input="posterWidth"]').fill('260');assert(Math.abs((await geometry(f.page)).width-260)<1,'poster width must not be silently capped by Grid columns');
  await f.page.locator('[data-st-input="homeColumns"]').fill('8');assert(Math.abs((await geometry(f.page)).width-260)<1,'Grid columns should not shrink horizontal rail posters');
  await f.page.locator('[data-st-input="rowShape"]').selectOption('grid');const grid=await geometry(f.page);assert.equal(grid.flow,'row');assert.equal(grid.columns.split(' ').length,8);assert.equal(grid.overflow,false);
 }finally{await f.context.close();}
});

test('corners, spacing and Poster wall controls change the rendered catalog',{skip:!available},async()=>{
 const f=await open();try{
  await f.page.locator('[data-st-field="cardstyle"][data-st-value="sharp"]').click();assert.equal((await geometry(f.page)).radius,3);
  await f.page.locator('[data-st-field="cardstyle"][data-st-value="softglass"]').click();assert.equal((await geometry(f.page)).radius,20);
  await f.page.locator('[data-st-field="density"][data-st-value="compact"]').click();assert.equal((await geometry(f.page)).gap,10);
  await f.page.locator('[data-st-field="layout"][data-st-value="posterwall"]').click();const wall=await geometry(f.page);assert.equal(wall.flow,'row');assert.equal(wall.overflow,false);assert.equal(await f.page.locator('.dsRowControls').isVisible(),false);
 }finally{await f.context.close();}
});

test('mobile Cinema, custom width and grids remain usable without page overflow',{skip:!available},async()=>{
 const f=await open({width:390,height:844});try{
  await f.page.locator('[data-st-field="layout"][data-st-value="cinema"]').click();let art=await geometry(f.page);assert(Math.abs(art.width/art.height-16/9)<.02);assert.equal(art.overflow,false);
  await f.page.locator('[data-st-advanced-toggle]').check();await f.page.locator('[data-st-input="posterWidth"]').fill('240');art=await geometry(f.page);assert(Math.abs(art.width-240)<1);
  await f.page.locator('[data-st-input="rowShape"]').selectOption('grid');art=await geometry(f.page);assert.equal(art.columns.split(' ').length,2);assert.equal(art.overflow,false);
  await f.page.locator('[data-st-field="cardstyle"][data-st-value="sharp"]').click();assert.equal((await geometry(f.page)).radius,3);
 }finally{await f.context.close();}
});

test('quick-action and hover choices affect the actual cards and TV retains its safe rails',{skip:!available},async()=>{
 const f=await open();try{
  await f.page.locator('[data-st-input="posterActions"]').selectOption('always');assert.equal(await f.page.locator('.dsCardQuickActions').first().evaluate(node=>getComputedStyle(node).opacity),'1');
  await f.page.locator('[data-st-input="posterHover"]').selectOption('zoom');await f.page.locator('[data-st-save]').click();await f.page.locator('.dsCardArtwork').first().hover();await f.page.waitForFunction(()=>getComputedStyle(document.querySelector('.dsThumb > img')).transform!=='none');
 }finally{await f.context.close();}
 const television=await open({width:1920,height:1080},true);try{
  await television.page.locator('[data-st-field="layout"][data-st-value="cinema"]').click();const art=await geometry(television.page);assert(Math.abs(art.width/art.height-2/3)<.02,'TV keeps its controller-safe poster geometry');assert.equal(art.flow,'column');assert.equal(art.overflow,false);
 }finally{await television.context.close();}
});
