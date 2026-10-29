# Themes with distinct details

Selecting **Blossom** adds gently falling pink petals and flowering branches on interface corners. **Halloween** attaches webs and small hanging spiders to navigation, search and panel corners, with floating embers. Details are applied to the real interface, including Studio's live preview.

| Theme | Character |
| --- | --- |
| Blossom | Falling petals, flowering branches, rose and plum palette |
| Halloween | Corner webs, hanging spiders, warm embers |
| Winter Lights | Snowfall, warm string lights, frosted edges |
| Forest | Drifting leaves and fern details |
| Midnight | Twinkling stars, a passing meteor and orbital lines |
| Cinema | Projector dust, a slow light beam and film-frame details |
| Swifly Original | Existing moving Aurora and clear glass |
| Focus | Still, matte surfaces and a clear focus treatment |

**Theme details** is a simple on/off control. Its value is preserved across theme presets and included in portable looks and account backups. Existing Advanced controls, custom palettes, named looks, data, forms and player behavior are retained. Studio preview/Save/Cancel use the existing draft lifecycle, and phone layouts now have an inline animated preview.

Motion uses CSS transforms and opacity with no JavaScript frame loop or timer. Budgets are 14 page particles, 8 on small/mobile screens, 5 preview particles and 6 interface ornaments. Decorations are inert, aria-hidden and pointer-transparent. Reduced motion keeps static ornaments and stops movers. High contrast, reduced transparency, Xbox/minimal modes and playback suppress decorative nodes. Page effects pause behind a native dialog; preview effects continue there. Hidden pages pause all effects. Dynamic panels are reconciled without replacing controls or losing focus.

The illustrations are seven original local SVG files; no new dependency, external asset call or model is used. Studio artwork is positioned clear of its controls, with smaller corner details on phones.

Validation:

- New controller/config regressions were observed RED before implementation, then GREEN. Additional regressions reproduce runtime TV switching, panel-content replacement, header artwork overlapping controls, and Midnight's animation shorthand defeating dialog pause.
- Browser regressions verify actual changing CSS transforms, corner SVGs, phone preview placement, paused/running animation states, hit testing, reduced motion, high contrast, Save/Cancel and portable settings.
- A full-server visual audit passed **159 checks**, with **16 rendered screenshots** at 1440, 390 and 320 pixels. All seven SVG assets and both runtime modules loaded with HTTP 200; no fatal script errors or failed local assets. Existing TV tests cover the 1920-pixel interface, alongside controller tests for live TV-mode changes.
- Final review identified two preview issues: responsive layouts could retain the preview in the hidden stage, and a copy selector constrained the mobile effects layer. Both were reproduced in failing controller/Chromium regressions and fixed; the focused suite passed **25 tests, 0 skips**.
- Integrated acceptance passed **33 scenarios and 326 assertions** with no failures, covering existing account, Study, Studio, list, search, feed and TV flows. The report records hashes of the final tested source.
- The full application/theme `npm run test:ui` run passed **1,616 tests, 0 failures, 0 skips**. `npm run check` and `git diff --check` passed.

CI exposed fragile document-bound startup waits and an entrance-animation measurement race in existing fixtures. Four additional Chromium regressions reproduced these failures, then passed with condition-based waits. They also reject wrong routes and permanently undersized targets. All 38 affected browser tests and all 33 integrated scenarios passed after this test-only synchronization fix; the same 44px and account-verification assertions remain in force. The new fixture regressions are included in the installed-browser CI step.

Screenshots, a short recording of real falling petals, and the check report are in `docs/evidence/living-themes/`. These are actual local Express pages and application scripts with fresh guest verification; external catalog data is empty and external fonts are stubbed. They do not establish production deployment, physical Xbox frame rates or provider streaming.
