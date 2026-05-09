# MovieVerse TMDB Full v2

This is a much fuller movie/TV website powered by TMDB.

## Render setup

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Environment variables:

```txt
TMDB_API_KEY=your_tmdb_api_key_here
SITE_NAME=MovieVerse
```

## Features

- Full premium homepage
- Trending movies / TV / all
- Movies page
- TV page
- Discover pages
- Genre pages
- Genres index
- Search movies, TV, and people
- Movie detail pages
- TV detail pages
- Person/actor detail pages
- Cast rails
- Crew facts
- Trailers and teasers
- Similar titles
- Recommendations
- Watch providers from TMDB region data
- Local browser watchlist
- Style Studio themes
- Reduced motion toggle
- API status route
- TMDB proxy route
- In-memory API caching
- Helmet security middleware
- Compression
- Rate limiting

## Important

This website does not host movies or provide pirated streams. It is for discovery, metadata, posters, trailers, and local watchlists only.

## v3 Cute Netflix Style Upgrade

Added:
- Cuter Netflix-like red/pink style
- Softer hero billboard
- Mood-pick tiles on homepage
- New cozy rails like Rom-com night, Family movie night, Animated comfort, and Comfort TV
- Brand icon changed to a Netflix-like N
- Stronger cinematic card glow and softer cute styling


## v5 Full Netflix Accuracy Pass

Changed the rest of the site to better match the Netflix-style homepage:
- Browse/search/watchlist pages now use a Netflix-like dark catalog layout.
- Movie/TV detail pages now use a full-screen Netflix-style billboard instead of a poster-first layout.
- Detail buttons now look like Play / More Info style controls.
- People pages were restyled to fit the Netflix visual language.
- Genre and filter chips now look flatter and closer to Netflix.
- Cards on catalog pages use landscape thumbnails like Netflix rows.
- Footer and utility controls were reduced so the site feels less futuristic and more like a streaming UI.


## v6 Screenshot-Accurate Category Pages

Made `/tv` and `/movies` match the provided Netflix screenshot much closer:
- Fixed top category header like “TV Shows”
- Added black bordered “Genres” dropdown
- Added full-screen category billboard hero
- Added huge title-art style heading
- Added red TOP 10 badge and ranking text
- Added Netflix-style Play and More Info buttons
- Added mute + maturity badge on the right
- Rows overlap the hero like Netflix
- Category rows use landscape thumbnails like the screenshot


## v7 Netflix Accuracy Everywhere

Brought the rest of the website closer to Netflix's web-app style:
- Full NETFLIX-style wordmark.
- Landscape thumbnails use backdrop art instead of poster crops.
- New & Popular page redesigned with Netflix-style rows.
- Search page redesigned to look like Netflix search.
- Genres page redesigned like a Browse by Languages/Genres hub.
- My List page renamed/styled closer to Netflix My List.
- Details pages now include Netflix-like tabs and More Like This grid.
- Watchlist localStorage rendering now uses backdrop art when available.
- People pages and person details received more Netflix-style treatment.


## v8 Almost 1:1 Streaming UI Pass

This version pushes the whole app much closer to a Netflix-style streaming UI:
- Configurable wordmark via `BRAND_WORDMARK` instead of hardcoding another company's brand.
- Fixed transparent-to-black topbar behavior.
- More accurate nav spacing, profile chip, Kids link, search icon, and wordmark placement.
- Hero billboard spacing and buttons adjusted to match the streaming layout.
- Rows now use 6-across landscape cards with minimal gaps.
- Cards use backdrop thumbnails and hide database-style metadata.
- Added hover expansion panels with circular controls and match/maturity metadata.
- Added Top 10 rows with large outlined ranking numbers.
- Browse pages use the same row system.
- New & Popular page uses row system and Top 10 row.
- Added `/profiles` profile picker page.
- Detail pages, search, genres, and My List keep the streaming style.


## v9 Streaming Accuracy Deep Pass

