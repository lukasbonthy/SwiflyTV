'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles'),{searchMarkup}=require('../ui/discovery');
const available=fs.existsSync(chromium.executablePath()),asset=name=>fs.readFileSync(path.join(__dirname,'../public/clean',name),'utf8');

test('featured artwork preserves wrapped fallback layout at large text sizes on mobile, tablet and TV',{skip:!available},async()=>{
 const api=loadServer(),browser=await chromium.launch({headless:true});try{
  const movie={id:346698,title:'Spider-Man: No Way Home',backdrop_path:'/art.jpg',images:{logos:[{file_path:'/logo.png',iso_639_1:'en',width:500,height:200}]}};api.setTmdb(async endpoint=>endpoint==='/movie/346698'?movie:{results:[]});let html;await api.homePage({},{send:value=>html=value});
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g,(_tag,url)=>url.startsWith('/assets/')?'<style>'+(readShellStyle(url.split('?')[0])??fs.readFileSync(path.join(__dirname,'../public',url.slice(8).split('?')[0]),'utf8'))+'</style>':'');
  for(const [width,tv]of [[360,false],[768,false],[1920,true]]){
   const page=await browser.newPage({viewport:{width,height:900}});let releaseLogo;const pending=new Promise(resolve=>releaseLogo=resolve);
   await page.route('**/*',async route=>{if(route.request().url().endsWith('/logo.png')){await pending;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200"><text y="100">Film logo</text></svg>'});}return route.fulfill({body:''});});
   await page.setContent(html,{waitUntil:'domcontentloaded'});await page.evaluate(tv=>{document.body.style.setProperty('--st-ui-scale','1.2');if(tv)document.documentElement.dataset.svTv='true';},tv);await page.addScriptTag({content:asset('catalog.js')});
   const boxes=()=>page.evaluate(()=>{const title=document.querySelector('.dsHeroTitleArt'),text=title.querySelector('.dsHeroTitleText'),meta=document.querySelector('.dsHeroMeta');return {title:title.getBoundingClientRect().toJSON(),text:text.getBoundingClientRect().toJSON(),meta:meta.getBoundingClientRect().toJSON(),loaded:title.classList.contains('hasLogo')};});
   const before=await boxes();assert(before.text.bottom<=before.meta.top,width+'px fallback must not overlap metadata');assert.equal(before.loaded,false);releaseLogo();await page.waitForFunction(()=>document.querySelector('.dsHeroTitleArt').classList.contains('hasLogo'));const after=await boxes();assert.equal(after.title.height,before.title.height);assert.equal(after.meta.top,before.meta.top);await page.close();
  }
 }finally{await browser.close();api.io.close();}
});

test('row boundaries and async search replacement retain real browser keyboard focus',{skip:!available},async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<button id="svNavSearchToggle">Search</button>'+searchMarkup()+'<section class="dsRow"><div class="dsRowControls"><button>Previous</button><button>Next</button></div><div class="movieRail" style="width:300px;overflow:auto"><div style="width:900px">Movies</div></div></section>');await page.addScriptTag({content:asset('catalog.js')});await page.getByRole('button',{name:'Next',exact:true}).focus();await page.locator('.movieRail').evaluate(rail=>{rail.scrollLeft=600;rail.dispatchEvent(new Event('scroll'));});await page.waitForFunction(()=>document.querySelector('.dsRowControls button:last-child').getAttribute('aria-disabled')==='true');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Next');
  await page.evaluate(()=>{window.searchRequests=[];window.fetch=()=>new Promise(resolve=>searchRequests.push(resolve));});await page.addScriptTag({content:asset('clean.js')});await page.click('#svNavSearchToggle');await page.fill('#svNavSearchInput','Barbie');await page.waitForFunction(()=>searchRequests.length===1);await page.evaluate(()=>searchRequests.shift()({ok:true,json:async()=>({results:[{title:'Barbie',type:'movie',href:'/movie/1'}]})}));
  await page.waitForSelector('[data-search-result]');await page.fill('#svNavSearchInput','Barbie movie');await page.waitForFunction(()=>searchRequests.length===1);await page.keyboard.press('ArrowDown');await page.evaluate(()=>searchRequests.shift()({ok:true,json:async()=>({results:[{title:'Barbie updated',type:'movie',href:'/movie/1'}]})}));await page.waitForFunction(()=>document.activeElement.textContent.includes('Barbie updated'));assert.equal(await page.locator('#svNavSearchPopup').isVisible(),true);
 }finally{await browser.close();}
});
