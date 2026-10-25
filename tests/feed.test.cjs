'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
let createFeed;try{({createFeed}=require('../lib/feed'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const now=()=>Date.parse('2026-10-25T12:00:00Z');
const show=(id,extra={})=>({id,name:'Series '+id,poster_path:'/series.jpg',first_air_date:'2020-01-01',genres:[{id:18,name:'Drama'}],...extra});
const film=(id,extra={})=>({id,title:'Film '+id,poster_path:'/film.jpg',release_date:'2020-01-01',vote_average:8,vote_count:500,genre_ids:[18],...extra});
async function fixture(t,options={}){
 assert.equal(typeof createFeed,'function','the bounded metadata router must be implemented');
 const app=express();app.use('/api/feed',createFeed({now,...options}).router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 return async path=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/feed'+path);return {status:response.status,data:await response.json()};};
}

test('episode feed uses actual next and latest episode tuples, dates and show genres',async t=>{
 const call=await fixture(t,{tmdb:async path=>path==='/tv/7'?show(7,{next_episode_to_air:{id:100,season_number:3,episode_number:5,name:'Tomorrow',air_date:'2026-10-26'},last_episode_to_air:{id:99,season_number:3,episode_number:4,name:'Yesterday',air_date:'2026-10-24'}}):show(8,{last_episode_to_air:{id:80,season_number:1,episode_number:2,name:'Years ago',air_date:'2020-01-01'}})});
 const {status,data}=await call('/episodes?shows=7,8');assert.equal(status,200);
 assert.deepEqual(data.upcoming.map(e=>[e.id,e.airDate,e.name,e.href]),[['tv:7:3:5','2026-10-26','Tomorrow','/watch/tv/7?s=3&e=5']]);
 assert.deepEqual(data.episodes.map(e=>e.id),['tv:7:3:4']);assert.equal(data.shows[1].lastEpisode.id,'tv:8:1:2');
 assert.deepEqual(data.shows[0].genreIds,[18]);assert.equal(data.shows[0].type,'tv');assert.equal(data.shows[0].title,'Series 7');
});

test('invalid show inputs are rejected before catalog work; malformed episode metadata creates no alert',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async path=>{calls.push(path);return show(7,{next_episode_to_air:{season_number:2,episode_number:3,air_date:'2026-02-31'},last_episode_to_air:{season_number:null,episode_number:0,air_date:'2026-10-24'}});}});
 for(const query of ['7,8,9,10,11,12,13,14,15','7,../../admin','0','7&shows=8'])assert.equal((await call('/episodes?shows='+query)).status,400);
 assert.equal(calls.length,0);
 const {data}=await call('/episodes?shows=7,7');assert.equal(calls.length,1);assert.deepEqual(data.upcoming,[]);assert.deepEqual(data.episodes,[]);
});

test('ordinary recommendations exclude watched titles and every seed with a verified explanation',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push([path,params]);if(path==='/movie/1')return film(1,{title:'A real favorite',genres:[{id:18,name:'Drama'}]});if(path==='/tv/2')return show(2);if(path==='/movie/1/recommendations')return {results:[film(1),film(3),film(4),film(5,{adult:true}),film(6,{vote_average:undefined,vote_count:0})]};if(path==='/tv/2/recommendations')return {results:[{...show(2),genre_ids:[18]},{...show(7),genre_ids:[18]}]};return {results:[]};}});
 const {status,data}=await call('/recommendations?seeds=movie:1,tv:2&exclude=movie:3');assert.equal(status,200);
 assert.deepEqual(data.results.map(v=>v.type+':'+v.id),['movie:4','tv:7','movie:6']);assert.equal(data.results[0].because.title,'A real favorite');assert.equal(data.results[0].because.key,'movie:1');
 assert.equal(data.results[2].rating,null,'unknown catalog scores must not become invented ratings');assert.deepEqual(data.results[0].genreIds,[18]);
 assert(Array.isArray(data.seeds),'verified seed metadata must accompany the explanation');assert.deepEqual(data.seeds.map(seed=>[seed.type,seed.id,seed.title,seed.genreIds]),[['movie','1','A real favorite',[18]],['tv','2','Series 2',[18]]]);
 assert(calls.every(([path])=>!path.includes('search')&&!path.includes('ai')));assert.equal(calls.filter(([p])=>p.endsWith('/recommendations')).length,2);
});

