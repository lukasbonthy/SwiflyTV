"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const serverPath = path.join(root, "server.js");
const coreDir = path.join(root, "vendor", "cinepro-core");
const coreEntry = path.join(coreDir, "dist", "server.js");
const setupScript = path.join(root, "scripts", "setup-cinepro.js");
const corePort = String(process.env.CINEPRO_PORT || "3100");
const coreUrl = String(process.env.CINEPRO_CORE_URL || `http://127.0.0.1:${corePort}`).replace(/\/+$/, "");
const autoStart = process.env.CINEPRO_AUTO_START !== "false" && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(coreUrl);

process.env.CINEPRO_ENABLED = process.env.CINEPRO_ENABLED || "true";
process.env.CINEPRO_STRICT = process.env.CINEPRO_STRICT || "true";
process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "icefy,vixsrc";
process.env.CINEPRO_CORE_URL = coreUrl;
if (process.env.CINEPRO_ENABLED !== "false") {
  process.env.DEFAULT_PLAY_PROVIDER = "cinepro";
  process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT = "true";
  process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED = "false";
}

let coreChild = null;

function strictMode() {
  return process.env.CINEPRO_ENABLED !== "false" && process.env.CINEPRO_STRICT !== "false";
}

async function healthOkay() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${coreUrl}/v1/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data && (data.status === "operational" || data.status === "healthy" || data.spec === "omss"));
  } catch {
    return false;
  }
}

