# SwiflyTV v160 — One browsing and watching flow

The Party navigation now opens the existing movie catalog at `/movies?party=1`. It keeps the same hero, genres, posters and rows, adding a small invite field and open-party list. Movie details open party setup on the regular movie player. A room appears as a conversation beside that same player, with shared playback, invitations, presence and chat. Community conversations and older blank or embedded-media rooms remain available through their existing links.

The movie player uses one native video element and a single glass control dock. It includes seeking, volume, playback speed, available quality and caption tracks, keyboard controls, fullscreen and picture in picture where supported. Party guests keep their own sound and captions; the host controls shared playback. Official trailers stay in a separate trailer mode. TV season and episode links are retained.

Source discovery now returns an immediate pending response, shares concurrent lookups for the same title, and ends after a fixed deadline. The default whole-job deadline is 75 seconds; `MOVIE_SOURCE_DEADLINE_MS` can shorten it within the supported 10–75 second range. Explicit Retry starts a fresh deadline. Failed requests stop automatically; aborted unfinished provider jobs still count toward the concurrency limit, preventing repeated Retry from creating unlimited work. The player also bounds requests, response bodies, media setup and buffering. It prefers the server’s browser playback/proxy URL. HLS, DASH and direct media remain supported when the browser and the returned source permit playback.

An unavailable provider can still prevent a film from playing. This update turns that failure into an actionable state instead of an endless “finding m3u8” screen.

## Update an existing Render service

Deploy the latest commit from `main`. Keep the existing environment variables and service settings. No new service or paid resource is required. If automatic deploys are enabled, publishing this commit triggers the normal deployment; otherwise use **Manual Deploy → Deploy latest commit**.

## Local update

Extract the full ZIP into a fresh folder and copy your existing `.env` into it. In Windows PowerShell:

```powershell
npm install
npm start
```

Use the existing browser installation settings from `POLISH_v153.md` if your playback providers require Chromium.

## Verification

```powershell
npm run check
npm run test:ui
```

Behavior tests cover bounded source jobs, real HTTP polling, native player lifecycle, shared playback permissions, room cleanup, details links and the catalog entry. CSS and generated inline JavaScript are checked separately. These checks do not prove that an external provider is available or verify live rendered pixels.
