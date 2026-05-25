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
- SITE_NAME=SwiflyTV
- BRAND_WORDMARK=SWIFLYTV
- BRAND_SUBMARK=SWIFLYTV ORIGINAL


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
- Less ugly glow, more premium dark-luxury SwiflyTV feel.
- Better detail/search/genre/profile/My List consistency.
- Improved mobile behavior.
- Added `/my-list` alias.


## v15 Ultra Overhaul

This is a broad rebuild of the visual system and core pages:
- New unified SwiflyTV design system instead of stacked older patches.
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
- Shimmering SwiflyTV wordmark.
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
- Account page can clear local SwiflyTV data.
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


## v37 Embed Provider Watch Mode

Scrapped the MP4/HLS source player for Movie mode and replaced it with a simple iframe embed-provider setup:
- Movie mode builds an iframe URL with:
  - `tmdb`
  - `type=movie` or `type=tv`
  - `lan`
  - `s` and `e` for TV
- TV defaults to season 1 episode 1 unless the URL has `?s=2&e=5`.
- If the embed provider is disabled, Movie mode falls back to the trailer.
- Trailer mode is unchanged.

Environment:
```env
MOVIE_EMBED_PROVIDER_ENABLED=true
MOVIE_EMBED_PROVIDER_URL=https://your-authorized-embed-provider.example/embed
MOVIE_EMBED_LANGUAGE=eng
MOVIE_EMBED_DEFAULT_SEASON=1
MOVIE_EMBED_DEFAULT_EPISODE=1
```


## v38 Sandboxed Embed

Movie iframe embeds are now sandboxed to reduce popups/popunders:
- Adds iframe `sandbox`.
- Allows scripts/forms/presentation needed for many players.
- Does NOT allow popups.
- Does NOT allow popups to escape sandbox.
- Does NOT allow top navigation.
- Adds `referrerpolicy="no-referrer"`.
- Adds small UI note: "Popups blocked by sandbox."

Iframe sandbox used:
```html
sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
```

If an embed provider refuses to play inside sandbox, it means that provider requires popup/top-navigation permissions.


## v39 Embed Click Cleanup

Improved embed usability:
- Removed the right-side "Embed playback" panel from Movie mode.
- Removed the visible "Popups blocked by sandbox" overlay.
- Hid the movie title overlay in Movie/embed mode.
- Reduced action button clutter in Movie/embed mode.
- Action dock and top controls fade low until hovered so iframe controls are easier to click.
- Movie/embed mode now uses the full width instead of reserving space for the side panel.


## v41 Clickable Sandbox

Corrected the iframe sandbox:
- Keeps sandbox enabled.
- Does NOT allow popups.
- Does NOT allow popups to escape sandbox.
- Does NOT allow top navigation.
- Adds player-friendly permissions:
  - allow-pointer-lock
  - allow-orientation-lock
  - allow-modals
  - allow-forms
  - allow-presentation
- Removes overlays/actions from Movie embed mode so clicks go directly into the iframe.

Sandbox used:
```html
sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-modals"
```


## v42 Embed Fullscreen Button

Added a fullscreen option for Movie/embed mode:
- Adds a small `Fullscreen` button in the top controls.
- Uses the existing Fullscreen API.
- Fullscreens the `.dsWatchFrame` player container.
- Keeps the iframe itself clear so the embed remains clickable.
- Works with the clickable sandbox from v41.


## v43 Spotlight Movie

Set the SwiflyTV spotlight to TMDB movie ID `76479`:
- Home hero now uses `/movie/76479` as the SwiflyTV Spotlight.
- Added a "SwiflyTV Spotlight" rail near the top.
- Welcome page featured preview also uses the same spotlight when TMDB is available.
- Configurable with:
  ```env
  SWIFLYTV_SPOTLIGHT_TMDB_ID=76479
  ```


## v44 Real Iframe Fullscreen

Fixed fullscreen behavior:
- Fullscreen button now tries the actual movie iframe first.
- If iframe fullscreen is blocked, it falls back to the player frame.
- If that fails, it falls back to the player card/document.
- Added Safari/WebKit/Firefox/old Edge fullscreen fallbacks.
- Added fullscreen CSS for the iframe itself.
- Hides page overlays while true browser fullscreen is active.


## v45 TV Episode Button + Sandbox Check

Changed:
- TV detail pages now say `Episode` instead of `Movie`.
- TV watch page mode switch says `Episode` instead of `Movie`.
- Movie pages still say `Movie`.
- Sandbox is force-cleaned so it does not include:
  - `allow-top-navigation`
  - `allow-top-navigation-by-user-activation`
  - `allow-popups`
  - `allow-popups-to-escape-sandbox`

Sandbox kept:
```html
sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-modals"
```


## v46 Minimal Iframe Sandbox

Changed iframe sandbox to exactly:
```html
sandbox="allow-scripts allow-same-origin"
```

Removed from sandbox:
- allow-forms
- allow-presentation
- allow-pointer-lock
- allow-orientation-lock
- allow-modals
- allow-popups
- allow-popups-to-escape-sandbox
- allow-top-navigation
- allow-top-navigation-by-user-activation


## v47 Welcome Spotlight Fix

Fixed Render crash:
- `welcomeSpotlightMovie is not defined`
- Welcome page now fetches `/movie/${SWIFLYTV_SPOTLIGHT_TMDB_ID}` before using it.
- Welcome page setup error checking now includes the spotlight movie request.


## v48 Mobile + Episode UI

Updated the mobile experience:
- Cleaner mobile hero/detail sizing.
- Mobile buttons stack better.
- Mobile detail body has a cleaner rounded sheet look.
- Sticky horizontal detail tabs.
- Better mobile rails/card spacing.
- TV seasons are now visibly clickable.
- TV episodes are now visible as clickable chips.
- Added a Watch page season/episode picker for TV titles.
- TV watch URLs use `?mode=movie&s=SEASON&e=EPISODE`.


## v49 Better Welcome Page

Upgraded the public welcome page:
- Stronger landing hero and clearer CTA flow.
- Better non-member discovery explanation.
- Spotlight card and preview mosaic.
- "How it works" cards.
- Expanded feature cards.
- Mobile-focused device section.
- Better mobile spacing, navigation, buttons, and preview rails.


## v50 Watchroom Shared Browser

Added a host-controlled Watchroom Browser:
- Each watchroom now has a built-in shared browser iframe.
- The first person in the room becomes host.
- Only the host can change the shared browser URL.
- Guests see the same URL without needing screenshare.
- The shared URL syncs through Socket.IO.
- If the host leaves, the next viewer becomes host.
- Works best with embeddable pages and SwiflyTV watch pages.
- Some websites may block iframe embedding with X-Frame-Options/CSP.


## v51 Watchroom Remote Browser

Added an optional Playwright-powered Remote Browser:
- Server opens the page in Chromium.
- Screenshots stream to everyone in the watchroom over Socket.IO.
- First viewer/current host controls it.
- Guests can view but cannot control.
- Host can open a URL, click, type, press Enter, and go Back.
- Private/local/internal URLs are blocked for safety.
- This is different from iframe mode and can show pages that block normal iframes.

Setup:
```env
REMOTE_BROWSER_ENABLED=true
REMOTE_BROWSER_FPS=1
REMOTE_BROWSER_JPEG_QUALITY=58
```

Package added:
```json
"playwright": "^1.49.1"
```


## v52 No Chrome Download on Render

Fixed the Render build getting stuck on:
`Downloading Chrome for Testing ... 170.4 MiB`

Changes:
- Removed the `postinstall` browser download command.
- Replaced `playwright` with `playwright-core`.
- Remote Browser no longer downloads Chromium during deployment.
- Remote Browser now needs one of:
  - `REMOTE_BROWSER_WS_URL` for an external browser provider, recommended on Render.
  - `REMOTE_BROWSER_EXECUTABLE_PATH` if your server already has Chromium installed.

Recommended Render env:
```env
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
REMOTE_BROWSER_ENABLED=true
REMOTE_BROWSER_WS_URL=wss://your-browser-provider-url
REMOTE_BROWSER_FPS=1
REMOTE_BROWSER_JPEG_QUALITY=58
```

If you do not set `REMOTE_BROWSER_WS_URL`, the rest of the site still works, but Remote Browser mode will show a setup error instead of trying to download Chrome.


## v53 Docker Remote Browser for Render

This version makes Remote Browser actually usable on Render without needing `REMOTE_BROWSER_WS_URL`.

How:
- Adds a Dockerfile using the official Playwright image:
  `mcr.microsoft.com/playwright:v1.49.1-noble`
- That image already includes Chromium.
- Keeps `playwright-core`, so npm does not download Chrome.
- The server auto-finds Chromium from `/ms-playwright` or common Linux paths.
- Adds `/api/remote-browser/status` so you can check if Chromium was found.

Render setup:
1. Deploy using Docker runtime / Dockerfile.
2. Keep:
   ```env
   REMOTE_BROWSER_ENABLED=true
   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
   PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
   ```
3. Do not set `REMOTE_BROWSER_WS_URL` unless you want to use an external browser service.

Remote Browser will:
- open the page on the server
- stream screenshots to the watchroom
- let only the host click/type
- keep guests view-only
- block private/local/internal URLs for safety


## v54 Render/GitHub Watchroom Fix

Fixed watchroom bugs:
- Browser button now switches the player area into Browser view.
- Remote button switches into Remote Browser view.
- Player / Browser / Remote / Timeframe tabs now properly hide/show the right panels.
- Timeframe tab now works as a real view.
- Guests cannot change shared media.
- Added Remote Browser setup checker button.
- `/api/remote-browser/status` now returns `ready`, setup hints, and Docker guidance.

Render/GitHub support:
- Included actual `Dockerfile`.
- Included `render.yaml` configured for Docker runtime.
- Included `.dockerignore`.
- Included GitHub Actions check workflow.
- Added `RENDER_DOCKER_SETUP.md`.


## v55 Watchroom Live Share

Added the reliable solution for movies/websites that refuse iframe embedding:
- Host clicks `Live Share`.
- Host clicks `Start Live Share`.
- Browser asks which tab/window to share.
- Host picks the movie/website tab and enables tab audio.
- Guests watch the host's live stream inside the watchroom.
- Only the host controls the original website/movie.
- No iframe embedding needed.
- No Puppeteer, no Docker, no Chromium download, no REMOTE_BROWSER_WS_URL needed.

This uses the browser's built-in `getDisplayMedia` + WebRTC with Socket.IO signaling.
It works on Render's normal Node runtime and GitHub deploys.


## v56 Open Together Mode

Added one more fallback if the host cannot Live Share:
- Host pastes the movie/website link.
- Everyone opens the real link in their own tab.
- Watchroom shows a shared timeframe and countdown.
- Host can start a 10-second countdown.
- Everyone presses play when the countdown says ready.
- Works even when iframes are blocked and screen sharing is unavailable.
- No Docker, no Puppeteer, no remote Chrome, no embed required.

Watchroom options now:
1. Live Share — best if host can share tab/window.
2. Open Together — best if host cannot share.
3. Browser iframe — only for pages that allow embedding.
4. Remote Browser — optional advanced Docker/Chromium mode.


## v57 Reliable Watchroom

Replaced the old complicated watchroom UI with a stable version:
- Removed broken Browser/Remote/player tab complexity from the main room.
- Main reliable mode is Open Together.
- Live Share is still available as a second option.
- Clock and countdown are simple and visible.
- Chat is separated and easier to use.
- Host/viewer status is clear.
- Guests cannot edit host-only controls.
- Works on normal Render Node runtime.
- No iframe dependency.
- No Docker required for the reliable room.


## v58 Account Page Fix

