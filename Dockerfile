FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV REMOTE_BROWSER_ENABLED=true
ENV REMOTE_BROWSER_FPS=1
ENV REMOTE_BROWSER_JPEG_QUALITY=58
ENV HOST=0.0.0.0
ENV PORT=10000
ENV SWIFLY_NO_ENV_MODE=true
ENV DEFAULT_PLAY_PROVIDER=cinepro
ENV CINEPRO_ENABLED=true
ENV CINEPRO_AUTO_START=true
ENV CINEPRO_CORE_URL=http://127.0.0.1:3100
ENV CINEPRO_PORT=3100
ENV CINEPRO_TIMEOUT_MS=90000
ENV MOVIE_EMBED_PROVIDER_ENABLED=true
ENV MOVIE_EMBED_PROVIDER_URL=https://lupetube.com/trailer
ENV MOVIE_PROXY_VIDEO_CLIENT_WAIT=true
ENV MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=true

COPY package*.json ./
RUN npm install --omit=dev
RUN node -e "const v=require('playwright-core/package.json').version; if(v!=='1.49.1'){ console.error('Wrong playwright-core version:', v); process.exit(1); } console.log('playwright-core', v)"

COPY . .
RUN node scripts/setup-cinepro.js --build

EXPOSE 10000

CMD ["npm", "start"]
