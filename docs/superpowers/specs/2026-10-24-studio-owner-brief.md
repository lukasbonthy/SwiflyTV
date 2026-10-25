# SWIFLYTV — COMPLETE SWIFLY STUDIO EXPANSION
## Implementation brief for ChatGPT Work
**Prepared:** October 24, 2026  
**Target project:** `lukasbonthy/SwiflyTV` (GitHub, default branch `main`)  
**Scope:** Implement all 12 additions below, not merely suggest or mock them up.  
**Owner's direction:** Premium, coherent, cinematic, fast, controller-friendly. Comparable polish to ShuttleTV's general feel, but an original SwiflyTV design—do not copy proprietary assets or interfaces pixel-for-pixel.

---

## 0. READ THIS FIRST — YOUR JOB

You are ChatGPT Work, acting as a senior full-stack engineer, product designer, accessibility engineer, and performance specialist for this **existing** SwiflyTV codebase.

**Your job is to make the changes in the connected GitHub repository and deliver working code.** Do not stop at a plan, a design document, a visual mockup, or high-level recommendations. Inspect the current code, implement the features, verify them, and provide the user with a clear PR/commit link and test results. This is a large project; proceed in coherent phases with tested checkpoints and complete as much as the environment permits. Do not claim something is implemented unless it is actually functioning.

### Non-negotiable requirements

1. **Preserve all existing features.** Do not break the movie/TV catalog, movie details, player, provider retrieval and fallbacks, watch history, favorites/watchlist, downloads, profiles, AI recommendation/search form, social/friends/DMs/notifications, watch parties, TV mode, Xbox controller navigation, or Aurora. Features should be *added to and integrated with* the existing application, not replaced with inert demos.
2. **Do not remove anything from the AI form.** The AI UI is already a sensitive part of the project. Studio can adjust its appearance, spacing, notification HUD, and visual prominence, but keep every current input, action, and backend connection functional. Do not claim to have improved recommendation intelligence unless you actually change and test that system separately.
3. **Maintain the site's premium, cinematic identity:** restrained dark palette; beautiful but subtle glass; strong typography; responsive hover/focus states; slow, smooth atmospheric motion; consistent effects. Avoid neon overload, dozens of overlapping animations, cheap card styling, an ugly detached admin dashboard, and distracting effects over the video player.
4. **Keep performance as a first-class requirement, especially on Xbox.** The user has repeatedly experienced skippy scrolling, delayed button activation, hover-related lag, and expensive glass effects. Adding customization must not bring these problems back. Do not change scroll speed or scrolling physics unless required to fix an actual bug.
5. **Keyboard, touch, mouse, remote/controller, and reduced-motion access must work.** On Xbox, focus movement should be predictable and responsive; Back/B cancels or returns appropriately; A/Enter activates; no focus traps except properly managed dialogs. Preserve existing LB/RB navigation behavior elsewhere in TV mode.
6. **Do not rewrite the app wholesale.** Read the existing architecture and reuse existing systems and CSS tokens. Avoid unnecessary libraries, APIs, paid subscriptions, heavy shaders, background polling, telemetry, and redundant implementations.
7. **No invented behavior.** A progress bar must report real progress or an honestly indeterminate state. Unsupported caption tracks or player qualities must not appear as real. Don't show fake FPS, fabricated device specs, fake AI performance, or placeholder watch statistics as real data.
8. **Changes must save and revert reliably.** Draft/Preview, Save, Cancel, Restore Defaults, and import must work without silently deleting unrelated preferences or account data. Backward compatibility with users' already-saved Studio settings is mandatory.
9. **Use a working feature branch and PR** rather than pushing a risky, unreviewed bulk redesign straight to production. You may split into scoped PRs if integration is too large. Never expose credentials or change `.env` values. Do not merge/deploy to production unless the user explicitly authorizes that action.

### Inspect these existing starting points first

