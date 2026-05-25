# SwiflyTV v120 Visual Hierarchy + Consistency Plan

## Goal
Keep the same dark streaming-app identity, but make the homepage easier to scan and less patched together.

## Applied principles
- Visual hierarchy: use size, contrast, spacing, grouping, and placement to guide attention.
- Consistent layout: repeat predictable row spacing and card families.
- Typography: keep headings strong, metadata quiet, and labels small.
- Motion/effects: effects should support hover and focus, not compete with the content.

## Card family rules
1. Feature card
   - Used only for the wide Spotlight module.
   - Biggest typography, biggest background, strongest action buttons.

2. Landscape card
   - Used for Continue Watching, Trending, trailers, and wide rows.
   - Always 16:9.
   - Uses subtle overlay and consistent progress/action buttons.

3. Poster card
   - Used for grids and movie library pages.
   - Taller poster format.
   - Less metadata visible by default.

## Studio rules
- Clean is the default effect.
- Cinematic is the normal premium look.
- Glow and Ultra are optional, not the default.
- Detail/Backdrop are quieter advanced groups.
- Layout presets should not break Continue Watching.

## Next possible v121
- Clean up Top 10 into a dedicated card family.
- Add skeleton loading states.
- Add empty-state cards for My List and Continue Watching.
- Add a TV Focus Mode that hides Studio while browsing.


## v121 additions

- Card clicks now open `/watch/...` directly instead of the details page.
- Details remain accessible through the new ⓘ button and detail page links.
- Details page now uses animated tab panels instead of one long stacked page.
- Row controls have a higher layer than row tags like LIVE.
- HLS/m3u8 player is visually upgraded:
  - cinema shell
  - top HUD
  - keyboard hint strip
  - polished Video.js control bar
  - better HLS.js fallback status
  - keyboard shortcuts: Space/K, F, M, arrows


## v122 HLS seekbar/player fix

- Added a custom m3u8 seekbar that uses the HTML video `seekable` time ranges.
- Enlarged the Video.js progress control hit area.
- Moved HUD/status overlays so they do not block scrubbing.
- Added better keyboard seek behavior for VOD and HLS DVR windows.
- Custom seekbar supports VOD duration and live/DVR seek windows.


## v123 Plyr + HLS.js player refresh

Research-backed change:
- Use Plyr for the visible player UI because it is simpler, accessible, and cleaner-looking than the current rough custom/Video.js mix.
- Use hls.js behind Plyr for m3u8 playback in browsers that need MediaSource.
- Keep native HLS fallback for browsers that support it.
- Add a Plyr settings menu with quality options based on HLS levels when available.
- Hide the custom precision seekbar when Plyr is active so the player looks cleaner.


## v124 UI Stabilizer

- Introduced clearer z-index layers.
- Ensured decorative badges do not block row arrows or card controls.
- Stabilized Plyr sizing and mobile controls.
- Hid duplicate/custom seek UI when Plyr is active.
- Reduced player overlay clutter.
- Made detail tabs and trailer cards more stable.
- Added defensive cleanup for old Plyr wrappers between loads.


## v125 Media Chrome Cinema Player

- Uses Media Chrome web components for the visible movie-player UI.
- Keeps hls.js underneath for m3u8 playback.
- Adds SwiflyTV-native controls:
  - big center play
  - 10 second back/forward
  - large timeline
  - time displays
  - mute/volume
  - captions
  - speed
  - PiP
  - fullscreen
- Adds custom quality menu powered by hls.js levels.
- Keeps native video fallback if Media Chrome fails to load.
- Keeps keyboard shortcuts: Space/K, J/L, arrows, M, F, C.


## v126 Video.js Cinema Player

User requested Video.js.

- Removed the Media Chrome startup path.
- Uses Video.js 8 as the visible player.
- Uses Video.js VHS for HLS/m3u8 playback.
- Adds custom Swifly overlay play and skip controls.
- Adds custom Video.js skip buttons in the control bar.
- Adds quality menu using VHS representations when available.
- Keeps custom HLS seekbar as an extra timeline helper.
- Keeps keyboard shortcuts: Space/K, J/L, arrows, M, F, C.


## v127 Video.js Modern Player Cleanup

- Removes the giant custom seek overlay for Video.js.
- Keeps the Video.js native progress bar as the main timeline.
- Makes the HUD/status card smaller and auto-hidden once playing.
- Center controls show mainly when paused/loading, not constantly on hover.
- Video.js control bar is shorter, cleaner, and more modern.
- Quality menu is smaller and moved closer to the control bar.


## v128 Video.js Modern Skin Refresh

Research notes:
- Video.js official skin guidance says the base skin is CSS-based and should be customized with CSS overrides.
- Video.js components can be extended and registered, so the 10-second buttons should remain as real Video.js controls.
- VHS provides HLS/m3u8 support and exposes representations that can be used for a quality menu.

