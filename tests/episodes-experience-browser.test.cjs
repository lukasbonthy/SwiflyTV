'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const {shellStyleLink,readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath());
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const css=['core','catalog','finish'].map(group=>readShellStyle(shellStyleLink(group).match(/href="([^"]+)/)[1])).join('\n');
const episodes=Array.from({length:24},(_,index)=>({episode:index+1,name:index===0?'The long way home':'A chapter in the story '+(index+1),airDate:'2025-01-'+String(index+1).padStart(2,'0'),aired:true,runtime:42,...(index%4!==3?{still:'https://image.tmdb.org/t/p/w300/episode-'+index+'.jpg'}:{}),overview:'A quiet beginning becomes an unexpected journey. The next chapter brings familiar faces and a few surprises.'}));
const fragment=`<article class="svTitleDetails" aria-labelledby="film-title"><section class="svDetailHero"><div class="svDetailBackdrop" style="background-image:linear-gradient(140deg,#9ba7b6,#294559 40%,#151b21 85%)"></div><div class="svDetailShade"></div><div class="svDetailIdentity"><span class="svDetailEdition">SwiflyTV / Series</span><h1 id="film-title" class="svDetailTitle">The long way home</h1><div class="svDetailActions"><a class="dsPrimaryBtn" href="/watch/tv/5">Watch series</a><button class="dsSecondaryBtn">Share</button></div></div></section><div class="svDetailBody"><nav class="svDetailChapterNav"><a href="#episodes">Episodes</a></nav><section id="episodes" class="svDetailSection"><div class="svEpisodeBrowserHead"><h2>Episodes</h2><div class="svEpisodeBrowserControls"><label>View<select data-episode-view><option value="grid">Grid</option><option value="rows">Rows</option></select></label><label>Order<select data-episode-sort><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label></div></div>${[1,2].map(season=>`<details class="svSeason" data-episode-show="5" data-episode-season="${season}"${season===1?' open':''}><summary><span class="svSeasonIdentity"><b class="svSeasonNumber">0${season}</b><strong>Season ${season}</strong></span><span>24 episodes</span></summary><p>A new chapter in a story worth staying for.</p><div class="dsEpisodeChips"></div></details>`).join('')}</section></div></article>`;
function screenshot(page,name){const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});return page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});}
async function fixture(browser,viewport){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='image.tmdb.org')return route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(__dirname,'../public/study/media/posters/sunset-train.webp'))});if(url.pathname.startsWith('/api/library/episodes/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({episodes})});return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0}'+asset('player/player.css')+'</style><body class="svCleanShell" data-st-glass="liquid"><main class="dsDetailPage svDetailPage svCinemaPage">'+fragment+'</main></body>'});});
 await page.goto('http://episodes.fixture/tv/5');
 await page.evaluate(()=>{const preferences={episodeView:'grid',episodeSort:'oldest'};window.SwiflyLibrary={preferences:()=>preferences,savePreferences:value=>Object.assign(preferences,value),renderDecorations(){}};});
 for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js','clean/episode-browser.js'])await page.addScriptTag({content:asset(file)});
 await page.waitForFunction(()=>document.querySelectorAll('.svEpisodeBrowserCard').length===24);return {page,errors};
}

