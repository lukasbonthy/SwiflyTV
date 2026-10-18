# Party Hub shows and optional watchroom calls

The user wants TV shows visible in Party Hub and optional live cameras and microphones in watchrooms. Preserve synchronized host-led movie/episode playback, the existing liquid glass, TV mode, profile-local resume, and episode navigation.

## Shows

Keep existing movie suggestions and typed search. Add a separate six-card TV-show section to the lobby, backed by `/api/social/media/featured?type=tv`. Each show card uses its media type as well as its ID, loads the existing season/episode picker, and creates or updates a room with the chosen episode. Include a TV catalog link, loading/error/empty recovery, accessible labels, and mobile sizing. Equal movie and show IDs must not collide. Existing movie endpoints stay compatible.

## Calls

Add a shared call panel to the Party Hub native room and standalone player watch party. A person explicitly joins the call to listen, then can independently enable the microphone and/or camera. No device request on page load, room join, call join, or reconnect. A visible description explains that enabled devices are shared with people in this watchroom. Leave call does not leave the watchroom. Both devices begin off for every new call.

Use native WebRTC peer connections and the existing Socket.IO connection for signaling. Limit a call to eight participants. Offer collision handling follows perfect negotiation; serialize per-peer signaling and queue early ICE. Use restrained 640x360, 15fps video and echo-cancelled audio. Local video is always muted and inline; remote playback failures offer an explicit sound-unlock action. No recording or new paid service.

The server admits only actual members of the same watchroom, derives display names from room membership, generates a fresh session ID for each call join, validates sender and recipient call sessions, bounds SDP/ICE and message rates, and relays only to the named recipient. Calls never grant playback-host privileges. Roster entries are `{id,name,sessionId,audio,video}`. Join and roster updates are scoped by room ID. A call state contains booleans only, never media.

### Protocol

- Client `watchroom:call-join {roomId,requestId?}`; server `watchroom:call-joined {roomId,selfId,sessionId,iceServers,maxParticipants,members,requestId?}`. The new client supplies a unique requestId (maximum 96 characters) for every attempt and accepts only its matching acknowledgement. Legacy callers may omit it.
- Server `watchroom:call-members {roomId,members}` on membership/device changes, and to newly joined room sockets.
- Client `watchroom:call-state {roomId,sessionId,audio,video}` updates its own roster state.
- Client `watchroom:call-signal {roomId,sessionId,to,targetSessionId,description? ,candidate?}`; server relays `{roomId,from,sessionId,targetSessionId,description? ,candidate?}` to the verified recipient. Exactly one signal kind per message. Description type is offer or answer. SDP max 64 KiB; candidate max 2048 characters. Session IDs must match both live records. Ignore stale messages.
- Client `watchroom:call-leave {roomId,sessionId}`; server `watchroom:call-left {roomId,sessionId}`. Emit `watchroom:call-error {roomId,code,message,requestId?}` for rejected joins/operations; do not echo SDP, ICE, or secrets.

`lib/watchroom-calls.js` exposes `createWatchroomCalls({io,watchRooms,env})` returning `attach(socket)`, `leave(socket)`, `sendMembers(socket)`. `leave` runs before the parent watchroom membership is cleared, including room switch/disconnect. ICE configuration defaults to a public STUN endpoint and accepts deployment-provided `WATCHROOM_ICE_SERVERS` JSON with optional TURN credentials. No public relay credentials are invented. Restrictive networks can require TURN; document that operational requirement.

`ui/watchroom-call.js` exports `watchroomCallMarkup()` using a `[data-watchroom-call]` root. `public/party/watchroom-call.js` exposes `window.SwiflyWatchroomCall.mount(root,{socket})` returning `setRoom(roomId)`, `leave()`, `destroy()`. The parent calls `setRoom` only after `watchroom:joined`, and clears it when leaving. Shared assets load before the parent party scripts. The panel owns only its DOM/media and socket handlers, never the movie player or its audio.

## Lifecycle and UI

Stop and release local tracks immediately on device off, call leave, room switch, disconnect, pagehide, or destroy. Switching to Community ends the room call so enabled devices never continue behind hidden call controls. Late permission resolutions must stop their tracks rather than resurrect an old call. Pending permission requests can be cancelled by leaving. Device-ended events update controls and roster. On BFCache return, the call is inactive and devices stay off. Close peers and detach remote media on participant departure; do not rebuild focused controls on roster updates. Show useful permission, unsupported-browser, capacity, connection, and sound-unlock states.

Place compact participant tiles beneath the player without changing the stage or transport geometry. On standalone pages, move the shared panel into the main player column before title details; keep it outside the fixed-height chat sidebar and keep the chat composer visible. Episode Previous/Next controls remain above the call panel. Use native accessible buttons with current Mic/Camera state and pressed semantics. Keep 44px targets, narrow-screen horizontal tile scrolling, reduced-motion support, and TV-mode readability. Call controls must not inherit playback shortcuts.

## Verification

Prove server isolation and validation with socket tests, device permission/cleanup races with DOM tests, and actual two-context WebRTC with Chromium fake devices. Exercise simultaneous negotiation, camera toggling, peer departure, audio-only and camera-only paths, default-off behavior, reconnect and BFCache behavior. Verify the existing movie/show playback and party suite, responsive layouts, full regression suite, and syntax checks before publishing. Compare published git tree and live asset bytes to the tested versions.
