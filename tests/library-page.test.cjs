'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
afterEach(cleanup);
const film={id:'42',type:'movie',title:'A quiet evening',poster:'/film.jpg',year:'2026',rating:8};
const show={id:'101',type:'tv',title:'A good series',poster:'/series.jpg',year:'2025',rating:7};
function start(){
 const b=browser('<main data-library-page></main>',{path:'/my-list'}),w=b.window;
 w.localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'}]));
 w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));
 w.eval(source('library-state.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.eval(source('continue.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.SwiflyLibrary.setWatchlist(film,true);w.SwiflyLibrary.setWatchlist(show,true);
 w.eval(source('library-page.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {...b,w,api:w.SwiflyLibrary,d:w.document};
}
const change=(w,selector,value)=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));return node;};
test('List tabs filter actual saved, completed and progress records by format',()=>{
 const {w,d,api}=start();assert(d.querySelector('[data-library-tab="watchlist"]'),'The library page must initialize');
 assert.equal(d.querySelectorAll('[data-library-card]').length,2);
 change(w,'[data-library-type]','tv');assert.equal(d.querySelectorAll('[data-library-card]').length,1);assert.match(d.querySelector('[data-library-grid]').textContent,/good series/);
 api.markWatched(film);d.querySelector('[data-library-tab="completed"]').click();assert.equal(d.querySelectorAll('[data-library-card]').length,0);assert.equal(d.querySelector('[data-library-empty]').hidden,false);
 change(w,'[data-library-type]','movie');assert.equal(d.querySelectorAll('[data-library-card]').length,1);
 w.SwiflyContinue.saveProgress({...show,season:2,episode:8,currentTime:83,duration:600});
 d.querySelector('[data-library-tab="continue"]').click();change(w,'[data-library-type]','all');
 const play=d.querySelector('[data-library-resume-key]');assert(play);assert.match(play.textContent,/Resume/);assert.match(play.getAttribute('href'),/s=2&e=8&resume=1/);assert(d.querySelector('progress'));
});
test('folder creation, title membership, renaming and deletion work through the rendered controls',()=>{
 const {w,d,api}=start();const create=d.querySelector('[data-library-folder-open]');assert(create,'Folder controls must be available');create.click();
 const form=d.querySelector('[data-library-folder-form]');form.elements.folderName.value='Friday';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 const folder=api.read().folders[0];assert(folder);change(w,'[data-library-folder]','');
 const member=d.querySelector('[data-library-card][data-library-id="42"] [data-library-member]');assert(member);member.checked=true;member.dispatchEvent(new w.Event('change',{bubbles:true}));
 change(w,'[data-library-folder]',folder.id);assert.equal(d.querySelectorAll('[data-library-card]').length,1);
 d.querySelector('[data-library-folder-rename]').click();form.elements.folderName.value='Weekend';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));assert.equal(api.read().folders[0].name,'Weekend');
 d.querySelector('[data-library-folder-delete]').click();assert.equal(api.read().folders.length,0);assert.equal(api.read().watchlist.length,2);assert.equal(d.querySelectorAll('[data-library-card]').length,2);
});
test('History retains completed episodes and can restore a previous episode progress for exact resume',()=>{
 const {w,d,api}=start();w.SwiflyContinue.saveProgress({...show,season:2,episode:8,currentTime:83,duration:600});w.SwiflyContinue.saveProgress({...show,season:2,episode:9,currentTime:20,duration:600});api.markWatched(film);
 const tab=d.querySelector('[data-library-tab="history"]');assert(tab,'History must be a real tab');tab.click();assert.equal(d.querySelectorAll('[data-library-card]').length,3);
 const old=d.querySelector('[data-library-card][data-library-episode="8"] [data-library-resume-key]');assert(old);old.addEventListener('click',event=>event.preventDefault());old.click();
 assert.equal(w.SwiflyContinue.find('tv','101').episode,8);assert.equal(w.SwiflyContinue.find('tv','101').currentTime,83);
 assert.equal(api.list('completed').length,1);
});
test('List text and folder labels remain text when stored titles contain markup',()=>{
 const {d,api}=start();api.setWatchlist({...film,id:'99',title:'<img src=x onerror=bad>'},true);api.createFolder('<svg onload=bad>');
 assert.equal(d.querySelectorAll('[data-library-grid] img[src="x"]').length,0);assert.equal(d.querySelectorAll('[data-library-folder] svg').length,0);assert.match(d.querySelector('[data-library-grid]').textContent,/<img src=x/);
});
test('History includes pre-existing real playback progress without marking those entries completed',()=>{
 const {w,d,api}=start();w.localStorage.setItem('movieverse.continue',JSON.stringify([{...show,profileId:'main',season:2,episode:8,currentTime:83,duration:600,watchedAt:'2026-10-24T10:00:00.000Z'}]));w.SwiflyContinue.render();
 d.querySelector('[data-library-tab="history"]').click();assert.equal(d.querySelectorAll('[data-library-card]').length,1);assert(d.querySelector('[data-library-resume-key]'));assert.equal(api.list('completed').length,0);
});
