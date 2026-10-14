# SwiflyTV source discovery

The v163 speed changes keep these providers. A second direct source starts after 1.8 seconds when the preferred source is still loading; the first verified source wins, and losing work is cancelled and cleaned up. Verified media can interrupt navigation immediately. The native player uses an optional bounded response wait to avoid an extra polling delay. See [PERFORMANCE_v163.md](PERFORMANCE_v163.md).

The getter now checks successful HTTP responses instead of choosing an outgoing `.m3u8` request. It detects HLS by MIME type and playlist content, including signed URLs without a file extension. HTML errors, failed responses, ad/background/trailer videos, and individual `.ts`/`.m4s` fragments cannot win.

Playback recovery restores native video and common player-surface clicks alongside labeled play buttons. If Chromium fails a known playlist request with `net::ERR_FAILED` (including CORS failures), the getter verifies that exact URL through the browser context's server-side request client using its original request headers. Only a successful manifest can become a source; credentials are removed on cross-origin redirects. Decorative images and fonts are skipped during capture, while player styles, scripts and media remain enabled.

A visible human-verification gate on the main source page ends that provider attempt as `provider_blocked`, allowing the existing configured fallback to run without waiting for the provider timeout. Gated child frames are skipped so they cannot discard playable sibling frames. Verification challenges are never clicked or solved by the getter.

It observes responses throughout the browser context, inspects native video sources and child frames, and activates actual play controls. A partial navigation timeout keeps the page available for discovery. Slow direct providers are hedged within the route budget; the first verified source wins, and losing contexts are closed before the lookup finishes. Direct MP4, MPD, MKV and other existing supported full-file URLs remain supported, along with verified extensionless MP4/DASH responses. Successful direct TMDB-id discovery no longer waits for a title-metadata lookup.

Windows keeps your explicitly configured browser cache path. Otherwise Playwright uses its normal local cache; Docker uses `/ms-playwright` when present. Browser startup is shared, limited to 15 seconds, and retries after a disconnected or failed browser. The matching Playwright package and Docker image remain pinned to 1.49.1.

Captured HLS request cookies and authorization are retained inside the server proxy, scoped to the source origin and removed on cross-origin requests or redirects. They are omitted from player responses and debug output.

## Windows PowerShell

Stop the old server with Ctrl+C. Extract the new ZIP, keep your existing `.env`, and run these as separate commands in the project folder:

```powershell
npm install
npm run install:browser
npm start
```

Open `http://localhost:3000`. If you previously set `PLAYWRIGHT_BROWSERS_PATH=0` in `.env`, keep it; the installer and server will use the same location. No new TMDB key is needed.

## Render

Deploy the latest GitHub commit using the existing Docker service and project Dockerfile. Keep your TMDB environment variable. Native Node services can run `npm run install:browser` after `npm install`, but need the system libraries required by Chromium; the supplied Docker image includes them.

## Diagnostics

- `/api/playback/health` reports cached browser readiness and provider budgets without starting a browser or exposing local executable paths.
- `/api/local/streamprovider-debug?tmdb=YOUR_TMDB_ID&type=movie` runs a bounded lookup and reports provider outcomes, response counts and frame/play activity. TV also accepts `season` and `episode`.
- `browser_unavailable` means the local browser could not start. Install Chromium/redeploy Docker, restart, then retry.
- `provider_blocked` means a source or player request was rejected. This build does not bypass access restrictions.
- `no_source` means the providers supplied no usable media during their budget.

Default provider budget: 27 seconds each; total StreamProvider route: 60 seconds. The existing whole-job limit is still 75 seconds including other configured fallbacks. Two movie lookups may run concurrently by default; `MOVIE_SOURCE_MAX_CONCURRENT` allows 1–6. To customize the forced provider defaults, set `SWIFLY_NO_ENV_MODE=false` and supply your preferred settings. Existing optional adapters remain available.

Verification uses fake Playwright contexts, local HTTP fixtures and DOM tests. Third-party availability for a specific movie or episode still needs a live lookup on your deployment; a successful automated test does not establish that an upstream provider currently has the title.
