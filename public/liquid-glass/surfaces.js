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
  // Only a handful of prominent, on-screen actions use the real navigation
  // renderer. Repeated poster-grid controls intentionally stay lightweight.
  const navOpticSelector = [
    '.dsHeroActions > :is(.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn)',
    '.svDetailActions > :is(.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn)',
    '.dsWelcomeActions > :is(.dsPrimaryBtn,.dsSecondaryBtn)',
    '.dsSafeAuthForm > .dsPrimaryBtn',
    '.svAuthPasswordToggle',
    '.dsAuthSwitch > a',
    '.dsDropdownLogout',
    '.svDetailChrome > :is(button,a)',
    '.dsAuthTopActions button[data-st-open]',
    '.dsAuthCard'
  ].join(',');
  function deactivate(entry) {
    entry.opticController?.setEnabled(false);
    entry.controller?.setEnabled(false);
    entry.host.dataset.swiflyRenderer = 'blur';
  }
  function activate(entry) {
    if (!entry.visible || !entry.host.isConnected || document.hidden || !liquidPreference() || !window.SwiflyLiquidGlass) return;
    // Same DOM architecture as the working navbar: actual backdrop-filter
    // lives on a .svLiquidPane child, NOT on the isolated control itself.
    if (entry.optic) {
      if (entry.opticPane && !entry.opticPane.isConnected) {
        // Some live controls (e.g. password Show/Hide) use textContent=...,
        // which replaces child nodes. Repair their pane after that update.
        entry.opticController?.destroy();
        entry.opticController=null;entry.opticPane=null;
      }
      if (!entry.opticPane) {
        // Preserve normal text labels above the optical pane; without this,
        // an absolutely positioned backdrop can paint OVER bare text nodes.
        if (!entry.panel) for (const child of [...entry.host.childNodes]) {
          if (child.nodeType !== 3 || !child.textContent.trim()) continue;
          const label=document.createElement('span');
          label.className='svNavMatchedLabel';
          label.textContent=child.textContent;
          entry.host.replaceChild(label,child);
        }
        const pane=document.createElement('span');
        pane.className='svLiquidPane svNavMatchedLens';
        pane.setAttribute('aria-hidden','true');
        entry.host.insertBefore(pane,entry.host.firstChild);
        entry.opticPane=pane;
      }
      if (!entry.opticController) {
        entry.opticController=window.SwiflyLiquidGlass.mount(entry.opticPane, {
          tint:entry.panel?.24:.20,mapBlur:7,blend:'screen',
          distortionScale:-180,channelOffsets:[0,10,20]
        });
      } else if (!entry.opticController.enabled) entry.opticController.setEnabled(true);
    }
    if (!entry.complex) return;
    if (!entry.controller) entry.controller = window.SwiflyLiquidGlass.mount(entry.host, {tint:.32, mapBlur:11, blend:'screen'});
    else if (!entry.controller.enabled) entry.controller.setEnabled(true);
    else if (entry.controller.supported && !filter(entry.host)) entry.controller.refresh();
  }
  function release(entry) {
    intersection?.unobserve(entry.host);
    entry.opticController?.destroy();entry.opticPane?.remove();
    entry.controller?.destroy();
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
    const optic = host.matches(navOpticSelector) && !host.closest('media-player,.vds-controls');
    // When a real navbar pane is present, never mount the old filter on its
    // parent or draw another shared filter on top of it.
    const complex = !optic && panel && host.dataset.glassRefraction === 'true';
    const classes = ['svGlassSurface', panel ? 'svGlassPanel' : 'svGlassControl'];
    if (sharedControl && !optic) classes.push('svSharedGlass');
    if (optic) classes.push('svNavMatchedOptic');
    if (complex) {const position = getComputedStyle(host).position; if (!position || position === 'static') classes.push('svGlassRelative');}
    entry = {host, panel, optic, opticPane:null, opticController:null, complex, controller:null, visible:!intersection, addedClasses:classes.filter(name => !host.classList.contains(name)), previousRenderer:host.dataset.swiflyRenderer, previousProperties:rendererProperties.map(property => [property, host.style.getPropertyValue(property), host.style.getPropertyPriority(property)])};
    entries.set(host, entry); host.classList.add(...classes); host.dataset.swiflyRenderer = 'blur';
    if ((complex || optic) && intersection) intersection.observe(host); else activate(entry);
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
    if (!document.hidden && liquidPreference()) installSharedLens();
    if (document.hidden) {cancelAnimationFrame(frame); frame = 0;}
    for (const entry of entries.values()) if (entry.complex || entry.optic) {
      if (document.hidden || !liquidPreference()) deactivate(entry); else activate(entry);
    }
    schedule();
  }
  // Match the navigation lens rather than using a separate radial-canvas effect.
  // This is the same red/blue directional gradient-map construction used by
  // liquid-glass.js for the navbar. One reusable SVG graph serves all controls;
  // no new canvases, per-button observers, or expensive RGB filter stacks.
  let sharedLens = null;
  function installSharedLens() {
    if (sharedLens || !liquidPreference()) return;
    const supported = typeof CSS !== 'undefined' &&
      CSS.supports('backdrop-filter','url(#sv-shared-action-lens)') &&
      /Chrome|Chromium|Edg|OPR/.test(navigator.userAgent) &&
      !/iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (!supported) return;
    const ns='http://www.w3.org/2000/svg';
    const node=(tag,attrs={})=>{
      const el=document.createElementNS(ns,tag);
      for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
      return el;
    };
    const image=node('svg',{viewBox:'0 0 160 64',xmlns:ns});
    const gradients=node('defs');
    const x=node('linearGradient',{id:'sv-lens-x',x1:'100%',y1:'0%',x2:'0%',y2:'0%'});
    x.append(node('stop',{offset:'0%','stop-color':'red','stop-opacity':'0'}),
             node('stop',{offset:'100%','stop-color':'red'}));
    const y=node('linearGradient',{id:'sv-lens-y',x1:'0%',y1:'0%',x2:'0%',y2:'100%'});
    y.append(node('stop',{offset:'0%','stop-color':'blue','stop-opacity':'0'}),
             node('stop',{offset:'100%','stop-color':'blue'}));
    gradients.append(x,y);
    image.append(gradients,
      node('rect',{width:160,height:64,fill:'black'}),
      node('rect',{width:160,height:64,rx:27,fill:'url(#sv-lens-x)'}),
      node('rect',{width:160,height:64,rx:27,fill:'url(#sv-lens-y)',style:'mix-blend-mode:screen'}),
      node('rect',{x:2.3,y:2.3,width:155.4,height:59.4,rx:25,
        fill:'hsl(0 0% 50% / .93)',style:'filter:blur(7px)'})
    );
    const mapUrl='data:image/svg+xml,'+
      encodeURIComponent(new XMLSerializer().serializeToString(image));
    const svg=node('svg',{'aria-hidden':'true',focusable:'false'});
    svg.classList.add('svSharedGlassDefinitions');
    svg.style.cssText='position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important';
    const defs=node('defs');
    const action=node('filter',{id:'sv-shared-action-lens',
      x:'-12%',y:'-30%',width:'124%',height:'160%','color-interpolation-filters':'sRGB'});
    action.append(
      node('feImage',{href:mapUrl,x:'0',y:'0',width:'100%',height:'100%',preserveAspectRatio:'none',result:'map'}),
      node('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale:'-118',
        xChannelSelector:'R',yChannelSelector:'G'})
    );
    const panel=node('filter',{id:'sv-shared-panel-lens',
      x:'-6%',y:'-8%',width:'112%',height:'116%','color-interpolation-filters':'sRGB'});
    panel.append(
      node('feImage',{href:mapUrl,x:'0',y:'0',width:'100%',height:'100%',preserveAspectRatio:'none',result:'map'}),
      node('feGaussianBlur',{in:'SourceGraphic',stdDeviation:'4',result:'soft'}),
      node('feDisplacementMap',{in:'soft',in2:'map',scale:'-48',
        xChannelSelector:'R',yChannelSelector:'G'})
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
        // When an interactive label replaces its children, rescan the host
        // to restore the navbar pane instead of silently losing refraction.
        if (change.target instanceof HTMLElement) {
          const entry=entries.get(change.target);
          if (entry?.optic && entry.opticPane && !entry.opticPane.isConnected) enqueue(change.target);
        }
        for (const node of change.addedNodes) if (node instanceof HTMLElement) enqueue(node);
        if ([...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
      }
      if (preferenceChanged && liquidPreference()) installSharedLens();
      if (preferenceChanged) for (const entry of entries.values()) if (entry.complex || entry.optic) {
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
