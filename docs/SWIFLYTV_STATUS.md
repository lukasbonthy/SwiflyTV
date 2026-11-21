# SwiflyTV working checkpoint

## November 21, 2026 — Movie Nights opening-night presentation and native sign-in review

- Active review branch: `feat/movie-nights-theater-firstparty-20261121`. Draft pull request: https://github.com/lukasbonthy/SwiflyTV/pull/168. **Do not treat this as merged or deployed.** Production remains on the protected main branch; Render auto-deploys main and PR previews are disabled.
- The existing server-side Movie Nights schedule, account ballots, synchronous playback, source retry, live chat, reconnection and personal Resume Live are preserved. New scoped presentation adds a theater-bulb marquee, velvet curtain framing, premiere admission pass, ticket-styled votes, matching gold/burgundy live layout, and reduced-motion/mobile rules.
- Added in-place first-party account signup/login on Movie Nights using the **existing** `/api/connect/session` and `/api/connect/auth/{signup,login}` endpoints and the existing session identity model. No external identity provider, no browser-stored password, and a POST-only non-JavaScript form fallback. Password storage/security remains the existing salted scrypt implementation, hashed server-side session tokens, Secure/HttpOnly/SameSite cookies on HTTPS, same-origin JSON write enforcement and rate limits. Production registration still requires durable Postgres/disk with backups and verification/recovery readiness; do not claim deployed auth availability without checking it.
- New files: `public/community/movie-nights-premiere.css`, `public/community/movie-nights-premiere-auth.js`, `tests/movie-nights-premiere.test.cjs`. Edited `ui/movie-nights.js`, `server.js`, `tests/movie-nights-browser.test.cjs`, and `.github/workflows/check.yml` to include real Chromium marquee/modal checks and screenshot artifacts.
- Static parser checks were passed for changed JS. The earlier GitHub Actions UI run failed one new test at the sign-in tab interaction; source commit `9d71bb1b94a33a96798dc4dccd211a6ea10c57a2` updated tab handling. Full updated Actions and browser validations have not yet completed when this checkpoint was written; keep PR draft until successful evidence is inspected.

Updated: November 20, 2026 (UTC).

## Active Movie Nights and screenshot corrections

Work continues on isolated review branch `feat/swifly-movie-nights-20261116`, based on main `35751429ce99446b07893920595f30037e51055b`. **Complete verification before changing main or production.** The November15 freeze applied while building the review version. A newer user instruction in the November20 merge chat explicitly says “Merge the new movie nights”; that authorization permits the completed, verified integration. No merge occurred there because this branch still had zero remote commits ahead of main. The requested work includes Home controls, episode design and featured synchronized Movie Nights. Production was last observed live on the same35751429 app, Render deployment `dep-dbvpg05ckfvc73bsehg0` (November20). The older deployment sections below are historical.

Spec and plan: `docs/superpowers/specs/2026-11-20-movie-nights-design.md` and `docs/superpowers/plans/2026-11-20-movie-nights.md`.

Implemented locally: independent underlined Home movie/series period controls with in-place native React rail refresh; Kids duplicate-search and parent-button layout fixes; matte episode lists, actual progress/watched controls, one expanded season and24-episode paging; persistent automatic Movie Nights service and livestream-style page with shared native source, personal pause/Resume Live, account voting, bounded live chat and reconnect. Friday/Saturday20:00 America/New_York and a five-minute voting cutoff are configurable implementation defaults. Keep existing parental/access secrets, ripples, artwork, account storage and iPad safeguards.

Service source commits: `0a66452`, `57d6dac`, `266b352`, `6f60efc`. Independent review led to corrections for stale vote snapshots, overlapping source recovery, scheduler/read load, cancellation, lease expiry, chat limits, namespace disposal and boundary/outage scheduling. The final41-case service check passes and the scoped independent service review is approved. Client/UI and focused native rail, episode and child checks pass locally. Initial full local suite passed1840, failed5 and deferred299 browser cases; all five failures were corrected, and their62-case focused rerun passes. Syntax and Vite build pass; final integrated suite/rendered verification remain pending.

The executable at `/usr/bin/chromium` cannot start in this runtime: a Unix process-singleton socket is denied. Use hosted Chromium; do not repeat local launch attempts or ask to weaken permissions. The previous native iPad test hang came from awaiting decode on offscreen lazy horizontal posters; the test now waits only for visible images with a bounded condition. This is not a claim of physical iPad frame-rate verification.

