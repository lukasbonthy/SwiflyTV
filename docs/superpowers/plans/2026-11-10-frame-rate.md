# Frame Rate Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then independent whole-change review.

**Goal:** Reduce optical rendering work while the site moves.

**Architecture:** Prepare full and single-sample filters together; select the latter in CSS for active movement. Existing scroll and details lifecycles own the states, with no new frame loop.

**Tech Stack:** Existing React/Vite, SVG filters, CSS, native scrolling.

**Spec:** `docs/react-migration/FRAME-RATE.md`

## Global Constraints

- Preserve resting three-channel glass, premium scrolling, native touch input and seven desktop titles.
- The movement filter uses one displacement sample, zero color matrices and zero blends.
- No motion blur unless reducing rendering work proves insufficient.

## Review Focus

- Overlapping scroll surfaces and reversed gestures cannot restore expensive optics early.
- Closing/reopening and resizing cancel stale rail states.
- Hidden actions, explicit glass preferences and Apple native fallback remain intact.
- Geometry updates and destruction cover both filters without extra frame loops.
- Real refraction remains visible while moving, and the resting design is unchanged.

### Task 1: Optical movement budget

- [x] Add failing graph, nested/overlapping scrolling and rail cancellation regressions.
- [x] Add the prepared movement graph and update source-of-truth three-channel assertions to select the full graph.
- [x] Keep the moving tier through native/Lenis rest and cover nested tracks; select the light graph in CSS during sheet and row motion.
- [x] Verify focused/full tests, build, browser behavior and independent review.
- [ ] Publish to GitHub/Render and verify live assets and CI.
