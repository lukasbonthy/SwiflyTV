'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {createAccountStore}=require('../lib/account-store');
const {createConnect}=require('../lib/connect');
const {createTrakt}=require('../lib/trakt');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
const {settingsMarkup}=require('../ui/settings');
afterEach(cleanup);
const movie=id=>({id:String(id),type:'movie',key:'movie:'+id,titleKey:'movie:'+id,title:'Movie '+id,poster:'',backdrop:'',year:'',rating:''});
const library=(watchlist=[movie(1)])=>({version:1,watchlist,liked:[],watched:[],history:[],folders:[],episodeRead:[],preferences:{spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:'grid',episodeSort:'oldest'}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
async function until(predicate,message='condition was not reached'){const end=Date.now()+3000;while(!await predicate()){if(Date.now()>end)assert.fail(message);await new Promise(done=>setTimeout(done,10));}}
async function fixture(t,initial=library()){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'swifly-trakt-browser-')),store=createAccountStore({directory}),connect=createConnect({store});
 const handlers=new Map(),providerCalls=[],requests=[];
 const trakt=createTrakt({store,authenticate:connect.identity,env:{TRAKT_CLIENT_ID:'fixture',TRAKT_CLIENT_SECRET:'fixture-secret',TRAKT_REDIRECT_URI:'https://swifly.example/api/trakt/callback'},fetch:async(url,options)=>{
  const pathname=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;providerCalls.push({pathname,body});
  if(handlers.has(pathname))return handlers.get(pathname)(options);
  return Response.json(options.method==='GET'?[]:{added:{movies:1,episodes:1},not_found:{movies:[],shows:[],episodes:[]}});
 }});
 const app=express();app.use(express.json());app.use('/api/connect',connect.router);app.use('/api/trakt',trakt.router);
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));}),base='http://127.0.0.1:'+server.address().port;
 async function signup(handle){const response=await fetch(base+'/api/connect/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:handle,handle,email:handle+'@example.com',password:'correct-horse-123'})});assert.equal(response.status,201);const data=await response.json();await store.transaction(s=>{const user=s.users[data.user.id];user.state={'swiflytv.profiles':[{id:'main',name:'Main'}],'swiflytv.library.main':structuredClone(initial)};user.trakt={accessToken:'server-private-access',refreshToken:'server-private-refresh',expiresAt:Date.now()+86400000,generation:handle};});return {...data,cookie:response.headers.get('set-cookie').split(';')[0]};}
 const alice=await signup('alice');let signedIn=alice;
 async function open(storage={},page=true){
  const b=browser(page?settingsMarkup():'',{path:page?'/settings':'/watch/tv/101'}),w=b.window;w.structuredClone=structuredClone;w.AbortController=AbortController;
  for(const [key,value]of Object.entries(storage))w.localStorage.setItem(key,value);
  w.fetch=async(url,options={})=>{requests.push({url,...options,body:options.body?JSON.parse(options.body):null});return fetch(base+url,{...options,headers:{...options.headers,Cookie:signedIn.cookie}});};
  for(const name of ['account.js','library-state.js','settings.js'])w.eval(source(name));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await w.SwiflyAccount.ready;await w.SwiflyLibrary.ready;await w.SwiflySettings.refresh();return {...b,w};
 }
 t.after(async()=>{await trakt.close?.();await connect.close();server.closeAllConnections?.();await new Promise(done=>server.close(done));await store.close();await fs.rm(directory,{recursive:true,force:true});});
 return {store,alice,signup,open,handlers,providerCalls,requests,setUser(value){signedIn=value;},async state(user=alice){return (await store.read()).users[user.user.id].state['swiflytv.library.main'];}};
}
const saved=w=>Object.fromEntries(Object.keys(w.localStorage).map(key=>[key,w.localStorage.getItem(key)]));
const ids=rows=>Array.from(rows,item=>item.id).sort();

test('an explicit import retains an unsent local addition in the browser and the next account upload',async t=>{
 const f=await fixture(t),b=await f.open(),started=deferred(),release=deferred();
 f.handlers.set('/sync/watchlist',async()=>{started.resolve();await release.promise;return Response.json([{movie:{title:'Existing',ids:{tmdb:1}}},{movie:{title:'Imported',ids:{tmdb:3}}}]);});
 b.w.document.querySelector('[data-trakt-sync]').click();await started.promise;b.w.SwiflyLibrary.setWatchlist(movie(2));release.resolve();
 await until(()=>/Imported 2 watchlist/.test(b.w.document.querySelector('[data-trakt-message]').textContent));
 assert.deepEqual(ids(b.w.SwiflyLibrary.read().watchlist),['1','2','3']);await b.w.SwiflyAccount.sync();assert.deepEqual(ids((await f.state()).watchlist),['1','2','3']);
 assert.deepEqual(ids(JSON.parse(b.w.localStorage.getItem('movieverse.watchlist'))),['1','2','3']);
});

test('import rebase preserves removals, local watched dates, folders and preferences alongside new imported records',async t=>{
 const initial=library();initial.watched=[{...movie(4),watchedAt:'2026-01-01T00:00:00.000Z'}];initial.folders=[{id:'keep',name:'Keep',members:['movie:1'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
 const f=await fixture(t,initial),b=await f.open(),started=deferred(),release=deferred();
 f.handlers.set('/sync/watchlist',async()=>{started.resolve();await release.promise;return Response.json([{movie:{title:'Removed locally',ids:{tmdb:1}}},{movie:{title:'Imported',ids:{tmdb:3}}}]);});
 f.handlers.set('/sync/watched/movies',()=>Response.json([{movie:{title:'Older provider date',ids:{tmdb:4}},last_watched_at:'2026-02-01T00:00:00.000Z'},{movie:{title:'New watched',ids:{tmdb:5}},last_watched_at:'2026-03-01T00:00:00.000Z'}]));
 b.w.document.querySelector('[data-trakt-sync]').click();await started.promise;const api=b.w.SwiflyLibrary;
 api.setWatchlist(movie(1),false);api.setWatchlist(movie(2));api.markWatched(movie(4),{watchedAt:'2026-10-25T01:00:00.000Z'});api.renameFolder('keep','Renamed');api.setFolderMember('keep',movie(1),false);api.setFolderMember('keep',movie(2));api.savePreferences({spoilerMode:true});release.resolve();
 await until(()=>/Imported 2 watchlist/.test(b.w.document.querySelector('[data-trakt-message]').textContent));await b.w.SwiflyAccount.sync();
 for(const state of [api.read(),await f.state()]){assert.deepEqual(ids(state.watchlist),['2','3']);assert.deepEqual(ids(state.watched),['4','5']);assert.equal(state.watched.find(item=>item.id==='4').watchedAt,'2026-10-25T01:00:00.000Z');assert.equal(state.folders[0].name,'Renamed');assert.deepEqual(Array.from(state.folders[0].members),['movie:2']);assert.equal(state.preferences.spoilerMode,true);}
});

test('a conflicting account patch rebases the latest local library operations on imported server records',async t=>{
 const f=await fixture(t);await f.store.transaction(s=>{s.users[f.alice.user.id].state['swiflytv.resume.main']={volume:0.5};});const b=await f.open();await b.w.SwiflyAccount.sync();const original=b.w.fetch,started=deferred(),release=deferred();let held=false;
 b.w.fetch=async(url,options)=>{if(url==='/api/connect/state'&&options.method==='PATCH'&&!held){held=true;started.resolve();await release.promise;}return original(url,options);};
 b.w.SwiflyLibrary.setWatchlist(movie(2));const pushing=b.w.SwiflyAccount.sync().catch(error=>error);await started.promise;b.w.SwiflyLibrary.setWatchlist(movie(4));
 await f.store.transaction(s=>{const user=s.users[f.alice.user.id];user.state['swiflytv.library.main'].watchlist.push(movie(3));user.state['swiflytv.resume.main']={volume:0.8};user.revision++;});release.resolve();assert.equal((await pushing).status,409);
 assert.deepEqual(ids(b.w.SwiflyLibrary.read().watchlist),['1','2','3','4']);assert.equal(JSON.parse(b.w.localStorage.getItem('swiflytv.resume.main')).volume,0.8);await b.w.SwiflyAccount.sync();assert.deepEqual(ids((await f.state()).watchlist),['1','2','3','4']);
});

test('navigation before account upload preserves the removal baseline when importing a newer server record',async t=>{
 const f=await fixture(t),first=await f.open({},false);await first.w.SwiflyAccount.sync();first.w.SwiflyLibrary.setWatchlist(movie(1),false);first.w.SwiflyLibrary.setWatchlist(movie(2));first.w.document.dispatchEvent(new first.w.Event('swifly:account-suspended'));const cache=saved(first.w);first.finish();
 await f.store.transaction(s=>{const user=s.users[f.alice.user.id];user.state['swiflytv.library.main'].watchlist.push(movie(3));user.revision++;});
 const next=await f.open(cache,false);assert.deepEqual(ids(next.w.SwiflyLibrary.read().watchlist),['2','3']);await next.w.SwiflyAccount.sync();assert.deepEqual(ids((await f.state()).watchlist),['2','3']);
});

test('reconciling a local update to a remotely removed record keeps its complete media and folder identity',async t=>{
 const f=await fixture(t),b=await f.open({},false),before=library();before.watched=[{...movie(4),watchedAt:'2026-01-01T00:00:00.000Z'}];before.folders=[{id:'keep',name:'Keep',members:['movie:1'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
 const local=structuredClone(before);local.watched[0].watchedAt='2026-10-25T01:00:00.000Z';local.folders[0].name='Renamed';const remote=library();
 const result=b.w.SwiflyLibrary.reconcile(before,local,remote);assert.deepEqual(ids(result.watched),['4']);assert.equal(result.watched[0].watchedAt,'2026-10-25T01:00:00.000Z');assert.equal(result.folders[0].id,'keep');assert.equal(result.folders[0].name,'Renamed');assert.deepEqual(Array.from(result.folders[0].members),['movie:1']);
});

test('completion followed immediately by pagehide replays one durable watched event on the verified next page',async t=>{
 const f=await fixture(t),first=await f.open({},false);first.w.eval(source('continue.js'));first.w.document.dispatchEvent(new first.w.Event('DOMContentLoaded'));assert.equal(first.w.SwiflyContinue.saveProgress({type:'tv',id:'101',season:2,episode:8,currentTime:600,duration:600,completed:true}),true);first.w.dispatchEvent(new first.w.Event('pagehide'));const cache=saved(first.w);first.finish();
 const next=await f.open(cache,false);await until(()=>f.providerCalls.some(call=>call.pathname==='/sync/history'),'the verified next page did not replay its watched outbox');await until(()=>!Object.keys(next.w.localStorage).some(key=>key.startsWith('swiflytv.traktOutbox.')),'the acknowledged event remained queued');
 assert.equal(f.providerCalls.filter(call=>call.pathname==='/sync/history').length,1);assert.equal(f.requests.filter(call=>call.url==='/api/trakt/changes').length,1);
 await next.w.SwiflySettings.flush();assert.equal(f.providerCalls.filter(call=>call.pathname==='/sync/history').length,1);
});

test('a lost changes acknowledgement retries the same event ID without repeating its provider history write',async t=>{
 const f=await fixture(t),b=await f.open({},false),original=b.w.fetch;let lost=true;
 b.w.fetch=async(url,options)=>{const response=await original(url,options);if(url==='/api/trakt/changes'&&lost){lost=false;await response.json();throw new TypeError('connection lost after server commit');}return response;};
 b.w.SwiflyLibrary.markWatched(movie(42),{watchedAt:'2026-10-25T01:00:00.000Z'});await b.w.SwiflySettings.flush();await b.w.SwiflySettings.flush();
 const pushes=f.requests.filter(call=>call.url==='/api/trakt/changes');assert.equal(pushes.length,2);assert.equal(pushes[0].body.changes[0].eventId,pushes[1].body.changes[0].eventId);assert.equal(f.providerCalls.filter(call=>call.pathname==='/sync/history').length,1);
});

test('suspended owner outboxes cannot leak into another account and remain replayable for the original owner',async t=>{
 const f=await fixture(t),first=await f.open({},false);first.w.SwiflyLibrary.setWatchlist(movie(42));first.w.dispatchEvent(new first.w.Event('pagehide'));const cache=saved(first.w);first.finish();
 const bob=await f.signup('bob');f.setUser(bob);const second=await f.open(cache,false);await second.w.SwiflySettings.flush();assert.equal(f.requests.filter(call=>call.url==='/api/trakt/changes').length,0);const bobCache=saved(second.w);second.finish();
 f.setUser(f.alice);const again=await f.open(bobCache,false);await again.w.SwiflySettings.flush();const pushes=f.requests.filter(call=>call.url==='/api/trakt/changes');assert.equal(pushes.length,1);assert.equal(pushes[0].headers['X-Swifly-Account'],f.alice.user.id);assert.equal(pushes[0].body.changes[0].item.id,'42');
});
