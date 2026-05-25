# Best fix: Playwright pin + false-positive blockers

- Pinned `playwright-core` to `1.49.1` to match `mcr.microsoft.com/playwright:v1.49.1-noble`.
- Added Docker build check so a caret upgrade cannot silently install a browser-incompatible Playwright package.
- Added `/api/local/runtime-debug`.
- Blocked Cloudflare demo/background videos and protection pages from becoming media winners.
- Stopped `vidsrc-local` from deep-digging failed embed/challenge pages; VidSrc only trusts captured network sources.
