# Living Theme Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the user's falling blossom petals and Halloween webs, with distinct details across the themes.

**Architecture:** A focused theme-details controller owns bounded decorative nodes and subscribes to existing effective Studio settings. A CSS module and original SVG assets supply all visuals and motion; existing Studio config stores a portable Theme details preference.

**Tech Stack:** Existing Node, vanilla JavaScript, CSS, SVG, jsdom and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-living-theme-details-design.md`.

## Global Constraints

- Preserve all existing settings, Advanced controls, app features, portable data and reversible drafts.
- No dependencies, external requests, per-frame JavaScript or unbounded timers.
- At most 14 viewport particles (8 mobile), 5 preview particles and 6 interface ornaments.
- Decorations never accept input or enter accessibility navigation.
- Motion/accessibility/performance/playback preferences override decorative effects.

## Review Focus

- Rapid theme changes and dynamic library/dialog content must not leak nodes or cause observer loops.
- Decoration removal must preserve the original container's position, classes and focus.
- Theme details off, Cancel, import and account switches must not leave old effects behind.
- Real artwork, playback and controls must remain usable under every theme.
- Mobile/TV and reduced-motion paths must remain bounded and honest.

## Task 1: Theme identities, lifecycle and visuals

**Files:** `public/studio/config.js`, `ui/studio.js`, `public/studio/studio.js`, new `public/studio/theme-details.js`, `public/studio/theme-details.css`, native `public/studio/themes/` SVG assets, `public/studio/themes.css`, `server.js`, `package.json`; theme config/controller tests.

**Interfaces:** Existing `SwiflyStudioConfig.applyTheme/effective`, `swifly:studio-change` effective settings, existing raw draft and native dialog lifecycle. New `themeDetails:boolean` preference and `blossom` theme ID. `SwiflyThemeDetails.refresh()` is an idempotent runtime refresh entry point.

- [x] Establish baseline and write meaningful failing config/controller regressions.
- [x] Add validated Blossom and portable themeDetails preference, preserving it across presets.
- [x] Add distinct native ornaments and CSS motion with the specified budgets and suppression.
- [x] Integrate actual Studio selection, preview, descriptions, Save/Cancel and new asset versions.
- [x] Run controller/config and existing lifecycle suites; inspect real phone/desktop/TV renders and interaction hit tests.

## Task 2: Integrated verification and delivery

**Files:** Existing Studio browser tests, workflow/browser check inclusion if needed, validation document and selected screenshot evidence.

- [x] Add real-browser regressions for falling petals, attached webs, native preview and accessibility/playback policies.
- [x] Run appropriate regression suites, syntax and whitespace checks; fix observed failures.
- [x] Commit intended files and get one fresh read-only whole-branch review; fix Important/Critical findings with regressions.
- [x] Publish the tested exact tree as a reviewable GitHub PR with screenshots and current check status.
