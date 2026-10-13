/* v163: lightweight glass surfaces; refraction is reserved for opted-in panels. */
(() => {
  'use strict';
  if (window.SwiflyGlassSurfaces) return;
  // Explicit interactive surfaces only. Poster-card actions remain cheap frost.
  const controls = [
    '.dsPrimaryBtn','.dsSecondaryBtn','.dsIconBtn','.dsGhostPill',
    '.dsCardQuickActions .dsMiniBtn','.dsRowBtn','.dsRowArrow','.svRowArrow',
    '.dsClose','.dsHeroMuteToggle','.dsBigPlayBtn','.svResumePlay',
    '.svResumeRemove','.svDetailBack','.svDetailDismiss','.svDetailReturn',
    '.svDetailClose','.dsAuthTopActions button[data-st-open]',
    '.svAuthPasswordToggle','.dsAuthSwitch > a','.genreDropdown summary',
    '.dsTabs a','.dsDetailTabsV121 > button','.pagination a',
    '.dsEpisodeChips a','.dsSearchBox button','.svSearchPopup button',
    '.dsDropdownLogout','.dsEditProfileBtn'
  ].join(',');
  const panels = ['.svSearchPopup', '.dsSearchBox form', '.genreDropdownMenu', '.dsDetailTabsV121', '.dsAuthCard', '.dsAuthSwitch', '.dsProfileManagerPanel', '.dsAccountCard', '.dsProfileSelectCard', '.dsDetailGridV121 aside', '.dsAboutGridV121', '.dsSeasonBlock', '#controlPanel', '#toast', 'dialog'].join(',');
  const selector = controls + ',' + panels, entries = new Map(), pending = new Set();
  const rendererProperties = ['--sv-glass-default-tint', '--sv-glass-saturation', '--sv-glass-filter'];
  let intersection, mutations, frame = 0, stopped = false, removed = false;
  const liquidPreference = () => !['off', 'subtle'].includes(document.body.dataset.stGlass);
  const filter = host => host.querySelector(':scope > svg.svLiquidPane__filters');
  function deactivate(entry) {
    entry.controller?.setEnabled(false); entry.host.dataset.swiflyRenderer = 'blur';
  }
  function activate(entry) {
    if (!entry.complex || !entry.visible || !entry.host.isConnected || document.hidden || !liquidPreference() || !window.SwiflyLiquidGlass) return;
    if (!entry.controller) entry.controller = window.SwiflyLiquidGlass.mount(entry.host, {tint:.32, mapBlur:11, blend:'screen'});
    else if (!entry.controller.enabled) entry.controller.setEnabled(true);
    else if (entry.controller.supported && !filter(entry.host)) entry.controller.refresh();
  }
  function release(entry) {
    intersection?.unobserve(entry.host); entry.controller?.destroy();
    for (const name of entry.addedClasses) entry.host.classList.remove(name);
    if (entry.previousRenderer === undefined) delete entry.host.dataset.swiflyRenderer;
    else entry.host.dataset.swiflyRenderer = entry.previousRenderer;
    for (const [property, value, priority] of entry.previousProperties) {
      if (value) entry.host.style.setProperty(property, value, priority); else entry.host.style.removeProperty(property);
    }
    entries.delete(entry.host);
  }
  function ensure(host) {
    if (!(host instanceof HTMLElement) || !host.isConnected || host.matches('.svDetailDialog, .svStudioDialog') || host.closest('.svLiquidPane, media-player, .vds-controls')) return;
    let entry = entries.get(host);
    if (entry) {activate(entry); return;}
    const panel = host.matches(panels);
    // Shared, single-pass SVG refraction: one filter for every interactive lens.
    // No per-button SVG graph, ResizeObserver or layout reads.
    // Never refract cards in scrolling grids or navbar icons separately.
    const sharedControl = !panel &&
      !host.closest('.dsCardQuickActions,.movieCard,.posterWrap,media-player,.vds-controls') &&
      (!host.closest('.netflixNav,.dsWelcomeNav,.mobileNav') || Boolean(host.closest('.dsProfileDropdown,.svLiquidDropdown'))) &&
      host.matches('.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn,.dsGhostPill,.dsRowBtn,.dsRowArrow,.svRowArrow,.dsClose,.dsHeroMuteToggle,.dsBigPlayBtn,.svDetailBack,.svDetailDismiss,.svDetailReturn,.svDetailClose,.svAuthPasswordToggle,.dsAuthSwitch > a,.dsAuthTopActions button[data-st-open],.dsDetailTabsV121 > button,.pagination a,.dsEpisodeChips a,.dsSearchBox button,.svSearchPopup button,.dsDropdownLogout,.dsEditProfileBtn');
    const complex = panel && host.dataset.glassRefraction === 'true';
    const classes = ['svGlassSurface', panel ? 'svGlassPanel' : 'svGlassControl'];
    if (sharedControl) classes.push('svSharedGlass');
    if (complex) {const position = getComputedStyle(host).position; if (!position || position === 'static') classes.push('svGlassRelative');}
    entry = {host, complex, controller:null, visible:!intersection, addedClasses:classes.filter(name => !host.classList.contains(name)), previousRenderer:host.dataset.swiflyRenderer, previousProperties:rendererProperties.map(property => [property, host.style.getPropertyValue(property), host.style.getPropertyPriority(property)])};
    entries.set(host, entry); host.classList.add(...classes); host.dataset.swiflyRenderer = 'blur';
    if (complex && intersection) intersection.observe(host); else activate(entry);
  }
  function scan(root) {
    if (!root || stopped) return;
    if (root instanceof HTMLElement && root.matches(selector)) ensure(root);
    root.querySelectorAll?.(selector).forEach(ensure);
  }
  function enqueue(root) {
    for (let parent = root.parentElement; parent; parent = parent.parentElement) if (pending.has(parent)) return;
    pending.add(root);
  }
  function schedule() {if (!stopped && !document.hidden && (pending.size || removed) && !frame) frame = requestAnimationFrame(reconcile);}
  function reconcile() {
    frame = 0; if (stopped || document.hidden) return;
    if (removed) {for (const entry of entries.values()) if (!entry.host.isConnected) release(entry); removed = false;}
    const roots = [...pending].filter(root => {
      for (let parent = root.parentElement; parent; parent = parent.parentElement) if (pending.has(parent)) return false;
      return true;
    });
    pending.clear();
    for (const root of roots) if (root.isConnected) scan(root);
  }
  function onVisibility() {
    if (document.hidden) {cancelAnimationFrame(frame); frame = 0;}
    for (const entry of entries.values()) if (entry.complex) {
      if (document.hidden || !liquidPreference()) deactivate(entry); else activate(entry);
    }
    schedule();
  }
  // Two real backdrop SVG filters share ONE displacement map. The map is
  // generated once from a smooth radial lens field, not a blurred static stripe.
  // Buttons use stronger displacement; the large auth panel is gentler.
  let sharedLens = null;
  function installSharedLens() {
    if (sharedLens || !liquidPreference()) return;
    const supported = typeof CSS !== 'undefined' &&
      CSS.supports('backdrop-filter','url(#sv-shared-action-lens)') &&
      /Chrome|Chromium|Edg|OPR/.test(navigator.userAgent) &&
      !/iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (!supported) return;
    const canvas = document.createElement('canvas');
    canvas.width=160; canvas.height=64;
    const context=canvas.getContext('2d');
    if (!context) return;
    const map=context.createImageData(160,64);
    for(let y=0;y<64;y++) for(let x=0;x<160;x++) {
      const u=(x+.5)/160*2-1,v=(y+.5)/64*2-1;
      const radius=Math.hypot(u*.90,v);
      const edge=Math.exp(-Math.pow((radius-.78)/.21,2));
      const strength=.13+.50*edge;
      const radial=radius?strength/radius:0;
      const i=(y*160+x)*4;
      map.data[i]=Math.max(0,Math.min(255,Math.round(128+u*radial*110)));
      map.data[i+1]=Math.max(0,Math.min(255,Math.round(128+v*radial*110)));
      map.data[i+2]=128;map.data[i+3]=255;
    }
    context.putImageData(map,0,0);
    const image=canvas.toDataURL('image/png');
    const ns='http://www.w3.org/2000/svg';
    function node(name,attrs={}) {
      const el=document.createElementNS(ns,name);
      for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
      return el;
    }
    const svg=node('svg',{'aria-hidden':'true',focusable:'false'});
    svg.classList.add('svSharedGlassDefinitions');
    svg.style.cssText='position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important';
    const defs=node('defs');
    const action=node('filter',{id:'sv-shared-action-lens',x:'-15%',y:'-35%',width:'130%',height:'170%','color-interpolation-filters':'sRGB'});
    action.append(
      node('feImage',{href:image,x:'0',y:'0',width:'100%',height:'100%',preserveAspectRatio:'none',result:'map'}),
      node('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale:'31',xChannelSelector:'R',yChannelSelector:'G'})
    );
    const panel=node('filter',{id:'sv-shared-panel-lens',x:'-10%',y:'-10%',width:'120%',height:'120%','color-interpolation-filters':'sRGB'});
    panel.append(
      node('feImage',{href:image,x:'0',y:'0',width:'100%',height:'100%',preserveAspectRatio:'none',result:'map'}),
      node('feGaussianBlur',{in:'SourceGraphic',stdDeviation:'5',result:'soft'}),
      node('feDisplacementMap',{in:'soft',in2:'map',scale:'13',xChannelSelector:'R',yChannelSelector:'G'})
    );
    defs.append(action,panel);svg.append(defs);
    document.body.append(svg);
    sharedLens=svg;
    document.body.classList.add('svSharedGlassReady');
  }
  function boot() {
    if (stopped || mutations) return;
    installSharedLens();
    if (typeof IntersectionObserver === 'function') intersection = new IntersectionObserver(changes => {
      for (const change of changes) {
        const entry = entries.get(change.target); if (!entry) continue;
        entry.visible = change.isIntersecting;
        if (entry.visible) activate(entry); else deactivate(entry);
      }
    }, {rootMargin:'80px', threshold:0});
    scan(document);
    mutations = new MutationObserver(changes => {
      let preferenceChanged = false;
      for (const change of changes) {
        if (change.type === 'attributes') {if (change.target === document.body) preferenceChanged = true; continue;}
        if (change.target instanceof Element && change.target.closest('svg.svLiquidPane__filters')) continue;
        for (const node of change.addedNodes) if (node instanceof HTMLElement) enqueue(node);
        if ([...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
      }
      if (preferenceChanged) for (const entry of entries.values()) if (entry.complex) {
        if (liquidPreference()) activate(entry); else deactivate(entry);
      }
      schedule();
    });
    mutations.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-st-glass']});
    document.addEventListener('visibilitychange', onVisibility);
  }
  window.SwiflyGlassSurfaces = Object.freeze({refresh(root = document) {scan(root);}, destroy() {
    if (stopped) return; stopped = true;
    document.removeEventListener('DOMContentLoaded', boot); document.removeEventListener('visibilitychange', onVisibility);
    mutations?.disconnect(); intersection?.disconnect(); cancelAnimationFrame(frame); frame = 0; pending.clear();
    sharedLens?.remove(); sharedLens=null; document.body.classList.remove('svSharedGlassReady');
    for (const entry of entries.values()) release(entry);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
