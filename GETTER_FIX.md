# SwiflyTV source discovery

All-in-One-Nuvio HTTP adapters now run before browser capture. The default order
is VidLink, VidSrc, and VidEasy; only a successful, validated media response can
win. If none resolves within 12 seconds, the existing Hexa/Cinezo browser path
continues inside the original route deadline. The native player and HLS proxy
receive the same verified source format as before.

The pinned upstream scripts, attribution, and license are in `vendor/nuvio`.
Workers have a 9-second provider budget, limited memory, and no inherited server
environment. Public addresses are resolved and pinned on each HTTP redirect,
response bodies are bounded, and cancellation stops requests and terminates the
worker before releasing its provider slot. Adapter output is kept out of logs.

VidLink's current `stream.qualities` response is accepted alongside the pinned
adapter's playlist response. Only successful source responses for the requested
media type and TV season/episode are considered, and each file still requires
HTTP verification. Verified MP4 sources marked `requiresProxy` use an opaque
`/api/media-file-proxy/{id}/video.mp4` URL. The proxy forwards byte ranges and
streams with backpressure, preserving seeking without buffering the full file.
Public-address checks apply on each redirect; client disconnects cancel the
owned upstream request. Reacher's observed files contain HEVC video, whose
playback depends on the browser's codec support. Provider budgets are unchanged.

Configuration: `NUVIO_ENABLED=false` disables these adapters;
`NUVIO_PROVIDER_ORDER=vidlink,vidsrc,videasy` changes their order.
`NUVIO_PROVIDER_TIMEOUT_MS` and `NUVIO_TIMEOUT_MS` adjust their bounded budgets.
These settings work in no-env mode. `/api/playback/health` reports their state
under `discovery.nuvio`; source diagnostics label them `nuvio-vidlink`,
`nuvio-vidsrc`, and `nuvio-videasy`.

Nuvio debug results include request/response counts, rejected responses,
connection errors, and DNS errors. `requests` counts adapter request attempts;
`responses` also includes media verification responses. `metadataStatus` is the last TMDB HTTP status;
`upstreamStatus` is the last other upstream HTTP status (zero means no response).
These counters distinguish metadata failures from unavailable source helpers.
They contain no upstream URLs, response bodies, or credentials.

TV playback uses the same verified-source and HLS proxy path, with season,
episode, and source choice preserved through polling, cache identity, and
fallback. The episode picker loads selected-season titles, stills, and runtimes;
metadata failure retains numbered episode links. At most 200 cards are rendered
around the selection, including accepted large episode numbers.

Default TV discovery does not fall into title-only download-site searches after
episode-aware providers fail. Those searches cannot select the requested season
and episode and previously consumed the remaining source-job deadline. Provider
failure reasons are retained; automatic movie download-site fallback is preserved.

TV browser fallback tries VidRift's public `/embed/tv/{tmdb}/{season}/{episode}`
entrypoint before Hexa and Cinezo. This is the same episode URL offered by
Cinezo's source menu, without loading its watch-page wrapper first. Capture uses
the existing verified-response, gate handling, cancellation and HLS proxy path.
Nuvio remains first, movie provider order is unchanged, and request budgets are
unchanged. `STREAMPROVIDER_TV_ORDER` can override the TV browser order.

An observed VidLove origin-warning MP4 is rejected by its exact strong ETag,
byte count, and MIME type; it cannot masquerade as an episode. Capture continues
searching for genuine media and reports a blocked provider if only the warning
is returned. `protectionClips` is a safe diagnostic counter. Other short MP4s and
the existing full-file formats remain supported.

The player distinguishes a stalled download from interrupted playback. Paused
or sufficiently buffered video stays visible; actual playback advancement
clears the compact buffering indicator, while real stalls retain their deadline.

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
