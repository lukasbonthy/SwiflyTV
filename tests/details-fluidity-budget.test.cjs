'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function library(markup){
  const env=browser(markup),w=env.window;
  w.localStorage.setItem('swiflytv.activeProfile','main');
  w.boot('library-state.js');return env;
}

test('adding a decorative glass pane schedules no library frame or whole-page rewrite',async()=>{
  const env=library('<main><article class="movieCard"><a href="/movie/42">Movie</a><button id="save">Save</button></article></main>'),w=env.window,d=w.document;
  await tick();w.flush(16);await tick();
  const pane=d.createElement('span');pane.className='svLiquidPane svNavMatchedLens';d.getElementById('save').prepend(pane);
  await tick();
  assert.equal(w.frameCount(),0,'Decorative material must not wake the library renderer');
  env.finish();
});

test('new details cards receive watched state without rewriting catalog cards',async()=>{
  const env=library('<main><article id="catalog" class="movieCard"><a href="/movie/9">Catalog</a></article></main><div id="details"></div>'),w=env.window,d=w.document;
  w.SwiflyLibrary.markWatched({id:'42',type:'movie',title:'Watched film'});
  await tick();w.flush(16);await tick();
  let rewritten=0;
  const observer=new w.MutationObserver(records=>{rewritten+=records.length;});
  observer.observe(d.getElementById('catalog'),{attributes:true,attributeFilter:['data-library-watched']});
  d.getElementById('details').innerHTML='<article id="newTitle" class="movieCard"><a href="/movie/42">Watched film</a></article>';
  await tick();w.flush(32);await tick();
  assert.equal(d.getElementById('newTitle').dataset.libraryWatched,'true');
  assert(d.querySelector('#newTitle .svLibraryWatchedBadge'));
  assert.equal(rewritten,0,'A detail insertion must not rewrite unrelated catalog decorations');
  observer.disconnect();env.finish();
});

test('a cached details visit clones the parsed fragment instead of parsing HTML again',async()=>{
  const env=browser('<a id="open" href="/movie/101">Open details</a>'),w=env.window,d=w.document;
  let parses=0;
  const NativeParser=w.DOMParser;
  w.DOMParser=class extends NativeParser{parseFromString(...args){parses++;return super.parseFromString(...args);}};
  w.fetch=async url=>({ok:true,text:async()=>'<article class="svTitleDetails"><h1>Movie '+url.match(/\/(\d+)/)[1]+'</h1><button data-watch-id="101" data-watch-type="movie">Save</button></article>'});
  w.boot('details.js');
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  await w.SwiflyDetails.open('/movie/202');
  const prior=parses;
  await w.SwiflyDetails.open('/movie/101');
  assert.equal(d.querySelector('.svDetailDialog h1').textContent,'Movie 101');
  assert.equal(parses,prior,'Cached native DOM should be cloned, not serialized and parsed again');
  env.finish();
});

test('fresh details at the top avoid synchronous scroll measurements after insertion',async()=>{
  const env=browser('<a id="open" href="/movie/101">Open details</a>'),w=env.window,d=w.document;
  let geometry=0;const positions=new WeakMap();
  Object.defineProperty(w.HTMLElement.prototype,'scrollTop',{configurable:true,
    get(){if(this.matches('.svDetailViewport')&&this.querySelector('h1'))geometry++;return positions.get(this)||0;},
    set(value){if(this.matches('.svDetailViewport')&&this.querySelector('h1'))geometry++;positions.set(this,value);},
  });
  w.HTMLElement.prototype.animate=()=>({finished:new Promise(()=>{}),pause(){},play(){},cancel(){}});
  w.fetch=async()=>({ok:true,text:async()=>'<article class="svTitleDetails"><h1>Fresh details</h1></article>'});
  w.boot('details.js');await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  assert.equal(d.querySelector('.svDetailDialog h1').textContent,'Fresh details');
  assert.equal(geometry,0,'Inserting metadata must leave its first layout to the browser render phase');
  env.finish();
});

test('new details artwork uses its declared URL without forcing computed style during entry',async()=>{
  const env=browser('<main></main>'),w=env.window,d=w.document;
  let computed=0;const original=w.getComputedStyle;
  w.getComputedStyle=(node,...args)=>{if(node.matches('.svDetailBackdrop'))computed++;return original(node,...args);};
  w.eval(require('../ui/artwork-entry.js'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const details=d.createElement('div');details.className='svDetailBackdrop';details.style.backgroundImage='url("/artwork.jpg")';d.querySelector('main').append(details);
  await tick();
  assert(details.classList.contains('svArtworkAsset'),'The original artwork fade remains installed');
  assert.equal(computed,0,'The declared background URL needs no synchronous style or layout');
  w.dispatchEvent(new w.Event('pagehide'));env.finish();
});

test('initial artwork visibility is measured before fade classes change layout',()=>{
  const env=browser('<main><img src="/one.jpg"><img src="/two.jpg"><div class="dsHeroBg" style="background-image:url(/hero.jpg)"></div></main>'),w=env.window,d=w.document;
  const writesAtRead=[];
  w.HTMLElement.prototype.getBoundingClientRect=function(){writesAtRead.push(d.querySelectorAll('.svArtworkAsset').length);return {width:200,height:100,top:0,bottom:100,left:0,right:200};};
  w.eval(require('../ui/artwork-entry.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.deepEqual(writesAtRead,[0,0,0],'All critical artwork should be measured in one read phase');
  assert.equal(d.querySelectorAll('.svArtworkAsset').length,3);
  w.dispatchEvent(new w.Event('pagehide'));env.finish();
});

test('late episode and season choices retain sort preferences with a scoped library refresh',async()=>{
  const env=library('<div class="svPlayerEpisodeGrid" id="episodes"></div><div class="svPlayerSeasons" id="seasons"></div>'),w=env.window,d=w.document;
  w.SwiflyLibrary.savePreferences({episodeSort:'newest'});await tick();w.flush(16);await tick();
  d.getElementById('episodes').innerHTML=[1,2,3].map(e=>'<a class="svPlayerEpisodeChoice" href="/watch/tv/42?s=1&e='+e+'">'+e+'</a>').join('');
  d.getElementById('seasons').innerHTML=[1,2,3].map(s=>'<a data-player-season-link href="/watch/tv/42?s='+s+'">'+s+'</a>').join('');
  await tick();w.flush(32);await tick();
  for(const id of ['episodes','seasons'])assert.deepEqual([...d.getElementById(id).children].map(n=>n.textContent),['3','2','1'],id+' receives the saved sort');
  env.finish();
});

for(const [width,selected] of [[780,'/mobile.jpg'],[1800,'/large.jpg']])test('artwork waits for the responsive hero source at '+width+'px',()=>{
  const env=browser('<main><div class="dsHeroBg" style="background-image:url(/default.jpg)"></div></main>'),w=env.window,d=w.document,loads=[];
  Object.defineProperty(w,'innerWidth',{value:width,configurable:true});
  const original=w.getComputedStyle;w.getComputedStyle=(node,...args)=>node.matches('.dsHeroBg')?{backgroundImage:'url("'+selected+'")'}:original(node,...args);
  w.Image=function(){const image=d.createElement('img');loads.push(image);return image;};
  w.eval(require('../ui/artwork-entry.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(loads.length,1);assert.equal(new URL(loads[0].src).pathname,selected,'The decode gate must use the selected CSS source');
  w.dispatchEvent(new w.Event('pagehide'));env.finish();
});