Fixed Render crash:
- `ReferenceError: accountPage is not defined`
- Added a safe `/account` route page.
- `/account` now links to Profiles, Continue Watching, My List, Liked, and Watchrooms.
- Added account page CSS.


## v59 Missing Route Fallbacks

Fixed Render crash:
- `ReferenceError: continueWatchingPage is not defined`

Also added safe fallbacks for:
- `profilesPage`
- `apiStatus`

Added `/continue` alias for `/continue-watching`.


## v60 Auth Page Fix

Fixed Internal Server Error on:
- `/login`
- `/signup`

Cause:
- Routes called `authPage(res, "login")` and `authPage(res, "signup")`, but `authPage` was missing.

Added:
- Safe local-browser auth page.
- Login/signup switch.
- LocalStorage account/session handling.
- Redirect support from `?redirect=`.
- Auth page styling.


## v61 SwiflyTV Rebrand

Rebranded visible site/app wording from DropStream to SwiflyTV:
- Site name defaults to `SwiflyTV`.
- Wordmark/submark defaults to `SWIFLYTV`.
- Package name changed to `swiflytv`.
- LocalStorage keys now use `swiflytv.*`.
- Added automatic migration from old `dropstream.*` localStorage keys.
- Remote browser user-agent changed to SwiflyTV.
- Spotlight env is now `SWIFLYTV_SPOTLIGHT_TMDB_ID`.

Backwards compatibility:
- `SWIFLYTV_SPOTLIGHT_TMDB_ID` falls back to old `DROPSTREAM_SPOTLIGHT_TMDB_ID` if needed.


## v62 Couples Edition

Retargeted SwiflyTV for long-distance couples:
- Welcome page now sells date nights, couple profiles, Open Together, and Date Rooms.
- Home page includes a "Tonight together" couple planning board.
- Watchrooms are reframed as Date Rooms.
- Added `/couples` couple dashboard.
- Added love note and next-date planner using localStorage.
- Reworded auth, profiles, account, navigation, rails, and watchroom copy.
- Added soft couple-focused visuals and warmer romantic accents.
- Keeps movie/TV/TMDB functionality unchanged.


## v63 Couples+ Paid-Worthy Features

Added couple-only features designed to make SwiflyTV feel worth paying for:

Inside Date Rooms:
- Dual Ready Check: both people tap ready before countdown.
- Secret Mood Match: each person picks a vibe and SwiflyTV reveals the match.
- Timed Love Notes: schedule a sweet note to pop up during the movie clock.
- Live Floating Reactions: hearts/emojis float across the room in real time.
- Shared Date Jar: save future movie-night/date ideas during the call.

Couple Dashboard:
- Added Couples+ sales card.
- Added relationship ritual card explaining the repeatable date-night routine.

Backend:
- Added `watchroom:couple-event` Socket.IO event.
- Stores per-room couple state for ready, moods, timed notes, and date jar.
- Reactions are live-only and not stored.


## v64 Couples Premium Pack

Added the requested premium couple features:

1. Couple Taste Match
2. Date Night Generator
3. Missing You Mode
4. Couple Streaks
5. Private Couple Timeline
6. Pause for Us Button
16. Date Room Themes
19. Couple Badges
20. Sleepy Mode

Where they live:
- Inside Date Room → Couples+ tab.
- Couple Dashboard also explains the premium positioning.

Technical:
- Extended `couplePlus` room state.
- Added real-time `watchroom:couple-event` support for taste, modes, themes, pause/resume, complete-date, and timeline events.
- Added localStorage-backed streaks/badges/timeline so couples keep memories across rooms on the same device.


## v65 Placeholder Movie Provider

Implemented the Movie button temporary trailer/preview API adapter.

Provider:
```env
MOVIE_PLACEHOLDER_PROVIDER_ENABLED=true
MOVIE_PLACEHOLDER_PROVIDER_API_URL=https://backend.xprime.tv/finger
MOVIE_PLACEHOLDER_EXTRA_QUERY=turnstile=12
MOVIE_PLACEHOLDER_PREFERRED_QUALITY=ORG
MOVIE_PLACEHOLDER_ALLOW_HLS_FALLBACK=false
```

Behavior:
- Movie button calls the provider with:
  - `name`
  - `year`
  - `id`
  - `imdb`
  - extra query like `turnstile=12`
- Uses the `streams.ORG` MP4 URL first.
- Renders a native `<video controls autoplay playsinline preload="metadata">`.
- Does not use HLS by default.
- Falls back to iframe/trailer if the placeholder provider is disabled or fails.
- Added `/api/movie-placeholder/:type/:id` for testing provider output.

This is meant as a trailer/preview placeholder until a licensed movie provider is connected.


## v66 proxyVideo Embed

Movie button now tries a proxyVideo JSON provider first.

Example provider response:
```json
{
  "ok": true,
  "movieId": "1007757",
  "sourceUrl": "URL",
  "proxyVideo": "https://..."
}
```

Env:
```env
MOVIE_PROXY_VIDEO_PROVIDER_ENABLED=true
MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL=http://lschools.com/movie
```

Behavior:
- `/watch/movie/:id?mode=movie` calls `MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL/:id`
- If the JSON returns `ok: true` and `proxyVideo`, SwiflyTV embeds `proxyVideo` in an iframe.
- Test endpoint: `/api/proxy-video/movie/:id`
- Falls back to v65 placeholder MP4/embed/trailer if proxyVideo fails.


## v67 proxyVideo Priority + Wait Fix

Fixed the issue where the Movie button could still show the old source:
- `proxyVideo` provider is now enabled by default unless explicitly set to `false`.
- Movie page waits up to `MOVIE_PROXY_VIDEO_TIMEOUT_MS` before falling back.
- Default timeout is 60 seconds.
- Movie watch pages and proxy API responses are `Cache-Control: no-store`.
- `.env.example` now disables the old placeholder provider by default so proxyVideo is clearly primary.

Recommended Render env:
```env
MOVIE_PROXY_VIDEO_PROVIDER_ENABLED=true
MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL=http://lschools.com/movie
MOVIE_PROXY_VIDEO_TIMEOUT_MS=60000
MOVIE_PLACEHOLDER_PROVIDER_ENABLED=false
```

Test:
```txt
/api/proxy-video/movie/1007757
```

If that returns `status: "ok"` and a `proxyVideo`, the Movie button will embed that URL first.


## v68 proxyVideo Retry + Domain Fallback

Fixes:
- Slow proxyVideo responses are allowed up to 60 seconds.
- HTTP 500 now retries.
- Tries both likely domains:
  - `http://lschools.com/movie`
  - `http://lscools.com/movie`
  - HTTPS variants
- Stops silently embedding the old source. Legacy fallback is OFF unless you explicitly enable it.

Recommended Render env:
```env
MOVIE_PROXY_VIDEO_PROVIDER_ENABLED=true
MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL=http://lschools.com/movie
MOVIE_PROXY_VIDEO_FALLBACK_BASE_URLS=http://lscools.com/movie,https://lschools.com/movie,https://lscools.com/movie
MOVIE_PROXY_VIDEO_TIMEOUT_MS=60000
MOVIE_PROXY_VIDEO_RETRIES=2
MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=false
MOVIE_PLACEHOLDER_PROVIDER_ENABLED=false
```

Debug:
```txt
/api/proxy-video-debug/movie/1007757
```

If the provider still returns 500 for every domain, the issue is on the proxy API side or the TMDB id has no available source yet.


## v69 Client-side proxyVideo Wait

Fixes the slow proxyVideo problem properly:
- The watch page loads immediately.
- It shows a "Finding your movie source..." loading screen.
- Browser keeps calling `/api/proxy-video-wait/movie/:id`.
- When the API finally returns `proxyVideo`, the iframe src is set and the player appears.
- It keeps trying for up to `MOVIE_PROXY_VIDEO_CLIENT_MAX_WAIT_MS`.
- Default max wait: 3 minutes.
- The old provider/trailer fallback stays off unless explicitly enabled.

Recommended Render env:
```env
MOVIE_PROXY_VIDEO_PROVIDER_ENABLED=true
MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL=http://lschools.com/movie
MOVIE_PROXY_VIDEO_TIMEOUT_MS=60000
MOVIE_PROXY_VIDEO_RETRIES=2
MOVIE_PROXY_VIDEO_CLIENT_WAIT=true
MOVIE_PROXY_VIDEO_CLIENT_MAX_WAIT_MS=180000
MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=false
MOVIE_PLACEHOLDER_PROVIDER_ENABLED=false
```


## v70 Date Room Movie Sync

Added host-controlled synced movie playback inside Date Rooms.

What changed:
- New `Room Movie` tab inside each Date Room.
- Host can paste a TMDB movie ID or `/watch/movie/:id` link.
- Server waits for `proxyVideo` using the existing provider.
- When proxyVideo returns, SwiflyTV broadcasts it to everyone in the room.
- Everyone gets a 7-second sync countdown.
- The iframe loads at the same time for all connected viewers.
- Host can restart the sync countdown.
- New Socket.IO events:
  - `watchroom:movie-select`
  - `watchroom:movie-sync`
  - `watchroom:movie-sync-start`

Important:
- Browser autoplay rules can still require users to press play, but everyone gets the same embed and same countdown.


## v71 Room Movie Sync Engine

Added a real Date Room movie sync timer.

What it does:
- Host has Play, Pause, -10s, +10s, Restart Countdown, and Sync controls.
- Server stores the room movie timer state:
  - `playing`
  - `offset`
  - `startedAt`
  - `updatedAt`
- Everyone receives `watchroom:movie-sync-state` in real time.
- Clients compare against the room timer.
- If the player is a direct video element, SwiflyTV auto-corrects anyone more than 5 seconds ahead/behind.
- If the provider is a cross-site iframe, the browser will not allow JavaScript to read or force its internal video time, so SwiflyTV shows the room target time and sync messages instead.

Important browser limitation:
- Cross-origin iframe players cannot be directly controlled unless that provider exposes a postMessage/player API.
- Direct video URLs can be controlled with `video.currentTime`, so those get real auto-sync.


## v72 Date Room Button Fix

Fixed Date Rooms feeling dead when buttons do nothing.

What changed:
- Socket.IO initialization is now safe.
- If the main Date Room script fails before binding buttons, a second recovery controller loads.
- Tabs are bound independently so Room Movie / Live Share / Couples+ / Clock buttons actually switch panels.
- Host-only controls now re-enable correctly when the user is host.
- Room Movie selection works through Socket.IO if available.
- If Socket.IO fails, Room Movie can still poll `/api/proxy-video-wait/movie/:id` locally and embed for the current user.
- Added safer no-crash button listeners.


## v73 Date Room Polling Fallback

Fixes the Date Room getting stuck on `Status: Joining...`.

What changed:
- Added REST fallback APIs for Date Rooms.
- If Socket.IO does not join after 3.5 seconds, the browser switches to polling fallback.
- First polling user becomes host.
- Buttons still work:
  - select room movie
  - wait for proxyVideo
  - sync countdown
  - play/pause/seek timer controls
- Room state updates through polling every 1.5 seconds.
- This means Date Rooms can still work even when Socket.IO/WebSockets are failing on Render, proxy, browser, or network.

New APIs:
- `POST /api/date-room/:roomId/join`
- `GET /api/date-room/:roomId/state`
- `POST /api/date-room/:roomId/movie-select`
- `POST /api/date-room/:roomId/movie-control`


## v74 Date Room Regex Crash Fix

Fixed browser crashes:
- `Uncaught SyntaxError: Invalid regular expression: /(?:movie/: Unterminated group`
- `Uncaught ReferenceError: syncWatchButtons is not defined`

Cause:
- The Date Room page is generated inside server template strings. Regex literals like `/movie\/.../` render incorrectly in the browser as `/movie/.../`, which closes the regex early and kills the whole Date Room script.
- Some pages called `syncWatchButtons()` before it existed.

