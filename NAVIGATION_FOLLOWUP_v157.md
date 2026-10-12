# Navigation follow-up — v157

Changing Movie/Trailer mode or selecting another season or episode of the same series now preserves the original title return route and browsing scroll context. Previously those player controls replaced it with the player's current scroll position. Switching modes after opening a standalone title also retains that title as the Back destination.

Standalone details Back links preserve the saved catalog anchor when its path and query match the actual same-origin referrer. A different search or filter keeps its own route. The existing URL validation and Home fallback still apply.

The v156 cinematic details, movie collections, glass controls, Studio, and scrolling behavior are included. The server change updates the details-script asset version to refresh cached clients; provider and player implementation code remains byte-for-byte identical to v156.

## Update

Keep your existing `.env`. Replace the project files, then run:

```powershell
npm install
npm start
```

For the existing Render service, deploy the latest `main` commit and refresh with Ctrl+F5.

## Verification

```powershell
npm run check
npm run test:ui
```

The 52 behavior checks cover the three new return-path regressions and the existing details, browser history, scrolling, collections, and Studio behavior. Syntax and served-asset checks also run. Visual verification of the deployed site requires its URL.

Browser referrers are described in [MDN's Document.referrer documentation](https://developer.mozilla.org/en-US/docs/Web/API/Document/referrer). URL anchors are omitted when preparing referrers; the [W3C Referrer Policy algorithm](https://www.w3.org/TR/referrer-policy/#strip-url) explains this behavior.
