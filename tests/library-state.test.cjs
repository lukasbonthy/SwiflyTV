'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser,source,cleanup,tick}=require('./ui-helpers.cjs');
afterEach(cleanup);
const profiles=[{id:'main',name:'Main'},{id:'second',name:'Second'}];
const film={id:'42',type:'movie',title:'A quiet evening',poster:'/poster.jpg',year:'2026',rating:8};
const show={id:'101',type:'tv',title:'A good series',poster:'/series.jpg',year:'2025'};
function start(markup='',rows={}){
 const b=browser(markup),w=b.window;
 w.localStorage.setItem('swiflytv.profiles',JSON.stringify(profiles));
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[0]));
 for(const [key,value]of Object.entries(rows))w.localStorage.setItem(key,JSON.stringify(value));
 w.eval(source('library-state.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert(w.SwiflyLibrary,'The library state API must initialize');
 return {...b,w,api:w.SwiflyLibrary};
}
test('legacy saved titles become the current profile library while switching profiles keeps separate mirrors',()=>{
 const b=start('',{'movieverse.watchlist':[film],'movieverse.liked':[show]}),{w,api}=b;
 assert.equal(api.read().watchlist[0].title,film.title);
 assert.equal(api.read().liked[0].type,'tv');
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[1]));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));
 assert.equal(api.read().watchlist.length,0);
 assert.equal(JSON.parse(w.localStorage.getItem('movieverse.watchlist')).length,0);
 api.setWatchlist(show,true);
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[0]));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));
 assert.deepEqual(Array.from(api.read().watchlist,m=>m.id),['42']);
 assert.equal(JSON.parse(w.localStorage.getItem('movieverse.watchlist'))[0].id,'42');
 assert.equal(api.storageKey(),'swiflytv.library.main');
});
for(const initial of ['main','second'])test('native saved titles are not reimported from a mirror into a new profile when starting on '+initial,()=>{
 const {w,api}=start('',{'swiflytv.activeProfile':profiles.find(profile=>profile.id===initial),'swiflytv.library.main':{version:1,watchlist:[film],liked:[show]},'movieverse.watchlist':[film],'movieverse.liked':[show]});
 if(initial==='main'){assert.equal(api.read().watchlist[0].id,'42');w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[1]));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));}
 assert.equal(api.read().watchlist.length,0);assert.equal(api.read().liked.length,0);
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[0]));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));
 assert.equal(api.read().watchlist[0].id,'42');assert.equal(api.read().liked[0].id,'101');
});
test('actual legacy watchlist mutations are imported through the existing library-change event',()=>{
 const {w,api}=start();let events=0;const changes=[];w.addEventListener('swifly:library-change',event=>{events++;if(event.detail?.action==='watchlist')changes.push(event.detail);});
 w.localStorage.setItem('movieverse.watchlist',JSON.stringify([film]));w.dispatchEvent(new w.Event('swifly:library-change'));
 assert.equal(api.list('watchlist').length,1);assert(events<4,'Importing an existing event cannot recursively publish itself');
 assert.equal(changes.length,1);assert.equal(changes[0].item.id,'42');assert.equal(changes[0].removed,false);
 w.localStorage.setItem('movieverse.watchlist','[]');w.dispatchEvent(new w.Event('swifly:library-change'));
 assert.equal(api.list('watchlist').length,0);
 assert.equal(changes.length,2);assert.equal(changes[1].removed,true);
});
test('episode completion persists exact watched identities independently from in-progress history',()=>{
 const {api}=start();
 assert.equal(api.remember({...show,season:2,episode:8,currentTime:60,duration:600}),true);
 assert.equal(api.list('history')[0].completed,false);assert.equal(api.list('completed').length,0);
 assert.equal(api.markWatched({...show,season:2,episode:8,duration:600}),true);
 assert.equal(api.isWatched({...show,season:2,episode:8}),true);
 assert.equal(api.isWatched({...show,season:2,episode:9}),false);
 assert.equal(api.isWatched(show),false,'One completed episode does not mark its entire series complete');
 assert.equal(api.read().watched[0].key,'tv:101:2:8');
 assert.equal(api.read().watched[0].titleKey,'tv:101');
 api.remember({...show,season:2,episode:9,currentTime:10,duration:600});
 assert.equal(api.list('completed').length,1);assert.equal(api.list('history').length,2);
 api.markWatched(film);assert.equal(api.list('completed',{type:'movie'}).length,1);
 api.removeWatched('tv:101:2:8');assert.equal(api.isWatched({...show,season:2,episode:8}),false);
});
test('folders can be created, renamed, assigned, filtered and deleted without deleting their films',()=>{
 const {api}=start();api.setWatchlist(film,true);api.setWatchlist(show,true);
 const folder=api.createFolder('Friday night');assert(folder.id);
 assert.equal(api.setFolderMember(folder.id,film,true),true);
 assert.equal(api.list('watchlist',{folder:folder.id}).length,1);
 assert.equal(api.list('watchlist',{folder:folder.id,type:'tv'}).length,0);
 assert.equal(api.renameFolder(folder.id,'Weekend'),true);assert.equal(api.read().folders[0].name,'Weekend');
 assert.throws(()=>api.createFolder('  '),/name/i);assert.throws(()=>api.createFolder('weekend'),/already/i);
 assert.equal(api.deleteFolder(folder.id),true);assert.equal(api.read().folders.length,0);assert.equal(api.list('watchlist').length,2);
});
test('profile preferences validate choices and drive watched badges and spoiler-safe episode labels',()=>{
 const {w,api}=start('<article class="movieCard"><a class="posterWrap" href="/movie/42"><img alt="A quiet evening"></a></article><section class="svDetailOverview"><p>A secret ending.</p></section><div class="svPlayerEpisodeChoice"><a data-player-episode-link href="/watch/tv/101?mode=movie&s=2&e=8" aria-label="Episode 8: A secret reveal"><span class="svPlayerEpisodeThumb"><img alt="A secret still"></span><span class="svPlayerEpisodeText"><strong>A secret reveal</strong><span class="svPlayerEpisodeOverview">The answer.</span></span></a></div>');
 api.markWatched(film);api.savePreferences({spoilerMode:true,hideWatched:true,episodeView:'rows',episodeSort:'newest',hideEpisodeBell:true,rememberLastServer:false});api.renderDecorations();
 assert.equal(w.document.body.dataset.librarySpoilers,'hide');assert.equal(w.document.body.dataset.libraryHideWatched,'true');
 assert(w.document.querySelector('.movieCard .svLibraryWatchedBadge'));
 assert.equal(w.document.querySelector('.svDetailOverview p').getAttribute('aria-hidden'),'true');
 assert(!w.document.querySelector('[data-player-episode-link]').getAttribute('aria-label').includes('secret'));
 assert.equal(api.preferences().episodeSort,'newest');assert.equal(api.preferences().rememberLastServer,false);
 api.savePreferences({episodeSort:'unsafe',hideWatched:'yes'});assert.equal(api.preferences().episodeSort,'newest');assert.equal(api.preferences().hideWatched,true);
 api.savePreferences({spoilerMode:false});assert.equal(w.document.querySelector('.svDetailOverview p').hasAttribute('aria-hidden'),false);assert.match(w.document.querySelector('[data-player-episode-link]').getAttribute('aria-label'),/secret/);
});
test('importing Trakt state is idempotent and preserves local folders and newer watched dates',()=>{
 const {w,api}=start();const folder=api.createFolder('Keep');api.savePreferences({spoilerMode:true});
 api.markWatched(film,{watchedAt:'2026-10-24T10:00:00.000Z'});const events=[];w.addEventListener('swifly:library-change',e=>events.push(e.detail));
 const data={watchlist:[show],watched:[{...film,watchedAt:'2026-01-01T00:00:00.000Z'},{...show,season:1,episode:1,watchedAt:'2026-10-20T00:00:00.000Z'}]};
 api.importState(data,'main',{source:'trakt'});api.importState(data,'main',{source:'trakt'});
 assert.equal(api.read().watched.length,2);assert.equal(api.read().watched.find(x=>x.type==='movie').watchedAt,'2026-10-24T10:00:00.000Z');
 assert.equal(api.read().folders[0].id,folder.id);assert.equal(api.preferences().spoilerMode,true);assert.equal(api.read().watchlist.length,1);assert(events.every(e=>e.source==='trakt'));
});
test('episode acknowledgement is profile scoped and account suspension invalidates outstanding response contexts',()=>{
 const {w,api}=start();api.acknowledgeEpisodes(['tv:101:2:8','tv:101:0:1','javascript:bad','tv:0:1:1']);
 assert.equal(api.episodeIsRead('tv:101:2:8'),true);assert.equal(api.episodeIsRead('tv:101:0:1'),true);assert.equal(api.read().episodeRead.length,2);
 const previous=api.contextId();w.document.dispatchEvent(new w.Event('swifly:account-suspended'));
 assert.equal(api.active,false);assert.notEqual(api.contextId(),previous);assert.equal(api.read().episodeRead.length,0);
 w.localStorage.setItem('swiflytv.accountOwner','new-account');w.document.dispatchEvent(new w.Event('swifly:account-hydrated'));assert.equal(api.active,true);assert.notEqual(api.contextId(),previous);
});
test('late inserted title cards receive the current watched decoration without a permanent frame loop',async()=>{
 const {w,api}=start();api.markWatched(film);const card=w.document.createElement('article');card.className='movieCard';card.innerHTML='<a class="posterWrap" href="/movie/42">Film</a>';w.document.body.append(card);
 await tick();w.flush();await tick();w.flush();assert(card.querySelector('.svLibraryWatchedBadge'));assert.equal(w.frameCount(),0);
});
test('newest episode sorting changes the actual player reading order and can restore oldest first',()=>{
 const episodes=[1,2,3].map(number=>'<div class="svPlayerEpisodeChoice"><a data-player-episode-link href="/watch/tv/101?mode=movie&s=2&e='+number+'">Episode '+number+'</a></div>').join('');
 const {w,api}=start('<nav class="svPlayerEpisodeGrid">'+episodes+'</nav>');
 const links=()=>Array.from(w.document.querySelectorAll('[data-player-episode-link]'),link=>new URL(link.href).searchParams.get('e'));
 api.savePreferences({episodeSort:'newest',episodeView:'rows'});assert.deepEqual(links(),['3','2','1']);assert.equal(w.document.body.dataset.libraryEpisodeView,'rows');
 api.savePreferences({episodeSort:'oldest'});assert.deepEqual(links(),['1','2','3']);
});
test('spoiler mode also protects home and TV spotlight plots and restores their accessible state',async()=>{
 const {w,api}=start('<section class="dsHeroContent"><h1>A good series</h1><p aria-hidden="false">A secret home plot.</p></section>');
 api.savePreferences({spoilerMode:true});
 const hero=w.document.querySelector('.dsHeroContent > p');assert.equal(hero.getAttribute('aria-hidden'),'true');assert(hero.hasAttribute('data-library-spoiler'));
 const spotlight=w.document.createElement('p');spotlight.className='svTvSpotlightOverview';spotlight.textContent='A secret TV plot.';w.document.body.append(spotlight);
 await tick();w.flush();await tick();w.flush();assert.equal(spotlight.getAttribute('aria-hidden'),'true');assert(spotlight.hasAttribute('data-library-spoiler'));
 api.savePreferences({spoilerMode:false});assert.equal(hero.getAttribute('aria-hidden'),'false');assert.equal(spotlight.hasAttribute('aria-hidden'),false);assert.equal(w.frameCount(),0);
});
test('cached private state stays unreadable and is not mirrored before the account is verified',async()=>{
 const b=browser('<main data-library-page></main>'),w=b.window;let resolve;
 w.SwiflyAccount={ready:new Promise(done=>{resolve=done;})};w.localStorage.setItem('swiflytv.accountOwner','old-account');
 w.localStorage.setItem('swiflytv.profiles',JSON.stringify(profiles));w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[0]));
 const privateState={version:1,watchlist:[{...film,title:'Old private title'}]};w.localStorage.setItem('swiflytv.library.main',JSON.stringify(privateState));w.localStorage.setItem('movieverse.watchlist',JSON.stringify([{...show,title:'Existing mirror'}]));
 w.eval(source('library-state.js'));w.eval(source('library-page.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const api=w.SwiflyLibrary;assert.equal(api.active,false);assert.equal(api.read().watchlist.length,0);assert(!w.document.body.textContent.includes('Old private title'));assert.equal(JSON.parse(w.localStorage.getItem('movieverse.watchlist'))[0].title,'Existing mirror');
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[1]));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));assert.equal(api.active,false);assert.equal(api.read().watchlist.length,0);
 w.localStorage.setItem('swiflytv.accountOwner','verified-account');w.localStorage.setItem('swiflytv.library.second',JSON.stringify({version:1,watchlist:[{...show,title:'Current profile title'}]}));resolve({user:{id:'verified-account'}});await tick();
 assert.equal(api.active,true);assert.equal(api.read().watchlist[0].title,'Current profile title');assert.equal(JSON.parse(w.localStorage.getItem('movieverse.watchlist'))[0].title,'Current profile title');assert(!w.document.body.textContent.includes('Old private title'));
});
test('verified guests can use local saved titles after the session check completes',async()=>{
 const b=browser(),w=b.window;let resolve;w.SwiflyAccount={ready:new Promise(done=>{resolve=done;})};w.localStorage.setItem('movieverse.watchlist',JSON.stringify([film]));
 w.eval(source('library-state.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));assert.equal(w.SwiflyLibrary.read().watchlist.length,0);
 resolve({user:null});await tick();assert.equal(w.SwiflyLibrary.active,true);assert.equal(w.SwiflyLibrary.read().watchlist[0].id,'42');
});
test('a failed account check or later suspension cannot be bypassed by switching the local profile',async()=>{
 const b=browser(),w=b.window;w.SwiflyAccount={ready:Promise.resolve({user:null,available:false})};w.localStorage.setItem('swiflytv.accountOwner','old-account');w.localStorage.setItem('movieverse.watchlist',JSON.stringify([film]));
 w.eval(source('library-state.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();w.document.dispatchEvent(new w.Event('swifly:profile-changed'));assert.equal(w.SwiflyLibrary.active,false);assert.equal(w.SwiflyLibrary.read().watchlist.length,0);
});
