'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseRecommendationQuery:parse,matchesConstraints}=require('../lib/recommendation-query');
test('similar-title clauses retain extra preferences and protect punctuation in the title',()=>{
 for(const [prompt,title,preference]of [
  ['Something like Interstellar but with more mystery','Interstellar','mystery'],
  ['Movies similar to The Martian but set underwater','The Martian','underwater'],
  ['A series like Severance but funnier','Severance','funnier'],
  ['something like I, Robot but more emotional','I, Robot','emotional']
 ]){const q=parse(prompt);assert.equal(q.title,title);assert(q.similar);assert.match(q.semanticQuery,new RegExp(preference));}
});
test('negative genres do not swallow a new positive request after and a',()=>{
 const q=parse('no horror and a funny mystery');assert.deepEqual(q.unwanted.map(g=>g[0]),['horror']);assert.deepEqual(q.wanted.map(g=>g[0]),['comedy','mystery']);
 const exclusions=parse('a space movie without horror and romance');assert.deepEqual(exclusions.unwanted.map(g=>g[0]),['horror','romance']);
});
test('language, bounded runtime and before/after dates become actual constraints',()=>{
 const q=parse('Korean thrillers after 2015 under two hours');assert.equal(q.language,'ko');assert.equal(q.runtimeMax,120);assert.equal(q.start,2016);assert.equal(q.end,new Date().getFullYear());
 const good={type:'movie',genres:[53],year:'2019',language:'ko',runtime:115};assert(matchesConstraints(good,q));
 for(const wrong of [{language:'en'},{runtime:150},{year:'2014'}])assert(!matchesConstraints({...good,...wrong},q));
 const older=parse('comedies before 2000 under 100 minutes');assert.equal(older.end,1999);assert.equal(older.runtimeMax,100);
});
test('story setting dates are not confused with movie release dates',()=>{
 const q=parse('a funny detective movie set in the 1970s');assert.equal(q.start,null);assert.match(q.semanticQuery,/1970s/);
});
test('watching with children requires the family genre without making every family drama a kids movie',()=>{
 assert(parse('a gentle adventure to watch with my children').wanted.some(g=>g[0]==='family'));
 assert(!parse('a drama about a complicated family').wanted.some(g=>g[0]==='family'));
});
test('filter-only requests are catalog browsing rather than an inverted negative mood',()=>{
 for(const prompt of ['no horror','Korean movies under two hours','movies after 2015'])assert.equal(parse(prompt).broad,true,prompt);
 assert.equal(parse('a mystery about a missing child').broad,false);
});
test('a no-longer-than duration is a time limit rather than a negated story clause',()=>{
 const q=parse('a comedy no longer than two hours');assert.equal(q.runtimeMax,120);assert.equal(q.broad,true);
});
test('reference titles stop before runtime, language and descriptive preference suffixes',()=>{
 const short=parse('like Inception under two hours');assert.equal(short.title,'Inception');assert.equal(short.runtimeMax,120);
 const language=parse('like Parasite in Korean');assert.equal(language.title,'Parasite');assert.equal(language.language,'ko');
 const lead=parse('like Interstellar with a female lead');assert.equal(lead.title,'Interstellar');assert.match(lead.semanticQuery,/female lead/);
 assert.equal(parse('like The Girl with the Dragon Tattoo').title,'The Girl with the Dragon Tattoo');
});
test('abbreviated setting decades remain story details rather than release dates',()=>{
 for(const decade of ['70s',"'70s",'1970s']){const q=parse('a comedy set in the '+decade);assert.equal(q.start,null,decade);assert.match(q.semanticQuery,/70/);}
});
