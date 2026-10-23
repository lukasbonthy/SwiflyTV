# Feature Effects Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in order.

**Goal:** Give SwiflyTV's new features a cohesive cinematic finish with responsive effects and a clearer notification inbox.

**Architecture:** Reuse existing server markup, authenticated connect client and discovery clients. Revise their existing CSS; put reusable scoped entrance and interaction effects in one shared stylesheet loaded after feature styles.

**Tech Stack:** Express, plain JavaScript, CSS, Node test runner, JSDOM, Chromium.

**Spec:** `docs/superpowers/specs/2026-10-23-feature-effects.md`

## Global Constraints

- Keep the existing shell, navigation glass, playback, source selection, and authenticated APIs.
- No new runtime dependencies or frame-by-frame JavaScript effects.
- Keep private content isolated; user text uses textContent and links remain local.
- Support 320px phones, desktop, reduced motion, and existing TV/performance settings.

## Review Focus

- A live notification refresh must preserve the active filter and keyboard focus.
- Mark all read must update both unread filters and the navigation count.
- Long notification text must wrap without hiding timestamps or actions.
- Mobile conversations must retain their draft and visible composer.
- Reduced-motion and TV users must get stable, fully visible content.

### Task 1: Notification inbox

**Files:** `ui/connect.js`, `public/connect/connect.js`, `tests/connect-ui.test.cjs`.
**Interfaces:** Existing `/bootstrap`, `/notifications/read`; new `data-notification-filter` and `data-notification-unread` hooks.

- [x] Add a behavior test for All/Unread selection, refresh, mark-read state and safe text/links; run and observe failure.
- [x] Add semantic header, filter buttons, notification type/content/time layout and derived counts using existing API results.
- [x] Run `node --test tests/connect-ui.test.cjs tests/connect-api.test.cjs` and verify passing.

### Task 2: Visual system and motion

**Files:** `public/connect/connect.css`, `public/discovery/discovery.css`, new `public/connect/feature-effects.css`, `ui/discovery.js`, `server.js`.
**Interfaces:** Existing feature classes, notification hooks from Task 1, existing reduced-motion/TV data attributes.

- [x] Restyle the actual panels and empty states; build a compact branded notification panel and coherent message/share cards.
- [x] Add scoped, short CSS entrances, glints, focus treatments and hover lifts; disable spatial motion for reduced motion and TV/performance modes.
- [x] Update asset versions; inspect real rendered pages at all four viewport sizes, with live data and signed-out states.
- [x] Run syntax checks and the full suite, plus Chromium connected-cinema/TV coverage. Review final diff and publish through the existing GitHub workflow.

### Task 3: Site-wide loading

**Files:** new `ui/loading.js`, `public/clean/loading.css`, `tests/site-loading.test.cjs`; modify `server.js`, `package.json` and browser navigation coverage.
**Interfaces:** `loadingHead(): string` installs critical CSS and lifecycle handlers; `loadingMarkup(): string` renders inert decorative skeletons and an accessible loading status. The root's `data-sv-loading` is pending/navigate/initial only during real loading.

- [x] Write lifecycle tests for native versus canceled actions, history restoration and timeout release; observe failing tests.
- [x] Reproduce the observed reference with pulsing placeholders and a slim progress bar, preserving the existing nav; load all pages through the shared shell.
- [x] Verify a deliberately slowed real navigation, initial ready, new-tab/download exclusions, reduced motion, and cancellation; capture the actual loading screen and final feature screens.
- [x] Run the full suite with bounded browser concurrency, check syntax and review all changes before release.

## Verification record

Follow-up: reproduce feature-page aurora suppression and unchanged hover shadows in Chromium; remove the conflicting display rule; strengthen shared CSS illumination, sweeps, depth and icon reactions; verify feature aurora, hover/focus, reduced motion, layouts and existing loading behavior; review and publish through the existing PR workflow.

Follow-up verification: both new browser regressions failed before the fix and pass afterward. The selected aurora is visible and moves on all three feature pages, while TV/low modes remain still and backdrop off remains hidden. Real desktop hover changes lighting and geometry; keyboard focus matches it; both operating-system and saved reduced motion stop spatial effects. Review caught and fixed the navigation bell's missing easing variable. Syntax checks pass. Desktop and mobile screenshots were inspected.

Notification and loading lifecycle tests pass. Real Chromium navigation, feature layouts, native-history behavior and Xbox checks pass (20 passed, 3 model-dependent skips). Review findings fixed: trusted click cancellation uses a new task; live notification links retain keyboard focus; progress does no idle animation; TV, Xbox, saved reduced motion and low-performance modes suppress loader animation. Full-suite results are recorded in the PR; the two existing player-layout failures reproduce on pristine origin/main.
