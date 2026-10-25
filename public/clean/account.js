/* Server identity; browser storage is only a partitioned library cache. */
(() => {
 'use strict';if(window.SwiflyAccount)return;
 const ownerKey='swiflytv.accountOwner',prefix='swiflytv.deviceState.',libraryBasePrefix='swiflytv.pendingLibraryBase.';
 const allowed=k=>['swiflytv.profiles','movieverse.watchlist','movieverse.liked','movieverse.continue'].includes(k)||/^swiflytv\.(?:resume|continue|library)\.[A-Za-z0-9_.:-]{1,100}$/.test(k);
 const keys=()=>Object.keys(localStorage).filter(allowed);
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
 let user=null,accountEpoch=0,lifecycleEpoch=0,authenticating=false,revision=0,baseline={},applying=false,writing=false,timer=0,stopped=false,validating=null,readyResolve;
 const ready=new Promise(resolve=>{readyResolve=resolve;});
 async function request(route,{method,body,signal,keepalive=false}={}){
  const controller=signal?null:new AbortController(),timeout=controller?setTimeout(()=>controller.abort(),12000):0;
  try{const response=await fetch('/api/connect'+route,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',keepalive,headers:{Accept:'application/json',...(user?{'X-Swifly-Account':user.id}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:signal||controller.signal});const data=await response.json();if(!response.ok){if(route!=='/session'&&['account_changed','signin_required'].includes(data.code)){suspend();Promise.resolve().then(revalidate).catch(()=>{});}throw Object.assign(Error(data.message||'Please try again.'),{status:response.status,current:data.current,code:data.code});}return data;}
  finally{clearTimeout(timeout);}
 }
 function snapshot(){const result={};try{for(const k of keys())result[k]=read(k,null);}catch{}return result;}
 function activate(next){
  try{
   const current=localStorage.getItem(ownerKey);
   if(current!==(next?.id||null)){
    const old=snapshot();old['swiflytv.activeProfile']=read('swiflytv.activeProfile',null);if(Object.keys(old).length>1)localStorage.setItem(prefix+(current||'legacy'),JSON.stringify(old));
    for(const k of keys())localStorage.removeItem(k);localStorage.removeItem('swiflytv.activeProfile');
    const saved=next?read(prefix+next.id,{}):{};for(const[k,v]of Object.entries(saved))if(allowed(k)||k==='swiflytv.activeProfile')localStorage.setItem(k,JSON.stringify(v));
   }
   localStorage.removeItem('swiflytv.accounts');localStorage.removeItem('dropstream.accounts');
   if(next){localStorage.setItem(ownerKey,next.id);localStorage.setItem('swiflytv.session',JSON.stringify(next));if(!read('swiflytv.profiles',null))localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:next.name||'Main',mode:'standard',avatar:{type:'preset',id:'orbit'}},{id:'kids',name:'Kids',mode:'kids',avatar:{type:'preset',id:'luna'}}]));}
   else{localStorage.removeItem(ownerKey);localStorage.removeItem('swiflytv.session');}
  }catch{}
  accountEpoch++;user=next;writing=false;revision=0;baseline={};clearTimeout(timer);paintIdentity();publishState();
 }
 function paintIdentity(){
  for(const menu of document.querySelectorAll('.dsProfileDropdown')){
   menu.querySelectorAll('.dsDropdownUser,.dsDropdownLogout').forEach(n=>n.remove());
   if(user){menu.querySelectorAll('a[href="/login"],a[href="/signup"]').forEach(n=>n.remove());const identity=document.createElement('div');identity.className='dsDropdownUser';const icon=document.createElement('span'),name=document.createElement('b'),handle=document.createElement('small');icon.textContent=Array.from(user.name||'?')[0];name.textContent=user.name;handle.textContent='@'+user.handle;identity.append(icon,name,handle);menu.prepend(identity);const logout=document.createElement('button');logout.type='button';logout.dataset.accountLogout='';logout.className='dsDropdownLogout';logout.textContent='Log out';menu.append(logout);}
   else if(!menu.querySelector('a[href="/login"]')){for(const [text,href]of [['Log in','/login'],['Sign up','/signup']]){const link=document.createElement('a');link.href=href;const label=document.createElement('b');label.textContent=text;link.append(label);menu.prepend(link);}}
  }
 }
 function applyRemote(state){
  applying=true;
  try{for(const[k,v]of Object.entries(state||{}))if(allowed(k))localStorage.setItem(k,JSON.stringify(v));baseline=snapshot();}
  finally{applying=false;}
  publishState();
 }
 function rebase(remote,local,base,pending={}){
  const dirty={...pending,...Object.fromEntries(Object.entries(local).filter(([k,v])=>Object.prototype.hasOwnProperty.call(base,k)&&JSON.stringify(v)!==JSON.stringify(base[k])))};
  for(const[key,value]of Object.entries(dirty))if(/^swiflytv\.library\./.test(key)&&key!=='swiflytv.library.__compat__'&&value?.version===1&&remote[key]?.version===1&&window.SwiflyLibrary?.reconcile)dirty[key]=window.SwiflyLibrary.reconcile(base[key],value,remote[key]);
  return {...remote,...dirty};
 }
 function publishState(){const previous=applying;applying=true;try{document.dispatchEvent(new Event('swifly:account-hydrated'));window.dispatchEvent(new Event('swifly:continue-change'));window.SwiflyProfiles?.mount?.();window.syncLibraryButtons?.();}finally{applying=previous;}}
 function suspend(){stopped=true;lifecycleEpoch++;validating=null;clearTimeout(timer);document.dispatchEvent(new Event('swifly:account-suspended'));document.querySelectorAll('.dsDropdownUser').forEach(n=>n.remove());}
 async function revalidate(){
  if(validating)return validating;const token=accountEpoch,lifecycle=lifecycleEpoch;
  const job=(async()=>{const session=await request('/session');if(token!==accountEpoch||lifecycle!==lifecycleEpoch)return session;if((session.user?.id||null)!==(user?.id||null))activate(session.user||null);else{user=session.user||null;paintIdentity();}stopped=false;if(user)await refreshState();if(lifecycle===lifecycleEpoch)publishState();return session;})();validating=job;
  try{return await job;}finally{if(validating===job)validating=null;}
 }
 async function refreshState(){
  if(!user||writing||stopped||authenticating)return;const token=accountEpoch,lifecycle=lifecycleEpoch;
  const remote=await request('/state');if(token!==accountEpoch||lifecycle!==lifecycleEpoch||stopped)return;if(remote.revision===revision&&Object.keys(baseline).length)return;
  const local=snapshot(),pending=read('swiflytv.pendingState.'+user.id,{}),base={...read(libraryBasePrefix+user.id,{}),...baseline};
  revision=remote.revision;const merged=rebase(remote.state,local,base,pending);applyRemote(merged);baseline=structuredClone(remote.state);schedule();
 }
 function cachePending(){
  try{
   const pending=Object.fromEntries(Object.entries(snapshot()).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(baseline[k]))),bases=Object.fromEntries(Object.entries(pending).filter(([k,v])=>/^swiflytv\.library\./.test(k)&&k!=='swiflytv.library.__compat__'&&v?.version===1).map(([k])=>[k,baseline[k]||null]));
   if(Object.keys(pending).length)localStorage.setItem('swiflytv.pendingState.'+user.id,JSON.stringify(pending));else localStorage.removeItem('swiflytv.pendingState.'+user.id);
   if(Object.keys(bases).length)localStorage.setItem(libraryBasePrefix+user.id,JSON.stringify(bases));else localStorage.removeItem(libraryBasePrefix+user.id);
  }catch{}
 }
 function schedule(){if(applying||!user||stopped||authenticating)return;cachePending();clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),1800);}
 async function sync({keepalive=false}={}){
  if(!user||writing||applying||stopped||authenticating)return;const token=accountEpoch,lifecycle=lifecycleEpoch,base=structuredClone(baseline);const local=snapshot(),patch=Object.fromEntries(Object.entries(local).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(baseline[k])));if(!Object.keys(patch).length)return;
  writing=true;
  try{const response=await request('/state',{method:'PATCH',body:{revision,patch},keepalive:keepalive&&JSON.stringify(patch).length<60000});if(token!==accountEpoch||lifecycle!==lifecycleEpoch)return;revision=response.revision;for(const[k,v]of Object.entries(patch))baseline[k]=v;cachePending();}
  catch(e){if(token!==accountEpoch||lifecycle!==lifecycleEpoch)return;if(e.status===409&&e.current){revision=e.current.revision;const latest=snapshot();applyRemote(rebase(e.current.state,latest,base,Object.fromEntries(Object.keys(patch).map(key=>[key,latest[key]]))));baseline=structuredClone(e.current.state);schedule();}throw e;}
  finally{if(token===accountEpoch)writing=false;}
 }
 async function importLegacy(){const data=read(prefix+'legacy',null);if(!data)throw Error('There is no earlier library on this browser.');applyRemote({...snapshot(),...Object.fromEntries(Object.entries(data).filter(([k])=>allowed(k)))});baseline={};await sync();localStorage.removeItem(prefix+'legacy');}
 function authForm(){const form=document.getElementById('safeAuthForm')||document.getElementById('dsAuthForm');if(!form)return;
  const mode=form.closest('[data-auth-mode]')?.dataset.authMode||document.querySelector('.svAuthSignupPage')&&'signup'||'login';
  const toggle=form.querySelector('[data-auth-toggle-password]');toggle?.addEventListener('click',()=>{const input=form.elements.namedItem('password'),show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password');toggle.setAttribute('aria-pressed',String(show));});
  form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('[type=submit]'),output=form.querySelector('[data-auth-error]');if(submit.disabled)return;submit.disabled=true;authenticating=true;clearTimeout(timer);if(output)output.hidden=true;
   try{const values=Object.fromEntries(new FormData(form)),response=await request('/auth/'+mode,{body:values});activate(response.user);authenticating=false;await refreshState();const target=new URLSearchParams(location.search).get('redirect')||'/profiles';location.assign(/^\/(?!\/)/.test(target)&&!/[\\\r\n]/.test(target)?target:'/profiles');}
   catch(e){if(output){output.textContent=e.message;output.hidden=false;}else window.showToast?.(e.message);}
   finally{submit.disabled=false;authenticating=false;}
  });
 }
 async function boot(){
  authForm();try{localStorage.removeItem('swiflytv.accounts');localStorage.removeItem('dropstream.accounts');}catch{}
  document.addEventListener('click',async event=>{const b=event.target.closest('[data-account-logout],.dsDropdownLogout,#logoutBtn');if(!b)return;event.preventDefault();event.stopImmediatePropagation();b.disabled=true;try{await request('/auth/logout',{body:{}});activate(null);location.assign('/login');}catch(e){window.showToast?.(e.message);b.disabled=false;}},true);
  try{const session=await request('/session');if(session.user){activate(session.user);await refreshState();schedule();}else if(localStorage.getItem(ownerKey))activate(null);else{try{localStorage.removeItem('swiflytv.session');}catch{}paintIdentity();}readyResolve(session);}
  catch(e){readyResolve({user:null,available:false,message:e.message});}
 }
 for(const name of ['swifly:continue-change','swifly:library-change','storage'])window.addEventListener(name,schedule);
 document.addEventListener('swifly:profile-changed',schedule);document.addEventListener('visibilitychange',()=>{if(document.hidden)sync().catch(()=>{});else revalidate().catch(()=>{});});
 window.addEventListener('storage',event=>{if(event.key===ownerKey&&user&&event.newValue!==user.id)location.reload();});
 window.addEventListener('pagehide',()=>{schedule();clearTimeout(timer);sync({keepalive:true}).catch(()=>{});suspend();});window.addEventListener('pageshow',e=>{if(e.persisted)revalidate().catch(()=>{});});
 window.SwiflyAccount=Object.freeze({ready,request,activate,revalidate,refreshState,sync,importLegacy,snapshot,get user(){return user;}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
