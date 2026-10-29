# Themes with their own character

The user wants recognizable theme-specific details and movement. They explicitly suggested falling blossom leaves/petals and Halloween webs attached to the interface. Previous palette and wallpaper changes did not satisfy that requirement. Implement the examples and give the other themes their own coordinated motifs.

## Approach

Use original SVG/CSS ornaments on actual interface corners and a small CSS-animated particle layer. A canvas engine would add continuous JavaScript work; wallpaper-only changes repeat the rejected approach. Reuse the existing validated Studio settings and reversible preview lifecycle. This implementation choice follows the user's explicit examples and existing performance constraints, without another preference questionnaire.

## Theme identities

- Blossom (new): rose/plum palette, flowering branches on surfaces and gently tumbling pink petals.
- Halloween: visible corner webs, a small hanging spider, warm floating embers and existing moonlit artwork.
- Winter Lights: falling snow, frosted edges and warm strings of lights.
- Forest: drifting leaves and fern/branch details.
- Midnight: stars, a slow shooting-star accent and orbital line details.
- Cinema: drifting projector dust, film-frame details and a warm projector glow.
- Swifly Original keeps its existing moving Aurora and clear glass.
- Focus stays deliberately still, with matte surfaces and precise focus frames.

## Controls and constraints

Add a simple Theme details switch, default on. It is a portable profile preference and is preserved when choosing a preset. Keep all existing Advanced controls, named looks, custom palettes, imports, account data, AI fields, navigation and player behavior. Save/Cancel must apply/restore details immediately. Reduced motion leaves static ornaments and hides moving particles. High contrast, reduced transparency, Xbox/minimal modes and actual playback suppress decorative details. Pause animations in a hidden page and while a native dialog covers the page; the Studio live preview remains representative.

No new dependencies, external requests, per-frame JavaScript or unbounded timers. At most 14 viewport particles (8 on mobile), 5 miniature preview particles, and 6 anchored ornaments. Decorations are aria-hidden, inert and pointer-transparent. Use existing DOM containers without changing their layout; never replace or wrap navigation, forms, posters or the player. Reconcile dynamic anchors without observer feedback loops.

## Verification

Behavioral tests cover live motif changes, switch persistence, Save/Cancel, profile-safe portable roundtrip, duplicate initialization, dynamic anchor creation/removal, pause/resume, and comfort/playback suppression. Browser tests verify actual visible petals/web assets, running vs stopped CSS animation, hit testing of real controls, no overflow and matching Studio previews at 320/390/1440 and TV sizes. Inspect rendered screenshots. All eight theme identities must be visibly distinguishable beyond color.
