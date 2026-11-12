# Featured Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the separate rotation icon and make entry use one black dissolve.
**Architecture:** Reuse the active progress button for playback state. Start the artwork gate after parsing, independent of deferred application code, with one idempotent lifecycle and one initial opacity transition.
**Tech Stack:** Existing Node/Express, React/Vite, DOM controller and CSS; Node tests and Chromium CI.
**Spec:** ../specs/2026-11-11-featured-entry-design.md

## Global Constraints

Preserve Studio choices, native scrolling, seven desktop posters, optical material, original renderer and original backup. No dependency, playback, API-provider or deployment-setting changes.

## Review Focus

- Focused active progress control must pause/resume predictably with keyboard input.
- Slow parsing/deferred scripts must not replay or hide visible initial artwork after a deadline or Escape.
- New artwork and history restoration must retain their current decode/fade and cleanup behavior.
- Manual selection during preparation/transition must not switch the wrong film or create a second timer.
- Reduced motion/TV and Studio loader settings must continue to bypass automatic movement and entry animation.

### Task 1: Simplify Home entry and controls

**Files:** server.js; public/clean/featured.js and featured.css; ui/artwork-entry.js; public/clean/loading.css; tests/featured-rotation.test.cjs; tests/featured-rotation-browser.test.cjs; tests/artwork-entry.test.cjs; tests/artwork-entry-browser.test.cjs; .github/workflows/check.yml only to put artwork lifecycle checks into the existing early gate.

**Interfaces:** Consume existing featured position buttons and inline artwork gate. Produce no new public API; keep select/destroy and artwork-state semantics.

- [ ] Add server absence and active-track pause/resume assertions, including focused keyboard and quiet-mode selection. Add parsed-before-deferred and late-boot preservation lifecycle tests. Run focused Node tests; expect the new behavior tests to fail against the baseline.
- [ ] Remove the separate control and its CSS, update progress labels/state and input handling. Make entry boot once at interactive/DOMContentLoaded, preserve expired initial content, and disable only the inner asset transition during the initial curtain dissolve. Run the regressions; expect green.
- [ ] Update Chromium geometry/interaction tests and add no-double-fade/delayed-defer checks. Verify the managed preview, syntax/build and npm test; expect green local tests with browser skips if Chromium is unavailable.
- [ ] Commit, perform one fresh-context whole-branch review, address important findings in one RED/GREEN pass, and publish the branch for Chromium/acceptance CI. Then update authorized main and wait for Render LIVE with matching deployed asset hashes.
