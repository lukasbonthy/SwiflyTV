# Player appearance integration

The existing solo and embedded player consume the effective Studio settings at
mount from `window.SwiflyAppearance` and live from the document event
`swifly:studio-change`, whose detail is `{values, effective}`. Only `effective`
is consumed. Studio owns validation, profile storage, draft preview, Save and
Cancel; the player neither persists settings nor changes playback for an
appearance update. A newly mounted player receives the latest initial settings.

| Setting | Behavior |
| --- | --- |
| `playerStyle` | `cinema` uses the existing bounded glass lens; `minimal` uses a restrained dark gradient; `classic` uses a dark rectangular transport. |
| `playerProgress` | Actual timeline thickness, 2–7px; the input's existing touch area remains independent. |
| `playerTime` | Shows or hides current/duration text; the real seek input retains its accessible time description. |
| `playerIconScale` | Scales transport icons from 85–125% without shrinking hit areas. |
| `playerOpacity` | Sets chrome background opacity from 60–100%; labels, focused controls and open menus retain their contrast. |
| `playerPosition` | `floating` retains the existing responsive dock; `bottom` places it at the stage edge. Fullscreen respects the safe area. |
| `playerAutoHide` | Replaces the live idle deadline with 1800, 2600, 4000 or 6000ms. |
| `captionSize`, `captionColor`, `captionBg`, `captionEdge` | Style actual native WebVTT cues at 75–200%, a validated six-digit hex color, 0–100% black background, and `shadow`, `outline` or `none`. |
| `playerBackdrop` | `dark`, static blurred `artwork`, or a static `ambient` gradient while loading, waiting or showing an error. |

Appearance changes retain the same playing video element, time, volume, mute,
playback state, source, caption selection and player API. They never call source
discovery, reload a source, create caption tracks, select a quality or emit a
`swiflyplayer:action`/party transport command. Normal source replacement still
belongs to the existing player; a mounted-root `::cue` selector automatically
covers its replacement video. The original `data-player-backdrop` remains real
artwork metadata for watch history and parties. Loading style uses the separate
internal `data-player-loading-backdrop` marker.

Each idle update reveals controls and starts one fresh deadline. Focus within the
transport, mouse/pen hover over it, open menus, pause, buffering, seeking,
scrubbing, errors and an autoplay-unlock action pin controls. Touch activity
reveals controls without leaving a permanent mouse-hover pin. Menu placement is
recalculated after changes. Studio and OS preference listeners, plus the
per-instance cue stylesheet, use the existing player cleanup bucket.

`reduceTransparency`, `highContrast`, `glass: 'off'` and device presets `mobile`,
`xbox` or `minimal` flatten player surfaces and disable the lens. OS reduced
transparency always wins, including changes while mounted. High contrast keeps
the timeline and text opaque. `largeTargets` and `tvControls: 'large'` use 48px
transport targets and wrap narrow layouts. User or OS reduced motion disables
player presentation transitions. Backdrop artwork is never sampled, animated or
filtered over a playing video; no per-frame loop is added.

Caption styling depends on the browser's native `::cue` renderer. Browser or OS
caption preferences may take precedence; renderer-owned captions (including
some DASH renderers), picture-in-picture and platform fullscreen may ignore
these styles. Burned-in subtitles cannot be changed. Studio's labeled caption
preview demonstrates appearance only and does not imply an available track.

Verification:

```sh
node --test tests/player-studio.test.cjs tests/player-studio-browser.test.cjs
node --test tests/player.test.cjs tests/player-layout.test.cjs tests/tv-player*.test.cjs tests/watch-party-player.test.cjs
```

The focused tests cover idle rescheduling and pins, source/authority identity,
effective versus raw values, input bounds, real artwork metadata, caption rules
across video replacement, low-power effects and teardown. Chromium additionally
reads the actual native cue's computed color, size, background and edge during
playback of an inline, local silent VP8 fixture, and checks rendered controls on
320px and 1920px layouts. A local SVG fixture also verifies that loading artwork
and the ambient gradient clear the playing frame without altering real artwork
metadata. These are browser fixtures, not a physical Xbox test.

The existing layout suite still reports the two recorded baseline failures:
standard transport targets below 44px at 320×568, and Retry obscured in a very
short landscape window. Studio's large-target layout passes its separate 320px
and 1920px checks; the baseline failures remain outside this appearance change.
