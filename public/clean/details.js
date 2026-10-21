/* Title details keep native modal semantics throughout the rising sheet transition. */
(() => {
  'use strict';
  if (window.SwiflyDetails) return;
  let dialog,viewport,sheetPanel,contentHost,scrim,trigger,lastTrigger,request,currentHref='',generation=0,started=false,closingHistory=false,closingDialog=false;
  let trail=[],pendingOpen=[],currentURL='';
  let sheetTransition=null,transitionEpoch=0,closeWantsHistory=false;
  let entryFocus=null;
  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  // Xbox Edge needs the dialog to appear at the button press.
  const xboxInstant = /Xbox|XboxOne|Xbox Series/i.test(navigator.userAgent) || document.documentElement.dataset.svXbox === 'true';
  const reducedMotion=()=>xboxInstant||motionPreference.matches||document.body.classList.contains('reduceMotion');
  // Only the inner panel travels. Its native scroll area and the catalog
  // remain stationary, with one slightly quicker glide and a soft landing.
  const enterDuration=560,exitDuration=320;
  const enterEase='cubic-bezier(.28,.06,.2,1)',exitEase='cubic-bezier(.4,0,.2,1)';
  const fragments=new Map(),fragmentTTL=90000,fragmentLimit=8,fragmentByteLimit=2*1024*1024,fragmentSizeLimit=192*1024;
  let fragmentScope=null,fragmentBytes=0;
  // Intent prefetches are scoped to the current profile and share the actual
  // click request. Two at most: moving across a poster rail cannot fan out.
  const warmups=new Map(),warmupLimit=2;
  let hoverTimer=0,hoverHref=null;
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
  function syncFragmentScope() {
    let scope=null;
    try {scope=(localStorage.getItem('swiflytv.activeProfile')||'')+'\n'+(localStorage.getItem('swiflytv.profiles')||'')+'\n'+String(location.pathname==='/kids'||Boolean(document.querySelector('.kidsModePage')));} catch {}
    if(scope!==fragmentScope){fragments.clear();fragmentBytes=0;fragmentScope=scope;}
    return scope;
  }
  function discardFragment(href) {const entry=fragments.get(href);if(entry){fragmentBytes-=entry.bytes;fragments.delete(href);}}
  function recentFragment(href) {
    const now=Date.now();
    for(const [key,entry] of fragments)if(now-entry.at>fragmentTTL)discardFragment(key);
    const entry=fragments.get(href);if(!entry)return null;
    fragments.delete(href);fragments.set(href,entry);return entry.html;
  }
  function rememberFragment(href,html,scope) {
    if(scope===null||syncFragmentScope()!==scope)return;
    const bytes=new Blob([html]).size;if(bytes>fragmentSizeLimit)return;
    discardFragment(href);
    while(fragments.size>=fragmentLimit||fragmentBytes+bytes>fragmentByteLimit)discardFragment(fragments.keys().next().value);
    fragments.set(href,{html,bytes,at:Date.now()});fragmentBytes+=bytes;
  }
  // The movie actions and their SVG optics cannot exist before the fragment.
  // Get that fragment on hover/focus/pointer-down so a later click can insert
  // the real buttons while the sheet begins its entrance, not after loading.
  function prefetchFragment(href) {
    const scope=syncFragmentScope();
    if(scope===null||recentFragment(href)!==null)return;
    if(warmups.has(href)||warmups.size>=warmupLimit)return;
    const promise=fetch(href+'?view=modal',{headers:{Accept:'text/html'}})
      .then(response=>{if(!response.ok)throw new Error('Details unavailable');return response.text();})
      .then(html=>{
        const parsed=new DOMParser().parseFromString(html,'text/html');
        const content=parsed.querySelector('.svTitleDetails');
        if(!content||syncFragmentScope()!==scope)return null;
        content.querySelectorAll('script,[data-sv-details-back]').forEach(node=>node.remove());
        const fragment=content.outerHTML;
        rememberFragment(href,fragment,scope);
        return fragment;
      })
      .catch(()=>null)
      .finally(()=>{if(warmups.get(href)?.promise===promise)warmups.delete(href);});
    warmups.set(href,{scope,promise});
  }
  function detailIntent(target) {
    const link=target?.closest?.('a[href]');
    if(!link||link.closest('.svDetailDialog')||link.hasAttribute('download')||
       (link.target&&link.target!=='_self')||link.hasAttribute('data-play-id'))return null;
    return titleRoute(link.href);
  }
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
    // Only the inserted fragment needs library state. Rewriting the catalog's
    // labels here tears down its existing glass while the sheet is moving.
    if (typeof window.syncLibraryButtons==='function') window.syncLibraryButtons(root);
    window.SwiflyContinue?.decorate?.(root);
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
  function alignPageFrame() {
    // clientWidth can include a stable gutter when scrollbar painting is
    // suppressed. The root's laid-out box preserves the real content edge.
    const width=document.documentElement.getBoundingClientRect().width||document.documentElement.clientWidth;
    const gutter=Math.max(0,window.innerWidth-width);
    // Keep this responsive without reading/writing geometry during a resize.
    document.documentElement.style.setProperty('--sv-detail-page-width','calc(100vw - '+gutter+'px)');
    document.documentElement.classList.add('svDetailsFramed');
  }
  function syncSheetScroll() {
    if(sheetTransition)sheetPanel.style.setProperty('--sv-detail-scroll',(viewport.scrollTop||0)+'px');
  }
  function cancelSheetTransition() {
    transitionEpoch++;
    const active=sheetTransition;sheetTransition=null;if(!active)return;
    clearTimeout(active.timer);
    cancelAnimationFrame(active.frame);
    for(const animation of active.animations)animation.cancel();
  }
  function moveSheet(state,complete) {
    const entering=state==='opening',reversing=Boolean(sheetTransition);
    // Keep the sheet's layout stationary. The shared glass renderer measures
    // layout dimensions, so its prepared lenses can travel with this layer.
    const offscreen='translateY(calc(var(--sv-detail-rise) + var(--sv-detail-scroll)))';
    const start=reversing?getComputedStyle(sheetPanel).transform:(entering?offscreen:'translateY(0px)');
    const opacity=reversing?getComputedStyle(scrim).opacity:(entering?'0':'1');
    cancelSheetTransition();
    const epoch=transitionEpoch,duration=entering?enterDuration:exitDuration;
    const active={epoch,animations:[],frame:0,timer:null,complete:null};sheetTransition=active;syncSheetScroll();
    sheetPanel.style.removeProperty('animation-play-state');scrim.style.removeProperty('animation-play-state');
    dialog.dataset.svDetailState=state;scrim.dataset.svDetailState=state;
    const settle=()=>{
      if(sheetTransition!==active||epoch!==transitionEpoch)return;
      sheetTransition=null;clearTimeout(active.timer);cancelAnimationFrame(active.frame);
      dialog.dataset.svDetailState=entering?'open':'closed';scrim.dataset.svDetailState=entering?'open':'closed';
      sheetPanel.style.removeProperty('--sv-detail-start');scrim.style.removeProperty('--sv-detail-dim-start');
      sheetPanel.style.removeProperty('--sv-detail-scroll');
      sheetPanel.style.removeProperty('animation-play-state');scrim.style.removeProperty('animation-play-state');
      for(const animation of active.animations)animation.cancel();
      complete?.();
    };
    active.complete=settle;
    if(reducedMotion()){settle();return;}
    // Fragment parsing, library state and the first layout must not consume
    // the entrance or its watchdog before the browser can show one frame.
    const begin=(play,timeout)=>{
      active.frame=requestAnimationFrame(()=>{
        active.frame=0;if(sheetTransition!==active)return;
        play();active.timer=setTimeout(settle,timeout);
      });
    };
    sheetPanel.style.setProperty('--sv-detail-start',start||'translateY(0px)');
    scrim.style.setProperty('--sv-detail-dim-start',opacity||'0');
    if(typeof sheetPanel.animate==='function'){
      dialog.dataset.svDetailMotion='waapi';scrim.dataset.svDetailMotion='waapi';
      try {
        const animate=(target,frames,options)=>{
          const animation=target.animate(frames,{fill:'both',...options});active.animations.push(animation);
          animation.pause?.();animation.currentTime=0;
          animation.finished.catch(()=>{});return animation.finished;
        };
        const easing=entering?enterEase:exitEase;
        const sheet=animate(sheetPanel,[{transform:start||'translateY(0px)'},{transform:entering?'translateY(0px)':offscreen}],{duration,easing});
        const dim=animate(scrim,[{opacity:opacity||'0'},{opacity:entering?'1':'0'}],{duration,easing});
        Promise.all([sheet,dim]).then(settle,()=>{});
        begin(()=>{for(const animation of active.animations)animation.play?.();},duration+100);return;
      } catch {
        for(const animation of active.animations)animation.cancel();active.animations=[];
      }
    }
    dialog.dataset.svDetailMotion='css';scrim.dataset.svDetailMotion='css';
    const name=entering?'svDetailsEnter':'svDetailsExit';
    if(getComputedStyle(sheetPanel).animationName!==name){settle();return;}
    // CSS events from a cancelled animation can arrive after a new transition begins.
    // A bounded timer also completes when a background tab drops animationend entirely.
    begin(()=>{sheetPanel.style.animationPlayState='running';scrim.style.animationPlayState='running';},duration+34);
  }
  function settleReducedMotion() {if(reducedMotion())sheetTransition?.complete();}
  function focusReadyEntry(current) {
    const entry=entryFocus;if(!entry||entry.current!==current)return;entryFocus=null;
    if(entry.cancelled||current!==generation||!dialog.open||dialog.dataset.svDetailState==='closing'||document.documentElement.dataset.svTv!=='true')return;
    const active=document.activeElement;
    if(active!==document.body&&active!==dialog&&!dialog.contains(active))return;
    const action=viewport.querySelector('.svDetailActions .dsPrimaryBtn');
    if(!action?.matches('a[href],button')||action.tabIndex<0||action.closest('[disabled],[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]'))return;
    const rect=action.getBoundingClientRect(),style=getComputedStyle(action);
    if(rect.width<=6||rect.height<=6||style.display==='none'||style.visibility==='hidden'||Number(style.opacity||1)<=.05)return;
    // Native showModal focuses chrome while metadata is loading. Hand that
    // default to Play once, without moving a restored title or catalog scroll.
    try {action.focus({preventScroll:true});} catch {}
  }
  function reset() {
    cancelSheetTransition();generation++;entryFocus=null;request?.abort();request=null;window.SwiflyMotion?.stop(viewport);window.SwiflyMotion?.release(viewport);
    if(scrim){scrim.hidden=true;scrim.dataset.svDetailState='closed';}
    if(dialog){dialog.dataset.svDetailState='closed';dialog.removeAttribute('aria-busy');}
    document.documentElement.classList.remove('svDetailsOpen');
    if(trigger?.isConnected)trigger.focus({preventScroll:true});lastTrigger=trigger||lastTrigger;trigger=null;
    contentHost?.replaceChildren();currentHref='';currentURL='';trail=[];
  }
  function leaveHistory() {
    if(closingHistory||!mediaRoute())return;
    if(ownEntry()?.pushed&&history.length>1){closingHistory=true;history.back();}
    else writeHistory('replaceState',historyState(),baseURL());
  }
  function dismiss(updateHistory) {
    if(!dialog?.open)return;
    if(dialog.dataset.svDetailState==='closing'){if(!updateHistory)closeWantsHistory=false;return;}
    closeWantsHistory=updateHistory;generation++;entryFocus=null;request?.abort();request=null;window.SwiflyMotion?.stop(viewport);
    moveSheet('closing',()=>{
      const leave=closeWantsHistory;closeWantsHistory=false;
      closingDialog=true;dialog.close();reset();closingDialog=false;
      if(leave)leaveHistory();
    });
  }
  function close() {
    if(!dialog?.open||dialog.dataset.svDetailState==='closing')return;rememberDetailScroll();dismiss(true);
  }
  function ensureDialog() {
    if(dialog)return;
    scrim=document.createElement('div');scrim.className='svDetailScrim';scrim.hidden=true;scrim.setAttribute('aria-hidden','true');document.body.append(scrim);
    dialog=document.createElement('dialog');dialog.className='svDetailDialog';dialog.setAttribute('aria-label','Movie details');
    const chrome=document.createElement('div');chrome.className='svDetailChrome';
    const back=document.createElement('button');back.type='button';back.className='svDetailBack dsIconBtn';back.dataset.svDialogBack='';back.setAttribute('aria-label','Back to browsing');back.innerHTML=backIcon;
    const title=document.createElement('span');title.className='svDetailChromeTitle';title.textContent='Movie details';
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='svDetailDismiss dsIconBtn';dismiss.dataset.svDetailClose='';dismiss.setAttribute('aria-label','Close movie details');dismiss.innerHTML=closeIcon;
    chrome.append(back,title,dismiss);viewport=document.createElement('div');viewport.className='svDetailViewport svCinemaPage';viewport.dataset.cinemaPage='details';
    const stage=document.createElement('div');stage.className='svDetailStage';
    sheetPanel=document.createElement('div');sheetPanel.className='svDetailPanel';
    contentHost=document.createElement('div');contentHost.className='svDetailContent';
    sheetPanel.append(chrome,contentHost);stage.append(sheetPanel);viewport.append(stage);dialog.append(viewport);document.body.append(dialog);
    back.addEventListener('click',goBack);dismiss.addEventListener('click',close);
    const cancelEntryFocus=event=>{if(entryFocus&&dialog.contains(event.target))entryFocus.cancelled=true;};
    // Capture before the TV controller handles activation: the key that opens
    // another title must not count as navigation within the new request.
    window.addEventListener('keydown',cancelEntryFocus,true);dialog.addEventListener('pointerdown',cancelEntryFocus,true);
    dialog.addEventListener('focusin',event=>{if(entryFocus&&event.target!==entryFocus.initial&&event.target!==back)entryFocus.cancelled=true;});
    viewport.addEventListener('scroll',()=>{syncSheetScroll();dialog.classList.toggle('svDetailScrolled',viewport.scrollTop>180);},{passive:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{
      if(dialog.open||closingDialog||!contentHost.firstChild)return;
      rememberDetailScroll();reset();leaveHistory();
    });
    dialog.addEventListener('click',event=>{if(event.target instanceof Element&&!event.target.closest('.svDetailPanel'))close();});
  }
  async function render(href,from,scroll=0) {
    ensureDialog();entryFocus=null;request?.abort();window.SwiflyMotion?.stop(viewport);window.SwiflyMotion?.release(viewport);
    request=new AbortController();const current=++generation;currentHref=href;currentURL=route(new URL(location.href));scrollPositions.set(currentURL,scroll);
    const entering=!dialog.open||dialog.dataset.svDetailState==='closing';
    if(!dialog.open){trigger=from||lastTrigger||document.activeElement;window.SwiflyMotion?.stop();alignPageFrame();document.documentElement.classList.add('svDetailsOpen');scrim.hidden=false;dialog.showModal();}
    viewport.scrollTop=0;dialog.classList.remove('svDetailScrolled');dialog.setAttribute('aria-busy','true');
    dialog.setAttribute('aria-label','Movie details');dialog.querySelector('.svDetailChromeTitle').textContent='Movie details';
    contentHost.innerHTML='<div class="svDetailLoading" role="status"><div class="svDetailLoadingArt"></div><div class="svDetailLoadingCopy"><span></span><span></span><span></span></div><p>Loading details…</p></div>';
    entryFocus={current,initial:document.activeElement,cancelled:false};
    dialog.querySelector('[data-sv-dialog-back]').setAttribute('aria-label',trail.length?'Back to previous title':'Back to browsing');
    if(entering){closeWantsHistory=false;moveSheet('opening',()=>{window.SwiflyGlassSurfaces?.refresh(dialog);window.SwiflyMotion?.refresh(viewport);});}
    try {
      const scope=syncFragmentScope();let html=scope===null?null:recentFragment(href);
      let cached=html!==null;
      if(html===null){
        const warming=warmups.get(href);
        if(scope!==null && warming?.scope===scope) {
          html=await warming.promise;
          cached=html!==null;
        }
        if(html===null) {
          const response=await fetch(href+'?view=modal',{signal:request.signal,headers:{Accept:'text/html'}});
          if(!response.ok)throw new Error('Details unavailable');
          html=await response.text();
        }
      }
      if(current!==generation||!dialog.open)return;
      const parsed=new DOMParser().parseFromString(html,'text/html');
      const content=parsed.querySelector('.svTitleDetails');if(!content)throw new Error('Details unavailable');
      content.querySelectorAll('script,[data-sv-details-back]').forEach(node=>node.remove());if(!cached)rememberFragment(href,content.outerHTML,scope);contentHost.replaceChildren(content);
      const name=content.querySelector('h1')?.textContent.trim()||'Movie';dialog.setAttribute('aria-label',name+' details');dialog.querySelector('.svDetailChromeTitle').textContent=name;
      initialize(content);viewport.scrollTop=scroll;syncSheetScroll();dialog.classList.toggle('svDetailScrolled',scroll>180);
    }catch(error){
      if(error.name==='AbortError'||current!==generation||!dialog.open)return;
      const panel=document.createElement('div');panel.className='svDetailError';
      const heading=document.createElement('h2');heading.textContent='Details are taking a moment';
      const copy=document.createElement('p');copy.textContent='Open the full title page or return to browsing.';
      const link=document.createElement('a');link.href=href;link.className='dsSecondaryBtn';link.dataset.svDetailFallback='';link.textContent='Open full details';panel.append(heading,copy,link);contentHost.replaceChildren(panel);
    }finally{if(current===generation){dialog.removeAttribute('aria-busy');focusReadyEntry(current);}}
  }
  async function open(value,from) {
    const href=titleRoute(value);if(!href)return;
    if(closingHistory)return new Promise(resolve=>pendingOpen.push({href,from,resolve}));
    if(dialog?.open&&mediaRoute()){if(currentHref&&currentHref!==href)trail.push({href:currentHref,scroll:viewport.scrollTop});selectURL(href,true);}
    else {trail=[];rememberCatalog();selectURL(href,false);}
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
    else if(dialog?.open){trail=[];dismiss(false);}
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
    const type=link.getAttribute('data-sv-party-type')==='tv'?'tv':'movie';
    const target=localURL(link.href);
    if(!target||target.pathname!=='/watch/'+type+'/'+id||target.searchParams.getAll('party').length!==1||target.searchParams.get('party')!=='create')return;
    const expected='/'+type+'/'+id,source=localURL(location.href);
    if(!source||!(titleRoute(source.href)===expected&&!mediaRoute(source.href)||catalogURL(source.href)&&mediaRoute(source.href)===expected))return;
    rememberDetailScroll();storageWrite('swiflytv.partyReturn',route(source));
  }
  function scrollChapter(link,event) {
    const root=link.closest('.svTitleDetails'),hash=link.getAttribute('href');
    if(!root||!link.closest('.svDetailChapterNav')||!/^#(?:overview|cast|episodes|details|collection)$/.test(hash||''))return false;
    event.preventDefault();
    const target=root.querySelector(hash);if(!target)return true;
    const host=root.closest('.svDetailViewport')||document.scrollingElement||document.documentElement;
    const page=host===document.scrollingElement||host===document.documentElement;
    const top=Math.max(0,target.getBoundingClientRect().top+(page?window.scrollY:host.scrollTop-host.getBoundingClientRect().top)-(page?100:20));
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion');
    const options={top,behavior:reduced?'instant':'smooth'};
    if(window.SwiflyMotion)window.SwiflyMotion.scrollTo(host,options);
    else if(page)window.scrollTo(options);else host.scrollTo(options);
    return true;
  }
  function boot() {
    if(started)return;started=true;rememberCatalog();initialize(document);
    motionPreference.addEventListener?.('change',settleReducedMotion);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)sheetTransition?.complete();});
    new MutationObserver(settleReducedMotion).observe(document.body,{attributes:true,attributeFilter:['class']});
    // Passing over movie cards during a wheel glide is not a real intent to
    // open them. Avoid parsing/fetching metadata for titles under the pointer.
    document.addEventListener('swifly:card-scroll-start',()=>{
      clearTimeout(hoverTimer);hoverTimer=0;hoverHref=null;
    });
    document.addEventListener('pointerover',event=>{
      if(document.documentElement.dataset.svCardScrolling==='true'){
        clearTimeout(hoverTimer);hoverTimer=0;hoverHref=null;return;
      }
      const href=detailIntent(event.target);
      if(href===hoverHref)return;
      clearTimeout(hoverTimer);hoverHref=href;
      if(href)hoverTimer=setTimeout(()=>{
        hoverTimer=0;
        if(document.documentElement.dataset.svCardScrolling!=='true')prefetchFragment(href);
      },100);
    },{passive:true});
    document.addEventListener('pointerout',event=>{
      const from=detailIntent(event.target),to=detailIntent(event.relatedTarget);
      if(from&&from!==to){clearTimeout(hoverTimer);hoverTimer=0;hoverHref=null;}
    },{passive:true});
    document.addEventListener('focusin',event=>{
      const href=detailIntent(event.target);if(href)prefetchFragment(href);
    },{passive:true});
    document.addEventListener('pointerdown',event=>{
      if(event.button>0)return;
      const href=detailIntent(event.target);if(href)prefetchFragment(href);
    },{passive:true});
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
      if(scrollChapter(link,event))return;
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
