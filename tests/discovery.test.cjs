'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createDiscovery}=require('../lib/discovery');
async function fixture(t,{tmdb,fetch:fetcher,metadataTimeoutMs}={}){
 const discovery=createDiscovery({tmdb:tmdb||(async()=>({results:[]})),fetch:fetcher||(async()=>({ok:true,json:async()=>({books:[]})})),metadataTimeoutMs});
 const app=express();app.use(discovery.router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.on('listening',r));t.after(()=>{s.closeAllConnections();s.close();});
 return async route=>{const r=await fetch(`http://127.0.0.1:${s.address().port}`+route);return {status:r.status,data:await r.json().catch(()=>({}))};};
}
const book={id:'52',title:'A <b>book</b>',description:'<p>A description &amp; more</p>',authors:[{first_name:'Jane',last_name:'Austen'}],language:'English',totaltime:'10:00:00',coverart_jpg:'https://www.archive.org/download/covers/a.jpg',sections:[{title:'Chapter 1',section_number:'1',listen_url:'https://archive.org/download/book/chapter1.mp3',playtime:'600'},{title:'bad',listen_url:'http://169.254.169.254/secret'}]};
test('search normalizes screen/person results, excludes adult material, and never trusts remote links',async t=>{const urls=[];const call=await fixture(t,{tmdb:async(path,p)=>{urls.push([path,p]);return {results:[{id:1,media_type:'movie',title:'Film',poster_path:'/a.jpg',release_date:'2025-01-01'},{id:2,media_type:'person',name:'Person',profile_path:'/b.jpg'},{id:3,media_type:'movie',adult:true,title:'No'}]};}});const r=await call('/search?q=film&type=screen');assert.equal(r.status,200);assert.equal(r.data.results.length,1);assert.equal(r.data.results[0].href,'/movie/1');assert.equal(urls[0][1].include_adult,'false');assert.equal((await call('/search?q=film&type=person')).data.results[0].href,'/person/2');});
test('audiobooks normalize real sections and reject non-catalog audio URLs',async t=>{const urls=[];const call=await fixture(t,{fetch:async url=>{urls.push(new URL(url));return {ok:true,json:async()=>({books:[book]})};}});const r=await call('/books/52');assert.equal(r.status,200);assert.equal(r.data.book.chapters.length,1);assert.equal(r.data.book.chapters[0].url,'https://archive.org/download/book/chapter1.mp3');assert.equal(r.data.book.description,'A description & more');assert.equal(r.data.book.author,'Jane Austen');assert.equal(urls[0].hostname,'librivox.org');assert.equal((await call('/books/../../etc')).status,404);});
test('catalog caching coalesces repeated requests; upstream errors remain retryable',async t=>{let calls=0;const call=await fixture(t,{fetch:async()=>{calls++;return {ok:true,json:async()=>({books:[book]})};}});await Promise.all([call('/books?q=Jane'),call('/books?q=Jane')]);assert.equal(calls,1);const broken=await fixture(t,{fetch:async()=>({ok:false,status:429})});const r=await broken('/books');assert.equal(r.status,503);assert.match(r.data.message,/try again/i);});
test('candidate pool deduplicates real titles, limits seed work and excludes watched titles',async t=>{const calls=[];const call=await fixture(t,{tmdb:async route=>{calls.push(route);return {results:[{id:1,title:'One',overview:'A space story',poster_path:'/1.jpg',vote_count:30},{id:2,title:'Two',overview:'A family tale',vote_count:30}]};}});const r=await call('/candidates?seeds=movie:1,movie:2,movie:3,movie:4,movie:5&exclude=movie:1');assert.equal(r.status,200);assert(r.data.candidates.every(m=>m.type+':'+m.id!=='movie:1'));assert.equal(new Set(r.data.candidates.map(m=>m.type+':'+m.id)).size,r.data.candidates.length);assert(calls.filter(p=>p.includes('recommendations')).length<=3);});
test('malformed catalog data and unknown identifiers do not create broken chapters',async t=>{const call=await fixture(t,{fetch:async()=>({ok:true,json:async()=>({books:[{...book,sections:'bad',authors:null}]})})});assert.equal((await call('/books/52')).data.book.chapters.length,0);assert.equal((await call('/books/invalid')).status,400);const empty=await fixture(t);assert.equal((await empty('/books/52')).status,404);});

