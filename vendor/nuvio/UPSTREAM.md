# All-in-One-Nuvio adapters

Upstream: https://github.com/NuvioPlugin/All-in-One-Nuvio

Pinned commit: `3f09a6ff4360498895e622877af7a32212f75038` (2026-10-02).

The upstream `providers/vidsrc.js`, `providers/vidlink.js`, and
`providers/videasy.js` are stored here as `.cjs` files. Their extraction logic
is unchanged. The server loads these local copies; it never downloads executable
provider updates at runtime.

| Local file | SHA-256 |
| --- | --- |
| vidsrc.cjs | c83b23943f9783f2b57008fac62f5fd2a05fea0c826f4b1ca74d53198152b286 |
| vidlink.cjs | bedc41b8caf7e7cb371b5b96bb949970278c8a51b83847eaa64f46ca0317c521 |
| videasy.cjs | 8fb7fbc12e23d28185927a5a7f47fa65874ff0d1b1f3e01f4dbf9813c4fc7862 |

The upstream README declares GNU GPL version 3; the full license is in `LICENSE`.
The upstream compilation is credited to =[D3adly]= and credits Yoruix,
Paregi12, Phisher98, Wooodyhood, Piratezoro9 (Kabir), KennethJYS,
Real-Morpheus, Xyr0nX/Antonio, Yatin-Code, and RaymondNoodles.

SwiflyTV runs each adapter in a disposable worker with an empty environment,
captured output, and memory limits. Network requests go through the parent
process's bounded public-address fetcher. Returned media must pass the existing
media classifier and an HTTP verification before entering the HLS proxy.

Some upstream scripts are obfuscated and depend on external helper APIs.
Updating a pinned file requires inspecting its changes and checking real
playlist and segment delivery. Unit tests do not establish provider availability.
