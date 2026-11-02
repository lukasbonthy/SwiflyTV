# Catalog loading and scrolling repair

The user reports that SwiflyTV loads in pieces, scrolls poorly, and feels crowded compared with ShuttleTV. Inspecting both live sites confirmed empty personal-feed sections before the catalog, oversized notification chrome, and faded first-card titles. The current shell loads 37 external stylesheets. Source inspection also found an initial loader tied to DOMContentLoaded and a slow-scroll fallback whose observation window resets on every gesture.

Use the existing Node/Express and browser controllers. Repair these shared foundations in place: content-addressed CSS bundles preserving cascade order and relative assets; server-rendered content visible while scripts initialize; personal home rows visible only with usable content; clear poster edges and quieter navigation; sustained frame sampling across short scroll gestures. Preserve glass, aurora, Studio preferences, accessibility, and all destinations.

Approaches considered: another stylesheet override would leave request and lifecycle problems intact; a frontend rewrite would risk accounts, player and themes. Focused repairs to the current owners give a smaller, reviewable change. This is an implementation choice, not a new design approved by the user. Changes go to a PR for review, not directly to production.

Verify real loading/feed/scroll behavior, CSS delivery and URL resolution, plus the existing suite. Inspect the finished preview in the browser. Do not claim a measured FPS improvement without a trace, or playback changes from catalog-only checks.

Rolling deployments retain a compatible fallback for an older well-formed asset URL: recognized groups serve current CSS with `Cache-Control: no-store`; exact current hashes are immutable. The scrolling observation budget counts slow frames and decays during healthy movement, so healthy activity cannot prime a later isolated stall.
