/* ShuttleTV's Lenis curve and momentum, with native nested input. */
(() => {
  'use strict';
  if (window.SwiflyPremiumScroll) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const native = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),video,audio,media-player,[data-player-root],.vds-controls,.vds-slider,[data-native-scroll],#controlPanel,.genreDropdownMenu,.dsProfileDropdown';
  const horizontalRails = '.movieRail,.dsRail,.nfRail,.nfTopTenRail,.svResumeRail,.dsWelcomeRailTrack,.svDetailCastRail';
  let engine, frame = 0, lastFrame = null, clock = 1, preferences, started = false, destroyed = false;
  const available = () => !destroyed && !document.hidden && fine.matches && !reduced.matches &&
    !document.body.classList.contains('reduceMotion') && document.body.dataset.svScroll !== 'native' &&
    !/^\/(?:watch|embed)(?:\/|$)/.test(location.pathname) && typeof window.Lenis === 'function';

  function cancel() {
    cancelAnimationFrame(frame); frame = 0; lastFrame = null;
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
    clock += Math.max(0, time - (lastFrame ?? time));
    lastFrame = time;
    engine.raf(clock);
    if (engine.isScrolling === 'smooth') frame = requestAnimationFrame(step);
    else lastFrame = null;
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
      lerp:.1, wheelMultiplier:1, smoothWheel:true, syncTouch:false,
      allowNestedScroll:true, autoRaf:false, virtualScroll:accept
    });
    clock = 1; engine.raf(clock);
    engine.on('virtual-scroll', wake);
    // Register after this instance's own wheel listener, including after
    // preferences recreate it, so this observes the final input decision.
    window.addEventListener('wheel', keepNative, {passive:true});
  }
  function boot() {
    if (started || destroyed) return; started = true;
    sync();
    preferences = new MutationObserver(sync);
    preferences.observe(document.body, {attributes:true, attributeFilter:['class','data-sv-scroll']});
    reduced.addEventListener('change', sync); fine.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', dispose); window.addEventListener('pageshow', sync);
  }
  window.SwiflyPremiumScroll = Object.freeze({cancel, refresh() {engine?.resize();}, destroy() {
    if (destroyed) return; destroyed = true; dispose();
    preferences?.disconnect();
    document.removeEventListener('DOMContentLoaded', boot);
    reduced.removeEventListener('change', sync); fine.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', dispose); window.removeEventListener('pageshow', sync);
  }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
