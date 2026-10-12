/* SwiflyTV v153: reuse navigation refraction on existing UI surfaces. */
(() => {
  "use strict";
  if (window.SwiflyGlassSurfaces) return;
  const controls = [".dsPrimaryBtn", ".dsSecondaryBtn", ".dsIconBtn", ".dsGhostPill", ".dsCardQuickActions .dsMiniBtn", ".dsRowBtn", ".dsClose", ".svResumePlay", ".svResumeRemove", ".svRowArrow", ".genreDropdown summary", ".dsTabs a", ".pagination a", ".dsEpisodeChips a"].join(",");
  const panels = [".svSearchPopup", ".dsSearchBox form", ".genreDropdownMenu", ".dsDetailTabsV121", ".dsAuthCard", ".dsAuthSwitch", ".dsProfileManagerPanel", ".dsAccountCard", ".dsProfileSelectCard", ".dsDetailGridV121 aside", ".dsAboutGridV121", ".dsSeasonBlock", "#controlPanel", "#toast", "dialog"].join(",");
  const selector = controls + "," + panels;
  const entries = new Map();
  let intersection, mutations, frame = 0, stopped = false;
  const pending = new Set();
  const rendererProperties = ["--sv-glass-default-tint", "--sv-glass-saturation", "--sv-glass-filter"];
  const filter = host => host.querySelector(":scope > svg.svLiquidPane__filters");
  function deactivate(entry) { entry.controller?.destroy(); entry.controller = null; entry.host.dataset.swiflyRenderer = "blur"; }
  function activate(entry) {
    if (!entry.host.isConnected || !window.SwiflyLiquidGlass) return;
    if (entry.controller?.supported && !filter(entry.host)) deactivate(entry);
    if (entry.controller) return;
    entry.controller = window.SwiflyLiquidGlass.mount(entry.host, { tint: entry.panel ? .32 : .06, mapBlur: entry.panel ? 11 : 7, blend: "screen" });
    const svg = filter(entry.host);
    if (svg && entry.host.lastElementChild !== svg) entry.host.append(svg);
  }
  function release(entry) {
    intersection?.unobserve(entry.host); entry.controller?.destroy();
    entry.host.classList.remove("svGlassSurface", "svGlassControl", "svGlassPanel", "svGlassRelative");
    if (entry.previousRenderer === undefined) delete entry.host.dataset.swiflyRenderer;
    else entry.host.dataset.swiflyRenderer = entry.previousRenderer;
    for (const [property, value, priority] of entry.previousProperties) {
      if (value) entry.host.style.setProperty(property, value, priority); else entry.host.style.removeProperty(property);
    }
    entries.delete(entry.host);
  }
  function ensure(host) {
    if (!(host instanceof HTMLElement) || !host.isConnected || host.matches(".svDetailDialog, .svStudioDialog") || host.closest(".svLiquidPane, media-player, .vds-controls")) return;
    let entry = entries.get(host);
    if (entry) { if (entry.visible) activate(entry); return; }
    const panel = host.matches(panels);
    entry = { host, panel, controller: null, visible: !intersection, previousRenderer: host.dataset.swiflyRenderer, previousProperties: rendererProperties.map(property => [property, host.style.getPropertyValue(property), host.style.getPropertyPriority(property)]) };
    entries.set(host, entry); host.classList.add("svGlassSurface", panel ? "svGlassPanel" : "svGlassControl");
    const position = getComputedStyle(host).position;
    if (!position || position === "static") host.classList.add("svGlassRelative");
    host.dataset.swiflyRenderer = "blur";
    if (intersection) intersection.observe(host); else activate(entry);
  }
  function scan(root) {
    if (!root || stopped) return;
    if (root instanceof HTMLElement && root.matches(selector)) ensure(root);
    root.querySelectorAll?.(selector).forEach(ensure);
  }
  function reconcile() {
    frame = 0; if (stopped) return;
    for (const entry of entries.values()) if (!entry.host.isConnected) release(entry);
    for (const root of pending) if (root.isConnected) scan(root);
    pending.clear();
  }
  function boot() {
    if (stopped || mutations) return;
    if (typeof IntersectionObserver === "function") intersection = new IntersectionObserver(changes => {
      for (const change of changes) {
        const entry = entries.get(change.target); if (!entry) continue;
        entry.visible = change.isIntersecting; if (entry.visible) activate(entry); else deactivate(entry);
      }
    }, { rootMargin: "80px", threshold: 0 });
    scan(document);
    mutations = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.target instanceof Element && change.target.closest("svg.svLiquidPane__filters")) continue;
        pending.add(change.target);
        for (const node of change.addedNodes) if (node instanceof HTMLElement) pending.add(node);
      }
      if (pending.size && !frame) frame = requestAnimationFrame(reconcile);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
  }
  window.SwiflyGlassSurfaces = Object.freeze({ refresh(root = document) { scan(root); }, destroy() { stopped = true; mutations?.disconnect(); intersection?.disconnect(); cancelAnimationFrame(frame); pending.clear(); for (const entry of entries.values()) release(entry); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
