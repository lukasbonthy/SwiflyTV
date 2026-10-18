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
        sessionStorage.getItem('swiflytv.intro.v2') ||
        performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward') return;
    const root = document.documentElement;
    const boot = {deadline:performance.now() + 3500};
    root.dataset.svIntro = 'pending';
    boot.timer = setTimeout(() => {
      delete root.dataset.svIntro;
      document.querySelector('[data-sv-intro-root]')?.remove();
      try {sessionStorage.setItem('swiflytv.intro.v2', '1');} catch (_) {}
      delete window.__swiflyIntroBoot;
    }, 3500);
    window.__swiflyIntroBoot = boot;
  } catch (_) { /* Storage restrictions should never delay entry. */ }
}

function introHead() {
  return `<script data-sv-intro-gate>(${introGate.toString()})();</script>
  <link rel="stylesheet" href="/assets/clean/intro.css?v=2" />
  <script defer src="/assets/clean/intro.js?v=2"></script>`;
}

function introMarkup() {
  const symbol = 'M128 25H65C39 25 23 40 23 62c0 19 12 30 37 37l32 9c9 3 13 7 13 13 0 8-7 13-19 13H31l-8 24h65c30 0 49-16 49-40 0-20-13-32-38-39l-31-9c-10-3-15-6-15-12 0-7 6-11 16-11h51z';
  return `<section class="svIntro" data-sv-intro-root hidden role="dialog" aria-modal="true" aria-label="Welcome to SwiflyTV">
    <div class="svIntroCurtain svIntroCurtainTop" aria-hidden="true"></div>
    <div class="svIntroCurtain svIntroCurtainBottom" aria-hidden="true"></div>
    <div class="svIntroStage" aria-hidden="true">
      <div class="svIntroAtmosphere"></div>
      <div class="svIntroRays">${Array.from({length:5}, (_, index) => `<i class="svIntroRay" style="--ray:${index}"></i>`).join('')}</div>
      <div class="svIntroHorizon"></div>
      <div class="svIntroIdentity">
        <div class="svIntroMark">
          <svg viewBox="0 0 164 188" xmlns="http://www.w3.org/2000/svg" focusable="false">
            <defs>
              <path id="svIntroSymbol" d="${symbol}" />
              <linearGradient id="svIntroMetal" x1=".1" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox">
                <stop stop-color="#d5d5ff"/><stop offset=".2" stop-color="#f8fcff"/><stop offset=".44" stop-color="#b2c6ef"/><stop offset=".51" stop-color="#6e79b0"/><stop offset=".74" stop-color="#cad9ff"/><stop offset="1" stop-color="#7c82d0"/>
              </linearGradient>
              <linearGradient id="svIntroRim" x2=".7" y2="1"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".47" stop-color="#dbe4ff" stop-opacity=".1"/><stop offset="1" stop-color="#b2acff" stop-opacity=".8"/></linearGradient>
              <linearGradient id="svIntroShine"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".46" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset=".6" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
              <clipPath id="svIntroClip"><use href="#svIntroSymbol"/></clipPath>
            </defs>
            <use href="#svIntroSymbol" transform="translate(4 5)" fill="#454879"/>
            <use href="#svIntroSymbol" fill="url(#svIntroMetal)" stroke="url(#svIntroRim)" stroke-width="1.2"/>
            <path d="M123 27H66C42 27 26 41 26 61M33 136h53c13 0 21-5 22-14" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width=".8"/>
            <g clip-path="url(#svIntroClip)"><rect class="svIntroShine" x="-140" y="-30" width="110" height="260" fill="url(#svIntroShine)"/></g>
          </svg>
        </div>
        <div class="svIntroWordmark">${[...'SWIFLYTV'].map((letter, index) => `<span class="svIntroLetterClip${index > 5 ? ' svIntroTV' : ''}"><span style="--sv-intro-order:${index}">${letter}</span></span>`).join('')}</div>
        <div class="svIntroRule"></div>
        <p class="svIntroTagline">Good stories. Great nights.</p>
      </div>
    </div>
    <button class="svIntroSkip" data-sv-intro-skip type="button">Skip intro <span aria-hidden="true">↗</span></button>
  </section>`;
}

module.exports = {introHead, introMarkup};
