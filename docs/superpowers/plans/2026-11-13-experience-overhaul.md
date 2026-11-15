# SwiflyTV Experience Overhaul Implementation Plan

> **For agentic workers:** Use focused independent workstreams and native integration. Steps use checkbox syntax. Preserve all existing uncommitted recovered work; no unrelated resets or broad staging.

**Goal:** Complete the requested cinematic, discovery, community, study, listening and kids experience with real behavior and mobile verification.

**Architecture:** Extend the current Express-rendered UI and its React/vanilla controllers. Independent page modules have exclusive ownership; shared server.js wiring is applied by the main integrator only, except the discovery/person/languages route owner.

**Tech Stack:** Node >=20.19, Express, React 19, Vite 7, native CSS/Canvas, Socket.IO, built-in crypto, node:test, Playwright.

**Spec:** docs/superpowers/specs/2026-11-13-experience-overhaul.md

## Global Constraints
- Preserve latest iPad fixes, native scrolling, seven-title windows, existing accounts and playback sources.
- No forced green ripple, no glass/backdrop filters on episodes, no fake community activity, no unplayable audiobook entries.
- Parent password verification and kids route enforcement run on the server. No added paid services.
- Run behavior regressions first for substantive bugs, preserve accessibility and lifecycle cleanup, and inspect actual browser layouts.
- Shared server.js writes are coordinated. Each worker reports exact verification and integration requirements.

## Review Focus
- Protected movie frames, source replacements and fullscreen must not break playback or resize into stale geometry.
- Empty/overlapping catalog results and page two with active filters must stay honest and useful.
- A slow old audiobook search/detail request must not replace a newer selection; a title needs playable audio.
- Kids refresh, general navigation, direct watch/source/API access and profile switching must not bypass the lock.
- Narrow/mobile layouts, keyboard focus, reduced motion and long episode lists must remain usable and lightweight.

### Task 1: Player, clear controls, artwork and episodes
**Files:** public/player/{player.js,player.css,waves.js}, ui/player.js, public/clean/{details.css,details.js,episode-browser.js}, public/liquid-glass/{controls.css,surfaces.js}, related tests.
**Interfaces:** Existing player events and data-player-stage/video hooks; emit geometry resize events for the ripple field, preserve public API.
- [x] Verify recovered v185 work against latest main, run the baseline suite and fix integration issues.
- [x] Reproduce and cover continuous color changes, neutral protected fallback, lower-header coverage and source aspect changes.
- [x] Implement smooth interruptible container resize on source/metadata transitions with contained undistorted video and reduced-motion/fullscreen handling.
- [x] Redesign episodes and remove both CSS blur and dynamic glass registration. Preserve season loading, history, episode links/downloads and sort/view preferences.
- [x] Run player/episode/details tests and browser scenarios; inspect film borders and interaction states.

### Task 2: Varied discovery, real pages, people and languages
**Files:** server.js (exclusive owner during implementation), new focused lib/ui catalog modules as needed, new public/clean/catalog-experience.css/js, associated tests.
**Interfaces:** Existing tmdb, movieCard, dsRail, pagination and pageShell. Register dedicated page assets. Provide explicit integration notes for other workstreams.
- [x] Trace route/query/cache pagination; reproduce next-page repeats and retained-filter failures with realistic catalog fixtures.
- [x] Add canonical type+id row diversity and upstream page propagation. Curate distinct rows, accurately label popular/day/week controls.
- [x] Redesign /person/:id with responsive biography, role/filmography controls and genuine credits; improve /browse-by-languages with meaningful selection and filters.
- [x] Verify route fixtures plus desktop/mobile browser rendering, empty/error states and pager links.

### Task 3: Scenery-first Study
**Files:** ui/study.js, public/study/{study.css,study.js}, study tests only.
**Interfaces:** Keep existing data-study hooks and catalog/socket contracts; new assets only inside public/study.
- [x] Inspect lofistudy.to source and current study browser behavior.
- [x] Rebuild visual hierarchy around scenery, compact tools and useful work panels; preserve real playback, tasks, timers, rooms and accessibility.
- [x] Verify all study tests, phone/iPad/desktop layouts, keyboard and reduced motion; capture screenshots.

### Task 4: Useful Watchroom Community
**Files:** ui/party.js, public/party/{party.js,party.css,lobby.js}, new community module/assets/tests only; no server.js writes.
**Interfaces:** Existing social socket/API permission contracts. Add a server patch file with exact integration notes only if needed.
- [x] Trace channel/group/messaging behavior and identify concrete useless or broken flows.
- [x] Redesign community navigation, conversations, useful discovery and watching-together actions using real data and existing permissions.
- [x] Cover interactions, escaping, no-activity state, live messages, mobile and keyboard. Preserve native watchroom playback/calls.

### Task 5: Playable scenic Audiobooks
**Files:** lib/discovery.js, ui/discovery.js (audiobook markup only), public/discovery/{audiobooks.js,audiobooks.css} and audiobook tests only.
**Interfaces:** GET /api/discovery/books?q=&page= and /books/:id; report extra stylesheet reference for server integration.
- [x] Reproduce normal query failures and entries lacking playable chapters.
- [x] Implement bounded reliable title/author matching, validated audio availability, honest pagination and cancellation-safe UI.
- [x] Redesign scenic shelves/listening stage with real chapters/progress, graceful empty/error states and no silent entries.
- [x] Verify fixtures and real browser search/navigation/audio interactions at desktop/phone/iPad widths.

### Task 6: Protected playful Kids
**Files:** new lib/kids.js, ui/kids.js, public/kids/* and kids tests. Write exact integration guide; main applies server.js changes.
**Interfaces:** Export createKids(options) with middleware, router and render/page helper; use existing signed session identity/account partition if available. Clearly document mount order and dependencies.
- [x] Trace account/session, source and playback routes before implementing enforcement.
- [x] Implement parent password setup/lock/unlock using salted password hashing and timing-safe checks, secure HttpOnly session state, limits and safe reset semantics.
- [x] Implement conservative positive rating checks and route/API guard, then playful child-friendly catalog with useful safe categories.
- [x] Verify correct/incorrect password, refresh/direct route/API access, adult/unrated/horror rejection, safe rated titles, no setup overwrite and mobile layout.

### Task 7: Integrate, review and ship
**Files:** server.js integration, package scripts if needed, docs/SWIFLYTV_STATUS.md and final focused browser tests.
- [x] Apply all integration contracts and version changed assets; build and run syntax/full unit/recommendation/acceptance checks.
- [x] Run actual browser scenarios for changed pages, including iPad, reduced motion and empty/error states; inspect screenshots and iterate polish.
- [x] Obtain a fresh read-only whole-branch review, reproduce/fix meaningful findings with regression tests and run relevant checks again.
- [x] Commit, create a reviewable PR, merge/deploy under existing authorized workflow only after checks pass; verify exact live code/assets and changed behavior.
- [x] Update checkpoint with exact tested/deployed commits, verification and any limitations; deliver a concise accurate result.

## Final release verification

Completed and deployed through PR #164 as `3e2c04663ccca9582dd609fca857d902174f3ec1`, matching the exact tested source tree. Final source and PR checks passed, including 254 featured/wider browser cases and 33 acceptance scenarios (335 assertions). Additional experience checks passed and final responsive screenshots were inspected. Render confirmed the intended revision live; authenticated production checks verified 13 routes, 20 matching assets/bundles, actual audiobook search/chapters and parent-lock enforcement. Physical iPad Safari performance remains outside the measured evidence. See `docs/SWIFLYTV_STATUS.md` for run and deployment identifiers.