Fix:
- Replaced fragile browser regex literals in Date Room parsing with `new RegExp(...)`.
- Replaced URL regex literals inside Date Room recovery code with `new RegExp(...)`.
- Added a safe global `syncWatchButtons` fallback.
- Guarded calls with `typeof syncWatchButtons === "function"`.

The `Allow attribute will take precedence over allowfullscreen` line is only a browser warning and does not break the room.


## v75 Sync Regex + Script Fix

Fixed the new Date Room crashes:
- `Invalid regular expression: /.(mp4|webm|mov)(?|#|$)/i`
- `Unexpected token '<'`
- `/favicon.ico 404`

What changed:
- Removed the remaining browser regex literal in `isLikelyDirectVideoUrl`.
- Replaced it with `new RegExp("[.](mp4|webm|mov)([?#]|$)", "i")`.
- Added a Date Room iframe sync target overlay.
- Added favicon 204 route.
- Added a small client error collector to make future Date Room crashes easier to diagnose.

Sync limitation:
- If `proxyVideo` returns a real direct video file, SwiflyTV can force `video.currentTime` and auto-correct drift.
- If `proxyVideo` returns a cross-origin iframe/player page, browsers do not allow SwiflyTV to read/seek the internal video unless that player exposes an API. For those, SwiflyTV shows the room target timer overlay so users can match the timer.


## v76 Video-first Room Sync

Fixed the reason room movie sync was not actually correcting:
- SwiflyTV was only using native `<video>` when the URL looked like `.mp4`, `.webm`, or `.mov`.
- Your `proxyVideo` URLs can be real video streams without a file extension, so SwiflyTV was putting them in an iframe.
- Iframes cannot be force-seeked, so drift correction could not work.

What changed:
- Date Rooms now try every proxyVideo URL as native `<video>` first.
- If the native video loads, SwiflyTV controls `video.currentTime` and auto-corrects drift around 1.5 seconds.
- If native video fails, it falls back to iframe mode.
- Host native video controls now broadcast to the room:
  - play
  - pause
  - seek
- Server play/pause now uses the host's actual video currentTime when available.
- Polling fallback also uses video-first sync.


## v77 Sync Tolerance Fix

Changed Date Room video correction so it is not overly aggressive.

Fix:
- Native video sync now only corrects when someone is more than **5 seconds** ahead or behind.
- Removed the too-tight ~1.5 second correction behavior.
- Added shared client default:
  - `window.ROOM_MOVIE_DRIFT_LIMIT = 5`
- Updated env:
  - `ROOM_MOVIE_SYNC_DRIFT_LIMIT_SECONDS=5`

This should stop the player from fighting normal buffering or tiny timing differences.


## v78 Sync Loop Fix

Fixed the bug where the room kept repeating `set the timer to 9` and the timer got stuck.

Cause:
- Auto-correction changed `video.currentTime`.
- That triggered the video `seeked` event.
- The host client then told the server to `set` the room timer again.
- Repeated `set` messages reset the timer to the same value, so it froze.

Fix:
- Programmatic seeks are now ignored by native video event listeners.
- Native `seeked` only sends `set` if the host is more than the 5-second tolerance away.
- Native `set` events are throttled.
- Server ignores duplicate/nearby `set` requests within the tolerance.
- Auto-sync still corrects if drift is more than 5 seconds.


## v79 Smoother Video Sync

Fixed the weird native video behavior where the player looked paused/odd while frames moved and audio skipped.

Cause:
- The sync code could force `currentTime` on `loadedmetadata`, `canplay`, and correction ticks.
- `canplay` can fire multiple times on streams, causing repeated seeks/play calls.
- Repeated seek/play calls can make audio stutter or skip.

Fix:
- Native video only does one initial forced sync.
- `canplay` no longer force-syncs repeatedly.
- Normal drift correction only happens if:
  - drift is over 5 seconds, and
  - at least 8 seconds passed since the last correction.
- Correction loop slowed from 1s to 2s.
- Play/pause calls are throttled so the browser player is not constantly interrupted.
- Manual `Sync Me` still forces one correction when clicked.


## v80 10s Sync Correction

Changed Date Room movie sync to use a **10-second correction distance** and made correction more reliable.

Fixes:
- Sync no longer tries to correct at 5 seconds.
- It only corrects when someone is at least 10 seconds ahead/behind.
- If correction is needed, it does a stronger pause → seek → resume correction instead of tiny repeated nudges.
- It still avoids constant correction by using a 5-second correction cooldown.
- Polling fallback uses the same 10-second correction distance.
- Manual `Sync Me` still forces one correction immediately.

Recommended env:
```env
ROOM_MOVIE_SYNC_DRIFT_LIMIT_SECONDS=10
ROOM_MOVIE_SYNC_CORRECTION_COOLDOWN_MS=5000
```


## v81 Guest Auto-Correct Fix

Fixed guests not auto-correcting when they drift more than 10 seconds.

What changed:
- Added a separate guest video watchdog.
- The watchdog checks the guest's real native video time every 2.5 seconds.
- If drift is 10 seconds or more, it forces correction even if no new socket/control event happens.
- Correction now verifies the seek 700ms later and retries once if the stream ignored the first seek.
- Correction cooldown reduced to 2.5s only when the user is outside the 10s tolerance.
- Native-video fallback timeout extended from 9s to 30s so slow video streams are not accidentally turned into iframes.
- Polling fallback now uses the same guest watchdog behavior.

Recommended env:
```env
ROOM_MOVIE_SYNC_DRIFT_LIMIT_SECONDS=10
ROOM_MOVIE_SYNC_CORRECTION_COOLDOWN_MS=2500
ROOM_MOVIE_SYNC_WATCHDOG_MS=2500
ROOM_MOVIE_NATIVE_FALLBACK_TIMEOUT_MS=30000
```


## v82 Custom Video Player

Added a custom premium-looking video player for Date Room native proxyVideo playback.

Features:
- Custom glass-style player chrome.
- Big center play/pause button.
- Bottom progress bar.
- Current time / duration.
- Sync drift badge.
- Play/pause, -10, +10, mute, volume, fullscreen.
- Built-in Sync button that forces one room-timer correction.
- Hides native browser controls for a cleaner look.
- Works with the normal Socket.IO Date Room path and the REST polling fallback.

Note:
- This custom player controls the native `<video>` path. If a URL fails native video and falls back to iframe, browser security still prevents fully custom-controlling that iframe player.


## v83 Movieresolver m3u8-first Support

Changed the Date Room movie source choice:

Priority:
1. `m3u8`
2. `stream.url`
3. `proxyVideo`

So for a resolver response like:

```json
{
  "ok": true,
  "movieId": "1226863",
  "m3u8": "https://your-licensed-provider.example/master.m3u8",
  "stream": {
    "url": "https://your-licensed-provider.example/master.m3u8",
    "type": "m3u8",
    "quality": "1080p"
  }
}
```

SwiflyTV will use the `m3u8` URL in the custom native player instead of embedding `proxyVideo`.

Playback:
- Safari/iOS uses native HLS support when available.
- Chrome/Edge/Firefox use `hls.js`.
- The custom Date Room controls and sync watchdog still work on the native video element.

Important:
- Browsers do not allow frontend JavaScript to force custom `Referer` or `Origin` headers for HLS segment requests. The HLS URL needs to be playable from the browser with CORS, or proxied through your authorized backend.


## v84 M3U8 Player Mode

Made the Date Room movie player explicitly work as an m3u8/HLS player.

What changed:
- Resolver source is now stored as `playbackUrl`.
- Source priority is still:
  1. `m3u8`
  2. `stream.url`
  3. `proxyVideo`
- The custom player labels HLS sources as `HLS / M3U8 Player`.
- The Date Room player uses hls.js for `.m3u8` on Chrome/Edge/Firefox.
- Safari/iOS uses native HLS when available.
- Sync watchdog still runs on the native video element.
- Added standalone test route:

```txt
/m3u8-player?url=https://your-licensed-provider.example/master.m3u8
```

Note:
Browsers cannot force `Referer` or `Origin` headers from frontend JavaScript. Your m3u8 must allow browser playback/CORS, or be served through your own authorized backend.


## v85 Live M3U8 Mode

Changed m3u8 playback to behave like a live HLS player.

What changed:
- HLS streams are treated as live.
- Player label says `LIVE HLS / M3U8 Player`.
- Progress bar is disabled for live streams because live HLS often has no normal fixed duration.
- The current time display shows `LIVE`.
- Duration shows `Live edge`.
- Sync now corrects toward the HLS live edge instead of a fake VOD duration.
- hls.js config uses:
  - `lowLatencyMode: true`
  - `liveSyncDurationCount: 3`
  - `liveMaxLatencyDurationCount: 10`
  - `maxLiveSyncPlaybackRate: 1.5`
- Standalone `/m3u8-player?url=` route also treats the URL as live HLS.

Important:
If the m3u8 requires `Referer`/`Origin` headers, browser playback may still fail unless the stream supports CORS or is served through your own authorized backend.


## v86 HLS Proxy Player

Fixes m3u8 streams that do not play correctly when loaded directly in the browser.

What changed:
- Resolver m3u8 URLs are now registered through a same-origin HLS proxy.
- SwiflyTV fetches the master playlist server-side.
- It rewrites:
  - variant playlists
  - media segments
  - `EXT-X-KEY` / `EXT-X-MAP` URIs
- The browser loads `/api/hls-proxy/:id/master.m3u8` instead of the raw remote m3u8.
- hls.js now plays a same-origin rewritten playlist.
- Date Room custom controls and live sync still use the native video element.
- New debug endpoint:
  - `/api/hls-source/movie/:id`

Why this matters:
- Browsers cannot set `Referer` or `Origin` headers for HLS segment requests.
- A server-side proxy can fetch playlists/segments with authorized headers from the resolver response.
- Use this only for streams you are allowed to serve.

Env:
```env
HLS_PROXY_ENABLED=true
HLS_PROXY_TTL_MS=7200000
RATE_LIMIT_PER_MINUTE=600
```

Standalone test:
```txt
/m3u8-player?url=https://your-licensed-provider.example/master.m3u8
```

Optional standalone header test:
```txt
/m3u8-player?url=...&referer=https://example.com/&origin=https://example.com
```


## v87 streamName Fix

Fixed:
```txt
streamName is not defined
```

Cause:
- v86 used `streamName` and `streamQuality` inside HLS proxy metadata before defining them.

Fix:
- `streamQuality` and `streamName` are now defined right after the resolver response is parsed.
- HLS proxy registration can now safely include them.
- `/api/hls-source/movie/:id` includes `streamNameFix: true`.


## v88 Direct M3U8 Player

Changed m3u8 playback so SwiflyTV does **not** proxy by default.

Default behavior:
- Resolver returns `m3u8`.
- SwiflyTV sets `playbackUrl` to that raw m3u8 URL.
- The custom Date Room player loads it directly with hls.js.
- Safari/iOS uses native HLS when available.
- Date Room sync/watchdog still runs on the native video element.

Source priority:
```txt
m3u8
stream.url
proxyVideo
```

Env:
```env
DIRECT_M3U8_PLAYER=true
HLS_PROXY_ENABLED=false
```

Optional proxy still exists, but only if you explicitly turn it on:
```env
HLS_PROXY_ENABLED=true
```

Standalone direct test:
```txt
/m3u8-player?url=https://your-licensed-provider.example/master.m3u8
```

Optional standalone proxy test:
```txt
/m3u8-player?url=https://your-licensed-provider.example/master.m3u8&proxy=true
```


## v89 Stable HLS Player

Made SwiflyTV's m3u8 player behave more like normal online HLS players.

