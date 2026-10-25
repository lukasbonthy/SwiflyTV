# Requested update-list coverage

Existing working behavior was retained and missing behavior added to SwiflyTV. References to ShuttleTV in the supplied announcement were treated as product examples.

| Requested update | Implementation |
|---|---|
| Upcoming Episodes | Actual next-airing metadata for bounded saved/recent series on Home; Studio visibility/order. |
| Recommended for You, not AI | Ordinary TMDB recommendations from real saved/watched seeds, named reason, deduplication/exclusions and honest empty/error states. |
| List filtering/tabs | Saved, Liked, History and Continue; movie/series, search, sort, folders and actual resume/progress/completion. |
| Trakt link/sync | Server-private OAuth PKCE/refresh/unlink, automatic watchlist/watched deltas and explicit paginated import, preserving local concurrent changes. Deployment credentials required. |
| New episode bell/read | Distinct episode bell, stable episode IDs, profile-scoped read state, visible-panel acknowledgement and hide preference. Social notifications retained. |
| Downloads | Existing verified movie/episode file discovery and downloads retained. External provider availability remains external. |
| Skip Intro | Actual TheIntroDB V4 windows plus legacy coverage fallback, multiple windows and contribution link; opt-in automatic intro skipping with readiness/host guards. |
| Prioritize last server | Only a successfully ready recognized provider is remembered per account/profile/device; bounded next-episode attempt falls back to default discovery. |
| Episode view/sort | Actual season metadata, grid/row preference and newest/oldest order in details and native player picker. Future episodes are labelled rather than given false download/play actions. |
| Cast and filmographies | Existing cast links retained; complete deduplicated credits accessible through 36-item pages rather than truncated rails. |
| Accent colors | Purple/Blue/Red/Green/Orange/Pink/Cyan plus legacy choices and custom HEX, shared UI/player/Aurora tokens. |
| Watchlist folders | Real create/rename/delete, membership and folder filtering per profile. |
| AI Mood Search | Existing BGE on-device story matching and complete form preserved; no new paid dependency. |
| Shuffle Play | Explicit Discover Surprise Me with movie/series/both, rating, genre and date filters, real catalog results and Details/Play actions. |
| Mobile navigation | Existing top/bottom pattern retained; six configurable routes and essential account/search controls fit responsive layouts. |
| Content ratings | Actual US movie/TV certifications with family/teen/mature severity colors; unknown ratings shown honestly. |
| Continue Watching | Durable completion separate from resume, actual next-aired episode lookup, two-week dim/time badge and normal exact-time resume. |
| History | Profile-scoped watched/history with movie/series filters, actual progress/completed state and resume. |
| Spoiler mode | Episode names/stills/plots, detail/home/TV plot text and accessible labels protected, with original state restored when disabled. |
| Hide watched | Completed title/episode dimming and Watched badges without marking an entire series complete after one episode. |
| Reduce motion | Existing OS/user motion behavior retained and device policies integrated. |
| Notification preferences | Episode bell preference independent of social notifications and Studio HUD presentation. |
| Search filters/sorting | Movie/series, minimum rating, year bounds and relevance/rating/date with native GET, live updates and Back restoration. Rating/date sorting refine the current upstream result page, as labelled. |
| Personalized Home | Real recent movie/series history prioritizes that format when the Studio order is default; explicit Studio order remains authoritative. |

See `STUDIO_v2.md`, `study.md`, `library.md`, `feed.md`, `trakt.md` and `player-assist.md` for operation, limits and API details. No production merge or deployment is part of this branch.