- Repository: <https://github.com/lukasbonthy/SwiflyTV>
- `STUDIO_v155.md` — existing Studio behavior and regression expectations.
- `STUDIO_PARTY_v158.md` — Studio animations and Party Hub interactions.
- `ui/studio.js` — Studio markup/navigation.
- `public/studio/studio.js` — Studio schema, presets, state, save, draft, preview and handlers.
- `public/studio/studio.css` — Studio layout and styles.
- `public/clean/aurora.css`, `public/clean/aurora.js`, `public/clean/hero-palette.js` — current background/atmosphere/palette logic; **reuse rather than duplicate**.
- `public/clean/motion.js`, `public/clean/scroll.js` — scrolling and motion.
- `ui/loading.js`, `ui/player.js`, `public/player/player.js` — existing loading/player implementation.
- `ui/tv.js`, navigation UI, `public/clean/` — TV navigation and existing shells.
- `tests/studio.test.cjs`, `package.json` — test conventions and scripts.
- Search for any already-implemented pieces of the requested features; **extend/repair rather than implement twice.** Repository evolves rapidly; above are orientation pointers, not a claim that its live HEAD still has exactly this structure.

**Current known baseline (verify at HEAD):** Existing Studio has Pure/Cinema/Midnight/Focus presets, muted accents, fonts, solid/soft/liquid glass, Aurora palette/intensity/motion, layouts (classic/cinema/poster wall), poster corners, density, smooth scrolling, reduced motion, instant preview, Save/Cancel/Defaults, and browser-local preferences. The requested work goes considerably beyond these existing controls.

---

## 1. PRODUCT VISION AND FINAL STUDIO INFORMATION ARCHITECTURE

Make Swifly Studio feel like a **beautiful, comprehensive personalization workspace**, rather than a generic settings popup. A compact vertical navigation rail on desktop and a clean tab/section switcher on touch/TV should organize:

1. **Appearance** — presets, custom colors, typography, real glass, gradients.
2. **Homepage** — reorder/hide content rows, hero and card settings.
3. **Navigation** — top bar/sidebar design, order, labels, TV adaptation.
4. **Player** — control style, caption accessibility, overlay placement and idle controls.
5. **Atmosphere** — Aurora, adaptive cinema colors, effects, wallpaper intensity.
6. **Social & AI** — notification HUD and AI widget presentation.
7. **Motion & Loading** — page motion, hover transitions, loading experience.
8. **TV & Devices** — controller and larger-screen configurations.
9. **Performance & Accessibility** — lightweight modes and visual access.
10. **Themes & Profiles** — saved looks, import/export, optional profile syncing.

You may regroup logically to avoid an excessively long tab rail, but **every requirement below must remain discoverable**. Use a live *contextual* preview of the actual current site's artwork and, where useful, previews for homepage, header, player, notification, and TV layouts. Show meaningful visual comparisons of presets, not unlabeled toggles. Save/Cancel must be obvious. Never let the preview conceal or obstruct important Studio controls.

### Design language

- Original premium streaming interface; editorial typography and cinematic negative space.
- Smooth, consistent corners and glass borders. Soft and liquid glass must actually look distinct yet related; glass should be visually correct at first render, not only after an interaction or once a modal animation finishes.
- Restrained accent use, readable contrasts, soft hover elevation, responsive and intentional focus indication.
- Subtle entrance/exit transitions, no dramatic animations on every click.
- At low power, do not render costly refraction or multiple blurred layers just to make a setting panel look expensive.
- Maintain visual parity between new features, existing details/player, social, AI, and the site navbar. There should be **one design system** rather than a collection of mismatched components.

---

## 2. FEATURE REQUIREMENTS — IMPLEMENT ALL 12

### Feature 1 — HOMEPAGE BUILDER [HIGHEST PRIORITY]

Allow customization of the **real homepage**, not just Studio's preview:

- Show a reorderable list of available home sections (e.g., Continue Watching, Trending, Recommended/AI Picks, Watchlist, New Releases, genre rows, etc. **only where those sections actually exist**).
- Toggle visibility of nonessential sections without deleting data; retain a way to restore each hidden section.
- Reorder by drag-and-drop **and** accessible Up/Down buttons / controller action. No drag-only workflow.
- Options for hero placement/height or compact hero; card density and actual poster width; number of columns/row shape according to screen size.
- Choose a featured/banner presentation that relies on *actual catalog data*, not fabricated artwork.
- Saved layout survives reload. Preview + Cancel genuinely restores original layout; Restore Defaults makes the default row order recoverable.
- Respect per-device responsive constraints; do not allow settings that cause horizontal overflow or empty homepage.

