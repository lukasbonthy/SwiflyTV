# Node build no-hang fix

Removed the package-level postinstall browser download:

```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
```

This avoids Render native Node builds stalling after Chromium reaches 100%.

Changes:
- `package.json`: removed `postinstall`
- `package.json`: removed full `playwright` dependency
- `package.json`: kept `playwright-core` pinned to `1.49.1`
- `package.json`: set `engines.node` to `20.x`
- `server.js`: `VIDSRC_ENABLED` defaults to false
- `.env.example` / `render.yaml`: `VIDSRC_ENABLED=false`

For native Node Render:
```env
VIDSRC_ENABLED=false
CONSUMET_ENABLED=true
```

For Docker/Playwright Render:
```env
VIDSRC_ENABLED=true
```