test('empty seeds stay honestly empty and excessive recommendation seeds are rejected',async t=>{
 let calls=0;const call=await fixture(t,{tmdb:async()=>{calls++;return {results:[]};}});
 const empty=await call('/recommendations');assert.equal(empty.status,200);assert.deepEqual(empty.data.results,[]);assert.match(empty.data.message,/watch|save/i);assert.equal(calls,0);
 assert.equal((await call('/recommendations?seeds=movie:1,movie:2,movie:3,movie:4,movie:5')).status,400);assert.equal(calls,0);
});

test('Surprise applies medium, real score, genre and released-year filters before selecting a title',async t=>{
 const calls=[];const call=await fixture(t,{random:()=>0,tmdb:async(path,params)=>{calls.push([path,params]);return {results:[film(1,{vote_average:9,genre_ids:[35]}),film(2,{vote_average:6,genre_ids:[18]}),film(3,{vote_average:9,vote_count:1,genre_ids:[18]}),film(4,{vote_average:9,genre_ids:[18],release_date:'2027-01-01'}),film(5)]};}});
 const {status,data}=await call('/surprise?type=movie&minRating=7&genre=drama&yearFrom=2010&yearTo=2026');assert.equal(status,200);assert.equal(data.result.id,'5');assert.equal(data.result.type,'movie');assert.equal(data.result.rating,8);
 assert.equal(calls[0][0],'/discover/movie');assert.equal(calls[0][1]['vote_average.gte'],'7');assert.equal(calls[0][1].with_genres,'18');assert.equal(calls[0][1]['primary_release_date.lte'],'2026-10-25');
 assert.equal((await call('/surprise?type=person')).status,400);assert.equal((await call('/surprise?minRating=NaN')).status,400);assert.equal((await call('/surprise?yearFrom=2026&yearTo=2020')).status,400);
});

test('both-media Surprise filters each catalog and returns honest no-match results',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push([path,params]);return {results:[]};}});
 const {data}=await call('/surprise?type=both&genre=scifi');assert.equal(data.result,null);assert.match(data.message,/match|filters/i);assert.deepEqual(calls.map(([path,p])=>[path,p.with_genres]),[['/discover/movie','878'],['/discover/tv','10765']]);
});

test('metadata requests coalesce, evict old cache entries and time out an unresponsive upstream',async t=>{
 const counts=new Map();const call=await fixture(t,{cacheLimit:2,tmdb:async path=>{counts.set(path,(counts.get(path)||0)+1);return show(Number(path.split('/').pop()));}});
 await Promise.all([call('/episodes?shows=7'),call('/episodes?shows=7')]);assert.equal(counts.get('/tv/7'),1);
 await call('/episodes?shows=8');await call('/episodes?shows=9');await call('/episodes?shows=7');assert.equal(counts.get('/tv/7'),2);
 let aborted=false;const stuck=await fixture(t,{metadataTimeoutMs:25,tmdb:(_path,_params,_ttl,signal)=>new Promise(()=>{signal.addEventListener('abort',()=>{aborted=true;});})});
 const start=Date.now(),error=await stuck('/episodes?shows=7');assert.equal(error.status,503);assert.match(error.data.message,/unavailable|try again/i);assert(Date.now()-start<1000);assert.equal(aborted,true);
});

test('an announced episode airing today remains in Upcoming without guessing an air time',async t=>{
 const call=await fixture(t,{tmdb:async()=>show(7,{next_episode_to_air:{season_number:1,episode_number:3,name:'Today',air_date:'2026-10-25'}})});
 assert.deepEqual((await call('/episodes?shows=7')).data.upcoming.map(e=>e.id),['tv:7:1:3']);
});