What changed:
- m3u8 is no longer automatically treated as a live stream.
- Removed forced autoplay on `MANIFEST_PARSED`.
- Removed constant live-edge jumping for normal HLS/VOD playlists.
- hls.js now uses a stable config:
  - `lowLatencyMode: false`
  - bigger buffers
  - normal `startPosition: -1`
  - longer playlist/segment timeouts
- Added HLS recovery:
  - network errors call `hls.startLoad()`
  - media errors call `hls.recoverMediaError()`
  - only unrecoverable errors fall back
- Sync waits until the HLS manifest is ready before trying to correct video time.
- Player label now says `DIRECT M3U8 Player`, not live, unless you explicitly force live mode.

Env:
```env
DIRECT_M3U8_PLAYER=true
HLS_PROXY_ENABLED=false
M3U8_FORCE_LIVE=false
M3U8_STABLE_PLAYER=true
```

This is closer to what online HLS players do: attach hls.js, load the source, recover errors, and let the video buffer normally.


## v90 HLS.js-first Player

Changed the m3u8 player to behave like common online HLS players.

What changed:
- HLS.js is loaded/attached first for m3u8 playback.
- HLS.js has CDN fallbacks:
  - jsDelivr
  - unpkg
  - Cloudflare cdnjs
- No silent dead browser `<video>` box.
- Visible HLS status overlay:
  - loading manifest
  - m3u8 ready
  - HLS warning
  - network/media recovery
  - fatal error details
- Chrome/Edge/Firefox use HLS.js.
- Safari/iOS can still use native HLS.
- Standalone `/m3u8-player?url=` route now uses the same HLS.js-first logic.
- Date Room custom player still uses the native video element after HLS attaches.

This is closer to online m3u8 players: load hls.js, attach media, load source, recover network/media errors, and show actual errors instead of hiding them.


## v91 Video.js M3U8 Player

Changed the m3u8 player to use Video.js/VHS first, like many online HLS players.

What changed:
- Added Video.js 8.16.1 CSS/JS.
- Date Room m3u8 playback tries Video.js first.
- If Video.js is unavailable, it falls back to HLS.js.
- Standalone `/m3u8-player?url=` also uses Video.js first.
- Keeps HLS.js error/recovery fallback.
- Player is no longer just a plain browser video box.

Env:
```env
VIDEOJS_M3U8_PLAYER=true
DIRECT_M3U8_PLAYER=true
HLS_PROXY_ENABLED=false
M3U8_FORCE_LIVE=false
```

If Video.js shows an error, the status box should now show the actual player error instead of just freezing at 0:00.


## v92 Regular Movie Button M3U8 Fix

Fixed the normal Movie button/watch page.

Before:
- Date Rooms used the improved Video.js/M3U8 player.
- The regular `/watch/movie/:id?mode=movie` page still loaded the returned source into an iframe/plain older path.

Now:
- The regular Movie button waits for the same resolver response.
- It picks:
  1. `playbackUrl`
  2. `m3u8`
  3. `proxyVideo`
- It loads m3u8 with Video.js first.
- If Video.js is unavailable, it falls back to HLS.js.
- It shows the same visible HLS status/errors instead of sitting on a dead 0:00 player.

Env:
```env
REGULAR_MOVIE_M3U8_PLAYER=true
VIDEOJS_M3U8_PLAYER=true
DIRECT_M3U8_PLAYER=true
HLS_PROXY_ENABLED=false
```


## v93 Regular Movie Site + Date Profile

Changed SwiflyTV so the main site feels like a normal movie/TV streaming site.

Main site:
- Home
- Movies
- TV Shows
- New & Popular
- My List
- Liked
- Kids
- Search
- Watch Rooms

Date/couple features moved into:
```txt
/date-profile
```

Date Profile includes:
- Date Room link
- saved date note
- next date/watch plan
- profile explanation
- switch profile link

Profiles now support:
- Regular Movie Profile
- Date Profile
- Kids Safe

Legacy route:
```txt
/couples
```
still works, but points to Date Profile.

This keeps the romantic/date stuff available without making the whole movie site feel couple-only.


## v94 Boot Route Handler Fix

Fixed Render startup crash:

```txt
ReferenceError: continueWatchingPage is not defined
```

Also fixed the next possible boot issue:
```txt
apiStatus
```

Changes:
- Added `continueWatchingPage(req, res)`
- Restored `/continue-watching`
- Restored `/continue`
- Added `apiStatus(req, res)`
- Restored `/api/status`
- Added static route-handler check so direct route callbacks are not missing
- Ran `node --check server.js`

Note:
A full startup smoke test was not run in the sandbox because dependencies like `dotenv` are not installed here, but the missing route-handler check catches this exact Render crash class.


## v95 Regular Movie Site Only

Removed the whole date/couple idea from the main app.

Main site is now a regular movie/TV site:
- Home
- Movies
- TV Shows
- New & Popular
- My List
- Liked
- Kids
- Search
- Watch Rooms

Removed from the UX:
- Date Profile nav
- Date Profile profile mode
- couples page positioning
- date-night homepage language
- date/couple account cards

Routes:
- `/date-profile` redirects to `/`
- `/couples` redirects to `/`

Profiles now only support:
- Regular Movie Profile
- Kids Safe

Watch Rooms remain as a regular synced watch-room feature, not a dating feature.


## v96 UI Polish + Social Hub

Improved the site so it feels less half-finished and less like every section is crammed onto one page.

UI polish:
- Cleaner profile selector page
- New separate `/profiles/manage` page
- Better profile cards and profile management layout
- More premium glass card styling
- Better spacing in rows/rails
- Added Font Awesome external stylesheet for cleaner icons
- Social now has its own nav item

Profiles:
- `/profiles` is now only for picking a profile
- `/profiles/manage` is for creating, renaming, changing Kids/Regular mode, deleting, and resetting profiles

Social Hub:
- New `/social` route
- Direct messages
- Groups
- Channels
- Local saved chat history
- Socket.IO live chat when available
- Typing indicators
- Online member list
- Create group/channel UI
- Invite link copy
- Voice call UI
- Video call UI
- Microphone/camera permission + local preview
- Socket.IO call join/leave signaling hooks

Notes:
- Messaging works locally and with Socket.IO rooms.
- Voice/video UI can request mic/camera and join signaling rooms.
- Full peer-to-peer remote audio/video still needs WebRTC peer negotiation if you want true calls between two users, but the UI and signaling hooks are now in place.


## v97 Social Watch Rooms

Combined Watch Rooms into the Social Hub.

What changed:
- Main nav now shows `Social + Rooms`.
- `/social?tab=watchrooms` opens the Watch Rooms studio inside Social.
- `/watchrooms` redirects to `/social?tab=watchrooms`.
- Existing actual room URLs still work:
  - `/watchrooms/:roomId`
- Social now has a Watch Rooms section in the sidebar.
- Users can create Watch Rooms directly from Social.
- Users can join by code from Social.
- Users can copy room invites from Social.
- Users can share a Watch Room link into the current chat.
- Social pulls active rooms from `/api/watchrooms`.
- New API endpoint:
  - `/api/social/watchrooms`

The idea now feels like one app:
- chat
- DMs
- groups
- channels
- calls
- watch rooms
all living under Social, instead of Watch Rooms feeling separate.


## v98 Social Buttons + Layout Fix

Fixed Social so the buttons do not feel dead.

What changed:
- Rebuilt the Social front-end script with delegated click handling.
- Dynamic groups/channels/rooms now work after being created.
- Watch Room buttons work through one safer click system.
- Voice/video/mute/camera/invite/copy/share buttons have direct handlers.
- Added global `swiflyToast()` and `swiflyCopy()` helpers.
- Added visible press feedback on buttons.
- Added Social mode tabs: Chat / Rooms.
- Added Social status bar.
- Cleaner layout spacing and stronger panel separation.
- `/social?tab=watchrooms` now opens directly to Rooms mode.

External CSS added:
- DaisyUI
- Notyf toast CSS/JS
- Tippy animation/theme CSS
- Animate.css
- Tabler Icons
- Font Awesome from prior build

Notes:
- Chat, groups, channels, room creation, copying, sharing, and call preview now use more reliable event delegation.
- True remote video/audio still needs full WebRTC peer negotiation, but the UI and signaling hooks remain in place.


## v99 Social Rebuild / Buttons Work

Rebuilt the Social page instead of layering more patches.

Main fixes:
- Social page now uses a simpler and stronger script.
- Core Watch Room buttons work as real server-side links/forms too.
- Added `/watchrooms/new`
- Added `/watchrooms/join`
- `/social?tab=watchrooms` opens the Rooms panel.
- Create Room works even if frontend JS breaks.
- Join Room works even if frontend JS breaks.
- Instant Room works even if frontend JS breaks.
- Chat/group/channel buttons use one simpler delegated click system.
- Voice/video buttons have clearer handlers and error display.
- Added a visible error box if Social JS crashes.

External CSS added:
- Flowbite CSS
- Bootstrap Icons
- Remix Icon
- Existing: DaisyUI, Notyf, Tippy, Animate.css, Tabler Icons, Font Awesome

Important:
This version does not depend on one fragile Watch Room JavaScript flow. The room creation and join actions are backed by Express routes.


## v100 Discord-style Social Rooms

Changed Social to feel more like Discord and made creation restricted.

What changed:
- Rebuilt `/social` into a Discord-style layout:
  - far-left server rail
  - channel sidebar
  - main chat/rooms panel
  - right member/permissions panel
- Watch Rooms are integrated as Social channels now, not a separate-feeling feature.
- `/social?tab=watchrooms` opens the integrated Watch Rooms panel.
- `/watchrooms/:roomId` still opens the actual synced room.
- `/watchrooms` still redirects to the Social Watch Rooms hub.

Permissions:
- Not everyone can create groups/channels/rooms anymore.
- Everyone can chat and join rooms.
- Only creator names can create:
  - groups
  - channels
  - Watch Rooms

Set creators in `.env`:
```env
SOCIAL_CREATOR_NAMES=Main,Admin,Owner,Lukas
SOCIAL_OPEN_ROOM_CREATION=false
SOCIAL_ENFORCE_CREATE_PERMISSIONS=true
```

For your current local profile to be allowed, its profile name must be in `SOCIAL_CREATOR_NAMES`.
Example: if your profile is `Main`, keep `Main` in the list.

New API:
```txt
/api/social/permissions?name=Main
```

External CSS added:
- modern-normalize
- driver.js CSS
- Atropos CSS
- Remix Icon / Bootstrap Icons from prior build

This version is not just hiding buttons. The `/watchrooms/new` route checks permissions too unless `SOCIAL_ENFORCE_CREATE_PERMISSIONS=false`.


## v101 Cleanup

Removed the accidental `check.js` / `social_v100_check.js` style test file from the zip.

That file was only a temporary syntax-check helper used while building v100. The actual Social code already lives inside `server.js`, so no extra check file is needed for Render.


## v102 Integrated Social Watchroom

Changed Watch Rooms so they open inside Social instead of feeling like a separate thing.

Routes now behave like this:
```txt
/watchrooms                  -> /social?tab=watchrooms
/watchrooms/:roomId          -> /social?tab=watchrooms&roomId=:roomId
/watchrooms/embed/:roomId    -> internal embedded room view used inside Social
/watchrooms/new              -> creates a room and redirects into Social
/watchrooms/join             -> joins a room and redirects into Social
```

What changed:
- Watch Rooms list opens room inside the Social Rooms panel.
- Room links copy/share as `/social?tab=watchrooms&roomId=...`.
- Actual room UI is embedded inside Social with the main site nav hidden.
- A popout button still exists, but it points back to the Social room link.
- The old standalone route is still compatible, but it redirects into Social.

