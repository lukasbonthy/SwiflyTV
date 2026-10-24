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
test('a misspelled title is offered as a named correction rather than a mood search',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(157336,'Interstellar',[878]),media_type:'movie'}]:[]})});
 const r=await call('/candidates?plan=1&q=Intersteler');assert.equal(r.data.mode,'title');assert.equal(r.data.correction?.title,'Interstellar');assert.equal(r.data.candidates[0]?.title,'Interstellar');
});
test('an empty misspelled title search gets one bounded prefix retry before offering a correction',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,p)=>{calls.push([path,p.query]);return {results:path==='/search/multi'&&p.query==='Interst'?[{...movie(157336,'Interstellar',[878]),media_type:'movie'}]:[]};}});
 const r=await call('/candidates?plan=1&q=Intersteler');assert.equal(r.data.mode,'title');assert.equal(r.data.correction?.title,'Interstellar');assert(calls.filter(([p])=>p==='/search/multi').length<=3);
});
test('a sparse near-spelling result does not hide a stronger known title from the bounded retry',async t=>{
 const calls=[],minor={...movie(90,'Interstelar',[18]),media_type:'movie',vote_count:2},familiar={...movie(157336,'Interstellar',[878]),media_type:'movie',vote_count:40000};
 const call=await fixture(t,{tmdb:async(path,p)=>{calls.push([path,p.query]);return {results:path==='/search/multi'?(p.query==='Intersteler'?[minor]:p.query==='Interst'?[familiar,minor]:[]):[]};}});
 const r=await call('/candidates?plan=1&q=Intersteler');assert.equal(r.data.mode,'title');assert.equal(r.data.candidates[0]?.title,'Interstellar');assert(r.data.candidates.some(m=>m.title==='Interstelar'),'a plausible alternative remains selectable');assert(calls.length<=3,'the correction adds at most one bounded retry');
});
test('a correction label names the surviving title after watched exclusions remove an alternative',async t=>{
 const minor={...movie(90,'Interstelar',[18]),media_type:'movie',vote_count:2},familiar={...movie(157336,'Interstellar',[878]),media_type:'movie',vote_count:40000};
 const call=await fixture(t,{tmdb:async(path,p)=>({results:path==='/search/multi'?(p.query==='Intersteler'?[minor]:p.query==='Interst'?[familiar,minor]:[]):[]})});
 const r=await call('/candidates?plan=1&q=Intersteler&exclude=movie:157336');assert.deepEqual(r.data.candidates.map(m=>m.title),['Interstelar']);assert.equal(r.data.correction.title,'Interstelar');
});
test('language and runtime constraints apply to related and discovered titles with verified running times',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,p)=>{calls.push({path,p});return path==='/discover/movie'?{results:[{...movie(1,'Short Korean thriller',[53],2019),original_language:'ko'},{...movie(2,'Long Korean thriller',[53],2019),original_language:'ko'},{...movie(3,'English thriller',[53],2019),original_language:'en'}]}:path==='/movie/1'?{runtime:110}:path==='/movie/2'?{runtime:150}:{results:[]};}});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('Korean thrillers after 2015 under two hours'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['1']);assert.equal(r.data.candidates[0].runtime,110);assert(calls.some(c=>c.path==='/discover/movie'&&c.p.with_original_language==='ko'&&c.p['with_runtime.lte']==='120'));
});
test('TV genres without native catalog genre IDs use keywords and verify positive preferences',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,p)=>{calls.push({path,p});return {results:path==='/search/keyword'?[{id:90,name:'horror'}]:path==='/discover/tv'?[{id:1,name:'An eerie series',genre_ids:[10765],overview:'A mysterious house.'},{id:2,name:'A space adventure',genre_ids:[10765],overview:'A crew explores the stars.'}]:path==='/tv/1/keywords'?[{name:'supernatural horror'}]:path==='/tv/2/keywords'?[{name:'space travel'}]:[]};}});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('a horror TV show'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['1']);assert(calls.some(c=>c.path==='/discover/tv'&&c.p.with_keywords==='90'));
});
test('unresolved quoted titles remain title searches and never request mood planning',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,p)=>{calls.push(path);return {results:[]};}});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('"Interstalarzz"'));assert.equal(r.status,200);assert.equal(r.data.mode,'title');assert.deepEqual(r.data.candidates,[]);assert.match(r.data.message,/title|name|spelling/i);assert(!calls.some(p=>p.startsWith('/discover/')));
});
test('TV OR preferences retain a known comedy and a keyword-verified horror without requiring both',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,p)=>{calls.push({path,p});return path==='/search/keyword'?{results:[{id:90,name:'horror'}]}:path==='/discover/tv'?{results:[{id:1,name:'A comic series',genre_ids:[35],overview:'Friends having adventures.'},{id:2,name:'An eerie series',genre_ids:[10765],overview:'A mysterious house.'}]}:path==='/tv/1/keywords'?{__error:true}:path==='/tv/2/keywords'?{results:[{name:'supernatural horror'}]}:{results:[]};}});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('a comedy or horror series'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['1','2']);assert(calls.some(c=>c.path==='/discover/tv'&&!c.p.with_genres),'the keyword-only alternative is not forced into comedy');
});
test('original titles can resolve to a translated catalog title without starting AI',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(372058,'Your Name.',[16]),original_title:'君の名は。',media_type:'movie'}]:[]})});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('君の名は'));assert.equal(r.data.mode,'title');assert.equal(r.data.candidates[0]?.title,'Your Name.');
});
test('inferred genre hints do not become mandatory catalog exclusions',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/discover/movie'?[movie(10,'An unusual funny adventure',[12])]:[]})});
 const r=await call('/candidates?planned=1&topics=comedy&type=movie&q='+encodeURIComponent('something playful and entertaining'));
 assert.equal(r.status,200);assert(r.data.candidates.some(m=>m.id==='10'),'a broad inferred genre must not erase otherwise valid candidates');
});
test('similarity ranking keeps the user preference as well as the reference story',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(1,'Interstellar',[878]),media_type:'movie'}]:path.endsWith('/recommendations')?[movie(2,'A space mystery',[878,9648])]:[]})});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('Something like Interstellar but with more mystery'));
 assert.equal(r.data.references[0]?.title,'Interstellar');assert.match(r.data.ranking?.preferenceQuery||'',/mystery/);assert.match(r.data.ranking?.referenceQueries?.[0]||'',/Interstellar/);
});
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
test('a named movie returns the title without padding it with unrelated catalog rows',async t=>{
 const calls=[],barbie=movie(346698,'Barbie',[35,14],2023);
 const call=await fixture(t,{tmdb:async path=>{calls.push(path);return {results:path==='/search/multi'?[{...barbie,media_type:'movie'}]:[movie(44,'Unrelated trending title',[28])]};}});
 const r=await call('/candidates?q=Barbie&plan=1');assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.title),['Barbie']);assert.equal(r.data.mode,'title');assert(!calls.some(p=>p.startsWith('/discover/')));
});
test('similar movies inherit the reference medium and do not mix in unrelated popular sources',async t=>{
 const calls=[],anchor=movie(157336,'Interstellar',[878,12]),arrival=movie(329865,'Arrival',[878,18]);
 const call=await fixture(t,{tmdb:async path=>{calls.push(path);return {results:path==='/search/multi'?[{...anchor,media_type:'movie'}]:path.startsWith('/movie/157336/')?[arrival]:[movie(9,'Unrelated television',[35])]};}});
 const r=await call('/candidates?q='+encodeURIComponent('something like Interstellar'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.title),['Arrival']);assert.equal(r.data.mode,'similar');assert(r.data.candidates.every(m=>m.type==='movie'&&m.source==='reference'));assert(!calls.some(p=>p.startsWith('/discover/')||p.startsWith('/trending/')));
});
test('later recommendation pages retain their catalog order for hybrid ranking',async t=>{
 const call=await fixture(t,{tmdb:async(path,params)=>({results:path==='/search/multi'?[{...movie(1,'Interstellar',[878]),media_type:'movie'}]:path.endsWith('/recommendations')?[movie(params.page==='2'?3:2,'Related story',[878])]:path.endsWith('/similar')?[movie(4,'Another related story',[878])]:[]})});
 const r=await call('/candidates?q='+encodeURIComponent('something like Interstellar'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>[m.id,m.catalogRank]),[['2',1],['3',21],['4',41]]);
});
test('an overlapping similar result keeps its stronger recommendation rank',async t=>{
 const call=await fixture(t,{tmdb:async(path,params)=>({results:path==='/search/multi'?[{...movie(1,'Interstellar',[878]),media_type:'movie'}]:path.endsWith('/recommendations')&&params.page==='1'?[movie(2,'First neighbor',[878]),movie(3,'Second neighbor',[878])]:path.endsWith('/similar')?[movie(3,'Second neighbor',[878])]:[]})});
 const r=await call('/candidates?q='+encodeURIComponent('something like Interstellar'));assert.deepEqual(r.data.candidates.map(m=>[m.id,m.catalogRank]),[['2',1],['3',2]]);
});
test('free-form requests are interpreted before an unrelated popular pool is fetched',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async path=>{calls.push(path);return {results:[]};}});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('rival magicians trying to outsmart each other, no horror'));
 assert.equal(r.status,200);assert.equal(r.data.mode,'plan');assert.equal(r.data.candidates.length,0);assert.match(r.data.semanticQuery,/rival magicians/);assert(!r.data.semanticQuery.includes('horror'));assert(!calls.some(p=>p.startsWith('/discover/')));
});
test('release dates stay as catalog filters rather than changing the semantic mood',async t=>{
 const call=await fixture(t);const r=await call('/candidates?plan=1&q='+encodeURIComponent('a funny movie from the 1990s, no horror'));
 assert.equal(r.data.semanticQuery.replace(/[,.]/g,'').trim(),'a funny movie');
});
test('semantic topics retrieve a grounded story pool and still respect explicit exclusions',async t=>{
 const calls=[];const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/search/keyword'?[{id:44,name:'magic'}]:path==='/search/multi'?[]:path==='/discover/movie'&&params.with_keywords==='44'?[movie(8,'A rivalry of illusionists',[18,9648]),movie(9,'A haunted magician',[27])]:[movie(10,'Unrelated popular title',[28])]};}});
 const r=await call('/candidates?planned=1&topics=magic&type=movie&q='+encodeURIComponent('rival magicians trying to outsmart each other, no horror'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['8']);assert.equal(r.data.candidates[0].source,'topic');assert(calls.some(c=>c.path==='/search/keyword'&&c.params.query==='magic'));assert(calls.length<=16);
});
test('a low-confidence interpretation returns an honest empty state instead of random titles',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[]:[movie(4,'Random popular movie',[28])]})});
 const r=await call('/candidates?planned=1&topics=not-a-topic&q='+encodeURIComponent('purple crunchy yesterday'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates,[]);assert.match(r.data.message,/specific|title|genre/i);
});
test('direct title matching accepts punctuation differences and preserves non-Latin titles',async t=>{
 for(const [prompt,title,other]of [['spiderman','Spider-Man','Unrelated title'],['君の名は','君の名は','千と千尋の神隠し']]){
  const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(1,other,[16]),media_type:'movie'},{...movie(2,title,[16]),media_type:'movie'}]:[]})});
  const r=await call('/candidates?plan=1&q='+encodeURIComponent(prompt));assert.equal(r.data.mode,'title');assert.equal(r.data.candidates[0].title,title);
 }
});
test('a literal catalog name is protected from format and date words inside that name',async t=>{
 for(const [title,year]of [['The TV Set',2006],['The 1980s',2018]]){
  const call=await fixture(t,{tmdb:async()=>({results:[{...movie(1,title,[18],year),media_type:'movie'}]})});const r=await call('/candidates?plan=1&q='+encodeURIComponent(title));assert.equal(r.data.mode,'title');assert.equal(r.data.candidates[0]?.title,title);
 }
});
test('a missing topic keyword and missing exemplar is an empty match, not a catalog outage',async t=>{
 const call=await fixture(t);const r=await call('/candidates?planned=1&topics=magic&q='+encodeURIComponent('rival magicians'));
 assert.equal(r.status,200);assert.deepEqual(r.data.candidates,[]);assert.match(r.data.message,/matches|specific/i);
});
test('exact TV titles still honor explicit suffix exclusions and retry unavailable metadata',async t=>{
 for(const unavailable of [false,true]){
  const call=await fixture(t,{tmdb:async path=>path==='/search/multi'?{results:[{...movie(66732,'Stranger Things',[10765,18]),media_type:'tv'}]}:unavailable?{__error:true}:{results:[{name:'supernatural horror'}]}});
  const r=await call('/candidates?plan=1&q='+encodeURIComponent('"Stranger Things", no horror'));
  assert.equal(r.status,unavailable?503:200);if(!unavailable)assert.deepEqual(r.data.candidates,[]);
 }
});
test('exact remakes are filtered before a title version is selected',async t=>{
 const call=await fixture(t,{tmdb:async()=>({results:[{...movie(1,'Dune',[878],2021),media_type:'movie'},{...movie(2,'Dune',[878],1984),media_type:'movie'}]})});
 for(const suffix of ['&q='+encodeURIComponent('"Dune" from the 1980s'),'&exclude=movie:1&q=Dune']){const r=await call('/candidates?plan=1&type=movie'+suffix);assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.id),['2']);}
});
test('an explicit different format finds genre-grounded neighbors in the requested medium',async t=>{
 const call=await fixture(t,{tmdb:async path=>({results:path==='/search/multi'?[{...movie(157336,'Interstellar',[878,12]),media_type:'movie'}]:path==='/discover/tv'?[{...movie(20,'A space series',[10765]),media_type:'tv'}]:[]})});
 const r=await call('/candidates?plan=1&q='+encodeURIComponent('TV shows like Interstellar'));assert.equal(r.status,200);assert.deepEqual(r.data.candidates.map(m=>m.type+':'+m.id),['tv:20']);
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

test('Explicit genre queries skip speculative topic planning and immediately search matching catalog genres',async t=>{
 const calls=[];
 const call=await fixture(t,{tmdb:async(path,params)=>{calls.push({path,params});return {results:path==='/discover/movie'?[movie(10,'A genuinely funny film',[35])]:[]};}});
 const result=await call('/candidates?plan=1&type=movie&q='+encodeURIComponent('a funny comedy movie'));
 assert.equal(result.status,200);
 assert.equal(result.data.mode,'mood');
 assert.deepEqual(result.data.candidates.map(x=>x.id),['10']);
 assert(calls.some(x=>x.path==='/discover/movie'&&x.params.with_genres==='35'));
});

test('An obscure keyword does not erase clearly requested genre matches',async t=>{
 const calls=[];
 const call=await fixture(t,{tmdb:async(path,params)=>{
  calls.push({path,params});
  if(path==='/discover/movie'&&!params.with_keywords)return {results:[movie(501,'Thoughtful alien science fiction',[878])]};
  return {results:[]};
 }});
 const r=await call('/candidates?type=movie&q='+encodeURIComponent('science fiction about an alien'));
 assert.equal(r.status,200);
 assert.deepEqual(r.data.candidates.map(m=>m.id),['501']);
 assert(calls.some(x=>x.path==='/discover/movie'&&x.params.with_genres==='878'));
});
