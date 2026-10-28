/* Server identity; browser storage is only a partitioned library cache. */
(() => {
 'use strict';if(window.SwiflyAccount)return;
 const ownerKey='swiflytv.accountOwner',prefix='swiflytv.deviceState.',libraryBasePrefix='swiflytv.pendingLibraryBase.';
 const allowed=k=>['swiflytv.profiles','movieverse.watchlist','movieverse.liked','movieverse.continue'].includes(k)||/^swiflytv\.(?:resume|continue|library)\.[A-Za-z0-9_.:-]{1,100}$/.test(k);
 const keys=()=>Object.keys(localStorage).filter(allowed);
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
 let user=null,accountEpoch=0,lifecycleEpoch=0,authenticating=false,revision=0,baseline={},applying=false,writing=false,writeJob=null,timer=0,stopped=false,validating=null,readyResolve;
 const ready=new Promise(resolve=>{readyResolve=resolve;});
 async function request(route,{method,body,signal,keepalive=false}={}){
  const controller=signal?null:new AbortController(),timeout=controller?setTimeout(()=>controller.abort(),12000):0;
  try{const response=await fetch('/api/connect'+route,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',keepalive,headers:{Accept:'application/json',...(user?{'X-Swifly-Account':user.id}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:signal||controller.signal});const data=await response.json();if(!response.ok){if(route!=='/session'&&['account_changed','signin_required'].includes(data.code)){suspend();Promise.resolve().then(revalidate).catch(()=>{});}throw Object.assign(Error(data.message||'Please try again.'),{status:response.status,current:data.current,code:data.code});}return data;}
  finally{clearTimeout(timeout);}
 }
 function snapshot(){const result={};try{for(const k of keys())result[k]=read(k,null);}catch{}return result;}
 function storageTransaction(changes){
  const prior=Object.fromEntries(Object.keys(changes).map(k=>[k,localStorage.getItem(k)]));
  try{for(const[k,v]of Object.entries(changes))if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}
  catch(error){let restored=true;for(const k of Object.keys(prior))try{localStorage.removeItem(k);}catch{restored=false;}for(const[k,v]of Object.entries(prior))if(v!==null)try{localStorage.setItem(k,v);}catch{restored=false;}throw Error(restored?'Could not save your current library safely. Browser storage may be full. Keep this page open and export a backup before switching accounts.':'Browser storage could not be restored completely. Keep this page open and export a backup before continuing.',{cause:error});}
 }
 function activate(next){
  try{
   const current=localStorage.getItem(ownerKey);
   const changes={};
   if(current!==(next?.id||null)){
    const old=snapshot();old['swiflytv.activeProfile']=read('swiflytv.activeProfile',null);
    const defaultPrefs={spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:'grid',episodeSort:'oldest'};
    const meaningful=current||Object.entries(old).some(([key,value])=>{
     if(key==='swiflytv.profiles')return Array.isArray(value)&&value.some(p=>!['main','kids'].includes(p?.id)||p.name!==(p.id==='kids'?'Kids':'Main')||p.avatar&&(p.avatar.type!=='preset'||p.avatar.id!==(p.id==='kids'?'luna':'orbit')));
     if(Array.isArray(value))return value.length>0;
     return key.startsWith('swiflytv.library.')&&value?.version===1&&(['watchlist','liked','watched','history','folders','episodeRead'].some(k=>Array.isArray(value[k])&&value[k].length>0)||Object.entries(value.preferences||{}).some(([k,v])=>v!==defaultPrefs[k]));
    });
    if(Object.keys(old).length>1&&meaningful){
     let archive=prefix+(current||'legacy');const encoded=JSON.stringify(old),previous=localStorage.getItem(archive);
     // Earlier guest libraries have no server identity. Keep the original and
     // offer each later guest library explicitly rather than overwriting it.
     if(!current&&previous&&previous!==encoded)archive+='-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
     if(current||!Object.keys(localStorage).some(k=>k.startsWith(prefix+'legacy')&&localStorage.getItem(k)===encoded))changes[archive]=encoded;
     const identity=user?.id===current?user:read('swiflytv.session',null);if(current&&identity?.id===current&&typeof identity.email==='string')changes['swiflytv.deviceOwner.'+current]=JSON.stringify({email:identity.email.toLowerCase()});
    }
    for(const k of keys())changes[k]=null;changes['swiflytv.activeProfile']=null;
    const saved=next?read(prefix+next.id,{}):{};for(const[k,v]of Object.entries(saved))if(allowed(k)||k==='swiflytv.activeProfile')changes[k]=JSON.stringify(v);
   }
   changes['swiflytv.accounts']=null;changes['dropstream.accounts']=null;
   if(next){changes[ownerKey]=next.id;changes['swiflytv.session']=JSON.stringify(next);const existing=Object.prototype.hasOwnProperty.call(changes,'swiflytv.profiles')?changes['swiflytv.profiles']:localStorage.getItem('swiflytv.profiles');if(!existing)changes['swiflytv.profiles']=JSON.stringify([{id:'main',name:next.name||'Main',mode:'standard',avatar:{type:'preset',id:'orbit'}},{id:'kids',name:'Kids',mode:'kids',avatar:{type:'preset',id:'luna'}}]);}
   else{changes[ownerKey]=null;changes['swiflytv.session']=null;}
   storageTransaction(changes);
  }catch(error){suspend();throw error;}
  accountEpoch++;user=next;writing=false;writeJob=null;revision=0;baseline={};clearTimeout(timer);paintIdentity();publishState();
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
  // Replay changes to individual rows. Replacing a dirty array would discard
  // titles or profiles added by another device while the upload was pending.
  function rows(before,after,current,key,progress=false){
   const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),old=new Map((Array.isArray(before)?before:[]).map(v=>[key(v),v])),next=new Map(after.map(v=>[key(v),v])),result=new Map(current.map(v=>[key(v),v]));
   for(const id of old.keys())if(!next.has(id))result.delete(id);
   for(const[id,value]of next){if(same(value,old.get(id)))continue;const existing=result.get(id);if(progress){const at=v=>Date.parse(v?.watchedAt)||0;if(!existing||at(value)>at(existing)||at(value)===at(existing)&&Number(value.currentTime)>=Number(existing.currentTime))result.set(id,value);}
    else{const changed={...existing};for(const[k,v]of Object.entries(value))if(!same(v,old.get(id)?.[k]))changed[k]=v;result.set(id,{...value,...changed});}}
   return[...result.values()];
  }
  if(Array.isArray(dirty['movieverse.continue'])&&Array.isArray(remote['movieverse.continue']))dirty['movieverse.continue']=rows(base['movieverse.continue'],dirty['movieverse.continue'],remote['movieverse.continue'],v=>String(v?.profileId||'main')+':'+String(v?.type||'movie')+':'+String(v?.id||v?.tmdbId||''),true);
  if(Array.isArray(dirty['swiflytv.profiles'])&&Array.isArray(remote['swiflytv.profiles'])){dirty['swiflytv.profiles']=rows(base['swiflytv.profiles'],dirty['swiflytv.profiles'],remote['swiflytv.profiles'],v=>String(v?.id||'name:'+v?.name));if(dirty['swiflytv.profiles'].length>8)throw Error('Another device added profiles during this import. Review your profile destinations again; account data has not been replaced.');}
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
   const pending=Object.fromEntries(Object.entries(snapshot()).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(baseline[k]))),bases=Object.fromEntries(Object.entries(pending).filter(([k,v])=>['movieverse.continue','swiflytv.profiles'].includes(k)||/^swiflytv\.library\./.test(k)&&k!=='swiflytv.library.__compat__'&&v?.version===1).map(([k])=>[k,baseline[k]||null]));
   if(Object.keys(pending).length)localStorage.setItem('swiflytv.pendingState.'+user.id,JSON.stringify(pending));else localStorage.removeItem('swiflytv.pendingState.'+user.id);
   if(Object.keys(bases).length)localStorage.setItem(libraryBasePrefix+user.id,JSON.stringify(bases));else localStorage.removeItem(libraryBasePrefix+user.id);
  }catch{}
 }
 function schedule(){if(applying||!user||stopped||authenticating)return;cachePending();clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),1800);}
 function sync({keepalive=false}={}){
  if(writing)return writeJob;if(!user||applying||stopped||authenticating)return Promise.resolve();const token=accountEpoch,lifecycle=lifecycleEpoch,base=structuredClone(baseline);const local=snapshot(),patch=Object.fromEntries(Object.entries(local).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(baseline[k])));if(!Object.keys(patch).length)return Promise.resolve();
  writing=true;
  const job=(async()=>{try{const response=await request('/state',{method:'PATCH',body:{revision,patch},keepalive:keepalive&&JSON.stringify(patch).length<60000});if(token!==accountEpoch||lifecycle!==lifecycleEpoch)return;revision=response.revision;for(const[k,v]of Object.entries(patch))baseline[k]=v;cachePending();}
  catch(e){if(token!==accountEpoch||lifecycle!==lifecycleEpoch)return;if(e.status===409&&e.current){revision=e.current.revision;const latest=snapshot();applyRemote(rebase(e.current.state,latest,base,Object.fromEntries(Object.keys(patch).map(key=>[key,latest[key]]))));baseline=structuredClone(e.current.state);schedule();}throw e;}
  finally{if(token===accountEpoch){writing=false;writeJob=null;}}})();writeJob=job;return job;
 }
 async function flush(){const id=user?.id,token=accountEpoch;for(let attempt=0;attempt<4;attempt++){try{await sync();}catch(error){if(error.status!==409||error.code==='account_changed')throw error;}if(!user||stopped||user.id!==id||token!==accountEpoch)throw Error('Sign in to the same account before syncing this import.');if(!Object.entries(snapshot()).some(([k,v])=>JSON.stringify(v)!==JSON.stringify(baseline[k])))return{synced:true};}throw Error('Your library is changing on another device. Try syncing again in a moment.');}
 async function commitImport(prepared, {expectedOwner}={}){
  const identity=()=>{if(!user||stopped||authenticating||!expectedOwner||expectedOwner!==user.id||localStorage.getItem(ownerKey)!==expectedOwner)throw Error('Your account changed. Sign in again and review this import before continuing.');};identity();
  // Prepare against the newest reconciled cache, not the snapshot taken while
  // an older account upload was still in flight.
  await flush();identity();const {patch,local={}}=typeof prepared==='function'?prepared():prepared||{};
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!allowed(k)))throw Error('This import contains unsupported account fields.');
  const profileIds=new Set((patch['swiflytv.profiles']||read('swiflytv.profiles',[])).map(v=>v.id));
  const safeLocal=new Set([...profileIds].flatMap(id=>{const namespace='account:'+encodeURIComponent(expectedOwner)+':profile:'+encodeURIComponent(id);return['swiflytv.appearance.v2.'+namespace,'swifly.study.v1.'+namespace];}));
  if(!local||typeof local!=='object'||Array.isArray(local)||Object.keys(local).some(k=>!safeLocal.has(k))||Object.values(local).some(v=>typeof v!=='string'))throw Error('This import contains invalid browser settings.');
  identity();const changed=Object.fromEntries(Object.entries(patch).filter(([k,v])=>JSON.stringify(v)!==localStorage.getItem(k))),size=value=>window.SwiflyAccountData?.bytes(JSON.stringify(value))??JSON.stringify(value).length;
  if(size(changed)>400000||size({...snapshot(),...patch})>800000)throw Error('This import exceeds the account storage limit. Choose fewer profiles or titles; nothing was imported.');
  storageTransaction({...Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,JSON.stringify(v)])),...local});publishState();schedule();
  try{await flush();identity();return{synced:true};}catch(error){if(user?.id===expectedOwner)cachePending();return{synced:false,message:error.message};}
 }
 async function importLegacy(){
  if(!user)throw Error('Sign in before recovering browser data.');const api=window.SwiflyAccountData,data=read(prefix+'legacy',null);if(!api)throw Error('Reload Account to review and recover earlier browser data.');if(!data)throw Error('There is no earlier library on this browser.');
  const owner=user.id;return commitImport(()=>{const current=api.capture(localStorage,{owner}),incoming=api.fromState(data),active=read('swiflytv.activeProfile',null)?.id||current.profiles[0].profile.id,mapping=Object.fromEntries(incoming.profiles.map((v,index)=>[v.profile.id,index===0?active:'new'])),plan=api.plan(incoming,current,{mapping});return api.statePatch(plan.backup,{owner,activeProfile:active});},{expectedOwner:owner});
 }
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
 window.SwiflyAccount=Object.freeze({ready,request,activate,revalidate,refreshState,sync,flush,commitImport,importLegacy,snapshot,get user(){return user;}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
