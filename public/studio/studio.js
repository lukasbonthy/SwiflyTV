/* Native Studio: one reversible draft for settings, looks and this device. */
(() => {
 'use strict';
 if(window.SwiflyStudio)return;
 const C=window.SwiflyStudioConfig;if(!C)return;
 const clone=C.clone,defaults=C.defaults;
 const storage=(()=>{try{return window.localStorage;}catch{return {getItem(){return null;},setItem(){throw Error('Browser storage is unavailable');},removeItem(){}};}})();
 const presets=Object.fromEntries(Object.entries(C.curatedThemes).map(([id,theme])=>[id,theme.values]));
 const sections={theme:['themeId','theme','font','customColors','accentColor','accentSecondary','canvasColor','gradientAngle','gradientStrength'],glass:['glass','glassOpacity','glassBlur','glassEdge','glassGlow'],home:['homeOrder','homeHidden','heroMode','heroPosition','posterWidth','homeColumns','rowShape','layout','cardstyle','density'],posters:['posterHover','posterActions'],navigation:['navOrder','navLayout','navLabels','navIcons','navDensity','navActive'],player:['playerStyle','playerProgress','playerTime','playerIconScale','playerOpacity','playerPosition','playerAutoHide','playerBackdrop'],captions:['captionSize','captionColor','captionBg','captionEdge'],atmosphere:['backdrop','auroraColor','auroraStrength','auroraMotion','adaptiveCinema','adaptiveStrength'],hud:['hudPosition','hudWidth','hudDensity','hudTransparency','hudIcons','hudMotion','notificationPreview','toastPosition'],ai:['aiSpacing','aiWidth','aiCards','aiGlass','aiOptions'],motion:['smooth','reduceMotion','pageMotion','loaderStyle','transitionSpeed','loaderDim'],devices:C.deviceFields,access:['uiScale','highContrast','reduceTransparency','largeTargets','focusStyle']};
 const homeNames={'continue':'Continue watching','upcoming':'Upcoming episodes','recommended':'Recommended for you','trending-movies':'Trending movies','trending-tv':'Trending TV','popular-movies':'Popular movies','popular-tv':'Popular TV','top-movies':'Top-rated movies','top-tv':'Top-rated TV','new-releases':'New releases'};
 const navNames={home:'Home',movies:'Movies',tv:'TV shows',discover:'Discover',list:'My list',study:'Study'};
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),transparent=window.matchMedia('(prefers-reduced-transparency: reduce)');
 let dialog,trigger,saved,draft,looks=[],effective,previewAnimation,started=false,editing=false,stale=false,pendingImport=null,verifiedUser=window.SwiflyAccount?null:undefined,accountPending=!!window.SwiflyAccount,accountSuspended=false,importEpoch=0,listSignature='',lookSignature='',dragged=null;
 let baseAppearance=null,baseDevice=null;
 const invalid=new Map(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const q=s=>dialog.querySelector(s),qa=s=>[...dialog.querySelectorAll(s)];
 const stored=key=>{try{return storage.getItem(key);}catch{return null;}};
 function setEditorMode(advanced,persist=true,reason=''){
  const focused=document.activeElement,mode=advanced?'advanced':'simple';dialog.dataset.stEditorMode=mode;q('[data-st-advanced-toggle]').checked=advanced;
  qa('[data-st-advanced],[data-st-advanced-tab]').forEach(node=>{node.hidden=!advanced;});
  const active=q('[data-st-tab][aria-selected="true"]');if(active?.hidden)setTab('looks',true);
  if(dialog.open&&focused?.closest('[hidden]'))q('[data-st-advanced-toggle]').focus({preventScroll:true});
  let note=reason||(advanced?'Advanced view · Every control is available. Changes still need Save.':'Simple view · Pick a theme, adjust what matters, then Save.');
  if(persist)try{storage.setItem('swiflytv.studio.editorMode',mode);}catch{note+=' View preference lasts for this visit; browser storage is unavailable.';}
  q('[data-st-mode-note]').textContent=note;
  if(invalid.size)status(advanced?'Enter a valid HEX color before saving.':'A custom color needs attention in Advanced controls before saving.',true);
 }
 const currentUser=()=>window.SwiflyAccount?verifiedUser:undefined;
 function read(){return C.read(storage,currentUser());}
 function capture(){baseAppearance=stored(saved.key);baseDevice=stored('swiflytv.studio.device');}
 function changed(){return !same(saved.values,draft)||!same(saved.looks,looks);}
 function stopPreviewMotion(){previewAnimation?.cancel();previewAnimation=null;}
 function apply(value){
  effective=C.apply(value,C.context());
  if(effective.reduceMotion)stopPreviewMotion();
  window.SwiflyAppearance=clone(effective);
  document.dispatchEvent(new CustomEvent('swifly:studio-change',{detail:{values:clone(value),effective:clone(effective)}}));
 }
 function previewChange(){
  stopPreviewMotion();if(!dialog.open||reduced.matches||document.body.classList.contains('reduceMotion'))return;
  const preview=q('[data-st-preview]');if(typeof preview.animate!=='function')return;
  const animation=preview.animate([{opacity:.8},{opacity:1}],{duration:180,easing:'cubic-bezier(.2,.7,.25,1)'});previewAnimation=animation;
  animation.onfinish=()=>{if(previewAnimation===animation)previewAnimation=null;};
 }
 function status(message,error=false){const node=q('[data-st-status]');node.textContent=message;node.classList.toggle('stStatusError',error);}
 function updateDraft(next){const validated=C.validate(next),didChange=!same(draft,validated);draft=validated;if(didChange)apply(draft);sync();if(didChange)previewChange();}
 function showImport(value){pendingImport=value;q('[data-st-import-preview]').disabled=!value;q('[data-st-import-confirm]').hidden=!value;if(!value)q('[data-st-import-summary]').textContent='';}
 function load(){for(const selector of ['[data-st-look-name]','[data-st-look-description]','[data-st-import-text]','[data-st-import-file]'])q(selector).value='';saved=read();draft=clone(saved.values);looks=clone(saved.looks);stale=false;invalid.clear();showImport(null);capture();listSignature='';lookSignature='';apply(draft);sync();if(saved.warning)status(saved.warning,true);}
 function availableHome(){return [...document.querySelectorAll('[data-st-home-section]')].filter(n=>!n.hidden).map(n=>n.dataset.stHomeSection).filter(k=>defaults.homeOrder.includes(k));}
 function button(text,attrs={}){const n=document.createElement('button');n.type='button';n.className='stSmallAction';n.textContent=text;for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;}
 function renderOrders(){
  const available=availableHome(),onHome=!!document.querySelector('[data-st-home-rows]');
  const sig=JSON.stringify([draft.homeOrder,draft.homeHidden,draft.navOrder,available,onHome]);if(sig===listSignature)return;listSignature=sig;
  const active=document.activeElement,activeOrder=active?.dataset.stOrder,activeItem=active?.dataset.stItem,activeDirection=active?.dataset.stDirection;
  for(const type of ['home','nav']){
   const list=q('[data-st-order-list="'+type+'"]'),order=draft[type+'Order'];list.replaceChildren();
   order.forEach((key,index)=>{
    const row=document.createElement('li');row.dataset.stOrderRow=type;row.dataset.stItem=key;row.draggable=true;
    const label=document.createElement('div'),title=document.createElement('b');title.textContent=(type==='home'?homeNames:navNames)[key];label.append(title);
    if(type==='home'&&onHome&&!available.includes(key)){const hint=document.createElement('small');hint.textContent='Not currently available';label.append(hint);}
    row.append(label);
    if(type==='home'){
     const visibility=document.createElement('label'),checkbox=document.createElement('input'),text=document.createElement('span');visibility.className='stRowVisibility';checkbox.type='checkbox';checkbox.dataset.stHomeVisible=key;checkbox.checked=!draft.homeHidden.includes(key);checkbox.setAttribute('aria-label','Show '+homeNames[key]);text.textContent='Show';visibility.append(checkbox,text);row.append(visibility);
    }
    const controls=document.createElement('div');controls.className='stReorderActions';
    for(const [direction,text]of [[-1,'Up'],[1,'Down']]){const action=button(text,{'data-st-order':type,'data-st-item':key,'data-st-direction':String(direction),'aria-label':'Move '+title.textContent+' '+text.toLowerCase()});action.disabled=index+direction<0||index+direction>=order.length;controls.append(action);}
    row.append(controls);list.append(row);
   });
  }
  if(activeOrder&&dialog.open){const selector='[data-st-order="'+activeOrder+'"][data-st-item="'+activeItem+'"][data-st-direction="'+activeDirection+'"]';const target=q(selector);if(target&&!target.disabled)target.focus({preventScroll:true});else q('[data-st-order-row="'+activeOrder+'"][data-st-item="'+activeItem+'"] button:not(:disabled)')?.focus({preventScroll:true});}
  q('[data-st-home-help]').textContent=onHome?'Rows with no titles return when content becomes available. At least one available row stays visible.':'This page has no homepage rows. Your order will apply when you return Home; empty rows appear when content is available.';
 }
 function renderLooks(){
  const signature=JSON.stringify(looks);if(signature===lookSignature)return;lookSignature=signature;
  const region=q('[data-st-looks]');region.replaceChildren();
  if(!looks.length){const empty=document.createElement('p');empty.className='stHelp';empty.textContent='No saved looks yet. Give your current draft a name.';region.append(empty);}
  for(const look of looks){
   const card=document.createElement('article');card.className='stSavedLook';card.dataset.stLookCard=look.id;
   const swatch=document.createElement('div');swatch.className='stLookThumbnail';swatch.setAttribute('aria-hidden','true');const v=C.validate(look.values);swatch.style.setProperty('--look-accent',v.customColors?v.accentColor:(C.accents?.[v.theme]||'#c8c3ef'));swatch.style.setProperty('--look-canvas',v.customColors?v.canvasColor:'#111219');for(let i=0;i<3;i++)swatch.append(document.createElement('i'));
   const title=document.createElement('h4');title.textContent=look.name;const description=document.createElement('p');description.textContent=look.description||'A personal Studio look';
   const rename=document.createElement('input');rename.type='text';rename.maxLength=64;rename.value=look.name;rename.dataset.stLookRenameValue=look.id;rename.setAttribute('aria-label','Rename '+look.name);
   const actions=document.createElement('div');actions.className='stActionRow';
   for(const [action,text]of [['apply','Preview'],['duplicate','Duplicate'],['rename','Rename'],['delete','Delete']])actions.append(button(text,{['data-st-look-'+action]:look.id,'aria-label':text+' '+look.name}));
   card.append(swatch,title,description,rename,actions);region.append(card);
  }
  q('[data-st-look-add]').disabled=looks.length>=12;q('[data-st-look-add]').textContent='Save draft as a named look ('+looks.length+'/12)';
 }
 function captionPreview(){
  for(const node of qa('[data-st-caption-preview],[data-st-caption-mini]')){
   node.style.fontSize=(effective.captionSize/100)+'em';node.style.color=effective.captionColor;node.style.backgroundColor='rgba(0,0,0,'+(effective.captionBg/100)+')';node.style.textShadow=effective.captionEdge==='shadow'?'0 2px 3px #000':effective.captionEdge==='outline'?'-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000':'none';
  }
 }
 function contextualPreview(){
  const active=q('[data-st-tab][aria-selected="true"]')?.dataset.stTab||'looks';
  q('[data-st-context-label]').textContent=({player:'PLAYER STYLE PREVIEW',hud:'NOTIFICATION STYLE PREVIEW',motion:'LOADING STYLE PREVIEW',navigation:'NAVIGATION PREVIEW',devices:'DEVICE PREVIEW',access:'ACCESSIBLE PREVIEW'})[active]||'LIVE PREVIEW';
  const context=q('[data-st-context-preview]'),player=q('[data-st-context-player]'),hud=q('[data-st-context-hud]'),loader=q('[data-st-context-loader]'),nav=q('[data-st-context-nav]');
  context.hidden=!['player','hud','motion','navigation'].includes(active);player.hidden=active!=='player';hud.hidden=active!=='hud';loader.hidden=active!=='motion';nav.hidden=active!=='navigation';
  nav.textContent=effective.navOrder.map(k=>navNames[k]).join(' · ');nav.dataset.layout=effective.navLayout;
  player.dataset.style=effective.playerStyle;player.style.opacity=String(effective.playerOpacity/100);player.querySelector('.stMiniProgress').style.height=effective.playerProgress+'px';player.querySelector('span').textContent='▶'+(effective.playerTime?'   12:34 / 1:42:00':'')+'    ◉';
  hud.style.opacity=String(effective.hudTransparency/100);hud.dataset.density=effective.hudDensity;hud.style.maxWidth=effective.hudWidth+'px';hud.querySelector('p').hidden=effective.notificationPreview==='compact';loader.dataset.style=effective.loaderStyle;
  captionPreview();
 }
 function portableJSON(){return JSON.stringify(C.exportTheme(draft,q('[data-st-look-name]').value||'My Swifly look',q('[data-st-look-description]').value),null,2);}
 function sync(){
  qa('[data-st-field]').forEach(n=>n.setAttribute('aria-pressed',String(draft[n.dataset.stField]===n.dataset.stValue)));
  qa('[data-st-setting]').forEach(n=>{n.checked=draft[n.dataset.stSetting];});
  q('[data-st-comfort-motion]').checked=draft.reduceMotion;
  qa('[data-st-input]').forEach(n=>{const key=n.dataset.stInput;if(invalid.has(key))return;if(n.type==='checkbox')n.checked=draft[key];else n.value=String(draft[key]);});
  qa('[data-st-output]').forEach(n=>{const key=n.dataset.stOutput,control=q('[data-st-input="'+key+'"]');n.textContent=draft[key]+(control?.dataset.stUnit||'');});
  qa('[data-st-color-swatch]').forEach(n=>n.style.backgroundColor=draft[n.dataset.stColorSwatch]);
  const strength=q('[data-st-aurora-strength]');strength.value=String(draft.auroraStrength);q('[data-st-aurora-strength-value]').textContent=draft.auroraStrength+'%';q('[data-st-aurora-settings]').hidden=draft.backdrop!=='aurora';
  let look='Custom look';for(const [name,preset]of Object.entries(presets)){const selected=Object.keys(preset).every(k=>draft[k]===preset[k]);q('[data-st-preset="'+name+'"]').setAttribute('aria-pressed',String(selected));if(selected)look=C.curatedThemes[name].name;}
  const isChanged=changed(),blocked=stale||invalid.size>0||accountPending||accountSuspended;q('[data-st-save]').disabled=!isChanged||blocked;q('[data-st-reload]').hidden=!stale;
  if(stale)status('Saved settings changed in another tab. Reload saved settings before saving.',true);
  else if(accountPending)status('Checking your account before saving…');
  else if(accountSuspended)status('Account verification paused. Reopen Studio after your account is available.',true);
  else if(invalid.size)status(dialog.dataset.stEditorMode==='simple'?'A custom color needs attention in Advanced controls before saving.':'Enter a valid HEX color before saving.',true);
  else status(isChanged?'Previewing changes · save to keep them':'No unsaved changes');
  q('[data-st-look-label]').textContent=look;q('[data-st-preview-description]').textContent=({default:'Classic rows',cinema:'Cinema rows',posterwall:'Poster wall'})[draft.layout]+' · '+({off:'Solid surfaces',subtle:'Soft glass',liquid:'Liquid glass'})[effective.glass]+' · '+({aurora:'Aurora',smooth:'Clean atmosphere',grain:'Film grain'})[effective.backdrop];
  const contrast=C.contrast(draft.customColors?draft.accentColor:(C.accents?.[draft.theme]||'#ece9e2'),draft.customColors?draft.canvasColor:'#090b0f');const warning=q('[data-st-contrast-warning]');warning.hidden=contrast>=4.5;warning.textContent='Accent / canvas contrast is '+contrast.toFixed(2)+':1. Use 4.5:1 or higher for readable small text. High contrast can improve this.';
  q('[data-st-color-error]').textContent=invalid.size?'Use a HEX color such as #aabbcc or #abc.':'';
  const preset={desktop:'Desktop Cinematic · Full theme effects within your accessibility preferences.',mobile:'Mobile Balanced · Less blur and softer glass.',xbox:'Xbox / TV Lightweight · Opaque surfaces, still Aurora and reduced decorative motion.',minimal:'Minimal / Low Power · Solid surfaces, no decorative motion and a clean canvas.'}[effective.performancePreset];q('[data-st-device-summary]').textContent=(draft.performancePreset==='auto'?'Auto selected: ':'')+preset;
  q('[data-st-access-summary]').textContent='Effective on this screen: '+(effective.reduceMotion?'reduced motion':'standard motion')+' · '+(effective.reduceTransparency?'opaque surfaces':'theme transparency')+'. Raw choices are kept when the device preference changes.';
  const owner=saved.owner.startsWith('account:')?'Signed-in profile':'Guest profile';q('[data-st-owner-label]').textContent=owner+' · This browser';
  q('[data-st-export-output]').value=portableJSON();renderOrders();renderLooks();contextualPreview();
 }
 function previewArtwork(){
  const titleSource=document.querySelector('.dsHeroContent h1,.svDetailTitleText,.svWelcomeSpotlight strong');q('[data-st-preview-title]').textContent=titleSource?.textContent.trim()||'Movie night, your way.';
  const source=document.querySelector('.dsHeroBg,.dsWelcomeHeroBg,.svDetailBackdrop');const background=source?getComputedStyle(source).backgroundImage:'';q('[data-st-preview-scene]').style.backgroundImage=background&&background!=='none'?background:'';
  const sceneImage=source?.querySelector('img');if((!background||background==='none')&&sceneImage?.getAttribute('src'))q('[data-st-preview-scene]').style.backgroundImage='url('+JSON.stringify(sceneImage.src)+')';
  const images=[...document.querySelectorAll('.movieCard .posterWrap > img,.movieCard .dsThumb > img,.svResumeLink > img,.svWelcomePosterArt > img,.dsWelcomeCard img')].filter(n=>n.getAttribute('src'));
  qa('.stPreviewPoster img').forEach((n,i)=>{n.hidden=!images[i];n.onerror=()=>{n.hidden=true;};if(images[i])n.src=images[i].src;else n.removeAttribute('src');});
 }
 function setTab(name,focus=false){
  const tabs=qa('[data-st-tab]');if(!tabs.some(n=>n.dataset.stTab===name))return;
  if(tabs.find(n=>n.dataset.stTab===name)?.hidden)setEditorMode(true,true,'Advanced controls opened for this section. Your draft is unchanged.');
  for(const n of tabs){const active=n.dataset.stTab===name;n.setAttribute('aria-selected',String(active));n.tabIndex=active?0:-1;q('#'+n.getAttribute('aria-controls')).hidden=!active;if(active&&focus){n.focus({preventScroll:true});n.scrollIntoView?.({block:'nearest',inline:'nearest'});}}
  q('.stContent').scrollTop=0;q('.stWorkspaceBody').scrollTop=0;contextualPreview();
 }
 function cleanup(){
  if(dialog.open||!editing)return;editing=false;stopPreviewMotion();importEpoch++;showImport(null);invalid.clear();apply(saved.values);draft=clone(saved.values);looks=clone(saved.looks);stale=false;
  document.documentElement.classList.remove('svStudioOpen');document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(n=>n.setAttribute('aria-expanded','false'));if(trigger?.isConnected)trigger.focus({preventScroll:true});trigger=null;
 }
 function close(){if(!dialog?.open)return;stopPreviewMotion();if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');cleanup();}
 function open(from){
  if(!dialog||dialog.open)return;load();editing=true;trigger=from||document.activeElement;previewArtwork();window.SwiflyMotion?.stop();document.documentElement.classList.add('svStudioOpen');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(n=>n.setAttribute('aria-expanded','true'));q('[data-st-tab][aria-selected="true"]').focus({preventScroll:true});
 }
 function save(){
  if(accountPending||accountSuspended||invalid.size||stale){sync();return;}
  if(C.ownerKey(storage,currentUser())!==saved.owner){ownerChange();return;}
  if(stored(saved.key)!==baseAppearance||stored('swiflytv.studio.device')!==baseDevice){stale=true;sync();return;}
  try{C.write(storage,{...saved,values:draft,looks});}catch{status('Could not save in this browser. Your changes are still previewing. Free storage or allow browser storage, then try Save again.',true);return;}
  saved={...saved,values:clone(draft),looks:clone(looks)};capture();close();window.showToast?.('Studio settings saved');
 }
 function ownerChange(force=false){
  if(!dialog)return;const next=read();if(!force&&saved&&next.owner===saved.owner)return;
  if(dialog.open)close();load();
 }
 function edit(input){
  const key=input.dataset.stInput||input.dataset.stSetting;if(!Object.prototype.hasOwnProperty.call(defaults,key))return;
  let value=input.type==='checkbox'?input.checked:input.value;
  if(C.colors.includes(key)){
   if(!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)){invalid.set(key,value);input.setAttribute('aria-invalid','true');sync();return;}
   invalid.delete(key);input.removeAttribute('aria-invalid');
  }else if(typeof defaults[key]==='number')value=Number(value);
  updateDraft({...draft,[key]:value,...(C.appearanceFields.includes(key)?{themeId:'custom'}:{})});
 }
 function move(type,key,direction){const field=type+'Order',order=[...draft[field]],index=order.indexOf(key),to=index+direction;if(index<0||to<0||to>=order.length)return;[order[index],order[to]]=[order[to],order[index]];updateDraft({...draft,[field]:order});status((type==='home'?homeNames:navNames)[key]+' moved '+(direction<0?'up':'down')+'. Save to keep the order.');}
 function newLookId(){return 'look_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);}
 function lookAction(action,id){
  const look=looks.find(v=>v.id===id);if(!look)return;
  if(action==='apply'){const local=Object.fromEntries(C.deviceFields.map(k=>[k,draft[k]]));updateDraft({...look.values,...local});return;}
  if(action==='duplicate'){if(looks.length>=12){status('You can keep up to 12 named looks. Delete one before duplicating.',true);return;}looks.push({...clone(look),id:newLookId(),name:(look.name+' copy').slice(0,64)});}
  else if(action==='rename'){const name=q('[data-st-look-rename-value="'+id+'"]').value.trim().slice(0,64);if(!name){status('Give this look a name before renaming.',true);return;}look.name=name;}
  else if(action==='delete')looks=looks.filter(v=>v.id!==id);
  sync();if(dialog.open){const card=q('[data-st-look-card="'+id+'"]');(action==='rename'?card?.querySelector('input'):card?.querySelector('button')||q('[data-st-look-add]')).focus({preventScroll:true});}
 }
 function reviewImport(text){showImport(null);try{const imported=C.parseImport(text);showImport(imported);const changes=Object.keys(C.portable(imported.values)).filter(k=>!same(draft[k],imported.values[k]));q('[data-st-import-summary]').textContent=imported.name+(imported.description?' — '+imported.description:'')+'. '+changes.length+' appearance settings differ. Device preferences stay on this screen.';status('Import reviewed. Preview it before saving.');}catch(error){status(error.message,true);}}
 async function readFile(file){
  const token=++importEpoch;showImport(null);if(!file)return;if(file.size>32768){status('Theme files must be smaller than 32 KB.',true);return;}
  try{const text=typeof file.text==='function'?await file.text():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this file.'));reader.readAsText(file);});if(token!==importEpoch||!dialog.open)return;q('[data-st-import-text]').value=text;reviewImport(text);}catch(error){if(token===importEpoch)status('Could not read this theme file. '+error.message,true);}
 }
 async function copyExport(){try{if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable');await navigator.clipboard.writeText(portableJSON());if(dialog.open)status('Theme JSON copied.');}catch{if(dialog.open)status('Could not copy automatically. Turn on Advanced controls, open View portable JSON and copy the text.',true);}}
 function downloadExport(){
  let url;try{if(typeof URL.createObjectURL!=='function')throw Error('Downloads unavailable');const text=portableJSON();url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=(q('[data-st-look-name]').value.trim()||'swifly-theme').replace(/[^a-z0-9_-]+/gi,'-').slice(0,64)+'.json';document.body.append(link);link.click();link.remove();status('Theme JSON download requested.');}catch{status('Could not start a download. Open View portable JSON and copy the text.',true);}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 function boot(){
  if(started)return;started=true;dialog=document.getElementById('controlPanel');if(!dialog)return;load();setEditorMode(stored('swiflytv.studio.editorMode')==='advanced',false);
  document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(n=>n.addEventListener('click',e=>dialog.open?close():open(e.currentTarget)));
  dialog.addEventListener('close',cleanup);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',event=>{
   const b=event.target.closest('button');if(b?.disabled)return;
   if(b?.hasAttribute('data-st-cancel')){close();return;}if(b?.hasAttribute('data-st-save')){save();return;}
   if(b?.hasAttribute('data-st-reload')){load();return;}
   if(b?.hasAttribute('data-st-reset')){invalid.clear();qa('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));updateDraft(clone(defaults));return;}
   if(b?.dataset.stResetSection){const next=clone(draft);for(const k of sections[b.dataset.stResetSection]||[]){next[k]=clone(defaults[k]);invalid.delete(k);q('[data-st-input="'+k+'"]')?.removeAttribute('aria-invalid');}updateDraft(next);return;}
   if(b?.dataset.stTab){setTab(b.dataset.stTab);return;}if(b?.dataset.stGo){setTab(b.dataset.stGo,true);return;}
   if(presets[b?.dataset.stPreset]){invalid.clear();qa('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));updateDraft(C.applyTheme(draft,b.dataset.stPreset));return;}
   const field=b?.dataset.stField,value=b?.dataset.stValue;if(C.enums[field]?.includes(value)){updateDraft({...draft,[field]:value,...(C.appearanceFields.includes(field)?{themeId:'custom'}:{}),...(field==='theme'?{customColors:false}:{})});return;}
   if(b?.dataset.stOrder){move(b.dataset.stOrder,b.dataset.stItem,Number(b.dataset.stDirection));return;}
   if(b?.hasAttribute('data-st-look-add')){if(looks.length>=12){status('You can keep up to 12 named looks.',true);return;}const name=q('[data-st-look-name]').value.trim().slice(0,64);if(!name){status('Give your look a name first.',true);q('[data-st-look-name]').focus();return;}looks.push({id:newLookId(),name,description:q('[data-st-look-description]').value.trim().slice(0,160),values:C.portable(draft)});sync();return;}
   for(const action of ['apply','duplicate','rename','delete'])if(b?.hasAttribute('data-st-look-'+action)){lookAction(action,b.getAttribute('data-st-look-'+action));return;}
   if(b?.hasAttribute('data-st-import-read')){reviewImport(q('[data-st-import-text]').value);return;}
   if(b?.hasAttribute('data-st-import-dismiss')){showImport(null);status('Import dismissed. Your draft is unchanged.');return;}
   if(b?.hasAttribute('data-st-import-preview')){if(!pendingImport)return;const incoming=pendingImport,local=Object.fromEntries(C.deviceFields.map(k=>[k,draft[k]]));q('[data-st-look-name]').value=incoming.name;q('[data-st-look-description]').value=incoming.description;showImport(null);invalid.clear();qa('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));updateDraft({...incoming.values,...local});status('Imported look is previewing. Save changes to keep it, or Cancel to restore.');return;}
   if(b?.hasAttribute('data-st-export-copy')){copyExport();return;}if(b?.hasAttribute('data-st-export-download')){downloadExport();return;}
   if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  });
  dialog.addEventListener('input',event=>{const n=event.target;if(n.matches('[data-st-aurora-strength]'))updateDraft({...draft,auroraStrength:Number(n.value)});else if(n.matches('[data-st-input]')&&(n.type==='range'||C.colors.includes(n.dataset.stInput)))edit(n);else if(n.matches('[data-st-look-name],[data-st-look-description]'))q('[data-st-export-output]').value=portableJSON();else if(n.matches('[data-st-import-text]'))showImport(null);});
  dialog.addEventListener('change',event=>{
   const n=event.target;if(n.matches('[data-st-advanced-toggle]')){setEditorMode(n.checked);return;}if(n.matches('[data-st-comfort-motion]')){updateDraft({...draft,reduceMotion:n.checked});return;}if(n.matches('[data-st-input],[data-st-setting]')){edit(n);return;}if(n.matches('[data-st-import-file]')){readFile(n.files?.[0]);return;}
   if(n.matches('[data-st-home-visible]')){const key=n.dataset.stHomeVisible;let hidden=draft.homeHidden.filter(v=>v!==key);if(!n.checked)hidden.push(key);const available=availableHome();if(available.length&&available.every(v=>hidden.includes(v))){n.checked=true;status('Keep at least one available homepage row visible.',true);return;}updateDraft({...draft,homeHidden:hidden});}
  });
  dialog.addEventListener('dragstart',event=>{const row=event.target.closest('[data-st-order-row]');if(!row||event.target.closest('input,button'))return;dragged={type:row.dataset.stOrderRow,key:row.dataset.stItem};event.dataTransfer?.setData('text/plain',row.dataset.stItem);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';row.classList.add('stDragging');});
  dialog.addEventListener('dragover',event=>{const row=event.target.closest('[data-st-order-row]');if(row&&dragged?.type===row.dataset.stOrderRow){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}});
  dialog.addEventListener('drop',event=>{const row=event.target.closest('[data-st-order-row]');if(!row||dragged?.type!==row.dataset.stOrderRow)return;event.preventDefault();const order=[...draft[dragged.type+'Order']],from=order.indexOf(dragged.key),to=order.indexOf(row.dataset.stItem);if(from>=0&&to>=0){order.splice(to,0,...order.splice(from,1));updateDraft({...draft,[dragged.type+'Order']:order});}dragged=null;});
  dialog.addEventListener('dragend',()=>{dragged=null;qa('.stDragging').forEach(n=>n.classList.remove('stDragging'));});
  dialog.addEventListener('keydown',event=>{
   if(event.defaultPrevented)return;const tab=event.target.closest('[data-st-tab]');if(!tab)return;const tabs=qa('[data-st-tab]').filter(n=>!n.hidden),index=tabs.indexOf(tab);let next=index;
   if(['ArrowDown','ArrowRight'].includes(event.key))next=(index+1)%tabs.length;else if(['ArrowUp','ArrowLeft'].includes(event.key))next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setTab(tabs[next].dataset.stTab,true);
  });
  const narrow=window.matchMedia('(max-width:800px)'),orientation=()=>q('[role="tablist"]').setAttribute('aria-orientation',narrow.matches?'horizontal':'vertical');narrow.addEventListener('change',orientation);orientation();
  const preference=()=>{apply(dialog.open?draft:saved.values);sync();};for(const query of ['(max-width: 767px)','(pointer: coarse)'])window.matchMedia(query).addEventListener('change',preference);reduced.addEventListener('change',preference);transparent.addEventListener('change',preference);
  let tv=C.context().tv;new MutationObserver(()=>{if(document.body.classList.contains('reduceMotion'))stopPreviewMotion();const next=C.context().tv;if(next!==tv){tv=next;preference();}}).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('swifly:profile-changed',()=>ownerChange());
  document.addEventListener('swifly:account-hydrated',()=>{if(accountPending)return;verifiedUser=window.SwiflyAccount?.user||null;accountSuspended=false;ownerChange();});
  document.addEventListener('swifly:account-suspended',()=>{accountSuspended=true;if(dialog.open)close();verifiedUser=null;load();});
  if(window.SwiflyAccount)Promise.resolve(window.SwiflyAccount.ready).then(session=>{verifiedUser=session?.user||null;accountPending=false;accountSuspended=false;ownerChange(true);}).catch(()=>{verifiedUser=null;accountPending=false;accountSuspended=true;ownerChange(true);});
  window.addEventListener('storage',event=>{
   if(event.key===null||['swiflytv.accountOwner','swiflytv.activeProfile','swiflytv.session'].includes(event.key)){ownerChange();return;}
   if(![saved.key,'swiflytv.studio.device'].includes(event.key))return;if(dialog.open){stale=true;sync();}else load();
  });
  window.addEventListener('pagehide',()=>{if(dialog.open)close();});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='e'){event.preventDefault();dialog.open?close():open();}else if(event.key==='Escape'&&dialog.open&&!event.defaultPrevented){event.preventDefault();close();}});
  const params=new URLSearchParams(location.search),linkedPanel=location.hash.match(/^#(?:stPanel-|studio[/:=-])([a-z]+)$/)?.[1]||params.get('studioPanel');
  if(location.hash==='#studio'||params.get('studio')==='1'||linkedPanel){open();if(linkedPanel)setTab(linkedPanel,true);}
 }
 window.SwiflyStudio=Object.freeze({open,close,reloadSaved:()=>{if(!dialog||dialog.open)return false;load();return true;},getSettings:()=>clone(effective||C.effective(defaults,C.context())),getRawSettings:()=>clone(draft||defaults),getOwner:()=>saved?.owner||''});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
