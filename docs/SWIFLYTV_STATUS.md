# SwiflyTV working checkpoint

Updated: November 12, 2026 (America/New_York).

## Source and production

- Repository: https://github.com/lukasbonthy/SwiflyTV
- Production branch: `main`
- Site: https://swiflytv-1.onrender.com
- Render workspace: `tea-csptd58gph6c73b7sv30`
- Render service: `srv-db6fjrp42hec73c2tn30` (SwiflyTV-1); automatic deployment on `main`.
- Running application commit: `496e4c071c7eebcbf0ee0a3ad03ca9fc65c75c81`.
- Render deployment: `dep-dbqt72vb9u1s73d0no30`, confirmed `live`; finished `2026-11-12T14:57:16.274794Z`.
- Prior iPad optimization source: `b0633f90acf95d450ff5bf32f20c355d946d9939` (CI run `43228735178` passed). Latest source: `931871ab7837e163a070be9764b4c7a4eb382048` (unit/UI tests passed; expanded hosted browser suite in progress at publication).
- Previous player-motion source tree: `a3966af72f9d1aed451a3fef582bf8624a2d55eb` (retained in current release).
- PRs #157 (player motion), #159 (iPad artwork) and #160 (iPad optics/caching) merged; latest https://github.com/lukasbonthy/SwiflyTV/pull/160.

## iPad catalog return-scroll reduction v2 (November 12)

The user reported that returning to prior rows on iPad still felt like every poster reloaded after #159. Source review found that each card's three native poster-action controls were being registered with the glass intersection/near-row machinery (many hundreds of observed controls across a large catalog). On iPadOS only, #160 skips this optical registration and uses the existing dark button face, adding a scoped rule to keep the buttons free of backdrop-filter passes. Navigation, detail and row-arrow glass remain intact, and non-iPad behavior is unchanged. React's poster nodes remain mounted, not virtualized.

- Asset caching: bumped `/assets/liquid-glass/surfaces.js?v=277` to `v=278` in the shell and corresponding tests. The old script URL was cached for one day; the new URL forces clients to fetch the changed controller. CSS comes from a content-hashed shell bundle.
- Regression test `tests/ipad-card-glass-reentry.test.cjs` covers 72 catalog mini-actions, iPad re-entry/focus, visible navbar glass, non-iPad behavior and scoped CSS. A first test draft had an invalid regex; it was corrected before merging. The latest source passed the full `npm run test:ui` step; expanded hosted browser validation was still running when the merge occurred.
- Published PR: https://github.com/lukasbonthy/SwiflyTV/pull/160; merge commit `496e4c071c7eebcbf0ee0a3ad03ca9fc65c75c81`. Render `dep-dbqt72vb9u1s73d0no30` reports `live` at 14:57:16 UTC. Startup logs show React+Vite server running and no application startup error; there is an unrelated existing pg SSL configuration warning.
- Remaining limitation: real iPad WebKit can still evict decoded artwork/tiled scroll backing stores under pressure. Avoid claiming a zero-repaint guarantee. Ask the user to reopen the site and test; if visual blanking remains, verify network requests, WebKit image decode and whether the issue occurs on vertical page scrolling versus horizontal rail paging.

## Latest iPad catalog optimization (November 12)

PR #159 removed global entrance decode/fade processing from catalog poster images specifically on iPadOS, including desktop-class iPad Safari user-agent mode. The images remain mounted in existing native React rails, and WebKit controls lazy loading and image decoding. The featured hero still uses its cinematic entrance. Static dark poster-action lenses on iPad avoid repeated background blur sampling while nav and details retain their glass.

- New tests: `tests/ipad-catalog-scroll.test.cjs` cover iPad native poster behavior, non-iPad unchanged behavior, and scoped CSS.
- GitHub Actions `43228735178`: node-check `success`, including UI tests and the browser test suite; previous intermediate runs were superseded.
- Render `dep-dbqsujm1egvs73f02bpg`: `live` on exact application commit `b5099fd9510d614a8dd32c27c7485c3826ac568a`. Startup logs show server listening and the service live. This is not a physical iPad frame-rate verification.
- Follow-up on-device: scroll down past several catalog rows, flick back up, and check that previously seen posters no longer visibly fade in again; check portrait/landscape and both swipe and arrow interactions. Device/WebKit tile eviction may still repaint when memory is low.

## Completed latest requests

The latest user correction is **Play triggers the ripple burst**. Source discovery leaves the field idle. A valid Play intent launches a quick center-out pulse behind the movie, then the normal green field continues. Up to three overlapping impulses preserve rapid repeated Play presses. Impulses reuse the prepared grid instead of rebuilding it in the input handler.

A local 12 x 8 frame sample, capped at four reads per second on desktop and two on phones, gently tints six spatial regions. Green patches remain. Paused frames are not read repeatedly, and hidden/offscreen/fullscreen/reduced-motion states stop background work. A protected frame immediately restores green, stops retrying that source, and can recover when the source changes. Video CORS attributes and source routing are unchanged.

Skip/next prompts use refined pale/dark surfaces, an arrow badge and media-clock progress lines, with short monotonic entrance/exit transitions. Hidden actions immediately stop accepting input. Narrow players use a 44px song icon and compact skip control so both actions remain inside the film and do not overlap. OS and Studio reduced motion also disable progress-line transitions.

