'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright-core');const {createFeed}=require('../lib/feed');
let markup;try{markup=require('../ui/feed');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const available=fs.existsSync(process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser;test.before(async()=>{if(available)browser=await chromium.launch({headless:true,executablePath:process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH});});test.after(async()=>{await browser?.close();});
const show=(id,extra={})=>({id,name:'Real series '+id,first_air_date:'2020-01-01',poster_path:'/show.jpg',vote_average:8.5,vote_count:300,genre_ids:[18],genres:[{id:18,name:'Drama'}],...extra});
const film=(id,extra={})=>({id,title:'Verified film '+id,release_date:'2020-01-01',poster_path:'/film.jpg',vote_average:8,vote_count:300,genre_ids:[18],genres:[{id:18,name:'Drama'}],...extra});
const snapshot=()=>({version:1,watchlist:[{id:'8',type:'tv',title:'Saved series'}],liked:[],watched:[{id:'3',type:'movie',key:'movie:3',titleKey:'movie:3',title:'Already seen'}],history:[{id:'1',type:'movie',key:'movie:1',titleKey:'movie:1',title:'Local name',watchedAt:'2026-10-25T09:00:00Z'},{id:'7',type:'tv',key:'tv:7:3:3',titleKey:'tv:7',season:3,episode:3,title:'Local series',watchedAt:'2026-10-24T09:00:00Z'}],folders:[],episodeRead:[],preferences:{spoilerMode:false,hideWatched:false,hideEpisodeBell:false}});
async function fixture(t,{viewport={width:1440,height:900},state=snapshot(),holdShow=false,home=true,manyEpisodes=false,realLibrary=false,verifyAccount=false}={}){
 assert.equal(typeof markup?.feedHome,'function','real feed markup must be implemented before browser behavior can work');
 const calls=[],releases=[];const app=express();app.use('/api/feed',createFeed({now:()=>Date.parse('2026-10-25T12:00:00Z'),random:()=>0,tmdb:async(route,params)=>{
  calls.push([route,params]);if(holdShow&&route==='/tv/7')await new Promise(resolve=>releases.push(resolve));
  if(route==='/movie/1')return film(1);if(route==='/movie/1/recommendations')return {results:[film(3),film(4)]};
  if(route==='/tv/7')return show(7,{next_episode_to_air:{season_number:3,episode_number:5,name:'Tomorrow is real',air_date:'2026-10-26'},last_episode_to_air:{season_number:3,episode_number:4,name:'A new chapter',air_date:'2026-10-24'}});
  if(route==='/tv/8')return show(8,{last_episode_to_air:{season_number:0,episode_number:2,name:'A real special',air_date:'2026-10-23'}});
  if(manyEpisodes&&/^\/tv\/\d+$/.test(route))return show(Number(route.split('/').pop()),{last_episode_to_air:{season_number:1,episode_number:1,name:'A recent real episode',air_date:'2026-10-24'}});
  if(route==='/discover/tv')return {results:[show(9,{name:'A real animated surprise',genre_ids:[16]})]};if(route==='/discover/movie')return {results:[film(10)]};return {results:[]};
 }}).router);app.use('/assets',express.static(path.join(__dirname,'../public')));
 const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/clean/feed.css"><style>body{margin:0;background:#090b0f;color:white;font:16px system-ui}main{max-width:1200px;margin:auto;padding:20px}</style></head><body class="svCleanShell"><header>'+markup.feedBell()+'</header><main>'+(home?markup.feedHome():'')+markup.feedDiscover()+'</main>'+markup.feedDialogs()+(realLibrary?'<script src="/assets/clean/library-state.js" defer></script>':'')+'<script src="/assets/clean/feed.js" defer></script></body></html>';
 app.get(/.*/,(_req,res)=>res.type('html').send(html));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const context=await browser.newContext({viewport,isMobile:viewport.width<=430,hasTouch:viewport.width<=430});
 await context.addInitScript(({initial,realLibrary,verifyAccount})=>{
  if(realLibrary){localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'},{id:'second',name:'Second'}]));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));localStorage.setItem('swiflytv.library.main',JSON.stringify(initial));if(verifyAccount){localStorage.setItem('swiflytv.accountOwner','account-A');window.SwiflyAccount={ready:new Promise(resolve=>{window.__verifyLibrary=resolve;})};}return;}
  let value=initial,epoch=1,owner='account-A',profile='main';const acks=[];
  window.__episodeAcks=acks;window.__switchLibrary=(next,nextOwner='account-B')=>{value=next;owner=nextOwner;epoch++;document.dispatchEvent(new Event('swifly:profile-changed'));window.dispatchEvent(new CustomEvent('swifly:library-change',{detail:{action:'profile',profileId:profile}}));};
  window.SwiflyLibrary={ready:Promise.resolve(),active:true,read:()=>structuredClone(value),profileId:()=>profile,ownerId:()=>owner,contextId:()=>owner+':'+profile+':'+epoch,preferences:()=>({...value.preferences}),savePreferences(patch){Object.assign(value.preferences,patch);window.dispatchEvent(new CustomEvent('swifly:library-change',{detail:{action:'preferences',profileId:profile}}));return true;},acknowledgeEpisodes(ids){acks.push(...ids);value.episodeRead=[...new Set([...value.episodeRead,...ids])];window.dispatchEvent(new CustomEvent('swifly:library-change',{detail:{action:'episode-read',profileId:profile}}));return true;},episodeIsRead:identifier=>value.episodeRead.includes(identifier)};
 },{initial:state,realLibrary,verifyAccount});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#3b4567"/></svg>'}));
 t.after(async()=>{for(const release of releases)release();await context.close();server.closeAllConnections();server.close();});await page.goto('http://127.0.0.1:'+server.address().port);return {page,calls,releases,errors};
}

test('home renders verified personal picks and only a visible episode panel acknowledges unread items',{skip},async t=>{
 const {page,errors}=await fixture(t);await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');
 assert.equal(await page.evaluate(()=>window.__episodeAcks.length),0);assert(await page.locator('[data-feed-notifications]').evaluate(n=>!n.open));
 assert.match(await page.locator('[data-feed-upcoming]').innerText(),/Tomorrow is real/);assert.match(await page.locator('[data-feed-recommended]').innerText(),/Because you watched Verified film 1/);assert(!/Already seen|Verified film 3/.test(await page.locator('[data-feed-recommended]').innerText()));
 await page.locator('[data-feed-bell]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__episodeAcks.length===2);
 assert.deepEqual(await page.evaluate(()=>window.__episodeAcks.sort()),['tv:7:3:4','tv:8:0:2']);assert.equal(await page.locator('[data-feed-unread]').innerText(),'0');assert.match(await page.locator('[data-feed-notifications]').innerText(),/A real special/);
 await page.keyboard.press('Escape');assert(await page.locator('[data-feed-notifications]').evaluate(n=>!n.open));assert(await page.locator('[data-feed-bell]').evaluate(n=>n===document.activeElement));assert.deepEqual(errors,[]);
});

test('profile changes abort stale personal responses even when both accounts use the main profile ID',{skip},async t=>{
 const {page,releases,errors}=await fixture(t,{holdShow:true});await page.waitForFunction(()=>document.querySelector('[data-feed-upcoming]')?.getAttribute('aria-busy')==='true');
 const empty={version:1,watchlist:[],liked:[],watched:[],history:[],folders:[],episodeRead:[],preferences:{hideEpisodeBell:false}};
 await page.evaluate(next=>window.__switchLibrary(next),empty);for(const release of releases)release();
 await page.waitForFunction(()=>/watch|save/i.test(document.querySelector('[data-feed-recommended]').textContent)&&document.querySelector('[data-feed-upcoming]').getAttribute('aria-busy')==='false');
 assert(!/Tomorrow is real|A new chapter|Verified film/.test(await page.locator('main').innerText()));assert.equal(await page.locator('[data-feed-unread]').innerText(),'0');assert.equal(await page.evaluate(()=>window.__episodeAcks.length),0);assert.deepEqual(errors,[]);
});

test('Discover shuffle uses selected filters and waits for an explicit Details or Play action',{skip},async t=>{
 const {page,calls,errors}=await fixture(t);assert(!calls.some(([path])=>path.startsWith('/discover/')));
 const form=page.locator('[data-feed-surprise-form]');await form.locator('[name="type"]').selectOption('tv');await form.locator('[name="minRating"]').selectOption('8');await form.locator('[name="genre"]').selectOption('animation');await form.locator('[name="yearFrom"]').fill('2010');await form.locator('[name="yearTo"]').fill('2026');
 await form.getByRole('button',{name:'Surprise me',exact:true}).click();await page.getByRole('heading',{name:'A real animated surprise'}).waitFor();
 const result=page.locator('[data-feed-surprise-result]');assert.equal(await result.getByRole('link',{name:'Details',exact:true}).getAttribute('href'),'/tv/9');assert.equal(await result.getByRole('link',{name:'Play',exact:true}).getAttribute('href'),'/watch/tv/9');assert.equal(new URL(page.url()).pathname,'/');
 assert.deepEqual(calls.filter(([path])=>path.startsWith('/discover/')).map(([path,p])=>[path,p.with_genres,p['vote_average.gte']]),[['/discover/tv','16','8']]);assert.deepEqual(errors,[]);
 await result.getByRole('link',{name:'Details',exact:true}).click();await page.waitForURL('**/tv/9');
});

test('episode bell preference and notification controls remain reachable on touch and TV widths',{skip},async t=>{
 for(const viewport of [{width:320,height:568},{width:1920,height:1080}]){
  const {page,errors}=await fixture(t,{viewport});await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');await page.locator('[data-feed-bell]').click();
  const toggle=page.locator('[data-feed-hide-bell]');await toggle.check();assert(await page.locator('[data-feed-bell]').isHidden());await toggle.uncheck();assert(await page.locator('[data-feed-bell]').isVisible());
  const geometry=await page.locator('[data-feed-notifications]').evaluate(dialog=>({width:document.documentElement.scrollWidth,controls:[...dialog.querySelectorAll('button,a,label')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};})}));assert(geometry.width<=viewport.width);assert(geometry.controls.every(r=>r.width>=44&&r.height>=44));assert.deepEqual(errors,[]);
 }
});

test('pages with only the episode bell never request hidden homepage recommendations',{skip},async t=>{
 const {page,calls}=await fixture(t,{home:false});await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');
 assert(!calls.some(([route])=>route.endsWith('/recommendations')),'a bell-only page must not fetch recommendation pools');
});

test('a failed feed offers a working explicit retry instead of keeping the loading state or stale failure',{skip},async t=>{
 const {page}=await fixture(t);let failed=false;
 await page.route('**/api/feed/episodes?*',route=>{failed=true;return route.fulfill({status:503,json:{message:'Catalog is unavailable. Please try again.'}});});
 await page.evaluate(()=>SwiflyFeed.refresh({force:true}));await page.waitForFunction(()=>/unavailable/.test(document.querySelector('[data-feed-upcoming]').textContent));assert(failed);
 assert.equal(await page.locator('[data-feed-upcoming]').getAttribute('aria-busy'),'false');
 await page.unroute('**/api/feed/episodes?*');await page.locator('[data-feed-upcoming]').getByRole('button',{name:'Refresh feed',exact:true}).click();
 await page.waitForFunction(()=>/Tomorrow is real/.test(document.querySelector('[data-feed-upcoming]').textContent));assert.equal(await page.locator('[data-feed-upcoming]').getAttribute('aria-busy'),'false');
});

test('only episode rows visible inside the open scroll panel are acknowledged',{skip},async t=>{
 const state=snapshot();state.history=[];state.watched=[];state.watchlist=Array.from({length:8},(_,i)=>({id:String(i+11),type:'tv',title:'Series '+(i+11)}));
 const {page}=await fixture(t,{viewport:{width:320,height:568},state,manyEpisodes:true});await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='8');await page.locator('[data-feed-bell]').click();
 await page.waitForFunction(()=>window.__episodeAcks.length>0);const before=await page.evaluate(()=>window.__episodeAcks.length);assert(before<8,'offscreen rows must remain unread');
 await page.locator('[data-feed-episode-list]').evaluate(list=>list.scrollTop=list.scrollHeight);await page.waitForFunction(()=>window.__episodeAcks.includes('tv:18:1:1'));assert((await page.evaluate(()=>window.__episodeAcks.length))>before);
});

test('a client deadline releases loading controls and leaves a retry action',{skip},async t=>{
 const {page}=await fixture(t);await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');await page.clock.install();
 await page.route('**/api/feed/episodes?*',()=>{});await page.evaluate(()=>{void SwiflyFeed.refresh({force:true});});await page.clock.runFor(12001);
 await page.waitForFunction(()=>document.querySelector('[data-feed-upcoming]').getAttribute('aria-busy')==='false',null,{timeout:3000});
 assert.match(await page.locator('[data-feed-upcoming]').innerText(),/too long|try again/i);assert(await page.locator('[data-feed-upcoming]').getByRole('button',{name:'Refresh feed',exact:true}).isEnabled());
});

test('refreshing the home feed cannot discard a pending shuffle for the same profile',{skip},async t=>{
 const {page}=await fixture(t);await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');let pending;
 await page.route('**/api/feed/surprise?*',route=>{pending=route;});await page.locator('[data-feed-surprise-form]').getByRole('button',{name:'Surprise me',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-feed-surprise-form]').getAttribute('aria-busy')==='true');assert(pending);await page.evaluate(()=>SwiflyFeed.refresh({force:true}));await pending.continue();
 await page.waitForFunction(()=>!!document.querySelector('[data-feed-surprise-result] h3'),null,{timeout:3000});assert.match(await page.locator('[data-feed-surprise-status]').innerText(),/ready/i);
});

test('a bell-only page can retry an unavailable episode catalog from the dialog',{skip},async t=>{
 const {page}=await fixture(t,{home:false});await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');
 await page.route('**/api/feed/episodes?*',route=>route.fulfill({status:503,json:{message:'Episode catalog is unavailable. Please try again.'}}));await page.evaluate(()=>SwiflyFeed.refresh({force:true}));await page.locator('[data-feed-bell]').click();
 await page.waitForFunction(()=>/unavailable/.test(document.querySelector('[data-feed-notification-status]').textContent));await page.unroute('**/api/feed/episodes?*');
 await page.locator('[data-feed-notifications]').getByRole('button',{name:'Refresh feed',exact:true}).click({timeout:3000});await page.getByRole('link',{name:/Real series 7/}).waitFor();assert.equal(await page.locator('[data-feed-notification-status]').innerText(),'');
});

test('real SwiflyLibrary persists feed acknowledgements and hide preference separately for each profile',{skip},async t=>{
 const {page,errors}=await fixture(t,{realLibrary:true});await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');await page.locator('[data-feed-bell]').click();
 await page.waitForFunction(()=>SwiflyLibrary.episodeIsRead('tv:7:3:4')&&SwiflyLibrary.episodeIsRead('tv:8:0:2'));await page.locator('[data-feed-hide-bell]').check();assert(await page.evaluate(()=>SwiflyLibrary.preferences().hideEpisodeBell));
 await page.evaluate(()=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'second',name:'Second'}));document.dispatchEvent(new Event('swifly:profile-changed'));});
 assert.deepEqual(await page.evaluate(()=>({profileId:SwiflyLibrary.profileId(),titles:SwiflyLibrary.read().watchlist.map(item=>item.titleKey)})),{profileId:'second',titles:[]},'a new profile must not import the first profile’s mirrored watchlist');
 await page.waitForFunction(()=>/Watch or save/.test(document.querySelector('[data-feed-recommended]').textContent));assert.equal(await page.evaluate(()=>SwiflyLibrary.episodeIsRead('tv:7:3:4')),false);assert(await page.locator('[data-feed-bell]').isVisible());
 await page.evaluate(()=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));document.dispatchEvent(new Event('swifly:profile-changed'));});
 await page.waitForFunction(()=>/Tomorrow is real/.test(document.querySelector('[data-feed-upcoming]').textContent));assert(await page.locator('[data-feed-bell]').isHidden());assert(await page.evaluate(()=>SwiflyLibrary.episodeIsRead('tv:8:0:2')));assert.deepEqual(errors,[]);
});

test('feed cannot read cached private history until the real library verifies the account',{skip},async t=>{
 const {page,calls,errors}=await fixture(t,{realLibrary:true,verifyAccount:true});assert.equal(await page.evaluate(()=>SwiflyLibrary.active),false);await page.evaluate(()=>SwiflyFeed.refresh({force:true}));assert.equal(calls.length,0);assert(!/Tomorrow is real|Verified film/.test(await page.locator('main').innerText()));
 await page.evaluate(()=>window.__verifyLibrary({available:true,user:{id:'account-A'}}));await page.waitForFunction(()=>document.querySelector('[data-feed-unread]')?.textContent==='2');assert(await page.evaluate(()=>SwiflyLibrary.active));assert.match(await page.locator('[data-feed-recommended]').innerText(),/Verified film/);assert.deepEqual(errors,[]);
});
