'use strict';
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');const {browser,tick,cleanup,source}=require('./ui-helpers.cjs');const {audiobooksMarkup,recommendationsMarkup,searchMarkup,searchPageMarkup}=require('../ui/discovery');afterEach(cleanup);
const item=(id,title='A story')=>({id:String(id),title,author:'A writer',language:'English',playable:true,chapterCount:2});
const ok=value=>({ok:true,json:async()=>value});
function setup(path='/audiobooks'){const b=browser(audiobooksMarkup(),{path}),w=b.window;w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};return {b,w};}

test('a filtered short audiobook page keeps the explicit next page and retries that page after a failure',async()=>{const {w}=setup(),calls=[];let failed=false;w.fetch=async url=>{const p=new URL(url,w.location.href).searchParams;calls.push(p.get('page'));if(p.get('page')==='2'&&!failed){failed=true;return {ok:false,json:async()=>({message:'Temporary error'})};}return ok({books:[item(p.get('page'))],hasMore:p.get('page')==='1',nextPage:p.get('page')==='1'?2:null,page:Number(p.get('page'))});};w.boot('discovery/audiobooks.js');await tick();assert.equal(w.document.querySelector('[data-book-more]').hidden,false);w.document.querySelector('[data-book-more]').click();await tick();w.document.querySelector('[data-book-status] button').click();await tick();assert.deepEqual(calls,['1','2','2']);assert.equal(w.document.querySelectorAll('.svBookCard').length,2);});

test('browser history restores the audiobook search and ignores a stale search response',async()=>{const {w}=setup();let release;w.fetch=async url=>{const q=new URL(url,w.location.href).searchParams.get('q');return q==='old'?new Promise(resolve=>release=()=>resolve(ok({books:[item(1,'Old book')],hasMore:false}))):ok({books:[item(2,q||'Library')],hasMore:false});};w.boot('discovery/audiobooks.js');await tick();const form=w.document.querySelector('[data-book-search]');form.elements.q.value='old';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();w.history.pushState(null,'','/audiobooks?q=Jane%20Austen');w.dispatchEvent(new w.PopStateEvent('popstate'));await tick();release();await tick();assert.equal(form.elements.q.value,'Jane Austen');assert.match(w.document.querySelector('[data-book-results]').textContent,/Jane Austen/);assert(!w.document.querySelector('[data-book-results]').textContent.includes('Old book'));});

test('overlapping library pages do not repeat a recording and a new query replaces old results',async()=>{const {w}=setup();w.fetch=async url=>{const p=new URL(url,w.location.href).searchParams;return ok(p.get('q')?{books:[item(3,'New title')],hasMore:false}:{books:p.get('page')==='1'?[item(1),item(2)]:[item(2),item(3)],hasMore:p.get('page')==='1',nextPage:2});};w.boot('discovery/audiobooks.js');await tick();w.document.querySelector('[data-book-more]').click();await tick();assert.equal(w.document.querySelectorAll('.svBookCard').length,3);const form=w.document.querySelector('[data-book-search]');form.elements.q.value='New';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(w.document.querySelectorAll('.svBookCard').length,1);assert.match(w.document.querySelector('[data-book-results]').textContent,/New title/);});

test('a returned silent recording never exposes the chapter player',async()=>{const {w}=setup('/audiobooks?book=52');w.fetch=async url=>ok(String(url).includes('/books/52')?{book:{...item(52),chapters:[]}}:{books:[],hasMore:false});w.boot('discovery/audiobooks.js');await tick();await tick();assert.equal(w.document.querySelector('[data-book-playback]').hidden,true);assert.match(w.document.querySelector('[data-book-detail-status]').textContent,/audio|recording|chapters/i);assert(w.document.getElementById('svBookTitle').textContent);});

test('the audiobook library opens directly into searchable recordings without scenery controls',async()=>{const {w}=setup();w.fetch=async()=>ok({books:[item(1,'A real recording')],hasMore:false});w.boot('discovery/audiobooks.js');await tick();assert.equal(w.document.querySelector('h1').textContent,'Audiobooks');assert.equal(w.document.querySelector('[data-book-search] input').placeholder,'Search titles or authors…');assert.equal(w.document.querySelectorAll('[data-book-scene],[data-book-focus],.svBookLandscape').length,0);assert.equal(w.document.querySelectorAll('.svBookCard').length,1);assert.equal(w.document.querySelector('audio').preload,'none');});

test('discovery modes carry a typed request from AI picks to the audiobook search',()=>{
 const {window:w}=browser(recommendationsMarkup('Pride and Prejudice'),{path:'/recommendations'});w.boot('discovery/recommendations.js');
 const prompt=w.document.querySelector('[name=prompt]');prompt.value='Jane Austen';prompt.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(new URL(w.document.querySelector('[data-search-mode=books]').href).pathname,'/audiobooks');
 assert.equal(new URL(w.document.querySelector('[data-search-mode=books]').href).search,'?q=Jane+Austen');
 assert.equal(new URL(w.document.querySelector('[data-search-mode=person]').href).search,'?type=person&q=Jane+Austen');
});

