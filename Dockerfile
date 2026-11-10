FROM node:22-bookworm-slim AS react-build
WORKDIR /build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
COPY package*.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY frontend ./frontend
COPY vite.config.mjs ./
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/song && /opt/song/bin/pip install --no-cache-dir shazamio==0.8.1
ENV SWIFLY_SONG_PYTHON=/opt/song/bin/python

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
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
RUN node -e "const v=require('playwright-core/package.json').version; if(v!=='1.49.1'){ console.error('Wrong playwright-core version:', v); process.exit(1); } console.log('playwright-core', v)"

COPY . .
COPY --from=react-build /build/dist ./dist
RUN node scripts/prepare-ai.cjs

EXPOSE 10000

CMD ["node", "scripts/start-react.cjs"]
