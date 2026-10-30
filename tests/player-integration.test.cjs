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
test('Movie and episode pages preload the same tested HLS version as the player fallback',async()=>{
 for(const route of ['/watch/movie/101?mode=movie','/watch/tv/101?mode=movie&s=1&e=1']){
  const d=parse(await(await fetch(base+route)).text()).window.document;
  const scripts=[...d.querySelectorAll('script[src*="hls.js@"]')];assert.equal(scripts.length,1);
  assert.equal(scripts[0].getAttribute('src'),'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js');
 }
 const script=await(await fetch(base+'/assets/player/player.js')).text();
 assert(script.includes('https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js'));
});
test('Xbox movie player selects a bounded image rather than the unbounded TMDB original',async()=>{
 const desktop=await(await fetch(base+'/watch/movie/101?mode=movie')).text();
 const xbox=await(await fetch(base+'/watch/movie/101?mode=movie',{headers:{'User-Agent':'Mozilla/5.0 (Xbox; Xbox One; Windows NT 10.0) AppleWebKit/537.36 Edg/125.0'}})).text();
 const desktopArt=parse(desktop).window.document.querySelector('[data-player-art]');
 const xboxArt=parse(xbox).window.document.querySelector('[data-player-art]');
 assert.match(desktopArt?.getAttribute('src')||'',/\/original\/arrival-wide\.jpg/,'Desktop retains full-resolution player imagery');
 assert.match(xboxArt?.getAttribute('src')||'',/\/w780\/arrival-wide\.jpg/,'Xbox player uses a smaller 780px backdrop');
 assert.match(xbox,/data-player-root/,'Playback markup and transport still load on Xbox');
});

