'use strict';

// Run before render-blocking styles so the first visit never flashes the
// catalog before its curtains. A failed asset always leaves the site usable.
function introGate() {
  try {
    const appearance = JSON.parse(localStorage.getItem('swiflytv.appearance') || 'null');
    const savedReduced = appearance?.values?.reduceMotion === true ||
      (!appearance && localStorage.getItem('movieverse.reduceMotion') === 'on');
    // The shared shell can immediately redirect between public entry and
    // signed-in pages. Present the ident only on the destination document.
    const publicEntry = ['/welcome','/login','/signup'].includes(location.pathname);
    const session = localStorage.getItem('swiflytv.session') || localStorage.getItem('dropstream.session');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        savedReduced || (!session && !publicEntry) || (session && publicEntry) ||
        sessionStorage.getItem('swiflytv.intro.v1') ||
        performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward') return;
    const root = document.documentElement;
    const boot = {deadline:performance.now() + 3500};
    root.dataset.svIntro = 'pending';
    boot.timer = setTimeout(() => {
      delete root.dataset.svIntro;
      document.querySelector('[data-sv-intro-root]')?.remove();
      try {sessionStorage.setItem('swiflytv.intro.v1', '1');} catch (_) {}
      delete window.__swiflyIntroBoot;
    }, 3500);
    window.__swiflyIntroBoot = boot;
  } catch (_) { /* Storage restrictions should never delay entry. */ }
}

function introHead() {
  return `<script data-sv-intro-gate>(${introGate.toString()})();</script>
  <link rel="stylesheet" href="/assets/clean/intro.css?v=1" />
  <script defer src="/assets/clean/intro.js?v=1"></script>`;
}

function introMarkup() {
  return `<section class="svIntro" data-sv-intro-root hidden role="dialog" aria-modal="true" aria-label="Welcome to SwiflyTV">
    <div class="svIntroCurtain svIntroCurtainTop" aria-hidden="true"></div>
    <div class="svIntroCurtain svIntroCurtainBottom" aria-hidden="true"></div>
    <div class="svIntroStage" aria-hidden="true">
      <div class="svIntroAtmosphere"></div>
      <div class="svIntroHorizon"></div>
      <div class="svIntroIdentity">
        <div class="svIntroWordmark">${[...'SWIFLYTV'].map((letter, index) => `<span class="svIntroLetterClip${index > 5 ? ' svIntroTV' : ''}"><span style="--sv-intro-order:${index}">${letter}</span></span>`).join('')}<span class="svIntroSweep"></span></div>
        <div class="svIntroRule"></div>
        <p class="svIntroTagline">Good stories. Great nights.</p>
      </div>
    </div>
    <button class="svIntroSkip" data-sv-intro-skip type="button">Skip intro <span aria-hidden="true">↗</span></button>
  </section>`;
}

module.exports = {introHead, introMarkup};
