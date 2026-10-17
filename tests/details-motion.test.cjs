const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, loadServer, tick, cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);
const api = loadServer();
const title = 'A Complete Movie Title & Its Subtitle';
const details = {id: 101, title, name: title, overview: 'The complete story stays visible below the artwork.', release_date: '2024-03-01', first_air_date: '2024-03-01', vote_average: 8.1, runtime: 166, number_of_seasons: 2, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genres: [{id: 878, name: 'Science Fiction'}, {id: 12, name: 'Adventure'}], images: {logos: [{file_path:'/foreign.png', iso_639_1:'fr', vote_average:9}, {file_path:'/english.png', iso_639_1:'en', vote_average:8}]}, seasons: [{season_number: 1, episode_count: 4}, {season_number: 2, episode_count: 6}]};
let requests;
function metadata(endpoint, params) {
  requests.push({endpoint, params});
  if (/^\/(movie|tv)\/101$/.test(endpoint)) return Promise.resolve(details);
  if (endpoint.endsWith('/credits')) return Promise.resolve({cast: [{id: 12, name: 'Actor Name', character: 'Character', profile_path: '/actor.jpg'}], crew: [{name:'Director Name',job:'Director'}]});
  if (endpoint.endsWith('/videos')) return Promise.resolve({results: [{site:'YouTube',type:'Trailer',key:'trailerID',name:'Trailer'}]});
  if (endpoint.endsWith('/external_ids')) return Promise.resolve({});
  if (endpoint.endsWith('/watch/providers')) return Promise.resolve({results:{}});
  return Promise.resolve({results:[{...details,id:202}]});
}
async function render(type = 'movie', view = 'modal') {
  requests = []; api.setTmdb(metadata); let html;
  await api.detailPage({params:{id:'101'},query:{view},headers:{},protocol:'http',get:()=> 'localhost:3000'}, {send(value) {html=value;}}, type);
  return html;
}
test('Details fragment keeps movie information together without the outer page', async () => {
  const html = await render();
  assert(!/<!doctype/i.test(html), 'Overlay requests should return the detail fragment');
  const env = browser(html), d = env.window.document;
  assert.equal(d.querySelector('.svDetailHero h1')?.textContent.trim(), title);
  assert.equal(d.querySelector('.svDetailLogo')?.getAttribute('src'), 'https://image.tmdb.org/t/p/w500/english.png');
  assert.match(d.querySelector('.svDetailHero')?.textContent || '', /Science Fiction/);
  assert.match(d.querySelector('.svDetailFacts')?.textContent || '', /8\.1/);
  assert(d.querySelector('.svDetailActions a[href="/watch/movie/101?mode=movie"]'));
  assert(d.querySelector('#overview').textContent.includes(details.overview));
  assert(d.querySelector('#cast .dsCastCard'));
  assert.equal(d.querySelectorAll('[data-tab-panel]').length, 0, 'Story and cast should be available in the same scroll view');
  assert.equal(requests.length, 7);
  assert.match(requests[0].params.append_to_response, /images/);
  env.finish();
});
test('Series details preserve season and episode playback links', async () => {
  const env = browser(await render('tv')), d = env.window.document;
  assert(d.querySelector('.svDetailActions a[href="/watch/tv/101?mode=movie&s=1&e=1"]'));
  assert(d.querySelector('#episodes a[href="/watch/tv/101?mode=movie&s=2&e=6"]'));
  env.finish();
});
test('Details open over the catalog, retain background position and restore focus on close', async () => {
  const fragment = await render();
  const env = browser('<a id="details" href="/movie/101">Details</a>'), w = env.window, d = w.document;
  w.fetch = async () => ({ok:true,text:async()=>fragment}); env.page.scrollTop=480;
  w.boot('details.js'); const trigger=d.getElementById('details'); trigger.focus();
  const click = new w.MouseEvent('click',{bubbles:true,cancelable:true}); trigger.dispatchEvent(click);
  assert.equal(click.defaultPrevented,true,'The Details link should open an overlay');
  await tick();
  const dialog=d.querySelector('.svDetailDialog'); assert.equal(dialog?.open,true);
  assert(dialog.querySelector('.svTitleDetails')); assert.equal(env.page.scrollTop,480);
  dialog.querySelector('[data-sv-detail-close]').click();
  assert.equal(dialog.open,false); assert.equal(d.activeElement,trigger);
  assert.equal(d.documentElement.classList.contains('svDetailsOpen'),false);
  env.finish();
});
test('Failed overlay requests leave a usable full details link', async () => {
  const env=browser('<a href="/movie/101">Details</a>'),w=env.window,d=w.document;
  w.fetch=async()=>{throw new Error('offline');}; w.boot('details.js');
  d.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true})); await tick();
  assert(d.querySelector('.svDetailError a[href="/movie/101"]'), 'The overlay should offer the original details page after an error');
  env.finish();
});
test('A newly opened overlay reflects titles already saved in My List', async () => {
  const fragment = await render();
  const html = api.pageShell({title:'Catalog',body:'<main><a id="openDetails" href="/movie/101">Details</a></main>'});
  const env=browser(html),w=env.window,d=w.document;
  w.localStorage.setItem('movieverse.watchlist',JSON.stringify([{key:'movie:101',id:'101',type:'movie',title}]));
  const library=[...d.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('function syncLibraryButtons()'));
  assert(library,'The actual catalog library script is required');
  w.eval(library.textContent);w.fetch=async()=>({ok:true,text:async()=>fragment});w.boot('details.js');
  d.getElementById('openDetails').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));await tick();
  const save=d.querySelector('.svDetailDialog [data-watch-id="101"]');
  assert.equal(save?.getAttribute('aria-pressed'),'true','Saved titles should appear saved when the overlay opens');
  assert.match(save.getAttribute('aria-label'),/Remove.*from My List/);env.finish();
});
test('Legacy TV keyboard controls leave Escape available to the native details dialog', () => {
  const html=api.pageShell({title:'Catalog',body:'<dialog open class="svDetailDialog"><button id="close">Close</button></dialog>'}).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'');
  const env=browser(html),w=env.window,d=w.document;
  const controller=[...d.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('var FOCUSABLE_SELECTOR'));
  assert(controller,'The actual TV keyboard controller is required');w.eval(controller.textContent);
  const key=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});d.getElementById('close').dispatchEvent(key);
  assert.equal(key.defaultPrevented,false,'Escape must reach the native dialog');
  assert.equal(w.localStorage.getItem('swiflytv.tvFocusMode'),null);env.finish();
});
test('Gamepad focus and Back stay within the open details overlay', () => {
  const html=api.pageShell({title:'Catalog',body:'<a id="outside" href="/movies">Movies</a><dialog open class="svDetailDialog"><button id="inside">Play</button></dialog>'}).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'');
  const env=browser(html),w=env.window,d=w.document;
  for(const id of ['outside','inside'])d.getElementById(id).getBoundingClientRect=()=>({width:40,height:40,top:100,left:100,bottom:140,right:140});
  const controller=[...d.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('var FOCUSABLE_SELECTOR'));
  w.eval(controller.textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const connected=new w.Event('gamepadconnected');connected.gamepad={id:'Test controller'};w.dispatchEvent(connected);
  assert.equal(d.activeElement.id,'inside','Gamepad focus must exclude the catalog behind the dialog');
  w.navigator.getGamepads=()=>[{id:'Test controller',axes:[0,0,0,0],buttons:Array.from({length:17},(_,index)=>({pressed:index===1,value:index===1?1:0}))}];
  w.flush(16);assert.equal(d.querySelector('dialog').open,false,'Gamepad Back should close details');env.finish();
});
test('Enabled TV keyboard navigation can reach and activate Play inside the overlay', () => {
  const html=api.pageShell({title:'Catalog',body:'<dialog open class="svDetailDialog"><button id="dismiss">Close</button><button id="play">Play</button></dialog>'}).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'');
  const env=browser(html),w=env.window,d=w.document;let clicks=0;
  d.getElementById('dismiss').getBoundingClientRect=()=>({width:40,height:40,top:80,left:100,bottom:120,right:140});
  d.getElementById('play').getBoundingClientRect=()=>({width:40,height:40,top:160,left:100,bottom:200,right:140});
  d.getElementById('play').addEventListener('click',()=>clicks++);w.localStorage.setItem('swiflytv.tvFocusMode','true');
  const controller=[...d.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('var FOCUSABLE_SELECTOR'));
  w.eval(controller.textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  d.getElementById('dismiss').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(d.activeElement.id,'play','TV Arrow navigation should remain available inside details');
  d.getElementById('play').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(clicks,1);
  const escape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});d.getElementById('play').dispatchEvent(escape);assert.equal(escape.defaultPrevented,false);env.finish();
});
test('Mouse wheel uses browser-native scrolling without leaving an idle animation loop',()=>{
 const env=browser('<main>Catalog</main>'),w=env.window;w.boot('motion.js');
 const wheel=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});
 w.document.querySelector('main').dispatchEvent(wheel);
 assert.equal(wheel.defaultPrevented,false,'Native wheel input never waits for a JS animation');
 assert.equal(w.frameCount(),0);
 env.finish();
});
test('Reduced motion, zoom, form inputs and player pages retain native scrolling', () => {
  for(const options of [{reduced:true},{path:'/watch/movie/101'},{}]) {
    const env=browser('<input><main>Catalog</main>',options),w=env.window; w.boot('motion.js');
    const target=options.reduced||options.path?w.document.querySelector('main'):w.document.querySelector('input');
    const wheel=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});target.dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,false);
    const zoom=new w.WheelEvent('wheel',{deltaY:120,ctrlKey:true,bubbles:true,cancelable:true});w.document.querySelector('main').dispatchEvent(zoom);assert.equal(zoom.defaultPrevented,false);
    env.finish();
  }
});
test('Keyboard and a changed motion preference interrupt the current glide', () => {
  const env=browser('<main>Catalog</main>'),w=env.window;w.boot('motion.js');
  assert(w.SwiflyMotion,'Motion controller should be available');
  w.SwiflyMotion.scrollBy(env.page,{top:400});w.flush(16);const current=env.page.scrollTop;
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'PageDown',bubbles:true}));w.flush(32);assert.equal(env.page.scrollTop,current);
  w.SwiflyMotion.scrollBy(env.page,{top:400});w.reduceMotion(true);w.flush(48);assert.equal(w.frameCount(),0);
  w.SwiflyMotion.scrollBy(env.page,{top:100});assert.equal(env.page.scrollTop,current+100);
  env.finish();
});
test('Movie-detail wheel scrolling is native, with no scripted page movement',()=>{
 const env=browser('<dialog open class="svDetailDialog"><button>Close</button><div class="svDetailViewport"><p>Story</p></div></dialog>'),w=env.window,d=w.document;
 const viewport=d.querySelector('.svDetailViewport');
 Object.defineProperty(viewport,'scrollHeight',{value:2400});Object.defineProperty(viewport,'clientHeight',{value:600});
 env.page.scrollTop=480;w.boot('motion.js');
 for(const node of [d.querySelector('p'),d.querySelector('button')]){
   const event=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});
   node.dispatchEvent(event);
   assert.equal(event.defaultPrevented,false,'browser owns the modal wheel gesture');
 }
 assert.equal(env.page.scrollTop,480,'SwiflyTV never scripts a background scroll while the overlay is open');
 assert.equal(w.frameCount(),0,'modal scrolling does not schedule motion frames');
 env.finish();
});
test('Nested native scroll panels keep their own wheel input', () => {
  const env=browser('<div style="overflow-y:auto"><p>Chat messages</p></div>'),w=env.window,d=w.document,panel=d.querySelector('div');
  Object.defineProperty(panel,'scrollHeight',{value:900});Object.defineProperty(panel,'clientHeight',{value:200});
  w.boot('motion.js');const wheel=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});d.querySelector('p').dispatchEvent(wheel);w.flush(16);
  assert.equal(wheel.defaultPrevented,false,'Native message panels must retain their browser scrolling');assert.equal(env.page.scrollTop,0);env.finish();
});
test('The app Reduce motion setting stops glides and keeps subsequent wheel input native', async () => {
  const env=browser('<main>Catalog</main><div class="dsHero"></div>'),w=env.window,d=w.document;
  d.querySelector('.dsHero').getBoundingClientRect=()=>({top:-200,height:500});w.boot('motion.js');
  w.SwiflyMotion.scrollBy(env.page,{top:400});w.flush(16);const current=env.page.scrollTop;
  d.body.classList.add('reduceMotion');await tick();w.flush(32);
  assert.equal(env.page.scrollTop,current,'Changing the app setting should interrupt an active glide');assert.equal(w.frameCount(),0);
  assert.equal(d.querySelector('.dsHero').style.getPropertyValue('--sv-hero-offset'),'');
  const wheel=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});d.querySelector('main').dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,false);
  w.SwiflyMotion.scrollBy(env.page,{top:100});assert.equal(env.page.scrollTop,current+100);env.finish();
});
test('Closing or replacing details releases observed sections from the old title', async () => {
  const fragment=await render(),env=browser('<a id="details" href="/movie/101">Details</a>'),w=env.window,d=w.document,watched=new Set();
  w.IntersectionObserver=class {observe(node){watched.add(node);}unobserve(node){watched.delete(node);}disconnect(){watched.clear();}};
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.classList.contains('svDetailSection')?1200:0,height:400};};
  w.fetch=async()=>({ok:true,text:async()=>fragment});w.boot('motion.js');w.boot('details.js');
  await w.SwiflyDetails.open('/movie/101',d.getElementById('details'));assert(watched.size>0);
  await w.SwiflyDetails.open('/movie/202');assert([...watched].every(node=>node.isConnected),'Replacing a title must release the previous sections');
  w.SwiflyDetails.close();assert.equal(watched.size,0,'Closing details must release all hidden sections');env.finish();
});
test('A queued close event cannot reset a newly reopened details overlay', async () => {
  const fragment=await render(),env=browser('<a id="details" href="/movie/101">Details</a>'),w=env.window,d=w.document;
  const queued=[];w.HTMLDialogElement.prototype.close=function(){this.open=false;queued.push(()=>this.dispatchEvent(new w.Event('close')));};
  w.fetch=async()=>({ok:true,text:async()=>fragment});w.boot('details.js');
  await w.SwiflyDetails.open('/movie/101',d.getElementById('details'));w.SwiflyDetails.close();
  await w.SwiflyDetails.open('/movie/202',d.getElementById('details'));queued.shift()();
  assert(d.querySelector('dialog').open);assert(d.querySelector('.svDetailDialog .svTitleDetails'),'A stale close event must leave the new title intact');
  assert(d.documentElement.classList.contains('svDetailsOpen'),'The reopened modal must retain its background scroll lock');env.finish();
});
test('TV navigation can expand native season accordions inside details', () => {
  const html=api.pageShell({title:'Catalog',body:'<dialog open class="svDetailDialog"><button id="dismiss">Close</button><details id="season"><summary id="seasonSummary">Season 2</summary><a href="/watch/tv/101?s=2&e=1">Episode 1</a></details></dialog>'}).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'');
  const env=browser(html),w=env.window,d=w.document;
  d.getElementById('dismiss').getBoundingClientRect=()=>({width:40,height:40,top:80,left:100,bottom:120,right:140});
  d.getElementById('seasonSummary').getBoundingClientRect=()=>({width:200,height:40,top:160,left:100,bottom:200,right:300});
  w.localStorage.setItem('swiflytv.tvFocusMode','true');
  const controller=[...d.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('var FOCUSABLE_SELECTOR'));w.eval(controller.textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  d.getElementById('dismiss').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(d.activeElement.id,'seasonSummary');
  d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(d.getElementById('season').open,true,'TV Enter should expand the selected season');env.finish();
});