test('The normal watch route renders one native movie player with shared assets and inline party setup',async()=>{
 const response=await fetch(base+'/watch/movie/101?mode=movie'),env=parse(await response.text()),d=env.window.document;
 assert.equal(response.status,200);assert(d.querySelector('.dsHeader, .dsTopBar, .topbar'));
 assert.equal(d.querySelectorAll('.svPlayerPage [data-player-video]').length,1);
 const preview=d.querySelector('[data-call-local] video');assert(preview?.hasAttribute('muted'));assert(preview?.closest('[hidden]'),'The optional camera preview starts hidden');
 assert.equal(d.querySelector('.svPlayerPage').dataset.playerId,'101');assert.equal(d.querySelector('h1').textContent.trim(),'Arrival');
 assert(d.querySelector('script[src="/assets/player/player.js?v=267"]'));assert(d.querySelector('script[src="/assets/player/watch-party.js?v=2"]'));
 assert(d.querySelector('link[href="/assets/player/player.css?v=267"]'));assert(d.querySelector('dialog.svWatchPartyDialog'));
 assert.equal(d.querySelector('.dsProxyVideoWaitingShell'),null);assert.equal(d.querySelector('.svPartyHub'),null);
 assert.equal(d.querySelector('[data-sv-player-back]').getAttribute('href'),'/movie/101');
});
test('Movie and episode interfaces expose independent playable and downloadable actions',async()=>{
 const movie=parse(await(await fetch(base+'/watch/movie/101?mode=movie')).text()).window.document;
 assert(movie.querySelector('a.svPlayerDownload[data-sv-download][href="/download/movie/101"]'));
 assert(movie.querySelector('[data-player-servers] [data-player-server-provider]'),'Movie player has real server selection controls');
 const tv=parse(await(await fetch(base+'/watch/tv/101?mode=movie&s=1&e=3')).text()).window.document;
 assert(tv.querySelector('a.svPlayerDownload[href="/download/tv/101?s=1&e=3"]'));
 const choices=[...tv.querySelectorAll('.svPlayerEpisodeChoice')];
 assert(choices.length>=3,'Every episode in the player gets an individual download action');
 assert(choices.every(choice=>choice.querySelector('a[data-player-episode-link]')&&choice.querySelector('a[data-sv-download]')));
 assert(choices.every(choice=>!choice.querySelector('a a')),'Never nest one link inside another');
 const detail=parse(await(await fetch(base+'/movie/101')).text()).window.document;
 assert(detail.querySelector('.svDetailActions a[data-sv-download][href="/download/movie/101"]'));
 const seasonDetail=parse(await(await fetch(base+'/tv/101')).text()).window.document;
 assert(seasonDetail.querySelectorAll('.svDetailEpisodeChoice a[data-sv-download]').length>=2);
});
test('Download Options opens a cinematic movie and episode page with live option placeholders',async()=>{
 const movie=await(await fetch(base+'/download/movie/101')).text(),d=parse(movie).window.document;
 const root=d.querySelector('[data-sv-download-options]');
 assert(root,'Dedicated download route should render');
 assert.equal(root.dataset.downloadType,'movie');
 assert.equal(root.dataset.downloadId,'101');
 assert.equal(d.querySelector('.svDownloadInfo h1')?.textContent,'Arrival');
 assert.match(d.querySelector('.svDownloadPoster img')?.getAttribute('src')||'',/arrival\.jpg/);
 assert.match(d.querySelector('.svDownloadBackdrop')?.getAttribute('style')||'',/arrival-wide\.jpg/);
 assert(d.querySelector('[data-sv-download-count]'),'Availability count appears in heading');
 assert(d.querySelector('[data-sv-download-choices]'),'Available files render beneath the title');
 assert(d.querySelector('script[src="/assets/clean/download-page.js?v=4"]'));
 assert(d.querySelector('link[href="/assets/clean/download-page.css?v=262"]'));
 const invalidProvider=await fetch(base+'/api/player/server/movie/101?provider=not-installed');
 assert.equal(invalidProvider.status,400,'Reject unavailable server selections before provider network work');
 const invalidDownload=await fetch(base+'/api/download-source/movie/not-a-tmdb-id');
 assert.equal(invalidDownload.status,400,'Reject invalid downloadable-title lookups');
 const tv=parse(await(await fetch(base+'/download/tv/101?s=2&e=8')).text()).window.document;
 const episode=tv.querySelector('[data-sv-download-options]');
 assert.equal(episode.dataset.downloadType,'tv');
 assert.equal(episode.dataset.downloadSeason,'2');
 assert.equal(episode.dataset.downloadEpisode,'8');
 assert.match(tv.querySelector('.svDownloadEpisodeLabel')?.textContent||'',/Season 2.*Episode 8/);
 assert.match(tv.querySelector('.svDownloadWatchLink')?.getAttribute('href')||'',/s=2&e=8/);
});
test('A room invite enters managed movie playback and a create link waits for explicit submission',async()=>{
 for(const [query,managed]of[['roomId=room-one','true'],['party=create','false']]){
  const env=parse(await(await fetch(base+'/watch/movie/101?mode=movie&'+query)).text());assert.equal(env.window.document.querySelector('.svPlayerPage').dataset.playerManaged,managed);
 }
});
test('TV player preserves selected season and episode and offers matching watch-party setup',async()=>{
 const env=parse(await(await fetch(base+'/watch/tv/101?mode=movie&s=2&e=8')).text()),d=env.window.document,app=d.querySelector('.svPlayerPage');
 assert.equal(app.dataset.playerSeason,'2');assert.equal(app.dataset.playerEpisode,'8');assert(d.querySelector('[data-player-party-open]'));
 assert(d.querySelector('dialog.svWatchPartyDialog'));assert.match(d.querySelector('[data-party-watching-label]').textContent,/Season 2.*Episode 8/);
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
test('Social navigation opens the integrated Party Hub while movie catalog party browse remains available',async()=>{
 const response=await fetch(base+'/social',{redirect:'manual'});
 assert.equal(response.status,200);
 const social=parse(await response.text()).window.document;
 assert(social.querySelector('main.svPartyHub .partyHero'),'Social link should show the proper cinematic Party Hub');
 assert(social.querySelector('.partyNavigation [data-tab="rooms"]'));
 assert(social.querySelector('link[href="/assets/clean/experience.css?v=262"]'));
 assert(social.querySelector('link[href="/assets/player/player.css?v=267"]'));
 const scripts=[...social.querySelectorAll('script[src]')].map(node=>node.getAttribute('src'));
 const player=scripts.indexOf('/assets/player/player.js?v=267'),party=scripts.findIndex(src=>src.startsWith('/assets/party/party.js?'));
 assert(player>=0&&party>player,'Party Hub must load the shared controller before its room bridge');
 const template=social.getElementById('partyPlayerTemplate');assert(template?.content.querySelector('.svPlayerEmbedded [data-player-video]'));
 assert.equal(social.querySelector('script[src*="video.js"]'),null,'Party Hub no longer loads a duplicate playback UI');
 const env=parse(await(await fetch(base+'/movies?party=1')).text()),d=env.window.document;
 assert.equal(d.querySelector('.dsBrowseTop h1').textContent.trim(),'Movies');assert(d.querySelector('.genreDropdown'));assert(d.querySelector('.dsHero'));
 assert(d.querySelector('[data-party-browse]'));assert(d.querySelector('.dsContent'));assert.equal(d.querySelector('.svPartyHub'),null);
 assert(d.querySelector('script[src="/assets/player/watch-party.js?v=2"]'));assert.equal(d.querySelector('script[src*="player/player.js"]'),null);
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
   assert(d.querySelector('link[href^="/assets/clean/aurora.css?"]'),route+' should load original animated SVG');
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
   const aurora=styles.findIndex(v=>v.includes('/assets/clean/aurora.css?'));
   const fade=styles.findIndex(v=>v.includes('/assets/clean/hero-fade.css?v=206'));
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
 assert.match(html,/assets\/clean\/account\.js\?v=263/,'the shared server auth module owns password reveal and sign-in');
 assert.match(html,/aria-pressed/);
 const css=await (await fetch(base+'/assets/clean/auth.css')).text();
 assert.match(css,/:is\(\.svAuthLoginPage,\.svAuthSignupPage\) \.dsAuthCard/);
 assert.match(css,/\.svAuthPasswordToggle:focus-visible/);
 assert.match(html,/assets\/clean\/auth\.css\?v=262/);
});
test('movie discovery artwork fades beyond the hero without a visible seam',async()=>{
 const d=parse(await(await fetch(base+'/welcome')).text()).window.document;
 assert(d.querySelector('.dsWelcomeHero .dsWelcomeHeroBg'));
 assert(d.querySelector('#discovery.dsWelcomeDiscovery'));
 const css=await(await fetch(base+'/assets/clean/hero-fade.css?v=206')).text();
 assert.match(css,/\.svWelcomeClean \.dsWelcomeHeroBg \{/);
 assert.match(css,/bottom:-36px !important/,'backdrop continues beneath the hero');
 assert.match(css,/\.svWelcomeClean \.svWelcomeDiscoveryIntro \{/);
 assert.match(css,/border-top:0 !important/,'no visible hard separator');
 assert.match(css,/main > \.dsHero \+ \.svHeroLightBridge \+ \.dsContent/);
 assert.doesNotMatch(css,/\.movieCard img/,'poster art is not masked');
});
test('Featured art carries one decorative low-resolution light spill into discovery',async()=>{
 for(const route of ['/','/trending?type=all','/movies','/tv']){
  const response=await fetch(base+route);
  assert.equal(response.status,200,route+' should render');
  const d=parse(await response.text()).window.document;
  const hero=d.querySelector('main > .dsHero');
  const bridge=d.querySelector('main > .svHeroLightBridge');
  const rows=d.querySelector('main > .dsContent');
  assert(hero&&bridge&&rows);
  assert.equal(hero.nextElementSibling,bridge);
  assert.equal(bridge.nextElementSibling,rows);
  assert.equal(hero.querySelectorAll('.dsHeroBg').length,1,'one sharp featured frame');
  assert(hero.querySelector('.dsHeroArt > .dsHeroBg'),'the parallax picture has a stationary fade boundary');
  assert((hero.querySelector('.dsHeroBg').getAttribute('style')||'').includes('background-image:url('));
  const spill=bridge.querySelector('.svHeroSpill img');
  assert(spill,'the transition retains the actual artwork light');
  assert.match(spill.getAttribute('src')||'',/\/w300\//,'ambient art uses the small CDN rendition');
  assert.equal(spill.getAttribute('alt'),'','the light spill is decorative');
  assert.equal(bridge.getAttribute('aria-hidden'),'true');
  assert.equal(bridge.querySelectorAll('img').length,1,'one static ambient layer');
  assert.equal(bridge.getAttribute('style'),null,'no unbounded inline background paint');
  assert.equal(rows.getAttribute('style'),null,'discovery never paints a second artwork');
  assert(d.querySelector('link[href="/assets/clean/hero-fade.css?v=206"]'));
  assert(d.querySelector('script[src*="/assets/clean/hero-palette.js"]'),'the opt-in sampler API is locally hosted');assert.equal(require('../public/studio/config.js').defaults.adaptiveCinema,false,'default CSS spill never samples a canvas');
 }
 const css=await(await fetch(base+'/assets/clean/hero-fade.css?v=206')).text();
 assert.match(css,/overflow:hidden !important/,'movie must be clipped inside hero');
 assert.match(css,/bottom:0 !important/,'original art stops at hero bottom');
 assert.match(css,/background-repeat:no-repeat !important/);
 assert.match(css,/\.svHeroSpill \{/);
 assert.match(css,/pointer-events:none/,'artwork cannot intercept catalog actions');
 assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/,'respect reduced transparency');
 assert.match(css,/-webkit-mask-image/,'Safari receives the same feathered transition');
 assert.doesNotMatch(css,/background-image:var\(--sv-cinema-art\)|background-image:var\(--sv-light-art\)/);
 assert.doesNotMatch(css,/\.movieCard img/);
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
 const stylesheet = await(await fetch(base+'/assets/clean/auth.css?v=262')).text();
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
  assert(doc.querySelector('link[href="/assets/clean/auth.css?v=262"]'),'updated auth stylesheet should load');
 }
});


test('v174 gives the featured movie enough height before fading into the first catalog row',async()=>{
 const css=await(await fetch(base+'/assets/clean/finish.css?v=176')).text();
 assert.match(css,/main > \.dsHero \{/);
 assert.match(css,/calc\(100svh \+ 95px\)/,'desktop hero must be taller than one viewport');
 assert.match(css,/background-position:center 43%/,'retain more of the real featured art');
 assert.match(css,/#000 68%,rgba\(0,0,0,\.94\) 79%/,'do not fade out the art halfway down');
 assert.match(css,/\.dsHero \+ \.svHeroLightBridge \+ \.dsContent/);
 assert.match(css,/margin-top:-8px/,'keep catalog rows below most of the art');
 assert.match(css,/\.svHeroLightBridge::after \{display:none/,'eliminate double-blur stripe');
 const response=await fetch(base+'/');
 const doc=parse(await response.text()).window.document;
 const hero=doc.querySelector('main > .dsHero');
 assert(hero && hero.querySelector('.dsHeroBg'));
 assert(hero.nextElementSibling?.classList.contains('svHeroLightBridge'));
 assert(doc.querySelector('link[href="/assets/clean/finish.css?v=176"]'));
});

test('v174 keeps Welcome soft without muddy light bridge or button clipping',async()=>{
 const css=await(await fetch(base+'/assets/clean/finish.css?v=176')).text();
 assert.match(css,/\.svWelcomeClean \.svWelcomeLightBridge::after \{display:none/);
 assert.match(css,/\.svWelcomeClean \.dsWelcomeHeroBg \{/);
 assert.match(css,/opacity:\.21 !important/);
 const doc=parse(await(await fetch(base+'/welcome')).text()).window.document;
 assert(doc.querySelector('.svWelcomeLightBridge'));
 assert(doc.querySelector('link[href="/assets/clean/finish.css?v=176"]'));
 assert(doc.querySelector('.dsWelcomeActions .dsPrimaryBtn'));
});

test('Studio glass uses one material on every browsing route and native transitions remain independent',async()=>{
 const css=await(await fetch(base+'/assets/liquid-glass/controls.css?v=255')).text();
 const finish=await(await fetch(base+'/assets/clean/finish.css?v=176')).text();
 const navigation=await(await fetch(base+'/assets/clean/navigation.css?v=2')).text();
 const script=await(await fetch(base+'/assets/liquid-glass/surfaces.js?v=259')).text();
 assert.match(css,/data-st-glass="liquid"/);
 assert.match(css,/data-st-glass="subtle"/);
 assert.match(css,/data-st-glass="off"/);
 assert.match(css,/\.netflixNav,\.dsWelcomeNav/);
 assert.match(script,/\.svDetailReturn/);
 assert.match(navigation,/@view-transition \{navigation:auto;\}/);
 assert.doesNotMatch(finish,/\.svGlassSurface\.svGlassControl\.dsPrimaryBtn/,'no conflicting page-level button material');
 for(const route of ['/','/movies','/tv','/welcome','/signup','/login']){
   const response=await fetch(base+route);
   assert.equal(response.status,200,route);
   const doc=parse(await response.text()).window.document;
   assert(doc.querySelector('link[href="/assets/liquid-glass/controls.css?v=255"]'),route+' lacks unified glass');
   assert(doc.querySelector('script[src="/assets/liquid-glass/surfaces.js?v=259"]'),route+' uses stale glass renderer');
 }
 const watch=await(await fetch(base+'/watch/movie/101')).text();
 assert(!watch.includes('controls.css?v=189'),'watch page must be left alone');
});
test('v176 supplies a real, masked details backdrop with no hard border at the overview',async()=>{
 const response=await fetch(base+'/movie/101');
 assert.equal(response.status,200);
 const d=parse(await response.text()).window.document;
 const article=d.querySelector('.svTitleDetails[style*="--sv-detail-art"]');
 assert(article,'details must reuse film art for the fade');
 assert(article.querySelector('.svDetailBackdrop'));
 assert(article.querySelector('.svDetailShade'));
 assert(article.querySelector('.svDetailBody'));
 assert.equal(article.querySelectorAll('.svDetailActions > .dsPrimaryBtn').length,1);
 assert(article.querySelectorAll('.svDetailActions > .dsSecondaryBtn').length>=1);
 assert(article.querySelectorAll('.svDetailActions > .dsIconBtn').length>=2);
 const css=await(await fetch(base+'/assets/clean/polish.css?v=176')).text();
 assert.match(css,/\.svDetailBackdrop \{/);
 assert.match(css,/rgba\(0,0,0,\.22\) 94%,transparent 100%/);
 assert.match(css,/\.svDetailShade \{/);
 assert.match(css,/\.svDetailBody \{/);
 assert(d.querySelector('link[href="/assets/clean/polish.css?v=176"]'));
 assert(d.querySelector('script[src="/assets/liquid-glass/surfaces.js?v=259"]'));
});
test('v176 adds subtle Liquid Glass to both compact auth pages without resizing',async()=>{
 const css=await(await fetch(base+'/assets/clean/polish.css?v=176')).text();
 const auth=await(await fetch(base+'/assets/clean/auth.css?v=262')).text();
 assert.match(auth,/max-width:430px !important/);
 assert.doesNotMatch(css,/dsAuthShellSafe\s*\{[^}]*width:/);
 assert.match(css,/main\.dsAuthPageSafe \.dsAuthCard/);
 assert.match(css,/main\.dsAuthPageSafe \.dsSafeAuthForm \.dsPrimaryBtn/);
 assert.match(css,/data-st-glass="liquid"/);
 for(const route of ['/login','/signup']){
  const d=parse(await(await fetch(base+route)).text()).window.document;
  assert.equal(d.querySelectorAll('.dsAuthCard').length,1);
  assert(d.querySelector('link[href="/assets/clean/polish.css?v=176"]'));
 }
});

test('Catalog and profiles retain their theme while Party Hub owns its component styling',async()=>{
 const cx=await(await fetch(base+'/assets/clean/experience.css?v=262')).text();
 const profiles=await(await fetch(base+'/assets/clean/profiles.css?v=262')).text();
 assert.match(cx,/\.genreDropdown > summary\.svNavMatchedOptic/);
 assert.match(profiles,/\.dsProfilesSelectPage \.dsProfileSelectCard/);
 assert.doesNotMatch(cx,/\.svPartyHub/,'Old Party Hub overrides must not compete with its component stylesheet');
 assert.doesNotMatch(profiles,/\.svPartyHub/,'Profile styling must not compete with Party Hub');
 assert.match(profiles,/prefers-reduced-motion:reduce/);
 for(const route of ['/movies','/tv','/profiles','/profiles/manage','/social','/social?tab=watchrooms&kind=blank']){
  const response=await fetch(base+route);
  assert.equal(response.status,200,route+' should render');
  const d=parse(await response.text()).window.document;
  assert(d.querySelector('link[href="/assets/clean/experience.css?v=262"]'),route+' should load shared experience styles');
  if(route==='/movies'||route==='/tv')assert(d.querySelector('.genreDropdown > summary'));
  const avatarScript=d.querySelector('script[src="/assets/clean/avatars.js?v=209"]');
  assert(avatarScript,route+' should refresh the shared profile identity');
  const profileScript=d.querySelector('script[src="/assets/clean/profiles.js?v=209"]');
  if(route==='/profiles'||route==='/profiles/manage'){
   assert(d.querySelector('link[href="/assets/clean/profiles.css?v=262"]'));
   assert(profileScript,route+' should mount the profile editor');
   assert(avatarScript.compareDocumentPosition(profileScript)&d.defaultView.Node.DOCUMENT_POSITION_FOLLOWING,'Avatar renderer must load before the profile editor');
  }else assert.equal(profileScript,null,route+' does not need the profile editor');
  if(route==='/profiles')assert(d.querySelector('.svProfilesCinematic #profilesGrid'));
  if(route==='/profiles/manage')assert(d.querySelector('.svProfilesCinematic #profileCreateForm'));
  if(route.startsWith('/social')){assert(d.querySelector('main.svPartyHub .partyHero'));const theme=d.querySelector('link[href="/assets/party/party.css?v=262"]');assert(theme);assert(d.querySelector('link[href="/assets/clean/experience.css?v=262"]').compareDocumentPosition(theme)&d.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);}
 }
});

test('Cinema keeps natural featured color alongside the shared glass assets',async()=>{
 const d=parse(await(await fetch(base+'/')).text()).window.document;
 const hero=d.querySelector('main > .dsHero');
 const nav=d.querySelector('.netflixNav > .svLiquidPane');
 assert(hero && nav);
 assert(d.querySelector('script[src="/assets/liquid-glass/liquid-glass.js?v=227"]'));
 assert(d.querySelector('link[href="/assets/liquid-glass/liquid-glass.css?v=262"]'),'new material tokens must bypass the previous cached base stylesheet');
 const css=await(await fetch(base+'/assets/clean/hero-fade.css?v=206')).text();
 assert.match(css,/filter:none !important/);
 assert.match(css,/overflow:hidden !important/,'movie picture remains clipped');
 assert.doesNotMatch(css,/background-image:var\(--sv-cinema-art\)|background-image:var\(--sv-light-art\)/,'no duplicated artwork');
 const palette=await(await fetch(base+'/assets/clean/hero-palette.js?v=188')).text();
 assert.match(palette,/\(value-average\)\*1\.22/,'film accents remain colorful');
 assert.doesNotMatch(palette,/appendChild\(image\)/);
});

test('Browsing and playback navigation declare the same clear glass material',async()=>{
 const materials=[];
 for(const route of ['/','/watch/movie/101?mode=movie','/watch/tv/101?mode=movie&s=1&e=1']){
  const d=parse(await(await fetch(base+route)).text()).window.document;
  const nav=d.querySelector('.netflixNav');
  assert.equal(nav.querySelectorAll(':scope > .svLiquidPane').length,1);
  const panes=[...d.querySelectorAll('[data-swifly-glass]')];assert(panes.length>=3,'navigation, dropdown and mobile navigation need their shared pane');
  for(const pane of panes)materials.push([pane.dataset.glassTint,pane.dataset.glassSaturation]);
 }
 for(const material of materials){assert.deepEqual(material,materials[0]);assert.equal(Number(material[0]),.2,'all routes use the same clear face');}
});
