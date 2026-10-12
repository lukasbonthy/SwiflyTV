/* v154: light, interruptible wheel inertia; native touch and nested controls. */
(() => {
  'use strict';
  if (window.SwiflyMotion) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const page = document.scrollingElement || document.documentElement;
  const jobs = new Map(), observed = new WeakSet(), pendingReveal = new Set();
  let frame = 0, presentationFrame = 0, previousTime = 0, observer, preferenceObserver, appReduced = false, started = false;
  const rails = '.movieRail, .dsRail, .svResumeRail, .dsWelcomeRailTrack, .svDetailCastRail';
  const native = 'input, textarea, select, [contenteditable="true"], video, audio, media-player, .vds-controls, .vds-slider, [data-native-scroll], #controlPanel, .genreDropdownMenu, .dsProfileDropdown';
  const prefersReduced = () => reduced.matches || document.body.classList.contains('reduceMotion');
  const clamp = (value, max) => Math.max(0, Math.min(Math.max(0, max), value));
  const position = element => element === page ? {x:window.scrollX || page.scrollLeft || 0, y:window.scrollY || page.scrollTop || 0} : {x:element.scrollLeft, y:element.scrollTop};
  const bounds = element => ({x:element.scrollWidth - element.clientWidth, y:element.scrollHeight - element.clientHeight});
  function write(element, x, y) {
    if (element === page) window.scrollTo({left:x, top:y, behavior:'instant'});
    else element.scrollTo({left:x, top:y, behavior:'instant'});
  }
  function stop(element) {
    if (element) {jobs.delete(element); element.classList.remove('svMotionAnimating');}
    else {for (const host of jobs.keys()) host.classList.remove('svMotionAnimating'); jobs.clear();}
    if (!jobs.size) {cancelAnimationFrame(frame); frame = 0; previousTime = 0;}
  }
  function step(time) {
    frame = 0;
    const dt = previousTime ? Math.min(40, Math.max(1, time - previousTime)) : 16;
    previousTime = time; const weight = 1 - Math.exp(-dt / 65);
    for (const [element, job] of jobs) {
      if (!element.isConnected) {stop(element); continue;}
      const max = bounds(element), current = position(element);
      if (Math.abs(current.x - job.writtenX) > 3 || Math.abs(current.y - job.writtenY) > 3) {stop(element); continue;}
      job.x = clamp(job.x, max.x); job.y = clamp(job.y, max.y);
      let x = current.x + (job.x - current.x) * weight, y = current.y + (job.y - current.y) * weight;
      const finished = Math.abs(job.x - x) < .5 && Math.abs(job.y - y) < .5;
      if (finished) {x = job.x; y = job.y;}
      write(element, x, y); const written = position(element); job.writtenX = written.x; job.writtenY = written.y;
      if (finished) {jobs.delete(element); element.classList.remove('svMotionAnimating');}
    }
    if (jobs.size) frame = requestAnimationFrame(step); else previousTime = 0;
  }
  function scrollTo(element, options = {}) {
    element = element || page;
    if (element === page && document.querySelector('dialog[open]')) {stop(page); return;}
    const current = position(element), max = bounds(element), job = jobs.get(element);
    const x = clamp(Number.isFinite(options.left) ? options.left : job?.x ?? current.x, max.x);
    const y = clamp(Number.isFinite(options.top) ? options.top : job?.y ?? current.y, max.y);
    if (prefersReduced() || document.body.dataset.svScroll === 'native' || options.behavior === 'instant' || options.behavior === 'auto') {stop(element); write(element, x, y); return;}
    element.classList.add('svMotionAnimating');
    jobs.set(element, {x, y, writtenX:current.x, writtenY:current.y});
    if (!frame) frame = requestAnimationFrame(step);
  }
  function scrollBy(element, options = {}) {
    element = element || page; const job = jobs.get(element), current = position(element);
    scrollTo(element, {left:(job?.x ?? current.x) + (Number(options.left) || 0), top:(job?.y ?? current.y) + (Number(options.top) || 0), behavior:options.behavior});
  }
  function onWheel(event) {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey || prefersReduced() || document.body.dataset.svScroll === 'native' || !fine.matches || location.pathname.startsWith('/watch/')) {stop(); return;}
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(native)) {stop(); return;}
    const modal = document.querySelector('dialog[open]');
    if (modal && (!modal.classList.contains('svDetailDialog') || !modal.contains(target) || target === modal)) {stop(); return;}
    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const rail = horizontal ? target.closest(rails) : null;
    const host = rail || (modal ? modal.querySelector('.svDetailViewport') : target.closest('.svDetailViewport')) || page;
    if (modal && host === page) return;
    if (horizontal && !rail) return;
    // Chat, menus and other nested scroll panels keep their browser behavior.
    for (let node = target; node && node !== host && node !== document.body && node !== page; node = node.parentElement) {
      const style = getComputedStyle(node), overflow = horizontal ? style.overflowX : style.overflowY;
      const extent = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      if (/auto|scroll|overlay/.test(overflow) && extent > 1) {stop(host); return;}
    }
    const raw = horizontal ? event.deltaX || event.deltaY : event.deltaY;
    if (!raw) return;
    // High resolution trackpad movement already has momentum from the OS.
    if (event.deltaMode === 0 && (Math.abs(raw) < 45 || !Number.isInteger(raw))) {stop(host); return;}
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight * .9 : 1;
    const delta = Math.max(-520, Math.min(520, raw * scale)) * 1.08;
    const max = bounds(host), current = jobs.get(host) || position(host), axis = horizontal ? 'x' : 'y';
    const next = clamp(current[axis] + delta, max[axis]);
    if (next === current[axis]) return;
    event.preventDefault(); scrollBy(host, horizontal ? {left:delta} : {top:delta});
  }
  function updatePresentation() {
    presentationFrame = 0;
    document.body.dataset.svScrolled = window.scrollY > 48 ? 'true' : 'false';
    if (prefersReduced()) return;
    document.querySelectorAll('.dsHero, .dsWelcomeHero, .svDetailHero').forEach(hero => {
      const rect = hero.getBoundingClientRect();
      const offset = rect.height > 0 ? Math.max(0, Math.min(36, -rect.top * .075)) : 0;
      hero.style.setProperty('--sv-hero-offset', offset.toFixed(2) + 'px');
    });
  }
  function onScroll() {if (!presentationFrame) presentationFrame = requestAnimationFrame(updatePresentation);}
  function refresh(root = document) {
    if (prefersReduced() || !observer) return;
    root.querySelectorAll('.svCatalogRow, .svResumeSection, .dsWelcomeRail, .svDetailSection').forEach(section => {
      if (observed.has(section)) return; observed.add(section);
      if (section.getBoundingClientRect().top < window.innerHeight - 24) return;
      section.classList.add('svMotionReveal'); pendingReveal.add(section); observer.observe(section);
    });
  }
  function release(root) {
    if (!root) return;
    for (const section of pendingReveal) if (section === root || root.contains(section)) {
      observer?.unobserve(section); pendingReveal.delete(section);
    }
  }
  function onPreference() {
    stop();
    if (prefersReduced()) {
      document.querySelectorAll('.svMotionReveal').forEach(node => node.classList.add('svMotionVisible'));
      for (const section of pendingReveal) observer?.unobserve(section);
      pendingReveal.clear();
      document.querySelectorAll('[style*="--sv-hero-offset"]').forEach(node => node.style.removeProperty('--sv-hero-offset'));
    }
  }
  function onKey(event) {if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Tab','Escape'].includes(event.key)) stop();}
  const onPointer = () => stop();
  const onVisibility = () => {if (document.hidden) stop();};
  function boot() {
    if (started) return; started = true;
    if (typeof IntersectionObserver === 'function') observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.add('svMotionVisible'); observer.unobserve(entry.target); pendingReveal.delete(entry.target);}
    }, {threshold:.05, rootMargin:'0px 0px -20px 0px'});
    appReduced = document.body.classList.contains('reduceMotion');
    preferenceObserver = new MutationObserver(() => {
      const current = document.body.classList.contains('reduceMotion');
      if (current !== appReduced) {appReduced = current; onPreference();}
    });
    preferenceObserver.observe(document.body, {attributes:true, attributeFilter:['class']});
    document.addEventListener('wheel', onWheel, {passive:false});
    document.addEventListener('scroll', onScroll, {passive:true,capture:true});
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('touchstart', onPointer, {passive:true,capture:true});
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onPreference);
    refresh(); updatePresentation();
  }
  window.SwiflyMotion = Object.freeze({scrollTo,scrollBy,stop,refresh,release,destroy() {
    stop(); cancelAnimationFrame(presentationFrame); observer?.disconnect(); pendingReveal.clear(); preferenceObserver?.disconnect();
    document.removeEventListener('wheel',onWheel); document.removeEventListener('scroll',onScroll,true);
    document.removeEventListener('keydown',onKey,true); document.removeEventListener('pointerdown',onPointer,true);
    document.removeEventListener('touchstart',onPointer,true); document.removeEventListener('visibilitychange',onVisibility);
    reduced.removeEventListener('change',onPreference);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
