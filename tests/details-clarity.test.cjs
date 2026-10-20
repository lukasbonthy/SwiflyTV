'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {browser,loadServer,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const api=loadServer();
const css=fs.readFileSync(path.join(__dirname,'../public/clean/details-clarity.css'),'utf8');

async function detailsFixture(backdrops) {
  const movie={id:101,title:'Example Film',release_date:'2026-01-01',
    overview:'A test synopsis',poster_path:'/poster.jpg',backdrop_path:'/hero.jpg',
    vote_average:7.8,runtime:110,genres:[],images:{backdrops,logos:[]}};
  api.setTmdb(async endpoint=>{
    if(endpoint==='/movie/101')return movie;
    if(endpoint.endsWith('/credits'))return {cast:[],crew:[]};
    if(endpoint.endsWith('/external_ids'))return {};
    if(endpoint.endsWith('/watch/providers'))return {results:{}};
    return {results:[]};
  });
  let html;
  await api.detailPage({params:{id:'101'},query:{view:'modal'},headers:{},get:()=>''},{send:body=>{html=body;}},'movie');
  return html;
}

test('story backdrop belongs to the selected movie and prefers wordless art',async()=>{
  const html=await detailsFixture([
    {file_path:'/hero.jpg',iso_639_1:null,aspect_ratio:1.8},
    {file_path:'/lettered.jpg',iso_639_1:'en',aspect_ratio:1.8,vote_count:500},
    {file_path:'/alternate.jpg',iso_639_1:null,aspect_ratio:1.8,vote_count:18}
  ]);
  const env=browser(html);
  const section=env.window.document.querySelector('#overview');
  assert.match(section.getAttribute('style'),/\/w780\/alternate\.jpg/);
  assert(!section.getAttribute('style').includes('lettered.jpg'));
  assert(env.window.document.querySelector('.svDetailActions .svDownloadAction svg.svIcon'));
  assert(env.window.document.querySelector('.svDetailActions a[data-sv-party-movie-id] svg.svIcon'));
  env.finish();
});

test('story artwork falls back to the hero when no second film still exists',async()=>{
  const env=browser(await detailsFixture([]));
  assert.match(env.window.document.querySelector('#overview').getAttribute('style'),/\/w780\/hero\.jpg/);
  env.finish();
});

test('detail save and heart state never destroy existing liquid-glass panes',()=>{
  const html=api.pageShell({body:'<div class="svDetailActions"><button data-watch-id="101" data-watch-type="movie" data-watch-title="Example Film"></button><button data-like-id="101" data-like-type="movie" data-like-title="Example Film"></button></div><button id="catalogSave" data-watch-id="102" data-watch-type="movie"></button>'});
  const env=browser(html),w=env.window,d=w.document;
  const library=[...d.querySelectorAll('script:not([src])')].find(x=>x.textContent.includes('function syncLibraryButtons()'));
  assert(library);
  w.eval(library.textContent);
  const [watch,like]=d.querySelectorAll('.svDetailActions button');
  const lens=d.createElement('span');lens.className='svLiquidPane';watch.prepend(lens);
  w.localStorage.setItem('movieverse.watchlist','[]');
  w.localStorage.setItem('movieverse.liked','[]');
  w.syncLibraryButtons();
  assert.equal(watch.querySelector('.svDetailActionGlyph').dataset.kind,'plus');
  assert.equal(like.querySelector('.svDetailActionGlyph').dataset.kind,'heart');
  assert.equal(watch.firstElementChild,lens);
  assert.equal(d.querySelector('#catalogSave').textContent,'+');
  w.localStorage.setItem('movieverse.watchlist',JSON.stringify([{key:'movie:101'}]));
  w.localStorage.setItem('movieverse.liked',JSON.stringify([{key:'movie:101'}]));
  w.syncLibraryButtons();
  assert.equal(watch.querySelector('.svDetailActionGlyph').dataset.kind,'check');
  assert.equal(like.querySelector('.svDetailActionGlyph').dataset.kind,'heartFilled');
  assert.equal(watch.firstElementChild,lens);
  assert.equal(watch.getAttribute('aria-pressed'),'true');
  assert.equal(like.getAttribute('aria-pressed'),'true');
  env.finish();
});

test('detail visual polish preserves user opacity controls and minimizes compositing',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert(server.includes('/assets/clean/details-clarity.css?v=1'));
  assert(server.includes('family=Manrope:wght@400;500;600;700;800'));
  assert.match(css,/\.svDetailActions[\s\S]*\.svNavMatchedLens\.svLiquidPane/);
  assert.match(css,/data-st-glass="off"/);
  assert.match(css,/data-st-glass="subtle"/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/data-sv-xbox="true"/);
  assert.match(css,/--sv-story-art/);
  const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.equal((stripped.match(/\{/g)||[]).length,(stripped.match(/\}/g)||[]).length);
});
