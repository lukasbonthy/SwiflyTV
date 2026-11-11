# Featured movie controls and presentation

Make Home's controls and transitions resemble the observed ShuttleTV homepage: edge-centered chevrons on desktop, long thin eight-second progress tracks below the copy, centered shorter tracks on phones, compact bottom-aligned title/metadata/actions, and a stationary photograph fade into the prepared poster-colored glow.

Keep the existing 700ms horizontal movement and 1000ms glow dissolve. Use finite transform animations for progress; one dwell timer owns advancement. Repeated observer notifications must not restart a running dwell. Pausing, scrolling, dialogs, visibility changes and disposal stop progress together with advancement. Manual selection remains available with reduced motion and TV mode.

Use 44px minimum control targets, visible keyboard focus, existing accessible action names, and the real Play/Details/My List elements. No new live blur, continuous frame loop, provider/catalog calls, or background image layers. Preserve the two art/two glow slots, preparation cancellation, mobile native scrolling, seven desktop posters, Studio compact/banner heights, TV guide clearance, original renderer and original backup.

The default cinematic hero keeps a fixed responsive height so changing copy cannot shift catalog rows. Titles can use their natural height; the actions stay anchored. Optional logos are decoded before swapping the incoming copy, with a bounded text fallback.

Validation: focused behavior tests, responsive browser geometry and lifecycle tests, build/check, full Node suite, one independent code review, GitHub Chromium CI, automatic Render deployment, and live asset hashes. Physical phone FPS is outside this desktop environment.
