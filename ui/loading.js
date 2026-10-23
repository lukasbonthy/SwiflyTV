'use strict';
const loadingStyles=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/clean/loading.css'),'utf8');

// Runs in the head, independently of third-party assets and application bundles.
function siteLoadingGate(){
 'use strict';if(window.SwiflySiteLoading)return;
 const root=document.documentElement;
 let initial=0,skeleton=0,safety=0,action=0,holds=0,ready=document.readyState!=='loading',navigating=false;
 function layout(value){
  try{const path=new URL(value,location.href).pathname;
   if(/^\/(?:watch|embed|watchrooms)(?:\/|$)/.test(path))return 'player';
   if(/^\/friends(?:\/|$)/.test(path))return 'friends';
   if(/^\/(?:recommendations|audiobooks|search)(?:\/|$)/.test(path))return 'discovery';
   if(/^\/(?:login|signup|account|profiles)(?:\/|$)/.test(path))return 'workspace';
  }catch(_){}return 'catalog';
 }
 function status(message){const node=document.getElementById('svLoadingStatus');if(node)node.textContent=message;}
 function hide(){clearTimeout(initial);clearTimeout(skeleton);clearTimeout(safety);clearTimeout(action);initial=skeleton=safety=action=0;navigating=false;root.removeAttribute('data-sv-loading');status('');}
 function setLayout(value){const kind=layout(value);root.dataset.svLoadLayout=kind;const node=document.getElementById('svSiteLoading');if(node)node.dataset.layout=kind;}
 function show(value,phase){clearTimeout(safety);setLayout(value);root.dataset.svLoading=phase;document.querySelector('.svLoadProgress i')?.getAnimations?.().forEach(animation=>{animation.currentTime=0;});status('Loading page');safety=setTimeout(hide,10000);}
 function navigate(value){hide();navigating=true;show(value,'pending');skeleton=setTimeout(()=>{root.dataset.svLoading='navigate';},160);}
 function settle(){if(ready&&!holds&&!navigating)hide();}
 function waitForContent(){
  holds++;if(!initial&&!navigating)initial=setTimeout(()=>{if(!ready||holds)show(location.href,'initial');},120);
  let released=false;return ()=>{if(released)return;released=true;holds=Math.max(0,holds-1);settle();};
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
  const a=event.target.closest?.('a[href]');if(!a||a.hasAttribute('download')||a.target&&a.target!=='_self'||a.getAttribute('aria-disabled')==='true')return;
  const href=destination(a.href);if(!href)return;
  // Use a new task: Chromium can run microtasks between trusted listeners.
  // Details, tabs and other controllers must finish canceling the event first.
  deferNavigation(event,href);
 });
 document.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||form.method==='dialog'||form.target&&form.target!=='_self'||event.submitter?.formTarget&&event.submitter.formTarget!=='_self')return;
  const action=event.submitter?.hasAttribute('formaction')?event.submitter.formAction:form.action;
  try{const url=new URL(action,location.href);if(url.origin!==location.origin||/^\/(?:api|assets)(?:\/|$)/.test(url.pathname))return;}catch(_){return;}
  deferNavigation(event,action);
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)hide();});
 window.addEventListener('pagehide',hide);
 window.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
 window.SwiflySiteLoading=Object.freeze({hold:waitForContent});
 initial=setTimeout(()=>{if(!ready||holds)show(location.href,'initial');},120);
 if(!ready)document.addEventListener('DOMContentLoaded',()=>{ready=true;settle();},{once:true});else settle();
}

function loadingHead(){return `<style data-sv-loading-style>${loadingStyles}</style><script data-sv-loading-gate>(${siteLoadingGate.toString()})();</script>`;}
function loadingMarkup(){
 const cards=Array.from({length:8},()=>'<div class="svLoadCard"><i class="svLoadBlock svLoadPoster"></i><i class="svLoadBlock svLoadCardTitle"></i><i class="svLoadBlock svLoadCardMeta"></i></div>').join('');
 const rows=Array.from({length:4},()=>'<div class="svLoadPerson"><i class="svLoadBlock svLoadAvatar"></i><span><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i></span></div>').join('');
 return `<div id="svSiteLoading" data-layout="catalog" aria-hidden="true"><div class="svLoadProgress"><i></i></div><div class="svLoadCanvas"><div class="svLoadHero"><div class="svLoadCopy"><i class="svLoadBlock svLoadLogo"></i><div class="svLoadMetadata"><i class="svLoadBlock"></i><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div><div class="svLoadDescription"><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i><i class="svLoadBlock svLoadLine"></i></div><div class="svLoadActions"><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div></div></div><div class="svLoadWorkspace"><i class="svLoadBlock svLoadHeading"></i><div class="svLoadColumns"><aside>${rows}</aside><div class="svLoadChat"><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadBubble"></i><i class="svLoadBlock svLoadCompose"></i></div></div></div><div class="svLoadPlayer"><i class="svLoadBlock"></i></div><div class="svLoadDiscovery"><i class="svLoadBlock svLoadHeading"></i><i class="svLoadBlock svLoadPrompt"></i><div><i class="svLoadBlock"></i><i class="svLoadBlock"></i><i class="svLoadBlock"></i></div></div><div class="svLoadShelf"><i class="svLoadBlock svLoadHeading"></i><div class="svLoadCards">${cards}</div></div></div></div><span id="svLoadingStatus" class="svLoadingStatus" role="status" aria-live="polite" aria-atomic="true"></span>`;
}
module.exports={loadingHead,loadingMarkup};
