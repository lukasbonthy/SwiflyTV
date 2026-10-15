# Playback options and iPad polish implementation plan

> **For agentic workers:** Use test-first changes, isolated file ownership, and one independent whole-branch review before publishing.

**Goal:** Make actual audio languages, captions and picture qualities usable; give profiles/account pages the site's aurora styling; expose Party Hub in navigation; reduce touch-device rendering work.

**Architecture:** Preserve bounded provider metadata through discovery. Expose prepared same-origin playback/caption URLs, verify alternate files lazily, and retain the selected source contract. Extend the existing controller instead of replacing playback. Keep profile and performance changes scoped to the existing clean theme.

**Tech stack:** Node/Express, pinned provider workers, native Safari media/HLS, Hls.js 1.5.17, DASH.js 4.7.4, existing SVG glass and CSS aurora, node:test/jsdom/Playwright.

**Spec:** User request and the in-chat design: real choices only, existing premium cinema styling, aurora preserved, lighter iPad rendering.

## Global constraints

- Preserve PR39 HEVC compatibility, byte ranges, verified headers and public-address validation.
- Do not fabricate translations, captions or qualities; unavailable options remain truthful.
- No paid APIs, new dependencies, transcoding or whole-film buffering.
- Keep TV season/episode scope; keep party transport authority while allowing personal quality/audio/captions.
- Preserve profile data, form handlers, Studio settings, reduced motion and glass-off behavior.
- Benchmark browser work with an identical fixture; do not claim physical iPad FPS.

## Interfaces

- Internal candidates: `url`, `format`/`type`, `quality`, `name`, `codecName`, `audioLanguage`, `headers`, `subtitles`, `mediaVerified`, `requiresProxy`.
- Client `playbackSources[]`: `id`, `playbackUrl`, `streamType`, `streamMode`, `streamQuality`, `streamCodec`, `streamName`, `audioLanguage`, `selected`, optional `subtitles`.
- Client `subtitles[]`: `id`, same-origin `url`, `language`, `label`, `kind`, `default`.
- `createSubtitleProxy({getEntry,...})`: opaque entry `{sourceUrl,headers,expiresAt}`, bounded VTT/SRT response.
- Root owns API/registry integration and common asset versions; agent ownership separates player, source helpers, profiles/nav, and optics/aurora.

## Review focus

- A stale quality switch must never replace a newer movie/episode or party selection.
- Unknown or missing language must not be labeled English or override explicit preferences.
- Caption redirects, malformed text and credentials must never become same-origin HTML or leak headers.
- Native HLS must remain usable on Safari without requiring MediaSource.
- Touch performance mode must retain visible aurora/art/glass and pause work outside the viewport or hidden tab.

## Tasks

### 1. Source metadata and safe playback handoff

- [ ] Reproduce loss of alternatives/captions through the real normalization/handoff functions.
- [ ] Test known-language preference, bounds, scopes and provider header preservation.
- [ ] Preserve normalized metadata from worker results and current VidLink file qualities.
- [ ] Prepare opaque alternate MP4 entries; verify once before their first playback request.
- [ ] Proxy and convert bounded provider VTT/SRT captions; test MIME, redirects, cancellation and safe errors.
- [ ] Test source jobs and movie/episode handoff with actual helper implementations.

### 2. Player controls

- [ ] Test native/HLS/DASH audio track choices, English default and persisted explicit preferences.
- [ ] Test MP4 quality switches preserving time, play/pause, volume/rate and caption choice.
- [ ] Test stale source changes, failed choices and managed party snapshots.
- [ ] Add audio control and functional merged external/native captions in the current premium settings panel.

### 3. Profiles and navigation

- [ ] Keep existing profile CRUD/reset flows and add accessible Party Hub navigation behavior tests.
- [ ] Remove conflicting opaque profile overlays; implement responsive profile/account/chooser surfaces.
- [ ] Add visible SVG Party Hub icon beside the existing navigation tools.
- [ ] Inspect desktop, iPad and mobile layouts with aurora and solid settings.

### 4. iPad rendering and release verification

- [ ] Record baseline scene reads, layouts, animation work and aurora lifecycle.
- [ ] Batch optics reads/writes, bound coarse-pointer sampling and remove unnecessary scene rebuilds.
- [ ] Pause offscreen aurora; keep a lighter animated layer and static ornamental loops on touch.
- [ ] Compare the identical benchmark and inspect glass/aurora appearance.
- [ ] Run the full test suite, syntax checks, responsive screenshots and independent review.
- [ ] Publish, wait for CI, merge, verify Render live sources/options/caption routes and served assets.
