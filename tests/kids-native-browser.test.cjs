'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const fixtureRoot=path.join(__dirname,'fixtures/native-catalog'),art=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'titles.json'),'utf8'));
let api,browser,origin,directory;
function record(id,type){const row=art[(id-1)%art.length];return{id,adult:false,media_type:type,...(type==='tv'?{name:row.title+' · Series',first_air_date:row.year+'-01-01',number_of_seasons:2,seasons:[{season_number:1,name:'Season 1',episode_count:3},{season_number:2,name:'Season 2',episode_count:2}]}:{title:row.title,release_date:row.year+'-01-01',runtime:105}),overview:row.overview,genres:[{id:16,name:'Animation'},{id:10751,name:'Family'},...(type==='tv'?[{id:10762,name:'Kids'}]:[])],poster_path:'/native-'+(id-1)%art.length+'.jpg',backdrop_path:'/native-'+(id-1)%art.length+'-wide.jpg',vote_average:7+(id%10)/10};}
async function tmdb(endpoint,params={}){
 const match=/^\/(movie|tv)\/(\d+)(?:\/(.*))?$/.exec(endpoint);
 if(match){const [,type,rawId,suffix]=match,id=Number(rawId);
  if(suffix==='release_dates')return{results:[{iso_3166_1:'US',release_dates:id===900002?[{certification:'PG'},{certification:'R'}]:id===900003?[]:[{certification:'PG'}]}]};
  if(suffix==='content_ratings')return{results:[{iso_3166_1:'US',rating:id>=900000?'TV-MA':'TV-Y7'}]};
  if(suffix==='recommendations'||suffix==='similar')return{results:[{id:900001,title:'ADULT RECOMMENDATION'},{id:type==='tv'?1005:5,title:'UNTRUSTED COPY'}]};
  if(suffix?.startsWith('season/'))return{episodes:[1,2,3].map(e=>({episode_number:e,name:['A new beginning','Friends together','The journey home'][e-1],overview:'Friends explore a new place together.',still_path:'/native-'+e+'-wide.jpg',air_date:'2025-01-01',runtime:24}))};
  if(suffix)return{results:[]};
  return{...record(id,type),...(id===900001?{title:'ADULT TITLE',name:'ADULT TITLE',adult:true}:{}),...(id===900004?{id:123456}: {})};
 }
 if(/^\/(discover|search)\/(movie|tv)$/.test(endpoint)){
  const type=endpoint.endsWith('/tv')?'tv':'movie',page=Number(params.page)||1;
  const safe=Array.from({length:16},(_,i)=>record((type==='tv'?1000:0)+(page-1)*16+i+1,type)).filter(row=>!params.query||(row.title||row.name).toLowerCase().includes(params.query.toLowerCase()));
  return{results:[...[900001,900002,900003,900004].map(id=>({id,title:'UNVERIFIED CANDIDATE',poster_path:'/unsafe.jpg'})),...safe.map(row=>({id:row.id,title:'UNTRUSTED COPY',poster_path:'/unsafe.jpg'}))],total_pages:3};
 }
 if(endpoint.startsWith('/genre/'))return{genres:[{id:16,name:'Animation'},{id:10751,name:'Family'}]};
 return{results:[]};
}
test.before(async()=>{
 if(!available)return;
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-native-kids-browser-'));
 process.env.SWIFLY_DATA_DIR=directory;process.env.SWIFLY_KIDS_SECRET='native-browser-test-only-private-secret-'.repeat(2);process.env.SWIFLY_REACT='true';delete process.env.SWIFLY_ACCESS_PIN;
 api=loadServer();api.setTmdb(tmdb);await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));if(directory)fs.rmSync(directory,{recursive:true,force:true});});
