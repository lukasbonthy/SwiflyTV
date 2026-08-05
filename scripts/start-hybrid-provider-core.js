"use strict";

const path = require("path");
const { spawn } = require("child_process");
const setup = require("./setup-nuvio-providers.js");
const cinepro = require("./cinepro-core-service.js");
const { createGateway } = require("./hybrid-provider-gateway.js");

const root = path.resolve(__dirname, "..");
const nuvioScript = path.join(__dirname, "nuvio-provider-core.js");
const hybridHost = String(process.env.HYBRID_CORE_HOST || "127.0.0.1");
const hybridPort = String(process.env.HYBRID_CORE_PORT || "3200");
const hybridUrl = String(
  process.env.HYBRID_CORE_PUBLIC_URL || `http://${hybridHost}:${hybridPort}`,
).replace(/\/+$/, "");
const nuvioHost = String(process.env.HYBRID_NUVIO_HOST || "127.0.0.1");
const nuvioPort = String(process.env.HYBRID_NUVIO_PORT || "3201");
const nuvioUrl = String(
  process.env.HYBRID_NUVIO_URL || `http://${nuvioHost}:${nuvioPort}`,
).replace(/\/+$/, "");
let nuvioChild = null;
let ownsNuvio = false;
let gateway = null;
let gatewayServer = null;
let lifecycleInstalled = false;

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
    if (name.startsWith("NUVIO_")) env[name] = value;
  }
  env.NODE_ENV = process.env.NODE_ENV || "production";
  env.NUVIO_CORE_HOST = nuvioHost;
  env.NUVIO_CORE_PORT = nuvioPort;
  env.NUVIO_CORE_PUBLIC_URL = nuvioUrl;
  env.NUVIO_PROVIDER_TIMEOUT_MS = String(process.env.NUVIO_PROVIDER_TIMEOUT_MS || "12000");
  env.NUVIO_PROVIDER_CONCURRENCY = String(process.env.NUVIO_PROVIDER_CONCURRENCY || "8");
  return env;
}

async function readHealth(url, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${url}/v1/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && (data.status === "operational" || data.status === "healthy" || data.spec === "omss")
      ? data
      : null;
  } catch {
    return null;
  }
}

async function startNuvioCore(options = {}) {
  const running = await readHealth(nuvioUrl);
  if (running && running.name === "Swifly Nuvio Provider Core") {
    console.log(`[hybrid-nuvio] Using running Paregi Nuvio Core at ${nuvioUrl}.`);
    return { health: running, child: null, ownsChild: false, coreUrl: nuvioUrl };
  }

  try {
    setup.ensureNuvioProviders();
    console.log(`[hybrid-nuvio] Starting Paregi Nuvio Core at ${nuvioUrl}...`);
    nuvioChild = spawn(process.execPath, [nuvioScript], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: childEnvironment(),
    });
    ownsNuvio = true;
    nuvioChild.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(
          `[hybrid-nuvio] Nuvio Core exited with code ${code}${signal ? ` (${signal})` : ""}.`,
        );
      }
    });

    const timeoutMs = Math.max(
      15_000,
      Number(process.env.HYBRID_NUVIO_START_TIMEOUT_MS || 90_000),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const health = await readHealth(nuvioUrl);
      if (health) {
        console.log(
          `[hybrid-nuvio] Paregi Nuvio Core operational with ${health.providerCount || 0} enabled provider(s).`,
        );
        return { health, child: nuvioChild, ownsChild: ownsNuvio, coreUrl: nuvioUrl };
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error("Paregi Nuvio Core did not become healthy before the startup timeout.");
  } catch (error) {
    if (options.required || process.env.HYBRID_NUVIO_REQUIRED === "true") throw error;
    console.warn(
      `[hybrid-nuvio] Nuvio unavailable; hybrid mode will continue with CinePro only: ${error.message || error}`,
    );
    return { health: null, child: nuvioChild, ownsChild: ownsNuvio, coreUrl: nuvioUrl, error: error.message || String(error) };
  }
}

