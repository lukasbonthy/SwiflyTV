# Catalog Polish Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks inline, with a whole-branch review at the end.

**Goal:** Make catalog loading stable and scrolling lighter while preserving SwiflyTV's identity and existing features.

**Architecture:** Repair current controllers and styles. Prebuild a fixed set of in-memory, content-addressed stylesheet bundles at server startup; retain route-specific styles and original cascade order.

**Tech Stack:** Node 20+, Express, vanilla JavaScript/CSS, node:test, jsdom.

**Spec:** docs/superpowers/specs/2026-11-01-catalog-polish-design.md

## Global Constraints

- No added dependencies or change to providers, playback, accounts or persistent settings.
- Preserve glass, aurora, Studio preferences, accessibility, and all destinations.
- Publish a reviewable branch/PR; do not merge or deploy in this pass.

## Review Focus

- CSS relative URLs, external stylesheet order, and cold bundle requests must work.
- Slow scripts must not hide already rendered content; explicit feature holds must still work.
- Empty/error feeds must not show large dead home rows or reveal stale profile data.
- Short repeated slow glides must trigger fallback at rest; healthy scrolling remains eased.
- Keyboard focus, mobile, reduced motion and custom Studio home ordering must keep working.

### Task 1: Stable load and stylesheet delivery

Files: lib/shell-styles.js, server.js, ui/loading.js, public/clean/loading.css, tests/shell-styles.test.cjs, tests/site-loading.test.cjs.
Interfaces: shellStyleLink(name) returns a hashed stylesheet link; serveShellStyle(req,res,next) serves only prebuilt bundles. SwiflySiteLoading.hold remains unchanged.

- [x] Test cold bundle serving, CSS order/relative URLs, and ready markup during slow scripts; observe failures.
- [x] Build fixed bundles in source order and integrate them into pageShell. Show initial overlays only for explicit holds; use a nonblocking navigation progress state.
- [x] Run shell/loading tests and adjust existing asset assertions to inspect the real delivered CSS.
- [x] Include the verified change in the final catalog-polish commit.

### Task 2: Catalog clarity

Files: ui/feed.js, public/clean/feed.js, public/clean/feed.css, public/clean/clean.css, public/clean/performance.css, public/liquid-glass/surfaces.js, tests/catalog-polish.test.cjs.
Interfaces: existing feed data attributes/events and Studio ownership remain authoritative.

- [x] Reproduce empty home sections and nested navbar optics in behavioral tests.
- [x] Keep empty home feeds hidden until useful content is ready; share the navbar glass; remove inherited row masks and delayed hero-copy animation in their owning styles.
- [x] Run feed, optics and catalog checks; inspect the rendered page.
- [x] Include the verified change in the final catalog-polish commit.

### Task 3: Sustained scroll recovery and review

Files: public/clean/scroll.js, tests/scroll-adaptive-performance.test.cjs.
Interfaces: existing SwiflyPremiumScroll API remains unchanged.

- [x] Add a regression for repeated short slow glides and healthy intervening motion; observe failure.
- [x] Keep a bounded rolling frame sample across gestures and switch to native only at rest after sustained poor performance.
- [x] Run focused checks and the full available suite, then inspect desktop and narrow layouts in the browser.
- [x] Review the complete diff, address material findings, commit and open a PR with verification limits.

## Verification and review

Changes passed an independent read-only review after fixes for stale asset URLs during rolling deploys, Studio loader branding, focus restoration with custom home ordering, and transient slow-frame recovery. Browser QA confirmed desktop rows, a 390px responsive frame, and minimal/artwork/aurora navigation states. See `docs/evidence/catalog-polish/README.md` for evidence and environment limits. The tasks are packaged together because CSS delivery, runtime references and integration assertions form one shared-shell change.
