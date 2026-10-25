'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
afterEach(cleanup);
function setup({user={id:'alice',name:'Alice'},status={configured:true,linked:true},page=true}={}){
 const {settingsMarkup}=require('../ui/settings');
 const b=browser(page?settingsMarkup():'',{path:page?'/settings':'/movies'}),w=b.window,calls=[],saved=[];
 let preferences={spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:'grid',episodeSort:'oldest'};
 w.SwiflyAccount={user,ready:Promise.resolve({user,available:true}),sync:async()=>calls.push({url:'account:sync'}),refreshState:async()=>calls.push({url:'account:refresh'})};
 w.SwiflyLibrary={ready:Promise.resolve(),profileId:()=> 'main',preferences:()=>preferences,savePreferences:patch=>{saved.push(patch);preferences={...preferences,...patch};return preferences;}};
 w.fetch=async(url,options={})=>{calls.push({url,...options,body:options.body?JSON.parse(options.body):null});const data=String(url).endsWith('/status')?status:String(url).endsWith('/sync')?{ok:true,imported:{watchlist:2,watched:3},skipped:1,truncated:false}:String(url).endsWith('/unlink')?{ok:true,revoked:true}:{ok:true};return {ok:true,status:200,json:async()=>data};};
 return {...b,w,calls,saved};
}
test('settings renders labeled profile preferences and saves actual changes through the shared library',async()=>{
 const b=setup();b.w.boot('settings.js');await tick();await tick();
 for(const name of ['spoilerMode','hideWatched','hideEpisodeBell','autoSkipIntro','rememberLastServer'])assert(b.w.document.querySelector('[data-preference="'+name+'"]'));
 const spoiler=b.w.document.querySelector('[data-preference="spoilerMode"]');spoiler.checked=true;spoiler.dispatchEvent(new b.w.Event('change',{bubbles:true}));await tick();assert.equal(b.saved[0].spoilerMode,true);assert.match(b.w.document.querySelector('[data-preference-status]').textContent,/saved/i);
 const sort=b.w.document.querySelector('[data-preference="episodeSort"]');sort.value='newest';sort.dispatchEvent(new b.w.Event('change',{bubbles:true}));assert.equal(b.saved[1].episodeSort,'newest');
});
test('Trakt requires an account, distinguishes server setup and imports explicitly with visible results',async()=>{
 const signedOut=setup({user:null});signedOut.w.boot('settings.js');await tick();await tick();assert.equal(signedOut.calls.length,0);assert.equal(signedOut.w.document.querySelector('[data-trakt-signin]').hidden,false);assert.equal(signedOut.w.document.querySelector('[data-trakt-sync]').hidden,true);
 const missing=setup({status:{configured:false,linked:false}});missing.w.boot('settings.js');await tick();await tick();assert.match(missing.w.document.querySelector('[data-trakt-status]').textContent,/not configured/i);assert.equal(missing.w.document.querySelector('[data-trakt-link]').disabled,true);
 const b=setup();b.w.boot('settings.js');await tick();await tick();assert(!b.calls.some(c=>c.url.endsWith('/sync')),'opening settings does not import or export a whole library');b.w.document.querySelector('[data-trakt-sync]').click();await tick();await tick();assert(b.calls.some(c=>c.url==='/api/trakt/sync'&&c.body.profileId==='main'));assert(b.calls.some(c=>c.url==='account:refresh'));assert.match(b.w.document.querySelector('[data-trakt-message]').textContent,/2.*watchlist.*3.*watched/i);assert.match(b.w.document.querySelector('[data-trakt-message]').textContent,/1.*unmatched/i);
});
test('automatic Trakt sync forwards structured user deltas outside Settings and ignores imported and hydrated state',async()=>{
 const b=setup({page:false});b.w.boot('settings.js');await tick();await tick();assert.equal(b.calls.filter(c=>c.url.endsWith('/changes')).length,0);
 b.w.dispatchEvent(new b.w.Event('swifly:library-change'));b.w.dispatchEvent(new b.w.CustomEvent('swifly:library-change',{detail:{source:'trakt',action:'watched',profileId:'main',item:{type:'movie',id:'2'}}}));await b.w.SwiflySettings.flush();assert.equal(b.calls.filter(c=>c.url.endsWith('/changes')).length,0);
 b.w.dispatchEvent(new b.w.CustomEvent('swifly:library-change',{detail:{source:'library',action:'watched',profileId:'main',item:{type:'tv',id:'101',season:2,episode:8},removed:false}}));await b.w.SwiflySettings.flush();const push=b.calls.find(c=>c.url.endsWith('/changes'));assert(push);assert.equal(push.body.changes[0].item.episode,8);assert.equal(push.headers['X-Swifly-Account'],'alice');assert(!JSON.stringify(Object.keys(b.w.localStorage).map(k=>b.w.localStorage.getItem(k))).includes('access_token'));
});
test('account suspension clears pending pushes and stale status cannot enable the next account',async()=>{
 const b=setup();let release;b.w.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>({configured:true,linked:true})});});b.w.boot('settings.js');await tick();b.w.document.dispatchEvent(new b.w.Event('swifly:account-suspended'));b.w.SwiflyAccount.user=null;release();await tick();await tick();assert.equal(b.w.document.querySelector('[data-trakt-signin]').hidden,false);
 b.w.dispatchEvent(new b.w.CustomEvent('swifly:library-change',{detail:{source:'library',action:'watchlist',item:{type:'movie',id:'42'}}}));await b.w.SwiflySettings.flush();assert.equal(b.calls.filter(c=>c.url.endsWith('/changes')).length,0);
});

test('an edit made while another push is running is delivered after that push finishes',async()=>{
 const b=setup();b.w.boot('settings.js');await tick();await tick();const original=b.w.fetch;let release,started;
 const seen=new Promise(resolve=>{started=resolve;});let first=true;
 b.w.fetch=async(url,options)=>{if(String(url).endsWith('/changes')&&first){first=false;started();await new Promise(resolve=>{release=resolve;});}return original(url,options);};
 const change=id=>b.w.dispatchEvent(new b.w.CustomEvent('swifly:library-change',{detail:{source:'library',action:'watchlist',profileId:'main',item:{type:'movie',id}}}));
 change('42');const sending=b.w.SwiflySettings.flush();await seen;change('43');await new Promise(resolve=>setTimeout(resolve,550));release();await sending;await new Promise(resolve=>setTimeout(resolve,1150));assert.deepEqual(b.calls.filter(c=>c.url.endsWith('/changes')).map(c=>c.body.changes[0].item.id),['42','43']);
});

test('settings does not claim a preference saved when the profile store rejects it',async()=>{
 const b=setup();b.w.SwiflyLibrary.savePreferences=()=>false;b.w.boot('settings.js');await tick();await tick();const input=b.w.document.querySelector('[data-preference="spoilerMode"]');input.checked=true;input.dispatchEvent(new b.w.Event('change',{bubbles:true}));assert.match(b.w.document.querySelector('[data-preference-status]').textContent,/could not be saved/i);assert.equal(input.checked,false);
});
