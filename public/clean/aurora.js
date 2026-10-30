/* A bounded CSS atmosphere. No timers, canvas, or animation-frame loop. */
(() => {
  'use strict';
  if (window.SwiflyAurora) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const touch = window.matchMedia('(pointer: coarse)');
  let started = false, stopped = false, observer, dialogs, viewport, background, inView = true, pageHidden = false;
  function refresh() {
    if (!document.body || stopped) return;
    const policy = document.body.dataset.svPerformance === 'low' ? 'low' : document.documentElement.dataset.svXbox === 'true' || document.documentElement.dataset.svTv === 'true' ? 'console' : touch.matches ? 'touch' : 'full';
    if (document.body.dataset.svPerformance !== policy) document.body.dataset.svPerformance = policy;
    const watch = /^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) || Boolean(document.querySelector('.svPlayerPage,.dsWatchPage'));
    const off = document.body.dataset.stBackdrop !== 'aurora' || document.body.dataset.stHighContrast === 'true';
    const still = pageHidden || document.hidden || reduced.matches || policy === 'console' || policy === 'low' || document.body.classList.contains('reduceMotion') || document.body.dataset.stAuroraMotion === 'still';
    const state = watch || off ? 'off' : still || !inView || document.querySelector('dialog[open]') ? 'still' : 'live';
    const preview = off || !document.querySelector('#controlPanel[open]') ? 'off' : still ? 'still' : 'live';
    if (document.body.dataset.svAuroraState !== state) document.body.dataset.svAuroraState = state;
    if (document.body.dataset.svAuroraPreviewState !== preview) document.body.dataset.svAuroraPreviewState = preview;
  }
  function suspend() {pageHidden = true; refresh();}
  function resume() {pageHidden = false; refresh();}
  function boot() {
    if (started || stopped) return;started = true;
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    reduced.addEventListener('change', refresh);
    touch.addEventListener('change', refresh);
    background = document.querySelector('.svAuroraBackground');
    if (background && typeof IntersectionObserver === 'function') {
      viewport = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.target === background) inView = entry.isIntersecting;
        refresh();
      });
      viewport.observe(background);
    }
    observer = new MutationObserver(refresh);
    observer.observe(document.body, {attributes:true,attributeFilter:['class','data-st-backdrop','data-st-aurora-motion','data-st-high-contrast']});
    observer.observe(document.documentElement, {attributes:true,attributeFilter:['data-sv-xbox','data-sv-tv']});
    dialogs = new MutationObserver(refresh);
    dialogs.observe(document.body, {subtree:true,attributes:true,attributeFilter:['open']});
  }
  function destroy() {
    stopped = true;
    document.removeEventListener('DOMContentLoaded', boot);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('pagehide', suspend);
    window.removeEventListener('pageshow', resume);
    reduced.removeEventListener('change', refresh);
    touch.removeEventListener('change', refresh);
    observer?.disconnect();
    dialogs?.disconnect();
    viewport?.disconnect();
    if (document.body) {document.body.dataset.svAuroraState = 'still';document.body.dataset.svAuroraPreviewState = 'still';}
  }
  window.SwiflyAurora = Object.freeze({refresh,destroy});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});else boot();
})();
