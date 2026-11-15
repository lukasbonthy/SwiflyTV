# Native sections implementation plan

> Execute inline with one fresh whole-branch visual/code review at the end.

**Goal:** Make the four rejected sections feel native to SwiflyTV.
**Architecture:** Shared section geometry in the existing hashed shell bundle; focused markup/CSS updates preserve existing API and data hooks.
**Tech stack:** Existing Node templates, CSS, browser JavaScript and hosted Playwright.
**Spec:** `docs/superpowers/specs/2026-11-14-native-sections-design.md`.

## Constraints

No new imagery or dependencies; inherited site typography; neutral black/gray/white styling; 44px primary controls; preserve Studio scaling, reduced motion, all Kids guards, audio/progress and Study tools. No local Chromium launch attempts in this restricted runtime. Keep shell budgets and iPad safeguards.

## Review focus

Inspect actual appearance beside ordinary movie pages. Check narrow dialogs and native navigation; old saved Study layouts; no-audio/search error states; parent lock transitions; mobile drawers covering timer or player controls.

- [x] Add shared section styles and integrate their hashed bundle without a new stylesheet request.
- [x] Replace Kids mascot/pastel landing and title views with native catalog/parent controls. Verify lock, search, navigation and layout cases.
- [x] Remove audiobook scenery/quiet-mode code; rebuild native library and listening dialog. Verify search, chapters, speed, sleep and identity/history behavior.
- [x] Replace Study warm/editorial presentation with neutral scene controls and readable functional layout. Preserve saved settings and all tools.
- [x] Replace language marketing hero/postcards with native filters, language grid and genre controls. Verify exact navigation/query results.
- [ ] Update targeted browser scenarios for the changed design, run syntax/build/relevant/full checks, inspect combined screenshots and obtain a fresh review.
- [ ] Address meaningful findings, publish review branch, run hosted checks, deploy the passing source and verify live assets/behavior. Update the checkpoint.


User follow-up: restore Movies page-one layout, add the compact underlined period picker and keep the normal hero/Browse data independent. Correct full-frame ripple color propagation and black-frame fallback. Add focused regressions plus real captured-video and dropdown screenshots, then verify and release these with the four-page native correction.