Button presses use a brief opacity response with a smooth release, replacing the positional bounce. Glass controls animate their foreground label separately, retaining the optical surface. Native activation, size and centering remain stable. Keyboard presses track their original control and cancel safely if focus moves into movie details.

Opening movie details recedes the existing browse scene to 97%, centered on the current viewport. The fixed top navigation and native modal viewport stay outside that transform. The scene zoom starts with the sheet's actual launch, including delayed mobile preparation, and reverses during close. Scroll, focus, history, interrupted transitions and reduced motion are preserved.

## Preserved work

PR #156 fixed layout snapping by completing visual React controllers, initial layout and requested fonts behind the entry curtain, while optional tools finish afterward. Preserve that readiness gate and the coordinated player dissolve.

PR #155 rounded the desktop nav and matching glass to 22px and installed the pixel-grid backdrop. PR #153 installed the transparent navigation bird and removed the separate featured pause/play button. PR #154 fixed transparent favicon corners. The favicon remains `?v=181`; the nav SVG remains `?v=180`.

Preserve native scrolling, seven-title catalog windows, mobile composition, Studio settings, glass, progress controls and late artwork handling. Do not redo completed changes.

## Verification

- Production Vite build, syntax and whitespace checks passed.
- All 1,625 unit checks passed. Chromium cannot launch in this local runtime; hosted checks provide browser evidence.
- Both final checks passed on the exact tested source: runs `43155240521` and `43155236317`.
- Hosted Chromium passed 27 entry/Home cases and 221 wider cases, with zero browser skips. The actual Play control launched the center burst; real captured frames changed spatial tint while playback continued. Phone prompt bounds, prompt entry/exit, reduced motion, button focus transfer and fixed-nav background depth passed.
- All 33 acceptance scenarios passed, with 335 assertions.
- Fresh review found protected-frame recovery, overlapping impulses, keyboard focus-transfer and mobile depth-timing gaps. Each was reproduced before its fix and covered by passing checks. Reduced-motion pseudo-element rules, grid reuse and integrated Play-button coverage were also addressed; no findings are deferred.
- One existing account-recovery test searched an entire serialized backup for `99`, accidentally matching a timestamp. A fixed `.999` timestamp reproduced the false failure. The test now checks recovered title IDs and account partitions. Production account behavior is unchanged.
- Authenticated production HTTP verified five routes (`/`, `/movies`, `/tv`, `/movie/157336`, `/watch/movie/157336`), the layout gate, updated controller references and prompt progress markup. Eleven relevant assets matched the tested bytes exactly. This is asset/markup verification, not a protected production screenshot.
- Render confirms the intended application commit is live. Initial post-release application error logs contained zero errors.

## Asset references

- `/assets/player/waves.js?v=3`; SHA-256 `30d10e2af1dcf155e271678c9b68637fe691d2048355bd9372b29ec7adaacb95`.
- `/assets/player/player.js?v=271`; SHA-256 `7a8eedf37e6b8cc28cbd9c9ceab9bc67117c5af4f412ecfce88ed63a30a7d191`.
- `/assets/player/player.css?v=269`; SHA-256 `543af7da666d565fc7974db4e88999848ad78e61a919a8fcc70a23b30a68335f`.
- `/assets/player/assist.js?v=3`; SHA-256 `9ecfee8963a61d263d996deaf93a3c9c615d8cd23d0c6033bf39b82dea9f63c3`.
- `/assets/player/assist.css?v=264`; SHA-256 `f7f6d9f086219f0dc121019bb880279cf213aac34d866476597069ae08621785`.
- `/assets/clean/press.js?v=2`; SHA-256 `2ffa33676f8fd7d31c7b2e0c05df5b2535d862de5a2ddb22b9a9714923121915`.
- `/assets/clean/details.js?v=281`; SHA-256 `3a21ac85cd7cb37ec7bf0c1367e00cc07353044ce7baa493db43c71e6459d342`.
- `/react-assets/main-CfYDFthK.js`; SHA-256 `723011edc2fd09c96079ccb37cfb9ea18074dac19da1e5d45c3be446615a3376`.
- `/react-assets/main-uW_lRk83.css`; SHA-256 `2c9ed554d153e9122be5dfaa6c7b090b062e44ef56e27867add424e153288e59`.
- `/assets/shell/core-3ef7b560cca07cc5571b.css`; SHA-256 `3ef7b560cca07cc5571bb7648fa30ca834defccd4b9c1c2ed20bc6140b7ebda9`.
- `/assets/shell/catalog-d6bcae25176b3a7047b6.css`; SHA-256 `d6bcae25176b3a7047b623fb8ecb356f82d4a707f1ba9a851f77fe8e7d1ef7f5`.

Remaining publication work: none; latest deployment is live. The extended browser CI suite was still in progress when released; physical iPad Safari smoothness remains unverified. This checkpoint is a documentation-only commit with `[skip ci] [skip render]` and does not change the running application code. Credentials and cookies remain private and must never enter the repository.

## Continuity

Read this checkpoint, inspect the worktree and verify current GitHub/Render state before resuming. Keep binaries and Base64 out of conversation output; keep full logs in temporary files and show compact results. Record unfinished work before a handoff. The chat length limit itself cannot be changed by repository code.
