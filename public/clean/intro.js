/* A finite first-visit sequence. CSS owns its motion; nothing ticks afterward. */
(() => {
  'use strict';
  const page = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let intro, skip, previousFocus, timer, preferenceObserver, finished = false;
  const siblings = [];

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(window.__swiflyIntroBoot?.timer);
    delete window.__swiflyIntroBoot;
    delete page.dataset.svIntro;
    preferenceObserver?.disconnect();
    reduced.removeEventListener('change', onPreference);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('wheel', finish, true);
    document.removeEventListener('touchstart', finish, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', finish);
    window.removeEventListener('pageshow', onPageShow);
    for (const {node, inert} of siblings) if (!inert) node.removeAttribute('inert');
    const restoreFocus = intro?.contains(document.activeElement);
    (intro || document.querySelector('[data-sv-intro-root]'))?.remove();
    if (restoreFocus && previousFocus?.isConnected && previousFocus !== document.body) {
      previousFocus.focus({preventScroll:true});
    }
  }
  function onPreference() {if (reduced.matches || document.body.classList.contains('reduceMotion')) finish();}
  function onVisibility() {if (document.hidden) finish();}
  function onPageShow(event) {if (event.persisted) finish();}
  function onKey(event) {
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation(); skip.focus({preventScroll:true});
    } else if (['Escape','Backspace','Enter',' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); finish();
    } else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key)) {
      event.stopPropagation(); finish();
    }
  }
  function start() {
    intro = document.querySelector('[data-sv-intro-root]');
    if (!intro || page.dataset.svIntro !== 'pending' || reduced.matches ||
        document.body.classList.contains('reduceMotion') || document.hidden) {finish(); return;}
    try {sessionStorage.setItem('swiflytv.intro.v1', '1');} catch (_) {finish(); return;}
    skip = intro.querySelector('[data-sv-intro-skip]');
    previousFocus = document.activeElement;
    for (const node of document.body.children) {
      if (node === intro || /^(SCRIPT|STYLE|LINK)$/.test(node.tagName)) continue;
      siblings.push({node, inert:node.hasAttribute('inert')});
      node.setAttribute('inert', '');
    }
    intro.hidden = false;
    page.dataset.svIntro = 'running';
    skip.addEventListener('click', finish, {once:true});
    intro.addEventListener('animationend', event => {
      if (event.animationName === 'svIntroOpenBottom' && event.target.classList.contains('svIntroCurtainBottom')) finish();
    });
    // Window capture precedes the site's parser-installed TV key handler.
    // Escape must skip this sheet before any background navigation reacts.
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('wheel', finish, {capture:true, passive:true});
    document.addEventListener('touchstart', finish, {capture:true, passive:true});
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', finish);
    window.addEventListener('pageshow', onPageShow);
    reduced.addEventListener('change', onPreference);
    preferenceObserver = new MutationObserver(onPreference);
    preferenceObserver.observe(document.body, {attributes:true, attributeFilter:['class']});
    const remaining = (window.__swiflyIntroBoot?.deadline ?? performance.now() + 2600) - performance.now();
    clearTimeout(window.__swiflyIntroBoot?.timer);
    timer = setTimeout(finish, Math.max(0, Math.min(2600, remaining)));
    skip.focus({preventScroll:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
