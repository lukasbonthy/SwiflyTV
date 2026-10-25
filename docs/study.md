# Swifly Study

Study is a native SwiflyTV page at `/study`, with ordinary room links at
`/study/room/:slug`. It uses the shared site shell, account lifecycle, Studio
settings and Socket.IO server. There is no iframe, separate app or background
presence polling.

## Music, scenes and atmosphere

The collection contains all 19 HoliznaCC0 tracks, with real local MP3 files,
metadata durations, search, stations, favorites, shuffle, repeat, seeking,
mute and volume. Playback starts through an explicit action. Errors appear in
the page status. Seven local scene loops have their original posters; reduced
motion and lightweight Studio settings pause scene video and visible rain.
The four ambient channels synthesize rain, room tone, vinyl texture and distant
thunder through Web Audio. Saved mixes remain silent until started.

PNG, JPEG, WebP and GIF images up to 12 MB can be imported locally. Object URLs
are never stored or shared and are revoked on profile change or teardown.
The current scene can be downloaded. Balanced, scenic and timer-first layouts,
clock visibility, night mood, fullscreen and an escapable focus view are real
page controls. Small screens adapt the scenic layout to keep controls usable.

## Personal focus tools

The timer supports 5/15/25/50 minute presets and whole custom minutes from 1 to
180. A monotonic deadline, rather than decrementing an interval counter,
handles delayed background ticks. Pause/resume excludes paused time. Visible
page time and running timer time form one elapsed interval, including when a
hidden timer finishes; overlapping seconds count once. Sessions count only on
completion. Tasks are completed once for historical statistics, even when
unchecked and reopened. Day totals split at local midnight; streaks derive
from actual recorded days.

Up to 30 tasks and 12 named setups are stored under
`swifly.study.v1.<verified-account-and-profile-owner>`, using
`SwiflyStudioConfig.ownerKey(localStorage, verifiedUser)`. Mount waits for
`SwiflyAccount.ready`; stale local session identity is never used to select an
owner. Profile changes settle the previous owner's activity and release audio,
images and room devices. Account suspension immediately pauses the page;
verified account hydration applies the correct owner before it resumes.
Blocked storage and quota errors are visible. Study data is local to this
browser; it is not part of cloud account-state synchronization.

Saved setups restore scene, track, station, layout, volume, ambient mix,
lighting and night mood. Share URLs contain validated public scene/track/mood
choices only. They never contain tasks, identity or statistics, and do not
autoplay or join a room. Focus-card export creates a PNG from the actual scene
poster, track and personal recorded totals.

## Coworking rooms and server integration

`createStudy({io, authorizeSocket, iceServers})` returns
`{router, namespace, close}`. Mount its router at `/api/study` behind the site's
HTTP access-code gate. It exposes `/catalog`, `/rooms` and `/focus`; responses
are not cached. The `/study` namespace requires an explicit cookie-authorizing
callback and refuses connections if authorization is missing or rejected.
The page needs the existing account script, `/assets/studio/config.js`,
`/socket.io/socket.io.js`, `/assets/study/study.css` and
`/assets/study/study.js`.

All nine source rooms are available, each capped at eight members. Joining
starts with camera, microphone and screen sharing off. Each device requires
its own explicit button; permission denial keeps presence usable. Every join
has a new session ID. The server verifies sender session, target session and
same-room membership before forwarding bounded SDP or ICE data. Join, media,
focus and signaling events have bounded rates. Leaving, switching rooms,
disconnecting, account suspension and teardown close peer connections and stop
owned tracks, including captures that finish after leave.

WebRTC negotiates send/receive audio and video independently of device
permissions. The offerer creates transceivers and the answerer adopts them;
device toggles replace existing senders. Screen sharing temporarily replaces
the video track and restores an enabled camera when it ends. The local preview
is muted; remote media remains audible. A button retries room audio when a
browser blocks autoplay. Supplied ICE servers are validated; the existing
STUN fallback does not guarantee connectivity through networks requiring TURN.
This limitation is visible in the room panel.

Room counts are live socket membership. The community focus board includes
only timers the server observed running to completion, once per timer. A tiny
client/server deadline difference receives one bounded retry using the real
remaining duration. This board and community total are explicitly labeled
“this server session”; they reset with the process and are not fabricated
historical site statistics.

## Source assets and verification

`public/study/attribution.json` records all 33 copied assets and their original
Git blob hashes from owner repository `lukasbonthy/lofistudy.to` at commit
`46ecda8c69f2818978bfd9e94fc48e164e7b0bf4`. Music is credited to HoliznaCC0,
CC0 1.0. Scene files are owner-supplied assets; the source contains no scene
license declaration, so they are not labeled CC0.

Run `node --test tests/study*.cjs` for server authorization/signaling, real
asset hashes, timer/statistics accounting, profile lifecycle, storage errors,
media-capture races and native UI behavior. The browser tests use Chromium
with fake camera/microphone devices, ordinary HTTP and Socket.IO, and two real
peer connections; they assert incoming audio/video RTP, local mute, remote
audio, device opt-in and track release. They also exercise 1440px desktop,
320px mobile and 1920px TV layouts and keyboard tab navigation. Optional
screenshots use `SWIFLY_STUDY_SCREENSHOT_DIR`.

`SWIFLY_TEST_BROWSER_EXECUTABLE_PATH` can select a locally installed Chromium.
The local browser fixture allows loopback ICE because the managed runner
restricts network-interface enumeration. This flag is confined to tests.
Physical Xbox hardware, cross-network TURN and the native screen-picker UI
were not exercised; permission races and screen/camera restoration have
automated behavioral coverage. No production deployment or merge is included.
