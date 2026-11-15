'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {chromium}=require('playwright-core');
const {createKids}=require('../lib/kids');
const sectionStyles=fs.readFileSync(path.join(__dirname,'../public/clean/section-pages.css'),'utf8');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const titles=Array.from({length:18},(_,index)=>({id:index+1,title:['Cloud Friends','A Garden Adventure','The Little Voyage','Puddle Jumpers','A Very Good Day','Moonlight Picnic'][index%6]+(index>5?' '+(Math.floor(index/6)+1):''),adult:false,genres:[{id:16},{id:10751}],overview:'A little explorer finds new friends, plenty of laughter and a place to call home.',poster_path:'/kids-'+(index+1)+'.jpg',release_date:'2026-05-03'}));
let server,browser,origin;
const documentHtml=(body,head='')=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+head+'<style>body{font-family:Arial,sans-serif;background:#000;color:#eee}'+sectionStyles+'</style><link rel="stylesheet" href="/assets/kids/kids.css?v=1"><script defer src="/assets/kids/guard.js?v=1"></script></head><body class="svCleanShell" style="margin:0">'+body+'</body></html>';
async function tmdb(route,params={}){
 const match=/^\/(movie|tv)\/(\d+)(?:\/(release_dates|content_ratings))?$/.exec(route);
 if(match){if(match[3])return {results:match[1]==='movie'?[{iso_3166_1:'US',release_dates:[{certification:'G'}]}]:[{iso_3166_1:'US',rating:'TV-Y'}]};return {...titles[(Number(match[2])-1)%titles.length],...(match[1]==='tv'?{name:titles[(Number(match[2])-1)%titles.length].title,genres:[{id:10762},{id:16}]}:{})};}
 return {results:route.endsWith('/movie')?titles.filter(row=>!params.query||row.title.toLowerCase().includes(params.query.toLowerCase())):[],total_pages:1};
}
test.before(async()=>{
 if(!available)return;
 const app=express();app.use(express.json());const kids=createKids({secret:'browser-test-only-stable-kids-secret'.repeat(2),tmdb});app.use(kids.protect);app.use('/api/kids',kids.router);app.use('/assets/kids',express.static(path.join(__dirname,'../public/kids')));
 app.get(['/kids','/kids/title/:type/:id'],async(req,res)=>{const page=await kids.page(req);res.send(documentHtml(page.body,page.extraHead));});
 app.get('/profiles',(_req,res)=>res.send(documentHtml('<h1>Adult profiles</h1>')));
 app.get('/',(_req,res)=>res.send(documentHtml('<h1>General SwiflyTV</h1>')));
 app.get('/watch/:type/:id',(req,res)=>res.send(documentHtml('<main data-player-root data-player-kids-verified="'+Boolean(req.kids?.locked&&req.kidsTitle?.allowed)+'"><h1>Checked movie player</h1><a data-sv-player-back href="/movie/1">Details</a><div class="svPlayerTogether">Send to friend</div><button data-player-download>Download</button><a class="topbar" href="/profiles">Profiles</a></main>')));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function fixture(viewport={width:1440,height:1080}){
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://image.tmdb.org/**',route=>{
  const index=Number(/kids-(\d+)/.exec(route.request().url())?.[1]||1),colors=['#a6c8a4','#d9a896','#b6a3ce','#94bdc9','#e0c388','#c6bba3'];
  return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"><rect width="342" height="513" fill="'+colors[index%6]+'"/><circle cx="171" cy="170" r="105" fill="#fff3cb"/><path d="M55 513V310c0-135 232-135 232 0v203" fill="#75a683"/><circle cx="137" cy="326" r="15" fill="#29493b"/><circle cx="204" cy="326" r="15" fill="#29493b"/><path d="M144 371q27 29 54 0" stroke="#29493b" stroke-width="8" fill="none"/><text x="171" y="130" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="bold" fill="#456550">STORY '+index+'</text></svg>'});
 });
 await page.goto(origin+'/kids');await page.waitForFunction(()=>document.querySelector('[data-kids-root]')?.dataset.kidsReady==='true');
 return {context,page,errors};
}
async function screenshot(page,name){const directory=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR||process.env.SWIFLY_KIDS_SCREENSHOT_DIR;if(!directory)return;fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});}

test('Native Kids catalog, categories, posters and parent controls fit desktop, iPad, phone and 320px without glass', {skip:!available},async()=>{
 for(const [name,viewport]of [['desktop',{width:1440,height:1080}],['ipad',{width:834,height:1112}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}]]){
  const f=await fixture(viewport);try{
   assert.equal(await f.page.locator('.kidsCard').count(),18);
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflows');
   assert(await f.page.locator('.kidsHeader .svSectionTitle').isVisible());
   assert.equal(await f.page.locator('.kidsPoster').first().evaluate(node=>getComputedStyle(node).backdropFilter),'none');
   await screenshot(f.page,'kids-'+name);
   await f.page.locator('[data-kids-parent-open]').click();assert(await f.page.locator('[data-kids-parent-dialog]').isVisible());
   const bounds=await f.page.locator('[data-kids-parent-dialog]').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=viewport.width);
   await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-kids-parent-dialog]').isVisible(),false);
   await f.page.locator('.kidsCategory[href="/kids?category=movies"]').click();assert.equal(await f.page.locator('.kidsCategory[aria-current="page"]').textContent(),'Movies');
   await f.page.locator('#kids-search').fill('Cloud Friends');await f.page.locator('.kidsSearch button').click();assert.match(await f.page.locator('#kids-stories-title').textContent(),/Cloud Friends/);assert.equal(await f.page.locator('.kidsCard').count(),3);
   assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
 }
});