No Movie Nights/UI release is live yet. Two integration review findings—local media Retry and cached playback after lost admission—were reproduced and corrected with3 RED→GREEN regressions; the9-case client/UI set passes. Remaining work: hosted real React screenshots and two-client media sync, visual inspection and correction, independent whole-change review, exact final checkpoint and concrete review delivery. Merge/publication is now authorized after checks and visual review pass; do not merge an incomplete or unverified tree.

## Active reference alignment correction

The user rejected the latest visual result after deployment. Work is continuing in `feat/swifly-reference-alignment-20261115`, based on live app `791a850c457b0d37517a5b8c372f72d7b89335d7` and the locally preserved documentation checkpoint `544ca8c`. Do not publish that checkpoint alone as completion of the new request.

Latest requirements: match ShuttleTV’s actual underlined period control/popout; use AI Picks’ actual design components and final cascade for Audiobooks; make Kids a child-safe version of the normal site with native navigation, hero, rails, Movies/Series/Browse/search/details/episodes/player. The live reference was opened and measured (24px/600 heading and trigger, purple2px underline with4px offset, rounded14px popout and150ms animation). The prior geometry-only acceptance was insufficient for the requested visual match.

The focused spec/plan are `docs/superpowers/specs/2026-11-15-reference-alignment-design.md` and `docs/superpowers/plans/2026-11-15-reference-alignment.md`. Preserve the passing ripple behavior, movie hierarchy/pagination, iPad safeguards, parent protections and configured secret. Current stage: period fixes are committed as `1f2bf3a` (70 glass and12 catalog checks pass); Audiobooks is committed as `6048164` (29 focused checks pass); native Kids is committed as `890bd2b3096674cd33a634a0fdba4032b61c1d4f` (178 focused checks pass,7 browser cases deferred). Syntax/build pass. Integrated local suite passed1,785 nonbrowser checks with288 browser cases deferred. Fresh review found native Kids material, controller Back/search, genre destination and player-entry continuity issues; they were reproduced and corrected, with70 glass and79 native navigation/loading/controller checks passing. The reviewer also identified and reproduced the remaining Studio AI-result cascade mismatch; shared default-list/width/spacing/opaque selectors are now corrected and focused comparisons pass. Hosted rendered comparison, final review and release are pending. Kids uses a native safe shell, child-scoped routes and verified data, with bounded season/episode rendering. All production secret/account settings remain unchanged. Production remains the verified app below until the new reviewed source is released.

## Completed native sections and Movies corrections

