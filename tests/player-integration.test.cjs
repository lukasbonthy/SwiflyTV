const test=require('node:test');
const assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const api=loadServer();let base,jobs;
const metadata=async endpoint=>{
 if(endpoint.endsWith('/videos'))return {results:[{site:'YouTube',type:'Trailer',key:'official01'}]};
 if(endpoint.startsWith('/genre/'))return {genres:[{id:28,name:'Action'}]};
 if(/^\/tv\/\d+$/.test(endpoint))return {id:101,name:'Severance',first_air_date:'2022-02-18',poster_path:'/series.jpg',backdrop_path:'/series-wide.jpg',seasons:[{season_number:1,episode_count:9},{season_number:2,episode_count:10}]};
 if(/^\/movie\/\d+$/.test(endpoint))return {id:Number(endpoint.split('/').at(-1)),title:'Arrival',release_date:'2016-11-11',poster_path:'/arrival.jpg',backdrop_path:'/arrival-wide.jpg'};
 return {results:[{id:101,title:'Arrival',release_date:'2016-11-11',poster_path:'/arrival.jpg',backdrop_path:'/arrival-wide.jpg',vote_average:7.9}]};
};
test.before(async()=>{api.setTmdb(metadata);await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{jobs?.destroy();await new Promise(resolve=>api.io.close(resolve));});
test.afterEach(cleanup);
const parse=html=>browser(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,''));
function inject(resolve,deadlineMs=1000){jobs=createSourceJobs({resolve,deadlineMs});api.setSourceJobs(jobs);return jobs;}
test('The normal watch route renders one native movie player with shared assets and inline party setup',async()=>{
 const response=await fetch(base+'/watch/movie/101?mode=movie'),env=parse(await response.text()),d=env.window.document;
 assert.equal(response.status,200);assert(d.querySelector('.dsHeader, .dsTopBar, .topbar'));
 assert.equal(d.querySelectorAll('.svPlayerPage video').length,1);
 assert.equal(d.querySelector('.svPlayerPage').dataset.playerId,'101');assert.equal(d.querySelector('h1').textContent.trim(),'Arrival');
 assert(d.querySelector('script[src="/assets/player/player.js?v=164"]'));assert(d.querySelector('script[src="/assets/player/watch-party.js?v=160"]'));
 assert(d.querySelector('link[href="/assets/player/player.css?v=160"]'));assert(d.querySelector('dialog.svWatchPartyDialog'));
 assert.equal(d.querySelector('.dsProxyVideoWaitingShell'),null);assert.equal(d.querySelector('.svPartyHub'),null);
 assert.equal(d.querySelector('[data-sv-player-back]').getAttribute('href'),'/movie/101');
});
test('A room invite enters managed movie playback and a create link waits for explicit submission',async()=>{
 for(const [query,managed]of[['roomId=room-one','true'],['party=create','false']]){
  const env=parse(await(await fetch(base+'/watch/movie/101?mode=movie&'+query)).text());assert.equal(env.window.document.querySelector('.svPlayerPage').dataset.playerManaged,managed);
 }
});
test('TV player preserves selected season and episode in links without claiming movie party support',async()=>{
 const env=parse(await(await fetch(base+'/watch/tv/101?mode=movie&s=2&e=8')).text()),d=env.window.document,app=d.querySelector('.svPlayerPage');
 assert.equal(app.dataset.playerSeason,'2');assert.equal(app.dataset.playerEpisode,'8');assert.equal(d.querySelector('[data-player-party-open]'),null);
 assert(d.querySelector('a[href="/watch/tv/101?mode=movie&s=2&e=9"]'));assert(d.querySelector('a[href="/watch/tv/101?mode=trailer&s=2&e=8"]'));
});
test('Trailer mode keeps an official trailer and never renders a movie loading controller surface',async()=>{
 const env=parse(await(await fetch(base+'/watch/movie/101?mode=trailer')).text()),d=env.window.document;
 assert.equal(d.querySelector('.svPlayerPage').dataset.playerMode,'trailer');assert(d.querySelector('iframe.svPlayerTrailer')?.src.includes('official01'));
 assert.equal(d.querySelector('video'),null);assert.equal(d.querySelector('[data-player-party-open]'),null);
});
test('The standalone M3U8 player retains native HLS without an unused media library',async()=>{
 const src='https://media.example/master.m3u8';
 const env=parse(await(await fetch(base+'/m3u8-player?url='+encodeURIComponent(src))).text()),w=env.window,d=w.document;
 w.HTMLMediaElement.prototype.canPlayType=type=>/mpegurl/i.test(type)?'probably':'';
 w.HTMLMediaElement.prototype.load=function(){};
 w.Hls={isSupported:()=>false};
 const script=[...d.querySelectorAll('script:not([src])')].find(node=>node.textContent.includes('standaloneM3u8Video'));
 w.eval(script.textContent);
 const video=d.getElementById('standaloneM3u8Video'),status=d.getElementById('standaloneHlsStatus');
 assert.equal(video.getAttribute('src'),src);assert.equal(status.classList.contains('isError'),false);
 video.dispatchEvent(new w.Event('canplay'));assert.match(status.querySelector('b').textContent,/ready/i);
 video.dispatchEvent(new w.Event('error'));assert.equal(status.classList.contains('isError'),true);
});
test('An early legacy room update can attach desktop native HLS before optional libraries',async()=>{
 const src='https://media.example/master.m3u8';
 const env=parse(await(await fetch(base+'/watchrooms/embed/native-fixture')).text()),w=env.window,d=w.document,handlers=new Map();
 Object.defineProperty(w.navigator,'userAgent',{value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/16.6 Safari/605.1.15'});
 w.setInterval=()=>1;w.setTimeout=()=>1;w.clearInterval=()=>{};w.clearTimeout=()=>{};
 w.HTMLMediaElement.prototype.canPlayType=type=>/mpegurl/i.test(type)?'probably':'';
 w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
 w.Hls={isSupported:()=>false};
 w.io=()=>({id:'viewer',emit(){},on(name,callback){handlers.set(name,callback);}});
 const script=[...d.querySelectorAll('script:not([src])')].find(node=>node.textContent.includes('function stableWatchroom'));
 w.eval(script.textContent);
 handlers.get('watchroom:joined')({isHost:false,room:{syncedMovie:{status:'ready',movieId:'101',playbackUrl:src,streamType:'m3u8',playAt:0,sync:{playing:false,offset:0}}}});
 assert.equal(d.getElementById('roomMovieVideo').src,src);
 assert.equal(d.getElementById('roomMovieHlsStatus').classList.contains('isError'),false);
});
test('Party navigation opens the same movie catalog with its existing hero, genres, and rows',async()=>{
 const redirect=await fetch(base+'/social',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/movies?party=1#watch-together');
 const env=parse(await(await fetch(base+'/movies?party=1')).text()),d=env.window.document;
 assert.equal(d.querySelector('.dsBrowseTop h1').textContent.trim(),'Movies');assert(d.querySelector('.genreDropdown'));assert(d.querySelector('.dsHero'));
 assert(d.querySelector('[data-party-browse]'));assert(d.querySelector('.dsContent'));assert.equal(d.querySelector('.svPartyHub'),null);
 assert(d.querySelector('script[src="/assets/player/watch-party.js?v=160"]'));assert.equal(d.querySelector('script[src*="player/player.js"]'),null);
});
test('Old movie party setup links redirect to the regular movie player',async()=>{
 const response=await fetch(base+'/social?tab=watchrooms&movieId=101',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/watch/movie/101?mode=movie&party=create');
});
test('Explicit community and legacy empty rooms remain compatible',async()=>{
 const created=await(await fetch(base+'/api/social/watchrooms/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Legacy room',creator:'Guest'})})).json();
 for(const url of ['/social?tab=chat','/social?tab=watchrooms&roomId='+created.room.id]){const response=await fetch(base+url),env=parse(await response.text());assert.equal(response.status,200);assert(env.window.document.querySelector('.svPartyHub'));}
});
test('Source polling returns pending immediately while one provider job remains shared',async()=>{
 let complete,starts=0;inject(()=>{starts++;return new Promise(resolve=>complete=resolve);});
 const first=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(first.status,'loading');assert(first.deadlineAt>first.startedAt);assert.equal(starts,1);
 const again=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(again.jobId,first.jobId);assert.equal(starts,1);
 complete({status:'ok',playbackUrl:'/api/hls-proxy/source/master.m3u8',m3u8:'https://provider.example/raw.m3u8'});await tick();
 const ready=await(await fetch(base+'/api/proxy-video-wait/movie/101')).json();assert.equal(ready.status,'ok');assert.equal(ready.playbackUrl,'/api/hls-proxy/source/master.m3u8');
});
test('The player can wait for ready media in one bounded response',async()=>{
 let complete,started;const began=new Promise(resolve=>started=resolve);
 inject(()=>{started();return new Promise(resolve=>complete=resolve);});
 const response=fetch(base+'/api/proxy-video-wait/movie/104?wait=8000');
 await began;
 complete({status:'ok',playbackUrl:'/api/hls-proxy/source/master.m3u8',streamHeaders:{cookie:'PRIVATE',Referer:'https://provider.example/watch'}});
 const ready=await(await response).json();
 assert.equal(ready.status,'ok');assert.equal(ready.playbackUrl,'/api/hls-proxy/source/master.m3u8');
 assert.doesNotMatch(JSON.stringify(ready),/PRIVATE/);
});
test('An expired provider job becomes terminal and explicit retry gets a new deadline',async()=>{
 let starts=0;inject(()=>{starts++;return new Promise(()=>{});},40);
 const loading=await(await fetch(base+'/api/proxy-video-wait/movie/102')).json();assert.equal(loading.status,'loading');await new Promise(resolve=>setTimeout(resolve,55));
 const expired=await(await fetch(base+'/api/proxy-video-wait/movie/102')).json();assert.equal(expired.status,'error');assert.equal(expired.code,'timeout');assert.equal(starts,1);
 const retried=await(await fetch(base+'/api/proxy-video-wait/movie/102?retry=1')).json();assert.equal(retried.status,'loading');assert.notEqual(retried.jobId,loading.jobId);assert(retried.deadlineAt>loading.deadlineAt);assert.equal(starts,2);
});
test('Invalid media IDs and types do not reach providers, and direct lookups are bounded',async()=>{
 let started=0;inject(()=>{started++;return new Promise(()=>{});},25);
 for(const url of ['/api/proxy-video-wait/invalid/101','/api/proxy-video-wait/movie/abc','/api/proxy-video-wait/tv/101?s=bad']){const response=await fetch(base+url),data=await response.json();assert.equal(data.status,'error');assert.equal(data.code,'invalid_request');}
 assert.equal(started,0);const data=await(await fetch(base+'/api/proxy-video/movie/103')).json();assert.equal(data.status,'error');assert.equal(data.code,'timeout');
});


test('main catalog, signup and login all have the ambient scene without compromising forms',async()=>{
 for(const route of ['/', '/movies', '/signup', '/login']){
   const response=await fetch(base+route);
   assert.equal(response.status,200,route+' status');
   const env=parse(await response.text()),d=env.window.document;
   const aurora=d.querySelector('.svAuroraBackground');
   assert(aurora,route+' should mount shared aurora');
   assert.equal(d.querySelector('script[src*="/assets/clean/aurora-shader.js"]'),null,route+' should not load WebGL aurora');
   assert(d.querySelector('link[href="/assets/clean/aurora.css?v=170"]'),route+' should load original animated SVG');
   assert.equal(aurora.querySelectorAll('.svAuroraRibbon').length,3,route+' should mount moving curtains');
   if(route==='/signup'||route==='/login'){
     assert(d.querySelector('.dsAuthBrand'),route+' account branding missing');
     assert(d.querySelector('.svAuthPrivacy'),route+' local-only description missing');
     assert(d.querySelector('.dsAuthCard h1'),route+' form heading missing');
     const form=d.querySelector('#safeAuthForm');
     assert(form);
     assert(form.querySelector('input[name="email"][required]'));
     assert(form.querySelector('input[name="password"][required]'));
     assert(d.querySelector('[data-st-open]'));
   }
 }
});

test('Signup has a name field while login keeps the form focused on actual credentials',async()=>{
 for(const [route,hasName] of [['/signup',true],['/login',false]]){
  const env=parse(await(await fetch(base+route)).text()),d=env.window.document;
  assert.equal(Boolean(d.querySelector('#safeAuthForm input[name="name"]')),hasName);
  assert.equal(d.querySelector('.dsAuthPitch,.svAuthSteps,.svAuthShowcase,.svAuthEditorialTop'),null,'No extra marketing panels on auth');
 }
});

test('simple auth pages share one centered panel and do not add distracting advertising',async()=>{
 for(const route of ['/login','/signup']){
  const response=await fetch(base+route);
  const env=parse(await response.text()),d=env.window.document;
  assert.equal(d.querySelectorAll('.dsAuthCard').length,1);
  assert.equal(d.querySelectorAll('.dsAuthBrand').length,1);
  assert.equal(d.querySelectorAll('.dsAuthCard h1').length,1);
  assert.equal(d.querySelector('.dsAuthPitch,.svAuthShowcase,.svAuthEditorialFoot'),null);
  assert(d.querySelector('#safeAuthForm input[name="email"][type="email"]'));
  assert(d.querySelector('#safeAuthForm input[name="password"][type="password"]'));
  assert(d.querySelector('[data-st-open]'));
  const css=await(await fetch(base+'/assets/clean/auth.css')).text();
  assert.match(css,/max-width:430px/);
 }
});

test('the cinema image fade loads after Aurora and Welcome styles',async()=>{
 for(const route of ['/', '/movies', '/tv', '/welcome']){
   const response=await fetch(base+route);
   assert.equal(response.status,200,route+' should load');
   const d=parse(await response.text()).window.document;
   const styles=[...d.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href'));
   const aurora=styles.findIndex(v=>v.includes('/assets/clean/aurora.css?v=170'));
   const fade=styles.findIndex(v=>v.includes('/assets/clean/hero-fade.css?v=172'));
   assert(aurora>=0 && fade>aurora,route+' fade must follow aurora');
   if(route==='/welcome'){
     const welcome=styles.findIndex(v=>v.includes('/assets/clean/welcome.css'));
     assert(fade>welcome,'fade must override welcome art masks');
   }
 }
});

test('signup is a single refined form with preserved fields and a usable password reveal',async()=>{
 const response=await fetch(base+'/signup');
 assert.equal(response.status,200);
 const html=await response.text();
 const d=parse(html).window.document;
 assert(d.querySelector('main.svAuthSignupPage'));
 assert.equal(d.querySelectorAll('.dsAuthCard').length,1);
 assert.equal(d.querySelector('.dsAuthPitch,.svAuthShowcase,.svAuthSteps'),null);
 assert.equal(d.querySelectorAll('#safeAuthForm input[required]').length,3);
 assert(d.querySelector('#safeAuthForm input[name="name"][required]'));
 assert(d.querySelector('#safeAuthForm input[name="email"][type="email"]'));
 assert(d.querySelector('#safeAuthForm input[name="password"][type="password"]'));
 assert.equal(d.querySelectorAll('[data-auth-toggle-password]').length,1);
 assert.match(html,/passwordToggle\?\.addEventListener\("click"/);
 assert.match(html,/aria-pressed/);
 const css=await (await fetch(base+'/assets/clean/auth.css')).text();
 assert.match(css,/:is\(\.svAuthLoginPage,\.svAuthSignupPage\) \.dsAuthCard/);
 assert.match(css,/\.svAuthPasswordToggle:focus-visible/);
 assert.match(html,/assets\/clean\/auth\.css\?v=173/);
});
test('movie discovery artwork fades beyond the hero instead of ending at a bordered section',async()=>{
 const response=await fetch(base+'/welcome');
 assert.equal(response.status,200);
 const d=parse(await response.text()).window.document;
 const hero=d.querySelector('.dsWelcomeHero'),bg=hero?.querySelector('.dsWelcomeHeroBg');
 const discovery=d.querySelector('#discovery.dsWelcomeDiscovery');
 assert(hero&&bg&&discovery,'Welcome should have featured image and discovery');
 const css=await (await fetch(base+'/assets/clean/hero-fade.css')).text();
 assert.match(css,/\.svWelcomeClean \.dsWelcomeHeroBg \{/);
 assert.match(css,/bottom:-clamp\(88px,12vh,158px\)/,'artwork must extend past the old hero boundary');
 assert.match(css,/\.svWelcomeClean \.svWelcomeDiscoveryIntro \{/);
 assert.match(css,/border-top:0 !important/,'remove visible separator line');
 assert.match(css,/margin-top:-clamp\(58px,8vh,88px\)/,'discovery should meet the hero gradually');
 assert.match(css,/\.dsHero \+ \.dsContent:not\(\.noHero\)/,'signed-in home should share the fade treatment');
 assert.doesNotMatch(css,/\.movieCard img/,'do not fade the actual poster cards');
});

test('featured title ambience carries artwork behind the discovery rows without affecting poster cards',async()=>{
 for(const route of ['/', '/trending?type=all', '/movies', '/tv']){
   const response=await fetch(base+route);
   assert.equal(response.status,200,route+' should render');
   const d=parse(await response.text()).window.document;
   const hero=d.querySelector('.dsHero');
   const bridge=d.querySelector('.svHeroLightBridge');
   const rows=d.querySelector('.dsContent');
   assert(hero&&bridge&&rows,route+' needs hero, bridge and content');
   assert.equal(hero.nextElementSibling,bridge,'light bridge must follow the hero');
   assert.equal(bridge.nextElementSibling,rows,'movie rows must follow the bridge');
   assert.equal(bridge.getAttribute('aria-hidden'),'true');
   assert.match(bridge.getAttribute('style')||'',/--sv-light-art:url\('/);
   assert(d.querySelector('link[href="/assets/clean/hero-fade.css?v=172"]'));
 }
 const css=await (await fetch(base+'/assets/clean/hero-fade.css?v=172')).text();
 assert.match(css,/\.svHeroLightBridge,\s*body\.svCleanShell \.svWelcomeLightBridge/);
 assert.match(css,/background-image:var\(--sv-light-art\)/);
 assert.match(css,/mask-image:radial-gradient\(ellipse/,'reflection must fade out without a hard rectangle');
 assert.match(css,/\.dsHero \+ \.svHeroLightBridge \+ \.dsContent/);
 assert.doesNotMatch(css,/\.dsPoster.*mask-image/,'posters must never be masked');
});
test('Welcome uses the featured backdrop as an ambient discovery transition',async()=>{
 const response=await fetch(base+'/welcome');
 assert.equal(response.status,200);
 const d=parse(await response.text()).window.document;
 const bridge=d.querySelector('.svWelcomeLightBridge');
 assert(bridge,'welcome bridge should exist when a hero artwork is available');
 assert.equal(bridge.getAttribute('aria-hidden'),'true');
 assert.equal(bridge.previousElementSibling?.classList.contains('dsWelcomeHero'),true);
 assert.equal(bridge.nextElementSibling?.id,'discovery');
 assert.match(bridge.getAttribute('style')||'',/--sv-light-art:url\('/);
});

test('login and signup share one compact design with identical 430px card footprints',async()=>{
 const stylesheet = await(await fetch(base+'/assets/clean/auth.css?v=173')).text();
 const shared=':is(.svAuthLoginPage,.svAuthSignupPage)';
 assert.match(stylesheet,/width:min\(430px,100%\) !important/);
 assert.match(stylesheet,/max-width:430px !important/);
 assert.doesNotMatch(stylesheet,/474px|\.svAuthSignupPage \.dsAuthShellSafe/,'signup must not be enlarged again');
 assert.match(stylesheet,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'matching two-tab controls');
 assert.match(stylesheet,/outline:2px solid rgba\(220,247,235,\.86\)/,'visible keyboard focus on fields');
 assert.match(stylesheet,/\.svAuthPasswordToggle:focus-visible/);
 assert.match(stylesheet,/prefers-reduced-motion:reduce/);
 assert(stylesheet.includes(shared),'login and signup must share the refinements');
 for(const [route,active,fields] of [['/login','Log in',2],['/signup','Sign up',3]]){
  const response=await fetch(base+route);
  assert.equal(response.status,200);
  const doc=parse(await response.text()).window.document;
  assert.equal(doc.querySelectorAll('.dsAuthCard').length,1);
  assert.equal(doc.querySelectorAll('#safeAuthForm input[required]').length,fields);
  assert.equal(doc.querySelectorAll('.svAuthKicker,.dsAuthPitch,.svAuthShowcase').length,0,'no extra decorations');
  assert.equal(doc.querySelectorAll('.dsAuthSwitch a').length,2);
  assert.equal(doc.querySelector('.dsAuthSwitch .active')?.textContent,active);
  assert.equal(doc.querySelectorAll('.svAuthPasswordToggle').length,1);
  assert(doc.querySelector('link[href="/assets/clean/auth.css?v=173"]'),'updated auth stylesheet should load');
 }
});
