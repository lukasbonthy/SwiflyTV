"use strict";

const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const setup = require("./setup-nuvio-providers.js");
const cinepro = require("./cinepro-core-service.js");
const { createGateway } = require("./hybrid-provider-gateway.js");

const nuvioBootstrapScript = path.join(__dirname, "nuvio-provider-bootstrap.js");
const hybridHost = String(process.env.HYBRID_CORE_HOST || "127.0.0.1");
let hybridPort = String(process.env.HYBRID_CORE_PORT || "3200");
let hybridUrl = String(
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
let backendWarmupPromise = null;

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
    if (name.startsWith("NUVIO_") || name.startsWith("HYBRID_NUVIO_")) {
      env[name] = value;
    }
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
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${url}/v1/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
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

async function startNuvioCore(options = {}) {
  const running = await readHealth(nuvioUrl);
  if (running && running.name === "Swifly Nuvio Provider Core") {
    console.log(`[hybrid-nuvio] Using running Paregi Nuvio Core at ${nuvioUrl}.`);
    return { health: running, child: null, ownsChild: false, coreUrl: nuvioUrl };
  }

  try {
    console.log(`[hybrid-nuvio] Launching Paregi Nuvio bootstrap worker for ${nuvioUrl}...`);
    nuvioChild = spawn(process.execPath, [nuvioBootstrapScript], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: childEnvironment(),
    });
    ownsNuvio = true;

    nuvioChild.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(
          `[hybrid-nuvio] Bootstrap exited with code ${code}${signal ? ` (${signal})` : ""}.`,
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
      if (nuvioChild && nuvioChild.exitCode != null) {
        throw new Error(`Paregi Nuvio bootstrap exited before health was ready (code ${nuvioChild.exitCode}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error("Paregi Nuvio Core did not become healthy before the startup timeout.");
  } catch (error) {
    if (options.required || process.env.HYBRID_NUVIO_REQUIRED === "true") throw error;
    console.warn(
      `[hybrid-nuvio] Nuvio unavailable; hybrid mode will continue with CinePro only: ${error.message || error}`,
    );
    return {
      health: null,
      child: nuvioChild,
      ownsChild: ownsNuvio,
      coreUrl: nuvioUrl,
      error: error.message || String(error),
    };
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
  // The local hybrid gateway starts before either scraper backend. During that
  // warm-up window its health response can be degraded, so strict CinePro
  // startup must not terminate SwiflyTV before port 3001 opens.
  process.env.CINEPRO_STRICT = "false";
  process.env.CINEPRO_AUTO_START = "false";
  process.env.CINEPRO_CORE_URL = hybridUrl;
  process.env.CINEPRO_PROVIDER_ALLOWLIST = "*";
  process.env.DEFAULT_PLAY_PROVIDER = "cinepro";
  process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT = "true";
  process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED = "false";
  process.env.SWIFLY_SCRAPER_BACKEND = "cinepro+nuvio";
  console.log("[swifly-hybrid] Compatibility strict mode disabled until scraper warm-up completes.");
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

function gatewayCandidates() {
  const configured = Math.max(1, Number(hybridPort || 3200));
  const explicitFallback = Number(process.env.HYBRID_CORE_FALLBACK_PORT || 0);
  return Array.from(new Set([
    configured,
    explicitFallback > 0 ? explicitFallback : configured + 2,
    configured + 3,
  ])).filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);
}

async function startGatewayWithFallback() {
  let lastError = null;
  for (const candidate of gatewayCandidates()) {
    const candidateUrl = `http://${hybridHost}:${candidate}`;
    const candidateGateway = createGateway({
      host: hybridHost,
      port: candidate,
      publicUrl: candidateUrl,
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

    try {
      const server = await candidateGateway.start();
      gateway = candidateGateway;
      gatewayServer = server;
      hybridPort = String(candidate);
      hybridUrl = candidateUrl;
      if (candidate !== Number(process.env.HYBRID_CORE_PORT || 3200)) {
        console.warn(
          `[swifly-hybrid] Port ${process.env.HYBRID_CORE_PORT || 3200} was busy; Hybrid Core moved to ${hybridUrl}.`,
        );
      }
      return { gateway, server, hybridUrl };
    } catch (error) {
      lastError = error;
      if (!error || error.code !== "EADDRINUSE") throw error;
      console.warn(`[swifly-hybrid] Hybrid port ${candidate} is already in use; trying another local port.`);
    }
  }
  throw lastError || new Error("No local port was available for the Hybrid Provider Core.");
}

async function warmBackends() {
  const [cineproResult, nuvioResult] = await Promise.all([
    cinepro.start(),
    startNuvioCore(),
  ]);

  console.log(
    `[swifly-hybrid] Backends ready: CinePro ${cineproResult.health ? "online" : "offline"} + Paregi Nuvio ${nuvioResult.health ? "online" : "offline"}.`,
  );
  console.log(`[swifly-hybrid] Nuvio provider ref ${setup.pinnedRef}.`);
  if (!cineproResult.health && !nuvioResult.health) {
    console.warn(
      "[swifly-hybrid] Both scraper backends are offline. Localhost remains available, but movie resolution will fail until one recovers.",
    );
  }
  return { cineproResult, nuvioResult };
}

function startBackendWarmup() {
  if (backendWarmupPromise) return backendWarmupPromise;
  backendWarmupPromise = new Promise((resolve) => {
    setImmediate(resolve);
  }).then(warmBackends).catch((error) => {
    console.error("[swifly-hybrid] Backend warm-up failed:", error.stack || error.message || error);
    return null;
  });
  return backendWarmupPromise;
}

async function start() {
  console.log("[swifly-hybrid] Starting localhost first; CinePro and Paregi Nuvio will warm in the background.");
  installLifecycle();

  await startGatewayWithFallback();
  configureCompatibilityClient();
  installPlayerPatches();

  const stablePlayback = require("./start-cinepro-stable-playback.js");
  if (!stablePlayback || typeof stablePlayback.start !== "function") {
    throw new TypeError("Hybrid startup could not load the stable Swifly player launcher.");
  }

  const swifly = stablePlayback.start();
  console.log("[swifly-hybrid] SwiflyTV localhost startup dispatched; open http://localhost:3001.");
  console.log(`[swifly-hybrid] Hybrid API is available at ${hybridUrl}.`);
  startBackendWarmup();
  return swifly;
}

module.exports = {
  childEnvironment,
  configureCompatibilityClient,
  getHybridUrl: () => hybridUrl,
  installPlayerPatches,
  readHealth,
  shutdown,
  start,
  startBackendWarmup,
  startGatewayWithFallback,
  startNuvioCore,
  warmBackends,
};

if (require.main === module) {
  start().catch((error) => {
    console.error("[swifly-hybrid] Startup failed:", error.stack || error.message || error);
    shutdown("SIGTERM");
    process.exit(1);
  });
}