**Accept when:** Reordering `Continue Watching` and another existing row visually changes the **real** homepage immediately and remains saved after reload; users can restore the default, and reorder without a mouse.

### Feature 2 — ADVANCED THEME CREATOR

- Keep existing presets but extend with a named custom theme builder.
- Editable HEX accent color with validation, optional second accent, background/canvas tint, subtle gradient direction/intensity, and typography choices already supported by the app.
- Glass controls for **off/soft/liquid**, plus bounded opacity, blur, edge/border strength, highlight/glow intensity. Use coherent tokens so all surfaces update together; no hard-coded divergence between nav, details buttons, Studio, search, and HUD.
- Distinguish surface roles (nav, dialogs, buttons, cards) without exposing a huge confusing matrix of individual sliders. Sensible defaults and safe caps.
- Support reset per subsection and reset entire theme, with saved named user themes.
- Validate input; prevent contrast-breaking colors where needed or show an accessible warning.
- Do **not** inject arbitrary CSS/HTML from user settings.

**Accept when:** Changing theme color and glass style visibly affects navbar, Studio, movie buttons, notification controls, and details immediately without requiring opening/closing a modal.

### Feature 3 — PLAYER CUSTOMIZATION

Customize the existing real player while preserving playback, subtitles/quality switching, parties, downloads, and remote controls:

- Select control-bar theme (minimal, classic, cinema-glass) using the same design tokens as Studio.
- Progress bar thickness, timestamp visibility, icon scale, control opacity/placement where layout supports it.
- Configure auto-hide timing from a small safe selection; focus/hover and touch must always bring controls back promptly.
- Caption font size, text color, background opacity/edge/shadow where actual captions are available; show a realistic **caption-style preview** even before playback.
- Choose loading/empty-player background (neutral dark, artwork blur, subtle ambient glow) without hiding real errors or pretending a source is playable.
- TV/controller overlays must remain readable and focusable; party participants' authority over playback must remain unchanged.

**Accept when:** Settings alter an actual playing title and survive reload, without dead buttons, playback stalls, or focus loss.

### Feature 4 — ADAPTIVE CINEMA MODE

- Add a toggle that softly adapts Aurora/background, subtle highlights, and eligible surrounding chrome to the currently selected title's dominant palette.
- Integrate with `hero-palette.js` if possible. Calculate at most once per title/artwork; cache palette results; do not sample every animation frame.
- User-adjustable intensity with safe bounds; background stays dark and readable.
- Automatically disable or simplify while a video is playing, in reduced-motion mode, or under lightweight performance mode as appropriate.
- Gracefully handle images whose origins do not allow canvas color extraction; use safe palette fallback (no repeated exceptions or proxying without authorization).

**Accept when:** Two sufficiently different actual movie artworks lead to visibly different ambient themes, while titles with inaccessible image data have a graceful default and no console error storm.

### Feature 5 — NAVIGATION DESIGNER

- Choose top-navigation or sidebar arrangement where screen layout permits; provide TV-safe fallback.
- Reorder optional links, show/hide text labels, select one of a few icon treatments, change item density and active-indicator style.
- Preserve route semantics, authentication, existing pages, deep links, profile menu, and notification access.
- Never let users accidentally hide every way to access Studio or crucial safety/account controls. Provide a recovery/default path.
- Preserve existing Xbox LB/RB tab switching; studio customizations should not make it slower or ambiguous.

**Accept when:** Saved nav order is reflected on actual pages after refresh and keyboard/controller focus follows visible order with no inaccessible items.

### Feature 6 — LOADING SCREEN STUDIO

