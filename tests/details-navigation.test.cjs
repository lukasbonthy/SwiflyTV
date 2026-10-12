const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,tick,cleanup}=require('./ui-helpers.cjs');test.afterEach(cleanup);
const api=loadServer();
const fragment=id=>'<article class="svTitleDetails" data-detail-id="'+id+'"><h1>Movie '+id+'</h1><a href="/movie/202">Another title</a><p>Story and cast</p></article>';
function setup(path='/search?q=moon#results'){
 const env=browser('<a id="open" href="/movie/101">Movie 101</a>',{path}),w=env.window;
 w.fetch=async url=>({ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])});w.boot('details.js');return env;
}
function traversal(w,action){return new Promise(resolve=>{w.addEventListener('popstate',async()=>{await tick();resolve();},{once:true});action();});}
test('Catalog posters open details and separate Play retains episode playback data',()=>{
 const env=browser(api.movieCard({id:101,name:'Series title',media_type:'tv'})),d=env.window.document;
 const poster=d.querySelector('.posterWrap');assert.equal(poster.getAttribute('href'),'/tv/101');assert(!poster.hasAttribute('data-play-id'));
 const play=d.querySelector('.dsCardQuickActions [data-play-id="101"]');assert(play);assert.match(play.getAttribute('href'),/watch\/tv\/101\?mode=movie&s=1&e=1/);env.finish();
});
test('Opening details adds a shareable title selection while preserving catalog filters',async()=>{
 const env=setup(),w=env.window;await w.SwiflyDetails.open('/movie/101',w.document.getElementById('open'));
 assert.equal(new w.URL(w.location.href).searchParams.get('media'),'movie-101');assert.equal(new w.URL(w.location.href).searchParams.get('q'),'moon');assert.equal(w.location.hash,'#results');assert.equal(w.history.length,2);env.finish();
});
test('Browser Back closes details and Forward reopens them without losing the catalog position',{timeout:2500},async()=>{
 const env=setup(),w=env.window,d=w.document;env.page.scrollTop=650;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 d.querySelector('.svDetailViewport').scrollTop=320;
 assert.equal(new w.URL(w.location.href).searchParams.get('media'),'movie-101');
 await traversal(w,()=>w.history.back());assert.equal(d.querySelector('dialog').open,false);assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results');assert.equal(env.page.scrollTop,650);
 await traversal(w,()=>w.history.forward());assert(d.querySelector('dialog').open);assert.equal(d.querySelector('dialog h1').textContent,'Movie 101');assert.equal(d.querySelector('.svDetailViewport').scrollTop,320);env.finish();
});
test('The modal Back control returns from a recommendation to the previous title and scroll position',async()=>{
 const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));d.querySelector('.svDetailViewport').scrollTop=320;
 await w.SwiflyDetails.open('/movie/202',d.querySelector('dialog a'));const back=d.querySelector('[data-sv-dialog-back]');assert(back,'The title view needs a Back control');back.click();await tick();
 assert.equal(d.querySelector('dialog h1').textContent,'Movie 101');assert.equal(d.querySelector('.svDetailViewport').scrollTop,320);env.finish();
});
test('Closing recommendations returns to the filtered catalog instead of leaving stale title entries',{timeout:2500},async()=>{
 const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await w.SwiflyDetails.open('/movie/202',d.querySelector('dialog a'));
 assert.equal(new w.URL(w.location.href).searchParams.get('media'),'movie-202');await traversal(w,()=>w.SwiflyDetails.close());
 assert.equal(w.location.search,'?q=moon');assert.equal(d.querySelector('dialog').open,false);assert.equal(d.activeElement.id,'open');env.finish();
});
test('A shared media URL uses no synthetic history entry and its Back safely dismisses it',async()=>{
 const env=setup('/movies?genre=18&media=movie-101'),w=env.window,d=w.document;await tick();assert(d.querySelector('dialog')?.open);
 assert.equal(w.history.length,1,'A shared URL should not silently add a browser history entry');let back=0;w.history.back=()=>back++;Object.defineProperty(w.history,'length',{value:6});
 d.querySelector('[data-sv-dialog-back]').click();assert.equal(back,0);assert.equal(w.location.pathname+w.location.search,'/movies?genre=18');assert.equal(d.querySelector('dialog').open,false);env.finish();
});
test('The full detail Back link does not blindly traverse unknown browser history',()=>{
 const env=browser('<a href="/" data-sv-details-back>Back</a>',{path:'/movie/101',referrer:'https://unrelated.example/page'}),w=env.window,d=w.document;let called=0;
 Object.defineProperty(w.history,'length',{value:6});w.history.back=()=>called++;w.boot('details.js');d.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 assert.equal(called,0,'Back must not redirect to an unrelated history entry');assert.equal(d.querySelector('a').getAttribute('href'),'/');env.finish();
});
test('The full detail Back link uses the original same-origin search page',()=>{
 const env=browser('<a href="/" data-sv-details-back>Back</a>',{path:'/movie/101',referrer:'http://localhost:3000/search?q=moon#results'}),w=env.window,d=w.document;w.boot('details.js');
 assert.equal(d.querySelector('a').getAttribute('href'),'/search?q=moon#results');env.finish();
});
test('Player Back uses a validated title view and rejects an external stored destination',()=>{
 for(const [stored,expected] of [['/search?q=moon&media=movie-101','/search?q=moon&media=movie-101'],['https://unrelated.example/','/movie/101']]){
  const env=browser('<a href="/movie/101" data-sv-player-back>Back</a>',{path:'/watch/movie/101?mode=movie'}),w=env.window;
  w.sessionStorage.setItem('swiflytv.playReturn',stored);w.boot('details.js');assert.equal(w.document.querySelector('a').getAttribute('href'),expected);env.finish();
 }
});
test('Player Back traverses history only when its actual referrer matches the validated return view',()=>{
 const env=browser('<a href="/movie/101" data-sv-player-back>Back</a>',{path:'/watch/movie/101?mode=movie',referrer:'http://localhost:3000/search?q=moon&media=movie-101'}),w=env.window,d=w.document;let back=0;
 w.history.back=()=>back++;Object.defineProperty(w.history,'length',{value:3});w.sessionStorage.setItem('swiflytv.playReturn','/search?q=moon&media=movie-101');w.boot('details.js');
 d.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(back,1,'Player Back should restore the existing document when its origin is proven');env.finish();
});
test('Returning from playback restores the saved catalog and details scroll positions',async()=>{
 // Simulate a new document returning from the player, using context saved by the real outgoing click.
 const source=setup(),sw=source.window,sd=sw.document;source.page.scrollTop=650;await sw.SwiflyDetails.open('/movie/101',sd.getElementById('open'));
 sd.querySelector('.svDetailViewport').scrollTop=320;const play=sd.createElement('a');play.href='/watch/movie/101?mode=movie';play.dataset.playId='101';sd.querySelector('.svTitleDetails').append(play);play.click();
 const context=sw.sessionStorage.getItem('swiflytv.playContext');assert(context,'Playback should record the browsing context');source.finish();
 const returned=browser('<main>Catalog</main>',{path:'/search?q=moon&media=movie-101#results',referrer:'http://localhost:3000/watch/movie/101?mode=movie'}),rw=returned.window;rw.sessionStorage.setItem('swiflytv.playContext',context);rw.fetch=async()=>({ok:true,text:async()=>fragment(101)});rw.boot('details.js');await tick();
 assert.equal(returned.page.scrollTop,650);assert.equal(rw.document.querySelector('.svDetailViewport').scrollTop,320);assert.equal(rw.sessionStorage.getItem('swiflytv.playContext'),null);returned.finish();
});
test('Fresh shared links ignore old playback scroll context and consume it',async()=>{
 const env=browser('<main>Catalog</main>',{path:'/search?q=moon&media=movie-101#results'}),w=env.window;
 w.sessionStorage.setItem('swiflytv.playContext',JSON.stringify({href:'/movie/101',base:'/search?q=moon#results',top:650,detailTop:320}));w.fetch=async()=>({ok:true,text:async()=>fragment(101)});w.boot('details.js');await tick();
 assert.equal(env.page.scrollTop,0);assert.equal(w.document.querySelector('.svDetailViewport').scrollTop,0);assert.equal(w.sessionStorage.getItem('swiflytv.playContext'),null);env.finish();
});
test('Opening a poster does not add watch-history playback data to its link',async()=>{
 const env=browser(api.movieCard({id:101,title:'Movie 101'})),w=env.window,d=w.document;w.fetch=async()=>({ok:true,text:async()=>fragment(101)});w.boot('details.js');
 const poster=d.querySelector('.posterWrap'),click=new w.MouseEvent('click',{bubbles:true,cancelable:true});poster.dispatchEvent(click);await tick();
 assert(click.defaultPrevented);assert(d.querySelector('dialog')?.open);assert.equal(poster.hasAttribute('data-play-id'),false);env.finish();
});
test('Movie collections show the actual related titles and mark the current movie',async()=>{
 api.setTmdb(async endpoint=>{
  if(endpoint==='/movie/101')return {id:101,title:'Movie 101',belongs_to_collection:{id:9,name:'The collection'}};
  if(endpoint==='/collection/9')return {id:9,name:'The collection',parts:[{id:99,title:'First movie',release_date:'2020-01-01'},{id:101,title:'Movie 101',release_date:'2024-01-01'}]};
  return endpoint.endsWith('credits')?{cast:[],crew:[]}:{results:[]};
 });let html;await api.detailPage({params:{id:'101'},query:{view:'modal'}},{send:value=>html=value},'movie');
 const env=browser(html),d=env.window.document;assert(d.querySelector('#collection'),'Collection should appear for movies that belong to one');assert.match(d.querySelector('#collection').textContent,/First movie/);assert(d.querySelector('#collection [aria-current="true"]'));env.finish();
});
