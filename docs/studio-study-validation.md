# Studio, Study and requested updates — implementation evidence

Repository: [lukasbonthy/SwiflyTV](https://github.com/lukasbonthy/SwiflyTV). Branch: `feat/studio-study-expansion`, based on main `8d3cf95e8c65e659281fe9f460cdbf4f36f66330`. This report accompanies an unmerged implementation PR. Production deployment is outside this delivery.

## Scope delivered

The implementation extends the existing Express/vanilla JavaScript site and native player. It preserves the complete AI form, catalog, source providers, downloads, accounts, social features, watch parties, controller navigation, access gate and Aurora. There is no second app, iframe, new framework or paid service requirement.

| Owner brief group | Status and actual integration |
|---|---|
| 1. Homepage builder | Implemented: real row order/visibility, accessible Up/Down and drag, hero layout/placement, poster width/columns and rail/grid. Continue Watching retains its own empty state; one available catalog row remains visible. |
| 2. Advanced theme creator | Implemented: existing looks, seven accents/custom HEX, secondary/canvas tint, gradient/font/material controls, contrast feedback and subsection resets. Shared first-paint/live tokens reach actual surfaces. |
| 3. Player customization | Implemented: real playing transport, control/progress/time/icon/material/placement/autohide options, caption preview and native subtitle styles. Changes preserve the mounted video, current time, track selection and party authority. |
| 4. Adaptive cinema | Implemented: opt-in real artwork sampling, bounded cache including CORS failures, safe fallback and reduced effects while playing or using low-power policy. |
| 5. Navigation designer | Implemented: desktop/mobile DOM order and top/sidebar, labels/icons/density/active treatment; critical controls and TV/mobile fallbacks remain reachable. |
| 6. Loading screen Studio | Implemented: five styles, dim and speed; the existing observable readiness and hold/release lifecycle controls dismissal. No false percentages or forced minimum wait. |
| 7. Social and AI HUD | Implemented: actual notification and AI presentation controls. The existing full form and submitted values remain functional. |
| 8. Poster interaction editor | Implemented: lift/zoom/reveal/flat, action visibility and keyboard/controller focus parity, without per-card pointer loops. |
| 9. Profile appearance | Implemented per verified account/profile locally, with migration and owner-switch guards. Appearance cloud sync is explicitly unavailable; working export/import transfers a look between browsers. This is the fallback permitted by the brief. |
| 10. Performance/device presets | Implemented: Auto/Desktop/Mobile/Xbox/Minimal with separate device-local overrides, bounded materials and honest descriptions. No simulated FPS or CPU score. |
| 11. Accessibility/captions | Implemented: scale, high contrast, focus, large targets, reduced transparency and OS preference priority, semantic controls and cancellation. Native caption support is tested; renderer-owned captions retain their documented limits. |
| 12. Theme export/import/sharing | Implemented: named-look CRUD/duplicate, actual file and clipboard export, file/paste import review, strict 32 KiB UTF-8 validation and reversible preview. Portable data excludes private identity/library/device/credential fields. |

Swifly Study is native at `/study` and `/study/room/:slug`: all 19 actual music files, seven scene loops/posters, ambient mixer, playlists/search/favorites/seek/volume, focus timer/tasks/statistics/streaks, layouts/setups/share links/focus-card export and nine coworking rooms. Room presence works with devices off; camera/microphone/screen sharing require explicit controls. Same-room session checks, media-capture races and complete leave/teardown are covered. The 33 bundled files total 125,378,097 bytes and retain source Git blob provenance in `public/study/attribution.json`.

The supplied update list is covered in [feature-parity.md](feature-parity.md): upcoming episodes, ordinary metadata recommendations, List/history/folders, episode bell/read state, optional Trakt integration, IntroDB/automatic intro skip, last successful server, episode rows/order, full filmographies, accents, shuffle, ratings, next-episode/stale Continue, spoilers/watched/bell preferences, search refinements and personalized rows. Existing downloads, mobile navigation, reduced motion and AI mood/story search remain present.

## Reproduce verification

Use Node 20 or later and the existing package dependencies. Install Chromium with `npm run install:browser`. `SWIFLY_TEST_BROWSER_EXECUTABLE_PATH` can select an installed executable. This managed runner uses Chromium 131 / Playwright build 1148 headless shell; the runtime is Node 24.22.1. CI uses Node 20.

```sh
npm run check
npm run test:ui
npm run prepare:ai
npm run test:recommendations
npm run test:acceptance
```

The complete test suite runs with concurrency two so browser animation-clock checks do not contend with dozens of browser processes. The workflow separately runs browser cases after installing Chromium and then runs the integrated acceptance script. No known failing check is intentionally skipped in the final local browser-installed run.

The final browser-installed release run passed **1,548 tests, zero failures, zero skips** in 352.3 seconds. `npm run check` also passed. [verification.json](evidence/verification.json) records the tested source checkpoint and exact commands/results; the PR checks identify the published GitHub Actions result.

AI verification uses the actual local quantized BGE model already introduced on main by the previous search work. The fresh challenge run produced 78/80 top-one and 80/80 top-three positive matches; 6/8 unsupported prompts correctly abstained; 20/20 story route checks passed. These are fixed development-fixture results, not a live-catalog guarantee. Two unsupported examples still produced false matches (the rat chef and silent tramp descriptions); the AI is not represented as infallible.

## Integrated browser acceptance and screenshots

The final acceptance run passed **33/33 scenarios with 326 assertions and six screenshots**, with zero fatal page errors, failed local assets or MP3 requests before Play. [acceptance-integrated.json](evidence/acceptance-integrated.json) records the actual source hashes, contexts, assertions, route visits and asset requests. The script runs the real server, account verification, scripts/styles, Library storage and Socket.IO. Only external metadata/artwork/fonts and the runner's unsupported OS gamepad service use fixtures. Dedicated controller suites exercise controller input separately.

The six visited routes are Study, Settings, List, Search, a real TV detail route and Home. Checks include all ten Studio tabs and Save/Cancel, music Play/Pause with actual local MP3 requests, presence-only room join/leave, tasks/timer, folders/history, five search refinements, actual episode API/grid-row/order/spoiler/certification behavior, Continue, metadata recommendations and independent episode bell. Fixed old fixture air dates deliberately yield an honest empty episode bell; separate feed browser tests cover unread/read behavior with current fixture airings.

- [Study desktop](evidence/study-desktop1440-integrated.png)
- [Study phone, 320 px](evidence/study-mobile320-integrated.png)
- [Studio desktop, actual Player controls](evidence/studio-desktop1440-integrated.png)
- [List phone](evidence/library-mobile320-integrated.png)
- [Settings desktop](evidence/settings-desktop1440-integrated.png)
- [TV details, 1920 px](evidence/tv-details-1920-integrated.png)

The screenshots show bundled Study media and labeled fixture catalog artwork. They are local browser evidence, not a deployed preview.

Acceptance found and repaired two integration bugs: Study had requested an MP3 before explicit Play, and a verified guest's Continue row did not redraw after Library readiness. The actual pre-fix music network evidence is retained in [acceptance-audio-regression.json](evidence/acceptance-audio-regression.json). Selection now binds no media source until Play; a delayed-readiness regression protects Continue.

## Performance evidence and limits

[shell-bytes.json](evidence/shell-bytes.json) compares the same `pageShell` title/body/active fixture in independent processes on main and the branch. It measures response bytes only:

| Measurement | Main | Studio/Study |
|---|---:|---:|
| Raw shell HTML | 141,594 bytes | 146,491 bytes |
| Gzipped shell HTML | 33,918 bytes | 33,457 bytes |
| Inline JavaScript | 91,107 bytes | 62,928 bytes |

The expanded controls add raw markup; gzip remains slightly smaller. The 45,235-byte TV controller is now a separately cached one-day asset instead of being repeated inline on every page. Its first fetch still costs a request and 13,069 gzipped bytes; cache reuse is the benefit. This is not a claim that first navigation or every device is faster.

`scripts/benchmark-studio.cjs` measures scrolling RAF gaps, poster hover/focus, details open/close, Studio tab changes and live player Settings against an identical 36-card fixture on each checkout. It reports one warmup, five samples, medians and raw values, including automation/readiness/two-frame overhead. Headless software rendering and these small samples do not establish physical device FPS or a statistically significant speedup.

Medians in milliseconds, **main → branch**, from [performance-main.json](evidence/performance-main.json) and [performance-branch.json](evidence/performance-branch.json). Each scroll result includes 150 RAF gaps after warmup; each action includes five measured samples. Details includes both opening and closing. These action figures include automation overhead and two frames.

| Device | Scroll RAF gap | Hover/focus | Details round trip | Studio tab | Player Settings |
|---|---:|---:|---:|---:|---:|
| desktop | 16.7 → 16.7 | 140.9 → 71.5 | 1443.8 → 1420.8 | 297.6 → 260.6 | 115.8 → 141.3 |
| mobile | 16.7 → 16.7 | 31.8 → 32.0 | 1234.5 → 1215.3 | 112.1 → 141.4 | 137.5 → 78.3 |
| tv | 33.3 → 16.7 | 67.6 → 32.2 | 1357.8 → 614.1 | 392.0 → 132.2 | 139.5 → 86.3 |

Results vary by action/device; desktop Player Settings and mobile Studio tab samples were slower. All measured player scenarios kept playing. No blanket speed improvement or physical-device frame-rate claim is made.

## Independent review and disposition

One independent read-only whole-branch review found no established Critical issue and four Important findings: concurrent local edits replacing a completed Trakt import, automatic Trakt deltas lost on ordinary navigation/transient failure, completion becoming unretryable after a quota failure, and the text-size control lacking a rendered consumer. All four were fixed in one pass with failing-then-passing regressions: Continue makes completion durable/retryable and partitions its cache by account; Account/Library/Settings rebase native library changes and retain an owner/profile outbox until matching acknowledgement; the shared styles apply validated text scaling to actual authored typography while keeping captions/video independent. The final combined run after those changes passed all 1,548 tests with no skips.

One Minor finding is explicitly deferred: `lib/trakt.js` currently holds the shared account-store transaction during a rotating-token refresh. A slow provider can delay unrelated account-store operations by the configured refresh timeout (default eight seconds). Keeping the existing single-use token serialization is deliberate for this delivery; a later per-account cross-instance lease can move that network request outside the shared transaction. This limitation was reproduced with the real file account store; no production-load claim is made.

Review scope rulings:

- Physical Xbox/native controller hardware, the native screen picker, cross-network TURN and live Trakt require unavailable devices/networks/credentials; browser/controller/protocol coverage is reported separately.
- External TMDB, IntroDB and playback-provider availability remains external. Local fixtures establish integration behavior, not live upstream uptime.
- The 33 assets retain owner-repository provenance and attribution. Raw binary licensing was outside the reviewer assignment; scene media is owner-supplied and is not relabeled CC0.
- Local profile appearance plus portable export/import is the brief's permitted cloud-sync fallback. Community theme hosting is outside this release. Interface text scaling applies to native shell/page/Studio typography; decorative SVG/canvas/image content and the standalone pre-access gate retain their own typography. Captions keep their separate size control.
- Search refinements are current-page; the episode feed covers bounded recent/next metadata rather than every intervening episode; shuffle samples a bounded real catalog candidate page rather than promising uniform selection across the entire catalog. These limits are accepted and disclosed in the relevant UI/docs.
- Trakt ratings, collections, playback position, repeat play counts and automatic background pulls are outside the requested watchlist/watched integration. Earlier BGE model work is preserved baseline, not a new model change in this branch.
- Dormant legacy hero maturity placeholders have no active call site in this change. Aesthetic comparison with ShuttleTV was not a proprietary pixel comparison; screenshots show the original native Swifly design for owner review.

## Setup, boundaries and release state

Trakt needs an existing signed-in SwiflyTV account, a persistent account store and three server environment variables: `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`, and `TRAKT_REDIRECT_URI`. Register the last as the exact HTTPS SwiflyTV origin plus `/api/trakt/callback`. Then link in Settings and use Sync from Trakt. Credentials were not supplied, so live linking/import was not performed. Local protocol fixtures cover PKCE, account/session state binding, refresh, pagination, concurrent edits, deltas, cooldown and unlink. See [trakt.md](trakt.md).

Study room board/community totals are real observations for this server session and reset with the process. Personal Study data and Studio appearance are browser/profile-local, as labeled. Remote camera/mic media was verified with two real local Chromium peer connections and incoming audio/video RTP; physical Xbox, the native screen-picker UI and cross-network TURN connectivity were not exercised. The shared existing ICE configuration supports operator-supplied TURN; STUN alone cannot guarantee every network.

Search rating/date refinements operate on the current upstream result page and say so in the UI. US content certifications come from actual available metadata. Caption styling applies to browser-native tracks; third-party renderer-owned captions have the documented browser/provider limitation. External media and intro database availability remain external dependencies; missing results are not fabricated.

Process rulings: use bounded independent implementers and one final independent whole-branch review; keep the existing native architecture; preserve explicit Studio ordering over inferred personalization; keep OS accessibility stronger than stored looks; use the brief's local-profile/export fallback instead of claiming unsupported cloud appearance sync. No community sharing backend or paid infrastructure was invented.

The PR must stay unmerged. No production deployment is performed by this implementation. The operator can review the source, screenshots, setup requirements and CI before authorizing any release.
