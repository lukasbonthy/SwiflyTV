# Movie Nights and UI correction implementation plan

> **For agentic workers:** Use the existing isolated review branch. Execute continuously and record progress here; the user has authorized implementation and opted out of repeated approval questions.

**Goal:** Deliver the reference Home controls, a better episode browser and a functional featured community screening.

**Architecture:** Existing Express/Socket.IO service, persistent account store and native player, with scoped UI assets. Keep server integration small and avoid another framework.

**Tech stack:** Node, Express, Socket.IO, React/Vite, native CSS, node:test and hosted Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-movie-nights-design.md`

## Global constraints

- Work on `feat/swifly-movie-nights-20261116`; keep main and production unchanged until verification is complete. The newer November20 instruction “Merge the new movie nights” authorizes final integration.
- Retain existing parental/access protection, account data, secrets, iPad safeguards, ripples and native player.
- Use real data. No simulated votes/viewers, no unplayable placeholder stream and no episode glass.
- Reference Home selectors affect their rows only. Use shared typography and the actual AI Picks components for Books.
- Browser evidence must include the real React shell, interaction states and two clients sharing actual media.

## Review focus

- Vote arrives at the close boundary or in two simultaneous requests: lock exactly once and count each account once.
- Server restarts during screening: preserve winner/start and reconnect at the current time.
- Source is delayed, fails or expires: never claim playback is live without a common ready source; offer recoverable state.
- A parent locks Kids or an account changes in another tab: revoke adult interaction and avoid exposing private identifiers.
- Narrow phones, iPad and keyboard navigation: no clipped menus, duplicated icons or overlapping episode/chat controls.

## Task 1: Persistent screening service

Files: create `lib/movie-nights.js`, `tests/movie-nights-service.test.cjs`, `tests/movie-nights-http.test.cjs`, `tests/movie-nights-socket.test.cjs`.

Interfaces: implement the service/API/socket contract in the spec; consume the existing store read/transaction API. Root integrates with `server.js` separately.

- [ ] Write and observe failures for schedule/DST, stable rotating ballots, one-account voting/change, deadline/tie/no-vote selection, shared delayed start, failure/retry, persistence/restart and late-join snapshots.
- [ ] Implement bounded service, same-origin routes, authenticated voting/chat, gated namespace, real presence and disposal.
- [ ] Run the three focused service suites and report exact evidence. Preserve all account-state keys; store event state under `movieNights`.

## Task 2: Home selectors and screenshot defects

Files: `lib/catalog-experience.js`, `ui/catalog-experience.js`, `public/clean/catalog-experience.{css,js}`, `server.js` Home/dsRail integration, `ui/kids.js`, `public/kids/kids.css`, related focused tests.

Interfaces: generalize period controls to row/type/parameter; consume existing `dsRail`, actual native Kids navigation and shared discovery form. Preserve current Popular Movies API.

- [ ] Reproduce missing Home movie/series selectors and Kids duplicate/cramped controls with meaningful renderer/controller tests.
- [ ] Implement independent Home periods and in-place row updates with keyboard/focus/reduced-motion support and reference geometry.
- [ ] Fix Kids navigation layout directly. Compare Books to AI Picks and Study toolbar/timer/player spacing before adjusting only observed defects.
- [ ] Run focused catalog/Kids/discovery/Study tests and prepare real-route visual captures.

## Task 3: Episode browser

Files: episode markup functions in `server.js`, `public/clean/episode-browser.js`, scoped existing detail/episode CSS and tests.

Interfaces: retain existing data-episode/library hooks, real season metadata, view/order preferences, spoiler protections and download routes.

- [ ] Reproduce season-state, metadata and future-episode behavior; keep list/grid choices functional.
- [ ] Implement matte list rows, coherent header/season/progress grouping, hover/focus and mobile composition with bounded work.
- [ ] Run episode, library and detail regressions; capture default/list/grid/empty/error states in hosted browser.

## Task 4: Screening UI and native player integration

Files: create `ui/movie-nights.js`, `public/community/movie-nights.{css,js}`, `tests/movie-nights-ui.test.cjs`, `tests/movie-nights-client.test.cjs`, `tests/movie-nights-browser.test.cjs`; integrate `server.js`, `ui/community.js`, navigation overflow and native player.

Interfaces: consume Task 1 snapshots and namespace contract; render the existing `playerMarkup({embedded:true,managed:true})` once selected. Reuse `SwiflyPlayer.mount`, `loadSource`, `getState`, `play`, `pause`, `seek`, `setRemoteMode`; synchronize from serverTime/playbackStartedAt.

- [ ] Test empty/voting/countdown/ready/error UI and client late-join/reconnect/account-change behavior before implementation.
- [ ] Build a cinematic screening page with actual artwork, compact event status, transparent totals, ballots and chat; no fake content.
- [ ] Wire auto-selection and shared source to the native player, audible-play fallback, personal pause/Resume Live, drift correction and teardown.
- [ ] Add discoverable links and same-style restrained Home feature. Verify all parent guards still apply.

## Task 5: Integrated review and delivery

Files: hosted workflow/scripts, browser tests and `docs/SWIFLYTV_STATUS.md`.

- [ ] Diagnose the existing iPad Kids test timeout rather than raising it. Bound asynchronous waits and ensure test teardown cannot hang.
- [ ] Run syntax/build and meaningful local suites. Run hosted real-route browser checks and actual two-client media synchronization.
- [ ] Inspect screenshots at multiple widths, fix observed visual defects, obtain fresh independent review and resolve significant findings.
- [ ] Update checkpoint with exact code/check/artifact status. Preserve main; deliver a concrete review branch and preview evidence.

## Execution ledger

- Baseline: main `35751429ce99446b07893920595f30037e51055b`; clean isolated review branch; previous source checks passed but final experience browser run timed out on iPad Kids. No Movie Nights implementation existed when the session resumed.
- Design choice: Friday/Saturday 20:00 America/New_York, one authenticated account vote, five-minute close, deterministic ballot-order tie-break; these defaults are configurable and are not user-specified values.

- Task 1: implemented in `0a66452`; review fix round 1 in `57d6dac` addressed seven findings. Scoped re-review found a scheduler boundary race and seed outage code; round 2 underway, with 40 focused tests reported passing.
- Tasks 2–4: Home movie/series period controls now update native React rails in place; duplicate Kids search and parent-button layout corrected; episode lists have real progress, watched controls and bounded 24-episode pages. Screening layout, native player, account vote/chat, personal pause and reconnect are implemented locally. Syntax/build and focused controller checks pass; full local suite and rendered review are in progress.
- Task 5: this runtime has a Chromium executable but browser launch fails at a denied Unix process-singleton socket. Use hosted browser checks. The previous iPad run produced no native iPad Home screenshot: its image wait included offscreen lazy horizontal posters. The wait now checks only visible images with a bounded condition. Browser evidence is still required.

- Task 1 fix round 1/5: seven original findings addressed (`0a66452..57d6dac`), new deadline race found. Round2/5: cutoff/start and seed-write outage fixed (`57d6dac..266b352`), new retry-backoff race found. Round3/5: failed-store path uses only its recovery backoff (`266b352..6f60efc`);41 focused cases pass. Scoped review pending.
- Local integrated check:1840 passed,5 failed,299 browser deferred. All5 were traced to intended on-demand season behavior, stale asset-version assertions and the160KB shell budget; corrected62-case rerun passes. Hosted browser verification is required before completion.

- Task1:41 service tests pass and independent scoped review approved. Integration reviewer found local Retry incorrectly escalating to a shared retry and cached playback not requiring a fresh admitted connection. Reproduced3 client failures; corrected local reattachment and generation-bound admission checks;9 client/UI tests pass. Review continuation and hosted rendering remain pending.
