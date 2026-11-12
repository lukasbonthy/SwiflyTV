# Player color and depth implementation plan

> Execute natively with superpowers:executing-plans. Review the whole branch after implementation.

**Goal:** Refine movie-driven ripples, player prompts, press feedback and details depth.

**Architecture:** Extend the existing native canvas and player-intent event; keep the media clock as the prompt-progress source. Scale only the existing browse scene during details transitions.

**Tech stack:** Existing JavaScript, Canvas2D, CSS transitions and React/Vite shell.

**Spec:** `docs/superpowers/specs/2026-11-11-player-color-depth-design.md`

## Global constraints

- Play triggers the burst; finding a source does not.
- No new dependencies, video CORS changes, source-routing changes or per-frame full-video reads.
- Preserve bounded canvas cost, native activation, scroll/history, fixed navigation and reduced motion.
- Publish through the existing GitHub/Render workflow and verify protected live assets.

## Review focus

- Cross-origin video must retain playback even when frame reads are blocked.
- Repeated Play presses add an impulse without blanking existing rings.
- Episode/source replacement must recover sampling without stale colors or event listeners.
- Closing/reopening details must restore the browse scene without shifting the navigation or scroll.
- Disabled, keyboard and reduced-motion input must retain native behavior.

## Task 1: Movie colors and Play burst

Files: `public/player/waves.js`, `public/player/player.js`, `tests/player-waves.test.cjs`, `tests/player.test.cjs`, `tests/player-layout.test.cjs`.

- [x] Add failing unit coverage for idle-before-Play, Play intent, spatial colors, blocked-frame recovery and lifecycle pauses.
- [x] Dispatch `swiflyplayer:play-intent` before a valid user playback attempt; remote source resumes do not emit it.
- [x] Add a rapid impulse to the center-out field and bounded, smoothed frame sampling with a stable green fallback.
- [ ] Exercise actual canvas/video sampling and Play behavior in the existing hosted player browser group.

## Task 2: Prompts and press feedback

Files: `ui/player-assist.js`, `public/player/assist.js`, `public/player/assist.css`, `public/clean/press.js`, `tests/player-assist-ui.test.cjs`, `tests/react-entry-cases.cjs`.

- [x] Verify media-clock progress resets between windows and preserves exact manual seek behavior.
- [x] Restyle skip/next actions and refine their native entrance/exit transitions.
- [x] Replace positional bounce with monotonic opacity feedback; update browser checks to require steady target geometry, native activation and reduced-motion handling.

## Task 3: Details depth and release

Files: `public/clean/details.js`, `public/clean/details.css`, related details browser/unit tests, `server.js`, checkpoint.

- [x] Cover viewport-centered background scale and its restoration on close, reduced motion and interruption, with navigation outside the scaled subtree.
- [x] Coordinate browse depth with existing sheet state and preserve the native modal viewport.
- [ ] Update asset versions, run focused/full unit checks, build and hosted Chromium checks, then review the branch.
- [ ] Merge, verify Render's exact application commit, authenticated live pages/asset bytes, and save the final checkpoint.
