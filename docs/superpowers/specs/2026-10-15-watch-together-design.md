# One SwiflyTV watch experience

The current user feedback is that the Party Hub, Watch Together and player controls still look disconnected and poor. Fix the causes: duplicated player implementations and controls, conflicting legacy CSS, and a lobby with repeated actions and oversized sections. Build on merged c441849 and preserve the verified movie and episode sources.

Use a quiet charcoal canvas and the existing navigation's neutral glass, bright film art, Host Grotesk, fine silver edges and restrained lilac light. Clear actions, fewer nested boxes, generous type and a deliberate compact control bar. Use finite transitions, reduced-motion support, solid fallbacks and visible focus. Keep video frames stationary.

## Components and boundaries

- Movie, episode and direct-media Party Hub playback use the same actual SwiflyPlayer controller and stage markup. Add an embedded player renderer/controller entry point where needed. Preserve room protocol, host-only seeking/playback for catalog movies, honest manual controls for direct links, local volume, async source cancellation, buffering/error recovery and native/HLS/DASH support. YouTube and external embeds remain separate supported media types.
- Lobby: one clearly grouped host/join area, actual selected film and discoverable film choices, compact real room directory. Keep existing IDs and form/service contracts. Do not hide usable hosting behind unnecessary setup or repeated CTAs.
- Watch Together dialog and room chat: matched typographic hierarchy, same form/action/control styles, useful status and members, accessible dismissal and keyboard handling. Simplify presentation without losing existing room behavior.
- Retire duplicated Party Hub rules in experience.css. Each owned component stylesheet should define its component once instead of appending another competing theme. New player controls should avoid generic legacy button classes when these cause collisions.
- Older link/tab-sharing watchroom presentation must match the same language; retain its functional tools and source protocol.

## Validation

Add behavioral regressions for shared embedded playback, room permissions/lifecycle and any control behavior changes. Use actual controller fixtures, not tests mirroring markup. Run the complete suite and syntax checks. Inspect settled UI at 1440, 768, 390 and 320 pixels, plus actual loading/paused/playing/buffering/error/settings and room host/guest states. Use automated Chromium component fixtures with actual production markup and controllers; inspect production in the cloud browser when authenticated access is available. Do not alter login/security to access a preview. Preserve source delivery and verify deployment after CI.
