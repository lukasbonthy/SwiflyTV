/* v160: details-first browsing and independent solo/party player return context. */
(() => {
  'use strict';
  if (window.SwiflyDetails) return;
  let dialog,viewport,trigger,lastTrigger,request,currentHref='',generation=0,started=false,closingHistory=false,closingDialog=false;
  let trail=[],pendingOpen=[],currentURL='';
  const scrollPositions=new Map();
  const icon=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="'+path+'"/></svg>';
  const closeIcon=icon('m6 6 12 12M18 6 6 18'),backIcon=icon('m14 6-6 6 6 6');
  const route=url=>url.pathname+url.search+url.hash;
  function titleRoute(value) {
    try {const url=new URL(value,location.href);return url.origin===location.origin&&/^\/(movie|tv)\/\d+\/?$/.test(url.pathname)?url.pathname.replace(/\/$/,''):null;} catch {return null;}
  }
  function mediaRoute(value=location.href) {
    try {const url=new URL(value,location.href),match=url.searchParams.get('media')?.match(/^(movie|tv)-(\d+)$/);return match?'/'+match[1]+'/'+match[2]:null;} catch {return null;}
  }
  function localURL(value) {
    if (!value) return null;
    try {const url=new URL(value,location.href);return url.origin===location.origin?url:null;} catch {return null;}
  }
  function catalogURL(value) {
    const url=localURL(value);if (!url || !/^\/(?:$|(?:movies|tv|trending|discover|search|genres|my-list|liked|continue-watching|browse-by-languages|kids|people)\/?$|(?:person|genre)\/\d+\/?$)/.test(url.pathname)) return null;
    url.searchParams.delete('media');url.searchParams.delete('view');return route(url);
  }
  function storageRead(key) {try {return sessionStorage.getItem(key);} catch {return null;}}
  function storageWrite(key,value) {try {sessionStorage.setItem(key,value);} catch {}}
  function storageRemove(key) {try {sessionStorage.removeItem(key);} catch {}}
  function returnToCatalog() {
    const referrer=catalogURL(document.referrer),stored=catalogURL(storageRead('swiflytv.browseReturn'));
    if(referrer&&stored){const source=localURL(referrer),saved=localURL(stored);if(source.pathname+source.search===saved.pathname+saved.search)return stored;}
    return referrer||stored||'/';
  }
  function rememberCatalog() {const href=catalogURL(location.href);if (href) storageWrite('swiflytv.browseReturn',href);}
  function playbackReturn(fallback) {
    const player=location.pathname.match(/^\/watch\/(movie|tv)\/(\d+)/);
    if (!player) return fallback;
    const expected='/'+player[1]+'/'+player[2];
    const valid=value=>{const url=localURL(value);return url&&(mediaRoute(url.href)||titleRoute(url.href))===expected&&(catalogURL(url.href)||titleRoute(url.href))?url:null;};
    const query=new URLSearchParams(location.search),party=query.get('party')==='create'||Boolean(query.get('roomId'));
    const referrer=valid(document.referrer),stored=valid(storageRead(party?'swiflytv.partyReturn':'swiflytv.playReturn'));
    if(referrer){if(stored&&stored.pathname+stored.search===referrer.pathname+referrer.search)return route(stored);return route(referrer);}
    return stored?route(stored):fallback;
  }
  function playbackContext(href) {
    const raw=storageRead('swiflytv.playContext');storageRemove('swiflytv.playContext');
    try {
      const value=JSON.parse(raw||'null'),referrer=localURL(document.referrer),player=referrer?.pathname.match(/^\/watch\/(movie|tv)\/(\d+)\/?$/);
      return value&&player&&'/'+player[1]+'/'+player[2]===href&&value.href===href&&value.base===catalogURL(location.href)?value:null;
    } catch {return null;}
  }
  const scrollValue=value=>Number.isFinite(value)&&value>=0&&value<=1000000?value:0;
  function initialize(root) {
    if (typeof window.syncLibraryButtons==='function') window.syncLibraryButtons();
    root.querySelectorAll('[data-sv-details-back]').forEach(link=>link.setAttribute('href',returnToCatalog()));
    root.querySelectorAll('[data-sv-player-back]').forEach(link=>link.setAttribute('href',playbackReturn(link.getAttribute('href'))));
    root.querySelectorAll('.svDetailLogo').forEach(image=>{
      const title=image.closest('.svDetailTitle'),loaded=()=>title?.classList.toggle('hasLogo',image.naturalWidth>0);
      image.addEventListener('load',loaded,{once:true});image.addEventListener('error',()=>title?.classList.remove('hasLogo'),{once:true});if(image.complete)loaded();
    });
    window.SwiflyGlassSurfaces?.refresh(root);window.SwiflyMotion?.refresh(root);
  }
  function baseURL() {const url=new URL(location.href);url.searchParams.delete('media');return route(url);}
  function ownEntry() {const entry=history.state?.svDetails;return entry?.version===156&&entry.base===baseURL()&&entry.href===mediaRoute()?entry:null;}
  function historyState() {const state=history.state&&typeof history.state==='object'?{...history.state}:{};delete state.svDetails;return state;}
  function writeHistory(method,state,url) {try {history[method](state,'',url);return true;} catch {return false;}}
  function selectURL(href,replace=false) {
    const base=baseURL(),state=historyState(),url=new URL(base,location.href),parts=href.split('/'),pushed=replace?ownEntry()?.pushed===true:true;url.searchParams.set('media',parts[1]+'-'+parts[2]);
    scrollPositions.delete(route(url));
    if(!replace)writeHistory('replaceState',state,base);
    return writeHistory(replace?'replaceState':'pushState',{...state,svDetails:{version:156,base,href,pushed,scroll:0}},route(url));
  }
  function rememberDetailScroll() {
    const entry=ownEntry();if(entry){const scroll=dialog?.hasAttribute('aria-busy')?scrollPositions.get(currentURL)||0:viewport?.scrollTop||0;scrollPositions.set(currentURL,scroll);writeHistory('replaceState',{...history.state,svDetails:{...entry,scroll}},route(new URL(location.href)));}
  }
  function reset() {
    generation++;request?.abort();request=null;window.SwiflyMotion?.stop(viewport);window.SwiflyMotion?.release(viewport);
    document.documentElement.classList.remove('svDetailsOpen');
    if(trigger?.isConnected)trigger.focus({preventScroll:true});lastTrigger=trigger||lastTrigger;trigger=null;
    viewport?.replaceChildren();currentHref='';currentURL='';trail=[];
  }
  function leaveHistory() {
    if(closingHistory||!mediaRoute())return;
    if(ownEntry()?.pushed&&history.length>1){closingHistory=true;history.back();}
    else writeHistory('replaceState',historyState(),baseURL());
  }
  function close() {
    if(!dialog?.open)return;rememberDetailScroll();closingDialog=true;dialog.close();reset();closingDialog=false;leaveHistory();
  }
  function ensureDialog() {
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='svDetailDialog';dialog.setAttribute('aria-label','Movie details');
    const chrome=document.createElement('div');chrome.className='svDetailChrome';
    const back=document.createElement('button');back.type='button';back.className='svDetailBack dsIconBtn';back.dataset.svDialogBack='';back.setAttribute('aria-label','Back to browsing');back.innerHTML=backIcon;
    const title=document.createElement('span');title.className='svDetailChromeTitle';title.textContent='Movie details';
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='svDetailDismiss dsIconBtn';dismiss.dataset.svDetailClose='';dismiss.setAttribute('aria-label','Close movie details');dismiss.innerHTML=closeIcon;
    chrome.append(back,title,dismiss);viewport=document.createElement('div');viewport.className='svDetailViewport';dialog.append(chrome,viewport);document.body.append(dialog);
    back.addEventListener('click',goBack);dismiss.addEventListener('click',close);
    viewport.addEventListener('scroll',()=>dialog.classList.toggle('svDetailScrolled',viewport.scrollTop>180),{passive:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{
      if(dialog.open||closingDialog||!viewport.firstChild)return;
      rememberDetailScroll();reset();leaveHistory();
    });
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
  }
  async function render(href,from,scroll=0) {
    ensureDialog();request?.abort();window.SwiflyMotion?.stop(viewport);window.SwiflyMotion?.release(viewport);
    request=new AbortController();const current=++generation;currentHref=href;currentURL=route(new URL(location.href));scrollPositions.set(currentURL,scroll);
    if(!dialog.open){trigger=from||lastTrigger||document.activeElement;window.SwiflyMotion?.stop();document.documentElement.classList.add('svDetailsOpen');dialog.showModal();}
    viewport.scrollTop=0;dialog.classList.remove('svDetailScrolled');dialog.setAttribute('aria-busy','true');
    dialog.setAttribute('aria-label','Movie details');dialog.querySelector('.svDetailChromeTitle').textContent='Movie details';
    viewport.innerHTML='<div class="svDetailLoading" role="status"><div class="svDetailLoadingArt"></div><div class="svDetailLoadingCopy"><span></span><span></span><span></span></div><p>Loading details…</p></div>';
    dialog.querySelector('[data-sv-dialog-back]').setAttribute('aria-label',trail.length?'Back to previous title':'Back to browsing');
    try {
      const response=await fetch(href+'?view=modal',{signal:request.signal,headers:{Accept:'text/html'}});if(!response.ok)throw new Error('Details unavailable');
      const parsed=new DOMParser().parseFromString(await response.text(),'text/html');if(current!==generation||!dialog.open)return;
      const content=parsed.querySelector('.svTitleDetails');if(!content)throw new Error('Details unavailable');
      content.querySelectorAll('script,[data-sv-details-back]').forEach(node=>node.remove());viewport.replaceChildren(content);
      const name=content.querySelector('h1')?.textContent.trim()||'Movie';dialog.setAttribute('aria-label',name+' details');dialog.querySelector('.svDetailChromeTitle').textContent=name;
      initialize(content);viewport.scrollTop=scroll;dialog.classList.toggle('svDetailScrolled',scroll>180);
    }catch(error){
      if(error.name==='AbortError'||current!==generation||!dialog.open)return;
      const panel=document.createElement('div');panel.className='svDetailError';
      const heading=document.createElement('h2');heading.textContent='Details are taking a moment';
      const copy=document.createElement('p');copy.textContent='Open the full title page or return to browsing.';
      const link=document.createElement('a');link.href=href;link.className='dsSecondaryBtn';link.dataset.svDetailFallback='';link.textContent='Open full details';panel.append(heading,copy,link);viewport.replaceChildren(panel);
    }finally{if(current===generation)dialog.removeAttribute('aria-busy');}
  }
  async function open(value,from) {
    const href=titleRoute(value);if(!href)return;
    if(closingHistory)return new Promise(resolve=>pendingOpen.push({href,from,resolve}));
    if(dialog?.open){if(currentHref&&currentHref!==href)trail.push({href:currentHref,scroll:viewport.scrollTop});selectURL(href,true);}
    else {rememberCatalog();selectURL(href,false);}
    return render(href,from);
  }
  function goBack() {
    if(trail.length){const previous=trail.pop();selectURL(previous.href,true);return render(previous.href,trigger,previous.scroll);}
    close();
  }
  function onPop() {
    if(dialog?.open&&!dialog.hasAttribute('aria-busy'))scrollPositions.set(currentURL,viewport.scrollTop);
    const href=mediaRoute(),entry=ownEntry();closingHistory=false;
    if(href){trail=[];render(href,lastTrigger,scrollPositions.get(route(new URL(location.href)))??entry?.scroll??0);}
    else if(dialog?.open){closingDialog=true;dialog.close();reset();closingDialog=false;}
    rememberCatalog();
    const queue=pendingOpen;pendingOpen=[];
    for(const next of queue)open(next.href,next.from).then(next.resolve);
  }
  function rememberPlayback(link) {
    if(link.hasAttribute('data-sv-party-movie-id'))return;
    const target=localURL(link.href),match=target?.pathname.match(/^\/watch\/(movie|tv)\/(\d+)\/?$/);if(!match)return;
    const expected='/'+match[1]+'/'+match[2];
    const currentPlayer=location.pathname.match(/^\/watch\/(movie|tv)\/(\d+)\/?$/);
    if(currentPlayer&&'/'+currentPlayer[1]+'/'+currentPlayer[2]===expected)return;
    rememberDetailScroll();
    storageWrite('swiflytv.playContext',JSON.stringify({href:expected,base:catalogURL(location.href)||catalogURL(storageRead('swiflytv.browseReturn'))||'/',top:window.scrollY,detailTop:dialog?.open&&currentHref===expected?viewport.scrollTop:0}));
    if(titleRoute(location.href)===expected&&!mediaRoute()){storageWrite('swiflytv.playReturn',route(new URL(location.href)));return;}
    const url=new URL(catalogURL(location.href)||catalogURL(storageRead('swiflytv.browseReturn'))||'/',location.href);
    url.searchParams.set('media',match[1]+'-'+match[2]);storageWrite('swiflytv.playReturn',route(url));
  }
  function rememberParty(link) {
    const id=link.getAttribute('data-sv-party-movie-id');
    if(!id||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))return;
    const target=localURL(link.href);
    if(!target||target.pathname!=='/watch/movie/'+id||target.searchParams.getAll('party').length!==1||target.searchParams.get('party')!=='create')return;
    const expected='/movie/'+id,source=localURL(location.href);
    if(!source||!(titleRoute(source.href)===expected&&!mediaRoute(source.href)||catalogURL(source.href)&&mediaRoute(source.href)===expected))return;
    rememberDetailScroll();storageWrite('swiflytv.partyReturn',route(source));
  }
  function boot() {
    if(started)return;started=true;rememberCatalog();initialize(document);
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
      rememberParty(link);
      rememberPlayback(link);
      if(link.hasAttribute('data-sv-player-back')&&history.length>1){
        const referrer=localURL(document.referrer),target=localURL(link.href);
        if(referrer&&target&&referrer.pathname+referrer.search===target.pathname+target.search){event.preventDefault();history.back();return;}
      }
      if(link.hasAttribute('data-sv-details-back')||link.hasAttribute('data-sv-player-back')||link.hasAttribute('data-party-return')||link.hasAttribute('data-sv-detail-fallback')||link.hasAttribute('data-play-id'))return;
      const href=titleRoute(link.href);if(!href||typeof window.HTMLDialogElement?.prototype.showModal!=='function')return;
      event.preventDefault();open(href,link);
    });
    window.addEventListener('popstate',onPop);
    const shared=mediaRoute();if(shared&&typeof window.HTMLDialogElement?.prototype.showModal==='function'){
      const context=playbackContext(shared);if(context)window.scrollTo({top:scrollValue(context.top),behavior:'instant'});
      if(ownEntry())render(shared,null,scrollValue(ownEntry().scroll));
      else {selectURL(shared,true);render(shared,null,scrollValue(context?.detailTop));}
    }
  }
  window.SwiflyDetails=Object.freeze({open,close,back:goBack});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
