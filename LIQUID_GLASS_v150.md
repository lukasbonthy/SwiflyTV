# Liquid glass navigation — v150

The floating header, profile dropdown and mobile navigation use locally hosted liquid glass assets. Chromium browsers receive an SVG refraction filter with separate RGB displacement layers. Firefox, Safari and browsers without SVG backdrop support receive a frosted blur fallback.

Each glass surface has its own filter ID and resizes with its host. No remote glass library or build step is required. Reduced transparency preferences disable the refraction filter.

Assets: `public/liquid-glass/liquid-glass.css` and `public/liquid-glass/liquid-glass.js`.

The API keys and playback provider configuration stay on the server.
