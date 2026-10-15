const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const fragment=id=>'<article class="svTitleDetails"><h1>Movie '+id+'</h1><a href="/movie/202">Another title</a><p>Story and cast</p></article>';
function setup(options={}){
 const env=browser('<a id="open" href="/movie/101">Movie 101</a>',{path:'/search?q=moon#results',...options}),w=env.window,animations=[];
 w.HTMLElement.prototype.animate=function(keyframes,settings){
  let resolve,reject;const animation={target:this,keyframes,settings,cancelled:false,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},cancel(){this.cancelled=true;reject(new Error('Animation cancelled'));}};
  animations.push(animation);return animation;
 };
 w.fetch=async url=>({ok:true,text:async()=>fragment(url.match(/\/(?:movie|tv)\/(\d+)/)[1])});
 w.boot('details.js');return {...env,animations};
}
function finish(animations){for(const animation of animations)animation.finish();return tick();}
function traversal(w,action){return new Promise(resolve=>{w.addEventListener('popstate',async()=>{await tick();resolve();},{once:true});action();});}
test('The sheet opens immediately and receives ready details while its entrance is running',async()=>{
 const env=setup(),w=env.window,d=w.document;let respond;
 w.fetch=()=>new Promise(resolve=>respond=resolve);
 const opening=w.SwiflyDetails.open('/movie/101',d.getElementById('open')),dialog=d.querySelector('dialog');
 assert(dialog.open);assert.equal(dialog.dataset.svDetailState,'opening');assert(dialog.querySelector('.svDetailLoading'));
 assert(d.documentElement.classList.contains('svDetailsOpen'));
 respond({ok:true,text:async()=>fragment(101)});await opening;
 assert.equal(dialog.querySelector('h1').textContent,'Movie 101','Ready metadata must not wait for the entrance');
 assert.equal(dialog.dataset.svDetailState,'opening');
 await finish(env.animations);assert.equal(dialog.dataset.svDetailState,'open');env.finish();
});
test('Dismissal retains the native modal, focused controls and background lock until the exit finishes',async()=>{
 const env=setup(),w=env.window,d=w.document,trigger=d.getElementById('open');env.page.scrollTop=650;trigger.focus();
 await w.SwiflyDetails.open('/movie/101',trigger);await finish(env.animations);
 const dialog=d.querySelector('dialog'),dismiss=dialog.querySelector('[data-sv-detail-close]');dismiss.focus();
 const start=env.animations.length;w.SwiflyDetails.close();
 assert(dialog.open,'The native modal must keep the catalog inert during its exit');assert.equal(dialog.dataset.svDetailState,'closing');
 assert.equal(d.activeElement,dismiss);assert(d.documentElement.classList.contains('svDetailsOpen'));assert(dialog.querySelector('h1'));
 const returned=traversal(w,()=>env.animations.slice(start).forEach(animation=>animation.finish()));await returned;
 assert.equal(dialog.open,false);assert.equal(d.activeElement,trigger);assert.equal(env.page.scrollTop,650);assert(!d.documentElement.classList.contains('svDetailsOpen'));
 assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results');env.finish();
});
test('A resolved old exit cannot close a replacement title or add a second history entry',async()=>{
 const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 const start=env.animations.length;w.SwiflyDetails.close();
 env.animations.slice(start).forEach(animation=>animation.finish());
 await w.SwiflyDetails.open('/movie/202',d.getElementById('open'));await tick();
 const dialog=d.querySelector('dialog');assert(dialog.open);assert.equal(dialog.querySelector('h1').textContent,'Movie 202');
 assert.equal(w.history.length,2);assert.equal(new w.URL(w.location.href).searchParams.get('media'),'movie-202');assert(d.documentElement.classList.contains('svDetailsOpen'));
 await finish(env.animations);assert(dialog.open);assert.equal(dialog.dataset.svDetailState,'open');env.finish();
});
test('Browser Back and Forward can reverse an unfinished exit while preserving detail scroll',async()=>{
 const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 const dialog=d.querySelector('dialog'),viewport=d.querySelector('.svDetailViewport');viewport.scrollTop=320;
 await traversal(w,()=>w.history.back());assert(dialog.open);assert.equal(dialog.dataset.svDetailState,'closing');
 const old=env.animations.slice(-2);await traversal(w,()=>w.history.forward());old.forEach(animation=>animation.finish());await tick();
 assert(dialog.open);assert.equal(dialog.querySelector('h1').textContent,'Movie 101');assert.equal(viewport.scrollTop,320);
 assert.equal(w.history.length,2);await finish(env.animations);assert.equal(dialog.dataset.svDetailState,'open');env.finish();
});
test('Selecting a recommendation during browser Back exit preserves a fresh catalog history entry',async()=>{
 const env=setup(),w=env.window,d=w.document;
 await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 await w.SwiflyDetails.open('/movie/202');
 await traversal(w,()=>w.history.back());
 const dialog=d.querySelector('dialog');assert.equal(dialog.dataset.svDetailState,'closing');
 assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results');
 dialog.querySelector('[data-sv-dialog-back]').click();await tick();
 assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results','The sheet Back control must leave a completed catalog traversal intact');
 assert.equal(dialog.dataset.svDetailState,'closing');
 const recommendation=dialog.querySelector('a[href="/movie/202"]');
 const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});recommendation.dispatchEvent(click);await tick();
 assert(click.defaultPrevented);assert(dialog.open);assert.equal(dialog.querySelector('h1').textContent,'Movie 202');
 assert.equal(w.history.state.svDetails.pushed,true,'The catalog entry must survive a fresh selection during browser Back dismissal');
 assert.equal(w.history.length,2,'The new selection should replace only the abandoned forward entry');
 assert.equal(dialog.querySelector('[data-sv-dialog-back]').getAttribute('aria-label'),'Back to browsing','A new catalog selection must discard the previous recommendation trail');
 await finish(env.animations);
 await traversal(w,()=>w.history.back());assert.equal(dialog.dataset.svDetailState,'closing');await finish(env.animations);
 assert.equal(dialog.open,false);assert.equal(w.location.pathname+w.location.search+w.location.hash,'/search?q=moon#results');
 env.finish();
});
test('Closing a pending request prevents late metadata from replacing the exit or a reopened title',async()=>{
 const env=setup(),w=env.window,d=w.document;let late;
 w.fetch=()=>new Promise(resolve=>late=resolve);const first=w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 w.SwiflyDetails.close();w.fetch=async()=>({ok:true,text:async()=>fragment(202)});await w.SwiflyDetails.open('/movie/202',d.getElementById('open'));
 late({ok:true,text:async()=>fragment(101)});await first;await finish(env.animations);
 assert.equal(d.querySelector('dialog h1').textContent,'Movie 202');assert(d.querySelector('dialog').open);env.finish();
});
test('Repeated close requests create one exit and one catalog traversal',async()=>{
 const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));await finish(env.animations);
 const start=env.animations.length;let back=0;w.history.back=()=>back++;
 w.SwiflyDetails.close();w.SwiflyDetails.close();d.querySelector('dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));
 await finish(env.animations.slice(start));assert.equal(back,1);assert.equal(d.querySelector('dialog').open,false);env.finish();
});
test('OS and app reduced motion open and close instantly without animation',async()=>{
 for(const options of [{reduced:true},{appReduced:true}]){
  const env=setup(options),w=env.window,d=w.document;if(options.appReduced)d.body.classList.add('reduceMotion');
  await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert.equal(env.animations.length,0);
  w.SwiflyDetails.close();assert.equal(d.querySelector('dialog').open,false);assert.equal(env.animations.length,0);env.finish();
 }
});
test('Changing either motion preference settles an active entrance or exit immediately',async()=>{
 for(const app of [false,true]){
  const env=setup(),w=env.window,d=w.document;await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
  if(app){d.body.classList.add('reduceMotion');await tick();}else w.reduceMotion(true);
  assert.equal(d.querySelector('dialog').dataset.svDetailState,'open');assert(env.animations.every(animation=>animation.cancelled));
  if(app)d.body.classList.remove('reduceMotion');else w.reduceMotion(false);await tick();
  w.SwiflyDetails.close();assert(d.querySelector('dialog').open);
  if(app){d.body.classList.add('reduceMotion');await tick();}else w.reduceMotion(true);
  assert.equal(d.querySelector('dialog').open,false);env.finish();
 }
});
test('The real CSS fallback retains modal semantics until its bounded exit completes',async()=>{
 const env=browser('<style>'+source('details.css')+'</style><a id="open" href="/movie/101">Movie 101</a>'),w=env.window,d=w.document,timers=new Map();let timerID=0;
 w.setTimeout=callback=>{timers.set(++timerID,callback);return timerID;};w.clearTimeout=id=>timers.delete(id);
 w.fetch=async()=>({ok:true,text:async()=>fragment(101)});w.boot('details.js');await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const dialog=d.querySelector('dialog');assert.equal(dialog.dataset.svDetailMotion,'css');assert.equal(dialog.dataset.svDetailState,'opening');
 const settle=()=>{const batch=[...timers.values()];timers.clear();batch.forEach(callback=>callback());};
 settle();assert.equal(dialog.dataset.svDetailState,'open');w.SwiflyDetails.close();assert(dialog.open);assert.equal(dialog.dataset.svDetailState,'closing');
 settle();assert.equal(dialog.open,false);env.finish();
});
test('CSS fallback ignores an old exit event and finishes even when the browser sends no events',async()=>{
 const env=browser('<style>'+source('details.css')+'</style><a id="open" href="/movie/101">Movie 101</a>'),w=env.window,d=w.document,timers=new Map();let timerID=0,back=0;
 w.setTimeout=callback=>{timers.set(++timerID,callback);return timerID;};w.clearTimeout=id=>timers.delete(id);w.history.back=()=>back++;
 w.fetch=async()=>({ok:true,text:async()=>fragment(101)});w.boot('details.js');await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 const dialog=d.querySelector('dialog'),settle=()=>{const batch=[...timers.values()];timers.clear();batch.forEach(callback=>callback());};settle();
 w.SwiflyDetails.close();await w.SwiflyDetails.open('/movie/202');settle();w.SwiflyDetails.close();
 const event=new w.Event('animationend');Object.defineProperty(event,'animationName',{value:'svDetailsExit'});dialog.dispatchEvent(event);
 assert(dialog.open,'A delayed old CSS event cannot finish the current exit');assert(d.documentElement.classList.contains('svDetailsOpen'));
 settle();assert.equal(dialog.open,false);assert(!d.documentElement.classList.contains('svDetailsOpen'));assert.equal(back,1);env.finish();
});
test('The real sheet styles give Back and Close comfortable touch targets',async()=>{
 const env=browser('<style>'+source('details.css')+'</style><a id="open" href="/movie/101">Movie 101</a>',{reduced:true}),w=env.window,d=w.document;
 w.fetch=async()=>({ok:true,text:async()=>fragment(101)});w.boot('details.js');await w.SwiflyDetails.open('/movie/101',d.getElementById('open'));
 for(const button of d.querySelectorAll('.svDetailChrome button')){
  const style=w.getComputedStyle(button);assert(parseFloat(style.width)>=44&&parseFloat(style.height)>=44,'Back and Close each need a 44px touch target');
 }
 env.finish();
});
