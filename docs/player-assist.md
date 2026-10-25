# Player assist and server continuity

The skip service requests `https://api.theintrodb.org/v4/media` using the TMDB ID and media type. TV lookups include the selected season, episode and `mapping=official` for the catalog's aired episode numbering; movie lookups omit all episode and mapping parameters. V4 resolves the alternate TMDB identity to its own TVDB identity, so playback IDs are never replaced by returned TVDB IDs.

Every returned intro, recap, credits and preview window is converted from integer milliseconds to seconds. A null start means the beginning of the media; a null end stays null until the browser knows the actual media duration. Missing, malformed or mismatched episode data supplies no timing. The response keeps `segments` as the first window of each kind for older clients and adds the complete `windows` arrays.

If V4 has no usable timings, the service tries the separate legacy IntroDB service at `api.introdb.app` with IMDb metadata. `source` is `theintrodb`, `introdb`, or null according to the data actually returned. Each source has a five-second deadline covering its metadata, request and response body. Concurrent requests for one episode share a lookup; results, including misses, are cached for one hour with a 300-entry limit. Service shutdown aborts active lookups.

Manual skipping uses the existing player seek API for every window kind. The profile's `SwiflyLibrary.preferences().autoSkipIntro` enables automatic intro skipping only while actual media is playing, ready, and outside buffering or an active seek. Each intro window is attempted once for that media entry; time updates or a replacement source do not repeat it. A new episode resets the window state. Party guests cannot skip; hosts use the existing synchronized seek action. Playback settings link to the community contribution page.

For solo TV playback, the player records a recognized installed Nuvio provider only after native `canplay` or `playing` confirms media readiness. A provider choice alone is never treated as successful playback. The device-local storage key is scoped to the account owner and profile, and the `rememberLastServer` preference can disable and clear it. Streams, credentials and arbitrary provider names are never stored.

On the next TV entry, one bounded request tries that remembered provider through the existing manual-server endpoint. Unavailable, timed-out, malformed or mismatched responses fall back to unchanged default discovery. The probe never changes shared provider jobs or an explicit provider choice. Movies, managed playback, remote/manual parties, changed profiles and stale resolver generations bypass or invalidate continuity.

Official contract references:

- <https://theintrodb.github.io/theintrodb-npm/getting-started.html>
- <https://theintrodb.github.io/theintrodb-npm/migration-v3-to-v4.html>
- <https://github.com/TheIntroDB/theintrodb-npm/blob/main/src/funcs.ts>

Focused checks: `node --test tests/player-assist.test.cjs tests/player-assist-ui.test.cjs tests/server-continuity.test.cjs`. Native player and host/guest regressions run separately. Provider and API fixtures verify behavior without depending on external content availability.
