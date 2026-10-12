# More glass surfaces — v152

Liquid glass extends to primary and secondary actions, poster controls, row arrows, search, genre menus, detail tabs, authentication cards, account panels, settings and dialogs.

The backdrop filter is applied directly to each control or panel. The hidden SVG filter is appended after its normal contents so icons and labels retain their order. IntersectionObserver activates refraction near the viewport and releases it offscreen. Dynamically rendered controls receive the same effect, including buttons whose label changes after saving a title.

The player’s own controls are excluded. Browsers without supported SVG filters retain the blur fallback.

Assets: `public/liquid-glass/surfaces.css` and `public/liquid-glass/surfaces.js`.
