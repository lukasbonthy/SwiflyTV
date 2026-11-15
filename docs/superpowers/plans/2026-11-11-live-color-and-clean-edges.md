# Live movie colors and clean artwork edges

**Goal:** Keep poster actions consistently clear, make the entire ripple follow current movie colors during an existing wave, cover the lower player title/header area, and soften artwork edges revealed by details depth.

**Architecture:** Retain the existing canvas and Play intent. Use neutral fallback colors, remove green tint/patch bias, and interpolate sampled frame targets on each painted frame. Extend the decorative layer through the player page while keeping its origin at the film. The browse scene receives a soft outer mask only while movie details are open.

**Constraints:** No playback, CORS, provider or dependency changes. Retain bounded canvas size and preference/lifecycle handling. Keep top navigation fixed and preserve native dialog, history, focus and scroll. User has requested direct implementation/publication; execute natively and review the completed branch.

**Root-cause evidence:** Poster-action CSS uses blur(10px) at rest and removes it during motion. The ripple canvas is limited to min(1100px,100svh), contains a fixed green palette and only colors selected patches. The browse scene scales full-bleed artwork to97% with no outer feather; computed artwork borders/outlines are empty, exposing a hard crop rather than an explicit border.

## Work

- [ ] Change poster-action paint to one stable clear state; update native scrolling/hover coverage while preserving nav refraction.
- [ ] Add failing color tests for no green bias, changing frames during a current ripple, protected neutral fallback and source replacement. Interpolate six color targets with bounded tiny-frame sampling and keep Play impulses.
- [ ] Cover the full player height and compute the origin from the actual film geometry; verify lower title-area coverage and stable player controls.
- [ ] Feather receding scene edges without applying an idle mask. Cover fractional scaling, fade continuity, close restoration and reduced motion.
- [ ] Run focused/full checks, production build and real hosted browser verification; obtain fresh read-only review and fix meaningful findings.
- [ ] Publish via GitHub/Render, verify protected live pages and asset bytes, and update the release checkpoint.

**Review focus:** current-wave colors must change without another Play; no forced green in a red/blue movie; protected sources keep a neutral fallback; long player pages keep a film-centered origin and bounded cost; masks clean up on close/reduced motion and do not change idle glass.

Historical recovered work: incorporated into the November 13 experience overhaul; current verification and publication follow docs/superpowers/plans/2026-11-13-experience-overhaul.md.
