# SwiflyTV + CinePro Core

SwiflyTV keeps its existing TMDB-powered movie interface and uses CinePro Core as the primary OMSS streaming backend.

## Local Windows setup

```powershell
cd C:\Users\lukas\swiflytv
git pull
npm install
npm run cinepro:setup
npm run check
npm start
```

The one-time setup clones CinePro Core into:

```text
vendor/cinepro-core
```

`npm start` starts CinePro internally on `127.0.0.1:3100`, waits for `/v1/health`, and then starts SwiflyTV on the normal Swifly port from `.env`.

## Important environment variables

```env
TMDB_API_KEY=your_tmdb_key
CINEPRO_ENABLED=true
CINEPRO_AUTO_START=true
CINEPRO_CORE_URL=http://127.0.0.1:3100
CINEPRO_PORT=3100
CINEPRO_TIMEOUT_MS=90000
DEFAULT_PLAY_PROVIDER=cinepro
MOVIE_PROXY_VIDEO_CLIENT_WAIT=true
```

Optional source preferences:

```env
CINEPRO_LANGUAGE_ORDER=en,eng,english
CINEPRO_PROVIDER_ORDER=
CINEPRO_CACHE_TYPE=memory
```

To use a separately hosted CinePro Core instance:

```env
CINEPRO_AUTO_START=false
CINEPRO_CORE_URL=https://your-core-domain.example
```

Swifly relays the source through short-lived, server-issued tokens. The browser never receives unrestricted access to CinePro's generic proxy endpoint.

## Commands

```powershell
npm run cinepro:setup   # clone, install, and build Core
npm run cinepro:update  # update and rebuild Core
npm start               # start Core and Swifly together
npm run base            # start the old Swifly server without the integration loader
npm run check           # syntax-check all integration files
```

## Fallback behavior

CinePro is tried first. If it is unavailable or returns no playable OMSS source, Swifly continues through its existing provider chain and retains the LupeTube embed as the final legacy fallback.

## Deployment

The Dockerfile installs and builds CinePro Core during the image build. At runtime, Core binds only to `127.0.0.1:3100`; only SwiflyTV's normal web port is exposed.
