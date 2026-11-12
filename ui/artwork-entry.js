'use strict';

// Independent of the deferred application bundle: a stalled optional script
// must never leave the black entry surface covering a usable document.
function artworkEntry() {
 'use strict';
 const root=document.documentElement, motion=matchMedia('(prefers-reduced-motion: reduce)');
 const images='main img,.svDetailDialog img,[data-search-results] img';
 // iPadOS uses WebKit in every browser. Keep catalog posters on the browser's
 // native lazy/async path: the blanket decode/fade gate forces offscreen
 // poster decoding and makes returning to a row repaint and fade again.
 const appleTablet=/iPad/.test(navigator.userAgent) ||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(appleTablet)root.dataset.svAppleTablet='true';
 const nativeTabletPoster=node=>appleTablet&&node.tagName==='IMG'&&
   !!node.closest('.dsContent,.movieRail,.dsRail,.nfRail,.nfTopTenRail,.dsWelcomeRailTrack,.svFeedSection,.svResumeSection');
 const backgrounds='.dsHeroBg,.browseHeroBg,.svDetailBackdrop,.dsWelcomeHeroBg';
 const copy='.dsHeroContent > :is(.dsEyebrow,h1,.dsHeroMeta,p)';
 const seen=new WeakMap(),pending=new Map(),held=new Set();
 let entering=true,booted=false,observer=null,frame=0,finishTimer=0,suspended=false,bodyObserved=false,releaseLayout;
 const layout=root.dataset.svLayoutState==='pending'?new Promise(resolve=>{releaseLayout=resolve;}):Promise.resolve();
 function still(){return motion.matches||root.dataset.svTv==='true'||root.dataset.svXbox==='true'||document.body?.classList.contains('reduceMotion')||document.body?.dataset.stPageMotion==='false'||['minimal','basic'].includes(document.body?.dataset.stLoaderStyle);}
 function reveal(immediate=false){
  clearTimeout(deadline);cancelAnimationFrame(frame);frame=0;
  for(const node of held)node.classList.add('svArtworkReady','svArtworkInitial');held.clear();
  if(!entering){if(immediate||still()){clearTimeout(finishTimer);finishTimer=0;root.dataset.svArtworkState='ready';}return;}
  entering=false;root.removeAttribute('aria-busy');
  root.dataset.svArtworkState=immediate||still()?'ready':'reveal';
  if(root.dataset.svArtworkState==='reveal')finishTimer=setTimeout(()=>{root.dataset.svArtworkState='ready';finishTimer=0;},root.dataset.svEntry==='player'?600:460);
 }
 root.dataset.svArtworkState='loading';root.setAttribute('aria-busy','true');
 const deadline=setTimeout(()=>reveal(),root.dataset.svLayoutState==='pending'?3200:2200);
 // Device/OS choices are already known in the head. Saved Studio settings
 // arrive in the inline body prime, before any deferred script can finish.
 const settings=new MutationObserver(syncSettings);
 function syncSettings(){
  if(root.dataset.svLayoutState!=='pending'){releaseLayout?.();releaseLayout=null;}
  if(document.body&&!bodyObserved){bodyObserved=true;settings.observe(document.body,{attributes:true,attributeFilter:['class','data-st-page-motion','data-st-loader-style']});}
  if(still())reveal(true);
 }
 settings.observe(root,{childList:true,attributes:true,attributeFilter:['data-sv-tv','data-sv-xbox','data-sv-layout-state']});syncSettings();
 function ready(node){if(entering)held.add(node);else node.classList.add('svArtworkReady');}
 function imageReady(image){
  let cancel;
  const promise=new Promise(resolve=>{
   let done=false;
   function finish(){if(done)return;done=true;image.removeEventListener('load',loaded);image.removeEventListener('error',finish);pending.delete(image);resolve();}
   function loaded(){if(done)return;if(image.naturalWidth&&typeof image.decode==='function')image.decode().catch(()=>{}).then(finish);else finish();}
   cancel=finish;pending.set(image,finish);
   image.addEventListener('load',loaded,{once:true});image.addEventListener('error',finish,{once:true});
   if(image.complete)loaded();
  });
  return {promise,cancel};
 }
 function asset(node,url,alreadyVisible=false){
  if(seen.has(node)||node.closest('.svHeroSpill,.svWelcomeSpill')||still())return null;
  let image=node;
  if(node.tagName!=='IMG'){
   if(!url)return null;
   image=new Image();image.decoding='async';image.src=url;
  }
  // A safety/Escape release is final for the initial document. A late
  // parsing event must not hide content that the user can already see.
  if(alreadyVisible)node.classList.add('svArtworkReady');
  node.classList.add('svArtworkAsset');
  const entry=imageReady(image);seen.set(node,entry);
  entry.promise.then(()=>{
   if(suspended||!node.isConnected)return;
   // Present decoded title art with the initial scene even if catalog.js is
   // still downloading. Never let a detached/replaced logo change its title.
   const title=node.matches('img.dsHeroLogo')?node.closest('.dsHeroTitleArt'):null;
   if(title?.querySelector('.dsHeroLogo')===node)title.classList.toggle('hasLogo',node.naturalWidth>0);
   ready(node);
  });
  return entry.promise;
 }
 function candidates(container,selector){
  const found=[];if(container.nodeType!==1||container.namespaceURI==='http://www.w3.org/2000/svg')return found;
  if(container.matches(selector))found.push(container);
  found.push(...container.querySelectorAll(selector));return found;
 }
 function scan(container,critical){
  // Keep URL/visibility reads ahead of every fade-class write. Detail
  // backgrounds already declare their URL inline; resolving their computed
  // style after a details insertion would flush the entire moving sheet.
  const artwork=[];let criticalCount=critical?.length||0;
  for(const node of candidates(container,images+','+backgrounds)){
   if(nativeTabletPoster(node)||seen.has(node)||node.closest('.svHeroSpill,.svWelcomeSpill')||still())continue;
   let url;
   if(node.tagName!=='IMG'){
    const match=value=>value.match(/url\(["']?(.*?)["']?\)/)?.[1];
    // Catalog heroes select responsive sources through CSS. Only the
    // detail backdrop has an invariant inline source across breakpoints.
    url=(node.matches('.svDetailBackdrop')?match(node.style.backgroundImage):null)||match(getComputedStyle(node).backgroundImage);
    if(!url)continue;
   }
   let visible=false;
   if(critical&&(criticalCount<8||!entering)){const box=node.getBoundingClientRect();visible=!!(box.width&&box.height&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth);if(visible)criticalCount++;}
   artwork.push({node,url,visible});
  }
  for(const {node,url,visible} of artwork){const promise=asset(node,url,!!critical&&!entering&&visible);if(promise&&critical&&visible&&critical.length<8)critical.push(promise);}
  for(const node of candidates(container,copy)){
   if(still()||node.classList.contains('svArtworkCopy'))continue;
   node.classList.add('svArtworkCopy');ready(node);
  }
 }
 function observe(){
  observer.observe(document.body,{childList:true,subtree:true});
  bodyObserved=false;syncSettings();
 }
 function boot(){
  if(booted)return;booted=true;
  document.removeEventListener('readystatechange',parsed);
  document.removeEventListener('DOMContentLoaded',boot);
  if(still()){reveal(true);return;}
  const critical=[];scan(document.body,critical);
  observer=new MutationObserver(records=>{
   for(const record of records){
    for(const node of record.removedNodes)for(const removed of candidates(node,'img,'+backgrounds+',.svArtworkCopy')){seen.get(removed)?.cancel();seen.delete(removed);held.delete(removed);}
    for(const node of record.addedNodes)scan(node);
   }
  });
  observe();
  // FontFaceSet.ready also waits for document loading, including deferred
  // scripts. Wait only for requested font files, independently of that gate.
  const fonts=Array.from(document.fonts||[]).filter(face=>face.status==='loading').map(face=>face.loaded);
  Promise.allSettled([...critical,...fonts,layout]).then(async()=>{
   if(!document?.body||!entering||suspended)return;
   // Hydration and first-paint controllers can add visible artwork or select
   // another font. Finish those assets behind the same curtain.
   const settled=[];
   for(const node of candidates(document.body,images+','+backgrounds)){
    if(settled.length>=8)break;
    const entry=seen.get(node);if(!entry)continue;
    const box=node.getBoundingClientRect();
    if(box.width&&box.height&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth)settled.push(entry.promise);
   }
   await Promise.allSettled([...settled,...Array.from(document.fonts||[]).filter(face=>face.status==='loading').map(face=>face.loaded)]);
   if(!document?.body||!entering||suspended)return;
   // Give cached artwork a painted black starting frame, without a minimum
   // loading duration or a per-frame animation loop.
   frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>reveal());});
  });
 }
 function parsed(){if(document.readyState!=='loading')boot();}
 // Interactive means the server document is parsed, before deferred scripts
 // finish. Optional application downloads do not own the entry curtain.
 if(document.readyState==='loading'){
  document.addEventListener('readystatechange',parsed);
  document.addEventListener('DOMContentLoaded',boot,{once:true});
 }else boot();
 window.addEventListener('keydown',event=>{if(event.key==='Escape')reveal(true);});
 motion.addEventListener?.('change',()=>{if(motion.matches)reveal(true);});
 window.addEventListener('pagehide',()=>{
  suspended=true;reveal(true);clearTimeout(finishTimer);finishTimer=0;root.dataset.svArtworkState='ready';
  for(const node of document.querySelectorAll('.svArtworkAsset,.svArtworkCopy'))node.classList.add('svArtworkReady');
  observer?.disconnect();settings?.disconnect();for(const cancel of pending.values())cancel();pending.clear();held.clear();
 });
 window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;if(observer){scan(document.body);observe();}}});
}

module.exports=require('terser').minify_sync('('+artworkEntry.toString()+')();',{ecma:2020}).code;
