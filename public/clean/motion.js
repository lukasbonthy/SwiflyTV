/* v238: native input, scripted navigation, and optional Lenis wheel easing. */
(() => {
  'use strict';
  if (window.SwiflyMotion) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const page = document.scrollingElement || document.documentElement;
  const jobs = new Map(), observed = new WeakSet(), pendingReveal = new Set();
  const heroes = new Map(), dirtyHosts = new Set();
  const wheelDuration = 440, wheelDecay = 6, wheelNormalization = 1 - Math.exp(-wheelDecay);
  let frame = 0, presentationFrame = 0, observer, heroSizes, preferenceObserver;
  let started = false, destroyed = false, preference = '';
  const heroSelector = '.dsHero, .dsWelcomeHero, .svDetailHero';
  const prefersReduced = () => reduced.matches || document.body.classList.contains('reduceMotion');
  const nativePreference = () => document.body.dataset.svScroll === 'native';
  const canAnimate = () => !destroyed && !document.hidden && !prefersReduced() && !nativePreference();
  // Repainting a full-size masked hero image on every wheel tick hurts
  // high-refresh scrolling. Opt-in only, keeping the visual artwork static
  // by default; all other animations and liquid glass remain unchanged.
  const canPresentHeroes = () => canAnimate() && fine.matches && document.body.dataset.svScrollArt === 'on';
  const preferenceKey = () => String(prefersReduced()) + ':' + String(nativePreference()) + ':' + String(document.body.dataset.svScrollArt === 'on');
  const clamp = (value, max) => Math.max(0, Math.min(Math.max(0, max), value));
  const position = element => element === page ? {x:window.scrollX || page.scrollLeft || 0, y:window.scrollY || page.scrollTop || 0} : {x:element.scrollLeft, y:element.scrollTop};
  const bounds = element => ({x:element.scrollWidth - element.clientWidth, y:element.scrollHeight - element.clientHeight});
  function write(element, x, y) {
    if (element === page) window.scrollTo({left:x, top:y, behavior:'instant'});
    else element.scrollTo({left:x, top:y, behavior:'instant'});
  }
  function stop(element) {
    if (!element || element === page) window.SwiflyPremiumScroll?.cancel();
    if (element) {jobs.delete(element); element.classList.remove('svMotionAnimating');}
    else {for (const host of jobs.keys()) host.classList.remove('svMotionAnimating'); jobs.clear();}
    if (!jobs.size) {cancelAnimationFrame(frame); frame = 0;}
  }
  function step(time) {
    frame = 0;
    if (!canAnimate()) {stop(); return;}
    const updates = [];
    for (const [element, job] of jobs) {
      if (!element.isConnected) {stop(element); continue;}
      const max = bounds(element), current = position(element);
      if (Math.abs(current.x - job.writtenX) > 3 || Math.abs(current.y - job.writtenY) > 3) {stop(element); continue;}
      job.x = clamp(job.x, max.x); job.y = clamp(job.y, max.y);
      // A damped glide retains its weight while a finite duration and subpixel
      // finish prevent a lingering animation loop on rounded scroll positions.
      if (job.started === null) job.started = time - 16;
      const progress = Math.min(1, Math.max(0, (time - job.started) / wheelDuration));
      const eased = (1 - Math.exp(-wheelDecay * progress)) / wheelNormalization;
      const x = clamp(job.fromX + (job.x - job.fromX) * eased, max.x);
      const y = clamp(job.fromY + (job.y - job.fromY) * eased, max.y);
      const finished = progress === 1 || Math.abs(job.x - x) < .5 && Math.abs(job.y - y) < .5;
      updates.push({element, job, x:finished ? job.x : x, y:finished ? job.y : y, finished});
    }
    // Finish all geometry reads before any host receives a scroll write.
    for (const {element, job, x, y, finished} of updates) {
      write(element, x, y); job.writtenX = x; job.writtenY = y;
      if (finished) {jobs.delete(element); element.classList.remove('svMotionAnimating');}
    }
    if (jobs.size) frame = requestAnimationFrame(step);
  }
  function scrollTo(element, options = {}) {
    element = element || page;
    if (element === page) window.SwiflyPremiumScroll?.cancel();
    if (element === page && document.querySelector('dialog[open]')) {stop(page); return;}
    const current = position(element), max = bounds(element), job = jobs.get(element);
    const x = clamp(Number.isFinite(options.left) ? options.left : job?.x ?? current.x, max.x);
    const y = clamp(Number.isFinite(options.top) ? options.top : job?.y ?? current.y, max.y);
    if (!canAnimate() || options.behavior === 'instant' || options.behavior === 'auto') {stop(element); write(element, x, y); return;}
    if (x === current.x && y === current.y) {stop(element); return;}
    element.classList.add('svMotionAnimating');
    jobs.set(element, {x, y, fromX:current.x, fromY:current.y, started:null, writtenX:current.x, writtenY:current.y});
    if (!frame) frame = requestAnimationFrame(step);
  }
  function scrollBy(element, options = {}) {
    element = element || page; const job = jobs.get(element), current = position(element);
    scrollTo(element, {left:(job?.x ?? current.x) + (Number(options.left) || 0), top:(job?.y ?? current.y) + (Number(options.top) || 0), behavior:options.behavior});
  }
  // This controller interrupts scripted carousel/navigation motion on input.
  // scroll.js owns optional desktop wheel easing; without that adapter,
  // mouse-wheel and trackpad scrolling remain entirely browser-native.
  function onWheel() {
    if (jobs.size) stop();
  }
  function updateNav(y = position(page).y) {
    const state = y > 48 ? 'true' : 'false';
    if (document.body.dataset.svScrolled !== state) document.body.dataset.svScrolled = state;
  }
  function measureHero(hero, record) {
    const rect = hero.getBoundingClientRect();
    record.top = rect.top + position(record.host).y; record.height = rect.height;
    record.viewport = record.host === page ? window.innerHeight : record.host.clientHeight; record.dirty = false;
  }
  function heroOffset(record, y) {
    if (record.height <= 0 || y >= record.top + record.height || y + record.viewport <= record.top) return null;
    return Math.max(0, Math.min(36, (y - record.top) * .075)).toFixed(2) + 'px';
  }
  function updatePresentation() {
    presentationFrame = 0;
    if (document.hidden || destroyed) {dirtyHosts.clear(); return;}
    const positions = new Map(), updates = [];
    if (canPresentHeroes()) for (const [hero, record] of heroes) {
      if (!hero.isConnected) {heroSizes?.unobserve?.(hero); heroes.delete(hero); continue;}
      if (!dirtyHosts.has(record.host)) continue;
      if (record.dirty) measureHero(hero, record);
      if (!positions.has(record.host)) positions.set(record.host, position(record.host).y);
      const value = heroOffset(record, positions.get(record.host));
      if (value !== null && record.offset !== value) updates.push({hero, record, value});
    }
    for (const {hero, record, value} of updates) {hero.style.setProperty('--sv-hero-offset', value); record.offset = value;}
    dirtyHosts.clear();
  }
  function queuePresentation() {if (canPresentHeroes() && dirtyHosts.size && !presentationFrame) presentationFrame = requestAnimationFrame(updatePresentation);}
  function onScroll(event) {
    if (document.hidden || destroyed) return;
    const target = event.target;
    const host = target === document || target === window || target === page || target === document.body ? page : target;
    // Nested panel and horizontal-rail scroll events cannot change the
    // page navbar; avoid reading geometry for every one of those events.
    if (host !== page && !canPresentHeroes()) return;
    const y = position(host).y;
    if (host === page) updateNav(y);
    if (!canPresentHeroes()) return;
    for (const record of heroes.values()) if (record.host === host) {
      const value = record.dirty ? null : heroOffset(record, y);
      if (record.dirty || value !== null && value !== record.offset) {dirtyHosts.add(host); queuePresentation(); break;}
    }
  }
  function refresh(root = document) {
    if (!root || destroyed) return;
    const registerHero = hero => {
      let record = heroes.get(hero);
      if (!record) {record = {host:hero.closest('.svDetailViewport') || page, dirty:true, offset:null}; heroes.set(hero, record);}
      record.dirty = true;
      if (canPresentHeroes()) {measureHero(hero, record); dirtyHosts.add(record.host); heroSizes?.observe(hero);}
    };
    if (root instanceof Element && root.matches(heroSelector)) registerHero(root);
    root.querySelectorAll?.(heroSelector).forEach(registerHero);
    if (!canAnimate() || !observer) return;
    const reveal = [];
    root.querySelectorAll?.('.dsWelcomeRail, .svDetailSection, [data-cinema-reveal]').forEach(section => {
      if (observed.has(section)) return; observed.add(section);
      if (section.getBoundingClientRect().top < window.innerHeight - 24) return;
      reveal.push(section);
    });
    // Measure every section before adding classes. Reading the next section
    // after a transform write forces one style/layout flush per reveal.
    for (const section of reveal) {
      section.classList.add('svMotionReveal'); pendingReveal.add(section); observer.observe(section);
    }
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
    } else {refresh(); queuePresentation();}
    updateNav();
  }
  function onResize() {
    for (const record of heroes.values()) {record.dirty = true; if (canPresentHeroes()) dirtyHosts.add(record.host);}
    updateNav(); queuePresentation();
  }
  function onKey(event) {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Tab','Escape'].includes(event.key)) stop();
  }
  const onPointer = () => stop();
  function onFineChange() {
    stop(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.clear(); heroSizes?.disconnect();
    for (const [hero, record] of heroes) {hero.style.removeProperty('--sv-hero-offset'); record.offset = null; record.dirty = true;}
    if (canPresentHeroes()) {refresh(); queuePresentation();}
  }
  function onVisibility() {
    if (document.hidden) {stop(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; dirtyHosts.clear(); heroSizes?.disconnect();}
    else {
      if (canPresentHeroes()) for (const hero of heroes.keys()) heroSizes?.observe(hero);
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
    // A large catalog adds movie posters, player nodes and SVG optics
    // continually. These mutations must not invalidate the cached overflow
    // styles used by every wheel gesture. Watch only actual body preferences.
    preferenceObserver = new MutationObserver(changes => {
      if (!changes.some(change => change.target === document.body)) return;
      if (preference !== preferenceKey()) onPreference();
    });
    preferenceObserver.observe(document.body, {attributes:true, attributeFilter:['class','style','data-sv-scroll','data-sv-scroll-art']});
    document.addEventListener('wheel', onWheel, {passive:true});
    document.addEventListener('scroll', onScroll, {passive:true,capture:true});
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('touchstart', onPointer, {passive:true,capture:true});
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize, {passive:true});
    reduced.addEventListener('change', onPreference); fine.addEventListener('change', onFineChange);
    refresh(); cancelAnimationFrame(presentationFrame); presentationFrame = 0; updateNav(); updatePresentation();
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
