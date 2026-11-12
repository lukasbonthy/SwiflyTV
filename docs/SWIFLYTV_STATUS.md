# SwiflyTV working checkpoint

Updated: November 11, 2026 (America/New_York).

## Source and production

- Repository: https://github.com/lukasbonthy/SwiflyTV
- Production branch: `main`
- Site: https://swiflytv-1.onrender.com
- Render workspace: `tea-csptd58gph6c73b7sv30`
- Render service: `srv-db6fjrp42hec73c2tn30` (SwiflyTV-1); automatic deployment on `main`.
- Running application commit: `798eea813e62b701fa4f5d75565be3cadfe64785`.
- Render deployment: `dep-dbqk93k9v7es73dom0b0`, confirmed `live`; finished `2026-11-12T04:47:16.913291Z`.
- Tested source commit: `c993c35d1d318f32384b740c76eeae947972f637`.
- Tested/merged source tree: `a3966af72f9d1aed451a3fef582bf8624a2d55eb` (identical).
- PR #157: https://github.com/lukasbonthy/SwiflyTV/pull/157, merged.

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

Remaining implementation/publication work: none. This checkpoint and completed plan are documentation only, using `[skip ci] [skip render]`; they do not change the running application commit. Credentials and cookies remain private and must never enter the repository.

## Continuity

Read this checkpoint, inspect the worktree and verify current GitHub/Render state before resuming. Keep binaries and Base64 out of conversation output; keep full logs in temporary files and show compact results. Record unfinished work before a handoff. The chat length limit itself cannot be changed by repository code.
