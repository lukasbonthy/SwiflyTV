'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
const {kidsMarkup}=require('../ui/kids');
test.afterEach(cleanup);
test('A Kids tab reconciles parent controls after another tab configures and unlocks the browser',async()=>{
 const b=browser(kidsMarkup({catalog:{items:[]},status:{configured:false,locked:false,available:true,recoveryRequired:false}}),{path:'/kids'}),w=b.window,d=w.document,calls=[];
 w.SwiflyKids={publish(){}};w.fetch=async(url)=>{calls.push(url);return {ok:false,json:async()=>({message:'Test response'})};};w.eval(source('kids/kids.js'));
 const notify=value=>d.dispatchEvent(new w.CustomEvent('swifly:kids-status',{detail:value}));
 notify({configured:true,locked:true,available:true,recoveryRequired:false});
 assert.equal(d.querySelector('[data-kids-root]').dataset.kidsLocked,'true');
 assert.equal(d.querySelector('[data-kids-confirm-wrap]').hidden,true);
 assert.match(d.querySelector('[data-kids-parent-submit]').textContent,/unlock/i);
 d.querySelector('[data-kids-password]').value='a parent password';d.querySelector('form[data-kids-parent-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(calls.at(-1),'/api/kids/unlock','a stale setup form must become the actual unlock action');
 notify({configured:true,locked:false,available:true,recoveryRequired:false});
 assert.match(d.querySelector('[data-kids-parent-submit]').textContent,/lock/i);
 assert.equal(d.querySelector('[data-kids-password-fields]').hidden,true);
});
test('Kids revalidates a restored player before permitting resume and pauses an unverified document',async()=>{
 for(const verified of [false,true]){
  const b=browser('<main data-player-root data-player-kids-verified="'+verified+'"><video></video></main>',{path:'/watch/movie/1'}),w=b.window;let paused=0,finish;
  w.HTMLMediaElement.prototype.pause=function(){paused++;};w.fetch=()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({locked:true,configured:true,available:true,recoveryRequired:false})}));
  w.eval(source('kids/guard.js'));
  assert.equal(typeof w.SwiflyKids.revalidatePlayer,'function');
  const gate=w.SwiflyKids.revalidatePlayer();finish();assert.equal(await gate,verified);
  if(!verified)assert(paused>0,'unverified buffered playback must stop before redirect');
  b.finish();
 }
});
test('A failed parental status check cannot authorize cached playback',async()=>{
 const b=browser('<main data-player-root data-player-kids-verified="true"></main>',{path:'/watch/movie/1'}),w=b.window;w.fetch=async()=>{throw Error('offline');};w.eval(source('kids/guard.js'));
 assert.equal(typeof w.SwiflyKids.revalidatePlayer,'function');assert.equal(await w.SwiflyKids.revalidatePlayer(),false);
});
test('A fresh player gate cannot reuse an unlocked response from an older visibility session',async()=>{
 const b=browser('<main data-player-root data-player-kids-verified="false"><video></video></main>',{path:'/watch/movie/1'}),w=b.window,pending=[];w.HTMLMediaElement.prototype.pause=function(){};
 w.fetch=()=>new Promise(resolve=>pending.push(value=>resolve({ok:true,json:async()=>value})));w.eval(source('kids/guard.js'));
 const first=w.SwiflyKids.revalidatePlayer(),second=w.SwiflyKids.revalidatePlayer();
 pending[1]({locked:false,configured:true,available:true});assert.equal(await first,false,'an old unlocked response is not permission for a later gate');
 pending[2]({locked:true,configured:true,available:true});assert.equal(await second,false);
});
