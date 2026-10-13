# SwiflyTV v163

A dark movie and series catalog with liquid glass navigation, rich detail overlays, watch parties and a customizable atmosphere.

This release keeps the working sources and improves retrieval with staggered fallback, early verified-media completion and ready-response waits. Pages reuse cached styles, ordinary glass surfaces cost less to render, and mouse-wheel scrolling has more weight. The welcome screen has real poster artwork and a new Aurora atmosphere.

Details: [PERFORMANCE_v163.md](PERFORMANCE_v163.md). Source setup and troubleshooting: [GETTER_FIX.md](GETTER_FIX.md).

## Start on Windows

Use Node.js 20 or later. In PowerShell, inside the project folder:

```powershell
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm run install:browser
npm start
```

Set your own `TMDB_API_KEY` in `.env` if needed. Open http://localhost:3000 and keep the terminal running. When updating, keep your existing `.env`; the ZIP excludes private keys, dependencies and browser binaries.

## Render

Deploy the latest `main` commit on the existing Docker web service. The included Dockerfile has the matching Chromium runtime. No additional service or package is required. [GETTER_FIX.md](GETTER_FIX.md) describes the safe playback health endpoint and browser setup.

## Appearance

Open Swifly Studio to adjust background, glass, typography and layout. Aurora is the new-user background; saved Clean/Film grain choices are preserved. Preview changes, then Save or Cancel. Smooth scrolling can be disabled, and reduced motion is respected.

## Checks

```powershell
npm run check
npm run test:ui
```

Movie details, navigation, watch-together entry and the current player remain integrated with the catalog. The default sources are still `hexa,cinezo`; other configured adapters remain fallbacks.
