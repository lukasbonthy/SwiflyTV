/* Profile preferences and authenticated Trakt deltas. OAuth credentials never enter the browser. */
(() => {
 'use strict';if(window.SwiflySettings)return;
 let user=null,status=null,epoch=0,suspended=false,busy=false,timer=0,refreshing=null,flushing=null,pendingOwner=null,retries=0,outboxSaved=true;
 const pending=new Map(),controllers=new Set();
 const outboxPrefix='swiflytv.traktOutbox.',outboxLimit=500;
 const main=()=>document.querySelector('[data-settings-page]');
 const account=()=>window.SwiflyAccount;
 const currentUser=()=>suspended?null:account()&&'user'in account()?account().user:user;
 const profileId=()=>window.SwiflyLibrary?.profileId?.()||'main';
 function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>{timer=0;flush().catch(()=>{});},delay);}
 function note(message,error=false){const output=main()?.querySelector('[data-trakt-message]');if(output){output.textContent=message;output.dataset.error=String(error);}else if(error)window.showToast?.(message);}
 const changeKey=value=>[value.profileId,value.action,value.item.type,value.item.id,value.item.season??'',value.item.episode??''].join(':');
 function cleanChange(value){
  const item=value?.item,profile=value?.profileId;
  if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(profile||'')||!['watchlist','watched'].includes(value?.action)||!['movie','tv'].includes(item?.type)||!/^\d{1,10}$/.test(String(item?.id||''))||Number(item.id)<=0)return null;
  const result={profileId:profile,eventId:value.eventId,action:value.action,item:{type:item.type,id:String(item.id)},removed:value.removed===true};
  if(value.action==='watched'&&item.type==='tv'){
   if(!Number.isInteger(Number(item.season))||Number(item.season)<0||Number(item.season)>1000||!Number.isInteger(Number(item.episode))||Number(item.episode)<1||Number(item.episode)>10000)return null;
   result.item.season=Number(item.season);result.item.episode=Number(item.episode);
  }
  if(value.action==='watched'&&typeof item.watchedAt==='string'&&Number.isFinite(Date.parse(item.watchedAt)))result.item.watchedAt=new Date(item.watchedAt).toISOString();
  return result;
 }
 function persist(){
  if(!pendingOwner)return false;
  try{if(pending.size)localStorage.setItem(outboxPrefix+pendingOwner,JSON.stringify({version:1,entries:[...pending.values()]}));else localStorage.removeItem(outboxPrefix+pendingOwner);outboxSaved=true;return true;}
  catch{outboxSaved=false;note('Trakt changes could not be saved for retry. Free some browser storage and keep this page open to send them.',true);return false;}
 }
 function restore(owner){
  if(pendingOwner===owner)return;pending.clear();pendingOwner=owner||null;retries=0;outboxSaved=true;if(!owner)return;
  try{
   const value=JSON.parse(localStorage.getItem(outboxPrefix+owner)||'null');
   if(value?.version===1&&Array.isArray(value.entries))for(const entry of value.entries.slice(0,outboxLimit)){
    const change=cleanChange(entry);if(change&&/^[A-Za-z0-9_.:-]{1,100}$/.test(change.eventId||''))pending.set(changeKey(change),change);
   }
  }catch{note('Saved Trakt changes could not be read. Check browser storage before leaving this page.',true);}
 }
 function discard(selected){for(const[key,value]of selected)if(pending.get(key)?.eventId===value.eventId)pending.delete(key);persist();}
 function clearPending(){pending.clear();retries=0;persist();}
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
  const token=epoch;const job=(async()=>{try{const data=await request('/status');if(token===epoch){status=data;paint();if(pending.size&&data.configured&&data.linked&&!data.reconnectRequired&&!timer)schedule(500);}return data;}catch(e){if(token===epoch){note(e.message,true);paint();}return null;}})();refreshing=job;
  try{return await job;}finally{if(refreshing===job)refreshing=null;}
 }
 function queue(event){
  const detail=event.detail;
  if(!currentUser()||!detail||detail.source!=='library'||!['watchlist','watched'].includes(detail.action)||!detail.item)return;
  if(detail.action==='watched'&&detail.item.type==='tv'&&detail.item.episode===undefined){note('Only individual watched episodes can be sent to Trakt.',true);return;}
  restore(currentUser().id);
  const value=cleanChange({profileId:detail.profileId||profileId(),eventId:window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),action:detail.action,item:detail.item,removed:detail.removed===true});if(!value)return;
  const key=changeKey(value);if(!pending.has(key)&&pending.size>=outboxLimit){note('Trakt has too many unsent changes. Reconnect or send pending changes before making more changes.',true);return;}
  pending.set(key,value);retries=0;persist();schedule(500);
 }
 async function flush(){
  clearTimeout(timer);timer=0;if(flushing)return flushing;if(!currentUser())return;restore(currentUser().id);if(!pending.size)return;
  const token=epoch,owner=currentUser().id;
  const job=(async()=>{
   if(!status)await refresh();if(token!==epoch||currentUser()?.id!==owner)return;
   if(!status)return;if(!status.configured||!status.linked){clearPending();return;}if(status.reconnectRequired)return;
   if(status.retryAt>Date.now()){schedule(status.retryAt-Date.now());return;}
   const batch=[...pending.entries()].slice(0,50),profile=batch[0]?.[1].profileId;if(!profile)return;
   const selected=batch.filter(([,v])=>v.profileId===profile);
   try{
    await account()?.sync?.();if(token!==epoch||currentUser()?.id!==owner)return;
    const result=await request('/changes',{body:{profileId:profile,changes:selected.map(([,value])=>({eventId:value.eventId,action:value.action,item:value.item,removed:value.removed}))}});
    discard(selected);retries=0;
    if(result.notFound)note(result.notFound+' title(s) could not be matched on Trakt.',true);
   }catch(e){
    if(token!==epoch||currentUser()?.id!==owner)return;
    note(e.message,true);
    if(['account_changed','signin_required'].includes(e.code)){suspend();account()?.revalidate?.().catch(()=>{});return;}
    if(e.status===401||e.code==='trakt_not_linked'){status=null;const connection=await refresh();clearTimeout(timer);timer=0;if(connection&&!connection.linked)clearPending();return;}
    if(!e.status||e.status>=500||e.status===408||e.status===429||e.code==='trakt_busy'||e.status===409&&e.current){
     retries++;const delay=e.status===429?Math.min(86400000,Math.max(1000,(Number(e.retryAfter)||30)*1000)):Math.min(30000,1050*2**(retries-1));
     if(e.status===429)status={...status,retryAt:Date.now()+delay};
     if(retries<=5)schedule(delay);else note(e.message+(outboxSaved?' Your changes are saved. Reopen this page or reconnect to retry.':' Keep this page open to retry; browser storage could not save these changes.'),true);return;
    }
    discard(selected);
   }
   if(pending.size&&!timer)schedule(1050);
  })();flushing=job;
  try{return await job;}finally{if(flushing===job)flushing=null;}
 }
 function suspend(){suspended=true;user=null;epoch++;status=null;refreshing=null;flushing=null;pending.clear();pendingOwner=null;retries=0;clearTimeout(timer);timer=0;for(const controller of controllers)controller.abort();paint();}
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
    else if(trigger.hasAttribute('data-trakt-unlink')){const result=await request('/unlink',{body:{}});clearPending();status={...status,linked:false};note(result.warning||'Trakt disconnected. Your SwiflyTV library is kept.');}
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
  if(suspended)return;user=session?.user||account()?.user||null;restore(currentUser()?.id);paintPreferences();paint();if(currentUser())await refresh();
 }
 document.addEventListener('swifly:account-hydrated',()=>{if(!suspended&&currentUser()?.id===user?.id){paintPreferences();return;}const next=account()?.user||null;if(suspended||next?.id!==user?.id){epoch++;status=null;refreshing=null;flushing=null;clearTimeout(timer);timer=0;for(const controller of controllers)controller.abort();}suspended=false;user=next;restore(next?.id);paintPreferences();paint();refresh().catch(()=>{});});
 document.addEventListener('swifly:account-suspended',suspend);
 document.addEventListener('swifly:profile-changed',paintPreferences);
 window.addEventListener('swifly:library-change',event=>{queue(event);paintPreferences();});
 window.addEventListener('pagehide',suspend);
 window.addEventListener('online',()=>{if(!currentUser())return;retries=0;status=null;refresh().then(()=>flush()).catch(()=>{});});
 window.SwiflySettings=Object.freeze({refresh,flush});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
