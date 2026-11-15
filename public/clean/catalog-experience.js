/* Small progressive enhancements; forms and page navigation remain native. */
(() => {
 'use strict';
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion')||document.body.dataset.stPageMotion==='false';
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