Implemented:
- Cleaner Video.js-first skin.
- More modern bottom control bar.
- Better progress bar/thumb styling.
- Better menu styling.
- Smaller HUD/status card.
- Cleaner Quality button with label/value.
- Keeps custom skip controls as Video.js components.


## v129 Video.js Minimal Modern Player

Fix direction:
- Stop registering custom Video.js components because that can fail on some Video.js 8 CDN builds and break setup.
- Hide the custom overlay play/skip controls.
- Use Video.js's real big play button and control bar.
- Keep keyboard shortcuts for seeking.
- Keep Video.js VHS for m3u8.
- Skin the native Video.js UI with modern CSS instead of stacking extra UI on top.


## v130 Video.js Simple Modern Player

Goal:
- Make the player more simple and modern without adding big new UI.
- Keep Video.js/VHS as the main player and HLS layer.
- Use CSS overrides on Video.js controls instead of extra overlays.

Changes:
- Smaller play button.
- Slimmer control bar.
- Thinner timeline.
- Hidden title HUD.
- Smaller status toast.
- Smaller quality pill.
- Less glass/blur over the video.
- Responsive/mobile simplification.


## v131 Video.js Timeline Fix + Compact Modern Skin

Fixes:
- The Video.js progress/timeframe bar was too short because `.vjs-progress-control` also has `.vjs-control`, and a generic control width rule was forcing it to icon width.
- Adds a final high-specificity CSS layer that makes `.vjs-progress-control.vjs-control` full width inside the dock.
- Replaces the flat bottom controls with a compact floating dock.
- Keeps UI simple: no big overlay buttons, no extra custom timeline.


## v132 Video.js Soft Rectangle Play Button

Fix:
- The circular Video.js play button looked too cheap/old.
- Replaces it with a small soft rounded rectangle/pill button.
- Keeps the player minimal and modern.
- Keeps v131 timeline width fix.


## v133 Video.js Hover Preview + Menu Fix

Fixes:
- Play icon was off-center because Video.js positions the icon pseudo-element separately.
- Playback speed menu disappeared when moving from the button to the menu.
- Playback speed menu overlapped the progress/timeline area.
- Video.js MouseTimeDisplay/TimeTooltip is now styled as a modern time preview.


## v134 Video.js Speed Menu + Real Hover Preview Fix

Fixes:
- Built-in Video.js playback-rate menu was hidden below the embed.
- Built-in Video.js hover tooltip was not reliably visible with the compact dock.
- Removed the built-in playbackRateMenuButton from the control bar.
- Added a custom Speed pill positioned above the dock.
- Added a custom timeline hover preview using the progressControl bounds and the player's seekable range.


## v135 Video.js Volume + Image Preview Fix

Fixes:
- Built-in Video.js volume hover was unreliable near the timeframe.
- Removed built-in volume control from the visible control bar.
- Added custom Volume pill and slider above the dock.
- Added an image-style timeline preview.
- Preview uses a muted preview video clone when possible.
- Falls back to a clean visual/time preview if the frame cannot load.


## v136 Video.js Pill Dock Skin

Reference target:
- One rounded pill-shaped control dock.
- Controls inline in one row.
- Play, time, progress, duration, speed, volume, PiP, fullscreen.
- No oversized custom overlays.
- Preview remains above the dock.

Implementation:
- Reordered Video.js control bar children so progress is inline between current time and duration.
- Added a final CSS layer that turns the control bar into a translucent rounded pill.
- Repositioned custom speed/volume/quality controls inside the visual dock area.
- Kept the v134 visual timeline preview.


## v137 Video.js Native Custom Dock

Fix direction:
- The Video.js controlbar was fighting CSS from many previous patches.
- Instead of continuing to stretch/reorder built-in controls, v137 hides the Video.js controlbar and uses a single custom Swifly dock.
- Video.js/VHS still owns HLS/m3u8 playback.
- Custom dock uses player/video APIs for:
  - play/pause
  - ±10 seconds
  - current/duration
  - seeking
  - speed
  - mute/volume
  - PiP
  - fullscreen
- Keeps image/time hover preview above the dock.


## v138 Preview Warmup Fix

Why not preload the entire m3u8:
- HLS is segment-based and adaptive; browsers and hls.js are designed to buffer around playback position, not download the entire asset into memory up front.
- Preloading an entire movie-sized HLS stream would be slow, expensive, and unreliable.

Implemented instead:
- Preview HLS uses autoStartLoad:false and calls hls.startLoad(targetTime) near the hovered timestamp.
- Preview video is muted and briefly played/paused to force frame decoding.
- Preview warmup samples several timestamps after the player loads.
- The preview box shows a shimmer/loading fallback until a real frame is decoded.


## v139 Clean Icon Dock

Fixes:
- Removed the clunky blue progress thumb.
- Replaced emoji/text dock controls with clean inline SVG icons.
- Icons now better match the simple Video.js reference style.
- Play icon is centered.
- Rewind/forward 10, volume, PiP, and fullscreen are SVG-based.
- Kept v138 preview warmup and v137 custom dock architecture.


