/* v158: immediate appearance drafts with quiet, cancellable preview feedback. */
(() => {
  'use strict';
  if (window.SwiflyStudio) return;
  const key='swiflytv.appearance';
  const defaults={theme:'default',font:'default',layout:'default',cardstyle:'rounded',density:'comfy',backdrop:'aurora',auroraColor:'glacier',auroraStrength:80,auroraMotion:'drift',glass:'liquid',smooth:true,reduceMotion:false};
  const allowed={theme:['default','red','blue','green','mono'],font:['default','cinema','soft','wide'],layout:['default','cinema','posterwall'],cardstyle:['rounded','sharp','softglass'],density:['comfy','compact'],backdrop:['aurora','smooth','grain'],auroraColor:['glacier','violet','rose','mint'],auroraMotion:['drift','slow','still'],glass:['off','subtle','liquid']};
  const presets={
    pure:{theme:'default',font:'default',layout:'default',cardstyle:'rounded',density:'comfy',backdrop:'smooth',glass:'liquid',smooth:true},
    cinema:{theme:'red',font:'cinema',layout:'cinema',cardstyle:'rounded',density:'comfy',backdrop:'grain',glass:'subtle',smooth:true},
    midnight:{theme:'blue',font:'default',layout:'default',cardstyle:'softglass',density:'comfy',backdrop:'smooth',glass:'liquid',smooth:true},
    focus:{theme:'mono',font:'default',layout:'default',cardstyle:'sharp',density:'compact',backdrop:'smooth',glass:'off',smooth:false}
  };
  const accents={default:'#ece9e2',red:'#e7baa3',blue:'#a9c7ed',green:'#b4cbb8',mono:'#c1c1c7'};
  const canvases={default:'#000000',red:'#080605',blue:'#05080d',green:'#050907',mono:'#09090b'};
  const fonts={default:'"Host Grotesk",system-ui,sans-serif',cinema:'"Space Grotesk","Host Grotesk",sans-serif',soft:'"Outfit","Host Grotesk",sans-serif',wide:'"Host Grotesk",system-ui,sans-serif'};
  const auroraHues={glacier:0,violet:95,rose:205,mint:310};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let dialog,trigger,saved,draft,previewAnimation,started=false;
  const equal=(a,b)=>Object.keys(defaults).every(name=>a[name]===b[name]);
  function stopPreviewMotion() {
    previewAnimation?.cancel();previewAnimation=null;
  }
  function previewChange() {
    stopPreviewMotion();
    if (!dialog.open || reduced.matches || document.body.classList.contains('reduceMotion')) return;
    const preview=dialog.querySelector('[data-st-preview]');
    if (typeof preview.animate!=='function') return;
    const animation=preview.animate([{opacity:.8},{opacity:1}],{duration:180,easing:'cubic-bezier(.2,.7,.25,1)'});
    previewAnimation=animation;
    animation.onfinish=()=>{if (previewAnimation===animation) previewAnimation=null;};
  }
  function updateDraft(next) {
    const changed=Object.keys(allowed).some(name=>draft[name]!==next[name]);
    draft=next;apply(draft);sync();if (changed) previewChange();
  }
  function validate(value) {
    const result={...defaults};
    if (!value || typeof value!=='object') return result;
    for (const name of Object.keys(defaults)) {
      if (name==='auroraStrength' && Number.isInteger(value[name]) && value[name]>=0 && value[name]<=100) result[name]=value[name];
      else if (allowed[name]?.includes(value[name]) || (typeof defaults[name]==='boolean' && typeof value[name]==='boolean')) result[name]=value[name];
    }
    return result;
  }
  function read() {
    try {
      const raw=localStorage.getItem(key);
      if (raw) {const record=JSON.parse(raw);return record.version===1?validate(record.values):{...defaults};}
      const legacy={};
      for (const name of Object.keys(allowed)) legacy[name]=localStorage.getItem('movieverse.'+name);
      legacy.reduceMotion=localStorage.getItem('movieverse.reduceMotion')==='on';
      if (legacy.layout==='dense') {legacy.layout='default';legacy.density='compact';}
      if (legacy.layout==='spotlight') legacy.layout='cinema';
      if (legacy.cardstyle==='float') legacy.cardstyle='softglass';
      if (localStorage.getItem('movieverse.effect')==='off') legacy.glass='off';
      return validate(legacy);
    } catch {return {...defaults};}
  }
  function apply(value) {
    const body=document.body;
    body.dataset.svAppearance='v155';
    for (const name of Object.keys(allowed)) body.dataset['st'+name[0].toUpperCase()+name.slice(1)]=value[name];
    body.dataset.svScroll=value.smooth?'smooth':'native';
    body.classList.toggle('reduceMotion',value.reduceMotion);
    if (value.reduceMotion) stopPreviewMotion();
    const legacyClasses=['effect-clean','effect-cinematic','effect-dropcart','effect-neon','effect-glow','effect-glass','effect-calm','effect-ultra','effect-off','detail-clean','detail-balanced','detail-max'];
    for (const [name,values] of Object.entries(allowed)) for (const item of values) legacyClasses.push(name+'-'+item);
    legacyClasses.push('layout-dense','layout-spotlight','cardstyle-float','backdrop-grid','backdrop-aurora');
    body.classList.remove(...legacyClasses);body.classList.add('effect-clean','detail-balanced');
    for (const name of ['theme','font','layout','cardstyle','density','backdrop']) body.classList.add(name+'-'+value[name]);
    body.style.setProperty('--sv-aurora-strength',String(value.auroraStrength/100));
    body.style.setProperty('--sv-aurora-hue',auroraHues[value.auroraColor]+'deg');
    body.style.setProperty('--sv-aurora-speed',value.auroraMotion==='slow'?'55s':'32s');
    body.dataset.stAuroraMotion=value.auroraMotion;
    body.style.setProperty('--st-accent',accents[value.theme]);
    body.style.setProperty('--st-canvas',canvases[value.theme]);
    body.style.setProperty('--st-font',fonts[value.font]);
    body.style.setProperty('--st-display-font',value.font==='wide'?'"Unbounded","Host Grotesk",sans-serif':fonts[value.font]);
    body.style.setProperty('--st-radius',{sharp:'3px',rounded:'10px',softglass:'20px'}[value.cardstyle]);
    body.style.setProperty('--st-gap',value.density==='compact'?'10px':'16px');
    body.style.setProperty('--sv-poster-width',value.layout==='cinema'?'clamp(168px,18vw,250px)':value.density==='compact'?'clamp(126px,12vw,174px)':'clamp(150px,14vw,210px)');
    if (!value.smooth || value.reduceMotion) window.SwiflyMotion?.stop();
    window.SwiflyAurora?.refresh();
  }
  function status(message,error=false) {
    const node=dialog.querySelector('[data-st-status]');node.textContent=message;node.classList.toggle('stStatusError',error);
  }
  function sync() {
    dialog.querySelectorAll('[data-st-field]').forEach(button=>{
      const selected=draft[button.dataset.stField]===button.dataset.stValue;button.setAttribute('aria-pressed',String(selected));
    });
    dialog.querySelectorAll('[data-st-setting]').forEach(input=>input.checked=draft[input.dataset.stSetting]);
    const strength=dialog.querySelector('[data-st-aurora-strength]');
    if(strength){strength.value=String(draft.auroraStrength);dialog.querySelector('[data-st-aurora-strength-value]').textContent=draft.auroraStrength+'%';}
    dialog.querySelector('[data-st-aurora-settings]').hidden=draft.backdrop!=='aurora';
    let look='Custom look';
    for (const [name,preset] of Object.entries(presets)) {
      const selected=Object.keys(preset).every(field=>draft[field]===preset[field]);
      dialog.querySelector('[data-st-preset="'+name+'"]').setAttribute('aria-pressed',String(selected));
      if (selected) look=name[0].toUpperCase()+name.slice(1);
    }
    const changed=!equal(saved,draft);dialog.querySelector('[data-st-save]').disabled=!changed;
    status(changed?'Previewing changes · save to keep them':'No unsaved changes');
    dialog.querySelector('[data-st-look-label]').textContent=look;
    const layout={default:'Classic rows',cinema:'Cinema rows',posterwall:'Poster wall'}[draft.layout];
    const glass={off:'Solid surfaces',subtle:'Soft glass',liquid:'Liquid glass'}[draft.glass];
    const backdrop={aurora:'Aurora',smooth:'Clean atmosphere',grain:'Film grain'}[draft.backdrop];
    dialog.querySelector('[data-st-preview-description]').textContent=layout+' · '+glass+' · '+backdrop;
  }
  function previewArtwork() {
    const titleSource=document.querySelector('.dsHeroContent h1,.svDetailTitleText,.svWelcomeSpotlight strong')||document.querySelector('main h1');
    const title=titleSource?.textContent.trim();
    dialog.querySelector('[data-st-preview-title]').textContent=title||'Movie night, your way.';
    const source=document.querySelector('.dsHeroBg,.dsWelcomeHeroBg,.svDetailBackdrop');
    const background=source?getComputedStyle(source).backgroundImage:'';
    dialog.querySelector('[data-st-preview-scene]').style.backgroundImage=background&&background!=='none'?background:'';
    const sceneImage=source?.querySelector('img');
    if ((!background || background==='none') && sceneImage?.getAttribute('src')) dialog.querySelector('[data-st-preview-scene]').style.backgroundImage='url('+JSON.stringify(sceneImage.src)+')';
    const images=[...document.querySelectorAll('.movieCard .posterWrap > img,.movieCard .dsThumb > img,.svResumeLink > img,.svWelcomePosterArt > img,.dsWelcomeCard img')].filter(image=>image.getAttribute('src'));
    dialog.querySelectorAll('.stPreviewPoster img').forEach((image,index)=>{
      const source=images[index];image.hidden=!source;
      image.onerror=()=>{image.hidden=true;};
      if (source) image.src=source.src;
      else image.removeAttribute('src');
    });
  }
  function setTab(name,focus=false) {
    const tabs=[...dialog.querySelectorAll('[data-st-tab]')];
    if (!tabs.some(tab=>tab.dataset.stTab===name)) return;
    for (const tab of tabs) {
      const active=tab.dataset.stTab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      dialog.querySelector('#'+tab.getAttribute('aria-controls')).hidden=!active;
      if (active&&focus) tab.focus({preventScroll:true});
    }
    dialog.querySelector('.stContent').scrollTop=0;
    dialog.querySelector('.stWorkspaceBody').scrollTop=0;
  }
  function cleanup() {
    if (dialog.open) return;
    stopPreviewMotion();
    apply(saved);draft={...saved};document.documentElement.classList.remove('svStudioOpen');
    document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(button=>button.setAttribute('aria-expanded','false'));
    if (trigger?.isConnected) trigger.focus({preventScroll:true});trigger=null;
  }
  function close() {
    if (!dialog?.open) return;
    stopPreviewMotion();
    apply(saved);draft={...saved};if (typeof dialog.close==='function') dialog.close();else dialog.removeAttribute('open');cleanup();
  }
  function open(from) {
    if (!dialog || dialog.open) return;
    saved=read();draft={...saved};trigger=from||document.activeElement;
    apply(draft);sync();previewArtwork();window.SwiflyMotion?.stop();
    document.documentElement.classList.add('svStudioOpen');
    if (typeof dialog.showModal==='function') dialog.showModal();else dialog.setAttribute('open','');
    document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(button=>button.setAttribute('aria-expanded','true'));
    dialog.querySelector('[data-st-tab][aria-selected="true"]').focus({preventScroll:true});
  }
  function save() {
    try {localStorage.setItem(key,JSON.stringify({version:1,values:draft}));}
    catch {status('Could not save in this browser. Your changes are still previewing.',true);return;}
    saved={...draft};close();window.showToast?.('Appearance saved');
  }
  function boot() {
    if (started) return;started=true;dialog=document.getElementById('controlPanel');if (!dialog) return;
    saved=read();draft={...saved};apply(saved);sync();
    document.querySelectorAll('#controlToggleTop,[data-st-open]').forEach(button=>button.addEventListener('click',event=>dialog.open?close():open(event.currentTarget)));
    dialog.addEventListener('close',cleanup);
    dialog.addEventListener('cancel',()=>{stopPreviewMotion();apply(saved);draft={...saved};});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if (button?.hasAttribute('data-st-cancel')) {close();return;}
      if (button?.hasAttribute('data-st-save')) {save();return;}
      if (button?.hasAttribute('data-st-reset')) {updateDraft({...defaults});return;}
      if (button?.dataset.stTab) {setTab(button.dataset.stTab);return;}
      if (presets[button?.dataset.stPreset]) {updateDraft({...draft,...presets[button.dataset.stPreset]});return;}
      const field=button?.dataset.stField,value=button?.dataset.stValue;
      if (allowed[field]?.includes(value)) {updateDraft({...draft,[field]:value});return;}
      if (event.target===dialog) {
        const rect=dialog.getBoundingClientRect();
        if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) close();
      }
    });
    dialog.addEventListener('input',event=>{
      if(event.target?.matches('[data-st-aurora-strength]')) updateDraft({...draft,auroraStrength:Number(event.target.value)});
    });
    dialog.addEventListener('change',event=>{
      const input=event.target.closest('[data-st-setting]');
      if (!input || !['smooth','reduceMotion'].includes(input.dataset.stSetting)) return;
      draft[input.dataset.stSetting]=input.checked;apply(draft);sync();
    });
    dialog.addEventListener('keydown',event=>{
      if (event.defaultPrevented) return;
      const tab=event.target.closest('[data-st-tab]');if (!tab) return;
      const tabs=[...dialog.querySelectorAll('[data-st-tab]')],index=tabs.indexOf(tab);
      let next=index;
      if (['ArrowDown','ArrowRight'].includes(event.key)) next=(index+1)%tabs.length;
      else if (['ArrowUp','ArrowLeft'].includes(event.key)) next=(index+tabs.length-1)%tabs.length;
      else if (event.key==='Home') next=0;else if (event.key==='End') next=tabs.length-1;else return;
      event.preventDefault();setTab(tabs[next].dataset.stTab,true);
    });
    const narrow=window.matchMedia('(max-width:800px)');
    const orientation=()=>dialog.querySelector('[role="tablist"]').setAttribute('aria-orientation',narrow.matches?'horizontal':'vertical');
    narrow.addEventListener('change',orientation);orientation();
    const motionPreference=()=>{if (reduced.matches || document.body.classList.contains('reduceMotion')) stopPreviewMotion();};
    reduced.addEventListener('change',motionPreference);
    new MutationObserver(motionPreference).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',event=>{
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='e') {event.preventDefault();dialog.open?close():open();}
      else if (event.key==='Escape'&&dialog.open&&typeof dialog.showModal!=='function') {event.preventDefault();close();}
    });
    if (location.hash==='#studio'||new URLSearchParams(location.search).get('studio')==='1') open();
  }
  window.SwiflyStudio=Object.freeze({open,close});
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
