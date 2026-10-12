# Cinematic details and smooth scrolling — v154

Movie and series Details links now open a rounded overlay above the catalog. The backdrop, title artwork, genres, actual TMDB rating, year and runtime sit together with compact glass Play, Trailer, Save and Like controls. The story, cast, episodes and recommendations continue below in one scroll view. Direct detail URLs still work.

English or language-neutral title logos are requested with the existing TMDB details call. The full title remains accessible and becomes the visual fallback when artwork is unavailable. Saved titles show their current My List state when the overlay opens.

Escape, the close button and backdrop clicks close the overlay. Focus returns to the original link and the catalog keeps its scroll position. TV/controller focus stays within the overlay; controller Back closes it. Series Play and episode links retain season and episode parameters.

Desktop mouse-wheel scrolling has a short, responsive glide. Poster-row arrows use the same motion. Keyboard, pointer and touch input interrupt it immediately. High-resolution wheel input, form controls, nested chat panels and the player retain native scrolling. Both the operating-system preference and the app's Reduce motion setting disable inertia and decorative movement. Sections enter gently as they appear, with a subtle backdrop offset and quieter scrollbars.

## Update

Keep your existing `.env`. Replace the project files, then run:

```powershell
npm install
npm start
```

Open http://localhost:3000 and refresh with Ctrl+F5. Runtime dependencies and Docker/Render startup remain unchanged. The new `jsdom` dependency is used only for development tests; Docker production installs omit it.

On Render, deploy the latest `main` commit. Keep the Docker Command blank so the Dockerfile runs `npm start`.

## Validation

```powershell
npm run check
npm run test:ui
```

The release has JavaScript syntax checks, CSS parsing, served-asset and generated-page checks, and 18 behavioral regression tests for details, saved controls, keyboard/controller focus and scrolling. The provider implementation and watch-page player are checked against v153.

The local browser preview was blocked by this environment's browser network/URL policy. Automated tests do not establish pixel accuracy or live third-party playback availability.