- Options: minimal branded logo, restrained cinematic fade, artwork reveal, Aurora loading, and reduced-motion/basic version.
- Expose transition speed and dimming within sensible bounds; animations should be short and cancellable.
- Show real loading milestones **only if genuinely observable** (e.g., app shell ready, profile ready, catalog fetched); otherwise use an honest indeterminate animation—not a fake percentage or gratuitous minimum delay.
- Never block normal interaction after content is ready. Smoothly dispose of overlays and avoid double loaders, flashes, looping failures, or watch-page overlay collision.
- Make assets lightweight enough for Xbox/low-end devices and support failure/retry states.

**Accept when:** Loading visibly changes according to the chosen style, ends as soon as relevant content is ready, and does not delay navigation or display false progress.

### Feature 7 — SOCIAL & AI HUD EDITOR

- Customize notifications and friend activity HUD: width/position where layout permits, density, transparency, icon style, animation intensity, compact/expanded notification previews.
- Customize the **visual presentation** of the current AI search/recommendation panel: spacing, panel size, preview cards, glass styling, notification/toast placement, and whether optional supporting panels are expanded by default.
- Existing AI form content, submitted prompts, controls, searches, message history (if present), and provider connections **must remain intact**. Do not delete inputs to make the UI cleaner.
- Avoid hiding critical error states or chat messages, overlapping film controls, or obstructing TV remote navigation.
- Respect notification permissions and privacy: do not add unsolicited tracking or disclose which friend is watching what unless the current app already legitimately supports and authorizes that.

**Accept when:** Studio HUD settings change actual notifications and AI interface rendering while a representative full AI form remains functional end-to-end.

### Feature 8 — POSTER INTERACTION EDITOR

- Offer a few distinct, restrained interaction presets: subtle lift, gentle zoom, info reveal, flat/no effects.
- Choose quick-action button visibility (e.g., play/details/add) only for existing functional actions.
- Match hover and controller focus behavior; focused TV items should reveal the same essential actions without requiring pointer hover.
- Keep hover out of expensive scrolling loops; no per-poster backdrop filters, massive box-shadow repaint storms, or JavaScript mousemove handlers on entire galleries.
- User can reduce/disable effects without losing focus indicators.

**Accept when:** Poster interaction differences can be seen and controlled using mouse, keyboard, and gamepad, while scroll smoothness is not degraded.

### Feature 9 — PROFILE-SPECIFIC THEMES / CROSS-DEVICE SYNC

- Separate appearance preferences by *real* signed-in profile (and reasonably by account) rather than one undifferentiated localStorage record.
- Use an existing authenticated backend/database only if the repository already provides a safe suitable persistence pathway. Verify existing profile IDs and permissions; a user may only edit their own theme.
- If true cross-device syncing is not feasible without new infrastructure or authorization, implement robust **per-profile local persistence plus theme export/import** and clearly label sync as unavailable; **do not pretend synchronization exists**.
- Support current legacy settings migration and a safe default for guest/non-logged-in use.
- Do not make theme saves wipe player options, watch progress, profile avatars, watchlist, or any other stored data.

**Accept when:** Switching between two existing profiles (or a verified test fixture) restores each profile's own custom Studio look; when sync exists, verify on two sessions.

### Feature 10 — PERFORMANCE LAB / DEVICE PRESETS

- Add safe presets: Auto, Desktop Cinematic, Mobile Balanced, Xbox/TV Lightweight, and Minimal/Low Power.
- Performance controls may selectively reduce blur, backdrop filters, Aurora motion, hover extravagance, page transitions, poster artwork animation, or heavy shadow layers—not player quality unless handled explicitly as a separate user control.
- Allow separate device-local overrides even if account appearance settings sync; low-powered Xbox should not be forced into desktop's costly style.
- Show understandable descriptions (“Fewer transparency effects”, “Still Aurora”) rather than misleading claims of exact FPS increases.
- Add a noninvasive diagnostics section only when based on **actual** measurements; don't display fake FPS, CPU usage, or objective performance grades.
- Benchmark representative scrolling, card hover, details open, player UI, and Studio tab switching. Instrument responsibly and compare before/after using repeatable test fixtures.

**Accept when:** Xbox Lightweight mode demonstrably disables expensive effects, still looks intentional, is saved locally, and maintains fully functional navigation.

### Feature 11 — ACCESSIBILITY & CAPTIONS

