# SwiflyTV working checkpoint

Updated: November 11, 2026 (America/New_York).

## Active continuation: player motion and settled entry

- Working branch: `fix/player-motion-and-settled-entry-v183`, based on `5e0caf1637fcb1ce14f212b4e916603690a69d30`.
- Current implementation is not yet published. The running application and deployment below are the previous release.
- Center-out green pixel ripples now start when the player finishes its reveal and travel faster. Player header and metadata ease into the longer theater dissolve without moving the film.
- React startup separates visual controllers from optional tools, preloads first-party controller scripts and signals layout readiness after initialization and requested fonts settle. The artwork curtain waits for that readiness instead of exposing late setup.
- Skip-intro and next-episode prompts gain entrance/exit transitions while hidden actions immediately stop receiving input. Delegated pointer and keyboard press feedback preserves native activation, target size and existing button centering.
- New coverage reproduces the delayed React initialization bug, exercises the actual production Vite entry and Home composition, and checks center emission, prompt motion and button activation. Production build, syntax checks, all 1,613 local unit cases and 64 focused cases passed. The 246 local browser cases were skipped because Chromium cannot launch in this runtime; hosted-browser checks are pending.
- An authorized production access session is available privately for post-deployment asset verification. Do not put credentials or cookies in this repository.

## Previous release: source and production

- Repository: https://github.com/lukasbonthy/SwiflyTV
- Production branch: `main`
- Site: https://swiflytv-1.onrender.com
- Render workspace: `tea-csptd58gph6c73b7sv30`
- Render service: `srv-db6fjrp42hec73c2tn30` (SwiflyTV-1)
- Automatic deployment is enabled on commits to `main`.
- Running application commit: `66349625845c53e16b1ec06d0f3178652fa0e0fb`.
- Render deployment: `dep-dbqi5659el5s73euhvn0`, confirmed `live`; finished 2026-11-12T02:22:39.196622Z.
- Tested source commit: `88b2a6a751193dd1b1d6008eac5c149ea18af343`.
- Tested and merged source tree: `ddc0b422f8d7362c823f3ca903af725386bbafaa` (identical).
- PR #155: https://github.com/lukasbonthy/SwiflyTV/pull/155, merged.

## Completed latest requests

The top navigation is slightly rounder: its desktop radius and matching glass surface increase from 20px to 22px. Existing mobile sizing and pill shape stay intact.

The standalone movie/episode player has a bright green pixel-grid ripple field inspired by the user's TheIntroDB video. Native Canvas2D keeps the bitmap bounded to 1280 x 900; the mobile draw rate is capped separately. The backdrop sits behind the opaque film and controls. Embedded players retain their existing appearance.

The field pauses offscreen, in hidden tabs, during document/native iPhone fullscreen, and in the back-forward cache. Reduced motion shows a still pattern. High contrast, forced colors, reduced transparency, console and minimal presets disable it. The renderer observes Studio and OS preference changes.

Entry from another page now closes through a short black dissolve and uses the existing independent artwork curtain for one incoming theater reveal. The live video never moves or scales. The generic loading skeleton does not replace the theater dissolve. Escape, reduced motion, console navigation and history restoration retain their existing behavior. The ripple canvas fades in once when ready.

## Preserved previous work

PR #153 installed the supplied transparent SVG navigation bird, removed the separate featured pause/play button, and implemented the single initial artwork dissolve. PR #154 published the favicon with transparent corners. The favicon remains `?v=181`, and the navigation SVG remains `?v=180`.

Preserve native scrolling, seven-title catalog windows, the current mobile composition, Studio settings, glass effects, progress controls, and late artwork handling. Do not reimplement finished changes.

## Verification

- All 1,612 local unit checks passed. The local browser cases were skipped because this runtime cannot launch Chromium.
- Both final GitHub checks passed on the exact tested commit: runs `43139383539` and `43139377499`.
- GitHub ran all 242 browser cases successfully, with no browser skips, including visible green pixels on desktop/phones, stable movie geometry, control hit targets, viewport bounds, the incoming dissolve, preferences and lifecycle pause/resume.
- All 33 acceptance scenarios passed, with 335 assertions.
- Production Vite build, syntax checks and whitespace checks passed.
- Independent review identified native iPhone fullscreen and forced-colors gaps; both were addressed and covered by the passing browser checks.
- One existing Home geometry test raced initial catalog setup. Its fixture now waits for initial rail geometry and already-requested fonts before measuring logo replacement. The geometry assertions and thresholds remain unchanged.
- Render confirms the intended merged application commit is live. The initial post-deployment application error-log query returned zero errors.
- Direct live visual/asset-byte verification is limited by the existing six-digit site access gate. No authorized PIN or browser session was available in this continuation. The protected appearance was verified in GitHub's real-browser fixtures; do not claim a protected production screenshot or asset hash comparison was completed.

## Changed asset references

- Core shell: `/assets/shell/core-9833de8ffdc233744c2b.css`.
- Player CSS: `/assets/player/player.css?v=268`; SHA-256 `45c7a0a7a6d13bbc555b5570f437ff0da5d5a8ef4b24925df964cd62c44f6843`.
- Ripple script: `/assets/player/waves.js?v=1`; SHA-256 `3a7b7da2f162c9ffd50b2929e225aba94521f0d2fe309ef7b4049a0cbd3254be`.

Previous release implementation/publication work: complete. Its original protected-live-page review was blocked by the access gate. The active continuation and its remaining verification are recorded above.

## Keeping future chats resumable

Read this checkpoint, inspect the working tree, and verify current GitHub/Render state before resuming. Keep image Base64 and complete binary blobs out of conversation output. Keep full logs in temporary files and display compact results. Record any unfinished step here before a handoff. The chat length limit itself cannot be changed by repository code.
