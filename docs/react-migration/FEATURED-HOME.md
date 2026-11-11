# Featured Home and remaining mobile paint

The user still feels some mobile lag and wants Home to rotate featured movies like ShuttleTV, including the artwork-colored glow fading into the movie rows. Keep premium scrolling, original styling, seven desktop posters, the original backup, and the existing mobile motion improvements. Motion blur remains off while rendering work can be reduced.

Reference observed at shuttletv.pk (the current redirect from shuttletv.su): five horizontally sliding features, a 700ms cubic-bezier(.25,.1,.25,1) track transition, previous/next and five position controls; the artwork spill crossfades over 1000ms. Preserve SwiflyTV's layout and controls while matching this behavior.

Home selects up to five unique valid movies from its already-fetched curated, trending, popular, now-playing and top-rated data. No extra metadata requests. Render the first hero normally, with a safely serialized inert JSON payload and accessible controls. Keep the exact `.dsHero + .svHeroLightBridge + .dsContent` sibling relationship and the same real Play, Details and My List nodes.

A Home-only deferred controller prepares the next image before movement and retains two artwork and glow slots. Use transform-only horizontal movement for artwork/copy at 700ms; an inert outgoing copy snapshot has no active optics, IDs or actions. Update the real controls and scoped library/resume decorations before movement. Reserve title/description/action geometry to avoid shifting rows between movies.

Prepare a tiny blurred 64x36 glow texture once per artwork, ahead of movement, with at most five tiny cached glow textures (separate from the two display-image preparations). Crossfade the two prepared textures over 1000ms; do not animate CSS blur, hue or gradient channels, and never sample pixels during animation. Use cached palette gradients as a graceful fallback. The active palette source also updates existing Studio adaptive cinema/loader artwork. Retain reduced-transparency/Xbox behavior.

Advance automatically after eight seconds at rest. Previous/next, position buttons, pause/resume and deliberate horizontal swipe work on phones. Pause future advancement offscreen, while hidden, during page scrolling or open dialogs, and for keyboard interaction. Reduced motion/TV uses immediate manual selection and no autoplay. Preparation failure keeps the previous movie intact; cancellation and rapid input cannot commit stale images. Clear timers, observers and temporary nodes on destruction/page lifecycle.

The remaining mobile poster controls use 10px blur even during movement. Keep their current dark fill, edges, icons and hit targets, but suspend those individual backdrop filters during touch/narrow-screen scrolling, sheet motion and featured motion; restore at rest. This removes extra moving sampling layers without changing the resting material.

Implementation choices above are the builder's calls within the user's request. Permanent removal of glass would change the resting design; motion blur would add work. Preparing two slots and reducing active filters preserves the requested appearance and motion with a bounded graphics budget. Physical phone FPS remains unmeasured.

Verification: nine deterministic server/controller regressions cover safe Home data, persistent action identity, stale and failed image handling, finite snapshot motion, pause/resume, bounded auto retries and cancellation generations. Independent code review found no remaining Critical or Important blockers. Browser rendering and physical phone FPS are verified separately; no physical-FPS claim is made.