- User options for UI text scale, high-contrast palette, larger focus rings, reduced transparency, and optional larger hit targets.
- Respect OS-level `prefers-reduced-motion`, and optionally `prefers-reduced-transparency` where supported; explicit user settings must not override a stronger accessibility requirement silently.
- Keep visible focus outlines with both glass-on and glass-off.
- Avoid low-contrast overlay text, tiny text in dialogs, clipped labels, controls reachable only by hover, and inaccessible drag-only tasks.
- Ensure dialogs handle focus entry/return, Escape/Back cancellation, tab orientation, form labels, error announcements, and appropriate semantics.
- Caption controls must apply to real subtitle rendering only where the player supports it; otherwise clearly describe limitations.

**Accept when:** Keyboard-only, screen reader basics, and controller navigation can use all Studio sections and major actions; reduced motion fully disables nonessential movement.

### Feature 12 — THEME EXPORT, IMPORT & SHARING

- Save multiple named configurations/presets; duplicate, rename, delete, restore default.
- Export a portable versioned JSON file containing only appearance/Studio settings—never credentials, tokens, private messages, cookies, user identity, or watch history.
- Import via file picker or paste, with strict size limits, schema validation, allowed keys and ranges, safe handling of future/old versions, and a confirmation preview before apply.
- Provide a theme name/description, attractive in-app preview thumbnails and optional Copy Theme JSON functionality.
- **Community theme gallery can be a future enhancement** if it requires new moderation/infrastructure; do not fake a backend/sharing site. Portable file-based sharing must actually work now.
- Import must be reversible; no arbitrary CSS, HTML, JS, remote assets, or code execution from imported themes.

**Accept when:** Export on one browser/profile, import into another, preview, Save, reload, and observe the same eligible look; invalid JSON returns a useful error without changing user state.

---

## 3. BUILD ORDER — KEEP MOVING UNTIL COMPLETE

Implement in logical, independently testable phases. This is **one end-to-end task**; do not finish after just phase 1 and call it done.

**Phase A: Inspect and stabilize**
- Explore current HEAD and relevant code paths, catalog current Studio settings and actual data flows.
- Capture baseline screenshots if browser access is available, and baseline tests/performance traces.
- Make a short technical plan with files to change, conflicts and migration strategy.
- Create a feature branch and write a task checklist in the PR description or a project markdown file.

**Phase B: Studio foundation and coherent design tokens**
- Extend versioned schema, migration, safe storage, draft/commit/reset semantics, per-profile namespace.
- Create shared tokens for glass, colors, typography, motion and surfaces, with low-power variants.
- Update Studio tabs and context previews; implement feature toggles for all 12 sections.
- Ensure no settings panel is purely decorative; wire every enabled control to a real effect.

**Phase C: Largest user-facing upgrades**
- Homepage Builder.
- Advanced Theme Creator.
- Social & AI HUD Editor.
- Player Customization.
- Navigation Designer.

**Phase D: Refinement, media, and atmosphere**
- Adaptive Cinema Mode.
- Loading Screen Studio.
- Poster Interaction Editor.
- Accessibility/caption options.

**Phase E: Device/persistence/sharing**
- Xbox/TV and Performance Lab.
- Profile themes and any genuinely supportable cross-device persistence.
- Theme presets, export/import.

**Phase F: Integration and verification**
- Test migrations, cancellation, reload, profile changes, mouse/touch/keyboard/controller behavior, reduced-motion, older browsers and missing-feature fallbacks.
- Run all relevant automated suites; extend Studio tests and add cross-feature integration tests.
- Where possible, view in a real browser at desktop, phone viewport, and TV viewport. Compare screenshots and fix layout issues.
- Review perf regressions and fix before handing off. Verify the changed modules remain compatible with Render builds and server startup.
- Finalize PR(s), documented usage, screenshots and test results.

A risk/permission blocker to one feature should not stall other independent features. Work through the rest and identify blockers specifically at the end.

---

## 4. STORAGE / ARCHITECTURE CONTRACT

