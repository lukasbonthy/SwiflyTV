/* Entry presentation only. Room creation, permissions and media belong to party.js. */
(() => {
 'use strict';
 const app=document.querySelector('.svPartyHub'),tabs=app?.querySelector('[data-party-entry-tabs]');
 if(!tabs||tabs.dataset.ready==='true')return;
 const buttons=[...tabs.querySelectorAll('[data-party-entry]')],panels=[...app.querySelectorAll('[data-party-entry-panel]')];
 if(buttons.length!==2||panels.length!==2)return;
 function show(mode,focus=false){
  for(const panel of panels)panel.hidden=panel.dataset.partyEntryPanel!==mode;
  for(const button of buttons){const active=button.dataset.partyEntry===mode;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();}
 }
 tabs.dataset.ready='true';tabs.hidden=false;show('create');
 tabs.addEventListener('click',event=>{const button=event.target.closest('[data-party-entry]');if(button&&!button.disabled)show(button.dataset.partyEntry);});
 tabs.addEventListener('keydown',event=>{
  const index=buttons.indexOf(event.target);if(index<0||event.altKey||event.ctrlKey||event.metaKey)return;
  let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;
  event.preventDefault();show(buttons[next].dataset.partyEntry,true);
 });
 // The core handler scrolls and focuses its field on this same click.
 app.addEventListener('click',event=>{
  const button=event.target.closest('button');if(button?.disabled)return;
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='native-join-room')show('join');
  else if(action==='native-create-party'||event.target.closest('[data-party-featured-id],[data-party-lobby-movie-id]'))show('create');
 },true);
})();