async function settle(page,rail=false){
 await page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready'&&document.querySelector('[data-kids-root]')?.dataset.kidsReady==='true'&&!document.documentElement.hasAttribute('data-sv-loading'));
 if(rail)await page.waitForSelector('.dsRail[data-sv-react-rail="true"]');
 // Native tablet rails keep distant horizontal posters mounted and lazy. An
 // unbounded decode() on those images waits for fetches that should not start.
 await page.waitForFunction(()=>[...document.images].filter(image=>{const r=image.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0;}).every(image=>image.complete&&image.naturalWidth>0),null,{timeout:10000});
}
async function open(t,{width=1440,height=1000,reduced=false,tv=false}={}){
 const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',reducedMotion:reduced?'reduce':'no-preference'});t.after(()=>context.close());
 await context.addInitScript(tv=>{
  localStorage.setItem('swiflytv.searchRecents',JSON.stringify(['ADULT LOCAL SEARCH']));localStorage.setItem('movieverse.watchlist',JSON.stringify([{id:900001,title:'ADULT LOCAL LIST'}]));localStorage.setItem('movieverse.continueWatching',JSON.stringify([{id:900001,title:'ADULT LOCAL HISTORY'}]));
  if(tv)localStorage.setItem('swiflytv.tvFocusMode','true');
 },tv);
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&url.pathname.startsWith('/api/'))requests.push(url.pathname);});
 await context.route('https://image.tmdb.org/**',route=>{const index=Number(/native-(\d)/.exec(route.request().url())?.[1]||0);return route.fulfill({contentType:'image/jpeg',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(fixtureRoot,'poster-'+index+'.jpg'))});});
 await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));await context.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
 await context.route(url=>url.pathname.startsWith('/api/proxy-video-wait/'),route=>route.fulfill({json:{status:'error',code:'fixture',message:'Isolated browser playback fixture'}}));
 await page.goto(origin+'/kids');await settle(page,true);return{context,page,errors,requests};
}
async function screenshot(page,name){const directory=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR||process.env.SWIFLY_KIDS_SCREENSHOT_DIR;if(directory){fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'kids-native-'+name+'.png'),fullPage:true});}}
async function safeShell(page){
 const parent=await page.locator('.netflixTopbar [data-kids-parent-open]').evaluate(node=>{
  const p=node.getBoundingClientRect(),icon=node.querySelector('svg')?.getBoundingClientRect(),labels=[...node.querySelectorAll('span')].filter(n=>n.textContent.trim()==='Parent controls'&&n.children.length===0&&n.getBoundingClientRect().width>0),label=labels[0]?.getBoundingClientRect();
  return {inside:!label||(label.left>=p.left-1&&label.right<=p.right+1&&label.top>=p.top-1&&label.bottom<=p.bottom+1),aligned:!label||!icon||Math.abs((label.top+label.bottom-icon.top-icon.bottom)/2)<=3,headerHeight:node.closest('header').getBoundingClientRect().height,width:innerWidth};
 });assert(parent.inside,'parent control label stays within its button');assert(parent.aligned,'the parent lock and label share one line');if(parent.width>700&&parent.width<=1100)assert(parent.headerHeight<100,'tablet navigation stays on a single row: '+JSON.stringify(parent));

 const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,adult:document.querySelector('#continueWatchingSection,[data-feed-home],.dsProfileMenu,#controlPanel,[data-search-recents],.svNavPartyLink'),text:document.body.textContent,escapes:[...document.querySelectorAll('.netflixNav a[href],.mobileNav a[href],.dsHeroActions a[href],.dsCard a[href],.svDetailActions a[href],.dsEpisodeChips a[href],[data-sv-player-back],[data-player-episode-link],[data-player-season-link]')].map(link=>link.getAttribute('href')).filter(href=>!href.startsWith('/kids')),scripts:[...document.scripts].map(script=>script.src).filter(src=>/\/(?:continue|library-state|feed|account|details|download|studio|connect|search)\.js(?:\?|$)/.test(src))}));
 assert.equal(result.overflow,false,'real full document fits viewport');assert.equal(result.adult,null);assert(!/ADULT|UNTRUSTED|UNVERIFIED/.test(result.text));assert.deepEqual(result.escapes,[]);assert.deepEqual(result.scripts,[]);
}
for(const [name,width,height,options]of [['desktop',1440,1000,{}],['ipad',834,1112,{}],['phone',390,844,{}],['small-phone',320,800,{}],['tv',1920,1080,{tv:true,reduced:true}]])test('real React Kids Home/Movies/Series/Browse keeps native artwork and scoped links on '+name,{skip:!available,timeout:90000},async t=>{
 const f=await open(t,{width,height,...options});
 for(const section of ['','/movies','/tv','/browse']){
  if(section){await f.page.goto(origin+'/kids'+section);await settle(f.page,section!=='/browse');}
  await safeShell(f.page);assert(await f.page.locator('.netflixTopbar[data-kids-shell]').isVisible());assert(await f.page.locator('[data-kids-parent-open]').isVisible());
  if(section!=='/browse'){assert(await f.page.locator('.dsHero .dsHeroBg').isVisible());assert(await f.page.locator('.dsRow.svCatalogRow .dsRail .movieCard').count());if(width>1000){const next=f.page.locator('.svReactRailControls button[aria-label^="Next"]').first();if(await next.count()){await next.click();await safeShell(f.page);}}}
  await screenshot(f.page,name+(section||'-home').replaceAll('/','-'));
 }
 await f.page.locator('[data-kids-parent-open]').click();const bounds=await f.page.locator('[data-kids-parent-dialog]').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);await screenshot(f.page,name+'-parent');await f.page.keyboard.press('Escape');assert(await f.page.locator('[data-kids-parent-dialog]').isHidden());
 assert.deepEqual(f.errors,[]);assert(f.requests.every(route=>route.startsWith('/api/kids/')),'catalog never requests an unrestricted API');
});
test('real child filters, second pages, SSR search and detail/episodes stay scoped after React hydration',{skip:!available,timeout:90000},async t=>{
 const f=await open(t,{width:390,height:844,reduced:true});
 await f.page.goto(origin+'/kids/browse?media=movie&category=animation&sort=rating');await settle(f.page);const first=await f.page.locator('.dsCardTitle').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
 await f.page.locator('.pagination a[rel="next"]').click();await settle(f.page);const second=await f.page.locator('.dsCardTitle').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));assert(first.length&&second.length&&!first.some(id=>second.includes(id)));assert.match(f.page.url(),/media=movie/);assert.match(f.page.url(),/category=animation/);assert.match(f.page.url(),/sort=rating/);
 await f.page.goto(origin+'/kids/search');await settle(f.page);await f.page.locator('form[role="search"] input[name="q"]').fill('Coco');await f.page.locator('form[role="search"] button[type="submit"]').click();await settle(f.page);assert(await f.page.locator('.dsCardTitle').count());assert(!await f.page.locator('[data-search-studio],[data-studio-search],[data-search-recents]').count());await safeShell(f.page);await screenshot(f.page,'phone-search');
 await f.page.goto(origin+'/kids/title/tv/1001');await settle(f.page);assert(await f.page.locator('.svTitleDetails .svDetailHero').isVisible());await f.page.locator('[data-episode-season="2"] summary').click();await f.page.locator('[data-episode-season="2"] a[href*="season=2"]').click();await settle(f.page);await f.page.locator('[data-episode-season="2"] .svDetailEpisodeTile').first().scrollIntoViewIfNeeded();await safeShell(f.page);await screenshot(f.page,'phone-title-episodes');
 await f.page.locator('[data-episode-season="2"] .svDetailEpisodeTile').first().click();await settle(f.page);assert.equal(await f.page.locator('[data-player-root]').getAttribute('data-player-kids-verified'),'true');assert.equal(await f.page.locator('[data-player-root]').getAttribute('data-player-mode'),'movie');assert.equal(await f.page.locator('.svPlayerTogether,.svPlayerPartySlot,[data-sv-download],iframe').count(),0);await safeShell(f.page);await screenshot(f.page,'phone-player');await f.page.locator('[data-sv-player-back]').click();await settle(f.page);assert.match(f.page.url(),/\/kids\/title\/tv\/1001$/);assert.deepEqual(f.errors,[]);
});
test('real child nav remains visible after parent lock, password exit and cross-tab player restoration',{skip:!available,timeout:90000},async t=>{
 const f=await open(t,{width:390,height:844});const old=await f.context.newPage();await old.goto(origin+'/watch/movie/1');await old.waitForSelector('[data-player-root]');
 await f.page.locator('[data-kids-parent-open]').click();await f.page.locator('[data-kids-password]').fill('a native browser parent password');await f.page.locator('[data-kids-confirm]').fill('a native browser parent password');await f.page.locator('[data-kids-parent-submit]').click();await f.page.waitForURL(origin+'/kids');await settle(f.page,true);await f.page.waitForFunction(()=>document.documentElement.dataset.kidsLocked==='true');
 assert(await f.page.locator('.netflixTopbar[data-kids-shell]').isVisible());assert(await f.page.locator('.mobileNav[data-kids-shell]').isVisible());await f.page.locator('.mobileNav a[href="/kids/movies"]').click();await settle(f.page,true);await safeShell(f.page);await screenshot(f.page,'locked-phone-movies');
 await old.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await old.waitForURL(origin+'/kids');await settle(old,true);
 for(const route of ['/api/discovery/search?q=adult','/api/library/next/tv/900001?s=1&e=1','/api/library/episodes/tv/900001/1'])assert.equal((await f.context.request.get(origin+route)).status(),423,route);
 await f.page.goto(origin+'/profiles');await f.page.waitForURL('**/kids?parent=1');await settle(f.page,true);assert(await f.page.locator('[data-kids-parent-dialog]').isVisible());await f.page.locator('[data-kids-password]').fill('the wrong parent password');await f.page.locator('[data-kids-parent-submit]').click();await f.page.locator('[data-kids-parent-error]').waitFor({state:'visible'});assert.equal(await f.page.locator('[data-kids-password]').inputValue(),'');await screenshot(f.page,'locked-phone-password');
 await f.page.locator('[data-kids-password]').fill('a native browser parent password');await f.page.locator('[data-kids-parent-submit]').click();await f.page.waitForURL(origin+'/');assert.equal((await f.context.request.get(origin+'/api/kids/status')).status(),200);assert.deepEqual(f.errors,[]);await old.close();
});
