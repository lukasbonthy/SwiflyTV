FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV REMOTE_BROWSER_ENABLED=true
ENV REMOTE_BROWSER_FPS=1
ENV REMOTE_BROWSER_JPEG_QUALITY=58
ENV HOST=0.0.0.0
ENV PORT=10000
ENV SWIFLY_NO_ENV_MODE=true
ENV MOVIE_EMBED_PROVIDER_ENABLED=true
ENV MOVIE_EMBED_PROVIDER_URL=https://lupetube.com/trailer
ENV MOVIE_PROXY_VIDEO_CLIENT_WAIT=false
ENV MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=true

COPY package*.json ./
RUN npm install --omit=dev
RUN node -e "const v=require('playwright-core/package.json').version; if(v!=='1.49.1'){ console.error('Wrong playwright-core version:', v); process.exit(1); } console.log('playwright-core', v)"

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
