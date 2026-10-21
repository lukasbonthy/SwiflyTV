/* A bounded CSS atmosphere. No timers, canvas, or animation-frame loop. */
(() => {
  'use strict';
  if (window.SwiflyAurora) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const touch = window.matchMedia('(pointer: coarse)');
  let started = false, stopped = false, observer, viewport, background, inView = true;
  function refresh() {
    if (!document.body || stopped) return;
    const policy = document.documentElement.dataset.svXbox === 'true' ? 'console' : touch.matches ? 'touch' : 'full';
    if (document.body.dataset.svPerformance !== policy) document.body.dataset.svPerformance = policy;
    const watch = /^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) || Boolean(document.querySelector('.svPlayerPage,.dsWatchPage'));
    const state = watch || document.body.dataset.stBackdrop !== 'aurora' ? 'off' : document.hidden || !inView || reduced.matches || policy === 'console' || document.body.classList.contains('reduceMotion') ? 'still' : 'live';
    if (document.body.dataset.svAuroraState !== state) document.body.dataset.svAuroraState = state;
  }
  function boot() {
    if (started || stopped) return;started = true;
    refresh();
    document.addEventListener('visibilitychange', refresh);
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
    observer.observe(document.body, {attributes:true,attributeFilter:['class','data-st-backdrop','data-st-aurora-motion']});
  }
  function destroy() {
    stopped = true;
    document.removeEventListener('DOMContentLoaded', boot);
    document.removeEventListener('visibilitychange', refresh);
    reduced.removeEventListener('change', refresh);
    touch.removeEventListener('change', refresh);
    observer?.disconnect();
    viewport?.disconnect();
    if (document.body) document.body.dataset.svAuroraState = 'still';
  }
  window.SwiflyAurora = Object.freeze({refresh,destroy});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});else boot();
})();
