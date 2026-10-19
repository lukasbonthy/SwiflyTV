'use strict';

function tvGate() {
  let saved=null;
  try {saved=localStorage.getItem('swiflytv.tvFocusMode');if(saved===null&&localStorage.getItem('swiflytv.tvControllerMode')==='true')saved='true';} catch {}
  const television=/SmartTV|Smart-TV|Tizen|Web0S|webOS|NetCast|HbbTV|AFT[A-Z]|Android.*\bTV\b|BRAVIA/i.test(navigator.userAgent);
  if(saved==='true'||saved===null&&television)document.documentElement.dataset.svTv='true';
}

function swiflyTvFocusNavigation() {
  if(window.__swiflyTvFocusNavigationLoaded)return;
  window.__swiflyTvFocusNavigationLoaded=true;
  let enabled=document.documentElement.dataset.svTv==='true';
  try {const saved=localStorage.getItem('swiflytv.tvFocusMode');enabled=saved===null?enabled||localStorage.getItem('swiflytv.tvControllerMode')==='true':saved==='true';} catch {}
  let focused=null,hint=null,hintTimer=0,raf=0,connected=false,lastMoveAt=0,lastAxisDirection='',axisRepeatStartedAt=0,lastFrame=null;
  let guide=null,help=null,helpReturn=null,engagedSelect=null,inputReturn=null,windowActive=true,activePadKey='',lastButtons=[],stickScrolling=false,scrollDestination=null;
  const padStates=new Map(),railMemory=new WeakMap();
  var FOCUSABLE_SELECTOR='a[href],summary,button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[role="button"],[role="link"],[tabindex]:not([tabindex="-1"]),video';
  const rails='.movieRail,.dsRail,.nfRail,.nfTopTenRail,.svResumeRail,.dsWelcomeRailTrack,.svDetailCastRail,.svDetailCollectionRail';
  const railItems='.dsThumb,.posterWrap,.svResumeLink,[data-resume-action],.dsCastCard';
  const cardSelector='.movieCard,.svResumeCard';
  const rowSelector='.dsRow,.svResumeSection,.svDetailSection,section';
  const directions={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
  const codes={13:'Enter',19:'MediaPause',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',412:'MediaRewind',413:'MediaStop',415:'MediaPlay',417:'MediaFastForward',461:'BrowserBack',10009:'BrowserBack',10252:'MediaPlayPause',10232:'MediaTrackPrevious',10233:'MediaTrackNext'};
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion');
  function pads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(pad=>pad&&pad.connected!==false&&(!pad.mapping||pad.mapping==='standard')):[];}catch{return [];}}
  function activeModal(){return document.activeElement?.closest('dialog[open]')||document.querySelector('.svStudioDialog[open]')||Array.from(document.querySelectorAll('dialog[open]')).pop()||null;}
  function scope(){
    const modal=activeModal();if(modal)return modal;
    const fullscreen=document.fullscreenElement;
    if(fullscreen){const popover=fullscreen.querySelector('.svPlayerPopover[open],[data-player-settings][open],[data-player-volume-menu][open]');return popover||fullscreen;}
    const profile=document.querySelector('.dsProfileMenu[open]');if(profile)return profile;
    const search=document.querySelector('#svNavSearchPopup:not([hidden])');if(search)return search;
    const popover=document.activeElement?.closest('[data-player-root]')?.querySelector('.svPlayerPopover[open],[data-player-settings][open],[data-player-volume-menu][open]');if(popover)return popover;
    return document;
  }
  function eligible(el,root=scope()){
    if(!el?.isConnected||el.disabled||el.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],dialog:not([open])'))return false;
    if(el.matches('video')&&(el.closest('[data-player-root],[data-watchroom-call]')||!el.hasAttribute('controls')&&!el.hasAttribute('tabindex')))return false;
    if(el.closest('.dsCardQuickActions')||el.matches('.dsCardTitle')&&el.closest('.movieCard')?.querySelector('.dsThumb'))return false;
    if(el.matches('.svResumeTitle')&&el.closest('.svResumeCard')?.querySelector('.svResumeLink'))return false;
    const closed=el.closest('details:not([open])');if(closed&&!closed.querySelector('summary')?.contains(el))return false;
    if(root!==document&&!root.contains(el))return false;
    const dock=el.closest('[data-player-controls]');if(dock&&dock.closest('[data-player-root]')?.dataset.playerControlsVisibility==='hidden')return false;
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>6&&rect.height>6&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.05;
  }
  function getFocusable(){const root=scope();return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el=>eligible(el,root));}
  function centerOf(el){const rect=el.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,rect};}
  function clearFocus(){
    focused?.classList.remove('swifly-tv-focus-target','swifly-tv-focus-pressed');
    focused?.closest(cardSelector)?.classList.remove('svTvFocusedCard');focused?.closest(rowSelector)?.classList.remove('svTvFocusedRow');focused=null;
  }
  function disengageSelect(){engagedSelect?.removeAttribute('data-sv-tv-engaged');engagedSelect=null;}
  function scrollWindow(top,behavior){
    const destination=Math.max(0,Math.min(top,Math.max(0,document.documentElement.scrollHeight-innerHeight)));
    // Repeated horizontal input must not restart an in-flight row transition.
    if(scrollDestination!==null&&Math.abs(scrollDestination-destination)<1)return;
    scrollDestination=destination;window.SwiflyPremiumScroll?.cancel();window.scrollTo({top:destination,behavior});
  }
  function revealFocus(el){
    const behavior=reduced()?'instant':'smooth',root=scope(),rail=el.closest(rails),card=el.closest(cardSelector)||el;
    if(root===document&&rail&&rail.closest('.dsRow,.svResumeSection')&&!rail.closest('.svCinemaPage')&&el.matches(railItems)){
      const box=card.getBoundingClientRect(),frame=rail.getBoundingClientRect();
      let left=rail.scrollLeft;
      if(box.left<frame.left+10)left+=box.left-frame.left-10;
      else if(box.right>frame.right-10)left+=box.right-frame.right+10;
      if(Math.abs(left-rail.scrollLeft)>1){window.SwiflyPremiumScroll?.cancel();rail.scrollTo({left,top:0,behavior});}
      const row=rail.closest(rowSelector),heading=row?.querySelector('.svSectionHead h2,.dsRowHead h2,h2'),nav=document.querySelector('.netflixNav');
      const top=(nav?.getBoundingClientRect().bottom||0)+20;
      scrollWindow(scrollY+(heading||card).getBoundingClientRect().top-top,behavior);
      return;
    }
    if(root===document&&(el.closest('.dsHeroActions')||el.closest('.netflixNav'))){scrollWindow(0,behavior);return;}
    scrollDestination=null;window.SwiflyPremiumScroll?.cancel();
    card.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduced()?'instant':'smooth'});
  }
  function setFocus(el,options={}){
    if(!eligible(el))return false;
    if(focused!==el){if(el.matches('input,textarea,[contenteditable="true"]')&&!focused?.matches('input,textarea,[contenteditable="true"]'))inputReturn=focused;disengageSelect();clearFocus();focused=el;el.classList.add('swifly-tv-focus-target');el.closest(cardSelector)?.classList.add('svTvFocusedCard');el.closest(rowSelector)?.classList.add('svTvFocusedRow');if(el.closest(rails)&&el.matches(railItems))railMemory.set(el.closest(rails),el);try{el.focus({preventScroll:true});}catch{}}
    if(options.scroll!==false)try{revealFocus(el);}catch{}
    syncGuide();
    return true;
  }
  function firstFocus(options={scroll:false}){
    const active=document.activeElement;if(active&&active!==document.body&&active.matches?.(FOCUSABLE_SELECTOR)&&eligible(active))return setFocus(active,options);
    const all=getFocusable();
    const preferred=rememberedFocus(all)||all.find(el=>el.matches('[data-player-stage],.dsHeroActions .dsPrimaryBtn,.svDetailActions .dsPrimaryBtn,[autofocus]'))||all.find(el=>el.matches('.active,[aria-current="page"],.selected'))||all[0];
    return preferred?setFocus(preferred,options):false;
  }
  function rememberedFocus(elements){try{const saved=JSON.parse(sessionStorage.getItem('swiflytv.tvFocusHistory')||'[]'),record=Array.isArray(saved)&&saved.find(row=>row.path===location.pathname+location.search);return record&&elements.find(el=>el.getAttribute('href')===record.href&&(el.getAttribute('aria-label')||el.textContent.trim())===record.label);}catch{return null;}}
  function rememberFocus(){
    if(!enabled||!focused?.matches('a[href]'))return;
    try{const saved=JSON.parse(sessionStorage.getItem('swiflytv.tvFocusHistory')||'[]'),path=location.pathname+location.search,rows=Array.isArray(saved)?saved.filter(row=>row.path!==path):[];rows.push({path,href:focused.getAttribute('href'),label:focused.getAttribute('aria-label')||focused.textContent.trim()});sessionStorage.setItem('swiflytv.tvFocusHistory',JSON.stringify(rows.slice(-12)));}catch{}
  }
  function showHint(reason='TV mode is on'){
    if(!enabled)return;
    if(!hint){hint=document.createElement('div');hint.id='swiflyTvHint';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');document.body.append(hint);}
    hint.innerHTML='<b>'+escape(reason)+'</b><span>'+(connected?'<kbd>A</kbd> Select <kbd>B</kbd> Back <kbd>View</kbd> Controller guide':'<kbd>↑ ↓ ← →</kbd> Navigate <kbd>OK</kbd> Select <kbd>Back</kbd> Return <kbd>F8</kbd> Exit TV mode')+'</span>';
    hint.hidden=false;hint.dataset.visible='true';clearTimeout(hintTimer);
    hintTimer=setTimeout(()=>{hint?.removeAttribute('data-visible');if(hint)hint.hidden=true;},5500);
  }
  function syncGuide(){
    if(!enabled){if(guide)guide.hidden=true;return;}
    if(!guide){guide=document.createElement('aside');guide.id='swiflyTvGuide';guide.setAttribute('aria-label','TV controls');guide.innerHTML='<div class="svTvGuideContext"><span class="svTvGuideEyebrow"></span><strong class="svTvGuideTitle"></strong></div><div class="svTvGuideCommands"></div>';document.body.append(guide);}
    const root=playerRoot(),card=focused?.closest(cardSelector),row=focused?.closest(rowSelector),title=card?.querySelector('.dsCardTitle,.svResumeTitle')?.textContent.trim()||focused?.getAttribute('aria-label')||focused?.textContent.trim()||'Find your next story';
    guide.dataset.input=connected?'gamepad':'remote';
    const hidden=Boolean(activeModal()||document.fullscreenElement||focused?.closest('[data-player-stage],[data-player-controls]'));if(guide.hidden!==hidden)guide.hidden=hidden;
    const rail=focused?.closest(rails),items=rail&&Array.from(rail.querySelectorAll(railItems)),position=items?.indexOf(focused);
    const eyebrow=(engagedSelect?'CHOOSE AN OPTION':row?.querySelector('h2')?.textContent.trim()||(root?'NOW WATCHING':'TV MODE'))+(position>=0?' · '+(position+1)+' / '+items.length:'');
    const text=engagedSelect?focused.options[focused.selectedIndex]?.textContent||title:title;
    const label=guide.querySelector('.svTvGuideTitle'),category=guide.querySelector('.svTvGuideEyebrow');
    if(label.textContent!==text)label.textContent=text;if(category.textContent!==eyebrow)category.textContent=eyebrow;
    const commands=connected?(engagedSelect?[['a','A','Done'],['b','B','Back'],['dpad','↑/↓','Choose']]:[['a','A','Select'],['b','B','Back'],...(root?[['x','X','Play / pause']]:[]),['y','Y','Search'],...(!root?[['lb','LB/RB','Browse row']]:[]),['view','View','Help']]):[['dpad','↑ ↓ ← →','Navigate'],['a','OK','Select'],['b','Back','Return']];
    const html=commands.map(([key,button,label])=>'<span class="svTvCommand"><kbd data-button="'+key+'">'+button+'</kbd><span>'+label+'</span></span>').join('');
    const host=guide.querySelector('.svTvGuideCommands');if(host.innerHTML!==html)host.innerHTML=html;
  }
  function showHelp(){
    if(help?.open){help.close();return;}if(activeModal())return;
    helpReturn=focused;
    if(!help){
      help=document.createElement('dialog');help.id='swiflyTvHelp';help.className='svTvHelp';help.setAttribute('aria-labelledby','swiflyTvHelpTitle');
      const items=[['D-pad / LS','Move between titles and controls'],['A','Select · enter or finish editing a list'],['B','Close a menu or go back'],['Y','Search movies and shows'],['LB / RB','Browse a row · previous / next episode in the player'],['LT / RT','Previous / next row · seek 10 seconds in the player'],['X','Play / pause'],['Menu','Playback settings · profile menu'],['RS','Scroll the page · press to center your selection'],['View','Show this controller guide']];
      help.innerHTML='<h2 id="swiflyTvHelpTitle">Your controller. Your cinema.</h2><p>Everything you need, without reaching for a mouse.</p><div class="svTvHelpGrid">'+items.map(([key,label])=>'<div class="svTvHelpItem"><kbd>'+key+'</kbd><span>'+label+'</span></div>').join('')+'</div><div class="svTvHelpActions"><button type="button" data-sv-tv-help-close>Continue watching</button><button type="button" data-sv-tv-help-exit>Exit TV mode</button></div>';
      help.querySelector('[data-sv-tv-help-close]').onclick=()=>help.close();help.querySelector('[data-sv-tv-help-exit]').onclick=()=>{help.close();setEnabled(false);document.querySelector('.dsProfileMenu > summary')?.focus({preventScroll:true});};
      help.addEventListener('close',()=>{if(!enabled){syncGuide();return;}if(helpReturn?.closest('#svNavSearchPopup')?.hidden)activate(document.getElementById('svNavSearchToggle'));if(!setFocus(helpReturn,{scroll:false})&&!setFocus(helpReturn?.closest('details')?.querySelector('summary'),{scroll:false}))firstFocus({scroll:false});});help.addEventListener('cancel',event=>{event.preventDefault();help.close();});document.body.append(help);
    }
    help.showModal();const close=help.querySelector('[data-sv-tv-help-close]');setFocus(close,{scroll:false});syncGuide();
  }
  function syncToggles(){for(const button of document.querySelectorAll('[data-sv-tv-toggle]')){button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Exit TV mode':'Turn on TV mode');const state=button.querySelector('[data-sv-tv-state]');if(state)state.textContent=enabled?'On':'Off';}}
  function setEnabled(value,reason){
    scrollDestination=null;
    const wasEnabled=enabled;enabled=Boolean(value);if(enabled&&!wasEnabled){connected=pads().length>0;primeGamepads();}try{localStorage.setItem('swiflytv.tvFocusMode',String(enabled));localStorage.removeItem('swiflytv.tvControllerMode');}catch{}
    if(enabled)document.documentElement.dataset.svTv='true';else delete document.documentElement.dataset.svTv;
    document.body.classList.toggle('swifly-tv-focus-mode',enabled);document.body.classList.remove('swifly-tv-controller-mode');document.getElementById('swiflyTvCursor')?.remove();syncToggles();
    if(enabled){firstFocus();syncGuide();observeFocus();if(reason!==false)showHint(reason);startLoop();}else{disengageSelect();clearFocus();focusObserver.disconnect();if(help?.open)help.close();syncGuide();cancelAnimationFrame(raf);raf=0;clearTimeout(hintTimer);if(hint){hint.hidden=true;hint.removeAttribute('data-visible');}}
  }
  function adjustControl(direction){
    if(!focused||focused.disabled)return false;
    if(focused.matches('input[type="range"]')&&['left','right'].includes(direction)){
      const input=focused,min=Number(input.min)||0,max=input.max===''?100:Number(input.max),step=input.hasAttribute('data-player-seek')?10:input.hasAttribute('data-player-volume') ? .05 : Number(input.step)||1;
      input.value=String(Math.max(min,Math.min(max,Number(input.value)+(direction==='right'?step:-step))));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(focused===engagedSelect&&['up','down'].includes(direction)){let next=focused.selectedIndex+(direction==='down'?1:-1);while(next>=0&&next<focused.options.length&&focused.options[next].disabled)next+=direction==='down'?1:-1;if(next>=0&&next<focused.options.length){focused.selectedIndex=next;focused.dispatchEvent(new Event('change',{bubbles:true}));syncGuide();}return true;}
    return false;
  }
  function itemsIn(rail){return Array.from(rail.querySelectorAll(railItems)).filter(el=>eligible(el));}
  function moveRow(direction){
    const rail=focused?.closest(rails);if(!rail||!focused.matches(railItems))return false;
    const rows=Array.from(scope().querySelectorAll(rails)),step=direction==='down'?1:-1;let index=rows.indexOf(rail)+step,items=[];
    while(index>=0&&index<rows.length){items=itemsIn(rows[index]);if(items.length)break;index+=step;}if(!items.length)return false;
    const remembered=railMemory.get(rows[index]);if(items.includes(remembered))return setFocus(remembered);
    const x=centerOf(focused).x;let target=items[0],distance=Infinity;
    for(const el of items){const nextDistance=Math.abs(centerOf(el).x-x);if(nextDistance<distance){target=el;distance=nextDistance;}}
    return setFocus(target);
  }
  function moveCatalogEdge(direction){
    if(!['up','down'].includes(direction)||scope()!==document||!focused||focused.closest('.svCinemaPage'))return false;
    const first=Array.from(document.querySelectorAll(rails)).find(rail=>rail.closest('.dsRow,.svResumeSection')&&!rail.closest('.svCinemaPage')&&itemsIn(rail).length);
    if(!first)return false;
    const hero=document.querySelector('.dsHeroActions .dsPrimaryBtn'),feature=hero&&eligible(hero)?hero:null;
    const nav=document.querySelector('.netflixNav .navLinks .active,.netflixNav [aria-current="page"]')||document.querySelector('.netflixNav a');
    if(direction==='up'&&focused.closest(rails)===first)return setFocus(feature||nav);
    if(direction==='down'&&(focused.closest('.dsHeroActions')||focused.closest('.netflixNav'))){
      if(focused.closest('.netflixNav')&&feature)return setFocus(feature);
      const items=itemsIn(first),remembered=railMemory.get(first);return setFocus(items.includes(remembered)?remembered:items[0]);
    }
    return false;
  }
  function pageFocus(direction){
    if(activeModal()||engagedSelect)return;
    if(moveRow(direction))return;
    if(!focused||!eligible(focused))firstFocus();if(!focused)return;
    const current=centerOf(focused),targetY=current.y+(direction==='down'?1:-1)*innerHeight*.7;
    const all=getFocusable().filter(el=>{const y=centerOf(el).y;return direction==='down'?y>current.y+8:y<current.y-8;});
    const next=all.reduce((best,el)=>{const p=centerOf(el),b=best&&centerOf(best);return !b||Math.abs(p.y-targetY)+Math.abs(p.x-current.x)*.5<Math.abs(b.y-targetY)+Math.abs(b.x-current.x)*.5?el:best;},null);if(next)setFocus(next);
  }
  function pageRow(direction){
    if(activeModal()||engagedSelect)return;
    const rail=focused?.closest(rails);if(!rail||!focused.matches(railItems)){moveFocus(direction);return;}
    const items=itemsIn(rail),index=items.indexOf(focused),rect=focused.getBoundingClientRect(),step=Math.max(1,Math.floor(rail.getBoundingClientRect().width/(rect.width+20)));
    setFocus(items[Math.max(0,Math.min(items.length-1,index+(direction==='right'?step:-step)))]);
  }
  function moveFocus(direction,force=true){
    if(!enabled)return;if(!focused||!eligible(focused))firstFocus();if(!focused)return;
    const now=Date.now();if(!force&&now-lastMoveAt<135)return;lastMoveAt=now;
    if(adjustControl(direction))return;
    if(moveCatalogEdge(direction))return;
    if(['up','down'].includes(direction)&&moveRow(direction))return;
    if(focused.matches('[data-player-stage]')){const root=focused.closest('[data-player-root]'),control=root?.querySelector(direction==='up'?'[data-player-seek]':direction==='left'?'[data-player-backward]':direction==='right'?'[data-player-forward]':'[data-player-play]');if(control&&setFocus(control))return;}
    const rail=focused.closest(rails);
    if(rail&&['left','right'].includes(direction)&&focused.matches(railItems)){
      const cards=itemsIn(rail),index=cards.indexOf(focused),next=cards[index+(direction==='right'?1:-1)];if(next)setFocus(next);return;
    }
    const current=centerOf(focused),horizontal=['left','right'].includes(direction);let best=null,bestScore=Infinity;
    for(const element of getFocusable()){
      if(element===focused||element.matches('[data-player-stage]')&&focused.closest('[data-player-controls]')&&horizontal)continue;const target=centerOf(element),dx=target.x-current.x,dy=target.y-current.y;
      if(direction==='left'&&dx>=-8||direction==='right'&&dx<=8||direction==='up'&&dy>=-8||direction==='down'&&dy<=8)continue;
      const primary=horizontal?Math.abs(dx):Math.abs(dy),secondary=horizontal?Math.abs(dy):Math.abs(dx);
      const overlap=horizontal?Math.min(current.rect.bottom,target.rect.bottom)-Math.max(current.rect.top,target.rect.top):Math.min(current.rect.right,target.rect.right)-Math.max(current.rect.left,target.rect.left);
      const score=primary+secondary*2.2+(overlap<=0?1200:0);if(score<bestScore){best=element;bestScore=score;}
    }
    if(best)setFocus(best);
    else if(!horizontal)scrollByAmount(0,(direction==='down'?1:-1)*Math.round(innerHeight*.65));
  }
  function scrollByAmount(dx,dy){
    scrollDestination=null;window.SwiflyPremiumScroll?.cancel();
    let parent=focused?.parentElement;
    while(parent&&parent!==document.body){const style=getComputedStyle(parent),vertical=dy&&/(auto|scroll)/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight+4,horizontal=dx&&/(auto|scroll)/.test(style.overflowX)&&parent.scrollWidth>parent.clientWidth+4;if(vertical||horizontal){parent.scrollBy({left:dx,top:dy,behavior:'auto'});return;}parent=parent.parentElement;}
    window.scrollBy({left:dx,top:dy,behavior:'auto'});
  }
  function playerRoot(){return document.activeElement?.closest('[data-player-root]')||document.querySelector('.svPlayerPage[data-player-mode="movie"]')||document.querySelector('.svPlayerEmbedded');}
  function revealPlayer(){const root=playerRoot();if(root&&!activeModal())root.dispatchEvent(new CustomEvent('swiflyplayer:tv-controls',{detail:{action:'show'}}));}
  function activate(button){if(button&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'){button.click();return true;}return false;}
  function clickFocused(){
    if(!focused||!eligible(focused))firstFocus();if(!focused)return;
    if(recoverVisibleFocus())return;
    const element=focused;element.classList.add('swifly-tv-focus-pressed');setTimeout(()=>element.classList.remove('swifly-tv-focus-pressed'),140);
    if(element.matches('select')){if(engagedSelect===element)disengageSelect();else{engagedSelect=element;element.dataset.svTvEngaged='true';}syncGuide();return;}
    const root=element.closest('[data-player-root]');if(root&&element.matches('video,[data-player-stage]')){activate(root.querySelector('[data-player-play]'));return;}
    if(element.tagName==='VIDEO'){if(element.paused)element.play()?.catch(()=>{});else element.pause();return;}
    activate(element);
  }
  function goBack(){
    if(engagedSelect){disengageSelect();syncGuide();return;}
    const modal=activeModal();if(modal){if(modal.matches('.svDetailDialog')&&window.SwiflyDetails)window.SwiflyDetails.back();else modal.close();return;}
    const popup=document.querySelector('#svNavSearchPopup:not([hidden])');if(popup){popup.hidden=true;const toggle=document.getElementById('svNavSearchToggle');toggle?.setAttribute('aria-expanded','false');if(toggle)setFocus(toggle);return;}
    const menu=document.querySelector('.dsProfileMenu[open]');if(menu){menu.open=false;setFocus(menu.querySelector('summary'));return;}
    const root=playerRoot(),popover=root?.querySelector('details[open]');if(popover){popover.open=false;try{popover.querySelector('[popover]')?.hidePopover();}catch{}setFocus(popover.querySelector('summary'));return;}
    if(focused?.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]')){if(!setFocus(inputReturn))setFocus(getFocusable().find(el=>!el.matches('input,textarea')));return;}
    const video=root?.querySelector('[data-player-video]');if(root&&video&&!video.paused&&root.dataset.playerState==='ready'&&root.dataset.playerControlsVisibility!=='hidden'&&root.querySelector('[data-player-controls]')?.contains(document.activeElement)){root.dispatchEvent(new CustomEvent('swiflyplayer:tv-controls',{detail:{action:'hide'}}));return;}
    if(document.fullscreenElement){document.exitFullscreen()?.catch(()=>{});return;}
    const back=document.querySelector('[data-sv-player-back],.svDetailPage [data-sv-details-back]');if(back){back.click();return;}
    if(history.length>1)history.back();else location.href='/';
  }
  function focusSearch(){
    if(activeModal())return;
    if(document.fullscreenElement){try{Promise.resolve(document.exitFullscreen()).then(()=>{if(enabled)focusSearch();}).catch(()=>showHint('Exit fullscreen to search'));}catch{showHint('Exit fullscreen to search');}return;}
    const menu=document.querySelector('.dsProfileMenu[open]');if(menu)menu.open=false;
    const popover=playerRoot()?.querySelector('details[open]');if(popover){popover.open=false;try{popover.querySelector('[popover]')?.hidePopover();}catch{}}
    const search=document.querySelector('input[type="search"],input[name="q"]');if(search&&eligible(search)){setFocus(search);return;}
    const toggle=document.getElementById('svNavSearchToggle');if(toggle)activate(toggle);else showHint('Search is available from the navigation');
  }
  function tryMenu(){
    if(activeModal())return;
    const root=playerRoot(),settings=root?.querySelector('[data-player-settings]'),summary=settings?.querySelector('summary');revealPlayer();
    if(summary&&eligible(summary)){if(settings.open){settings.open=false;try{settings.querySelector('[popover]')?.hidePopover();}catch{}setFocus(summary);}else{activate(summary);setFocus(Array.from(settings.querySelectorAll('button,input,select')).find(el=>eligible(el))||summary);}return;}
    if(document.fullscreenElement){try{Promise.resolve(document.exitFullscreen()).then(()=>{if(enabled)tryMenu();}).catch(()=>{});}catch{}return;}
    const profile=document.querySelector('.dsProfileMenu'),toggle=profile?.querySelector('summary');if(toggle){activate(toggle);if(profile.open)setFocus(Array.from(profile.querySelectorAll('a,button')).find(el=>eligible(el))||toggle);else setFocus(toggle);return;}
    activate(document.getElementById('controlToggleTop'));
  }
  function toggleFullscreen(){
    const target=playerRoot()?.querySelector('[data-player-stage]')||document.querySelector('main')||document.documentElement;
    try{const action=document.fullscreenElement?document.exitFullscreen():target.requestFullscreen?.();action?.catch(()=>showHint('Fullscreen is unavailable in this browser'));}catch{showHint('Fullscreen is unavailable in this browser');}
  }
  function mediaKey(key){
    if(activeModal())return false;const root=playerRoot();if(!root)return false;
    const video=root.querySelector('[data-player-video],video'),control={MediaPlayPause:'play',MediaPlay:'play',MediaPause:'play',MediaStop:'play',MediaRewind:'backward',MediaFastForward:'forward',MediaTrackPrevious:'episode-previous',MediaTrackNext:'episode-next'}[key];if(!control)return false;
    if(key==='MediaPlay'&&!video?.paused||['MediaPause','MediaStop'].includes(key)&&video?.paused)return true;
    revealPlayer();activate(root.querySelector('[data-player-'+control+']'));return true;
  }
  function directionFromAxes(x,y,holding=false){const threshold=holding?.28:.52;if(Math.abs(x)<threshold&&Math.abs(y)<threshold)return '';return Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';}
  function buttonDown(pad,index){return Boolean(pad.buttons?.[index]?.pressed)||Number(pad.buttons?.[index]?.value||0)>.55;}
  function padDirection(pad,holding=false){for(const [index,value]of [[12,'up'],[13,'down'],[14,'left'],[15,'right']])if(buttonDown(pad,index))return value;return directionFromAxes(Number(pad.axes?.[0]||0),Number(pad.axes?.[1]||0),holding);}
  function padKey(pad,index){return String(pad.index??index)+':'+String(pad.id||'controller');}
  function snapshot(pad){return Array.from({length:Math.max(17,pad.buttons?.length||0)},(_,index)=>buttonDown(pad,index));}
  function scrollingPad(pad){return Math.abs(pad.axes?.[2]||0)>.25||Math.abs(pad.axes?.[3]||0)>.25;}
  function padState(pad){return {buttons:snapshot(pad),direction:padDirection(pad),scrolling:scrollingPad(pad),triggers:{}};}
  function primeGamepads(){padStates.clear();pads().forEach((pad,index)=>padStates.set(padKey(pad,index),padState(pad)));lastButtons=[];activePadKey='';lastAxisDirection='';axisRepeatStartedAt=0;stickScrolling=false;}
  function onButtonEdge(pad,index,action){if(buttonDown(pad,index)&&!lastButtons[index])action();}
  function transportContext(){const root=playerRoot();return Boolean(root&&!activeModal()&&focused&&root.contains(focused)&&!focused.closest('[data-watchroom-call],.svInlineParty,textarea,input:not([type="range"]),select,details[open]'));}
  function recoverVisibleFocus(){
    if(!stickScrolling||!focused)return false;
    const rect=focused.getBoundingClientRect();if(rect.bottom>140&&rect.top<innerHeight-140&&rect.right>0&&rect.left<innerWidth)return false;
    const all=getFocusable().filter(el=>{const r=el.getBoundingClientRect();return r.top>=140&&r.bottom<=innerHeight-140&&r.left>=0&&r.right<=innerWidth;});
    const x=Math.max(0,Math.min(innerWidth,rect.left+rect.width/2)),target=all.reduce((best,el)=>!best||Math.abs(centerOf(el).x-x)<Math.abs(centerOf(best).x-x)?el:best,null);return target?setFocus(target,{scroll:false}):true;
  }
  function trigger(pad,index,state,action){const now=Date.now();if(!buttonDown(pad,index)){delete state.triggers[index];return;}if(!lastButtons[index]){state.triggers[index]={start:now,last:now};action();}else{const held=state.triggers[index];if(held&&now-held.start>450&&now-held.last>=180){held.last=now;action();}}}
  function processGamepad(pad,elapsed,state){
    const direction=padDirection(pad,Boolean(lastAxisDirection)),now=Date.now();
    if(direction){if(direction!==lastAxisDirection){lastAxisDirection=direction;axisRepeatStartedAt=now;revealPlayer();moveFocus(direction);}else if(now-axisRepeatStartedAt>340&&now-lastMoveAt>=135){revealPlayer();moveFocus(direction,false);}}else{lastAxisDirection='';axisRepeatStartedAt=0;}
    const axis=value=>Math.abs(Number(value||0))>.25?Math.sign(value)*(Math.abs(value)-.25)/.75:0,x=axis(pad.axes?.[2]),y=axis(pad.axes?.[3]);
    if((x||y)&&!activeModal()&&!engagedSelect){stickScrolling=true;scrollByAmount(x*elapsed,y*elapsed);}else if(stickScrolling){recoverVisibleFocus();stickScrolling=false;}
    onButtonEdge(pad,0,clickFocused);onButtonEdge(pad,1,goBack);onButtonEdge(pad,2,()=>{if(transportContext())mediaKey('MediaPlayPause');});onButtonEdge(pad,3,focusSearch);
    onButtonEdge(pad,4,()=>{if(transportContext())mediaKey('MediaTrackPrevious');else pageRow('left');});onButtonEdge(pad,5,()=>{if(transportContext())mediaKey('MediaTrackNext');else pageRow('right');});
    trigger(pad,6,state,()=>{if(transportContext())mediaKey('MediaRewind');else pageFocus('up');});trigger(pad,7,state,()=>{if(transportContext())mediaKey('MediaFastForward');else pageFocus('down');});
    onButtonEdge(pad,8,showHelp);onButtonEdge(pad,9,tryMenu);onButtonEdge(pad,11,()=>{if(!activeModal()){revealPlayer();setFocus(focused);}});
  }
  function loop(time){
    raf=0;if(!enabled||document.hidden||!windowActive)return;const current=pads();if(!current.length){connected=false;padStates.clear();syncGuide();return;}
    const rows=current.map((pad,index)=>{const key=padKey(pad,index);if(!padStates.has(key))padStates.set(key,padState(pad));return {pad,key,state:padStates.get(key)};});
    const input=rows.find(({pad,state})=>snapshot(pad).some((value,index)=>value&&!state.buttons[index]))||rows.find(({pad,state})=>padDirection(pad)&&padDirection(pad)!==state.direction)||rows.find(({pad,state})=>scrollingPad(pad)&&!state.scrolling);
    const selected=input||rows.find(row=>row.key===activePadKey)||rows[0];if(activePadKey!==selected.key){activePadKey=selected.key;lastAxisDirection='';axisRepeatStartedAt=0;}
    lastButtons=selected.state.buttons;const elapsed=lastFrame===null?1000/60:Math.min(32,Math.max(0,time-lastFrame));lastFrame=time;processGamepad(selected.pad,elapsed,selected.state);
    for(const row of rows){row.state.buttons=snapshot(row.pad);row.state.direction=padDirection(row.pad,Boolean(row.state.direction));row.state.scrolling=scrollingPad(row.pad);}for(const key of padStates.keys())if(!rows.some(row=>row.key===key))padStates.delete(key);
    if(enabled&&!document.hidden&&windowActive)raf=requestAnimationFrame(loop);
  }
  function startLoop(){if(enabled&&connected&&!document.hidden&&windowActive&&!raf){lastFrame=null;raf=requestAnimationFrame(loop);}}
  window.addEventListener('gamepadconnected',event=>{const received=event.gamepad,valid=received&&received.connected!==false&&(!received.mapping||received.mapping==='standard');connected=pads().length>0||Boolean(valid);if(!connected)return;primeGamepads();setEnabled(true,'Controller connected · View for all controls');if(valid){padStates.set(padKey(received,0),padState(received));connected=true;startLoop();}});
  window.addEventListener('gamepaddisconnected',()=>{connected=pads().length>0;primeGamepads();if(!connected){cancelAnimationFrame(raf);raf=0;}syncGuide();showHint(connected?'Controller ready':'Controller disconnected · arrow keys still work');});
  function suspendInput(){windowActive=false;cancelAnimationFrame(raf);raf=0;}
  function resumeInput(){scrollDestination=null;windowActive=true;connected=pads().length>0;primeGamepads();syncGuide();startLoop();}
  window.addEventListener('blur',suspendInput);window.addEventListener('focus',resumeInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendInput();else resumeInput();});
  document.addEventListener('keydown',event=>{
    let key=event.key;if(!key||key==='Unidentified')key=codes[event.keyCode]||key;if(key==='Back'||key==='GoBack')key='BrowserBack';
    if(['PageUp','PageDown','Home','End'].includes(key))scrollDestination=null;
    if(event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented)return;
    if(key==='F8'){event.preventDefault();setEnabled(!enabled);return;}if(!enabled)return;
    const modal=activeModal();if(modal&&key==='Escape')return;
    const target=event.target,typing=target.closest?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]');
    if(typing&&key!=='BrowserBack'&&key!=='Escape'&&!(typing.tagName==='INPUT'&&['ArrowUp','ArrowDown'].includes(key)))return;
    if(target.closest?.('select')&&key!=='BrowserBack')return;
    if(key==='Escape'||key==='BrowserBack'||key==='Backspace'){event.preventDefault();goBack();return;}
    if(mediaKey(key)){event.preventDefault();return;}
    if(directions[key]){revealPlayer();moveFocus(directions[key],!event.repeat);event.preventDefault();}
    else if(key==='Enter'||key===' '){if(!event.repeat){revealPlayer();clickFocused();}event.preventDefault();}
    else if(key?.toLowerCase()==='f'){toggleFullscreen();event.preventDefault();}
    else if(key==='/'){focusSearch();event.preventDefault();}
    else if(key==='ContextMenu'||key==='Menu'){tryMenu();event.preventDefault();}
  },true);
  document.addEventListener('focusin',event=>{if(enabled&&event.target.matches?.(FOCUSABLE_SELECTOR))setFocus(event.target,{scroll:false});});
  for(const type of ['wheel','touchstart','pointerdown','resize'])window.addEventListener(type,()=>{scrollDestination=null;},{passive:true});
  document.addEventListener('click',event=>{
    const toggle=event.target.closest?.('[data-sv-tv-toggle]');if(!toggle)return;event.preventDefault();const menu=toggle.closest('details');if(menu)menu.open=false;setEnabled(!enabled);if(!enabled){const summary=menu?.querySelector('summary')||document.querySelector('.dsProfileMenu > summary');summary?.focus({preventScroll:true});}
  });
  const focusObserver=new MutationObserver(()=>{
    if(!enabled)return;
    if(engagedSelect&&!engagedSelect.isConnected)disengageSelect();
    const root=scope(),closed=focused?.closest('details:not([open])');if(!focused?.isConnected||focused.disabled||focused.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],dialog:not([open])')||closed&&!closed.querySelector('summary')?.contains(focused)||root!==document&&!root.contains(focused))firstFocus({scroll:false});else syncGuide();
  });
  function observeFocus(){focusObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','aria-disabled','disabled','open','data-player-controls-visibility']});}
  window.addEventListener('pagehide',()=>{rememberFocus();suspendInput();focusObserver.disconnect();});
  window.addEventListener('pageshow',event=>{if(!event.persisted)return;try{const saved=localStorage.getItem('swiflytv.tvFocusMode');if(saved!==null&&(saved==='true')!==enabled)setEnabled(saved==='true',false);}catch{}resumeInput();if(enabled){firstFocus({scroll:false});observeFocus();}});
  function boot(){connected=pads().length>0;primeGamepads();syncToggles();let optedOut=false;try{optedOut=localStorage.getItem('swiflytv.tvFocusMode')==='false';}catch{}if(enabled)setEnabled(true,false);else if(connected&&!optedOut)setEnabled(true,'Controller connected');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}

module.exports={tvHead:()=>`<script data-sv-tv-gate>(${tvGate.toString()})();</script>`,tvScript:()=>`<script data-sv-tv-navigation>(${swiflyTvFocusNavigation.toString()})();</script>`};
