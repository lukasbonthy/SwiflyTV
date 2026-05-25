FROM mcr.microsoft.com/playwright:v1.60.0-noble

ENV NODE_ENV=production \
    PORT=10000 \
    HOME=/home/pwuser \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    REMOTE_BROWSER_ENABLED=true \
    REMOTE_BROWSER_FPS=1 \
    REMOTE_BROWSER_JPEG_QUALITY=58 \
    VIDSRC_ENABLED=true

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev
RUN node -e "const v=require('playwright-core/package.json').version; if(v!=='1.60.0'){ console.error('Wrong playwright-core version:', v); process.exit(1); } console.log('playwright-core', v)"

COPY . .
RUN chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 10000
CMD ["node", "server.js"]
