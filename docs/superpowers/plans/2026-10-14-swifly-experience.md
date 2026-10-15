# SwiflyTV Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give movies the episode source options and bring all requested screens into one polished cinema experience.

**Architecture:** Extend existing provider selection without changing verification or transport. Upgrade the current page templates and their scoped CSS, sharing a final cinema stylesheet and the existing motion/glass controllers. Split independent work by owned files; root integrates server changes and validates the combined result.

**Tech Stack:** Node/Express, existing vanilla JavaScript/CSS, pinned Playwright, node:test and jsdom.

**Spec:** `docs/superpowers/specs/2026-10-14-swifly-experience.md`

## Global Constraints

- Preserve merged main 6c4449a and native MP4 verified headers.
- Preserve source deadlines, cancellation, public-address checks, and protection handling.
- Preserve room permissions/sync/chat, player bindings and local profile storage.
- No new runtime dependencies or paid infrastructure changes.
- Respect reduced motion and glass preferences; never hide usable content if animation setup fails.
- Scope visual changes to the requested screens; retain existing navigation and discovery branding.

## Review Focus

- A movie must use movie source URLs; TV must retain its selected season and episode.
- Proxy delivery must retain verified headers and partial responses.
- Long names, empty lists and mobile widths must not obscure controls or overflow the viewport.
- Room reconnect/host changes must retain controls and chat after visual updates.
- Reduced motion, keyboard focus and glass-off preferences must remain usable.

## Task 1: Verified movie source parity

**Files:** existing source configuration in `server.js`; relevant provider and handoff tests.

- [x] Inspect direct TV/movie provider configuration and the current Nuvio movie response.
- [x] Verify current movie embed/source URLs through ordinary public provider responses.
- [x] Write and observe a failing regression for missing movie source parity.
- [x] Extend the existing configuration minimally, preserving per-type overrides and deadlines.
- [x] Run focused tests and bounded real movie/episode proxy checks.

## Task 2: Party Hub and watchrooms

**Files:** `ui/party.js`, `ui/watch-party.js`, `public/party/*`, `public/player/watch-party.css` and `watch-party.js`; corresponding tests.

- [x] Upgrade hierarchy, hero art, room/chat layout, glass surfaces and responsive actions.
- [x] Add `svCinemaPage` / `data-cinema-page` to standalone roots and use shared cinema tokens where helpful.
- [x] Keep all IDs/data bindings; verify room creation/join, role changes, synchronization and chat.
- [x] Validate desktop and mobile views and reduced motion.

## Task 3: Movie and episode players

**Files:** `ui/player.js`, `public/player/player.css`, `public/player/player.js`; player and TV tests.

- [x] Upgrade player frame, below-video identity, episode cards, settings and controls.
- [x] Preserve media event handling, buffering recovery, managed rooms and episode URLs.
- [x] Use `svCinemaPage` / `data-cinema-page`, existing glass classes, and bounded entrance/hover motion.
- [x] Verify playback controls, true/false buffering, error recovery and mobile layouts.

## Task 4: Details, account and profiles; shared motion

**Files:** detail/account/profile templates in `server.js`; `public/clean/details.css`; new `public/clean/cinema.css`; existing motion controller as needed.

- [x] Upgrade detail hero/art fade, metadata, cast and episode sections.
- [x] Upgrade account identity/actions and profile selection/management without changing storage.
- [x] Integrate shared cinema tokens, scoped transitions and correct asset cache versions.
- [x] Verify modal navigation, profile selection/creation/edit/removal and long-content layouts.

## Task 5: Integration and delivery

- [x] Review combined changes and run complete tests, syntax and diff checks.
- [x] Run visual QA at 1440, 768, 390 and 320 pixels; check keyboard/reduced-motion/glass-off behavior.
- [x] Obtain one independent whole-branch review, resolve material findings and run the required final checks.
- [ ] Publish a concrete PR through GitHub, merge within the user's authorization after CI, and verify deployment.
- [ ] Verify live movie and Reacher retrieval/proxy delivery and report any codec limitation accurately.

## Verification evidence

- Full combined suite: 574/574 tests passed; syntax and diff checks passed.
- Real movie/episode upstream files returned valid bounded MP4 ranges; source regressions cover paired movie 0/0 metadata and preserved TV coordinates.
- Chromium layout checks used production markup, local styles and actual title artwork at 1440, 768, 390 and 320 pixels. Shell navigation could not run in this container; player control checks used the actual controller in managed mode.
- Profile selection, creation, rename, mode change and deletion were exercised with local storage; reduced motion and glass-off checks passed.
- Independent final review found chapter navigation reopening details and a low-contrast caption. Both were resolved; additional geometry checks fixed ambient overflow and phone menu placement/stacking.
- Browser HEVC support is device-dependent and was not established by these layout checks.