test('The real parent form locks, blocks profile navigation after refresh, rejects a wrong password and unlocks', {skip:!available},async()=>{
 const f=await fixture({width:390,height:844});try{
  await f.page.locator('[data-kids-parent-open]').click();await f.page.locator('[data-kids-password]').fill('a careful parent password');await f.page.locator('[data-kids-confirm]').fill('a careful parent password');await f.page.locator('[data-kids-parent-submit]').click();
  await f.page.waitForURL(origin+'/kids');await f.page.waitForFunction(()=>document.querySelector('[data-kids-root]')?.dataset.kidsLocked==='true');
  const cookies=await f.context.cookies();assert(cookies.filter(value=>value.name.startsWith('swifly_kids')).every(value=>value.httpOnly));
  assert.equal(await f.page.evaluate(()=>document.cookie.includes('swifly_kids_guard')),false);
  await f.page.goto(origin+'/profiles');await f.page.waitForURL('**/kids?parent=1');assert(await f.page.locator('[data-kids-parent-dialog]').isVisible());
  await f.page.locator('[data-kids-password]').fill('the wrong parent password');await f.page.locator('[data-kids-parent-submit]').click();await f.page.waitForFunction(()=>!document.querySelector('[data-kids-parent-error]').hidden);assert.match(await f.page.locator('[data-kids-parent-error]').textContent(),/did not match/);
  assert.equal(await f.page.locator('[data-kids-password]').inputValue(),'');await screenshot(f.page,'kids-parent-unlock');
  await f.page.locator('[data-kids-password]').fill('a careful parent password');await f.page.locator('[data-kids-parent-submit]').click();await f.page.waitForURL(origin+'/');assert(await f.page.getByText('General SwiflyTV').isVisible());assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});

test('Dedicated child title view and locked-player return route avoid general details and social links', {skip:!available},async()=>{
 const f=await fixture({width:834,height:1112});try{
  await f.page.locator('.kidsCard').first().click();assert(await f.page.locator('.kidsTitleHero h1').isVisible());assert(await f.page.getByText('Checked for Kids').isVisible());await screenshot(f.page,'kids-title-ipad');
  await f.page.evaluate(async()=>{await fetch('/api/kids/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'a careful parent password',confirm:'a careful parent password'})});});
  await f.page.locator('.kidsTitleCopy .kidsButtonPrimary').click();await f.page.waitForFunction(()=>document.querySelector('[data-kids-mode-bar]'));
  assert.equal(await f.page.locator('[data-sv-player-back]').getAttribute('href'),'/kids');assert.equal(await f.page.locator('.svPlayerTogether').isVisible(),false);assert.equal(await f.page.locator('[data-player-download]').isVisible(),false);assert.equal(await f.page.locator('.topbar').isVisible(),false);assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});

test('Kids respects reduced motion and empty search provides a useful checked-catalog return', {skip:!available},async()=>{
 const f=await fixture({width:320,height:800});try{
  await f.page.emulateMedia({reducedMotion:'reduce'});assert.equal(await f.page.locator('.kidsCard').first().evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  await f.page.locator('#kids-search').fill('No Such Little Adventure');await f.page.locator('.kidsSearch button').click();assert(await f.page.locator('.kidsEmpty').isVisible());assert(await f.page.getByRole('link',{name:'See all titles'}).isVisible());assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});

test('An older Kids tab reconciles its parent form and a restored ordinary player returns to the locked collection', {skip:!available},async()=>{
 const f=await fixture({width:390,height:844});try{
  const player=await f.context.newPage();await player.goto(origin+'/watch/movie/1?mode=movie');assert.equal(await player.locator('[data-player-root]').getAttribute('data-player-kids-verified'),'false');
  await f.page.evaluate(async()=>{const response=await fetch('/api/kids/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'a careful parent password',confirm:'a careful parent password'})});if(!response.ok)throw Error('Setup failed');await SwiflyKids.refresh();});
  await f.page.waitForFunction(()=>document.querySelector('[data-kids-root]').dataset.kidsConfigured==='true');
  await f.page.locator('[data-kids-parent-open]').click();assert.match(await f.page.locator('[data-kids-parent-submit]').textContent(),/unlock/i);assert(await f.page.locator('[data-kids-confirm-wrap]').isHidden());
  await player.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await player.waitForURL(origin+'/kids');assert.equal(await player.locator('[data-player-root]').count(),0);
  await player.close();assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});
