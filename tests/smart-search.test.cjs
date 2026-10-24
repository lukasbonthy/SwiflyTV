'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createDiscovery}=require('../lib/discovery');
const {parseRecommendationQuery:parse}=require('../lib/recommendation-query');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const ui=require('../ui/discovery');
afterEach(cleanup);
async function catalog(t,tmdb){const app=express();app.use(createDiscovery({tmdb,metadataTimeoutMs:40}).router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.on('listening',r));t.after(()=>{s.closeAllConnections();s.close();});return async(query,route='candidates')=>{const r=await fetch('http://127.0.0.1:'+s.address().port+'/'+route+'?'+new URLSearchParams(query));return{status:r.status,...await r.json()};};}
const film=(id,title,genres=[35])=>({id,title,media_type:'movie',genre_ids:genres,overview:'A detailed story about friendship and adventures.',release_date:'2000-01-01'});
test('the entire AI form is preserved while sharing search modes',()=>{
 const {window:w}=browser(ui.recommendationsMarkup());const d=w.document,f=d.querySelector('[data-recommendation-form]');
 assert.equal(f.elements.prompt.tagName,'TEXTAREA');assert(f.querySelector('[type=submit]'));assert.equal(f.elements.type.options.length,3);assert.equal(f.elements.audience.options.length,2);assert(f.elements.unseen.checked);assert.match(f.querySelector('summary').textContent,/More options/);assert.equal(d.querySelectorAll('[data-mood]').length,3);assert(d.querySelector('[data-ai-status]'));assert(d.querySelector('[data-ai-cancel]'));
 assert.equal(d.querySelectorAll('[data-search-mode]').length,3);
});
test('people parsing retains story clauses, co-stars and two different roles',()=>{
 for(const tail of ['like Cast Away','about a long and surprising journey around the world']){const q=parse('comedy movies starring Tom Hanks '+tail);assert.equal(q.person?.name,'Tom Hanks');assert(q.semanticQuery.includes(tail.startsWith('like')?'comedy':'journey'));assert(q.wanted.some(g=>g[0]==='comedy'));}
 const q=parse('movies starring Tom Hanks and Meg Ryan');assert.deepEqual(q.people.map(p=>[p.name,p.role]),[['Tom Hanks','cast'],['Meg Ryan','cast']]);
 const both=parse('"Big" starring Tom Hanks and directed by Penny Marshall');assert.deepEqual(both.people.map(p=>p.name),['Tom Hanks','Penny Marshall']);
 assert.match(parse('movies starring This Extremely Long Unseparated Actor Person Name').personError,/name/i);
 assert.match(parse('starring Tom Hanks and Meg Ryan and directed by Nora Ephron').personError,/two/i);
});
test('known story concepts in with phrases never become person hints',()=>{const q=parse('movies with time travel');assert.deepEqual(q.people,[]);assert.deepEqual(q.themes,['time travel']);});
test('descriptive genre prompts reach semantic planning, broad filters skip it',async t=>{
 const call=await catalog(t,async()=>({results:[]}));assert.equal((await call({q:'a comedy about two people switching bodies',plan:1})).mode,'plan');assert.notEqual((await call({q:'a comedy',plan:1})).mode,'plan');
});
test('generic with clauses keep their meaning when no person is verified',async t=>{
 const calls=[];const call=await catalog(t,async(path,p)=>{calls.push([path,p]);return{results:[]};});
 for(const q of ['movies with a happy ending','shows with strong female leads']){const r=await call({q,plan:1});assert.equal(r.mode,'plan');assert(!r.message,/person error/);}
 const r=await call({q:'movies with time travel',plan:1});assert(!r.message?.includes('person'));assert(!calls.some(([path,p])=>path==='/search/person'&&p.query==='time travel'));
});
test('verified actor and director credits intersect even on exact-title paths',async t=>{
 const calls=[];const call=await catalog(t,async(path,p)=>{calls.push([path,p]);if(path==='/search/person')return{results:[{id:p.query==='Tom Hanks'?31:p.query==='Penny Marshall'?32:33,name:p.query}]};if(path==='/person/31/combined_credits')return{cast:[film(1,'Big'),film(2,'Cast Away')]};if(path==='/person/32/combined_credits')return{crew:[{...film(1,'Big'),job:'Director'}]};if(path==='/person/33/combined_credits')return{crew:[{...film(2,'Cast Away'),job:'Producer'}]};if(path==='/search/multi')return{results:[film(1,'Big')]};return{results:[]};});
 const no=await call({q:'"Big" starring Tom Hanks and directed by Steven Spielberg',plan:1});assert.deepEqual(no.candidates,[]);
 const yes=await call({q:'"Big" starring Tom Hanks and directed by Penny Marshall',plan:1});assert.deepEqual(yes.candidates.map(r=>r.title),['Big']);assert(yes.filters.includes('Starring Tom Hanks'));assert(yes.filters.includes('Directed by Penny Marshall'));
 const like=await call({q:'movies starring Tom Hanks like Cast Away',plan:1});assert(calls.some(([path,p])=>path==='/search/person'&&p.query==='Tom Hanks'));assert(!calls.some(([path,p])=>path==='/search/person'&&p.query.includes('like')));
});
test('person metadata timeout stays bounded and retryable',async t=>{
 let fail=true;const call=await catalog(t,async(path,p)=>path==='/search/person'?(fail?new Promise(()=>{}):{results:[{id:1,name:'Tom Hanks'}]}):path.includes('/combined_credits')?{cast:[film(1,'Big')]}:{results:[]});
 const r=await call({q:'movies starring Tom Hanks'});assert.match(r.message,/verify|try again/i);fail=false;const again=await call({q:'movies starring Tom Hanks'});assert.equal(again.candidates?.[0]?.title,'Big');
});
test('full search supports one character titles, pagination and popular people browsing',async t=>{
 const calls=[];const call=await catalog(t,async(path,p)=>{calls.push([path,p]);return{results:path.includes('person')?[{id:2,name:'A Person'}]:[film(1,'X')],page:2,total_pages:9,total_results:180};});
 const r=await call({q:'X',type:'screen',page:2},'search');assert.equal(r.results?.[0]?.title,'X');assert.equal(r.totalPages,9);assert.equal(calls[0][1].page,'2');
 await call({browse:1,type:'person'},'search');assert(calls.some(([path])=>path==='/person/popular'));
});


