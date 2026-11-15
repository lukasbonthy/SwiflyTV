# Reference Alignment Implementation Plan

> Execute bounded independent tasks inline with focused agents, then perform an integrated visual/code review and release verification.

**Goal:** Match the explicit reference components and make Kids a native child-safe browsing experience.
**Architecture:** Reuse actual discovery and cinema components with scoped Kids routing and verified data; replace conflicting presentation layers rather than add another visual theme.
**Tech Stack:** Existing Node templates, CSS, JavaScript, React native rails and hosted Playwright.
**Spec:** docs/superpowers/specs/2026-11-15-reference-alignment-design.md

## Constraints and review focus

Preserve all safeguards, configured secrets/account settings, original Movies hierarchy and ripple/iPad fixes. No local Chromium launches in this restricted runtime. Check child-safe route isolation before/after locking; adult local-history leaks; visible native child navigation; real page-two/filter results; keyboard/reduced-motion/touch menus; actual AI Picks/Audiobooks computed cascade; narrow dialogs and child player returns.

- [x] Inspect live ShuttleTV control and actual discovery/cinema source patterns; record observed sizing, colors and motion.
- [x] Replace the period picker’s competing typography/surfaces with the observed inline heading/underline/popout pattern in ui/catalog-experience.js, lib/catalog-experience.js and public/clean/catalog-experience.{css,js}; preserve existing selection, navigation and lifecycle checks. Add a focused appearance/animation regression and realistic screenshot states.
- [x] Reuse the AI Picks visual components/cascade in ui/discovery.js and audiobook presentation/controller files; retain title/author search, playable-only filtering and every listening/progress control. Verify focused existing audiobook tests and add actual AI Picks versus Audiobooks comparison evidence.
- [x] Add explicit child context to pageShell/movieCard/dsHero/dsRail/detail/player in server.js and child fragments; extend verified Kids service only as required. Implement Home, Movies, Series, Browse, safe search, native title/episodes/player paths. Extend guards and native child controller hooks without exposing adult data or broadening APIs.
- [x] Replace standalone Kids browser fixtures with real application-shell/adversarial data checks. Verify strict eligibility, source/route/API guards, password and cross-tab lifecycle, safe hero/rails/search/recommendations, real filters/page-two, and desktop/tablet/phone/TV/reduced-motion behavior.
- [ ] Review and integrate independent changes. Run syntax/build and appropriate source/browser/integration checks, inspect actual side-by-side screenshots and obtain a fresh whole-branch review; address concrete findings.
- [ ] Publish the exact passing tree, merge and deploy under existing authorization, verify live changed assets/routes/search/lock behavior, and update the checkpoint with source/production/evidence references.
