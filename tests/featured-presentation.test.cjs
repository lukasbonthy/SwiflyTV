'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const item={id:100,title:'Resident Evil',media_type:'movie',backdrop_path:'/forest.jpg',poster_path:'/poster.jpg',overview:'A medical courier is caught in a horrifying night.',vote_average:7.5,release_date:'2026-09-01'};
test('Discover features the selected film with its real logo, runtime and genres',async()=>{
 const api=loadServer(),calls=[];try{
  api.setTmdb(async(endpoint,params)=>{calls.push([endpoint,params]);return endpoint==='/movie/100'?{...item,runtime:95,genres:[{name:'Horror'},{name:'Science Fiction'}],images:{logos:[{file_path:'/resident-logo.png',iso_639_1:'en',width:900,height:210}]}}:{results:[item]};});
  let html;await api.trendingPage({query:{}},{send:value=>html=value});const {window:w}=browser(html),hero=w.document.querySelector('.dsHero');
  assert(hero.querySelector('.dsHeroLogo'));assert.match(hero.querySelector('.dsHeroMeta').textContent,/1h 35m/);assert.match(hero.querySelector('.dsHeroMeta').textContent,/Horror, Science Fiction/);
  assert.equal(calls.filter(([endpoint])=>endpoint==='/movie/100').length,1);assert.equal(calls.find(([endpoint])=>endpoint==='/movie/100')[1].append_to_response,'images');
  assert(w.document.querySelector('.dsRow').compareDocumentPosition(w.document.querySelector('[data-feed-discover]'))&w.Node.DOCUMENT_POSITION_FOLLOWING,'featured titles lead into movie rows before discovery tools');
 }finally{api.io.close();}
});
test('optional featured metadata failure preserves the selected film and usable actions',async()=>{
 const api=loadServer();try{api.setTmdb(async endpoint=>endpoint==='/movie/100'?{__error:true}:{results:[item]});let html;await api.trendingPage({query:{}},{send:value=>html=value});const {window:w}=browser(html);assert.equal(w.document.querySelector('.dsHero h1').textContent,item.title);assert.match(w.document.querySelector('.dsHeroActions a').getAttribute('href'),/watch\/movie\/100/);}finally{api.io.close();}
});
test('optional featured lookup aborts on its short deadline and never replaces the selected identity',async()=>{
 const api=loadServer();try{
  let signal;api.setTmdb(async(endpoint,_params,_ttl,requestSignal)=>{if(endpoint==='/movie/100'){signal=requestSignal;return new Promise(()=>{});}return {results:[item]};});
  let html;await api.trendingPage({query:{}},{send:value=>html=value});assert.equal(signal.aborted,true);assert.match(html,/watch\/movie\/100/);
  api.setTmdb(async endpoint=>endpoint==='/movie/100'?{...item,id:999,images:{logos:[{file_path:'/wrong-logo.png'}]}}:{results:[item]});await api.trendingPage({query:{}},{send:value=>html=value});assert.doesNotMatch(html,/wrong-logo/);
 }finally{api.io.close();}
});
