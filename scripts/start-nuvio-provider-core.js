"use strict";

const path = require("path");
const { spawn } = require("child_process");
const setup = require("./setup-nuvio-providers.js");

const root = path.resolve(__dirname, "..");
const coreScript = path.join(__dirname, "nuvio-provider-core.js");
const coreHost = String(process.env.NUVIO_CORE_HOST || "127.0.0.1");
const corePort = String(process.env.NUVIO_CORE_PORT || "3200");
const coreUrl = String(process.env.NUVIO_CORE_PUBLIC_URL || `http://${coreHost}:${corePort}`).replace(/\/+$/, "");
let coreChild = null;
let ownsCore = false;

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
  env.NUVIO_CORE_HOST = coreHost;
  env.NUVIO_CORE_PORT = corePort;
  env.NUVIO_CORE_PUBLIC_URL = coreUrl;
  return env;
}

async function readHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${coreUrl}/v1/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function startCore() {
  const current = await readHealth();
  if (current && current.status === "operational" && current.name === "Swifly Nuvio Provider Core") {
    console.log(`[swifly-nuvio] Using running Nuvio Provider Core at ${coreUrl}.`);
    return current;
  }

  setup.ensureNuvioProviders();
  console.log(`[swifly-nuvio] Starting pinned provider core at ${coreUrl}...`);
  coreChild = spawn(process.execPath, [coreScript], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: childEnvironment(),
  });
  ownsCore = true;

  coreChild.once("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[swifly-nuvio] Provider Core exited with code ${code}${signal ? ` (${signal})` : ""}.`);
    }
  });

  const deadline = Date.now() + Math.max(15_000, Number(process.env.NUVIO_CORE_START_TIMEOUT_MS || 90_000));
  while (Date.now() < deadline) {
    const health = await readHealth();
    if (health && health.status === "operational") {
      console.log(
        `[swifly-nuvio] Provider Core operational with ${health.providerCount || 0} enabled movie provider(s).`,
      );
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("Nuvio Provider Core did not become healthy before the startup timeout.");
}

function installPlayerPatches() {
  const allMedia = require("./start-cinepro-all-sources-captions-patch.js");
  if (!allMedia || typeof allMedia.installPatch !== "function") {
    throw new TypeError("Nuvio startup could not load the source/caption normalization patch.");
  }
  allMedia.installPatch();

  const directProxy = require("./start-cinepro-direct-source-proxy.js");
  if (!directProxy || typeof directProxy.installPatch !== "function") {
    throw new TypeError("Nuvio startup could not load the direct-source compatibility patch.");
  }
  directProxy.installPatch();

  const sourceList = require("./patch-cinepro-source-list.js");
  if (!sourceList || typeof sourceList.installPatch !== "function") {
    throw new TypeError("Nuvio startup could not load the complete Source-list patch.");
  }
  sourceList.installPatch();
}

function configureCompatibilityClient() {
  process.env.CINEPRO_ENABLED = "true";
  process.env.CINEPRO_STRICT = "true";
  process.env.CINEPRO_AUTO_START = "false";
  process.env.CINEPRO_CORE_URL = coreUrl;
  process.env.CINEPRO_PROVIDER_ALLOWLIST = "*";
  process.env.DEFAULT_PLAY_PROVIDER = "cinepro";
  process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT = "true";
  process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED = "false";
  process.env.SWIFLY_SCRAPER_BACKEND = "nuvio-providers";
}

function shutdown(signal) {
  if (ownsCore && coreChild && !coreChild.killed) {
    try { coreChild.kill(signal); } catch {}
  }
}

async function start() {
  console.log("[swifly-nuvio] Starting SwiflyTV with the pinned Nuvio provider backend.");
  const health = await startCore();
  configureCompatibilityClient();
  installPlayerPatches();

  console.log(
    `[swifly-nuvio] Nuvio backend ready at ${coreUrl}; CinePro provider processes will not be started.`,
  );
  console.log(
    `[swifly-nuvio] Provider ref ${health.providerRef || setup.pinnedRef}; ${health.providerCount || 0} enabled provider(s).`,
  );

  const stablePlayback = require("./start-cinepro-stable-playback.js");
  if (!stablePlayback || typeof stablePlayback.start !== "function") {
    throw new TypeError("Nuvio startup could not load the stable Swifly player launcher.");
  }
  return stablePlayback.start();
}

process.on("SIGINT", () => { shutdown("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { shutdown("SIGTERM"); process.exit(0); });
process.on("exit", () => shutdown("SIGTERM"));

module.exports = {
  childEnvironment,
  configureCompatibilityClient,
  coreUrl,
  installPlayerPatches,
  readHealth,
  start,
  startCore,
};

if (require.main === module) {
  start().catch((error) => {
    console.error("[swifly-nuvio] Startup failed:", error.stack || error.message || error);
    shutdown("SIGTERM");
    process.exit(1);
  });
}