This keeps Watch Rooms feeling like part of the Discord-style Social system.


## v103 Native Social Watchrooms

This changes the Watch Room integration from “an embedded Watchroom page inside Social” to a native Social room UI.

What changed:
- No `/watchrooms/embed/:roomId` iframe is used by Social anymore.
- The Social page owns the Watch Room UI directly.
- Native room UI includes:
  - room title
  - room code
  - viewer count
  - host/viewer state
  - player area
  - timer
  - host play/pause/seek controls
  - YouTube/link media setter
  - TMDB movie selector
  - join another room box
- Uses existing Socket.IO watchroom events:
  - `watchroom:join`
  - `watchroom:trailer`
  - `watchroom:movie-select`
  - `watchroom:movie-control`
  - `watchroom:movie-sync`
  - `watchroom:movie-sync-state`
  - `watchroom:message`
- `/watchrooms/:roomId` still redirects into `/social?tab=watchrooms&roomId=...`

Important:
This does still use iframes for actual external media like YouTube/web embeds when needed. But it no longer iframes the Watchroom page itself. The room shell, controls, chat, and state are native inside Social.


## v104 Open Watch Rooms + Swifly Hub Refresh

Changed:
- Anyone can create a Watch Room now.
- Groups/channels can still be creator-only.
- Watch Room creation is open by default server-side and UI-side.
- Social UI is less Discord-clone and more SwiflyTV:
  - streaming-style glow panels
  - rounded glass cards
  - red/purple Swifly gradients
  - softer channel cards
  - premium dashboard feel

Permission behavior:
```env
SOCIAL_OPEN_ROOM_CREATION=true
SOCIAL_LOCK_WATCHROOM_CREATION=false
```

If you ever want to lock Watch Room creation again:
```env
SOCIAL_LOCK_WATCHROOM_CREATION=true
SOCIAL_OPEN_ROOM_CREATION=false
```

Groups/channels still use:
```env
SOCIAL_CREATOR_NAMES=Main,Admin,Owner,Lukas
```


## v105 Galaxy Social Theme

Updated Social to better match the main SwiflyTV hero colors:
- deep navy / black base
- purple galaxy glow
- cyan-blue accent gradients
- softer lavender glass panels
- white hero-style text
- mint/teal online accents
- less red-heavy styling

This only changes the Social styling/colors. The v104 behavior remains:
- anyone can create Watch Rooms
- groups/channels can stay creator-only
- Watch Rooms remain native inside Social


## v106 Watchroom M3U8 + Nav Fix

Fixed the native Social Watchroom player path.

Changes:
- HLS proxy is now enabled by default unless `HLS_PROXY_ENABLED=false`.
- Native Social Watchroom m3u8 playback now uses Video.js/VHS first.
- Falls back to HLS.js with multiple CDN URLs.
- Adds visible m3u8 loading/error status inside the native player.
- Sync controls now read/write time through Video.js when Video.js is active.
- Fixed Social layout sitting behind the sticky top nav by adding the v106 offset/height rules.

Recommended env:
```env
HLS_PROXY_ENABLED=true
```

If a provider m3u8 needs Origin/Referer headers, the server-side HLS proxy is what makes browser playback more reliable.


## v107 Same-Origin M3U8 Proxy

This version makes SwiflyTV proxy resolver m3u8 streams through your own server.

What it does:
- Resolver returns `m3u8` / `stream.url`.
- SwiflyTV registers that URL as an HLS proxy source.
- The player receives a same-origin URL:
  - `/api/hls-proxy/:id/master.m3u8`
- The proxy rewrites:
  - master playlists
  - nested playlists
  - segment URLs
  - `EXT-X-KEY` / `EXT-X-MAP` URIs
- The proxy forwards Range requests and returns CORS headers.
- hls.js / Video.js loads the proxied m3u8 instead of the raw remote m3u8.

Debug:
1. Open `/api/hls-source/movie/TMDB_ID`
2. Copy `hlsProxyStatusUrl`
3. Try playback
4. Open the status URL to see playlist/segment/key failures.

Env:
```env
HLS_PROXY_ENABLED=true
HLS_PROXY_ROBUST_MODE=true
HLS_PROXY_LOG_REQUESTS=true
HLS_PROXY_TTL_MS=7200000
RATE_LIMIT_PER_MINUTE=600
```


## v108 TV / Controller Cursor Support

Added a global TV/controller mode.

Controls:
- Left stick: move virtual cursor
- A / Cross: click
- B / Circle: back
- X / Square: focus search
- Y / Triangle: try menu
- Start/Menu: fullscreen
- Right stick / D-pad / shoulder buttons: scroll
- TV remote arrows: jump between buttons/links/cards
- Enter: click
- Escape / Backspace: back
- F8: toggle TV/controller mode

What it does:
- Adds a visible virtual cursor.
- Highlights the clickable element under the cursor.
- Works across SwiflyTV pages, watchrooms, Date Rooms, and the custom player controls.
- Saves mode preference in `localStorage` as `swiflytv.tvControllerMode`.


## v109 Fire TV Focus Navigation

Changed TV/controller support from a virtual cursor to normal movie-app focus navigation.

What changed:
- Removed the visible cursor behavior.
- Selected items now get a clean white/red outline and glow.
- D-pad / arrows move between buttons, links, cards, and player controls.
- A / Select / Enter clicks the selected item.
- B / Back goes back.
- Start/Menu toggles fullscreen.
- X focuses search.
- Y tries to open the menu.
- Right stick / shoulder buttons scroll.
- Works more like Fire TV / Netflix / Hulu navigation.

Keyboard / TV remote:
- Arrow keys: move selection
- Enter: select
- Escape / Backspace: back
- F8: toggle TV focus mode
- `/`: focus search

Mode storage:
- Uses `localStorage.swiflytv.tvFocusMode`
- Old cursor mode key is removed automatically.


## v110 Social Layout + Vibe Fix

Fixed the Social page sitting behind the fixed top nav.

Changed:
- Added `sv110` Social layout layer.
- Social now has top spacing for the fixed Netflix-style navbar.
- Social uses full TV/app-height panels instead of starting underneath the nav.
- Restyled Social into a SwiflyTV watch-lounge look:
  - rounded glass panels
  - red/purple/cyan glow
  - premium chat area
  - softer sidebars
  - cleaner watch-party labels
- Changed the visible vibe away from a straight Discord copy.

Env:
```env
SOCIAL_LAYOUT_VIBE_FIX=true
```


## v111 Movie Site + Font + Effects Studio

Made the movie site feel more premium and added a Dropcart-style visual settings panel.

Changed:
- Upgraded font stack:
  - Host Grotesk for clean UI text
  - Space Grotesk for big cinematic titles
  - Outfit / Unbounded as selectable font modes
- Rebuilt Style Studio into Swifly Studio.
- Added options:
  - Theme: Swifly, Heat, Ice, Mint, Mono
  - Font: Premium, Cinema, Soft, Wide
  - Effects: Cinematic, Dropcart, Neon, Glass, Calm, Off
  - Experience: Comfy, Compact, Motion
- Added premium poster hover effects:
  - tilt lighting
  - shimmer pass
  - glow presets
  - image zoom
- Added Dropcart-style background grain/glow option.
- Added compact row density.
- Added scroll reveal animations with reduced-motion support.

Env:
```env
MOVIE_SITE_FONT_EFFECTS_STUDIO=true
```


## v112 Studio Visible + No Red Focus

Fixed two things:
- Removed the red outline/glow from TV focus navigation.
- Made the Studio button obvious instead of only showing a tiny star icon.

Changes:
- Focus ring is now white/cyan/purple instead of red.
- Studio launcher now says `Studio`.
- Studio panel gets a higher z-index and opens above the UI.
- Added `Ctrl/⌘ + E` shortcut to open/close Studio.
- Studio button uses `aria-expanded`.

Env:
```env
STUDIO_VISIBLE_NO_RED_FOCUS=true
```


## v113 No Outlines + Always-Visible Studio

Changed:
- Removed the visible outline/glow look from selected buttons/cards.
- TV focus now uses subtle brightness/scale and a small underline instead of a box outline.
- Studio is now visible in two places:
  - fixed left floating button
  - top navigation `✦ Studio` button
- Studio panel opens from either button.
- Added support for opening Studio directly with:
  - `?studio=1`
  - `#studio`
- `Ctrl/Command + E` still toggles Studio.

Env:
```env
NO_OUTLINES_ALWAYS_VISIBLE_STUDIO=true
```


## v114 Polished Studio Drawer

Redesigned the Studio feature so it looks like part of SwiflyTV instead of a random floating pill.

Changed:
- Studio is now a compact dark glass button in the bottom-right.
- Top nav Studio button is cleaner and no longer a huge bright pill.
- Studio panel is now a premium right-side drawer.
- Added a better header, live preview card, and grouped controls.
- Controls are now clean rounded chips instead of bulky boxes.
- Reset button is integrated into the header.
- Escape closes Studio.
- `Ctrl/Command + E`, `?studio=1`, and `#studio` still open Studio.

Env:
```env
POLISHED_STUDIO_DRAWER=true
```


## v115 Blended Gallery Edges

Fixed the gallery effects getting hard-cut at the sides.

Changed:
- Added extra paint space around movie rails.
- Added left/right gradient masking so rails fade into the page instead of clipping abruptly.
- Added safe right-side space when Studio is open.
- Let row sections and grids paint their hover glow outside normal bounds.
- Added better Top 10 and grid spacing so hover glow has breathing room.
- Studio drawer now casts a page-edge blend when open.

Env:
```env
BLENDED_GALLERY_EDGES=true
```


## v116 Layout + Advanced Effects Studio

Added more layout and effect controls to Swifly Studio.

New Studio options:
- Layout:
  - Default
  - Cinema Rows
  - Poster Wall
  - Spotlight
  - Dense
- Cards:
  - Rounded
  - Sharp
  - Soft Glass
  - Floating
- Detail:
  - Clean
  - Balanced
  - Max Detail
- Backdrop:
  - Smooth
  - Film Grain
  - Aurora
  - Grid Glow

Effects improved:
- Detail mode now changes glow intensity, lift amount, saturation, shine strength, and tilt depth.
- Max Detail adds stronger poster lighting based on pointer position.
- Backdrop presets change the page background with grain, aurora glow, or grid glow.
- Layout presets actually reshape rails and galleries, not just change colors.
- Studio preview now shows the current layout/effect/detail selection.

Env:
```env
LAYOUT_EFFECTS_STUDIO=true
```


## v117 Continue Watching Cleanup

Fixed the Continue Watching row/card design.

Changed:
- Removed the huge white play circle look.
- Resume is now a small dark glass pill.
- Cards stay proper 16:9 even when layout presets are changed.
- Continue Watching ignores the extreme Poster Wall / Spotlight / Dense reshaping.
- Progress bar is cleaner and sits correctly inside the card.
- Titles and watched percent are readable without the giant overlay.
- Hover is softer and less messy.
- Studio-open mode gives the row extra right-side safe space.

Env:
```env
CONTINUE_WATCHING_CLEANUP=true
```


## v118 Clean Cinema Refresh

This version keeps SwiflyTV the same kind of site, but makes it cleaner and more premium.

Changed:
- Replaced the tiny `Featured Movie Spotlight` rail with a wide cinematic Spotlight card.
- Calmed the default effects so the site looks good before Studio is touched.
- Added `Clean`, `Glow`, and `Ultra` effect presets.
- Reduced random glow/shimmer intensity by default.
- Made movie rows/cards more consistent.
- Improved card hover behavior and overlays.
- Made Studio controls cleaner and less bulky.
- Added a one-time v118 localStorage migration so older messy settings do not keep the UI looking broken.
- Kept reduced-motion support.

