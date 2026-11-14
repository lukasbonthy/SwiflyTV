'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let C;try{C=require('../lib/catalog-experience');}catch{C={};}
const movie=(id,extra={})=>({id,title:'Movie '+id,media_type:'movie',...extra});
test('catalog diversity allocates shared candidates fairly without conflating movie and series IDs',()=>{
 assert.equal(typeof C.diverseRows,'function');
 const rows=C.diverseRows([{type:'movie',items:[movie(1),movie(2),movie(3),movie(4)]},{type:'movie',items:[movie(1),movie(2),movie(3),movie(4)]},{type:'tv',items:[{id:1,name:'Series one'}]}],{limit:2});
 assert.deepEqual(rows.map(row=>row.items.length),[2,2,1]);assert.equal(new Set(rows.flatMap(row=>row.items.map(item=>C.titleKey(item,row.type)))).size,5);
 assert.equal(C.diverseRows([{type:'movie',items:[movie(1),movie(2,{adult:true}),movie(0)]}],{exclude:['movie:1']})[0].items.length,0);
});
test('pagination replaces stale page parameters and preserves a language, format and encoded filters',()=>{
 assert.equal(typeof C.pageHref,'function');const url=new URL(C.pageHref('/browse-by-languages?language=es&media=tv&page=1&genre=18&name=A%26B',2),'https://swifly.test');
 assert.deepEqual(url.searchParams.getAll('page'),['2']);assert.equal(url.searchParams.get('language'),'es');assert.equal(url.searchParams.get('media'),'tv');assert.equal(url.searchParams.get('name'),'A&B');
 assert.equal(new URL(C.pageHref('/movies?page=2',NaN),'https://swifly.test').searchParams.get('page'),'1');
});
test('person credits merge acting and crew jobs for one title and apply exact format/role filters',()=>{
 assert.equal(typeof C.personCredits,'function');
 const combined={cast:[movie(1,{character:'Sam'}),movie(2),{id:1,name:'Series one',media_type:'tv'}],crew:[movie(1,{job:'Director',department:'Directing'}),movie(1,{job:'Writer',department:'Writing'}),movie(3,{adult:true,job:'Director'})]};
 const all=C.personCredits(combined,{});assert.equal(all.total,3);assert.equal(all.items.filter(row=>C.titleKey(row)==='movie:1').length,1);assert.deepEqual(all.items[0].creditRoles,['Acting','Directing','Writing']);
 const result=C.personCredits(combined,{media:'movie',role:'Directing'});assert.equal(result.items.length,1);assert.equal(result.items[0].id,1);
});
test('language finder matches native names and accents, and exposes an honest empty state',()=>{
 const {browser,cleanup}=require('./ui-helpers.cjs');const b=browser('<main class="svLanguagePage"><input data-language-search><a data-language-name="french français fr">French</a><a data-language-name="korean 한국어 ko">Korean</a><p data-language-count></p><p data-language-empty hidden>None</p></main>');
 try{b.window.boot('catalog-experience.js');const d=b.window.document,input=d.querySelector('input');input.value='FRANÇAIS';input.dispatchEvent(new b.window.Event('input'));assert.equal(d.querySelector('[data-language-name^=french]').hidden,false);assert.equal(d.querySelector('[data-language-name^=korean]').hidden,true);assert.equal(d.querySelector('[data-language-count]').textContent,'1 language found');input.value='unknown';input.dispatchEvent(new b.window.Event('input'));assert.equal(d.querySelector('[data-language-empty]').hidden,false);input.value='한국어';input.dispatchEvent(new b.window.Event('input'));assert.equal(d.querySelector('[data-language-name^=korean]').hidden,false);}finally{b.finish();cleanup();}
});
