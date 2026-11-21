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
async function fits(page,scope='.svNightPage'){const issues=await page.evaluate(scope=>{const outside=[];for(const n of document.querySelectorAll(`${scope} :is(button,input,a)`)){if(n.closest('[hidden],template')||n.closest('.svPlayerStatus[hidden],.svPlayerPopover:not([open])'))continue;const r=n.getBoundingClientRect(),s=getComputedStyle(n);if(!r.width||!r.height||s.visibility==='hidden')continue;if(r.left<-.5||r.right>innerWidth+.5)outside.push({text:n.textContent,box:r.toJSON()});}return{overflow:document.documentElement.scrollWidth>innerWidth,outside};},scope);assert.equal(issues.overflow,false,JSON.stringify(issues));assert.deepEqual(issues.outside,[]);}
async function stageFrame(page,label){
 const frame=await page.locator('[data-night-stage]').boundingBox();
 assert(frame&&Math.abs(frame.height-frame.width*9/16)<2,JSON.stringify({label,frame}));
 return frame;
}
for(const [name,width,height]of [['desktop',1440,1050],['ipad',834,1112],['phone',390,844],['small-phone',320,800]])test('real Movie Nights ballot and chat fit '+name,{skip:!available,timeout:90000},async t=>{
 const {page,errors}=await open(t,width,height);
 const votes=page.locator('[data-night-vote]');
 await votes.first().waitFor();
 assert.equal(await votes.count(),6);
 assert.equal(await page.locator('[data-night-total-votes]').textContent(),'0');
 const stage=await stageFrame(page,name+' voting');
 const chat=await page.locator('[data-night-chat]').boundingBox();
 const ballot=await page.locator('.nightBallot').boundingBox();
 const layout=JSON.stringify({name,stage,chat,ballot});
 assert(chat&&ballot&&chat.y+chat.height<=ballot.y+.5,layout);
 if(name==='desktop')assert(chat.x>=stage.x+stage.width-.5&&chat.y<stage.y+stage.height,layout);
 else assert(chat.y>=stage.y+stage.height-.5,layout);

 const chatBody=page.locator('[data-night-chat-body]');
 const chatToggle=page.locator('[data-night-chat-toggle]');
 if(width<=390){
  assert.equal(await chatBody.isVisible(),false);
  assert.equal(await chatToggle.getAttribute('aria-expanded'),'false');
 }
 await shot(page,name+'-voting');
 await votes.first().click();
 await page.locator('[data-night-vote-status]').filter({hasText:'Sign in'}).waitFor();
 await fits(page);

 if(!await chatBody.isVisible())await chatToggle.click();
 assert(await chatBody.isVisible());
 assert.equal(await chatToggle.getAttribute('aria-expanded'),'true');
 await chatToggle.click();
 assert.equal(await chatBody.isVisible(),false);
 assert.equal(await chatToggle.getAttribute('aria-expanded'),'false');
 await fits(page);
 await shot(page,name+'-chat-collapsed');
 assert.deepEqual(errors,[]);
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
async function joinLiveStage(page,label){
 await page.locator('[data-night-lobby]').waitFor({state:'visible'});
 assert(await page.locator('[data-night-chat-body]').isVisible(),label+' starts with live chat expanded');
 assert.equal(await page.locator('[data-night-chat-toggle]').getAttribute('aria-expanded'),'true');
 const before=await stageFrame(page,label+' lobby');
 await page.locator('[data-night-join]').click();
 await waitForNightPlayback(page,label);
 await page.locator('[data-night-lobby]').waitFor({state:'hidden'});
 const after=await stageFrame(page,label+' playing');
 assert(Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1,JSON.stringify({label,before,after}));
 assert(await page.locator('[data-night-presence]').isVisible(),label+' shows the viewer count while playing');
}
test('two actual native players share one source and recover a personal pause and reconnect',{skip:!available,timeout:120000},async t=>{
 const first=await open(t,1440,1050,'/movie-night/'+liveId);await joinLiveStage(first.page,'desktop viewer');
 const second=await open(t,390,844,'/movie-night/'+liveId);await joinLiveStage(second.page,'390 px viewer');
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
 await waitForNightPlayback(second.page,'viewer after reconnect');assert(Math.abs((await first.page.locator('video').evaluate(v=>v.currentTime))-(await second.page.locator('video').evaluate(v=>v.currentTime)))<2);
 const smallest=await open(t,320,800,'/movie-night/'+liveId);
 await joinLiveStage(smallest.page,'320 px viewer');
 await fits(smallest.page);
 await shot(smallest.page,'small-phone-live');
 assert.deepEqual([...first.errors,...second.errors,...smallest.errors],[]);
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
 const originalRenderer=process.env.SWIFLY_REACT;
 t.after(()=>{process.env.SWIFLY_REACT=originalRenderer;});
 for(const [label,width,height,react] of [['desktop',1440,1050,true],['small-phone',320,800,true],['small-phone-original',320,800,false]]){
  const f=await open(t,width,height);
  const {page}=f;
  const artFailure=label==='small-phone';
  if(artFailure){
   for(const url of [leader.poster,leader.backdrop,firstPick.poster])await page.route(url,route=>route.abort());
  }
  process.env.SWIFLY_REACT=String(react);
  await page.goto(origin+'/');
  await page.waitForFunction(react=>!document.documentElement.hasAttribute('data-sv-loading')&&
   (document.documentElement.dataset.swiflyReact==='ready')===react,react);
  assert.equal(await page.locator('#swifly-react-data').count(),Number(react));
  const feature=page.locator('[data-home-movie-night]');
  const program=feature.locator('.svHomeNightProgram');
  assert.equal(await program.count(),1);
  assert(await program.getByRole('heading',{name:'Movie Nights',exact:true}).isVisible());
  const spotlight=program.locator('.svHomeNightSpotlight');
  const ballot=program.locator('.svHomeNightBallot');
  const backdrop=program.locator('.svHomeNightArt[data-night-backdrop]');
  const firstPickLink=ballot.getByRole('link',{name:'View '+firstPick.title+' on the ballot',exact:true});
  assert.equal(await spotlight.getAttribute('href'),'/movie-night/'+voteId+'#nightBallotTitle');
  const headline=spotlight.locator('strong');
  assert.equal(await headline.textContent(),title);
  assert.equal(await ballot.locator('li').count(),3);
  assert.equal(await backdrop.getAttribute('src'),leader.backdrop);
  await feature.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  if(artFailure)await backdrop.waitFor({state:'hidden'});
  else await backdrop.waitFor({state:'visible'});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-home-movie-night] img'))
   .filter(img=>!img.matches('[data-night-backdrop][hidden]'))
   .every(img=>img.complete&&img.naturalWidth>0));

  const mainPoster=spotlight.locator('.svHomeNightPoster img');
  const displayedPoster=await mainPoster.getAttribute('src');
  if(artFailure){
   const cover=/^\/assets\/community\/movie-nights-cover\.(?:png|webp)$/;
   assert.match(displayedPoster,cover);
   assert.match(await firstPickLink.locator('.svHomeNightPickFrame.isEventPoster img').getAttribute('src'),cover);
  }else{
   assert.equal(displayedPoster,leader.poster);
   assert.equal(await firstPickLink.locator('img').getAttribute('src'),firstPick.poster);
  }

  const posters=await ballot.locator('.svHomeNightPickFrame').evaluateAll(frames=>frames.map(node=>({
   frame:node.getBoundingClientRect().toJSON(),image:node.querySelector('img')?.getBoundingClientRect().toJSON(),
  })));
  assert.equal(posters.length,3);
  for(const {frame,image} of posters){
   assert(frame.width>0&&image?.width>0&&Math.abs(frame.height-frame.width*1.5)<=2&&
    Math.abs(image.height-image.width*1.5)<=2,JSON.stringify({label,frame,image}));
   assert(Math.abs(frame.width-image.width)<=2&&Math.abs(frame.height-image.height)<=2,JSON.stringify({label,frame,image}));
   assert(image.x>=-.5&&image.x+image.width<=width+.5,JSON.stringify({label,image}));
  }

  const box=await spotlight.boundingBox();
  assert(box&&box.width>250&&box.height>=200&&box.x>=0&&box.x+box.width<=width+.5,JSON.stringify({label,box}));
  await fits(page,'[data-home-movie-night]');
  if(width===320){
   for(const locator of [headline,spotlight.locator('.svHomeNightFacts')]){
    assert(await locator.evaluate(node=>node.scrollHeight<=node.clientHeight+1&&node.scrollWidth<=node.clientWidth+1),label+' text fits in full');
   }
   const [copy,poster,action]=await Promise.all([
    spotlight.locator('.svHomeNightCopy').boundingBox(),mainPoster.boundingBox(),spotlight.locator('.svHomeNightAction').boundingBox(),
   ]);
   const layout=JSON.stringify({label,box,copy,poster,action});
   assert(copy&&poster&&action&&Math.max(copy.x+copy.width,action.x+action.width)<=poster.x+.5,layout);
   assert([copy,poster,action].every(item=>item.x>=box.x-.5&&item.x+item.width<=box.x+box.width+.5&&
    item.y>=box.y-.5&&item.y+item.height<=box.y+box.height+.5),layout);
  }
  const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
  if(dir){
   fs.mkdirSync(dir,{recursive:true});
   await feature.screenshot({path:path.join(dir,'movie-nights-'+label+'-home-feature.png')});
  }
  await firstPickLink.click();
  const target='night-film-'+firstPick.id;
  await page.waitForURL(url=>url.pathname==='/movie-night/'+voteId&&url.hash==='#'+target);
  await page.waitForFunction(id=>{
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
  const stage=await stageFrame(f.page,label+' stage');
  const heading=await f.page.locator('.nightPageTop h1').boundingBox();
  assert(heading&&stage.width>250&&stage.x>=0&&stage.x+stage.width<=width+.5&&stage.y>heading.y&&stage.y<height/2,JSON.stringify({label,stage,heading}));
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

test('standalone account pages fit and recover a Movie Nights sign-in on a narrow phone',{skip:!available,timeout:60000},async t=>{
 const redirect=`/movie-night/${voteId}?from=home#night-film-1`;
 const target=new URLSearchParams({redirect});
 const sessionUrl=origin+'/api/connect/session';
 const originalRenderer=process.env.SWIFLY_REACT;
 t.after(()=>{process.env.SWIFLY_REACT=originalRenderer;});
 // Exercise the production renderer and the original renderer with account JavaScript enabled.
 for(const [label,width,height,react] of [['desktop',1440,1050,true],['small-phone',320,800,true],['small-phone-original',320,800,false]]){
  process.env.SWIFLY_REACT=String(react);
  const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',reducedMotion:'reduce'});
  t.after(()=>context.close());
  const page=await context.newPage(),errors=[],authWrites=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
   if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/connect/auth/'))authWrites.push(request.url());
  });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//,route=>route.fulfill({contentType:'text/css',body:''}));
  let sessionUnavailable=label==='small-phone';
  await page.route(sessionUrl,route=>sessionUnavailable
   ?route.fulfill({status:503,json:{code:'storage_unavailable',message:'Fixture account storage is unavailable.'}})
   :route.continue());
  const availability=page.locator('[data-auth-availability]');
  const submit=page.locator('[data-auth-submit]');
  const accountOptions=page.getByRole('navigation',{name:'Account options'});
  const password=page.locator('input[name="password"]');
  const loading=page.locator('html[data-sv-loading], html[data-sv-artwork-state="loading"]');

  await page.goto(origin+'/login?'+target);
  await page.getByRole('heading',{name:'Welcome back',level:1}).waitFor();
  await loading.waitFor({state:'detached'});
  assert.equal(await password.getAttribute('autocomplete'),'current-password');
  if(sessionUnavailable){
   await availability.waitFor({state:'visible'});
   const status=availability.locator('[data-auth-status]');
   assert.match(await status.textContent(),/unavailable|try again|check/i);
   assert(await submit.isDisabled());
   await fits(page,'[data-auth-mode]');
   await shot(page,label+'-standalone-login-unavailable');
   sessionUnavailable=false;
   await Promise.all([
    page.waitForResponse(response=>response.url()===sessionUrl&&response.ok()),
    availability.locator('[data-auth-retry]').click(),
   ]);
  }
  await page.locator('[data-auth-submit]:enabled').waitFor();
  await availability.waitFor({state:'hidden'});
  assert.equal(await page.locator('#swifly-react-data').count(),Number(react));
  assert.equal(await page.locator('.topbar').isVisible(),false);
  assert.equal(await page.locator('.mobileNav').isVisible(),false);
  assert.equal(await accountOptions.getByRole('link',{name:'Log in',exact:true}).getAttribute('aria-current'),'page');
  const tabColor=link=>link.evaluate(element=>getComputedStyle(element).backgroundColor);
  assert.notEqual(await tabColor(accountOptions.locator('[aria-current]')),await tabColor(accountOptions.locator('a:not([aria-current])')));
  assert.equal(await page.locator('main[data-auth-mode] .svGlassSurface').count(),0);
  assert.equal(await page.locator('.dsAuthCard').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(19, 24, 32)');
  const formSurfaces=page.locator('.dsAuthCard, .dsAuthSwitch, #safeAuthForm input, [data-auth-submit]');
  assert(await formSurfaces.evaluateAll(elements=>elements.every(element=>getComputedStyle(element).backdropFilter==='none')));
  await fits(page,'[data-auth-mode]');
  await shot(page,label+'-standalone-login');

  await accountOptions.getByRole('link',{name:'Sign up',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/signup'&&url.searchParams.get('redirect')===redirect);
  await page.getByRole('heading',{name:'Create account',level:1}).waitFor();
  await page.locator('[data-auth-submit]:enabled').waitFor();
  assert.equal(await page.locator('#swifly-react-data').count(),Number(react));
  assert.equal(await accountOptions.getByRole('link',{name:'Sign up',exact:true}).getAttribute('aria-current'),'page');
  assert.notEqual(await tabColor(accountOptions.locator('[aria-current]')),await tabColor(accountOptions.locator('a:not([aria-current])')));
  assert.equal(await page.locator('main[data-auth-mode] .svGlassSurface').count(),0);
  const loginUrl=new URL(await accountOptions.getByRole('link',{name:'Log in',exact:true}).getAttribute('href'),origin);
  assert.equal(loginUrl.pathname,'/login');
  assert.equal(loginUrl.searchParams.get('redirect'),redirect);
  assert.equal(await password.getAttribute('autocomplete'),'new-password');
  const toggle=page.locator('[data-auth-toggle-password]');
  await toggle.click();
  assert.equal(await password.getAttribute('type'),'text');
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  await toggle.click();
  assert.equal(await password.getAttribute('type'),'password');
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await loading.waitFor({state:'detached'});
  await fits(page,'[data-auth-mode]');
  await shot(page,label+'-standalone-signup');
  assert.deepEqual(authWrites,[]);
  assert.deepEqual(errors,[]);
 }
});

test('the real signup form creates a temporary account on a hosted instance',{skip:!available,timeout:45000},async t=>{
 const hosted={RENDER:'true',SWIFLY_ACCOUNT_STORE:'temporary',DATABASE_URL:'postgres://127.0.0.1:1/unused'};
 const prior=Object.fromEntries(Object.keys(hosted).map(key=>[key,process.env[key]]));
 let temporary;
 try{Object.assign(process.env,hosted);temporary=loadServer();}
 finally{for(const [key,value] of Object.entries(prior)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }}
 temporary.setTmdb(tmdb);
 t.after(()=>new Promise(resolve=>temporary.io.close(resolve)));
 await new Promise(resolve=>temporary.httpServer.listen(0,'127.0.0.1',resolve));
 const site='http://127.0.0.1:'+temporary.httpServer.address().port;
 const context=await browser.newContext({viewport:{width:320,height:800},reducedMotion:'reduce'});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//,route=>route.fulfill({contentType:'text/css',body:''}));
 await page.goto(site+'/signup?redirect='+encodeURIComponent('/login?created=1'));
 await page.locator('[data-account-temporary]').filter({hasText:'reset when SwiflyTV restarts'}).waitFor();
 await page.locator('input[name="name"]').fill('Temporary member');
 await page.locator('input[name="email"]').fill('temporary-member@example.test');
 await page.locator('input[name="password"]').fill('an isolated browser test password');
 await page.locator('[data-auth-submit]').click();
 await page.waitForURL(site+'/login?created=1');
 const session=await (await context.request.get(site+'/api/connect/session')).json();
 assert.equal(session.user.name,'Temporary member');
 assert.equal(session.available,true);
 assert.equal(session.temporary,true);
 const night=await context.request.get(site+'/movie-nights');
 assert.match(await night.text(),/id="nightAuthIntro">Accounts, synced lists, votes and chat reset/);
});
