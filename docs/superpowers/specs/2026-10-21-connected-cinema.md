# Connected cinema

Build the requested social, discovery, listening and player features on SwiflyTV's existing Express app. Preserve permanent liquid navigation, dark poster actions, native touch scrolling and the existing watchroom host authority.

## Accounts and social

Use server accounts with scrypt password hashes and revocable HttpOnly sessions. Keep browser session data only as a UI compatibility cache, never as authorization. Existing browser profiles can be imported after signing up; do not silently claim an email from a local record. Use PostgreSQL when DATABASE_URL is configured, or an atomic private file under SWIFLY_DATA_DIR for a single persistent server. Production on Render must not silently accept durable account data on its ephemeral filesystem. No paid resource is provisioned by this change.

Friends are found by public handle, accepted explicitly, and can exchange private text, movie/series cards and watchparty invites. Only participants can read a conversation; only accepted friends can send. Unfriend/block stops messages and hides presence. Friends can see a current title only when its owner enables watching activity. Presence expires after 90 seconds, and stops when playback pauses or the page closes. Persist notifications, unread state and conversations. Real time delivery uses one idle EventSource connection, no polling or animation loop.

Two people can join a shared home using a single-use expiring invitation. Each retains their own identity, messages, profiles and progress. The home has a shared title list, can make recommendations from both tastes, and either member can leave. Limit homes to two accounts. Never share passwords or private messages implicitly. Account state synchronizes personal browser profiles, lists and progress between devices; joining a home does not overwrite that state.

## Discovery and listening

Replace the compact search popup with an accessible keyboard-operated search panel: debounced results, movie/series/people/book filters, recent searches, empty/error/loading states and native full-search submission. No searches run while closed. Preserve current search IDs and native form semantics for TV controls.

AI picks use the freely available Apache-licensed MiniLM sentence model in a module worker, downloaded only on an explicit request. Rank real TMDB candidates against a mood prompt and optional personal/shared taste. Never label fallback popular results as AI. Support cancellation, progress and retry without blocking the main thread. No paid API or account key is required.

Add a LibriVox audiobooks page with real catalog search, details, chapter playback, resume, speed and sleep timer. Cache upstream results, validate remote URLs, and render upstream descriptions as text.

## Playback and atmosphere

Use IntroDB's verified segments for recap/intro skipping. Hide the action where metadata is missing. A next-episode card appears during the final 30 seconds, counts playback seconds, pauses with video, can be dismissed, and obeys a persistent autoplay preference. It follows existing episode navigation, including season boundaries. Watchparty guests cannot skip or advance the room; host actions go through existing synchronization.

Identify a song on demand from a bounded 12-second sample of the currently playing film audio, without using the microphone. Use a ShazamIO worker installed in Docker, bound concurrency and timeout, and show a genuine no-match/unavailable result. Do not accept a source URL from the client. Release recording work on cancellation, source change or navigation.

Restore a subtle transform-only CSS aurora animation while live/in view. Pause for hidden pages, offscreen backgrounds, explicit still preference and reduced motion; never toggle navigation glass. Keep animated layers bounded and avoid a permanent JavaScript frame loop.
