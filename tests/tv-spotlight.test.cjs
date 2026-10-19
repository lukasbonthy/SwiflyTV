'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup,tick,loadServer}=require('./ui-helpers.cjs');
const {tvScript}=require('../ui/tv');
const code=tvScript().replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
test.afterEach(cleanup);
function setup({width=1280,height=720,enabled=true}={}){
  const cards=[['Northern Lights','/north.jpg','A journey & a promise.'],['The Long Way Home','/home.jpg','An unexpected return.'],['Quiet Water','/water.jpg','A new beginning.']].map(([title,art,overview],i)=>'<article class="movieCard" data-tv-overview="'+overview+'"><a class="posterWrap" id="film'+i+'" href="/movie/'+(101+i)+'" aria-label="Details for '+title+'">'+title+'</a><div class="dsCardQuickActions"><a href="/watch/movie/'+(101+i)+'" data-play-id="'+(101+i)+'" data-play-title="'+title+'" data-play-type="movie" data-play-year="2026" data-play-rating="8.2" data-play-backdrop="'+art+'">Play</a></div><div class="dsCardInfo"><a class="dsCardTitle" href="/movie/'+(101+i)+'">'+title+'</a><div class="dsCardMeta">2026 Movie</div></div></article>').join('');
  const env=browser('<nav class="netflixNav"><a class="active" id="home" href="/">Home</a><button id="search">Search</button></nav><section class="dsRow"><h2>Trending movies</h2><div class="movieRail">'+cards+'</div></section>'),w=env.window,d=w.document,timers=new Map(),requests=[];let nextTimer=0;
  w.innerWidth=width;w.innerHeight=height;w.navigator.getGamepads=()=>[];w.localStorage.setItem('swiflytv.tvFocusMode',String(enabled));
  w.setTimeout=fn=>{timers.set(++nextTimer,fn);return nextTimer;};w.clearTimeout=id=>timers.delete(id);
  w.Image=class {set src(value){this._src=value;if(value)requests.push(this);}get src(){return this._src;}decode(){return Promise.resolve();}};
  w.HTMLElement.prototype.getBoundingClientRect=function(){const i=Number(this.closest('.movieCard')?.querySelector('.posterWrap')?.id.slice(4)||0),fixed=this.closest('.netflixNav')||this.id==='swiflyTvSpotlight';const top=this.id==='swiflyTvSpotlight'?120:this.closest('.netflixNav')?24:this.matches('h2')?400:460;const left=this.closest('.netflixNav')?40:60+i*200,height=this.id==='swiflyTvSpotlight'?120:this.matches('.posterWrap')?230:48,width=this.id==='swiflyTvSpotlight'?1160:140;return {left,top:top-(fixed?0:w.scrollY),right:left+width,bottom:top-(fixed?0:w.scrollY)+height,width,height};};
  w.eval(code);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {...env,w,d,requests,timers,focus(i){d.getElementById('film'+i).focus();},key(key){d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));},runTimers(){const current=[...timers.values()];timers.clear();current.forEach(fn=>fn());}};
}
test('TV selection previews the real title, facts, and overview without adding a focus stop',()=>{
  const e=setup();e.focus(0);const preview=e.d.getElementById('swiflyTvSpotlight');
  assert(preview&&!preview.hidden,'Selected catalog titles have their own cinematic preview');
  assert.equal(preview.querySelector('.svTvSpotlightTitle').textContent,'Northern Lights');assert.match(preview.querySelector('.svTvSpotlightFacts').textContent,/2026/);assert.match(preview.querySelector('.svTvSpotlightFacts').textContent,/8\.2/);assert.equal(preview.querySelector('.svTvSpotlightOverview').textContent,'A journey & a promise.');
  assert.equal(preview.querySelectorAll('a,button,input,[tabindex]').length,0);assert.equal(e.d.activeElement.id,'film0');
  e.key('ArrowRight');assert.equal(preview.querySelector('.svTvSpotlightTitle').textContent,'The Long Way Home');assert.equal(e.d.activeElement.id,'film1');
});
test('Rapid TV selection loads settled artwork and rejects stale image completion',async()=>{
  const e=setup();e.focus(0);e.key('ArrowRight');e.key('ArrowRight');assert.equal(e.requests.length,0,'Moving through titles does not start an image request for every highlight');e.runTimers();assert.equal(e.requests.length,1);assert.match(e.requests[0].src,/water\.jpg$/);
  const stale=e.requests[0],late=stale.onload;e.key('ArrowLeft');e.runTimers();const current=e.requests.at(-1);assert.match(current.src,/home\.jpg$/);current.onload();await tick();late?.();await tick();
  const preview=e.d.getElementById('swiflyTvSpotlight');assert.equal(preview.querySelector('.svTvSpotlightTitle').textContent,'The Long Way Home');assert.match(preview.querySelector('.svTvSpotlightArt.is-visible').getAttribute('src'),/home\.jpg$/,'Late artwork never replaces the current selection');
});
test('TV preview hides for menus and off mode and releases pending artwork',async()=>{
  const e=setup();e.focus(0);const preview=e.d.getElementById('swiflyTvSpotlight');assert(preview&&!preview.hidden);e.d.getElementById('search').focus();assert(preview.hidden);e.runTimers();assert.equal(e.requests.length,0,'Leaving a title cancels its pending artwork');
  e.focus(1);const modal=e.d.createElement('dialog');modal.innerHTML='<button>Close</button>';e.d.body.append(modal);modal.showModal();modal.querySelector('button').focus();await tick();assert(preview.hidden,'A modal owns the visible experience');modal.close();e.focus(1);assert(!preview.hidden);e.key('F8');assert(preview.hidden);assert.equal(e.d.documentElement.dataset.svTvBrowse,undefined);e.runTimers();assert.equal(e.requests.length,0);
});
test('Compact TV screens keep the normal browsing surface clear of the cinematic preview',()=>{
  for(const viewport of [{width:960,height:540},{width:1101,height:640}]){const e=setup(viewport);e.focus(0);assert(!e.d.getElementById('swiflyTvSpotlight')||e.d.getElementById('swiflyTvSpotlight').hidden);assert.equal(e.d.documentElement.dataset.svTvBrowse,undefined);}
});
test('Missing and failed TV artwork keeps a clean fallback without a broken image',async()=>{
  const e=setup();e.focus(0);e.runTimers();e.requests[0].onload();await tick();
  const preview=e.d.getElementById('swiflyTvSpotlight');assert.equal(preview.dataset.artState,'ready');
  e.focus(1);e.runTimers();e.requests.at(-1).onerror();assert.equal(preview.dataset.artState,'empty');assert.equal(preview.querySelectorAll('img[src]').length,0);
  e.d.querySelector('#film2').closest('.movieCard').querySelector('[data-play-id]').removeAttribute('data-play-backdrop');e.focus(2);e.runTimers();assert.equal(preview.dataset.artState,'empty');assert.equal(e.requests.length,2,'No artwork means no empty-image request');
});
test('TV preview cancels pending artwork across page exit and viewport fallback',()=>{
  const e=setup();e.focus(0);const preview=e.d.getElementById('swiflyTvSpotlight');e.w.dispatchEvent(new e.w.Event('pagehide'));e.runTimers();assert(preview.hidden);assert.equal(e.requests.length,0);
  e.w.dispatchEvent(new e.w.PageTransitionEvent('pageshow',{persisted:true}));assert(!preview.hidden);e.w.innerWidth=960;e.w.dispatchEvent(new e.w.Event('resize'));e.runTimers();assert(preview.hidden);assert.equal(e.requests.length,0);assert.equal(e.d.documentElement.dataset.svTvBrowse,undefined);
});
test('Movie card overview metadata remains bounded and safely escaped',()=>{
  const api=loadServer();try{const e=browser(api.movieCard({id:1,title:'A title',overview:'<script>alert(1)</script> & '+ 'x'.repeat(600),media_type:'movie'})),card=e.window.document.querySelector('.movieCard');assert.equal(card.dataset.tvOverview.length,420);assert(card.dataset.tvOverview.startsWith('<script>alert(1)</script> & '));assert.equal(card.querySelector('script'),null);}finally{api.io.close();}
});