test('episode library stays matte through metadata, focus, sorting and season changes at phone, iPad and desktop widths',{skip:!available&&'Chromium is not installed',timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['ipad',{width:820,height:1180}],['phone',{width:390,height:844}],['narrow',{width:320,height:800}]]){
   const {page,errors}=await fixture(browser,viewport);
   try{
    await page.locator('#episodes').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' must fit horizontally');
    assert.equal(await page.locator('#episodes .svLiquidPane,#episodes svg.svLiquidPane__filters').count(),0,'late metadata cannot allocate episode filters');
    const target=await page.locator('.svDetailEpisodeDownload').first().boundingBox();assert(target.width>=44&&target.height>=44,'download keeps a real touch target without an optical pane');
    const filters=await page.locator('#episodes,#episodes a,#episodes summary,#episodes button').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backdropFilter));assert(filters.every(filter=>filter==='none'),'every episode surface is matte: '+JSON.stringify([...new Set(filters)]));
    await page.locator('[data-episode-sort]').selectOption('newest');assert.equal(await page.locator('[data-library-episode]').first().getAttribute('data-library-episode'),'24');
    await page.locator('[data-episode-view]').selectOption('rows');
    assert.equal(await page.locator('.dsEpisodeChips').first().evaluate(node=>getComputedStyle(node).display),'grid','Rows are a vertical list rather than another horizontal carousel');
    const rows=await page.locator('.svEpisodeBrowserCard').all();assert((await rows[1].boundingBox()).y>(await rows[0].boundingBox()).y,'row view advances vertically');
    await screenshot(page,'episodes-'+name+'-rows');
    await page.locator('[data-episode-view]').selectOption('grid');await screenshot(page,'episodes-'+name+'-grid');
    await page.locator('[data-episode-jump]').selectOption('2');await page.waitForFunction(()=>document.querySelector('[data-episode-season="2"]').dataset.episodeLoaded==='true');
    assert.equal(await page.locator('[data-episode-season="2"]').getAttribute('open'),'');assert.equal(await page.locator('[data-episode-jump]').inputValue(),'2');
    assert.equal(await page.evaluate(()=>document.activeElement?.closest('[data-episode-season]')?.dataset.episodeSeason),'2');
    assert.equal(await page.locator('#episodes .svLiquidPane').count(),0);assert.deepEqual(errors,[]);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
});

test('episode hover and reduced motion keep focus visible without moving the card or blurring its image',{skip:!available&&'Chromium is not installed',timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const {page,errors}=await fixture(browser,{width:1280,height:900});
  await page.locator('.svEpisodeBrowserCard').first().scrollIntoViewIfNeeded();
  const card=page.locator('.svEpisodeBrowserCard').first(),before=await card.boundingBox();await card.hover();
  assert.deepEqual(await card.boundingBox(),before,'hover does not shift episode layout');
  await card.locator('.svDetailEpisodeTile').focus();assert.equal(await card.locator('.svDetailEpisodeTile').evaluate(node=>getComputedStyle(node).outlineStyle),'solid');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await card.locator('.svEpisodePlaybackBadge').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  assert.deepEqual(errors,[]);await page.close();
 }finally{await browser.close();}
});

test('fractional detail artwork overscans its crop and shares an opaque seam color with the body',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const {page}=await fixture(browser,{width:1280,height:900});
  for(const scale of [1,.993,.981,.97]){
   await page.locator('.svTitleDetails').evaluate((node,value)=>{node.style.scale=value;node.style.transformOrigin='50% 0';},scale);
   const boxes=await page.evaluate(()=>{const hero=document.querySelector('.svDetailHero'),art=document.querySelector('.svDetailBackdrop'),shade=document.querySelector('.svDetailShade'),tail=getComputedStyle(hero,'::after');return {hero:hero.getBoundingClientRect().toJSON(),art:art.getBoundingClientRect().toJSON(),shade:shade.getBoundingClientRect().toJSON(),tail:{bottom:tail.bottom,height:tail.height,background:tail.backgroundImage},body:getComputedStyle(document.querySelector('.svDetailBody')).backgroundImage};});
   assert(boxes.art.left<boxes.hero.left&&boxes.art.right>boxes.hero.right,'art extends beyond the fractional crop');assert(boxes.shade.bottom>boxes.hero.bottom,'shade overlaps the bottom edge');assert.equal(boxes.tail.bottom,'-2px');assert.match(boxes.tail.background,/rgb\(8, 11, 16\)/);assert.match(boxes.body,/rgb\(8, 11, 16\)/);
  }
  await screenshot(page,'details-fractional-artwork-seam');await page.close();
 }finally{await browser.close();}
});
