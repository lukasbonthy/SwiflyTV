'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
afterEach(cleanup);
const film={id:'42',type:'movie',title:'A quiet evening',poster:'/film.jpg',year:'2026',currentTime:600,duration:600,completed:true};
const episode={...film,id:'101',type:'tv',title:'A good series',season:2,episode:8};
function start(){
 const b=browser('<div id="continueGrid"></div>'),w=b.window;w.AbortController=global.AbortController;
 w.localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'},{id:'second',name:'Second'}]));w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));
 w.eval(source('library-state.js'));w.eval(source('continue.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {...b,w,api:w.SwiflyLibrary};
}
async function upstream(t,handler){
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve);}));
 return 'http://127.0.0.1:'+server.address().port;
}
async function until(predicate){for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert(predicate(),'Expected asynchronous library update');}
test('normal player completion creates durable watched history after Continue Watching removes the movie',()=>{
 const {w,api}=start();w.SwiflyContinue.saveProgress(film);assert.equal(w.SwiflyContinue.read().length,0);assert.equal(api.isWatched(film),true);assert.equal(api.list('history')[0].completed,true);
 const stored=JSON.parse(w.localStorage.getItem('swiflytv.library.main'));assert.equal(stored.watched[0].id,'42');assert.equal(stored.history[0].duration,600);
});
test('a completed episode advances Continue Watching only to the real next episode returned by the server',async t=>{
 let path='';const base=await upstream(t,(req,res)=>{path=req.url;res.setHeader('content-type','application/json');res.end(JSON.stringify({next:{season:2,episode:9,title:'Next story',airDate:'2026-10-20'}}));});
 const {w,api}=start();w.fetch=(url,options)=>fetch(base+url,options);w.SwiflyContinue.saveProgress(episode);
 await until(()=>w.SwiflyContinue.read().length===1);
 const next=w.SwiflyContinue.read()[0];assert.equal(next.season,2);assert.equal(next.episode,9);assert.equal(next.currentTime,0);assert.equal(next.resumable,false);assert.equal(api.isWatched(episode),true);
 assert.equal(path,'/api/library/next/tv/101?s=2&e=8');w.SwiflyContinue.render();assert.match(w.document.querySelector('.svResumeMeta').textContent,/Up next/);assert(!new URL(w.document.querySelector('.svResumeLink').href).searchParams.has('resume'));
});
test('an unknown or invalid next episode never fabricates a new Continue Watching entry',async t=>{
 const base=await upstream(t,(_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({next:{season:-1,episode:9}}));});
 const {w,api}=start();let settled=false;w.fetch=async(url,options)=>{const response=await fetch(base+url,options);settled=true;return response;};w.SwiflyContinue.saveProgress(episode);await until(()=>settled);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.SwiflyContinue.read().length,0);assert.equal(api.isWatched(episode),true);
});
test('an episode response cannot overwrite newer playback progress or a different profile',async t=>{
 let reply;const base=await upstream(t,(_req,res)=>{reply=()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({next:{season:2,episode:9}}));};});
 const {w}=start();w.fetch=(url,options)=>fetch(base+url,options);w.SwiflyContinue.saveProgress(episode);await until(()=>reply);
 w.SwiflyContinue.saveProgress({...episode,episode:10,currentTime:40,completed:false});reply();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(w.SwiflyContinue.find('tv','101').episode,10);
});
test('Continue Watching shows a time badge and dims progress older than two weeks',()=>{
 const {w}=start();const old=new Date(Date.now()-15*86400000).toISOString();w.localStorage.setItem('movieverse.continue',JSON.stringify([{...film,completed:false,currentTime:83,watchedAt:old,profileId:'main'}]));w.SwiflyContinue.render();
 const card=w.document.querySelector('.svResumeCard');assert.equal(card.dataset.continueStale,'true');assert.match(card.querySelector('.svResumeAge').textContent,/15d ago/);
 w.SwiflyContinue.saveProgress({...film,completed:false,currentTime:84});w.SwiflyContinue.render();assert.equal(w.document.querySelector('.svResumeCard').dataset.continueStale,'false');assert.match(w.document.querySelector('.svResumeAge').textContent,/Just now/);
});
