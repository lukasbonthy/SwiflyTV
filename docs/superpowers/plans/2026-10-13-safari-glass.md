# Safari SVG backdrop repair

> **For agentic workers:** Use superpowers:executing-plans to implement the repair and verify the rendered result.

**Goal:** Make Safari and iPad glass visibly refract the content behind the navigation and prominent actions.

**Architecture:** Keep WebKit's native live blur. Feed a bounded copy of the intersecting page backgrounds, images and text into an inline SVG displacement filter, clipped to the lens rim. Share layout reads between lenses in a frame and update only after source changes, scrolling, resizing or loading.

**Tech Stack:** Existing vanilla JavaScript, CSS, SVG, Node tests and Playwright WebKit/Chromium.

**Spec:** User request: “make the swiflytv safari svg liquid glass actually work, its supposed to bring the liquid glass into safari and ipads”.

## Global Constraints

- Keep the existing Chromium renderer and glass preferences.
- Keep overlays noninteractive and hidden from assistive technology.
- Do not clone active controls, media players or sensitive form values.
- No continuous animation loop or filter graph on every poster action.
- Refresh asset URLs so cached iPad clients receive the repair.

## Review Focus

- iPad desktop identity and iPad Chrome must use the WebKit path.
- The visible SVG output must change when displacement is toggled.
- Source movement must align with fixed navigation after scrolling.
- Dynamic backgrounds and text must update without feedback loops.
- Hidden/offscreen/reduced-transparency modes must suspend work.

### Task 1: Repair the WebKit scene input

**Files:** `public/liquid-glass/liquid-glass.js`, `public/liquid-glass/liquid-glass.css`, `public/liquid-glass/surfaces.js`, `tests/glass-performance.test.cjs`.

**Interfaces:** Preserve `SwiflyLiquidGlass.mount(element, options)` and its controller. WebKit SVG contains a noninteractive scene group that uses actual page content as `SourceGraphic`.

- [x] Add failing tests for actual background/text input, source updates, fixed-pane scrolling and desktop-mode iPad detection.
- [x] Run the tests and confirm missing scene input is the failure.
- [x] Add bounded scene sampling and an SVG displacement map; reuse the graph during source updates.
- [x] Run glass regressions and visually verify SVG filtering in WebKit.

### Task 2: Verify and release

**Files:** `scripts/verify-safari-glass.cjs`, `server.js`, `tests/player-integration.test.cjs`.

**Interfaces:** The browser verification command exercises actual raster output, interaction, scroll alignment and accessibility lifecycle.

- [x] Add and run a real rendering verification for WebKit at iPad sizes and Chromium.
- [x] Refresh the glass asset versions and update existing markup checks.
- [x] Run syntax checks and the full existing Node test suite.
- [x] Review the changes, commit and publish the verified repair to GitHub.

## Validation and review

The independent review found an image-load feedback loop and stale samples after source transitions. Both now have regression tests that failed before the corrections and pass afterward. Sampled paint events are ignored; original transition/animation completion refreshes the scene.

Browser pixel comparisons passed in Playwright WebKit 18.2 at 1024×768, 768×1024 and 1366×900, and Chromium at 1280×800. The verification includes actual IMG content, idle sampling, source changes, completed fades, scroll alignment, click interaction and glass preferences. Production Home and Movies markup also showed changed pixels when background displacement was toggled. This is browser-engine QA, not physical-device testing.

The smaller capture uses flat, static foreignObjects with negative margins. Positioned HTML wrappers caused WebKit to bypass the ancestor SVG effect, so they were removed. WebKit uses a single full-color displacement pass to limit software filtering work. The full Node suite passed 420/420 and syntax checks passed.
