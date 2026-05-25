# Render native install fix

Fixes two deploy issues seen in debug output:

1. `@consumet/extensions` missing from node_modules.
2. Playwright looking for `/ms-playwright/chromium_headless_shell-1148` on a native Render Node deploy.

Changes:

- `package.json` now includes `@consumet/extensions`, `playwright`, and pinned `playwright-core` at `1.49.1`.
- `postinstall` downloads Chromium with `PLAYWRIGHT_BROWSERS_PATH=0`.
- `server.js` falls back to `PLAYWRIGHT_BROWSERS_PATH=0` if `/ms-playwright` does not exist.
- `render.yaml` / env examples use `PLAYWRIGHT_BROWSERS_PATH=0` for native installs.