## v140 Home Hero Trailer Autoplay Fade

Goal:
- Make the main home hero feel more like Netflix.
- Keep the current poster/backdrop behind the movie name first.
- Then fade into the muted trailer behind the same text/actions.

Implementation:
- Home page fetches `/movie/{spotlight_id}/videos` from TMDB.
- Picks the best YouTube trailer/teaser using existing `pickBestTrailer`.
- Adds a muted looping YouTube iframe behind the hero content.
- CSS holds the poster first, then fades the trailer in after a short delay.
- Mobile and reduced-motion users keep the poster-only hero.


## v141 Player Fit + Single Fullscreen + Preview Fix

Fixes:
- The m3u8 video now uses `object-fit: cover` so it fills the full player area.
- Fullscreen now fires on `pointerdown`, which keeps it inside the user's activation event and avoids needing a second click.
- Added fullscreen fallbacks for webkit/MS APIs.
- Timeline preview now listens on the progress wrapper and the range input, not only the tiny slider control.
- Preview visibility is forced above the dock with a final CSS layer.


## v142 YouTube Error 153 Referrer Fix

Problem:
- Trailers showed "Watch video on YouTube / Error 153 / Video player configuration error".
- A YouTube watch URL like `https://www.youtube.com/watch?v=...&source_ve_path=...` was being treated too loosely in some places.
- Helmet can emit a restrictive Referrer-Policy if not configured, which breaks YouTube embedded player identity.

Fixes:
- Helmet now sends `Referrer-Policy: strict-origin-when-cross-origin`.
- Page shell now includes `<meta name="referrer" content="strict-origin-when-cross-origin" />`.
- YouTube iframes now use `referrerpolicy="strict-origin-when-cross-origin"`.
- Removed `referrerpolicy="no-referrer"` from trailer iframes.
- Removed sandbox from YouTube trailer iframes.
- YouTube helper now extracts IDs from normal watch URLs, youtu.be URLs, embed URLs, shorts URLs, or raw IDs.
- YouTube embed URLs now include `origin` and `widget_referrer` when an origin is available.
- Added `YOUTUBE_EMBED_ORIGIN` env option for Render/custom domains.


## v143 Hero Trailer Visibility + Mute Toggle

Changes:
- The home hero trailer now fades in stronger with higher opacity.
- The poster still appears first, then dims further once the trailer fades in.
- The glass veil is lighter so the trailer feels more visible.
- The mute icon next to the age rating is now a real button.
- The mute button loads the YouTube IFrame API and controls the hero iframe with `mute()`, `unMute()`, `setVolume()`, and `playVideo()`.
- The button label/icon updates between muted and unmuted states.


## v144 Hero Trailer No Play Overlay

Fix:
- The YouTube play/pause overlay was visible in the autoplay hero trailer.
- YouTube iframe internals cannot be directly styled from the parent page.
- Instead, v144 hides the trailer layer until the YouTube IFrame API reports `PLAYING`.
- Once playing, the trailer fades in; before that, the original poster/backdrop remains visible.
- Added `disablekb=1`, `fs=0`, and `iv_load_policy=3` to the autoplay hero embed.
- Kept the v143 mute/unmute button beside the age rating.


## v145 Remove Streaming Made Simple Badge

Change:
- Removed the small `Streaming made simple` eyebrow badge from the home board section.
- Kept the main heading, paragraph, action buttons, and three feature cards.
- Added a tiny title spacing cleanup so the section still feels intentional.


## v146 Remove Home Board + Fix Autotrailer Visibility

Fixes:
- Removed the entire old home board section, not just the `Streaming made simple` badge.
- Removed the Browse Movies / Browse TV / Watch Parties block from that board.
- Removed the 01 / 02 / 03 cards from that board.
- Fixed the hero trailer staying invisible when YouTube did not fire `PLAYING` reliably.
- The trailer now has a fallback reveal after a short delay while still using the IFrame API when available.
- Kept the poster-first fade behavior.


## v149 Vidstack m3u8 Player

Direction:
- Use Vidstack for the m3u8 player.
- Use Vidstack Default Layout first.
- Make it Swifly-styled with CSS.
- Keep the existing m3u8 proxy/resolver endpoint.
- Remove the broken custom Video.js dock from the active player path.

Implementation:
- Starts from v146 because it was the last stable home-page/trailer baseline before the messy v147/v148 player attempts.
- Adds `loadVidstackAssets()` using Vidstack CDN styles and with-layouts module.
- Replaces `startVideoJsCinemaSource()` with a Vidstack-backed player creator.
- Keeps the same `src` passed into the player, so the existing proxy URL/m3u8 resolver path remains untouched.
- Hides/removes the old Video.js/custom dock UI in the active player state.
- Provides native-video fallback if Vidstack fails to load.
