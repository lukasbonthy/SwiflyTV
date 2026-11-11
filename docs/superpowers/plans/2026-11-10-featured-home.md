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
- [ ] Verify phone-width rendering and ship this fix with the featured update.

### Task 2: Featured data and controller

- [x] Add failing server/controller tests for five unique movies, safe JSON, persistent actions and stale preparation.
- [x] Render safe Home-only data/controls and load the controller after existing helpers.
- [x] Implement two-slot transform motion, prepared glow crossfade, pause/navigation/lifecycle handling.
- [x] Add browser checks for matching artwork/glow, stable geometry, fewer active mobile filters and original/React compatibility.

### Task 3: Verify and publish

- [ ] Run focused/full tests, syntax and production build.
- [ ] Review phone/tablet/desktop transitions and obtain independent code review.
- [ ] Publish to the existing GitHub/Render service; verify live assets, health and CI.