test('a well-established exact person is usable when sparse same-name entries exist',async t=>{
 const calls=[];const call=await catalog(t,async(path,p)=>{calls.push(path);
  if(path==='/search/person')return{results:[{id:6279344,name:'Christopher Nolan',known_for_department:'Directing',known_for:[]},{id:525,name:'Christopher Nolan',known_for_department:'Directing',known_for:[{...film(1,'Inception'),vote_count:37000}]}]};
  if(path==='/person/525/combined_credits')return{crew:[{...film(1,'Inception',[878]),job:'Director'}]};return{results:[],crew:[]};
 });
 const r=await call({q:'movies directed by Christopher Nolan'});assert.deepEqual(r.candidates?.map(m=>m.title),['Inception']);assert(r.filters.includes('Directed by Christopher Nolan'));assert(!calls.includes('/person/6279344/combined_credits'));
});
test('genuinely ambiguous established names still require a choice',async t=>{
 for(const votes of [0,500]){const call=await catalog(t,async(path,p)=>({results:path==='/search/person'?[{id:1,name:'Alex Smith',known_for:[{...film(10,'First film'),vote_count:votes}]},{id:2,name:'Alex Smith',known_for:[{...film(11,'Second film'),vote_count:votes}]}]:[]}));const r=await call({q:'movies starring Alex Smith'});assert.deepEqual(r.candidates,[]);assert.match(r.message,/more than one|multiple|ambiguous/i);}
});
