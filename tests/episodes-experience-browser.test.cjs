'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const {readShellStyle}=require('../lib/shell-styles');
const {loadServer}=require('./ui-helpers.cjs');
const artworkEntry=require('../ui/artwork-entry');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath());
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const episodes=Array.from({length:24},(_,index)=>({episode:index+1,name:index===0?'The long way home':'A chapter in the story '+(index+1),airDate:'2025-01-'+String(index+1).padStart(2,'0'),aired:true,runtime:42,...(index%4!==3?{still:'https://image.tmdb.org/t/p/w300/episode-'+index+'.jpg'}:{}),overview:'A quiet beginning becomes an unexpected journey. The next chapter brings familiar faces and a few surprises.'}));
function screenshot(page,name){const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});return page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});}
let fixtureHtml;
async function detailHtml(){
 if(!fixtureHtml)fixtureHtml=(async()=>{
  const api=loadServer();
  try{
   const show={id:5,name:'The long way home',overview:'A new chapter in a story worth staying for.',first_air_date:'2025-01-01',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',vote_average:8.1,episode_run_time:[42],number_of_seasons:2,genres:[],images:{logos:[]},seasons:[1,2].map(season=>({season_number:season,name:'Season '+season,episode_count:24,overview:'A new chapter in a story worth staying for.'}))};
   api.setTmdb(async endpoint=>endpoint==='/tv/5'?show:endpoint.endsWith('/credits')?{cast:[],crew:[]}:endpoint.endsWith('/external_ids')?{}:{results:[]});
   let html;await api.detailPage({params:{id:'5'},query:{},headers:{},protocol:'http',get:()=> 'episodes.fixture'},{send:value=>html=value},'tv');
   // Keep the actual pageShell order, including legacy detail styles before
   // the premium finish. Controllers are mounted explicitly below.
   return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g,(_tag,url)=>url.startsWith('/assets/')?'<style>'+(readShellStyle(url.split('?')[0])??asset(url.slice(8).split('?')[0]))+'</style>':'');
  }finally{api.io.close();api.httpServer.close();}
 })();
 return fixtureHtml;
}
async function fixture(browser,viewport){
 const page=await browser.newPage({viewport}),errors=[],html=await detailHtml();page.on('pageerror',error=>errors.push(error.message));
 try{
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='image.tmdb.org')return route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(__dirname,'../public/study/media/posters/sunset-train.webp'))});if(url.pathname.startsWith('/api/library/episodes/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({episodes})});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://episodes.fixture/tv/5');
 await page.evaluate(()=>{const preferences={episodeView:'grid',episodeSort:'oldest'};document.body.dataset.stGlass='liquid';window.SwiflyLibrary={preferences:()=>preferences,savePreferences:value=>Object.assign(preferences,value),renderDecorations(){}};});
 await page.addScriptTag({content:artworkEntry});
 for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js','clean/episode-browser.js'])await page.addScriptTag({content:asset(file)});
 await page.waitForFunction(()=>document.querySelectorAll('.svEpisodeBrowserCard').length===24&&document.documentElement.dataset.svArtworkState==='ready'&&getComputedStyle(document.querySelector('.svDetailBackdrop')).opacity==='1');return {page,errors};
 }catch(error){await screenshot(page,'episodes-fixture-'+viewport.width+'-failure');await page.close();throw error;}
}

async function assertMatte(page){
 assert.equal(await page.locator('#episodes .svLiquidPane,#episodes svg.svLiquidPane__filters').count(),0,'late metadata cannot allocate episode filters');
 const surfaces=await page.locator('#episodes,#episodes *').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,classes:node.className,filter:getComputedStyle(node).backdropFilter})).filter(node=>node.filter!=='none'));
 assert.deepEqual(surfaces,[],'every element in the real episode library stays matte');
 const backgrounds=await page.locator('#episodes .svSeason,#episodes .svEpisodeBrowserCard,#episodes .svDetailEpisodeDownload').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));
 assert(backgrounds.every(color=>/^rgb\(/.test(color)),'the episode panels, cards and downloads have opaque faces: '+JSON.stringify([...new Set(backgrounds)]));
}

