# Watch Together implementation

- [x] Trace conflicting CSS and duplicated player UI against c441849.
- [x] Player owner: shared embedded/standalone runtime and substantially improved controls; regression tests.
- [x] Lobby owner: replace layered party CSS and simplify lobby/active-room layout; retain service contracts.
- [x] Root: watch-party sidebar/dialog, legacy watchroom presentation, remove conflicting global party styles and integrate assets/templates.
- [x] Integrate, run full regression/syntax checks and inspect all actual player/room states at desktop/tablet/phone widths.
- [x] One independent whole-branch final review; resolve material findings and verify.
- [ ] Publish, CI, merge, verify live assets and source/room behavior.

## Verification

- `npm run test:ui`: 593 tests passed, no failures or skips.
- `npm run check`, explicit `node --check public/party/lobby.js`, and `git diff --check`: passed.
- Actual production markup, CSS and controllers in Chromium component fixtures: lobby, host, guest, loading, buffering, error, settings, setup dialog, beside-player chat, legacy watchroom, movie and episode at 1440/768/390/320. No document overflow. Settings receive pointer input above the footer and fill their intended viewport position; embedded stage fills its room screen.
- One independent whole-branch review: no Critical findings. Three Important findings fixed with failing-then-passing production-controller regressions: idle snapshots replacing link/empty media, inaccessible direct-link guest transport, and stale movie clocks affecting replacement links. Catalog movies retain host sync; direct links expose honest local manual controls; external embeds use their own controls with guidance.
- Rendered regressions reproduced and corrected: global entrance transform anchoring fixed mobile sheets, root stacking allowing footer interception, and legacy centered-item alignment shrinking the embedded stage. Shared menus pin controls, restore focus on dismissal, and respect reduced motion.
- Production cloud browser remained at the login screen after secure sign-in handoff was declined. No authenticated live walkthrough or real-device codec claim; visual checks above use in-memory production component fixtures.
