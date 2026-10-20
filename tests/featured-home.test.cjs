'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const movie=(id,title)=>({id,title,backdrop_path:'/scene.jpg',poster_path:'/poster.jpg',release_date:'2023-07-21',overview:'A film for tonight.',vote_average:7});

for(const alternate of [false,true])test(alternate?'A missing Barbie feature falls back to the requested Spider-Man movie':'Barbie is featured without changing the catalog rails',async()=>{
 const api=loadServer();
 try{
  const barbie=movie(346698,'Barbie'),spider=movie(634649,'Spider-Man: No Way Home'),trending=movie(100,'Trending film');
  api.setTmdb(async endpoint=>endpoint==='/movie/346698'?(alternate?{__error:true}:barbie):endpoint==='/movie/634649'?spider:{results:[trending]});
  let html;await api.homePage({}, {send(value){html=value;}});
  const env=browser(html),d=env.window.document,id=alternate?634649:346698;
  assert.equal(d.querySelector('.dsHero h1').textContent,alternate?spider.title:barbie.title);
  assert.equal(d.querySelector('.dsHeroActions .dsPrimaryBtn').dataset.playId,String(id));
  assert.equal(d.querySelector('.dsHeroActions .dsSecondaryBtn').getAttribute('href'),'/movie/'+id);
  assert.equal(d.querySelector('.svCatalogRow .dsCardTitle').textContent,trending.title);
  env.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});

test('an unavailable feature request cannot block an otherwise ready homepage',async()=>{
 const api=loadServer();let signal,guard;
 try{
  api.setTmdb(async(endpoint,_params,_ttl,requestSignal)=>{
   if(endpoint==='/movie/346698'){signal=requestSignal;return new Promise(()=>{});}
   return {results:[movie(100,'Ready catalog')]};
  });
  const output=new Promise(resolve=>api.homePage({}, {send:resolve}));
  const html=await Promise.race([output,new Promise((_,reject)=>{guard=setTimeout(()=>reject(new Error('Optional featured metadata blocked the catalog')),2000);})]);
  assert(signal.aborted,'The timed-out feature request releases its network work');
  const env=browser(html);assert.equal(env.window.document.querySelector('.dsHero h1').textContent,'Ready catalog');env.finish();
 }finally{clearTimeout(guard);await new Promise(resolve=>api.io.close(resolve));}
});

test('aborting metadata during its response body does not cache an empty movie',async()=>{
 const priorKey=process.env.TMDB_API_KEY,priorFetch=global.fetch;
 process.env.TMDB_API_KEY='featured-test-key';
 const api=loadServer(),controller=new AbortController();let calls=0;
 try{
  global.fetch=async(_url,options)=>{
   calls++;
   if(calls===1)return {ok:true,json:()=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});controller.abort();
   })};
   return {ok:true,json:async()=>movie(346698,'Barbie')};
  };
  const aborted=await api.tmdb('/movie/346698',{},600000,controller.signal);
  assert.equal(aborted.__error,true,'An aborted body is a failed request');
  const fresh=await api.tmdb('/movie/346698',{},600000);
  assert.equal(calls,2,'The next request retries rather than reading an empty cached response');
  assert.equal(fresh.title,'Barbie');
 }finally{
  global.fetch=priorFetch;if(priorKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=priorKey;
  await new Promise(resolve=>api.io.close(resolve));
 }
});
