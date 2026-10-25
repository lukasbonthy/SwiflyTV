'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
let C;try{C=require('../lib/catalog-tools');}catch{C={};}
test('certifications use real US metadata and never invent a default age rating',()=>{
 assert.equal(typeof C.certification,'function');assert.equal(C.certification({},'movie'),null);assert.deepEqual(C.certification({release_dates:{results:[{iso_3166_1:'US',release_dates:[{certification:'R',type:3}]}]}},'movie'),{label:'R',severity:'mature',country:'US'});assert.equal(C.certification({content_ratings:{results:[{iso_3166_1:'US',rating:'TV-14'}]}},'tv').severity,'teen');
});
test('search filtering and deterministic sorting preserve relevance and exclude unknown dates from date bounds',()=>{
 assert.equal(typeof C.filterSearch,'function');const rows=[{id:1,media_type:'movie',title:'One',vote_average:7,release_date:'2020-01-01'},{id:2,media_type:'tv',name:'Two',vote_average:9,first_air_date:'2024-01-01'},{id:3,media_type:'movie',title:'Unknown',vote_average:10}];
 assert.deepEqual(C.filterSearch(rows,{media:'movie',minRating:6,sort:'rating'}).map(x=>x.id),[3,1]);assert.deepEqual(C.filterSearch(rows,{yearFrom:2021,sort:'date'}).map(x=>x.id),[2]);assert.deepEqual(C.filterSearch(rows,{sort:'relevance'}).map(x=>x.id),[1,2,3]);
});
test('next-episode lookup crosses real season boundaries and never offers unaired episodes',async t=>{
 assert.equal(typeof C.createCatalogRouter,'function');const app=express(),calls=[];app.use(C.createCatalogRouter({now:()=>Date.parse('2026-10-24T12:00:00Z'),tmdb:async path=>{calls.push(path);return path==='/tv/5'?{seasons:[{season_number:1},{season_number:2}]}:path.endsWith('/season/1')?{episodes:[{episode_number:1,season_number:1,air_date:'2020-01-01'}]}:{episodes:[{episode_number:1,season_number:2,name:'Next',air_date:'2026-10-23'},{episode_number:2,season_number:2,air_date:'2027-01-01'}]};}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const next=await(await fetch(base+'/next/tv/5?s=1&e=1')).json();assert.deepEqual(next.next,{season:2,episode:1,title:'Next',airDate:'2026-10-23'});assert.equal((await(await fetch(base+'/next/tv/5?s=2&e=1')).json()).next,null);assert.equal((await fetch(base+'/next/tv/no?s=1&e=1')).status,400);assert(calls.length<=6);
});
