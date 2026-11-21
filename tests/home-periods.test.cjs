'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
const {periodControls}=require('../ui/catalog-experience');
test.afterEach(cleanup);
const titles=(offset,type='movie')=>Array.from({length:20},(_,i)=>({id:offset+i+1,[type==='tv'?'name':'title']:'Story '+(offset+i+1),poster_path:'/poster.jpg',backdrop_path:'/wide.jpg',release_date:'2025-01-01'}));
test('Home exposes independent reference period pickers for movie and series rows',async()=>{
 const api=loadServer(),calls=[];try{
 const endpoints=['/trending/movie/day','/discover/tv','/trending/movie/week','/tv/popular','/movie/top_rated','/tv/top_rated','/movie/now_playing'];
 api.setTmdb(async(endpoint,params={})=>{calls.push({endpoint,params});const index=endpoints.indexOf(endpoint);return index<0?{}:{results:titles(index*100,endpoint.includes('/tv')?'tv':'movie')};});
 const query={trendingMovies:'today',trendingSeries:'month',moviePeriod:'week'};
 let html;await api.homePage({query},{send:value=>html=value});const b=browser(html),d=b.window.document;
 const rows=[...d.querySelectorAll('[data-st-home] .svCatalogRow')];assert.equal(rows.length,7);
 for(const row of rows){
  const controls=[...row.querySelectorAll('.movieCard [data-play-id]')];
  assert(controls.length>7);
  assert.deepEqual(row.dataset.catalogIds?.split(','),controls.map(control=>control.dataset.playId));
  assert(controls.every(control=>control.dataset.playType===row.dataset.catalogType));
 }
 for(const [key,title,selection,parameter,type] of [['trending-movies','Trending Movies','Today','trendingMovies','movie'],['trending-tv','Trending Series','This Month','trendingSeries','tv']]){
  const row=d.querySelector('[data-st-home-section="'+key+'"]');assert(row.querySelector('[data-movie-periods][data-home-period]'),key+' needs the requested Home selector');
  assert.equal(row.querySelector('h2').textContent,title);assert.equal(row.querySelector('summary span').textContent,selection);assert.equal(row.querySelectorAll('.svPeriodMenu a').length,3);
  assert.deepEqual(Object.fromEntries(new URL(row.querySelector('.svRowMore').href).searchParams),{type,period:query[parameter],...query});
 }
 const popular=d.querySelector('[data-st-home-section="popular-movies"]');
 assert(popular.querySelector('[data-home-period][data-period-parameter="moviePeriod"]'));
 const today=popular.querySelector('.svPeriodMenu a');assert.equal(today.textContent.trim(),'Today');
 assert.deepEqual(Object.fromEntries(new URL(today.href).searchParams),{...query,moviePeriod:'today'});
 assert(calls.some(x=>x.endpoint==='/trending/movie/day'));assert(calls.some(x=>x.endpoint==='/discover/tv'&&x.params['first_air_date.gte']));
 b.finish();
 }finally{api.io.close();}
});
test('The period-row API returns every replacement identity with its poster',async()=>{
 const api=loadServer();try{
  api.setTmdb(async()=>({results:titles(100,'tv'),total_pages:1}));
  const render=api.app._router.stack.find(layer=>layer.route?.path==='/api/catalog/period-row').route.stack[0].handle;
  let body;await render({query:{type:'tv',period:'week',exclude:'101,113'}},{set(){},json(value){body=value;}});
  const b=browser(body.html),ids=[...b.window.document.querySelectorAll('.movieCard [data-play-id]')].map(control=>control.dataset.playId);
  assert.equal(body.cards.length,18);assert.deepEqual(body.ids?.map(String),ids);
  assert.equal(ids.includes('101'),false);assert.equal(ids.includes('113'),false);
  b.finish();
 }finally{api.io.close();}
});
function homePeriodFixture(){
 const path='/?trendingMovies=week&trendingSeries=week&moviePeriod=today#home';
 const row=(kind,key,markup,ids='1')=>`<section class="svCatalogRow" data-period-row="${kind}" data-catalog-type="${kind}" data-catalog-ids="${ids}">${markup}<div class="movieRail dsRail"><article class="movieCard">Old ${key}</article></div></section>`;
 const trend=(type,parameter,title)=>row(type,parameter,periodControls({base:path,title,type,parameter,refresh:true,home:true,viewHref:'/trending?type='+type+'&period=week'}));
 const popular=periodControls({base:path,parameter:'moviePeriod',selected:'today',home:true});
 const neighborIds=Array.from({length:18},(_,index)=>String(index+10));
 const neighborCards=neighborIds.slice(0,7).map(id=>`<article class="movieCard"><button data-play-type="movie" data-play-id="${id}"></button></article>`).join('');
 const b=browser(`<main data-st-home>
  <section class="dsHero"><a data-play-type="movie" data-play-id="50">Hero</a></section>
  ${trend('movie','trendingMovies','Trending Movies')}
  ${trend('tv','trendingSeries','Trending Series')}
  ${popular}
  <section class="svCatalogRow" data-catalog-type="movie" data-catalog-ids="${neighborIds.join(',')}"><div class="movieRail dsRail">${neighborCards}</div></section>
  <section class="svCatalogRow" data-catalog-type="tv" data-catalog-ids="60"></section>
 </main>`,{path});
 const w=b.window,d=w.document,requests=[];
 w.fetch=(url,opts)=>new Promise(resolve=>requests.push({url:new URL(url,w.location.href),opts,resolve}));
 w.boot('catalog-experience.js');
 const choice=(parameter,value)=>[...d.getElementById('svMoviePeriods-'+parameter).querySelectorAll('a')].find(a=>new URL(a.href).searchParams.get(parameter)===value);
 const response=(type,period,ids)=>({ok:true,json:async()=>({period,ids,html:ids.map(id=>`<article class="movieCard"><button data-play-type="${type}" data-play-id="${id}">${id}</button></article>`).join(''),cards:[],viewHref:'/trending?type='+type+'&period='+period})});
 return {b,w,d,requests,choice,response,neighborIds};
}
test('Home period excludes the current featured movie and off-page neighboring titles',async()=>{
 const {b,d,requests,choice,response,neighborIds}=homePeriodFixture();
 d.querySelector('.dsHero [data-play-id]').dataset.playId='51';
 choice('trendingMovies','today').click();
 assert.deepEqual(new Set(requests[0].url.searchParams.get('exclude').split(',')),new Set(['51',...neighborIds]));
 requests[0].resolve(response('movie','today',[101,102]));await tick();
 const row=d.querySelector('[data-period-row="movie"]');
 assert.equal(row.dataset.catalogType,'movie');assert.equal(row.dataset.catalogIds,'101,102');
 assert.equal(row.querySelector('.movieRail').textContent,'101102');
 b.finish();
});
test('Both Home refreshes preserve all selections in native Popular Movies and Trending links',async()=>{
 const {b,w,d,requests,choice,response}=homePeriodFixture();
 choice('trendingMovies','month').click();choice('trendingSeries','today').click();
 requests[1].resolve(response('tv','today',[103]));await tick();
 requests[0].resolve(response('movie','month',[104]));await tick();
 assert.deepEqual(Object.fromEntries(new URL(w.location.href).searchParams),{trendingMovies:'month',trendingSeries:'today',moviePeriod:'today'});
 assert.equal(w.location.hash,'#home');
 const popular=choice('moviePeriod','week');
 assert.deepEqual(Object.fromEntries(new URL(popular.href).searchParams),{trendingMovies:'month',trendingSeries:'today',moviePeriod:'week'});
 assert.equal(popular.dispatchEvent(new w.MouseEvent('click',{button:0,bubbles:true,cancelable:true})),true,'Popular Movies should use its normal GET link');
 assert.equal(requests.length,2);
 for(const [parameter,chosen] of [['trendingMovies','month'],['trendingSeries','today']]){
  const selected=choice(parameter,chosen),picker=selected.closest('.svPeriodPicker');
  for(const option of picker.querySelectorAll('.svPeriodMenu a')){
   const params=new URL(option.href).searchParams;
   const expected=option.textContent.trim()==='Today'?'today':option.textContent.trim()==='This Week'?'week':'month';
   assert.equal(params.get(parameter),expected);
   assert.equal(params.get(parameter==='trendingMovies'?'trendingSeries':'trendingMovies'),parameter==='trendingMovies'?'today':'month');
   assert.equal(params.get('moviePeriod'),'today');
  }
  assert.equal(selected.getAttribute('aria-current'),'page');
  const more=new URL(picker.closest('[data-period-row]').querySelector('.svRowMore').href);
  assert.equal(more.pathname,'/trending');
  assert.deepEqual(Object.fromEntries(more.searchParams),{type:parameter==='trendingMovies'?'movie':'tv',period:chosen,trendingMovies:'month',trendingSeries:'today',moviePeriod:'today'});
 }
 b.finish();
});
test('A Home rail works after a back-forward cache return and ignores its old request',async()=>{
 const {b,w,d,requests,choice,response}=homePeriodFixture(),row=d.querySelector('[data-period-row="movie"]');
 choice('trendingMovies','today').click();
 assert.equal(row.getAttribute('aria-busy'),'true');
 w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
 assert.equal(requests[0].opts.signal.aborted,true);assert.equal(row.hasAttribute('aria-busy'),false);
 w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
 choice('trendingMovies','month').click();
 assert.equal(requests.length,2);assert.equal(row.getAttribute('aria-busy'),'true');
 requests[0].resolve(response('movie','today',[51]));await tick();
 assert.equal(row.getAttribute('aria-busy'),'true');assert.equal(row.querySelector('.movieRail').textContent,'Old trendingMovies');
 requests[1].resolve(response('movie','month',[53]));await tick();
 assert.equal(row.hasAttribute('aria-busy'),false);assert.equal(row.querySelector('.movieRail').textContent,'53');
 choice('trendingMovies','today').click();
 requests[2].resolve({ok:false,json:async()=>({})});await tick();
 const status=row.querySelector('[data-period-status]');assert.match(status.textContent,/could not refresh/);
 w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
 w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
 assert.equal(status.textContent,'');assert.equal(row.hasAttribute('aria-busy'),false);
 b.finish();
});
test('Home period update keeps hero and other row nodes and commits only the winning response',async()=>{
 const controls=periodControls({title:'Trending Movies',type:'movie',parameter:'trendingMovies',refresh:true});
 const b=browser('<section class="dsHero">Hero</section><section class="svCatalogRow" data-period-row="movie">'+controls+'<div class="movieRail"><article class="movieCard" data-id="1">Old</article></div></section><section id="other"><article data-id="2">Keep</article></section>'),w=b.window,d=w.document,requests=[];
 w.fetch=(url,opts)=>new Promise(resolve=>requests.push({url,opts,resolve}));w.boot('catalog-experience.js');const hero=d.querySelector('.dsHero'),other=d.querySelector('#other'),row=d.querySelector('[data-period-row]');
 const choose=value=>[...row.querySelectorAll('.svPeriodMenu a')].find(a=>new URL(a.href).searchParams.get('trendingMovies')===value).click();
 choose('today');let releaseStaleBody;
 requests[0].resolve({ok:true,json:()=>new Promise(resolve=>{releaseStaleBody=resolve;})});await tick();
 choose('month');assert.equal(requests.length,2);assert.equal(requests[0].opts.signal.aborted,true);
 requests[1].resolve({ok:true,json:async()=>({period:'month',html:'<article class="movieCard"><button data-play-type="movie" data-play-id="3">Fresh</button></article>',cards:[],viewHref:'/trending?type=movie&period=month'})});await tick();
 releaseStaleBody({period:'today',html:'<article class="movieCard">Stale</article>',cards:[],viewHref:'/trending?type=movie&period=today'});await tick();
 assert.equal(d.querySelector('.dsHero'),hero);assert.equal(d.querySelector('#other'),other);assert.equal(row.querySelector('.movieRail').textContent,'Fresh');assert.equal(row.querySelector('summary span').textContent,'This Month');assert.equal(row.querySelector('.svPeriodMenu [aria-current]').textContent.trim(),'This Month');assert.equal(row.hasAttribute('aria-busy'),false);assert.equal(row.dataset.catalogIds,'3');
 b.finish();
});
test('Kids has one search destination per nav and keeps a single-line parent action',()=>{
 const {kidsNavigation}=require('../ui/kids'),navigation=kidsNavigation({navLink:(href,label)=>'<a href="'+href+'">'+label+'</a>',cleanIcon:()=>'<svg></svg>'}),b=browser(navigation.header+navigation.mobile),d=b.window.document;
 assert.equal(d.querySelector('header').querySelectorAll('a[href="/kids/search"]').length,1,'desktop Kids search is duplicated');assert.equal(d.querySelector('.kidsParentButton').tagName,'BUTTON');assert.equal(d.querySelector('.kidsParentButton').getAttribute('title'),'Parent controls');b.finish();
});
