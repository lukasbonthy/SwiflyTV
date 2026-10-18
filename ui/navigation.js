'use strict';

// Native document navigation owns history, scroll restoration and timing.
// Register before the first render so an incoming intro can take precedence.
function navigationGate() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function excluded(value) {
    if (!value) return false;
    try {
      const url = new URL(value, location.href);
      return /^\/(?:watch|embed|social|watchrooms)(?:\/|$)/.test(url.pathname) ||
        ['1', 'create'].includes(url.searchParams.get('party')) || url.searchParams.has('roomId');
    } catch (_) {return false;}
  }

  function guard(event) {
    if (!event.viewTransition) return;
    let savedReduced = false;
    try {
      const appearance = JSON.parse(localStorage.getItem('swiflytv.appearance') || 'null');
      savedReduced = appearance?.version === 1 && appearance.values?.reduceMotion === true ||
        (!appearance && localStorage.getItem('movieverse.reduceMotion') === 'on');
    } catch (_) { /* Storage restrictions must not interfere with navigation. */ }
    const activation = event.activation || window.navigation?.activation;
    if (document.documentElement.hasAttribute('data-sv-intro') || reduced.matches || savedReduced ||
        document.body?.classList.contains('reduceMotion') ||
        [location.href, activation?.from?.url, activation?.entry?.url].some(excluded)) {
      event.viewTransition.skipTransition();
    }
  }

  window.addEventListener('pageswap', guard);
  window.addEventListener('pagereveal', guard);
}

function navigationHead() {
  return `<script data-sv-navigation-gate>(${navigationGate.toString()})();</script>`;
}

module.exports = {navigationHead};
