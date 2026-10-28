# Cinematic themes redesign

The user rejected the merged themes' appearance. The existing theme cards suggest distinct scenes, but most actual panels remain the same gray and the seasonal decoration is barely visible. Improve the shipped themes themselves and make Studio previews truthful.

## Direction and approaches

An accent-only refresh is small but leaves the scene/actual-page mismatch. A full page-layout redesign would disturb unrelated features. Use the existing theme settings and layout with coordinated surface tokens, stronger atmospheric backgrounds, and original seasonal artwork instead. This is an implementer decision; an optional style question received no answer. Preserve the seven theme identities, custom palettes, all Advanced controls, Save/Cancel, account portability, and library behavior.

## Visual design

Halloween: near-black charcoal, burnt orange, moonlit violet and a cinematic misty woodland background. Winter Lights: deep blue-black, ice blue and champagne, with a snowy evergreen/aurora scene. Other themes get distinct coherent palettes and lighting. Decorative imagery sits behind content, fades into the canvas and never replaces catalog posters or hero art. Replace miniature CSS pumpkin/tree shapes with image-backed theme cards. Improve card labels, selection feedback and live preview surfaces so the theme reads consistently across navigation, search, Settings, Account, List and Studio.

## Constraints and verification

Reuse vanilla JS/CSS and current config; no new dependencies or account/data changes. Serve optimized local WebP assets with a dark CSS fallback. Respect high contrast, reduced transparency/motion and Xbox/minimal performance. No per-frame JS or continuously animated bitmap layers. Verify theme selection, Save/Cancel, persistence, custom palette override, keyboard focus and phone/desktop layouts using existing tests and actual rendered screenshots. Include local asset-loading and readability checks.
