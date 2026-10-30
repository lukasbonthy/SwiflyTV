# Four-provider Stremio addon bridge

SwiflyTV can use a **separate Stremio-compatible addon service** for 4KHDHub, UHDMovies, MoviesDrive, and ShowBox. This is a transport integration: the upstream provider scripts run inside the addon service, not inside SwiflyTV's Node process. No obfuscated third-party scripts are downloaded and executed at boot.

## Setup

1. Run or choose a Stremio-protocol addon that you are authorized to use, supports these four providers, and serves an HTTPS `manifest.json`. The upstream [Nuvio Streams](https://github.com/tapframe/NuvioStreamsAddon) project describes a self-hosted addon implementation; it is archived and its former free public instance has been [retired](https://nuviostreams-is-deprecated.elfhosted.com/). **Do not use the retired public URL**. Assess maintenance and security risks before self-hosting any older scripts.
2. In your **server-side** Render environment set `SWIFLY_STREMIO_ADDON_URL` to the addon's HTTPS origin, or its exact HTTPS `/manifest.json` URL. If the addon uses configuration encoded in its URL path, include that path. Do not put credentials into browser-facing files or share a personalized addon URL.
3. Redeploy. By default the four new providers are appended to the existing provider order. If `NUVIO_PROVIDER_ORDER` is customized, include `4khdhub,uhdmovies,moviesdrive,showbox` there explicitly.
4. Open a movie player, select **Servers**, then choose one of the four providers or click **Find 4K (2160p)**. The 4K scan prioritizes the newly configured bridge providers.

## Security and compatibility

- The bridge uses SwiflyTV's outbound HTTP fetcher with public-address checks, redirection checks, timeouts and size bounds. It will not accept private-network destinations or unsafe URL schemes.
- The service returns Stremio `streams[].url` records. SwiflyTV accepts only direct HTTP(S) MP4/WebM/HLS/DASH candidates and re-verifies them. It does **not** run torrent hashes, download archive files, or bypass DRM.
- Only a matching provider heading counts as provider identification. 4KHDHub's name alone **does not** establish 2160p. 4K must be explicit in the stream's returned resolution metadata, and the media URL must pass verification.
- MKV files and other codecs/containers the browser cannot decode are intentionally not presented as playable. True 4K availability may therefore be limited. HDR, Xbox codec compatibility and individual title availability aren't guaranteed.
- Provider scripts can fail due to external sites changing, host restrictions, missing credentials or local legal permissions. A failed bridge source leaves existing SwiflyTV playback available.

## Diagnostics

`GET /api/nuvio/providers` reports which adapters are installed and selected. If no URL is configured, the new providers are not installed/selected in the API. `GET /api/player/find-4k/movie/<TMDB_ID>` searches for verified 2160p; a 404 means none was verified, not that the title doesn't exist.

Tests: `node --test tests/addon-provider-bridge.test.cjs`, then `npm run check`, `npm run test:ui`.

Source: [Stremio addon protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html). The external service is independent; no third-party provider content or scripts are bundled with this repository.
