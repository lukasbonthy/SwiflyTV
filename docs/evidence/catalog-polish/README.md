# Catalog polish verification

This PR repairs specific catalog loading, navigation and rendering defects while retaining glass, Aurora, Studio, profiles and playback features.

## Delivered changes

- The homepage requests seven stylesheets instead of 37. Fixed startup bundles retain stylesheet order, rebase relative URLs, use content hashes and keep older recognized bundle hashes usable across rolling deployments.
- Server-rendered content stays visible during initial loading and navigation. Empty personal rows stay hidden until they have useful content; profile switches clear stale cards.
- Repeated slow glides contribute to a bounded recovery budget, while healthy scrolling retains the existing curve. Native fallback activates only after a glide settles.
- Search keeps current results during edits and replaces them atomically, with updating/error feedback and keyboard focus restored to the matching destination or input.
- Catalog arrows announce their actual boundaries without losing keyboard focus; controls hide when their rail fits. They update from horizontal scroll and resize rather than page scrolling.
- Episode initialization inspects inserted episode subtrees rather than rescanning the document after unrelated artwork, glass or search changes. Removed panels cancel their request.
- Featured titles use available English/neutral artwork from the existing bounded metadata lookup. Wrapped fallback text remains in layout, including at larger Studio text sizes, so artwork arrival does not move the metadata.
- Details use one 360ms entrance and 220ms exit. Detail sections remain immediately readable during scrolling. The library-page controller is only delivered to pages that use it.

## Preview observations

The managed preview ran production Express routes, styles and controllers with deterministic catalog metadata because live TMDB access was unavailable in the preview. Repeated titles and shared dates are fixture data. The featured backdrop and poster URLs came from the public catalog; the preview logo uses the Warner Bros./Mattel film logo distributed on [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Barbie_(2023_movie_logo).png). These screenshots demonstrate layout, not current catalog accuracy. No fixture server, responsive test page or dev-command override is included in the change.

- Desktop: featured artwork and glass actions are visible; initial row arrows correctly announce the left boundary.
- Mobile: a 390px iframe has a 380px content area with the desktop scrollbar; content width and scroll width both measure 380px.
- Automated Chromium checks cover a long featured title at 120% text size at 360px, 768px and 1920px with TV layout, before and after logo loading. The title and metadata retain their positions.

![Updated desktop catalog](refinement-desktop.jpg)

![Updated mobile catalog](refinement-mobile.jpg)

## Verification

Syntax checks passed. Focused controller regressions passed 28/28; the new real Chromium regressions passed 2/2. They exercise retained search results and focus, row-boundary focus, wrapped title layout, local episode initialization and conditional asset delivery. Independent review found and verified fixes for search focus loss, row-arrow focus loss and scaled fallback-title overlap.

GitHub check run 1187 passed on implementation commit 2138deadfa6919cc56c864ab173a57ff0e6d0d81: **1,524 non-browser checks and 211 Chromium checks passed**, followed by successful recommendation and acceptance checks. The four on-device model cases that lacked local prepared assets were exercised with prepared assets in CI.

The local full run completed 1,735 cases: 1,730 passed, four model cases skipped, and one catalog fixture exceeded its 10-second readiness deadline before reaching the hover assertions. That case passed in isolation. Its fixture now uses the same condition-based readiness check with a 30-second cold-start budget; no hover assertion was relaxed. All 31 cases in the affected browser fixture then passed, including the hover case. A final header-controls regression also verifies computed `display:none` in the actual header layout, and both focused Chromium tests pass.

The older hero-animation expectation was updated to the intended immediately readable behavior; sheet timing and detail reveal expectations now match the new transitions. GitHub runs the new browser cases after installing Chromium.

## Limits

The preview uses controlled data and does not certify Safari, physical iPad/Xbox performance, media-source availability or playback. No FPS increase or production latency reduction has been measured. The changes reduce specific loading, layout and rendering work; they do not claim every existing feature is fully polished.
