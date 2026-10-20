/* ShuttleTV's Lenis curve and momentum, with native nested input. */
(() => {
  'use strict';
  if (window.SwiflyPremiumScroll) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const native = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),video,audio,media-player,[data-player-root],.vds-controls,.vds-slider,[data-native-scroll],#controlPanel,.genreDropdownMenu,.dsProfileDropdown';
  const horizontalRails = '.movieRail,.dsRail,.nfRail,.nfTopTenRail,.svResumeRail,.dsWelcomeRailTrack,.svDetailCastRail';
  // A stationary pointer can cross many posters while Lenis moves the page.
  // Don't treat that as deliberate hover: each card would spin up three SVG
  // refraction graphs, paint a large shadow and queue a metadata prefetch.
  // This is independent of Lenis, so trackpads and native wheel scrolling
  // benefit too. The dataset changes only at the beginning/end of a gesture,
  // never once per animation frame.
  const hoverDesktop = window.matchMedia('(hover: hover) and (pointer: fine)');
  let cardIdleTimer = 0, cardScrollActive = false;
  function clearCardScroll() {
    clearTimeout(cardIdleTimer); cardIdleTimer = 0;
    if (!cardScrollActive) return;
    cardScrollActive = false;
    delete document.documentElement.dataset.svCardScrolling;
    document.dispatchEvent(new Event('swifly:card-scroll-end'));
  }
  function markCardScroll(event) {
    if (!hoverDesktop.matches || document.hidden ||
        document.documentElement.dataset.svTv === 'true' ||
        document.documentElement.dataset.svXbox === 'true') return;
    // Nested carousels, casts and dialogs have their own scroll surfaces.
    if (event.type === 'scroll' && event.target !== document &&
        event.target !== document.scrollingElement && event.target !== document.documentElement &&
        event.target !== document.body) return;
    if (event.type === 'wheel' && event.target instanceof Element) {
      if (event.target.closest('dialog[open],[data-player-root]')) return;
      if ((Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) &&
          event.target.closest(horizontalRails)) return;
    }
    if (!cardScrollActive) {
      cardScrollActive = true;
      document.documentElement.dataset.svCardScrolling = 'true';
      document.dispatchEvent(new Event('swifly:card-scroll-start'));
    }
    clearTimeout(cardIdleTimer);
    cardIdleTimer = setTimeout(clearCardScroll, 170);
  }
  let engine, frame = 0, lastFrame = null, clock = 1, preferences, started = false, destroyed = false;
  // Preserve premium Lenis easing on machines that can paint it. If actual
  // animation frames repeatedly miss the budget, stop scripting page scroll
  // for this document and let the browser's compositor handle it natively.
  // One delayed frame (tab suspension/GC) must not disable the experience.
  let performanceFallback = false, pendingFallback = false;
  const recentFrames = [];
  let activeMotionMs = 0;
  const available = () => !destroyed && !performanceFallback && !document.hidden && fine.matches && !reduced.matches &&
    !document.body.classList.contains('reduceMotion') && document.body.dataset.svScroll !== 'native' &&
    !/^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) && document.documentElement.dataset.svTv !== 'true' &&
    document.documentElement.dataset.svXbox !== 'true' && typeof window.Lenis === 'function';

  function cancel() {
    cancelAnimationFrame(frame); frame = 0; lastFrame = null;
    recentFrames.length = 0; activeMotionMs = 0;
    if (engine?.isScrolling === 'smooth') {
      // Reset to the actual position without finishing an obsolete target.
      // start() immediately restores ordinary native input and the next glide.
      engine.stop(); engine.start();
    }
  }
  function dispose() {
    window.removeEventListener('wheel', keepNative);
    cancel(); engine?.destroy(); engine = null;
  }
  function step(time) {
    frame = 0;
    if (!available()) {dispose(); return;}
    if (!engine) return;
    // Advance only while moving. An active-time clock prevents a long idle
    // from turning the first frame of the next gesture into an instant jump.
    const elapsed = Math.max(0, time - (lastFrame ?? time));
    clock += elapsed;
    lastFrame = time;
    engine.raf(clock);
    if (engine.isScrolling === 'smooth') {
      activeMotionMs += elapsed;
      // 4+ slow frames of the last 10 is sustained jank, not occasional work.
      // No extra RAF/polling/observer: sample the frames Lenis already owns.
      if (elapsed > 0 && elapsed < 250) {
        recentFrames.push(elapsed > 36);
        if (recentFrames.length > 10) recentFrames.shift();
      }
      if (activeMotionMs >= 3200 && recentFrames.length === 10 && recentFrames.filter(Boolean).length >= 4) {
        // Abruptly tearing down Lenis during a wheel gesture itself looks like
        // dropped frames. Wait until the current glide finishes, then let the
        // browser handle subsequent gestures natively on slow hardware.
        pendingFallback = true;
      }
      frame = requestAnimationFrame(step);
    } else {
      if (pendingFallback) {
        performanceFallback = true; pendingFallback = false;
        dispose();
        return;
      }
      lastFrame = null; recentFrames.length = 0; activeMotionMs = 0;
    }
  }
  function wake() {
    if (!frame && available()) {
      // Start at the gesture's actual time. Assuming a 60 Hz first frame
      // produces a visible kick on 144/240 Hz displays after every idle.
      lastFrame = performance.now();
      frame = requestAnimationFrame(step);
    }
  }
  function keepNative(event) {
    // Lenis leaves nested scrolling alone. If it did not consume this
    // gesture, stop the earlier page glide before the native panel moves.
    if (!event.defaultPrevented) cancel();
  }
  function accept({event, deltaX, deltaY}) {
    const target = event.target instanceof Element ? event.target : null;
    if (event.type !== 'wheel' || !available() || !event.cancelable || event.defaultPrevented ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        deltaY === 0 || !target || target.closest(native) ||
        Math.abs(deltaX) > Math.abs(deltaY) && target.closest(horizontalRails) ||
        document.querySelector('dialog[open]')) {
      cancel(); return false;
    }
    return true;
  }
  function sync() {
    if (!available()) {dispose(); return;}
    if (engine) return;
    // Keep the reference's damping and accumulated wheel destination.
    // Direction changes decelerate that momentum instead of discarding it.
    engine = new window.Lenis({
      // Preserve the tested ShuttleTV-style reference curve across refresh rates.
      lerp:.1, wheelMultiplier:1, smoothWheel:true, syncTouch:false,
      allowNestedScroll:true, autoRaf:false, virtualScroll:accept
    });
    clock = 1; engine.raf(clock);
    engine.on('virtual-scroll', wake);
    // Register after this instance's own wheel listener, including after
    // preferences recreate it, so this observes the final input decision.
    window.addEventListener('wheel', keepNative, {passive:true});
  }
  function onPageHide() {clearCardScroll(); dispose();}
  function boot() {
    if (started || destroyed) return; started = true;
    sync();
    preferences = new MutationObserver(sync);
    preferences.observe(document.body, {attributes:true, attributeFilter:['class','data-sv-scroll']});
    document.addEventListener('wheel', markCardScroll, {capture:true, passive:true});
    document.addEventListener('scroll', markCardScroll, {capture:true, passive:true});
    hoverDesktop.addEventListener?.('change', clearCardScroll);
    reduced.addEventListener('change', sync); fine.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', sync);
  }
  window.SwiflyPremiumScroll = Object.freeze({cancel, refresh() {engine?.resize();}, destroy() {
    if (destroyed) return; destroyed = true; dispose();
    preferences?.disconnect();
    clearCardScroll();
    document.removeEventListener('wheel', markCardScroll, true);
    document.removeEventListener('scroll', markCardScroll, true);
    hoverDesktop.removeEventListener?.('change', clearCardScroll);
    document.removeEventListener('DOMContentLoaded', boot);
    reduced.removeEventListener('change', sync); fine.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', sync);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