test('Details slide animates its fixed bottom position, never a transform that blanks glass',async()=>{
 const fragment=await render(),env=browser('<a id="details" href="/movie/101">Details</a>'),w=env.window,d=w.document;
 w.fetch=async()=>({ok:true,text:async()=>fragment});
 const frames=[];
 const original=w.Element.prototype.animate;
 w.Element.prototype.animate=function(keyframes,options){
   if(this.matches?.('.svDetailDialog'))frames.push(keyframes);
   return {finished:Promise.resolve(),cancel(){},play(){},pause(){}};
 };
 w.boot('details.js');
 d.getElementById('details').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 await tick();
 assert(frames.length>0,'detail sheet must start the opening animation');
 assert(frames[0].every(frame=>Object.hasOwn(frame,'bottom')),'fixed bottom changes preserve refraction while moving');
 assert(frames[0].every(frame=>!Object.hasOwn(frame,'transform')),'do not create a transform-only compositing layer');
 assert.equal(frames[0][1].bottom,'0px');
 w.Element.prototype.animate=original;
 env.finish();
});

test('Hover warms a movie before click so the real action buttons render from cache',async()=>{
 const fragment=await render(),env=browser('<a id="movie" href="/movie/101"><span>Details</span></a>'),w=env.window,d=w.document;
 let calls=0;
 w.fetch=async()=>{calls++;return {ok:true,text:async()=>fragment};};
 w.boot('details.js');
 const link=d.getElementById('movie');
 link.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));
 await tick();await tick();
 assert.equal(calls,1,'intent begins the one allowed fragment request');
 link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 await tick();await tick();
 assert.equal(calls,1,'opening from cache must never refetch the movie');
 assert(d.querySelector('.svDetailDialog .svDetailActions .dsPrimaryBtn'),'real movie actions are inserted from the warmed fragment');
 env.finish();
});
test('A click reuses the in-flight touch prefetch instead of waiting on a second request',async()=>{
 const fragment=await render(),env=browser('<a id="movie" href="/movie/101">Details</a>'),w=env.window,d=w.document;
 let answer,calls=0;
 w.fetch=()=>{calls++;return new Promise(resolve=>{answer=resolve;});};
 w.boot('details.js');
 const link=d.getElementById('movie');
 link.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
 link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 await tick();
 assert.equal(calls,1,'intent request is shared with the click');
 answer({ok:true,text:async()=>fragment});
 await tick();await tick();await tick();
 assert.equal(calls,1,'no duplicate after the warm fragment settles');
 assert(d.querySelector('.svDetailDialog .svDetailActions .dsPrimaryBtn'));
 env.finish();
});
test('Speculative movie fetches never activate for unrelated external links',async()=>{
 const env=browser('<a id="away" href="https://elsewhere.example/movie/101">Away</a><a id="play" data-play-id href="/movie/101">Play link</a>'),w=env.window,d=w.document;
 let calls=0;w.fetch=async()=>{calls++;return {ok:true,text:async()=>''};};
 w.boot('details.js');
 for(const node of d.querySelectorAll('a'))node.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
 await tick();assert.equal(calls,0);
 env.finish();
});
