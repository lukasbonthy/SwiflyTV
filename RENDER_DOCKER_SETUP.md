# Render Setup

For the new **Live Share** feature, Docker is NOT required.

Use normal Render Node runtime if you only need Live Share.

Remote Browser still needs Docker/Chromium, but Live Share is the recommended working option.

# Render + GitHub Setup for Remote Browser

Remote Browser needs Chromium. Render's normal Node runtime does not include Chromium.

Use Docker on Render.

## Files that must be in your GitHub repo

- `server.js`
- `package.json`
- `Dockerfile`
- `render.yaml`
- `.dockerignore`

The Dockerfile uses:

```Dockerfile
FROM mcr.microsoft.com/playwright:v1.49.1-noble
```

That image already has Chromium installed at `/ms-playwright`.

## Render setup

Best option:

1. Push this whole folder to GitHub.
2. In Render, create a new Web Service from GitHub.
3. Choose Docker runtime. If using Blueprint, Render should read `render.yaml`.
4. Make sure Render is not using normal Node runtime.

You should NOT see:

```txt
Build Command: npm install
Start Command: node server.js
```

You SHOULD see Docker build logs.

## Render env

```env
REMOTE_BROWSER_ENABLED=true
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REMOTE_BROWSER_FPS=1
REMOTE_BROWSER_JPEG_QUALITY=58
```

## Test

After deploy, open:

```txt
/api/remote-browser/status
```

Good result has:

```json
{
  "enabled": true,
  "ready": true,
  "executablePath": "/ms-playwright/..."
}
```

If `executablePath` is empty, the service is not running Docker.


## Docker Playwright 1.60 Render fix

This build is meant to run on Render as a **Docker** web service, not a native Node service.

Dockerfile uses:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.60.0-noble
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

`package.json` pins:

```json
"playwright-core": "1.60.0"
```

This avoids the native Render `postinstall` Chromium download hang and keeps the installed Playwright package matched to the browser binaries inside the Docker image.

Important: if Render logs still say `Requesting Node.js version` and `Running build command npm install`, the service is still a native Node service and is not using Docker. Switch the service environment to Docker, or create a new Render Web Service from the repo using the Dockerfile / render.yaml.
