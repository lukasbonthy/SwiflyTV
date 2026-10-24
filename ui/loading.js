'use strict';
const loadingStyles=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/clean/loading.css'),'utf8');

// Runs in the head, independently of third-party assets and application bundles.
function siteLoadingGate(){
 'use strict';if(window.SwiflySiteLoading)return;
 const root=document.documentElement;
 let initial=0,skeleton=0,safety=0,action=0,ready=document.readyState!=='loading',navigating=false,current=null;
 const holds=new Map();
 function destinationInfo(value){
  try{const path=new URL(value,location.href).pathname;
   if(/^\/(?:watch|embed|watchrooms)(?:\/|$)/.test(path))return {layout:'player',title:'Opening the player',detail:'Preparing your viewing page.'};
   if(/^\/friends(?:\/|$)/.test(path))return {layout:'friends',title:'Opening Connect',detail:'Loading your conversations and friends.'};
   if(/^\/audiobooks(?:\/|$)/.test(path))return {layout:'books',title:'Opening Audiobooks',detail:'Loading the library of stories and authors.'};
   if(/^\/recommendations(?:\/|$)/.test(path))return {layout:'ai',title:'Opening AI Search',detail:'Preparing your search page. Describe what you want to watch when it opens.'};
   if(/^\/search(?:\/|$)/.test(path))return {layout:'search',title:'Opening search results',detail:'Finding matching titles in the catalog.'};
   if(/^\/(?:login|signup|account|profiles)(?:\/|$)/.test(path))return {layout:'workspace',title:/^\/login/.test(path)?'Opening sign in':/^\/signup/.test(path)?'Opening sign up':/^\/profiles/.test(path)?'Opening profiles':'Opening your account',detail:'Preparing your account page.'};
   const name=path==='/'?'Home':/^\/movies(?:\/|$)/.test(path)?'Movies':/^\/tv(?:\/|$)/.test(path)?'Series':/^\/trending(?:\/|$)/.test(path)?'Discover':/^\/my-list(?:\/|$)/.test(path)?'My List':/^\/(?:movie|series|person)(?:\/|$)/.test(path)?'title details':'the catalog';
   return {layout:'catalog',title:'Opening '+name,detail:'Getting titles and details ready.'};
  }catch(_){return {layout:'catalog',title:'Opening Swifly',detail:'Getting the page ready.'};}
 }
 function render(){
  const node=document.getElementById('svSiteLoading'),status=document.getElementById('svLoadingStatus'),detail=document.getElementById('svLoadingDetail');
  if(node&&current)node.dataset.layout=current.layout;
  let message=current?.title||'';
  if(current&&!navigating)for(const held of holds.values())if(held)message=held;
  if(status)status.textContent=message;if(detail)detail.textContent=current?.detail||'';
 }
 function hide(){clearTimeout(initial);clearTimeout(skeleton);clearTimeout(safety);clearTimeout(action);initial=skeleton=safety=action=0;navigating=false;current=null;root.removeAttribute('data-sv-loading');render();}
 function setDestination(value){current=destinationInfo(value);root.dataset.svLoadLayout=current.layout;render();}
 function show(value,phase){clearTimeout(safety);setDestination(value);root.dataset.svLoading=phase;safety=setTimeout(hide,10000);}
 function navigate(value){hide();navigating=true;setDestination(value);root.dataset.svLoading='pending';safety=setTimeout(hide,10000);skeleton=setTimeout(()=>{skeleton=0;show(value,'navigate');},160);}
 function settle(){if(ready&&!holds.size&&!navigating)hide();}
 function waitForContent(message){
  const owner={};holds.set(owner,typeof message==='string'?message.trim().slice(0,160):'');
  if(!initial&&!navigating&&!current)initial=setTimeout(()=>{initial=0;if(!ready||holds.size)show(location.href,'initial');},120);
  if(current&&!navigating)render();
  let released=false;return ()=>{if(released)return;released=true;holds.delete(owner);settle();if(current&&!navigating)render();};
 }
 function destination(value){
  try{const url=new URL(value,location.href);if(url.origin!==location.origin||url.protocol!==location.protocol||/^\/(?:api|assets|socket\.io)(?:\/|$)/.test(url.pathname))return null;
   if(url.pathname===location.pathname&&url.search===location.search)return null;
   return url.href;
  }catch(_){return null;}
 }
 function deferNavigation(event,value){clearTimeout(action);action=setTimeout(()=>{action=0;if(!event.defaultPrevented)navigate(value);},0);}
 document.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const a=event.target.closest?.('a[href]');if(!a||a.hasAttribute('download')||a.target&&a.target!=='_self'||!a.target&&document.querySelector('base[target]')?.target&&document.querySelector('base[target]').target!=='_self'||a.getAttribute('aria-disabled')==='true')return;
  const href=destination(a.href);if(!href)return;
  // Use a new task: Chromium can run microtasks between trusted listeners.
  // Details, tabs and other controllers must finish canceling the event first.
  deferNavigation(event,href);
 });
 document.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||form.method==='dialog')return;
  const target=event.submitter?.hasAttribute('formtarget')?event.submitter.formTarget:form.target||document.querySelector('base[target]')?.target||'_self';
  if(target!=='_self')return;
  const action=event.submitter?.hasAttribute('formaction')?event.submitter.formAction:form.action;
  try{const url=new URL(action,location.href);if(url.origin!==location.origin||/^\/(?:api|assets)(?:\/|$)/.test(url.pathname))return;}catch(_){return;}
  deferNavigation(event,action);
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)hide();});
 window.addEventListener('pagehide',hide);
 window.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
 window.SwiflySiteLoading=Object.freeze({hold:waitForContent});
 initial=setTimeout(()=>{initial=0;if(!ready||holds.size)show(location.href,'initial');},120);
 if(!ready)document.addEventListener('DOMContentLoaded',()=>{ready=true;render();settle();},{once:true});else settle();
}

