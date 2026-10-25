# Personal feed and episode alerts

The approved implementation adds ordinary TMDB recommendations, real upcoming
episode metadata, a separate new-episode bell, and an explicit Discover shuffle.
It extends the existing Express and browser modules without an AI model, a new
account store, background polling, or changes to Studio's section order.

The alternative was reusing the AI candidate planner, which would mix matching
semantics and labels with ordinary viewing-based recommendations. A client-only
TMDB integration would expose the catalog credential. A small metadata router
and a profile-scoped client use the existing systems instead.

Implementation plan (executed inline under the root task's authorization):

- [x] Add real-HTTP tests for bounded episode IDs, valid dates, recommendation
  seeds/exclusions, catalog filters, upstream deadlines, and cache eviction;
  observe failure before implementing `createFeed({tmdb}) => {router}`.
- [x] Implement the router in `lib/feed.js`, caching only public TMDB metadata.
- [x] Add DOM/browser tests for profile changes during requests, honest empty
  states, visible-panel read acknowledgement, hide preference, explicit shuffle,
  and responsive keyboard/touch targets; observe failure before client/markup.
- [x] Implement `ui/feed.js` exports `feedBell`, `feedDialogs`, `feedHome`,
  `feedDiscover`; implement `public/clean/feed.js` and `feed.css`.
- [x] Run the focused feed checks, document exact wiring and limits, and commit
  only the new feed-owned files. The root task owns whole-branch verification.

Review focus: account/profile swaps must reject stale responses; unavailable or
undated episodes must never become fictional alerts; closed or hidden panels
must not acknowledge unread items; empty recommendation pools must not become
random "personal" picks; a failed filter request must not launch playback.

## Wiring contract

Mount the router at `/api/feed`. Load `/assets/clean/library-state.js` before
`/assets/clean/feed.js` and include `/assets/clean/feed.css`. The root task owns
server, shell, navigation, and Studio configuration wiring.

The client reads only `SwiflyLibrary.read()`, `profileId()`, `contextId()`,
`active`, `preferences()`, `savePreferences(patch)`, `acknowledgeEpisodes(ids)`
and `ready`. It reacts to the window `swifly:library-change` event and document
profile/account/visibility events. It never reads another account's raw storage.

The root's existing sections use `data-st-home-section="upcoming"` plus
`data-feed-upcoming`, and `data-st-home-section="recommended"` plus
`data-feed-recommended`. The feed fills these sections in place. It does not
reorder them or change their Studio visibility markers.

Canonical episode read IDs are `tv:<showId>:<season>:<episode>`, including
specials season zero. Their tuple comes from TMDB, never a guessed next number.
Episode read IDs are acknowledged only after the open, visible notification
panel contains the corresponding rendered episode.

## API and behavior

| Route | Inputs and results |
| --- | --- |
| `GET /episodes` | `shows` is a comma-separated list of at most eight TMDB TV IDs. Returns normalized `shows` with real `nextEpisode`/`lastEpisode`, `upcoming` episodes announced for today or later, and `episodes` containing each show's latest aired episode if it aired within 30 days. |
| `GET /recommendations` | `seeds` is at most four `movie:id`/`tv:id` keys; `exclude` is at most 300 title keys. Returns at most 18 interleaved, deduplicated ordinary TMDB recommendations, normalized `seeds`, and a verified `because` title for each result. Seeds and exclusions never become results. |
| `GET /surprise` | `type=movie\|tv\|both`, `minRating=0..10`, `genre=all\|drama\|comedy\|animation\|adventure\|scifi`, optional `yearFrom`/`yearTo`, and optional `exclude`. Returns a single filtered catalog `result` or an honest no-match message. |

The client chooses recent viewing seeds before saved titles. Its explanation
says “Because you watched” only for viewing-history/watched seeds; a saved-only
seed says “Because you saved.” Missing ratings stay unknown and are not shown as
invented scores. Native links open the existing details or playback routes.

Surprise queries at most one page of 20 titles per selected medium, ordered by
the catalog's real vote average with at least 50 votes, then checks every result
against the selected filters before drawing from that pool. It is not a uniform
sample of the entire TMDB catalog and does not claim a playable stream has
already been found. No discovery or playback request occurs before submission.

Only public metadata is cached: at most 128 entries for five minutes, with
request coalescing, at most 32 distinct in-flight metadata calls, a six-second
upstream deadline and an abort signal passed to the existing TMDB helper. The
router rate limit is 90 requests per minute per client. The browser has a
12-second deadline and explicit Refresh feed actions after errors. It requests
recommendations only when the homepage recommendation section exists.

No interval runs in the background. Visibility and library changes trigger a
bounded refresh; unchanged inputs reuse the recent result. Profile/account
context changes cancel requests and clear old content before reading the new
library. Read acknowledgement checks the open dialog, document visibility, and
actual row intersection with the panel and its scroll viewport. Scrolling to
more items acknowledges those items without marking offscreen rows read.

Limits: alerts cover the latest aired episode per tracked series, not an
invented list of intervening episodes. Unannounced dates remain empty. Air dates
have no guessed air time and may vary by region. The hide preference and read
IDs are profile-scoped through SwiflyLibrary; social notifications are untouched.

The catalog requests follow the official [TV details](https://developer.themoviedb.org/reference/tv-series-details),
[movie discovery](https://developer.themoviedb.org/reference/discover-movie) and
[TV discovery](https://developer.themoviedb.org/reference/discover-tv) interfaces.

## Verification

```sh
node --test tests/feed.test.cjs tests/feed-browser.test.cjs
node --check lib/feed.js
node --check ui/feed.js
node --check public/clean/feed.js
```

The focused run passes 20 tests: eight real-HTTP router checks and twelve Chromium
checks through that router. Browser fixtures replace TMDB; ten use the adjacent
SwiflyLibrary contract and two load the real library client to check profile
persistence and the account verification gate. They exercise the production
markup, CSS, client and HTTP router. Tests cover 320px touch and 1920px layouts, native Enter/Escape dialog
behavior, stale accounts sharing a profile ID, visible-only read acknowledgement,
saved hide preferences, explicit filtered shuffle, retries, real client and
upstream deadlines, cache coalescing/eviction, and no hidden homepage requests.
An additional real-HTTP check verified the default 128-entry cache, the
32-distinct-request cap with duplicate coalescing, and the six-second abort
deadline (6004 ms observed).
There is no physical Xbox or live credentialed TMDB test in this focused run.
