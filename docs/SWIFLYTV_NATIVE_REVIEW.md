# Native SwiflyTV release review

## Result

The final source restores the original Movies page hierarchy and integrates Kids, Audiobooks, Study and Languages with the existing dark catalog design. The Popular movies row has an underlined Today / This week / This month selector, a compact animated popout, keyboard and reduced-motion behavior, and independent data from the regular hero and Browse Movies. Month means popular releases in the current UTC calendar month.

Ripples sample a bounded 24×14 image of the complete movie frame. Regional color includes the whole-frame palette, dark border regions inherit available subject color, and black frames keep recent chromatic movie color. An opening black frame or protected video uses the existing public artwork or a stable movie-specific color. Existing source playback, access checks and offscreen/fullscreen/reduced-motion work limits remain intact.

## Review findings resolved

- Study uses the real site shell during geometry checks. Its wrapped navigation, headings, timer, large-target controls, tools, player and scrollable drawers have separate bounds at phone, short tablet, iPad, wide tablet and desktop widths. Saved Scenic, Focus and fullscreen layouts remain functional.
- Ripple visibility observes the movie page instead of its disabled decorative layer. Turning high contrast or performance effects off and back on recovers correctly, while genuinely offscreen players remain stopped. The regression failed on the previous code and passed after the fix.
- Hidden/inert period-menu items are excluded from visible-target geometry checks; exposed menu controls still require touch-sized targets. TV/controller assertions follow the restored real catalog ordering. Scroll and glow checks wait for their existing state transitions without changing product behavior.
- Audiobook title/author search, playable-only results, listening dialog, chapter controls, speed, sleep timer, progress and history are retained. The unrelated landscape and mood controls are removed.
- Kids retains conservative ratings, browser-scoped parent password controls and media/route guards. Its configured production secret is preserved. Languages retains genuine filters and pagination, with a searchable language grid rather than postcard marketing.

## Evidence

- Tested source: `765d698a597d304a6ae94c227383083c4d325f86`; tree: `7916b2503dc483189e5b27df3ff99f6e20132aa0`.
- Focused hosted visual run `43727274520`: 144 passed, zero failed, four model-dependent checks deferred to the wider workflow. Artifact `14166982315` has 383 screenshots/diagnostics; SHA-256 `032eeb0ac1606ba012e91ccb6c71e65d31ee62de3609dd6ae18ea7c11b8441e5`.
- Nineteen representative final states were inspected, including the underlined period popout at desktop/phone/320px, actual center-colored video with black edges, actual black video with retained ripple color, the four native sections, narrow listening controls, and Study navigation/drawer/Focus/fullscreen/large-target layouts.
- Source run `43727274522` and PR run `43727279542` both passed: 1,772 unit/service checks; recommendation evaluation and 20 story-route checks; 29 featured/artwork and 225 wider browser cases with zero failures/skips;33 integrated acceptance scenarios with 335 assertions. The unit phase defers 283 browser cases until hosted execution.

## Limits

Hosted Chromium and authenticated production HTTP do not measure physical iPad Safari frame rate or every external provider. Protected movie frames use the artwork/metadata color fallback rather than bypassing browser media protections.

## Production verification

- Merged PR165 application: `791a850c457b0d37517a5b8c372f72d7b89335d7`. Its tree exactly matches the tested source tree above.
- Render `dep-dbsso4u8bjmc73etrgbg` is live on that application commit, finished `2026-11-15T15:14:30.287412Z`. Startup application error query returned zero logs.
- Authenticated HTTP passed 39 checks: 14 routes; 19 exact public asset/bundle hashes; real page-two movie results; the compact period control with an unchanged regular hero; real audiobook title/author searches with audio/chapter metadata; and an isolated browser parent-control setup/lock, blocked adult title, rejected wrong password and successful unlock. The verifier changes only its in-memory browser cookies; no shared account or message was created.
- The existing private Kids secret, account/access settings and prior iPad safeguards were preserved. The subsequent `[skip ci] [skip render]` checkpoint changes documentation only.
- Final source, screenshots and live behavior have no unresolved release finding in this review. Physical iPad and external-provider limits remain as stated above.
