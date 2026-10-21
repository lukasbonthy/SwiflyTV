# Connected cinema

SwiflyTV now has `/friends`, `/recommendations`, and `/audiobooks`. The existing `/social` watchparty hub remains available. The access-code gate still protects browsing; private social APIs additionally require a server account.

## Account storage

Set **one** durable storage option before opening account sign-up on Render:

- `DATABASE_URL`: a PostgreSQL connection string supplied through the host's secret environment settings. The app creates its `swifly_account_state` table on first use and serializes transactions with a row lock. An existing free external PostgreSQL service can be used.
- `SWIFLY_DATA_DIR`: an already mounted persistent directory, for a single server. The app writes a private `accounts.json` with atomic replacement. Do not point this at Render's temporary filesystem.

`SWIFLY_DB_SSL=true` enables verified TLS when the database provider requires it. Do not commit connection strings. No database, paid plan or disk is provisioned by this change. Without configured durable storage, Render serves browsing, discovery and playback normally, and clearly reports that account sync is being set up.

Local development uses `.swifly-data/` by default. Passwords use salted scrypt hashes; session cookies are HttpOnly, SameSite=Lax and secure over HTTPS. Sessions last 14 days and can be revoked by logging out. The old browser password list is removed. Existing local profiles and libraries can be imported after creating a real account; they are never used as proof of identity.

## Friends and shared homes

Find friends by the handle shown at the top of `/friends`. A request must be accepted before either person can message. Send text, title cards or a real watchparty invitation. The title share menu can also add a film to the shared home's list. Only conversation participants can read its messages. Blocking revokes sending and hides watching activity. Notifications and read state persist; delivery uses one idle EventSource connection.

Watching activity is off until enabled and is visible only to accepted friends while playback is active. A 90-second expiry handles lost connections. DMs retain the most recent 1,000 messages per conversation; the UI loads the last 200. Each account retains its last 200 notifications.

A shared home holds two accounts with separate logins, profiles, private conversations and progress. Invitation links expire after 24 hours, are single use, and are replaced when a new link is generated. The current link survives live notifications while this page stays open. Either member can leave. Shared picks can use each member's likes and list when that member enables taste sharing. Personal library caches are partitioned by account and synchronized with revision checks. Private conversations and saved-library views are cleared from browser history snapshots; returning pages revalidate the server identity before restoring library views.

## Free AI recommendations

Run `npm run prepare:ai` after installing dependencies in local development. Docker and CI run it automatically. It downloads the pinned Apache-2.0 MiniLM model revision and records an asset manifest. The quantized weights are about 23 MB; the browser downloads them only when a person asks for picks and caches them for later.

The bundled Transformers.js library, WebAssembly runtime and model files are served from SwiflyTV. No AI API key or paid inference endpoint is needed. A module worker uses one WebAssembly thread and normalized sentence embeddings to rank real TMDB descriptions against a mood and taste context. Closing the page or pressing Cancel terminates inference. If loading fails, catalog suggestions are explicitly labeled as unranked rather than claimed as AI picks.

Model: <https://huggingface.co/Xenova/all-MiniLM-L6-v2>

Runtime: <https://huggingface.co/docs/transformers.js>

## Audiobooks

LibriVox supplies title metadata, covers and chapter links; audio is streamed directly from its Internet Archive-hosted recordings. The player saves chapter, timestamp and speed per profile, supports 0.75–2× playback, and can stop after a chapter or a 15/30/60-minute sleep timer. Closing a recording stops playback and saves progress. Catalog queries are cached, and failed/empty results provide retry or search guidance.

Catalog: <https://librivox.org/api/info>

## Player helpers

IntroDB supplies verified recap/intro intervals using IMDb and episode identifiers. Missing, malformed or low-confidence intervals leave the skip action hidden; no generic intro duration is guessed. Skip calls the existing player seek API so host actions remain synchronized.

The next-episode card appears in the final 30 playback seconds and advances at the actual end. Pausing freezes its countdown. Keep watching dismisses it for the current episode. The persistent autoplay setting is also in playback settings. The same episode links handle season boundaries and watchparty host authorization.

Song identification listens to 12 seconds of the film audio after an explicit click. It uses an AudioWorklet where supported and never requests the microphone. The server accepts only bounded mono PCM WAV data, runs at most one ShazamIO process, and kills a request after 35 seconds. No movie source URL is accepted from the client. Cancel, seeking, source changes and navigation stop sampling. This uses ShazamIO's unofficial recognition service, so no-match and temporary-unavailable responses are presented honestly.

Docker includes FFmpeg and an isolated `shazamio==0.8.1` Python environment. For local use, install that package in a virtual environment and set `SWIFLY_SONG_PYTHON` to its Python executable.

Segments: <https://introdb.app/docs/api>

Recognition: <https://github.com/shazamio/ShazamIO>

## Atmosphere and performance

The original aurora artwork uses one transform-only drift layer while visible, pauses for Still, respects reduced motion, and stops offscreen or on hidden pages. TV consoles keep the still path. Navigation glass remains enabled. Social, discovery, search and player-helper controls own static matte surfaces so the global lens enhancer does not allocate optical graphs for every new button. No model, audio recognition or search request runs merely because someone scrolls.