const movie=(id,title,genres,year=2000)=>({id,title,overview:title+' is a story about its characters.',genre_ids:genres,release_date:year+'-01-01',vote_count:500,vote_average:7.5});
test('a mood searches the relevant catalog and keeps an excluded genre out of every source',async t=>{
 const calls=[],romance=movie(11,'A gentle romance',[35,10749]),horror=movie(12,'A romantic nightmare',[35,10749,27]);
 const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/discover/movie'?[romance,horror]:[horror]};}});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('A cozy romantic comedy, no horror'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['11']);
 assert(calls.some(c=>c.path==='/discover/movie'&&String(c.params.with_genres).includes('10749')&&String(c.params.without_genres).includes('27')));
});
test('similar-to requests resolve the named title before retrieving its related movies',async t=>{
 const calls=[],anchor=movie(157336,'Interstellar',[878,12]),arrival=movie(329865,'Arrival',[878,18]);
 const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/search/multi'?[{...anchor,media_type:'movie'}]:path==='/movie/157336/recommendations'?[arrival]:[]};}});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('something like Interstellar'));
 assert.equal(r.status,200);assert(r.data.candidates.some(m=>m.id==='329865'));assert(!r.data.candidates.some(m=>m.id==='157336'));
 assert.equal(r.data.references[0].title,'Interstellar');assert(calls.some(c=>c.path==='/search/multi'&&c.params.query.toLowerCase()==='interstellar'));
});
test('a direct title is found even when it is absent from popular and trending lists',async t=>{
 const barbie=movie(346698,'Barbie',[35,12,14],2023);
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...barbie,media_type:'movie'}]:[movie(44,'Unrelated trending title',[28])]})});
 const r=await call('/candidates?type=movie&q=Barbie');assert.equal(r.status,200);assert.equal(r.data.candidates[0].title,'Barbie');assert.equal(r.data.candidates[0].match,'title');
});
test('a decade is respected across discovery and personal recommendation sources',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:[movie(1,'Nineties comedy',[35],1995),movie(2,'Modern comedy',[35],2024)]};}});
 const r=await call('/candidates?type=movie&seeds=movie:8&q='+encodeURIComponent('a funny movie from the 1990s'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['1']);assert(calls.some(c=>c.path==='/discover/movie'&&c.params['primary_release_date.gte']==='1990-01-01'&&c.params['primary_release_date.lte']==='1999-12-31'));
});
test('TV prompts use TV genre identifiers and do not return movie rows',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/discover/tv'?[{id:10,name:'Space series',genre_ids:[10765],overview:'A crew explores space.',first_air_date:'2020-01-01'}]:[]};}});
 const r=await call('/candidates?q='+encodeURIComponent('a science fiction TV show'));
 assert.equal(r.status,200);assert(r.data.candidates.length);assert(r.data.candidates.every(m=>m.type==='tv'));assert(calls.some(c=>c.path==='/discover/tv'&&c.params.with_genres==='10765'));
});
test('theme requests retrieve keyword matches instead of recycling trending titles',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/search/keyword'?[{id:99,name:'heist'}]:path==='/discover/movie'&&params.with_keywords==='99'?[movie(8,'A clever robbery',[80,53])]:[]};}});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('a clever heist with a twist'));
 assert.equal(r.status,200);assert(r.data.candidates.some(m=>m.id==='8'));assert(calls.some(c=>c.path==='/search/keyword'&&c.params.query==='heist'));assert(calls.length<=14,'one prompt has bounded upstream work');
});
test('title words such as No and Show are not mistaken for recommendation filters',async t=>{
 const call=await fixture(t,{tmdb:async(path,params)=>({results:path==='/search/multi'?[{...movie(params.query==='No Country for Old Men'?1:2,params.query,[18]),media_type:'movie'}]:[]})});
 for(const title of ['No Country for Old Men','The Truman Show','Some Like It Hot']){const r=await call('/candidates?q='+encodeURIComponent(title));assert.equal(r.status,200);assert.equal(r.data.candidates[0]?.title,title);assert.equal(r.data.candidates[0]?.match,'title');}
});
test('a recording without uploaded cover fields uses its own verified Archive cover',async t=>{
 const call=await fixture(t,{fetch:async()=>({ok:true,json:async()=>({books:[{...book,coverart_jpg:'',url_iarchive:'https://archive.org/details/pride_prejudice_librivox'}]})})});
 const r=await call('/books');assert.equal(r.data.books[0].poster,'https://archive.org/services/img/pride_prejudice_librivox');
});
test('similarity anchors preserve punctuation and words that also describe genres or exclusions',async t=>{
 const titles=[['No Country for Old Men',1,'movie'],['War of the Worlds',2,'movie'],['Mr. Robot',3,'tv']];
 for(const [title,id,type]of titles){const seen=[];const call=await fixture(t,{tmdb:async(path,params)=>{seen.push({path,params});return {results:path==='/search/multi'?[{...movie(id,title,[878]),media_type:type}]:path.endsWith('/recommendations')?[{...movie(20,'A science fiction story',[878]),media_type:type}]:[]};}});
  const r=await call('/candidates?type='+type+'&q='+encodeURIComponent('something like '+title));assert.equal(r.status,200);assert.equal(r.data.references[0]?.title,title);assert(r.data.candidates.some(m=>m.id==='20'));assert(!seen.some(c=>c.params.with_genres==='10752'),'War in a reference title is not a war-genre requirement');
 }
});
test('TV exclusions inspect series keywords without treating all science fiction as horror',async t=>{
 const calls=[],series=(id,name)=>({id,name,media_type:'tv',genre_ids:[35,10765],overview:'A funny story with an unusual group of friends.'});
 const call=await fixture(t,{tmdb:async(path,params)=>{calls.push(path);return {results:path==='/discover/tv'?[series(10,'Haunted comedy'),series(11,'Space comedy')]:path==='/tv/10/keywords'?[{id:99,name:'supernatural horror'}]:path==='/tv/11/keywords'?[{id:100,name:'space travel'}]:[]};}});
 const r=await call('/candidates?q='+encodeURIComponent('a funny TV show, no horror'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['11']);assert(calls.includes('/tv/10/keywords'));assert(calls.includes('/tv/11/keywords'));
});
test('an empty title lookup cannot disguise a catalog retrieval outage as no matches',async t=>{
 const call=await fixture(t,{tmdb:async path=>path.startsWith('/search/')?{results:[]}:{__error:true}});
 const r=await call('/candidates?type=movie&q=Barbie');assert.equal(r.status,503);assert.match(r.data.message,/try again/i);
});
test('unquoted reference titles preserve commas while suffix preferences remain active',async t=>{
 const cases=[['something like Interstellar with no horror','Interstellar',[movie(1,'Space drama',[878],1995),movie(2,'Space horror',[878,27],1995)]],['something like Interstellar from the 1990s','Interstellar',[movie(1,'Older space drama',[878],1995),movie(2,'Modern space drama',[878],2024)]],['something like I, Robot','I, Robot',[movie(1,'A robot story',[878])]]];
 for(const [prompt,title,rows]of cases){const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(90,title,[878]),media_type:'movie'}]:path.endsWith('/recommendations')?rows:[]})});const r=await call('/candidates?type=movie&q='+encodeURIComponent(prompt));assert.equal(r.status,200);assert.equal(r.data.references[0]?.title,title);assert.deepEqual(r.data.candidates.map(m=>m.id),['1'],prompt);}
});
test('a stalled series metadata check aborts within budget and a subsequent request can retry',async t=>{
 let stalled=true,signal;
 const call=await fixture(t,{metadataTimeoutMs:35,tmdb:async(path,params,ttl,requestSignal)=>{
  if(path==='/discover/tv')return {results:[{id:11,name:'Space comedy',genre_ids:[35,10765],overview:'An unusual group of friends in space.'}]};
  if(path==='/tv/11/keywords'){signal=requestSignal;if(stalled)return new Promise(()=>{});return {results:[{name:'space travel'}]};}
  return {results:[]};
 }});
 const result=await Promise.race([call('/candidates?q='+encodeURIComponent('a funny TV show, no horror')),new Promise(resolve=>setTimeout(()=>resolve({status:'stalled'}),250))]);
 assert.equal(result.status,503);assert(signal?.aborted);stalled=false;const retry=await call('/candidates?q='+encodeURIComponent('a funny TV show, no horror'));assert.equal(retry.status,200);assert.equal(retry.data.candidates[0].id,'11');
});
