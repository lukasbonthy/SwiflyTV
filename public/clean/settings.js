/* Profile preferences and authenticated Trakt deltas. OAuth credentials never enter the browser. */
(() => {
 'use strict';if(window.SwiflySettings)return;
 let user=null,status=null,epoch=0,suspended=false,busy=false,timer=0,refreshing=null,flushing=null;
 const pending=new Map(),controllers=new Set();
 const main=()=>document.querySelector('[data-settings-page]');
 const account=()=>window.SwiflyAccount;
 const currentUser=()=>suspended?null:account()&&'user'in account()?account().user:user;
 const profileId=()=>window.SwiflyLibrary?.profileId?.()||'main';
 function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>{timer=0;flush().catch(()=>{});},delay);}
 function note(message,error=false){const output=main()?.querySelector('[data-trakt-message]');if(output){output.textContent=message;output.dataset.error=String(error);}else if(error)window.showToast?.(message);}
 function paintPreferences(){
  const root=main();if(!root)return;const preferences=window.SwiflyLibrary?.preferences?.();
  for(const input of root.querySelectorAll('[data-preference]')){input.disabled=!preferences;if(!preferences)continue;const value=preferences[input.dataset.preference];if(input.type==='checkbox')input.checked=Boolean(value);else input.value=value;}
 }
 function paint(){
  const root=main();if(!root)return;
  const signedIn=Boolean(currentUser()),linked=signedIn&&Boolean(status?.linked),configured=signedIn&&Boolean(status?.configured),reconnect=Boolean(status?.reconnectRequired);
  const badge=root.querySelector('[data-trakt-badge]'),message=root.querySelector('[data-trakt-status]');
  root.querySelector('[data-trakt-signin]').hidden=signedIn;
  const link=root.querySelector('[data-trakt-link]');link.hidden=!signedIn||linked&&!reconnect;link.disabled=busy||!configured;link.firstChild.textContent=reconnect?'Reconnect Trakt':'Connect Trakt';
  const sync=root.querySelector('[data-trakt-sync]');sync.hidden=!linked;sync.disabled=busy||!configured||reconnect;
  const unlink=root.querySelector('[data-trakt-unlink]');unlink.hidden=!linked;unlink.disabled=busy;
  badge.textContent=!signedIn?'Account required':!status?'Checking':!configured?'Unavailable':reconnect?'Reconnect':linked?'Connected':'Not connected';badge.dataset.connected=String(linked&&!reconnect);
  message.textContent=!signedIn?'Sign in to your SwiflyTV account to connect Trakt.':!status?'Checking your connection…':!configured?'Trakt is not configured on this server.':reconnect?'Your Trakt connection needs to be renewed.':linked?'Connected. Watchlist and watched changes made here are sent to Trakt.':'Connect your Trakt account to get started.';
  if(linked&&status.lastSyncAt){const date=new Date(status.lastSyncAt);if(Number.isFinite(date.getTime()))message.textContent+=' Last import '+date.toLocaleString()+'.';}
 }
 async function request(route,{body,timeout=12000}={}){
  const owner=currentUser()?.id;if(!owner)throw Object.assign(Error('Sign in to connect Trakt.'),{status:401});
  const token=epoch,controller=new AbortController();controllers.add(controller);const timeoutId=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetch('/api/trakt'+route,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','X-Swifly-Account':owner,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json();if(token!==epoch||currentUser()?.id!==owner)throw Object.assign(Error('Your account changed. Reload Settings to continue.'),{code:'account_changed'});
   if(!response.ok)throw Object.assign(Error(data.message||'Trakt could not complete this request.'),{status:response.status,code:data.code,retryAfter:data.retryAfter});return data;
  }catch(e){if(e.name==='AbortError')throw Error('Trakt took too long to respond. Try again shortly.');throw e;}
  finally{clearTimeout(timeoutId);controllers.delete(controller);}
 }
 async function refresh(){
  if(!currentUser()){status=null;paint();return null;}if(refreshing)return refreshing;
  const token=epoch;const job=(async()=>{try{const data=await request('/status');if(token===epoch){status=data;paint();}return data;}catch(e){if(token===epoch){note(e.message,true);paint();}return null;}})();refreshing=job;
  try{return await job;}finally{if(refreshing===job)refreshing=null;}
 }
 function queue(event){
  const detail=event.detail;
  if(!currentUser()||!detail||detail.source!=='library'||!['watchlist','watched'].includes(detail.action)||!detail.item)return;
  if(detail.action==='watched'&&detail.item.type==='tv'&&detail.item.episode===undefined){note('Only individual watched episodes can be sent to Trakt.',true);return;}
  const profile=detail.profileId||profileId(),item=detail.item,key=[profile,detail.action,item.type,item.id,item.season??'',item.episode??''].join(':');
  pending.set(key,{profileId:profile,eventId:window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),action:detail.action,item:{...item},removed:detail.removed===true});schedule(500);
 }
 async function flush(){
  clearTimeout(timer);timer=0;if(flushing)return flushing;if(!pending.size||!currentUser())return;
  const token=epoch,owner=currentUser().id;
  const job=(async()=>{
   if(!status)await refresh();if(token!==epoch||currentUser()?.id!==owner)return;
   if(!status?.configured||!status?.linked||status?.reconnectRequired){pending.clear();return;}
   const batch=[...pending.entries()].slice(0,50),profile=batch[0]?.[1].profileId;if(!profile)return;
   const selected=batch.filter(([,v])=>v.profileId===profile);for(const[key]of selected)pending.delete(key);
   try{
    await account()?.sync?.();if(token!==epoch||currentUser()?.id!==owner)return;
    const result=await request('/changes',{body:{profileId:profile,changes:selected.map(([,value])=>({eventId:value.eventId,action:value.action,item:value.item,removed:value.removed}))}});
    if(result.notFound)note(result.notFound+' title(s) could not be matched on Trakt.',true);
   }catch(e){
    if(token!==epoch||currentUser()?.id!==owner)return;
    note(e.message,true);
    if(e.status===429){for(const[key,value]of selected)if(!pending.has(key))pending.set(key,value);schedule(Math.max(1000,(e.retryAfter||30)*1000));}
    else if(e.status===401||e.code==='trakt_not_linked'){status=null;pending.clear();await refresh();}
   }
   if(pending.size&&!timer)schedule(1050);
  })();flushing=job;
  try{return await job;}finally{if(flushing===job)flushing=null;}
 }
 function suspend(){suspended=true;user=null;epoch++;status=null;refreshing=null;pending.clear();clearTimeout(timer);timer=0;for(const controller of controllers)controller.abort();paint();}
 function bind(){
  const root=main();if(!root)return;root.addEventListener('change',event=>{
   const input=event.target.closest('[data-preference]');if(!input)return;const output=root.querySelector('[data-preference-status]');
   try{if(window.SwiflyLibrary.savePreferences({[input.dataset.preference]:input.type==='checkbox'?input.checked:input.value})===false)throw Error('This preference could not be saved. Free some browser storage and try again.');output.textContent='Saved for this profile.';}
   catch(e){output.textContent=e.message||'This preference could not be saved.';paintPreferences();}
  });
  root.addEventListener('click',async event=>{
   const trigger=event.target.closest('[data-trakt-link],[data-trakt-sync],[data-trakt-unlink]');if(!trigger||trigger.disabled||busy)return;
   busy=true;note('');paint();
   try{
    if(trigger.hasAttribute('data-trakt-link')){const result=await request('/link',{body:{}});const url=new URL(result.url);if(url.origin!=='https://auth.trakt.tv'||url.pathname!=='/oauth/authorize')throw Error('Trakt returned an invalid connection address.');location.assign(url.href);}
    else if(trigger.hasAttribute('data-trakt-unlink')){const result=await request('/unlink',{body:{}});pending.clear();status={...status,linked:false};note(result.warning||'Trakt disconnected. Your SwiflyTV library is kept.');}
    else{
     const owner=currentUser()?.id,profile=profileId(),token=epoch;
     await account()?.sync?.();note('Importing your Trakt watchlist and watched history…');
     const result=await request('/sync',{body:{profileId:profile},timeout:65000});
     if(token!==epoch||currentUser()?.id!==owner)return;
     await account()?.refreshState?.();
     let message='Imported '+result.imported.watchlist+' watchlist and '+result.imported.watched+' watched items.';
     if(result.skipped)message+=' '+result.skipped+' unmatched or unsupported item(s) skipped.';
     if(result.truncated)message+=' This was a limited import; some Trakt items remain.';
     note(message);await refresh();
    }
   }catch(e){note(e.message,true);}
   finally{busy=false;paint();}
  });
 }
 async function boot(){
  bind();paintPreferences();paint();
  const session=await account()?.ready;await window.SwiflyLibrary?.ready;
  if(suspended)return;user=session?.user||account()?.user||null;paintPreferences();paint();if(currentUser())await refresh();
 }
 document.addEventListener('swifly:account-hydrated',()=>{if(!suspended&&currentUser()?.id===user?.id){paintPreferences();return;}const next=account()?.user||null;if(next?.id!==user?.id){epoch++;pending.clear();status=null;}suspended=false;user=next;paintPreferences();paint();refresh().catch(()=>{});});
 document.addEventListener('swifly:account-suspended',suspend);
 document.addEventListener('swifly:profile-changed',paintPreferences);
 window.addEventListener('swifly:library-change',event=>{queue(event);paintPreferences();});
 window.addEventListener('pagehide',suspend);
 window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;user=account()?.user||null;paintPreferences();refresh().catch(()=>{});}});
 window.SwiflySettings=Object.freeze({refresh,flush});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
