# SwiflyTV v163

This update keeps the working StreamProvider sources and improves their retrieval path. No CineSrc resolver or new dependency is installed.

## Faster discovery

- Start the preferred provider immediately; hedge a second direct provider after 1.8 seconds if needed. At most two captures run per lookup.
- Stop waiting for navigation, slow child frames, or polling when actual media has been verified. Candidate checks are bounded to two concurrent requests.
- Cancel losing captures and await their request/context cleanup. Keep the existing shared browser, origin-scoped stream headers, media validation, source cache, TV inputs, and other configured fallback adapters.
- The player can wait for a ready result in one response for up to eight seconds. Requests remain within their HTTP deadline; other clients can continue using immediate polling. Closing a viewer's request does not cancel the shared source job.
- Existing default limits remain: 27 seconds per provider, 60 seconds for local discovery, and 75 seconds for the whole source job.

Optional environment controls:

```dotenv
STREAMPROVIDER_HEDGE_DELAY_MS=1800
STREAMPROVIDER_MAX_CONCURRENT=2
```

Set `STREAMPROVIDER_MAX_CONCURRENT=1` to keep sequential capture on a memory-constrained host. `MOVIE_SOURCE_MAX_CONCURRENT` separately limits simultaneous title lookups. `/api/playback/health` exposes the safe timing/concurrency settings without starting a browser.

## Lighter pages and weighted scrolling

The shared 861 KB stylesheet is served as a cached local asset instead of repeated in every HTML response. Catalog/welcome pages stop loading unused UI frameworks and media libraries. Player and party routes still load the dependencies they use.

Navigation retains liquid refraction; ordinary controls use lighter blur and highlights. Surface observers scan added subtrees instead of repeatedly scanning their parents. Disabled glass avoids SVG creation. The controller loop stops when TV mode is off or the tab is hidden.

Mouse-wheel scrolling has a responsive 110 ms damping curve, preserved travel distance, prompt reversal and bounded momentum. Trackpad gestures, touch, keyboard input, nested panels and player controls remain native. Motion and observation stop for reduced-motion/native settings and hidden tabs.

## Welcome and Aurora

The welcome screen has larger editorial typography, real selected movie/series posters, clear signup/login actions, and responsive catalog previews. It still offers account creation when metadata is unavailable. Decorative motion does not require a welcome JavaScript controller.

New users start with Aurora. Existing saved Clean/Film grain settings stay intact. Change the background in **Swifly Studio → Appearance → Background**, preview it, then save; Cancel restores the previous look. Aurora uses a bounded static artwork layer animated only with slow transforms and opacity. It pauses for hidden tabs and reduced motion and stays off during playback.

The requested ShuttleTV settings page and its linked mirror returned client-side exceptions in this session. The aurora follows that requested visual direction; exact equivalence was not verified.

## Updating

Keep your existing `.env`, accounts and profiles. Install the new code and restart, or deploy the latest GitHub `main` on the existing Render service. Docker/browser setup is unchanged. No new paid Render service or background worker is needed.

Regression checks cover media validation, early capture, fallback/abort cleanup, shared waits, native input, glass growth, Studio drafts and generated pages. Live provider timing and browser/GPU appearance were not tested in this environment.
