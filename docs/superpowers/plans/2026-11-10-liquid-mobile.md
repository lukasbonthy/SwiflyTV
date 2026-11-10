# Continuous Mobile Motion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement each task inline, then obtain independent review.

**Goal:** Keep content stable while it moves and give mobile transitions a softer pace.

**Architecture:** Native mobile rows retain their posters throughout scrolling and update their range at rest. The details controller prepares fast metadata before its mobile entrance and holds late replacement until motion completes.

**Tech Stack:** Existing React/Vite, browser scrolling, Web Animations API, CSS.

**Spec:** `docs/react-migration/LIQUID-MOBILE.md`

## Global Constraints

- Preserve premium wheel scrolling, glass shaders, seven visible desktop titles, and the original backup.
- Mobile entrance 560ms, exit 360ms, metadata preparation bound 400ms.
- No new dependencies or interception of native touch gestures.

## Review Focus

- Poster identity remains stable during long and reversed gestures.
- Slow metadata never replaces content during sheet motion.
- Closing or reopening cancels preparation and resolves pending commits safely.
- Reduced motion and TV mode retain immediate/native behavior.
- Breakpoint changes cannot apply stale range updates.

### Task 1: Stable native rows

- [x] Add a regression asserting no poster insertions/removals during native scrolling; run it and confirm failure.
- [x] Keep native poster nodes mounted, use proximity snapping, and settle range updates after scrolling.
- [x] Retain padding, last-title, reduced-motion, and resize regressions; verify desktop paging still shows seven.

### Task 2: Prepared mobile sheet

- [x] Add failing tests for preparation frames, late metadata, cancellation, and reduced motion.
- [x] Add bounded preparation and settle waiters to `public/clean/details.js`; match mobile CSS timing.
- [x] Run details/navigation/glass regressions and inspect real preview motion.

### Task 3: Verify and publish

- [x] Run production build, syntax, focused and full regression tests.
- [x] Obtain code review and correct actionable findings.
- [ ] Publish to the existing GitHub/Render service and verify its tested assets.
