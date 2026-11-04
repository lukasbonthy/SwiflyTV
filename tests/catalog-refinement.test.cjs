'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup,loadServer}=require('./ui-helpers.cjs');
const {searchMarkup}=require('../ui/discovery');
test.afterEach(cleanup);
const pause=()=>new Promise(resolve=>setTimeout(resolve,245));

test('a pending search replacement preserves keyboard focus and keeps the popup open',async()=>{
 const {window:w}=browser('<button id="svNavSearchToggle">Search</button>'+searchMarkup()),d=w.document,requests=[];
 w.fetch=()=>new Promise(resolve=>requests.push(resolve));w.boot('clean.js');d.getElementById('svNavSearchToggle').click();
 const input=d.getElementById('svNavSearchInput');
 input.value='Barbie';input.dispatchEvent(new w.Event('input'));await pause();requests.shift()({ok:true,json:async()=>({results:[{title:'Barbie',type:'movie',href:'/movie/346698'}]})});await tick();
 input.value='Barbie movie';input.dispatchEvent(new w.Event('input'));await pause();
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(d.activeElement.matches('[data-search-result]'));
 requests.shift()({ok:true,json:async()=>({results:[{title:'Barbie updated',type:'movie',href:'/movie/346698'}]})});await tick();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(d.getElementById('svNavSearchPopup').hidden,false);assert.equal(d.activeElement.textContent.includes('Barbie updated'),true);
 input.focus();input.value='Other movie';input.dispatchEvent(new w.Event('input'));await pause();input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 requests.shift()({ok:true,json:async()=>({results:[]})});await tick();assert.equal(d.activeElement,input);
});

test('search keeps its current results while updating and clears busy state on failure',async()=>{
 const {window:w}=browser('<button id="svNavSearchToggle">Search</button>'+searchMarkup()),d=w.document,requests=[];
 w.fetch=()=>new Promise(resolve=>requests.push(resolve));w.boot('clean.js');d.getElementById('svNavSearchToggle').click();
 const input=d.getElementById('svNavSearchInput'),results=d.querySelector('[data-search-results]'),edit=value=>{input.value=value;input.dispatchEvent(new w.Event('input'));};
 edit('Barbie');await pause();requests.shift()({ok:true,json:async()=>({results:[{title:'Barbie',type:'movie',href:'/movie/346698'}]})});await tick();
 const original=results.firstElementChild;edit('Barbie movie');assert.equal(results.firstElementChild,original);assert.equal(results.getAttribute('aria-busy'),'true');assert.match(d.querySelector('[data-search-status]').textContent,/Updating/);
 await pause();requests.shift()({ok:false,json:async()=>({message:'Try again'})});await tick();assert.equal(results.firstElementChild,original);assert.equal(results.getAttribute('aria-busy'),'false');
 edit('');assert.equal(results.children.length,0);assert.equal(results.getAttribute('aria-busy'),'false');
});

test('episode observation ignores catalog mutations and initializes inserted seasons locally',async()=>{
 const {window:w}=browser('<main id="catalog"></main>'),d=w.document;let calls=0,scans=0;
 w.fetch=async()=>{calls++;return {ok:true,json:async()=>({episodes:[{episode:1,name:'Pilot',airDate:'2020-01-01'}]})};};w.boot('episode-browser.js');await tick();
 const query=d.querySelectorAll.bind(d);d.querySelectorAll=selector=>{scans++;return query(selector);};d.getElementById('catalog').innerHTML='<article><img><span>Unrelated result</span></article>';
 await tick();await tick();assert.equal(scans,0);assert.equal(calls,0);
 const panel=d.createElement('details');panel.open=true;panel.dataset.episodeShow='5';panel.dataset.episodeSeason='1';panel.innerHTML='<summary>Season 1</summary><div class="dsEpisodeChips"></div>';d.getElementById('catalog').append(panel);await tick();await tick();
 assert.equal(calls,1);assert.match(panel.textContent,/Pilot/);assert.equal(scans,0);
});

test('catalog arrows follow boundaries and resizing without vertical scroll work',()=>{
 const {window:w}=browser('<section class="dsRow"><h2>Movies</h2><div class="dsRowControls"><button>Previous</button><button>Next</button></div><div class="movieRail"><a href="/movie/1">Movie</a></div></section>'),d=w.document;
 const rail=d.querySelector('.movieRail'),buttons=d.querySelectorAll('.dsRowControls button');let width=300,resize;Object.defineProperties(rail,{clientWidth:{get:()=>width},scrollWidth:{get:()=>900}});
 w.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}disconnect(){}};w.boot('catalog.js');w.flush(0);w.dispatchEvent(new w.Event('scroll'));assert.equal(w.frameCount(),0);
 assert.equal(buttons[0].getAttribute('aria-disabled'),'true');assert.equal(buttons[1].getAttribute('aria-disabled'),'false');rail.scrollLeft=600;rail.dispatchEvent(new w.Event('scroll'));w.flush(16);
 assert.equal(buttons[0].getAttribute('aria-disabled'),'false');assert.equal(buttons[1].getAttribute('aria-disabled'),'true');width=900;rail.scrollLeft=0;resize([{target:rail}]);w.flush(32);assert.equal(d.querySelector('.dsRowControls').hidden,true);
});

test('featured artwork uses one metadata request and library-page code is only delivered where used',async()=>{
 const api=loadServer();try{
  const movie={id:346698,title:'Barbie',backdrop_path:'/art.jpg',images:{logos:[{file_path:'/title.png',iso_639_1:'en',width:500,height:200}]}},requests=[];
  api.setTmdb(async(path,params)=>{requests.push([path,params]);return path==='/movie/346698'?movie:{results:[movie]};});let html;await api.homePage({},{send:value=>html=value});const {window:w}=browser(html),d=w.document;
  assert(d.querySelector('.dsHeroLogo'));assert.equal(d.querySelector('.dsHeroTitleText').textContent,'Barbie');assert.equal(requests.find(([path])=>path==='/movie/346698')[1].append_to_response,'images');
  assert.equal(d.querySelector('script[src*="library-page.js"]'),null);assert(api.pageShell({body:'<main data-library-page></main>'}).includes('library-page.js'));
 }finally{api.io.close();}
});
