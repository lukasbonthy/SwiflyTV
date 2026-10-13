/* A bounded CSS atmosphere. No timers, canvas, or animation-frame loop. */
(() => {
  'use strict';
  if (window.SwiflyAurora) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let started = false, stopped = false, observer;
  function refresh() {
    if (!document.body || stopped) return;
    const watch = /^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) || Boolean(document.querySelector('.svPlayerPage,.dsWatchPage'));
    const state = watch || document.body.dataset.stBackdrop !== 'aurora' ? 'off' : document.hidden || reduced.matches || document.body.classList.contains('reduceMotion') ? 'still' : 'live';
    if (document.body.dataset.svAuroraState !== state) document.body.dataset.svAuroraState = state;
  }
  function boot() {
    if (started || stopped) return;started = true;
    refresh();
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    observer = new MutationObserver(refresh);
    observer.observe(document.body, {attributes:true,attributeFilter:['class','data-st-backdrop']});
  }
  function destroy() {
    stopped = true;
    document.removeEventListener('DOMContentLoaded', boot);
    document.removeEventListener('visibilitychange', refresh);
    reduced.removeEventListener('change', refresh);
    observer?.disconnect();
    if (document.body) document.body.dataset.svAuroraState = 'still';
  }
  window.SwiflyAurora = Object.freeze({refresh,destroy});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});else boot();
})();
