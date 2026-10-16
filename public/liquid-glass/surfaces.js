/* Explicit, bounded prominent optics; repeated controls use native material. */
(() => {
  'use strict';
  if (window.SwiflyGlassSurfaces) return;
  const partyControls='.partyPrimaryBtn,.partySecondaryBtn,.partyIconBtn,.partyHeroPick';
  const partyPanels='.partyModeNav,.partyEntryTabs';
  const partyOptics=partyControls+','+partyPanels;
  // Standalone actions share the navigation lens. Repeated catalog/directory
  // choices keep the same clear coating without a filter graph per item.
  const controls = [
    'button','summary','[role="button"]',
    '.dsPrimaryBtn','.dsSecondaryBtn','.dsIconBtn','.dsGhostPill',
    '.dsCardQuickActions .dsMiniBtn','.dsRowBtn','.dsRowArrow','.svRowArrow',
    '.dsClose','.dsHeroMuteToggle','.dsBigPlayBtn','.svResumePlay',
    '.svResumeRemove','.svDetailBack','.svDetailDismiss','.svDetailReturn',
    '.svDetailClose','.dsAuthTopActions button[data-st-open]',
    '.svAuthPasswordToggle','.dsAuthSwitch > a','.genreDropdown summary',
    '.dsTabs a','.dsDetailTabsV121 > button','.pagination a',
    '.dsEpisodeChips a','.dsSearchBox button','.svSearchPopup button',
    '.dsDropdownLogout','.dsEditProfileBtn',
    // Action links and standalone player chrome must be captured even without
    // a generic button class. The transport buttons keep their owned dock.
    '.svPlayerAction','.svPlayerBack','.svPlayerPartyButton',
    '.svPlayerEpisodeStep','.svPlayerSeason',
    '.dsAccountActions > a','.dsManageProfileActions > a',
    '.svDetailActions > a','.svDetailChrome > a',
    'a.btn','input:is([type="button"],[type="submit"],[type="reset"])',partyControls
  ].join(',');
  const panels = ['.svSearchPopup', '.dsSearchBox form', '.genreDropdownMenu', '.dsDetailTabsV121', '.dsAuthCard', '.dsAuthSwitch', '.dsProfileManagerPanel', '.dsAccountCard', '.dsProfileSelectCard', '.dsDetailGridV121 aside', '.dsAboutGridV121', '.dsSeasonBlock', '#controlPanel', '#toast', 'dialog','.svPlayerModes',partyPanels].join(',');
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
    '.svDetailReturn',
    '.svDetailChrome > :is(button,a)',
    '.dsAuthTopActions button[data-st-open]',
    '.genreDropdown > summary',
    '.dsProfilesQuickActions > :is(.dsSecondaryBtn,.dsGhostPill)',
    '.dsHeroMiniActions > :is(.dsPrimaryBtn,.dsSecondaryBtn)',
    '.dsAccountActions > .dsPrimaryBtn',
    '#profileCreateForm .dsPrimaryBtn',
    '.svAvatarSave','.svPlayerModes',
    '.dsAuthCard',partyOptics
  ].join(',');
  const repeatedControls='.dsCardQuickActions .dsMiniBtn,.dsRowBtn,.dsRowArrow,.svRowArrow,.svResumeRemove,.pagination a,.dsEpisodeChips a,.sv100RoomItem button,.sv100RoomItem a,.partyMovieResults button,.partyMovieResults a,.sv100Channel,#controlPanel button,#controlPanel [role="button"]';
  const outerPlayerControls='.svPlayerBack,.svPlayerPartyButton,.svPlayerEpisodeStep,.svPlayerSeason,.svPlayerModes,.svPlayerAction';
  function deactivate(entry) {
    entry.opticController?.setEnabled(false);
    entry.controller?.setEnabled(false);
    entry.host.dataset.swiflyRenderer = 'blur';
  }
  // Install a lightweight native pane immediately for every standalone
  // action, so glass is present before hover, intersection or animation.
  // The expensive SVG geometry remains strictly visibility-gated.
  function ensureOpticPane(entry) {
    if (!entry.optic) return;
    if (entry.opticPane?.isConnected) return;
    entry.opticController?.destroy();
    entry.opticController = null;
    entry.opticPane = null;
    if (!entry.panel) for (const child of [...entry.host.childNodes]) {
      if (child.nodeType !== 3 || !child.textContent.trim()) continue;
      const label = document.createElement('span');
      label.className = 'svNavMatchedLabel';
      label.textContent = child.textContent;
      entry.host.replaceChild(label, child);
    }
    const pane = document.createElement('span');
    pane.className = 'svLiquidPane svNavMatchedLens';
    pane.setAttribute('aria-hidden', 'true');
    entry.host.insertBefore(pane, entry.host.firstChild);
    entry.opticPane = pane;
  }
  function activate(entry) {
    ensureOpticPane(entry);
    if (!entry.visible || !entry.host.isConnected || document.hidden || !liquidPreference() || !window.SwiflyLiquidGlass) return;
    // Keep the native clear pane while the weighted sheet rises. Building its
    // optical maps at rest avoids competing with the first animation frames.
    const deferred=Boolean(entry.host.closest('.svDetailDialog[data-sv-detail-state="opening"]'));
    // Use the same pane renderer and tint as the top navigation.
    if (entry.optic) {
      if (!entry.opticController) {
        entry.opticController=window.SwiflyLiquidGlass.mount(entry.opticPane, {
          tint:.14,saturation:1,
          // Exactly the same renderer, RGB separation and displacement as nav.
          distortionScale:-180,channelOffsets:[0,10,20]
        });
        if(deferred)entry.opticController.setEnabled(false);
      } else if(entry.opticController.enabled===deferred)entry.opticController.setEnabled(!deferred);
    }
    if (!entry.complex) return;
    if (!entry.controller) entry.controller = window.SwiflyLiquidGlass.mount(entry.host, {tint:.14,saturation:1});
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
    if (!(host instanceof HTMLElement) || !host.isConnected || host.matches('.svDetailDialog, .svStudioDialog') || host.closest('.svLiquidPane, media-player, .vds-controls, .svPlayerEmbedded')) return;
    if(host.closest('[data-player-root]')&&!host.matches(outerPlayerControls))return;
    // Artwork choices retain the frames around their thumbnails. Navigation
    // icons already sit on one shared pane and must not stack extra surfaces.
    if (host.matches('.partyFilmChoice,.stPreset,.svAvatarPreset,.svAvatarEditTrigger,.svProfileCreateAvatar') || host.matches('.svNavButton,.svWelcomeStudio,.dsProfileMenu > summary') && host.closest('.netflixNav,.dsWelcomeNav')) return;
    if (host.closest('.svPartyHub')) {
      if (host.matches(panels) && !host.matches(partyPanels)) return;
      // Tabs share the enclosing pill; filtering their child buttons too
      // stacks several backdrops and obscures the active selection.
      if (host.closest(partyPanels) && !host.matches(partyPanels)) return;
    }
    let entry = entries.get(host);
    if (entry) {ensureOpticPane(entry); activate(entry); return;}
    const panel = host.matches(panels);
    // Void HTML inputs cannot host a child optical pane. Give them the
    // same native clear glass coating without inserting invalid children.
    const optic = !host.matches('input,textarea,select') && (host.matches(navOpticSelector)||!panel&&!host.matches(repeatedControls)) && !host.closest('media-player,.vds-controls,.sv100RoomItem,.partyMovieResults');
    // When a real navbar pane is present, never mount the old filter on its
    // parent or draw another shared filter on top of it.
    const complex = !optic && panel && host.dataset.glassRefraction === 'true';
    const classes = ['svGlassSurface', panel ? 'svGlassPanel' : 'svGlassControl'];
    if (optic) classes.push('svNavMatchedOptic');
    if (complex) {const position = getComputedStyle(host).position; if (!position || position === 'static') classes.push('svGlassRelative');}
    entry = {host, panel, optic, opticPane:null, opticController:null, complex, controller:null, visible:!intersection, addedClasses:classes.filter(name => !host.classList.contains(name)), previousRenderer:host.dataset.swiflyRenderer, previousProperties:rendererProperties.map(property => [property, host.style.getPropertyValue(property), host.style.getPropertyPriority(property)])};
    entries.set(host, entry); host.classList.add(...classes); host.dataset.swiflyRenderer = 'blur';
    ensureOpticPane(entry);
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
    if (document.hidden) {cancelAnimationFrame(frame); frame = 0;}
    for (const entry of entries.values()) if (entry.complex || entry.optic) {
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
        // When an interactive label replaces its children, rescan the host
        // to restore the navbar pane instead of silently losing refraction.
        if (change.target instanceof HTMLElement) {
          const entry=entries.get(change.target);
          if (entry?.optic && entry.opticPane && !entry.opticPane.isConnected) enqueue(change.target);
        }
        for (const node of change.addedNodes) if (node instanceof HTMLElement) enqueue(node);
        if ([...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
      }
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
    for (const entry of entries.values()) release(entry);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
