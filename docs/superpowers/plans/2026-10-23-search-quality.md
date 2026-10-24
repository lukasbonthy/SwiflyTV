# Search quality and site UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for each owned task. Independent UI and loading tasks run in parallel under dispatching-parallel-agents.

**Goal:** Improve actual recommendation relevance, unify the feature HUD with Swifly, and make loading communicate useful real state.

**Architecture:** Keep Express, TMDB retrieval, the MiniLM worker and the shared server shell. Separate parsing/retrieval from ranking and evaluate the actual model. Reuse the shell's existing materials and native navigation lifecycle.

**Tech Stack:** Node/Express, plain JS/CSS, Transformers.js, Chromium and Node tests.

**Spec:** `docs/superpowers/specs/2026-10-23-search-quality-design.md`

## Global Constraints

- No paid service, new identity provider, or large generative-model download.
- Preserve site protection, private social APIs, native navigation and playback.
- Support 320px layouts, keyboard users, reduced motion and TV/Xbox.
- No JavaScript frame/pointer loops or excessive AI decoration.
- Critical content hold API remains backward compatible and releases on failure.

## Review Focus

- A similarity request must retain its extra positive and negative preferences.
- A typo or alternate title must not silently become a random mood search.
- A broad inferred topic must not remove a relevant film with different catalog genres.
- Cancel, retry and late worker messages must not replace newer results.
- Slow/failed critical content must not trap navigation behind the loader.

### Task 1: AI quality (root)

**Files:** `lib/recommendation-query.js`, `lib/discovery.js`, `public/discovery/model-worker.js`, `public/discovery/recommendations.js`, `ui/discovery.js`, relevant tests and a repeatable quality benchmark.

- [x] Reproduce failures in parsing, retrieval and genuine model ranking; record baseline query results.
- [x] Add failing behavioral tests for observed mistakes, then repair each layer.
- [x] Show interpreted filters and grounded result reasons; improve inline progress, cancellation and fallback state.
- [x] Run the same quality set plus unseen challenge queries; report measured outcomes and limits.

### Task 2: Consistent search/notification HUD (UI agent)

**Files:** `public/connect/feature-effects.css`, `public/connect/connect.css`, `public/discovery/discovery.css`, `ui/connect.js`, `public/connect/connect.js`, related UI tests. Do not edit `ui/discovery.js` or AI JS.

- [x] Inspect existing shell materials; simplify search, notification panel and AI surfaces to match.
- [x] Remove excessive AI motion/glows; keep restrained hover/focus and existing functional controls.
- [x] Wire initial connect loading through the backward-compatible hold API and release in finally.
- [x] Inspect desktop/mobile; run connect tests and update intentional visual assertions.

### Task 3: Useful site loading (loading agent)

**Files:** `ui/loading.js`, `public/clean/loading.css`, `public/discovery/audiobooks.js`, `tests/site-loading.test.cjs`, `tests/page-transitions-rendering.test.cjs`.

- [x] Add tests for useful destination messages, accessible navigation and real initial content readiness.
- [x] Implement indeterminate progress and destination-specific skeletons with no forced delay; preserve navigation safeguards.
- [x] Extend `hold(message?: string)` without breaking existing callers and release initial audiobook hold in finally.
- [x] Verify fast/slow/canceled/history/reduced-motion and narrow-screen cases.

### Task 4: Integration and release (root)

- [x] Inspect real UI states; test syntax, AI/server/UI units and browser integration with bounded concurrency.
- [x] Request an independent code review, fix important findings, record benchmark results.
- [ ] Publish through the existing PR workflow, wait for CI, merge, and verify actual live behavior.

## Verification and review record

The original parser/retrieval regressions failed before their fixes. Real MiniLM q8 inference on 50 fixed queries improved from 39 to 48 first-choice hits and from 46 to 50 top-three hits; limitations and reproduction commands are in `docs/recommendation-quality.md`. The integrated real Chromium form-to-catalog-to-model test passes. Desktop/mobile search, AI, notification and result screens were inspected. The 27 existing focused browser checks passed, including loading, reduced motion and Xbox.

Independent whole-change review found four important intent cases: unresolved explicit titles entering mood planning, swallowed runtime/language/descriptive suffixes, mixed native/keyword TV OR genres, and abbreviated setting decades. Each was reproduced by a new failing test and fixed in the single review pass; all 71 focused AI/parser/API/UI tests then passed. The final full run after those fixes had 1,286 tests: 1,284 passed, no skips, and only the two existing player-layout failures. The same two failures were reproduced independently on unchanged `cc2f679` (5 of its 7 player-layout tests passed). Syntax and the real model evaluation pass. Release status is recorded in the PR and live verification.
