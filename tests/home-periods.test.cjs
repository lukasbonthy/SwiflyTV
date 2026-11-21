'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const titles=(offset,type='movie')=>Array.from({length:20},(_,i)=>({id:offset+i+1,[type==='tv'?'name':'title']:'Story '+(offset+i+1),poster_path:'/poster.jpg',backdrop_path:'/wide.jpg',release_date:'2025-01-01'}));
test('Home exposes independent reference period pickers for movie and series rows',async()=>{
 const api=loadServer(),calls=[];try{
 api.setTmdb(async(endpoint,params={})=>{calls.push({endpoint,params});return endpoint.includes('/genre/')?{genres:[]}:{results:titles(endpoint.includes('/tv')?100:1,endpoint.includes('/tv')?'tv':'movie')};});
 let html;await api.homePage({query:{trendingMovies:'today',trendingSeries:'month'}},{send:value=>html=value});const b=browser(html),d=b.window.document;
 for(const [key,title,selection] of [['trending-movies','Trending Movies','Today'],['trending-tv','Trending Series','This Month']]){
 const row=d.querySelector('[data-st-home-section="'+key+'"]');assert(row.querySelector('[data-movie-periods]'),key+' needs the requested Home selector');
 assert.equal(row.querySelector('h2').textContent,title);assert.equal(row.querySelector('summary span').textContent,selection);assert.equal(row.querySelectorAll('.svPeriodMenu a').length,3);
 }
 assert(calls.some(x=>x.endpoint==='/trending/movie/day'));assert(calls.some(x=>x.endpoint==='/discover/tv'&&x.params['first_air_date.gte']));
 }finally{api.io.close();}
});
test('Home period update keeps hero and other row nodes and commits only the winning response',async()=>{
 const {periodControls}=require('../ui/catalog-experience');const controls=periodControls({title:'Trending Movies',type:'movie',parameter:'trendingMovies',refresh:true});
 const b=browser('<section class="dsHero">Hero</section><section class="svCatalogRow" data-period-row="movie">'+controls+'<div class="movieRail"><article class="movieCard" data-id="1">Old</article></div></section><section id="other"><article data-id="2">Keep</article></section>'),w=b.window,d=w.document,requests=[];
 w.fetch=(url,opts)=>new Promise(resolve=>requests.push({url,opts,resolve}));w.boot('catalog-experience.js');const hero=d.querySelector('.dsHero'),other=d.querySelector('#other'),row=d.querySelector('[data-period-row]');
 const choose=value=>[...row.querySelectorAll('.svPeriodMenu a')].find(a=>new URL(a.href).searchParams.get('trendingMovies')===value).click();
 choose('today');choose('month');assert.equal(requests.length,2);requests[1].resolve({ok:true,json:async()=>({period:'month',html:'<article class="movieCard" data-id="3">Fresh</article>',cards:[],viewHref:'/trending?type=movie&period=month'})});await tick();
 requests[0].resolve({ok:true,json:async()=>({period:'today',html:'<article class="movieCard">Stale</article>',cards:[],viewHref:'/trending?type=movie&period=today'})});await tick();
 assert.equal(d.querySelector('.dsHero'),hero);assert.equal(d.querySelector('#other'),other);assert.equal(row.querySelector('.movieRail').textContent,'Fresh');assert.equal(row.querySelector('summary span').textContent,'This Month');assert.equal(row.querySelector('.svPeriodMenu [aria-current]').textContent.trim(),'This Month');assert.equal(row.hasAttribute('aria-busy'),false);
 b.finish();
});
test('Kids has one search destination per nav and keeps a single-line parent action',()=>{
 const {kidsNavigation}=require('../ui/kids'),navigation=kidsNavigation({navLink:(href,label)=>'<a href="'+href+'">'+label+'</a>',cleanIcon:()=>'<svg></svg>'}),b=browser(navigation.header+navigation.mobile),d=b.window.document;
 assert.equal(d.querySelector('header').querySelectorAll('a[href="/kids/search"]').length,1,'desktop Kids search is duplicated');assert.equal(d.querySelector('.kidsParentButton').tagName,'BUTTON');assert.equal(d.querySelector('.kidsParentButton').getAttribute('title'),'Parent controls');b.finish();
});
