# Profile library

`public/clean/library-state.js` exposes `window.SwiflyLibrary`. Load it after the
account module and before `continue.js`, `library-page.js`, and feed consumers.
`ready` resolves after the initial account check. Until the account is verified,
or while it is suspended, `active` is false and `read()` returns empty state.
`contextId()` changes on profile and account lifecycle transitions so consumers
can discard late responses.

State uses `swiflytv.library.<profileId>`, which the existing account cache syncs:

```js
{
  version: 1,
  watchlist: [], liked: [], watched: [], history: [], folders: [], episodeRead: [],
  preferences: {
    spoilerMode: false, hideWatched: false, hideEpisodeBell: false,
    autoSkipIntro: false, rememberLastServer: true,
    episodeView: 'grid', episodeSort: 'oldest'
  }
}
```

Title identity is `movie:<id>` or `tv:<id>`. Watched episodes use the exact key
`tv:<id>:<season>:<episode>` and an ISO `watchedAt`; finishing one episode does
not mark the series complete. Playback history remains separate from durable
watched state. Old partial progress is available in History without inferring
completion.

`movieverse.watchlist` and `movieverse.liked` remain mirrors for existing title
buttons. Legacy arrays are adopted once into an unmigrated library. Existing
native profile records prevent a mirrored list from being adopted into a new
profile. The `swiflytv.library.__compat__` record tracks this migration.

## Consumer API

- `read()`, `preferences()`, `profileId()`, `ownerId()`, `contextId()`, and
  `storageKey()` return the current validated state or identity.
- `list(tab, {type, folder, search, sort})` supports Saved (`watchlist`), Favorites
  (`liked`), Continue (`continue`), History (`history`), and Completed (`completed`).
- `setWatchlist(item, present)`, `setLiked(item, present)`, `remember(item)`,
  `markWatched(item)`, `removeWatched(itemOrKey)`, and `isWatched(item)` update or
  query actual title and episode records. Mutations return false on a failed
  storage write or inactive account state.
- `createFolder(name)`, `renameFolder(id, name)`, `deleteFolder(id)`, and
  `setFolderMember(id, itemOrTitleKey, present)` maintain up to 50 folders with
  unique names, title membership, and creation/update timestamps. Invalid names
  throw a user-facing error; deleting a folder preserves its titles.
- `savePreferences(patch)`, `acknowledgeEpisodes(keys)`, and
  `episodeIsRead(key)` support settings and the independent episode bell.
- `importState(state, profileId, {source})` merges actual external watchlists and
  watched history, preserving folders, preferences, and newer local watched
  dates. `resumeHref(item)` creates a validated playback URL.

Mutations publish `swifly:library-change` on `window` with
`{source, action, profileId, item?, removed?}`. Existing unstructured legacy
library events are imported without recursive publication. Imported external
state retains its source so a sync consumer can avoid echoing it back.

## Visible behavior

The List page provides the five tabs, format/folder/search/sort controls, folder
management, watched actions, and exact progress resume. Spoiler mode hides plots,
episode titles and stills from visual and accessible output, including home hero
and TV spotlight plots. It replaces episode play labels with season/episode
numbers and restores original labels when disabled. Watched preference dims
completed artwork and adds badges. Episode row/grid and oldest/newest preferences
apply to the real player episode DOM and reading order.

`continue.js` records actual player completion in durable watched history. For a
completed episode it requests `/api/library/next/tv/:id?s=:season&e=:episode` and
adds only the server's real next aired episode. Invalid/future responses, newer
playback, removal, profile changes, and account changes cannot overwrite current
progress. Continue cards show last-played age and dim after 14 days.

## Focused verification

```sh
node --test tests/library-state.test.cjs tests/library-page.test.cjs tests/library-continue.test.cjs tests/resume-playback.test.cjs
SWIFLY_TEST_BROWSER_EXECUTABLE_PATH=/path/to/headless_shell node --test tests/library-browser.test.cjs
```

The browser checks cover 320px, 390px, 1440px, and 2560px viewports with folder,
filter, completion, and profile-isolation interactions. They use a local fixture
and do not claim live account or external catalog availability.
