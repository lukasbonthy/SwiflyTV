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
process.env.CINEPRO_CORE_URL = coreUrl;
process.env.DEFAULT_PLAY_PROVIDER = process.env.DEFAULT_PLAY_PROVIDER || "cinepro";
process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT = process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT || "true";

let coreChild = null;

async function healthOkay() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${coreUrl}/v1/health`, { signal: controller.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data && (data.status === "operational" || data.spec === "omss"));
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
  if (result.status !== 0 || !fs.existsSync(coreEntry)) {
    throw new Error("CinePro Core setup failed. Run npm run cinepro:setup and retry.");
  }
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
    console.warn(`[cinepro] Core is not reachable at ${coreUrl}; Swifly will use its existing fallback providers.`);
    return;
  }

  ensureCoreInstalled();
  console.log(`[cinepro] Starting Core locally on ${coreUrl}...`);
  coreChild = spawn(process.execPath, [coreEntry], {
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

  console.warn("[cinepro] Core did not become healthy before the timeout; Swifly will still start with fallbacks available.");
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
    "const app = express();\nconst { fetchCineProSource, registerCineProBridge } = require(\"./cinepro-client\");",
  );

  source = source.replace('DEFAULT_PLAY_PROVIDER: "streamprovider"', 'DEFAULT_PLAY_PROVIDER: "cinepro"');

  source = replaceOnce(
    source,
    "provider insertion point",
    "  // 0-streamprovider) Local StreamProvider-main any-media implementation.",
    `  // CinePro Core OMSS provider. This is primary; existing providers remain fallbacks.\n  if (preferred === "cinepro" || providerOrder.includes("cinepro")) {\n    try {\n      const cineproResult = await fetchCineProSource({ mediaType, id, season, episode, attempts });\n      if (cineproResult) return cineproResult;\n      attempts.push("cinepro: no playable OMSS source returned");\n    } catch (error) {\n      attempts.push(\`cinepro: \${error.message || "failed"}\`);\n    }\n  }\n\n  // 0-streamprovider) Local StreamProvider-main any-media implementation.`,
  );

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
