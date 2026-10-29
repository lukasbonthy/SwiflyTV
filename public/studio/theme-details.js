/* Theme character belongs to the interface. Motion is CSS, never a JS frame loop. */
(() => {
 'use strict';
 if(window.SwiflyThemeDetails)return;
 const C=window.SwiflyStudioConfig;if(!C)return;
 const themes={
  blossom:{particle:'petal',ornament:'blossom',count:14},
  halloween:{particle:'ember',ornament:'web',count:9},
  winter:{particle:'snow',ornament:'lights',count:14},
  forest:{particle:'leaf',ornament:'fern',count:10},
  midnight:{particle:'star',ornament:'orbit',count:12},
  cinema:{particle:'dust',ornament:'film',count:8}
 };
 let started=false,layer=null,preview=null,signature='',pageHidden=false;
 let anchors=[];
 const owned='[data-theme-owned]';
 const compact=window.matchMedia('(max-width: 800px)');
 function node(className,attribute,value){
  const n=document.createElement('span');n.className=className;n.dataset.themeOwned='true';
  if(attribute)n.setAttribute(attribute,value);return n;
 }
 function root(className,attribute){const n=node(className,attribute,'');n.dataset.themeRoot='';n.setAttribute('aria-hidden','true');n.setAttribute('inert','');return n;}
 function current(){return C.effective(window.SwiflyAppearance||C.defaults,C.context());}
 function removeAnchors(){
  for(const item of anchors){item.ornament.remove();item.target.classList.remove('svThemeAnchor');if(item.relative)item.target.classList.remove('svThemeAnchor--relative');item.target.removeAttribute('data-theme-motif');}
  anchors=[];
 }
 function clear(){layer?.remove();preview?.remove();layer=preview=null;signature='';removeAnchors();document.body.dataset.svThemeMotion='off';}
 function particles(parent,theme,count){
  const fragment=document.createDocumentFragment();
  for(let i=0;i<count;i++){
   const n=node('svThemeParticle svThemeParticle--'+theme.particle,'data-theme-particle',theme.particle);
   n.style.setProperty('--td-y',String((i*37+9)%82));
   n.style.setProperty('--td-x',((i*61.8+7)%100).toFixed(2)+'%');
   n.style.setProperty('--td-duration',(16+(i*7)%17)+'s');
   n.style.setProperty('--td-delay',(-((i*5.9+3)%27)).toFixed(2)+'s');
   n.style.setProperty('--td-size',(0.65+(i%5)*0.16).toFixed(2));
   n.style.setProperty('--td-sway',((i%2?1:-1)*(18+i%4*12))+'px');
   fragment.append(n);
  }
  parent.append(fragment);
 }
 function ornament(target,motif){
  const n=root('svThemeOrnament svThemeOrnament--'+motif,'data-theme-ornament');n.dataset.themeOrnament=motif;
  const relative=['','static'].includes(getComputedStyle(target).position);
  target.classList.add('svThemeAnchor');if(relative)target.classList.add('svThemeAnchor--relative');target.dataset.themeMotif=motif;target.append(n);
  return {target,ornament:n,relative};
 }
 function reconcileAnchors(theme){
  const desired=[];
  for(const selector of ['.netflixNav','.svStudioSearchForm','.svSettingsCard','.svAccountData','.svLibraryTabs']){
   for(const n of document.querySelectorAll(selector)){if(!desired.includes(n)&&desired.length<4)desired.push(n);}
  }
  for(const selector of [compact.matches?'#controlPanel [data-st-theme-mobile-preview]':'#controlPanel .stPreview','#controlPanel .stHeader']){const n=document.querySelector(selector);if(n&&!desired.includes(n))desired.push(n);}
  for(const item of [...anchors])if(!desired.includes(item.target)||!item.ornament.isConnected||item.ornament.dataset.themeOrnament!==theme.ornament){item.ornament.remove();item.target.classList.remove('svThemeAnchor');if(item.relative)item.target.classList.remove('svThemeAnchor--relative');item.target.removeAttribute('data-theme-motif');anchors=anchors.filter(n=>n!==item);}
  for(const target of desired)if(!anchors.some(item=>item.target===target))anchors.push(ornament(target,theme.ornament));
 }
 function pause(){
  document.body.dataset.svThemePaused=String(pageHidden||document.hidden||!!document.querySelector('dialog[open]'));
  document.body.dataset.svThemePageHidden=String(pageHidden||document.hidden);
 }
 function refresh(){
  if(!started||!document.body)return;
  const values=current(),theme=themes[values.themeId];
  const playback=document.querySelector('.svPlayerPage,.dsWatchPage')||document.fullscreenElement;
  const tv=document.documentElement.dataset.svTv==='true'||document.documentElement.dataset.svXbox==='true';
  if(!values.themeDetails||!theme||playback||tv){clear();pause();return;}
  const count=values.reduceMotion?0:Math.min(theme.count,values.performancePreset==='mobile'||compact.matches?8:14);
  const next=[values.themeId,count].join(':');
  if(next!==signature||!layer?.isConnected){
   clear();signature=next;
   layer=root('svThemeDetails','data-theme-particles');layer.dataset.themeScene=values.themeId;particles(layer,theme,count);document.body.append(layer);
  }
  document.body.dataset.svThemeMotion=values.reduceMotion?'still':'live';
  const stage=document.querySelector(compact.matches?'#controlPanel [data-st-theme-mobile-preview]':'#controlPanel [data-st-preview]');
  if(stage&&(!preview?.isConnected||preview.parentElement!==stage||preview.dataset.themeScene!==values.themeId||Number(preview.dataset.themeCount)!==count)){
   preview?.remove();preview=root('stThemeDetailsPreview','data-theme-preview');preview.dataset.themeScene=values.themeId;preview.dataset.themeCount=String(count);particles(preview,theme,Math.min(count,5));stage.append(preview);
  }
  reconcileAnchors(theme);pause();
 }
 function start(){
  if(started)return;started=true;refresh();
  // Ignore our own nodes. Observing only structure and native dialog visibility
  // keeps library hydration useful without a decoration feedback loop.
  const observer=new MutationObserver(records=>{
   if(records.some(record=>record.type==='attributes'||(!record.target.closest?.(owned)&&[...record.addedNodes,...record.removedNodes].some(n=>n.nodeType===1&&!n.matches?.(owned)))))refresh();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-sv-tv','data-sv-xbox']});
  compact.addEventListener?.('change',refresh);
  document.addEventListener('visibilitychange',pause);
  document.addEventListener('fullscreenchange',refresh);
  document.addEventListener('swifly:studio-change',refresh);
  window.addEventListener('pagehide',()=>{pageHidden=true;pause();});
  window.addEventListener('pageshow',()=>{pageHidden=false;refresh();});
 }
 window.SwiflyThemeDetails=Object.freeze({refresh});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
