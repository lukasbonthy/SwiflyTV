'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM}=require('jsdom');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-kids-native-'));
process.env.SWIFLY_DATA_DIR=directory;process.env.SWIFLY_KIDS_SECRET='native-test-only-stable-kids-secret-'.repeat(3);delete process.env.SWIFLY_ACCESS_PIN;
const api=require('./ui-helpers.cjs').loadServer();let origin;const jar=new Map(),calls=[];
const title=(id,type='movie')=>({id,adult:false,...(type==='tv'?{name:'Little Explorers '+id,first_air_date:'2025-01-01',number_of_seasons:2,seasons:[{season_number:1,name:'Season 1',episode_count:2},{season_number:2,name:'Season 2',episode_count:1}]}:{title:'Cloud Friends '+id,release_date:'2025-01-01',runtime:92}),genres:[{id:16,name:'Animation'},{id:10751,name:'Family'},{id:35,name:'Comedy'}],overview:'Friends explore a garden together.',poster_path:'/safe-'+id+'.jpg',backdrop_path:'/safe-'+id+'-wide.jpg',vote_average:7.6});
async function tmdb(route,params={}){
 calls.push({route,params:{...params}});
 const match=/^\/(movie|tv)\/(\d+)(?:\/(.*))?$/.exec(route);
 if(match){const type=match[1],id=Number(match[2]),suffix=match[3];
  if(suffix==='release_dates')return {results:[{iso_3166_1:'US',release_dates:id===902?[{certification:'PG'},{certification:'R'}]:id===903?[]:[{certification:'G'}]}]};
  if(suffix==='content_ratings')return {results:[{iso_3166_1:'US',rating:id>=900?'TV-MA':'TV-Y7'}]};
  if(suffix==='recommendations'||suffix==='similar')return {results:[{id:901,title:'ADULT RECOMMENDATION',poster_path:'/adult-rec.jpg'},{id:31,title:'UNTRUSTED CANDIDATE COPY'}]};
  if(suffix==='videos')return {results:[{site:'YouTube',type:'Trailer',key:'unsafeVideo',name:'UNREVIEWED TRAILER'}]};
  if(suffix?.startsWith('season/'))return {episodes:[{episode_number:1,name:'First adventure',overview:'A garden picnic.',air_date:'2025-01-01',still_path:'/episode.jpg',runtime:22},{episode_number:2,name:'Next adventure',air_date:'2025-01-02',runtime:22}]};
  if(suffix)return {results:[],cast:[],crew:[]};
  if(id===904)throw Error('ratings metadata unavailable');
  return {...title(id,type),...(id===901?{title:'ADULT TITLE',name:'ADULT TITLE',adult:true,genres:[{id:27}],overview:'Horror.'}:{}),...(id===905?{id:1000,title:'MISMATCHED TITLE'}:{}),...(type==='tv'&&id===777?{number_of_seasons:85,seasons:Array.from({length:85},(_,i)=>({season_number:i+1,name:'Season '+(i+1),episode_count:900}))}:{})};
 }
 if(route.startsWith('/genre/'))return {genres:[{id:16,name:'Animation'},{id:10751,name:'Family'},{id:35,name:'Comedy'},{id:27,name:'ADULT GENRE'}]};
 if(/^\/(discover|search)\/(movie|tv)$/.test(route)){
  const type=route.endsWith('/tv')?'tv':'movie',page=Number(params.page)||1,base=type==='tv'?100:0;
  return {results:[{id:901,title:'ADULT CANDIDATE',adult:false,poster_path:'/adult.jpg'},...[902,903,904,905].map(id=>({id,title:'UNVERIFIED '+id})),...Array.from({length:16},(_,index)=>({id:base+(page-1)*16+index+1,title:'UNTRUSTED CANDIDATE COPY',name:'UNTRUSTED CANDIDATE COPY',poster_path:'/untrusted.jpg',genre_ids:[16,10751]}))],total_pages:3,total_results:60};
 }
 return {results:[],total_pages:1};
}
async function request(route,{method='GET',body,cookie}={}){const response=await fetch(origin+route,{method,redirect:'manual',headers:{Cookie:cookie??[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});if(cookie===undefined)for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}return response;}
async function document(route){const response=await request(route);assert.equal(response.status,200,route);return new JSDOM(await response.text()).window.document;}
test.before(async()=>{api.setTmdb(tmdb);await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{await new Promise(resolve=>api.io.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
test('Kids uses real native navigation, cinematic hero, rails and cards without adult shell containers',async()=>{
 for(const route of ['/kids','/kids/movies','/kids/tv']){const d=await document(route);assert(d.querySelector('.netflixTopbar [data-kids-shell]')||d.querySelector('.netflixTopbar[data-kids-shell]'),'native child navigation');assert(d.querySelector('.dsHero .dsHeroBg'),'native cinematic hero');assert(d.querySelector('.dsRow.svCatalogRow .movieRail.dsRail .movieCard.dsCard'),'native rails/cards');assert(!d.querySelector('.kidsGrid,.kidsTitleHero'),'custom standalone layout removed');assert(!d.querySelector('#continueWatchingSection,[data-feed-home],.dsProfileMenu,#controlPanel,[data-search-recents],.svNavPartyLink'),'adult dynamic containers absent');
  for(const link of d.querySelectorAll('.netflixNav a[href],.mobileNav a[href],.dsHeroActions a[href],.dsCard a[href]'))assert(link.getAttribute('href').startsWith('/kids'),route+' escapes via '+link.outerHTML.slice(0,150));
  assert(!/ADULT|UNTRUSTED|UNVERIFIED|MISMATCHED/.test(d.body.textContent));assert(!d.querySelector('img[src*="untrusted"],img[src*="adult"]'));
 }
});
test('Kids browse/search preserve real pages and safe filters while every visible record is verified',async()=>{
 const first=await document('/kids/browse?media=movie&category=animation&sort=rating'),second=await document('/kids/browse?media=movie&category=animation&sort=rating&page=2');
 const ids=d=>[...d.querySelectorAll('.dsCard .dsCardTitle')].map(a=>a.getAttribute('href'));assert(ids(first).length);assert(ids(second).length);assert(!ids(first).some(id=>ids(second).includes(id)),'genuine next page');
 const next=first.querySelector('.pagination a[href*="page=2"]');assert(next);const u=new URL(next.href,origin);assert.equal(u.searchParams.get('media'),'movie');assert.equal(u.searchParams.get('category'),'animation');assert.equal(u.searchParams.get('sort'),'rating');
 const d=await document('/kids/search?q=Cloud&media=movie&page=2');assert.equal(d.querySelector('form[role="search"][action="/kids/search"] input[name="q"]')?.value,'Cloud');assert(d.querySelector('.dsGrid .movieCard'));assert(!/ADULT|UNVERIFIED|UNTRUSTED/.test(d.body.textContent));assert(!d.querySelector('[data-search-studio]'),'adult async search must not run');
 await request('/api/kids/catalog?category=horror&media=person&sort_by=adult.desc&with_genres=27&include_adult=true&page=2');const candidates=calls.filter(c=>c.route.startsWith('/discover/')).slice(-2);assert(candidates.length);for(const {params}of candidates){assert.equal(params.include_adult,'false');assert(!String(params.with_genres).includes('27'));assert.notEqual(params.sort_by,'adult.desc');assert.equal(params.page,2);}
});
test('Native child detail, episodes and player remain scoped before locking',async()=>{
 const d=await document('/kids/title/tv/101');assert(d.querySelector('.svTitleDetails .svDetailHero'));assert(d.querySelector('[data-episode-show="101"][data-episode-season="2"]'));assert(!d.querySelector('[data-share-title],[data-sv-download],[data-sv-party-movie-id],iframe'));
 assert.equal([...d.querySelectorAll('.svDetailGenres a')].some(a=>a.textContent==='Comedy'),false,'unsupported genre names must not silently open Family');assert.match(d.querySelector('.svDetailGenres').textContent,/Comedy/);
 const rec=[...d.querySelectorAll('.svDetailRecommendations .dsCardTitle')];assert(rec.some(a=>a.textContent==='Cloud Friends 31'||a.textContent==='Little Explorers 31'));assert(!/ADULT|UNTRUSTED|UNVERIFIED/.test(d.body.textContent));
 assert(d.querySelector('.svDetailActions a[href^="/kids/watch/tv/101"]'));const p=await document('/kids/watch/tv/101?mode=trailer&roomId=abc&embedUrl=https://bad.invalid');assert.equal(p.querySelector('[data-player-root]')?.dataset.playerKidsVerified,'true');assert.equal(p.querySelector('[data-player-root]')?.dataset.playerMode,'movie');assert(p.querySelector('[data-sv-player-back]')?.getAttribute('href').startsWith('/kids/title/tv/101'));assert(!p.querySelector('.svPlayerTogether,.svPlayerPartySlot,[data-player-download],iframe'));
 for(const id of [901,902,903,904,905]){const response=await request('/kids/title/movie/'+id);assert.equal(response.status,404,'unverified detail '+id);assert(!(await response.text()).includes('ADULT TITLE'));}
});
test('Locked native child navigation stays visible and all unrestricted APIs and account escape routes stay denied',async()=>{
 const setup=await request('/api/kids/setup',{method:'POST',body:{password:'a native parent password',confirm:'a native parent password'}});assert.equal(setup.status,201);
 for(const route of ['/kids','/kids/movies','/kids/tv','/kids/browse','/kids/search?q=Cloud','/kids/title/tv/101','/kids/watch/tv/101?s=2&e=1'])assert.equal((await request(route)).status,200,route);
 const d=await document('/kids');assert.equal(d.documentElement.dataset.kidsLocked,'true');assert(d.querySelector('.netflixNav[data-kids-shell],.netflixTopbar[data-kids-shell] .netflixNav'));assert(d.querySelector('[data-kids-parent-open]'));
 for(const route of ['/api/discovery/search?q=horror','/api/tmdb/trending/all/week','/api/feed','/api/library/next/tv/901','/api/library/episodes/tv/901/1'])assert.equal((await request(route)).status,423,route);
 assert.equal((await request('/api/library/episodes/tv/101/2')).status,200);assert.equal((await request('/api/library/next/tv/101?s=1&e=1')).status,200);
 for(const route of ['/profiles','/account','/social'])assert.equal((await request(route)).headers.get('location'),'/kids?parent=1');assert.equal((await request('/api/kids/unlock',{method:'POST',body:{password:'wrong parent password'}})).status,401);assert.equal((await request('/api/kids/unlock',{method:'POST',body:{password:'a native parent password'}})).status,200);
});

test('Native season browsing bounds initial metadata and DOM while later seasons and episodes stay reachable',async()=>{
 const before=calls.length,first=await document('/kids/title/tv/777');
 assert.equal(first.querySelectorAll('[data-episode-season]').length,40);assert.equal(first.querySelectorAll('.svDetailEpisodeTile').length,24);
 assert.equal(calls.slice(before).filter(call=>/^\/tv\/777\/season\//.test(call.route)).length,1,'only selected season metadata is requested');
 assert(first.querySelector('.kidsSeasonPages a[href*="season=41"]'));
 const later=await document('/kids/title/tv/777?season=81');assert(later.querySelector('[data-episode-season="81"][open]'));assert(later.querySelector('.kidsSeasonPages a[href*="season=41"]'));
 assert(later.querySelector('.svDetailEpisodeTile[href*="s=81"]'));assert(later.querySelector('a[href*="s=81"][href*="e=25"]'),'a long season remains reachable through the bounded player');
 const p=await document('/kids/watch/tv/777?s=81&e=850');assert(p.querySelectorAll('[data-player-episode-link]').length<=200);assert(p.querySelector('[data-player-season-link][aria-current="true"]'));
 for(const link of p.querySelectorAll('[data-player-episode-link],[data-player-season-link]'))assert(link.getAttribute('href').startsWith('/kids/watch/tv/777'));
});
test('Child shell rejects unknown routes and never boots adult history, search, account or detail caches',async()=>{
 for(const route of ['/kids','/kids/search?q=Cloud','/kids/title/movie/1','/kids/watch/movie/1']){
  const d=await document(route);for(const script of d.querySelectorAll('script[src]'))assert(!/\/(?:continue|library-state|feed|account|details|download|studio|connect|search)\.js(?:\?|$)/.test(script.getAttribute('src')),script.outerHTML);
  assert(!d.querySelector('[data-play-id],[data-watch-id],[data-like-id]'),'native child anchors do not bind adult library handlers');
 }
 const missing=await request('/kids/unknown');assert.equal(missing.status,404);assert((await missing.text()).includes('data-kids-shell'));
});