- PR https://github.com/lukasbonthy/SwiflyTV/pull/165 is merged. Live application commit: `791a850c457b0d37517a5b8c372f72d7b89335d7`; its tree exactly matches tested source `765d698a597d304a6ae94c227383083c4d325f86` / tree `7916b2503dc483189e5b27df3ff99f6e20132aa0`.
- Render deployment `dep-dbsso4u8bjmc73etrgbg` is **live**, finished `2026-11-15T15:14:30.287412Z`. Production: https://swiflytv-1.onrender.com. The release checkpoint following the application commit is documentation only, tagged `[skip ci] [skip render]`; keep it distinct from the running revision.
- Kids, Audiobooks, Study and Languages now follow the existing dark catalog design, inherited typography and compact controls. Removed the audiobook landscape/mood controls, pastel Kids branding, oversized serif headings and language postcards. Original Study scenes and saved layouts, audio/progress/history, language filters/pagination and all parental safeguards remain functional.
- Movies retains its original title/Genres menu, hero and row hierarchy. The Popular movies row alone adds an underlined Today / This week / This month selector with a smooth popout, keyboard dismissal and reduced-motion support. Period choice leaves the regular hero/Browse sources unchanged; month means popular releases in the current UTC calendar month. Real pagination and cross-row diversity remain in place.
- Ripples sample 24×14 across the complete frame, share whole-frame subject colors with black border regions, and update during an active ripple. Black frames retain recent chromatic movie color; an opening black frame or protected source uses existing artwork or a stable movie-specific fallback. Offscreen/fullscreen/access/motion sampling limits remain intact. Visibility observes the movie page so effects toggles can recover without falsely stopping the ripple.
- Final source check `43727274522` and PR check `43727279542` both passed: 1,772 unit/service checks, recommendation evaluation and 20 story-route checks; 29 featured/artwork plus 225 wider browser cases with zero browser failures/skips;33 integrated scenarios with 335 assertions and six screenshots. The unit phase defers 283 browser cases until hosted execution.
- Focused visual run `43727274520` passed 144 cases with zero failures. Its four model-dependent skips are covered by the prepared wider workflow. Artifact `14166982315` contains 383 screenshots/diagnostics; SHA-256 `032eeb0ac1606ba012e91ccb6c71e65d31ee62de3609dd6ae18ea7c11b8441e5`. Nineteen representative final states were inspected, including desktop/phone/320px period menus, actual center-colored video with black edges, actual black video retaining color, native sections, narrow listening controls and Study navigation/drawer/Focus/fullscreen/large-target states.
- Authenticated production verification passed **39 checks**: 14 routes, 19 exact asset/bundle hashes, genuine next-page results, period control and unchanged regular hero, real audiobook title/author searches with positive audio/chapter metadata, and an isolated browser parent-lock cycle. An adult title was blocked, a wrong password rejected and the correct password unlocked. Initial application error logs contained zero errors. Private evidence: `/workspace/scratch/7372448636fd/native-final-live-verification.json` and `native-final-review-evidence.json`; never expose the associated cookie file.
- Fresh review findings are resolved, including Study wrapped-navigation and player/drawer spacing, large targets and saved/fullscreen layouts, audiobook contrast and obsolete cover gradients, language targets, and ripple recovery after effects toggles. Details: `docs/SWIFLYTV_NATIVE_REVIEW.md`; the native correction plan is complete. No implementation or deployment work remains pending for this release.
- Do not rotate the configured private `SWIFLY_KIDS_SECRET` or change existing account/access settings. Parent controls remain browser scoped. Physical iPad Safari frame rate and every external provider remain outside hosted verification. Preserve prior iPad safeguards and local histories.

## Completed experience overhaul

- PR https://github.com/lukasbonthy/SwiflyTV/pull/164 is merged. Live application commit: `3e2c04663ccca9582dd609fca857d902174f3ec1`; its tree exactly matches tested source `608248cd84597ebbe155c0fff76b877beed25074` / tree `da5f95d8a7816ca540a03ce11f4e669f0d2a097c`.
- Render deployment `dep-dbsj3klbedkc73c8tlhg` is **live**, finished `2026-11-15T04:16:59.41959Z`. Production: https://swiflytv-1.onrender.com. The subsequent checkpoint commit is documentation only, tagged `[skip ci] [skip render]`; keep it distinct from the running application revision.
- Delivered clear movie-card actions, continuously frame-colored ripples through the header/lower page, cinematic aspect-ratio transitions, clean artwork fades, stronger detail hover/focus feedback and matte episode browsing. Person, Study, Community, languages, audiobooks and Kids have redesigned functional flows. Discovery has real pagination, cross-row diversity and popular-movie time periods.
- Final source-branch check `43674646633` and PR check `43674649299` both passed: 1,760 unit/service checks; recommendation evaluation and all 20 story-route checks; 29 featured/artwork plus 225 wider browser cases with **zero browser failures/skips**; 33 integrated acceptance scenarios with 335 assertions and six screenshots. The unit phase defers 277 browser cases until browser-enabled execution.
- Visual run `43674646634` passed 138 cases with zero failures. Its four model-dependent skips are covered by the wider workflow, which prepares the models. Artifact `14146530561` contains 263 screenshots/diagnostics; representative desktop, phone, tablet, TV and controller states were inspected. The composed screenshots prove visible ripples above the film, in the margins and behind the title while actual video plays. Moving detail sheets recorded zero layout work during sampled animation frames.
- Authenticated production verification passed **38 checks**: 13 routes and 20 exact asset/bundle hashes, distinct first/next movie pages, real audiobook title and author searches with playable results and chapters, and an isolated browser parent-lock cycle. An adult title was blocked, a wrong password rejected and the correct password unlocked. Initial application logs contained zero errors. Private evidence is `/workspace/scratch/7372448636fd/live-experience-verification.json`; never expose its associated cookie file.
- The dedicated `SWIFLY_KIDS_SECRET` is configured privately in Render. **Do not regenerate or rotate it.** Existing account/access variables were preserved. Parent controls are explicitly browser scoped; conservative ratings, route/media guards and destination-bound HLS tokens are enforced. Community creator permissions use immutable account IDs.
- Physical iPad Safari frame rate remains unmeasured. Hosted browser fixtures exercise real local application handlers and media but do not validate every external movie provider. Protected cross-origin frames use the neutral ripple fallback. The optional separate cloud-browser review stopped at the access gate; its temporary tab was closed, and authenticated HTTP plus hosted browser evidence completed verification without another user login.
- The prior overhaul and native sections correction above are complete. Preserve the local histories and prior iPad safeguards. Preserved overhaul worktree is `work/swifly-experience-release`; the completed spec, plan and review are under `docs/superpowers/` and `docs/SWIFLYTV_REVIEW.md`.

