'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const film=(id,title='Film '+id)=>({id,title,media_type:'movie',backdrop_path:'/scene-'+id+'.jpg',poster_path:'/poster.jpg',overview:'A story for tonight.',vote_average:7.8,release_date:'2026-01-01'});

test('Home serializes five unique valid movies and preserves hero/rows adjacency',async()=>{
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
  assert.equal(d.querySelector('[data-sv-featured-pause]'),null,'Home must keep the progress bars without a separate pause/play icon');
  const info=d.querySelector('.dsHeroActions .svFeaturedInfo');assert(info,'Home needs the lighter More info action');assert.equal(info.getAttribute('aria-label'),'More info');assert.equal(info.getAttribute('href'),'/movie/346698');assert(info.querySelector('svg[aria-hidden="true"]'));
  assert.match(d.querySelector('script[src*="featured.js"]').getAttribute('src'),/\?v=/);
  assert.equal(calls.length,12,'Only the four missing featured presentations add cached movie-detail requests');env.finish();
  const {compileDocument,renderDocument}=require('../lib/react-document.cjs');
  const react=browser(await renderDocument(compileDocument(html),{entry:'/test.js'})),rd=react.window.document;
  assert.deepEqual(JSON.parse(rd.querySelector('[data-sv-featured-data]').textContent),slides,'Both original and React renderers preserve the same safe slide data');
  assert(rd.querySelector('.dsHero + .svHeroLightBridge + .dsContent'));react.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});

function fixture({reduced=true,manualImages=false,logo=false}={}){
 const slides=[1,2,3].map(id=>({id,type:'movie',title:'Film '+id,overview:'Story '+id,poster:'/poster.jpg',backdrop:'/scene-'+id+'.jpg',art:'https://image.tmdb.org/t/p/w1280/scene-'+id+'.jpg',mobileArt:'https://image.tmdb.org/t/p/w780/scene-'+id+'.jpg',largeArt:'https://image.tmdb.org/t/p/w1920/scene-'+id+'.jpg',palette:'https://image.tmdb.org/t/p/w300/scene-'+id+'.jpg',logo:logo&&id===2?'https://image.tmdb.org/t/p/w500/logo-2.svg':'',rating:'7.8',year:'2026',metadata:['2026','Movie']}));
 const env=browser('<main data-st-home><section class="dsHero" data-sv-featured><div class="dsHeroArt"><div class="dsHeroBg"></div></div><div class="dsHeroContent"><div class="dsEyebrow">Featured</div><h1 class="dsHeroTitleArt"><span class="dsHeroTitleText">Film 1</span></h1><div class="dsHeroMeta"></div><p>Story 1</p><div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-id="1" href="/watch/movie/1?mode=movie">Play</a><a class="dsSecondaryBtn" href="/movie/1">Details</a><button data-watch-id="1">+</button></div></div><nav data-sv-featured-controls><button data-sv-featured-prev>Previous</button>'+slides.map((s,i)=>'<button data-sv-featured-go="'+i+'">'+'<span><i data-sv-featured-progress></i></span>'+s.title+'</button>').join('')+'<button data-sv-featured-next>Next</button></nav><span data-sv-featured-status></span><script type="application/json" data-sv-featured-data>'+JSON.stringify(slides)+'</script></section><div class="svHeroLightBridge"><div class="svHeroSpill"><img src="/old.jpg"></div></div><section class="dsContent"></section></main>',{reduced});
 const w=env.window,images=[];w.HTMLCanvasElement.prototype.getContext=()=>null;
 w.Image=class{constructor(){const image=w.document.createElement('img');let src='';Object.defineProperties(image,{naturalWidth:{value:1280},naturalHeight:{value:720},src:{get:()=>src,set:value=>{src=value;if(!manualImages)queueMicrotask(()=>image.onload?.());}}});image.decode=()=>Promise.resolve();images.push(image);return image;}};
 const timers=new Map();let timerId=0;
 w.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn:()=>{timers.delete(id);fn();},delay});return id;};w.clearTimeout=id=>timers.delete(id);
 const animations=[];w.HTMLElement.prototype.animate=function(frames,options){let resolve;const a={frames,options,node:this,finished:new Promise(r=>resolve=r),canceled:false,cancel(){this.canceled=true;resolve();},finish(){resolve();}};animations.push(a);return a;};
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

test('the active progress bar pauses and resumes rotation while retaining keyboard focus',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 const button=d.querySelector('[data-sv-featured-go="0"]');button.focus();
 button.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));button.click();
 assert.match(button.getAttribute('aria-label')||'',/Film 1.*Resume automatic rotation/);assert(![...f.timers.values()].some(t=>t.delay===8000));
 button.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));button.click();
 assert.equal(d.activeElement,button);assert.match(button.getAttribute('aria-label')||'',/Film 1.*Pause automatic rotation/);assert([...f.timers.values()].some(t=>t.delay===8000));f.finish();
});

