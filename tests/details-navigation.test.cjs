const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,tick,cleanup}=require('./ui-helpers.cjs');test.afterEach(cleanup);
const api=loadServer();
const fragment=id=>'<article class="svTitleDetails" data-detail-id="'+id+'"><h1>Movie '+id+'</h1><a href="/movie/202">Another title</a><p>Story and cast</p></article>';
function setup(path='/search?q=moon#results'){
 const env=browser('<a id="open" href="/movie/101">Movie 101</a>',{path}),w=env.window;
 w.fetch=async url=>({ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])});w.boot('details.js');return env;
}
function traversal(w,action){return new Promise(resolve=>{w.addEventListener('popstate',async()=>{await tick();resolve();},{once:true});action();});}
const chapters='<article class="svTitleDetails"><h1>Movie 101</h1><nav class="svDetailChapterNav"><a href="#cast">Cast</a></nav><section id="cast">The cast</section></article>';
test('Standalone title chapters scroll the current page without fetching another detail view',async()=>{
 for(const type of ['movie','tv']){
  const env=browser(chapters,{path:'/'+type+'/101',reduced:true}),w=env.window,d=w.document;let requests=0;
  env.page.scrollTop=120;d.querySelector('#cast').getBoundingClientRect=()=>({top:450});
  w.fetch=async()=>{requests++;return {ok:true,text:async()=>chapters};};w.boot('details.js');
  const original=w.location.href,historyLength=w.history.length,click=new w.MouseEvent('click',{bubbles:true,cancelable:true});
  d.querySelector('.svDetailChapterNav a').dispatchEvent(click);await tick();
  assert(click.defaultPrevented);assert.equal(requests,0);assert.equal(d.querySelector('dialog'),null);
  assert.equal(w.location.href,original);assert.equal(w.history.length,historyLength);assert.equal(env.page.scrollTop,470);env.finish();
 }
});
test('Modal chapters scroll only the title viewport and preserve its catalog history entry',{timeout:2500},async()=>{
 const env=setup(),w=env.window,d=w.document;let requests=0;
 w.fetch=async()=>{requests++;return {ok:true,text:async()=>chapters};};env.page.scrollTop=650;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const viewport=d.querySelector('.svDetailViewport');viewport.scrollTop=100;viewport.getBoundingClientRect=()=>({top:80});
 d.querySelector('dialog #cast').getBoundingClientRect=()=>({top:480});
 const original=w.location.href,state=JSON.stringify(w.history.state),historyLength=w.history.length;
 d.querySelector('dialog .svDetailChapterNav a').click();await tick();
 assert.equal(requests,1);assert.equal(viewport.scrollTop,480);assert.equal(env.page.scrollTop,650);
 assert.equal(w.location.href,original);assert.equal(JSON.stringify(w.history.state),state);assert.equal(w.history.length,historyLength);
 await traversal(w,()=>w.SwiflyDetails.close());assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results');env.finish();
});
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
test('Player mode and episode controls preserve the original browsing scroll context',()=>{
 for(const [type,next] of [['movie','?mode=trailer'],['tv','?mode=movie&s=2&e=5']]){
  const href='/'+type+'/101',base='/search?q=moon#results',returnView='/search?q=moon&media='+type+'-101#results';
  const env=browser('<a id="control" href="/watch/'+type+'/101'+next+'">Next</a>',{path:'/watch/'+type+'/101?mode=movie'}),w=env.window;
  const context=JSON.stringify({href,base,top:650,detailTop:320});w.sessionStorage.setItem('swiflytv.browseReturn',base);w.sessionStorage.setItem('swiflytv.playReturn',returnView);w.sessionStorage.setItem('swiflytv.playContext',context);w.boot('details.js');w.document.getElementById('control').click();
  assert.equal(w.sessionStorage.getItem('swiflytv.playReturn'),returnView);assert.equal(w.sessionStorage.getItem('swiflytv.playContext'),context);env.finish();
 }
});
test('Switching player modes keeps a standalone title as the return destination',()=>{
 const env=browser('<a href="/watch/movie/101?mode=trailer">Trailer</a>',{path:'/watch/movie/101?mode=movie'}),w=env.window;
 w.sessionStorage.setItem('swiflytv.playReturn','/movie/101');w.boot('details.js');w.document.querySelector('a').click();assert.equal(w.sessionStorage.getItem('swiflytv.playReturn'),'/movie/101');env.finish();
});
test('Standalone Back preserves the saved hash only for the matching catalog referrer',()=>{
 for(const [referrer,expected] of [['/search?q=moon','/search?q=moon#results'],['/search?q=stars','/search?q=stars']]){
  const env=browser('<a href="/" data-sv-details-back>Back</a>',{path:'/movie/101',referrer:'http://localhost:3000'+referrer}),w=env.window;
  w.sessionStorage.setItem('swiflytv.browseReturn','/search?q=moon#results');w.boot('details.js');assert.equal(w.document.querySelector('a').getAttribute('href'),expected);env.finish();
 }
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
test('Recent titles reopen and recommendation Back restores content without another request',async()=>{
 const env=setup(),w=env.window,d=w.document;let requests=0,saved=false;
 w.syncLibraryButtons=()=>d.querySelectorAll('[data-watch-id]').forEach(button=>button.setAttribute('aria-pressed',String(saved)));
 w.fetch=async url=>{requests++;const id=url.match(/\/(?:movie|tv)\/(\d+)/)[1];return {ok:true,text:async()=>fragment(id).replace('</article>','<button data-watch-id="'+id+'"></button></article>')};};
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));d.querySelector('.svDetailViewport').scrollTop=320;
 await w.SwiflyDetails.open('/movie/202');saved=true;w.SwiflyDetails.back();await tick();
 assert.equal(requests,2,'Back should reuse its validated recent fragment');assert.equal(d.querySelector('dialog h1').textContent,'Movie 101');assert.equal(d.querySelector('.svDetailViewport').scrollTop,320);
 assert.equal(d.querySelector('dialog [data-watch-id="101"]').getAttribute('aria-pressed'),'true','Restored fragments must resync current My List state');
 env.finish();
});
test('The recent fragment cache expires entries and evicts its least recently viewed title',async()=>{
 const env=setup(),w=env.window,d=w.document;let now=1000,requests=0;
 w.Date.now=()=>now;w.fetch=async url=>{requests++;return {ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])};};
 for(let id=101;id<=108;id++)await w.SwiflyDetails.open('/movie/'+id,d.getElementById('open'));
 await w.SwiflyDetails.open('/movie/101');assert.equal(requests,8,'Eight recent title fragments fit in the cache');
 await w.SwiflyDetails.open('/movie/109');await w.SwiflyDetails.open('/movie/102');assert.equal(requests,10,'The least recently viewed title should be refetched');
 now+=90001;await w.SwiflyDetails.open('/movie/102');assert.equal(requests,11,'Expired content should be refreshed');env.finish();
});
test('Changing the active profile or kids browsing context invalidates recent fragments',async()=>{
 const env=setup(),w=env.window,d=w.document;let requests=0;
 w.fetch=async()=>{requests++;return {ok:true,text:async()=>fragment(101)};};
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',mode:'standard'}));
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await w.SwiflyDetails.open('/movie/101');assert.equal(requests,1);
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'kids',mode:'kids'}));await w.SwiflyDetails.open('/movie/101');assert.equal(requests,2);
 w.history.replaceState(null,'','/kids?media=movie-101');await w.SwiflyDetails.open('/movie/101');assert.equal(requests,3);env.finish();
});
test('Reopening a recent title does not extend its original metadata freshness deadline',async()=>{
 const env=setup(),w=env.window,d=w.document;let now=1000,requests=0;
 w.Date.now=()=>now;w.fetch=async()=>{requests++;return {ok:true,text:async()=>fragment(101)};};
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));now+=60000;await w.SwiflyDetails.open('/movie/101');assert.equal(requests,1);
 now+=30001;await w.SwiflyDetails.open('/movie/101');assert.equal(requests,2,'The cache deadline must remain tied to the network response');env.finish();
});
test('Invalid and oversized detail responses remain retryable and never enter the recent cache',async()=>{
 const env=setup(),w=env.window,d=w.document;let requests=0,html='<p>Not a title fragment</p>';
 w.fetch=async()=>{requests++;return {ok:true,text:async()=>html};};
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));assert(d.querySelector('.svDetailError'));
 html=fragment(101);await w.SwiflyDetails.open('/movie/101');assert.equal(requests,2);assert(d.querySelector('dialog h1'));
 html='<article class="svTitleDetails"><h1>Movie 202</h1><p>'+'a'.repeat(200*1024)+'</p></article>';
 await w.SwiflyDetails.open('/movie/202');await w.SwiflyDetails.open('/movie/202');assert.equal(requests,4,'Large fragments should render without being retained');env.finish();
});
test('An aborted stale detail response cannot seed the recent cache',async()=>{
 const env=setup(),w=env.window,d=w.document;let requests=0,late;
 w.fetch=async url=>{requests++;if(requests===1)return new Promise(resolve=>late=resolve);return {ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])};};
 const old=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await w.SwiflyDetails.open('/movie/202');
 late({ok:true,text:async()=>fragment(101)});await old;await w.SwiflyDetails.open('/movie/101');assert.equal(requests,3);assert.equal(d.querySelector('dialog h1').textContent,'Movie 101');env.finish();
});
