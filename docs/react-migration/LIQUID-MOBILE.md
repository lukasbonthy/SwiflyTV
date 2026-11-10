# Continuous mobile motion

The user prioritizes a smooth, liquid feel over the shortest response time. Keep the existing premium scrolling, glass appearance, desktop seven-title view, and original renderer backup.

The current mobile row replaces poster nodes during a native swipe. The details sheet can also receive its full metadata while its entrance is already moving. Both patterns introduce avoidable rendering work into motion.

Use stable native mobile tracks: prepare a row's posters once, show two phone/four tablet columns, and leave the DOM intact throughout the gesture. Update the range controls after scrolling settles. This deliberately uses more offscreen DOM than virtualization so the browser can maintain continuous momentum. Desktop rows still mount seven posters per page.

Give mobile details a 560ms soft entrance and 360ms exit. Hold the initial position while fast metadata is prepared, with a 400ms bound for slow requests. Give prepared content one painted frame before movement. Mobile animation watchdogs begin after compositor readiness, with a separate bound for a stalled API, so slow startup cannot cut off the glide. If metadata arrives after movement begins, commit it after the sheet settles. Reduced motion, cancellation, history restoration, and TV behavior remain intact. Touch pointer-over/down no longer prefetches metadata: the initial contact can become a native swipe, so details loading waits for an actual open. Mouse/keyboard intent warming remains available.

Alternatives considered: continuing per-poster virtualization keeps fewer nodes but interrupts gestures; adding JavaScript touch easing risks competing with the browser's touch compositor. Stable native tracks and a prepared sheet are the implementation choice for the user's stated priority.
