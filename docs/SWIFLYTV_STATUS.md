# SwiflyTV working checkpoint

Updated: November 11, 2026 (America/New_York).

## Source and production

- Repository: https://github.com/lukasbonthy/SwiflyTV
- Production branch: `main`
- Site: https://swiflytv-1.onrender.com
- Render workspace: `tea-csptd58gph6c73b7sv30`
- Render service: `srv-db6fjrp42hec73c2tn30` (SwiflyTV-1)
- Automatic deployment is enabled on commits to `main`.

## Completed before this continuation

PR #153 was merged at `0dbfe2403421d285228020ad42e50a3abc7a3b69` and Render deployment `dep-dbqghoff3r2c73f55q5g` is confirmed live. This includes the supplied transparent SVG navigation bird, the colored bird favicon, removal of the separate featured pause/play button, and the single initial black dissolve. The artwork gate no longer waits on optional deferred scripts or document-wide font readiness.

Do not implement those changes again. Preserve the current mobile composition, native scrolling, seven-title catalog windows, Studio settings, glass effects, progress controls, and late artwork handling.

## Current continuation: favicon corners

The last chat stopped while publishing the transparent-corner favicon. The existing local work was recovered on `fix/favicon-transparent-corners-v181`; no new logo was generated in this continuation.

The prepared change replaces `public/brand/swiflytv-favicon.png` with the recovered RGBA PNG and changes favicon URLs to `?v=181` in the regular page shell, access page, and `/favicon.ico` redirect. The SVG navigation logo stays at `?v=180`.

Verification completed on the prepared patch:

- The PNG is 1254 x 1254, RGBA, with alpha 0 at all four corners.
- `node --test tests/brand-assets.test.cjs`: 2 passed, 0 failed, 0 skipped. This checks branding declarations, access-page availability, served bytes, the legacy redirect, and the browsing access gate.
- `npm run build`: passed.
- `node --check server.js`, `node --check ui/access-page.js`, and `git diff --check`: passed.

Remaining at this checkpoint: publish the prepared patch, wait for its Render deployment to become live, compare the deployed icon bytes with the tested asset, and replace this paragraph with the final commit/deployment evidence. Do not claim completion based only on an accepted push or deploy trigger.

## Keeping future chats resumable

Read this checkpoint and current Git/Render state first. Keep large image data and full historical diffs out of conversation output. Transfer local binary assets directly, display compact verification results, and record any unfinished step here before a handoff. The chat length limit itself cannot be changed by repository code.
