# Optional Trakt connection

Trakt is an optional connection in `/settings`. A signed-in SwiflyTV account is required. Without the server configuration below, Settings explicitly shows that Trakt is unavailable; browsing, playback, profile preferences and the local library continue to work.

## Server configuration

Register a Trakt application and configure these server environment variables:

| Variable | Value |
| --- | --- |
| `TRAKT_CLIENT_ID` | The registered application's client ID. |
| `TRAKT_CLIENT_SECRET` | The application secret, kept on the server for refresh/revocation requests. |
| `TRAKT_REDIRECT_URI` | A fixed HTTPS URL on the SwiflyTV origin, ending in `/api/trakt/callback`. It must exactly match the registered callback. |
| `TRAKT_REQUEST_TIMEOUT_MS` | Optional provider request timeout, 100–15000 ms; default 8000 ms. |

Do not put these credentials in browser configuration or commit their values. A persistent account store is required, just as for SwiflyTV account sync. Tokens live in the private account record; the account bootstrap and exported library state do not contain them.

`server.js` mounts `createTrakt({store:accountStore, authenticate:connect.identity, tmdb})` at `/api/trakt`. The authentication function must be the existing server-verified session identity. `public/clean/settings.js` loads after the account and library scripts on every page so actual catalog/player changes can be forwarded; `settings.css` styles the Settings page. `ui/settings.js` exports `settingsMarkup()`.

## Connection and behavior

Connecting uses the current Trakt authorization host, `https://auth.trakt.tv`, with PKCE S256, a cryptographically random state, and a ten-minute authorization attempt tied to the initiating SwiflyTV account and session. State is consumed once, including denied attempts. The callback and token requests always use the configured callback, never an incoming Host header or a browser-supplied redirect. The initial PKCE exchange omits the client secret as recommended by Trakt. Access-token expiry comes from the provider response; refresh tokens rotate atomically in an account-store transaction. An invalid refresh grant requires reconnection and is not retried with the same refresh token.

Opening Settings does not import or export an entire library. **Sync from Trakt** explicitly imports:

- `/sync/watchlist`, for movies and shows with TMDB IDs;
- `/sync/watched/movies`, with the provider's last watched timestamp;
- `/sync/watched/shows?extended=progress`, preserving the exact show TMDB ID, season and episode number.

Every list sends `page` and `limit`, follows the returned pagination headers, and stops at 20 pages per endpoint with 100 requested items per page. The profile capacity is 300 watchlist titles and 1000 watched records, matching the browser library. Existing entries are retained first. An import reports its actual matched counts, unsupported items and whether page/capacity limits prevented a complete import. Missing TMDB IDs are skipped rather than replaced by another provider's ID. Unsupported show-level watched flags are not treated as completed episodes.

Imported data merges into `user.state['swiflytv.library.' + profileId]` and increments the account-state revision. The merge reads the latest state inside the transaction, keeps unrelated fields such as folders, preferences, history and acknowledged episode notices, retains newer watched timestamps, and respects items removed locally while the import was running. A signed-out, expired or changed session cannot commit a late result. Account state is refreshed after the import so existing library and profile rendering hydrate normally.

After a successful connection, actual structured `swifly:library-change` events with `source:'library'` and `action:'watchlist'|'watched'` are forwarded. Imported/hydrated state, likes, preferences, folders and progress updates do not trigger an export. Watchlist additions/removals and watched movie/episode additions/removals are sent to the matching Trakt sync/history endpoints. A whole-show manual watched flag is not sent as an invented set of watched episodes. Events are coalesced and batched in groups of 50; sent event IDs are retained on the server to avoid replaying recent successful watched changes. No initial whole-library push is performed.

Provider writes are spaced at least 1.05 seconds apart per account in this server process. A provider `429` is returned with `Retry-After` and a temporary connection cooldown; the active browser tab retains that batch and waits before retrying. Provider requests have an abortable timeout, an import has a 45-second page-loop budget, and requests waiting behind another account operation return a busy response after ten seconds. Ordinary network failures are shown rather than reported as successful sync. This is not an offline delivery service: pending browser changes do not survive closing the page, and provider-side changes must be imported explicitly. Ratings, collections, playback position, multiple play counts and automatic background pulls are outside this integration.

Disconnect always deletes this server's tokens and any pending OAuth attempt. It attempts Trakt revocation first. If the provider cannot confirm revocation, Settings explains that disconnection succeeded locally and directs the viewer to remove SwiflyTV in Trakt's connected apps.

## API

All routes require the verified SwiflyTV session. Mutations use same-origin JSON requests and reject cross-site writes. The optional `X-Swifly-Account` header catches stale account tabs.

| Route | Purpose |
| --- | --- |
| `GET /status` | Safe configured/linked/reconnect status and timestamps; no credentials. |
| `POST /link` | Begin linking; returns the authorization URL. |
| `GET /callback?code=...&state=...` | Validate and consume the attempt, exchange the code, redirect to Settings. |
| `POST /sync` with `{profileId}` | Explicit bounded import into the selected profile. |
| `POST /changes` with `{profileId, changes:[{eventId,action,item,removed}]}` | Forward actual library deltas. `item` uses `type`, TMDB `id`, and exact `season`/`episode` for watched TV. |
| `POST /unlink` | Delete the connection and report whether remote revocation was confirmed. |

## Verification and current API references

`node --test tests/trakt-api.test.cjs tests/trakt-ui.test.cjs` uses real local HTTP servers, the real account store and session cookies, and a local Trakt provider fixture. It covers account/session binding, PKCE, state expiry and replay, refresh rotation, paginated imports, local edits during an import, profile capacity, watched episode payloads, recent event replay, removals, revocation failures, throttling, timeouts, and logout isolation. Browser DOM checks cover preferences, unconfigured/signed-out views, explicit import and actual-change forwarding. This fixture verification does not claim a live Trakt account has been linked.

`tests/trakt-rendering.test.cjs` also checks the Settings layout and keyboard controls at 1440px and 390px in Chromium. It honors `SWIFLY_TEST_BROWSER_EXECUTABLE_PATH`; this workspace's headless-shell executable can be used when the full Chromium binary cannot create its singleton socket.

Official references checked on 25 October 2026:

- [Authentication and single-use refresh tokens](https://developer.trakt.tv/docs/authentication-oauth)
- [PKCE and the current authorization host](https://developer.trakt.tv/docs/pkce)
- [Pagination and effective page limits](https://developer.trakt.tv/docs/pagination)
- [Rate limits and Retry-After](https://developer.trakt.tv/docs/rate-limiting)
- [Trakt's watched-show progress issue and `extended=progress`](https://github.com/trakt/trakt-api/issues/835)
- [API reference](https://developer.trakt.tv/?section=reference)
