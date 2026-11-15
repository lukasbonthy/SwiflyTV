'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,loadServer,cleanup}=require('./ui-helpers.cjs');
const {periodControls}=require('../ui/catalog-experience');
test.afterEach(cleanup);

function catalog(){
 const calls=[];
 return {calls,tmdb:async(path,params={})=>{
  calls.push({path,params});
  if(path.startsWith('/genre/'))return {genres:[{id:28,name:'Action'},{id:35,name:'Comedy'}]};
  if(/^\/movie\/\d+$/.test(path))return {id:Number(path.split('/').pop()),title:'Featured movie',backdrop_path:'/backdrop.jpg'};
  const tag=path+(params.with_genres||''),salt=[...tag].reduce((n,c)=>n+c.charCodeAt(0),0),page=Number(params.page)||1;
  return {page,total_pages:4,results:Array.from({length:20},(_,i)=>({id:page*100000+salt*100+i,title:'Movie '+i,poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview:'A story to watch.',release_date:'2026-11-01'}))};
 }};
}

test('Movies restores its familiar first-page hierarchy with only the inline period selector added',async()=>{
 const api=loadServer(),f=catalog();api.setTmdb(f.tmdb);
 try{
  let html;await api.listingPage({query:{}},{send:value=>html=value},'movie');const d=browser(html).window.document;
  assert.equal(d.querySelector('.dsBrowseTop h1')?.textContent,'Movies');
  assert.equal(d.querySelector('.dsBrowseTop .genreDropdown summary')?.textContent.trim(),'Genres ▾');
  assert(d.querySelector('main > .dsHero'));
  assert.deepEqual([...d.querySelectorAll('main .svCatalogRow h2')].map(h=>h.textContent),['Action Movies','Popular movies','Comedies','Suspense Movies','Critically Acclaimed Movies','Browse Movies']);
  assert.equal(d.querySelector('.svBrowseHeading'),null);assert.equal(d.querySelector('.svBrowseFilters'),null);
  const popular=[...d.querySelectorAll('.svCatalogRow')].find(row=>row.querySelector('h2').textContent==='Popular movies');
  assert(popular.querySelector('[data-movie-periods]'));assert.equal(popular.querySelectorAll('.movieCard').length,10);
  assert.equal(popular.querySelector('summary').textContent.trim(),'This week');
  const titles=[...d.querySelectorAll('.svCatalogRow .dsCardTitle')].map(a=>a.getAttribute('href'));
  assert.equal(new Set(titles).size,titles.length,'Restoring Browse Movies must retain cross-row deduplication');
  assert(f.calls.some(call=>call.path==='/trending/movie/week'));
 }finally{api.io.close();}
});

test('changing the Movies popularity period leaves the usual featured movie and Browse Movies catalog in place',async()=>{
 const api=loadServer(),calls=[];
 const movie=(id,title)=>({id,title,poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview:'A story to watch.',release_date:'2026-11-01'});
 const baseline=Array.from({length:20},(_,i)=>movie(100+i,'Usual movie '+i));
 api.setTmdb(async(path,params={})=>{
  calls.push({path,params});
  if(path.startsWith('/genre/'))return {genres:[{id:28,name:'Action'}]};
  if(/^\/movie\/\d+$/.test(path))return movie(Number(path.split('/').pop()),'Feature '+path.split('/').pop());
  if(path==='/movie/popular')return {results:baseline,total_pages:4};
  if(path==='/trending/movie/week')return {results:[movie(201,'A weekly favorite')],total_pages:4};
  if(path==='/discover/movie'&&params['primary_release_date.gte'])return {results:[movie(301,'Only this month')],total_pages:4};
  return {results:[],total_pages:4};
 });
 try{
  async function page(period){let html;await api.listingPage({query:{period}},{send:value=>html=value},'movie');return browser(html).window.document;}
  const week=await page('week'),month=await page('month');
  const browse=d=>[...d.querySelectorAll('.svCatalogRow')].find(row=>row.querySelector('h2').textContent==='Browse Movies');
  const titles=row=>[...row.querySelectorAll('.dsCardTitle')].map(a=>a.textContent);
  assert.equal(week.querySelector('.dsHero h1').textContent,'Usual movie 0');
  assert.equal(month.querySelector('.dsHero h1').textContent,week.querySelector('.dsHero h1').textContent);
  assert.deepEqual(titles(browse(month)),titles(browse(week)));assert(titles(browse(month)).some(title=>title.startsWith('Usual movie')));
  const monthly=[...month.querySelectorAll('.dsCardTitle')].filter(a=>a.textContent==='Only this month');
  assert.equal(monthly.length,1);assert.equal(monthly[0].closest('.svCatalogRow').querySelector('h2').textContent,'Popular movies');
  const rendered=[...month.querySelectorAll('.svCatalogRow .dsCardTitle')].map(a=>a.href);assert.equal(new Set(rendered).size,rendered.length);
  assert.equal(calls.filter(call=>call.path==='/movie/popular').length,2,'Only each curated Movies page needs its usual baseline catalog');
 }finally{api.io.close();}
});

