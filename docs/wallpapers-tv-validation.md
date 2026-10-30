# Aurora, wallpapers and TV controls

The original Aurora now works on profile selection and inside native Swifly Studio. Studio motion has its own visibility state, including on the watch page. Seasonal themes retain the selected Aurora. Reduced motion, low performance, high contrast and TV policies still apply.

Wallpapers are independent of themes. Studio offers the original canvas, Aurora, moonlit woods, winter, velvet and a personal upload. Uploads are validated, decoded, optimized and stored per profile on this browser. Theme exports and account backups carry them. Readability, crop, blur, image colors and optional Aurora overlay are reversible drafts. Cancelling a file picker or an upload cannot overwrite the previous choice. Existing advanced controls remain available.

TV navigation keeps every route and utility reachable. The native player has a full-width timeline above labeled transport/tools. Stage directions seek directly; the timeline previews repeated input and commits once on release. Back cancels held scrubbing until release. Disconnect and controller changes cancel pending previews. Calls, chat, party permissions, open menus and embedded-player boundaries retain ownership.

## Verification

- `npm run check` and `git diff --check`: pass.
- Full `npm run test:ui` with the browser intentionally absent, matching CI's unit phase: **1,456 passed, 208 skipped, 0 failed**. The browser stage runs separately.
- Installed Chromium, first CI browser batch: **122 passed, 0 failed**.
- Installed Chromium, second CI browser batch: **75 passed, 0 failed**.
- Wallpaper/account/native-video browser suites: **11 passed, 0 failed**. Actual custom upload, optimization, Save/reload/Cancel, real account recovery, invalid imported image decode and native VP8 playback at 1280×720 and 1920×1080 are exercised.
- `npm run prepare:ai` and `npm run test:recommendations`: pass. Existing pinned models and AI form controls are preserved.
- Shared shell: **159,732 bytes**, below the existing 160,000-byte budget.
- Full-server acceptance: **33 passed, 0 failed, 335 assertions** across 320px phone, 1440px desktop and 1920px TV. All eleven Studio panels are visited through the actual UI, saved and cancelled; actual account readiness, library persistence, search, settings, details, Study and navigation run against Express.

The first unit run exposed obsolete Aurora cache-version assertions; those now locate the actual stylesheet independent of its cache key. The first acceptance run stopped the Studio step at its old ten-tab assertion, which also prevented its later saved-player-style setup; the assertion is updated to eleven and the whole acceptance passes.

## Review fixes

A fresh independent whole-branch review found no Critical issues and four Important issues. The single fix pass covers all four with regression tests observed failing before the fix and passing after it:

1. Secondary guest backup isolation: primary guest images, including named looks, no longer enter another profile's fallback backup.
2. Imported rasters: complete bounded containers and dimensions are checked before application; Studio and account imports decode images before offering confirmation. Undecodable imports preserve the current data.
3. Held controller input: keyboard/gamepad scrubs keep distinct ownership; Back, disconnect and controller handoff cancel previews without a late commit.
4. Empty upload picker: opening and cancelling keeps the current wallpaper selected.

The reviewer also flagged Studio Aurora on the watch page. It was regraded Important because this is part of the user's central request and fixed with a failing/passing lifecycle regression. No minor findings are deferred. The review was followed by this bounded fix pass rather than another review cycle.

## Decisions and practical limits

1. Continue implementation and merge under the user's prior explicit release authorization. Cost if the design preference changes: another reversible change and deployment.
2. Keep uploaded images per profile in this browser and make them portable in exports/backups. This avoids adding an unrequested upload backend and prevents guest image leakage. Cost: moving to another browser requires import/export; automatic wallpaper cloud sync is not provided.
3. Use a compact labeled TV navigation row at 1101–1500 pixels and two rows only at 801–1100. This preserves the catalog safe frame and all routes. Cost: future extra routes may need another layout adjustment.
4. Pin Terser to minify trusted existing head scripts once at startup and share Studio SVG glyph styling. This preserves the original shell-size budget. Cost: small startup work and a production dependency.
5. Regrade Studio Aurora on watch as Important and let the dialog animate independently. Cost: bounded CSS motion remains in an open Studio dialog during playback except TV/reduced-motion/low-performance modes.
6. Run the full unit and installed-browser phases separately, matching CI, because a combined local run with every optional browser test enabled did not return a complete aggregate in the earlier host. Cost: the results are reported by phase, not as one combined local command. Final CI must still pass on the exact release head.

Tests use actual Chromium and native video plus controlled standard Gamepad API input. Physical Xbox hardware, third-party embedded player internals, live external media providers and a live catalog are not claimed as tested. Browser fixtures replace external artwork/catalog responses; same-origin application code and routes run normally.

## Screenshots

- [Desktop Wallpapers](evidence/wallpapers-tv/wallpapers-1440.png)
- [Phone Wallpapers](evidence/wallpapers-tv/wallpapers-390.png)
- [TV player at 720p](evidence/wallpapers-tv/tv-player-1280.png)
- [TV player at 1080p](evidence/wallpapers-tv/tv-player-1920.png)
