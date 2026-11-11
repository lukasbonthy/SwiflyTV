# Featured controls implementation plan

Spec: ../specs/2026-11-11-featured-controls.md
Base: c81e0e2a2aa149d70862deae67da3af3641ad91c

## Task 1: Refine and verify Home's featured presentation

1. Extend the controller fixture with real progress fill nodes and animation cancellation observation. Add a failing test proving eight-second finite progress shares the dwell lifecycle and is not restarted by unrelated state notifications.
   Expected: the new behavior test fails before implementation.
2. Add a footer around progress and pause controls, SVG edge chevrons, and inert track/fill markup in server.js. Bump featured.js to v4.
3. Tie one progress animation to the existing dwell timer. Prepare optional incoming logos with a bounded decode; maintain all stale-selection, failed-art and lifecycle guards.
4. Replace Home-only featured.css geometry with edge arrows, responsive long tracks, natural copy height, stable bottom actions and a softer vertical artwork fade. Keep TV and Studio geometry exceptions.
5. Extend existing Chromium tests for desktop/mobile alignment, visible 44px targets, progress lifecycle, anchored actions and stable catalog rows; maintain reduced-motion navigation and prepared-glow checks.
6. Run focused tests, npm run check, npm run build, and the full Node suite. Inspect the managed preview at desktop and phone widths. Expected: all available local tests and the build pass; phone/desktop controls fit without overflow.
7. Request one fresh-context whole-change review. Fix important findings with regression coverage. Publish a feature branch, wait for full Chromium CI, fast-forward main and verify Render's automatic deployment and exact public assets.

Global constraints: no changes to playback/providers/auth, no original-backup mutations, no physical-device FPS claims, no new permission gate (GitHub/Render updates are already authorized).

Review focus: repeated observer notifications, animation/timer ownership, stale preparations, logo timing, reduced motion, mobile arrow hiding, compact/banner/footer overlap, TV focus/guide clearance, real action-node identity, and CSS cascade interactions with existing important rules.
