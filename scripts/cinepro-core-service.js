"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const coreDir = path.join(root, "vendor", "cinepro-core");
const coreEntry = path.join(coreDir, "dist", "server.js");
const setupScript = path.join(root, "scripts", "setup-cinepro.js");
const bootstrapScript = path.join(root, "scripts", "cinepro-provider-bootstrap.js");
const coreHost = String(process.env.HYBRID_CINEPRO_HOST || "127.0.0.1");
const corePort = String(process.env.HYBRID_CINEPRO_PORT || process.env.CINEPRO_PORT || "3100");
const coreUrl = String(
  process.env.HYBRID_CINEPRO_URL || `http://${coreHost}:${corePort}`,
).replace(/\/+$/, "");
let child = null;
let ownsChild = false;

function childEnvironment() {
  const names = [
    "HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "NODE_EXTRA_CA_CERTS",
    "PATH",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMDB_API_KEY",
    "USERPROFILE",
  ];
  const env = {};
  for (const name of names) {
    if (process.env[name] != null) env[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("CINEPRO_") || name.startsWith("HYBRID_CINEPRO_")) {
      env[name] = value;
    }
  }
  env.NODE_ENV = process.env.NODE_ENV || "production";
  env.HOST = coreHost;
  env.PORT = corePort;
  env.PUBLIC_URL = coreUrl;
  env.CORS_ORIGIN = "*";
  env.CACHE_TYPE = process.env.CINEPRO_CACHE_TYPE || "memory";
  env.STREMIO_ADDON = "false";
  env.MCP_ENABLED = "false";
  return env;
}

async function health() {
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${coreUrl}/v1/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && (data.status === "operational" || data.status === "healthy" || data.spec === "omss")
      ? data
      : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureInstalled() {
  if (fs.existsSync(coreEntry)) return;
  console.log("[hybrid-cinepro] CinePro build missing; running one-time setup...");
  const result = spawnSync(process.execPath, [setupScript, "--build"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(coreEntry)) {
    throw new Error("CinePro Core setup failed.");
  }
}

function applyRuntimePatches() {
  process.env.CINEPRO_PROVIDER_ALLOWLIST = "*";
  process.env.CINEPRO_PROVIDER_TIMEOUT_MS = String(
    process.env.CINEPRO_PROVIDER_TIMEOUT_MS || "15000",
  );

  const providerTimeouts = require("./patch-cinepro-provider-timeouts.js");
  providerTimeouts.applyProviderTimeoutPatch();

  const providerVariants = require("./patch-cinepro-provider-variants.js");
  providerVariants.applyProviderVariantPatch();

  const vidNestResilience = require("./patch-cinepro-vidnest-resilience.js");
  vidNestResilience.applyVidNestResiliencePatch();
}

async function start(options = {}) {
  const running = await health();
  if (running) {
    console.log(`[hybrid-cinepro] Using running CinePro Core at ${coreUrl}.`);
    return { health: running, child: null, ownsChild: false, coreUrl };
  }

  try {
    console.log(`[hybrid-cinepro] Launching CinePro bootstrap worker for ${coreUrl}...`);
    child = spawn(process.execPath, [bootstrapScript], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: childEnvironment(),
    });
    ownsChild = true;

    child.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(
          `[hybrid-cinepro] Bootstrap exited with code ${code}${signal ? ` (${signal})` : ""}.`,
        );
      }
    });

    const timeoutMs = Math.max(
      15_000,
      Number(process.env.HYBRID_CINEPRO_START_TIMEOUT_MS || 75_000),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = await health();
      if (current) {
        console.log("[hybrid-cinepro] CinePro Core is operational.");
        return { health: current, child, ownsChild, coreUrl };
      }
      if (child && child.exitCode != null) {
        throw new Error(`CinePro bootstrap exited before health was ready (code ${child.exitCode}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    throw new Error("CinePro Core did not become healthy before the startup timeout.");
  } catch (error) {
    if (options.required || process.env.HYBRID_CINEPRO_REQUIRED === "true") throw error;
    console.warn(
      `[hybrid-cinepro] CinePro unavailable; hybrid mode will continue with Nuvio only: ${error.message || error}`,
    );
    return { health: null, child, ownsChild, coreUrl, error: error.message || String(error) };
  }
}

function shutdown(signal = "SIGTERM") {
  if (ownsChild && child && !child.killed) {
    try { child.kill(signal); } catch {}
  }
}

module.exports = {
  applyRuntimePatches,
  bootstrapScript,
  childEnvironment,
  coreEntry,
  coreUrl,
  ensureInstalled,
  health,
  shutdown,
  start,
};
