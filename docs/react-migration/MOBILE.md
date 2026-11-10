# Mobile rails and smoother paging

The desktop column rule previously overrode phone sizing: two mounted phone posters were laid out as seven columns. The React row also had no overflow to swipe. Mobile rows now show two phone posters or four tablet posters at their intended size, with native horizontal scrolling through the full catalog. Native phone/tablet tracks now retain their poster nodes throughout a gesture, avoiding virtual-window replacements during momentum. Desktop pages still mount seven posters.

Row arrows use 44px phone/tablet targets and remain available alongside swiping. Padding, snap alignment, responsive resizing, and final-page clamping preserve the actual scroll position and visible-title range. Pending native range updates are canceled at breakpoints so they cannot reset a desktop page. Range labels settle after native momentum instead of triggering poster updates on every scroll frame.

Desktop page changes add a 220ms transform-only glide. React rails are excluded from the legacy important transform reset; idle rows return to their normal transform without permanently reserving layers. Reduced-motion and TV modes keep instant paging. The premium desktop wheel curve, glass shaders, and seven-title desktop layout remain unchanged.

Library/watch action setup is scoped to the changed rail. Hydration fixtures now install the browser navigator explicitly, including on Node 20. The original-renderer backup and rollback path remain available.

## Verification

`npm test`, `npm run check`, `npm run build`, and `npm run test:recommendations`. Targeted tests in `tests/react/mobile-rails.test.cjs` cover stable native poster identity, last-title reachability, padded tracks, scroll snapping, reduced motion, tablet/desktop resizing, and the queued-scroll resize regression. Hydration and TV paging tests also run with Node 20-style globals.

Responsive browser review covers 320px and 390px phone layouts, 820px tablet rows, details controls and navigation, and the rendered desktop transform returning to identity. Native hardware touch behavior remains governed by the browser; no JavaScript touch gesture interception or wheel-curve changes were added.
