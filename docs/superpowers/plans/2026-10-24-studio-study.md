# Studio and Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** All12 real Studio upgrades and a native functional Swifly Study integrated into existing SwiflyTV.
**Architecture:** Extend current vanillaJS/Express modules with a shared validated schema and draft transactions; independent runtime/player/Study modules consume exact settings/event interfaces.
**Tech Stack:** Existing Node/Express/Socket.IO, CSS, browser media/WebRTC/WebAudio, node:test/JSDOM/Playwright. No new framework.
**Spec:** docs/superpowers/specs/2026-10-24-studio-study-design.md; owner brief alongside it.

## Global Constraints
Preserve all existing features and the full AI form. Never alter provider resolution or party transport authority. No fake metrics/progress/tracks/sync. OS accessibility wins. Preview/Cancel restores all state. Do not merge/deploy without user authorization.

## Review Focus
- Profile switch or storage failure mid-draft must not save under another owner or erase unrelated records.
- Temporarily missing home rows and Continue updates must preserve saved order/visibility and an available homepage.
- An active/focused player or denied media permission must remain usable during appearance changes.
- Invalid/future/oversized import must neither execute content nor change committed settings.
- Repeated Studio/Study open/leave/navigation must not duplicate listeners, sockets or media tracks.

### Task1: Schema, owner storage and transaction foundation
Files: public/studio/config.js,public/studio/studio.js,tests/studio-config.test.cjs,tests/studio.test.cjs,tests/ui-helpers.cjs,ui/navigation.js.
Interfaces: exact flat fields/defaults and studio-change contract in spec; Config.validate/parseImport/export/read owner; Studio.getSettings/open/close.
- [x] Write failing defaults/ranges/legacy/profile/quota/portable security tests, assert old AI/watch data unchanged.
- [x] Run node --test tests/studio-config.test.cjs (red).
- [x] Implement version2 schema, staged looks/device records, safe owner switching and backward-compatible current controls.
- [x] Run targeted Studio suites including direct close/controller cancellation (green); commit.

### Task2: Full Studio workspace and common tokens
Files: ui/studio.js,public/studio/studio.js,public/studio/studio.css,tests/studio-expanded.test.cjs,server.js.
Interfaces: all controls bind the schema fields; same dialog/opener/live artwork; root primes settings before first paint.
- [x] Add failing full-tab/control, subsection reset, named-look CRUD/import preview tests.
- [x] Extend existing panels into appearance/home/navigation/player/atmosphere/socialAI/motion/devices/access/themes; retain old selectors.
- [x] Add semantic list reorder controls and drag fallback, actual contextual previews, input validation and safe shared tokens.
- [x] Verify Save/Cancel/defaults/full AI preservation and320px layouts; commit.

### Task3: Actual page customization
Files: public/studio/experience.js,experience.css,public/clean/hero-palette.js,ui/loading.js,server.js markers,tests/studio-experience.test.cjs,studio rendering tests.
Consumes: studio-change detail.effective and stable home/nav DOM markers, existing Aurora/loading APIs.
- [x] Red tests for actual row identity/order/hidden history updates, nav DOM order/essential routes, full AI live form, loader readiness, palette cache/error and reduced effects.
- [x] Implement real home/nav/HUD/poster/loading/adaptive settings without extra animation loops or scroll physics.
- [x] Test different actual art palettes with CORS failure caching; prove loader ends on ready regardless style.
- [x] Run existing home/nav/loader/AI regressions and new tests; commit.

### Task4: Real player and caption customization
Files: public/player/player.js,player.css,ui/player.js if needed,tests/player-studio.test.cjs.
Consumes: same schema/event; existing mounted player and cleanup bucket.
- [x] Red tests: playing video identity/time preserved after appearance change; focused controls remain; caption style and new timeout apply; no party action emitted.
- [x] Implement controls/themes/opacity/position/size/progress/time, safe rescheduling and actual native caption styles; truthful preview/limitations.
- [x] Run player and party authority regressions; commit.

### Task5: Native Study
Files: ui/study.js,public/study/{study.js,study.css,media/*},lib/study.js,tests/study.test.cjs,study-ui.test.cjs,study-rendering.test.cjs; root server/nav glue.
Consumes: existing shared shell/siteGate/Socket.IO; no second web server or iframe.
Produces: createStudy({io,authorizeSocket,iceServers}) => {router,namespace,close}; studyMarkup({room}) route body; source catalog local assets.
- [x] Red tests for timer deadlines/no double accounting, playlists/task/setup persistence, denied capture, same-room signaling, complete leave/disconnect and socket auth.
- [x] Implement all meaningful source features with the new Swifly design and actual audio/video/WebRTC paths; local profile storage and server-session board labeled.
- [x] Integrate /study,/study/room/:slug,/api/study,/assets/study and protected namespace; keep lazy media loading.
- [x] Verify media controls, timer, tasks, share/export, responsive layout and two-client room teardown; commit.

### Task6: Integration, performance, review and PR

Publication, final CI and handoff are tracked in the PR check panel and delivery message; the committed plan records the verified prepublication checkpoint.
Files: docs/STUDIO_v2.md,docs/study.md,docs/studio-study-validation.md,package.json,.github/workflows/check.yml,fixtures/browser tests.
- [x] Run npm run check, full test:ui, recommendation quality and targeted browser suites; compare failures with main.
- [x] Browser acceptance on desktop/phone/TV and separate profiles/contexts; save screenshots and repeatable fixture performance evidence.
- [x] One independent whole-branch review; fix material findings with regressions, no repeating review rounds.
- [ ] Publish exact tested source tree and all media blobs to feature branch via GitHub connector, open PR with all12+Study status matrix and actual test evidence; wait CI.
- [ ] Leave PR unmerged and production unchanged; deliver repo/branch/SHA/PR/preview/tests/limitations.

### Task7: Requested update-list gaps
Files: lib/feed.js,lib/trakt.js,public/clean/library-state.js,library-page.js,library.css,feed.js,feed.css,settings.js,settings.css,ui/feed.js,ui/settings.js,server.js,lib/player-assist.js,public/player/assist.js,lib/server-selection.js,public/clean/details.js and behavioral tests.
- [x] Audit actual baseline and record implemented/partial/missing behavior; preserve working features.
- [x] Implement profile library/history/folders and next-aired-episode resume with RED→GREEN regressions.
- [x] Implement metadata home feeds, acknowledged episode bell and filtered shuffle with bounded requests.
- [x] Implement server-private Trakt OAuth/import/push and settings, state credentials limitation honestly.
- [x] Add search/episode view-sort/spoiler/certification/last-server/TheIntroDB controls against actual existing paths.
- [ ] Include new feature matrix and all behavior/browser/CI results in the same final review and unmerged PR.