test('episode library stays matte through metadata, focus, sorting and season changes at phone, iPad and desktop widths',{skip:!available&&'Chromium is not installed',timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['ipad',{width:820,height:1180}],['phone',{width:390,height:844}],['narrow',{width:320,height:800}]]){
   const {page,errors}=await fixture(browser,viewport);
   try{
    await page.locator('#episodes').scrollIntoViewIfNeeded();
    await screenshot(page,'episodes-'+name+'-loaded');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' must fit horizontally');
    await assertMatte(page);
    const target=await page.locator('.svDetailEpisodeDownload').first().boundingBox();assert(target.width>=44&&target.height>=44,'download keeps a real touch target without an optical pane');
    await page.locator('[data-episode-sort]').selectOption('newest');assert.equal(await page.locator('[data-library-episode]').first().getAttribute('data-library-episode'),'24');
    await page.locator('select[data-episode-view]').selectOption('rows');
    await screenshot(page,'episodes-'+name+'-rows');
    assert.equal(await page.locator('.dsEpisodeChips').first().evaluate(node=>getComputedStyle(node).display),'grid','Rows are a vertical list rather than another horizontal carousel');
    const rows=await page.locator('.svEpisodeBrowserCard').all();assert((await rows[1].boundingBox()).y>(await rows[0].boundingBox()).y,'row view advances vertically');
    await assertMatte(page);
    await page.locator('select[data-episode-view]').selectOption('grid');await screenshot(page,'episodes-'+name+'-grid');
    await page.locator('[data-episode-jump]').selectOption('2');await page.waitForFunction(()=>document.querySelector('[data-episode-season="2"]').dataset.episodeLoaded==='true');
    assert.equal(await page.locator('[data-episode-season="2"]').getAttribute('open'),'');assert.equal(await page.locator('[data-episode-jump]').inputValue(),'2');
    assert.equal(await page.evaluate(()=>document.activeElement?.closest('[data-episode-season]')?.dataset.episodeSeason),'2');
    await screenshot(page,'episodes-'+name+'-second-season');
    await assertMatte(page);assert.deepEqual(errors,[]);
   }catch(error){await screenshot(page,'episodes-'+name+'-failure');throw error;
   }finally{await page.close();}
  }
 }finally{await browser.close();}
});

test('episode hover and reduced motion keep focus visible without moving the card or blurring its image',{skip:!available&&'Chromium is not installed',timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const {page,errors}=await fixture(browser,{width:1280,height:900});
  try{
  await page.locator('.svEpisodeBrowserCard').first().scrollIntoViewIfNeeded();
  const card=page.locator('.svEpisodeBrowserCard').first(),before=await card.boundingBox();await card.hover();
  assert.deepEqual(await card.boundingBox(),before,'hover does not shift episode layout');
  // Enter through a real keyboard step so :focus-visible reflects keyboard
  // use, independently of the preceding pointer hover.
  await card.locator('.svDetailEpisodeDownload').focus();await page.keyboard.press('Shift+Tab');
  await screenshot(page,'episodes-keyboard-focus');
  const focus=await card.locator('.svDetailEpisodeTile').evaluate(node=>({active:document.activeElement===node,visible:node.matches(':focus-visible'),outline:getComputedStyle(node).outlineStyle,width:parseFloat(getComputedStyle(node).outlineWidth)}));
  assert(focus.active&&focus.visible,'keyboard navigation must reach the episode playback link');assert.equal(focus.outline,'solid');assert(focus.width>=2,'keyboard focus retains a visible frame');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await card.locator('.svEpisodePlaybackBadge').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  await screenshot(page,'episodes-focus-reduced-motion');await assertMatte(page);assert.deepEqual(errors,[]);
  }catch(error){await screenshot(page,'episodes-focus-failure');throw error;}finally{await page.close();}
 }finally{await browser.close();}
});

test('fractional detail artwork overscans its crop and shares an opaque seam color with the body',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const {page}=await fixture(browser,{width:1280,height:900});
  try{
  for(const scale of [1,.993,.981,.97]){
   await page.locator('.svTitleDetails').evaluate((node,value)=>{node.style.scale=value;node.style.transformOrigin='50% 0';},scale);
   const boxes=await page.evaluate(()=>{const hero=document.querySelector('.svDetailHero'),art=document.querySelector('.svDetailBackdrop'),shade=document.querySelector('.svDetailShade'),tail=getComputedStyle(hero,'::after');return {hero:hero.getBoundingClientRect().toJSON(),art:art.getBoundingClientRect().toJSON(),shade:shade.getBoundingClientRect().toJSON(),heroColor:getComputedStyle(hero).backgroundColor,tail:{bottom:tail.bottom,height:tail.height,background:tail.backgroundImage},body:getComputedStyle(document.querySelector('.svDetailBody')).backgroundImage};});
   await screenshot(page,'details-fractional-artwork-'+String(scale).replace('.','-'));
   assert(boxes.art.left<boxes.hero.left&&boxes.art.right>boxes.hero.right,'art extends beyond the fractional crop');assert(boxes.shade.bottom>boxes.hero.bottom,'shade overlaps the bottom edge');assert.equal(boxes.tail.bottom,'-2px');assert.match(boxes.tail.background,/rgb\(8, 11, 16\)/);assert.match(boxes.body,/rgb\(8, 11, 16\)/);assert.equal(boxes.heroColor,'rgb(8, 11, 16)','the hero fade and reading surface share the same opaque seam color');
  }
  }catch(error){await screenshot(page,'details-fractional-artwork-failure');throw error;}finally{await page.close();}
 }finally{await browser.close();}
});
