# Pengu 4K source

The user requested a working 4K source and delegated implementation choices. Continue directly in the existing Node/Stremio bridge.

## Evidence and approach

The configured addon returned 37 Interstellar streams: Pengu (4), TorBox (30), and Flix Streams Emby (3). The current bridge accepted zero because it recognizes only four older providers. Pengu's MP4 returned HTTP 206 with real ISO-BMFF bytes after supplying a normal browser User-Agent; its video sample description reports `hev1`, 3840×2160. No provider credentials or signed URLs should be committed.

Considered: VidSrc (published maximum 1080p); implementing MKV remuxing (larger change with CPU/codec implications); recognizing Pengu's existing direct MP4 through the configured addon (chosen). Keep the original 4K video and existing proxy, verification, cancellation, expiry and public-address protections.

## Scope

Recognize only the exact Pengu provider hint or heading. Default missing source User-Agent to the existing application's browser agent, preserve explicit provider headers, and carry explicit HEVC/AVC codec evidence so the existing HEVC compatibility proxy can operate. Reject unsupported MKV, unknown provider identities and unverifiable links. Register Pengu in provider discovery only when the addon is configured, and include it in manual selection and the on-demand 4K scan. Normal playback retains its fast path.

## Validation

Reproduce the dropped Pengu MP4 in a deterministic test before fixing it. Test actual source verification with an HTTP transport fixture requiring a User-Agent, explicit headers, codec metadata and provider selection. Run the existing source/proxy tests, syntax checks and unit suite. Inspect live MP4 metadata and decode a bounded sample through the existing proxy path; a physical device's HEVC/HDR capability remains device-specific.