Env:
```env
CLEAN_CINEMA_REFRESH=true
```


## v119 Action Button Visibility + Next Polish Plan

Changed:
- Add to List buttons are now lighter and easier to see.
- Like buttons are also brighter and more readable.
- Saved state is green/cyan instead of dark.
- Liked state is pink/purple but still readable.
- Hover states are clearer without using ugly outline boxes.
- Mobile action buttons are slightly larger.
- Added `DESIGN_PLAN.md` with the next research-backed polish plan.

Env:
```env
ACTION_BUTTON_VISIBILITY=true
```


## v120 Visual Hierarchy + Consistency Refresh

Focused on making the site cleaner instead of adding more effects.

Changed:
- Cleaner row rhythm and section spacing.
- Consistent section headers.
- Card family rules:
  - Spotlight = wide feature card
  - Continue Watching / Trending = landscape cards
  - grids = poster cards
- Continue Watching remains stable across layout presets.
- Top 10 numerals are quieter so they do not overpower posters.
- Studio groups are calmer and easier to scan.
- Detail and Backdrop controls are visually treated as advanced.
- Effects defaults are calmer.
- One-time v120 localStorage migration resets the site to a clean baseline.

Env:
```env
VISUAL_HIERARCHY_CONSISTENCY=true
```


## v121 Watch Direct + Detail Tabs + Cinema HLS Player

Changed:
- Movie cards now open the watch/player page directly.
- Added a new `ⓘ` card button for the More Info page.
- Continue Watching resumes directly into the player.
- Fixed LIVE/tag badges sitting in front of row arrows.
- Detail page now has animated tab panels:
  - Overview
  - Cast
  - Episodes
  - Trailers
  - More Like This
  - Details
- Upgraded the m3u8 player:
  - cleaner cinema shell
  - top HLS HUD
  - keyboard shortcut hints
  - better Video.js control bar
  - better HLS.js fallback config/status
  - keyboard shortcuts for play, fullscreen, mute, seek

Env:
```env
WATCH_DIRECT_DETAIL_TABS_HLS_PLAYER=true
```


## v122 HLS Seekbar / Timeframe Fix

Fixed the m3u8 player timeline issue.

Changed:
- Added a custom HLS seekbar above the player controls.
- The custom seekbar uses the video `seekable` range, which matters for HLS/m3u8.
- Bigger clickable Video.js timeline area.
- HUD/status overlays moved upward so they do not block the timeline.
- Keyboard seeking now respects HLS seekable start/end ranges.
- Works better for both VOD m3u8 and live/DVR m3u8 windows.
- Shows VOD vs LIVE/DVR mode in the player.

Env:
```env
HLS_SEEKBAR_PLAYER_FIX=true
```


## v123 Plyr + HLS.js Player Refresh

Changed:
- The m3u8 player now uses Plyr for the visible controls/UI.
- HLS.js still handles m3u8 playback behind the scenes.
- Native HLS fallback is kept for compatible browsers.
- Added a quality menu when HLS levels are available.
- Replaced the rough Video.js-first look with a cleaner cinema player.
- Hid the custom precision seekbar when Plyr is active to avoid clutter.
- Kept timeline seeking, fullscreen, speed controls, PiP, volume, and keyboard support.

Env:
```env
PLYR_HLS_PLAYER_REFRESH=true
```


## v124 UI Stabilizer

Fixed UI bugs and messy player/layout behavior.

Changed:
- Added predictable z-index layers for nav, rows, player, Studio, and toasts.
- Decorative badges no longer block clicks.
- Row arrows and card buttons are easier to interact with.
- Plyr player controls are cleaner and less oversized.
- Player overlays no longer block scrubbing/clicking.
- Duplicate/custom seekbar is hidden when Plyr is active.
- Mobile player controls are simplified.
- Detail tabs/cards have more stable spacing.
- Added cleanup for old Plyr wrappers between player loads.

Env:
```env
UI_STABILIZER=true
```


## v125 Media Chrome Cinema Player

Rebuilt the visible m3u8 player UI.

Changed:
- Uses Media Chrome for custom player controls.
- Keeps hls.js as the playback engine for m3u8.
- Added SwiflyTV-native cinema controls.
- Added big center play / back 10 / forward 10 controls.
- Added larger bottom timeline.
- Added time displays, mute, volume, captions, speed, PiP, fullscreen.
- Added custom quality menu from hls.js levels.
- Added native fallback if Media Chrome cannot load.
- Kept keyboard controls:
  - Space/K = play pause
  - J / Left = back 10
  - L / Right = forward 10
  - M = mute
  - F = fullscreen
  - C = captions

Env:
```env
MEDIA_CHROME_CINEMA_PLAYER=true
```


## v126 Video.js Cinema Player

Changed the player back to Video.js.

Changed:
- Removed the Media Chrome startup path.
- Uses Video.js 8 for the visible m3u8 player.
- Uses Video.js VHS for HLS/m3u8 playback.
- Added custom Swifly cinema overlay controls.
- Added 10-second skip buttons.
- Added custom quality menu using VHS representations when available.
- Kept the larger custom timeline helper.
- Kept keyboard controls:
  - Space/K = play pause
  - J / Left = back 10
  - L / Right = forward 10
  - M = mute
  - F = fullscreen
  - C = captions

Env:
```env
VIDEOJS_CINEMA_PLAYER=true
```


## v127 Video.js Modern Player Cleanup

Fixed the bad-looking player UI from v126.

Changed:
- Removed the huge glass timeline overlay.
- Video.js timeline is now the main timeline.
- Smaller top HUD/status card.
- Status auto-hides after playback starts.
- Center play/skip controls only show when paused/loading.
- Cleaner, shorter Video.js control bar.
- Smaller quality button/menu.
- Less blur/glass covering the video.

Env:
```env
VIDEOJS_MODERN_PLAYER_CLEANUP=true
```


## v128 Video.js Modern Skin Refresh

Improved the Video.js player look.

Changed:
- Cleaner modern Video.js skin.
- More polished bottom control bar.
- Better progress bar and scrubber styling.
- Better Video.js menus.
- Smaller top HUD/status card.
- Cleaner Quality button with label/value.
- Kept real Video.js skip controls.
- Kept Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_MODERN_SKIN_REFRESH=true
```


## v129 Video.js Minimal Modern Player

Fixed the player not working and cleaned up the ugly play UI.

Changed:
- Removed fragile custom Video.js component registration.
- Removed the custom overlay play/skip buttons from the visible UI.
- Brought back a clean native Video.js big play button.
- Video.js timeline/control bar is the main UI now.
- Smaller status HUD.
- Less glass/blur covering the video.
- Kept Video.js/VHS for m3u8 playback.
- Kept keyboard controls:
  - Space/K = play pause
  - J / Left = back 10
  - L / Right = forward 10
  - M = mute
  - F = fullscreen
  - C = captions

Env:
```env
VIDEOJS_MINIMAL_MODERN_PLAYER=true
```


## v130 Video.js Simple Modern Player

Made the Video.js player simpler and more modern.

Changed:
- Smaller play button.
- Slimmer bottom control bar.
- Thinner timeline.
- Hidden title HUD.
- Smaller loading/status toast.
- Smaller quality pill.
- Less glass/blur over the video.
- No big new custom UI.
- Still uses Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_SIMPLE_MODERN_PLAYER=true
```


## v131 Video.js Timeline Fix + Compact Modern Skin

Fixed the m3u8/player UI bug from the screenshot.

Changed:
- Fixed the timeline/timeframe bar being tiny.
- The Video.js progress bar now spans the player width.
- Control bar is now a compact floating dock.
- Kept the play button simple and smaller.
- Hid extra overlays/title HUD.
- Smaller loading/status toast.
- Still uses Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_TIMELINE_FIX_MODERN=true
```


## v132 Video.js Soft Rectangle Play Button

Changed:
- Play button is no longer a circle.
- New play button is a small rounded rectangle / pill shape.
- Less bulky, more modern.
- Kept the full-width timeline fix.
- Kept Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_SOFT_RECT_PLAY_BUTTON=true
```


## v133 Video.js Hover Preview + Menu Fix

Changed:
- Centered the play icon inside the play button.
- Fixed playback speed menu hover so it stays open.
- Moved playback speed menu above the timeline area.
- Added/styled hover time preview on the timeline.
- Kept Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_HOVER_PREVIEW_MENU_FIX=true
```


## v134 Video.js Speed Menu + Real Hover Preview Fix

Fixed the two player bugs you pointed out.

Changed:
- Removed the broken built-in Video.js playback speed menu from the control bar.
- Added a custom Speed pill above the controls.
- Speed options no longer hide below the embed.
- Added a real timeline hover preview.
- Hovering the timeline now shows the target time above the bar.
- Kept Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_SPEED_PREVIEW_FIX=true
```


## v135 Video.js Volume + Image Preview Fix

Fixed the volume hover and added visual timeframe preview.

Changed:
- Removed the flaky built-in Video.js volume hover control.
- Added a custom Volume pill above the controls.
- Volume slider no longer disappears when moving near the timeframe.
- Timeline hover preview now includes a visual preview box.
- The preview tries to show an actual muted video frame.
- If the frame preview cannot load, it falls back to a clean time preview.
- Kept Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_VOLUME_IMAGE_PREVIEW_FIX=true
```


## v136 Video.js Pill Dock Skin

Made the player look closer to the reference screenshot.

Changed:
- One rounded pill-shaped control dock.
- Controls are inline in one row.
- Progress bar is in the middle like the screenshot.
- Play/time/progress/duration/actions feel cleaner.
- Speed, volume, and quality are visually inside the dock area.
- Removed the bulky floating look.
- Kept the hover preview above the dock.
- Still uses Video.js/VHS for m3u8 playback.

Env:
```env
VIDEOJS_PILL_DOCK_SKIN=true
```


## v137 Video.js Native Custom Dock

Fixed the bad-looking v136 player.

Changed:
- Stopped fighting the broken Video.js controlbar layout.
- Video.js/VHS still plays the m3u8.
- The visible controls are now one clean custom Swifly dock.
- Dock includes play, 10-second skip, current time, progress, duration, speed, volume, PiP, and fullscreen.
- Progress bar is no longer smashed or overlapping.
- Kept hover frame/time preview above the dock.

Env:
```env
VIDEOJS_NATIVE_CUSTOM_DOCK=true
```


## v138 Preview Warmup Fix

Fixed blank image previews without trying to download the whole m3u8.

Changed:
- Preview HLS now starts loading near the hovered timestamp.
- Preview video briefly plays muted, then pauses to force frame decoding.
- Added preview warmup across multiple timestamps.
- Added loading/fallback shimmer while a frame is warming.
- Kept the custom Swifly dock from v137.
- Still uses Video.js/VHS for main m3u8 playback.

Env:
```env
VIDEOJS_PREVIEW_WARMUP_FIX=true
```


## v139 Clean Icon Dock

Changed:
- Removed the blue progress circle.
- Progress thumb is smaller and neutral white/gray.
- Replaced emoji/text controls with clean SVG icons.
- Icons now look closer to the simple reference player.
- Centered the play icon better.
- Kept the custom Swifly dock.
- Kept the preview warmup fix.

Env:
```env
VIDEOJS_CLEAN_ICON_DOCK=true
```


## v140 Home Hero Trailer Autoplay Fade

Changed:
- Main home hero now loads the featured movie trailer from TMDB videos.
- Poster/backdrop appears first like before.
- After a short delay, it fades into the muted autoplay trailer behind the movie name.
- Text/buttons stay on top with a readable gradient veil.
- Mobile/reduced-motion fallback keeps the poster only.
- Kept v139 player dock changes.

Env:
```env
HOME_HERO_TRAILER_AUTOPLAY_FADE=true
```


## v141 Player Fit + Single Fullscreen + Preview Fix

Changed:
- m3u8 video now fills the full player.
- Fullscreen button should work with one press.
- Fullscreen has webkit/MS fallbacks.
- Timeframe preview now uses the full progress wrapper hover area.
- Preview is forced above the dock so it does not silently hide.
- Kept v140 home trailer fade and v139 clean dock.

Env:
```env
VIDEOJS_FIT_FULLSCREEN_PREVIEW_FIX=true
```


## v142 YouTube Error 153 Referrer Fix

Fixed trailer embeds showing:

```txt
Watch video on YouTube
Error 153
Video player configuration error
```

Changed:
- Sets `Referrer-Policy: strict-origin-when-cross-origin`.
- Adds matching `<meta name="referrer">`.
- Adds `referrerpolicy="strict-origin-when-cross-origin"` to YouTube iframes.
- Removes the old `referrerpolicy="no-referrer"` trailer iframe.
- Removes sandbox from YouTube trailer iframes.
- Supports YouTube watch URLs like `https://www.youtube.com/watch?v=3wISOkX6mXI&source_ve_path=...`.
- Adds `origin` and `widget_referrer` params to YouTube embeds.

