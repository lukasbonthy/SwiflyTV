/* v163: lightweight glass surfaces; refraction is reserved for opted-in panels. */
(() => {
  'use strict';
  if (window.SwiflyGlassSurfaces) return;
  const controls = ['.dsPrimaryBtn', '.dsSecondaryBtn', '.dsIconBtn', '.dsGhostPill', '.dsCardQuickActions .dsMiniBtn', '.dsRowBtn', '.dsRowArrow', '.dsClose', '.dsHeroMuteToggle', '.svResumePlay', '.svResumeRemove', '.svRowArrow', '.dsAuthTopActions button[data-st-open]', '.genreDropdown summary', '.dsTabs a', '.pagination a', '.dsEpisodeChips a'].join(',');
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
    // The navigation already lives in one refractive capsule; do not mount a
    // second glass surface on each icon. Keep expensive SVG refraction to the
    // small set of hero/action controls, not every card or scrolling row.
    const featuredControl = !panel && host.matches('.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn') &&
      Boolean(host.closest('.dsHeroActions,.dsWelcomeActions,.dsDetailActionsV121,.svDetailActions'));
    const complex = (panel && host.dataset.glassRefraction === 'true') || featuredControl;
    const classes = ['svGlassSurface', panel ? 'svGlassPanel' : 'svGlassControl'];
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
  function boot() {
    if (stopped || mutations) return;
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
    for (const entry of entries.values()) release(entry);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
