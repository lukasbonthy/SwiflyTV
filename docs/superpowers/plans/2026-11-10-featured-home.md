# Featured Home Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then an independent whole-change review.

**Goal:** Finish mobile motion paint reduction and rotate Home features with synchronized artwork glow.

**Architecture:** Existing server-rendered hero, safe five-slide data, one Home-only controller, two prepared artwork/glow slots, persistent live actions. Existing scroll states own the mobile filter fast path.

**Tech Stack:** Existing Node/Express, React/Vite wrapper, native DOM/WAAPI, CSS and one small cached canvas preparation per artwork.

**Spec:** `docs/react-migration/FEATURED-HOME.md`

## Global Constraints

- Keep premium scrolling, native touch momentum, seven desktop posters, resting glass and original backup.
- Up to five unique movies; 700ms horizontal slide, 1000ms glow fade, 8000ms idle dwell.
- Two rendering slots; prepare 64x36 glow textures before motion; no frame-by-frame canvas, blur or layout.
- Keep real Play/Details/My List nodes and the hero/bridge/rows sibling relationship.

## Review Focus

- Slow/failed artwork and rapid navigation never show the wrong title/art/actions together.
- Resume, watchlist, logo fallback, Studio ordering and original/React controllers remain compatible.
- Autoplay pauses for hidden/offscreen/scroll/dialog/keyboard states; all lifecycle work is bounded.
- Temporary snapshots cannot acquire glass, duplicate IDs, focus or click handlers.
- Mobile filters disappear only during motion and retain fill/edges; reduced motion/transparency/TV remain coherent.

### Task 1: Mobile poster paint

- [x] Add a browser regression for native poster filters during scroll/details/featured motion and restoration.
- [x] Suspend only moving touch/narrow poster blur, retaining its current paint and controls.
- [x] Verify phone-width rendering and ship this fix with the featured update.

### Task 2: Featured data and controller

- [x] Add failing server/controller tests for five unique movies, safe JSON, persistent actions and stale preparation.
- [x] Render safe Home-only data/controls and load the controller after existing helpers.
- [x] Implement two-slot transform motion, prepared glow crossfade, pause/navigation/lifecycle handling.
- [x] Add browser checks for matching artwork/glow, stable geometry, fewer active mobile filters and original/React compatibility.

### Task 3: Verify and publish

- [x] Run focused/full tests, syntax and production build.
- [x] Review phone/desktop transitions, responsive regressions and independent code review.
- [x] Publish to the existing GitHub/Render service; verify live assets, health and CI.

## Completion evidence — 2026-11-11

- Runtime release: `c36454f974defb8f98fd8bebcb2d3b752b98aae2`.
- CI: https://github.com/lukasbonthy/SwiflyTV/actions/runs/43031998989 — syntax, 1,588 general tests, all 232 browser tests, recommendation checks and acceptance passed.
- Render: `dep-dbq771vf3r2c73bcgd8g` is live on SwiflyTV-1; the React entry and all three shell CSS bundles match local SHA-256 values.
- Live finish CSS: `finish-53a41b415954f01941f1.css`; application error logs after rollout were empty.
- Original backup remains `backup/original-before-react-v173-20261110` at `70481c2dcc54f14858094dea8c08cee818be8457`.
- Review addressed image-size compatibility, Xbox sizing, keyboard resume, glow caching, stale completions, inert snapshot filters, failed-art recovery and TV framing. TV spacing assertions compare displayed pixel boundaries to avoid fractional scroll roundoff.
- No motion blur added. Physical-device FPS was not measured.
