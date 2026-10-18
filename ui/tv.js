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
  const lastButtons={};
  var FOCUSABLE_SELECTOR='a[href],summary,button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[role="button"],[role="link"],[tabindex]:not([tabindex="-1"]),video';
  const rails='.movieRail,.dsRail,.nfTopTenRail,.svResumeRail,.dsWelcomeRailTrack,.svDetailCastRail';
  const directions={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
  const codes={13:'Enter',19:'MediaPause',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',412:'MediaRewind',413:'MediaStop',415:'MediaPlay',417:'MediaFastForward',461:'BrowserBack',10009:'BrowserBack',10252:'MediaPlayPause',10232:'MediaTrackPrevious',10233:'MediaTrackNext'};
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion');
  function pads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[];}catch{return [];}}
  function activeModal(){return document.activeElement?.closest('dialog[open]')||document.querySelector('.svStudioDialog[open]')||Array.from(document.querySelectorAll('dialog[open]')).pop()||null;}
  function scope(){
    const modal=activeModal();if(modal)return modal;
    if(document.fullscreenElement)return document.fullscreenElement;
    const profile=document.querySelector('.dsProfileMenu[open]');if(profile)return profile;
    const search=document.querySelector('#svNavSearchPopup:not([hidden])');if(search)return search;
    return document;
  }
  function eligible(el,root=scope()){
    if(!el?.isConnected||el.disabled||el.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]'))return false;
    if(el.closest('.dsCardQuickActions')||el.matches('.dsCardTitle')&&el.closest('.movieCard')?.querySelector('.dsThumb'))return false;
    const closed=el.closest('details:not([open])');if(closed&&!closed.querySelector('summary')?.contains(el))return false;
    if(root!==document&&!root.contains(el))return false;
    const dock=el.closest('[data-player-controls]');if(dock&&dock.closest('[data-player-root]')?.dataset.playerControlsVisibility==='hidden')return false;
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>6&&rect.height>6&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.05;
  }
  function getFocusable(){const root=scope();return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el=>eligible(el,root));}
  function centerOf(el){const rect=el.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,rect};}
  function clearFocus(){focused?.classList.remove('swifly-tv-focus-target','swifly-tv-focus-pressed');focused=null;}
  function setFocus(el,options={}){
    if(!eligible(el))return false;
    if(focused!==el){clearFocus();focused=el;el.classList.add('swifly-tv-focus-target');try{el.focus({preventScroll:true});}catch{}}
    if(options.scroll!==false)try{const target=el.matches('.dsThumb,.posterWrap')?el.closest('.movieCard')||el:el;target.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduced()?'auto':'smooth'});}catch{}
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
    hint.innerHTML='<b>'+escape(reason)+'</b><span><kbd>↑ ↓ ← →</kbd> Navigate <kbd>OK</kbd> Select <kbd>Back</kbd> Return <kbd>F8</kbd> Exit TV mode</span>';
    hint.hidden=false;hint.dataset.visible='true';clearTimeout(hintTimer);
    hintTimer=setTimeout(()=>{hint?.removeAttribute('data-visible');if(hint)hint.hidden=true;},5500);
  }
  function syncToggles(){for(const button of document.querySelectorAll('[data-sv-tv-toggle]')){button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Exit TV mode':'Turn on TV mode');const state=button.querySelector('[data-sv-tv-state]');if(state)state.textContent=enabled?'On':'Off';}}
  function setEnabled(value,reason){
    enabled=Boolean(value);try{localStorage.setItem('swiflytv.tvFocusMode',String(enabled));localStorage.removeItem('swiflytv.tvControllerMode');}catch{}
    if(enabled)document.documentElement.dataset.svTv='true';else delete document.documentElement.dataset.svTv;
    document.body.classList.toggle('swifly-tv-focus-mode',enabled);document.body.classList.remove('swifly-tv-controller-mode');document.getElementById('swiflyTvCursor')?.remove();syncToggles();
    if(enabled){firstFocus();if(reason!==false)showHint(reason);startLoop();}else{clearFocus();cancelAnimationFrame(raf);raf=0;clearTimeout(hintTimer);if(hint){hint.hidden=true;hint.removeAttribute('data-visible');}}
  }
  function adjustControl(direction){
    if(!focused||focused.disabled)return false;
    if(focused.matches('input[type="range"]')&&['left','right'].includes(direction)){
      const input=focused,min=Number(input.min)||0,max=input.max===''?100:Number(input.max),step=input.hasAttribute('data-player-seek')?10:input.hasAttribute('data-player-volume') ? .05 : Number(input.step)||1;
      input.value=String(Math.max(min,Math.min(max,Number(input.value)+(direction==='right'?step:-step))));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(focused.matches('select')&&['up','down'].includes(direction)){const next=focused.selectedIndex+(direction==='down'?1:-1);if(next>=0&&next<focused.options.length&&!focused.options[next].disabled){focused.selectedIndex=next;focused.dispatchEvent(new Event('change',{bubbles:true}));}return true;}
    return false;
  }
  function moveFocus(direction,force=true){
    if(!enabled)return;if(!focused||!eligible(focused))firstFocus();if(!focused)return;
    const now=Date.now();if(!force&&now-lastMoveAt<135)return;lastMoveAt=now;
    if(adjustControl(direction))return;
    const rail=focused.closest(rails);
    if(rail&&['left','right'].includes(direction)&&focused.matches('.dsThumb,.posterWrap,[data-resume-action]')){
      const cards=Array.from(rail.querySelectorAll('.dsThumb,.posterWrap,[data-resume-action]')).filter(el=>eligible(el)),index=cards.indexOf(focused),next=cards[index+(direction==='right'?1:-1)];if(next)setFocus(next);return;
    }
    const current=centerOf(focused),horizontal=['left','right'].includes(direction);let best=null,bestScore=Infinity;
    for(const element of getFocusable()){
      if(element===focused)continue;const target=centerOf(element),dx=target.x-current.x,dy=target.y-current.y;
      if(direction==='left'&&dx>=-8||direction==='right'&&dx<=8||direction==='up'&&dy>=-8||direction==='down'&&dy<=8)continue;
      const primary=horizontal?Math.abs(dx):Math.abs(dy),secondary=horizontal?Math.abs(dy):Math.abs(dx);
      const overlap=horizontal?Math.min(current.rect.bottom,target.rect.bottom)-Math.max(current.rect.top,target.rect.top):Math.min(current.rect.right,target.rect.right)-Math.max(current.rect.left,target.rect.left);
      const score=primary+secondary*2.2+(overlap<=0?1200:0);if(score<bestScore){best=element;bestScore=score;}
    }
    if(best)setFocus(best);
    else if(!horizontal)scrollByAmount(0,(direction==='down'?1:-1)*Math.round(innerHeight*.65));
  }
  function scrollByAmount(dx,dy){
    let parent=focused?.parentElement;
    while(parent&&parent!==document.body){const style=getComputedStyle(parent),vertical=dy&&/(auto|scroll)/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight+4,horizontal=dx&&/(auto|scroll)/.test(style.overflowX)&&parent.scrollWidth>parent.clientWidth+4;if(vertical||horizontal){parent.scrollBy({left:dx,top:dy,behavior:'auto'});return;}parent=parent.parentElement;}
    window.scrollBy({left:dx,top:dy,behavior:'auto'});
  }
  function playerRoot(){return document.activeElement?.closest('[data-player-root]')||document.querySelector('.svPlayerPage[data-player-mode="movie"]')||document.querySelector('.svPlayerEmbedded');}
  function revealPlayer(){const root=playerRoot();if(root&&!activeModal())root.dispatchEvent(new CustomEvent('swiflyplayer:tv-controls',{detail:{action:'show'}}));}
  function activate(button){if(button&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'){button.click();return true;}return false;}
  function clickFocused(){
    if(!focused||!eligible(focused))firstFocus();if(!focused)return;
    const element=focused;element.classList.add('swifly-tv-focus-pressed');setTimeout(()=>element.classList.remove('swifly-tv-focus-pressed'),140);
    const root=element.closest('[data-player-root]');if(root&&element.matches('video,[data-player-stage]')){activate(root.querySelector('[data-player-play]'));return;}
    if(element.tagName==='VIDEO'){if(element.paused)element.play()?.catch(()=>{});else element.pause();return;}
    activate(element);
  }
  function goBack(){
    const modal=activeModal();if(modal){if(modal.matches('.svDetailDialog')&&window.SwiflyDetails)window.SwiflyDetails.back();else modal.close();return;}
    const popup=document.querySelector('#svNavSearchPopup:not([hidden])');if(popup){popup.hidden=true;const toggle=document.getElementById('svNavSearchToggle');toggle?.setAttribute('aria-expanded','false');if(toggle)setFocus(toggle);return;}
    const menu=document.querySelector('.dsProfileMenu[open]');if(menu){menu.open=false;setFocus(menu.querySelector('summary'));return;}
    const root=playerRoot(),popover=root?.querySelector('details[open]');if(popover){popover.open=false;try{popover.querySelector('[popover]')?.hidePopover();}catch{}setFocus(popover.querySelector('summary'));return;}
    const video=root?.querySelector('[data-player-video]');if(root&&video&&!video.paused&&root.dataset.playerState==='ready'&&root.dataset.playerControlsVisibility!=='hidden'&&root.querySelector('[data-player-controls]')?.contains(document.activeElement)){root.dispatchEvent(new CustomEvent('swiflyplayer:tv-controls',{detail:{action:'hide'}}));return;}
    if(document.fullscreenElement){document.exitFullscreen()?.catch(()=>{});return;}
    const back=document.querySelector('[data-sv-player-back],.svDetailPage [data-sv-details-back]');if(back){back.click();return;}
    if(history.length>1)history.back();else location.href='/';
  }
  function focusSearch(){
    const search=document.querySelector('input[type="search"],input[name="q"]');if(search&&eligible(search)){setFocus(search);return;}
    const toggle=document.getElementById('svNavSearchToggle');if(toggle)activate(toggle);else showHint('Search is available from the navigation');
  }
  function tryMenu(){const button=document.getElementById('controlToggleTop');if(button)activate(button);}
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
  function directionFromAxes(x,y){if(Math.abs(x)<.34&&Math.abs(y)<.34)return '';return Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';}
  function onButtonEdge(pad,index,name,action){const pressed=Boolean(pad.buttons?.[index]?.pressed);if(pressed&&!lastButtons[name])action();lastButtons[name]=pressed;}
  function processGamepad(pad,elapsed){
    let direction='';for(const [index,value]of [[12,'up'],[13,'down'],[14,'left'],[15,'right']])if(pad.buttons?.[index]?.pressed){direction=value;break;}
    direction=direction||directionFromAxes(Number(pad.axes?.[0]||0),Number(pad.axes?.[1]||0));const now=Date.now();
    if(direction){revealPlayer();if(direction!==lastAxisDirection){lastAxisDirection=direction;axisRepeatStartedAt=now;moveFocus(direction);}else if(now-axisRepeatStartedAt>340)moveFocus(direction,false);}else{lastAxisDirection='';axisRepeatStartedAt=0;}
    const x=Math.abs(Number(pad.axes?.[2]||0))>.25?Number(pad.axes[2]):0,y=Math.abs(Number(pad.axes?.[3]||0))>.25?Number(pad.axes[3]):0;
    if(x||y)scrollByAmount(x*elapsed,y*elapsed);
    onButtonEdge(pad,0,'select',clickFocused);onButtonEdge(pad,1,'back',goBack);onButtonEdge(pad,2,'search',focusSearch);onButtonEdge(pad,3,'studio',tryMenu);
    onButtonEdge(pad,4,'previous',()=>scrollByAmount(0,-innerHeight*.7));onButtonEdge(pad,5,'next',()=>scrollByAmount(0,innerHeight*.7));
    onButtonEdge(pad,8,'help',()=>showHint('A Select · B Back · X Search · Y Studio · Start Fullscreen'));onButtonEdge(pad,9,'fullscreen',toggleFullscreen);
  }
  function loop(time){raf=0;if(!enabled||document.hidden)return;const current=pads();if(!current.length){connected=false;return;}const elapsed=lastFrame===null?1000/60:Math.min(32,Math.max(0,time-lastFrame));lastFrame=time;processGamepad(current[0],elapsed);if(enabled&&!document.hidden)raf=requestAnimationFrame(loop);}
  function startLoop(){if(enabled&&connected&&!document.hidden&&!raf){lastFrame=null;raf=requestAnimationFrame(loop);}}
  window.addEventListener('gamepadconnected',()=>{connected=true;setEnabled(true,'Controller connected');});
  window.addEventListener('gamepaddisconnected',()=>{connected=pads().length>0;if(!connected){cancelAnimationFrame(raf);raf=0;for(const key of Object.keys(lastButtons))delete lastButtons[key];}showHint('Controller disconnected · arrow keys still work');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{connected=pads().length>0;startLoop();}});
  document.addEventListener('keydown',event=>{
    let key=event.key;if(!key||key==='Unidentified')key=codes[event.keyCode]||key;if(key==='Back'||key==='GoBack')key='BrowserBack';
    if(event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented)return;
    if(key==='F8'){event.preventDefault();setEnabled(!enabled);return;}if(!enabled)return;
    const modal=activeModal();if(modal&&key==='Escape')return;
    const target=event.target,typing=target.closest?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]');
    if(typing&&key!=='BrowserBack'&&key!=='Escape'&&!(typing.tagName==='INPUT'&&['ArrowUp','ArrowDown'].includes(key)))return;
    if(target.closest?.('select')&&key!=='BrowserBack')return;
    if(key==='Escape'||key==='BrowserBack'||key==='Backspace'){event.preventDefault();goBack();return;}
    if(mediaKey(key)){event.preventDefault();return;}
    if(directions[key]){revealPlayer();moveFocus(directions[key],!event.repeat);event.preventDefault();}
    else if(key==='Enter'||key===' '){revealPlayer();clickFocused();event.preventDefault();}
    else if(key?.toLowerCase()==='f'){toggleFullscreen();event.preventDefault();}
    else if(key==='/'){focusSearch();event.preventDefault();}
    else if(key==='ContextMenu'||key==='Menu'){tryMenu();event.preventDefault();}
  },true);
  document.addEventListener('focusin',event=>{if(enabled&&event.target.matches?.(FOCUSABLE_SELECTOR))setFocus(event.target,{scroll:false});});
  document.addEventListener('click',event=>{
    const toggle=event.target.closest?.('[data-sv-tv-toggle]');if(!toggle)return;event.preventDefault();const menu=toggle.closest('details');if(menu)menu.open=false;setEnabled(!enabled);if(!enabled){const summary=menu?.querySelector('summary')||document.querySelector('.dsProfileMenu > summary');summary?.focus({preventScroll:true});}
  });
  window.addEventListener('pagehide',()=>{rememberFocus();cancelAnimationFrame(raf);raf=0;});
  window.addEventListener('pageshow',event=>{if(!event.persisted)return;try{const saved=localStorage.getItem('swiflytv.tvFocusMode');if(saved!==null&&(saved==='true')!==enabled)setEnabled(saved==='true',false);}catch{}connected=pads().length>0;if(enabled)firstFocus({scroll:false});startLoop();});
  function boot(){connected=pads().length>0;syncToggles();if(enabled)setEnabled(true,false);else if(connected)setEnabled(true,'Controller connected');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}

module.exports={tvHead:()=>`<script data-sv-tv-gate>(${tvGate.toString()})();</script>`,tvScript:()=>`<script data-sv-tv-navigation>(${swiflyTvFocusNavigation.toString()})();</script>`};
