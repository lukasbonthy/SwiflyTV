# Cinematic entry, TV parties, resume, and navigation

The update improves the intro and completes three requested viewing flows. Existing movie rooms, browser navigation, liquid-glass surfaces, and solo playback remain compatible.

## Interfaces and ownership

- Intro: `ui/intro.js` and `public/clean/intro.{css,js}` render a metallic SVG S, finite lighting, and a curtain reveal. Version 2 plays once per session, including sessions that saw version 1. Keep skip controls, reduced motion, auth-redirect handling, inert restoration, and the hard timeout.
- Parties: retain `syncedMovie` and `watchroom:movie-select`, extending identity with `type`, `season`, and `episode`. Missing type means movie. Include identity and request ID in transport messages. Hosts change episodes in place; guests and late joiners follow the room. Generalize search, room redirects, TV invites, picker metadata, retries, and details entry points.
- Resume: retain the existing history store with profile ownership. The shared Continue API normalizes, reads, writes, removes, and builds exact resume links. Only `resume=1` restores a matching movie or episode. Save meaningful solo media progress and flush before teardown; never replace a watch-party clock with local history. Exclude completed/invalid entries, and avoid assigning ambiguous legacy progress to multiple profiles.
- Navigation: `ui/navigation.js` installs parser-time `pageswap`/`pagereveal` guards; `public/clean/navigation.css` owns a 320ms native opacity dissolve. Remove conflicting old transition rules. Exclude playback/party routes and honor intro/reduced-motion state. Do not intercept clicks, change history, or manage scroll restoration.

## Integration

Independent changes are implemented and tested in isolated worktrees. Root integrates the commits, resolves shared `server.js`, player, and details changes, and updates all changed asset versions and exact-reference tests once. Browser test files must appear in CI's post-Chromium-install test list.

## Verification

1. Intro: first entry, previous-version session, auth redirects, keyboard/wheel/touch skip, timeout, reduced motion, focus/inert cleanup; visually inspect desktop and mobile.
2. Parties: movie compatibility; TV search and season/episode choice; host-only changes; exact tuple resolution, invite/retry/late-join parity; stale source and transport isolation; no disconnect on episode change.
3. Resume: movie and TV metadata-ready restoration, exact episode identity, fresh Play, profile isolation, completion, persistence on pause/pagehide, source retry protection, and party-clock ownership.
4. Navigation: actual cross-document animation, back/forward and restored scroll, intro interlock, reduced motion, excluded routes, unchanged live glass rendering and link semantics.
5. Review the integrated diff, run syntax checks and the complete test suite with browser tests enabled, then publish the exact tested tree. Verify production asset bytes and visible behavior after deployment.