function loadingHead(){return `<style data-sv-loading-style>${loadingStyles}</style><script data-sv-loading-gate>(${siteLoadingGate.toString()})();</script>`;}
function loadingMarkup(){
 const cards=Array.from({length:8},()=>'<div class="svLoadCard"><i class="svLoadBlock svLoadPoster"></i><i class="svLoadBlock svLoadCardTitle"></i><i class="svLoadBlock svLoadCardMeta"></i></div>').join('');
 const rows=Array.from({length:4},()=>'<div class="svLoadPerson"><i class="svLoadBlock svLoadAvatar"></i><span><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i></span></div>').join('');
 const books=Array.from({length:6},()=>'<div class="svLoadCard"><i class="svLoadBlock svLoadBookCover"></i><i class="svLoadBlock svLoadCardTitle"></i><i class="svLoadBlock svLoadCardMeta"></i></div>').join('');
 return `<div id="svSiteLoading" data-layout="catalog"><div class="svLoadProgress" role="progressbar" aria-label="Loading page"><i></i></div><div class="svLoadFeedback"><p id="svLoadingStatus" class="svLoadingStatus" role="status" aria-live="polite" aria-atomic="true"></p><p id="svLoadingDetail" class="svLoadingDetail"></p><p class="svLoadingHelp">You can still use the navigation. Press Esc to dismiss.</p></div><div class="svLoadCanvas" aria-hidden="true"><div class="svLoadHero"><div class="svLoadCopy"><i class="svLoadBlock svLoadLogo"></i><div class="svLoadMetadata"><i class="svLoadBlock"></i><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div><div class="svLoadDescription"><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i></div><div class="svLoadActions"><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div></div></div><div class="svLoadWorkspace"><div class="svLoadColumns"><aside>${rows}</aside><div class="svLoadChat"><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadCompose"></i></div></div></div><div class="svLoadAccount"><i class="svLoadBlock svLoadAvatar"></i><i class="svLoadBlock svLoadPrompt"></i><i class="svLoadBlock svLoadCompose"></i></div><div class="svLoadPlayer"><i class="svLoadBlock"></i></div><div class="svLoadDiscovery"><i class="svLoadBlock svLoadHeading"></i><i class="svLoadBlock svLoadPrompt"></i><div><i class="svLoadBlock"></i><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div></div><div class="svLoadBooks"><i class="svLoadBlock svLoadSearch"></i><i class="svLoadBlock svLoadHeading"></i><div class="svLoadBookCards">${books}</div></div><div class="svLoadShelf"><i class="svLoadBlock svLoadHeading"></i><div class="svLoadCards">${cards}</div></div></div></div>`;
}
module.exports={loadingHead,loadingMarkup};