test('the curated movie baseline adds no catalog requests to TV, filtered collections or later pages',async()=>{
 const api=loadServer(),f=catalog();api.setTmdb(f.tmdb);
 try{
  for(const [type,query]of [['tv',{period:'month'}],['movie',{period:'month',genre:'28'}],['movie',{period:'month',sort:'top_rated'}],['movie',{period:'month',page:'2'}]]){
   f.calls.length=0;await api.listingPage({query},{send(){}},type);
   assert.equal(f.calls.some(call=>call.path==='/movie/popular'),false,type+' '+new URLSearchParams(query)+' must retain its existing catalog query');
  }
 }finally{api.io.close();}
});

test('This month requests a supported popularity-sorted calendar-month release page and preserves native paging',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-15T00:30:00Z')});
 const api=loadServer(),f=catalog();api.setTmdb(f.tmdb);
 try{
  let html;await api.listingPage({query:{period:'month',page:'2',party:'1'}},{send:value=>html=value},'movie');const d=browser(html).window.document;
  const request=f.calls.find(call=>call.path==='/discover/movie');
  assert.deepEqual(request?.params,{page:2,include_adult:'false',sort_by:'popularity.desc','primary_release_date.gte':'2026-11-01','primary_release_date.lte':'2026-11-15'});
  assert.equal(f.calls.some(call=>call.path.includes('/trending/movie/month')),false);
  assert.equal(f.calls.some(call=>call.path==='/movie/popular'),false,'Page two must not repeat the curated baseline request');
  assert.equal(d.querySelector('.dsHero'),null);assert(d.querySelector('.svCatalogResults .dsCardTitle'));
  assert.equal(d.querySelector('[data-movie-periods] summary').textContent.trim(),'This month');
  assert.equal(d.querySelector('[data-movie-periods] summary').title,'Popular releases this month');
  const next=new URL(d.querySelector('.pagination a[rel=next]').href);
  assert.equal(next.searchParams.get('page'),'3');assert.equal(next.searchParams.get('period'),'month');assert.equal(next.searchParams.get('party'),'1');
  const week=new URL(d.querySelector('[data-movie-periods] a[href*="period=week"]').href);
  assert.equal(week.searchParams.has('page'),false);assert.equal(week.searchParams.get('party'),'1');
 }finally{api.io.close();}
});

test('period popout preserves native links and supports keyboard, Escape, outside clicks and focus leaving',()=>{
 const b=browser(periodControls({base:'/movies?sort=popular&page=4&party=1',selected:'week'})+'<button id="outside">Outside</button>',{reduced:true}),w=b.window,d=w.document;
 try{
  const picker=d.querySelector('[data-movie-periods]');assert.equal(picker.tagName,'DETAILS');assert.equal(picker.open,false);
  const trigger=picker.querySelector('summary'),links=[...picker.querySelectorAll('a')];
  assert.deepEqual(links.map(link=>link.textContent.trim()),['Today','This week','This month']);
  w.boot('catalog-experience.js');trigger.focus();trigger.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(picker.open,true);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(d.activeElement,links[1]);
  links[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(d.activeElement,links[2]);
  links[2].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(d.activeElement,links[0]);
  links[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(picker.open,false);assert.equal(d.activeElement,trigger);
  trigger.click();assert.equal(picker.open,true);d.querySelector('#outside').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true}));assert.equal(picker.open,false);
  trigger.click();d.querySelector('#outside').focus();assert.equal(picker.open,false);
  trigger.click();const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});links[2].dispatchEvent(click);
  assert.equal(click.defaultPrevented,false,'Choosing a period must keep native GET navigation');
  const month=new URL(links[2].href);assert.equal(month.searchParams.get('period'),'month');assert.equal(month.searchParams.get('party'),'1');assert.equal(month.searchParams.has('page'),false);
 }finally{b.finish();}
});

test('popular-movie links from older releases safely normalize to the available period choices',()=>{
 const {moviePeriod}=require('../lib/catalog-experience');
 for(const value of [undefined,'unknown','popular','all','__proto__'])assert.equal(moviePeriod(value),'week');
 assert.equal(moviePeriod('today'),'today');assert.equal(moviePeriod('month'),'month');
});