This pass focuses on the parts that still felt too much like a movie database:
- Movie and TV detail pages are now streaming-style modal pages.
- Details include Play, My List, like controls, metadata band, cast rail, trailers, episodes for TV, and More Like This.
- Browse by Languages / Genres page now has selector controls and genre tiles.
- Search page is rebuilt as a dedicated streaming-app search screen.
- My List page is rebuilt with clearer controls and a more accurate layout.
- Profile picker got closer to a streaming profile selection screen.
- Detail grids and similar-title grids use landscape streaming thumbnails.


## v10 Near 1:1 Streaming Layout

This version tightens the UI much closer to a Netflix-like web layout while keeping a configurable/non-infringing brand:
- More exact topbar height, spacing, link weight, right icons, profile chip, and scroll-to-black behavior.
- More accurate full-screen billboard alignment, gradient, title placement, buttons, and maturity badge.
- Rows use tighter 6-across 16:9 cards with minimal gap and Netflix-like hover expansion.
- Top 10 rows use huge outlined rank numbers.
- Browse pages, home rows, New & Popular, Search, My List, Kids, and details share the same streaming rhythm.
- Added `/kids` route for a kids-style browsing section.
- Added `/browse-by-languages` alias for `/genres`.
- Brand remains configurable with `BRAND_WORDMARK` and `BRAND_SUBMARK`.


## v11 Dropcart x Streaming Hybrid

This version intentionally blends:
- Netflix-style streaming structure: topbar, billboard hero, My List, rows, cards, profiles.
- Dropcart-style visual personality: dark luxury, blue/purple glow, glassmorphism, rounded premium cards, soft neon accents.

Brand defaults:
- SITE_NAME=DropStream
- BRAND_WORDMARK=DROPSTREAM
- BRAND_SUBMARK=DROPSTREAM ORIGINAL


## v12 Visible Layout Fix Pass

Fixed the screenshot issues:
- Billboard title no longer clips off the left side.
- Movies/Genres header no longer collides with the giant title.
- Hero title sizing is more controlled for long movie names.
- Description column is narrower and easier to read.
- Maturity badge is placed on the right side again.
- Rows start lower and cleaner.
- Navbar logo/spacing was tightened.
- Dropcart glow was softened so it supports the layout instead of fighting it.


## v13 Clean Hybrid Rebuild

This pass removes the overloaded look and fixes the visual system:
- Calmer Dropcart-inspired dark luxury styling.
- Less glow and no chaotic background grid.
- Stable hero layout using absolute positioning instead of stacked conflicting layout rules.
- Cleaner navbar spacing and brand mark.
- Hero title/description/buttons are controlled and readable.
- Right-side maturity badge is stable on desktop and hidden on mobile.
- Rows are cleaner, cards are consistent, and hover is subtle instead of huge/glitchy.
- Mobile layout is simplified.


## v14 X100 Polish Pass

This is a major visual cleanup pass:
- Removed competing old effects with one final controlled visual system.
- Better fixed glass topbar with scroll state.
- Cleaner hero/browse layout with stable title, readable description, and stronger spacing.
- Better row system with subtle hover, manual row buttons, and progress indicator.
- Less ugly glow, more premium dark-luxury DropStream feel.
- Better detail/search/genre/profile/My List consistency.
- Improved mobile behavior.
- Added `/my-list` alias.


## v15 Ultra Overhaul

This is a broad rebuild of the visual system and core pages:
- New unified DropStream design system instead of stacked older patches.
- Rebuilt homepage with a cleaner premium hero and richer rows.
- Rebuilt Movies/TV browse pages with cleaner spotlight + genre menu + rows.
- Rebuilt New & Popular, Search, Browse by Languages/Genres, My List, and Detail pages.
- New card system with consistent thumbnails, subtle hover, overlay controls, and match metadata.
- Improved row controls and progress indicator.
- Improved detail page with better hero, metadata, cast, trailers, episodes, more-like-this, and about sections.
- Stronger responsive/mobile layout.
- Added/kept `/my-list`, `/kids`, and `/browse-by-languages`.


## v16 Animation Pack

