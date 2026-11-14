/* A server-enforced lock plus cross-tab/back-cache coordination for normal use. */
(() => {
 'use strict';if(window.SwiflyKids)return;
 let disposed=false,channel=null,request=null,inflight=null,generation=0;
 const key='swiflytv.kids.mode-change';
 const kidPage=()=>location.pathname==='/kids'||location.pathname.startsWith('/kids/');
 const playerPage=()=>/^\/watch\/(movie|tv)\/[1-9]\d*$/.test(location.pathname);
 const verifiedPlayer=()=>document.querySelector('[data-player-root]')?.dataset.playerKidsVerified==='true';
 function pauseMedia(){for(const media of document.querySelectorAll('video,audio'))try{media.pause();}catch{}}
 function publish(locked){
  const message={locked:locked===true,at:Date.now()};try{localStorage.setItem(key,JSON.stringify(message));}catch{}try{channel?.postMessage(message);}catch{}
 }
 function safeText(tag,text){const element=document.createElement(tag);element.textContent=text;return element;}
 function apply(value){
  if(disposed)return false;document.documentElement.dataset.kidsLocked=value.locked?'true':'false';
  if(value.locked&&!kidPage()&&(!playerPage()||!verifiedPlayer())){pauseMedia();location.replace('/kids');return false;}
  const existing=document.querySelector('[data-kids-mode-bar]');
  if(value.locked&&playerPage()&&!existing){
   const bar=safeText('nav','');bar.className='kidsModeBar';bar.dataset.kidsModeBar='';bar.setAttribute('aria-label','Kids navigation');
   const home=safeText('a','← Back to Kids');home.href='/kids';const parent=safeText('a','Grown-ups · unlock');parent.href='/kids?parent=1';bar.append(home,parent);document.body.prepend(bar);
   // The parent return route does not reuse the general-catalog details sheet.
   for(const link of document.querySelectorAll('[data-sv-player-back]'))link.setAttribute('href','/kids');
  }else if(!value.locked)existing?.remove();
  document.dispatchEvent(new CustomEvent('swifly:kids-status',{detail:value}));
  return true;
 }
 function refresh(){
  if(disposed)return Promise.resolve(null);if(inflight)return inflight;
  const controller=new AbortController(),token=generation;request=controller;const timer=setTimeout(()=>controller.abort(),6000);
  inflight=(async()=>{
   try{const response=await fetch('/api/kids/status',{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});if(!response.ok)return null;const value=await response.json();if(disposed||token!==generation||typeof value.locked!=='boolean')return null;apply(value);return value;}
   catch{return null;}finally{clearTimeout(timer);if(request===controller){request=null;inflight=null;}}
  })();return inflight;
 }
 function invalidate(){generation++;request?.abort();request=null;inflight=null;}
 async function revalidatePlayer(){invalidate();const token=generation,value=await refresh();return Boolean(value&&token===generation&&!disposed&&(!value.locked||verifiedPlayer()));}
 function changed(message){if(message?.locked){pauseMedia();if(!kidPage())location.replace('/kids');else refresh();}else refresh();}
 try{channel=new BroadcastChannel('swifly-kids');channel.addEventListener('message',event=>changed(event.data));}catch{}
 window.addEventListener('storage',event=>{if(event.key===key&&event.newValue)try{changed(JSON.parse(event.newValue));}catch{}});
 window.addEventListener('pageshow',event=>{disposed=false;if(event.persisted&&playerPage())pauseMedia();refresh();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate();else refresh();});
 window.addEventListener('pagehide',()=>{disposed=true;invalidate();});
 // A protected page is never entrusted to a profile's local preference.
 window.SwiflyKids=Object.freeze({refresh,publish,revalidatePlayer});refresh();
})();
