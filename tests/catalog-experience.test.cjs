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
test('movie period links offer a full 44px target without relying on poster action sizing',()=>{
 const fs=require('node:fs'),path=require('node:path'),{browser,cleanup}=require('./ui-helpers.cjs'),{periodControls}=require('../ui/catalog-experience');
 const css=fs.readFileSync(path.join(__dirname,'../public/clean/catalog-experience.css'),'utf8'),b=browser('<style>'+css+'</style><main class="svCatalogPage">'+periodControls()+'</main>');
 try{for(const link of b.window.document.querySelectorAll('[data-movie-periods] a'))assert(Number.parseFloat(b.window.getComputedStyle(link).minHeight)>=44,link.textContent+' must have a 44px target');}finally{b.finish();cleanup();}
});
test('language form and its next-page link preserve native navigation and advance the filtered upstream catalog',async()=>{
 const {loadServer,browser,cleanup}=require('./ui-helpers.cjs'),api=loadServer(),calls=[];
 api.setTmdb(async(endpoint,params={})=>{calls.push({endpoint,params});if(endpoint.startsWith('/genre/'))return{genres:[{id:18,name:'Drama'}]};return{page:params.page,total_pages:4,total_results:80,results:[{id:Number(params.page)*100,title:'A film',name:'A series',media_type:'tv',poster_path:'/poster.jpg'}]};});
 const render=api.app._router.stack.find(layer=>layer.route?.path==='/browse-by-languages').route.stack[0].handle;
 async function page(query){let html;await render({query},{send:value=>{html=value;}});const b=browser(html,{path:'/browse-by-languages?'+new URLSearchParams(query)});b.window.boot('catalog-experience.js');return b;}
 try{
  const first=await page({media:'tv',language:'ko',genre:'18',sort:'title'}),d=first.window.document,form=d.querySelector('.svLanguageFilters');
  assert.equal(form.method,'get');assert.deepEqual(Object.fromEntries(new first.window.FormData(form)),{media:'tv',language:'ko',genre:'18',sort:'title'});
  const submit=new first.window.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(submit);assert.equal(submit.defaultPrevented,false,'The language enhancement must leave native GET submission intact');
  const link=d.querySelector('.svLanguageResults a[rel=next]'),url=new URL(link.href);
  assert.equal(url.pathname,'/browse-by-languages');assert.deepEqual(Object.fromEntries(url.searchParams),{media:'tv',language:'ko',genre:'18',sort:'title',page:'2'});
  const click=new first.window.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(click);assert.equal(click.defaultPrevented,false,'The language enhancement must leave its native next-page link intact');
  const second=await page(Object.fromEntries(url.searchParams)),request=calls.filter(call=>call.endpoint==='/discover/tv').at(-1);
  assert.deepEqual(request.params,{page:2,sort_by:'original_name.asc',include_adult:'false',with_original_language:'ko',with_genres:'18'});
  assert.equal(new URL(second.window.document.querySelector('.svLanguageResults .dsCardTitle').href).pathname,'/tv/200');assert.match(second.window.document.querySelector('.pagination').textContent,/Page 2 of 4/);
 }finally{api.io.close();cleanup();}
});
