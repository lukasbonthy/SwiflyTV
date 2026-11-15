# SwiflyTV experience overhaul

## Intent
Implement the user's November 13 request in the existing Node/Express, React/Vite-enhanced application. Preserve the latest iPad artwork/scroll fixes and existing account, playback, accessibility, controller, library, and room behavior. The user has authorized direct implementation and previously requested no repeated approval stops.

## Requirements
- Poster/movie actions remain clear before, during, and after scrolling.
- Player ripples have no forced green; all regions follow readable movie frame colors continuously, including during a wave. Extend below the film into its title/header. Protected frames use neutral colors, bounded sampling and rendering remain.
- Source resolution and video metadata smoothly reshape the player to the real aspect ratio. Animate container geometry without stretching film pixels, prevent stale-source resize, respect reduced motion and fullscreen, and preserve source-finding artwork until playback.
- Fix thin artwork seams and clipped edges during the background details zoom, preserving fixed navigation and the latest iPad featured-image fixes.
- Improve person and language browsing pages and useful details hover/focus feedback. Replace heavy episode glass with an opaque lightweight, responsive episode browser, with actual metadata, season navigation and usable controls.
- Study should resemble the user's own lofistudy.to reference project: scenery first, restrained floating controls and reachable music/timer/tasks/rooms tools, with existing real functions preserved.
- Watchroom Community should make channels, people, messages, recommendations and the route into watching together useful. Preserve authorization and real data, never fake activity.
- Pagination must advance upstream data and retain filters. Curate distinct discovery rows with canonical type+id deduplication and ample results. Add popular/trending movie periods with accurate day/week/all-time semantics and links.
- Audiobook search must work for normal title/author queries and URL navigation, exclude entries with no playable chapters, and offer an attractive scenic reading/listening space with usable playback and errors.
- Kids gets playful colorful visual design, a parent password setup/lock/unlock flow, positive conservative rating verification and protected route/API/playback access while locked. No client-only restriction or unverified title fallback. No password or secret is logged or committed.

## Choices
Extend the established app and split new responsibilities into focused modules rather than rewrite the shell. Native scrolling stays. No added paid services, no replacement authentication, no playback provider changes. Use the user's lofistudy.to repository as the authoritative study reference. Static scenery should use existing first-party assets wherever possible. Verify desktop, 320/390px phones, iPad and reduced motion. A fresh whole-change review and actual browser verification are required before publication. Shipping elapsed time is determined by completion and evidence, without artificial delays.

## References
- Current source: main a6b91632ea39f2b68bc257a05011520fca8542b7; deployed code 5b5cd54beff34f0ce11d725c64e31177ddc321ad.
- User reference repo: https://github.com/lukasbonthy/lofistudy.to
- Movie period semantics: https://developer.themoviedb.org/docs/popularity-and-trending
- Production: https://swiflytv-1.onrender.com (existing Render auto-deploy from main).
