'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const fixtureRoot=path.join(__dirname,'fixtures/native-catalog'),art=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'titles.json'),'utf8'));
let api,browser,origin,directory;const liveId='2030-01-04',voteId='2030-01-05',errorId='2030-01-11';
const films=Array.from({length:30},(_,i)=>{const row=art[i%art.length];return{id:i+1,title:row.title,year:row.year,poster:'https://image.tmdb.org/t/p/w342/native-'+i%art.length+'.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/native-'+i%art.length+'-wide.jpg',overview:row.overview,runtime:180};});
function event(id,start,extra={}){return{id,title:'Swifly Movie Night',startsAt:start,votingClosesAt:start-300000,candidates:films.slice(0,6),votes:{},messages:[],receipts:[],...extra};}
async function tmdb(endpoint,params={}){const match=/^\/(movie|tv)\/(\d+)$/.exec(endpoint);if(match){const value=films[(Number(match[2])-1)%films.length];return{...value,adult:false,media_type:match[1],release_date:value.year+'-01-01',poster_path:'/native-'+(value.id-1)%art.length+'.jpg',backdrop_path:'/native-'+(value.id-1)%art.length+'-wide.jpg',genres:[],images:{logos:[]}};}if(endpoint.startsWith('/genre/'))return{genres:[]};return{results:films.map(row=>({...row,name:row.title,adult:false,media_type:endpoint.includes('/tv')?'tv':'movie',poster_path:'/native-'+(row.id-1)%art.length+'.jpg',backdrop_path:'/native-'+(row.id-1)%art.length+'-wide.jpg'})),total_pages:3};}
test.before(async()=>{
 if(!available)return;
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-night-browser-'));process.env.SWIFLY_DATA_DIR=directory;process.env.SWIFLY_REACT='true';process.env.SWIFLY_KIDS_SECRET='movie-night-browser-test-secret-'.repeat(2);delete process.env.SWIFLY_ACCESS_PIN;
 const now=Date.now(),state={version:1,users:{},sessions:{},friends:[],requests:[],blocks:[],messages:[],notifications:[],homes:{},invites:{},movieNights:{revision:1,events:{[liveId]:event(liveId,now-20000,{winnerId:1,playbackStartedAt:now-20000}),[voteId]:event(voteId,now+3600000),[errorId]:event(errorId,now-20000,{winnerId:2})}}};fs.writeFileSync(path.join(directory,'accounts.json'),JSON.stringify(state));
 const video=path.join(directory,'shared.webm');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-t','180','-c:v','libvpx','-b:v','240k','-an','-y',video],{timeout:90000});
 api=loadServer();api.setTmdb(tmdb);api.setMovieNightSource(async id=>id===2?{status:'error'}:{status:'ok',playbackUrl:'/__qa/night.webm',streamType:'webm'});api.app.get('/__qa/night.webm',(_req,res)=>res.sendFile(video));
 // The server has already installed its catch-all 404 by the time this isolated
 // browser fixture is registered. Move only this QA route ahead of that handler.
 const layers=api.app._router?.stack||[],fixtureLayer=layers.pop();
 const notFound=layers.findIndex(layer=>!layer.route&&String(layer.handle).includes('Page not found.'));
 assert(notFound>=0&&fixtureLayer?.route?.path==='/__qa/night.webm','Fixture video must be registered before the production 404 handler.');
 layers.splice(notFound,0,fixtureLayer);
 await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
 // Reject HTML/404 fixture responses rather than misdiagnosing them as player codec errors.
 const probe=await fetch(origin+'/__qa/night.webm',{headers:{Range:'bytes=0-1023'}});
 assert.equal(probe.status,206,'QA media must support byte-range streaming');
 assert.match(probe.headers.get('content-type')||'',/^video\/webm/,'QA media must be served as video, not a fallback HTML page');
 await probe.body?.cancel();
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();api?.movieNights.close();if(api)await new Promise(resolve=>api.io.close(resolve));if(directory)fs.rmSync(directory,{recursive:true,force:true});});
async function open(t,width=1440,height=1050,route='/movie-night/'+voteId){const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference',colorScheme:'dark'});t.after(()=>context.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://image.tmdb.org/**',route=>{const index=Number(/native-(\d)/.exec(route.request().url())?.[1]||0);return route.fulfill({contentType:'image/jpeg',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(fixtureRoot,'poster-'+index+'.jpg'))});});await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:''}));await page.goto(origin+route);await page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready'&&!document.documentElement.hasAttribute('data-sv-loading')&&window.SwiflyMovieNights?.active);return{context,page,errors};}
async function shot(page,name){const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'movie-nights-'+name+'.png'),fullPage:true,animations:'disabled'});}}
async function fits(page){const issues=await page.evaluate(()=>{const outside=[];for(const n of document.querySelectorAll('.svNightPage :is(button,input,a)')){if(n.closest('[hidden],template')||n.closest('.svPlayerStatus[hidden],.svPlayerPopover:not([open])'))continue;const r=n.getBoundingClientRect(),s=getComputedStyle(n);if(!r.width||!r.height||s.visibility==='hidden')continue;if(r.left<-.5||r.right>innerWidth+.5)outside.push({text:n.textContent,box:r.toJSON()});}return{overflow:document.documentElement.scrollWidth>innerWidth,outside};});assert.equal(issues.overflow,false,JSON.stringify(issues));assert.deepEqual(issues.outside,[]);}
for(const [name,width,height]of [['desktop',1440,1050],['ipad',834,1112],['phone',390,844],['small-phone',320,800]])test('real Movie Nights ballot and chat fit '+name,{skip:!available,timeout:90000},async t=>{
 const f=await open(t,width,height);await f.page.locator('[data-night-vote]').first().waitFor();assert.equal(await f.page.locator('[data-night-vote]').count(),6);assert.equal(await f.page.locator('[data-night-total-votes]').textContent(),'0');await shot(f.page,name+'-voting');await f.page.locator('[data-night-vote]').first().click();await f.page.locator('[data-night-vote-status]').filter({hasText:'Sign in'}).waitFor();await fits(f.page);
 if(!await f.page.locator('[data-night-chat-body]').isVisible()){await f.page.locator('[data-night-chat-toggle]').click();assert(await f.page.locator('[data-night-chat-body]').isVisible());}await f.page.locator('[data-night-chat-toggle]').click();assert.equal(await f.page.locator('[data-night-chat-body]').isVisible(),false);await fits(f.page);await shot(f.page,name+'-chat-collapsed');assert.deepEqual(f.errors,[]);
});
async function waitForNightPlayback(page, label){
 try{
  await page.waitForFunction(()=>{const video=document.querySelector('[data-night-player] video');return video&&!video.paused&&video.currentTime>5;},null,{timeout:14000});
 }catch(error){
  const details=await page.evaluate(()=>{
   const root=document.querySelector('[data-movie-nights]'),video=document.querySelector('[data-night-player] video'),player=document.querySelector('[data-player-root]'),unlock=document.querySelector('[data-player-unlock]');
   return {
    phase:root?.querySelector('[data-night-phase]')?.textContent,
    broadcastStatus:root?.querySelector('[data-night-status]')?.textContent,
    button:root?.querySelector('[data-night-join]')?.textContent,
    playerVisible:root?.querySelector('[data-night-player]')?.hidden,
    lobbyVisible:root?.querySelector('[data-night-lobby]')?.hidden,
    playerState:player?.dataset.playerState,
    playerArtwork:player?.dataset.playerArtworkPending,
    sourceText:player?.querySelector('[data-player-status]')?.textContent?.slice(0,500),
    unlockVisible:unlock?!unlock.hidden:null,
    playerVideo:video?{src:video.currentSrc,paused:video.paused,currentTime:video.currentTime,readyState:video.readyState,networkState:video.networkState,error:video.error?.message,muted:video.muted,ended:video.ended,duration:video.duration}:null,
    transportStatus:window.SwiflyMovieNights?.active,
    playerRuntime:typeof window.SwiflyPlayer,
    recentLogs:window.__nightPlaybackDiagnostics||null
   };
  });
  throw new Error(label+' playback not active: '+JSON.stringify(details)+' | '+error.message);
 }
}
test('two actual native players share one source and recover a personal pause and reconnect',{skip:!available,timeout:120000},async t=>{
 const first=await open(t,1440,1050,'/movie-night/'+liveId);await first.page.locator('[data-night-join]').click();await waitForNightPlayback(first.page,'first viewer');
 const second=await open(t,390,844,'/movie-night/'+liveId);await second.page.locator('[data-night-join]').click();await waitForNightPlayback(second.page,'second viewer');
 const clocks=await Promise.all([first.page,second.page].map(page=>page.evaluate(()=>({time:document.querySelector('video').currentTime,source:document.querySelector('video').currentSrc,ready:document.querySelector('video').readyState}))));assert(Math.abs(clocks[0].time-clocks[1].time)<1.5,JSON.stringify(clocks));assert.equal(clocks[0].source,clocks[1].source);await fits(first.page);await fits(second.page);await shot(first.page,'desktop-live');await shot(second.page,'phone-live');
 await second.page.locator('[data-player-stage]').hover();await second.page.locator('[data-player-play]').click();assert(await second.page.locator('[data-night-live]').isVisible());const before=await first.page.locator('video').evaluate(v=>({time:v.currentTime,paused:v.paused}));assert.equal(before.paused,false);await second.page.locator('[data-night-live]').click();await second.page.waitForFunction(()=>!document.querySelector('video').paused);assert(Math.abs((await first.page.locator('video').evaluate(v=>v.currentTime))-(await second.page.locator('video').evaluate(v=>v.currentTime)))<1.5);
 await second.context.setOffline(true);
 // Playwright's network emulation may not emit navigator offline/online events on
 // every Chromium runner. Dispatch the browser events explicitly and verify the
 // actual production handler immediately pauses playback until fresh admission.
 await second.page.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await second.page.waitForFunction(()=>{
  const video=document.querySelector('[data-night-player] video');
  return video?.paused&&/reconnect/i.test(document.querySelector('[data-night-status]')?.textContent||'');
 });
 await second.context.setOffline(false);
 await second.page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await waitForNightPlayback(second.page,'viewer after reconnect');assert(Math.abs((await first.page.locator('video').evaluate(v=>v.currentTime))-(await second.page.locator('video').evaluate(v=>v.currentTime)))<2);assert.deepEqual([...first.errors,...second.errors],[]);
});
test('shared source failure keeps its selected movie and a useful retry state',{skip:!available,timeout:90000},async t=>{const f=await open(t,390,844,'/movie-night/'+errorId);await f.page.locator('[data-night-status]').filter({hasText:/source could not load/}).waitFor();assert.equal(await f.page.locator('[data-night-feature-title]').textContent(),films[1].title);assert.equal(await f.page.locator('[data-night-join]').isDisabled(),true);await fits(f.page);await shot(f.page,'phone-source-error');assert.deepEqual(f.errors,[]);});
test('a real account changes its ballot once and sends safely rendered persistent chat',{skip:!available,timeout:90000},async t=>{
 const f=await open(t,1440,1050);const response=await f.context.request.post(origin+'/api/connect/auth/signup',{data:{name:'Screening member',email:'screening-fixture@example.invalid',handle:'screeningfixture',password:'an isolated browser test password'}});assert.equal(response.status(),201);await f.page.reload();await f.page.waitForFunction(()=>window.SwiflyMovieNights?.active&&document.querySelector('[data-night-message-form]')?.hidden===false);
 await f.page.locator('[data-night-vote="1"]').click();await f.page.waitForFunction(()=>document.querySelector('[data-night-vote="1"]').getAttribute('aria-pressed')==='true');await f.page.locator('[data-night-vote="2"]').click();await f.page.waitForFunction(()=>document.querySelector('[data-night-vote="2"]').getAttribute('aria-pressed')==='true');assert.equal(await f.page.locator('[data-night-total-votes]').textContent(),'1');assert.equal(await f.page.locator('[data-night-vote="1"]').getAttribute('aria-pressed'),'false');
 await f.page.locator('[data-night-message]').fill('Ready for the screening <img src=x onerror=alert(1)>');await f.page.locator('[data-night-message-form] button').click();await f.page.locator('[data-night-message-list] p').filter({hasText:'Ready for the screening <img'}).waitFor();assert.equal(await f.page.locator('[data-night-message-list] img').count(),0);await shot(f.page,'desktop-voted-and-chat');await f.page.reload();await f.page.waitForFunction(()=>window.SwiflyMovieNights?.active&&document.querySelector('[data-night-vote="2"]').getAttribute('aria-pressed')==='true');assert.equal(await f.page.locator('[data-night-total-votes]').textContent(),'1');assert.deepEqual(f.errors,[]);
});
test('real Home period menus update only their native React rails and preserve the hero',{skip:!available,timeout:90000},async t=>{
 const f=await open(t);await f.page.goto(origin+'/');await f.page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready'&&!document.documentElement.hasAttribute('data-sv-loading'));
 const feature=f.page.locator('[data-home-movie-night]');
 assert.equal(await feature.locator('.svHomeNightMore').getAttribute('href'),'/movie-nights');
 assert.match(await feature.locator('.svHomeNightSpotlight').getAttribute('href'),/^\/movie-night\//);
 const row=f.page.locator('[data-st-home-section="trending-movies"]'),other=f.page.locator('[data-st-home-section="trending-tv"]');await row.locator('summary').scrollIntoViewIfNeeded();const before=await f.page.evaluate(()=>{window.__nightHero=document.querySelector('.dsHero');return document.querySelector('.dsHero')?.getAttribute('class');});await row.locator('summary').click();await row.locator('.svPeriodMenu a').filter({hasText:'Today'}).click();await f.page.waitForFunction(()=>document.querySelector('[data-st-home-section="trending-movies"] summary span')?.textContent==='Today');assert(await f.page.evaluate(()=>window.__nightHero===document.querySelector('.dsHero')));assert.equal(await other.locator('summary span').textContent(),'This Week');assert.equal(await row.locator('[data-sv-react-rail]').count(),1);assert.equal(await f.page.evaluate(()=>document.querySelector('[data-st-home-section="trending-movies"] .svPeriodTrigger').classList.contains('svGlassControl')),false);await row.locator('summary').click();await f.page.waitForFunction(()=>{const picker=document.querySelector('[data-st-home-section="trending-movies"] [data-movie-periods]');return picker?.dataset.periodState==='open'&&getComputedStyle(picker.querySelector('.svPeriodMenu')).opacity==='1';});assert.equal(await row.locator('.svPeriodMenu').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(24, 24, 24)');await shot(f.page,'home-period-open');await row.locator('summary').press('Escape');assert.deepEqual(f.errors,[]);assert(before);
});

test('Home fits the screening artwork and deep links to real ballot picks on desktop and phone',{skip:!available,timeout:90000},async t=>{
 const {event,schedule}=await api.movieNights.snapshot({headers:{}},voteId);
 assert.equal(event.phase,'voting');
 // Showcase the open ballot independently of the simultaneously live test fixture.
 const {id,startsAt,phase,candidates,winner,viewers}=event;
 const leader=candidates.reduce((first,film)=>film.votes>first.votes?film:first);
 const title='Spider-Man: Across the Spider-Verse';
 const previewCandidates=candidates.map(film=>film===leader?{...film,title}:film);
 t.mock.method(api.movieNights,'homePreview',()=>({id,startsAt,phase,candidates:previewCandidates,winner,viewers,timeZone:schedule.timeZone}));
 const firstPick=candidates.find(film=>film.id!==leader.id);
 for(const [label,width,height] of [['desktop',1440,1050],['small-phone',320,800]]){
  const f=await open(t,width,height);
  if(label==='small-phone')await f.page.route(leader.poster,route=>route.abort());
  await f.page.goto(origin+'/');
  await f.page.waitForFunction(()=>document.documentElement.dataset.swiflyReact==='ready'&&!document.documentElement.hasAttribute('data-sv-loading'));
  const feature=f.page.locator('[data-home-movie-night]');
  const spotlight=feature.locator('.svHomeNightSpotlight');
  assert.equal(await spotlight.getAttribute('href'),'/movie-night/'+voteId+'#nightBallotTitle');
  const headline=spotlight.locator('strong');
  assert.equal(await headline.textContent(),title);
  assert.equal(await feature.locator('.svHomeNightBallot li').count(),3);
  await feature.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  await f.page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-home-movie-night] img')).every(img=>img.complete&&img.naturalWidth>0));
  const displayedPoster=await spotlight.locator('.svHomeNightPoster img').getAttribute('src');
  if(label==='small-phone')assert(await headline.evaluate(node=>node.scrollHeight<=node.clientHeight+1),'narrow headlines are visible in full');
  if(label==='small-phone')assert.match(displayedPoster,/^\/assets\/community\/movie-nights-cover\.(?:png|webp)$/);
  else assert.equal(displayedPoster,leader.poster);
  const box=await spotlight.boundingBox();
  assert(box&&box.width>250&&box.height>=200&&box.x>=0&&box.x+box.width<=width+.5,JSON.stringify({label,box}));
  assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
  if(dir){
   fs.mkdirSync(dir,{recursive:true});
   await feature.screenshot({path:path.join(dir,'movie-nights-'+label+'-home-feature.png')});
  }
  await feature.getByRole('link',{name:'View '+firstPick.title+' on the ballot',exact:true}).click();
  const target='night-film-'+firstPick.id;
  await f.page.waitForURL(url=>url.pathname==='/movie-night/'+voteId&&url.hash==='#'+target);
  await f.page.waitForFunction(id=>{
   const card=document.getElementById(id);
   if(!card?.matches(':target'))return false;
   const {top,bottom}=card.getBoundingClientRect();
   return top<innerHeight-48&&bottom>104;
  },target);
  assert.deepEqual(f.errors,[]);
 }
});

test('Home keeps the original poster visible during a storage outage',{skip:!available,timeout:90000},async t=>{
 const {event,schedule}=await api.movieNights.snapshot({headers:{}},voteId);
 t.mock.method(api.movieNights,'homePreview',()=>({
  id:event.id,startsAt:event.startsAt,phase:'unavailable',candidates:[],winner:null,viewers:0,timeZone:schedule.timeZone
 }));
 for(const [label,width,height] of [['desktop',1440,1050],['small-phone',320,800]]){
  const {page,errors}=await open(t,width,height);
  await page.goto(origin+'/');
  const feature=page.locator('[data-home-movie-night]');
  await feature.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  const poster=feature.locator('.svHomeNightPoster img');
  await page.waitForFunction(()=>document.querySelector('.svHomeNightPoster img')?.naturalWidth>0);
  const cover=new URL(await poster.getAttribute('src'),origin);
  assert.equal(cover.origin,origin);
  assert.match(cover.pathname,/^\/assets\/community\/movie-nights-cover\.(?:png|webp)$/);
  const [image,copy]=await Promise.all([poster.boundingBox(),feature.locator('.svHomeNightCopy').boundingBox()]);
  assert(image&&copy&&image.width>=80&&image.height>=image.width*1.45&&copy.x+copy.width<=image.x,JSON.stringify({label,image,copy}));
  assert.equal(await feature.locator('.svHomeNightBallot').count(),0);
  assert.match(await feature.locator('.svHomeNightState').textContent(),/temporarily unavailable/);
  const directory=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
  if(directory){
   fs.mkdirSync(directory,{recursive:true});
   await feature.screenshot({path:path.join(directory,'movie-nights-'+label+'-event-cover.png'),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
 }
});

test('the screening stage and account dialog fit desktop and a narrow phone',{skip:!available,timeout:120000},async t=>{
 for(const [label,width,height] of [['desktop',1440,1050],['small-phone',320,800]]){
  const f=await open(t,width,height);
  const stage=await f.page.locator('[data-night-stage]').boundingBox();
  const heading=await f.page.locator('.nightPageTop h1').boundingBox();
  assert(stage&&heading&&stage.width>250&&stage.x>=0&&stage.x+stage.width<=width+.5&&stage.y>heading.y&&stage.y<height/2,JSON.stringify({label,stage,heading}));
  const badges=await f.page.locator('.nightStageTop').boundingBox();
  const feature=await f.page.locator('[data-night-feature-label]').boundingBox();
  assert(badges&&feature&&feature.y>=badges.y+badges.height+8,JSON.stringify({label,badges,feature}));
  await f.page.locator('[data-night-auth-open="signup"]').click();
  await f.page.locator('[data-night-auth-overlay]').waitFor({state:'visible'});
  assert.equal(await f.page.locator('.topbar').isVisible(),false);
  const dialog=await f.page.locator('[data-night-auth-overlay] [role="dialog"]').boundingBox();
  assert(dialog&&dialog.x>=0&&dialog.x+dialog.width<=width+.5,JSON.stringify({label,dialog}));
  await f.page.locator('[data-night-auth-mode="login"]').click();
  assert.equal(await f.page.locator('[name="confirmPassword"]').isVisible(),false);
  assert.equal(await f.page.locator('[name="password"]').getAttribute('autocomplete'),'current-password');
  await shot(f.page,label+'-firstparty-auth');
  await f.page.locator('[data-night-auth-close]').click();
  await f.page.locator('[data-night-ballot-signin]').click();
  await f.page.locator('[data-night-auth-overlay]').waitFor({state:'visible'});
  assert.equal(await f.page.locator('[data-night-auth-mode="login"]').getAttribute('aria-selected'),'true');
  await f.page.locator('[data-night-auth-close]').click();
  await fits(f.page);
  assert.deepEqual(f.errors,[]);
 }
});