Added polished animations:
- Hero background slow cinematic motion.
- Hero text fade-up entrance.
- Subtle glowing drift layer.
- Shimmering DropStream wordmark.
- Button pulse + press microinteractions.
- Scroll reveal rows with staggered timing.
- Card hover sheen.
- Row progress glow.
- Top 10 card motion.
- Trailer/cast/episode hover animations.
- Reduced-motion support.


## v17 Every Cranny Polish

Polished the top-right navigation and small UI details everywhere:
- Rebuilt top-right nav with expandable search, Kids chip, notification chip, and profile dropdown.
- Improved mobile bottom nav and mobile search.
- Added outside-click/Escape close behavior for profile menu.
- Improved hover/focus states, selection color, scrollbars, pagination, footer, empty states, genre tiles, profile cards, and buttons.
- Added subtle pointer tilt for cards on desktop.
- Tightened row headings, card overlays, detail panels, search controls, and small spacing issues.


## v18 Functional Polish

This pass improves actual behavior, not just visuals:
- Kids page now uses safer TMDB discovery filters:
  - `include_adult=false`
  - US movie certification PG-and-under
  - family/kids/animation genres
  - excludes horror/thriller/crime/war style genres
  - extra keyword/text filtering for adult themes
- Added a real `/liked` page.
- Heart buttons now save/remove titles from Liked instead of being fake decoration.
- Plus buttons stay dedicated to My List.
- My List and Liked have separate localStorage collections.
- Profile dropdown includes Liked.
- Kids profile routes directly to Kids Safe Mode.
- Saved/Liked buttons sync their visual state across the whole site.


## v19 Accounts, Profiles, Continue Watching

Added major user-facing features:
- `/login` local login page.
- `/signup` local signup page.
- `/account` local account dashboard.
- Better `/profiles` page with custom profiles.
- Active profile saved locally.
- `/continue-watching` page.
- Home page dynamic Continue Watching row.
- Play buttons save titles to Continue Watching with progress bars.
- Profile dropdown shows account/profile info and logout.
- Account page can clear local DropStream data.
- More UI effects for auth/profile/continue-watching states.

Note: authentication is local-browser demo storage using localStorage, not a secure production auth system.


## v19.1 Hotfix

Fixed the runtime crash:
- Removed accidental `${id}` / `${type}` server-template references from the global page shell saved-grid script.
- Continue Watching and Play tracking remain enabled on real movie/detail cards.


## v19.2 Auth Hotfix

Fixed `/login` and `/signup`:
- `authPage` now receives `res`.
- Login/signup routes now call `authPage(res, "login")` and `authPage(res, "signup")`.


## v20 Auth Required

Login/signup is now required:
- All app pages redirect to `/login` if there is no local session.
- `/login` and `/signup` remain open.
- Login/signup redirect back to the original page when possible.
- Logged-in users who visit `/login` or `/signup` are sent to `/profiles`.
- Login/signup pages hide the normal streaming nav for a cleaner required-auth feel.
- Logout now returns to `/login`.

Note: this is still local-browser demo auth using localStorage, not secure production authentication.


## v21 Watchrooms

Added shared trailer watchrooms:
- `/watchrooms` lobby.
- `/watchrooms/:roomId` room page.
- Create a room with a YouTube trailer URL.
- Join rooms by code.
- Copy invite link.
- Synced play, pause, seek back/forward, and manual sync.
- Shared trailer changes through Socket.IO.
- Room viewer counts.
- Room chat.
- `/api/watchrooms` active room list.
- In-memory room cleanup.


## v22 Room Movie Clock

Added the user's watchroom idea:
- Room clock starts when the room is created.
- Shows a live "Put your timeframe at 0:00" message.
- Copy timeframe button.
- Send timeframe to chat button.
- Generic embed support in addition to YouTube trailers.
- YouTube still supports synced play/pause/seek.
- Non-YouTube embeds use the room clock for manual syncing.
- Added a floating chatbar.
- Room objects now store createdAt, embedUrl, and mediaKind.


