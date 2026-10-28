# Cinematic themes

Replaces the abstract seasonal thumbnail shapes with original woodland Halloween and snowy aurora artwork. Shared theme materials now reach navigation, search, Settings, Account, library filters and Studio. Seven theme IDs, all existing settings, Advanced controls, named looks and portable account backups remain available. Existing saved palettes are retained; choosing a theme applies its refreshed defaults.

The local background files total 254,776 bytes. Images are static, sit below content, accept no pointer input, fade into the canvas, and are hidden during playback and under high contrast, reduced transparency, Xbox and minimal policies. Film artwork keeps priority. The other themes use coordinated CSS lighting; Focus stays plain.

Studio theme cards use the same local scenes as the site. The live preview uses actual film titles and artwork when present, with a neutral title on utility pages. The new utility-heading regression was observed failing before removing the generic page-heading fallback.

One independent review found a light-canvas/dark-accent readability regression. It was reproduced in Chromium, then fixed with dark bounded editor surfaces and contrast-aware accent foregrounds. The regression checks light canvas, dark/black/white/mid-gray accents, persistence and Cancel. No Critical or Minor findings remained.

Validation:

- `npm run check` and `git diff --check`.
- Studio configuration/lifecycle, portable backup, player and search suites: **174 tests passed, 0 failed, 0 skipped**.
- Actual Express routes and local assets rendered at 1440, 390, 320 and 1920 pixels: **105 checks passed**, 35 screenshots produced. Both seasonal WebP files returned HTTP 200. All seven themes persisted and fitted the tested views. Missing images left inputs and theme selection usable.
- High contrast, reduced transparency, minimal and TV decoration policy checked. Existing browser suites exercise keyboard focus, footer visibility, Save/Cancel, prepaint restoration and all ten Advanced sections.

The visual audit uses fixed external catalog metadata and artwork fixtures; same-origin scripts, styles, scene images and guest account verification run unchanged. It does not establish production deployment, physical Xbox performance, or live provider streaming. A runner-only gamepad-service fixture avoids the known Chromium OS-service problem; no product gamepad behavior is changed.

Selected screenshots and the check report are in `docs/evidence/cinematic-themes/`. Artwork provenance and complete generation prompts are in `public/studio/themes/README.md`.
