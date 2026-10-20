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
  let engine, frame = 0, lastFrame = null, clock = 1, wheelRemainder = 0, preferences, started = false, destroyed = false;
  // Refraction is costly while the backdrop is moving. Switch only the CSS
  // paint tier (not the SVG graph/controller lifecycle) during fast scroll.
  // That keeps the existing real lens cached and avoids rebuilding it at rest.
  const glassSpeedThreshold = .115; // CSS pixels / millisecond (~1.8px at 60Hz).
  let glassSoft = false, glassIdleTimer = 0, glassLastInput = 0;
  let glassLastY = 0, glassLastTime = 0, glassSlowSamples = 0;
  const pageY = () => window.scrollY || document.scrollingElement?.scrollTop || 0;
  const glassAllowed = () => !destroyed && !document.hidden &&
    document.documentElement.dataset.svTv !== 'true' &&
    document.documentElement.dataset.svXbox !== 'true' &&
    !/^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) &&
    !['off','subtle'].includes(document.body.dataset.stGlass);
  function glassTier(soft) {
    const next = Boolean(soft && glassAllowed());
    if (next === glassSoft) return;
    glassSoft = next;
    if (next) document.documentElement.dataset.svScrollGlass = 'soft';
    else {
      delete document.documentElement.dataset.svScrollGlass;
      document.dispatchEvent(new Event('swifly:scroll-glass-end'));
    }
  }
  function resetGlass() {
    clearTimeout(glassIdleTimer); glassIdleTimer = 0;
    glassSlowSamples = 0; glassLastTime = 0;
    glassTier(false);
  }
  function glassIdleCheck() {
    glassIdleTimer = 0;
    // Don't return the heavy optical shader while Lenis is still in its
    // high-velocity phase; the already-scheduled Lenis RAF samples it.
    if (engine?.isScrolling === 'smooth') return;
    if (performance.now() - glassLastInput < 145) {
      scheduleGlassIdle(145); return;
    }
    glassTier(false);
  }
  function scheduleGlassIdle(delay = 175) {
    clearTimeout(glassIdleTimer);
    glassIdleTimer = setTimeout(glassIdleCheck, delay);
  }
  function onGlassWheel(event) {
    if (!glassAllowed() || event.ctrlKey || event.metaKey || event.altKey ||
        event.shiftKey || !event.deltaY ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('dialog[open],[data-player-root],.vds-controls,'+native)) return;
    glassLastInput = performance.now();glassSlowSamples=0;
    glassLastY = pageY();glassLastTime = glassLastInput;
    glassTier(true); scheduleGlassIdle();
  }
  function onGlassScroll(event) {
    if (!glassAllowed() || engine?.isScrolling === 'smooth') return;
    if (event.target !== document && event.target !== document.scrollingElement &&
        event.target !== document.documentElement && event.target !== document.body) return;
    const now = performance.now(), y = pageY();
    const delta = Math.abs(y - glassLastY);
    const duration = glassLastTime ? Math.max(1, now - glassLastTime) : 16;
    glassLastY = y;glassLastTime = now;
    if (delta > .8 && delta / duration > glassSpeedThreshold) {
      glassLastInput = now; glassSlowSamples = 0;
      glassTier(true);scheduleGlassIdle();
    } else if (glassSoft && delta > .1 && ++glassSlowSamples >= 2 &&
        now - glassLastInput > 100) {
      // Native touch and trackpad scroll events naturally supply momentum
      // samples. Allow the refraction to return just before motion ceases.
      glassTier(false);
    }
  }
  function sampleLenisGlass(elapsed) {
    const now = performance.now(), y = pageY();
    const speed = Math.abs(y - glassLastY) / Math.max(1, elapsed || 16);
    glassLastY = y;glassLastTime = now;
    if (speed > glassSpeedThreshold) {
      glassSlowSamples = 0; glassTier(true);
    } else if (glassSoft && ++glassSlowSamples >= 3 &&
        now - glassLastInput > 105) {
      // Two to three genuinely slow rendered frames, not an arbitrary
      // full-stop timeout. Rapid successive wheel gestures reset this.
      glassTier(false);
    }
  }
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
    wheelRemainder = 0;
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
    sampleLenisGlass(elapsed);
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
      // Tiny gestures can briefly reach an integer destination between input
      // events. Keep one paint tier until the gesture's idle timer expires,
      // rather than switching every backdrop shader twice per rendered frame.
      if (glassSoft) scheduleGlassIdle();
      lastFrame = null; recentFrames.length = 0; activeMotionMs = 0;
    }
  }
  function wake() {
    if (!frame && available()) {
      glassLastY = pageY();
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
  function accept(input) {
    const {event, deltaX, deltaY} = input;
    const target = event.target instanceof Element ? event.target : null;
    if (event.type !== 'wheel' || !available() || !event.cancelable || event.defaultPrevented ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        deltaY === 0 || !target || target.closest(native) ||
        Math.abs(deltaX) > Math.abs(deltaY) && target.closest(horizontalRails) ||
        document.querySelector('dialog[open]')) {
      cancel(); return false;
    }
    // The pinned engine rounds each destination to an integer. Carry the
    // fractional part across pulses so precision wheels/trackpads and line
    // deltas retain their distance instead of stalling or drifting.
    const distance = deltaY + wheelRemainder;
    const pixels = Math.round(distance);
    wheelRemainder = distance - pixels;
    // A nonzero subpixel sentinel keeps zero-pixel pulses in Lenis's input
    // routing without changing its rounded destination. Let the engine check
    // nested overflow and data-lenis-prevent before it consumes page input.
    input.deltaY = pixels || Math.sign(deltaY) * Number.EPSILON;
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
  function onPageHide() {clearCardScroll(); resetGlass(); dispose();}
  function onVisibilityChanged() {if (document.hidden) resetGlass(); sync();}
  function boot() {
    if (started || destroyed) return; started = true;
    sync();
    preferences = new MutationObserver(sync);
    preferences.observe(document.body, {attributes:true, attributeFilter:['class','data-sv-scroll']});
    document.addEventListener('wheel', markCardScroll, {capture:true, passive:true});
    document.addEventListener('wheel', onGlassWheel, {capture:true, passive:true});
    document.addEventListener('scroll', onGlassScroll, {capture:true, passive:true});
    document.addEventListener('scroll', markCardScroll, {capture:true, passive:true});
    hoverDesktop.addEventListener?.('change', clearCardScroll);
    reduced.addEventListener('change', sync); fine.addEventListener('change', sync);
    document.addEventListener('visibilitychange', onVisibilityChanged);
    window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', sync);
  }
  window.SwiflyPremiumScroll = Object.freeze({cancel, refresh() {engine?.resize();}, destroy() {
    if (destroyed) return; destroyed = true; dispose();
    preferences?.disconnect();
    clearCardScroll(); resetGlass();
    document.removeEventListener('wheel', onGlassWheel, true);
    document.removeEventListener('scroll', onGlassScroll, true);
    document.removeEventListener('wheel', markCardScroll, true);
    document.removeEventListener('scroll', markCardScroll, true);
    hoverDesktop.removeEventListener?.('change', clearCardScroll);
    document.removeEventListener('DOMContentLoaded', boot);
    reduced.removeEventListener('change', sync); fine.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', onVisibilityChanged);
    window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', sync);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