function installPlayerPatches() {
  const allMedia = require("./start-cinepro-all-sources-captions-patch.js");
  if (!allMedia || typeof allMedia.installPatch !== "function") {
    throw new TypeError("Hybrid startup could not load the source/caption normalization patch.");
  }
  allMedia.installPatch();

  const directProxy = require("./start-cinepro-direct-source-proxy.js");
  if (!directProxy || typeof directProxy.installPatch !== "function") {
    throw new TypeError("Hybrid startup could not load the direct-source compatibility patch.");
  }
  directProxy.installPatch();

  const sourceList = require("./patch-cinepro-source-list.js");
  if (!sourceList || typeof sourceList.installPatch !== "function") {
    throw new TypeError("Hybrid startup could not load the complete Source-list patch.");
  }
  sourceList.installPatch();
}

function configureCompatibilityClient() {
  process.env.CINEPRO_ENABLED = "true";
  process.env.CINEPRO_STRICT = "true";
  process.env.CINEPRO_AUTO_START = "false";
  process.env.CINEPRO_CORE_URL = hybridUrl;
  process.env.CINEPRO_PROVIDER_ALLOWLIST = "*";
  process.env.DEFAULT_PLAY_PROVIDER = "cinepro";
  process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT = "true";
  process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED = "false";
  process.env.SWIFLY_SCRAPER_BACKEND = "cinepro+nuvio";
}

function installLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  process.on("SIGINT", () => { shutdown("SIGINT"); process.exit(0); });
  process.on("SIGTERM", () => { shutdown("SIGTERM"); process.exit(0); });
  process.on("exit", () => shutdown("SIGTERM"));
}

function shutdown(signal = "SIGTERM") {
  try {
    if (gatewayServer && gatewayServer.listening) gatewayServer.close();
  } catch {}
  if (ownsNuvio && nuvioChild && !nuvioChild.killed) {
    try { nuvioChild.kill(signal); } catch {}
  }
  cinepro.shutdown(signal);
}

async function start() {
  console.log("[swifly-hybrid] Starting CinePro + Paregi Nuvio provider mode.");
  installLifecycle();

  const [cineproResult, nuvioResult] = await Promise.all([
    cinepro.start(),
    startNuvioCore(),
  ]);
  if (!cineproResult.health && !nuvioResult.health) {
    throw new Error("Neither CinePro nor Paregi Nuvio became operational.");
  }

  process.env.HYBRID_CINEPRO_URL = cinepro.coreUrl;
  process.env.HYBRID_NUVIO_URL = nuvioUrl;
  gateway = createGateway({
    host: hybridHost,
    port: Number(hybridPort),
    publicUrl: hybridUrl,
    backends: [
      {
        id: "cinepro",
        name: "CinePro",
        url: cinepro.coreUrl,
        timeoutMs: Number(process.env.HYBRID_CINEPRO_RESOLVE_TIMEOUT_MS || 28_000),
      },
      {
        id: "nuvio",
        name: "Paregi Nuvio",
        url: nuvioUrl,
        timeoutMs: Number(process.env.HYBRID_NUVIO_RESOLVE_TIMEOUT_MS || 42_000),
      },
    ],
  });
  gatewayServer = await gateway.start();

  configureCompatibilityClient();
  installPlayerPatches();

  console.log(`[swifly-hybrid] Hybrid Core ready at ${hybridUrl}.`);
  console.log(
    `[swifly-hybrid] Backends: CinePro ${cineproResult.health ? "online" : "offline"} + Paregi Nuvio ${nuvioResult.health ? "online" : "offline"}.`,
  );
  console.log(`[swifly-hybrid] Nuvio provider ref ${setup.pinnedRef}.`);

  const stablePlayback = require("./start-cinepro-stable-playback.js");
  if (!stablePlayback || typeof stablePlayback.start !== "function") {
    throw new TypeError("Hybrid startup could not load the stable Swifly player launcher.");
  }
  return stablePlayback.start();
}

module.exports = {
  childEnvironment,
  configureCompatibilityClient,
  hybridUrl,
  installPlayerPatches,
  readHealth,
  shutdown,
  start,
  startNuvioCore,
};

if (require.main === module) {
  start().catch((error) => {
    console.error("[swifly-hybrid] Startup failed:", error.stack || error.message || error);
    shutdown("SIGTERM");
    process.exit(1);
  });
}
