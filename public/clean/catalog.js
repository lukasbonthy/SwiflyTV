/* Catalog controls follow their own rail, without work on page scrolling. */
(() => {
 'use strict';
 function boot(){
  const rails=new Map(),dirty=new Set();let frame=0,suspended=false;
  function flush(){
   frame=0;
   // Read all geometry before updating controls to avoid layout interleaving.
   const updates=[...dirty].map(rail=>({rail,max:Math.max(0,rail.scrollWidth-rail.clientWidth),left:rail.scrollLeft}));dirty.clear();
   for(const {rail,max,left}of updates){
    const {controls,previous,next}=rails.get(rail);
    if(max<=1&&controls.contains(document.activeElement))rail.querySelector('a,button')?.focus({preventScroll:true});
    controls.hidden=max<=1;previous.setAttribute('aria-disabled',String(left<=1));next.setAttribute('aria-disabled',String(left>=max-1));
   }
  }
  function queue(rail){if(suspended||!rails.has(rail))return;dirty.add(rail);if(!frame)frame=requestAnimationFrame(flush);}
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{for(const {target}of entries)queue(target);}):null;
  for(const section of document.querySelectorAll('.dsRow')){
   const rail=section.querySelector('.movieRail,.dsRail,.nfTopTenRail'),controls=section.querySelector('.dsRowControls');
   const [previous,next]=controls?.querySelectorAll('button')||[];if(!rail||!previous||!next)continue;
   controls.addEventListener('click',event=>{if(event.target.closest('button')?.getAttribute('aria-disabled')==='true'){event.preventDefault();event.stopImmediatePropagation();}},true);
   rails.set(rail,{controls,previous,next});rail.addEventListener('scroll',()=>queue(rail),{passive:true});resize?.observe(rail);queue(rail);
  }
  if(!resize)window.addEventListener('resize',()=>{for(const rail of rails.keys())queue(rail);},{passive:true});
  // Retain the text box when artwork arrives so wrapped titles never jump.
  for(const image of document.querySelectorAll('.dsHeroLogo')){
   const title=image.closest('h1'),loaded=()=>title?.classList.toggle('hasLogo',image.naturalWidth>0);
   image.addEventListener('load',loaded);image.addEventListener('error',()=>title?.classList.remove('hasLogo'));if(image.complete)loaded();
  }
  window.addEventListener('pagehide',()=>{suspended=true;cancelAnimationFrame(frame);frame=0;dirty.clear();resize?.disconnect();});
  window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;for(const rail of rails.keys()){resize?.observe(rail);queue(rail);}}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