test('inactive progress bars select movies and the selected bar owns playback controls',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 const next=d.querySelector('[data-sv-featured-go="1"]');next.click();await settle();
 assert.equal(d.querySelector('[data-play-id]').dataset.playId,'2');assert.equal(next.getAttribute('aria-current'),'true');assert.match(next.getAttribute('aria-label')||'',/Film 2.*Pause automatic rotation/);
 next.click();assert(![...f.timers.values()].some(t=>t.delay===8000));
 assert.match(d.querySelector('[data-sv-featured-go="0"]').getAttribute('aria-label'),/Show Film 1/);f.finish();
});

test('quiet mode keeps progress bars as manual movie selectors',async()=>{
 const f=fixture(),w=f.window,d=w.document;await settle();
 d.querySelector('[data-sv-featured-go="1"]').click();await settle();
 assert.equal(d.querySelector('[data-play-id]').dataset.playId,'2');assert.equal(d.querySelector('[data-sv-featured-go="1"]').getAttribute('aria-label'),'Show Film 2');
 assert(![...f.timers.values()].some(t=>t.delay===8000));f.finish();
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


test('finite progress shares one dwell, survives unrelated notifications and stops with every pause',async()=>{
 const f=fixture({reduced:false}),w=f.window,d=w.document;await settle();
 const progress=()=>f.animations.filter(a=>a.node.matches('[data-sv-featured-progress]'));
 const dwell=()=>[...f.timers.values()].filter(t=>t.delay===8000);
 assert.equal(progress().length,1,'The selected progress fill needs one finite animation');
 const first=progress()[0],firstTimer=dwell()[0];
 assert.equal(first.options.duration,8000);assert.equal(first.options.easing,'linear');
 assert.equal(first.options.iterations??1,1);assert.equal(first.node.closest('[data-sv-featured-go]').dataset.svFeaturedGo,'0');
 d.dispatchEvent(new w.Event('swifly:studio-change'));await settle();
 assert.equal(progress().length,1,'Unrelated state notifications must not restart the dwell');assert.equal(dwell()[0],firstTimer);
 d.dispatchEvent(new w.Event('scroll'));await settle();
 assert.equal(first.canceled,true);assert.equal(dwell().length,0);
 const scroll=[...f.timers.values()].find(t=>t.delay===260);assert(scroll);scroll.fn();await settle();
 assert.equal(progress().length,2);assert.equal(dwell().length,1);
 const dialog=d.createElement('dialog');d.body.append(dialog);dialog.open=true;await settle();
 assert.equal(progress().at(-1).canceled,true);assert.equal(dwell().length,0);
 dialog.remove();await settle();assert.equal(dwell().length,1);
 await w.SwiflyFeatured.select(1);await settle();assert.equal(dwell().length,0,'No dwell while the artwork moves');
 for(const a of f.animations.filter(a=>[700,1000].includes(a.options.duration)))a.finish();await settle();
 assert.equal(progress().at(-1).node.closest('[data-sv-featured-go]').dataset.svFeaturedGo,'1');assert.equal(dwell().length,1);
 w.dispatchEvent(new w.Event('pagehide'));assert.equal(dwell().length,0);assert.equal(progress().at(-1).canceled,true);
 w.dispatchEvent(new w.Event('pageshow'));assert.equal(dwell().length,1);
 w.SwiflyFeatured.destroy();assert.equal(progress().at(-1).canceled,true);assert.equal(f.timers.size,0);assert.equal(w.frameCount(),0);f.finish();
});


test('incoming title logos are decoded before copy changes and missing logos fall back within a bounded wait',async()=>{
 const f=fixture({manualImages:true,logo:true}),w=f.window,d=w.document;await settle();
 const pending=w.SwiflyFeatured.select(1);await settle();
 const art=f.images.find(i=>i.src.includes('w1280/scene-2')),logo=f.images.find(i=>i.src.includes('logo-2'));assert(art);assert(logo);
 art.onload();await settle();assert.equal(d.querySelector('[data-play-id]').dataset.playId,'1','Copy must not change before its optional logo is ready');
 logo.onload();await pending;assert.equal(d.querySelector('[data-play-id]').dataset.playId,'2');
 assert.equal(d.querySelector('h1.hasLogo .dsHeroLogo'),logo);assert.equal(logo.naturalWidth,logo.width);
 const returning=w.SwiflyFeatured.select(0);await settle();
 const back=f.images.find(i=>i.src.includes('w1280/scene-1'));back.onload?.();await returning;await settle();
 f.finish();
 const fallback=fixture({manualImages:true,logo:true});await settle();
 const next=fallback.window.SwiflyFeatured.select(1);await settle();
 fallback.images.find(i=>i.src.includes('w1280/scene-2')).onload();
 const deadline=[...fallback.timers.values()].find(t=>t.delay===1200);assert(deadline);deadline.fn();await next;
 assert.equal(fallback.window.document.querySelector('[data-play-id]').dataset.playId,'2');assert.equal(fallback.window.document.querySelector('h1.hasLogo'),null);fallback.finish();
});

test('late events from the initial logo cannot hide the selected title or remove a replacement logo',async()=>{
 const f=fixture({logo:true}),w=f.window,d=w.document;await settle();
 const heading=d.querySelector('h1'),old=d.createElement('img');old.className='dsHeroLogo';Object.defineProperty(old,'naturalWidth',{value:500});heading.append(old);w.boot('catalog.js');
 await w.SwiflyFeatured.select(2);assert.equal(old.isConnected,false);
 old.dispatchEvent(new w.Event('load'));
 assert.equal(heading.classList.contains('hasLogo'),false,'A detached image must not clip the new text-only title');
 await w.SwiflyFeatured.select(1);assert(heading.querySelector('.dsHeroLogo'));assert(heading.classList.contains('hasLogo'));
 old.dispatchEvent(new w.Event('error'));
 assert.equal(heading.classList.contains('hasLogo'),true,'A detached failure must not hide the prepared replacement logo');f.finish();
});

test('later features receive matching title logos, runtime and genres before serialization',async()=>{
 const api=loadServer(),details=[];try{
  api.setTmdb(async endpoint=>{
   if(endpoint==='/movie/346698')return film(346698);
   if(/^\/movie\/\d+$/.test(endpoint)){const id=Number(endpoint.split('/').pop());details.push(id);return {...film(id),runtime:114,genres:[{name:'Adventure'},{name:'Comedy'}],images:{logos:[{file_path:'/title-'+id+'.png',iso_639_1:'en'}]}};}
   return {results:[film(1),film(2),film(3),film(4),film(5)]};
  });
  let html;await api.homePage({}, {send:v=>html=v});const f=browser(html),slides=JSON.parse(f.window.document.querySelector('[data-sv-featured-data]').textContent);
  assert.deepEqual(details.sort((a,b)=>a-b),[1,2,3,4]);
  assert(slides.slice(1).every(s=>s.logo.endsWith('/title-'+s.id+'.png')&&s.metadata.includes('1h 54m')&&s.metadata.includes('Adventure, Comedy')));f.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});

test('partial featured details preserve populated runtime, genres and title art',async()=>{
 const api=loadServer();try{
  const originals=[{...film(1),runtime:95,genres:[{name:'Drama'}]},
   {...film(2),genres:[{name:'Adventure'}],images:{logos:[{file_path:'/original-2.png',iso_639_1:'en'}]}},
   {...film(3),genres:[{name:'Comedy'}],images:{logos:[{file_path:'/original-3.png',iso_639_1:'en'}]}},film(4)];
  api.setTmdb(async endpoint=>{
   if(endpoint==='/movie/346698')return film(346698);
   if(endpoint==='/movie/1')return {id:1,images:{logos:[{file_path:'/new-1.png',iso_639_1:'en'}]}};
   if(endpoint==='/movie/2')return {id:2,runtime:110};
   if(endpoint==='/movie/3')return {id:3,runtime:124,genres:[],images:{logos:[]}};
   return {results:originals};
  });
  let html;await api.homePage({}, {send:v=>html=v});const f=browser(html),slides=JSON.parse(f.window.document.querySelector('[data-sv-featured-data]').textContent);
  assert(slides.find(s=>s.id===1).metadata.includes('1h 35m'));
  assert(slides.find(s=>s.id===1).metadata.includes('Drama'));
  assert(slides.find(s=>s.id===1).logo.endsWith('/new-1.png'));
  assert(slides.find(s=>s.id===2).metadata.includes('Adventure'));
  assert(slides.find(s=>s.id===2).logo.endsWith('/original-2.png'));
  assert(slides.find(s=>s.id===3).metadata.includes('Comedy'));
  assert(slides.find(s=>s.id===3).logo.endsWith('/original-3.png'));f.finish();
 }finally{await new Promise(resolve=>api.io.close(resolve));}
});


test('a slow feature detail cannot strand Home or discard other ready logos',{timeout:4000},async()=>{
 const api=loadServer();let release,signal;try{
  api.setTmdb(async(endpoint,_params,_ttl,requestSignal)=>{
   if(endpoint==='/movie/346698')return film(346698);
   if(endpoint==='/movie/2'){signal=requestSignal;return new Promise(resolve=>release=resolve);}
   if(/^\/movie\/\d+$/.test(endpoint)){const id=Number(endpoint.split('/').pop());return {...film(id),runtime:95,genres:[{name:'Drama'}],images:{logos:[{file_path:'/ready-'+id+'.png',iso_639_1:'en'}]}};}
   return {results:[film(1),film(2),film(3),film(4)]};
  });
  let html;await api.homePage({}, {send:v=>html=v});assert.equal(signal?.aborted,true);
  const f=browser(html),slides=JSON.parse(f.window.document.querySelector('[data-sv-featured-data]').textContent);assert(slides.find(s=>s.id===1).logo.endsWith('/ready-1.png'));assert.equal(slides.find(s=>s.id===2).logo,'');f.finish();release?.({...film(2),images:{logos:[{file_path:'/too-late.png'}]}});await settle();
 }finally{release?.(film(2));await new Promise(resolve=>api.io.close(resolve));}
});
