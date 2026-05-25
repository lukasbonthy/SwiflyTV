FROM lscr.io/linuxserver/chromium:latest

# Render exposes one public HTTP port. LinuxServer's Chromium image supports
# changing its internal HTTP listener with CUSTOM_PORT, so we bind it directly
# to Render's default web-service port instead of running our own noVNC stack.
ENV CUSTOM_PORT=10000 \
    PUID=1000 \
    PGID=1000 \
    TZ=Etc/UTC \
    CHROME_CLI="https://www.google.com --no-first-run --no-default-browser-check --disable-dev-shm-usage" \
    TITLE="BrowserUnblocked Chromium" \
    DISABLE_IPV6=true \
    START_DOCKER=false \
    DISABLE_SUDO=true \
    DISABLE_TERMINALS=true \
    DISABLE_OPEN_TOOLS=true \
    SELKIES_ENABLE_SHARING=false \
    SELKIES_ENABLE_COLLAB=false \
    SELKIES_ENABLE_SHARED=false

EXPOSE 10000
