# Account recovery, simpler Studio and page usability

SwiflyTV now has actual Account actions for **Import account data**, **Recover browser data** and **Export backup**, linked from Settings, empty libraries and account navigation. Studio opens in Simple mode with a curated theme gallery and an optional Advanced controls switch. The route-by-route review and concrete page changes are documented in [usability-review.md](usability-review.md).

## Recovery behavior

- Import a SwiflyTV account backup JSON file, review real counts, choose each destination profile, then explicitly merge. Cancel and file validation do not write. New profiles keep their backed-up library preferences; existing destinations keep theirs.
- Existing saved titles, favorites, folders, exact episode history and resume positions are retained. Repeated imports do not duplicate records. Newer timestamped progress wins, including when another device changes the account during upload. Concurrently added profiles and Continue entries survive a revision conflict.
- Export includes supported personal data available on this browser: profile metadata and icons, lists, folders, watched/history/resume data, appearance/named looks and Study data. Uploading a backup does not authenticate or recreate a server identity.
- Passwords, cookies, session credentials, Trakt tokens/connections, private messages, friends and room credentials are excluded. Uploaded Study backgrounds are not transferred. Matching profile appearance can be explicitly restored; Study tasks/favorites/statistics are merged without adding repeated totals.
- Browser recovery exposes guest/legacy copies and the verified account's own cached data. An earlier account partition may be offered when saved owner metadata matches the verified email. Unattributed private partitions are not exposed. Old versions did not always retain that metadata; the UI does not claim every old account can be recovered.
- Account activation archives meaningful data before clearing its active cache. Later guest libraries do not replace earlier ones, empty guest sessions do not consume recovery copies, and the source remains after recovery.
- Quota failures roll back all touched values, freeing enlarged replacements before restoring the originals. Incomplete restoration is reported explicitly. A failed account upload leaves local data and pending changes, with a Retry action bound to its original account/profile. An account change clears the review and retry UI.

The backup format is `app: "SwiflyTV"`, `kind: "account-backup"`, `version: 1`, with up to eight profiles and a 2 MiB UTF-8 file limit. Existing account upload limits remain 400,000 bytes per patch and 800,000 bytes for synced state. Per-profile bounds remain 300 Saved, 300 Favorites, 300 History, 1,000 Watched, 80 Continue entries, 50 folders and 12 saved looks. Oversized merges fail visibly instead of silently dropping titles.

The confirmed source issues were the absent recovery UI, replacement/deletion in the old legacy importer, and unsafe cache activation when storage failed. No live database diagnosis was made. If a prior identity or server data was deleted and no browser copy or backup remains, this interface cannot reconstruct it. The existing PostgreSQL/file account store and session authentication were preserved.

## Studio and themes

Simple mode presents Themes, Homepage, Player, This screen, Comfort and Saved looks. Advanced reveals every existing technical control, including HEX palettes, material tuning, navigation, Aurora, HUD/AI presentation and JSON editors. The mode is stored separately from profile/theme settings. Hidden controls leave keyboard navigation; switching modes preserves staged values, validation errors and Save/Cancel. A deep link to an advanced section reveals it safely.

The gallery includes Swifly Original, Halloween, Winter Lights, Cinema, Midnight, Forest and Focus. Halloween uses pumpkin/amber accents and a dark violet canvas; Winter Lights uses evergreen and champagne. Original CSS miniatures and restrained seasonal light avoid external theme assets. Theme patches change appearance only, preserving library, homepage/navigation choices, AI inputs and device/comfort settings. High contrast, reduced motion/transparency and lightweight TV policy remain authoritative. Themes use the existing first-paint/live preview/persistence path.

## Concrete page fixes

The source review covered every requested route family. Browser review rendered 49 routes/aliases at both 320 × 844 and 1440 × 1000 (98 renders), then 18 changed routes at both sizes (36 more). The integrated review reported no fatal errors, failed same-origin assets, document overflow or unnamed main-form controls. External catalog/artwork were deterministic fixtures, not evidence of live provider availability.

Changes include a real language/genre/format/sort form and persistent pagination, honest collection labels, direct Settings/Friends/Study/AI instructions, actionable library empty states and Clear filters, profile management labels, shared Favorites with durable clearing, a usable HLS URL form, and viewer-facing catalog retry states. The embedded Watch Room's missing script terminator was fixed and actual served inline scripts compile. Global Save/Like/Clear operations now report failed storage instead of pretending to save; their compatibility mirrors roll back on failure.

## Verification record

The complete test set was verified in explicit unit/API and browser groups on the final source. Logs remain with the task workspace. The GitHub PR is the publication/CI record.

| Check | Evidence |
| --- | --- |
| Syntax | `npm run check`, including all new modules |
| Account merge, quota, stale context and real API integration | 76 focused tests passed after review fixes |
| Studio | 99 focused tests and 11 browser tests passed for the implementation; final full suite includes them |
| Page behavior | 84 focused checks passed, plus root served-route and footer failure regressions |
| Integrated application | 33 scenarios / 326 assertions / six screenshots passed again on the final code at phone, desktop and TV sizes; [report](evidence/recovery-acceptance.json) |
| Full project and installed-browser checks | **1,595 passed, 0 failed, 0 skipped** across all 139 test files: 1,405 unit/API checks and 190 real browser checks. [Source hashes and results](evidence/recovery-verification.json) |
| AI model quality | Existing free BGE model/inputs preserved: 78/80 positive top-one, 80/80 top-three, 6/8 unsupported-query abstentions, 20/20 development story routes. Two false matches remain; this change does not replace the model. |

One independent whole-branch review found three Important issues: concurrent import progress loss, quota rollback order, and cross-account Retry status. All were reproduced and fixed with regression tests. Its Minor new-profile preference issue was also fixed. The review was read-only; there was no second review round. Production persistence, live streams/model downloads during ordinary use, physical Xbox hardware and real cross-network camera/TURN behavior were explicitly outside that review's evidence. No new database, paid service, framework or dependency was added.

An initial local project run overlapped browser installation after the resumed environment lost its binaries. Some browser hooks could not launch and the run was stopped. A subsequent broad-run log ended before the runner summary; the full 139-file set was then verified in explicit groups without failures or skips. It also exposed two stale test expectations (the Account asset cache version and simplified Settings title), now updated to the actual intended values. A poster-actions fixture had been intercepting the guest-session endpoint with an empty response: it now permits the real identity check and awaits Library readiness, preserving the application's verification guard.

## Screenshots

These are actual locally served UI and handlers with fixed external catalog artwork. They are not mockups or production deployment evidence.

- [Account desktop](evidence/account-data-1440.png)
- [Account phone](evidence/account-data-320.png)
- [Import review desktop](evidence/account-import-review-1440.png)
- [Import review phone](evidence/account-import-review-320.png)
- [Simple Halloween Studio desktop](evidence/studio-themes-1440.png)
- [Simple Halloween Studio phone](evidence/studio-themes-320.png)
