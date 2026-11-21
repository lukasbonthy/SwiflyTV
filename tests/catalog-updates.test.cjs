'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
let C;try{C=require('../lib/catalog-tools');}catch{C={};}
async function catalogApi(t, tmdb) {
 const app=express();
 app.use(C.createCatalogRouter({now:()=>Date.parse('2026-10-24T12:00:00Z'),tmdb}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 return path=>fetch('http://127.0.0.1:'+server.address().port+path);
}
test('certifications use real US metadata and never invent a default age rating',()=>{
 assert.equal(typeof C.certification,'function');assert.equal(C.certification({},'movie'),null);assert.deepEqual(C.certification({release_dates:{results:[{iso_3166_1:'US',release_dates:[{certification:'R',type:3}]}]}},'movie'),{label:'R',severity:'mature',country:'US'});assert.equal(C.certification({content_ratings:{results:[{iso_3166_1:'US',rating:'TV-14'}]}},'tv').severity,'teen');
});
test('search filtering and deterministic sorting preserve relevance and exclude unknown dates from date bounds',()=>{
 assert.equal(typeof C.filterSearch,'function');const rows=[{id:1,media_type:'movie',title:'One',vote_average:7,release_date:'2020-01-01'},{id:2,media_type:'tv',name:'Two',vote_average:9,first_air_date:'2024-01-01'},{id:3,media_type:'movie',title:'Unknown',vote_average:10}];
 assert.deepEqual(C.filterSearch(rows,{media:'movie',minRating:6,sort:'rating'}).map(x=>x.id),[3,1]);assert.deepEqual(C.filterSearch(rows,{yearFrom:2021,sort:'date'}).map(x=>x.id),[2]);assert.deepEqual(C.filterSearch(rows,{sort:'relevance'}).map(x=>x.id),[1,2,3]);
});
test('next-episode lookup crosses real season boundaries and never offers unaired episodes',async t=>{
 assert.equal(typeof C.createCatalogRouter,'function');const calls=[];
 const get=await catalogApi(t,async path=>{calls.push(path);return path==='/tv/5'?{seasons:[{season_number:1},{season_number:2}]}:path.endsWith('/season/1')?{episodes:[{episode_number:1,season_number:1,air_date:'2020-01-01'}]}:{episodes:[{episode_number:1,season_number:2,name:'Next',air_date:'2026-10-23'},{episode_number:2,season_number:2,air_date:'2027-01-01'}]};});
 const next=await(await get('/next/tv/5?s=1&e=1')).json();assert.deepEqual(next.next,{season:2,episode:1,title:'Next',airDate:'2026-10-23'});assert.equal((await(await get('/next/tv/5?s=2&e=1')).json()).next,null);assert.equal((await get('/next/tv/no?s=1&e=1')).status,400);assert(calls.length<=6);
});

const episode=(episode_number,air_date='2025-01-01',fields={})=>({episode_number,air_date,...fields});

test('episode metadata API lists real sorted ordinals from the requested season and classifies calendar dates',async t=>{
 const get=await catalogApi(t,async()=>({episodes:[
  episode(8,null),episode(7,'2026-02-31'),episode('3'),episode(2.5),episode(10000),episode(0),episode(5,undefined,{season_number:3}),
  episode(4,'2026-10-25'),episode(2,'2026-10-24',{name:'Premiere',season_number:2}),episode(4),episode(2,'2026-11-01'),
  episode(9,'2024-02-29'),
 ]}));
 const response=await get('/episodes/tv/5/2');
 assert.equal(response.status,200);
 const {episodes}=await response.json();
 assert.deepEqual(episodes.map(({episode,season,airDate,aired})=>[episode,season,airDate,aired]),[
  [2,2,'2026-10-24',true],[4,2,'2026-10-25',false],[7,2,'',false],[8,2,'',false],[9,2,'2024-02-29',true],
 ]);
 assert.equal(episodes[0].name,'Premiere');
});

test('next episode ignores malformed ordinals and rows belonging to another season',async t=>{
 const get=await catalogApi(t,async path=>path==='/tv/5'
  ?{seasons:[null,{season_number:1},{season_number:2}]}
  :{episodes:[null,episode('2'),episode(3,undefined,{season_number:2}),episode(4,'2026-10-24',{name:'Exact successor',season_number:1}),episode(5)]});
 const response=await get('/next/tv/5?s=1&e=1');
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).next,{season:1,episode:4,title:'Exact successor',airDate:'2026-10-24'});
});

test('next episode holds at an earliest impossible, missing or future date despite later aired rows',async t=>{
 const unverifiedDates={'5':'2026-02-31','6':null,'7':'2026-10-25'};
 const get=await catalogApi(t,async path=>{
  const [,id,season]=path.match(/^\/tv\/(\d+)(?:\/season\/(\d+))?$/);
  if(!season)return {seasons:[{season_number:1},{season_number:2}]};
  return {episodes:season==='1'?[episode(4),episode(2,unverifiedDates[id]),episode(2)]:[episode(1)]};
 });
 for(const id of Object.keys(unverifiedDates)){
  const response=await get('/next/tv/'+id+'?s=1&e=1');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{next:null},'title '+id+' must wait for the first real successor');
 }
});
