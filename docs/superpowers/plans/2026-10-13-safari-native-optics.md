# Safari native artwork optics correction

**Goal:** Match the existing glass material while eliminating the photographed paragraph fragments and flat copied artwork.

**Architecture:** Replace HTML foreignObject captures with native SVG image, gradient, mask and color-filter paint. Render a soft native SVG artwork body under the refracted edge, alongside the live native blur. The sampler captures artwork and surfaces; text stays in the live browser backdrop. Preserve source image fitting and mask coordinates.

**Files:** `public/liquid-glass/liquid-glass.js`, material CSS, glass regression tests, `scripts/verify-safari-glass.cjs`, versioned asset references in `server.js` and integration tests.

- [x] Reproduce the photograph and prove the new native-paint regression fails.
- [x] Implement native SVG paint and verify source clipping, image alignment, scrolling and idle behavior.
- [x] Inspect WebKit screenshots with real movie art and nearby description text; compare the established Chromium material.
- [x] Run regression and syntax checks, review the correction, and prepare it for GitHub.

Keep Chromium's renderer, input interaction, glass preferences and accessibility lifecycle. Use one SVG refraction pass for WebKit and no continuous capture loop. Do not copy paragraph text into artwork lenses.

**Verification:** 422 Node tests passed, syntax checks passed, and the browser regression passed on WebKit at 1024×768, 768×1024 and 1366×900 and Chromium at 1280×800 using the live Animals artwork. Pixel comparisons verified SVG body softness and edge displacement. The real page comparison reproduced paragraph fragments with v194 and clean controls with v195. Review identified a missing ancestor artwork mask; its failing regression now passes, and a WebKit pixel reproduction confirms transparent wrapper artwork remains invisible. Physical iPad hardware was not available for testing.