- Use a **versioned validated configuration** with explicit defaults, allowed enums, bounds and migration. Existing `swiflytv.appearance` settings must not be orphaned or silently lost.
- Separate concerns: global visual theme, home layout, navigation, player preferences, HUD, device-local performance and user-profile associations. Design for additive updates and feature-specific defaults rather than one fragile giant mutable object.
- Keep a transaction-like draft state in Studio: preview across pages where possible; **Cancel/Escape/Back** restores full prior state, **Save** writes it, **Reset** affects the draft until saved.
- Debounce high-frequency sliders and avoid full app rerenders; update CSS tokens where possible. Avoid multiple event listeners upon repeated modal open/close.
- Handle quota failures, blocked storage, broken JSON and stale schemas gracefully. If authenticated server sync exists, server must validate configuration and ownership; no unauthenticated universal theme writes.
- Keep exported JSON compact and independently portable, with `schemaVersion` and appropriate metadata. No sensitive data.
- All existing controls should use the current site's shared routes, auth/session, and backend; no parallel fake catalog, profile, or AI services.

### Suggested data shape (conceptual, not a mandate)

```
{
  schemaVersion: 2,
  appearance: { preset, accents, typography, glass, backdrop, aurora, adaptiveCinema },
  homepage: { sectionOrder, hiddenSections, heroMode, density },
  navigation: { layout, order, labels, activeStyle },
  player: { controls, captions, loadingBackdrop, autoHide },
  socialAI: { hudPosition, hudDensity, panelPresentation },
  interactions: { posterHover, focusStyle, pageMotion, loaderStyle },
  accessibility: { textScale, highContrast, reducedTransparency, largeTargets },
  deviceLocal: { performancePreset, overrides }
}
```

This is a suggestion: choose a schema appropriate to actual current code, and document the final version. Do not confuse a saved theme (portable) with private account data or a device-local performance override.

---

## 5. QUALITY BAR & REGRESSION TEST MATRIX

### Automated tests — minimum expected coverage

- **Persistence:** defaults, valid config, invalid enums/out-of-range sliders, corrupted JSON, older version migration, quota error, refresh persistence, guest & multi-profile isolation.
- **Preview:** changes apply immediately, Cancel restores every changed setting, Save commits, Reset never clears unrelated profile data, nested modal close and controller Back behavior.
- **Homepage:** reorder/visibility, default restoration, unavailable rows, keyboard/controller reorder, responsive rendering.
- **Theme:** theme token propagation to nav, details, Studio, player chrome, AI/notifications; glass at initial render.
- **Player:** control interaction, caption preview and actual track styling where available, video loading/error and party authority not broken.
- **Loader:** no forced delays, end on ready, honest indeterminate behavior, fail/retry state, rapid navigation and modal lifecycle.
- **Poster/Nav/HUD:** hover/focus parity, screen-size responsiveness, AI form intact, notifications still reachable, focus order correct.
- **Adaptive palette:** distinct art produces palette change, caching, CORS exceptions handled, fallback dark and readable.
- **Export/import:** valid round trip, malformed JSON, oversized files, unknown keys, no script/CSS injection, backward/future-version behavior.
- **Performance/accessibility:** reduced motion, low-power effect disabling, no repeated listeners, no background animation when hidden, TV remote focus tests.
- **Regression:** site routes, source/provider path, search, details, watchlist, profile, downloads, social, watch party, player, initial loading, mobile and desktop behavior.

Run, as applicable, `npm run check`, `npm run test:ui`, plus additional repository scripts identified at HEAD. Record actual failures and fix any new regressions. Distinguish environment-dependent failures from known code failures.

### Manual acceptance routes

1. Open Studio from normal navbar or `Ctrl/Cmd+E`; navigate by keyboard and Xbox controller.
2. Change every tab's setting and inspect corresponding real site UI—not just preview. Save and reload.
3. Open Studio again, make multiple changes, Cancel; verify all revert.
4. Switch profile/guest context, verify isolation and migration.
5. Browse homepage, movie details, AI recommendations, notification HUD, social/party, movie player, and TV mode.
6. Exercise down/up scroll, poster hover/focus, button presses, loading/transition changes on a resource-constrained viewport.
7. Enable Reduced Motion + Low Power and verify appearance remains beautiful, responsive, and functional.
8. Import/export a theme across separate browser contexts. Test broken file handling.

