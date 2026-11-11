'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const film=(id,title='Film '+id)=>({id,title,media_type:'movie',backdrop_path:'/scene-'+id+'.jpg',poster_path:'/poster.jpg',overview:'A story for tonight.',vote_average:7.8,release_date:'2026-01-01'});

test('Home serializes five unique valid movies from existing requests without changing hero/rows adjacency',async()=>{
 const api=loadServer(),calls=[];
 try{
  api.setTmdb(async endpoint=>{calls.push(endpoint);return endpoint==='/movie/346698'?film(346698,'</script><img src=x onerror=alert(1)>'):{results:[film(346698),film(1),film(1),film(2),film(3),film(4),film(5),film(-1),{...film(9),media_type:'tv'}]};});
  let html;await api.homePage({}, {send:value=>html=value});
  const env=browser(html),d=env.window.document,payload=d.querySelector('[data-sv-featured-data]');
  assert(payload,'Home must provide inert featured movie data');
  const slides=JSON.parse(payload.textContent);assert.deepEqual(slides.map(s=>s.id),[346698,1,2,3,4]);
  assert.match(slides[0].largeArt,/\/original\/scene-/);assert.match(slides[0].mobileArt,/\/w780\/scene-/);
  assert.equal(slides[0].title,'</script><img src=x onerror=alert(1)>');assert.equal(d.querySelector('img[src="x"]'),null);
  assert(d.querySelector('.dsHero + .svHeroLightBridge + .dsContent'));
  assert.equal(d.querySelectorAll('[data-sv-featured-go]').length,5);
  assert.match(d.querySelector('script[src*="featured.js"]').getAttribute('src'),/\?v=/);
  assert.equal(calls.length,8,'Rotation must reuse the seven catalog requests plus the existing curated request');env.finish();
  const {compileDocument,renderDocument}=require('../lib/react-document.cjs');
  const react=browser(await renderDocument(compileDocument(html),{entry:'/test.js'})),rd=react.window.document;
  assert.deepEqual(JSON.parse(rd.querySelector('[data-sv-featured-data]').textContent),slides,'Both original and React renderers preserve the same safe slide data');
  assert(rd.querySelector('.dsHero + .svHeroLightBridge + .dsContent'));react.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});

function fixture({reduced=true,manualImages=false}={}){
 const slides=[1,2,3].map(id=>({id,type:'movie',title:'Film '+id,overview:'Story '+id,poster:'/poster.jpg',backdrop:'/scene-'+id+'.jpg',art:'https://image.tmdb.org/t/p/w1280/scene-'+id+'.jpg',mobileArt:'https://image.tmdb.org/t/p/w780/scene-'+id+'.jpg',largeArt:'https://image.tmdb.org/t/p/w1920/scene-'+id+'.jpg',palette:'https://image.tmdb.org/t/p/w300/scene-'+id+'.jpg',logo:'',rating:'7.8',year:'2026',metadata:['2026','Movie']}));
 const env=browser('<main data-st-home><section class="dsHero" data-sv-featured><div class="dsHeroArt"><div class="dsHeroBg"></div></div><div class="dsHeroContent"><div class="dsEyebrow">Featured</div><h1 class="dsHeroTitleArt"><span class="dsHeroTitleText">Film 1</span></h1><div class="dsHeroMeta"></div><p>Story 1</p><div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-id="1" href="/watch/movie/1?mode=movie">Play</a><a class="dsSecondaryBtn" href="/movie/1">Details</a><button data-watch-id="1">+</button></div></div><nav data-sv-featured-controls><button data-sv-featured-prev>Previous</button>'+slides.map((s,i)=>'<button data-sv-featured-go="'+i+'">'+s.title+'</button>').join('')+'<button data-sv-featured-next>Next</button><button data-sv-featured-pause>Pause</button></nav><span data-sv-featured-status></span><script type="application/json" data-sv-featured-data>'+JSON.stringify(slides)+'</script></section><div class="svHeroLightBridge"><div class="svHeroSpill"><img src="/old.jpg"></div></div><section class="dsContent"></section></main>',{reduced});
 const w=env.window,images=[];w.HTMLCanvasElement.prototype.getContext=()=>null;
 w.Image=class{constructor(){this.naturalWidth=1280;this.naturalHeight=720;images.push(this);}set src(value){this._src=value;if(!manualImages)queueMicrotask(()=>this.onload?.());}get src(){return this._src;}decode(){return Promise.resolve();}};
 const timers=new Map();let timerId=0;
 w.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};w.clearTimeout=id=>timers.delete(id);
 const animations=[];w.HTMLElement.prototype.animate=function(frames,options){let resolve;const a={frames,options,node:this,finished:new Promise(r=>resolve=r),cancel(){resolve();},finish(){resolve();}};animations.push(a);return a;};
 w.boot('featured.js');
 return {...env,images,timers,animations,slides,finish(){w.SwiflyFeatured?.destroy();env.finish();}};
}
async function settle(){await tick();await tick();}

