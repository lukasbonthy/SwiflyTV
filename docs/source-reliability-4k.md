# Source reliability and 4K research

Research date: 30 October 2026. The changes repair shared source handling and preserve the existing provider roster. The alternatives below were assessed from their own repositories and protocol documentation; they have not been deployed or authenticated against a personal library in this change.

## Working changes

- Preserve explicit 4K/UHD, 8K, pixel-height and dimension metadata through normalization and quality ordering. A cropped 3840×1600 file stays 1600p. Keep adaptive Auto, preferred audio ordering and unknown-quality behavior. A year, frame rate or zero-width dimension does not become a resolution.
- Verify a file when its server rejects HEAD and ignores Range without downloading the entire file. The verifier explicitly requests a maximum 4096-byte decoded prefix and closes the transfer. Normal JSON/manifest fetches still reject bodies exceeding their limits. Both Range-honoring and Range-ignoring file hosts receive a bounded 0–4095 byte inspection request; cancellation explicitly closes decompression resources as well as the network transfer.
- Reject HTML mislabeled as video and the existing fingerprinted protection clip even when its full size is reported through Content-Range. This does not bypass upstream protection.
- Retry a failed lazy alternate after a one-second cooldown, sharing concurrent probes. Successful verification remains cached and expired entries remain unavailable.
- Show explicit 2160p metadata as **4K (2160p)** in picture-quality and server controls. No upscaling or HDR claim is added. Player script cache key is 268.

## Researched alternatives

These are software bridges for media the account is authorized to access. They do not supply a free movie catalog. “4K path” below describes a documented capability or an inference from original-file delivery, not a title-by-title playback certification.

| Project | Useful capability | 4K path and requirements | Assessment for Swifly |
| --- | --- | --- | --- |
| [Nuvi-Flow](https://github.com/riverflow-media/nuvi-flow) | Nuvio/Stremio personal-media addon; original files, signed media URLs, byte ranges, technical metadata and optional Silo playback | README explicitly describes preserving source resolution including 4K when device capabilities and the Silo route permit it. Needs original media and a running server. | Closest fit to investigate first. Separate original playback, remux and transcoding decisions rather than imposing a blanket 1080p ceiling. |
| [Jellio++](https://github.com/wujekbogdan/jellio-plus-plus) | Jellyfin bridge with an entry per audio track, HLS seeking and public-base-URL support | Requires a Jellyfin library and compatible plugin version; current README targets Jellyfin 12, pointing older 10.11 installations to v1.6.0. 4K depends on the original file and Jellyfin playback route. | Strong candidate when a Jellyfin server already exists. Its README does not establish universal 4K/HDR playback. |
| [Stremio Jellyfin Addon](https://github.com/akarazniewicz/stremio-jellyfin) | Local Docker addon with IMDb matching against Jellyfin | Requires both the addon and the companion Jellyfin search plugin. Original library and client/server playback capabilities determine quality. | Lean integration reference, with two components to maintain. Not a drop-in Nuvio scraper module. |
| [Personal Media Addon](https://github.com/Squipy411/personal-media-addon) | Folder-based private addon with original streaming, HEAD/ranges, signed links and external subtitles; Docker or Windows app | No transcoding. A 4K original can retain its resolution, but an incompatible browser codec still needs another playback route. Requires your own files. | Useful lightweight option. Catalog access is intended for a trusted network; review authentication before any public integration. |
| [Plex → Stremio Bridge V4](https://github.com/rdhamrick91/Plex_Stremio) | Plex PIN login, owned/authorized shared library selection and cached IMDb/TMDB/TVDB GUID matching | Requires authorized Plex access. README does not establish a tested 4K route. Metadata mismatches and restricted libraries remain documented limitations. | Research candidate only; small implementation needs code and security review before adoption. |
| [Plexio](https://github.com/vanchaxy/plexio) | Plex library integration and direct/transcoded stream routes | Requires a Plex library; the file and playback route determine quality. Repository was archived on 22 October 2026. | Do not choose as a fresh production dependency without an actively maintained successor. |

Recommended next integration order, if an authorized library is available: Nuvi-Flow for Nuvio-style original playback, or Jellio++ for an existing Jellyfin installation. This is an engineering assessment from documentation, not a comparative deployment benchmark.

## Compatibility and integration boundary

[Stremio's stream object](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html) is an HTTP addon protocol, distinct from Swifly's installed JavaScript scraper interface. None of these projects becomes an installed Swifly provider by adding its name to the provider catalog. An adapter would need correct movie/episode matching, server-side credentials, signed/opaque URLs, stream verification and caption handoff.

[Jellyfin's codec documentation](https://jellyfin.org/docs/general/clients/codec-support/) distinguishes resolution from codec, device and HDR support. HEVC/HDR and multichannel audio can require conversion even for a valid 4K source. A browser test on this host cannot certify a physical Xbox, HDR output, high-bitrate sustained playback or every platform decoder.

## Validation

The new real-browser regression uses an original test pattern, not a third-party film. It passes a real 3840×2160 VP9/WebM file through the production verifier against a local server that returns HEAD 405 and ignores Range. The actual player reports videoWidth 3840 and videoHeight 2160, shows the 4K label, and emits a real playing event with decoded data. The browser test is included in installed-Chromium CI.

Fixture reproduction (FFmpeg is only needed to regenerate the committed fixture):

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i testsrc2=size=3840x2160:rate=1:duration=2 \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 \
  -b:v 0 -crf 45 -pix_fmt yuv420p -an tests/fixtures/source-4k.webm
```

Focused checks observed RED before their fixes, then GREEN: quality normalization/ranking, ignored-Range bounded-prefix verification, alternate recovery and the clear 4K label. Existing proxy, handoff, player and registration checks cover unchanged credential, expiry, cancellation, audio and transport boundaries.

Live health in the existing authorized browser session reports source discovery ready and ten selected installed Nuvio adapters. That verifies configuration and readiness, not successful playback from every upstream host. No protected access was bypassed, and no third-party title availability or 4K catalog is certified by this change.

Local release checks: syntax checks passed; the full unit phase passed 1486 tests (209 browser-only skips); the explicit installed-Chromium phase passed 209/209 with no skips, including the original 4K playback regression. AI assets prepared successfully, recommendation assertions passed, and integrated mobile/desktop/TV acceptance passed 33/33 checks with 335 assertions.

The independent branch review identified Range-honoring HTML and compressed-response cancellation gaps. New HTTP regressions reproduced both failures before the fixes, then passed. A zero-width dimension regression also failed before validation was tightened, preventing impossible metadata from receiving a 4K ranking. The focused final source/proxy/handoff suite passed 176/176.
