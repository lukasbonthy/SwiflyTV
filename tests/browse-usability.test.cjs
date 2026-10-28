'use strict';
const {test,after,before}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {loadServer,browser:domBrowser,source}=require('./ui-helpers.cjs');
let api,origin,calls=[];
before(async()=>{api=loadServer();api.setTmdb(async(endpoint,params)=>{calls.push({endpoint,params});if(endpoint.startsWith('/genre/'))return{genres:[{id:18,name:'Drama'},{id:10765,name:'Sci-Fi'}]};return{page:2,total_pages:4,results:[{id:101,title:'Catalog movie',name:'Catalog series',media_type:endpoint.includes('/tv')?'tv':'movie',poster_path:'/poster.jpg',overview:'A real test catalog entry',first_air_date:'2025-01-01',release_date:'2025-01-01',vote_average:8},{id:102,name:'Adult excluded',adult:true}]};});await new Promise(done=>api.httpServer.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+api.httpServer.address().port;});
after(async()=>{if(api)await new Promise(done=>api.io.close(done));});
async function page(url){const response=await fetch(origin+url);assert.equal(response.status,200);return new JSDOM(await response.text(),{url:origin+url}).window.document;}

test('language browse submits real typed original-language genre and sort filters and retains them through pagination',async()=>{
 calls=[];const d=await page('/browse-by-languages?media=tv&language=ko&genre=10765&sort=title&page=2'),request=calls.find(v=>v.endpoint==='/discover/tv');assert(request,'the language selectors must actually filter the catalog');assert.equal(request.params.with_original_language,'ko');assert.equal(request.params.with_genres,'10765');assert.equal(request.params.sort_by,'original_name.asc');assert.equal(request.params.page,2);assert.equal(d.querySelector('form[aria-label="Browse filters"]').method,'get');assert.equal(d.querySelector('select[name="language"]').value,'ko');assert(!d.querySelector('.dsContent').textContent.includes('Adult excluded'));const next=[...d.querySelectorAll('.pagination a')].find(v=>v.textContent.includes('Next'));assert(next);for(const[k,v]of Object.entries({media:'tv',language:'ko',genre:'10765',sort:'title',page:'3'}))assert.equal(new URL(next.href).searchParams.get(k),v);
});

test('account route provides real import export and recovery controls with an accessible review dialog',async()=>{
 const d=await page('/account');assert(d.querySelector('[data-backup-open]'));assert(d.querySelector('[data-backup-export]'));assert(d.querySelector('[data-backup-recover]'));assert.equal(d.querySelector('[data-backup-dialog]').tagName,'DIALOG');assert(d.querySelector('script[src^="/assets/clean/account-backup.js"]'));assert(d.querySelector('script[src^="/assets/clean/account-data.js"]'));assert(d.querySelector('[data-backup-dialog]').getAttribute('aria-labelledby'));
});

test('Favorites uses the profile library workspace rather than an unsynced inline clear and reload',async()=>{const d=await page('/liked');assert.equal(d.querySelector('[data-library-page]').dataset.libraryDefaultTab,'liked');assert(![...d.scripts].some(s=>s.textContent.includes("localStorage.setItem('movieverse.liked', '[]')")));});

test('embedded watchroom serves syntactically valid JavaScript and meaningful input labels',async()=>{
 const d=await page('/watchrooms/embed/usability-review');for(const[index,script]of[...d.scripts].entries())if(!script.src&&(!script.type||['text/javascript','application/javascript'].includes(script.type)))assert.doesNotThrow(()=>new vm.Script(script.textContent,{filename:'inline-'+index}),script.textContent.slice(-180));
 for(const selector of ['#stableOpenInput','#roomMovieInput','#stableChatForm input[name="message"]']){const input=d.querySelector(selector);if(input)assert(input.getAttribute('aria-label')||input.labels?.length,selector+' needs an accessible name');}
});

test('utility HLS player has a real URL form instead of requiring manual query-string editing',async()=>{const d=await page('/m3u8-player'),form=d.querySelector('form[action="/m3u8-player"]');assert(form);assert.equal(form.method,'get');assert.equal(form.querySelector('[name="url"]').type,'url');assert(form.querySelector('[type="submit"]'));});

test('clearing saved titles rolls the compatibility mirror back when durable profile storage fails',()=>{
 const b=domBrowser(api.pageShell({body:'<main></main>'})),w=b.window,d=w.document;try{w.eval(source('library-state.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));w.SwiflyLibrary.setWatchlist({id:'42',type:'movie',title:'Keep me'});const key=w.SwiflyLibrary.storageKey(),prior=w.localStorage.getItem('movieverse.watchlist'),set=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(k,v){if(k===key)throw Error('QuotaExceededError');return set.call(this,k,v);};w.confirm=()=>true;const script=[...d.scripts].find(s=>s.textContent.includes('function saveLibrary('));w.eval(script.textContent);d.querySelector('#clearWatchlist').click();assert.equal(w.localStorage.getItem('movieverse.watchlist'),prior);assert.equal(w.SwiflyLibrary.read().watchlist[0].id,'42');}finally{b.finish();}
});