## v23 Profiles / Account / Watchrooms Cleanup

Requested cleanup:
- Removed the Games nav section/link.
- Fixed Create Room so it works even without a trailer/embed link.
- Create Room can now start a blank room, then load media inside the room.
- Rebuilt Watchrooms lobby with a stronger hero, quick create form, better active room cards, and cleaner layout.
- Improved Watchroom room layout spacing.
- Rebuilt Profiles page with edit dialog, custom profile icons, Kids Safe toggle, start-page selector, reset profiles, and active profile styling.
- Rebuilt Account page with account center layout, profile/library stats, display-name editor, separate clear buttons, and better local-data controls.


## v24 Watchroom UI polish
- Simplified watchroom layout
- Removed floating chatbar
- Reduced button clutter
- Added cleaner room toolbar
- Added Change Media toggle
- More breathing room and consistent colors
- Better player/chat panel styling
- Compact sync controls


## v25 Welcome Discovery

Added a public non-member welcome/discovery page:
- `/welcome` is public.
- Non-logged-in visitors are redirected to `/welcome` instead of straight to `/login`.
- `/welcome` previews trending/popular movies and shows using TMDB.
- Sign up/login CTAs preserve the page the visitor originally tried to open.
- Logged-in users visiting `/welcome`, `/login`, or `/signup` are redirected to `/profiles`.
- Welcome page hides the app navbar and uses its own premium landing nav.


## v26 YouTube Embed Fix

Fixed watchroom YouTube Error 153 issues as much as the app can:
- Adds YouTube `origin` and `widget_referrer` playerVars.
- Adds `enablejsapi=1`.
- Removes the stricter iframe referrer policy from the generic embed.
- Converts pasted YouTube watch URLs into safer embed behavior.
- Adds a clear fallback panel with a "Watch on YouTube" button when a video refuses embedding.
- Keeps the room clock so users can still manually sync if YouTube blocks the embed.

Some videos still cannot be embedded because the video owner or YouTube blocks embedding.


## v27 Trailer / Movie Buttons

Added the requested two-button behavior:
- Detail pages now show two clear buttons: `Movie` and `Trailer`.
- `Trailer` opens `/watch/:type/:id?mode=trailer`.
- `Movie` opens `/watch/:type/:id?mode=movie`.
- Movie mode currently uses the trailer as a placeholder until a legal movie access API/source is added.
- Added a dedicated watch page with mode switch, video player, placeholder badge, My List/Liked controls, and watchroom CTA.


## v28 Fullscreen Movie Watch

Movie mode is now fullscreen-style:
- `/watch/movie/:id?mode=movie` and `/watch/tv/:id?mode=movie` get an immersive fullscreen player layout.
- App navbar/footer/mobile nav are hidden in Movie mode.
- Large centered 16:9 player.
- Floating back/mode controls.
- Floating bottom action dock.
- Faded side info panel.
- Added a Fullscreen button using the browser Fullscreen API.
- Trailer mode keeps the normal watch page layout.


## v29 Licensed Movie Provider Adapter

The Movie button now supports a licensed provider adapter:
- `/api/movie-source/:type/:id` calls a configured provider only when enabled.
- Provider response shape supports `{ status: "ok", streams: { AUTO: { type, url }, ORG: { type, url } } }`.
- Supported stream types: `hls` and `mp4`.
- HLS playback uses hls.js when the browser needs it.
- If no legal provider is configured, Movie mode falls back to the trailer placeholder.
- The specific unlicensed endpoint is not hard-coded. Only configure providers you have legal rights to use.

Environment variables:
```env
LICENSED_MOVIE_PROVIDER_ENABLED=false
LICENSED_MOVIE_PROVIDER_API_URL=
LICENSED_MOVIE_PROVIDER_API_KEY=
```


## v30 Movie Button Placeholder Embed

Updated the Movie button provider so it works better with the trailer-stream response shape you showed:
- Supports response shape:
  ```json
  {
    "status": "ok",
    "streams": {
      "AUTO": { "type": "hls", "url": "..." },
      "ORG": { "type": "mp4", "url": "..." }
    }
  }
  ```
