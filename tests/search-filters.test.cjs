'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {browser,tick,cleanup}=require('./ui-helpers.cjs'),{searchPageMarkup}=require('../ui/discovery'),{createDiscovery}=require('../lib/discovery');
test.afterEach(cleanup);
test('search refinement controls update real requests, URLs and Back state',async()=>{
 const b=browser(searchPageMarkup({query:'space'}),{path:'/search?q=space'}),w=b.window,calls=[];w.fetch=async url=>{calls.push(new URL(url,w.location.href));return{ok:true,json:async()=>({results:[],totalPages:1})};};w.boot('discovery/search.js');
 const media=w.document.querySelector('[data-search-filter="media"]');assert(media);media.value='tv';media.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.equal(calls.at(-1).searchParams.get('media'),'tv');assert.equal(new URL(w.location.href).searchParams.get('media'),'tv');
 w.history.replaceState({},'','/search?q=space&media=movie&minRating=8&sort=rating');w.dispatchEvent(new w.PopStateEvent('popstate'));await tick();assert.equal(media.value,'movie');assert.equal(calls.at(-1).searchParams.get('minRating'),'8');assert.equal(calls.at(-1).searchParams.get('sort'),'rating');
});
test('search API uses the selected title type and applies rating, date and sorting to actual returned metadata',async t=>{
 const calls=[],service=createDiscovery({tmdb:async(path,params)=>{calls.push([path,params]);return{results:[{id:1,title:'Low',vote_average:4,release_date:'2020-01-01'},{id:2,title:'Good',vote_average:8.3,release_date:'2023-01-01'},{id:3,title:'Best',vote_average:9.1,release_date:'2024-01-01'}],total_pages:2,total_results:23};}}),app=express();app.use(service.router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>{s.closeAllConnections();s.close();});const data=await(await fetch('http://127.0.0.1:'+s.address().port+'/search?q=space&type=screen&media=movie&minRating=8&yearFrom=2022&sort=rating')).json();assert.equal(calls[0][0],'/search/movie');assert.deepEqual(data.results.map(x=>x.id),['3','2']);assert.equal(data.filtered,true);assert.equal(data.totalResults,2);
});
