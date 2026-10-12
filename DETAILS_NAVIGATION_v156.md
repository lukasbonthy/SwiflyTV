# Details-first browsing and Back navigation — v156

Catalog and saved-library posters now open the title's details. Play is a separate action, so browsing a poster does not count as starting playback. Continue Watching still resumes playback directly.

The title overlay uses more of the screen and keeps Back and Close available while scrolling. It retains the backdrop, title artwork, real TMDB facts, story, cast, series episodes and recommendations. Movies belonging to a TMDB collection also show their related titles, with the current movie marked Viewing. Collection failures leave the rest of the details available.

Opening a poster adds `media=movie-ID` or `media=tv-ID` to the current URL while preserving search/filter parameters and the page hash. Browser Back dismisses that overlay; Forward reopens the selected title at its previous scroll position. A direct shared media URL opens details without silently adding a history entry; its in-panel Back/Close clears the selection and reveals the catalog, while the browser's Back retains normal navigation to the previous page. Recommendation selections reuse the overlay's history entry; its Back button returns through previously viewed titles and their scroll positions. Close returns to the original catalog without a chain of stale detail entries.

Standalone title pages have a clear Back to browsing link. It uses a validated same-origin catalog referrer or saved browsing route, with Home as the fallback. It does not blindly traverse unrelated browser history.

Player Back returns to a matching title view. It uses browser history when the actual referrer proves the destination, retaining the existing page and scroll. A validated return link handles fresh document loads; saved catalog/detail scroll is restored when the referrer matches that title's player. This context is consumed once, so a fresh shared link does not reuse an old playback position. External or mismatched stored destinations are rejected. Controller Back uses the same title navigation and page return links.

## Update

Keep your `.env`. Replace the project files and run:

```powershell
npm install
npm start
```

On Render, deploy the latest `main` commit and refresh with Ctrl+F5. The rebuilt Studio and existing provider/player features are included. Runtime dependencies and Docker startup are unchanged.

## Validation

```powershell
npm run check
npm run test:ui
```

Behavior tests cover poster/Play separation, shareable URLs, Back/Forward, filtered catalog returns, recommendation trails, shared links, player returns, scroll restoration, collection metadata, and the existing Studio/details/motion behaviors. Generated-page, served-asset and CSS checks also run. Provider code and the watch-page implementation are compared with v155, allowing only the intended Back-link markup change.

The ShuttleTV reference was inspected in the browser, including a poster click and browser Back. Rendering the local SwiflyTV app remains blocked by this environment's preview policy, so these checks do not establish pixel accuracy or third-party playback availability.

History handling follows [MDN's History API documentation](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState), [popstate guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event), and [Chromium's history intervention rules](https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md). Movie collections use [TMDB's collection details endpoint](https://developer.themoviedb.org/reference/collection-details).
