const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const {tvScript}=require('../ui/tv');
test.afterEach(cleanup);
const navigation=tvScript().replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
const fragment=id=>'<article class="svTitleDetails"><h1>Movie '+id+'</h1><div class="svDetailActions"><a id="play'+id+'" class="dsPrimaryBtn" href="/watch/movie/'+id+'?mode=movie" data-play-id="'+id+'">Play</a><button id="save'+id+'" class="dsSecondaryBtn">My List</button></div><a id="related" href="/movie/202">Another title</a></article>';
function setup({enabled=true,animated=false}={}){
 const env=browser('<main><article class="movieCard"><a id="first" class="posterWrap" href="/movie/101">Movie 101</a></article><article class="movieCard"><a id="selected" class="posterWrap" href="/movie/101">Movie 101</a></article></main>',{path:'/movies?genre=18',reduced:!animated}),w=env.window,d=w.document,animations=[];
 w.HTMLElement.prototype.getBoundingClientRect=function(){
  const top=this.matches('.svDetailChrome button')?24:this.closest('.svDetailActions')?260:520;
  const left=this.matches('.svDetailDismiss')?900:this.id.startsWith('save')?280:60;
  return {top,left,width:120,height:48,right:left+120,bottom:top+48};
 };
 // jsdom does not implement the native dialog's initial focus, which is the
 // production race: chrome receives focus before async action links exist.
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button,a[href]')?.focus();};
 if(animated)w.HTMLElement.prototype.animate=function(){let resolve,reject;const animation={finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish:()=>resolve(),cancel:()=>reject(new Error('Animation cancelled'))};animations.push(animation);return animation;};
 w.localStorage.setItem('swiflytv.tvFocusMode',String(enabled));
 w.fetch=async url=>({ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])});
 w.eval(navigation);d.dispatchEvent(new w.Event('DOMContentLoaded'));w.boot('details.js');
 const selected=d.getElementById('selected');
 const open=()=>{selected.focus();return w.SwiflyDetails.open('/movie/101',selected);};
 const key=value=>d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
 return {...env,d,selected,open,key,animations};
}
function pending(w){let respond;w.fetch=()=>new Promise(resolve=>{respond=resolve;});return html=>respond({ok:true,text:async()=>html});}
test('TV details hand native chrome focus to Play as soon as actions are ready during entrance',async()=>{
 const env=setup({animated:true}),{window:w,d}=env,respond=pending(w);env.page.scrollTop=650;
 const opening=env.open(),dialog=d.querySelector('dialog');
 assert.equal(d.activeElement,dialog.querySelector('[data-sv-dialog-back]'));assert(dialog.hasAttribute('aria-busy'));assert.equal(dialog.dataset.svDetailState,'opening');
 respond(fragment(101));await opening;const play=d.getElementById('play101');
 assert.equal(d.activeElement,play,'TV entry should select the ready Play action');
 assert(play.classList.contains('swifly-tv-focus-target'),'The TV controller must share the native focus');
 assert(!dialog.hasAttribute('aria-busy'));assert.equal(dialog.dataset.svDetailState,'opening');assert.equal(env.page.scrollTop,650);
 env.key('ArrowRight');assert.equal(d.activeElement.id,'save101');
 env.animations.forEach(animation=>animation.finish());await tick();
 assert.equal(d.activeElement.id,'save101','Finishing the entrance must not repeat default focus');env.finish();
});
test('Desktop details retain native initial focus after metadata arrives',async()=>{
 const env=setup({enabled:false}),{window:w,d}=env,respond=pending(w),opening=env.open();
 const back=d.querySelector('[data-sv-dialog-back]');assert.equal(d.activeElement,back);
 respond(fragment(101));await opening;assert.equal(d.activeElement,back);assert(!d.getElementById('play101').classList.contains('swifly-tv-focus-target'));env.finish();
});
test('Keyboard navigation during loading keeps the chosen chrome control',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open();
 env.key('ArrowRight');const dismiss=d.querySelector('[data-sv-detail-close]');assert.equal(d.activeElement,dismiss);
 respond(fragment(101));await opening;assert.equal(d.activeElement,dismiss);env.finish();
});
test('A navigation key during loading cancels default focus even when focus cannot move',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open(),back=d.querySelector('[data-sv-dialog-back]');
 env.key('ArrowUp');assert.equal(d.activeElement,back);
 respond(fragment(101));await opening;assert.equal(d.activeElement,back);env.finish();
});
test('Controller navigation during loading keeps its chosen chrome control',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open();
 const pad={id:'Fixture controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
 w.navigator.getGamepads=()=>[pad];const connected=new w.Event('gamepadconnected');connected.gamepad=pad;w.dispatchEvent(connected);
 pad.buttons[15]={pressed:true,value:1};w.flush(16);
 const dismiss=d.querySelector('[data-sv-detail-close]');assert.equal(d.activeElement,dismiss);
 respond(fragment(101));await opening;assert.equal(d.activeElement,dismiss);env.finish();
});
test('Cached replacement actions receive focus and closing returns to the exact selected poster',async()=>{
 const env=setup(),{window:w,d}=env;env.page.scrollTop=650;
 await env.open();assert.equal(d.activeElement.id,'play101');
 await w.SwiflyDetails.open('/movie/202',d.getElementById('related'));assert.equal(d.activeElement.id,'play202');
 w.SwiflyDetails.back();await tick();assert.equal(d.activeElement.id,'play101');
 const closed=new Promise(resolve=>w.addEventListener('popstate',async()=>{await tick();resolve();},{once:true}));w.SwiflyDetails.close();await closed;
 assert.equal(d.activeElement,env.selected,'Duplicate title links must restore the original poster');assert.equal(env.page.scrollTop,650);assert.equal(w.location.pathname+w.location.search,'/movies?genre=18');env.finish();
});
test('The keyboard action that opens a title does not cancel that title\'s default focus',async()=>{
 const env=setup(),{window:w,d}=env;let now=1000;w.Date.now=()=>now;
 await env.open();await w.SwiflyDetails.open('/movie/202');now+=90001;
 const respond=pending(w);d.querySelector('[data-sv-dialog-back]').focus();env.key('Enter');
 assert(d.querySelector('.svDetailLoading'));respond(fragment(101));await tick();
 assert.equal(d.activeElement.id,'play101','The initiating Back activation belongs to the previous title');env.finish();
});
test('Stale metadata cannot focus a prior title after a newer selection is ready',async()=>{
 const env=setup(),{window:w,d}=env,late=pending(w),old=env.open();
 w.fetch=async()=>({ok:true,text:async()=>fragment(202)});await w.SwiflyDetails.open('/movie/202');
 const play=d.getElementById('play202');assert.equal(d.activeElement,play);
 late(fragment(101));await old;assert.equal(d.activeElement,play);assert.equal(d.querySelector('dialog h1').textContent,'Movie 202');env.finish();
});
test('Closing pending details restores the original poster and rejects late focus',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open();
 w.SwiflyDetails.close();await tick();assert.equal(d.activeElement,env.selected);
 respond(fragment(101));await opening;assert.equal(d.activeElement,env.selected);assert.equal(d.querySelector('dialog').open,false);env.finish();
});
test('A second modal keeps focus when details finish in the background',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open();
 const modal=d.createElement('dialog');modal.innerHTML='<button>Dialog action</button>';d.body.append(modal);modal.showModal();const action=modal.querySelector('button');assert.equal(d.activeElement,action);
 respond(fragment(101));await opening;assert.equal(d.activeElement,action);env.finish();
});
test('Disabling TV mode while loading retains native focus',async()=>{
 const env=setup(),{window:w,d}=env,respond=pending(w),opening=env.open(),back=d.querySelector('[data-sv-dialog-back]');
 env.key('F8');assert.equal(d.documentElement.dataset.svTv,undefined);
 respond(fragment(101));await opening;assert.equal(d.activeElement,back);env.finish();
});
test('Unavailable primary actions leave chrome focus usable',async()=>{
 for(const attribute of ['hidden','aria-disabled="true"','style="display:none"']){
  const env=setup(),{window:w,d}=env;w.fetch=async()=>({ok:true,text:async()=>fragment(101).replace('class="dsPrimaryBtn"','class="dsPrimaryBtn" '+attribute)});
  await env.open();assert.equal(d.activeElement,d.querySelector('[data-sv-dialog-back]'));env.finish();
 }
});