## Source and production

- Repository: https://github.com/lukasbonthy/SwiflyTV
- Production branch: `main`
- Site: https://swiflytv-1.onrender.com
- Render workspace: `tea-csptd58gph6c73b7sv30`
- Render service: `srv-db6fjrp42hec73c2tn30` (SwiflyTV-1); automatic deployment on `main`.
- Running application commit: `791a850c457b0d37517a5b8c372f72d7b89335d7`.
- Render deployment: `dep-dbsso4u8bjmc73etrgbg`, confirmed `live`; finished `2026-11-15T15:14:30.287412Z`.
- Prior iPad optimization source: `b0633f90acf95d450ff5bf32f20c355d946d9939` (CI run `43228735178` passed). Prior source: `931871ab7837e163a070be9764b4c7a4eb382048`. Previous source: `a573341ae3c7b3448fafe3e731b9ed190e327f51`. Previous source: `24038dd6ebdf31c63ec0f085fcf35bf1aa401873`. Subsequent pre-overhaul source: `7329ea8134853e6b17c287f0a6708cfd08f96700` (build/UI/recommendation and featured/artwork browser checks passed; extended browser checks running at deploy).
- Previous player-motion source tree: `a3966af72f9d1aed451a3fef582bf8624a2d55eb` (retained in current release).
- PRs #157 (player motion), #159 (iPad artwork), #160 (iPad optics/caching), #161 (iPad prefetch), #162 (iPad featured-art pinning), and #163 (iPad double-fade fix) merged; latest https://github.com/lukasbonthy/SwiflyTV/pull/163.

## iPad featured black-frame fix v5 (November 12)

The user reported #162 did NOT fix iPad featured image flashes. A concrete cross-controller conflict was identified: #162 inserts a previously decoded `<img class="svFeaturedNativeArt">` for each featured film, but the global `ui/artwork-entry.js` observed all `main img` and added `svArtworkAsset`, which explicitly set `opacity:0` before a 420ms fade. The original featured browser fixture did not mount the artwork-entry controller and therefore missed this interaction.

- PR #163 https://github.com/lukasbonthy/SwiflyTV/pull/163: on iPad only, `nativeTabletPoster` now also excludes `.svFeaturedNativeArt` from the generic fade. Ordinary images/non-iPad behavior are unchanged. The selector is compact, as is the tablet rail selector, to satisfy the <160 KB shared HTML shell budget.
- Simplified the iPad hero's compositing: removed the second full-hero `.dsHeroGlass` mask, permanent parallax backdrop transform and negative z-index; explicit hero art/glass/text stacking preserves visuals and native slide `translate` animations. A previously baked 64×36 movie-palette field is retained behind the decoded photograph as a non-black texture-eviction fallback. No extra network request or per-frame computation.
- Added JSDOM tests for dynamically inserted decoded featured images bypassing the fade on iPad; extended `tests/featured-rotation-browser.test.cjs` to load the real artwork-entry controller on iPad fixture and assert no double fade, proper image opacity, masks, stacking and scroll return.
- Tests: GitHub Actions run `43282084170` passed `npm run check`, full `npm run test:ui` (including 160 KB shell budget), recommendations and dedicated featured/artwork browser suite. Extended browser suite was still in progress at release. Earlier intermediate commits failed the HTML size-budget test; those were fixed before merging.
- Merge commit `5b5cd54beff34f0ce11d725c64e31177ddc321ad`. Render `dep-dbr0hfs9v7es738ar1tg` confirmed `live` on exactly that commit at 2026-11-12T18:44:13.887186Z; startup logs show server listening and Render's health success.
- Still requires physical iPad test; this fixes an actual code conflict, but WebKit may independently evict GPU textures under memory pressure. If still present, collect an actual screen recording and distinguish black flash during manual/automatic featured switches vs vertical return scroll with rotation paused; inspect Safari remote Web Inspector and WebKit hardware behavior.

