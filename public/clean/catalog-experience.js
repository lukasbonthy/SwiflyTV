/* Small progressive enhancements; forms and page navigation remain native. */
(() => {
 'use strict';
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion')||document.body.dataset.stPageMotion==='false';
 const controls=[];
 for(const picker of document.querySelectorAll('details[data-movie-periods]')){
  const trigger=picker.querySelector('summary'),menu=picker.querySelector('.svPeriodMenu'),links=[...menu.querySelectorAll('a')];
  let desired=picker.open,frame=0,timer=0,request=0,abort;
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
   menu.addEventListener('click',async event=>{
    const link=event.target.closest('a');if(!link||!row||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const period=new URL(link.href).searchParams.get(parameter);if(!['today','week','month'].includes(period))return;
    event.preventDefault();const generation=++request;abort?.abort();abort=new AbortController();const controller=abort;show(false,true);row.setAttribute('aria-busy','true');
    let status=row.querySelector('[data-period-status]');if(!status){status=document.createElement('p');status.className='svPeriodStatus';status.dataset.periodStatus='';status.setAttribute('role','status');row.append(status);}status.textContent='';
    const excluded=[...document.querySelectorAll('.svCatalogRow:not([aria-busy]) .movieCard')].filter(card=>!row.contains(card)).map(card=>card.querySelector('[data-play-id]')).filter(control=>control?.dataset.playType===kind).map(control=>control.dataset.playId).filter(id=>/^[1-9]\d*$/.test(id||'')).slice(0,160);
    const query=new URLSearchParams({type:kind,period,exclude:excluded.join(',')});
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
     const response=await fetch('/api/catalog/period-row?'+query,{signal:controller.signal});const data=await response.json();
     if(!response.ok||typeof data.html!=='string'||!Array.isArray(data.cards))throw Error('This row could not refresh. Try again.');
     if(generation!==request||!row.isConnected)return;
     const rail=row.querySelector('.movieRail'),replace=new CustomEvent('swifly:rail-replace',{bubbles:true,cancelable:true,detail:{cards:data.cards}});
     rail.dispatchEvent(replace);if(!replace.defaultPrevented){rail.innerHTML=data.html;rail.scrollLeft=0;window.syncLibraryButtons?.(rail);window.syncWatchButtons?.(rail);}
     trigger.querySelector('span').textContent=link.textContent.trim();trigger.setAttribute('aria-label',row.querySelector('h2').textContent+' period: '+link.textContent.trim());
     for(const choice of links){if(choice===link)choice.setAttribute('aria-current','page');else choice.removeAttribute('aria-current');}
     const more=row.querySelector('.svRowMore');if(more&&data.viewHref)more.href=data.viewHref;
     const next=new URL(location.href);next.searchParams.set(parameter,period);history.replaceState(history.state,'',next.pathname+next.search+next.hash);
     for(const other of document.querySelectorAll('[data-period-refresh]'))for(const choice of other.querySelectorAll('.svPeriodMenu a')){const u=new URL(choice.href);u.searchParams.set(parameter,period);if(other===picker)u.searchParams.set(parameter,new URL(choice.href).searchParams.get(parameter));choice.href=u.pathname+u.search;}
     status.textContent=data.html?'':'No titles for this period. Try another option.';
    }catch(error){if(generation===request){status.textContent=error.name==='AbortError'?'This row took too long to load. Try again.':error.message||'This row could not refresh. Try again.';}}
    finally{clearTimeout(timeout);if(generation===request)row.removeAttribute('aria-busy');}
   });
   window.addEventListener('pagehide',()=>{++request;abort?.abort();});
  }
  controls.push({picker,close:()=>show(false)});
 }
 if(controls.length){
  document.addEventListener('pointerdown',event=>{for(const control of controls)if(!control.picker.contains(event.target))control.close();});
  document.addEventListener('focusin',event=>{for(const control of controls)if(!control.picker.contains(event.target))control.close();});
 }
 const root=document.querySelector('.svLanguagePage'),input=root?.querySelector('[data-language-search]');
 if(!input)return;
 const cards=[...root.querySelectorAll('[data-language-name]')],count=root.querySelector('[data-language-count]'),empty=root.querySelector('[data-language-empty]');
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
 function filter(){const query=normalize(input.value);let visible=0;for(const card of cards){const match=!query||normalize(card.dataset.languageName).includes(query);card.hidden=!match;if(match)visible++;}if(empty)empty.hidden=visible>0;if(count)count.textContent=visible+' '+(visible===1?'language':'languages')+(query?' found':' to explore');}
 input.addEventListener('input',filter);filter();
})();
