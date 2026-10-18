# Party shows and calls implementation plan

> **For agentic workers:** Use executing-plans for the assigned task and complete its red/green checks. Independent domains are delegated under dispatching-parallel-agents; the parent integrates and reviews the whole change.

**Goal:** Make TV shows discoverable in Party Hub and provide optional camera/microphone calls inside existing watchrooms.

**Architecture:** Shared native WebRTC call UI uses the existing Socket.IO membership service. TV suggestions reuse the existing season/episode selection flow. Keep call state and media separate from synchronized playback.

**Tech stack:** Node/Express, Socket.IO, native browser WebRTC, existing CSS, node:test, JSDOM, Chromium.

**Spec:** `docs/superpowers/specs/2026-10-18-party-shows-calls-design.md`.

## Global constraints

- Devices begin off and only request permission on individual device activation.
- Eight call participants maximum; 640x360 at 15fps camera capture.
- Never record media or alter playback/party-host permissions.
- Derive sender identity from current room and call membership; validate both session IDs.
- Release all local/remote media on leave, disconnect, switch, pagehide and destroy.
- Keep existing endpoints and assets compatible; version changed browser files.

## Review focus

- Late permission resolution after leave must stop tracks and leave controls off.
- Same numeric ID for movie/show must select the correct type and episode.
- Simultaneous peer offers and early ICE must still establish media.
- A socket in another room or a stale call session must never receive signaling.
- New call controls must not toggle or seek the underlying movie.

### Task 1: Party Hub shows

**Files:** `ui/party.js`, `public/party/party.js`, `public/party/party.css`; new focused TV hub tests.

**Interface:** Consume `/api/social/media/featured?type=tv` returning `{ok:true,results:[partyMediaMetadata]}`. Use existing `/api/social/media/tv/:id` for episodes. Keep existing movie map and hero behavior intact.

- [x] Write and run failing UI tests for a visible TV section, same-ID movie/show picks, episode selection and retry.
- [x] Add six TV cards and wire typed selection through existing picker/create handlers.
- [x] Pass focused hub/movie/TV tests; report touched files without committing shared work.

### Task 2: Server call signaling and TV suggestions

**Files:** new `lib/watchroom-calls.js`, `server.js`, new call socket tests; TV featured endpoint tests.

**Interface:** Implement the spec's exact events and `createWatchroomCalls({io,watchRooms,env})` service. Add the six-item TV featured endpoint using existing metadata normalization.

- [x] Write failing socket tests for joins, state, peer-only relay, cross-room/stale rejection, leave/switch/disconnect, malformed payload limits and capacity.
- [x] Implement service and lifecycle hooks, including guarded ICE configuration.
- [x] Add TV endpoint tests for filtering adult/invalid metadata, type and upstream failure.
- [x] Pass scoped tests; do not change UI files or asset versions owned by the integrator.

### Task 3: Shared call UI and WebRTC runtime

**Files:** new `ui/watchroom-call.js`, `public/party/watchroom-call.js`, `public/party/watchroom-call.css`; `ui/watch-party.js`, `public/player/watch-party.js`; new call DOM/browser tests.

**Interface:** Export `watchroomCallMarkup()` and `SwiflyWatchroomCall.mount(root,{socket})` returning `setRoom(roomId)`, `leave()`, `destroy()`. Consume exact server events from spec. Integrator handles Party Hub wiring and server asset inclusion.

- [x] Write failing behavioral tests for inactive default, independent activation, permission denial, late-grant cleanup, device off, peer departure and disconnect.
- [x] Implement perfect negotiation, serialized signals, queued early ICE, stable DOM and inline muted local preview.
- [x] Add standalone watch-party markup/lifecycle integration with no player keyboard collisions.
- [x] Pass two-context Chromium actual media test with fake devices, including simultaneous device activation, camera off/on and late join.

### Task 4: Integrate, review and publish

**Files:** Party Hub lifecycle hooks, server asset lists, package syntax checks, CI browser list, focused rendering tests and operator notes.

- [ ] Add shared call panel beneath Party Hub's stage, set room only after server join, clear it on leave/switch/disconnect/pagehide; keep devices off on BFCache restore.
- [ ] Version changed assets and include new runtime/CSS before parent scripts; document optional TURN deployment configuration.
- [ ] Check mobile/desktop/TV controls, same-ID show selection, episode navigation and existing playback shortcuts.
- [ ] Review all changes, fix confirmed defects, run `npm run check` and `npm run test:ui -- --test-concurrency=4`.
- [ ] Publish the exact tested tree through GitHub, wait for checks, merge with expected-head protection, compare deployed asset bytes and verify public UI.
