'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {browser,loadServer,cleanup}=require('./ui-helpers.cjs');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const api=loadServer();
test.afterEach(cleanup);
function scriptFrom(marker,ender) {
  const start=server.indexOf(marker);
  assert(start>=0,'expected production inline controller '+marker);
  const end=server.indexOf(ender,start);
  assert(end>start,'end of '+marker);
  return server.slice(start,end+ender.length);
}

test('clean catalog never builds or tracks hidden legacy rail progress meters',()=>{
  const env=browser('<section class="dsRow svCatalogRow"><div class="svSectionActions"></div><div class="movieRail"></div></section>');
  const w=env.window,rail=w.document.querySelector('.movieRail');
  let scrollListeners=0;
  const add=rail.addEventListener.bind(rail);
  rail.addEventListener=function(event,...args){if(event==='scroll')scrollListeners++;return add(event,...args);};
  w.eval(scriptFrom('(function swiflytvV15(){','\n    })();'));
  assert(w.document.querySelector('.dsRowControls'),'keep the carousel arrows');
  assert.equal(w.document.querySelector('.dsProgress'),null,'no meter is painted or created in the clean theme');
  assert.equal(scrollListeners,0,'no scroll listener should measure the invisible progress bar');
  env.finish();
});

test('legacy catalog style still retains its existing scroll meter',()=>{
  const env=browser('<section class="dsRow"><div class="svSectionActions"></div><div class="movieRail"></div></section>');
  const w=env.window;
  w.document.body.classList.remove('svCleanShell');
  w.eval(scriptFrom('(function swiflytvV15(){','\n    })();'));
  assert(w.document.querySelector('.dsProgress span'));
  env.finish();
});

test('muted homepage trailer pauses offscreen and on hidden tabs, then resumes when visible',()=>{
  const env=browser('<section class="dsHero dsHeroHasTrailer"><div class="dsHeroTrailerLayer"><iframe id="dsHeroTrailerFrame" data-src="https://www.youtube.com/embed/abc"></iframe></div><div class="dsHeroTrailerPill"><span id="dsHeroTrailerPillText"></span></div><button id="dsHeroMuteToggle"><span></span></button></section>');
  const w=env.window,d=w.document,hero=d.querySelector('.dsHero');
  let callback,observer,ready,played=0,paused=0,muted=0;
  w.IntersectionObserver=class {constructor(fn){callback=fn;observer=this;} observe(){}disconnect(){this.disconnected=true;}};
  w.YT={Player:class {constructor(_id,options){ready=options.events.onReady;this.options=options;}},PlayerState:{PLAYING:1}};
  w.setTimeout=()=>0;
  let hidden=false;
  Object.defineProperty(d,'hidden',{configurable:true,get(){return hidden;}});
  w.eval(scriptFrom('(function swiflyHeroTrailerMuteControl(){','\n      })();'));
  assert(callback,'visibility observer attached');
  const player={mute(){muted++;},playVideo(){played++;},pauseVideo(){paused++;}};
  ready({target:player});
  assert(played>0,'visible hero starts trailer normally');
  callback([{target:hero,isIntersecting:false}]);
  assert.equal(paused,1,'offscreen preview pauses video decode');
  assert(!hero.classList.contains('dsHeroTrailerIsPlaying'),'offscreen hero cannot show a stale playing state');
  callback([{target:hero,isIntersecting:true}]);
  assert.equal(played,2,'preview resumes when hero comes back');
  hidden=true;d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(paused,2,'hidden tab pauses the trailer');
  hidden=false;d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(played,3,'visible tab resumes the preview');
  w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(observer.disconnected,true);
  assert.equal(muted>0,true);
  env.finish();
});

test('catalog poster thumbnails reserve decode dimensions and stay lazy',()=>{
  const html=api.movieCard({id:101,title:'A Movie',poster_path:'/poster.jpg',release_date:'2025-11-14'},'movie');
  const env=browser(html);
  const image=env.window.document.querySelector('.movieCard .posterWrap > img');
  assert(image);
  assert.equal(image.getAttribute('width'),'342');
  assert.equal(image.getAttribute('height'),'513');
  assert.equal(image.getAttribute('decoding'),'async');
  assert.equal(image.getAttribute('loading'),'lazy');
  assert.equal(image.getAttribute('fetchpriority'),'low');
  env.finish();
});
