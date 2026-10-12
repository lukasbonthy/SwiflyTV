# Studio motion and Party Hub — v158

Studio opens with a short, gentle fade and lift. Sections reveal as you switch tabs, selected controls respond smoothly, and appearance changes receive a brief live-preview fade. Rapid changes cancel unfinished feedback. Save, Cancel, Escape and focus restoration remain immediate. Device and app reduced-motion settings stop both CSS motion and preview feedback, including while Studio is open. Supporting browsers also show a short closing fade; other browsers close immediately.

Party Hub now opens on a spacious movie-night lobby at `/social`. Create and Join are clear labeled forms, with open-party cards below them. Creation stays on the page. Joining accepts a room code or a same-site invite link and loads the actual room details. Connection, permissions, empty lists and service errors have distinct states.

Inside a party, the player, invite code and playback controls share one focused area. Room chat stays alongside the player on large screens and moves below it on smaller screens. People and host labels reflect connected room members. Host media controls expand when needed, and a title search replaces the old numeric movie-ID field. YouTube/video-page links retain their embedded playback; native movie playback uses the existing player and synchronization service.

Leaving stops the current media, releases the server subscription, updates presence and transfers hosting to a remaining viewer. Moving to another party releases the previous room. Late join events, movie-search results and player callbacks cannot alter the next room or film. Chat messages use the current room, and displayed history avoids duplicate echoes. Device checks are explicitly local microphone/camera previews in a native dialog. Escape and controller Back close the preview, stop its tracks and restore focus.

## Update

Keep your `.env`. Replace the project files, then run:

```powershell
npm install
npm start
```

For the existing Render service, deploy the latest `main` commit and refresh with Ctrl+F5. Open Party Hub from the header or go to `/social?tab=watchrooms`. Runtime dependencies, Docker startup, catalog details and the main watch-page player are included.

## Verification

```powershell
npm run check
npm run test:ui
```

The 81 behavior checks include all prior details/navigation/Studio coverage, eight Studio motion regressions, Party Hub UI flows, stale player callbacks, device-preview/controller dismissal, real HTTP metadata/create routes and two-client WebSocket room lifecycle checks. JavaScript and CSS parsing, generated pages, served assets and unchanged provider/main-player comparisons also run. The `ws` development dependency supports the real socket tests.

Visual checks of the deployed site still need its live URL. DOM and stylesheet checks do not establish pixel accuracy, and third-party playback availability was not tested. Rooms use the app's existing in-memory service.

The implementation follows [MDN's dialog animation guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#animating_dialogs), [Socket.IO room lifecycle documentation](https://socket.io/docs/v4/rooms/), and [TMDB movie-search documentation](https://developer.themoviedb.org/reference/search-movie).