Recommended env on Render:
```env
YOUTUBE_EMBED_ORIGIN=https://your-render-url.onrender.com
```

Env:
```env
YOUTUBE_ERROR153_REFERRER_FIX=true
```


## v143 Hero Trailer Visibility + Mute Toggle

Changed:
- Home autoplay trailer is less transparent.
- Trailer is brighter and easier to see behind the title.
- Poster/backdrop still shows first, then fades back.
- Age-rating mute icon is now clickable.
- Clicking it toggles trailer mute/unmute.
- Uses the YouTube IFrame API for the actual mute/unmute command.

Env:
```env
HOME_HERO_TRAILER_MUTE_TOGGLE=true
```


## v144 Hero Trailer No Play Overlay

Changed:
- The autoplay trailer no longer fades in while YouTube is still showing its play/pause overlay.
- The poster stays visible until the trailer is actually playing.
- Trailer fades in after YouTube reports `PLAYING`.
- Added extra YouTube embed params to reduce visible player UI:
  - `disablekb=1`
  - `fs=0`
  - `iv_load_policy=3`
- Kept the working mute/unmute button from v143.

Env:
```env
HOME_HERO_TRAILER_HIDE_YOUTUBE_OVERLAY=true
```


## v145 Remove Streaming Made Simple Badge

Changed:
- Removed the `Streaming made simple` chip from the home page board.
- Kept the rest of that section the same.
- Added a small spacing cleanup for the heading.

Env:
```env
HOME_BOARD_BADGE_REMOVED=true
```


## v146 Remove Home Board + Fix Autotrailer Visibility

Changed:
- Fully removed the old `Streaming made simple` area.
- Removed its buttons and 01/02/03 cards too.
- Fixed the autoplay trailer not showing.
- Trailer now fades in even if the YouTube `PLAYING` event does not fire.
- Kept the poster-first trailer fade.
- Kept the working mute/unmute button.

Env:
```env
HOME_BOARD_FULLY_REMOVED=true
AUTOTRAILER_FALLBACK_REVEAL=true
```


## v149 Vidstack m3u8 Player

Changed:
- Replaced the messy Video.js/custom dock player path with Vidstack.
- Uses Vidstack Default Layout first.
- Adds Swifly-styled CSS over the Vidstack layout.
- Keeps your existing m3u8 proxy/resolver URL exactly as the player `src`.
- Removes/hides the broken Video.js dock from the active player.
- Keeps v146 home board removal and autoplay trailer fallback.
- Falls back to native video controls if Vidstack CDN fails.

Env:
```env
VIDSTACK_M3U8_PLAYER=true
```


## M3U8-only API playback

This patched build rejects mp4/direct file fallbacks for `/api/provider/embed`. The selected API source must be an HLS URL whose path ends in `.m3u8`. If HLS proxying is enabled, the embedded URL becomes `/api/hls-proxy/<id>/master.m3u8`, which also ends in `.m3u8`.

## API source selection update

The backend API integration now re-reads provider returns and selects sources like this:

1. Prefer real `.m3u8` HLS URLs.
2. If no `.m3u8` exists, allow non-download stream/embed/media URLs only.
3. Reject obvious download/detail/file-host URLs such as download pages, HubCloud/GDFlix-style redirects, archive files, torrents, and direct file-download pages.
4. The frontend still never receives `x-api-key`; all provider calls happen server-side.

## No YouTube + TMDB id provider rule

This build does not embed YouTube, youtu.be, youtube-nocookie, googlevideo, or ytimg URLs from provider responses. It also blocks `/api/youtubes/*` provider calls.

For provider endpoints that need TMDB ids, mainly `castel`, the backend sends the numeric TMDB id as `tmdb`. If an older route accidentally passes an IMDb id like `tt1375666`, the backend tries to convert it through TMDB first.

## TMDB + file-extension-only source rule

This build sends a numeric TMDB id whenever a provider/API action needs one, especially Castel. If an older route passes an IMDb id, the backend attempts to convert it with TMDB first.

Embeds only use URLs whose path ends with a supported media file extension:

```txt
.m3u8
.mpd
.mp4
.m4v
.webm
.mov
```

M3U8/HLS is still ranked first. Extensionless pages, detail URLs, redirect/download pages, and YouTube links are rejected.

## Fixed source selection after strict extension filter

The final Vidstack URL must still end in a supported media extension. M3U8 remains first priority.

If the API returns an extensionless endpoint but marks it as HLS/m3u8, the backend now registers it with the local HLS proxy so the browser embeds:

```txt
/api/hls-proxy/<id>/master.m3u8
```

That keeps the final embedded URL extension-based while still supporting HLS APIs that do not expose `.m3u8` directly.

## API source finder fix

This build does not stop at the details response anymore. If details returns intermediate links, it recursively calls the proper provider/extractor route from the API docs:

- 4kHDHub gadget
- Drive mdrive
- Movies4u m4ulinks
- Zeefliz/Vega nextdrive
- ZinkMovies zinkcloud
- KMMovies magiclinks
- UHDMovies tech
- Moviesmod modpro
- HubCloud/GDFlix extractors

It still blocks YouTube and adult routes, still prefers `.m3u8`, and the final Vidstack URL must be a media URL or the local `/master.m3u8` HLS proxy URL.

## M3U8 source reanalysis fix

This version reanalyzes the API docs as chained provider flows, not just one request.

Important fix: NetMirror stream needs NetMirror's content id, not the TMDB id. The backend now uses TMDB id only to get title/year, searches NetMirror, then streams the NetMirror id.

It also follows details -> extractor/action chains to reach the final `.m3u8`/media URL and includes `/api/provider/raw-debug` for checking exact raw provider output.

## Castel live API parameter fix

The API docs show Castel using `tmdb`, but the live API error says it wants `id (TMDB ID)`.
This build sends all safe aliases for Castel:

```txt
id=<tmdb>
tmdb=<tmdb>
tmdbId=<tmdb>
```

Set Render:

```env
DEFAULT_PLAY_PROVIDER=castel
```

NetMirror search may fail depending on the API service, and quota-limited providers cannot be used until the quota resets/upgrades. Castel should now be the main fallback.

## Castel stream parse fix

The live Castel API may return stream rows like:

```js
{ name, quality, url }
```

where the URL may not visibly end with `.m3u8` even though the route is a stream route. This build treats Castel/NetMirror/AnimePahe/AnimeSalt stream-route URL rows as trusted HLS candidates and wraps extensionless ones through the local HLS proxy so the browser still receives:

```txt
/api/hls-proxy/<id>/master.m3u8
```

It still blocks YouTube and `/api/adult/*`.

## Castel string + parameter variant fix

This build tests Castel parameter names in this order:

```txt
id
tmdb
tmdbId
id + tmdb + tmdbId
```

It also treats raw string URLs returned by trusted stream providers as possible HLS sources, then wraps extensionless HLS candidates through `/api/hls-proxy/<id>/master.m3u8`.

If Castel still reports no source, open:

```txt
/api/provider/raw-debug?provider=castel&action=stream&tmdb=550&type=movie
```

and inspect `raw`, `candidateUrls`, and `normalizedSources`.

## All-provider M3U8 fallback

This build does not only try Castel/NetMirror. It tries this order for m3u8/media discovery:

```txt
castel
netmirror
animepahe
animesalt
4khdhub
movies4u
hdhub4u
zeefliz
vega
zinkmovies
kmmovies
uhdmovies
mod
drive
desiremovies
```

For providers that require chained API calls, it uses:

```txt
search -> details -> extractor/action -> final m3u8/media URL
```

AnimeSalt/AnimePahe stream routes are now called from episode/player URLs returned by details.

Debug all providers:

```txt
/api/provider/all-source-debug?tmdb=550&type=movie&stopOnFirst=false
```

If the API returns `Invalid API key` or `User quota exceeded`, that provider cannot work until the API key/quota is fixed, but the code will keep trying the next provider.

## Uploaded API source reanalysis

I inspected the uploaded `ScarperApi-zero.zip` source and added the missing stream routes:

```txt
/api/vid?tmdb=<id>
/api/vid?tmdb=<id>&s=<season>&e=<episode>
/api/themovie/search?q=<title>
/api/themovie/det?url=<moviebox detail url>
/api/themovie/stream?url=<moviebox detail/play url>
/api/tm?url=<vibuxer embed url>
```

Important return shapes now handled:

```txt
/api/vid -> { success, streams: [{ name, title, url, quality, headers, provider }] }
/api/castel -> { success, streams: [{ name, title, url, quality, headers, provider }] }
/api/tm -> { success, streamUrl, streams: { hls4, hls3, hls2, primary } }
/api/themovie/stream -> { success, data: <playback object>, playbackHeaders }
```

The player now tries `/api/vid` first, then Castel, TheMovie, NetMirror, AnimePahe, AnimeSalt, and the remaining details/extractor providers.

## Directly ported uploaded API source

The uploaded `ScarperApi-zero/app/api/vid/route.ts` flow is now copied into `server.js` as a local SwiflyTV implementation.

This means SwiflyTV no longer has to call your external `/api/vid` endpoint or use API quota for the main source finder. It now does this directly:

```txt
TMDB id -> TMDB title/year/imdb id -> VideoEasy server endpoints -> enc-dec.app/api/dec-videasy -> streams[].url -> Vidstack
```

Local test routes:

```txt
/api/local/vid?tmdb=550
/api/local/vid?tmdb=1399&s=1&e=1
/api/provider/source-debug?provider=vid&tmdb=550&type=movie
/watch/movie/550?provider=vid
```

Set:

```env
DEFAULT_PLAY_PROVIDER=vid
TMDB_API_KEY=your_tmdb_key
```

The normal backend API providers still exist as fallback, but the main `vid` source now uses the uploaded source code directly inside SwiflyTV.

## Strict uploaded source-code port

This build ports the uploaded API source routes directly into SwiflyTV instead of calling your API docs endpoint first.

Ported locally:

```txt
app/api/vid/route.ts
app/api/castel/route.ts
```

Local routes:

```txt
/api/local/vid?tmdb=550
/api/local/castle?id=550&type=movie
/api/local/castle?id=1399&type=tv&season=1&episode=1
```

The source finder now tries local VID first, then local Castle, then the old API provider fallbacks.

Use:

```env
DEFAULT_PLAY_PROVIDER=vid
```

If `/api/local/vid` returns `streams: []`, test `/api/local/castle?id=<tmdb>&type=movie`. A zero stream result from local VID means the uploaded VID source code itself found no VideoEasy server sources for that TMDB id.

## Source-code provider ports added

This version ports more of the uploaded source code directly into SwiflyTV:

