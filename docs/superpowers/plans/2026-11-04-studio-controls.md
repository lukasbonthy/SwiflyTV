# Studio layout controls repair

Reproduce the actual Studio editor on the shared catalog shell and verify computed layout rather than saved values alone. Preserve default branding, Studio drafts, saved settings, accessibility and TV navigation.

- Confirm Cinema rows change landscape geometry and wider automatic sizing.
- Let explicit poster width control horizontal rails; reserve Grid columns for grids.
- Verify Save, reload and Cancel restore the rendered layout.
- Check corners, density, Poster wall, mobile and TV behavior with real Chromium.
- Add the regressions to CI, review the diff and update PR #150 without merging or deploying.

Initial reproduction: Cinema remained 180×270px after selection; a 260px poster-width draft remained capped by the six-column grid calculation. Corners, spacing and Poster wall passed the initial rendered checks.

Verification: 38 Studio unit checks and 30 real Chromium checks passed, including the five new layout/control cases. Independent review found no important issues.