function ensureCoreInstalled() {
  if (fs.existsSync(coreEntry)) return;
  console.log("[cinepro] Local Core build is missing. Running one-time setup...");
  const result = spawnSync(process.execPath, [setupScript, "--build"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(coreEntry)) {
    throw new Error("CinePro Core setup failed. Run npm run cinepro:setup and retry.");
  }
}

function normalizedAllowlist() {
  const raw = String(process.env.CINEPRO_PROVIDER_ALLOWLIST || "icefy,vixsrc").trim();
  if (!raw || raw === "*") return [];
  return Array.from(new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function prepareFilteredCoreEntry() {
  const allowlist = normalizedAllowlist();
  if (!allowlist.length) {
    console.log("[cinepro] Provider allowlist disabled; loading every CinePro provider.");
    return coreEntry;
  }

  const distDir = path.dirname(coreEntry);
  const sourceProvidersDir = path.join(distDir, "providers");
  const filteredProvidersDir = path.join(distDir, ".swifly-providers");
  const runtimeEntry = path.join(distDir, "swifly-server.js");

  if (!fs.existsSync(sourceProvidersDir)) {
    throw new Error(`CinePro provider directory is missing: ${sourceProvidersDir}`);
  }

  fs.rmSync(filteredProvidersDir, { recursive: true, force: true });
  fs.mkdirSync(filteredProvidersDir, { recursive: true });

  const available = fs.readdirSync(sourceProvidersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const availableByLower = new Map(available.map((name) => [name.toLowerCase(), name]));
  const copied = [];

  for (const requested of allowlist) {
    const actual = availableByLower.get(requested);
    if (!actual) {
      console.warn(`[cinepro] Requested provider '${requested}' was not found and will be skipped.`);
      continue;
    }
    fs.cpSync(path.join(sourceProvidersDir, actual), path.join(filteredProvidersDir, actual), {
      recursive: true,
      force: true,
    });
    copied.push(actual);
  }

  if (!copied.length) {
    throw new Error(`None of the requested CinePro providers were found: ${allowlist.join(", ")}`);
  }

  let runtimeSource = fs.readFileSync(coreEntry, "utf8");
  const providerPathPattern = /path\.join\(__dirname,\s*["']\.\/providers\/?["']\)/;
  if (!providerPathPattern.test(runtimeSource)) {
    throw new Error("Could not patch CinePro provider discovery path for the Swifly allowlist.");
  }
  runtimeSource = runtimeSource.replace(providerPathPattern, 'path.join(__dirname, ".swifly-providers")');
  fs.writeFileSync(runtimeEntry, runtimeSource);

  console.log(`[cinepro] Fast provider allowlist: ${copied.join(", ")}`);
  return runtimeEntry;
}

async function startCoreIfNeeded() {
  if (!process.env.TMDB_API_KEY) {
    console.warn("[cinepro] TMDB_API_KEY is missing. Core and Swifly metadata requests will fail until it is added to .env.");
  }

  if (await healthOkay()) {
    console.log(`[cinepro] Using running Core instance at ${coreUrl}`);
    return;
  }

  if (!autoStart) {
    const message = `[cinepro] Core is not reachable at ${coreUrl}.`;
    if (strictMode()) throw new Error(`${message} CinePro strict mode prevents old provider fallback.`);
    console.warn(`${message} Swifly will use its existing fallback providers.`);
    return;
  }

  ensureCoreInstalled();
  const runtimeEntry = prepareFilteredCoreEntry();
  console.log(`[cinepro] Starting Core locally on ${coreUrl}...`);
  coreChild = spawn(process.execPath, [runtimeEntry], {
    cwd: coreDir,
    stdio: "inherit",
    windowsHide: false,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: corePort,
      PUBLIC_URL: coreUrl,
      CORS_ORIGIN: "*",
      CACHE_TYPE: process.env.CINEPRO_CACHE_TYPE || "memory",
      STREMIO_ADDON: "false",
      MCP_ENABLED: "false",
      NODE_ENV: process.env.NODE_ENV || "production",
    },
  });

  coreChild.once("exit", (code, signal) => {
    if (code && code !== 0) console.error(`[cinepro] Core exited with code ${code}${signal ? ` (${signal})` : ""}.`);
  });

  const deadline = Date.now() + Math.max(15_000, Number(process.env.CINEPRO_START_TIMEOUT_MS || 60_000));
  while (Date.now() < deadline) {
    if (await healthOkay()) {
      console.log("[cinepro] Core is operational.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  const message = "[cinepro] Core did not become healthy before the startup timeout.";
  if (strictMode()) throw new Error(`${message} CinePro strict mode prevents old provider fallback.`);
  console.warn(`${message} Swifly will still start with fallbacks available.`);
}

function replaceOnce(source, label, needle, replacement) {
  if (!source.includes(needle)) throw new Error(`[cinepro] Could not find ${label}; server.js was not modified.`);
  return source.replace(needle, replacement);
}

function runSwifly() {
  let source = fs.readFileSync(serverPath, "utf8").replace(/\r\n?/g, "\n");

  source = replaceOnce(
    source,
    "Express app declaration",
    "const app = express();",
    'const app = express();\nconst { fetchCineProSource, registerCineProBridge } = require("./cinepro-client");',
  );

  source = source.replace('DEFAULT_PLAY_PROVIDER: "streamprovider"', 'DEFAULT_PLAY_PROVIDER: "cinepro"');

  source = replaceOnce(
    source,
    "CinePro stream rate-limit exemption",
    '    skip: (req) => String(req.path || "").startsWith("/api/hls-proxy/"),',
    '    skip: (req) => String(req.path || "").startsWith("/api/hls-proxy/") || String(req.path || "").startsWith("/api/cinepro/stream/"),',
  );

  source = replaceOnce(
    source,
    "provider insertion point",
    "  // 0-streamprovider) Local StreamProvider-main any-media implementation.",
    `  // CinePro Core OMSS provider. CinePro strict mode prevents silent fallback.
  if (preferred === "cinepro" || providerOrder.includes("cinepro")) {
    try {
      console.log("[cinepro] Resolving " + mediaType + " TMDB " + id + (mediaType === "tv" ? " S" + season + "E" + episode : "") + "...");
      const cineproResult = await fetchCineProSource({ mediaType, id, season, episode, attempts });
      if (cineproResult) {
        console.log("[cinepro] Selected " + (cineproResult.streamName || "CinePro source") + (cineproResult.streamQuality ? " " + cineproResult.streamQuality : "") + ".");
        return cineproResult;
      }
      attempts.push("cinepro: no playable OMSS source returned");
    } catch (error) {
      attempts.push("cinepro: " + (error.message || "failed"));
    }

    if (process.env.CINEPRO_STRICT !== "false") {
      return {
        status: "error",
        message: attempts.slice(-3).join(" | ") || "CinePro Core did not return a playable stream.",
        attempts,
        apiProvider: "cinepro",
        providerKind: "cinepro_error"
      };
    }
  }

  // 0-streamprovider) Local StreamProvider-main any-media implementation.`,
  );

  source = replaceOnce(source, "CinePro source label", 'clientProxyVideoWait ? "waiting for m3u8/stream"', 'clientProxyVideoWait ? "waiting for CinePro"');
  source = replaceOnce(source, "CinePro waiting-card eyebrow", "<span>Getting m3u8</span>", "<span>Contacting CinePro</span>");
  source = replaceOnce(source, "CinePro waiting-card title", "<h2>Finding your m3u8 source...</h2>", "<h2>CinePro is finding a stream...</h2>");
  source = replaceOnce(
    source,
    "CinePro waiting-card description",
    "<p>This provider can take a while. Keep this page open — SwiflyTV will keep trying and load the m3u8 stream as soon as it returns.</p>",
    "<p>CinePro is checking its configured providers. Keep this page open — SwiflyTV will load the stream CinePro returns.</p>",
  );
  source = replaceOnce(
    source,
    "CinePro waiting-card initial status",
    '<div id="proxyVideoWaitStatus" class="dsProxyVideoWaitStatus">Starting request...</div>',
    '<div id="proxyVideoWaitStatus" class="dsProxyVideoWaitStatus">Starting CinePro request...</div>',
  );
  source = replaceOnce(
    source,
    "CinePro player loading label",
    '<div id="movieButtonHlsStatus" class="dsHlsStatus"><b>Loading m3u8...</b><span>Preparing player</span></div>',
    '<div id="movieButtonHlsStatus" class="dsHlsStatus"><b>Loading CinePro stream...</b><span>Preparing player</span></div>',
  );

  source = source.replace(
    'proxyVideoUrl ? "proxyVideo" : providerStream ? "ORG MP4" : movieEmbedUrl ? "Embed" : "Trailer fallback"',
    'clientProxyVideoWait ? "CinePro" : proxyVideoUrl ? "proxyVideo" : providerStream ? "ORG MP4" : movieEmbedUrl ? "Embed" : "Trailer fallback"',
  );

  source = replaceOnce(
    source,
    "CinePro wait timeout label",
    '            showError("Still no m3u8 source after " + elapsed + " seconds. You can retry, refresh, or use a Watch Room.");',
    '            showError("CinePro did not return a playable stream after " + elapsed + " seconds. Check /api/cinepro/health, then retry.");',
  );
  source = replaceOnce(
    source,
    "CinePro resolving label",
    '          setStatus((manual ? "Retrying" : "Trying") + " m3u8 source... attempt " + attempt + " • " + elapsed + "s");',
    '          setStatus((manual ? "Retrying CinePro" : "Contacting CinePro") + "... attempt " + attempt + " • " + elapsed + "s");',
  );
  source = replaceOnce(
    source,
    "CinePro success label",
    '              setStatus((isM3u8Selected || data.m3u8Embedded || data.streamType === "m3u8" ? "m3u8" : "Source") + " found. Loading player...");',
    '              setStatus((data && data.apiProvider === "cinepro" ? "CinePro stream" : (isM3u8Selected || data.m3u8Embedded || data.streamType === "m3u8" ? "HLS stream" : "Source")) + " found. Loading player...");',
  );
  source = replaceOnce(
    source,
    "CinePro player-ready label",
    '              setStatus("m3u8 loaded in Vidstack player.");',
    '              setStatus((data && data.apiProvider === "cinepro" ? "CinePro" : "HLS") + " stream loaded in Vidstack.");',
  );

  source = source.replace(
    "Movie mode is waiting for the same m3u8 player source used in Watch Parties. Legacy fallback is off unless MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=true.",
    "CinePro Core is resolving this title. The player will load the stream returned by CinePro.",
  );
  source = source.replace("<h2>m3u8 source did not load</h2>", "<h2>CinePro stream did not load</h2>");

  source = replaceOnce(
    source,
    "route registration point",
    'app.get("/welcome", welcomePage);',
    'registerCineProBridge(app);\n\napp.get("/welcome", welcomePage);',
  );

  const runtimeModule = new Module(serverPath, module);
  runtimeModule.filename = serverPath;
  runtimeModule.paths = Module._nodeModulePaths(root);
  runtimeModule._compile(source, serverPath);
}

function shutdown(signal) {
  if (coreChild && !coreChild.killed) {
    try { coreChild.kill(signal); } catch {}
  }
}

process.on("SIGINT", () => { shutdown("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { shutdown("SIGTERM"); process.exit(0); });
process.on("exit", () => shutdown("SIGTERM"));

(async () => {
  await startCoreIfNeeded();
  runSwifly();
})().catch((error) => {
  console.error("[cinepro] Startup failed:", error.stack || error.message || error);
  shutdown("SIGTERM");
  process.exit(1);
});
