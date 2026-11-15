/* Parent controls intentionally keep passwords out of URLs and browser storage. */
(() => {
 'use strict';
 const root=document.querySelector('[data-kids-root]');if(!root||root.dataset.kidsReady)return;root.dataset.kidsReady='true';
 const dialog=root.querySelector('[data-kids-parent-dialog]'),form=root.querySelector('[data-kids-parent-form]'),submit=root.querySelector('[data-kids-parent-submit]');
 if(!dialog||!form||!submit)return;
 let status={configured:root.dataset.kidsConfigured==='true',locked:root.dataset.kidsLocked==='true',available:root.dataset.kidsAvailable==='true',recoveryRequired:root.dataset.kidsRecovery==='true'},previousFocus=null,controller=null,disposed=false,generation=0;
 const input=root.querySelector('[data-kids-password]'),confirm=root.querySelector('[data-kids-confirm]'),error=root.querySelector('[data-kids-parent-error]');
 function clear(){input.value='';confirm.value='';error.hidden=true;error.textContent='';}
 function reconcile(value){
  if(disposed||!value||typeof value.locked!=='boolean'||typeof value.configured!=='boolean')return;
  if(['configured','locked','available','recoveryRequired'].every(key=>status[key]===value[key]))return;
  generation++;controller?.abort();controller=null;status={...status,...value};clear();
  Object.assign(root.dataset,{kidsConfigured:String(status.configured),kidsLocked:String(status.locked),kidsAvailable:String(status.available),kidsRecovery:String(status.recoveryRequired)});
  const setup=!status.configured,unlock=status.configured&&status.locked;
  root.querySelector('[data-kids-parent-title]').textContent=setup?'Set up parent controls':unlock?'Unlock Kids':'Lock Kids';
  root.querySelector('[data-kids-parent-copy]').textContent=status.recoveryRequired?'The parent lock cannot be verified. This browser stays in Kids until it can be restored.':!status.available?'Parent controls are temporarily unavailable.':setup?'Set a parent password to keep this browser in Kids. You’ll need it to leave, even after refreshing or switching profiles.':unlock?'Enter your parent password to leave Kids and return to SwiflyTV.':'Lock this browser in Kids with your existing parent password.';
  root.querySelector('[data-kids-password-fields]').hidden=!setup&&!unlock||status.recoveryRequired||!status.available;
  root.querySelector('[data-kids-confirm-wrap]').hidden=!setup;
  input.autocomplete=setup?'new-password':'current-password';input.placeholder=setup?'At least 8 characters':'';
  root.querySelector('label[for="kids-parent-password"]').textContent=setup?'Choose a parent password':'Parent password';
  submit.querySelector('span').textContent=setup?'Set password & enter Kids':unlock?'Unlock SwiflyTV':'Lock Kids';
  submit.disabled=!status.available||status.recoveryRequired;form.removeAttribute('aria-busy');
  const label=root.querySelector('.kidsLockStatus > span');if(label)label.textContent=status.locked?'Kids is locked':'Verified age ratings';
 }
 document.addEventListener('swifly:kids-status',event=>reconcile(event.detail));
 function open(){if(disposed||dialog.open)return;clear();previousFocus=document.activeElement;dialog.showModal();setTimeout(()=>{if(dialog.open&&!input.closest('[hidden]'))input.focus();},40);}
 function close(){if(controller)return;dialog.close();}
 root.querySelector('[data-kids-parent-open]')?.addEventListener('click',open);
 root.querySelector('[data-kids-parent-close]')?.addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{if(controller)event.preventDefault();});
 dialog.addEventListener('close',()=>{clear();if(previousFocus?.isConnected)previousFocus.focus();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(controller||!status.available||status.recoveryRequired)return;
  const action=!status.configured?'setup':status.locked?'unlock':'lock',body=action==='lock'?{}:{password:input.value,...(action==='setup'?{confirm:confirm.value}:{})};
  if(action==='setup'&&(Array.from(body.password).length<8||body.password!==body.confirm)){error.textContent='Choose at least 8 characters and enter the same password twice.';error.hidden=false;return;}
  controller=new AbortController();const active=controller,token=++generation;submit.disabled=true;form.setAttribute('aria-busy','true');error.hidden=true;const timeout=setTimeout(()=>active.abort(),18000);
  try{
   const response=await fetch('/api/kids/'+action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'}),data=await response.json();
   if(disposed||token!==generation)return;if(!response.ok)throw Error(data.message||'Parent controls could not update. Try again.');
   clear();status={...status,...data};window.SwiflyKids?.publish?.(data.locked);location.replace(action==='unlock'?'/':'/kids');
  }catch(reason){if(!disposed&&token===generation){error.textContent=reason.name==='AbortError'?'That took too long. Check your connection and try again.':reason.message||'Parent controls could not update. Try again.';error.hidden=false;input.value='';confirm.value='';if(action!=='lock')input.focus();}}
  finally{clearTimeout(timeout);if(token===generation){controller=null;if(!disposed){submit.disabled=!status.available||status.recoveryRequired;form.removeAttribute('aria-busy');}}}
 });
 window.addEventListener('pagehide',()=>{disposed=true;generation++;controller?.abort();controller=null;clear();});
 window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;submit.disabled=!status.available||status.recoveryRequired;form.removeAttribute('aria-busy');}});
 if(root.dataset.kidsParentRequested==='true')open();
 window.SwiflyKidsPage=Object.freeze({openParent:open});
})();
