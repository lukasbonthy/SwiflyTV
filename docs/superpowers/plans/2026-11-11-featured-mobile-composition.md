# Mobile featured composition plan

Base: 5d5c67d387b0451f658dfe80cbf48062c7078625.
Spec: ../specs/2026-11-11-featured-mobile-composition.md.

One cohesive task: refine the existing Home hero against the supplied phone screenshots.

1. Add a failing server/action-label assertion and browser regressions for centered positions, non-overlapping Pause, 44px action targets with 36px faces, responsive 1.2x text and an opaque black tail. Confirm available RED evidence before the corresponding changes.
2. Complete missing featured metadata through the bounded shared server cache, then update Home-only markup/CSS and snapshot paint handling; keep the controller's preparation, timer, cancellation and motion untouched.
3. Build/check and run focused tests. Use the managed preview with real Barbie metadata/art, then inspect narrow phone and desktop layouts. Resolve observed failures.
4. Run the full local suite and one fresh-context review. Publish the feature branch for Chromium/acceptance CI, then fast-forward authorized main, wait for Render live and verify public asset hashes.

Review focus: CSS cascade in all glass modes, pseudo-element stacking, outgoing ghost fill, small-width target overlap, larger text, TV/Studio exceptions, navigation access, viewport stability and the remaining tint under rows.

No extra approval gate: the user already requested continued fixes and GitHub/Render updates, and has opted out of repeated confirmation.

Validation: 1594 local tests passed, zero failed; 237 browser tests deferred to Chromium CI. Syntax check and React/Vite production build passed. The independent review identified Resume overflow, a narrow live/ghost width mismatch, a 44px subtle-filter footprint and partial metadata loss; all four received one fix pass and targeted regressions. The metadata preservation test was observed failing before its fix. Browser coverage now loads the real Continue module and checks four-action entry/exit, outgoing widths, Studio blur and the motion cap at 320px and 390px with 1.2x text.
