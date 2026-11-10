# Details and shared UI performance

Premium wheel easing, programmatic scrolling, entrance timing, glass shaders, and visual styles remain unchanged. Desktop catalog rails still show seven titles at a time.

The patch removes avoidable work around those effects:

- Library mutation updates ignore glass decorations and refresh the affected subtree. Newly inserted episode and season lists still receive their saved sort and spoiler preferences.
- Cached details clone a sanitized, bounded, profile-scoped DOM template. Library labels are applied fresh on every opening.
- Fresh details avoid redundant scroll geometry after metadata insertion; history restoration retains actual scroll positioning.
- Detail recommendations prepare their control panes on approach instead of allocating them during the entrance. Visible primary actions retain their real refractive lenses.
- Glass visibility measurements happen before material changes. Sheet transform hints do not regenerate unchanged lens geometry.
- Artwork visibility reads happen before fade classes are written. Detail backdrops use their declared URL without a computed-style flush; responsive catalog heroes still use their selected CSS source.

## Verification

Run `npm test`, `npm run check`, and `npm run build`. Focused regression coverage lives in `tests/details-fluidity-budget.test.cjs` and `tests/glass-performance.test.cjs`.

Browser checks cover fresh/cached openings, closing, details scrolling, lazy recommendation controls, native Back navigation, real action-lens graphs, and seven-title catalog windows. Local instrumentation identified and removed the artwork observer's synchronous computed-style flush and the per-control read/write sequence on exit. Frame timings remain dependent on browser rendering, device capability, and network loading; these changes do not guarantee a universal frame rate.

The original renderer backup and rollback instructions in `ROLLBACK.md` remain available.