Never claim that a source, subtitle, download, party, or remote-controller scenario was verified on a real device unless you actually tested it.

---

## 6. PERFORMANCE REQUIREMENTS

- Favor `transform` and `opacity` for motion; avoid animating layout and paint-heavy properties continuously.
- Constrain transparent/blurred surfaces to visible, bounded elements. Prefer flattened fallbacks for Xbox instead of full-page `backdrop-filter` over dynamic images.
- Avoid blur-heavy nested glass and `will-change` on every movie poster. Keep persistent GPU layers to the minimum needed.
- No animation loop for settings with a static appearance; pause background animations for hidden tabs or when video playback takes priority.
- Avoid layout thrash, massive synchronous storage writes, or global DOM rebuilds when sliders move.
- Don't regress pointer responsiveness, navigation latency, scrolling fluidity, or movie card hover.
- For practical reproducible benchmarks, compare same catalog fixture, device profile, viewport and scenario. If exact hardware testing isn't available, say so.

**Reference guidance:**
- web.dev high-performance CSS animations: <https://web.dev/articles/animations-guide>
- MDN `prefers-reduced-motion`: <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion>
- MDN Gamepad API: <https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API>
- MDN Web Storage API: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>
- MDN canvas cross-origin restriction: <https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image>
- MDN View Transitions (optional with fallback): <https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API>

These are engineering references, not requirements to introduce new APIs. Use only what fits the existing architecture.

---

## 7. DEFINITION OF DONE — DO NOT JUST GIVE ME IDEAS

Only mark the upgrade *complete* when:

- [ ] All 12 feature groups are accessible inside Studio, integrated into the real SwiflyTV UI and behave as described.
- [ ] Appearance/home/nav/player/HUD changes are functional and persistent, not fake toggles or mockups.
- [ ] Import/export actually round trips, with validation and no leaked/private data.
- [ ] Existing theme settings migrate and cancellation/default logic works.
- [ ] AI form contents, AI backend integration, social, notifications and other established features remain intact.
- [ ] Studio, player, provider functions, loading, scroll, watch parties and controller focus do not regress.
- [ ] Desktop, mobile and TV modes have responsive usable layouts.
- [ ] Performance modes, accessibility, reduced motion and CORS/storage fallbacks are handled.
- [ ] Automated checks pass, or every unresolved failure is explicitly documented with evidence.
- [ ] A GitHub PR (or a clearly linked set of coherent PRs) with implementation code, docs, test changes and screenshots is ready for the user's review.

### Final Work response format

Deliver a concise but evidence-based implementation report with:

1. **GitHub repository, branch, commit SHA(s), PR URL(s).**
2. **What was actually implemented**, feature by feature, with a completion status.
3. **Screenshots** or accessible preview links where browser access allowed (or explicitly say if not tested visually).
4. **Tests run and results** with actual counts/commands.
5. **Performance before/after evidence** if measured; no invented numbers.
6. **Known blockers / user steps** (e.g., credentials, deployment, access permissions) with exact details.
7. **Deployment readiness** and whether you did or did not deploy. Don't merge without authorization.

Do not say “I can help you build this” and stop. **Actually work on the repository.** Prefer working implementations of all listed requirements to cosmetic facsimiles. If you cannot complete all twelve in the available session, deliver your working commits/PR for completed parts, an honest remaining checklist, and do not label unfinished parts as complete.

---

## 8. MESSAGE FROM THE PROJECT OWNER

“SwiflyTV has gone through a lot of updates. I want Swifly Studio to be incredibly premium, powerful and polished, but not slow or filled with excessive effects. I want the entire website—including AI, notifications, the movie details page, search, TV mode and the player—to feel like one cohesive product. Please **implement all twelve upgrades** in my actual code, keep everything that already works, and make sure the experience is smooth on Xbox. I care much more about real functionality, excellent design, and responsiveness than a bunch of fancy settings that don't do anything.”

**Start by inspecting my latest connected GitHub HEAD, and proceed with implementation.**
