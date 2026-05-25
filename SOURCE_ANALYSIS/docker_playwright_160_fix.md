# Docker Playwright 1.60 fix

Updated Dockerfile to `mcr.microsoft.com/playwright:v1.60.0-noble`.

Pinned `playwright-core` to `1.60.0`.

Removed native `postinstall` browser installation. This should be deployed as Docker on Render. If logs show `Requesting Node.js version` then Render is still using native Node and not this Dockerfile.
