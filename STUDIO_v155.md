# Swifly Studio — v155

The former customization drawer is replaced by a complete appearance workspace. Open Studio using the settings icon in the header, Ctrl/Command + E, `?studio=1` or `#studio`.

Appearance offers four visual presets — Pure, Cinema, Midnight and Focus — along with five muted accents, four font choices, solid/soft/liquid glass, and optional film grain. Layout controls now affect the actual catalog: classic rows, larger cinema rows or a poster wall, with poster corners and spacing. Motion has separate controls for smooth wheel scrolling and reduced motion. Operating-system reduced-motion settings retain priority.

The live preview uses the current page's title, backdrop and posters when available. Placeholder shapes appear on pages without artwork. It shows your appearance choices without inventing movie ratings or watch history.

Changes preview immediately across the site. Save changes writes one validated appearance record to this browser. Cancel, Escape, controller Back and backdrop dismissal restore the previous settings. Restore defaults changes the draft; it does not clear your session, watchlist or other browser data. Storage failures keep Studio open with an error instead of claiming success.

Valid older appearance settings are read when no current appearance record exists. Superseded layouts and card styles are mapped to the closest current option. Presets preserve the user's reduced-motion preference.

The workspace has keyboard tabs, visible focus states, native dialog behavior and a single scrolling content area on small screens. Controller focus follows the foreground dialog when Studio opens above movie details.

## Update

Keep your existing `.env`, replace the project files, then run:

```powershell
npm install
npm start
```

On Render, deploy the latest `main` commit, then refresh the site with Ctrl+F5. Docker startup, runtime dependencies and the provider/player implementation are unchanged.

## Validation

```powershell
npm run check
npm run test:ui
```

Checks cover generated pages and served assets, CSS parsing, Studio saving/cancellation, migration, invalid preferences, storage errors, preview content, keyboard tabs, nested controller navigation and motion settings. The existing movie-details and scrolling tests run in the same suite. The watch-page player and provider implementation are compared with v154.

Local browser rendering is blocked by this environment's preview access policy. Automated checks do not establish pixel accuracy or third-party playback availability.

Native dialog behavior follows [MDN's showModal documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal). The visual controls were informed by the [shadcn theme system](https://ui.shadcn.com/docs/theming), implemented as local HTML/CSS/JavaScript without a new framework dependency.
