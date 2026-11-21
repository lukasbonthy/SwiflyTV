/* Small progressive enhancements; forms and page navigation remain native. */
(() => {
 'use strict';
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion')||document.body.dataset.stPageMotion==='false';
 const validId=id=>/^[1-9]\d{0,9}$/.test(id);
 const relativeUrl=url=>url.pathname+url.search+url.hash;
 const controls=[];
 for(const picker of document.querySelectorAll('details[data-movie-periods]')){
  const trigger=picker.querySelector('summary'),menu=picker.querySelector('.svPeriodMenu'),links=[...menu.querySelectorAll('a')];
  let desired=picker.open,frame=0,timer=0;
  picker.dataset.periodEnhanced='true';picker.dataset.periodState=desired?'open':'closed';trigger.setAttribute('aria-expanded',String(desired));menu.inert=!desired;
  const finishClose=()=>{if(!desired){picker.open=false;picker.dataset.periodState='closed';}};
  function show(open,focus=false){
   if(!open&&!desired&&!picker.open)return;
   cancelAnimationFrame(frame);clearTimeout(timer);desired=open;trigger.setAttribute('aria-expanded',String(open));menu.inert=!open;
   if(open){
    for(const other of controls)if(other.picker!==picker)other.close();
    picker.open=true;
    const left=picker.getBoundingClientRect().left,width=menu.offsetWidth;
    menu.style.setProperty('--sv-period-shift',Math.max(18-left,Math.min(0,window.innerWidth-18-left-width))+'px');
    if(reduced())picker.dataset.periodState='open';
    else{picker.dataset.periodState='opening';frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{if(desired)picker.dataset.periodState='open';});});}
    if(focus)(links.find(link=>link.getAttribute('aria-current')==='page')||links[0])?.focus();
   }else{
    picker.dataset.periodState='closed';
    if(focus)trigger.focus({preventScroll:true});
    if(reduced())finishClose();else timer=setTimeout(finishClose,150);
   }
  }
  trigger.addEventListener('click',event=>{event.preventDefault();show(!desired);});
  picker.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&desired){event.preventDefault();event.stopPropagation();show(false,true);return;}
   const index=links.indexOf(document.activeElement),keys=['ArrowDown','ArrowUp','Home','End'];
   if(!keys.includes(event.key))return;
   if(document.activeElement===trigger){event.preventDefault();show(true,true);return;}
   if(index<0||!desired)return;
   event.preventDefault();links[event.key==='Home'?0:event.key==='End'?links.length-1:(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();
  });
  menu.addEventListener('transitionend',event=>{if(event.target===menu&&event.propertyName==='opacity')finishClose();});
  if(picker.dataset.periodRefresh){
   const row=picker.closest('[data-period-row]'),parameter=picker.dataset.periodParameter,kind=picker.dataset.periodRefresh;
   const home=picker.closest('[data-st-home]')||document;
   let request=0,timeout=0,abort;
   function clearPending(){
    ++request;
    clearTimeout(timeout);abort?.abort();abort=undefined;
    row?.removeAttribute('aria-busy');
    const status=row?.querySelector('[data-period-status]');if(status)status.textContent='';
   }
   menu.addEventListener('click',async event=>{
    const link=event.target.closest('a');if(!link||!row||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const period=new URL(link.href).searchParams.get(parameter);if(!['today','week','month'].includes(period))return;
    event.preventDefault();const generation=++request;clearTimeout(timeout);abort?.abort();const controller=new AbortController();abort=controller;show(false,true);row.setAttribute('aria-busy','true');
    let status=row.querySelector('[data-period-status]');if(!status){status=document.createElement('p');status.className='svPeriodStatus';status.dataset.periodStatus='';status.setAttribute('role','status');row.append(status);}status.textContent='';
    const excluded=new Set();
    const hero=home.querySelector(`.dsHero [data-play-id][data-play-type="${kind}"]`);
    if(hero&&validId(hero.dataset.playId))excluded.add(hero.dataset.playId);
    for(const neighbor of home.querySelectorAll(`[data-catalog-ids][data-catalog-type="${kind}"]`)){
     if(neighbor===row)continue;
     for(const id of neighbor.dataset.catalogIds.split(','))if(validId(id))excluded.add(id);
    }
    const query=new URLSearchParams({type:kind,period,exclude:[...excluded].slice(0,160).join(',')});
    timeout=setTimeout(()=>controller.abort(),12000);
    try{
     const response=await fetch('/api/catalog/period-row?'+query,{signal:controller.signal});
     if(generation!==request||!row.isConnected)return;
     const data=await response.json();
     if(generation!==request||!row.isConnected)return;
     if(controller.signal.aborted)throw new DOMException('Period refresh aborted','AbortError');
     if(!response.ok||typeof data.html!=='string'||!Array.isArray(data.cards))throw Error('This row could not refresh. Try again.');
     let ids=data.ids;
     if(!Array.isArray(ids)){
      // Older responses still carry every identity in the full row markup.
      const fragment=document.createElement('template');fragment.innerHTML=data.html;
      ids=[...fragment.content.querySelectorAll(`[data-play-id][data-play-type="${kind}"]`)].map(control=>control.dataset.playId);
     }
     ids=ids.map(String).filter(validId);
     const rail=row.querySelector('.movieRail'),replace=new CustomEvent('swifly:rail-replace',{bubbles:true,cancelable:true,detail:{cards:data.cards,ids}});
     rail.dispatchEvent(replace);
     if(!replace.defaultPrevented){
      rail.innerHTML=data.html;rail.scrollLeft=0;
      row.dataset.catalogIds=ids.join(',');row.dataset.catalogType=kind;
      window.syncLibraryButtons?.(rail);window.syncWatchButtons?.(rail);
     }
     trigger.querySelector('span').textContent=link.textContent.trim();trigger.setAttribute('aria-label',row.querySelector('h2').textContent+' period: '+link.textContent.trim());
     for(const choice of links){if(choice===link)choice.setAttribute('aria-current','page');else choice.removeAttribute('aria-current');}
     const more=row.querySelector('.svRowMore');if(more&&data.viewHref)more.href=data.viewHref;
     const next=new URL(location.href);next.searchParams.set(parameter,period);history.replaceState(history.state,'',relativeUrl(next));
     const homeSelections=new URL(link.href).searchParams;
     for(const other of home.querySelectorAll('[data-home-period]')){
      if(other.dataset.periodParameter!==parameter)for(const choice of other.querySelectorAll('.svPeriodMenu a')){
       const url=new URL(choice.href);url.searchParams.set(parameter,period);choice.href=relativeUrl(url);
      }
      const view=other.closest('[data-period-row]')?.querySelector('.svRowMore');
      if(view){
       const url=new URL(view.href);
       for(const [key,value] of homeSelections)url.searchParams.set(key,value);
       view.href=relativeUrl(url);
      }
     }
     status.textContent=data.html?'':'No titles for this period. Try another option.';
    }catch(error){if(generation===request){status.textContent=error.name==='AbortError'?'This row took too long to load. Try again.':error.message||'This row could not refresh. Try again.';}}
    finally{if(generation===request){clearTimeout(timeout);abort=undefined;row.removeAttribute('aria-busy');}}
   });
   window.addEventListener('pagehide',clearPending);
   window.addEventListener('pageshow',event=>{if(event.persisted)clearPending();});
  }
  controls.push({picker,close:()=>show(false)});
 }
 if(controls.length){
  document.addEventListener('pointerdown',event=>{for(const control of controls)if(!control.picker.contains(event.target))control.close();});
  document.addEventListener('focusin',event=>{for(const control of controls)if(!control.picker.contains(event.target))control.close();});
 }
 function onArtworkFailure(image,fallback){
  function fail(){
   image.removeEventListener('error',fail);
   fallback();
  }
  image.addEventListener('error',fail);
  // A failed cached request may have dispatched its error before this script ran.
  if(image.complete&&image.naturalWidth===0&&image.getAttribute('src'))fail();
 }
 for(const feature of document.querySelectorAll('.svMovieNightFeature')){
  const reel=feature.querySelector('.svHomeNightReel');
  reel?.addEventListener('focusin',event=>{
   const link=event.target.closest('a');
   if(!link||reel.scrollWidth<=reel.clientWidth)return;
   requestAnimationFrame(()=>{
    if(document.activeElement!==link)return;
    const card=link.getBoundingClientRect(),rail=reel.getBoundingClientRect();
    const clippedLeft=rail.left+4-card.left,clippedRight=card.right-rail.right+4;
    if(clippedLeft>0)reel.scrollBy({left:-clippedLeft,behavior:'instant'});
    else if(clippedRight>0)reel.scrollBy({left:clippedRight,behavior:'instant'});
   });
  });
  for(const poster of feature.querySelectorAll('img[data-night-event-cover]')){
   const cover=poster.dataset.nightEventCover;
   if(!cover)continue;
   onArtworkFailure(poster,()=>{
    poster.parentElement?.classList.add('isEventPoster');
    delete poster.dataset.nightEventCover;
    poster.removeAttribute('srcset');
    poster.src=cover;
   });
  }
 }
 const root=document.querySelector('.svLanguagePage'),input=root?.querySelector('[data-language-search]');
 if(!input)return;
 const cards=[...root.querySelectorAll('[data-language-name]')],count=root.querySelector('[data-language-count]'),empty=root.querySelector('[data-language-empty]');
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
 function filter(){const query=normalize(input.value);let visible=0;for(const card of cards){const match=!query||normalize(card.dataset.languageName).includes(query);card.hidden=!match;if(match)visible++;}if(empty)empty.hidden=visible>0;if(count)count.textContent=visible+' '+(visible===1?'language':'languages')+(query?' found':' to explore');}
 input.addEventListener('input',filter);filter();
})();