```txt
lib/baseurl.ts provider/cookie fetch
app/api/netmirror/search/route.ts
app/api/netmirror/stream/route.ts
app/api/tm/route.ts
app/api/themovie/search/route.ts
app/api/themovie/det/route.ts
```

New local debug routes:

```txt
/api/local/netmirror?q=movie title
/api/local/netmirror?id=netmirror_id
/api/local/themovie?q=movie title
/api/local/themovie?url=https://themoviebox.org/moviesDetail/...
/api/local/tm?url=https://vibuxer.com/e/...
```

The source finder now tries local VID, local Castle, local NetMirror, and local TheMovie before the external docs API fallbacks.

## Local-source-code-only mode

This build follows the instruction: it does **not** need the external API docs server to find streams.

By default:

```env
USE_EXTERNAL_PROVIDER_API=false
```

So `/api/provider/embed`, `/api/provider/source-debug`, and `/watch/movie/...` use the uploaded source-code ports directly:

```txt
local VID
local Castle
local NetMirror
local TheMovie
local TM/vibuxer extractor
```

Do not set `API_BASE_URL` or `API_KEY` unless you intentionally want the old external API fallback. To enable that fallback:

```env
USE_EXTERNAL_PROVIDER_API=true
API_BASE_URL=https://screenscapeapi.dev
API_KEY=...
```

New local-only debug route:

```txt
/api/local/all-source-debug?tmdb=1226863&type=movie
```

Recommended Render env:

```env
DEFAULT_PLAY_PROVIDER=vid
USE_EXTERNAL_PROVIDER_API=false
TMDB_API_KEY=your_tmdb_key
```

## Accuracy/debug update

For future/unreleased TMDB titles, the local source-code providers can correctly return zero streams. Example:

```txt
1226863 = The Super Mario Galaxy Movie, year 2026
```

The debug route now reports `releaseStatus` and a note when the title is unreleased. NetMirror's remote `cookies.json` dependency is also non-fatal now; if it 404s, local source mode keeps trying the remaining providers instead of stopping.

## Any-extension source rule

The source picker no longer requires `.m3u8`. It can use any source URL whose path ends with a file extension.

Examples now allowed:

```txt
.m3u8
.mpd
.mp4
.mkv
.avi
.webm
.mov
.ts
.m2ts
.flv
```

It still blocks YouTube and obvious non-video/archive/subtitle/image files like `.zip`, `.rar`, `.srt`, `.jpg`, etc. M3U8/HLS is still ranked first when available.

## Local source search fix

This build keeps any-extension playback and fixes the local TheMovie source-code port:

- provider/cookie JSON now has hardcoded local fallbacks (`moviebox`, `nfMirror`)
- NetMirror/MovieBox cookies can be provided with `SOURCE_COOKIES`, `NETMIRROR_COOKIES`, or `MOVIEBOX_COOKIES`
- TheMovie search parser now matches the uploaded source selector `a.card[href^="/moviesDetail/"]` without requiring attribute order
- TheMovie search headers now mirror the uploaded source route more closely

Test:

```txt
/api/local/themovie?q=The%20SpongeBob%20SquarePants%20Movie
/api/local/all-source-debug?tmdb=11836&type=movie
```

## M3U8 embed-first rule

The source picker still allows any file-extension fallback, but when a provider returns both HLS and file URLs, SwiflyTV now explicitly embeds the `.m3u8` first.

For TheMovie-style results, the player should use:

```txt
/api/hls-proxy/<id>/master.m3u8
```

not the MP4 fallback URLs, when an HLS source exists.

Debug fields now included in `/api/provider/embed` and `/api/local/all-source-debug` results:

```txt
embeddedM3u8Url
m3u8Embedded
embedUrl
```

## Watch page forced M3U8 embedding

The backend was already returning `m3u8Embedded: true`, but the watch page could still pass the wrong source order to the player.

This build forces the watch page order:

```txt
embeddedM3u8Url
hlsProxyUrl
playbackUrl
proxyVideo
m3u8
originalPlaybackUrl
```

If any selected source ends in `.m3u8`, that is the source sent to Vidstack.

The Vidstack player now also receives a typed HLS source:

```js
player.src = { src: "/api/hls-proxy/<id>/master.m3u8", type: "application/x-mpegurl" }
```

Debug attributes on the player:

```txt
data-swifly-embed-kind="m3u8"
data-swifly-m3u8-src="/api/hls-proxy/<id>/master.m3u8"
```

## Full HLS proxy / no raw MP4 leak fix

If the browser was requesting a raw signed CDN `.mp4` segment like:

```txt
https://bcdnxw.hakunaymatata.com/...mp4?sign=...
```

that means the HLS playlist still had an unproxied segment/init URI somewhere. This build strengthens the HLS playlist rewriter so the browser only receives local proxy URLs for HLS assets:

```txt
/api/hls-proxy/<id>/asset?u=...
```

It now rewrites:

```txt
normal playlist lines
URI="..."
URI='...'
URI=unquoted
absolute http(s) URLs inside HLS tag lines
```

Debug rewritten playlist:

```txt
/api/hls-proxy/<id>/debug-master
```

The player still starts from:

```txt
/api/hls-proxy/<id>/master.m3u8
```


## Deep uploaded-source analyzer update

I re-scanned the uploaded `ScarperApi-zero` source and added the next major non-adult URL-finding path that was still missing: the XPrime extractor.

Local source-code ports now include:

```txt
VID / VideoEasy
Castle
TheMovie / MovieBox H5
TM / Vibuxer HLS unpacker
NetMirror
XPrime
```

New routes:

```txt
/api/local/xprime?id=11836&type=movie
/api/local/super-source-debug?tmdb=11836&type=movie
```

`/api/local/super-source-debug` runs every local source-code provider and reports candidate URLs, the winning embed result, and provider timing. It still avoids the hosted API docs server unless `USE_EXTERNAL_PROVIDER_API=true`.

Important URL places found in the uploaded API code:

```txt
streams[].url
data.videoUrl
data.sources
streamUrl
streams.hls4 / streams.hls3 / streams.hls2
sources[].file
downloadLinks[].url
serverLinks[].url
techLinks[].url
vcloudLinks[].url
zeeCloudLinks[]
hubcloudLinks[]
```

The HLS proxy still rewrites segment/init URI forms so the browser should load `/api/hls-proxy/<id>/asset?u=...` instead of raw CDN segments.

## Super deep URL finder pass

This build adds a generic local source-code style URL digger on top of the named provider ports.

It now scans strings deeply instead of only exact fields:

```txt
raw HTML/JS/JSON strings
escaped JavaScript strings
HTML entities
percent-encoded URLs
base64/base64url JSON payloads
q=/data=/url= nested payloads
packed/player script text
```

It also recursively fetches provider page/embed URLs up to a limited depth and looks for:

```txt
.m3u8
.mp4
.mkv
.webm
.mov
.avi
.ts
.m4s
URI="..." / src / href / data-src / file / source / streamUrl
window.location / location.replace / setAttribute("href"/"src")
```

New debug routes:

```txt
/api/local/deep-url-dig?url=<provider-page-or-embed-url>
/api/local/source-url-patterns
```

External API docs fallback remains disabled unless `USE_EXTERNAL_PROVIDER_API=true`.

## Ultra deep source engine

This build adds another source-code audit and URL discovery pass:

```txt
/api/local/source-audit
/api/local/source-url-patterns
/api/local/deep-url-dig?url=<url>
/api/local/super-source-debug?tmdb=11836&type=movie
```

New extraction logic now checks:

```txt
atob("...")
decodeURIComponent("...")
percent-encoded absolute URLs
escaped slash URLs like https:\/\/...
simple string concatenation
protocol-relative URLs
data-file/data-url/data-video/data-stream/data-hls attributes
iframe/source/video tags
relative media paths ending in .m3u8/.mp4/.mkv/.webm/.ts/.m4s
nested q/data/url/file/src/u/payload values
```

Title-based providers now try title variants:

```txt
Original Title
Clean Title
Title Year
No-leading-The Title Year
No-leading-The Title
Compact Title
```

The zip includes `SOURCE_ANALYSIS/scarper_source_audit.md` and `.json`, generated from the uploaded ScarperApi source code.

## More local URL providers when XPrime is down

This build adds a generic local source-code engine for more non-adult providers from `ScarperApi-main.zip`:

```txt
4khdhub
desiremovies
drive
hdhub4u
kmmovies
movies4u
moviesmod
uhdmovies
vega
zeefliz
zinkmovies
```

It follows:

```txt
search page -> detail page -> download/player/intermediate links -> deep media URL dig
```

New debug routes:

```txt
/api/local/download-sites-debug?tmdb=11836&type=movie
/api/local/download-sites-debug?q=The%20SpongeBob%20SquarePants%20Movie&year=2004
/api/local/download-sites-debug?tmdb=11836&type=movie&provider=movies4u,zinkmovies
```

Set `LOCAL_DOWNLOAD_SITES=false` to disable. If a mirror changes, set `PROVIDER_MOVIES4U_BASE_URL`, `PROVIDER_ZINKMOVIES_BASE_URL`, etc.

## Strict media filter fix

This build fixes the false-positive source bug where SwiflyTV treated non-video files as playable streams.

Blocked as playable:

```txt
site.webmanifest
xmlrpc.php
wp-comments-post.php
sitemap.xml
privacy-policy.html
terms-of-service.html
dmca.html
Telegram demo videos
social/share/admin/category pages
adult mirrors/categories
YouTube links
```

Allowed as playable:

```txt
.m3u8
.mpd
.mp4
.m4v
.webm
.mkv
.mov
.avi
.flv
.ts
.m2ts
.mts
.m4s
.fmp4
```

Intermediate links like `m4uplay`, `m4ulinks`, `magiclinks`, `modpro`, `zinkcloud`, `nexdrive`, `nextdrive`, `hubcloud`, `gdflix`, `cloud.unblockedgames`, and `tech.unblockedgames` are kept as candidate URLs for the deep extractor, but are not embedded directly.

## Local Consumet bridge

This build also uses the uploaded `api.consumet.org-main.zip` source pattern. It does not expose anything in frontend JavaScript. It adds a server-side bridge using `@consumet/extensions`.

New providers:

```txt
flixhq
sflix
goku
movieshd
fmovies
zoro
gogoanime
animepahe
```

New debug route:

```txt
/api/local/consumet-debug?tmdb=11836&type=movie
/api/local/consumet-debug?tmdb=11836&type=movie&provider=flixhq
/api/local/consumet-debug?q=one%20piece&type=anime&provider=zoro
```

Provider override examples:

```env
CONSUMET_ENABLED=true
CONSUMET_PROVIDER_ORDER=flixhq,sflix,goku,movieshd,fmovies,zoro,gogoanime,animepahe
```

## VidSrc scraper source-code bridge

This build ports the uploaded `vidsrc-scraper-main.zip` pattern into the single SwiflyTV `server.js`.

New debug route:

```txt
/api/local/vidsrc-debug?tmdb=11836&type=movie
/api/local/vidsrc-debug?tmdb=1399&type=tv&season=1&episode=1
/api/local/super-source-debug?tmdb=11836&type=movie
```

Render env options:

```env
VIDSRC_ENABLED=true
VIDSRC_PROVIDER_ORDER=https://vidsrc.xyz,https://vidsrc.in,https://vidsrc.pm,https://vidsrc.net
VIDSRC_TIMEOUT_MS=28000
VIDSRC_WAIT_MS=9000
VIDSRC_CONCURRENCY=2
```

Consumet install fix:

```json
"@consumet/extensions": "latest"
```

After deploying, clear Render's build cache or trigger a fresh deploy so `node_modules/@consumet/extensions` is actually installed.
