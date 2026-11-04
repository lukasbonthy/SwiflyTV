'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath()),root=path.join(__dirname,'../public');
let browser,api;
test.before(async()=>{if(available){browser=await chromium.launch({headless:true,executablePath});api=loadServer();}});
test.after(async()=>{await browser?.close();api?.io.close();});
const film={id:100,title:'Resident Evil',media_type:'movie',backdrop_path:'/forest.jpg',poster_path:'/poster.jpg',overview:'A medical courier must survive a night of horror when a delivery takes her down a remote road. A terrifying new story begins.',vote_average:7.5,release_date:'2026-09-01',runtime:95,genres:[{name:'Horror'},{name:'Science Fiction'}],images:{logos:[{file_path:'/resident-logo.png',iso_639_1:'en',width:900,height:210}]}};
async function open(width=1920,{home=false,scale=1}={}){
 const context=await browser.newContext({viewport:{width,height:936}}),page=await context.newPage();
 let releaseLate;const late=new Promise(resolve=>releaseLate=resolve);
 api.setTmdb(async endpoint=>endpoint==='/movie/100'?film:endpoint==='/movie/346698'?{...film,id:346698}:{results:Array.from({length:10},(_,i)=>({...film,id:100+i,images:undefined})),genres:[],total_pages:1});
 let html;await api[home?'homePage':'trendingPage'](home?{}:{query:{}},{send:value=>html=value});
 html=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attrs)=>/data-sv-(?:loading|artwork|studio-(?:config|prime))/.test(attrs)?script:'');
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),type=route.request().resourceType(),bundled=readShellStyle(url.pathname);
  if(type==='document')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname.endsWith('/late-poster.svg'))await late;
  if(bundled!==undefined)return route.fulfill({contentType:'text/css',body:bundled});
  if(url.pathname.startsWith('/assets/')){const file=path.join(root,url.pathname.slice(8));if(fs.existsSync(file)&&file.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(file)});}
  return route.fulfill({contentType:type==='stylesheet'?'text/css':'image/svg+xml',body:type==='stylesheet'?'':'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="210"><rect width="900" height="210" fill="#38161c"/><text x="15" y="145" font-size="120" fill="#f24b63">RESIDENT EVIL</text></svg>'});
 });
 await page.goto('https://swifly.test/');
 await page.evaluate(scale=>document.body.style.setProperty('--st-ui-scale',scale),String(scale));
 for(const name of ['clean/catalog.js','liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
 await page.waitForSelector('.dsHeroTitleArt.hasLogo');await page.waitForSelector('.dsHeroActions .svNavMatchedLens',{state:'attached'});await page.waitForSelector('html[data-sv-artwork-state="ready"]');
 return {page,context,releaseLate};
}
test('featured composition is readable and actions fit at desktop and narrow widths',{skip:!available},async()=>{
 for(const width of [1920,1440,390,320]){
  const f=await open(width,{scale:width===320?1.2:1});try{
   const layout=await f.page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON(),play=document.querySelector('.dsHeroActions > .dsPrimaryBtn');
    return {clientWidth:document.documentElement.clientWidth,hero:box('.dsHero'),copy:box('.dsHeroContent'),title:box('.dsHeroTitleArt'),meta:box('.dsHeroMeta'),overview:box('.dsHeroContent > p'),actions:[...document.querySelectorAll('.dsHeroActions > :is(a,button)')].map(node=>node.getBoundingClientRect().toJSON()),playColor:getComputedStyle(play).color,playFill:getComputedStyle(play.querySelector('.svNavMatchedLens')).backgroundColor,overviewSize:parseFloat(getComputedStyle(document.querySelector('.dsHeroContent > p')).fontSize),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(layout.overflow,false,JSON.stringify({width,layout}));assert(layout.title.bottom<=layout.meta.top);assert(layout.meta.bottom<=layout.overview.top);
   assert(layout.actions.every(box=>box.left>=0&&box.right<=width&&box.height>=44),'all actions must fit with a usable target at '+width);
   assert.equal(layout.playColor,'rgb(16, 17, 21)');assert.match(layout.playFill,/255, 255, 255/);
   assert.equal(await f.page.locator('.dsHeroMeta b > [aria-hidden]').evaluate(node=>getComputedStyle(node).padding),'0px','rating star must not inherit a legacy metadata pill');
   if(width>=1440){assert(layout.title.top>320,'feature copy should sit low in the photograph');assert(Math.abs(layout.copy.x-Math.max(48,(layout.hero.width-1480)/2))<1,JSON.stringify(layout));assert.equal(layout.overviewSize,16);assert(layout.hero.bottom<936,'the hero must leave room for the catalog below');}
   assert.equal(await f.page.getByRole('link',{name:'Play',exact:true}).getAttribute('href'),'/watch/movie/100?mode=movie');
  }finally{await f.context.close();}
 }
});
test('Studio compact and banner heroes retain their chosen heights and primary contrast without glass',{skip:!available},async()=>{
 const f=await open(1440,{home:true});try{
  const heights=[];for(const mode of ['cinematic','compact','banner']){await f.page.evaluate(mode=>document.body.dataset.stHeroMode=mode,mode);heights.push(await f.page.locator('.dsHero').evaluate(node=>node.getBoundingClientRect().height));}
  assert(heights[0]>heights[1]&&heights[1]>heights[2],JSON.stringify(heights));
  for(const mode of ['off','subtle']){await f.page.evaluate(mode=>document.body.dataset.stGlass=mode,mode);await f.page.waitForFunction(()=>getComputedStyle(document.querySelector('.dsHeroActions > .dsPrimaryBtn')).backgroundColor==='rgb(245, 245, 246)');}
 }finally{await f.context.close();}
});
test('real catalog CSS preserves the decode fade on newly inserted posters',{skip:!available},async()=>{
 const f=await open();try{
  const card=api.movieCard({...film,id:999,poster_path:'/late-poster.svg'},'movie');
  await f.page.evaluate(html=>document.querySelector('.dsContent').insertAdjacentHTML('afterbegin',html),card);
  const image=f.page.locator('img[src$="/late-poster.svg"]');await f.page.waitForFunction(()=>document.querySelector('img[src$="/late-poster.svg"]').classList.contains('svArtworkAsset'));
  assert.equal(await image.evaluate(node=>getComputedStyle(node).opacity),'0','later catalog styles must not override the pending-artwork state');
  f.releaseLate();await f.page.waitForFunction(()=>{const image=document.querySelector('img[src$="/late-poster.svg"]');return image.classList.contains('svArtworkReady')&&Number(getComputedStyle(image).opacity)>0&&Number(getComputedStyle(image).opacity)<1;});
  await f.page.waitForFunction(()=>getComputedStyle(document.querySelector('img[src$="/late-poster.svg"]')).opacity==='1');
 }finally{f.releaseLate();await f.context.close();}
});
