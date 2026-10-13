/* v163: weighted, interruptible desktop wheel motion with bounded work. */
(() => {
  'use strict';
  if (window.SwiflyMotion) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const page = document.scrollingElement || document.documentElement;
  const jobs = new Map(), observed = new WeakSet(), pendingReveal = new Set();
  const heroes = new Map(), dirtyHosts = new Set(), overflowCache = new WeakMap();
  let frame = 0, presentationFrame = 0, previousTime = 0, observer, heroSizes, preferenceObserver;
  let started = false, destroyed = false, preference = '', overflowEpoch = 0, nativeWheelUntil = 0;
  const rails = '.movieRail, .dsRail, .svResumeRail, .dsWelcomeRailTrack, .svDetailCastRail';
  const heroSelector = '.dsHero, .dsWelcomeHero, .svDetailHero';
  const native = 'input, textarea, select, [contenteditable="true"], video, audio, media-player, .vds-controls, .vds-slider, [data-native-scroll], #controlPanel, .genreDropdownMenu, .dsProfileDropdown';
  const prefersReduced = () => reduced.matches || document.body.classList.contains('reduceMotion');
  const nativePreference = () => document.body.dataset.svScroll === 'native';
  const canAnimate = () => !destroyed && !document.hidden && !prefersReduced() && !nativePreference();
  const preferenceKey = () => String(prefersReduced()) + ':' + String(nativePreference());
  const clamp = (value, max) => Math.max(0, Math.min(Math.max(0, max), value));
  const position = element => element === page ? {x:window.scrollX || page.scrollLeft || 0, y:window.scrollY || page.scrollTop || 0} : {x:element.scrollLeft, y:element.scrollTop};
  const bounds = element => ({x:element.scrollWidth - element.clientWidth, y:element.scrollHeight - element.clientHeight});
  // A one-pixel floor lets the damped tail settle on rounded scroll positions.
  const advance = (value, target, weight) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), Math.max(1, Math.abs(target - value) * weight));
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
    if (!canAnimate()) {stop(); return;}
    const dt = previousTime ? Math.min(40, Math.max(1, time - previousTime)) : 16;
    previousTime = time;
    const weight = 1 - Math.exp(-dt / 110);
    for (const [element, job] of jobs) {
      if (!element.isConnected) {stop(element); continue;}
      const max = bounds(element), current = position(element);
      if (Math.abs(current.x - job.writtenX) > 3 || Math.abs(current.y - job.writtenY) > 3) {stop(element); continue;}
      job.x = clamp(job.x, max.x); job.y = clamp(job.y, max.y);
      let x = advance(current.x, job.x, weight), y = advance(current.y, job.y, weight);
      const finished = Math.abs(job.x - x) < .5 && Math.abs(job.y - y) < .5;
      if (finished) {x = job.x; y = job.y;}
      write(element, x, y); job.writtenX = x; job.writtenY = y;
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
    if (!canAnimate() || options.behavior === 'instant' || options.behavior === 'auto') {stop(element); write(element, x, y); return;}
    if (x === current.x && y === current.y) {stop(element); return;}
    element.classList.add('svMotionAnimating');
    jobs.set(element, {x, y, writtenX:current.x, writtenY:current.y});
    if (!frame) frame = requestAnimationFrame(step);
  }
  function scrollBy(element, options = {}) {
    element = element || page; const job = jobs.get(element), current = position(element);
    scrollTo(element, {left:(job?.x ?? current.x) + (Number(options.left) || 0), top:(job?.y ?? current.y) + (Number(options.top) || 0), behavior:options.behavior});
  }
  function hasNativeOverflow(node, horizontal) {
    // Most target ancestors cannot scroll: avoid resolving their styles at all.
    const extent = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
    if (extent <= 1) return false;
    const signature = node.getAttribute('class') + ':' + node.getAttribute('style');
    let cached = overflowCache.get(node);
    if (!cached || cached.epoch !== overflowEpoch || cached.signature !== signature) {
      const style = getComputedStyle(node);
      cached = {epoch:overflowEpoch, signature, x:/auto|scroll|overlay/.test(style.overflowX), y:/auto|scroll|overlay/.test(style.overflowY)};
      overflowCache.set(node, cached);
    }
    return horizontal ? cached.x : cached.y;
  }
  function onWheel(event) {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey || !canAnimate() || !fine.matches || location.pathname.startsWith('/watch/')) {stop(); return;}
    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const raw = horizontal ? event.deltaX || event.deltaY : event.deltaY;
    if (!raw) return;
    // Trackpads already receive OS momentum. Recognize them before DOM/style work.
    const now = performance.now();
    if (event.deltaMode === 0 && (Math.abs(raw) < 45 || !Number.isInteger(raw) || now < nativeWheelUntil)) {
      nativeWheelUntil = now + 160; stop(); return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(native)) {stop(); return;}
    const modal = document.querySelector('dialog[open]');
    if (modal && (!modal.classList.contains('svDetailDialog') || !modal.contains(target) || target === modal)) {stop(); return;}
    const rail = horizontal ? target.closest(rails) : null;
    const host = rail || (modal ? modal.querySelector('.svDetailViewport') : target.closest('.svDetailViewport')) || page;
    if ((modal && host === page) || (horizontal && !rail)) return;
    for (let node = target; node && node !== host && node !== document.body && node !== page; node = node.parentElement) {
      if (hasNativeOverflow(node, horizontal)) {stop(host); return;}
    }
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (horizontal ? host.clientWidth : host.clientHeight) * .9 : 1;
    const delta = Math.max(-720, Math.min(720, raw * scale));
    const max = bounds(host), current = position(host), axis = horizontal ? 'x' : 'y', job = jobs.get(host);
    if ((delta < 0 && current[axis] <= 0) || (delta > 0 && current[axis] >= max[axis])) {stop(host); return;}
    let remaining = job ? job[axis] - current[axis] : 0;
    if (remaining * delta < 0) remaining = 0;
    // Preserve normal wheel distances while bounding unconsumed burst momentum.
    const next = clamp(current[axis] + Math.max(-720, Math.min(720, remaining + delta)), max[axis]);
    if (next === current[axis]) return;
    event.preventDefault(); scrollTo(host, horizontal ? {left:next} : {top:next});
  }
  function updateNav() {
    const state = position(page).y > 48 ? 'true' : 'false';
    if (document.body.dataset.svScrolled !== state) document.body.dataset.svScrolled = state;
  }
  function measureHero(hero, record) {
    const rect = hero.getBoundingClientRect();
    record.top = rect.top + position(record.host).y; record.height = rect.height; record.dirty = false;
  }
  function updatePresentation() {
    presentationFrame = 0;
    if (document.hidden || destroyed) {dirtyHosts.clear(); return;}
    if (dirtyHosts.has(page)) updateNav();
    if (canAnimate()) for (const [hero, record] of heroes) {
      if (!hero.isConnected) {heroSizes?.unobserve?.(hero); heroes.delete(hero); continue;}
      if (!dirtyHosts.has(record.host)) continue;
      if (record.dirty) measureHero(hero, record);
      const offset = record.height > 0 ? Math.max(0, Math.min(36, (position(record.host).y - record.top) * .075)) : 0;
      const value = offset.toFixed(2) + 'px';
      if (record.offset !== value) {hero.style.setProperty('--sv-hero-offset', value); record.offset = value;}
    }
    dirtyHosts.clear();
  }
  function queuePresentation() {if (canAnimate() && dirtyHosts.size && !presentationFrame) presentationFrame = requestAnimationFrame(updatePresentation);}
  function onScroll(event) {
    if (document.hidden || destroyed) return;
    const target = event.target;
    const host = target === document || target === window || target === page || target === document.body ? page : target;
    if (host !== page && ![...heroes.values()].some(record => record.host === host)) return;
    if (!canAnimate()) {if (host === page) updateNav(); return;}
    dirtyHosts.add(host); queuePresentation();
  }
  function refresh(root = document) {
    if (!root || destroyed) return;
    const registerHero = hero => {
      let record = heroes.get(hero);
      if (!record) {record = {host:hero.closest('.svDetailViewport') || page, dirty:true, offset:null}; heroes.set(hero, record);}
      record.dirty = true; dirtyHosts.add(record.host);
      if (canAnimate()) {measureHero(hero, record); heroSizes?.observe(hero);}
    };
    if (root instanceof Element && root.matches(heroSelector)) registerHero(root);
    root.querySelectorAll?.(heroSelector).forEach(registerHero);
    if (!canAnimate() || !observer) return;
    root.querySelectorAll?.('.svCatalogRow, .svResumeSection, .dsWelcomeRail, .svDetailSection').forEach(section => {
      if (observed.has(section)) return; observed.add(section);
      if (section.getBoundingClientRect().top < window.innerHeight - 24) return;
      section.classList.add('svMotionReveal'); pendingReveal.add(section); observer.observe(section);
    });
    if (started) queuePresentation();
  }
  function release(root) {
    if (!root) return;
    for (const section of pendingReveal) if (section === root || root.contains(section)) {
      observer?.unobserve(section); pendingReveal.delete(section);
    }
    for (const [hero] of heroes) if (hero === root || root.contains(hero)) {
      heroSizes?.unobserve?.(hero); hero.style.removeProperty('--sv-hero-offset'); heroes.delete(hero);
    }
  }
  function onPreference() {
    preference = preferenceKey(); stop(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.clear();
    if (!canAnimate()) {
      for (const section of pendingReveal) {section.classList.add('svMotionVisible'); observer?.unobserve(section);}
      pendingReveal.clear(); heroSizes?.disconnect();
      for (const [hero, record] of heroes) {hero.style.removeProperty('--sv-hero-offset'); record.offset = null; record.dirty = true;}
    } else {refresh(); dirtyHosts.add(page); queuePresentation();}
  }
  function onResize() {
    overflowEpoch++;
    for (const record of heroes.values()) {record.dirty = true; dirtyHosts.add(record.host);}
    dirtyHosts.add(page); queuePresentation();
  }
  function onKey(event) {if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Tab','Escape'].includes(event.key)) stop();}
  const onPointer = () => stop();
  const onFineChange = () => stop();
  function onVisibility() {
    if (document.hidden) {stop(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.clear(); heroSizes?.disconnect();}
    else {
      if (canAnimate()) for (const hero of heroes.keys()) heroSizes?.observe(hero);
      onResize();
    }
  }
  function boot() {
    if (started || destroyed) return; started = true;
    if (typeof IntersectionObserver === 'function') observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.add('svMotionVisible'); observer.unobserve(entry.target); pendingReveal.delete(entry.target);}
    }, {threshold:.05, rootMargin:'0px 0px -20px 0px'});
    if (typeof ResizeObserver === 'function') heroSizes = new ResizeObserver(entries => {
      for (const entry of entries) {const record = heroes.get(entry.target); if (record) {record.dirty = true; dirtyHosts.add(record.host);}}
      queuePresentation();
    });
    preference = preferenceKey();
    preferenceObserver = new MutationObserver(changes => {
      overflowEpoch++;
      if (changes.some(change => change.target === document.body) && preference !== preferenceKey()) onPreference();
    });
    preferenceObserver.observe(document.body, {attributes:true, attributeFilter:['class','style','data-sv-scroll'], childList:true, subtree:true});
    document.addEventListener('wheel', onWheel, {passive:false});
    document.addEventListener('scroll', onScroll, {passive:true,capture:true});
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('touchstart', onPointer, {passive:true,capture:true});
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize, {passive:true});
    reduced.addEventListener('change', onPreference); fine.addEventListener('change', onFineChange);
    refresh(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.add(page); updatePresentation();
  }
  window.SwiflyMotion = Object.freeze({scrollTo,scrollBy,stop,refresh,release,destroy() {
    if (destroyed) return; destroyed = true;
    stop(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.clear();
    observer?.disconnect(); for (const section of pendingReveal) section.classList.add('svMotionVisible'); pendingReveal.clear();
    heroSizes?.disconnect(); preferenceObserver?.disconnect();
    for (const hero of heroes.keys()) hero.style.removeProperty('--sv-hero-offset'); heroes.clear();
    document.removeEventListener('DOMContentLoaded',boot); document.removeEventListener('wheel',onWheel); document.removeEventListener('scroll',onScroll,true);
    document.removeEventListener('keydown',onKey,true); document.removeEventListener('pointerdown',onPointer,true);
    document.removeEventListener('touchstart',onPointer,true); document.removeEventListener('visibilitychange',onVisibility);
    window.removeEventListener('resize',onResize); reduced.removeEventListener('change',onPreference); fine.removeEventListener('change',onFineChange);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