test('manual selection preserves live actions and updates identity, artwork, glow and palette together',async()=>{
 const f=fixture(),w=f.window,d=w.document,play=d.querySelector('[data-play-id]'),details=d.querySelector('.dsSecondaryBtn'),watch=d.querySelector('[data-watch-id]');
 await settle();assert(w.SwiflyFeatured,'The Home controller must boot');
 await w.SwiflyFeatured.select(1);await settle();
 assert.equal(d.querySelector('[data-play-id]'),play);assert.equal(d.querySelector('.dsSecondaryBtn'),details);assert.equal(d.querySelector('[data-watch-id]'),watch);
 assert.equal(play.dataset.playId,'2');assert.equal(play.getAttribute('href'),'/watch/movie/2?mode=movie');assert.equal(details.getAttribute('href'),'/movie/2');assert.equal(watch.dataset.watchId,'2');
 assert.equal(d.querySelector('.dsHeroTitleText').textContent,'Film 2');assert.equal(d.querySelector('.dsHero').dataset.svPaletteSrc,f.slides[1].palette);
 assert.equal(d.querySelector('.dsHeroBg[data-sv-featured-active="true"]').dataset.svFeaturedId,'2');
 assert.equal(d.querySelector('[data-sv-featured-glow][data-sv-featured-active="true"]').dataset.svFeaturedId,'2');
 assert.equal(d.querySelectorAll('.dsHeroBg').length,2);assert.equal(d.querySelectorAll('[data-sv-featured-glow]').length,2);assert.equal(w.frameCount(),0);f.finish();
});

test('late artwork from a superseded selection cannot replace the latest movie',async()=>{
 const f=fixture({manualImages:true}),w=f.window,d=w.document;await settle();
 const old=w.SwiflyFeatured?.select(1);assert(old,'Controller must exist');await settle();
 const latest=w.SwiflyFeatured.select(2);await settle();
 for(const image of f.images.filter(i=>i.src.includes('scene-3')))image.onload?.();await settle();
 for(const image of f.images.filter(i=>!i.src.includes('scene-3')))image.onload?.();await Promise.all([old,latest]);await settle();
 assert.equal(d.querySelector('[data-play-id]').dataset.playId,'3');assert.equal(d.querySelector('.dsHero').dataset.svPaletteSrc,f.slides[2].palette);f.finish();
});

test('failed artwork retains the current movie and never creates a ghost or moving material',async()=>{
 const f=fixture({manualImages:true}),w=f.window,d=w.document;await settle();assert(w.SwiflyFeatured);
 const pending=w.SwiflyFeatured.select(1);await settle();for(const image of f.images.filter(i=>i.src.includes('scene-2')))image.onerror?.();await pending;
 assert.equal(d.querySelector('[data-play-id]').dataset.playId,'1');assert.equal(d.querySelector('[data-sv-featured-ghost]'),null);assert.equal(d.documentElement.dataset.svFeaturedMotion,undefined);f.finish();
});

test('a moving snapshot is inert, owns no filters/actions and releases the motion tier after both finite transitions',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();assert(w.SwiflyFeatured);
 await w.SwiflyFeatured.select(1);await settle();
 const ghost=d.querySelector('[data-sv-featured-ghost]');assert(ghost);assert(ghost.hasAttribute('inert'));assert.equal(ghost.querySelector('[id],[href],[data-play-id],[data-watch-id],.svLiquidPane,filter'),null);
 assert.equal(d.documentElement.dataset.svFeaturedMotion,'true');assert(f.animations.some(a=>a.options.duration===700));assert(f.animations.some(a=>a.options.duration===1000));
 for(const a of f.animations)a.finish();await settle();
 assert.equal(d.querySelector('[data-sv-featured-ghost]'),null);assert.equal(d.documentElement.dataset.svFeaturedMotion,undefined);assert.equal(w.frameCount(),0);f.finish();
});

test('autoplay pauses for keyboard interaction, reduced motion and lifecycle disposal',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();assert(w.SwiflyFeatured);
 assert([...f.timers.values()].some(t=>t.delay===8000));
 d.querySelector('[data-sv-featured-next]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
 assert(![...f.timers.values()].some(t=>t.delay===8000));
 w.reduceMotion(true);assert(![...f.timers.values()].some(t=>t.delay===8000));
 w.SwiflyFeatured.destroy();assert.equal(f.timers.size,0);assert.equal(d.documentElement.dataset.svFeaturedMotion,undefined);f.finish();
});

test('keyboard pause and explicit resume work while the rotation button retains focus',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 const button=d.querySelector('[data-sv-featured-pause]');button.focus();
 button.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));button.click();
 assert.equal(button.getAttribute('aria-label'),'Resume featured movies');assert(![...f.timers.values()].some(t=>t.delay===8000));
 button.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));button.click();
 assert.equal(d.activeElement,button);assert.equal(button.getAttribute('aria-label'),'Pause featured movies');assert([...f.timers.values()].some(t=>t.delay===8000));f.finish();
});

test('autoplay moves past unavailable art and retries at a bounded dwell instead of blocking later films',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 // Complete initial prep, then let the next automatic artwork fail.
 w.Image=class{constructor(){this.naturalWidth=0;}set src(value){this._src=value;if(value)queueMicrotask(()=>this.onerror?.());}get src(){return this._src;}};
 const next=[...f.timers.values()].find(t=>t.delay===8000);assert(next);next.fn();await settle();assert.equal(d.querySelector('[data-play-id]').dataset.playId,'1');
 w.Image=class{constructor(){this.naturalWidth=1280;}set src(value){this._src=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this._src;}decode(){return Promise.resolve();}};
 [...f.timers.values()].filter(t=>t.delay===8000).at(-1).fn();await settle();assert.equal(d.querySelector('[data-play-id]').dataset.playId,'3');f.finish();
});

test('a canceled transition completion cannot finish a newer transition',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 await w.SwiflyFeatured.select(1);w.reduceMotion(true);w.reduceMotion(false);
 // Start replacement synchronously before the old canceled finished promise.
 await w.SwiflyFeatured.select(2);await settle();
 assert.equal(d.querySelector('[data-play-id]').dataset.playId,'3');assert.equal(d.documentElement.dataset.svFeaturedMotion,'true');
 for(const a of f.animations)a.finish();await settle();assert.equal(d.documentElement.dataset.svFeaturedMotion,undefined);f.finish();
});
