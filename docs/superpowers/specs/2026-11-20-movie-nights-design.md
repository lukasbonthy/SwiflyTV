# SwiflyTV Movie Nights and UI correction

## Intent and constraints

Match the supplied ShuttleTV Home reference, improve the episode browser, and add a real featured community screening with voting and synchronized playback. Preserve SwiflyTV's existing dark catalog, typography, player, account system, parental protection, iPad optimizations and React rails. The user has opted out of repeated design/implementation approvals. Main and production must remain unchanged while this review version is built.

The screenshots show plain Home trend headings without the requested selectors, a duplicate Kids search entry and vertically cramped parent controls. Audiobooks must keep the actual AI Picks form family. Study must remain a useful scene-based workspace while its toolbars, timer and player gain coherent spacing. Avoid decorative landscapes, invented statistics and glass on episode lists.

## Approach

Extend the existing Node/Express, Socket.IO, React/Vite shell and native player. A separate public-screening service is preferable to electing a viewer as a watchroom host: voting, selection and playback timing must continue if any viewer leaves. A separate streaming platform would introduce a second account/player/deployment system and is unnecessary. These are implementation choices, not new requirements attributed to the user.

## Reference selectors

Home has independent Trending Movies and Trending Series selectors. Each is inline with its heading, title case, 24px/600/32px on desktop and 20px on phones, transparent, with a 2px accent underline offset by 4px and a small 16px chevron. The current live ShuttleTV reference uses a purple accent; user screenshot uses cyan, so inherit Swifly's accent with a cyan fallback. Menus use a dark surface, 14px radius, 4px padding, 14px option text and a 150ms fade/scale/slide. Include Today, This Week and This Month. Change only that row without reloading the hero. Preserve normal links, keyboard selection, focus restoration and reduced motion. Month is honestly described as popular releases this calendar month because TMDB has no monthly trending endpoint. Movie/TV choices are independent and the existing Popular Movies control remains supported.

## Episodes

A matte episode section has a strong header, compact season choice, episode count and progress summary. The default list is readable: 16:9 still, ordinal/name/runtime/date/short overview, an obvious play affordance and a quieter download action. Grid remains optional and preferences persist. Only the chosen season loads; bounded rendering and real metadata remain. Future episodes are unavailable, missing stills have a considered fallback, spoiler preferences and watched/progress controls work. Mobile targets are at least 44px. No blur/backdrop filter on the list or its cards.

## Movie Nights

Routes: `/movie-nights` and `/movie-night/:id`, both using the same focused screening page. Discoverable from Community/Watchrooms, the navigation overflow and a restrained Home feature link. Wide layout: main screening on the left and live conversation on the right; below it, the ballot and upcoming screenings. Phone: player, event summary, ballot, then collapsible chat. Real movie backdrop/posters supply the visual identity; one accent, clean type, quiet borders, limited animation.

Default schedule is Friday and Saturday at 20:00 America/New_York, with timezone and hour configurable. Show the user's local time with a timezone label. Voting closes five minutes before the scheduled start. Six released, non-adult films with verified ID, title, runtime and artwork form each stable ballot. Use real TMDB data and rotate candidates between events, avoiding recent winners. Never invent votes, chat or viewers. Highest vote total wins; ties use the persisted ballot order. With no votes the first curated candidate wins. Lock the selection transactionally, never replace an already locked winner.

One signed-in account gets one vote per event and can change it until the deadline. Guests can watch, see vote totals and read chat; account sign-in enables votes and sending chat. Retain votes, event schedule, winner, playback start and bounded chat using the existing persistent account store. A storage outage must show a useful unavailable state and must not silently create ephemeral ballots.

The server owns the broadcast clock. It resolves one shared movie source after selection, reusing the existing source resolver. Playback begins at the scheduled time if ready, or at one persisted common start when a delayed source becomes ready. Reconnect/reload/late join receives a complete current snapshot and seeks to the shared position; no viewer is promoted to host or allowed to pause/seek everyone. Personal pause/mute remains possible; Resume Live rejoins the clock. Use small playback-rate corrections for mild drift and a seek for larger drift. Never assume Socket.IO replay or audible autoplay: there is an explicit Join screening gesture and a visible play/unmute fallback if the browser blocks playback. Failure retains the winning film, provides bounded retry, and never lies about live playback. Resuming after a server restart uses the saved start rather than restarting the film.

The Socket.IO namespace is `/movie-nights`. Its admission uses the existing access gate and Kids socket guard. All HTTP routes remain behind existing gate/Kids protection, mutations enforce same-origin JSON, chat uses server-derived account identity, and no voter IDs/account secrets are serialized to clients. Guests do not gain administrative event controls.

## Service contract

`createMovieNights({store, tmdb, authenticate, io, authorizeSocket, resolveSource, now, schedule, autoStart})` returns `{router, snapshot(req, id), tick(), close()}`. `now` defaults to `Date.now`, `schedule` supports `{timeZone, hour, days}` with days `[5,6]`; `autoStart:false` supports deterministic tests. Source resolver receives a numeric movie ID and optional `{signal}` cancellation context and returns the existing native-player source payload.

`GET /api/movie-nights` and `GET /api/movie-nights/:id` return `{event, upcoming, serverTime, viewer, schedule}`. Event: `{id,title,startsAt,votingClosesAt,phase,candidates,winner,totalVotes,yourVote,playbackStartedAt,duration,sourceStatus,source,viewers,messages}`. Candidates use `{id,title,year,poster,backdrop,overview,runtime,votes}`. `phase` is `voting`, `countdown`, `live`, `ended` or `unavailable`; sourceStatus is `idle`, `loading`, `ready` or `error`. `viewer` is `{signedIn,name}`. `source` is only present when the selected film is ready. No source URL is persisted in the account state.

`POST /api/movie-nights/:id/vote` accepts `{movieId}`, returns the personalized snapshot; `POST /api/movie-nights/:id/retry` retries only a selected failed source with a cooldown. Namespace events: client `night:join({id},ack)`, `night:message({id,text,clientId},ack)`, `night:sync({id,sentAt},ack)`; server `night:update` sends public event snapshot, `night:message` sends a confirmed chat item, `night:presence` sends `{id,viewers}`. Join/sync acknowledgements include the full personalized snapshot with serverTime. Chat is bounded, rate limited, escaped by DOM rendering, and idempotent by clientId. Disconnect decrements presence. Namespace auth is rechecked on each mutating event to respect a parent lock or account logout.

## Verification

Meaningful unit/service checks cover vote replacement/duplicates, ties, deadline races, future/unreleased candidates, storage failure, source failure/retry, restart recovery, late joins, disconnect, account changes, hostile chat and Kids/access rejection. Browser checks use the real React routes at desktop, iPad, phone and 320px, with real poster files and controlled media. Capture and inspect Home selectors open/closed, episode list/grid/empty/error, Kids navigation, Study and Movie Nights voting/countdown/live/reconnect/source-error states. Check two simultaneous viewers against the actual shared media clock. Run hosted Chromium if local launch is unavailable. Passing geometry checks alone do not establish visual quality.
