#!/usr/bin/env sh
set -eu

echo "[docker-start] node=$(node -v)"
echo "[docker-start] npm=$(npm -v)"
echo "[docker-start] cwd=$(pwd)"
echo "[docker-start] PORT=${PORT:-}"
echo "[docker-start] HOST=${HOST:-0.0.0.0}"
echo "[docker-start] PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-}"
echo "[docker-start] VIDSRC_ENABLED=${VIDSRC_ENABLED:-}"
echo "[docker-start] CONSUMET_ENABLED=${CONSUMET_ENABLED:-}"

node - <<'NODECHECK'
let failed = false;
function check(name) {
  try {
    console.log(`[docker-start] module ${name}:`, require.resolve(name));
  } catch (error) {
    failed = true;
    console.error(`[docker-start] missing module ${name}:`, error.message || error);
  }
}
check("express");
check("socket.io");
check("playwright-core");

try {
  const version = require("playwright-core/package.json").version;
  const { chromium } = require("playwright-core");
  console.log("[docker-start] playwright-core version:", version);
  console.log("[docker-start] chromium executablePath:", chromium.executablePath());
} catch (error) {
  failed = true;
  console.error("[docker-start] playwright check failed:", error.stack || error.message || error);
}

try {
  console.log("[docker-start] consumet package:", require.resolve("@consumet/extensions/package.json"));
} catch (error) {
  console.warn("[docker-start] consumet package not resolved:", error.message || error);
}

if (failed) process.exit(1);
NODECHECK

echo "[docker-start] launching server.js"
exec node --trace-uncaught server.js