test('audiobook mode links follow typing, author suggestions, history and clearing',async()=>{
 const {w}=setup('/audiobooks?q=Jane%20Austen');w.fetch=async()=>ok({books:[item(52,'Pride and Prejudice')],hasMore:false});w.boot('discovery/audiobooks.js');await tick();
 const link=()=>new URL(w.document.querySelector('[data-search-mode=ai]').href),form=w.document.querySelector('[data-book-search]');
 assert.equal(link().pathname,'/recommendations');assert.equal(link().searchParams.get('q'),'Jane Austen');
 form.elements.q.value='Arthur Conan Doyle';form.elements.q.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(link().searchParams.get('q'),'Arthur Conan Doyle');
 w.document.querySelector('[data-book-query="Lewis Carroll"]').click();await tick();assert.equal(link().searchParams.get('q'),'Lewis Carroll');
 w.history.pushState(null,'','/audiobooks?q=Charles%20Dickens');w.dispatchEvent(new w.PopStateEvent('popstate'));await tick();assert.equal(link().searchParams.get('q'),'Charles Dickens');
 w.document.querySelector('[data-book-clear]').click();await tick();assert.equal(link().searchParams.has('q'),false);
 assert.equal(w.document.querySelector('[data-search-mode=books]').getAttribute('aria-current'),'page');
});

test('child search forms submit only to the child catalog with their selected format',()=>{
 for(const markup of [searchMarkup({kidsMode:true}),searchPageMarkup({kidsMode:true,query:'space',filters:{media:'tv'}})]){
  const {window:w}=browser(markup,{path:'/kids/search'}),form=w.document.querySelector('form');
  assert.equal(new URL(form.action).pathname,'/kids/search');assert.equal(form.elements.q.maxLength,80);
  form.elements.q.value='Space adventures';form.elements.media.value='tv';const values=new w.FormData(form);assert.equal(values.get('q'),'Space adventures');assert.equal(values.get('media'),'tv');
  assert.equal(w.document.querySelectorAll('[data-search-mode],[data-search-recents],[data-studio-search],[data-search-studio],a[href^="/recommendations"],a[href^="/audiobooks"]').length,0);
 }
});

for(const [name,values]of [['default',{}],['compact',{aiSpacing:'compact',aiWidth:880,aiGlass:'soft'}],['opaque',{aiSpacing:'compact',aiGlass:'soft',reduceTransparency:true}]])test('Audiobooks follows the effective '+name+' Studio workspace presentation',async()=>{
 const css=['discovery/discovery.css','connect/feature-effects.css','studio/experience.css','discovery/search.css'].map(source).join('\n'),pages=[];
 for(const books of [false,true]){
  const {window:w}=browser('<style>'+css+(books?source('discovery/audiobooks.css'):'')+'</style>'+(books?audiobooksMarkup():recommendationsMarkup()),{path:books?'/audiobooks':'/recommendations'});
  w.boot('studio/config.js');const C=w.SwiflyStudioConfig;C.apply(C.validate(values));w.boot('studio/experience.js');
  w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){};
  w.fetch=async()=>ok(books?{books:[item(1)],hasMore:false}:{mode:'title',candidates:[1,2].map(id=>({id:String(id),title:'A story',type:'movie',href:'/movie/'+id}))});
  w.boot(books?'discovery/audiobooks.js':'discovery/recommendations.js');
  if(!books){const form=w.document.querySelector('[data-recommendation-form]');form.elements.prompt.value='A story';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));}
  await tick();
  const read=(selector,properties)=>{const style=w.getComputedStyle(w.document.querySelector(selector));return Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]));};
  const presentation={grid:read(books?'[data-book-results]':'[data-ai-results]',['display','grid-template-columns','gap','max-width']),card:read('.svDiscoveryCard',['display','grid-template-columns','padding','border-radius','background-color']),panel:read('.svMoodInput',['padding','background-color','backdrop-filter']),query:read('.svDiscoveryQuery',['height','min-height']),ideas:read('.svMoodIdeas',['max-width','margin-top'])};
  assert.equal(presentation.grid['grid-template-columns'],'1fr','the default Studio list applies to recordings as well as picks');
  if(name==='compact'||name==='opaque'){assert.equal(presentation.query.height,'64px');assert.equal(presentation.panel.padding,'14px 16px 10px');}
  if(name==='opaque')assert.equal(presentation.panel['background-color'],'rgb(17, 20, 25)');
  pages.push(presentation);
 }
 assert.deepEqual(pages[1],pages[0]);
});