## iPad featured black-frame fix v4 (November 12)

The user reported that scrolling away from then back to the featured movie still caused a short black frame/re-render even after the catalog poster fixes. The featured carousel used temporary decoded `Image` objects but painted its visible titles as giant CSS backgrounds inside a full-hero WebKit mask; inactive CSS layers were also `display:none`, making texture eviction on iPad return plausible.

- PR #162 (https://github.com/lukasbonthy/SwiflyTV/pull/162): on iPadOS (including desktop-class iPad user agents), pin decoded featured artwork as a real `<img class="svFeaturedNativeArt">` inside existing double-buffer slots. The first server-rendered CSS backdrop stays visible until its decoded DOM image is ready. Incoming titles reuse the prepared decoded image rather than painting a separate CSS background. Reusing an already mounted image does not detach/reinsert it.
- Keep the inactive image slot connected, use opacity 0 instead of display:none for the hidden iPad layer, and replace the full hero alpha mask with a single static darkening/fade overlay. Auto-rotation timing, colored glows, buttons and all non-iPad paths remain intact. iPad cache retains at most 3 prepared hero images. Bumped `featured.js` asset URL v6 to v7 for the one-day cache.
- Added an iPad-UA browser regression in `tests/featured-rotation-browser.test.cjs`: image decoded/visible, no CSS image behind the decoded layer, same DOM image after returning from a long scroll, previous DOM image still mounted through a title change. CI `43270159690` passed `npm run check`, `npm run test:ui`, recommendations and featured/artwork browser suite; extended browser suite was still running at release.
- Merge commit `5d0bc9cb3ad9a01e519f9dde48d16459add74153`; Render deployment `dep-dbqvgu49v7es7388ut3g` confirmed live at 2026-11-12T17:34:42.122037Z; server startup logs successful. Physical iPad Safari must still verify absence of WebKit texture eviction and black frames; do not claim 100% proven.

## iPad poster-priority warmup v3 (November 12)

User still reported slow artwork loading on iPad after #159 and #160. Root cause likely includes the server's explicit `loading="lazy" fetchpriority="low"` for every catalog poster, delaying near-visible downloads. #161 targets actual image fetch prioritization rather than more paint effects:

- Early artwork-entry controller now detects iPad (including desktop-class Safari UA), observes catalog rails with **one** IntersectionObserver and a 1100px vertical lead, and promotes **only one visible page plus a small buffer** to `loading="eager"` with `fetchpriority="auto"` or `high`. Distant rails/images remain lazy/low. This covers vertical page scroll.
- For sideways native rail swipes, a passive scroll handler warms the next few images, coalesces to a frame and caches the poster node list. This does not replace nodes, rewrite TMDB URLs, fetch all posters, or affect desktop/phone behavior.
- New tests `tests/ipad-poster-priority.test.cjs` verify bounded near/far priorities, horizontal preload, DOM stability and non-iPad isolation. Updated `tests/ipad-catalog-scroll.test.cjs` for the new eager-nearby behavior. Latest GitHub Actions job `43251595030` passed build/UI/recommendations and artwork-entry browser checks; extended browser checks were still in progress at deployment.
- Latest production: PR https://github.com/lukasbonthy/SwiflyTV/pull/161, merge `22d7e4105979325ae207c091c17fd8d480a7055d`, Render `dep-dbqu0ugjo6nc73bb57r0` confirmed `live` at 2026-11-12T15:52:27.202533Z.
- Physical iPad test still needed; WebKit can discard decoded image data when memory is pressured. Do not promise perfect zero-latency scrolling. If the user reports persistent slowness, investigate images' response timings/CDN caching and real-device Safari instrumentation rather than stacking more CSS/animations.

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