- Movie mode calls `/api/movie-source/:type/:id`.
- Server builds provider query from TMDB:
  - `name`
  - `year`
  - `id`
  - `imdb`
- Supports extra query params like `turnstile=12`.
- Supports HLS and MP4.
- Uses hls.js for HLS when needed.
- Falls back to the normal trailer if provider is disabled/missing/unavailable.

Env setup:
```env
MOVIE_PLACEHOLDER_PROVIDER_ENABLED=true
MOVIE_PLACEHOLDER_PROVIDER_API_URL=https://your-temporary-trailer-provider.example/finger
MOVIE_PLACEHOLDER_EXTRA_QUERY=turnstile=12
```

The provider URL is configurable so you can use the temporary trailer-stream source now and swap it later.


## v31 Prefer MP4 for Movie Button

Changed Movie button provider stream selection:
- Prefers `streams.ORG` when it is MP4.
- Prefers any MP4 stream over HLS by default.
- Falls back to `ORG`, then `AUTO`, then any available stream if MP4 is missing.
- Added env controls:
  ```env
  MOVIE_PLACEHOLDER_PREFER_MP4=true
  MOVIE_PLACEHOLDER_PREFERRED_QUALITY=ORG
  ```


## v32 Better Video Player

Improved the Movie button video player:
- Better native MP4 mounting with `<source type="video/mp4">`.
- Uses `preload="auto"` instead of only metadata.
- Adds loading/buffering/stalled states.
- Adds Retry, Try alternate, and Open source buttons.
- Returns alternate streams from the provider response so the browser can fall back from MP4 to HLS or another available stream.
- Improved HLS.js config/recovery for HLS fallback.
- Better fullscreen movie player error/loading UI.


## v33 Direct MP4 Player

Changed MP4 playback to match the working pattern:
- MP4 now uses `video.src = source.url` directly instead of a nested `<source>` tag.
- Uses `autoplay`, `playsinline`, `webkit-playsinline`, and `preload="metadata"`.
- Video fills the player using absolute inset sizing.
- Keeps controls available.
- HLS fallback still works.


## v34 Native Video Fallback

Improved the MP4/HLS failure behavior:
- MP4 video tag now uses the closest class/attribute pattern to the working snippet.
- If the video tag gets decode/load errors, the player automatically tries a native iframe/browser media fallback.
- If one stream fails, it tries an alternate stream first when available.
- If no alternate exists, it mounts the source in an iframe-style native browser player.
- Adds Retry video tag, Try alternate, and Open source controls on fallback.
- Error text now explains that expired tokens or HTML/error responses can cause decode failures.


## v35 MP4 Only Movie Mode

Changed Movie mode so it does NOT use HLS anymore:
- Provider stream selection now only accepts `type: "mp4"`.
- HLS streams are ignored.
- `streams.ORG` MP4 is still preferred.
- Alternate fallback only tries other MP4 streams.
- If provider only returns HLS, the app falls back to the normal trailer and says MP4 is required.
- HLS loader code may still exist in the file for older trailer/fallback compatibility, but Movie mode will not select or play HLS streams.

Env note:
```env
MOVIE_PLACEHOLDER_MP4_ONLY=true
MOVIE_PLACEHOLDER_PREFERRED_QUALITY=ORG
```


## v36 Smart HLS Fallback

Changed Movie mode to behave more like a dedicated streaming player:
- Tries MP4 / `ORG` first.
- If MP4 fails, the player now tries the HLS / `AUTO` stream.
- If provider only returns HLS, it uses HLS.
- HLS uses hls.js when the browser needs it.
- Alternate fallback now switches between MP4 and HLS instead of only MP4.
- If neither MP4 nor HLS exists, it falls back to the trailer placeholder.

Env:
```env
MOVIE_PLACEHOLDER_ALLOW_HLS_FALLBACK=true
MOVIE_PLACEHOLDER_PREFERRED_QUALITY=ORG
```
