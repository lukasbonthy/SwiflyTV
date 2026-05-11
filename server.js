
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const http = require("http");
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const { Server } = require("socket.io");

const app = express();

const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || "SwiflyTV";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const BRAND_WORDMARK = process.env.BRAND_WORDMARK || "SWIFLYTV";
const BRAND_SUBMARK = process.env.BRAND_SUBMARK || "SWIFLYTV";

const CACHE_TTL = {
  short: 1000 * 60 * 5,
  medium: 1000 * 60 * 20,
  long: 1000 * 60 * 60 * 6,
};

const SWIFLYTV_SPOTLIGHT_TMDB_ID = process.env.SWIFLYTV_SPOTLIGHT_TMDB_ID || process.env.DROPSTREAM_SPOTLIGHT_TMDB_ID || "76479";
const memoryCache = new Map();
const watchRooms = new Map();
const remoteBrowserSessions = new Map();
let remoteBrowserEngine = null;
let remoteBrowserLaunchError = "";

app.disable("x-powered-by");

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: true,
    legacyHeaders: false,
  })
);


function normalizeRoomId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
}

function createRoomId() {
  return Math.random().toString(36).slice(2, 7) + "-" + Math.random().toString(36).slice(2, 7);
}

function publicRoom(room = {}) {
  return {
    id: room.id,
    name: room.name || "Watchroom",
    trailerUrl: room.trailerUrl || "",
    embedUrl: room.embedUrl || "",
    videoId: room.videoId || "",
    mediaKind: room.mediaKind || (room.videoId ? "youtube" : "embed"),
    browserUrl: room.browserUrl || "",
    openTogetherUrl: room.openTogetherUrl || "",
    openTogetherCountdownEndsAt: Number(room.openTogetherCountdownEndsAt || 0),
    syncedMovie: room.syncedMovie || { status: "idle", movieId: "", proxyVideo: "", playAt: 0, selectedBy: "", message: "", sync: { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() } },
    couplePlus: room.couplePlus || { ready: {}, moods: {}, notes: [], jar: [], tastes: {}, timeline: [], badges: [], theme: "midnight", missingYou: false, sleepy: false, pause: null },
    host: room.host || "Host",
    viewers: Number(room.viewers || 0),
    createdAt: Number(room.createdAt || Date.now()),
    movieTime: Math.max(0, Math.floor((Date.now() - Number(room.createdAt || Date.now())) / 1000)),
    updatedAt: room.updatedAt || Date.now(),
  };
}

function getOrCreateWatchRoom(roomId, data = {}) {
  const id = normalizeRoomId(roomId) || createRoomId();
  const existing = watchRooms.get(id);

  if (existing) {
    if (data.name) existing.name = String(data.name).slice(0, 80);
    if (data.trailerUrl) existing.trailerUrl = String(data.trailerUrl).slice(0, 500);
    if (data.embedUrl) existing.embedUrl = String(data.embedUrl).slice(0, 800);
    if (data.videoId) existing.videoId = String(data.videoId).slice(0, 40);
    if (data.mediaKind) existing.mediaKind = String(data.mediaKind).slice(0, 20);
    if (data.browserUrl) existing.browserUrl = normalizeSharedBrowserUrl(data.browserUrl).slice(0, 1000);
    if (data.host) existing.host = String(data.host).slice(0, 40);
    if (!existing.syncedMovie) existing.syncedMovie = { status: "idle", movieId: "", proxyVideo: "", playAt: 0, selectedBy: "", message: "", sync: { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() } };
    if (!existing.couplePlus) existing.couplePlus = { ready: {}, moods: {}, notes: [], jar: [], tastes: {}, timeline: [], badges: [], theme: "midnight", missingYou: false, sleepy: false, pause: null };
    existing.updatedAt = Date.now();
    return existing;
  }

  const now = Date.now();
  const room = {
    id,
    name: String(data.name || "SwiflyTV Date Room").slice(0, 80),
    trailerUrl: String(data.trailerUrl || "").slice(0, 500),
    embedUrl: String(data.embedUrl || data.trailerUrl || "").slice(0, 800),
    videoId: String(data.videoId || "").slice(0, 40),
    mediaKind: String(data.mediaKind || (data.videoId ? "youtube" : "embed")).slice(0, 20),
    browserUrl: normalizeSharedBrowserUrl(data.browserUrl || ""),
    openTogetherUrl: "",
    openTogetherCountdownEndsAt: 0,
    syncedMovie: { status: "idle", movieId: "", proxyVideo: "", playAt: 0, selectedBy: "", message: "", sync: { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() } },
    couplePlus: { ready: {}, moods: {}, notes: [], jar: [], tastes: {}, timeline: [], badges: [], theme: "midnight", missingYou: false, sleepy: false, pause: null },
    host: String(data.host || "Host").slice(0, 40),
    hostSocketId: "",
    viewers: 0,
    createdAt: now,
    state: { playing: false, time: 0, updatedAt: now },
    messages: [],
    updatedAt: now,
  };
  watchRooms.set(id, room);
  return room;
}

function roomMovieSeconds(room = {}) {
  return Math.max(0, Math.floor((Date.now() - Number(room.createdAt || Date.now())) / 1000));
}

function createMovieSyncState({ playing = false, offset = 0, startedAt = 0 } = {}) {
  const now = Date.now();
  return {
    playing: Boolean(playing),
    offset: Math.max(0, Number(offset || 0)),
    startedAt: Number(startedAt || 0),
    updatedAt: now,
  };
}

function currentSyncedMovieSeconds(movie = {}) {
  const sync = movie.sync || {};
  const offset = Math.max(0, Number(sync.offset || 0));
  if (!sync.playing || !sync.startedAt) return offset;
  return Math.max(0, offset + (Date.now() - Number(sync.startedAt || Date.now())) / 1000);
}

function ensureSyncedMovieSync(movie = {}) {
  if (!movie.sync) movie.sync = createMovieSyncState();
  return movie;
}

function normalizeSharedBrowserUrl(value = "") {
  let url = String(value || "").trim().slice(0, 1000);
  if (!url) return "";

  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) {
    return `https://${url}`;
  }

  return "";
}


function isPrivateIp(address = "") {
  const ipVersion = net.isIP(address);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0;
  }

  const lower = address.toLowerCase();
  return lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:");
}

async function normalizeRemoteBrowserUrl(value = "", req = null) {
  const raw = String(value || "").trim().slice(0, 1000);
  if (!raw) return "";

  let absolute = raw;
  if (raw.startsWith("/")) {
    const proto = req?.headers?.["x-forwarded-proto"] || "https";
    const host = req?.headers?.host || `localhost:${PORT}`;
    absolute = `${proto}://${host}${raw}`;
  } else if (!/^https?:\/\//i.test(raw) && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    absolute = `https://${raw}`;
  }

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return "";

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return "";
  if (net.isIP(hostname) && isPrivateIp(hostname)) return "";

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.some((entry) => isPrivateIp(entry.address))) return "";
  } catch {
    return "";
  }

  return parsed.toString();
}


function fileExistsSafe(filePath = "") {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findChromiumInDir(root = "", depth = 0) {
  if (!root || depth > 4) return "";
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      if (entry.isFile() && ["chrome", "chromium", "chromium-browser", "google-chrome"].includes(entry.name)) {
        return full;
      }
      if (entry.isDirectory()) {
        const found = findChromiumInDir(full, depth + 1);
        if (found) return found;
      }
    }
  } catch {}
  return "";
}

function findChromiumExecutable() {
  const explicit = process.env.REMOTE_BROWSER_EXECUTABLE_PATH || "";
  if (fileExistsSafe(explicit)) return explicit;

  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
  ];

  for (const candidate of candidates) {
    if (fileExistsSafe(candidate)) return candidate;
  }

  const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright";
  const fromPlaywrightPath = findChromiumInDir(browserPath);
  if (fromPlaywrightPath) return fromPlaywrightPath;

  return "";
}

async function getRemoteBrowserEngine() {
  if (remoteBrowserEngine) return remoteBrowserEngine;
  if (remoteBrowserLaunchError) throw new Error(remoteBrowserLaunchError);

  if (process.env.REMOTE_BROWSER_ENABLED !== "true") {
    throw new Error("Remote Browser is disabled. Set REMOTE_BROWSER_ENABLED=true.");
  }

  try {
    const { chromium } = require("playwright-core");

    if (process.env.REMOTE_BROWSER_WS_URL) {
      remoteBrowserEngine = await chromium.connectOverCDP(process.env.REMOTE_BROWSER_WS_URL);
      return remoteBrowserEngine;
    }

    const executablePath = findChromiumExecutable();
    if (!executablePath) {
      throw new Error("Chromium was not found. On Render, deploy this project with the included Dockerfile so Chromium is already installed.");
    }

    remoteBrowserEngine = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });

    return remoteBrowserEngine;
  } catch (error) {
    remoteBrowserLaunchError = error.message || String(error);
    throw error;
  }
}

async function getRemoteBrowserSession(room) {
  if (!room || !room.id) throw new Error("Missing watchroom.");
  const existing = remoteBrowserSessions.get(room.id);
  if (existing?.page) return existing;

  const browser = await getRemoteBrowserEngine();
  let context;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 SwiflyTVRemoteBrowser/1.0",
    });
  } catch {
    context = browser.contexts?.()[0];
    if (!context) throw new Error("Remote browser context could not be created.");
  }

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  const session = {
    roomId: room.id,
    context,
    page,
    url: "",
    streaming: false,
    interval: null,
  };

  remoteBrowserSessions.set(room.id, session);
  return session;
}

async function closeRemoteBrowserSession(roomId = "") {
  const id = normalizeRoomId(roomId);
  const session = remoteBrowserSessions.get(id);
  if (!session) return;

  clearInterval(session.interval);
  remoteBrowserSessions.delete(id);

  try {
    await session.context?.close();
  } catch {}
}

async function emitRemoteBrowserFrame(io, room, reason = "") {
  const session = remoteBrowserSessions.get(room.id);
  if (!session?.page) return;

  try {
    const buffer = await session.page.screenshot({
      type: "jpeg",
      quality: Number(process.env.REMOTE_BROWSER_JPEG_QUALITY || 58),
      fullPage: false,
    });

    io.to(room.id).emit("watchroom:remote-frame", {
      roomId: room.id,
      image: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      url: session.url || session.page.url(),
      reason,
      updatedAt: Date.now(),
    });
  } catch (error) {
    io.to(room.id).emit("watchroom:remote-status", {
      roomId: room.id,
      status: "error",
      message: error.message || "Remote browser screenshot failed.",
    });
  }
}

function ensureRemoteBrowserStream(io, room) {
  const session = remoteBrowserSessions.get(room.id);
  if (!session || session.streaming) return;

  session.streaming = true;
  const fps = Math.max(0.3, Math.min(3, Number(process.env.REMOTE_BROWSER_FPS || 1)));
  const intervalMs = Math.max(333, Math.floor(1000 / fps));

  session.interval = setInterval(() => {
    emitRemoteBrowserFrame(io, room).catch(() => {});
  }, intervalMs);
}



function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num) || min));
}

function pageNumber(value) {
  return clamp(value || 1, 1, 500);
}

function getYear(date = "") {
  return String(date || "").slice(0, 4) || "—";
}

function getTitle(item = {}) {
  return item.title || item.name || item.original_title || item.original_name || "Untitled";
}

function getDate(item = {}) {
  return item.release_date || item.first_air_date || "";
}

function getType(item = {}) {
  if (item.media_type) return item.media_type;
  if (item.first_air_date || item.name) return "tv";
  return "movie";
}

function formatRating(value) {
  const num = Number(value || 0);
  return num > 0 ? num.toFixed(1) : "—";
}

function formatRuntime(minutes = 0) {
  const total = Number(minutes || 0);
  if (!total) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return `${h}h ${m}m`;
}

function img(path, size = "w500") {
  return path ? `${TMDB_IMG}/${size}${path}` : "";
}

function backdrop(path, size = "w1280") {
  return path ? `${TMDB_IMG}/${size}${path}` : "";
}

function fullBackdrop(path) {
  return path ? `${TMDB_IMG}/original${path}` : "";
}

function toQuery(params = {}) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out.set(key, String(value));
  }
  return out.toString();
}

function cacheKey(endpoint, params = {}) {
  return `${endpoint}?${toQuery(params)}`;
}

function getCached(key) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expires) {
    memoryCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCached(key, value, ttl = CACHE_TTL.medium) {
  memoryCache.set(key, {
    value,
    expires: Date.now() + ttl,
  });
}

async function tmdb(endpoint, params = {}, ttl = CACHE_TTL.medium) {
  if (!TMDB_API_KEY) {
    return {
      __error: true,
      status: 500,
      message: "Missing TMDB_API_KEY. Add your TMDB key in Render environment variables.",
    };
  }

  const key = cacheKey(endpoint, params);
  const cached = getCached(key);
  if (cached) return cached;

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", params.language || "en-US");

  for (const [param, value] of Object.entries(params)) {
    if (param === "language") continue;
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(param, String(value));
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": `${SITE_NAME}/2.0`,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        __error: true,
        status: response.status,
        message: data.status_message || "TMDB request failed.",
        data,
      };
    }

    setCached(key, data, ttl);
    return data;
  } catch (error) {
    return {
      __error: true,
      status: 500,
      message: error.message || "Could not reach TMDB.",
    };
  }
}

function setupNeededPage(error = "") {
  return pageShell({
    title: `${SITE_NAME} Setup`,
    active: "",
    body: `
      <main class="setupPage">
        <section class="setupCard">
          <span class="eyebrow">Setup needed</span>
          <h1>Connect your TMDB API key.</h1>
          <p>${escapeHtml(error || "This site needs a TMDB_API_KEY environment variable before it can show movie data.")}</p>
          <div class="codePanel">
            <strong>Render environment variable</strong>
            <code>TMDB_API_KEY=your_tmdb_api_key_here</code>
          </div>
          <div class="setupGrid">
            <div><b>Build command</b><code>npm install</code></div>
            <div><b>Start command</b><code>npm start</code></div>
          </div>
        </section>
      </main>
    `,
  });
}

function navLink(href, label, key, active) {
  return `<a class="${active === key ? "active" : ""}" href="${href}">${label}</a>`;
}

function pageShell({ title = SITE_NAME, description = "Movie nights, date rooms, and synced watch plans for long-distance couples.", body = "", active = "", extraHead = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#050712" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <link rel="preconnect" href="https://image.tmdb.org" />
  <link rel="preconnect" href="https://www.youtube.com" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  ${extraHead}
  <style>
    :root {
      --bg: #050712;
      --bg2: #080d1a;
      --bg3: #101727;
      --text: #f8fafc;
      --muted: rgba(248,250,252,.66);
      --muted2: rgba(248,250,252,.45);
      --muted3: rgba(248,250,252,.28);
      --panel: rgba(255,255,255,.075);
      --panel2: rgba(255,255,255,.11);
      --panel3: rgba(255,255,255,.16);
      --border: rgba(255,255,255,.12);
      --border2: rgba(255,255,255,.20);
      --purple: #e50914;
      --pink: #ff6ea9;
      --cyan: #ffb3cf;
      --green: #4ade80;
      --yellow: #fbbf24;
      --red: #fb7185;
      --shadow: 0 28px 120px rgba(0,0,0,.48);
      --radius: 30px;
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
      background: var(--bg);
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(900px circle at 12% -8%, rgba(124,92,255,.33), transparent 45%),
        radial-gradient(900px circle at 94% 2%, rgba(53,215,255,.19), transparent 42%),
        radial-gradient(850px circle at 50% 105%, rgba(255,79,216,.13), transparent 50%),
        linear-gradient(180deg, #050712 0%, #080b15 42%, #050712 100%);
      overflow-x: hidden;
    }

    body.theme-red {
      --purple: #ef4444;
      --pink: #f97316;
      --cyan: #facc15;
    }

    body.theme-blue {
      --purple: #2563eb;
      --pink: #06b6d4;
      --cyan: #93c5fd;
    }

    body.theme-green {
      --purple: #10b981;
      --pink: #84cc16;
      --cyan: #67e8f9;
    }

    body.theme-mono {
      --purple: #ffffff;
      --pink: #b8c0cc;
      --cyan: #e5e7eb;
    }

    body.reduceMotion *,
    body.reduceMotion *::before,
    body.reduceMotion *::after {
      animation: none !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -3;
      pointer-events: none;
      background:
        linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
      background-size: 52px 52px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,.85), transparent 76%);
    }

    body::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -2;
      pointer-events: none;
      background:
        radial-gradient(circle at 50% 50%, transparent 0, rgba(0,0,0,.28) 100%);
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    img {
      max-width: 100%;
      display: block;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    .container {
      width: min(1240px, calc(100vw - 34px));
      margin-inline: auto;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(5,7,18,.70);
      backdrop-filter: blur(22px) saturate(1.15);
      -webkit-backdrop-filter: blur(22px) saturate(1.15);
      border-bottom: 1px solid rgba(255,255,255,.075);
    }

    .nav {
      display: grid;
      grid-template-columns: auto minmax(240px, 520px) auto;
      gap: 18px;
      align-items: center;
      min-height: 78px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: #fff;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 22px;
      letter-spacing: -.05em;
      font-weight: 800;
    }

    .brandIcon {
      width: 44px;
      height: 44px;
      border-radius: 17px;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 30% 10%, rgba(255,255,255,.36), transparent 38%),
        linear-gradient(135deg, var(--purple), var(--cyan));
      color: white;
      box-shadow: 0 16px 54px rgba(124,92,255,.33);
      font-size: 18px;
    }

    .searchForm {
      position: relative;
      width: 100%;
    }

    .searchForm input {
      width: 100%;
      min-height: 48px;
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.075);
      padding: 0 54px 0 18px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    }

    .searchForm input::placeholder {
      color: rgba(255,255,255,.42);
    }

    .searchForm button {
      position: absolute;
      right: 6px;
      top: 6px;
      bottom: 6px;
      width: 40px;
      border-radius: 999px;
      border: 0;
      color: white;
      background: linear-gradient(135deg, var(--purple), var(--cyan));
      cursor: pointer;
      font-weight: 950;
    }

    .navLinks {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
    }

    .navLinks a {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      padding: 9px 12px;
      border-radius: 999px;
      color: rgba(255,255,255,.62);
      font-size: 13px;
      font-weight: 850;
      border: 1px solid transparent;
    }

    .navLinks a:hover,
    .navLinks a.active {
      color: #fff;
      background: rgba(255,255,255,.075);
      border-color: rgba(255,255,255,.08);
    }

    .mobileNav {
      display: none;
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(12px + var(--safe-bottom));
      z-index: 1000;
      border-radius: 24px;
      background: rgba(5,7,18,.82);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 22px 90px rgba(0,0,0,.44);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 8px;
    }

    .mobileNav a {
      flex: 1;
      min-height: 46px;
      display: grid;
      place-items: center;
      border-radius: 16px;
      color: rgba(255,255,255,.68);
      font-size: 11px;
      font-weight: 900;
    }

    .mobileNav a.active {
      color: white;
      background: rgba(255,255,255,.08);
    }

    .eyebrow,
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 8px 12px;
      border-radius: 999px;
      color: rgba(255,255,255,.72);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .hero {
      position: relative;
      min-height: 700px;
      display: grid;
      align-items: center;
      overflow: hidden;
      isolation: isolate;
    }

    .heroBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      opacity: .58;
      filter: saturate(1.1);
      transform: scale(1.05);
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(90deg, rgba(5,7,18,.98) 0%, rgba(5,7,18,.82) 32%, rgba(5,7,18,.30) 100%),
        linear-gradient(to top, #050712 0%, rgba(5,7,18,.72) 18%, transparent 70%, rgba(5,7,18,.88) 100%);
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto 0 0;
      z-index: -1;
      height: 260px;
      background: linear-gradient(to top, #050712, transparent);
    }

    .heroGrid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 330px;
      gap: 34px;
      align-items: center;
      padding: 70px 0 54px;
    }

    .heroCopy h1 {
      margin: 18px 0 0;
      max-width: 910px;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(56px, 9vw, 118px);
      line-height: .86;
      letter-spacing: -.095em;
    }

    .shine {
      background: linear-gradient(90deg, #fff 0%, #a9efff 32%, #d4c5ff 58%, #fff 100%);
      -webkit-background-clip: text;
      color: transparent;
    }

    .heroCopy p {
      max-width: 720px;
      margin: 22px 0 0;
      color: rgba(255,255,255,.68);
      font-size: 17px;
      line-height: 1.78;
      font-weight: 650;
    }

    .heroActions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      min-height: 48px;
      padding: 13px 18px;
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      font-weight: 900;
      font-size: 14px;
      cursor: pointer;
    }

    .btn.primary {
      border: 0;
      background:
        radial-gradient(130px circle at 22% 0%, rgba(255,255,255,.28), transparent 44%),
        linear-gradient(135deg, var(--purple), var(--cyan));
      box-shadow: 0 20px 70px rgba(124,92,255,.32);
    }

    .btn.danger {
      background: rgba(251,113,133,.12);
      border-color: rgba(251,113,133,.22);
    }

    .heroPoster {
      position: relative;
      overflow: hidden;
      border-radius: 34px;
      aspect-ratio: 2 / 3;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: var(--shadow);
      transform: rotate(2deg);
    }

    .heroPoster img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .heroPoster::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,.72), transparent 50%);
    }

    .heroPosterBadge {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 14px;
      z-index: 2;
      padding: 14px;
      border-radius: 22px;
      background: rgba(5,7,18,.64);
      border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .heroPosterBadge strong {
      display: block;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 22px;
      line-height: .98;
      letter-spacing: -.05em;
    }

    .heroPosterBadge span {
      display: block;
      margin-top: 6px;
      color: rgba(255,255,255,.62);
      font-size: 12px;
      font-weight: 800;
    }

    .statsRow {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 28px;
      max-width: 760px;
    }

    .statCard {
      padding: 16px;
      border-radius: 22px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
    }

    .statCard b {
      display: block;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 29px;
      letter-spacing: -.06em;
      line-height: .9;
    }

    .statCard span {
      display: block;
      margin-top: 7px;
      color: rgba(255,255,255,.46);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .section {
      padding: 18px 0;
    }

    .sectionHead {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin: 44px 0 16px;
    }

    .sectionHead span {
      display: block;
      color: rgba(255,255,255,.42);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 8px;
    }

    .sectionHead h2 {
      margin: 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(32px, 4.5vw, 58px);
      line-height: .92;
      letter-spacing: -.07em;
    }

    .sectionHead a,
    .sectionHead button {
      flex: 0 0 auto;
      min-height: 40px;
      padding: 10px 13px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.72);
      font-size: 13px;
      font-weight: 900;
      cursor: pointer;
    }

    .movieRail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(164px, 192px);
      gap: 14px;
      overflow-x: auto;
      overflow-y: visible;
      padding: 4px 2px 18px;
      scroll-snap-type: x mandatory;
      scrollbar-width: thin;
    }

    .movieGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(164px, 1fr));
      gap: 18px;
      padding: 14px 0 70px;
    }

    .movieCard {
      min-width: 0;
      scroll-snap-align: start;
    }

    .posterWrap {
      position: relative;
      display: block;
      aspect-ratio: 2 / 3;
      overflow: hidden;
      border-radius: 23px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 16px 48px rgba(0,0,0,.30);
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .posterWrap:hover {
      transform: translateY(-7px) scale(1.018);
      border-color: rgba(255,255,255,.24);
      box-shadow: 0 32px 80px rgba(0,0,0,.42), 0 0 50px rgba(124,92,255,.20);
    }

    .posterWrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .posterFallback {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 20% 0%, rgba(255,255,255,.14), transparent 36%),
        linear-gradient(135deg, rgba(124,92,255,.36), rgba(53,215,255,.14));
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 48px;
      font-weight: 900;
    }

    .posterShade {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,.70), transparent 48%);
      opacity: .95;
    }

    .ratingPill,
    .typePill {
      position: absolute;
      z-index: 3;
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      padding: 6px 9px;
      border-radius: 999px;
      background: rgba(0,0,0,.62);
      border: 1px solid rgba(255,255,255,.14);
      color: white;
      font-size: 12px;
      font-weight: 900;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .ratingPill {
      left: 10px;
      bottom: 10px;
    }

    .typePill {
      left: 10px;
      top: 10px;
      color: rgba(255,255,255,.78);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .watchButton {
      position: absolute;
      right: 10px;
      top: 10px;
      z-index: 4;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(0,0,0,.58);
      color: white;
      font-size: 18px;
      font-weight: 950;
      cursor: pointer;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .watchButton.saved {
      background: linear-gradient(135deg, var(--purple), var(--cyan));
    }

    .movieInfo {
      padding: 11px 4px 0;
    }

    .movieInfo h3 {
      margin: 0;
      font-size: 14px;
      line-height: 1.25;
      font-weight: 900;
    }

    .movieInfo h3 a:hover {
      text-decoration: underline;
      text-underline-offset: 4px;
    }

    .movieInfo p {
      margin: 5px 0 0;
      color: rgba(255,255,255,.45);
      font-size: 12px;
      font-weight: 780;
    }

    .genreStrip,
    .filterBar {
      display: flex;
      gap: 9px;
      overflow-x: auto;
      padding: 16px 0 6px;
    }

    .genreStrip a,
    .filterBar a,
    .filterBar button,
    .filterBar select {
      white-space: nowrap;
      min-height: 42px;
      padding: 10px 13px;
      border-radius: 999px;
      color: rgba(255,255,255,.75);
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 13px;
      font-weight: 850;
      cursor: pointer;
    }

    .filterBar a.active {
      color: #fff;
      background: linear-gradient(135deg, rgba(124,92,255,.38), rgba(53,215,255,.14));
      border-color: rgba(255,255,255,.20);
    }

    .pageHero {
      padding: 52px 0 12px;
    }

    .pageHero h1 {
      margin: 16px 0 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(46px, 8vw, 92px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .pageHero p {
      max-width: 720px;
      color: rgba(255,255,255,.62);
      line-height: 1.75;
      font-size: 16px;
      font-weight: 650;
    }

    .pagination {
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 10px 0 80px;
    }

    .pagination a {
      min-height: 44px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.72);
      font-weight: 900;
    }

    .detailHero {
      position: relative;
      min-height: 720px;
      display: grid;
      align-items: end;
      padding: 170px 0 54px;
      overflow: hidden;
      isolation: isolate;
    }

    .detailBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      filter: saturate(1.07);
      transform: scale(1.04);
      opacity: .75;
    }

    .detailHero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, #050712 0%, rgba(5,7,18,.90) 24%, rgba(5,7,18,.38) 72%, rgba(5,7,18,.88) 100%),
        linear-gradient(90deg, rgba(5,7,18,.95), rgba(5,7,18,.42));
    }

    .detailGrid {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 30px;
      align-items: end;
    }

    .detailPoster {
      border-radius: 30px;
      overflow: hidden;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: var(--shadow);
    }

    .detailPoster img {
      width: 100%;
    }

    .detailContent h1 {
      margin: 16px 0 0;
      max-width: 1020px;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(48px, 8vw, 108px);
      line-height: .86;
      letter-spacing: -.095em;
    }

    .tagline {
      margin-top: 12px;
      color: rgba(255,255,255,.58);
      font-size: 18px;
      line-height: 1.5;
      font-style: italic;
    }

    .metaLine {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin: 18px 0;
    }

    .metaLine span,
    .detailGenre {
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.74);
      font-size: 12px;
      font-weight: 850;
    }

    .overview {
      max-width: 880px;
      color: rgba(255,255,255,.72);
      font-size: 16px;
      line-height: 1.78;
      font-weight: 620;
    }

    .detailStats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
      max-width: 860px;
    }

    .detailStat {
      padding: 14px;
      border-radius: 20px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.09);
    }

    .detailStat b {
      display: block;
      color: #fff;
      font-size: 18px;
      font-weight: 950;
    }

    .detailStat span {
      display: block;
      color: rgba(255,255,255,.45);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 900;
      margin-top: 5px;
    }

    .infoGrid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
      gap: 18px;
      margin-top: 28px;
    }

    .infoPanel {
      padding: 24px;
      border-radius: 28px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
    }

    .infoPanel h2 {
      margin: 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 34px;
      letter-spacing: -.06em;
      line-height: .95;
    }

    .infoPanel p {
      color: rgba(255,255,255,.64);
      line-height: 1.75;
      font-weight: 620;
    }

    .factsList {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    .factRow {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.62);
      font-size: 14px;
    }

    .factRow strong {
      color: white;
      text-align: right;
    }

    .trailerGrid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .trailerCard {
      overflow: hidden;
      border-radius: 24px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 18px 60px rgba(0,0,0,.24);
    }

    .trailerCard iframe {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 0;
    }

    .personHero {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 30px;
      align-items: center;
      padding: 54px 0 28px;
    }

    .personPhoto {
      aspect-ratio: 2 / 3;
      border-radius: 30px;
      overflow: hidden;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: var(--shadow);
    }

    .personPhoto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .personContent h1 {
      margin: 16px 0 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(52px, 9vw, 104px);
      line-height: .86;
      letter-spacing: -.09em;
    }

    .personContent p {
      color: rgba(255,255,255,.65);
      line-height: 1.75;
      font-size: 16px;
    }

    .emptyState,
    .setupCard,
    .errorState {
      margin: 48px auto;
      max-width: 920px;
      padding: 30px;
      border-radius: 30px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.66);
      line-height: 1.7;
    }

    .setupPage {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .setupCard h1,
    .errorState h1 {
      margin: 16px 0 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: clamp(42px, 8vw, 84px);
      line-height: .9;
      letter-spacing: -.08em;
      color: white;
    }

    .codePanel,
    .setupGrid div {
      margin-top: 18px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(0,0,0,.24);
      border: 1px solid rgba(255,255,255,.10);
    }

    code {
      display: block;
      margin-top: 8px;
      color: #b8f7ff;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .setupGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .footer {
      margin-top: 48px;
      padding: 30px 0 110px;
      border-top: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.44);
      font-size: 12px;
      line-height: 1.6;
    }

    .footerGrid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
    }

    .footerLinks {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .footerLinks a,
    .footerLinks button {
      color: rgba(255,255,255,.58);
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 999px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .controlDock {
      position: fixed;
      right: 16px;
      bottom: calc(16px + var(--safe-bottom));
      z-index: 1002;
      display: grid;
      gap: 10px;
    }

    .controlButton {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.13);
      color: white;
      background: rgba(5,7,18,.78);
      box-shadow: 0 16px 50px rgba(0,0,0,.34);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      cursor: pointer;
      font-weight: 950;
    }

    .controlPanel {
      position: fixed;
      right: 16px;
      bottom: calc(76px + var(--safe-bottom));
      width: min(330px, calc(100vw - 32px));
      display: none;
      padding: 14px;
      border-radius: 24px;
      background: rgba(5,7,18,.90);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: var(--shadow);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .controlPanel.open {
      display: block;
    }

    .controlPanel h3 {
      margin: 0;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 28px;
      letter-spacing: -.06em;
    }

    .controlPanel p {
      color: rgba(255,255,255,.55);
      font-size: 12px;
      line-height: 1.5;
    }

    .themeGrid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 9px;
    }

    .themeGrid button {
      min-height: 70px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.10);
      color: white;
      background: rgba(255,255,255,.06);
      cursor: pointer;
      font-weight: 900;
    }

    .toast {
      position: fixed;
      left: 50%;
      bottom: calc(24px + var(--safe-bottom));
      transform: translateX(-50%) translateY(18px);
      z-index: 1200;
      opacity: 0;
      pointer-events: none;
      padding: 12px 15px;
      border-radius: 999px;
      color: white;
      background: rgba(5,7,18,.86);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 18px 60px rgba(0,0,0,.38);
      backdrop-filter: blur(18px);
      font-size: 13px;
      font-weight: 860;
      transition: opacity .18s ease, transform .18s ease;
    }

    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    @media (max-width: 1050px) {
      .nav {
        grid-template-columns: auto 1fr;
      }

      .searchForm {
        grid-column: 1 / -1;
        order: 3;
      }

      .navLinks {
        justify-content: end;
      }

      .heroGrid,
      .detailGrid,
      .personHero,
      .infoGrid {
        grid-template-columns: 1fr;
      }

      .heroPoster,
      .detailPoster,
      .personPhoto {
        max-width: 280px;
      }

      .statsRow,
      .detailStats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 720px) {
      .nav {
        min-height: auto;
        padding: 12px 0;
      }

      .navLinks {
        display: none;
      }

      .mobileNav {
        display: flex;
      }

      .brand {
        font-size: 20px;
      }

      .brandIcon {
        width: 40px;
        height: 40px;
      }

      .hero {
        min-height: auto;
      }

      .heroGrid {
        padding: 36px 0 26px;
      }

      .heroCopy h1 {
        font-size: 58px;
      }

      .movieRail {
        grid-auto-columns: minmax(142px, 156px);
      }

      .movieGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .posterWrap {
        border-radius: 18px;
      }

      .sectionHead {
        align-items: start;
        display: grid;
      }

      .sectionHead h2 {
        font-size: 36px;
      }

      .pageHero h1,
      .detailContent h1,
      .personContent h1 {
        font-size: 54px;
      }

      .detailHero {
        min-height: auto;
        padding: 90px 0 34px;
      }

      .detailPoster,
      .personPhoto {
        max-width: 190px;
      }

      .statsRow,
      .detailStats,
      .setupGrid {
        grid-template-columns: 1fr;
      }

      .controlDock {
        right: 12px;
        bottom: calc(84px + var(--safe-bottom));
      }

      .controlPanel {
        right: 12px;
        bottom: calc(144px + var(--safe-bottom));
      }
    }
    .heroCopy .eyebrow,
    .pageHero .eyebrow,
    .detailContent .eyebrow,
    .personContent .eyebrow {
      background: rgba(229,9,20,.14);
      border-color: rgba(255,120,145,.24);
      color: #ffd9e2;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }

    .topbar {
      background: rgba(9, 4, 8, .78);
      border-bottom-color: rgba(255,255,255,.06);
    }

    .brandIcon {
      font-family: "Space Grotesk", Inter, sans-serif;
      font-weight: 900;
      font-size: 20px;
      letter-spacing: -.08em;
    }

    .heroCopy h1,
    .detailContent h1,
    .personContent h1,
    .sectionHead h2,
    .pageHero h1 {
      text-shadow: 0 8px 38px rgba(0,0,0,.24);
    }

    .heroCopy p,
    .pageHero p,
    .overview,
    .infoPanel p {
      color: rgba(255,255,255,.75);
    }

    .heroPoster,
    .detailPoster,
    .personPhoto,
    .posterWrap,
    .infoPanel,
    .statCard,
    .detailStat {
      box-shadow: 0 18px 60px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.02) inset;
    }

    .heroPoster::before {
      content: "Tonight's Pick";
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 2;
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(229,9,20,.92), rgba(255,110,169,.92));
      color: white;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      box-shadow: 0 12px 30px rgba(229,9,20,.25);
    }

    .netflixMiniRow {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 12px;
      margin-top: 18px;
      max-width: 860px;
    }

    .netflixMiniCard {
      padding: 14px 16px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .netflixMiniCard b {
      display: block;
      font-size: 13px;
      font-weight: 900;
      color: #fff;
    }

    .netflixMiniCard span {
      display: block;
      margin-top: 6px;
      color: rgba(255,255,255,.62);
      font-size: 12px;
      line-height: 1.55;
      font-weight: 760;
    }

    .moodGrid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin: 24px 0 10px;
    }

    .moodTile {
      position: relative;
      overflow: hidden;
      display: block;
      min-height: 160px;
      padding: 18px;
      border-radius: 28px;
      background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 22px 60px rgba(0,0,0,.22);
    }

    .moodTile::before {
      content: "";
      position: absolute;
      inset: auto -40px -50px auto;
      width: 130px;
      height: 130px;
      border-radius: 999px;
      background: rgba(255,255,255,.10);
      filter: blur(6px);
    }

    .moodTile:nth-child(1) { background: linear-gradient(135deg, rgba(229,9,20,.34), rgba(255,110,169,.16)); }
    .moodTile:nth-child(2) { background: linear-gradient(135deg, rgba(255,165,95,.26), rgba(255,212,153,.12)); }
    .moodTile:nth-child(3) { background: linear-gradient(135deg, rgba(232,121,249,.24), rgba(255,179,207,.10)); }
    .moodTile:nth-child(4) { background: linear-gradient(135deg, rgba(16,185,129,.24), rgba(94,234,212,.10)); }

    .moodTile span {
      position: relative;
      z-index: 1;
      display: block;
      color: rgba(255,255,255,.62);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .moodTile strong {
      position: relative;
      z-index: 1;
      display: block;
      margin-top: 18px;
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 28px;
      line-height: .95;
      letter-spacing: -.06em;
      color: #fff;
    }

    .moodTile p {
      position: relative;
      z-index: 1;
      margin: 10px 0 0;
      color: rgba(255,255,255,.70);
      line-height: 1.5;
      font-size: 13px;
      font-weight: 700;
      max-width: 240px;
    }

    .section.netflixSection .sectionHead h2 {
      position: relative;
    }

    .section.netflixSection .sectionHead h2::after {
      content: "";
      display: block;
      width: 84px;
      height: 4px;
      margin-top: 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--purple), var(--pink));
      box-shadow: 0 6px 24px rgba(229,9,20,.30);
    }

    .cuteNote {
      margin-top: 16px;
      color: rgba(255,220,229,.86);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -.02em;
    }

    @media (max-width: 980px) {
      .moodGrid,
      .netflixMiniRow {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 720px) {
      .moodGrid,
      .netflixMiniRow {
        grid-template-columns: 1fr;
      }

      .moodTile {
        min-height: 138px;
      }
    }

    body::before {
      background: none;
      mask-image: none;
    }

    .netflixTopbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,.72), rgba(0,0,0,.16) 70%, transparent);
      border-bottom: 0;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .netflixNav {
      grid-template-columns: 1fr auto;
      gap: 18px;
      min-height: 68px;
      padding-top: 6px;
    }

    .navLeftCluster {
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
    }

    .netflixBrand {
      gap: 0;
      flex: 0 0 auto;
    }

    .netflixBrandIcon {
      width: auto;
      height: auto;
      border-radius: 0;
      background: none;
      box-shadow: none;
      color: #e50914;
      font-family: Inter, system-ui, sans-serif;
      font-size: 44px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -.08em;
    }

    .netflixLinks {
      justify-content: flex-start;
      gap: 6px;
      flex-wrap: wrap;
    }

    .netflixLinks a {
      min-height: 32px;
      padding: 6px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent !important;
      color: rgba(255,255,255,.88);
      font-size: 13px;
      font-weight: 700;
    }

    .netflixLinks a.active,
    .netflixLinks a:hover {
      color: #fff;
      opacity: 1;
    }

    .navRightCluster {
      display: flex;
      align-items: center;
      gap: 14px;
      color: white;
      font-size: 14px;
      font-weight: 700;
    }

    .iconLink,
    .textLink,
    .caretTiny {
      color: rgba(255,255,255,.94);
      font-size: 13px;
      font-weight: 700;
    }

    .iconLink {
      font-size: 24px;
      line-height: 1;
    }

    .profilePill {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      display: grid;
      place-items: center;
      background: #1f80ff;
      color: white;
      font-size: 17px;
      font-weight: 900;
      box-shadow: 0 8px 20px rgba(0,0,0,.25);
    }

    .mobileSearchForm {
      display: none;
      grid-column: 1 / -1;
    }

    .showcaseHero {
      position: relative;
      min-height: 100vh;
      display: flex;
      align-items: flex-end;
      padding: 0 0 58px;
      overflow: hidden;
      isolation: isolate;
    }

    .showcaseHeroBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center center;
      transform: scale(1.01);
      filter: saturate(1.02);
    }

    .showcaseHero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.42) 26%, rgba(0,0,0,.12) 54%, rgba(0,0,0,.58) 100%),
        linear-gradient(90deg, rgba(0,0,0,.70) 0%, rgba(0,0,0,.26) 36%, rgba(0,0,0,.02) 78%);
    }

    .showcaseInner {
      width: min(1380px, calc(100vw - 44px));
      margin: 0 auto;
    }

    .showcaseCopy {
      max-width: 560px;
      padding-top: 120px;
    }

    .showcaseKicker {
      margin-bottom: 14px;
      color: rgba(255,255,255,.86);
      font-size: 19px;
      font-weight: 700;
      text-shadow: 0 2px 16px rgba(0,0,0,.28);
    }

    .showcaseTitle {
      margin: 0;
      color: white;
      font-size: clamp(68px, 10vw, 118px);
      line-height: .9;
      letter-spacing: -.08em;
      font-family: "Space Grotesk", Inter, sans-serif;
      text-shadow: 0 10px 40px rgba(0,0,0,.32);
    }

    .showcaseTitleSmall {
      display: block;
      color: rgba(255,255,255,.94);
      font-size: .70em;
    }

    .showcaseDesc {
      margin-top: 18px;
      max-width: 620px;
      color: rgba(255,255,255,.90);
      font-size: 21px;
      line-height: 1.48;
      font-weight: 540;
      text-shadow: 0 2px 20px rgba(0,0,0,.28);
    }

    .showcaseButtons {
      display: flex;
      gap: 14px;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .showcaseBtn,
    .showcaseBtnSecondary {
      min-height: 56px;
      padding: 14px 26px;
      border-radius: 4px;
      font-size: 16px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      border: 0;
      box-shadow: 0 16px 30px rgba(0,0,0,.18);
    }

    .showcaseBtn {
      background: white;
      color: #111;
    }

    .showcaseBtnSecondary {
      background: rgba(109,109,110,.68);
      color: white;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .showcasePlay,
    .showcaseInfo {
      font-size: 24px;
      line-height: 1;
      font-weight: 900;
    }

    .showcaseMaturity {
      position: absolute;
      right: 0;
      bottom: 156px;
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 14px 22px 14px 18px;
      background: rgba(51,51,51,.56);
      border-left: 4px solid rgba(255,255,255,.76);
      color: white;
      font-size: 18px;
      font-weight: 800;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .showcaseMute {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      border: 2px solid rgba(255,255,255,.76);
      font-size: 18px;
      font-weight: 900;
    }

    .showcaseRowWrap {
      position: relative;
      margin-top: -46px;
      padding-bottom: 54px;
    }

    .showcaseRowTitle {
      margin: 0 0 12px;
      color: white;
      font-size: 38px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -.04em;
    }

    .showcaseRail .movieCard { min-width: 0; }
    .showcaseRail { grid-auto-columns: minmax(210px, 270px); gap: 8px; padding-bottom: 12px; }
    .showcaseRail .posterWrap { border-radius: 2px; aspect-ratio: 16 / 9; box-shadow: 0 10px 30px rgba(0,0,0,.30); }
    .showcaseRail .movieInfo,
    .showcaseRail .typePill,
    .showcaseRail .ratingPill,
    .showcaseRail .watchButton,
    .showcaseRail .posterShade { display: none; }

    @media (max-width: 1050px) {
      .netflixNav { grid-template-columns: 1fr; gap: 10px; }
      .navRightCluster { justify-content: flex-end; }
      .showcaseHero { min-height: 88vh; }
      .showcaseDesc { font-size: 18px; }
      .showcaseMaturity { bottom: 120px; }
    }

    @media (max-width: 720px) {
      .netflixTopbar { background: rgba(0,0,0,.72); }
      .netflixLinks { display: none; }
      .navRightCluster { display: none; }
      .mobileSearchForm { display: block; }
      .showcaseHero { min-height: 82vh; padding-bottom: 24px; }
      .showcaseInner { width: min(100vw - 24px, 680px); }
      .showcaseCopy { max-width: 100%; padding-top: 96px; }
      .showcaseKicker { font-size: 14px; }
      .showcaseTitle { font-size: 58px; }
      .showcaseDesc { font-size: 15px; max-width: 100%; }
      .showcaseButtons { gap: 10px; }
      .showcaseBtn, .showcaseBtnSecondary { min-height: 46px; padding: 10px 18px; font-size: 14px; }
      .showcaseMaturity { position: static; margin-top: 18px; width: fit-content; padding: 10px 14px; gap: 10px; font-size: 14px; }
      .showcaseMute { width: 38px; height: 38px; font-size: 15px; }
      .showcaseRowWrap { margin-top: 0; }
      .showcaseRowTitle { font-size: 24px; }
      .showcaseRail { grid-auto-columns: minmax(170px, 210px); }
    }


    /* ============================================================
       v5 Full Netflix Accuracy Pass
       Applies the Netflix-like language beyond the homepage.
       ============================================================ */

    body {
      background: #050505 !important;
    }

    .container {
      width: min(1460px, calc(100vw - 74px));
    }

    .netflixPageHero {
      position: relative;
      padding: 138px 0 34px;
      min-height: 330px;
      display: grid;
      align-items: end;
      overflow: hidden;
    }

    .netflixPageHero::before {
      content: "";
      position: absolute;
      inset: 0 calc(50% - 50vw);
      z-index: -2;
      background:
        linear-gradient(to top, #050505 0%, rgba(5,5,5,.58) 36%, rgba(5,5,5,.86) 100%),
        radial-gradient(900px circle at 18% 22%, rgba(229,9,20,.26), transparent 45%),
        linear-gradient(135deg, rgba(75,0,0,.64), rgba(0,0,0,.0));
    }

    .netflixPageHero .eyebrow {
      background: rgba(229,9,20,.14);
      border-color: rgba(229,9,20,.32);
      color: rgba(255,255,255,.84);
    }

    .netflixPageHero h1 {
      margin: 16px 0 0;
      font-family: Inter, system-ui, sans-serif;
      font-size: clamp(44px, 6.2vw, 82px);
      line-height: .95;
      letter-spacing: -.055em;
      color: #fff;
      text-shadow: 0 9px 36px rgba(0,0,0,.32);
    }

    .netflixPageHero p {
      max-width: 740px;
      margin: 14px 0 0;
      color: rgba(255,255,255,.70);
      font-size: 17px;
      line-height: 1.6;
      font-weight: 520;
    }

    .netflixCatalog,
    .netflixPeopleCatalog {
      padding-bottom: 50px;
    }

    .netflixCatalog .movieGrid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 9px;
      padding-top: 10px;
    }

    .netflixCatalog .posterWrap {
      aspect-ratio: 16 / 9;
      border-radius: 3px;
      border: 0;
      background: #141414;
      box-shadow: none;
    }

    .netflixCatalog .posterWrap:hover {
      transform: scale(1.055);
      z-index: 10;
      box-shadow: 0 20px 46px rgba(0,0,0,.55);
      border-color: transparent;
    }

    .netflixCatalog .posterShade {
      background: linear-gradient(to top, rgba(0,0,0,.74), transparent 54%);
    }

    .netflixCatalog .typePill,
    .netflixCatalog .ratingPill {
      border-radius: 3px;
      background: rgba(0,0,0,.66);
      border: 1px solid rgba(255,255,255,.12);
    }

    .netflixCatalog .watchButton {
      border-radius: 999px;
      width: 32px;
      height: 32px;
      background: rgba(20,20,20,.78);
      border: 2px solid rgba(255,255,255,.48);
    }

    .netflixCatalog .movieInfo {
      padding: 8px 2px 0;
    }

    .netflixCatalog .movieInfo h3 {
      font-size: 13px;
      font-weight: 800;
    }

    .netflixCatalog .movieInfo p {
      color: rgba(255,255,255,.52);
    }

    .netflixPeopleCatalog .movieGrid {
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 12px;
    }

    .netflixPeopleCatalog .posterWrap {
      border-radius: 4px;
      border: 0;
      background: #141414;
    }

    .filterBar,
    .genreStrip {
      gap: 8px;
      padding: 10px 0 16px;
    }

    .filterBar a,
    .filterBar button,
    .filterBar select,
    .genreStrip a {
      border-radius: 3px;
      min-height: 38px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.16);
      color: rgba(255,255,255,.82);
      font-size: 13px;
      font-weight: 700;
    }

    .filterBar a.active,
    .genreStrip a:hover,
    .filterBar a:hover {
      color: white;
      background: rgba(229,9,20,.82);
      border-color: rgba(229,9,20,.9);
    }

    .pagination {
      padding-top: 18px;
    }

    .pagination a {
      border-radius: 3px;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.16);
      color: #fff;
    }

    .emptyState,
    .errorState {
      border-radius: 4px;
      background: #141414;
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.72);
    }

    .detailHero {
      min-height: 100vh;
      padding: 180px 0 76px;
      align-items: end;
    }

    .detailHero::before {
      background:
        linear-gradient(to top, #050505 0%, rgba(5,5,5,.72) 29%, rgba(5,5,5,.20) 68%, rgba(5,5,5,.82) 100%),
        linear-gradient(90deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.42) 42%, rgba(0,0,0,.08) 82%);
    }

    .detailBg {
      opacity: .88;
      filter: saturate(1.02);
      transform: scale(1.015);
    }

    .detailGrid {
      display: block;
      max-width: 900px;
    }

    .detailPoster {
      display: none;
    }

    .detailContent .eyebrow {
      border-radius: 3px;
      background: rgba(229,9,20,.82);
      border-color: rgba(229,9,20,.92);
      color: #fff;
    }

    .detailContent h1 {
      font-family: Inter, system-ui, sans-serif;
      font-size: clamp(58px, 8.4vw, 112px);
      line-height: .88;
      letter-spacing: -.07em;
      max-width: 920px;
    }

    .tagline {
      font-size: 20px;
      color: rgba(255,255,255,.84);
      text-shadow: 0 2px 18px rgba(0,0,0,.4);
    }

    .overview {
      max-width: 760px;
      color: rgba(255,255,255,.88);
      font-size: 18px;
      line-height: 1.55;
      font-weight: 520;
      text-shadow: 0 2px 24px rgba(0,0,0,.40);
    }

    .metaLine span,
    .detailGenre {
      border-radius: 3px;
      background: rgba(0,0,0,.42);
      border-color: rgba(255,255,255,.18);
      color: rgba(255,255,255,.88);
    }

    .detailStats {
      max-width: 760px;
    }

    .detailStat {
      border-radius: 4px;
      background: rgba(20,20,20,.58);
      border: 1px solid rgba(255,255,255,.12);
    }

    .detailStat b {
      font-size: 20px;
    }

    .detailContent .btn {
      border-radius: 4px;
      min-height: 54px;
      padding: 13px 22px;
      background: rgba(109,109,110,.68);
      border: 0;
      color: #fff;
      font-size: 16px;
    }

    .detailContent .btn.primary {
      background: #fff;
      color: #111;
      box-shadow: none;
    }

    .infoGrid {
      grid-template-columns: 1.2fr .8fr;
      gap: 12px;
    }

    .infoPanel {
      border-radius: 4px;
      background: #141414;
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: none;
    }

    .infoPanel h2,
    .trainingQuiz h2,
    .trainingRecords h2 {
      font-family: Inter, system-ui, sans-serif;
      letter-spacing: -.045em;
    }

    .factRow {
      border-bottom-color: rgba(255,255,255,.08);
    }

    .trailerCard {
      border-radius: 4px;
      border: 0;
      background: #141414;
      box-shadow: 0 18px 44px rgba(0,0,0,.35);
    }

    .personHero {
      position: relative;
      min-height: 70vh;
      padding-top: 140px;
      align-items: end;
    }

    .personHero::before {
      content: "";
      position: absolute;
      inset: 0 calc(50% - 50vw);
      z-index: -2;
      background:
        linear-gradient(to top, #050505 0%, rgba(5,5,5,.62) 34%, rgba(5,5,5,.86) 100%),
        radial-gradient(760px circle at 18% 36%, rgba(229,9,20,.24), transparent 48%);
    }

    .personPhoto {
      border-radius: 4px;
      border: 0;
      max-width: 280px;
    }

    .personContent h1 {
      font-family: Inter, system-ui, sans-serif;
      letter-spacing: -.07em;
    }

    .personContent .btn {
      border-radius: 4px;
    }

    .footer {
      background: #050505;
      border-top: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.48);
    }

    .footerLinks a,
    .footerLinks button {
      border-radius: 3px;
      background: transparent;
    }

    .controlDock,
    .controlPanel {
      display: none;
    }

    @media(max-width: 1050px) {
      .container {
        width: min(100vw - 34px, 980px);
      }

      .netflixCatalog .movieGrid {
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      }

      .infoGrid {
        grid-template-columns: 1fr;
      }
    }

    @media(max-width: 720px) {
      .container {
        width: min(100vw - 24px, 680px);
      }

      .netflixPageHero {
        padding-top: 116px;
        min-height: 260px;
      }

      .netflixPageHero h1 {
        font-size: 42px;
      }

      .netflixPageHero p {
        font-size: 14px;
      }

      .netflixCatalog .movieGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 7px;
      }

      .netflixCatalog .movieInfo h3 {
        font-size: 12px;
      }

      .detailHero {
        min-height: 82vh;
        padding-top: 118px;
        padding-bottom: 30px;
      }

      .detailContent h1 {
        font-size: 48px;
      }

      .overview {
        font-size: 15px;
      }

      .detailStats {
        grid-template-columns: repeat(2, minmax(0,1fr));
      }

      .personHero {
        grid-template-columns: 1fr;
        padding-top: 112px;
      }

      .personPhoto {
        max-width: 170px;
      }
    }


    /* ============================================================
       v6 Screenshot-Accurate Netflix Category Pages
       Matches TV Shows / Movies browse pages closer to the provided image.
       ============================================================ */

    .browseHero {
      position: relative;
      min-height: 100vh;
      display: flex;
      align-items: flex-end;
      padding: 82px 0 132px;
      overflow: hidden;
      isolation: isolate;
      background: #050505;
    }

    .browseHeroBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center center;
      transform: scale(1.01);
      filter: saturate(.96) brightness(.82);
    }

    .browseHero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, #050505 0%, rgba(5,5,5,.72) 16%, rgba(5,5,5,.22) 45%, rgba(5,5,5,.54) 100%),
        linear-gradient(90deg, rgba(0,0,0,.80) 0%, rgba(0,0,0,.42) 34%, rgba(0,0,0,.06) 76%);
    }

    .browseHeroTop {
      position: absolute;
      top: 88px;
      left: max(44px, calc((100vw - 1380px) / 2));
      right: max(44px, calc((100vw - 1380px) / 2));
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 26px;
    }

    .browseHeroTop h1 {
      margin: 0;
      color: #fff;
      font-family: Inter, system-ui, sans-serif;
      font-size: clamp(30px, 3.6vw, 48px);
      line-height: 1;
      letter-spacing: -.04em;
      font-weight: 760;
      text-shadow: 0 4px 24px rgba(0,0,0,.35);
    }

    .genreDropdown {
      position: relative;
    }

    .genreDropdown summary {
      list-style: none;
      display: inline-flex;
      align-items: center;
      gap: 28px;
      min-height: 38px;
      padding: 0 12px;
      border: 1px solid rgba(255,255,255,.86);
      background: rgba(0,0,0,.70);
      color: #fff;
      font-size: 15px;
      font-weight: 760;
      cursor: pointer;
      user-select: none;
    }

    .genreDropdown summary::-webkit-details-marker {
      display: none;
    }

    .genreDropdownMenu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      z-index: 50;
      display: grid;
      grid-template-columns: repeat(2, minmax(150px, 1fr));
      gap: 2px;
      width: 360px;
      max-height: 420px;
      overflow: auto;
      padding: 10px;
      background: rgba(0,0,0,.92);
      border: 1px solid rgba(255,255,255,.20);
      box-shadow: 0 18px 54px rgba(0,0,0,.55);
    }

    .genreDropdownMenu a {
      display: block;
      padding: 8px 10px;
      color: rgba(255,255,255,.82);
      font-size: 13px;
      font-weight: 640;
    }

    .genreDropdownMenu a:hover {
      color: white;
      text-decoration: underline;
    }

    .browseHeroContent {
      width: min(1380px, calc(100vw - 88px));
      margin: 0 auto;
      position: relative;
      z-index: 3;
    }

    .browseLogoTitle {
      margin: 0;
      max-width: 760px;
      color: white;
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      font-size: clamp(72px, 12vw, 190px);
      line-height: .82;
      letter-spacing: -.06em;
      text-transform: uppercase;
      text-shadow: 0 10px 42px rgba(0,0,0,.50);
    }

    .browseTopRank {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 20px;
      color: white;
      text-shadow: 0 3px 20px rgba(0,0,0,.35);
    }

    .top10Badge {
      display: grid;
      place-items: center;
      width: 42px;
      height: 48px;
      border-radius: 4px;
      background: #e50914;
      color: white;
      font-size: 11px;
      line-height: .9;
      font-weight: 950;
      text-align: center;
      text-transform: uppercase;
      box-shadow: 0 10px 25px rgba(0,0,0,.28);
    }

    .browseTopRank strong {
      font-size: clamp(20px, 2.2vw, 30px);
      letter-spacing: -.03em;
      font-weight: 850;
    }

    .browseDesc {
      max-width: 620px;
      margin: 16px 0 0;
      color: rgba(255,255,255,.92);
      font-size: clamp(16px, 1.5vw, 22px);
      line-height: 1.42;
      font-weight: 560;
      text-shadow: 0 3px 24px rgba(0,0,0,.52);
    }

    .browseButtons {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 26px;
      flex-wrap: wrap;
    }

    .browsePlay,
    .browseInfo {
      min-height: 56px;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 0 28px;
      border-radius: 4px;
      border: 0;
      font-size: 18px;
      font-weight: 850;
      box-shadow: 0 12px 26px rgba(0,0,0,.18);
    }

    .browsePlay {
      background: #fff;
      color: #000;
    }

    .browseInfo {
      background: rgba(109,109,110,.72);
      color: #fff;
    }

    .browsePlayIcon,
    .browseInfoIcon {
      font-size: 28px;
      line-height: 1;
      font-weight: 950;
    }

    .browseMaturity {
      position: absolute;
      right: 0;
      bottom: 178px;
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 18px;
      color: white;
    }

    .browseMute {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,.76);
      background: rgba(0,0,0,.10);
      font-size: 19px;
      backdrop-filter: blur(4px);
    }

    .browseRating {
      min-width: 112px;
      min-height: 46px;
      display: flex;
      align-items: center;
      padding-left: 18px;
      border-left: 4px solid rgba(255,255,255,.78);
      background: rgba(51,51,51,.58);
      font-size: 18px;
      font-weight: 760;
    }

    .browseRows {
      position: relative;
      z-index: 5;
      margin-top: -112px;
      padding-bottom: 70px;
    }

    .browseRows .showcaseInner {
      width: min(1380px, calc(100vw - 88px));
    }

    .browseRows .showcaseRowTitle {
      font-size: clamp(22px, 2vw, 32px);
      margin: 0 0 12px;
    }

    .browseRows .showcaseRail {
      grid-auto-columns: minmax(220px, 292px);
      gap: 8px;
      margin-bottom: 26px;
      padding-bottom: 18px;
    }

    .browseRows .showcaseRail .posterWrap {
      aspect-ratio: 16 / 9;
      border-radius: 2px;
    }

    .browseRows .showcaseRail .posterWrap:hover {
      transform: scale(1.085);
      z-index: 20;
    }

    @media(max-width: 900px) {
      .browseHero {
        min-height: 86vh;
        padding-bottom: 92px;
      }

      .browseHeroTop {
        top: 92px;
        left: 22px;
        right: 22px;
        gap: 14px;
        flex-wrap: wrap;
      }

      .browseHeroContent,
      .browseRows .showcaseInner {
        width: min(100vw - 28px, 720px);
      }

      .browseLogoTitle {
        font-size: clamp(54px, 16vw, 102px);
      }

      .browseDesc {
        font-size: 15px;
        max-width: 94%;
      }

      .browsePlay,
      .browseInfo {
        min-height: 46px;
        padding: 0 17px;
        font-size: 15px;
      }

      .browseMaturity {
        position: static;
        margin-top: 18px;
        width: fit-content;
      }

      .browseRating {
        min-width: 78px;
        min-height: 38px;
        font-size: 14px;
      }

      .browseMute {
        width: 38px;
        height: 38px;
      }

      .genreDropdownMenu {
        width: min(340px, calc(100vw - 44px));
        grid-template-columns: 1fr;
      }

      .browseRows {
        margin-top: -52px;
      }

      .browseRows .showcaseRail {
        grid-auto-columns: minmax(170px, 220px);
      }
    }


    /* ============================================================
       v7 Netflix Accuracy Everywhere
       Makes search, trending, genres, watchlist, details, and cards use the same streaming-site language.
       ============================================================ */

    .netflixWordmark {
      color: #e50914;
      font-family: Inter, system-ui, sans-serif;
      font-size: 31px;
      line-height: 1;
      font-weight: 950;
      letter-spacing: -.06em;
      text-shadow: 0 2px 14px rgba(0,0,0,.24);
    }

    .netflixBrandIcon {
      display: none;
    }

    .netflixNav {
      width: min(100vw - 76px, 1600px);
      margin: 0 auto;
    }

    .netflixCatalogHeader {
      position: sticky;
      top: 68px;
      z-index: 80;
      padding: 14px 0;
      margin-bottom: 8px;
      background: linear-gradient(to bottom, rgba(5,5,5,.94), rgba(5,5,5,.72), transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .netflixCatalogHeaderInner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .netflixCatalogHeader h2 {
      margin: 0;
      color: white;
      font-size: clamp(24px, 2.7vw, 42px);
      line-height: 1;
      letter-spacing: -.045em;
      font-weight: 780;
    }

    .netflixTabRow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .netflixTabRow a {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 3px;
      color: rgba(255,255,255,.70);
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 13px;
      font-weight: 750;
    }

    .netflixTabRow a.active,
    .netflixTabRow a:hover {
      color: white;
      border-color: rgba(255,255,255,.22);
      background: rgba(255,255,255,.10);
    }

    .netflixSearchPage {
      padding: 132px 0 72px;
      min-height: 72vh;
    }

    .netflixSearchBox {
      max-width: 760px;
      margin-bottom: 28px;
    }

    .netflixSearchBox label {
      display: block;
      margin-bottom: 12px;
      color: rgba(255,255,255,.70);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: .02em;
    }

    .netflixSearchBox form {
      position: relative;
    }

    .netflixSearchBox input {
      width: 100%;
      min-height: 56px;
      padding: 0 60px 0 18px;
      border-radius: 3px;
      color: white;
      border: 1px solid rgba(255,255,255,.28);
      background: rgba(0,0,0,.62);
      outline: 0;
      font-size: 17px;
    }

    .netflixSearchBox button {
      position: absolute;
      top: 6px;
      right: 6px;
      bottom: 6px;
      width: 46px;
      border: 0;
      border-radius: 3px;
      color: white;
      background: #e50914;
      font-size: 20px;
      cursor: pointer;
    }

    .netflixSearchTitle {
      margin: 0 0 18px;
      color: white;
      font-size: clamp(26px, 3.2vw, 44px);
      line-height: 1;
      letter-spacing: -.045em;
      font-weight: 760;
    }

    .netflixGenresPage {
      padding: 132px 0 70px;
    }

    .netflixGenreGroup {
      margin-bottom: 34px;
    }

    .netflixGenreGroup h2 {
      margin: 0 0 14px;
      color: white;
      font-size: clamp(24px, 3vw, 38px);
      letter-spacing: -.04em;
    }

    .netflixGenreGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 8px;
    }

    .netflixGenreCard {
      min-height: 88px;
      display: flex;
      align-items: end;
      padding: 14px;
      border-radius: 3px;
      color: white;
      background:
        linear-gradient(to top, rgba(0,0,0,.42), transparent),
        linear-gradient(135deg, rgba(229,9,20,.48), rgba(70,0,0,.68));
      border: 1px solid rgba(255,255,255,.08);
      font-size: 15px;
      font-weight: 850;
      transition: transform .16s ease, filter .16s ease;
    }

    .netflixGenreCard:nth-child(3n + 2) {
      background:
        linear-gradient(to top, rgba(0,0,0,.42), transparent),
        linear-gradient(135deg, rgba(88,28,135,.58), rgba(15,23,42,.70));
    }

    .netflixGenreCard:nth-child(3n + 3) {
      background:
        linear-gradient(to top, rgba(0,0,0,.42), transparent),
        linear-gradient(135deg, rgba(15,118,110,.44), rgba(20,20,20,.70));
    }

    .netflixGenreCard:hover {
      transform: scale(1.035);
      filter: brightness(1.12);
    }

    .netflixDetailTabs {
      display: flex;
      gap: 22px;
      margin: 36px 0 16px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .netflixDetailTabs a {
      padding: 0 0 12px;
      color: rgba(255,255,255,.64);
      font-size: 15px;
      font-weight: 850;
    }

    .netflixDetailTabs a:first-child {
      color: #fff;
      border-bottom: 4px solid #e50914;
    }

    .netflixMoreLikeThis {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 10px;
      margin: 14px 0 30px;
    }

    .netflixMoreLikeThis .movieCard .posterWrap {
      border-radius: 3px;
      aspect-ratio: 16 / 9;
      border: 0;
    }

    .netflixMoreLikeThis .movieInfo {
      display: none;
    }

    .netflixDetailSectionTitle {
      margin: 42px 0 14px;
      color: white;
      font-size: clamp(25px, 2.8vw, 38px);
      letter-spacing: -.045em;
      font-weight: 780;
    }

    .netflixEpisodeList {
      display: grid;
      gap: 0;
      border-top: 1px solid rgba(255,255,255,.10);
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .netflixEpisodeRow {
      display: grid;
      grid-template-columns: 44px 180px minmax(0,1fr);
      gap: 16px;
      align-items: center;
      min-height: 106px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.78);
    }

    .netflixEpisodeRow:last-child {
      border-bottom: 0;
    }

    .netflixEpisodeNumber {
      text-align: center;
      color: rgba(255,255,255,.56);
      font-size: 24px;
      font-weight: 650;
    }

    .netflixEpisodeThumb {
      aspect-ratio: 16 / 9;
      border-radius: 3px;
      overflow: hidden;
      background: #141414;
    }

    .netflixEpisodeThumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .netflixEpisodeInfo strong {
      display: block;
      color: white;
      font-size: 15px;
      margin-bottom: 5px;
    }

    .netflixEpisodeInfo p {
      margin: 0;
      color: rgba(255,255,255,.58);
      line-height: 1.45;
      font-size: 13px;
    }

    .netflixWatchlistHelp {
      color: rgba(255,255,255,.58);
      margin: -8px 0 18px;
      font-size: 14px;
      line-height: 1.55;
    }

    .watchlistEmptyNetflix {
      min-height: 280px;
      display: grid;
      place-items: center;
      text-align: center;
      background: #141414;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 3px;
      color: rgba(255,255,255,.66);
      padding: 28px;
    }

    .watchlistEmptyNetflix strong {
      display: block;
      color: white;
      font-size: 24px;
      margin-bottom: 8px;
    }

    .personHero.netflixPersonHero {
      min-height: 86vh;
      padding-top: 150px;
      padding-bottom: 70px;
      grid-template-columns: 270px minmax(0, 760px);
    }

    .netflixPeopleCatalog .posterWrap {
      aspect-ratio: 1 / 1;
      border-radius: 3px;
    }

    .netflixPeopleCatalog .posterWrap img {
      object-fit: cover;
    }

    @media(max-width: 720px) {
      .netflixWordmark {
        font-size: 25px;
      }

      .netflixNav {
        width: min(100vw - 24px, 680px);
      }

      .netflixCatalogHeader {
        position: static;
        padding-top: 0;
      }

      .netflixCatalogHeaderInner {
        display: grid;
      }

      .netflixSearchPage,
      .netflixGenresPage {
        padding-top: 112px;
      }

      .netflixGenreGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .netflixGenreCard {
        min-height: 74px;
        font-size: 13px;
      }

      .netflixEpisodeRow {
        grid-template-columns: 32px minmax(96px, 126px) minmax(0, 1fr);
        gap: 10px;
      }

      .netflixEpisodeInfo p {
        display: none;
      }

      .netflixMoreLikeThis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 7px;
      }

      .personHero.netflixPersonHero {
        grid-template-columns: 1fr;
        min-height: auto;
      }
    }


    /* ============================================================
       v8 Almost 1:1 Streaming Layout Pass
       Focuses on spacing, rows, hover cards, top 10 rows, detail pages, profiles, and browse pages.
       ============================================================ */

    :root {
      --nf-bg: #141414;
      --nf-deep: #000;
      --nf-red: #e50914;
      --nf-text: #fff;
      --nf-muted: #b3b3b3;
      --nf-row-left: max(4vw, 44px);
      --nf-row-right: max(4vw, 44px);
    }

    html,
    body {
      background: var(--nf-bg) !important;
    }

    body::after {
      display: none;
    }

    .container,
    .showcaseInner,
    .browseHeroContent,
    .browseRows .showcaseInner {
      width: calc(100vw - (var(--nf-row-left) + var(--nf-row-right))) !important;
      max-width: none !important;
      margin-left: var(--nf-row-left) !important;
      margin-right: var(--nf-row-right) !important;
    }

    .netflixTopbar {
      height: 68px;
      background: linear-gradient(to bottom, rgba(0,0,0,.78), rgba(0,0,0,.36) 62%, rgba(0,0,0,0));
      transition: background .22s ease;
    }

    .netflixTopbar::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: rgba(0,0,0,.18);
      opacity: 0;
    }

    .netflixNav {
      height: 68px;
      min-height: 68px;
      width: calc(100vw - 8vw) !important;
      margin: 0 4vw !important;
      padding: 0 !important;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
    }

    .netflixWordmark {
      display: inline-block;
      color: var(--nf-red);
      font-family: Arial Black, Inter, system-ui, sans-serif;
      font-size: 30px;
      line-height: 1;
      font-weight: 950;
      letter-spacing: -.075em;
      transform: scaleX(.94);
      text-shadow: none;
    }

    .netflixLinks {
      gap: 2px;
    }

    .netflixLinks a {
      padding: 5px 8px;
      color: #e5e5e5;
      font-size: 14px;
      font-weight: 550;
      transition: color .16s ease;
    }

    .netflixLinks a.active {
      color: #fff;
      font-weight: 800;
    }

    .netflixLinks a:hover {
      color: #b3b3b3;
    }

    .navRightCluster {
      gap: 18px;
    }

    .iconLink {
      font-size: 28px;
      font-weight: 400;
    }

    .textLink {
      font-size: 14px;
      font-weight: 650;
    }

    .profilePill {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      background:
        radial-gradient(circle at 35% 28%, #75b7ff 0 24%, transparent 25%),
        linear-gradient(135deg, #1366d6, #0e8cff);
      font-size: 0;
      position: relative;
    }

    .profilePill::before {
      content: "";
      width: 16px;
      height: 8px;
      border: 2px solid rgba(255,255,255,.92);
      border-top: 0;
      border-radius: 0 0 12px 12px;
      transform: translateY(5px);
    }

    .caretTiny {
      margin-left: -10px;
      font-size: 11px;
    }

    .showcaseHero,
    .browseHero {
      min-height: 100vh;
      padding-bottom: 14vh;
      background: #141414;
    }

    .showcaseHeroBg,
    .browseHeroBg,
    .detailBg {
      filter: saturate(.96) brightness(.84);
      transform: scale(1.02);
    }

    .showcaseHero::before,
    .browseHero::before {
      background:
        linear-gradient(to top, #141414 0%, rgba(20,20,20,.90) 6%, rgba(20,20,20,.45) 24%, rgba(20,20,20,.04) 54%, rgba(0,0,0,.50) 100%),
        linear-gradient(90deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.40) 36%, rgba(0,0,0,.06) 78%);
    }

    .showcaseCopy,
    .browseHeroContent {
      padding-top: 18vh;
    }

    .showcaseTitle,
    .browseLogoTitle {
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      font-weight: 950;
      letter-spacing: -.075em;
      text-transform: uppercase;
      max-width: 760px;
      text-shadow: 0 8px 28px rgba(0,0,0,.45);
    }

    .showcaseTitleSmall {
      font-size: .70em;
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      letter-spacing: -.07em;
    }

    .showcaseDesc,
    .browseDesc {
      max-width: 640px;
      color: rgba(255,255,255,.92);
      font-size: clamp(18px, 1.45vw, 24px);
      line-height: 1.34;
      font-weight: 500;
    }

    .showcaseBtn,
    .showcaseBtnSecondary,
    .browsePlay,
    .browseInfo {
      border-radius: 4px !important;
      min-height: 56px !important;
      padding: 0 28px !important;
      font-size: 18px !important;
      font-weight: 750 !important;
    }

    .showcaseBtn,
    .browsePlay {
      background: #fff !important;
      color: #000 !important;
    }

    .showcaseBtn:hover,
    .browsePlay:hover {
      background: rgba(255,255,255,.76) !important;
    }

    .showcaseBtnSecondary,
    .browseInfo {
      background: rgba(109,109,110,.70) !important;
      color: #fff !important;
    }

    .showcaseBtnSecondary:hover,
    .browseInfo:hover {
      background: rgba(109,109,110,.50) !important;
    }

    .showcaseMaturity,
    .browseMaturity {
      bottom: 18vh;
    }

    .showcaseRating,
    .browseRating {
      background: rgba(51,51,51,.62);
      border-left: 4px solid #dcdcdc;
    }

    .showcaseRowWrap,
    .browseRows {
      margin-top: -13vh;
      z-index: 20;
      position: relative;
    }

    .showcaseRowTitle,
    .nfRowTitle {
      margin: 0 0 .65vw;
      color: #e5e5e5;
      font-size: clamp(20px, 1.55vw, 30px);
      font-weight: 760;
      letter-spacing: -.025em;
      line-height: 1.15;
    }

    .movieRail,
    .nfRail,
    .showcaseRail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: calc((100vw - 8vw - 30px) / 6);
      gap: 6px;
      overflow-x: auto;
      overflow-y: visible;
      padding: 0 0 42px;
      margin-bottom: -18px;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }

    .movieRail::-webkit-scrollbar,
    .nfRail::-webkit-scrollbar,
    .showcaseRail::-webkit-scrollbar {
      display: none;
    }

    .nfRowSection {
      position: relative;
      margin-bottom: 10px;
      z-index: 30;
    }

    .nfTitleCard {
      position: relative;
      scroll-snap-align: start;
      z-index: 1;
    }

    .nfTitleCard:hover {
      z-index: 60;
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap {
      aspect-ratio: 16 / 9 !important;
      border-radius: 3px !important;
      background: #222 !important;
      border: 0 !important;
      box-shadow: none !important;
      overflow: hidden;
      transition: transform .18s ease, box-shadow .18s ease;
    }

    .nfThumb img,
    .showcaseRail .posterWrap img,
    .netflixCatalog .posterWrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .nfThumb:hover,
    .showcaseRail .posterWrap:hover,
    .browseRows .showcaseRail .posterWrap:hover,
    .netflixCatalog .posterWrap:hover {
      transform: scale(1.42) translateY(-9%);
      box-shadow: 0 18px 45px rgba(0,0,0,.55) !important;
      transition-delay: .22s;
    }

    .nfHoverPanel {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 5;
      opacity: 0;
      transform: translateY(100%);
      min-height: 104px;
      padding: 10px;
      background: #181818;
      box-shadow: 0 18px 45px rgba(0,0,0,.55);
      transition: opacity .14s ease .22s, transform .14s ease .22s;
    }

    .nfThumb:hover .nfHoverPanel {
      opacity: 1;
      transform: translateY(100%);
    }

    .nfHoverControls {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 8px;
    }

    .nfRoundPlay,
    .nfRoundBtn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 1.5px solid rgba(255,255,255,.68);
      color: white;
      background: rgba(42,42,42,.78);
      font-size: 13px;
      font-weight: 900;
    }

    .nfRoundPlay {
      background: white;
      color: black;
      border-color: white;
    }

    .nfRoundBtn.right {
      margin-left: auto;
    }

    .nfHoverMeta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 7px;
      color: #b3b3b3;
      font-size: 11px;
      font-weight: 650;
    }

    .nfHoverMeta b {
      color: #46d369;
    }

    .nfHoverMeta span {
      padding: 1px 4px;
      border: 1px solid rgba(255,255,255,.28);
      color: rgba(255,255,255,.76);
    }

    .nfHoverTitle {
      margin-top: 6px;
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.2;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .posterShade,
    .typePill,
    .ratingPill,
    .movieInfo,
    .nfCardAdd {
      display: none !important;
    }

    .topTenCard {
      display: grid;
      grid-template-columns: minmax(70px, 42%) minmax(0, 58%);
      align-items: end;
      min-height: 190px;
      scroll-snap-align: start;
    }

    .topTenNumber {
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      font-size: clamp(120px, 11vw, 210px);
      line-height: .77;
      color: #000;
      -webkit-text-stroke: 4px #595959;
      text-shadow: 0 0 4px #000;
      letter-spacing: -.12em;
      transform: translateX(6px);
      z-index: 1;
    }

    .topTenPoster {
      position: relative;
      display: block;
      aspect-ratio: 2 / 3;
      border-radius: 3px;
      overflow: hidden;
      background: #222;
      z-index: 2;
      box-shadow: 0 10px 30px rgba(0,0,0,.38);
      transform: translateX(-6px);
    }

    .topTenPoster img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .nfTopTenRail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(230px, 330px);
      gap: 20px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 26px;
    }

    .nfTopTenRail::-webkit-scrollbar {
      display: none;
    }

    .browseHeroTop h1 {
      font-size: clamp(30px, 2.9vw, 46px);
      font-weight: 620;
      letter-spacing: -.03em;
    }

    .genreDropdown summary {
      height: 34px;
      min-height: 34px;
      border: 1px solid rgba(255,255,255,.85);
      background: rgba(0,0,0,.65);
      border-radius: 0;
      font-size: 14px;
      font-weight: 650;
      padding: 0 11px;
    }

    .genreDropdownMenu {
      background: rgba(0,0,0,.94);
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 0;
    }

    .browseLogoTitle {
      font-size: clamp(70px, 11vw, 180px);
    }

    .browseTopRank strong {
      font-size: clamp(19px, 1.7vw, 28px);
      font-weight: 760;
    }

    .top10Badge {
      border-radius: 2px;
      background: #e50914;
    }

    .netflixPageHero {
      padding-top: 112px;
      min-height: 270px;
    }

    .netflixPageHero::before {
      background:
        linear-gradient(to top, #141414 0%, rgba(20,20,20,.64) 36%, rgba(20,20,20,.92) 100%),
        radial-gradient(900px circle at 15% 18%, rgba(180,0,0,.26), transparent 42%);
    }

    .netflixPageHero h1 {
      font-size: clamp(34px, 3.5vw, 56px);
      font-weight: 620;
      letter-spacing: -.035em;
    }

    .netflixCatalogHeader {
      top: 68px;
      background: linear-gradient(to bottom, rgba(20,20,20,.98), rgba(20,20,20,.82), transparent);
    }

    .netflixCatalog .movieGrid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 6px;
    }

    .detailHero {
      background: #141414;
      min-height: 100vh;
      padding-bottom: 12vh;
    }

    .detailHero::before {
      background:
        linear-gradient(to top, #141414 0%, rgba(20,20,20,.90) 12%, rgba(20,20,20,.45) 31%, rgba(0,0,0,.05) 62%, rgba(0,0,0,.66) 100%),
        linear-gradient(90deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.42) 38%, rgba(0,0,0,.04) 80%);
    }

    .detailGrid {
      margin-left: var(--nf-row-left) !important;
      margin-right: var(--nf-row-right) !important;
      width: calc(100vw - 8vw) !important;
      max-width: 900px !important;
    }

    .detailContent h1 {
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      font-size: clamp(64px, 9vw, 132px);
      text-transform: uppercase;
      letter-spacing: -.075em;
    }

    .detailContent .eyebrow {
      border-radius: 2px;
      background: rgba(229,9,20,.95);
      padding: 5px 8px;
    }

    .detailContent .btn,
    .personContent .btn {
      border-radius: 4px !important;
      min-height: 52px;
      border: 0;
    }

    .infoGrid,
    .netflixMoreLikeThis,
    .trailerGrid,
    .movieGrid,
    .netflixGenreGrid,
    .netflixPeopleCatalog .movieGrid {
      margin-left: 0;
      margin-right: 0;
    }

    .infoPanel {
      background: #181818;
      border: 0;
      border-radius: 4px;
    }

    .netflixDetailTabs {
      margin-top: -40px;
      position: relative;
      z-index: 20;
    }

    .netflixMoreLikeThis {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 6px;
    }

    .trailerCard {
      background: #181818;
      border-radius: 4px;
    }

    .netflixSearchPage,
    .netflixGenresPage {
      background: #141414;
    }

    .netflixSearchBox input {
      background: #111;
      border: 1px solid rgba(255,255,255,.34);
      border-radius: 0;
    }

    .netflixSearchBox button {
      border-radius: 0;
      background: #e50914;
    }

    .netflixGenreCard {
      border-radius: 2px;
      background:
        linear-gradient(to top, rgba(0,0,0,.52), rgba(0,0,0,.08)),
        linear-gradient(135deg, rgba(90,0,0,.72), rgba(29,29,29,.88));
    }

    .profileGate {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #141414;
      padding: 80px 24px;
    }

    .profileGateInner {
      text-align: center;
      width: min(980px, 100%);
    }

    .profileGate h1 {
      margin: 0 0 28px;
      color: white;
      font-size: clamp(34px, 4vw, 58px);
      font-weight: 420;
      letter-spacing: -.04em;
    }

    .profileGrid {
      display: grid;
      grid-template-columns: repeat(5, minmax(110px, 1fr));
      gap: 26px;
    }

    .profileCard {
      display: grid;
      gap: 12px;
      justify-items: center;
      color: #808080;
      font-size: 18px;
      font-weight: 500;
      transition: color .12s ease;
    }

    .profileAvatar {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 4px;
      background: linear-gradient(135deg, #0066d6, #41a2ff);
      border: 3px solid transparent;
      display: grid;
      place-items: center;
      color: white;
      font-size: clamp(40px, 5vw, 74px);
    }

    .profileCard:nth-child(2) .profileAvatar { background: linear-gradient(135deg, #ef4444, #f97316); }
    .profileCard:nth-child(3) .profileAvatar { background: linear-gradient(135deg, #22c55e, #14b8a6); }
    .profileCard:nth-child(4) .profileAvatar { background: linear-gradient(135deg, #a855f7, #ec4899); }
    .profileCard:nth-child(5) .profileAvatar { background: #333; }

    .profileCard:hover {
      color: white;
    }

    .profileCard:hover .profileAvatar {
      border-color: white;
    }

    .manageProfiles {
      display: inline-flex;
      margin-top: 48px;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      padding: 0 28px;
      border: 1px solid #808080;
      color: #808080;
      letter-spacing: .08em;
      font-size: 14px;
      font-weight: 650;
      text-transform: uppercase;
    }

    .manageProfiles:hover {
      color: white;
      border-color: white;
    }

    @media(max-width: 1200px) {
      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: calc((100vw - 8vw - 24px) / 4.5);
      }

      .nfTopTenRail {
        grid-auto-columns: minmax(220px, 300px);
      }
    }

    @media(max-width: 720px) {
      :root {
        --nf-row-left: 18px;
        --nf-row-right: 18px;
      }

      .netflixTopbar {
        height: auto;
        background: rgba(0,0,0,.82);
      }

      .netflixNav {
        width: calc(100vw - 32px) !important;
        margin: 0 16px !important;
        min-height: 62px;
      }

      .netflixWordmark {
        font-size: 24px;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(150px, 62vw);
        gap: 6px;
        padding-bottom: 26px;
      }

      .nfThumb:hover,
      .showcaseRail .posterWrap:hover,
      .browseRows .showcaseRail .posterWrap:hover,
      .netflixCatalog .posterWrap:hover {
        transform: none;
        transition-delay: 0s;
      }

      .nfHoverPanel {
        display: none;
      }

      .showcaseHero,
      .browseHero {
        min-height: 80vh;
        padding-bottom: 84px;
      }

      .showcaseCopy,
      .browseHeroContent {
        padding-top: 110px;
      }

      .showcaseTitle,
      .browseLogoTitle,
      .detailContent h1 {
        font-size: clamp(46px, 16vw, 76px);
      }

      .showcaseDesc,
      .browseDesc {
        font-size: 14px;
        max-width: 96%;
      }

      .showcaseRowWrap,
      .browseRows {
        margin-top: -48px;
      }

      .netflixCatalog .movieGrid,
      .netflixMoreLikeThis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .nfTopTenRail {
        grid-auto-columns: minmax(180px, 240px);
      }

      .topTenCard {
        min-height: 150px;
      }

      .topTenNumber {
        font-size: 120px;
        -webkit-text-stroke-width: 3px;
      }

      .profileGrid {
        grid-template-columns: repeat(2, minmax(110px, 1fr));
      }
    }


    /* ============================================================
       v9 Streaming Accuracy Deep Pass
       Detail pages, My List, Search, Genres, Profiles, and rows feel less like a database and more like a streaming app.
       ============================================================ */

    .nfDetailPage {
      min-height: 100vh;
      background: #141414;
      padding: 84px 0 70px;
    }

    .nfModalShell {
      position: relative;
      width: min(960px, calc(100vw - 36px));
      margin: 0 auto;
      background: #181818;
      border-radius: 7px;
      overflow: hidden;
      box-shadow: 0 24px 90px rgba(0,0,0,.72);
    }

    .nfClose {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 20;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: white;
      background: rgba(0,0,0,.72);
      font-size: 30px;
      line-height: 1;
      font-weight: 300;
    }

    .nfModalHero {
      position: relative;
      min-height: 540px;
      display: flex;
      align-items: flex-end;
      padding: 58px 48px;
      background: #222;
      isolation: isolate;
    }

    .nfModalHeroBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      filter: saturate(.98) brightness(.86);
    }

    .nfModalHero::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, #181818 0%, rgba(24,24,24,.84) 15%, rgba(24,24,24,.28) 48%, rgba(0,0,0,.22) 100%),
        linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.12));
    }

    .nfModalHeroContent {
      position: relative;
      z-index: 3;
      max-width: 760px;
    }

    .nfModalType {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,.88);
      font-size: 13px;
      font-weight: 760;
      letter-spacing: .04em;
      text-transform: uppercase;
      text-shadow: 0 2px 12px rgba(0,0,0,.50);
    }

    .nfModalHeroContent h1 {
      margin: 10px 0 0;
      color: white;
      font-family: Impact, Haettenschweiler, "Arial Black", Inter, sans-serif;
      font-size: clamp(52px, 8vw, 104px);
      line-height: .88;
      letter-spacing: -.065em;
      text-transform: uppercase;
      max-width: 820px;
      text-shadow: 0 10px 34px rgba(0,0,0,.45);
    }

    .nfModalActions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .nfActionPlay,
    .nfActionInfo {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border-radius: 4px;
      border: 0;
      padding: 0 24px;
      font-size: 16px;
      font-weight: 750;
      cursor: pointer;
    }

    .nfActionPlay {
      color: #000;
      background: white;
    }

    .nfActionInfo {
      color: white;
      background: rgba(109,109,110,.72);
    }

    .nfCircleControl {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,.58);
      background: rgba(42,42,42,.66);
      color: white;
      font-size: 20px;
      font-weight: 850;
      cursor: pointer;
    }

    .nfModalBody {
      padding: 0 48px 48px;
      background: #181818;
    }

    .nfMetaBand {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin-bottom: 18px;
      color: rgba(255,255,255,.74);
      font-size: 15px;
      font-weight: 560;
    }

    .nfMetaBand b {
      color: #46d369;
      font-weight: 850;
    }

    .nfMetaBand span {
      display: inline-flex;
      align-items: center;
      min-height: 23px;
    }

    .nfMaturityBox {
      padding: 1px 6px;
      border: 1px solid rgba(255,255,255,.44);
      color: rgba(255,255,255,.82);
      font-size: 13px;
    }

    .nfModalInfoGrid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(250px, .75fr);
      gap: 34px;
      align-items: start;
    }

    .nfModalOverview {
      margin: 0;
      color: rgba(255,255,255,.88);
      font-size: 17px;
      line-height: 1.55;
      font-weight: 450;
    }

    .nfModalFacts {
      display: grid;
      gap: 8px;
      color: rgba(255,255,255,.54);
      font-size: 14px;
      line-height: 1.45;
    }

    .nfModalFacts strong {
      color: rgba(255,255,255,.86);
      font-weight: 520;
    }

    .nfDetailNav {
      display: flex;
      gap: 28px;
      margin: 38px 0 18px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .nfDetailNav a {
      padding-bottom: 13px;
      color: rgba(255,255,255,.62);
      font-size: 14px;
      font-weight: 760;
    }

    .nfDetailNav a:first-child {
      color: white;
      border-bottom: 4px solid #e50914;
    }

    .nfDetailHeading {
      margin: 34px 0 14px;
      color: white;
      font-size: 25px;
      letter-spacing: -.03em;
      font-weight: 760;
    }

    .nfCastRail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 130px;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 10px;
    }

    .nfCastRail::-webkit-scrollbar {
      display: none;
    }

    .nfCastCard {
      color: white;
    }

    .nfCastPhoto {
      width: 130px;
      aspect-ratio: 1;
      overflow: hidden;
      background: #2a2a2a;
      border-radius: 4px;
    }

    .nfCastPhoto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .nfCastCard strong {
      display: block;
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.2;
    }

    .nfCastCard span {
      display: block;
      margin-top: 3px;
      color: rgba(255,255,255,.50);
      font-size: 12px;
      line-height: 1.25;
    }

    .nfTrailerGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 10px;
    }

    .nfTrailerGrid .trailerCard {
      border-radius: 4px;
      background: #222;
      box-shadow: none;
    }

    .nfSimilarGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
      gap: 10px;
    }

    .nfSimilarGrid .movieCard .posterWrap {
      border-radius: 4px !important;
      aspect-ratio: 16 / 9 !important;
      transform: none !important;
    }

    .nfSimilarGrid .movieCard .posterWrap:hover {
      transform: scale(1.035) !important;
    }

    .nfSeasonBlock {
      display: grid;
      gap: 0;
      border-top: 1px solid rgba(255,255,255,.10);
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .nfSeasonRow {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      min-height: 74px;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .nfSeasonRow:last-child {
      border-bottom: 0;
    }

    .nfSeasonNum {
      color: rgba(255,255,255,.50);
      font-size: 22px;
      text-align: center;
    }

    .nfSeasonRow strong {
      color: white;
      font-size: 14px;
    }

    .nfSeasonRow p {
      margin: 4px 0 0;
      color: rgba(255,255,255,.52);
      font-size: 13px;
      line-height: 1.35;
    }

    .nfSeasonMeta {
      color: rgba(255,255,255,.58);
      font-size: 13px;
      white-space: nowrap;
    }

    .nfMyListHeader {
      padding: 132px 0 22px;
      background: #141414;
    }

    .nfMyListHeader h1 {
      margin: 0;
      color: white;
      font-size: clamp(30px, 3vw, 46px);
      font-weight: 620;
      letter-spacing: -.03em;
    }

    .nfMyListHeader p {
      max-width: 680px;
      color: rgba(255,255,255,.58);
      font-size: 14px;
      line-height: 1.55;
    }

    .nfMyListControls {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .nfMyListControls a,
    .nfMyListControls button {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,.20);
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.82);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .nfSearchShell {
      min-height: 100vh;
      padding: 110px var(--nf-row-right) 70px var(--nf-row-left);
      background: #141414;
    }

    .nfSearchLarge {
      max-width: 760px;
      margin-bottom: 28px;
    }

    .nfSearchLarge form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 52px;
      background: #000;
      border: 1px solid rgba(255,255,255,.36);
      height: 54px;
    }

    .nfSearchLarge input {
      height: 52px;
      border: 0;
      outline: 0;
      padding: 0 16px;
      background: transparent;
      color: white;
      font-size: 17px;
    }

    .nfSearchLarge button {
      border: 0;
      background: #e50914;
      color: white;
      font-size: 22px;
      cursor: pointer;
    }

    .nfSearchLabel {
      color: rgba(255,255,255,.62);
      margin-bottom: 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .nfSearchTitle {
      margin: 0 0 14px;
      color: white;
      font-size: clamp(24px, 2.5vw, 36px);
      font-weight: 620;
    }

    .nfGenresShell {
      min-height: 100vh;
      padding: 110px var(--nf-row-right) 70px var(--nf-row-left);
      background: #141414;
    }

    .nfLanguageHeader {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 18px;
      margin-bottom: 28px;
    }

    .nfLanguageHeader h1 {
      margin: 0;
      color: white;
      font-size: clamp(30px, 3vw, 46px);
      font-weight: 620;
      letter-spacing: -.03em;
    }

    .nfLanguageSelects {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .nfLanguageSelects select {
      height: 36px;
      padding: 0 34px 0 10px;
      border-radius: 0;
      color: white;
      background: #000;
      border: 1px solid rgba(255,255,255,.72);
      font-size: 14px;
      font-weight: 650;
    }

    .nfGenreGroups {
      display: grid;
      gap: 34px;
    }

    .nfGenreGroup h2 {
      margin: 0 0 12px;
      color: white;
      font-size: 24px;
      font-weight: 660;
    }

    .nfGenreGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 8px;
    }

    .nfGenreTile {
      min-height: 94px;
      display: flex;
      align-items: flex-end;
      padding: 13px;
      border-radius: 2px;
      color: white;
      background: linear-gradient(135deg, #3b0b0b, #141414);
      border: 1px solid rgba(255,255,255,.08);
      font-size: 15px;
      font-weight: 800;
      transition: transform .12s ease, filter .12s ease;
    }

    .nfGenreTile:nth-child(4n+2) { background: linear-gradient(135deg, #1f2937, #450a0a); }
    .nfGenreTile:nth-child(4n+3) { background: linear-gradient(135deg, #111827, #312e81); }
    .nfGenreTile:nth-child(4n+4) { background: linear-gradient(135deg, #064e3b, #141414); }

    .nfGenreTile:hover {
      transform: scale(1.025);
      filter: brightness(1.14);
    }

    .profileGate {
      background:
        radial-gradient(600px circle at 50% -20%, rgba(70,70,70,.18), transparent 50%),
        #141414;
    }

    .profileGate h1 {
      font-weight: 400;
    }

    .profileCard span:last-child {
      color: #808080;
      font-size: 18px;
      font-weight: 500;
    }

    .profileCard:hover span:last-child {
      color: white;
    }

    @media(max-width: 760px) {
      .nfModalShell {
        width: 100%;
        min-height: 100vh;
        border-radius: 0;
      }

      .nfDetailPage {
        padding: 0;
      }

      .nfModalHero {
        min-height: 420px;
        padding: 88px 18px 36px;
      }

      .nfModalBody {
        padding: 0 18px 34px;
      }

      .nfModalInfoGrid {
        grid-template-columns: 1fr;
        gap: 18px;
      }

      .nfDetailNav {
        overflow-x: auto;
        white-space: nowrap;
      }

      .nfSimilarGrid,
      .nfTrailerGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .nfSeasonRow {
        grid-template-columns: 32px minmax(0,1fr);
      }

      .nfSeasonMeta {
        display: none;
      }

      .nfSearchShell,
      .nfGenresShell {
        padding: 98px 16px 50px;
      }

      .nfGenreGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .nfGenreTile {
        min-height: 76px;
        font-size: 13px;
      }

      .nfMyListHeader {
        padding: 110px 0 16px;
      }
    }


    /* ============================================================
       v10 Near 1:1 Streaming Layout
       A much stricter web-Netflix-style layout pass without shipping Netflix brand assets.
       ============================================================ */

    :root {
      --nf-bg: #141414;
      --nf-black: #000000;
      --nf-red: #e50914;
      --nf-text: #fff;
      --nf-dim: #b3b3b3;
      --nf-left: 4%;
      --nf-right: 4%;
      --nf-card-gap: .38vw;
      --nf-topbar-h: 68px;
    }

    html, body {
      background: var(--nf-bg) !important;
      color: var(--nf-text);
    }

    body {
      font-family: Arial, Helvetica, sans-serif !important;
    }

    body::before,
    body::after {
      display: none !important;
    }

    .netflixTopbar {
      height: var(--nf-topbar-h) !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.72), rgba(0,0,0,.42) 48%, rgba(0,0,0,0)) !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    .netflixTopbar[style*="rgba(20,20,20"] {
      background: #141414 !important;
    }

    .netflixNav {
      width: 100% !important;
      height: var(--nf-topbar-h) !important;
      min-height: var(--nf-topbar-h) !important;
      margin: 0 !important;
      padding: 0 var(--nf-left) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 18px !important;
    }

    .navLeftCluster {
      display: flex !important;
      align-items: center !important;
      gap: 25px !important;
      min-width: 0 !important;
    }

    .netflixBrand {
      width: auto !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      flex: 0 0 auto !important;
    }

    .netflixWordmark {
      color: var(--nf-red) !important;
      font-family: Arial Black, Arial, Helvetica, sans-serif !important;
      font-size: 31px !important;
      font-weight: 950 !important;
      line-height: 1 !important;
      letter-spacing: -.07em !important;
      transform: scaleX(.92) !important;
      text-shadow: none !important;
    }

    .netflixLinks {
      display: flex !important;
      align-items: center !important;
      gap: 18px !important;
      flex-wrap: nowrap !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    .netflixLinks a {
      min-height: auto !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      color: #e5e5e5 !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      line-height: 1 !important;
      transition: color .18s ease !important;
    }

    .netflixLinks a.active {
      color: #fff !important;
      font-weight: 700 !important;
    }

    .netflixLinks a:hover {
      color: #b3b3b3 !important;
    }

    .navRightCluster {
      display: flex !important;
      align-items: center !important;
      gap: 20px !important;
      flex: 0 0 auto !important;
    }

    .iconLink {
      color: white !important;
      font-size: 27px !important;
      line-height: 1 !important;
      transform: translateY(-1px) !important;
    }

    .textLink {
      color: white !important;
      font-size: 14px !important;
      font-weight: 700 !important;
    }

    .profilePill {
      width: 32px !important;
      height: 32px !important;
      border-radius: 4px !important;
      background: linear-gradient(135deg, #0071eb, #1f80ff) !important;
      box-shadow: none !important;
      position: relative !important;
      font-size: 0 !important;
    }

    .profilePill::after {
      content: "";
      width: 15px;
      height: 7px;
      border: 2px solid white;
      border-top: 0;
      border-radius: 0 0 11px 11px;
      position: absolute;
      top: 16px;
      left: 7px;
    }

    .profilePill::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: white;
      position: absolute;
      top: 9px;
      left: 14px;
    }

    .caretTiny {
      color: white !important;
      margin-left: -12px !important;
      font-size: 11px !important;
    }

    .mobileSearchForm {
      display: none !important;
    }

    .showcaseHero,
    .browseHero {
      min-height: 100vh !important;
      background: #141414 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: flex-end !important;
    }

    .showcaseHeroBg,
    .browseHeroBg {
      filter: brightness(.78) saturate(.95) !important;
      transform: none !important;
      background-position: center top !important;
    }

    .showcaseHero::before,
    .browseHero::before {
      background:
        linear-gradient(to top, #141414 0%, rgba(20,20,20,.92) 5%, rgba(20,20,20,.44) 19%, rgba(20,20,20,.08) 44%, rgba(0,0,0,.60) 100%),
        linear-gradient(90deg, rgba(0,0,0,.74) 0%, rgba(0,0,0,.34) 33%, rgba(0,0,0,.02) 71%) !important;
    }

    .showcaseInner,
    .browseHeroContent,
    .browseRows .showcaseInner,
    .container {
      width: auto !important;
      max-width: none !important;
      margin-left: var(--nf-left) !important;
      margin-right: var(--nf-right) !important;
    }

    .showcaseCopy,
    .browseHeroContent {
      max-width: 620px !important;
      padding: 0 0 16.5vh !important;
      margin: 0 !important;
    }

    .showcaseKicker {
      color: white !important;
      font-size: 17px !important;
      font-weight: 700 !important;
      margin: 0 0 10px !important;
      text-shadow: 0 2px 14px rgba(0,0,0,.45) !important;
    }

    .showcaseTitle,
    .browseLogoTitle {
      margin: 0 !important;
      color: white !important;
      font-family: Impact, Haettenschweiler, "Arial Black", Arial, sans-serif !important;
      font-size: clamp(70px, 9vw, 148px) !important;
      line-height: .78 !important;
      letter-spacing: -.065em !important;
      text-transform: uppercase !important;
      text-shadow: 0 8px 30px rgba(0,0,0,.52) !important;
      max-width: 780px !important;
    }

    .showcaseTitleSmall {
      display: block !important;
      font-family: inherit !important;
      color: white !important;
      font-size: .82em !important;
      line-height: .86 !important;
    }

    .showcaseDesc,
    .browseDesc {
      margin: 16px 0 0 !important;
      color: white !important;
      font-size: clamp(17px, 1.35vw, 23px) !important;
      line-height: 1.35 !important;
      font-weight: 500 !important;
      max-width: 640px !important;
      text-shadow: 0 2px 14px rgba(0,0,0,.54) !important;
    }

    .showcaseButtons,
    .browseButtons {
      display: flex !important;
      gap: 12px !important;
      margin-top: 24px !important;
      align-items: center !important;
    }

    .showcaseBtn,
    .showcaseBtnSecondary,
    .browsePlay,
    .browseInfo {
      min-height: 54px !important;
      padding: 0 26px !important;
      border-radius: 4px !important;
      border: 0 !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      box-shadow: none !important;
    }

    .showcaseBtn,
    .browsePlay {
      background: white !important;
      color: black !important;
    }

    .showcaseBtnSecondary,
    .browseInfo {
      background: rgba(109,109,110,.70) !important;
      color: white !important;
    }

    .showcasePlay,
    .browsePlayIcon {
      font-size: 27px !important;
      transform: translateY(1px) !important;
    }

    .showcaseInfo,
    .browseInfoIcon {
      font-size: 27px !important;
    }

    .showcaseMaturity,
    .browseMaturity {
      position: absolute !important;
      right: 0 !important;
      bottom: 18.5vh !important;
      display: flex !important;
      align-items: center !important;
      gap: 18px !important;
      color: white !important;
      z-index: 8 !important;
    }

    .showcaseMute,
    .browseMute {
      width: 48px !important;
      height: 48px !important;
      border-radius: 999px !important;
      border: 2px solid rgba(255,255,255,.72) !important;
      display: grid !important;
      place-items: center !important;
      background: rgba(0,0,0,.12) !important;
      font-size: 19px !important;
    }

    .browseRating {
      min-width: 106px !important;
      height: 46px !important;
      display: flex !important;
      align-items: center !important;
      padding-left: 16px !important;
      background: rgba(51,51,51,.60) !important;
      border-left: 4px solid #dcdcdc !important;
      font-size: 18px !important;
      font-weight: 600 !important;
    }

    .showcaseRowWrap,
    .browseRows {
      position: relative !important;
      z-index: 30 !important;
      margin-top: -12.5vh !important;
      padding-bottom: 60px !important;
      background: transparent !important;
    }

    .nfRowSection {
      margin-bottom: -8px !important;
    }

    .showcaseRowTitle,
    .nfRowTitle {
      margin: 0 0 .56vw !important;
      color: #e5e5e5 !important;
      font-size: clamp(20px, 1.45vw, 28px) !important;
      font-weight: 700 !important;
      letter-spacing: -.01em !important;
      line-height: 1.1 !important;
    }

    .movieRail,
    .nfRail,
    .showcaseRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: calc((100vw - (var(--nf-left) * 2) - (var(--nf-card-gap) * 5)) / 6) !important;
      gap: var(--nf-card-gap) !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      scrollbar-width: none !important;
      padding: 0 0 44px !important;
      margin-bottom: -20px !important;
    }

    .movieRail::-webkit-scrollbar,
    .nfRail::-webkit-scrollbar,
    .showcaseRail::-webkit-scrollbar,
    .nfTopTenRail::-webkit-scrollbar {
      display: none !important;
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap,
    .nfSimilarGrid .posterWrap {
      aspect-ratio: 16 / 9 !important;
      border-radius: 2px !important;
      border: 0 !important;
      background: #222 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      transition: transform .18s ease, box-shadow .18s ease !important;
    }

    .nfThumb img,
    .showcaseRail .posterWrap img,
    .browseRows .posterWrap img,
    .netflixCatalog .posterWrap img,
    .nfSimilarGrid .posterWrap img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .nfTitleCard:hover {
      z-index: 80 !important;
    }

    .nfThumb:hover,
    .showcaseRail .posterWrap:hover,
    .browseRows .showcaseRail .posterWrap:hover,
    .netflixCatalog .posterWrap:hover {
      transform: scale(1.38) translateY(-10%) !important;
      box-shadow: 0 18px 42px rgba(0,0,0,.62) !important;
      transition-delay: .32s !important;
    }

    .nfHoverPanel {
      background: #181818 !important;
      box-shadow: 0 18px 42px rgba(0,0,0,.62) !important;
      padding: 12px !important;
      min-height: 104px !important;
      transform: translateY(100%) !important;
      transition-delay: .32s !important;
    }

    .nfThumb:hover .nfHoverPanel {
      opacity: 1 !important;
      transform: translateY(100%) !important;
    }

    .posterShade,
    .typePill,
    .ratingPill,
    .movieInfo,
    .nfCardAdd {
      display: none !important;
    }

    .nfTopTenRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(240px, 20vw) !important;
      gap: 22px !important;
      overflow-x: auto !important;
      scrollbar-width: none !important;
      padding-bottom: 36px !important;
    }

    .topTenCard {
      min-height: 13.6vw !important;
      display: grid !important;
      grid-template-columns: 42% 58% !important;
      align-items: end !important;
    }

    .topTenNumber {
      font-family: Impact, Haettenschweiler, "Arial Black", Arial, sans-serif !important;
      color: #000 !important;
      -webkit-text-stroke: 4px #595959 !important;
      text-shadow: 0 0 3px #000 !important;
      font-size: clamp(112px, 11vw, 206px) !important;
      line-height: .77 !important;
      letter-spacing: -.14em !important;
      z-index: 1 !important;
    }

    .topTenPoster {
      aspect-ratio: 2/3 !important;
      border-radius: 2px !important;
      overflow: hidden !important;
      background: #222 !important;
      z-index: 2 !important;
      transform: translateX(-5%) !important;
    }

    .topTenPoster img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .browseHeroTop {
      top: calc(var(--nf-topbar-h) + 28px) !important;
      left: var(--nf-left) !important;
      right: var(--nf-right) !important;
      z-index: 18 !important;
      display: flex !important;
      align-items: center !important;
      gap: 28px !important;
    }

    .browseHeroTop h1 {
      font-size: clamp(31px, 3.1vw, 50px) !important;
      font-weight: 500 !important;
      letter-spacing: -.035em !important;
      line-height: 1 !important;
    }

    .genreDropdown summary {
      height: 34px !important;
      min-height: 34px !important;
      border-radius: 0 !important;
      border: 1px solid rgba(255,255,255,.82) !important;
      background: rgba(0,0,0,.78) !important;
      padding: 0 10px !important;
      gap: 26px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
    }

    .genreDropdownMenu {
      background: rgba(0,0,0,.94) !important;
      border: 1px solid rgba(255,255,255,.24) !important;
      border-radius: 0 !important;
    }

    .browseTopRank {
      margin-top: 18px !important;
    }

    .top10Badge {
      width: 38px !important;
      height: 48px !important;
      border-radius: 2px !important;
      font-size: 10px !important;
      line-height: .92 !important;
    }

    .browseTopRank strong {
      font-size: clamp(20px, 1.7vw, 29px) !important;
      font-weight: 700 !important;
    }

    .nfDetailPage {
      background: rgba(0,0,0,.74) !important;
      padding: 72px 0 !important;
    }

    .nfModalShell {
      width: min(920px, calc(100vw - 46px)) !important;
      border-radius: 6px !important;
      background: #181818 !important;
      box-shadow: 0 28px 100px rgba(0,0,0,.80) !important;
    }

    .nfModalHero {
      min-height: 520px !important;
      padding: 54px 48px !important;
    }

    .nfModalHero::after {
      background:
        linear-gradient(to top, #181818 0%, rgba(24,24,24,.88) 14%, rgba(24,24,24,.25) 48%, rgba(0,0,0,.26) 100%),
        linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.08)) !important;
    }

    .nfModalHeroContent h1 {
      font-family: Impact, Haettenschweiler, "Arial Black", Arial, sans-serif !important;
      font-size: clamp(52px, 8vw, 106px) !important;
      line-height: .82 !important;
      letter-spacing: -.06em !important;
      text-transform: uppercase !important;
    }

    .nfActionPlay,
    .nfActionInfo {
      border-radius: 4px !important;
      min-height: 48px !important;
      padding: 0 24px !important;
      font-size: 16px !important;
      font-weight: 700 !important;
    }

    .nfCircleControl {
      width: 42px !important;
      height: 42px !important;
      background: rgba(42,42,42,.72) !important;
      border: 2px solid rgba(255,255,255,.56) !important;
    }

    .nfModalBody {
      padding: 0 48px 48px !important;
      background: #181818 !important;
    }

    .nfMetaBand {
      font-size: 15px !important;
      gap: 9px !important;
    }

    .nfModalInfoGrid {
      grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr) !important;
      gap: 34px !important;
    }

    .nfModalOverview {
      font-size: 17px !important;
      line-height: 1.55 !important;
    }

    .nfDetailNav {
      margin: 38px 0 18px !important;
      gap: 28px !important;
    }

    .nfSimilarGrid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
      gap: 7px !important;
    }

    .nfSearchShell,
    .nfGenresShell {
      padding-top: 116px !important;
      padding-left: var(--nf-left) !important;
      padding-right: var(--nf-right) !important;
      background: #141414 !important;
    }

    .nfSearchLarge form {
      border-radius: 0 !important;
      background: #000 !important;
      border: 1px solid rgba(255,255,255,.38) !important;
      height: 52px !important;
    }

    .nfSearchLarge input {
      font-size: 17px !important;
    }

    .nfMyListHeader {
      padding-top: 118px !important;
      background: #141414 !important;
    }

    .nfMyListHeader h1,
    .nfLanguageHeader h1,
    .nfSearchTitle {
      font-weight: 500 !important;
      letter-spacing: -.03em !important;
    }

    .profileGate {
      background: #141414 !important;
    }

    .profileGate h1 {
      font-family: Arial, Helvetica, sans-serif !important;
      font-weight: 400 !important;
      color: #fff !important;
    }

    @media(max-width: 1100px) {
      .netflixLinks {
        gap: 11px !important;
      }

      .netflixLinks a {
        font-size: 12px !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: calc((100vw - (var(--nf-left) * 2) - (var(--nf-card-gap) * 3)) / 4) !important;
      }
    }

    @media(max-width: 760px) {
      :root {
        --nf-left: 16px;
        --nf-right: 16px;
      }

      .netflixTopbar {
        background: rgba(20,20,20,.98) !important;
        height: auto !important;
      }

      .netflixNav {
        height: auto !important;
        min-height: 62px !important;
        padding: 0 16px !important;
      }

      .netflixWordmark {
        font-size: 24px !important;
      }

      .navRightCluster {
        display: none !important;
      }

      .mobileSearchForm {
        display: grid !important;
        width: 100% !important;
        margin-bottom: 10px !important;
      }

      .showcaseHero,
      .browseHero {
        min-height: 82vh !important;
      }

      .showcaseCopy,
      .browseHeroContent {
        padding-bottom: 82px !important;
      }

      .showcaseTitle,
      .browseLogoTitle {
        font-size: clamp(46px, 18vw, 76px) !important;
      }

      .showcaseDesc,
      .browseDesc {
        font-size: 14px !important;
        max-width: 95% !important;
      }

      .showcaseBtn,
      .showcaseBtnSecondary,
      .browsePlay,
      .browseInfo {
        min-height: 44px !important;
        padding: 0 16px !important;
        font-size: 14px !important;
      }

      .showcaseMaturity,
      .browseMaturity {
        position: static !important;
        margin-top: 16px !important;
      }

      .showcaseRowWrap,
      .browseRows {
        margin-top: -48px !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(170px, 68vw) !important;
      }

      .nfThumb:hover,
      .showcaseRail .posterWrap:hover,
      .browseRows .showcaseRail .posterWrap:hover,
      .netflixCatalog .posterWrap:hover {
        transform: none !important;
        transition-delay: 0s !important;
      }

      .nfHoverPanel {
        display: none !important;
      }

      .nfTopTenRail {
        grid-auto-columns: 210px !important;
      }

      .topTenCard {
        min-height: 146px !important;
      }

      .topTenNumber {
        font-size: 118px !important;
        -webkit-text-stroke-width: 3px !important;
      }

      .nfModalShell {
        width: 100% !important;
        border-radius: 0 !important;
      }

      .nfDetailPage {
        padding: 0 !important;
      }

      .nfModalHero {
        min-height: 420px !important;
        padding: 86px 18px 36px !important;
      }

      .nfModalBody {
        padding: 0 18px 34px !important;
      }

      .nfModalInfoGrid {
        grid-template-columns: 1fr !important;
      }

      .nfSimilarGrid {
        grid-template-columns: repeat(2, minmax(0,1fr)) !important;
      }
    }


    /* ============================================================
       v11 Dropcart x Streaming Hybrid
       Keeps the streaming layout but adds Dropcart-style dark luxury, purple/blue glow,
       glass panels, softer premium buttons, and more branded personality.
       ============================================================ */

    :root {
      --drop-bg: #060712;
      --drop-panel: rgba(255,255,255,.075);
      --drop-panel-strong: rgba(255,255,255,.12);
      --drop-line: rgba(255,255,255,.13);
      --drop-blue: #35d7ff;
      --drop-purple: #7c5cff;
      --drop-pink: #ff4fd8;
      --drop-soft: #dfe8ff;
      --drop-green: #67f7bf;
      --drop-shadow: 0 28px 110px rgba(0,0,0,.55);
      --drop-radius: 22px;
      --nf-red: #7c5cff;
    }

    html,
    body {
      background:
        radial-gradient(900px circle at 12% -10%, rgba(124,92,255,.28), transparent 44%),
        radial-gradient(900px circle at 96% 0%, rgba(53,215,255,.18), transparent 42%),
        linear-gradient(180deg, #050711, #070815 40%, #050711) !important;
      color: #f8fbff !important;
    }

    body::before {
      display: block !important;
      content: "";
      position: fixed;
      inset: 0;
      z-index: -3;
      pointer-events: none;
      background:
        linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
      background-size: 52px 52px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,.55), transparent 75%);
    }

    .netflixTopbar {
      background:
        linear-gradient(to bottom, rgba(5,7,18,.86), rgba(5,7,18,.36) 62%, rgba(5,7,18,0)) !important;
    }

    .netflixTopbar[style*="rgba(20,20,20"] {
      background: rgba(5,7,18,.92) !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
      backdrop-filter: blur(18px) saturate(1.15) !important;
      -webkit-backdrop-filter: blur(18px) saturate(1.15) !important;
    }

    .netflixWordmark {
      color: transparent !important;
      background: linear-gradient(90deg, #fff, #b9efff 26%, #b9a7ff 56%, #ffb7ee 100%);
      -webkit-background-clip: text;
      background-clip: text;
      filter: drop-shadow(0 0 18px rgba(124,92,255,.30));
      letter-spacing: -.08em !important;
    }

    .netflixBrand::before {
      content: "";
      width: 38px;
      height: 38px;
      margin-right: 10px;
      border-radius: 14px;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.42), transparent 34%),
        linear-gradient(135deg, var(--drop-purple), var(--drop-blue));
      box-shadow: 0 16px 40px rgba(53,215,255,.20), 0 0 40px rgba(124,92,255,.18);
    }

    .netflixLinks a {
      color: rgba(239,246,255,.74) !important;
      font-weight: 720 !important;
    }

    .netflixLinks a.active,
    .netflixLinks a:hover {
      color: white !important;
    }

    .iconLink,
    .textLink,
    .caretTiny {
      color: rgba(239,246,255,.88) !important;
    }

    .profilePill {
      background:
        radial-gradient(circle at 34% 28%, #ffffff 0 12%, transparent 13%),
        linear-gradient(135deg, var(--drop-purple), var(--drop-blue)) !important;
      box-shadow: 0 12px 32px rgba(53,215,255,.22) !important;
    }

    .showcaseHero,
    .browseHero {
      background: #050711 !important;
    }

    .showcaseHeroBg,
    .browseHeroBg,
    .nfModalHeroBg {
      filter: brightness(.72) saturate(1.12) contrast(1.04) !important;
    }

    .showcaseHero::before,
    .browseHero::before {
      background:
        radial-gradient(720px circle at 24% 42%, rgba(124,92,255,.28), transparent 42%),
        radial-gradient(660px circle at 86% 4%, rgba(53,215,255,.12), transparent 44%),
        linear-gradient(to top, #050711 0%, rgba(5,7,18,.92) 6%, rgba(5,7,18,.48) 25%, rgba(5,7,18,.10) 55%, rgba(5,7,18,.70) 100%),
        linear-gradient(90deg, rgba(5,7,18,.82) 0%, rgba(5,7,18,.38) 35%, rgba(5,7,18,.04) 75%) !important;
    }

    .showcaseKicker {
      width: fit-content;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      color: rgba(224,242,254,.92) !important;
      font-size: 12px !important;
      letter-spacing: .09em;
      text-transform: uppercase;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .showcaseTitle,
    .browseLogoTitle,
    .nfModalHeroContent h1 {
      font-family: "Space Grotesk", Impact, Haettenschweiler, "Arial Black", Arial, sans-serif !important;
      letter-spacing: -.08em !important;
      text-shadow: 0 12px 42px rgba(0,0,0,.48), 0 0 44px rgba(124,92,255,.16) !important;
    }

    .showcaseTitleSmall {
      color: transparent !important;
      background: linear-gradient(90deg, #fff, #dbeafe 25%, #b9a7ff 62%, #dff8ff 100%);
      -webkit-background-clip: text;
      background-clip: text;
    }

    .showcaseDesc,
    .browseDesc {
      color: rgba(239,246,255,.90) !important;
      text-shadow: 0 2px 24px rgba(0,0,0,.48) !important;
    }

    .showcaseBtn,
    .browsePlay,
    .nfActionPlay {
      color: #050711 !important;
      background:
        radial-gradient(140px circle at 20% 0%, rgba(255,255,255,.62), transparent 42%),
        linear-gradient(135deg, #ffffff, #dff8ff) !important;
      border-radius: 12px !important;
      box-shadow: 0 18px 54px rgba(255,255,255,.08), 0 0 40px rgba(53,215,255,.12) !important;
    }

    .showcaseBtnSecondary,
    .browseInfo,
    .nfActionInfo {
      color: white !important;
      background: rgba(255,255,255,.13) !important;
      border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 12px !important;
      backdrop-filter: blur(16px) saturate(1.15) !important;
      -webkit-backdrop-filter: blur(16px) saturate(1.15) !important;
    }

    .showcaseMute,
    .browseMute {
      background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.28) !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
      box-shadow: 0 0 34px rgba(124,92,255,.16) !important;
    }

    .browseRating {
      background: rgba(255,255,255,.10) !important;
      border-left: 4px solid var(--drop-blue) !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .nfRowTitle,
    .showcaseRowTitle {
      color: #f8fbff !important;
      font-family: "Space Grotesk", Inter, Arial, sans-serif !important;
      font-weight: 760 !important;
      text-shadow: 0 8px 30px rgba(0,0,0,.32);
    }

    .nfRowTitle::after,
    .showcaseRowTitle::after {
      content: "";
      display: inline-block;
      width: 44px;
      height: 3px;
      margin-left: 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--drop-purple), var(--drop-blue));
      transform: translateY(-5px);
      opacity: .85;
      box-shadow: 0 0 22px rgba(53,215,255,.32);
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap,
    .nfSimilarGrid .posterWrap {
      border-radius: 12px !important;
      border: 1px solid rgba(255,255,255,.09) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 32px rgba(0,0,0,.18) !important;
      background: rgba(255,255,255,.06) !important;
    }

    .nfThumb:hover,
    .showcaseRail .posterWrap:hover,
    .browseRows .showcaseRail .posterWrap:hover,
    .netflixCatalog .posterWrap:hover {
      box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 50px rgba(124,92,255,.24), 0 0 38px rgba(53,215,255,.10) !important;
      border-color: rgba(255,255,255,.20) !important;
    }

    .nfHoverPanel {
      background:
        radial-gradient(260px circle at 10% 0%, rgba(124,92,255,.18), transparent 45%),
        rgba(9,12,24,.96) !important;
      border: 1px solid rgba(255,255,255,.10);
      border-top: 0;
      border-radius: 0 0 14px 14px;
      backdrop-filter: blur(18px) !important;
      -webkit-backdrop-filter: blur(18px) !important;
    }

    .nfRoundPlay {
      background: linear-gradient(135deg, #fff, #dff8ff) !important;
      color: #050711 !important;
      border-color: transparent !important;
    }

    .nfRoundBtn {
      background: rgba(255,255,255,.075) !important;
      border-color: rgba(255,255,255,.24) !important;
      color: white !important;
    }

    .nfHoverMeta b {
      color: var(--drop-green) !important;
    }

    .topTenNumber {
      color: rgba(0,0,0,.35) !important;
      -webkit-text-stroke: 4px rgba(198,218,255,.54) !important;
      text-shadow: 0 0 22px rgba(124,92,255,.24) !important;
    }

    .topTenPoster {
      border-radius: 12px !important;
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 22px 60px rgba(0,0,0,.34), 0 0 30px rgba(124,92,255,.12) !important;
    }

    .browseHeroTop h1,
    .nfMyListHeader h1,
    .nfLanguageHeader h1,
    .nfSearchTitle {
      font-family: "Space Grotesk", Inter, Arial, sans-serif !important;
      color: #f8fbff !important;
      font-weight: 720 !important;
    }

    .genreDropdown summary,
    .nfLanguageSelects select,
    .nfMyListControls a,
    .nfMyListControls button {
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 12px !important;
      color: rgba(239,246,255,.90) !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .genreDropdownMenu {
      background: rgba(7,10,22,.96) !important;
      border-color: rgba(255,255,255,.16) !important;
      border-radius: 16px !important;
      box-shadow: 0 28px 90px rgba(0,0,0,.52), 0 0 50px rgba(124,92,255,.12) !important;
    }

    .nfDetailPage {
      background:
        radial-gradient(900px circle at 50% -20%, rgba(124,92,255,.24), transparent 48%),
        rgba(3,5,12,.86) !important;
    }

    .nfModalShell {
      background:
        radial-gradient(900px circle at 10% 0%, rgba(124,92,255,.12), transparent 40%),
        #090c18 !important;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 24px !important;
      box-shadow: 0 34px 130px rgba(0,0,0,.70), 0 0 90px rgba(124,92,255,.14) !important;
    }

    .nfClose {
      background: rgba(7,10,22,.72) !important;
      border: 1px solid rgba(255,255,255,.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .nfModalHero::after {
      background:
        radial-gradient(620px circle at 20% 48%, rgba(124,92,255,.28), transparent 42%),
        linear-gradient(to top, #090c18 0%, rgba(9,12,24,.90) 15%, rgba(9,12,24,.28) 48%, rgba(0,0,0,.26) 100%),
        linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.08)) !important;
    }

    .nfModalType {
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(14px);
    }

    .nfCircleControl {
      background: rgba(255,255,255,.09) !important;
      border-color: rgba(255,255,255,.24) !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .nfModalBody {
      background: #090c18 !important;
    }

    .nfMaturityBox,
    .nfModalFacts,
    .nfSeasonBlock,
    .nfCastPhoto,
    .trailerCard,
    .emptyState,
    .watchlistEmptyNetflix {
      background: rgba(255,255,255,.055) !important;
      border-color: rgba(255,255,255,.10) !important;
      border-radius: 14px !important;
    }

    .nfDetailNav {
      border-bottom-color: rgba(255,255,255,.10) !important;
    }

    .nfDetailNav a:first-child {
      border-bottom-color: var(--drop-blue) !important;
    }

    .nfSearchShell,
    .nfGenresShell,
    .nfMyListHeader {
      background:
        radial-gradient(900px circle at 10% 0%, rgba(124,92,255,.18), transparent 42%),
        radial-gradient(800px circle at 90% 0%, rgba(53,215,255,.12), transparent 40%),
        #050711 !important;
    }

    .nfSearchLarge form {
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 16px !important;
      overflow: hidden;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .nfSearchLarge button {
      background: linear-gradient(135deg, var(--drop-purple), var(--drop-blue)) !important;
    }

    .nfGenreTile {
      border-radius: 18px !important;
      background:
        radial-gradient(200px circle at 12% 0%, rgba(255,255,255,.14), transparent 38%),
        linear-gradient(135deg, rgba(124,92,255,.54), rgba(53,215,255,.14)),
        rgba(255,255,255,.06) !important;
      border: 1px solid rgba(255,255,255,.12) !important;
      box-shadow: 0 18px 45px rgba(0,0,0,.22);
    }

    .profileGate {
      background:
        radial-gradient(900px circle at 50% -12%, rgba(124,92,255,.26), transparent 45%),
        radial-gradient(850px circle at 100% 0%, rgba(53,215,255,.12), transparent 42%),
        #050711 !important;
    }

    .profileAvatar {
      border-radius: 22px !important;
      box-shadow: 0 22px 60px rgba(0,0,0,.30), 0 0 44px rgba(124,92,255,.14);
    }

    .manageProfiles {
      border-radius: 999px !important;
      background: rgba(255,255,255,.06);
      backdrop-filter: blur(14px);
    }

    .footer {
      background: #050711 !important;
    }

    @media(max-width: 760px) {
      .netflixBrand::before {
        width: 32px;
        height: 32px;
        border-radius: 12px;
      }

      .showcaseBtn,
      .showcaseBtnSecondary,
      .browsePlay,
      .browseInfo {
        border-radius: 10px !important;
      }

      .nfModalShell {
        border-radius: 0 !important;
      }
    }


    /* ============================================================
       v12 Visible Layout Fix Pass
       Fixes the screenshot issues: clipped hero title, overlapping category header,
       wrong maturity badge placement, oversized text block, and excessive glow.
       ============================================================ */

    :root {
      --nf-left: 4.25%;
      --nf-right: 4.25%;
    }

    .browseHero {
      min-height: 100vh !important;
      padding: 0 !important;
      align-items: flex-end !important;
      overflow: hidden !important;
    }

    .browseHeroTop {
      top: 94px !important;
      left: var(--nf-left) !important;
      right: var(--nf-right) !important;
      gap: 22px !important;
      z-index: 30 !important;
      pointer-events: auto !important;
    }

    .browseHeroTop h1 {
      font-size: clamp(34px, 3vw, 46px) !important;
      line-height: 1 !important;
      font-weight: 680 !important;
      letter-spacing: -.04em !important;
      text-shadow: 0 6px 26px rgba(0,0,0,.52) !important;
    }

    .genreDropdown summary {
      height: 36px !important;
      min-height: 36px !important;
      padding: 0 13px !important;
      gap: 22px !important;
      border-radius: 10px !important;
      background: rgba(11,14,28,.66) !important;
      border: 1px solid rgba(255,255,255,.24) !important;
    }

    .browseHeroContent {
      position: static !important;
      z-index: auto !important;
      width: min(650px, 47vw) !important;
      max-width: min(650px, 47vw) !important;
      margin-left: var(--nf-left) !important;
      margin-right: 0 !important;
      padding: 0 0 12.5vh 0 !important;
    }

    .browseHeroContent > .browseLogoTitle,
    .browseHeroContent > .browseTopRank,
    .browseHeroContent > .browseDesc,
    .browseHeroContent > .browseButtons {
      position: relative !important;
      z-index: 12 !important;
    }

    .browseLogoTitle {
      display: block !important;
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      font-size: clamp(50px, 7vw, 104px) !important;
      line-height: .86 !important;
      letter-spacing: -.075em !important;
      overflow: visible !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      text-wrap: balance !important;
      transform: none !important;
    }

    .browseTopRank {
      margin-top: 18px !important;
      gap: 12px !important;
    }

    .browseTopRank strong {
      font-size: clamp(18px, 1.55vw, 26px) !important;
      line-height: 1.1 !important;
    }

    .top10Badge {
      width: 36px !important;
      height: 44px !important;
      font-size: 9px !important;
      flex: 0 0 auto !important;
    }

    .browseDesc {
      max-width: min(600px, 46vw) !important;
      margin-top: 14px !important;
      font-size: clamp(15px, 1.23vw, 19px) !important;
      line-height: 1.38 !important;
      font-weight: 520 !important;
      color: rgba(239,246,255,.88) !important;
    }

    .browseButtons {
      margin-top: 20px !important;
    }

    .browsePlay,
    .browseInfo {
      min-height: 50px !important;
      padding: 0 21px !important;
      font-size: 16px !important;
      border-radius: 10px !important;
    }

    .browsePlayIcon,
    .browseInfoIcon {
      font-size: 24px !important;
    }

    .browseMaturity {
      position: absolute !important;
      right: 0 !important;
      bottom: 19vh !important;
      z-index: 25 !important;
      margin: 0 !important;
      transform: none !important;
    }

    .browseMute {
      width: 44px !important;
      height: 44px !important;
      font-size: 17px !important;
    }

    .browseRating {
      min-width: 96px !important;
      height: 42px !important;
      font-size: 16px !important;
    }

    .browseRows {
      margin-top: -9.5vh !important;
      padding-bottom: 70px !important;
      z-index: 35 !important;
    }

    .browseRows .showcaseInner {
      margin-left: var(--nf-left) !important;
      margin-right: var(--nf-right) !important;
      width: auto !important;
    }

    .nfRowTitle,
    .showcaseRowTitle {
      font-size: clamp(20px, 1.55vw, 28px) !important;
      margin-bottom: 10px !important;
    }

    .nfRowTitle::after,
    .showcaseRowTitle::after {
      width: 38px !important;
      height: 2px !important;
      transform: translateY(-5px) !important;
      opacity: .72 !important;
    }

    .movieRail,
    .nfRail,
    .showcaseRail {
      grid-auto-columns: calc((100vw - (var(--nf-left) * 2) - 30px) / 6) !important;
      gap: 6px !important;
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap,
    .nfSimilarGrid .posterWrap {
      border-radius: 10px !important;
    }

    .netflixTopbar {
      min-height: 68px !important;
    }

    .netflixNav {
      padding-left: var(--nf-left) !important;
      padding-right: var(--nf-right) !important;
    }

    .netflixBrand::before {
      width: 34px !important;
      height: 34px !important;
      border-radius: 13px !important;
      margin-right: 9px !important;
    }

    .netflixWordmark {
      font-size: 27px !important;
      letter-spacing: -.07em !important;
    }

    .netflixLinks {
      gap: 16px !important;
    }

    .netflixLinks a {
      font-size: 13px !important;
    }

    .navRightCluster {
      gap: 16px !important;
    }

    body::before {
      opacity: .44 !important;
    }

    .showcaseHeroBg,
    .browseHeroBg,
    .nfModalHeroBg {
      filter: brightness(.70) saturate(1.05) contrast(1.02) !important;
    }

    @media(max-width: 1150px) {
      .browseHeroContent {
        width: min(620px, 58vw) !important;
        max-width: min(620px, 58vw) !important;
      }

      .browseLogoTitle {
        font-size: clamp(48px, 8vw, 92px) !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: calc((100vw - (var(--nf-left) * 2) - 18px) / 4) !important;
      }

      .netflixLinks {
        gap: 11px !important;
      }
    }

    @media(max-width: 760px) {
      :root {
        --nf-left: 16px;
        --nf-right: 16px;
      }

      .browseHeroTop {
        top: 82px !important;
        left: 16px !important;
        right: 16px !important;
      }

      .browseHeroTop h1 {
        font-size: 32px !important;
      }

      .browseHeroContent {
        width: calc(100vw - 32px) !important;
        max-width: calc(100vw - 32px) !important;
        margin-left: 16px !important;
        padding-bottom: 72px !important;
      }

      .browseLogoTitle {
        font-size: clamp(42px, 14vw, 68px) !important;
        line-height: .9 !important;
      }

      .browseDesc {
        max-width: 94vw !important;
        font-size: 14px !important;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden !important;
      }

      .browseMaturity {
        position: static !important;
        margin-top: 14px !important;
      }

      .browseRows {
        margin-top: -32px !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(170px, 68vw) !important;
      }

      .netflixWordmark {
        font-size: 22px !important;
      }

      .netflixBrand::before {
        width: 30px !important;
        height: 30px !important;
      }
    }


    /* ============================================================
       v13 Clean Hybrid Rebuild
       This intentionally calms the design down:
       less chaos, cleaner spacing, stable rows, controlled glow, better hierarchy.
       ============================================================ */

    :root {
      --ds-bg: #070914;
      --ds-bg-2: #0b1020;
      --ds-panel: rgba(255,255,255,.075);
      --ds-panel-2: rgba(255,255,255,.115);
      --ds-line: rgba(255,255,255,.13);
      --ds-text: #f8fbff;
      --ds-muted: rgba(248,251,255,.68);
      --ds-muted-2: rgba(248,251,255,.46);
      --ds-purple: #8b6cff;
      --ds-blue: #38d5ff;
      --ds-pink: #ff6ad5;
      --ds-green: #6fffc6;
      --ds-left: clamp(18px, 4vw, 70px);
      --ds-right: clamp(18px, 4vw, 70px);
      --ds-nav-h: 72px;
      --ds-radius: 16px;
      --ds-card-gap: 10px;
      --nf-left: var(--ds-left);
      --nf-right: var(--ds-right);
    }

    html,
    body {
      background:
        radial-gradient(900px circle at 20% -12%, rgba(139,108,255,.16), transparent 48%),
        radial-gradient(900px circle at 90% -10%, rgba(56,213,255,.10), transparent 42%),
        linear-gradient(180deg, #060811, #070914 38%, #050711) !important;
      color: var(--ds-text) !important;
      font-family: Inter, Arial, Helvetica, sans-serif !important;
    }

    body::before,
    body::after {
      display: none !important;
    }

    .netflixTopbar {
      height: var(--ds-nav-h) !important;
      min-height: var(--ds-nav-h) !important;
      background: linear-gradient(to bottom, rgba(7,9,20,.88), rgba(7,9,20,.48), transparent) !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    .netflixTopbar[style] {
      background: rgba(7,9,20,.88) !important;
      border-bottom: 1px solid rgba(255,255,255,.075) !important;
      backdrop-filter: blur(18px) saturate(1.05) !important;
      -webkit-backdrop-filter: blur(18px) saturate(1.05) !important;
    }

    .netflixNav {
      height: var(--ds-nav-h) !important;
      min-height: var(--ds-nav-h) !important;
      width: auto !important;
      margin: 0 !important;
      padding: 0 var(--ds-right) 0 var(--ds-left) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 24px !important;
    }

    .navLeftCluster {
      display: flex !important;
      align-items: center !important;
      gap: 24px !important;
      min-width: 0 !important;
    }

    .netflixBrand {
      display: inline-flex !important;
      align-items: center !important;
      gap: 10px !important;
      height: auto !important;
    }

    .netflixBrand::before {
      content: "" !important;
      width: 34px !important;
      height: 34px !important;
      margin: 0 !important;
      border-radius: 12px !important;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.34), transparent 36%),
        linear-gradient(135deg, var(--ds-purple), var(--ds-blue)) !important;
      box-shadow: 0 10px 32px rgba(56,213,255,.16) !important;
      flex: 0 0 auto !important;
    }

    .netflixWordmark {
      color: transparent !important;
      background: linear-gradient(90deg, #fff, #dfe7ff 36%, #b9a7ff 70%, #dff8ff);
      -webkit-background-clip: text;
      background-clip: text;
      font-family: Inter, Arial, sans-serif !important;
      font-size: 25px !important;
      font-weight: 900 !important;
      letter-spacing: -.065em !important;
      transform: none !important;
      filter: none !important;
      text-shadow: none !important;
      line-height: 1 !important;
    }

    .netflixLinks {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    .netflixLinks a {
      color: rgba(248,251,255,.68) !important;
      font-size: 13px !important;
      font-weight: 750 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      transition: color .16s ease !important;
    }

    .netflixLinks a.active,
    .netflixLinks a:hover {
      color: #fff !important;
    }

    .navRightCluster {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      flex: 0 0 auto !important;
    }

    .iconLink,
    .textLink,
    .caretTiny {
      color: rgba(248,251,255,.82) !important;
    }

    .profilePill {
      width: 31px !important;
      height: 31px !important;
      border-radius: 10px !important;
      background:
        radial-gradient(circle at 50% 36%, rgba(255,255,255,.95) 0 9%, transparent 10%),
        linear-gradient(135deg, var(--ds-purple), var(--ds-blue)) !important;
      box-shadow: 0 10px 26px rgba(56,213,255,.14) !important;
    }

    .showcaseHero,
    .browseHero {
      min-height: 100svh !important;
      background: var(--ds-bg) !important;
      position: relative !important;
      overflow: hidden !important;
      display: block !important;
      padding: 0 !important;
      isolation: isolate !important;
    }

    .showcaseHeroBg,
    .browseHeroBg,
    .nfModalHeroBg {
      inset: 0 !important;
      background-position: center center !important;
      background-size: cover !important;
      filter: brightness(.66) saturate(1.03) contrast(1.02) !important;
      transform: none !important;
    }

    .showcaseHero::before,
    .browseHero::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: -2 !important;
      background:
        radial-gradient(760px circle at 26% 44%, rgba(139,108,255,.18), transparent 43%),
        linear-gradient(to top, var(--ds-bg) 0%, rgba(7,9,20,.94) 8%, rgba(7,9,20,.54) 28%, rgba(7,9,20,.14) 58%, rgba(7,9,20,.72) 100%),
        linear-gradient(90deg, rgba(7,9,20,.84) 0%, rgba(7,9,20,.48) 34%, rgba(7,9,20,.08) 74%) !important;
    }

    .showcaseInner,
    .browseHeroContent,
    .browseRows .showcaseInner,
    .container {
      width: auto !important;
      max-width: none !important;
      margin-left: var(--ds-left) !important;
      margin-right: var(--ds-right) !important;
    }

    .showcaseCopy,
    .browseHeroContent {
      position: absolute !important;
      left: var(--ds-left) !important;
      bottom: clamp(118px, 18vh, 190px) !important;
      z-index: 12 !important;
      width: min(620px, 48vw) !important;
      max-width: min(620px, 48vw) !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    .browseHeroTop {
      position: absolute !important;
      top: calc(var(--ds-nav-h) + 26px) !important;
      left: var(--ds-left) !important;
      right: var(--ds-right) !important;
      z-index: 20 !important;
      display: flex !important;
      align-items: center !important;
      gap: 18px !important;
      margin: 0 !important;
    }

    .browseHeroTop h1 {
      color: var(--ds-text) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: clamp(30px, 3vw, 44px) !important;
      line-height: 1 !important;
      font-weight: 800 !important;
      letter-spacing: -.055em !important;
      margin: 0 !important;
    }

    .showcaseKicker {
      width: fit-content !important;
      min-height: 31px !important;
      display: inline-flex !important;
      align-items: center !important;
      padding: 7px 10px !important;
      margin: 0 0 14px !important;
      border-radius: 999px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.12) !important;
      color: rgba(248,251,255,.76) !important;
      font-size: 11px !important;
      letter-spacing: .08em !important;
      text-transform: uppercase !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .showcaseTitle,
    .browseLogoTitle,
    .nfModalHeroContent h1 {
      max-width: 100% !important;
      margin: 0 !important;
      color: var(--ds-text) !important;
      font-family: "Space Grotesk", Inter, Arial, sans-serif !important;
      font-size: clamp(48px, 6.4vw, 94px) !important;
      line-height: .86 !important;
      letter-spacing: -.085em !important;
      text-transform: uppercase !important;
      text-shadow: 0 10px 38px rgba(0,0,0,.54) !important;
      overflow: visible !important;
      word-break: normal !important;
      text-wrap: balance !important;
    }

    .showcaseTitleSmall {
      color: var(--ds-text) !important;
      background: none !important;
      -webkit-background-clip: initial !important;
      background-clip: initial !important;
      font-size: 1em !important;
      line-height: inherit !important;
    }

    .showcaseDesc,
    .browseDesc {
      max-width: 570px !important;
      margin: 16px 0 0 !important;
      color: rgba(248,251,255,.78) !important;
      font-size: clamp(14px, 1.22vw, 18px) !important;
      line-height: 1.48 !important;
      font-weight: 560 !important;
      text-shadow: 0 2px 18px rgba(0,0,0,.46) !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 5 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }

    .browseTopRank {
      margin-top: 16px !important;
      gap: 10px !important;
      align-items: center !important;
    }

    .top10Badge {
      width: 34px !important;
      height: 40px !important;
      border-radius: 8px !important;
      background: linear-gradient(135deg, var(--ds-purple), var(--ds-blue)) !important;
      font-size: 8px !important;
      box-shadow: none !important;
    }

    .browseTopRank strong {
      color: var(--ds-text) !important;
      font-size: clamp(16px, 1.45vw, 22px) !important;
      line-height: 1.15 !important;
      font-weight: 760 !important;
    }

    .showcaseButtons,
    .browseButtons {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex-wrap: wrap !important;
      margin-top: 20px !important;
    }

    .showcaseBtn,
    .browsePlay,
    .nfActionPlay {
      min-height: 48px !important;
      padding: 0 20px !important;
      border-radius: 13px !important;
      border: 0 !important;
      color: #050711 !important;
      background: linear-gradient(135deg, #ffffff, #e6f9ff) !important;
      box-shadow: 0 16px 34px rgba(255,255,255,.08) !important;
      font-size: 15px !important;
      font-weight: 850 !important;
    }

    .showcaseBtnSecondary,
    .browseInfo,
    .nfActionInfo {
      min-height: 48px !important;
      padding: 0 18px !important;
      border-radius: 13px !important;
      color: white !important;
      background: rgba(255,255,255,.105) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
      box-shadow: none !important;
      font-size: 15px !important;
      font-weight: 800 !important;
    }

    .showcasePlay,
    .browsePlayIcon,
    .showcaseInfo,
    .browseInfoIcon {
      font-size: 22px !important;
    }

    .showcaseMaturity,
    .browseMaturity {
      position: absolute !important;
      right: 0 !important;
      bottom: clamp(128px, 19vh, 210px) !important;
      z-index: 14 !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      margin: 0 !important;
      transform: none !important;
    }

    .showcaseMute,
    .browseMute {
      width: 42px !important;
      height: 42px !important;
      border-radius: 999px !important;
      background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.24) !important;
      font-size: 16px !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      box-shadow: none !important;
    }

    .browseRating {
      height: 40px !important;
      min-width: 92px !important;
      display: flex !important;
      align-items: center !important;
      padding-left: 14px !important;
      color: white !important;
      background: rgba(255,255,255,.09) !important;
      border-left: 3px solid var(--ds-blue) !important;
      font-size: 15px !important;
      font-weight: 760 !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    .showcaseRowWrap,
    .browseRows {
      position: relative !important;
      z-index: 30 !important;
      margin-top: -92px !important;
      padding-bottom: 72px !important;
      background: transparent !important;
    }

    .nfRowSection {
      margin: 0 0 2px !important;
      position: relative !important;
      z-index: 30 !important;
    }

    .nfRowTitle,
    .showcaseRowTitle {
      margin: 0 0 10px !important;
      color: var(--ds-text) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: clamp(18px, 1.45vw, 25px) !important;
      line-height: 1.15 !important;
      letter-spacing: -.035em !important;
      font-weight: 850 !important;
      text-shadow: none !important;
    }

    .nfRowTitle::after,
    .showcaseRowTitle::after {
      display: none !important;
    }

    .movieRail,
    .nfRail,
    .showcaseRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: calc((100vw - (var(--ds-left) + var(--ds-right)) - (var(--ds-card-gap) * 5)) / 6) !important;
      gap: var(--ds-card-gap) !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      scrollbar-width: none !important;
      padding: 0 0 36px !important;
      margin-bottom: -12px !important;
      scroll-snap-type: x proximity !important;
    }

    .movieRail::-webkit-scrollbar,
    .nfRail::-webkit-scrollbar,
    .showcaseRail::-webkit-scrollbar,
    .nfTopTenRail::-webkit-scrollbar {
      display: none !important;
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap,
    .nfSimilarGrid .posterWrap {
      aspect-ratio: 16 / 9 !important;
      border-radius: var(--ds-radius) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      background: rgba(255,255,255,.055) !important;
      box-shadow: 0 12px 28px rgba(0,0,0,.18) !important;
      transform: none !important;
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease !important;
      overflow: hidden !important;
    }

    .nfThumb img,
    .showcaseRail .posterWrap img,
    .browseRows .showcaseRail .posterWrap img,
    .netflixCatalog .posterWrap img,
    .nfSimilarGrid .posterWrap img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .nfThumb:hover,
    .showcaseRail .posterWrap:hover,
    .browseRows .showcaseRail .posterWrap:hover,
    .netflixCatalog .posterWrap:hover {
      transform: translateY(-5px) scale(1.035) !important;
      box-shadow: 0 22px 46px rgba(0,0,0,.34), 0 0 30px rgba(139,108,255,.12) !important;
      border-color: rgba(255,255,255,.18) !important;
      transition-delay: 0s !important;
    }

    .nfHoverPanel {
      display: none !important;
    }

    .posterShade,
    .typePill,
    .ratingPill,
    .movieInfo,
    .nfCardAdd {
      display: none !important;
    }

    .nfTopTenRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(190px, 260px) !important;
      gap: 16px !important;
      overflow-x: auto !important;
      scrollbar-width: none !important;
      padding-bottom: 34px !important;
    }

    .topTenCard {
      min-height: 150px !important;
      display: grid !important;
      grid-template-columns: 40% 60% !important;
      align-items: end !important;
    }

    .topTenNumber {
      color: rgba(0,0,0,.25) !important;
      -webkit-text-stroke: 3px rgba(224,232,255,.46) !important;
      font-family: Impact, Arial Black, Arial, sans-serif !important;
      font-size: clamp(96px, 8.5vw, 168px) !important;
      line-height: .76 !important;
      letter-spacing: -.12em !important;
      text-shadow: none !important;
    }

    .topTenPoster {
      aspect-ratio: 2 / 3 !important;
      border-radius: 14px !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 18px 38px rgba(0,0,0,.28) !important;
      overflow: hidden !important;
      background: rgba(255,255,255,.06) !important;
    }

    .genreDropdown summary,
    .nfLanguageSelects select,
    .nfMyListControls a,
    .nfMyListControls button {
      min-height: 36px !important;
      border-radius: 12px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      color: rgba(248,251,255,.88) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    .genreDropdownMenu {
      border-radius: 16px !important;
      background: rgba(7,9,20,.96) !important;
      border: 1px solid rgba(255,255,255,.13) !important;
      box-shadow: 0 24px 72px rgba(0,0,0,.50) !important;
    }

    .nfDetailPage,
    .nfSearchShell,
    .nfGenresShell,
    .nfMyListHeader,
    .profileGate {
      background:
        radial-gradient(800px circle at 16% -8%, rgba(139,108,255,.16), transparent 44%),
        radial-gradient(800px circle at 88% -10%, rgba(56,213,255,.09), transparent 42%),
        var(--ds-bg) !important;
    }

    .nfModalShell {
      background: rgba(9,13,27,.96) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      border-radius: 22px !important;
      box-shadow: 0 34px 120px rgba(0,0,0,.60) !important;
    }

    .nfModalHero::after {
      background:
        linear-gradient(to top, rgba(9,13,27,1) 0%, rgba(9,13,27,.88) 16%, rgba(9,13,27,.32) 48%, rgba(0,0,0,.28) 100%),
        linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.06)) !important;
    }

    .nfModalBody {
      background: rgba(9,13,27,1) !important;
    }

    .nfModalType,
    .nfCircleControl,
    .nfMaturityBox,
    .nfSeasonBlock,
    .nfCastPhoto,
    .trailerCard,
    .emptyState,
    .watchlistEmptyNetflix {
      background: rgba(255,255,255,.065) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      border-radius: 14px !important;
    }

    .nfDetailNav {
      border-bottom-color: rgba(255,255,255,.10) !important;
    }

    .nfDetailNav a:first-child {
      border-bottom-color: var(--ds-blue) !important;
    }

    .nfSearchLarge form {
      border-radius: 16px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      overflow: hidden !important;
    }

    .nfSearchLarge button {
      background: linear-gradient(135deg, var(--ds-purple), var(--ds-blue)) !important;
    }

    .nfGenreTile {
      border-radius: 18px !important;
      background:
        linear-gradient(135deg, rgba(139,108,255,.34), rgba(56,213,255,.12)),
        rgba(255,255,255,.055) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 14px 34px rgba(0,0,0,.18) !important;
    }

    .profileAvatar {
      border-radius: 20px !important;
      box-shadow: 0 18px 44px rgba(0,0,0,.28) !important;
    }

    @media(max-width: 1220px) {
      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: calc((100vw - (var(--ds-left) + var(--ds-right)) - (var(--ds-card-gap) * 3)) / 4) !important;
      }

      .showcaseCopy,
      .browseHeroContent {
        width: min(610px, 58vw) !important;
        max-width: min(610px, 58vw) !important;
      }

      .netflixLinks {
        gap: 11px !important;
      }

      .netflixLinks a {
        font-size: 12px !important;
      }
    }

    @media(max-width: 760px) {
      :root {
        --ds-left: 16px;
        --ds-right: 16px;
        --ds-nav-h: 64px;
      }

      .netflixTopbar {
        height: auto !important;
        min-height: var(--ds-nav-h) !important;
        background: rgba(7,9,20,.92) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      .netflixNav {
        min-height: var(--ds-nav-h) !important;
        height: auto !important;
        padding: 0 16px !important;
        display: grid !important;
        grid-template-columns: 1fr auto !important;
      }

      .netflixLinks,
      .navRightCluster {
        display: none !important;
      }

      .mobileSearchForm {
        display: grid !important;
        grid-column: 1 / -1 !important;
        margin: 0 0 10px !important;
      }

      .netflixWordmark {
        font-size: 21px !important;
      }

      .netflixBrand::before {
        width: 29px !important;
        height: 29px !important;
        border-radius: 11px !important;
      }

      .showcaseHero,
      .browseHero {
        min-height: 82svh !important;
      }

      .showcaseCopy,
      .browseHeroContent {
        left: 16px !important;
        bottom: 74px !important;
        width: calc(100vw - 32px) !important;
        max-width: calc(100vw - 32px) !important;
      }

      .browseHeroTop {
        top: 86px !important;
        left: 16px !important;
        right: 16px !important;
      }

      .browseHeroTop h1 {
        font-size: 30px !important;
      }

      .showcaseTitle,
      .browseLogoTitle {
        font-size: clamp(40px, 13vw, 64px) !important;
        line-height: .91 !important;
      }

      .showcaseDesc,
      .browseDesc {
        font-size: 13px !important;
        line-height: 1.45 !important;
        -webkit-line-clamp: 4 !important;
      }

      .showcaseMaturity,
      .browseMaturity {
        display: none !important;
      }

      .showcaseBtn,
      .showcaseBtnSecondary,
      .browsePlay,
      .browseInfo {
        min-height: 42px !important;
        padding: 0 14px !important;
        font-size: 13px !important;
        border-radius: 11px !important;
      }

      .showcaseRowWrap,
      .browseRows {
        margin-top: -28px !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(170px, 68vw) !important;
        gap: 8px !important;
      }

      .nfThumb:hover,
      .showcaseRail .posterWrap:hover,
      .browseRows .showcaseRail .posterWrap:hover,
      .netflixCatalog .posterWrap:hover {
        transform: none !important;
      }

      .nfTopTenRail {
        grid-auto-columns: 210px !important;
      }

      .nfModalShell {
        border-radius: 0 !important;
      }
    }


    /* ============================================================
       v14 X100 Polish Pass
       A clean final visual system: streaming layout + Dropcart luxury,
       with fixed spacing, less chaos, better cards, better rows, and better mobile.
       ============================================================ */

    :root {
      --x-bg: #050712;
      --x-bg2: #080b18;
      --x-surface: rgba(255,255,255,.072);
      --x-surface2: rgba(255,255,255,.115);
      --x-line: rgba(255,255,255,.13);
      --x-line2: rgba(255,255,255,.22);
      --x-text: #f8fbff;
      --x-muted: rgba(248,251,255,.70);
      --x-muted2: rgba(248,251,255,.48);
      --x-purple: #8c6bff;
      --x-blue: #35d8ff;
      --x-pink: #ff65d8;
      --x-green: #6fffc6;
      --x-red: #ff5468;
      --x-left: clamp(18px, 4.2vw, 76px);
      --x-right: clamp(18px, 4.2vw, 76px);
      --x-nav: 74px;
      --x-radius: 18px;
      --x-card-gap: 10px;
      --x-card-min: 196px;
      --nf-left: var(--x-left);
      --nf-right: var(--x-right);
      --ds-left: var(--x-left);
      --ds-right: var(--x-right);
      --ds-nav-h: var(--x-nav);
    }

    * {
      box-sizing: border-box;
    }

    html {
      background: var(--x-bg) !important;
      scroll-behavior: smooth;
    }

    body {
      margin: 0 !important;
      background:
        radial-gradient(1100px circle at 15% -12%, rgba(140,107,255,.18), transparent 42%),
        radial-gradient(950px circle at 88% -10%, rgba(53,216,255,.12), transparent 44%),
        linear-gradient(180deg, #050712 0%, #070a16 46%, #050712 100%) !important;
      color: var(--x-text) !important;
      font-family: Inter, Arial, Helvetica, sans-serif !important;
      overflow-x: hidden !important;
    }

    body::before,
    body::after {
      display: none !important;
    }

    a {
      text-decoration: none !important;
    }

    /* Top navigation */
    .netflixTopbar {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 2000 !important;
      height: var(--x-nav) !important;
      min-height: var(--x-nav) !important;
      background: linear-gradient(to bottom, rgba(5,7,18,.92), rgba(5,7,18,.58), transparent) !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      transition: background .22s ease, border-color .22s ease, backdrop-filter .22s ease !important;
    }

    .netflixTopbar.isScrolled {
      background: rgba(5,7,18,.88) !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
      backdrop-filter: blur(20px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(20px) saturate(1.08) !important;
    }

    .netflixNav {
      height: var(--x-nav) !important;
      min-height: var(--x-nav) !important;
      width: auto !important;
      margin: 0 !important;
      padding: 0 var(--x-right) 0 var(--x-left) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 24px !important;
    }

    .navLeftCluster {
      display: flex !important;
      align-items: center !important;
      gap: 24px !important;
      min-width: 0 !important;
    }

    .netflixBrand {
      display: inline-flex !important;
      align-items: center !important;
      gap: 11px !important;
      flex: 0 0 auto !important;
    }

    .netflixBrand::before {
      content: "" !important;
      width: 36px !important;
      height: 36px !important;
      margin: 0 !important;
      border-radius: 14px !important;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.38), transparent 36%),
        linear-gradient(135deg, var(--x-purple), var(--x-blue)) !important;
      box-shadow: 0 14px 34px rgba(53,216,255,.18), 0 0 32px rgba(140,107,255,.16) !important;
      flex: 0 0 auto !important;
    }

    .netflixWordmark {
      color: transparent !important;
      background: linear-gradient(90deg, #fff 0%, #edf4ff 28%, #b9a8ff 68%, #c9f7ff 100%) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: 25px !important;
      font-weight: 950 !important;
      letter-spacing: -.065em !important;
      line-height: 1 !important;
      transform: none !important;
      filter: none !important;
      text-shadow: none !important;
      white-space: nowrap !important;
    }

    .netflixLinks {
      display: flex !important;
      align-items: center !important;
      gap: 17px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    .netflixLinks a {
      display: inline-flex !important;
      align-items: center !important;
      padding: 0 !important;
      min-height: auto !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: rgba(248,251,255,.68) !important;
      font-size: 13px !important;
      font-weight: 760 !important;
      letter-spacing: -.01em !important;
      transition: color .16s ease, opacity .16s ease !important;
    }

    .netflixLinks a.active,
    .netflixLinks a:hover {
      color: var(--x-text) !important;
    }

    .navRightCluster {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      flex: 0 0 auto !important;
    }

    .iconLink {
      color: rgba(248,251,255,.84) !important;
      font-size: 24px !important;
      font-weight: 500 !important;
      line-height: 1 !important;
      transform: none !important;
    }

    .textLink {
      color: rgba(248,251,255,.84) !important;
      font-size: 13px !important;
      font-weight: 820 !important;
    }

    .profilePill {
      width: 32px !important;
      height: 32px !important;
      border-radius: 12px !important;
      background:
        radial-gradient(circle at 50% 35%, rgba(255,255,255,.95) 0 9%, transparent 10%),
        linear-gradient(135deg, var(--x-purple), var(--x-blue)) !important;
      box-shadow: 0 10px 26px rgba(53,216,255,.16) !important;
      font-size: 0 !important;
      position: relative !important;
    }

    .profilePill::before,
    .profilePill::after {
      display: none !important;
    }

    .caretTiny {
      color: rgba(248,251,255,.62) !important;
      margin-left: -10px !important;
      font-size: 10px !important;
    }

    .mobileSearchForm {
      display: none !important;
    }

    /* Hero / browse pages */
    .showcaseHero,
    .browseHero {
      position: relative !important;
      min-height: 100svh !important;
      height: 100svh !important;
      display: block !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: var(--x-bg) !important;
      isolation: isolate !important;
    }

    .showcaseHeroBg,
    .browseHeroBg,
    .detailBg,
    .nfModalHeroBg {
      position: absolute !important;
      inset: 0 !important;
      background-size: cover !important;
      background-position: center center !important;
      filter: brightness(.64) saturate(1.05) contrast(1.03) !important;
      transform: none !important;
      opacity: 1 !important;
    }

    .showcaseHero::before,
    .browseHero::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: -2 !important;
      background:
        radial-gradient(820px circle at 28% 46%, rgba(140,107,255,.18), transparent 44%),
        linear-gradient(to top, var(--x-bg) 0%, rgba(5,7,18,.95) 8%, rgba(5,7,18,.58) 30%, rgba(5,7,18,.14) 58%, rgba(5,7,18,.72) 100%),
        linear-gradient(90deg, rgba(5,7,18,.88) 0%, rgba(5,7,18,.52) 36%, rgba(5,7,18,.10) 76%) !important;
    }

    .showcaseInner,
    .browseHeroContent,
    .browseRows .showcaseInner,
    .container {
      width: auto !important;
      max-width: none !important;
      margin-left: var(--x-left) !important;
      margin-right: var(--x-right) !important;
    }

    .showcaseCopy,
    .browseHeroContent {
      position: absolute !important;
      left: var(--x-left) !important;
      bottom: clamp(130px, 19vh, 205px) !important;
      z-index: 14 !important;
      width: min(620px, 47vw) !important;
      max-width: min(620px, 47vw) !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    .browseHeroTop {
      position: absolute !important;
      top: calc(var(--x-nav) + 26px) !important;
      left: var(--x-left) !important;
      right: var(--x-right) !important;
      z-index: 22 !important;
      display: flex !important;
      align-items: center !important;
      gap: 18px !important;
      margin: 0 !important;
    }

    .browseHeroTop h1 {
      margin: 0 !important;
      color: var(--x-text) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: clamp(30px, 3vw, 44px) !important;
      line-height: 1 !important;
      font-weight: 850 !important;
      letter-spacing: -.06em !important;
      text-shadow: 0 8px 28px rgba(0,0,0,.38) !important;
    }

    .genreDropdown {
      position: relative !important;
      z-index: 40 !important;
    }

    .genreDropdown summary {
      list-style: none !important;
      height: 38px !important;
      min-height: 38px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 22px !important;
      padding: 0 13px !important;
      border-radius: 13px !important;
      color: rgba(248,251,255,.88) !important;
      background: rgba(255,255,255,.078) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      font-size: 13px !important;
      font-weight: 850 !important;
      cursor: pointer !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .genreDropdown summary::-webkit-details-marker {
      display: none !important;
    }

    .genreDropdownMenu {
      position: absolute !important;
      top: calc(100% + 8px) !important;
      left: 0 !important;
      z-index: 80 !important;
      width: min(370px, calc(100vw - 36px)) !important;
      max-height: 420px !important;
      overflow: auto !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 4px !important;
      padding: 12px !important;
      border-radius: 18px !important;
      background: rgba(7,10,22,.96) !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      box-shadow: 0 28px 90px rgba(0,0,0,.52) !important;
      backdrop-filter: blur(18px) !important;
      -webkit-backdrop-filter: blur(18px) !important;
    }

    .genreDropdownMenu a {
      display: block !important;
      padding: 9px 10px !important;
      border-radius: 10px !important;
      color: rgba(248,251,255,.70) !important;
      font-size: 13px !important;
      font-weight: 720 !important;
    }

    .genreDropdownMenu a:hover {
      color: white !important;
      background: rgba(255,255,255,.07) !important;
      text-decoration: none !important;
    }

    .showcaseKicker {
      width: fit-content !important;
      min-height: 32px !important;
      display: inline-flex !important;
      align-items: center !important;
      padding: 7px 11px !important;
      margin: 0 0 14px !important;
      border-radius: 999px !important;
      background: rgba(255,255,255,.078) !important;
      border: 1px solid rgba(255,255,255,.13) !important;
      color: rgba(248,251,255,.76) !important;
      font-size: 11px !important;
      font-weight: 900 !important;
      letter-spacing: .08em !important;
      text-transform: uppercase !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
      text-shadow: none !important;
    }

    .showcaseTitle,
    .browseLogoTitle,
    .nfModalHeroContent h1 {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--x-text) !important;
      font-family: "Space Grotesk", Inter, Arial, sans-serif !important;
      font-size: clamp(48px, 6.25vw, 92px) !important;
      line-height: .88 !important;
      letter-spacing: -.087em !important;
      text-transform: uppercase !important;
      text-shadow: 0 12px 38px rgba(0,0,0,.55) !important;
      overflow: visible !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      text-wrap: balance !important;
      transform: none !important;
    }

    .showcaseTitleSmall {
      display: block !important;
      color: var(--x-text) !important;
      background: none !important;
      -webkit-background-clip: initial !important;
      background-clip: initial !important;
      font: inherit !important;
      line-height: inherit !important;
      letter-spacing: inherit !important;
    }

    .showcaseDesc,
    .browseDesc {
      max-width: 570px !important;
      margin: 16px 0 0 !important;
      color: rgba(248,251,255,.78) !important;
      font-size: clamp(14px, 1.18vw, 18px) !important;
      line-height: 1.5 !important;
      font-weight: 580 !important;
      text-shadow: 0 2px 18px rgba(0,0,0,.46) !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 5 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }

    .browseTopRank {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      margin-top: 16px !important;
      color: var(--x-text) !important;
    }

    .top10Badge {
      width: 34px !important;
      height: 40px !important;
      border-radius: 10px !important;
      display: grid !important;
      place-items: center !important;
      background: linear-gradient(135deg, var(--x-purple), var(--x-blue)) !important;
      color: #fff !important;
      font-size: 8px !important;
      line-height: .9 !important;
      font-weight: 950 !important;
      text-transform: uppercase !important;
      box-shadow: none !important;
      flex: 0 0 auto !important;
    }

    .browseTopRank strong {
      color: var(--x-text) !important;
      font-size: clamp(16px, 1.42vw, 22px) !important;
      line-height: 1.15 !important;
      font-weight: 800 !important;
      letter-spacing: -.035em !important;
      text-shadow: 0 4px 18px rgba(0,0,0,.40) !important;
    }

    .showcaseButtons,
    .browseButtons,
    .nfModalActions {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex-wrap: wrap !important;
      margin-top: 21px !important;
    }

    .showcaseBtn,
    .browsePlay,
    .nfActionPlay {
      min-height: 48px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 9px !important;
      padding: 0 21px !important;
      border-radius: 14px !important;
      border: 0 !important;
      color: #050711 !important;
      background: linear-gradient(135deg, #fff, #e8faff) !important;
      box-shadow: 0 16px 34px rgba(255,255,255,.08) !important;
      font-size: 15px !important;
      font-weight: 900 !important;
      cursor: pointer !important;
    }

    .showcaseBtnSecondary,
    .browseInfo,
    .nfActionInfo {
      min-height: 48px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 9px !important;
      padding: 0 18px !important;
      border-radius: 14px !important;
      color: white !important;
      background: rgba(255,255,255,.105) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
      box-shadow: none !important;
      font-size: 15px !important;
      font-weight: 860 !important;
      cursor: pointer !important;
    }

    .showcaseBtn:hover,
    .browsePlay:hover,
    .nfActionPlay:hover {
      transform: translateY(-1px) !important;
      background: #fff !important;
    }

    .showcaseBtnSecondary:hover,
    .browseInfo:hover,
    .nfActionInfo:hover {
      background: rgba(255,255,255,.15) !important;
    }

    .showcasePlay,
    .browsePlayIcon,
    .showcaseInfo,
    .browseInfoIcon {
      font-size: 22px !important;
      line-height: 1 !important;
      transform: none !important;
    }

    .showcaseMaturity,
    .browseMaturity {
      position: absolute !important;
      right: 0 !important;
      bottom: clamp(138px, 20vh, 220px) !important;
      z-index: 16 !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      margin: 0 !important;
      transform: none !important;
      color: white !important;
    }

    .showcaseMute,
    .browseMute {
      width: 42px !important;
      height: 42px !important;
      border-radius: 999px !important;
      display: grid !important;
      place-items: center !important;
      background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.24) !important;
      color: white !important;
      font-size: 16px !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      box-shadow: none !important;
    }

    .browseRating {
      height: 40px !important;
      min-width: 92px !important;
      display: flex !important;
      align-items: center !important;
      padding-left: 14px !important;
      color: white !important;
      background: rgba(255,255,255,.09) !important;
      border-left: 3px solid var(--x-blue) !important;
      font-size: 15px !important;
      font-weight: 820 !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    /* Rows */
    .showcaseRowWrap,
    .browseRows {
      position: relative !important;
      z-index: 32 !important;
      margin-top: -104px !important;
      padding-bottom: 78px !important;
      background: transparent !important;
    }

    .nfRowSection {
      position: relative !important;
      z-index: 30 !important;
      margin: 0 0 4px !important;
    }

    .nfRowTitle,
    .showcaseRowTitle {
      margin: 0 0 10px !important;
      color: var(--x-text) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: clamp(18px, 1.42vw, 25px) !important;
      line-height: 1.15 !important;
      letter-spacing: -.035em !important;
      font-weight: 900 !important;
      text-shadow: none !important;
    }

    .nfRowTitle::after,
    .showcaseRowTitle::after {
      display: none !important;
    }

    .movieRail,
    .nfRail,
    .showcaseRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(var(--x-card-min), calc((100vw - (var(--x-left) + var(--x-right)) - (var(--x-card-gap) * 5)) / 6)) !important;
      gap: var(--x-card-gap) !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      scrollbar-width: none !important;
      padding: 0 0 38px !important;
      margin-bottom: -12px !important;
      scroll-snap-type: x proximity !important;
    }

    .movieRail::-webkit-scrollbar,
    .nfRail::-webkit-scrollbar,
    .showcaseRail::-webkit-scrollbar,
    .nfTopTenRail::-webkit-scrollbar {
      display: none !important;
    }

    .nfTitleCard {
      position: relative !important;
      z-index: 1 !important;
      scroll-snap-align: start !important;
    }

    .nfThumb,
    .showcaseRail .posterWrap,
    .browseRows .showcaseRail .posterWrap,
    .netflixCatalog .posterWrap,
    .nfSimilarGrid .posterWrap {
      aspect-ratio: 16 / 9 !important;
      border-radius: var(--x-radius) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      background: rgba(255,255,255,.055) !important;
      box-shadow: 0 12px 28px rgba(0,0,0,.18) !important;
      transform: none !important;
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, filter .16s ease !important;
      overflow: hidden !important;
    }

    .nfThumb img,
    .showcaseRail .posterWrap img,
    .browseRows .showcaseRail .posterWrap img,
    .netflixCatalog .posterWrap img,
    .nfSimilarGrid .posterWrap img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .nfThumb:hover,
    .showcaseRail .posterWrap:hover,
    .browseRows .showcaseRail .posterWrap:hover,
    .netflixCatalog .posterWrap:hover {
      transform: translateY(-6px) scale(1.035) !important;
      box-shadow: 0 22px 48px rgba(0,0,0,.34), 0 0 30px rgba(140,107,255,.13) !important;
      border-color: rgba(255,255,255,.18) !important;
      filter: saturate(1.04) brightness(1.05) !important;
      transition-delay: 0s !important;
    }

    .posterShade,
    .typePill,
    .ratingPill,
    .movieInfo,
    .nfCardAdd,
    .nfHoverPanel {
      display: none !important;
    }

    /* Row controls added by JS */
    .dsRowControls {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      gap: 8px;
      z-index: 5;
      opacity: 0;
      transform: translateY(-3px);
      transition: opacity .16s ease, transform .16s ease;
    }

    .nfRowSection:hover .dsRowControls {
      opacity: 1;
      transform: translateY(0);
    }

    .dsRowBtn {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: #fff;
      display: grid;
      place-items: center;
      cursor: pointer;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsRowBtn:hover {
      background: rgba(255,255,255,.14);
    }

    .dsProgress {
      height: 3px;
      width: 64px;
      margin-top: -24px;
      margin-left: auto;
      margin-right: 2px;
      border-radius: 999px;
      background: rgba(255,255,255,.10);
      overflow: hidden;
      opacity: 0;
      transition: opacity .16s ease;
    }

    .nfRowSection:hover .dsProgress {
      opacity: 1;
    }

    .dsProgress span {
      display: block;
      height: 100%;
      width: 33%;
      background: linear-gradient(90deg, var(--x-purple), var(--x-blue));
      border-radius: 999px;
      transform: translateX(0);
    }

    /* Top 10 */
    .nfTopTenRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(190px, 260px) !important;
      gap: 16px !important;
      overflow-x: auto !important;
      scrollbar-width: none !important;
      padding-bottom: 36px !important;
    }

    .topTenCard {
      min-height: 152px !important;
      display: grid !important;
      grid-template-columns: 40% 60% !important;
      align-items: end !important;
    }

    .topTenNumber {
      color: rgba(0,0,0,.20) !important;
      -webkit-text-stroke: 3px rgba(224,232,255,.48) !important;
      font-family: Impact, Arial Black, Arial, sans-serif !important;
      font-size: clamp(96px, 8.4vw, 166px) !important;
      line-height: .76 !important;
      letter-spacing: -.12em !important;
      text-shadow: none !important;
      transform: none !important;
      z-index: 1 !important;
    }

    .topTenPoster {
      aspect-ratio: 2 / 3 !important;
      display: block !important;
      border-radius: 16px !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 18px 38px rgba(0,0,0,.28) !important;
      overflow: hidden !important;
      background: rgba(255,255,255,.06) !important;
      transform: translateX(-6px) !important;
      z-index: 2 !important;
    }

    .topTenPoster img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    /* Page shells */
    .nfDetailPage,
    .nfSearchShell,
    .nfGenresShell,
    .nfMyListHeader,
    .profileGate {
      background:
        radial-gradient(900px circle at 16% -8%, rgba(140,107,255,.16), transparent 44%),
        radial-gradient(850px circle at 90% -10%, rgba(53,216,255,.09), transparent 42%),
        var(--x-bg) !important;
    }

    .netflixPageHero {
      padding-top: 120px !important;
      min-height: 260px !important;
      background: transparent !important;
    }

    .netflixPageHero::before {
      display: none !important;
    }

    .netflixPageHero h1,
    .nfMyListHeader h1,
    .nfLanguageHeader h1,
    .nfSearchTitle {
      color: var(--x-text) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-weight: 900 !important;
      letter-spacing: -.06em !important;
    }

    .netflixPageHero p,
    .nfMyListHeader p {
      color: var(--x-muted) !important;
    }

    .netflixCatalog .movieGrid,
    .movieGrid.netflixCatalog,
    #watchlistGrid.movieGrid,
    .nfSimilarGrid {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)) !important;
      gap: 12px !important;
      padding-top: 12px !important;
    }

    /* Details modal */
    .nfDetailPage {
      padding: 88px 0 72px !important;
      min-height: 100svh !important;
    }

    .nfModalShell {
      width: min(980px, calc(100vw - 36px)) !important;
      margin: 0 auto !important;
      border-radius: 26px !important;
      overflow: hidden !important;
      background: rgba(9,13,27,.96) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 34px 120px rgba(0,0,0,.60) !important;
    }

    .nfClose {
      width: 40px !important;
      height: 40px !important;
      border-radius: 999px !important;
      top: 16px !important;
      right: 16px !important;
      background: rgba(7,10,22,.72) !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      color: white !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .nfModalHero {
      min-height: 520px !important;
      padding: 56px 48px !important;
      display: flex !important;
      align-items: flex-end !important;
      position: relative !important;
      isolation: isolate !important;
    }

    .nfModalHero::after {
      background:
        linear-gradient(to top, rgba(9,13,27,1) 0%, rgba(9,13,27,.88) 16%, rgba(9,13,27,.32) 48%, rgba(0,0,0,.28) 100%),
        linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.06)) !important;
    }

    .nfModalBody {
      background: rgba(9,13,27,1) !important;
      padding: 0 48px 48px !important;
    }

    .nfModalType,
    .nfCircleControl,
    .nfMaturityBox,
    .nfSeasonBlock,
    .nfCastPhoto,
    .trailerCard,
    .emptyState,
    .watchlistEmptyNetflix,
    .infoPanel {
      background: rgba(255,255,255,.065) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      border-radius: 16px !important;
    }

    .nfDetailNav {
      border-bottom-color: rgba(255,255,255,.10) !important;
    }

    .nfDetailNav a:first-child {
      border-bottom-color: var(--x-blue) !important;
    }

    /* Search, genres, profiles */
    .nfSearchLarge form {
      border-radius: 18px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      overflow: hidden !important;
      backdrop-filter: blur(14px) !important;
      -webkit-backdrop-filter: blur(14px) !important;
    }

    .nfSearchLarge button {
      background: linear-gradient(135deg, var(--x-purple), var(--x-blue)) !important;
    }

    .nfLanguageSelects select,
    .nfMyListControls a,
    .nfMyListControls button {
      min-height: 38px !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      color: rgba(248,251,255,.88) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    .nfGenreTile {
      border-radius: 20px !important;
      background:
        linear-gradient(135deg, rgba(140,107,255,.34), rgba(53,216,255,.12)),
        rgba(255,255,255,.055) !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 14px 34px rgba(0,0,0,.18) !important;
    }

    .profileGate {
      min-height: 100svh !important;
    }

    .profileAvatar {
      border-radius: 22px !important;
      box-shadow: 0 18px 44px rgba(0,0,0,.28) !important;
    }

    .manageProfiles {
      border-radius: 999px !important;
      background: rgba(255,255,255,.065) !important;
      border-color: rgba(255,255,255,.18) !important;
    }

    .footer {
      margin-top: 0 !important;
      background: var(--x-bg) !important;
      border-top: 1px solid rgba(255,255,255,.08) !important;
    }

    .controlDock,
    .controlPanel {
      display: none !important;
    }

    /* Accessibility */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: .01ms !important;
      }
    }

    /* Responsive */
    @media(max-width: 1240px) {
      :root {
        --x-card-min: 190px;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(190px, calc((100vw - (var(--x-left) + var(--x-right)) - (var(--x-card-gap) * 3)) / 4)) !important;
      }

      .showcaseCopy,
      .browseHeroContent {
        width: min(610px, 58vw) !important;
        max-width: min(610px, 58vw) !important;
      }

      .netflixLinks {
        gap: 11px !important;
      }

      .netflixLinks a {
        font-size: 12px !important;
      }
    }

    @media(max-width: 860px) {
      :root {
        --x-left: 16px;
        --x-right: 16px;
        --x-nav: 66px;
      }

      .netflixTopbar {
        height: auto !important;
        min-height: var(--x-nav) !important;
        background: rgba(5,7,18,.92) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      .netflixNav {
        min-height: var(--x-nav) !important;
        height: auto !important;
        padding: 0 16px !important;
        display: grid !important;
        grid-template-columns: 1fr auto !important;
      }

      .netflixLinks,
      .navRightCluster {
        display: none !important;
      }

      .mobileSearchForm {
        display: grid !important;
        grid-column: 1 / -1 !important;
        margin: 0 0 10px !important;
      }

      .mobileSearchForm input {
        min-height: 44px !important;
        border-radius: 14px !important;
        background: rgba(255,255,255,.08) !important;
      }

      .netflixWordmark {
        font-size: 21px !important;
      }

      .netflixBrand::before {
        width: 30px !important;
        height: 30px !important;
        border-radius: 11px !important;
      }

      .showcaseHero,
      .browseHero {
        min-height: 82svh !important;
        height: 82svh !important;
      }

      .showcaseCopy,
      .browseHeroContent {
        left: 16px !important;
        bottom: 72px !important;
        width: calc(100vw - 32px) !important;
        max-width: calc(100vw - 32px) !important;
      }

      .browseHeroTop {
        top: 86px !important;
        left: 16px !important;
        right: 16px !important;
      }

      .browseHeroTop h1 {
        font-size: 30px !important;
      }

      .showcaseTitle,
      .browseLogoTitle {
        font-size: clamp(40px, 13vw, 64px) !important;
        line-height: .91 !important;
      }

      .showcaseDesc,
      .browseDesc {
        font-size: 13px !important;
        line-height: 1.45 !important;
        -webkit-line-clamp: 4 !important;
        max-width: calc(100vw - 32px) !important;
      }

      .showcaseMaturity,
      .browseMaturity {
        display: none !important;
      }

      .showcaseBtn,
      .showcaseBtnSecondary,
      .browsePlay,
      .browseInfo {
        min-height: 42px !important;
        padding: 0 14px !important;
        font-size: 13px !important;
        border-radius: 12px !important;
      }

      .showcaseRowWrap,
      .browseRows {
        margin-top: -32px !important;
      }

      .movieRail,
      .nfRail,
      .showcaseRail {
        grid-auto-columns: minmax(170px, 68vw) !important;
        gap: 8px !important;
        padding-bottom: 30px !important;
      }

      .nfThumb:hover,
      .showcaseRail .posterWrap:hover,
      .browseRows .showcaseRail .posterWrap:hover,
      .netflixCatalog .posterWrap:hover {
        transform: none !important;
      }

      .dsRowControls,
      .dsProgress {
        display: none !important;
      }

      .nfTopTenRail {
        grid-auto-columns: 210px !important;
      }

      .netflixCatalog .movieGrid,
      .movieGrid.netflixCatalog,
      #watchlistGrid.movieGrid,
      .nfSimilarGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      .nfDetailPage {
        padding: 0 !important;
      }

      .nfModalShell {
        width: 100% !important;
        border-radius: 0 !important;
      }

      .nfModalHero {
        min-height: 420px !important;
        padding: 86px 18px 36px !important;
      }

      .nfModalBody {
        padding: 0 18px 34px !important;
      }

      .nfModalInfoGrid {
        grid-template-columns: 1fr !important;
      }

      .nfTrailerGrid,
      .nfSimilarGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .nfSearchShell,
      .nfGenresShell {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }

      .nfGenreGrid,
      .netflixGenreGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }


    /* ============================================================
       v15 ULTRA OVERHAUL
       Final visual system: SwiflyTV as a premium streaming brand.
       This overrides the older stacked patches with one clean, consistent UI.
       ============================================================ */

    :root {
      --v-bg: #050711;
      --v-bg2: #080b18;
      --v-bg3: #0c1122;
      --v-surface: rgba(255,255,255,.072);
      --v-surface2: rgba(255,255,255,.115);
      --v-line: rgba(255,255,255,.13);
      --v-line2: rgba(255,255,255,.22);
      --v-text: #f8fbff;
      --v-muted: rgba(248,251,255,.70);
      --v-muted2: rgba(248,251,255,.48);
      --v-purple: #8c6bff;
      --v-blue: #35d8ff;
      --v-pink: #ff65d8;
      --v-green: #6fffc6;
      --v-shadow: 0 22px 70px rgba(0,0,0,.36);
      --v-left: clamp(18px, 4.4vw, 82px);
      --v-right: clamp(18px, 4.4vw, 82px);
      --v-nav: 74px;
      --v-radius: 18px;
      --v-gap: 10px;
      --v-card-min: 202px;
      --x-left: var(--v-left);
      --x-right: var(--v-right);
      --nf-left: var(--v-left);
      --nf-right: var(--v-right);
      --ds-left: var(--v-left);
      --ds-right: var(--v-right);
    }

    * { box-sizing: border-box; }

    html {
      background: var(--v-bg) !important;
      scroll-behavior: smooth;
    }

    body {
      margin: 0 !important;
      min-height: 100svh;
      overflow-x: hidden !important;
      background:
        radial-gradient(1100px circle at 12% -14%, rgba(140,107,255,.20), transparent 43%),
        radial-gradient(900px circle at 90% -10%, rgba(53,216,255,.12), transparent 42%),
        linear-gradient(180deg, #050711 0%, #070a16 48%, #050711 100%) !important;
      color: var(--v-text) !important;
      font-family: Inter, Arial, Helvetica, sans-serif !important;
    }

    body::before,
    body::after {
      display: none !important;
    }

    a { color: inherit; text-decoration: none !important; }
    button, input, select { font: inherit; }

    .container,
    .showcaseInner,
    .browseHeroContent,
    .browseRows .showcaseInner,
    .dsContent,
    .dsPageHeader,
    .dsSearchBox,
    .dsLanguageFilters,
    .dsMyListControls {
      width: auto !important;
      max-width: none !important;
      margin-left: var(--v-left) !important;
      margin-right: var(--v-right) !important;
    }

    .topbar,
    .netflixTopbar {
      position: fixed !important;
      inset: 0 0 auto !important;
      z-index: 2000 !important;
      height: var(--v-nav) !important;
      min-height: var(--v-nav) !important;
      background: linear-gradient(to bottom, rgba(5,7,18,.93), rgba(5,7,18,.55), transparent) !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      transition: background .22s ease, border-color .22s ease, backdrop-filter .22s ease !important;
    }

    .topbar.isScrolled,
    .netflixTopbar.isScrolled {
      background: rgba(5,7,18,.88) !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
      backdrop-filter: blur(20px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(20px) saturate(1.08) !important;
    }

    .nav,
    .netflixNav {
      width: auto !important;
      height: var(--v-nav) !important;
      min-height: var(--v-nav) !important;
      margin: 0 !important;
      padding: 0 var(--v-right) 0 var(--v-left) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 24px !important;
      grid-template-columns: none !important;
    }

    .navLeftCluster {
      display: flex !important;
      align-items: center !important;
      gap: 24px !important;
      min-width: 0 !important;
    }

    .brand,
    .netflixBrand {
      display: inline-flex !important;
      align-items: center !important;
      gap: 11px !important;
      flex: 0 0 auto !important;
      height: auto !important;
      font-size: 0 !important;
    }

    .netflixBrand::before {
      content: "" !important;
      width: 36px !important;
      height: 36px !important;
      border-radius: 14px !important;
      margin: 0 !important;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.38), transparent 36%),
        linear-gradient(135deg, var(--v-purple), var(--v-blue)) !important;
      box-shadow: 0 14px 34px rgba(53,216,255,.18), 0 0 32px rgba(140,107,255,.16) !important;
      flex: 0 0 auto !important;
    }

    .netflixWordmark {
      color: transparent !important;
      background: linear-gradient(90deg, #fff 0%, #edf4ff 28%, #b9a8ff 68%, #c9f7ff 100%) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: 25px !important;
      font-weight: 950 !important;
      letter-spacing: -.065em !important;
      line-height: 1 !important;
      transform: none !important;
      filter: none !important;
      text-shadow: none !important;
      white-space: nowrap !important;
    }

    .netflixLinks {
      display: flex !important;
      align-items: center !important;
      gap: 17px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    .netflixLinks a {
      display: inline-flex !important;
      align-items: center !important;
      padding: 0 !important;
      min-height: auto !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: rgba(248,251,255,.68) !important;
      font-size: 13px !important;
      font-weight: 760 !important;
      letter-spacing: -.01em !important;
      transition: color .16s ease, opacity .16s ease !important;
    }

    .netflixLinks a.active,
    .netflixLinks a:hover {
      color: var(--v-text) !important;
    }

    .navRightCluster {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      flex: 0 0 auto !important;
    }

    .iconLink,
    .textLink,
    .caretTiny {
      color: rgba(248,251,255,.84) !important;
    }

    .profilePill {
      width: 32px !important;
      height: 32px !important;
      border-radius: 12px !important;
      background:
        radial-gradient(circle at 50% 35%, rgba(255,255,255,.95) 0 9%, transparent 10%),
        linear-gradient(135deg, var(--v-purple), var(--v-blue)) !important;
      box-shadow: 0 10px 26px rgba(53,216,255,.16) !important;
      font-size: 0 !important;
      position: relative !important;
    }

    .profilePill::before,
    .profilePill::after {
      display: none !important;
    }

    .mobileSearchForm {
      display: none !important;
    }

    /* Hero */
    .dsHero,
    .showcaseHero,
    .browseHero {
      position: relative !important;
      min-height: 100svh !important;
      height: 100svh !important;
      display: block !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: var(--v-bg) !important;
      isolation: isolate !important;
    }

    .dsHeroBg,
    .showcaseHeroBg,
    .browseHeroBg {
      position: absolute !important;
      inset: 0 !important;
      z-index: -4 !important;
      background-size: cover !important;
      background-position: center center !important;
      filter: brightness(.64) saturate(1.05) contrast(1.03) !important;
    }

    .dsHeroGlass {
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        radial-gradient(820px circle at 28% 46%, rgba(140,107,255,.18), transparent 44%),
        linear-gradient(to top, var(--v-bg) 0%, rgba(5,7,18,.95) 8%, rgba(5,7,18,.58) 30%, rgba(5,7,18,.14) 58%, rgba(5,7,18,.72) 100%),
        linear-gradient(90deg, rgba(5,7,18,.88) 0%, rgba(5,7,18,.52) 36%, rgba(5,7,18,.10) 76%);
    }

    .dsHeroContent {
      position: absolute;
      left: var(--v-left);
      bottom: clamp(130px, 19vh, 205px);
      z-index: 14;
      width: min(620px, 47vw);
      max-width: min(620px, 47vw);
    }

    .dsEyebrow {
      width: fit-content;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      margin: 0 0 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.078);
      border: 1px solid rgba(255,255,255,.13);
      color: rgba(248,251,255,.76);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .dsHeroContent h1,
    .showcaseTitle,
    .browseLogoTitle,
    .dsDetailHeroContent h1 {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--v-text) !important;
      font-family: "Space Grotesk", Inter, Arial, sans-serif !important;
      font-size: clamp(48px, 6.25vw, 92px) !important;
      line-height: .88 !important;
      letter-spacing: -.087em !important;
      text-transform: uppercase !important;
      text-shadow: 0 12px 38px rgba(0,0,0,.55) !important;
      overflow: visible !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      text-wrap: balance !important;
      transform: none !important;
    }

    .dsHeroMeta,
    .dsMetaBand {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 9px;
      margin-top: 15px;
      color: rgba(248,251,255,.66);
      font-size: 13px;
      font-weight: 760;
    }

    .dsHeroMeta b,
    .dsMetaBand b {
      color: var(--v-green);
    }

    .dsHeroMeta span,
    .dsMetaBand span {
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsHeroContent p {
      max-width: 570px;
      margin: 16px 0 0;
      color: rgba(248,251,255,.78);
      font-size: clamp(14px, 1.18vw, 18px);
      line-height: 1.5;
      font-weight: 580;
      text-shadow: 0 2px 18px rgba(0,0,0,.46);
      display: -webkit-box;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .dsHeroActions,
    .dsDetailActions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 21px;
    }

    .dsPrimaryBtn,
    .dsSecondaryBtn {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 0 21px;
      border-radius: 14px;
      border: 0;
      box-shadow: 0 16px 34px rgba(255,255,255,.08);
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
    }

    .dsPrimaryBtn {
      color: #050711;
      background: linear-gradient(135deg, #fff, #e8faff);
    }

    .dsSecondaryBtn {
      color: white;
      background: rgba(255,255,255,.105);
      border: 1px solid rgba(255,255,255,.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: none;
    }

    .dsPrimaryBtn:hover,
    .dsSecondaryBtn:hover {
      transform: translateY(-1px);
    }

    .dsHeroRating {
      position: absolute;
      right: 0;
      bottom: clamp(138px, 20vh, 220px);
      z-index: 16;
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
    }

    .dsHeroRating span {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.24);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsHeroRating b {
      height: 40px;
      min-width: 92px;
      display: flex;
      align-items: center;
      padding-left: 14px;
      background: rgba(255,255,255,.09);
      border-left: 3px solid var(--v-blue);
      font-size: 15px;
      font-weight: 820;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsBrowseTop {
      position: absolute;
      top: calc(var(--v-nav) + 26px);
      left: var(--v-left);
      right: var(--v-right);
      z-index: 120;
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .dsBrowseTop h1 {
      margin: 0;
      font-size: clamp(30px, 3vw, 44px);
      line-height: 1;
      font-weight: 900;
      letter-spacing: -.06em;
    }

    .genreDropdown summary {
      list-style: none;
      height: 38px;
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      gap: 22px;
      padding: 0 13px;
      border-radius: 13px;
      color: rgba(248,251,255,.88);
      background: rgba(255,255,255,.078);
      border: 1px solid rgba(255,255,255,.16);
      font-size: 13px;
      font-weight: 850;
      cursor: pointer;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .genreDropdown summary::-webkit-details-marker { display: none; }

    .genreDropdownMenu {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 80;
      width: min(370px, calc(100vw - 36px));
      max-height: 420px;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      padding: 12px;
      border-radius: 18px;
      background: rgba(7,10,22,.96);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 90px rgba(0,0,0,.52);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .genreDropdownMenu a {
      display: block;
      padding: 9px 10px;
      border-radius: 10px;
      color: rgba(248,251,255,.70);
      font-size: 13px;
      font-weight: 720;
    }

    .genreDropdownMenu a:hover {
      color: white;
      background: rgba(255,255,255,.07);
    }

    /* Content rows */
    .dsContent {
      position: relative;
      z-index: 32;
      margin-top: -104px;
      padding-bottom: 78px;
    }

    .dsContent.noHero {
      margin-top: 0;
      padding-top: 14px;
    }

    .dsRow {
      position: relative;
      margin: 0 0 6px;
    }

    .dsRowHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-height: 32px;
      margin-bottom: 10px;
    }

    .dsRowHead h2 {
      margin: 0;
      color: var(--v-text);
      font-size: clamp(18px, 1.42vw, 25px);
      line-height: 1.15;
      letter-spacing: -.035em;
      font-weight: 900;
    }

    .dsRowTag {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 999px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      color: rgba(248,251,255,.62);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .movieRail,
    .dsRail,
    .showcaseRail,
    .nfRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(var(--v-card-min), calc((100vw - (var(--v-left) + var(--v-right)) - (var(--v-gap) * 5)) / 6)) !important;
      gap: var(--v-gap) !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      scrollbar-width: none !important;
      padding: 0 0 38px !important;
      margin-bottom: -12px !important;
      scroll-snap-type: x proximity !important;
    }

    .movieRail::-webkit-scrollbar,
    .dsRail::-webkit-scrollbar,
    .nfTopTenRail::-webkit-scrollbar {
      display: none;
    }

    .dsCard {
      position: relative;
      scroll-snap-align: start;
    }

    .posterWrap,
    .dsThumb {
      position: relative !important;
      display: block !important;
      aspect-ratio: 16 / 9 !important;
      border-radius: var(--v-radius) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      background: rgba(255,255,255,.055) !important;
      box-shadow: 0 12px 28px rgba(0,0,0,.18) !important;
      transform: none !important;
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, filter .16s ease !important;
      overflow: hidden !important;
    }

    .posterWrap img,
    .dsThumb img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .posterWrap:hover,
    .dsThumb:hover {
      transform: translateY(-6px) scale(1.035) !important;
      box-shadow: 0 22px 48px rgba(0,0,0,.34), 0 0 30px rgba(140,107,255,.13) !important;
      border-color: rgba(255,255,255,.18) !important;
      filter: saturate(1.04) brightness(1.05) !important;
      transition-delay: 0s !important;
    }

    .dsCardOverlay {
      position: absolute;
      inset: auto 0 0;
      padding: 14px;
      background: linear-gradient(to top, rgba(5,7,18,.92), rgba(5,7,18,.0));
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .16s ease, transform .16s ease;
    }

    .dsThumb:hover .dsCardOverlay {
      opacity: 1;
      transform: translateY(0);
    }

    .dsCardControls {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 8px;
    }

    .dsPlayDot,
    .dsMiniBtn,
    .dsIconBtn {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.11);
      color: white;
      font-size: 13px;
      font-weight: 900;
      cursor: pointer;
    }

    .dsPlayDot {
      color: #050711;
      background: white;
    }

    .dsCardTitle {
      color: white;
      font-size: 13px;
      line-height: 1.2;
      font-weight: 900;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
    }

    .dsCardMeta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 5px;
      color: rgba(248,251,255,.58);
      font-size: 11px;
      font-weight: 760;
    }

    .dsCardMeta b {
      color: var(--v-green);
    }

    .posterShade,
    .typePill,
    .ratingPill,
    .movieInfo,
    .nfCardAdd,
    .nfHoverPanel {
      display: none !important;
    }

    /* Row JS controls */
    .dsRowControls {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      gap: 8px;
      z-index: 5;
      opacity: 0;
      transform: translateY(-3px);
      transition: opacity .16s ease, transform .16s ease;
    }

    .dsRow:hover .dsRowControls,
    .nfRowSection:hover .dsRowControls {
      opacity: 1;
      transform: translateY(0);
    }

    .dsRowBtn {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: #fff;
      display: grid;
      place-items: center;
      cursor: pointer;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsProgress {
      height: 3px;
      width: 64px;
      margin-top: -24px;
      margin-left: auto;
      margin-right: 2px;
      border-radius: 999px;
      background: rgba(255,255,255,.10);
      overflow: hidden;
      opacity: 0;
      transition: opacity .16s ease;
    }

    .dsRow:hover .dsProgress,
    .nfRowSection:hover .dsProgress {
      opacity: 1;
    }

    .dsProgress span {
      display: block;
      height: 100%;
      width: 33%;
      background: linear-gradient(90deg, var(--v-purple), var(--v-blue));
      border-radius: 999px;
      transform: translateX(0);
    }

    /* Top 10 */
    .nfTopTenRail {
      display: grid !important;
      grid-auto-flow: column !important;
      grid-auto-columns: minmax(190px, 260px) !important;
      gap: 16px !important;
      overflow-x: auto !important;
      scrollbar-width: none !important;
      padding-bottom: 36px !important;
    }

    .topTenCard {
      min-height: 152px !important;
      display: grid !important;
      grid-template-columns: 40% 60% !important;
      align-items: end !important;
    }

    .topTenNumber {
      color: rgba(0,0,0,.20) !important;
      -webkit-text-stroke: 3px rgba(224,232,255,.48) !important;
      font-family: Impact, Arial Black, Arial, sans-serif !important;
      font-size: clamp(96px, 8.4vw, 166px) !important;
      line-height: .76 !important;
      letter-spacing: -.12em !important;
      text-shadow: none !important;
      transform: none !important;
      z-index: 1 !important;
    }

    .topTenPoster {
      aspect-ratio: 2 / 3 !important;
      display: block !important;
      border-radius: 16px !important;
      border: 1px solid rgba(255,255,255,.10) !important;
      box-shadow: 0 18px 38px rgba(0,0,0,.28) !important;
      overflow: hidden !important;
      background: rgba(255,255,255,.06) !important;
      transform: translateX(-6px) !important;
      z-index: 2 !important;
    }

    .topTenPoster img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Plain pages */
    .dsPlainPage {
      min-height: 100svh;
      padding: calc(var(--v-nav) + 42px) 0 74px;
      background:
        radial-gradient(900px circle at 16% -8%, rgba(140,107,255,.16), transparent 44%),
        radial-gradient(850px circle at 90% -10%, rgba(53,216,255,.09), transparent 42%),
        var(--v-bg);
    }

    .dsPageHeader {
      max-width: 900px !important;
      margin-bottom: 26px;
    }

    .dsPageHeader h1 {
      margin: 0;
      color: var(--v-text);
      font-size: clamp(42px, 6.4vw, 86px);
      line-height: .92;
      letter-spacing: -.075em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-weight: 900;
    }

    .dsPageHeader p {
      max-width: 720px;
      margin: 14px 0 0;
      color: var(--v-muted);
      line-height: 1.6;
      font-size: 16px;
      font-weight: 580;
    }

    .dsSearchBox form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      max-width: 820px;
      padding: 8px;
      border-radius: 20px;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .dsSearchBox input {
      min-height: 48px;
      padding: 0 14px;
      border: 0;
      outline: 0;
      color: white;
      background: transparent;
    }

    .dsSearchBox button {
      min-height: 48px;
      border: 0;
      border-radius: 15px;
      padding: 0 18px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #e8faff);
      font-weight: 900;
      cursor: pointer;
    }

    .dsTabs,
    .dsLanguageFilters,
    .dsMyListControls {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      margin-bottom: 22px;
    }

    .dsTabs a,
    .dsLanguageFilters select,
    .dsMyListControls a,
    .dsMyListControls button {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      padding: 0 13px;
      border-radius: 14px;
      color: rgba(248,251,255,.78);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      font-size: 13px;
      font-weight: 850;
      cursor: pointer;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsTabs a.active,
    .dsTabs a:hover {
      color: white;
      background: rgba(255,255,255,.12);
    }

    .dsGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
      gap: 12px;
      padding: 12px 0 34px;
    }

    .dsGenreGroup {
      margin: 0 0 34px;
    }

    .dsGenreGroup h2 {
      margin: 0 0 12px;
      color: var(--v-text);
      font-size: clamp(24px, 3vw, 38px);
      letter-spacing: -.055em;
      font-weight: 900;
    }

    .dsGenreGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 10px;
    }

    .dsGenreTile {
      min-height: 105px;
      display: flex;
      align-items: flex-end;
      padding: 15px;
      border-radius: 22px;
      color: white;
      background:
        linear-gradient(135deg, rgba(140,107,255,.34), rgba(53,216,255,.12)),
        rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 14px 34px rgba(0,0,0,.18);
      font-weight: 900;
    }

    .dsGenreTile:hover {
      transform: translateY(-4px);
      border-color: rgba(255,255,255,.18);
    }

    /* Detail page */
    .dsDetailPage {
      min-height: 100svh;
      padding: calc(var(--v-nav) + 18px) 0 72px;
      background:
        radial-gradient(900px circle at 16% -8%, rgba(140,107,255,.16), transparent 44%),
        radial-gradient(850px circle at 90% -10%, rgba(53,216,255,.09), transparent 42%),
        var(--v-bg);
    }

    .dsDetailShell {
      width: min(980px, calc(100vw - 36px));
      margin: 0 auto;
      overflow: hidden;
      border-radius: 26px;
      background: rgba(9,13,27,.96);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 34px 120px rgba(0,0,0,.60);
      position: relative;
    }

    .dsClose {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(7,10,22,.72);
      border: 1px solid rgba(255,255,255,.14);
      color: white;
      font-size: 28px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .dsDetailHero {
      min-height: 520px;
      padding: 56px 48px;
      position: relative;
      display: flex;
      align-items: flex-end;
      isolation: isolate;
      overflow: hidden;
    }

    .dsDetailBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      filter: brightness(.68) saturate(1.04);
    }

    .dsDetailHero::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, rgba(9,13,27,1) 0%, rgba(9,13,27,.88) 16%, rgba(9,13,27,.32) 48%, rgba(0,0,0,.28) 100%),
        linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.06));
    }

    .dsDetailHeroContent {
      position: relative;
      z-index: 2;
      max-width: 820px;
    }

    .dsDetailBody {
      padding: 0 48px 48px;
      background: rgba(9,13,27,1);
    }

    .dsDetailGrid {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(250px, .85fr);
      gap: 34px;
      align-items: start;
      margin-top: 18px;
    }

    .dsDetailGrid p {
      margin: 0;
      color: rgba(248,251,255,.84);
      font-size: 16px;
      line-height: 1.6;
      font-weight: 560;
    }

    .dsDetailGrid aside,
    .dsAboutGrid {
      display: grid;
      gap: 9px;
      color: var(--v-muted2);
      font-size: 14px;
    }

    .dsDetailGrid aside div,
    .dsAboutGrid div {
      display: grid;
      gap: 3px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsDetailGrid span,
    .dsAboutGrid span {
      color: var(--v-muted2);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .dsDetailGrid strong,
    .dsAboutGrid strong {
      color: var(--v-text);
      font-weight: 750;
      line-height: 1.35;
    }

    .dsDetailTabs {
      display: flex;
      gap: 24px;
      overflow-x: auto;
      margin: 38px 0 22px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .dsDetailTabs a {
      padding: 0 0 13px;
      color: rgba(248,251,255,.55);
      font-size: 14px;
      font-weight: 900;
      white-space: nowrap;
    }

    .dsDetailTabs a:first-child {
      color: white;
      border-bottom: 3px solid var(--v-blue);
    }

    .dsDetailSection {
      margin-top: 30px;
    }

    .dsDetailSection h2 {
      margin: 0 0 14px;
      color: var(--v-text);
      font-size: clamp(23px, 2.6vw, 34px);
      letter-spacing: -.055em;
      font-weight: 900;
    }

    .dsCastRail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 132px;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 10px;
    }

    .dsCastCard {
      color: white;
    }

    .dsCastCard div {
      width: 132px;
      aspect-ratio: 1;
      overflow: hidden;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsCastCard img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .dsCastCard strong {
      display: block;
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.2;
    }

    .dsCastCard em {
      display: block;
      margin-top: 3px;
      color: var(--v-muted2);
      font-style: normal;
      font-size: 12px;
      line-height: 1.25;
    }

    .dsTrailerGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 10px;
    }

    .trailerCard {
      overflow: hidden;
      border-radius: 18px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
    }

    .trailerCard iframe {
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 0;
      display: block;
    }

    .dsEpisodeList {
      border-radius: 18px;
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.08);
      overflow: hidden;
    }

    .dsEpisodeRow {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      min-height: 76px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .dsEpisodeRow:last-child {
      border-bottom: 0;
    }

    .dsEpisodeRow > span {
      color: var(--v-muted2);
      font-size: 22px;
      text-align: center;
      font-weight: 800;
    }

    .dsEpisodeRow strong {
      color: var(--v-text);
      font-size: 14px;
    }

    .dsEpisodeRow p {
      margin: 4px 0 0;
      color: var(--v-muted2);
      font-size: 13px;
      line-height: 1.35;
    }

    .dsEpisodeRow b {
      color: var(--v-muted2);
      font-size: 13px;
      white-space: nowrap;
    }

    .dsIconBtn {
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.18);
    }

    .emptyState,
    .watchlistEmptyNetflix {
      min-height: 220px;
      display: grid;
      place-items: center;
      text-align: center;
      border-radius: 22px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      color: var(--v-muted);
      padding: 24px;
    }

    /* Profiles */
    .profileGate {
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: 80px 22px;
      background:
        radial-gradient(900px circle at 50% -12%, rgba(140,107,255,.20), transparent 45%),
        var(--v-bg) !important;
    }

    .profileGate h1 {
      color: white;
      font-size: clamp(34px, 5vw, 62px);
      font-weight: 600;
      letter-spacing: -.055em;
    }

    .profileAvatar {
      border-radius: 22px !important;
      box-shadow: 0 18px 44px rgba(0,0,0,.28) !important;
    }

    .manageProfiles {
      border-radius: 999px !important;
      background: rgba(255,255,255,.065) !important;
      border-color: rgba(255,255,255,.18) !important;
    }

    .footer {
      background: var(--v-bg) !important;
      border-top: 1px solid rgba(255,255,255,.08) !important;
    }

    .controlDock,
    .controlPanel {
      display: none !important;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: .01ms !important;
      }
    }

    @media(max-width: 1240px) {
      :root { --v-card-min: 190px; }

      .movieRail,
      .dsRail,
      .showcaseRail,
      .nfRail {
        grid-auto-columns: minmax(190px, calc((100vw - (var(--v-left) + var(--v-right)) - (var(--v-gap) * 3)) / 4)) !important;
      }

      .dsHeroContent {
        width: min(610px, 58vw);
        max-width: min(610px, 58vw);
      }

      .netflixLinks {
        gap: 11px !important;
      }

      .netflixLinks a {
        font-size: 12px !important;
      }
    }

    @media(max-width: 860px) {
      :root {
        --v-left: 16px;
        --v-right: 16px;
        --v-nav: 66px;
      }

      .topbar,
      .netflixTopbar {
        height: auto !important;
        min-height: var(--v-nav) !important;
        background: rgba(5,7,18,.92) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      .nav,
      .netflixNav {
        min-height: var(--v-nav) !important;
        height: auto !important;
        padding: 0 16px !important;
        display: grid !important;
        grid-template-columns: 1fr auto !important;
      }

      .netflixLinks,
      .navRightCluster {
        display: none !important;
      }

      .mobileSearchForm {
        display: grid !important;
        grid-column: 1 / -1 !important;
        margin: 0 0 10px !important;
      }

      .mobileSearchForm input {
        min-height: 44px !important;
        border-radius: 14px !important;
        background: rgba(255,255,255,.08) !important;
      }

      .netflixWordmark {
        font-size: 21px !important;
      }

      .netflixBrand::before {
        width: 30px !important;
        height: 30px !important;
        border-radius: 11px !important;
      }

      .dsHero,
      .showcaseHero,
      .browseHero {
        min-height: 82svh !important;
        height: 82svh !important;
      }

      .dsHeroContent {
        left: 16px;
        bottom: 72px;
        width: calc(100vw - 32px);
        max-width: calc(100vw - 32px);
      }

      .dsBrowseTop {
        top: 86px;
        left: 16px;
        right: 16px;
      }

      .dsBrowseTop h1 {
        font-size: 30px;
      }

      .dsHeroContent h1,
      .dsDetailHeroContent h1 {
        font-size: clamp(40px, 13vw, 64px) !important;
        line-height: .91 !important;
      }

      .dsHeroContent p {
        font-size: 13px;
        line-height: 1.45;
        -webkit-line-clamp: 4;
        max-width: calc(100vw - 32px);
      }

      .dsHeroRating {
        display: none;
      }

      .dsPrimaryBtn,
      .dsSecondaryBtn {
        min-height: 42px;
        padding: 0 14px;
        font-size: 13px;
        border-radius: 12px;
      }

      .dsContent {
        margin-top: -32px;
      }

      .movieRail,
      .dsRail,
      .showcaseRail,
      .nfRail {
        grid-auto-columns: minmax(170px, 68vw) !important;
        gap: 8px !important;
        padding-bottom: 30px !important;
      }

      .posterWrap:hover,
      .dsThumb:hover {
        transform: none !important;
      }

      .dsRowControls,
      .dsProgress {
        display: none !important;
      }

      .nfTopTenRail {
        grid-auto-columns: 210px !important;
      }

      .dsGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .dsDetailPage {
        padding: 0;
      }

      .dsDetailShell {
        width: 100%;
        border-radius: 0;
      }

      .dsDetailHero {
        min-height: 420px;
        padding: 86px 18px 36px;
      }

      .dsDetailBody {
        padding: 0 18px 34px;
      }

      .dsDetailGrid {
        grid-template-columns: 1fr;
      }

      .dsTrailerGrid,
      .dsGenreGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .dsEpisodeRow {
        grid-template-columns: 32px minmax(0,1fr);
      }

      .dsEpisodeRow b {
        display: none;
      }
    }


    /* ============================================================
       v16 Animation Pack
       Smooth premium animations without making the site feel messy.
       ============================================================ */

    @keyframes dsFadeUp {
      from {
        opacity: 0;
        transform: translateY(18px);
        filter: blur(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
      }
    }

    @keyframes dsFadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes dsHeroKenBurns {
      0% {
        transform: scale(1.015);
      }
      100% {
        transform: scale(1.075);
      }
    }

    @keyframes dsGlowDrift {
      0% {
        opacity: .52;
        transform: translate3d(-2%, -1%, 0) scale(1);
      }
      50% {
        opacity: .82;
        transform: translate3d(2%, 1%, 0) scale(1.04);
      }
      100% {
        opacity: .52;
        transform: translate3d(-2%, -1%, 0) scale(1);
      }
    }

    @keyframes dsShimmerText {
      0% {
        background-position: 0% 50%;
      }
      100% {
        background-position: 200% 50%;
      }
    }

    @keyframes dsButtonPulse {
      0%, 100% {
        box-shadow: 0 16px 34px rgba(255,255,255,.08), 0 0 0 rgba(53,216,255,0);
      }
      50% {
        box-shadow: 0 16px 34px rgba(255,255,255,.10), 0 0 34px rgba(53,216,255,.18);
      }
    }

    @keyframes dsCardSheen {
      from {
        transform: translateX(-140%) skewX(-18deg);
      }
      to {
        transform: translateX(180%) skewX(-18deg);
      }
    }

    @keyframes dsFloatSoft {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-6px);
      }
    }

    @keyframes dsProgressGlow {
      0%, 100% {
        opacity: .55;
      }
      50% {
        opacity: 1;
      }
    }

    body {
      animation: dsFadeIn .42s ease both;
    }

    .netflixBrand::before {
      animation: dsFloatSoft 5.6s ease-in-out infinite;
    }

    .netflixWordmark {
      background-size: 220% 100% !important;
      animation: dsShimmerText 8s linear infinite;
    }

    .dsHeroBg,
    .showcaseHeroBg,
    .browseHeroBg {
      animation: dsHeroKenBurns 18s ease-out both;
      transform-origin: center center;
      will-change: transform;
    }

    .dsHeroGlass::before {
      content: "";
      position: absolute;
      inset: -18%;
      pointer-events: none;
      background:
        radial-gradient(520px circle at 22% 44%, rgba(140,107,255,.18), transparent 54%),
        radial-gradient(480px circle at 86% 18%, rgba(53,216,255,.12), transparent 52%);
      animation: dsGlowDrift 9s ease-in-out infinite;
    }

    .dsHeroContent,
    .dsDetailHeroContent,
    .dsPageHeader {
      animation: dsFadeUp .72s cubic-bezier(.2,.8,.2,1) both;
    }

    .dsHeroContent .dsEyebrow,
    .dsPageHeader .dsEyebrow,
    .dsDetailHeroContent .dsEyebrow {
      animation: dsFadeUp .55s cubic-bezier(.2,.8,.2,1) .04s both;
    }

    .dsHeroContent h1,
    .dsDetailHeroContent h1,
    .dsPageHeader h1 {
      animation: dsFadeUp .74s cubic-bezier(.2,.8,.2,1) .08s both;
    }

    .dsHeroMeta,
    .dsHeroContent p,
    .dsDetailActions,
    .dsHeroActions,
    .dsPageHeader p {
      animation: dsFadeUp .7s cubic-bezier(.2,.8,.2,1) .16s both;
    }

    .dsHeroRating {
      animation: dsFadeUp .68s cubic-bezier(.2,.8,.2,1) .28s both;
    }

    .dsPrimaryBtn {
      animation: dsButtonPulse 4.5s ease-in-out infinite;
    }

    .dsPrimaryBtn,
    .dsSecondaryBtn,
    .dsIconBtn,
    .dsMiniBtn,
    .dsRowBtn,
    .profileCard,
    .dsGenreTile,
    .dsTabs a,
    .dsMyListControls a,
    .dsMyListControls button {
      transition:
        transform .18s cubic-bezier(.2,.8,.2,1),
        border-color .18s ease,
        background .18s ease,
        box-shadow .18s ease,
        opacity .18s ease,
        filter .18s ease !important;
    }

    .dsPrimaryBtn:hover,
    .dsSecondaryBtn:hover,
    .dsIconBtn:hover,
    .dsMiniBtn:hover,
    .dsRowBtn:hover,
    .dsTabs a:hover,
    .dsMyListControls a:hover,
    .dsMyListControls button:hover {
      transform: translateY(-2px) !important;
    }

    .dsPrimaryBtn:active,
    .dsSecondaryBtn:active,
    .dsIconBtn:active,
    .dsMiniBtn:active,
    .dsRowBtn:active {
      transform: translateY(0) scale(.98) !important;
    }

    .dsRow {
      opacity: 0;
      transform: translateY(24px);
      filter: blur(8px);
      transition:
        opacity .65s cubic-bezier(.2,.8,.2,1),
        transform .65s cubic-bezier(.2,.8,.2,1),
        filter .65s cubic-bezier(.2,.8,.2,1);
      will-change: opacity, transform, filter;
    }

    .dsRow.dsVisible {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }

    .dsRow:nth-child(2) { transition-delay: .04s; }
    .dsRow:nth-child(3) { transition-delay: .08s; }
    .dsRow:nth-child(4) { transition-delay: .12s; }
    .dsRow:nth-child(5) { transition-delay: .16s; }

    .dsCard {
      transform: translateY(0);
      will-change: transform;
    }

    .dsThumb {
      position: relative;
      isolation: isolate;
    }

    .dsThumb::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 4;
      pointer-events: none;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
      width: 42%;
      opacity: 0;
      transform: translateX(-140%) skewX(-18deg);
    }

    .dsThumb:hover::after {
      opacity: 1;
      animation: dsCardSheen .78s ease both;
    }

    .dsCardOverlay {
      transition:
        opacity .22s ease,
        transform .22s cubic-bezier(.2,.8,.2,1) !important;
    }

    .dsThumb:hover .dsCardOverlay {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    .movieRail,
    .dsRail,
    .nfTopTenRail {
      scroll-behavior: smooth;
    }

    .dsProgress span {
      animation: dsProgressGlow 2.2s ease-in-out infinite;
      box-shadow: 0 0 16px rgba(53,216,255,.35);
    }

    .topTenPoster,
    .profileAvatar,
    .dsCastCard div,
    .dsGenreTile {
      transition:
        transform .2s cubic-bezier(.2,.8,.2,1),
        border-color .18s ease,
        box-shadow .18s ease,
        filter .18s ease !important;
    }

    .topTenCard:hover .topTenPoster,
    .profileCard:hover .profileAvatar,
    .dsCastCard:hover div,
    .dsGenreTile:hover {
      transform: translateY(-6px) scale(1.025) !important;
      filter: saturate(1.05) brightness(1.06);
      box-shadow: 0 24px 54px rgba(0,0,0,.36), 0 0 34px rgba(140,107,255,.13) !important;
    }

    .topTenNumber {
      transition: transform .2s cubic-bezier(.2,.8,.2,1), -webkit-text-stroke-color .2s ease !important;
    }

    .topTenCard:hover .topTenNumber {
      transform: translateX(-4px) scale(1.02) !important;
      -webkit-text-stroke-color: rgba(233,240,255,.70) !important;
    }

    .dsDetailShell,
    .dsSearchBox,
    .dsLanguageFilters,
    .dsMyListControls,
    .profileGrid {
      animation: dsFadeUp .62s cubic-bezier(.2,.8,.2,1) .08s both;
    }

    .dsEpisodeRow,
    .dsAboutGrid div,
    .dsDetailGrid aside div {
      transition: background .18s ease, transform .18s ease, border-color .18s ease !important;
    }

    .dsEpisodeRow:hover,
    .dsAboutGrid div:hover,
    .dsDetailGrid aside div:hover {
      background: rgba(255,255,255,.085) !important;
      border-color: rgba(255,255,255,.16) !important;
      transform: translateX(3px);
    }

    .trailerCard {
      transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease, border-color .18s ease !important;
    }

    .trailerCard:hover {
      transform: translateY(-5px);
      box-shadow: 0 24px 54px rgba(0,0,0,.34);
      border-color: rgba(255,255,255,.18) !important;
    }

    .dsLoadingPulse {
      position: relative;
      overflow: hidden;
    }

    .dsLoadingPulse::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent);
      transform: translateX(-100%);
      animation: dsCardSheen 1.4s ease-in-out infinite;
    }

    @media(max-width: 860px) {
      .dsHeroBg,
      .showcaseHeroBg,
      .browseHeroBg {
        animation-duration: 22s;
      }

      .dsRow {
        opacity: 1;
        transform: none;
        filter: none;
      }

      .dsPrimaryBtn {
        animation: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation: none !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }

      .dsRow {
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
      }
    }


    /* ============================================================
       v17 EVERY CRANNY POLISH
       Top-right nav rebuild + small UI cleanup across the whole app.
       ============================================================ */

    :root {
      --cranny-glass: rgba(255,255,255,.082);
      --cranny-glass-strong: rgba(255,255,255,.13);
      --cranny-border: rgba(255,255,255,.145);
      --cranny-border-strong: rgba(255,255,255,.24);
      --cranny-shadow: 0 18px 50px rgba(0,0,0,.32);
    }

    ::selection {
      background: rgba(53,216,255,.34);
      color: white;
    }

    :focus-visible {
      outline: 2px solid rgba(53,216,255,.88) !important;
      outline-offset: 3px !important;
      border-radius: 12px;
    }

    html {
      scrollbar-color: rgba(140,107,255,.42) rgba(255,255,255,.04);
      scrollbar-width: thin;
    }

    body::-webkit-scrollbar {
      width: 12px;
    }

    body::-webkit-scrollbar-track {
      background: rgba(255,255,255,.035);
    }

    body::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(140,107,255,.72), rgba(53,216,255,.48));
      border: 3px solid #050711;
      border-radius: 999px;
    }

    .dsNavActions {
      gap: 10px !important;
      align-items: center !important;
      overflow: visible !important;
    }

    .dsNavSearch {
      width: 42px;
      height: 42px;
      position: relative;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      align-items: center;
      overflow: hidden;
      border-radius: 999px;
      border: 1px solid transparent;
      background: transparent;
      color: rgba(248,251,255,.86);
      transition:
        width .28s cubic-bezier(.2,.8,.2,1),
        background .18s ease,
        border-color .18s ease,
        box-shadow .18s ease;
    }

    .dsNavSearch:hover,
    .dsNavSearch:focus-within {
      width: min(310px, 30vw);
      background: rgba(255,255,255,.085);
      border-color: rgba(255,255,255,.16);
      box-shadow: 0 18px 46px rgba(0,0,0,.22);
      backdrop-filter: blur(16px) saturate(1.08);
      -webkit-backdrop-filter: blur(16px) saturate(1.08);
    }

    .dsNavSearch span {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      font-size: 21px;
      color: rgba(248,251,255,.86);
      line-height: 1;
    }

    .dsNavSearch input {
      min-width: 0;
      width: 100%;
      height: 40px;
      border: 0;
      outline: 0;
      color: white;
      background: transparent;
      opacity: 0;
      transform: translateX(-6px);
      transition: opacity .18s ease, transform .18s ease;
      font-size: 13px;
      font-weight: 720;
    }

    .dsNavSearch:hover input,
    .dsNavSearch:focus-within input {
      opacity: 1;
      transform: translateX(0);
    }

    .dsNavSearch input::placeholder {
      color: rgba(248,251,255,.48);
    }

    .dsNavSearch button {
      height: 30px;
      margin-right: 5px;
      padding: 0 10px;
      border: 0;
      border-radius: 999px;
      opacity: 0;
      transform: scale(.92);
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 11px;
      font-weight: 950;
      cursor: pointer;
      transition: opacity .18s ease, transform .18s ease;
    }

    .dsNavSearch:hover button,
    .dsNavSearch:focus-within button {
      opacity: 1;
      transform: scale(1);
    }

    .dsNavChip,
    .dsNavIcon,
    .dsProfileMenu summary {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 999px;
      color: rgba(248,251,255,.86);
      border: 1px solid transparent;
      background: transparent;
      transition:
        background .18s ease,
        border-color .18s ease,
        transform .18s cubic-bezier(.2,.8,.2,1),
        box-shadow .18s ease,
        color .18s ease;
    }

    .dsNavChip {
      padding: 0 13px;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: -.01em;
    }

    .dsNavChip:hover,
    .dsNavIcon:hover,
    .dsProfileMenu summary:hover,
    .dsProfileMenu[open] summary {
      color: white;
      background: rgba(255,255,255,.085);
      border-color: rgba(255,255,255,.14);
      transform: translateY(-1px);
      box-shadow: 0 16px 42px rgba(0,0,0,.22);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .dsKidsPill span {
      position: relative;
      z-index: 1;
    }

    .dsKidsPill::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--v-green, #6fffc6), var(--v-blue, #35d8ff));
      box-shadow: 0 0 14px rgba(111,255,198,.42);
    }

    .dsNavIcon {
      width: 42px;
      position: relative;
      font-size: 20px;
      line-height: 1;
    }

    .dsNotify i {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(135deg, #ff6a88, #ffdd7a);
      border: 2px solid rgba(5,7,18,.95);
      box-shadow: 0 0 14px rgba(255,106,136,.55);
    }

    .dsProfileMenu {
      position: relative;
      display: block;
    }

    .dsProfileMenu summary {
      list-style: none;
      padding: 0 9px 0 5px;
      cursor: pointer;
      user-select: none;
    }

    .dsProfileMenu summary::-webkit-details-marker {
      display: none;
    }

    .dsProfileMenu .profilePill {
      display: inline-block !important;
      width: 32px !important;
      height: 32px !important;
      flex: 0 0 auto;
    }

    .dsProfileMenu .caretTiny {
      margin: 0 !important;
      transition: transform .18s ease;
    }

    .dsProfileMenu[open] .caretTiny {
      transform: rotate(180deg);
    }

    .dsProfileDropdown {
      position: absolute;
      top: calc(100% + 12px);
      right: 0;
      width: 230px;
      padding: 10px;
      border-radius: 22px;
      background:
        radial-gradient(260px circle at 10% 0%, rgba(140,107,255,.16), transparent 46%),
        rgba(7,10,22,.96);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 90px rgba(0,0,0,.54);
      backdrop-filter: blur(22px) saturate(1.12);
      -webkit-backdrop-filter: blur(22px) saturate(1.12);
      animation: dsProfilePop .18s cubic-bezier(.2,.8,.2,1) both;
    }

    @keyframes dsProfilePop {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .dsProfileDropdown::before {
      content: "";
      position: absolute;
      top: -6px;
      right: 24px;
      width: 12px;
      height: 12px;
      transform: rotate(45deg);
      background: rgba(7,10,22,.96);
      border-left: 1px solid rgba(255,255,255,.12);
      border-top: 1px solid rgba(255,255,255,.12);
    }

    .dsProfileDropdown a {
      min-height: 44px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: 15px;
      color: rgba(248,251,255,.82);
      transition: background .16s ease, color .16s ease, transform .16s ease;
    }

    .dsProfileDropdown a:hover {
      color: white;
      background: rgba(255,255,255,.075);
      transform: translateX(2px);
    }

    .dsProfileDropdown span {
      width: 31px;
      height: 31px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 14px;
    }

    .dsProfileDropdown b {
      font-size: 13px;
      letter-spacing: -.01em;
    }

    .mobileNav {
      border-top: 1px solid rgba(255,255,255,.08) !important;
      background: rgba(5,7,18,.82) !important;
      backdrop-filter: blur(18px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(18px) saturate(1.08) !important;
      box-shadow: 0 -18px 50px rgba(0,0,0,.24);
    }

    .mobileNav a {
      min-height: 46px !important;
      border-radius: 16px !important;
      color: rgba(248,251,255,.62) !important;
      font-weight: 850 !important;
      transition: background .16s ease, color .16s ease, transform .16s ease !important;
    }

    .mobileNav a.active,
    .mobileNav a:hover {
      color: white !important;
      background: rgba(255,255,255,.08) !important;
      transform: translateY(-1px);
    }

    .dsHeroContent,
    .dsPageHeader,
    .dsDetailHeroContent {
      max-width: min(650px, 50vw) !important;
    }

    .dsHeroContent h1,
    .dsDetailHeroContent h1,
    .dsPageHeader h1 {
      text-shadow: 0 18px 60px rgba(0,0,0,.60), 0 0 44px rgba(140,107,255,.10) !important;
    }

    .dsHeroMeta span,
    .dsMetaBand span,
    .dsMetaBand b,
    .dsHeroMeta b {
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .dsRowHead {
      padding-right: 84px;
    }

    .dsRowHead h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dsRowHead h2::before {
      content: "";
      width: 8px;
      height: 20px;
      border-radius: 999px;
      background: linear-gradient(180deg, var(--v-purple, #8c6bff), var(--v-blue, #35d8ff));
      opacity: .72;
      box-shadow: 0 0 18px rgba(53,216,255,.22);
    }

    .dsThumb {
      background:
        linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.035)) !important;
    }

    .dsThumb img {
      transform: scale(1.001);
      transition: transform .22s cubic-bezier(.2,.8,.2,1), filter .22s ease !important;
    }

    .dsThumb:hover img {
      transform: scale(1.055);
    }

    .dsCardOverlay {
      background:
        linear-gradient(to top, rgba(5,7,18,.96), rgba(5,7,18,.52) 48%, transparent) !important;
    }

    .dsPlayDot,
    .dsMiniBtn,
    .dsIconBtn {
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .dsPlayDot:hover,
    .dsMiniBtn:hover,
    .dsIconBtn:hover {
      border-color: rgba(255,255,255,.26);
      background: rgba(255,255,255,.18);
    }

    .dsPrimaryBtn,
    .dsSearchBox button {
      position: relative;
      overflow: hidden;
    }

    .dsPrimaryBtn::after,
    .dsSearchBox button::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
      transform: translateX(-130%) skewX(-18deg);
      transition: transform .55s ease;
      pointer-events: none;
    }

    .dsPrimaryBtn:hover::after,
    .dsSearchBox button:hover::after {
      transform: translateX(130%) skewX(-18deg);
    }

    .dsSecondaryBtn,
    .dsTabs a,
    .dsLanguageFilters select,
    .dsMyListControls a,
    .dsMyListControls button,
    .dsSearchBox form,
    .dsDetailGrid aside div,
    .dsAboutGrid div,
    .dsEpisodeList,
    .dsGenreTile,
    .emptyState,
    .watchlistEmptyNetflix {
      backdrop-filter: blur(14px) saturate(1.05);
      -webkit-backdrop-filter: blur(14px) saturate(1.05);
    }

    .dsSearchBox form {
      box-shadow: 0 18px 56px rgba(0,0,0,.22);
    }

    .dsSearchBox input::placeholder {
      color: rgba(248,251,255,.42);
    }

    .dsTabs a.active {
      background:
        linear-gradient(135deg, rgba(140,107,255,.22), rgba(53,216,255,.12)),
        rgba(255,255,255,.085) !important;
      border-color: rgba(255,255,255,.22) !important;
      color: white !important;
    }

    .dsGenreTile {
      position: relative;
      overflow: hidden;
    }

    .dsGenreTile::after {
      content: "";
      position: absolute;
      inset: auto -30px -44px auto;
      width: 110px;
      height: 110px;
      border-radius: 999px;
      background: rgba(255,255,255,.09);
      filter: blur(4px);
      pointer-events: none;
    }

    .dsDetailShell {
      box-shadow: 0 40px 140px rgba(0,0,0,.62), 0 0 80px rgba(140,107,255,.10) !important;
    }

    .dsDetailTabs,
    .dsCastRail {
      scrollbar-width: none;
    }

    .dsDetailTabs::-webkit-scrollbar,
    .dsCastRail::-webkit-scrollbar {
      display: none;
    }

    .profileGrid {
      gap: clamp(14px, 2vw, 30px) !important;
    }

    .profileCard {
      border-radius: 24px;
      padding: 10px;
    }

    .profileCard:hover {
      background: rgba(255,255,255,.045);
    }

    .footer {
      color: rgba(248,251,255,.44) !important;
    }

    .footer a:hover,
    .footer button:hover {
      color: white !important;
      background: rgba(255,255,255,.06) !important;
    }

    .pagination a {
      border-radius: 14px !important;
      background: rgba(255,255,255,.075) !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      color: rgba(248,251,255,.82) !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .pagination a:hover {
      color: white !important;
      background: rgba(255,255,255,.12) !important;
      transform: translateY(-1px);
    }

    @media(max-width: 1040px) {
      .dsNavSearch:hover,
      .dsNavSearch:focus-within {
        width: 230px;
      }

      .dsKidsPill {
        display: none !important;
      }
    }

    @media(max-width: 860px) {
      .dsNavActions {
        display: none !important;
      }

      .mobileSearchForm {
        gap: 8px !important;
        grid-template-columns: minmax(0, 1fr) 44px !important;
      }

      .mobileSearchForm input {
        padding: 0 12px !important;
        color: white !important;
        border: 1px solid rgba(255,255,255,.12) !important;
      }

      .mobileSearchForm button {
        width: 44px !important;
        min-height: 44px !important;
        border: 0 !important;
        border-radius: 14px !important;
        color: #050711 !important;
        background: linear-gradient(135deg, #fff, #dff8ff) !important;
      }

      .dsHeroContent,
      .dsPageHeader,
      .dsDetailHeroContent {
        max-width: calc(100vw - 32px) !important;
      }

      .dsRowHead {
        padding-right: 0;
      }

      .dsRowHead h2::before {
        height: 16px;
      }

      .dsCardOverlay {
        display: none !important;
      }
    }


    /* ============================================================
       v18 FUNCTIONAL POLISH
       Kids safe mode + real Liked/Favorites behavior + clearer action buttons.
       ============================================================ */

    .dsMiniBtn,
    .dsIconBtn {
      color: white;
      user-select: none;
    }

    .dsMiniBtn.saved,
    .dsIconBtn.saved,
    .watchButton.saved {
      color: #050711 !important;
      background: linear-gradient(135deg, #ffffff, #dff8ff) !important;
      border-color: transparent !important;
    }

    .dsHeartBtn,
    [data-like-id] {
      color: rgba(255,255,255,.92) !important;
    }

    .dsHeartBtn.liked,
    [data-like-id].liked {
      color: white !important;
      background: linear-gradient(135deg, #ff5f9e, #ff8bd8) !important;
      border-color: rgba(255,255,255,.24) !important;
      box-shadow: 0 0 24px rgba(255,101,216,.24) !important;
    }

    .dsCardControls .dsMiniBtn {
      position: relative;
    }

    .dsCardControls .dsMiniBtn:hover::after {
      opacity: 1;
      transform: translate(-50%, -7px);
    }

    .dsCardControls .dsMiniBtn::after {
      content: attr(title);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translate(-50%, -2px);
      min-width: max-content;
      padding: 6px 8px;
      border-radius: 999px;
      background: rgba(7,10,22,.94);
      border: 1px solid rgba(255,255,255,.14);
      color: rgba(255,255,255,.86);
      font-size: 11px;
      line-height: 1;
      opacity: 0;
      pointer-events: none;
      transition: opacity .16s ease, transform .16s ease;
      box-shadow: 0 12px 34px rgba(0,0,0,.28);
    }

    .kidsModePage .dsHero::after {
      content: "Kids Safe";
      position: absolute;
      top: calc(var(--v-nav, 74px) + 92px);
      right: var(--v-right, 4vw);
      z-index: 28;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      padding: 0 13px;
      border-radius: 999px;
      color: #06110d;
      background: linear-gradient(135deg, #dfffea, #8affc6);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: .06em;
      text-transform: uppercase;
      box-shadow: 0 18px 42px rgba(111,255,198,.16);
    }

    .kidsLockBanner {
      position: absolute;
      top: calc(var(--v-nav, 74px) + 22px);
      left: var(--v-left, 4vw);
      right: var(--v-right, 4vw);
      z-index: 34;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 16px;
      border-radius: 22px;
      background: rgba(255,255,255,.078);
      border: 1px solid rgba(255,255,255,.13);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
      box-shadow: 0 18px 54px rgba(0,0,0,.20);
    }

    .kidsLockBanner .dsEyebrow {
      margin: 0 0 7px;
      background: rgba(111,255,198,.12);
      border-color: rgba(111,255,198,.24);
      color: rgba(217,255,234,.90);
    }

    .kidsLockBanner h1 {
      margin: 0;
      color: white;
      font-size: clamp(22px, 2.7vw, 36px);
      line-height: 1;
      letter-spacing: -.055em;
      font-weight: 950;
    }

    .kidsLockBanner p {
      max-width: 760px;
      margin: 7px 0 0;
      color: rgba(248,251,255,.66);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 650;
    }

    .kidsModePage .dsHeroContent {
      bottom: clamp(108px, 15vh, 170px);
    }

    .kidsModePage .dsContent {
      margin-top: -78px;
    }

    .dsProfileDropdown a[href="/liked"] span {
      background: linear-gradient(135deg, #ff5f9e, #ff8bd8);
      color: white;
    }

    .dsTabs a[href="/liked"],
    .dsMyListControls a[href="/liked"] {
      color: #ffd7ef !important;
    }

    .watchlistEmptyNetflix strong {
      display: block;
      color: white;
      font-size: clamp(22px, 3vw, 34px);
      margin-bottom: 8px;
      letter-spacing: -.04em;
    }

    .watchlistEmptyNetflix span {
      color: rgba(248,251,255,.62);
      font-size: 14px;
      line-height: 1.5;
    }

    @media(max-width: 860px) {
      .kidsLockBanner {
        position: relative;
        top: auto;
        left: auto;
        right: auto;
        margin: calc(var(--v-nav, 66px) + 18px) 16px -32px;
        display: grid;
      }

      .kidsModePage .dsHero {
        min-height: 82svh !important;
      }

      .kidsModePage .dsHero::after {
        display: none;
      }

      .kidsModePage .dsHeroContent {
        bottom: 72px;
      }
    }


    /* ============================================================
       v19 ACCOUNTS / PROFILES / CONTINUE WATCHING
       Adds login/signup, better profiles, local account UI, and saved watching polish.
       ============================================================ */

    .dsAuthPage {
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: calc(var(--v-nav, 74px) + 34px) var(--v-left, 4vw) 54px;
      background:
        radial-gradient(900px circle at 18% 0%, rgba(140,107,255,.22), transparent 44%),
        radial-gradient(800px circle at 92% 12%, rgba(53,216,255,.13), transparent 42%),
        var(--v-bg, #050711);
    }

    .dsAuthShell {
      width: min(1100px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) .95fr;
      gap: 18px;
      align-items: stretch;
    }

    .dsAuthBrand {
      grid-column: 1 / -1;
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: white;
      font-weight: 950;
      letter-spacing: -.06em;
      font-size: 24px;
    }

    .dsAuthBrand span {
      width: 36px;
      height: 36px;
      border-radius: 14px;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.38), transparent 36%),
        linear-gradient(135deg, var(--v-purple, #8c6bff), var(--v-blue, #35d8ff));
      box-shadow: 0 14px 34px rgba(53,216,255,.18);
    }

    .dsAuthCard,
    .dsAuthAside,
    .dsAccountPanel {
      border-radius: 28px;
      background:
        radial-gradient(520px circle at 0% 0%, rgba(140,107,255,.12), transparent 48%),
        rgba(255,255,255,.072);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: 0 28px 90px rgba(0,0,0,.32);
      backdrop-filter: blur(20px) saturate(1.08);
      -webkit-backdrop-filter: blur(20px) saturate(1.08);
    }

    .dsAuthCard {
      padding: clamp(24px, 4vw, 46px);
    }

    .dsAuthCard h1,
    .dsAuthAside h2,
    .dsAccountPanel h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      letter-spacing: -.065em;
      font-weight: 900;
    }

    .dsAuthCard h1 {
      font-size: clamp(42px, 6vw, 76px);
      line-height: .92;
    }

    .dsAuthCard p,
    .dsAuthAside,
    .dsAccountPanel p {
      color: rgba(248,251,255,.68);
      line-height: 1.6;
      font-weight: 600;
    }

    .dsAuthForm {
      display: grid;
      gap: 12px;
      margin-top: 22px;
    }

    .dsAuthForm label {
      display: grid;
      gap: 7px;
      color: rgba(248,251,255,.66);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .dsAuthForm input {
      min-height: 52px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      outline: 0;
      text-transform: none;
      letter-spacing: 0;
      font-size: 15px;
      font-weight: 650;
    }

    .dsAuthForm input:focus {
      border-color: rgba(53,216,255,.55);
      box-shadow: 0 0 0 4px rgba(53,216,255,.10);
    }

    .dsAuthSwap {
      margin-top: 16px;
      color: rgba(248,251,255,.58);
      font-weight: 650;
    }

    .dsAuthSwap a {
      color: white;
      font-weight: 900;
    }

    .dsAuthAside {
      padding: clamp(22px, 3vw, 38px);
      display: grid;
      align-content: center;
    }

    .dsAuthAside ul {
      list-style: none;
      display: grid;
      gap: 12px;
      padding: 0;
      margin: 18px 0 0;
    }

    .dsAuthAside li {
      min-height: 42px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.09);
      color: rgba(248,251,255,.82);
      font-weight: 800;
    }

    .dsAuthAside li::before {
      content: "✓";
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: #06110d;
      background: linear-gradient(135deg, #dfffea, #8affc6);
      font-size: 12px;
      font-weight: 950;
    }

    .dsBetterProfiles .profileGateInner {
      width: min(1120px, 100%);
    }

    .dsProfilesBrand {
      margin: 0 auto 26px;
    }

    .dsProfileSub {
      margin: -12px auto 26px;
      max-width: 620px;
      color: rgba(248,251,255,.58);
      line-height: 1.55;
      font-weight: 650;
      text-align: center;
    }

    .dsAddProfileCard {
      border: 0;
      cursor: pointer;
      background: transparent;
    }

    .dsProfileControls {
      justify-content: center;
      margin-top: 28px !important;
    }

    .profilePill.hasProfileIcon {
      display: grid !important;
      place-items: center;
      color: white;
      font-size: 13px !important;
      font-weight: 950;
    }

    .dsDropdownUser {
      display: grid;
      grid-template-columns: 36px minmax(0,1fr);
      gap: 10px;
      align-items: center;
      padding: 8px 8px 12px;
      margin-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }

    .dsDropdownUser span,
    .dsAccountAvatar {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      color: white;
      background: linear-gradient(135deg, var(--v-purple, #8c6bff), var(--v-blue, #35d8ff));
      font-weight: 950;
    }

    .dsDropdownUser b {
      color: white;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dsDropdownUser small {
      color: rgba(248,251,255,.48);
      font-size: 11px;
      font-weight: 700;
    }

    .dsDropdownLogout,
    .dsDangerBtn {
      width: 100%;
      min-height: 40px;
      margin-top: 8px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      color: white;
      background: rgba(255,255,255,.07);
      cursor: pointer;
      font-weight: 850;
    }

    .dsDropdownLogout:hover,
    .dsDangerBtn:hover {
      background: rgba(255,84,104,.18);
      border-color: rgba(255,84,104,.32);
    }

    .dsAccountGrid {
      width: auto;
      margin: 26px var(--v-right, 4vw) 0 var(--v-left, 4vw);
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) .9fr;
      gap: 16px;
    }

    .dsAccountPanel {
      padding: clamp(20px, 3vw, 34px);
    }

    .dsAccountIdentity {
      margin: 18px 0;
      display: grid;
      grid-template-columns: 54px minmax(0,1fr);
      gap: 14px;
      align-items: center;
      padding: 14px;
      border-radius: 20px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsAccountAvatar {
      width: 54px;
      height: 54px;
      border-radius: 18px;
      font-size: 22px;
    }

    .dsAccountIdentity strong,
    .dsAccountIdentity span,
    .dsAccountIdentity small {
      display: block;
    }

    .dsAccountIdentity strong {
      color: white;
      font-size: 18px;
    }

    .dsAccountIdentity span,
    .dsAccountIdentity small {
      color: rgba(248,251,255,.58);
      margin-top: 3px;
      font-weight: 650;
    }

    .dsContinueSection[hidden] {
      display: none !important;
    }

    .dsContinueCard .dsThumb {
      position: relative;
    }

    .dsWatchProgress {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 10px;
      z-index: 8;
      height: 4px;
      border-radius: 999px;
      background: rgba(255,255,255,.16);
      overflow: hidden;
      box-shadow: 0 0 18px rgba(0,0,0,.30);
    }

    .dsWatchProgress i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--v-purple, #8c6bff), var(--v-blue, #35d8ff));
      box-shadow: 0 0 14px rgba(53,216,255,.35);
    }

    .dsContinueOverlay {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: grid;
      place-items: center;
      opacity: 0;
      background: rgba(5,7,18,.36);
      transition: opacity .18s ease;
    }

    .dsContinueOverlay span {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: #050711;
      background: white;
      font-weight: 950;
      box-shadow: 0 20px 54px rgba(0,0,0,.30);
    }

    .dsContinueOverlay b {
      position: absolute;
      bottom: 24px;
      color: white;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsContinueCard .dsThumb:hover .dsContinueOverlay {
      opacity: 1;
    }

    @media(max-width: 860px) {
      .dsAuthShell,
      .dsAccountGrid {
        grid-template-columns: 1fr;
      }

      .dsAuthPage {
        padding-left: 16px;
        padding-right: 16px;
      }

      .dsAuthAside {
        display: none;
      }

      .dsProfileControls {
        justify-content: flex-start;
      }
    }


    /* ============================================================
       v20 AUTH REQUIRED
       Login/signup is required before using the streaming app.
       ============================================================ */

    body:has(.dsAuthPage) .topbar,
    body:has(.dsAuthPage) .netflixTopbar,
    body:has(.dsAuthPage) .mobileNav,
    body:has(.dsAuthPage) .footer {
      display: none !important;
    }

    .dsAuthPage {
      padding-top: 46px !important;
    }

    .dsAuthCard::before {
      content: "Required";
      width: fit-content;
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      margin-bottom: 12px;
      border-radius: 999px;
      color: #06110d;
      background: linear-gradient(135deg, #dfffea, #8affc6);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
      box-shadow: 0 18px 42px rgba(111,255,198,.14);
    }

    .dsAuthRequiredNote {
      margin-top: 14px;
      padding: 12px 13px;
      border-radius: 16px;
      color: rgba(248,251,255,.72);
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 650;
    }


    /* ============================================================
       v21 WATCHROOMS
       Shared trailer rooms with synced play/pause/seek and room chat.
       ============================================================ */

    .dsWatchroomsPage .dsPageHeader,
    .dsRoomPage .dsPageHeader {
      max-width: 960px !important;
    }

    .dsWatchroomCreate,
    .dsRoomShell {
      width: auto;
      margin: 24px var(--v-right, 4vw) 0 var(--v-left, 4vw);
      display: grid;
      gap: 16px;
    }

    .dsWatchroomCreate {
      grid-template-columns: 1fr 1fr;
    }

    .dsRoomShell {
      grid-template-columns: minmax(0, 1fr) minmax(320px, 390px);
      align-items: start;
    }

    .dsWatchroomPanel,
    .dsRoomPlayerPanel {
      border-radius: 28px;
      background:
        radial-gradient(520px circle at 0% 0%, rgba(140,107,255,.12), transparent 48%),
        rgba(255,255,255,.072);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: 0 28px 90px rgba(0,0,0,.30);
      backdrop-filter: blur(20px) saturate(1.08);
      -webkit-backdrop-filter: blur(20px) saturate(1.08);
    }

    .dsWatchroomPanel {
      padding: clamp(18px, 2.8vw, 32px);
    }

    .dsRoomPlayerPanel {
      padding: 14px;
    }

    .dsWatchroomPanel h2 {
      margin: 0;
      color: white;
      font-size: clamp(24px, 3vw, 38px);
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-weight: 950;
    }

    .dsWatchroomPanel p {
      color: rgba(248,251,255,.64);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsWatchroomPanel form,
    .dsTrailerInput form,
    .dsRoomChat form {
      display: grid;
      gap: 10px;
    }

    .dsWatchroomPanel label,
    .dsTrailerInput label {
      display: grid;
      gap: 7px;
      color: rgba(248,251,255,.66);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .dsWatchroomPanel input,
    .dsTrailerInput input,
    .dsRoomChat input {
      min-height: 50px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      outline: 0;
      font-weight: 650;
    }

    .dsActiveRooms {
      margin: 18px var(--v-right, 4vw) 0 var(--v-left, 4vw);
    }

    .dsRoomGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .dsRoomCard {
      min-height: 168px;
      display: grid;
      align-content: space-between;
      gap: 12px;
      padding: 16px;
      border-radius: 22px;
      color: white;
      background:
        linear-gradient(135deg, rgba(140,107,255,.24), rgba(53,216,255,.10)),
        rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .dsRoomCard:hover {
      transform: translateY(-5px);
      border-color: rgba(255,255,255,.20);
      box-shadow: 0 22px 54px rgba(0,0,0,.32), 0 0 36px rgba(140,107,255,.12);
    }

    .dsRoomLive {
      width: fit-content;
      min-height: 25px;
      display: inline-flex;
      align-items: center;
      padding: 0 9px;
      border-radius: 999px;
      color: #06110d;
      background: linear-gradient(135deg, #dfffea, #8affc6);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
      box-shadow: 0 16px 34px rgba(111,255,198,.12);
    }

    .dsRoomCard h3 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -.05em;
      line-height: 1.05;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsRoomCard p {
      margin: 0;
      color: rgba(248,251,255,.58);
      font-size: 13px;
      font-weight: 650;
    }

    .dsRoomCard div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: rgba(248,251,255,.68);
      font-size: 13px;
      font-weight: 800;
    }

    .dsRoomToolbar {
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 4px 12px;
      color: rgba(248,251,255,.70);
      font-weight: 800;
    }

    .dsRoomToolbar > div {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dsTrailerInput {
      margin-bottom: 12px;
      padding: 16px;
      border-radius: 22px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsTrailerInput.isLoaded {
      display: none;
    }

    .dsTrailerInput h2 {
      margin: 0 0 6px;
      color: white;
      font-size: 24px;
      letter-spacing: -.05em;
    }

    .dsTrailerInput p {
      margin: 0 0 12px;
      color: rgba(248,251,255,.62);
      font-weight: 650;
    }

    .dsWatchPlayer {
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 24px;
      background:
        radial-gradient(500px circle at 50% 20%, rgba(140,107,255,.18), transparent 52%),
        rgba(0,0,0,.50);
      border: 1px solid rgba(255,255,255,.10);
      display: grid;
      place-items: center;
    }

    .dsWatchPlayer iframe {
      width: 100%;
      height: 100%;
      display: block;
      border: 0;
    }

    .dsWatchPlayer::before {
      content: "Load a trailer to start watching together";
      color: rgba(248,251,255,.55);
      font-weight: 800;
      text-align: center;
      padding: 22px;
    }

    .dsWatchPlayer:has(iframe)::before {
      display: none;
    }

    .dsSyncControls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding-top: 12px;
    }

    .dsSyncControls .dsPrimaryBtn,
    .dsSyncControls .dsSecondaryBtn {
      min-height: 42px;
      padding: 0 14px;
      font-size: 13px;
    }

    .dsRoomSidebar {
      display: grid;
      gap: 16px;
    }

    .dsRoomCode {
      user-select: all;
      padding: 12px 13px;
      border-radius: 16px;
      color: white;
      background: rgba(0,0,0,.24);
      border: 1px solid rgba(255,255,255,.10);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 900;
      letter-spacing: .04em;
    }

    .dsRoomChat {
      min-height: 460px;
      display: grid;
      grid-template-rows: auto minmax(260px, 1fr) auto;
    }

    .dsRoomMessages {
      display: grid;
      align-content: end;
      gap: 8px;
      overflow: auto;
      max-height: 340px;
      padding: 10px 0;
      scrollbar-width: thin;
    }

    .dsRoomMessage {
      padding: 10px 11px;
      border-radius: 15px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsRoomMessage b {
      display: block;
      color: white;
      font-size: 12px;
      margin-bottom: 3px;
    }

    .dsRoomMessage span {
      color: rgba(248,251,255,.74);
      font-size: 13px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .dsRoomChat form {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .dsRoomChat button {
      min-height: 50px;
      padding: 0 14px;
      border: 0;
      border-radius: 16px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-weight: 950;
      cursor: pointer;
    }

    @media(max-width: 980px) {
      .dsWatchroomCreate,
      .dsRoomShell {
        grid-template-columns: 1fr;
      }

      .dsRoomChat {
        min-height: 360px;
      }
    }

    @media(max-width: 860px) {
      .dsWatchroomCreate,
      .dsRoomShell,
      .dsActiveRooms {
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsRoomToolbar {
        align-items: flex-start;
        display: grid;
      }

      .dsSyncControls .dsPrimaryBtn,
      .dsSyncControls .dsSecondaryBtn {
        flex: 1 1 auto;
      }
    }


    /* ============================================================
       v22 ROOM MOVIE CLOCK
       Adds room-created countdown/count-up, manual timeframe prompt, generic embeds, and chatbar.
       ============================================================ */

    .dsMovieClockHero {
      width: auto;
      margin: 22px var(--v-right, 4vw) 18px var(--v-left, 4vw);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: clamp(18px, 3vw, 32px);
      border-radius: 30px;
      background:
        radial-gradient(520px circle at 10% 0%, rgba(53,216,255,.14), transparent 50%),
        radial-gradient(520px circle at 80% 0%, rgba(140,107,255,.16), transparent 52%),
        rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 26px 90px rgba(0,0,0,.28);
      backdrop-filter: blur(20px) saturate(1.08);
      -webkit-backdrop-filter: blur(20px) saturate(1.08);
    }

    .dsMovieClockHero h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(52px, 8vw, 112px);
      line-height: .84;
      letter-spacing: -.075em;
      text-shadow: 0 18px 60px rgba(0,0,0,.42), 0 0 42px rgba(53,216,255,.14);
    }

    .dsMovieClockHero p {
      margin: 12px 0 0;
      color: rgba(248,251,255,.68);
      font-size: clamp(14px, 1.4vw, 18px);
      font-weight: 700;
      line-height: 1.45;
    }

    .dsMovieClockHero p b {
      color: white;
      font-weight: 950;
    }

    .dsClockActions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .dsEmbedTabs {
      display: flex;
      gap: 8px;
      margin: 0 0 12px;
    }

    .dsEmbedTabs button {
      min-height: 36px;
      padding: 0 12px;
      border-radius: 999px;
      color: rgba(248,251,255,.72);
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.12);
      cursor: pointer;
      font-size: 12px;
      font-weight: 900;
    }

    .dsEmbedTabs button.active,
    .dsEmbedTabs button:hover {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      border-color: transparent;
    }

    .dsPlayerWrap {
      position: relative;
    }

    .dsGenericEmbed {
      display: none;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border: 0;
      border-radius: 24px;
      background: rgba(0,0,0,.52);
    }

    .dsGenericEmbed.isActive {
      display: block;
    }

    .dsWatchPlayer.isHidden {
      display: none;
    }

    .dsPlayerWrap.isClockOnly .dsGenericEmbed,
    .dsPlayerWrap.isClockOnly .dsWatchPlayer {
      display: none !important;
    }

    .dsManualTimeBox {
      display: none;
      margin-top: 12px;
      padding: clamp(18px, 3vw, 30px);
      border-radius: 26px;
      background:
        radial-gradient(420px circle at 50% 0%, rgba(53,216,255,.12), transparent 54%),
        rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.12);
      text-align: center;
    }

    .dsManualTimeBox.isActive,
    .dsManualTimeBox.forceShow {
      display: grid;
      gap: 12px;
      place-items: center;
    }

    .dsManualTimeBox h2 {
      margin: 0;
      color: white;
      font-size: clamp(26px, 4vw, 44px);
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsManualTimeBox p {
      max-width: 620px;
      margin: 0;
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 700;
    }

    .dsBigTime {
      color: white;
      font-size: clamp(58px, 10vw, 132px);
      line-height: .82;
      letter-spacing: -.07em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-weight: 950;
      text-shadow: 0 18px 60px rgba(0,0,0,.38), 0 0 44px rgba(53,216,255,.16);
    }

    .dsSyncControls.isManualOnly {
      opacity: .72;
    }

    .dsSyncControls.isManualOnly::before {
      content: "Auto sync works best with YouTube. For other embeds, use the room movie clock above.";
      flex: 1 0 100%;
      color: rgba(248,251,255,.56);
      font-size: 12px;
      font-weight: 750;
      padding: 4px 0;
    }

    .dsRoomHint {
      color: rgba(248,251,255,.52) !important;
      font-size: 12px;
      line-height: 1.45;
    }

    .dsFloatingChatbar {
      position: fixed;
      left: max(16px, var(--v-left, 4vw));
      right: max(16px, var(--v-right, 4vw));
      bottom: 16px;
      z-index: 1800;
      display: none;
      pointer-events: none;
    }

    .dsFloatingChatbar form {
      width: min(720px, 100%);
      margin-left: auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 8px;
      border-radius: 999px;
      background: rgba(7,10,22,.82);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 24px 80px rgba(0,0,0,.42);
      backdrop-filter: blur(18px) saturate(1.1);
      -webkit-backdrop-filter: blur(18px) saturate(1.1);
      pointer-events: auto;
    }

    .dsFloatingChatbar input {
      min-height: 42px;
      border: 0;
      outline: 0;
      padding: 0 14px;
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.075);
      font-weight: 650;
    }

    .dsFloatingChatbar button {
      min-height: 42px;
      padding: 0 15px;
      border: 0;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-weight: 950;
      cursor: pointer;
    }

    .dsRoomPage .dsFloatingChatbar {
      display: block;
    }

    .dsRoomPage {
      padding-bottom: 92px !important;
    }

    @media(max-width: 980px) {
      .dsMovieClockHero {
        display: grid;
        align-items: start;
      }

      .dsClockActions {
        justify-content: flex-start;
      }
    }

    @media(max-width: 860px) {
      .dsMovieClockHero {
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsFloatingChatbar {
        left: 12px;
        right: 12px;
        bottom: calc(72px + env(safe-area-inset-bottom));
      }

      .dsFloatingChatbar form {
        margin: 0;
      }

      .dsRoomPage {
        padding-bottom: 142px !important;
      }
    }


    /* ============================================================
       v23 PROFILE / ACCOUNT / WATCHROOM CLEANUP
       Removes the old extra nav item, fixes Create Room, upgrades profiles/account/watchroom layout.
       ============================================================ */

    .dsProfilesPro {
      background:
        radial-gradient(900px circle at 16% 0%, rgba(140,107,255,.24), transparent 42%),
        radial-gradient(850px circle at 88% 0%, rgba(53,216,255,.14), transparent 42%),
        var(--v-bg, #050711) !important;
    }

    .dsProfilesShell {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
    }

    .dsProfilesHeader {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 26px;
      text-align: left;
    }

    .dsProfilesHeader h1 {
      margin: 0;
      font-size: clamp(46px, 7vw, 92px);
      line-height: .88;
      letter-spacing: -.075em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-weight: 950;
      color: white;
    }

    .dsProfilesHeader .dsProfileSub {
      margin: 12px 0 0;
      text-align: left;
    }

    .dsProfileHeaderActions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .dsProfileGridPro {
      grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)) !important;
      gap: 16px !important;
    }

    .dsProfileCardPro {
      position: relative;
      min-height: 230px;
      display: grid;
      border-radius: 28px !important;
      background:
        radial-gradient(240px circle at 50% 0%, rgba(255,255,255,.10), transparent 56%),
        rgba(255,255,255,.055) !important;
      border: 1px solid rgba(255,255,255,.10);
      overflow: hidden;
      transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
    }

    .dsProfileCardPro:hover,
    .dsProfileCardPro.active {
      transform: translateY(-6px);
      border-color: rgba(255,255,255,.22);
      background:
        radial-gradient(260px circle at 50% 0%, rgba(140,107,255,.16), transparent 56%),
        rgba(255,255,255,.075) !important;
      box-shadow: 0 28px 80px rgba(0,0,0,.30), 0 0 42px rgba(140,107,255,.10);
    }

    .dsProfileLaunch {
      display: grid;
      place-items: center;
      align-content: center;
      gap: 10px;
      padding: 24px 14px 54px;
      color: white;
    }

    .dsProfileLaunch small,
    .dsAddProfileCard small {
      color: rgba(248,251,255,.48);
      font-size: 12px;
      font-weight: 800;
    }

    .dsEditProfileBtn {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      min-height: 36px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      color: rgba(248,251,255,.78);
      background: rgba(255,255,255,.07);
      cursor: pointer;
      font-weight: 900;
      backdrop-filter: blur(10px);
    }

    .dsEditProfileBtn:hover {
      color: white;
      background: rgba(255,255,255,.12);
    }

    .profileAvatar[data-color="blue"],
    .dsAccountAvatar[data-color="blue"],
    .profilePill[data-color="blue"] {
      background: linear-gradient(135deg, #38d5ff, #6978ff) !important;
    }

    .profileAvatar[data-color="purple"],
    .dsAccountAvatar[data-color="purple"],
    .profilePill[data-color="purple"] {
      background: linear-gradient(135deg, #8c6bff, #ff65d8) !important;
    }

    .profileAvatar[data-color="pink"],
    .dsAccountAvatar[data-color="pink"],
    .profilePill[data-color="pink"] {
      background: linear-gradient(135deg, #ff65d8, #ff8a6b) !important;
    }

    .profileAvatar[data-color="green"],
    .dsAccountAvatar[data-color="green"],
    .profilePill[data-color="green"] {
      background: linear-gradient(135deg, #6fffc6, #35d8ff) !important;
      color: #06110d !important;
    }

    .profileAvatar[data-color="gold"],
    .dsAccountAvatar[data-color="gold"],
    .profilePill[data-color="gold"] {
      background: linear-gradient(135deg, #ffe08a, #ff9f6b) !important;
      color: #211000 !important;
    }

    .dsProfileManager {
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: center;
      padding: 18px;
      border-radius: 26px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(18px);
    }

    .dsProfileManager h2 {
      margin: 0;
      color: white;
      font-size: 24px;
      letter-spacing: -.05em;
    }

    .dsProfileManager p {
      margin: 6px 0 0;
      color: rgba(248,251,255,.58);
      font-weight: 650;
    }

    .dsProfileDialog {
      width: min(520px, calc(100vw - 28px));
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 28px;
      color: white;
      background:
        radial-gradient(440px circle at 0% 0%, rgba(140,107,255,.16), transparent 54%),
        rgba(7,10,22,.96);
      box-shadow: 0 40px 140px rgba(0,0,0,.62);
      backdrop-filter: blur(22px) saturate(1.08);
      -webkit-backdrop-filter: blur(22px) saturate(1.08);
    }

    .dsProfileDialog::backdrop {
      background: rgba(0,0,0,.68);
      backdrop-filter: blur(8px);
    }

    .dsProfileDialog form {
      display: grid;
      gap: 13px;
      padding: 8px;
    }

    .dsDialogHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .dsDialogHead h2 {
      margin: 0;
      font-size: 34px;
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsDialogHead button {
      width: 38px;
      height: 38px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.08);
      cursor: pointer;
      font-size: 24px;
    }

    .dsProfileDialog label,
    .dsMiniForm label {
      display: grid;
      gap: 7px;
      color: rgba(248,251,255,.66);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .dsProfileDialog input,
    .dsProfileDialog select,
    .dsMiniForm input {
      min-height: 48px;
      padding: 0 13px;
      border-radius: 15px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.13);
      outline: 0;
      text-transform: none;
      letter-spacing: 0;
    }

    .dsCheckLine {
      display: flex !important;
      align-items: center;
      grid-template-columns: auto 1fr;
      gap: 10px !important;
      min-height: 42px;
      padding: 0 12px;
      border-radius: 14px;
      background: rgba(255,255,255,.055);
    }

    .dsCheckLine input {
      min-height: auto;
    }

    .dsDialogActions {
      display: flex;
      justify-content: flex-end;
      gap: 9px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .dsAccountHero {
      width: auto;
      margin: 26px var(--v-right, 4vw) 0 var(--v-left, 4vw);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, .82fr);
      gap: 16px;
      align-items: stretch;
    }

    .dsAccountIdentityPro,
    .dsAccountQuickStats,
    .dsAccountPanel {
      border-radius: 28px;
      background:
        radial-gradient(420px circle at 0% 0%, rgba(140,107,255,.13), transparent 52%),
        rgba(255,255,255,.072);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: 0 26px 90px rgba(0,0,0,.24);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsAccountQuickStats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      overflow: hidden;
      padding: 0;
    }

    .dsAccountQuickStats div {
      display: grid;
      place-items: center;
      align-content: center;
      min-height: 126px;
      padding: 16px 10px;
      background: rgba(255,255,255,.035);
      text-align: center;
    }

    .dsAccountQuickStats b {
      color: white;
      font-size: clamp(26px, 4vw, 44px);
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsAccountQuickStats span {
      color: rgba(248,251,255,.55);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .dsAccountGridPro {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .dsMiniForm {
      display: grid;
      gap: 10px;
      margin: 16px 0;
    }

    .dsAccountButtonGrid,
    .dsDangerGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
      margin-top: 14px;
    }

    .dsAccountButtonGrid a,
    .dsDangerGrid button {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border-radius: 15px;
      font-size: 13px;
      font-weight: 900;
      text-align: center;
    }

    .dsAccountButtonGrid a {
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
    }

    .dsDangerGrid button {
      color: rgba(255,226,232,.92);
      background: rgba(255,84,104,.10);
      border: 1px solid rgba(255,84,104,.18);
      cursor: pointer;
    }

    .dsWatchroomHero {
      width: auto;
      margin: 22px var(--v-right, 4vw) 18px var(--v-left, 4vw);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, .55fr);
      gap: 18px;
      align-items: center;
      padding: clamp(20px, 3vw, 34px);
      border-radius: 32px;
      background:
        radial-gradient(560px circle at 10% 0%, rgba(53,216,255,.14), transparent 52%),
        radial-gradient(560px circle at 80% 0%, rgba(140,107,255,.17), transparent 54%),
        rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 90px rgba(0,0,0,.28);
      backdrop-filter: blur(20px) saturate(1.08);
      -webkit-backdrop-filter: blur(20px) saturate(1.08);
    }

    .dsWatchroomHero h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(34px, 5vw, 68px);
      line-height: .92;
      letter-spacing: -.075em;
    }

    .dsWatchroomHero p {
      max-width: 820px;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsQuickRoomForm {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 24px;
      background: rgba(0,0,0,.18);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsQuickRoomForm input {
      min-height: 52px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 650;
    }

    .dsWatchroomCreatePro {
      grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr);
    }

    .dsCreateRoomPanel {
      position: relative;
      overflow: hidden;
    }

    .dsCreateRoomPanel::after {
      content: "";
      position: absolute;
      right: -80px;
      bottom: -90px;
      width: 220px;
      height: 220px;
      border-radius: 999px;
      background: rgba(53,216,255,.08);
      filter: blur(2px);
      pointer-events: none;
    }

    .dsRoomShellPro {
      grid-template-columns: minmax(0, 1.25fr) minmax(340px, .75fr) !important;
      gap: 18px;
    }

    .dsRoomToolbarPro {
      padding: 4px 4px 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      margin-bottom: 14px;
    }

    .dsRoomPlayerPanel,
    .dsWatchroomPanel {
      border-color: rgba(255,255,255,.14) !important;
    }

    .dsRoomCardPro {
      min-height: 190px;
    }

    @media(max-width: 980px) {
      .dsProfilesHeader,
      .dsProfileManager,
      .dsWatchroomHero {
        display: grid;
        align-items: start;
      }

      .dsAccountHero,
      .dsAccountGridPro,
      .dsWatchroomCreatePro,
      .dsRoomShellPro {
        grid-template-columns: 1fr !important;
      }

      .dsAccountQuickStats {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media(max-width: 860px) {
      .dsWatchroomHero,
      .dsAccountHero {
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsProfileHeaderActions,
      .dsDialogActions,
      .dsClockActions {
        justify-content: flex-start;
      }

      .dsAccountButtonGrid,
      .dsDangerGrid {
        grid-template-columns: 1fr;
      }
    }



    /* ============================================================
       v24 WATCHROOM VISUAL CLEANUP
       More breathing room, fewer loud controls, better color harmony.
       ============================================================ */

    .dsGhostPill {
      min-height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.05);
      color: rgba(244,248,255,.88);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .02em;
      cursor: pointer;
      transition: .18s ease;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .dsGhostPill:hover {
      background: rgba(255,255,255,.10);
      border-color: rgba(255,255,255,.16);
      color: white;
      transform: translateY(-1px);
    }

    .dsMovieClockHeroClean {
      gap: 26px;
      padding: clamp(24px, 3vw, 38px);
      border-radius: 34px;
      background:
        radial-gradient(540px circle at 0% 0%, rgba(92,224,255,.10), transparent 46%),
        radial-gradient(560px circle at 100% 0%, rgba(147,112,255,.13), transparent 46%),
        linear-gradient(180deg, rgba(15,20,36,.96), rgba(8,11,21,.96));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 24px 100px rgba(0,0,0,.34);
    }

    .dsMovieClockHeroClean p {
      margin-top: 10px;
      max-width: 600px;
      color: rgba(232,239,252,.70);
    }

    .dsMovieClockHeroClean p b { color: #ffffff; }

    .dsClockActionsClean {
      gap: 10px;
      align-self: flex-end;
    }

    .dsRoomShellAiry {
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr) !important;
      gap: 22px;
      margin-top: 22px;
    }

    .dsRoomPlayerPanelClean,
    .dsRoomInfoPanel,
    .dsRoomChatClean {
      background:
        radial-gradient(540px circle at 0% 0%, rgba(92,224,255,.06), transparent 42%),
        radial-gradient(420px circle at 100% 0%, rgba(147,112,255,.08), transparent 42%),
        linear-gradient(180deg, rgba(13,17,30,.96), rgba(8,11,20,.96));
      border-color: rgba(255,255,255,.08) !important;
      box-shadow: 0 24px 90px rgba(0,0,0,.30);
    }

    .dsRoomPlayerPanelClean {
      padding: 18px;
    }

    .dsRoomToolbarClean {
      padding: 4px 2px 18px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      margin-bottom: 18px;
      color: rgba(231,239,255,.82);
    }

    .dsRoomTopMeta,
    .dsRoomToolbarActions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dsRoomCodeMini {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.04);
      color: rgba(238,243,255,.82);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .04em;
    }

    .dsTrailerInputClean {
      margin-bottom: 18px;
      padding: 18px;
      border-radius: 24px;
      background: rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.07);
    }

    .dsTrailerInputClean.isLoaded { display: none; }
    .dsTrailerInputClean.isForceVisible { display: block !important; }

    .dsTrailerInputClean h2 {
      margin: 0 0 6px;
      font-size: 22px;
      letter-spacing: -.05em;
    }

    .dsTrailerInputClean p {
      margin: 0 0 12px;
      color: rgba(230,237,250,.62);
    }

    .dsTrailerInputClean form {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    .dsPlayerStage {
      display: grid;
      gap: 14px;
    }

    .dsEmbedTabsClean {
      margin-bottom: 0;
    }

    .dsEmbedTabsClean button {
      min-height: 34px;
      padding: 0 13px;
      border-radius: 999px;
      background: rgba(255,255,255,.05);
      border-color: rgba(255,255,255,.09);
    }

    .dsEmbedTabsClean button.active,
    .dsEmbedTabsClean button:hover {
      color: white;
      background: linear-gradient(135deg, rgba(92,224,255,.18), rgba(147,112,255,.18));
      border-color: rgba(255,255,255,.14);
    }

    .dsWatchPlayer,
    .dsGenericEmbed {
      border-radius: 28px;
      background:
        radial-gradient(600px circle at 50% 0%, rgba(92,224,255,.08), transparent 50%),
        linear-gradient(180deg, rgba(4,6,14,.92), rgba(8,11,20,.96));
      border: 1px solid rgba(255,255,255,.07);
    }

    .dsManualTimeBox {
      margin-top: 2px;
      padding: clamp(22px, 3vw, 34px);
      border-radius: 28px;
      background:
        radial-gradient(420px circle at 50% 0%, rgba(92,224,255,.08), transparent 56%),
        rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsManualCopyBtn {
      justify-self: center;
    }

    .dsSyncControlsClean {
      gap: 14px;
      padding-top: 18px;
      margin-top: 6px;
      border-top: 1px solid rgba(255,255,255,.06);
    }

    .dsSyncPrimaryRow,
    .dsSyncSecondaryRow {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dsSyncSecondaryRow .dsGhostPill {
      min-width: 72px;
      justify-content: center;
    }

    .dsRoomSidebarClean {
      gap: 18px;
    }

    .dsRoomInfoPanel,
    .dsRoomChatClean {
      padding: 22px;
      border-radius: 30px;
    }

    .dsRoomInfoPanel > h2,
    .dsRoomChatClean h2 {
      margin-top: 4px;
      margin-bottom: 10px;
      font-size: 28px;
    }

    .dsRoomInfoGrid {
      display: grid;
      gap: 14px;
      margin: 14px 0 10px;
    }

    .dsRoomInfoGrid small,
    .dsRoomHintMini {
      display: inline-block;
      color: rgba(215,225,242,.52);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    .dsRoomInfoGrid p {
      margin: 8px 0 0;
      color: rgba(241,246,255,.88);
      font-weight: 800;
    }

    .dsRoomCode {
      margin-top: 8px;
      padding: 14px 15px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.07);
      background: rgba(255,255,255,.04);
      color: white;
    }

    .dsRoomHint {
      margin-top: 10px;
      color: rgba(227,236,249,.56) !important;
    }

    .dsRoomChatClean {
      min-height: 520px;
      grid-template-rows: auto minmax(280px, 1fr) auto;
    }

    .dsRoomChatHead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }

    .dsRoomMessages {
      border-radius: 20px;
      padding: 12px;
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.05);
    }

    .dsRoomChatClean form {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-top: 12px;
    }

    .dsRoomChatClean form button,
    .dsTrailerInputClean form button {
      min-height: 48px;
      padding-inline: 18px;
      white-space: nowrap;
    }

    .dsFloatingChatbar { display: none !important; }

    @media (max-width: 980px) {
      .dsRoomShellAiry {
        grid-template-columns: 1fr !important;
        gap: 18px;
      }

      .dsMovieClockHeroClean {
        display: grid;
        justify-content: stretch;
      }

      .dsClockActionsClean {
        justify-content: flex-start;
      }
    }

    @media (max-width: 720px) {
      .dsTrailerInputClean form,
      .dsRoomChatClean form {
        grid-template-columns: 1fr;
      }

      .dsSyncPrimaryRow,
      .dsSyncSecondaryRow,
      .dsRoomToolbarActions,
      .dsRoomTopMeta {
        width: 100%;
      }

      .dsRoomToolbarClean {
        gap: 14px;
      }

      .dsGhostPill,
      .dsSyncSecondaryRow .dsGhostPill,
      .dsSyncPrimaryRow .dsPrimaryBtn,
      .dsSyncPrimaryRow .dsSecondaryBtn {
        width: 100%;
      }
    }


    /* ============================================================
       v25 WELCOME DISCOVERY
       Public non-member landing/discovery page before login/signup.
       ============================================================ */

    body:has(.dsWelcomePage) .topbar,
    body:has(.dsWelcomePage) .netflixTopbar,
    body:has(.dsWelcomePage) .mobileNav,
    body:has(.dsWelcomePage) .footer {
      display: none !important;
    }

    .dsWelcomePage {
      min-height: 100svh;
      background:
        radial-gradient(1100px circle at 12% -10%, rgba(140,107,255,.22), transparent 44%),
        radial-gradient(900px circle at 88% -10%, rgba(53,216,255,.14), transparent 42%),
        linear-gradient(180deg, #050711 0%, #080c18 44%, #050711 100%);
      color: white;
      overflow: hidden;
    }

    .dsWelcomeNav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 0 var(--v-left, 4vw);
      background: linear-gradient(to bottom, rgba(5,7,17,.88), rgba(5,7,17,.42), transparent);
    }

    .dsWelcomeBrand {
      display: inline-flex;
      align-items: center;
      gap: 11px;
      color: white;
      font-size: 24px;
      font-weight: 950;
      letter-spacing: -.06em;
    }

    .dsWelcomeBrand span {
      width: 36px;
      height: 36px;
      border-radius: 14px;
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.38), transparent 36%),
        linear-gradient(135deg, var(--v-purple, #8c6bff), var(--v-blue, #35d8ff));
      box-shadow: 0 14px 34px rgba(53,216,255,.18);
    }

    .dsWelcomeNav > div {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dsWelcomeNav a:not(.dsWelcomeBrand) {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      padding: 0 14px;
      border-radius: 999px;
      color: rgba(248,251,255,.82);
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 13px;
      font-weight: 900;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .dsWelcomeNav .dsWelcomeJoin {
      color: #050711 !important;
      background: linear-gradient(135deg, #fff, #dff8ff) !important;
      border-color: transparent !important;
    }

    .dsWelcomeHero {
      position: relative;
      min-height: 100svh;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 410px);
      gap: clamp(18px, 4vw, 52px);
      align-items: end;
      padding: 130px var(--v-right, 4vw) 120px var(--v-left, 4vw);
      isolation: isolate;
    }

    .dsWelcomeHeroBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      filter: brightness(.50) saturate(1.08);
      transform: scale(1.04);
    }

    .dsWelcomeHero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, #050711 0%, rgba(5,7,17,.88) 16%, rgba(5,7,17,.32) 54%, rgba(5,7,17,.80) 100%),
        linear-gradient(90deg, rgba(5,7,17,.92), rgba(5,7,17,.20));
    }

    .dsWelcomeHeroCopy {
      max-width: 840px;
      animation: dsFadeUp .72s cubic-bezier(.2,.8,.2,1) both;
    }

    .dsWelcomeHeroCopy h1 {
      margin: 0;
      max-width: 920px;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(58px, 9vw, 132px);
      line-height: .86;
      letter-spacing: -.085em;
      text-wrap: balance;
      text-shadow: 0 18px 60px rgba(0,0,0,.56);
    }

    .dsWelcomeHeroCopy p {
      max-width: 660px;
      margin: 22px 0 0;
      color: rgba(248,251,255,.75);
      font-size: clamp(15px, 1.5vw, 20px);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsWelcomeActions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 26px;
    }

    .dsWelcomeHeroCard {
      min-height: 250px;
      display: grid;
      align-content: end;
      padding: 24px;
      border-radius: 32px;
      background:
        radial-gradient(420px circle at 0% 0%, rgba(53,216,255,.14), transparent 50%),
        rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 90px rgba(0,0,0,.36);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
      animation: dsFadeUp .72s cubic-bezier(.2,.8,.2,1) .12s both;
    }

    .dsWelcomeHeroCard span {
      color: rgba(248,251,255,.55);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsWelcomeHeroCard h2 {
      margin: 10px 0 8px;
      color: white;
      font-size: clamp(28px, 4vw, 48px);
      line-height: .96;
      letter-spacing: -.065em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsWelcomeHeroCard p {
      margin: 0;
      color: rgba(248,251,255,.64);
      font-weight: 800;
    }

    .dsWelcomeDiscovery,
    .dsWelcomeFeatures,
    .dsWelcomeFinalCta {
      margin-left: var(--v-left, 4vw);
      margin-right: var(--v-right, 4vw);
    }

    .dsWelcomeIntro {
      max-width: 850px;
      margin-bottom: 28px;
    }

    .dsWelcomeIntro h2,
    .dsWelcomeFinalCta h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(38px, 6vw, 82px);
      line-height: .92;
      letter-spacing: -.075em;
    }

    .dsWelcomeIntro p,
    .dsWelcomeFinalCta p {
      max-width: 740px;
      color: rgba(248,251,255,.66);
      line-height: 1.6;
      font-weight: 650;
    }

    .dsWelcomeRail {
      margin: 0 0 30px;
    }

    .dsWelcomeRailHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
    }

    .dsWelcomeRailHead h2 {
      margin: 0;
      color: white;
      font-size: clamp(21px, 2vw, 30px);
      letter-spacing: -.05em;
      font-weight: 950;
    }

    .dsWelcomeRailHead a {
      color: rgba(248,251,255,.62);
      font-size: 13px;
      font-weight: 900;
    }

    .dsWelcomeRailTrack {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(220px, 27vw);
      gap: 12px;
      overflow-x: auto;
      padding: 0 0 24px;
      scrollbar-width: none;
    }

    .dsWelcomeRailTrack::-webkit-scrollbar {
      display: none;
    }

    .dsWelcomeCard a {
      position: relative;
      display: block;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 22px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: 0 16px 42px rgba(0,0,0,.22);
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .dsWelcomeCard a:hover {
      transform: translateY(-5px) scale(1.02);
      border-color: rgba(255,255,255,.18);
      box-shadow: 0 24px 62px rgba(0,0,0,.36);
    }

    .dsWelcomeCard img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: saturate(1.04);
    }

    .dsWelcomeCard div {
      position: absolute;
      inset: auto 0 0;
      padding: 18px;
      background: linear-gradient(to top, rgba(5,7,17,.92), transparent);
    }

    .dsWelcomeCard strong {
      display: block;
      color: white;
      font-size: 15px;
      font-weight: 950;
      line-height: 1.15;
    }

    .dsWelcomeCard span {
      display: block;
      margin-top: 4px;
      color: rgba(248,251,255,.62);
      font-size: 12px;
      font-weight: 760;
    }

    .dsWelcomeFeatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 44px;
    }

    .dsWelcomeFeatures article,
    .dsWelcomeFallback,
    .dsWelcomeFinalCta {
      padding: clamp(20px, 3vw, 34px);
      border-radius: 30px;
      background:
        radial-gradient(420px circle at 0% 0%, rgba(140,107,255,.12), transparent 48%),
        rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 22px 70px rgba(0,0,0,.24);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsWelcomeFeatures span {
      color: var(--v-blue, #35d8ff);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: .08em;
    }

    .dsWelcomeFeatures h3 {
      margin: 14px 0 8px;
      color: white;
      font-size: 28px;
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsWelcomeFeatures p {
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsWelcomeFinalCta {
      margin-top: 44px;
      margin-bottom: 64px;
      text-align: center;
      display: grid;
      place-items: center;
    }

    .dsWelcomeFallback code {
      color: white;
      background: rgba(255,255,255,.10);
      padding: 3px 6px;
      border-radius: 8px;
    }

    @media(max-width: 980px) {
      .dsWelcomeHero {
        grid-template-columns: 1fr;
        align-items: end;
      }

      .dsWelcomeHeroCard {
        max-width: 560px;
      }

      .dsWelcomeFeatures {
        grid-template-columns: 1fr;
      }
    }

    @media(max-width: 720px) {
      .dsWelcomeNav {
        padding: 0 16px;
      }

      .dsWelcomeBrand b {
        display: none;
      }

      .dsWelcomeHero {
        padding-left: 16px;
        padding-right: 16px;
      }

      .dsWelcomeHeroCopy h1 {
        font-size: clamp(48px, 15vw, 78px);
      }

      .dsWelcomeDiscovery,
      .dsWelcomeFeatures,
      .dsWelcomeFinalCta {
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsWelcomeRailTrack {
        grid-auto-columns: minmax(190px, 74vw);
      }
    }


    /* ============================================================
       v26 YOUTUBE EMBED FIX
       Adds origin/widget_referrer configuration and a clear fallback for Error 153.
       ============================================================ */

    .dsYoutubeFallback {
      position: absolute;
      inset: 0;
      z-index: 15;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 12px;
      padding: 28px;
      text-align: center;
      border-radius: 28px;
      background:
        radial-gradient(520px circle at 50% 0%, rgba(53,216,255,.10), transparent 54%),
        rgba(5,7,17,.92);
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .dsYoutubeFallback[hidden] {
      display: none !important;
    }

    .dsYoutubeFallback h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 4vw, 46px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsYoutubeFallback p {
      max-width: 560px;
      margin: 0;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsPlayerWrap {
      position: relative;
    }


    /* ============================================================
       v27 TRAILER / MOVIE BUTTONS
       Adds separate Trailer and Movie buttons. Movie uses trailer placeholder until real access API exists.
       ============================================================ */

    .dsDetailActionsV27 {
      align-items: center !important;
    }

    .dsMoviePlayBtn {
      min-width: 132px;
      background: linear-gradient(135deg, #ffffff, #dff8ff) !important;
    }

    .dsTrailerPlayBtn {
      min-width: 126px;
    }

    .dsMoviePlaceholderNote {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 999px;
      color: rgba(248,251,255,.70);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .dsWatchPage {
      min-height: 100svh;
      background:
        radial-gradient(900px circle at 16% -8%, rgba(140,107,255,.18), transparent 44%),
        radial-gradient(850px circle at 90% -10%, rgba(53,216,255,.10), transparent 42%),
        var(--v-bg, #050711);
      color: white;
    }

    .dsWatchHero {
      position: relative;
      min-height: 100svh;
      padding: calc(var(--v-nav, 74px) + 24px) var(--v-right, 4vw) 70px var(--v-left, 4vw);
      isolation: isolate;
    }

    .dsWatchBg {
      position: absolute;
      inset: 0;
      z-index: -3;
      background-size: cover;
      background-position: center;
      opacity: .36;
      filter: blur(2px) brightness(.72) saturate(1.02);
      transform: scale(1.04);
    }

    .dsWatchHero::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
      background:
        linear-gradient(to top, var(--v-bg, #050711), rgba(5,7,17,.84) 40%, rgba(5,7,17,.70)),
        radial-gradient(760px circle at 20% 30%, rgba(140,107,255,.14), transparent 50%);
    }

    .dsWatchHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 22px;
    }

    .dsWatchModeSwitch {
      display: flex;
      gap: 8px;
      padding: 6px;
      border-radius: 999px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .dsWatchModeSwitch a {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 14px;
      border-radius: 999px;
      color: rgba(248,251,255,.68);
      font-size: 13px;
      font-weight: 950;
    }

    .dsWatchModeSwitch a.active {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
    }

    .dsWatchLayout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 390px);
      gap: 18px;
      align-items: start;
    }

    .dsWatchPlayerCard,
    .dsWatchSidePanel {
      border-radius: 30px;
      background:
        radial-gradient(540px circle at 0% 0%, rgba(53,216,255,.08), transparent 42%),
        radial-gradient(420px circle at 100% 0%, rgba(140,107,255,.10), transparent 42%),
        linear-gradient(180deg, rgba(13,17,30,.96), rgba(8,11,20,.96));
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: 0 24px 90px rgba(0,0,0,.30);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsWatchPlayerCard {
      padding: 18px;
    }

    .dsWatchPlayerTop {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      padding: 8px 4px 18px;
    }

    .dsWatchPlayerTop h1 {
      margin: 0;
      max-width: 760px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(34px, 5vw, 78px);
      line-height: .9;
      letter-spacing: -.075em;
    }

    .dsWatchPlayerTop p,
    .dsWatchSidePanel p {
      max-width: 700px;
      margin: 10px 0 0;
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsPlaceholderBadge {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 0 11px;
      border-radius: 999px;
      color: #170810;
      background: linear-gradient(135deg, #ffd8ef, #ff8bd8);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .dsPlaceholderBadge.trailer {
      color: #06110d;
      background: linear-gradient(135deg, #dfffea, #8affc6);
    }

    .dsWatchFrame {
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 28px;
      background: rgba(0,0,0,.42);
      border: 1px solid rgba(255,255,255,.08);
      display: grid;
      place-items: center;
    }

    .dsWatchFrame iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }

    .dsNoTrailer {
      text-align: center;
      padding: 28px;
    }

    .dsNoTrailer h2 {
      margin: 0 0 8px;
      color: white;
      font-size: clamp(28px, 4vw, 48px);
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsNoTrailer p {
      color: rgba(248,251,255,.62);
      font-weight: 650;
    }

    .dsWatchActions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      padding-top: 14px;
    }

    .dsWatchSidePanel {
      padding: 24px;
      display: grid;
      gap: 16px;
    }

    .dsWatchSidePanel h2 {
      margin: 0;
      color: white;
      font-size: clamp(28px, 3.6vw, 44px);
      line-height: .95;
      letter-spacing: -.06em;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
    }

    .dsWatchMeta {
      display: grid;
      gap: 9px;
    }

    .dsWatchMeta div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.075);
    }

    .dsWatchMeta small {
      color: rgba(248,251,255,.48);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    .dsWatchMeta b {
      color: white;
      font-size: 13px;
    }

    @media(max-width: 980px) {
      .dsWatchLayout {
        grid-template-columns: 1fr;
      }

      .dsWatchPlayerTop {
        display: grid;
      }

      .dsWatchHeader {
        align-items: flex-start;
        display: grid;
      }
    }

    @media(max-width: 720px) {
      .dsWatchHero {
        padding-left: 16px;
        padding-right: 16px;
      }

      .dsWatchModeSwitch,
      .dsWatchModeSwitch a,
      .dsWatchActions .dsSecondaryBtn,
      .dsWatchActions .dsPrimaryBtn {
        width: 100%;
      }

      .dsWatchModeSwitch {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .dsMoviePlaceholderNote {
        width: 100%;
        justify-content: center;
      }
    }


    /* ============================================================
       v28 FULLSCREEN MOVIE WATCH PAGE
       Movie mode becomes an immersive fullscreen-style player.
       ============================================================ */

    body:has(.dsWatchFullscreenMovie) .topbar,
    body:has(.dsWatchFullscreenMovie) .netflixTopbar,
    body:has(.dsWatchFullscreenMovie) .mobileNav,
    body:has(.dsWatchFullscreenMovie) .footer {
      display: none !important;
    }

    .dsWatchFullscreenMovie {
      min-height: 100svh;
      background: #02030a !important;
      overflow: hidden;
    }

    .dsWatchFullscreenMovie .dsWatchHero {
      min-height: 100svh;
      height: 100svh;
      padding: 0 !important;
      display: grid;
      align-items: stretch;
    }

    .dsWatchFullscreenMovie .dsWatchBg {
      opacity: .20;
      filter: blur(18px) brightness(.42) saturate(1.1);
      transform: scale(1.12);
    }

    .dsWatchFullscreenMovie .dsWatchHero::before {
      background:
        radial-gradient(900px circle at 50% 15%, rgba(53,216,255,.08), transparent 50%),
        linear-gradient(180deg, rgba(2,3,10,.72), rgba(2,3,10,.96));
    }

    .dsWatchFullscreenMovie .dsWatchHeader {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 50;
      min-height: 74px;
      margin: 0;
      padding: 16px clamp(14px, 3vw, 34px);
      background: linear-gradient(to bottom, rgba(2,3,10,.86), rgba(2,3,10,.32), transparent);
      opacity: .92;
      transition: opacity .18s ease;
    }

    .dsWatchFullscreenMovie .dsWatchHeader:hover {
      opacity: 1;
    }

    .dsWatchFullscreenMovie .dsWatchLayout {
      width: 100vw;
      min-height: 100svh;
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      padding: 0;
      align-items: stretch;
    }

    .dsWatchFullscreenMovie .dsWatchPlayerCard {
      min-height: 100svh;
      display: grid;
      grid-template-rows: 1fr auto;
      padding: clamp(74px, 8vh, 92px) clamp(12px, 2vw, 28px) clamp(18px, 3vh, 34px);
      border-radius: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .dsWatchFullscreenMovie .dsWatchPlayerTop {
      position: fixed;
      left: clamp(16px, 3vw, 38px);
      right: clamp(16px, 3vw, 38px);
      bottom: clamp(86px, 10vh, 118px);
      z-index: 35;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding: 0;
      pointer-events: none;
    }

    .dsWatchFullscreenMovie .dsWatchPlayerTop > div,
    .dsWatchFullscreenMovie .dsPlaceholderBadge {
      pointer-events: auto;
    }

    .dsWatchFullscreenMovie .dsWatchPlayerTop h1 {
      max-width: min(760px, 70vw);
      font-size: clamp(30px, 5vw, 72px);
      text-shadow: 0 18px 70px rgba(0,0,0,.76);
    }

    .dsWatchFullscreenMovie .dsWatchPlayerTop p {
      max-width: 620px;
      margin-top: 8px;
      color: rgba(248,251,255,.64);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .dsWatchFullscreenMovie .dsWatchFrame {
      align-self: center;
      justify-self: center;
      width: min(100vw, calc(100svh * 16 / 9));
      max-width: 100vw;
      height: min(100svh, calc(100vw * 9 / 16));
      aspect-ratio: 16 / 9;
      border-radius: 0;
      border: 0;
      background: #000;
      box-shadow: 0 0 120px rgba(0,0,0,.74);
    }

    .dsWatchFullscreenMovie .dsWatchFrame iframe {
      width: 100%;
      height: 100%;
      background: #000;
    }

    .dsWatchFullscreenMovie .dsWatchActions {
      position: fixed;
      left: clamp(16px, 3vw, 38px);
      right: clamp(16px, 3vw, 38px);
      bottom: clamp(18px, 3vh, 34px);
      z-index: 45;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 12px;
      width: fit-content;
      max-width: calc(100vw - 32px);
      border-radius: 999px;
      background: rgba(2,3,10,.58);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 20px 80px rgba(0,0,0,.44);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsWatchFullscreenMovie .dsWatchActions .dsSecondaryBtn {
      min-height: 42px;
      border-radius: 999px;
      padding-inline: 14px;
      font-size: 12px;
      white-space: nowrap;
    }

    .dsWatchFullscreenMovie .dsWatchSidePanel {
      position: fixed;
      top: 88px;
      right: clamp(14px, 3vw, 34px);
      z-index: 45;
      width: min(360px, calc(100vw - 28px));
      padding: 18px;
      border-radius: 24px;
      background: rgba(2,3,10,.56);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 20px 80px rgba(0,0,0,.36);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
      opacity: .26;
      transform: translateY(-4px);
      transition: opacity .18s ease, transform .18s ease;
    }

    .dsWatchFullscreenMovie .dsWatchSidePanel:hover {
      opacity: 1;
      transform: translateY(0);
    }

    .dsWatchFullscreenMovie .dsWatchSidePanel h2 {
      font-size: 28px;
    }

    .dsWatchFullscreenMovie .dsWatchSidePanel p {
      font-size: 13px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .dsWatchFullscreenMovie .dsWatchMeta {
      display: none;
    }

    .dsWatchFrame:fullscreen {
      width: 100vw !important;
      height: 100vh !important;
      border-radius: 0 !important;
      background: #000 !important;
    }

    .dsWatchFrame:fullscreen iframe {
      width: 100vw !important;
      height: 100vh !important;
    }

    @media(max-width: 860px) {
      .dsWatchFullscreenMovie {
        overflow: auto;
      }

      .dsWatchFullscreenMovie .dsWatchHero {
        height: auto;
        min-height: 100svh;
      }

      .dsWatchFullscreenMovie .dsWatchPlayerCard {
        min-height: 100svh;
        padding: 76px 10px 190px;
      }

      .dsWatchFullscreenMovie .dsWatchFrame {
        width: 100%;
        height: auto;
        border-radius: 16px;
      }

      .dsWatchFullscreenMovie .dsWatchPlayerTop {
        left: 16px;
        right: 16px;
        bottom: 96px;
        display: grid;
      }

      .dsWatchFullscreenMovie .dsWatchPlayerTop h1 {
        max-width: 100%;
        font-size: clamp(28px, 11vw, 48px);
      }

      .dsWatchFullscreenMovie .dsWatchSidePanel {
        display: none;
      }

      .dsWatchFullscreenMovie .dsWatchActions {
        left: 12px;
        right: 12px;
        bottom: 16px;
        width: auto;
        max-width: none;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        border-radius: 22px;
      }

      .dsWatchFullscreenMovie .dsWatchActions .dsSecondaryBtn {
        width: 100%;
      }
    }


    /* ============================================================
       v30 MOVIE PLACEHOLDER STREAM PROVIDER
       Movie button can load the temporary trailer-stream provider response shape, otherwise falls back to trailer.
       ============================================================ */

    .dsMovieProviderMount {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 100%;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: #000;
    }

    .dsMovieProviderMount iframe,
    .dsLicensedVideo {
      width: 100%;
      height: 100%;
      display: block;
      border: 0;
      background: #000;
    }

    .dsLicensedVideo {
      object-fit: contain;
    }

    .dsMovieProviderLoading {
      display: grid;
      place-items: center;
      text-align: center;
      gap: 10px;
      padding: 28px;
    }

    .dsMovieProviderLoading h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 4vw, 54px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsMovieProviderLoading p {
      max-width: 560px;
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsMovieProviderBanner {
      position: absolute;
      left: 16px;
      top: 16px;
      z-index: 12;
      max-width: min(460px, calc(100% - 32px));
      display: grid;
      gap: 3px;
      padding: 12px 14px;
      border-radius: 18px;
      color: white;
      background: rgba(7,10,22,.72);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 18px 54px rgba(0,0,0,.32);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: none;
    }

    .dsMovieProviderBanner span {
      color: #ffd7ef;
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsMovieProviderBanner.licensed span {
      color: #aaffdc;
    }

    .dsMovieProviderBanner strong {
      font-size: 13px;
      font-weight: 950;
    }

    .dsMovieProviderBanner small {
      color: rgba(248,251,255,.62);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 650;
    }

    .dsWatchFullscreenMovie .dsMovieProviderBanner {
      opacity: .24;
      transition: opacity .18s ease;
    }

    .dsWatchFullscreenMovie .dsMovieProviderMount:hover .dsMovieProviderBanner {
      opacity: 1;
    }


    /* ============================================================
       v32 BETTER VIDEO PLAYER
       Better native MP4 loading, retry UI, alternate stream fallback.
       ============================================================ */

    .dsBetterNativeVideo {
      position: relative;
      z-index: 2;
      outline: 0;
    }

    .dsBetterNativeVideo::-webkit-media-controls-panel {
      background-image: linear-gradient(transparent, rgba(0,0,0,.86));
    }

    .dsVideoLoading {
      position: absolute;
      inset: 0;
      z-index: 8;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 10px;
      text-align: center;
      color: white;
      background:
        radial-gradient(440px circle at 50% 30%, rgba(53,216,255,.10), transparent 54%),
        rgba(0,0,0,.52);
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .dsVideoLoading[hidden] {
      display: none !important;
    }

    .dsVideoLoading div {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: 3px solid rgba(255,255,255,.16);
      border-top-color: white;
      animation: dsVideoSpin .8s linear infinite;
    }

    @keyframes dsVideoSpin {
      to { transform: rotate(360deg); }
    }

    .dsVideoLoading strong {
      color: white;
      font-size: 18px;
      font-weight: 950;
    }

    .dsVideoLoading span {
      color: rgba(248,251,255,.62);
      font-size: 13px;
      font-weight: 750;
    }

    .dsVideoErrorPanel {
      position: absolute;
      inset: 0;
      z-index: 16;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 12px;
      padding: 28px;
      text-align: center;
      background:
        radial-gradient(520px circle at 50% 0%, rgba(255,84,104,.12), transparent 54%),
        rgba(5,7,17,.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .dsVideoErrorPanel[hidden] {
      display: none !important;
    }

    .dsVideoErrorPanel h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 4vw, 52px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsVideoErrorPanel p {
      max-width: 560px;
      margin: 0;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsVideoErrorPanel > div {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 4px;
    }

    .dsWatchFullscreenMovie .dsVideoLoading,
    .dsWatchFullscreenMovie .dsVideoErrorPanel {
      border-radius: 0;
    }

    @media(max-width: 720px) {
      .dsVideoErrorPanel > div {
        width: 100%;
        display: grid;
      }

      .dsVideoErrorPanel .dsSecondaryBtn {
        width: 100%;
      }
    }


    /* ============================================================
       v33 DIRECT MP4 PLAYER
       Uses direct video.src MP4 mounting because that worked best.
       ============================================================ */

    .dsMovieProviderMount {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 100%;
      overflow: hidden;
      background: #000;
    }

    .dsLicensedVideo.dsBetterNativeVideo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      min-height: 100%;
      background: #000;
      object-fit: contain;
    }

    .dsWatchFullscreenMovie .dsLicensedVideo.dsBetterNativeVideo {
      width: 100vw;
      height: 100vh;
      max-width: 100vw;
      max-height: 100vh;
    }

    .dsMovieProviderMount iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }


    /* ============================================================
       v34 NATIVE VIDEO FALLBACK
       If MP4 video tag fails, try browser-native iframe/player mode.
       ============================================================ */

    .dsNativeVideoIframe {
      position: absolute;
      inset: 0;
      z-index: 3;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }

    .dsMovieProviderBanner.nativeFallback span {
      color: #ffe08a;
    }

    .dsNativeFallbackDock {
      position: absolute;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 20;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      width: min(760px, calc(100% - 28px));
      padding: 10px;
      border-radius: 999px;
      background: rgba(2,3,10,.66);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 20px 80px rgba(0,0,0,.44);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsNativeFallbackDock .dsSecondaryBtn {
      min-height: 38px;
      border-radius: 999px;
      font-size: 12px;
      padding-inline: 12px;
      white-space: nowrap;
    }

    .absolute.inset-0.w-full.h-screen.bg-black {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: #000;
    }

    @media(max-width: 720px) {
      .dsNativeFallbackDock {
        display: grid;
        border-radius: 22px;
      }

      .dsNativeFallbackDock .dsSecondaryBtn {
        width: 100%;
      }
    }


    /* ============================================================
       v36 SMART HLS FALLBACK
       Movie button tries MP4 first, then HLS.js fallback.
       ============================================================ */

    .dsMovieProviderBanner.licensed span::after {
      content: " • MP4/HLS";
      color: rgba(255,255,255,.62);
    }


    /* ============================================================
       v36 HLS PLAYER POLISH
       HLS fallback uses hls.js, similar to a dedicated streaming player.
       ============================================================ */

    .dsMovieProviderBanner.licensed span {
      color: #aaffdc;
    }

    .dsMovieProviderBanner.licensed strong::after {
      content: "";
    }

    .dsVideoLoading span::after {
      content: "";
    }


    /* ============================================================
       v37 EMBED PROVIDER WATCH MODE
       Movie button uses a simple authorized iframe embed provider.
       ============================================================ */

    .dsWatchEmbedFrame {
      position: relative;
      background: #000;
    }

    .dsMovieEmbedFrame {
      width: 100%;
      height: 100%;
      display: block;
      border: 0;
      background: #000;
    }

    .dsMovieEmbedNotice {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 10;
      max-width: min(440px, calc(100% - 32px));
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 18px;
      color: white;
      background: rgba(7,10,22,.72);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 18px 54px rgba(0,0,0,.32);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: none;
    }

    .dsMovieEmbedNotice span {
      color: #ffe08a;
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsMovieEmbedNotice strong {
      font-size: 13px;
      font-weight: 950;
    }

    .dsMovieEmbedNotice small {
      color: rgba(248,251,255,.62);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 650;
    }

    .dsWatchFullscreenMovie.dsWatchEmbedMode .dsWatchFrame {
      background: #000;
    }

    .dsWatchFullscreenMovie.dsWatchEmbedMode .dsMovieEmbedFrame {
      width: 100%;
      height: 100%;
    }


    /* ============================================================
       v38 SANDBOXED EMBED
       Blocks popups/popunders/top navigation from iframe embeds.
       ============================================================ */

    .dsMovieEmbedFrame {
      isolation: isolate;
    }

    .dsWatchEmbedFrame::after {
      content: "Popups blocked by sandbox";
      position: absolute;
      right: 14px;
      bottom: 14px;
      z-index: 8;
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 999px;
      color: rgba(248,251,255,.72);
      background: rgba(2,3,10,.58);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 11px;
      font-weight: 850;
      letter-spacing: .03em;
      pointer-events: none;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }


    /* ============================================================
       v39 EMBED CLICK CLEANUP
       Removes side info panel and avoids overlays blocking iframe controls.
       ============================================================ */

    .dsWatchEmbedMode .dsWatchLayout {
      grid-template-columns: 1fr !important;
    }

    .dsWatchEmbedMode .dsWatchSidePanel,
    .dsWatchEmbedMode .dsWatchPlayerTop,
    .dsWatchEmbedMode .dsWatchEmbedFrame::after {
      display: none !important;
    }

    .dsWatchEmbedMode .dsWatchPlayerCard {
      grid-template-rows: 1fr auto !important;
    }

    .dsWatchEmbedMode .dsWatchActions {
      left: 50% !important;
      right: auto !important;
      bottom: 14px !important;
      transform: translateX(-50%);
      width: auto !important;
      max-width: min(760px, calc(100vw - 24px)) !important;
      opacity: .22;
      transition: opacity .18s ease, transform .18s ease;
      pointer-events: auto;
    }

    .dsWatchEmbedMode .dsWatchActions:hover,
    .dsWatchEmbedMode .dsWatchActions:focus-within {
      opacity: 1;
      transform: translateX(-50%) translateY(-2px);
    }

    .dsWatchEmbedMode .dsWatchHeader {
      opacity: .20;
      transition: opacity .18s ease;
      pointer-events: auto;
    }

    .dsWatchEmbedMode .dsWatchHeader:hover,
    .dsWatchEmbedMode .dsWatchHeader:focus-within {
      opacity: 1;
    }

    .dsWatchEmbedMode .dsWatchFrame,
    .dsWatchEmbedMode .dsMovieEmbedFrame {
      position: relative;
      z-index: 1;
    }

    .dsWatchEmbedMode .dsMovieEmbedNotice {
      display: none !important;
    }

    @media(max-width: 860px) {
      .dsWatchEmbedMode .dsWatchActions {
        left: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        transform: none !important;
        width: auto !important;
        max-width: none !important;
        opacity: .35;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .dsWatchEmbedMode .dsWatchActions:hover,
      .dsWatchEmbedMode .dsWatchActions:focus-within {
        transform: none !important;
        opacity: 1;
      }
    }


    /* ============================================================
       v41 CLICKABLE SANDBOX
       Keeps popups blocked but allows normal player interactions.
       ============================================================ */

    .dsWatchEmbedMode .dsWatchEmbedFrame::after,
    .dsWatchEmbedMode .dsMovieEmbedNotice,
    .dsWatchEmbedMode .dsWatchPlayerTop,
    .dsWatchEmbedMode .dsWatchSidePanel,
    .dsWatchEmbedMode .dsWatchActions {
      display: none !important;
      pointer-events: none !important;
    }

    .dsWatchEmbedMode .dsWatchLayout {
      grid-template-columns: 1fr !important;
    }

    .dsWatchEmbedMode .dsWatchFrame,
    .dsWatchEmbedMode .dsMovieEmbedFrame {
      pointer-events: auto !important;
    }

    .dsWatchEmbedMode .dsWatchHeader {
      opacity: .12;
      pointer-events: auto;
      transition: opacity .18s ease;
    }

    .dsWatchEmbedMode .dsWatchHeader:hover,
    .dsWatchEmbedMode .dsWatchHeader:focus-within {
      opacity: 1;
    }

    .dsWatchEmbedMode .dsMovieEmbedFrame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }


    /* ============================================================
       v42 EMBED FULLSCREEN BUTTON
       Adds a small fullscreen control without covering iframe clicks.
       ============================================================ */

    .dsEmbedFullscreenBtn {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 13px;
      border-radius: 999px;
      color: rgba(248,251,255,.88);
      background: rgba(2,3,10,.58);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 14px 44px rgba(0,0,0,.30);
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      pointer-events: auto;
      transition: opacity .18s ease, transform .18s ease, background .18s ease;
    }

    .dsEmbedFullscreenBtn:hover {
      color: white;
      background: rgba(255,255,255,.10);
      transform: translateY(-1px);
    }

    .dsWatchEmbedMode .dsWatchHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .dsWatchEmbedMode .dsWatchHeader .dsWatchModeSwitch {
      margin-left: auto;
    }

    .dsWatchFrame:fullscreen,
    .dsWatchFrame:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      border-radius: 0 !important;
      background: #000 !important;
    }

    .dsWatchFrame:fullscreen iframe,
    .dsWatchFrame:-webkit-full-screen iframe {
      position: absolute !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      border: 0 !important;
      background: #000 !important;
    }

    @media(max-width: 720px) {
      .dsEmbedFullscreenBtn {
        padding: 0 10px;
        font-size: 11px;
      }

      .dsWatchEmbedMode .dsWatchHeader {
        flex-wrap: wrap;
      }
    }


    /* ============================================================
       v44 REAL IFRAME FULLSCREEN
       Fullscreen button now targets the iframe first, then falls back.
       ============================================================ */

    .dsMovieEmbedFrame:fullscreen,
    .dsMovieEmbedFrame:-webkit-full-screen,
    .dsMovieEmbedFrame:-moz-full-screen,
    .dsMovieEmbedFrame:-ms-fullscreen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      border: 0 !important;
      background: #000 !important;
    }

    .dsWatchPlayerCard:fullscreen,
    .dsWatchPlayerCard:-webkit-full-screen,
    .dsWatchPlayerCard:-moz-full-screen,
    .dsWatchPlayerCard:-ms-fullscreen {
      width: 100vw !important;
      height: 100vh !important;
      padding: 0 !important;
      border-radius: 0 !important;
      background: #000 !important;
    }

    .dsWatchPlayerCard:fullscreen .dsWatchFrame,
    .dsWatchPlayerCard:-webkit-full-screen .dsWatchFrame,
    .dsWatchPlayerCard:-moz-full-screen .dsWatchFrame,
    .dsWatchPlayerCard:-ms-fullscreen .dsWatchFrame {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      border-radius: 0 !important;
      background: #000 !important;
    }

    .dsIsFullscreen .dsWatchHeader,
    .dsIsFullscreen .dsWatchActions,
    .dsIsFullscreen .dsWatchPlayerTop,
    .dsIsFullscreen .dsWatchSidePanel {
      opacity: 0 !important;
      pointer-events: none !important;
    }


    /* ============================================================
       v45 TV EPISODE BUTTON + SANDBOX CHECK
       TV watch button says Episode; sandbox blocks popups/top navigation.
       ============================================================ */

    .dsMoviePlaceholderNote {
      white-space: nowrap;
    }


    /* ============================================================
       v46 MINIMAL IFRAME SANDBOX
       Sandbox is exactly: allow-scripts allow-same-origin
       ============================================================ */


    /* ============================================================
       v48 MOBILE + EPISODE UI
       Updated mobile layout and clickable seasons/episodes.
       ============================================================ */

    .dsSectionTitleRow {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .dsSectionTitleRow h2 {
      margin: 0;
    }

    .dsSectionTitleRow p {
      margin: 6px 0 0;
      color: rgba(248,251,255,.58);
      font-size: 14px;
      font-weight: 650;
      line-height: 1.45;
    }

    .dsSectionTitleRow > a {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 13px;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 12px;
      font-weight: 950;
      white-space: nowrap;
    }

    .dsSeasonBlock {
      overflow: hidden;
      border-radius: 24px;
      background:
        radial-gradient(380px circle at 0% 0%, rgba(53,216,255,.10), transparent 54%),
        rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      margin-bottom: 12px;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .dsSeasonBlock:hover {
      transform: translateY(-2px);
      border-color: rgba(255,255,255,.18);
      background:
        radial-gradient(380px circle at 0% 0%, rgba(140,107,255,.13), transparent 54%),
        rgba(255,255,255,.075);
    }

    .dsSeasonBlockHead {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 16px;
      color: white;
    }

    .dsSeasonBlockHead > span {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-weight: 950;
      box-shadow: 0 16px 38px rgba(53,216,255,.12);
    }

    .dsSeasonBlockHead strong {
      display: block;
      color: white;
      font-size: 18px;
      letter-spacing: -.03em;
    }

    .dsSeasonBlockHead p {
      margin: 6px 0 0;
      color: rgba(248,251,255,.58);
      line-height: 1.45;
      font-size: 13px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .dsSeasonBlockHead b {
      color: rgba(248,251,255,.72);
      font-size: 12px;
      font-weight: 950;
      white-space: nowrap;
    }

    .dsEpisodeChips {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 0 16px 16px 84px;
      scrollbar-width: none;
    }

    .dsEpisodeChips::-webkit-scrollbar,
    .dsWatchSeasonScroll::-webkit-scrollbar,
    .dsWatchEpisodeScroll::-webkit-scrollbar {
      display: none;
    }

    .dsEpisodeChips a,
    .dsWatchSeasonScroll a,
    .dsWatchEpisodeScroll a {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      flex: 0 0 auto;
      border-radius: 999px;
      color: rgba(248,251,255,.82);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .dsEpisodeChips a:hover,
    .dsWatchSeasonScroll a:hover,
    .dsWatchEpisodeScroll a:hover,
    .dsWatchSeasonScroll a.active,
    .dsWatchEpisodeScroll a.active {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      border-color: transparent;
    }

    .dsWatchEpisodePicker {
      position: fixed;
      left: max(12px, var(--v-left, 4vw));
      right: max(12px, var(--v-right, 4vw));
      top: 78px;
      z-index: 48;
      display: grid;
      grid-template-columns: auto minmax(0, .9fr) minmax(0, 1.1fr);
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 22px;
      background: rgba(2,3,10,.62);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 18px 70px rgba(0,0,0,.34);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
      opacity: .88;
      transition: opacity .18s ease, transform .18s ease;
    }

    .dsWatchEpisodePicker:hover,
    .dsWatchEpisodePicker:focus-within {
      opacity: 1;
      transform: translateY(-1px);
    }

    .dsWatchEpisodePicker > div:first-child {
      display: grid;
      gap: 2px;
      padding: 0 8px;
      min-width: 112px;
    }

    .dsWatchEpisodePicker span {
      color: rgba(248,251,255,.50);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsWatchEpisodePicker strong {
      color: white;
      font-size: 18px;
      letter-spacing: -.04em;
    }

    .dsWatchSeasonScroll,
    .dsWatchEpisodeScroll {
      display: flex;
      gap: 7px;
      overflow-x: auto;
      padding: 2px;
      scrollbar-width: none;
    }

    .dsWatchEmbedMode .dsWatchEpisodePicker {
      opacity: .26;
    }

    .dsWatchEmbedMode .dsWatchEpisodePicker:hover,
    .dsWatchEmbedMode .dsWatchEpisodePicker:focus-within {
      opacity: 1;
    }

    @media(max-width: 900px) {
      .topbar,
      .netflixTopbar {
        min-height: 62px !important;
        padding-inline: 14px !important;
        background: rgba(5,7,17,.76) !important;
        border-bottom: 1px solid rgba(255,255,255,.08);
        backdrop-filter: blur(18px) saturate(1.08);
        -webkit-backdrop-filter: blur(18px) saturate(1.08);
      }

      .dsHero,
      .hero {
        min-height: 74svh !important;
      }

      .dsHeroContent,
      .heroCopy {
        padding-top: 78px;
        padding-bottom: 88px;
      }

      .dsHeroContent h1,
      .heroCopy h1,
      .dsDetailHeroContent h1 {
        font-size: clamp(42px, 14vw, 72px) !important;
        line-height: .9 !important;
        letter-spacing: -.075em !important;
      }

      .dsHeroContent p,
      .heroCopy p,
      .dsDetailGrid > p {
        font-size: 14px !important;
        line-height: 1.48 !important;
        -webkit-line-clamp: 4;
      }

      .dsHeroActions,
      .dsDetailActions {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 9px !important;
        width: 100%;
      }

      .dsHeroActions .dsPrimaryBtn,
      .dsHeroActions .dsSecondaryBtn,
      .dsDetailActions .dsPrimaryBtn,
      .dsDetailActions .dsSecondaryBtn {
        width: 100%;
        min-height: 48px;
        padding-inline: 12px;
      }

      .dsMoviePlaceholderNote {
        grid-column: 1 / -1;
        justify-content: center;
      }

      .dsIconBtn {
        min-height: 44px !important;
        width: 100% !important;
      }

      .dsRow,
      .dsContent,
      .dsDetailBody {
        padding-left: 14px !important;
        padding-right: 14px !important;
      }

      .movieRail,
      .dsRail {
        gap: 10px !important;
        scroll-padding-left: 14px;
      }

      .movieCard,
      .dsWelcomeCard a {
        border-radius: 18px !important;
      }

      .dsDetailShell {
        border-radius: 0 !important;
      }

      .dsDetailHero {
        min-height: 68svh !important;
      }

      .dsDetailBody {
        margin-top: -38px;
        position: relative;
        z-index: 4;
        border-radius: 28px 28px 0 0;
        background: linear-gradient(180deg, rgba(8,11,22,.98), #050711);
        border-top: 1px solid rgba(255,255,255,.08);
        padding-top: 20px !important;
      }

      .dsMetaBand {
        overflow-x: auto;
        flex-wrap: nowrap !important;
        scrollbar-width: none;
      }

      .dsMetaBand::-webkit-scrollbar {
        display: none;
      }

      .dsDetailGrid {
        grid-template-columns: 1fr !important;
        gap: 18px !important;
      }

      .dsDetailTabs {
        position: sticky;
        top: 62px;
        z-index: 20;
        display: flex;
        overflow-x: auto;
        gap: 8px;
        padding: 10px 0;
        background: linear-gradient(180deg, rgba(8,11,22,.96), rgba(8,11,22,.80));
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        scrollbar-width: none;
      }

      .dsDetailTabs::-webkit-scrollbar {
        display: none;
      }

      .dsDetailTabs a {
        flex: 0 0 auto;
        min-height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.10);
      }

      .dsSectionTitleRow {
        display: grid;
        align-items: start;
      }

      .dsSectionTitleRow > a {
        width: 100%;
      }

      .dsSeasonBlock {
        border-radius: 20px;
      }

      .dsSeasonBlockHead {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
      }

      .dsSeasonBlockHead b {
        grid-column: 1 / -1;
        margin-left: 68px;
      }

      .dsEpisodeChips {
        padding-left: 16px;
      }

      .dsWatchEpisodePicker {
        top: 66px;
        left: 10px;
        right: 10px;
        grid-template-columns: 1fr;
        gap: 8px;
        opacity: .96 !important;
        border-radius: 20px;
      }

      .dsWatchEpisodePicker > div:first-child {
        display: flex;
        justify-content: space-between;
        align-items: center;
        min-width: 0;
      }

      .dsWatchFullscreenMovie .dsWatchPlayerCard {
        padding-top: 170px !important;
      }

      .dsWatchTrailerMode .dsWatchHero {
        padding-top: 124px !important;
      }

      .dsWatchHeader {
        min-height: 58px !important;
        padding: 10px !important;
      }
    }

    @media(max-width: 520px) {
      .dsHeroActions,
      .dsDetailActions {
        grid-template-columns: 1fr;
      }

      .dsSeasonBlockHead {
        gap: 10px;
        padding: 14px;
      }

      .dsSeasonBlockHead > span {
        width: 46px;
        height: 46px;
        border-radius: 15px;
      }

      .dsSeasonBlockHead b {
        margin-left: 56px;
      }

      .dsEpisodeChips a {
        min-height: 34px;
        padding-inline: 10px;
      }

      .dsWatchModeSwitch {
        width: 100%;
      }

      .dsWatchModeSwitch a {
        flex: 1;
      }
    }


    /* ============================================================
       v49 BETTER WELCOME PAGE
       Cleaner landing page, stronger discovery, mobile polish.
       ============================================================ */

    .dsWelcomePagePro {
      background:
        radial-gradient(1200px circle at 8% -6%, rgba(140,107,255,.28), transparent 42%),
        radial-gradient(950px circle at 92% -8%, rgba(53,216,255,.16), transparent 42%),
        radial-gradient(900px circle at 50% 28%, rgba(255,255,255,.045), transparent 45%),
        linear-gradient(180deg, #050711 0%, #080c18 42%, #050711 100%);
    }

    .dsWelcomeNavPro {
      height: 82px;
      background:
        linear-gradient(to bottom, rgba(5,7,17,.92), rgba(5,7,17,.58), transparent);
      border-bottom: 1px solid rgba(255,255,255,.06);
      backdrop-filter: blur(16px) saturate(1.08);
      -webkit-backdrop-filter: blur(16px) saturate(1.08);
    }

    .dsWelcomeNavLinks {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dsWelcomeHeroPro {
      min-height: 100svh;
      grid-template-columns: minmax(0, 1.02fr) minmax(340px, .72fr);
      align-items: center;
      padding-top: 118px;
      padding-bottom: 80px;
    }

    .dsWelcomeHeroPro::before {
      background:
        linear-gradient(to top, #050711 0%, rgba(5,7,17,.88) 18%, rgba(5,7,17,.28) 55%, rgba(5,7,17,.86) 100%),
        linear-gradient(90deg, rgba(5,7,17,.96), rgba(5,7,17,.32), rgba(5,7,17,.66));
    }

    .dsWelcomeGlowOne {
      position: absolute;
      width: min(520px, 60vw);
      height: min(520px, 60vw);
      right: 10vw;
      top: 18vh;
      z-index: -1;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(53,216,255,.16), transparent 62%);
      filter: blur(16px);
      pointer-events: none;
    }

    .dsWelcomeHeroPro .dsWelcomeHeroCopy h1 {
      max-width: 1000px;
      font-size: clamp(56px, 8.5vw, 126px);
      letter-spacing: -.09em;
    }

    .dsWelcomeHeroPro .dsWelcomeHeroCopy p {
      max-width: 720px;
      color: rgba(248,251,255,.78);
    }

    .dsWelcomeStats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 9px;
      max-width: 780px;
      margin-top: 28px;
    }

    .dsWelcomeStats div {
      min-height: 92px;
      display: grid;
      align-content: center;
      gap: 4px;
      padding: 15px;
      border-radius: 22px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 18px 54px rgba(0,0,0,.22);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .dsWelcomeStats b {
      color: white;
      font-size: 15px;
      font-weight: 950;
    }

    .dsWelcomeStats span {
      color: rgba(248,251,255,.58);
      font-size: 12px;
      font-weight: 720;
      line-height: 1.35;
    }

    .dsWelcomeShowcase {
      display: grid;
      gap: 14px;
      align-self: center;
    }

    .dsWelcomeSpotlightCard {
      display: grid;
      grid-template-columns: 132px minmax(0, 1fr);
      gap: 16px;
      align-items: end;
      padding: 16px;
      border-radius: 34px;
      background:
        radial-gradient(460px circle at 0% 0%, rgba(53,216,255,.14), transparent 52%),
        rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 32px 100px rgba(0,0,0,.38);
      backdrop-filter: blur(20px) saturate(1.08);
      -webkit-backdrop-filter: blur(20px) saturate(1.08);
    }

    .dsWelcomeSpotlightCard img,
    .dsWelcomeSpotlightCard .posterFallback {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      border-radius: 24px;
      background: rgba(255,255,255,.08);
      box-shadow: 0 20px 60px rgba(0,0,0,.38);
    }

    .dsWelcomeSpotlightCard span {
      color: rgba(248,251,255,.56);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsWelcomeSpotlightCard h2 {
      margin: 8px 0 6px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 3.6vw, 46px);
      line-height: .94;
      letter-spacing: -.07em;
    }

    .dsWelcomeSpotlightCard p {
      margin: 0 0 12px;
      color: rgba(248,251,255,.62);
      font-weight: 760;
    }

    .dsWelcomeSpotlightCard a {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 12px;
      font-weight: 950;
    }

    .dsWelcomeMiniMosaic {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      padding: 10px;
      border-radius: 24px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .dsWelcomeMiniMosaic img {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      border-radius: 14px;
      filter: saturate(1.03);
    }

    .dsWelcomeHowItWorks {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: -36px var(--v-right, 4vw) 54px var(--v-left, 4vw);
      position: relative;
      z-index: 5;
    }

    .dsWelcomeHowItWorks article {
      min-height: 160px;
      padding: 20px;
      border-radius: 30px;
      background:
        radial-gradient(420px circle at 0% 0%, rgba(140,107,255,.12), transparent 50%),
        rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 24px 76px rgba(0,0,0,.24);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsWelcomeHowItWorks span {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 13px;
      font-weight: 950;
    }

    .dsWelcomeHowItWorks strong {
      display: block;
      margin-top: 16px;
      color: white;
      font-size: 21px;
      letter-spacing: -.05em;
      font-weight: 950;
    }

    .dsWelcomeHowItWorks p {
      margin: 8px 0 0;
      color: rgba(248,251,255,.62);
      line-height: 1.5;
      font-weight: 650;
    }

    .dsWelcomeDiscoveryPro {
      padding-top: 18px;
    }

    .dsWelcomeDiscoveryPro .dsWelcomeIntro {
      max-width: 980px;
      margin-bottom: 32px;
    }

    .dsWelcomeFeaturesPro {
      grid-template-columns: repeat(4, 1fr);
      margin-top: 50px;
    }

    .dsWelcomeFeaturesPro article {
      min-height: 238px;
      transition: transform .18s ease, border-color .18s ease;
    }

    .dsWelcomeFeaturesPro article:hover {
      transform: translateY(-5px);
      border-color: rgba(255,255,255,.18);
    }

    .dsWelcomeFeaturesPro article span {
      color: var(--v-blue, #35d8ff);
      font-size: 11px;
    }

    .dsWelcomeDevice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 380px);
      align-items: center;
      gap: clamp(22px, 5vw, 70px);
      margin: 54px var(--v-right, 4vw) 0 var(--v-left, 4vw);
      padding: clamp(24px, 4vw, 56px);
      border-radius: 38px;
      background:
        radial-gradient(720px circle at 0% 0%, rgba(53,216,255,.12), transparent 48%),
        radial-gradient(620px circle at 100% 0%, rgba(140,107,255,.13), transparent 48%),
        rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 30px 110px rgba(0,0,0,.30);
      overflow: hidden;
    }

    .dsWelcomeDevice h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(40px, 6vw, 82px);
      line-height: .92;
      letter-spacing: -.075em;
    }

    .dsWelcomeDevice p {
      max-width: 680px;
      color: rgba(248,251,255,.66);
      line-height: 1.6;
      font-weight: 650;
    }

    .dsPhoneMock {
      justify-self: center;
      width: min(280px, 72vw);
      aspect-ratio: 9 / 18.5;
      padding: 14px;
      border-radius: 42px;
      background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.04));
      border: 1px solid rgba(255,255,255,.18);
      box-shadow: 0 34px 100px rgba(0,0,0,.42), inset 0 0 0 7px rgba(0,0,0,.28);
      display: grid;
      grid-template-rows: 26px 1fr auto;
      gap: 12px;
      transform: rotate(4deg);
    }

    .dsPhoneTop {
      width: 92px;
      height: 10px;
      border-radius: 999px;
      justify-self: center;
      background: rgba(0,0,0,.55);
    }

    .dsPhoneHero {
      border-radius: 28px;
      background:
        linear-gradient(to top, rgba(0,0,0,.82), transparent 54%),
        radial-gradient(circle at 30% 20%, rgba(53,216,255,.34), transparent 42%),
        linear-gradient(135deg, rgba(140,107,255,.52), rgba(255,255,255,.08));
    }

    .dsPhoneRows {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
    }

    .dsPhoneRows span {
      aspect-ratio: 2 / 3;
      border-radius: 13px;
      background: rgba(255,255,255,.13);
    }

    .dsWelcomeFinalCtaPro {
      min-height: 360px;
      margin-top: 54px;
      background:
        radial-gradient(760px circle at 50% 0%, rgba(53,216,255,.13), transparent 54%),
        rgba(255,255,255,.065);
    }

    @media(max-width: 1060px) {
      .dsWelcomeHeroPro,
      .dsWelcomeDevice {
        grid-template-columns: 1fr;
      }

      .dsWelcomeShowcase {
        max-width: 720px;
      }

      .dsWelcomeHowItWorks,
      .dsWelcomeFeaturesPro {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media(max-width: 720px) {
      .dsWelcomeNavPro {
        height: 66px;
        padding: 0 14px;
      }

      .dsWelcomeNavLinks a[href="#features"],
      .dsWelcomeNavLinks a[href="#discovery"] {
        display: none !important;
      }

      .dsWelcomeNavLinks {
        gap: 7px;
      }

      .dsWelcomeNav a:not(.dsWelcomeBrand) {
        min-height: 36px;
        padding: 0 10px;
        font-size: 12px;
      }

      .dsWelcomeHeroPro {
        min-height: auto;
        padding: 104px 16px 54px;
      }

      .dsWelcomeHeroPro .dsWelcomeHeroCopy h1 {
        font-size: clamp(46px, 15vw, 76px);
      }

      .dsWelcomeHeroPro .dsWelcomeHeroCopy p {
        font-size: 14px;
      }

      .dsWelcomeActions {
        display: grid;
        grid-template-columns: 1fr;
      }

      .dsWelcomeActions a {
        width: 100%;
      }

      .dsWelcomeStats {
        grid-template-columns: 1fr;
      }

      .dsWelcomeSpotlightCard {
        grid-template-columns: 92px minmax(0, 1fr);
        border-radius: 26px;
        padding: 12px;
      }

      .dsWelcomeSpotlightCard img,
      .dsWelcomeSpotlightCard .posterFallback {
        border-radius: 18px;
      }

      .dsWelcomeSpotlightCard h2 {
        font-size: 25px;
      }

      .dsWelcomeMiniMosaic {
        grid-template-columns: repeat(3, 1fr);
      }

      .dsWelcomeHowItWorks,
      .dsWelcomeFeaturesPro {
        grid-template-columns: 1fr;
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsWelcomeHowItWorks {
        margin-top: 4px;
      }

      .dsWelcomeDiscoveryPro,
      .dsWelcomeDevice,
      .dsWelcomeFinalCtaPro {
        margin-left: 16px;
        margin-right: 16px;
      }

      .dsWelcomeIntro h2,
      .dsWelcomeDevice h2,
      .dsWelcomeFinalCta h2 {
        font-size: clamp(36px, 12vw, 58px);
      }

      .dsWelcomeRailTrack {
        grid-auto-columns: minmax(210px, 78vw);
      }

      .dsWelcomeDevice {
        padding: 24px;
        border-radius: 28px;
      }

      .dsPhoneMock {
        width: min(240px, 70vw);
        transform: rotate(0deg);
      }
    }


    /* ============================================================
       v50 WATCHROOM SHARED BROWSER
       Host-controlled iframe browser inside watchrooms.
       ============================================================ */

    .dsRoomBrowserPanel {
      display: grid;
      gap: 14px;
      padding: 18px;
      border-radius: 28px;
      background:
        radial-gradient(540px circle at 0% 0%, rgba(53,216,255,.09), transparent 44%),
        radial-gradient(460px circle at 100% 0%, rgba(140,107,255,.11), transparent 44%),
        rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: 0 24px 80px rgba(0,0,0,.28);
    }

    .dsRoomBrowserPanel[hidden] {
      display: none !important;
    }

    .dsRoomBrowserTop {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
    }

    .dsRoomBrowserTop h2 {
      margin: 4px 0 6px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 4vw, 50px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsRoomBrowserTop p,
    .dsRoomBrowserNote {
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.45;
      font-weight: 650;
    }

    .dsHostBadge {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 0 11px;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 11px;
      font-weight: 950;
      white-space: nowrap;
    }

    .dsRoomBrowserForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .dsRoomBrowserForm input {
      min-height: 50px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 650;
    }

    .dsRoomBrowserForm.isGuestLocked {
      opacity: .58;
    }

    .dsRoomBrowserFrameWrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: 420px;
      overflow: hidden;
      border-radius: 24px;
      background: #02030a;
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
    }

    .dsRoomBrowserFrameWrap iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }

    .dsRoomBrowserEmpty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 8px;
      padding: 28px;
      text-align: center;
      background:
        radial-gradient(540px circle at 50% 0%, rgba(53,216,255,.10), transparent 54%),
        rgba(5,7,17,.86);
    }

    .dsRoomBrowserEmpty[hidden] {
      display: none !important;
    }

    .dsRoomBrowserEmpty h3 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 4vw, 48px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsRoomBrowserEmpty p {
      max-width: 520px;
      margin: 0;
      color: rgba(248,251,255,.62);
      font-weight: 650;
      line-height: 1.5;
    }

    .dsEmbedTabsClean button.active {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      border-color: transparent;
    }

    @media(max-width: 820px) {
      .dsRoomBrowserTop {
        display: grid;
      }

      .dsRoomBrowserForm {
        grid-template-columns: 1fr;
      }

      .dsRoomBrowserForm button {
        width: 100%;
      }

      .dsRoomBrowserFrameWrap {
        min-height: 320px;
        border-radius: 20px;
      }
    }


    /* ============================================================
       v51 WATCHROOM REMOTE BROWSER
       Playwright-powered server browser stream for watchrooms.
       ============================================================ */

    .dsRemoteBrowserPanel {
      border-color: rgba(53,216,255,.16);
    }

    .dsRemoteBrowserScreen {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: 420px;
      overflow: hidden;
      border-radius: 24px;
      background: #02030a;
      border: 1px solid rgba(255,255,255,.10);
      cursor: crosshair;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 20px 70px rgba(0,0,0,.30);
    }

    .dsRemoteBrowserScreen img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
      opacity: 0;
      transition: opacity .16s ease;
      user-select: none;
      -webkit-user-drag: none;
    }

    .dsRemoteBrowserScreen img.isLoaded {
      opacity: 1;
    }

    .dsRemoteTextForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      gap: 9px;
      align-items: center;
    }

    .dsRemoteTextForm input {
      min-height: 46px;
      padding: 0 13px;
      border-radius: 15px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 650;
    }

    .dsRemoteTextForm.isGuestLocked,
    .dsRoomBrowserForm.isGuestLocked {
      opacity: .54;
    }

    .dsRemoteTextForm.isGuestLocked input,
    .dsRoomBrowserForm.isGuestLocked input {
      cursor: not-allowed;
    }

    @media(max-width: 820px) {
      .dsRemoteBrowserScreen {
        min-height: 300px;
        border-radius: 20px;
      }

      .dsRemoteTextForm {
        grid-template-columns: 1fr;
      }

      .dsRemoteTextForm button {
        width: 100%;
      }
    }


    /* ============================================================
       v54 WATCHROOM BUG FIXES + RENDER/GITHUB READY
       Fixes tab switching, Browser button visibility, and setup diagnostics.
       ============================================================ */

    .dsPlayerStage[data-room-view="browser"] #playerWrap,
    .dsPlayerStage[data-room-view="browser"] #manualTimeBox,
    .dsPlayerStage[data-room-view="browser"] #remoteBrowserPanel,
    .dsPlayerStage[data-room-view="remote"] #playerWrap,
    .dsPlayerStage[data-room-view="remote"] #manualTimeBox,
    .dsPlayerStage[data-room-view="remote"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="clock"] #playerWrap,
    .dsPlayerStage[data-room-view="clock"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="clock"] #remoteBrowserPanel {
      display: none !important;
    }

    .dsPlayerStage[data-room-view="browser"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="remote"] #remoteBrowserPanel,
    .dsPlayerStage[data-room-view="clock"] #manualTimeBox,
    .dsPlayerStage[data-room-view="player"] #playerWrap {
      display: grid !important;
    }

    .dsPlayerStage[data-room-view="player"] #manualTimeBox,
    .dsPlayerStage[data-room-view="player"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="player"] #remoteBrowserPanel {
      display: none !important;
    }

    .dsSyncControls.isBrowserView {
      opacity: .42;
    }

    .dsSyncControls.isBrowserView .dsSyncPrimaryRow::before {
      content: "Sync buttons only control YouTube player mode";
      color: rgba(248,251,255,.54);
      font-size: 12px;
      font-weight: 800;
      align-self: center;
    }

    .dsEmbedTabsClean {
      position: sticky;
      top: 80px;
      z-index: 12;
      background: rgba(2,3,10,.50);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 999px;
      padding: 6px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .dsEmbedTabsClean button {
      min-height: 38px;
      padding: 0 13px;
    }

    .dsRoomBrowserPanel,
    .dsRemoteBrowserPanel,
    .dsManualTimeBox {
      margin-top: 12px;
    }

    .dsRoomBrowserFrameWrap,
    .dsRemoteBrowserScreen {
      min-height: clamp(300px, 52vw, 560px);
    }

    @media(max-width: 760px) {
      .dsEmbedTabsClean {
        overflow-x: auto;
        justify-content: flex-start;
        border-radius: 18px;
      }

      .dsEmbedTabsClean button {
        flex: 0 0 auto;
      }

      .dsSyncControls.isBrowserView {
        display: none;
      }
    }


    /* ============================================================
       v55 WATCHROOM LIVE SHARE
       Reliable fallback: host shares a tab/window through WebRTC.
       ============================================================ */

    .dsPlayerStage[data-room-view="live"] #playerWrap,
    .dsPlayerStage[data-room-view="live"] #manualTimeBox,
    .dsPlayerStage[data-room-view="live"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="live"] #remoteBrowserPanel {
      display: none !important;
    }

    .dsPlayerStage[data-room-view="live"] #liveSharePanel {
      display: grid !important;
    }

    .dsPlayerStage[data-room-view="player"] #liveSharePanel,
    .dsPlayerStage[data-room-view="browser"] #liveSharePanel,
    .dsPlayerStage[data-room-view="remote"] #liveSharePanel,
    .dsPlayerStage[data-room-view="clock"] #liveSharePanel {
      display: none !important;
    }

    .dsLiveSharePanel {
      display: grid;
      gap: 14px;
      padding: 18px;
      margin-top: 12px;
      border-radius: 28px;
      background:
        radial-gradient(620px circle at 0% 0%, rgba(53,216,255,.12), transparent 46%),
        radial-gradient(520px circle at 100% 0%, rgba(140,107,255,.12), transparent 46%),
        rgba(255,255,255,.052);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 24px 80px rgba(0,0,0,.28);
    }

    .dsLiveSharePanel[hidden] {
      display: none !important;
    }

    .dsLiveShareTop {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
    }

    .dsLiveShareTop h2 {
      margin: 4px 0 6px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(30px, 4vw, 54px);
      line-height: .92;
      letter-spacing: -.07em;
    }

    .dsLiveShareTop p {
      margin: 0;
      color: rgba(248,251,255,.64);
      line-height: 1.48;
      font-weight: 650;
    }

    .dsLiveShareStage {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: clamp(300px, 52vw, 580px);
      overflow: hidden;
      border-radius: 24px;
      background: #000;
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 20px 70px rgba(0,0,0,.30);
    }

    .dsLiveShareStage video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    .dsLiveShareControls {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      align-items: center;
    }

    .dsLiveShareControls button:disabled {
      opacity: .42;
      cursor: not-allowed;
    }

    .dsLiveShareStage:fullscreen {
      width: 100vw;
      height: 100vh;
      border-radius: 0;
    }

    @media(max-width: 760px) {
      .dsLiveShareTop {
        display: grid;
      }

      .dsLiveShareControls {
        display: grid;
      }

      .dsLiveShareControls button {
        width: 100%;
      }
    }


    /* ============================================================
       v56 OPEN TOGETHER MODE
       Fallback if the host cannot live share.
       ============================================================ */

    .dsPlayerStage[data-room-view="open"] #playerWrap,
    .dsPlayerStage[data-room-view="open"] #manualTimeBox,
    .dsPlayerStage[data-room-view="open"] #roomBrowserPanel,
    .dsPlayerStage[data-room-view="open"] #remoteBrowserPanel,
    .dsPlayerStage[data-room-view="open"] #liveSharePanel {
      display: none !important;
    }

    .dsPlayerStage[data-room-view="open"] #openTogetherPanel {
      display: grid !important;
    }

    .dsPlayerStage[data-room-view="player"] #openTogetherPanel,
    .dsPlayerStage[data-room-view="browser"] #openTogetherPanel,
    .dsPlayerStage[data-room-view="remote"] #openTogetherPanel,
    .dsPlayerStage[data-room-view="clock"] #openTogetherPanel,
    .dsPlayerStage[data-room-view="live"] #openTogetherPanel {
      display: none !important;
    }

    .dsOpenTogetherPanel {
      display: grid;
      gap: 14px;
      padding: 18px;
      margin-top: 12px;
      border-radius: 28px;
      background:
        radial-gradient(620px circle at 0% 0%, rgba(255,224,138,.12), transparent 46%),
        radial-gradient(520px circle at 100% 0%, rgba(53,216,255,.10), transparent 46%),
        rgba(255,255,255,.052);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 24px 80px rgba(0,0,0,.28);
    }

    .dsOpenTogetherPanel[hidden] {
      display: none !important;
    }

    .dsOpenTogetherForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .dsOpenTogetherForm input {
      min-height: 50px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 650;
    }

    .dsOpenTogetherForm.isGuestLocked {
      opacity: .55;
    }

    .dsOpenTogetherCard {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px;
      border-radius: 24px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsOpenTogetherCard span {
      color: rgba(248,251,255,.54);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsOpenTogetherCard h3 {
      margin: 6px 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 4vw, 44px);
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsOpenTogetherCard p {
      max-width: 720px;
      margin: 0;
      color: rgba(248,251,255,.60);
      overflow-wrap: anywhere;
      line-height: 1.45;
      font-weight: 650;
    }

    .dsOpenTogetherCard a.disabled {
      opacity: .46;
      pointer-events: none;
    }

    .dsOpenTogetherSync {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .dsOpenTogetherSync div {
      min-height: 120px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 4px;
      text-align: center;
      border-radius: 24px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsOpenTogetherSync small {
      color: rgba(248,251,255,.55);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsOpenTogetherSync strong {
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(42px, 7vw, 84px);
      line-height: .9;
      letter-spacing: -.08em;
    }

    .dsOpenTogetherControls {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
    }

    .dsOpenTogetherControls button:disabled,
    .dsOpenTogetherForm input:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    @media(max-width: 760px) {
      .dsOpenTogetherForm,
      .dsOpenTogetherSync {
        grid-template-columns: 1fr;
      }

      .dsOpenTogetherCard {
        display: grid;
      }

      .dsOpenTogetherCard a,
      .dsOpenTogetherControls button {
        width: 100%;
      }

      .dsOpenTogetherControls {
        display: grid;
      }
    }


    /* ============================================================
       v57 RELIABLE WATCHROOM
       Replaces old broken tabs with a stable Open Together + Live Share room.
       ============================================================ */

    .dsStableRoom {
      min-height: 100svh;
      padding: clamp(18px, 3vw, 34px);
      background:
        radial-gradient(900px circle at 10% -10%, rgba(53,216,255,.14), transparent 42%),
        radial-gradient(780px circle at 90% 0%, rgba(140,107,255,.16), transparent 44%),
        linear-gradient(180deg, #050711 0%, #080c18 56%, #050711 100%);
    }

    .dsStableRoomHero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
      gap: 18px;
      align-items: end;
      max-width: 1560px;
      margin: 0 auto 18px;
      padding-top: 22px;
    }

    .dsStableRoomHero h1 {
      margin: 14px 0 10px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(46px, 7vw, 104px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsStableRoomHero p {
      max-width: 780px;
      margin: 0;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsStableRoomMeta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 10px;
      border-radius: 26px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 24px 80px rgba(0,0,0,.28);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .dsStableRoomMeta div {
      min-height: 86px;
      display: grid;
      align-content: center;
      gap: 6px;
      padding: 12px;
      border-radius: 18px;
      background: rgba(255,255,255,.055);
    }

    .dsStableRoomMeta small {
      color: rgba(248,251,255,.52);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsStableRoomMeta strong {
      color: white;
      font-weight: 950;
      overflow-wrap: anywhere;
    }

    .dsStableRoomGrid {
      max-width: 1560px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      gap: 18px;
      align-items: start;
    }

    .dsStableMain,
    .dsStableSide,
    .dsStablePanel {
      min-width: 0;
    }

    .dsStableTabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 8px;
      margin-bottom: 12px;
      border-radius: 999px;
      background: rgba(2,3,10,.54);
      border: 1px solid rgba(255,255,255,.09);
      box-shadow: 0 18px 60px rgba(0,0,0,.28);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      scrollbar-width: none;
    }

    .dsStableTabs::-webkit-scrollbar {
      display: none;
    }

    .dsStableTabs button {
      min-height: 42px;
      flex: 1;
      min-width: 150px;
      border: 0;
      border-radius: 999px;
      color: rgba(248,251,255,.72);
      background: transparent;
      font-size: 13px;
      font-weight: 950;
      cursor: pointer;
    }

    .dsStableTabs button.active {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      box-shadow: 0 12px 34px rgba(53,216,255,.16);
    }

    .dsStablePanel {
      display: none;
      gap: 16px;
      padding: clamp(16px, 2.4vw, 24px);
      border-radius: 32px;
      background:
        radial-gradient(680px circle at 0% 0%, rgba(53,216,255,.09), transparent 44%),
        radial-gradient(620px circle at 100% 0%, rgba(140,107,255,.10), transparent 44%),
        rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 28px 100px rgba(0,0,0,.30);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsStablePanel.active,
    .dsStableSide .dsStablePanel {
      display: grid;
    }

    .dsStablePanelHead {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }

    .dsStablePanelHead h2,
    .dsStableInvite h2,
    .dsStableChat h2 {
      margin: 4px 0 6px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(30px, 4vw, 56px);
      line-height: .92;
      letter-spacing: -.07em;
    }

    .dsStablePanelHead p,
    .dsStableInvite p {
      margin: 0;
      color: rgba(248,251,255,.64);
      line-height: 1.52;
      font-weight: 650;
    }

    .dsStableUrlForm,
    #stableChatForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .dsStableUrlForm input,
    #stableChatForm input {
      min-height: 52px;
      padding: 0 15px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 700;
    }

    .dsStableUrlForm input:disabled,
    .dsStableActions button:disabled {
      opacity: .48;
      cursor: not-allowed;
    }

    .dsStableWatchCard {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px;
      border-radius: 26px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsStableWatchCard small,
    .dsStableSyncBoard small {
      color: rgba(248,251,255,.55);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsStableWatchCard h3 {
      margin: 7px 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 4vw, 44px);
      line-height: .94;
      letter-spacing: -.065em;
    }

    .dsStableWatchCard p {
      max-width: 780px;
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.45;
      font-weight: 650;
      overflow-wrap: anywhere;
    }

    .dsStableWatchCard a.disabled {
      opacity: .44;
      pointer-events: none;
    }

    .dsStableSyncBoard {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .dsStableSyncBoard div {
      min-height: 132px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 6px;
      text-align: center;
      border-radius: 26px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsStableSyncBoard strong,
    .dsStableBigClock {
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(44px, 8vw, 92px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsStableBigClock {
      min-height: 260px;
      display: grid;
      place-items: center;
      border-radius: 30px;
      background:
        radial-gradient(620px circle at 50% 0%, rgba(53,216,255,.13), transparent 54%),
        rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsStableActions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
    }

    .dsStableLiveStage {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: clamp(300px, 52vw, 620px);
      overflow: hidden;
      border-radius: 26px;
      background: #000;
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 22px 80px rgba(0,0,0,.32);
    }

    .dsStableLiveStage video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    #stableLiveEmpty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 8px;
      padding: 26px;
      text-align: center;
      background:
        radial-gradient(620px circle at 50% 0%, rgba(53,216,255,.13), transparent 54%),
        rgba(5,7,17,.88);
    }

    #stableLiveEmpty[hidden] {
      display: none !important;
    }

    #stableLiveEmpty h3 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 5vw, 58px);
      line-height: .92;
      letter-spacing: -.07em;
    }

    #stableLiveEmpty p {
      max-width: 620px;
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.5;
      font-weight: 650;
    }

    .dsStableSide {
      display: grid;
      gap: 18px;
      position: sticky;
      top: 18px;
    }

    .dsStableInvite {
      gap: 12px;
    }

    .dsStableChat {
      min-height: 560px;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    .dsStableMessages {
      min-height: 300px;
      max-height: 540px;
      overflow-y: auto;
      display: grid;
      align-content: start;
      gap: 9px;
      padding: 10px;
      border-radius: 22px;
      background: rgba(2,3,10,.34);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsStableMessage {
      display: grid;
      gap: 3px;
      padding: 11px 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsStableMessage b {
      color: white;
      font-size: 12px;
      font-weight: 950;
    }

    .dsStableMessage span {
      color: rgba(248,251,255,.72);
      line-height: 1.4;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    @media(max-width: 1060px) {
      .dsStableRoomHero,
      .dsStableRoomGrid {
        grid-template-columns: 1fr;
      }

      .dsStableSide {
        position: static;
      }
    }

    @media(max-width: 680px) {
      .dsStableRoom {
        padding: 12px;
      }

      .dsStableRoomMeta,
      .dsStableSyncBoard,
      .dsStableUrlForm,
      #stableChatForm {
        grid-template-columns: 1fr;
      }

      .dsStablePanelHead,
      .dsStableWatchCard {
        display: grid;
      }

      .dsStableActions,
      .dsStableTabs {
        display: grid;
        border-radius: 22px;
      }

      .dsStableTabs button,
      .dsStableActions button,
      .dsStableWatchCard a,
      .dsStableUrlForm button,
      #stableChatForm button,
      .dsStableInvite button {
        width: 100%;
      }

      .dsStableLiveStage {
        min-height: 260px;
      }
    }


    /* ============================================================
       v58 ACCOUNT PAGE FIX
       Adds a safe /account page so Render does not crash.
       ============================================================ */

    .dsAccountPage {
      min-height: 100svh;
      padding: clamp(18px, 4vw, 54px);
      background:
        radial-gradient(900px circle at 10% -10%, rgba(53,216,255,.14), transparent 42%),
        radial-gradient(760px circle at 95% 0%, rgba(140,107,255,.16), transparent 42%),
        linear-gradient(180deg, #050711, #080c18 54%, #050711);
    }

    .dsAccountHero {
      max-width: 1320px;
      margin: 0 auto 18px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: end;
      padding-top: clamp(34px, 7vw, 90px);
    }

    .dsAccountHero h1 {
      margin: 8px 0 10px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(46px, 8vw, 112px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsAccountHero p {
      max-width: 720px;
      margin: 0;
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsAccountActions {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      justify-content: flex-end;
    }

    .dsAccountGrid {
      max-width: 1320px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .dsAccountCard {
      min-height: 220px;
      display: grid;
      align-content: end;
      gap: 8px;
      padding: 18px;
      border-radius: 28px;
      color: white;
      background:
        radial-gradient(440px circle at 0% 0%, rgba(53,216,255,.10), transparent 50%),
        rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 24px 80px rgba(0,0,0,.26);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .dsAccountCard:hover {
      transform: translateY(-4px);
      border-color: rgba(255,255,255,.18);
      background:
        radial-gradient(440px circle at 0% 0%, rgba(140,107,255,.14), transparent 50%),
        rgba(255,255,255,.075);
    }

    .dsAccountCard span {
      color: rgba(248,251,255,.48);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: .08em;
    }

    .dsAccountCard h2 {
      margin: 0;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: 30px;
      line-height: .96;
      letter-spacing: -.06em;
    }

    .dsAccountCard p {
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.42;
      font-weight: 650;
    }

    @media(max-width: 900px) {
      .dsAccountHero {
        grid-template-columns: 1fr;
      }

      .dsAccountActions {
        justify-content: flex-start;
      }

      .dsAccountGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media(max-width: 560px) {
      .dsAccountActions,
      .dsAccountGrid {
        grid-template-columns: 1fr;
        display: grid;
      }

      .dsAccountActions a,
      .dsAccountCard {
        width: 100%;
      }
    }


    /* ============================================================
       v59 MISSING ROUTE FALLBACKS
       Prevents Render crashes from undefined page handlers.
       ============================================================ */

    .dsContinuePage,
    .dsProfilesPage {
      min-height: 100svh;
      padding: clamp(18px, 4vw, 54px);
      background:
        radial-gradient(900px circle at 10% -10%, rgba(53,216,255,.14), transparent 42%),
        radial-gradient(760px circle at 95% 0%, rgba(140,107,255,.16), transparent 42%),
        linear-gradient(180deg, #050711, #080c18 54%, #050711);
    }

    .dsContinueHero,
    .dsProfilesHero {
      max-width: 1320px;
      margin: 0 auto 22px;
      padding-top: clamp(34px, 7vw, 90px);
    }

    .dsContinueHero h1,
    .dsProfilesHero h1 {
      margin: 8px 0 10px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(46px, 8vw, 112px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsContinueHero p,
    .dsProfilesHero p {
      max-width: 720px;
      margin: 0 0 16px;
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsContinueActions {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
    }

    .dsContinueList,
    .dsProfilesGrid {
      max-width: 1320px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 12px;
    }

    .dsContinueCard,
    .dsProfileCard,
    .dsEmptyContinue {
      overflow: hidden;
      border-radius: 24px;
      color: white;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 24px 80px rgba(0,0,0,.25);
    }

    .dsContinueCard img,
    .dsContinueCard .posterFallback {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.08);
    }

    .dsContinueCard div {
      display: grid;
      gap: 4px;
      padding: 12px;
    }

    .dsContinueCard strong,
    .dsProfileCard strong {
      color: white;
      font-weight: 950;
    }

    .dsContinueCard span,
    .dsProfileCard small {
      color: rgba(248,251,255,.56);
      font-size: 12px;
      font-weight: 750;
    }

    .dsEmptyContinue {
      grid-column: 1 / -1;
      padding: 24px;
    }

    .dsEmptyContinue h2 {
      margin: 0 0 8px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: 34px;
      letter-spacing: -.06em;
    }

    .dsEmptyContinue p {
      margin: 0;
      color: rgba(248,251,255,.62);
    }

    .dsProfileCard {
      min-height: 210px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 9px;
      border: 1px solid rgba(255,255,255,.10);
      cursor: pointer;
    }

    .dsProfileCard span {
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      border-radius: 26px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 30px;
      font-weight: 950;
    }

    .dsProfileCreate {
      max-width: 1320px;
      margin: 16px auto 0;
      padding: 18px;
      border-radius: 26px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsProfileCreate h2 {
      margin: 0 0 12px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      letter-spacing: -.05em;
    }

    .dsProfileCreate form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px auto;
      gap: 10px;
    }

    .dsProfileCreate input,
    .dsProfileCreate select {
      min-height: 48px;
      padding: 0 13px;
      border-radius: 14px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
    }

    @media(max-width: 680px) {
      .dsProfileCreate form,
      .dsContinueActions {
        grid-template-columns: 1fr;
        display: grid;
      }
    }


    /* ============================================================
       v60 AUTH PAGE FIX
       Fixes /login and /signup Internal Server Error.
       ============================================================ */

    .dsAuthPageSafe {
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: calc(var(--v-nav, 74px) + 30px) var(--v-left, 4vw) 54px;
      background:
        radial-gradient(900px circle at 16% 0%, rgba(140,107,255,.22), transparent 44%),
        radial-gradient(760px circle at 92% 12%, rgba(53,216,255,.14), transparent 42%),
        linear-gradient(180deg, #050711, #080c18 58%, #050711);
    }

    .dsAuthShellSafe {
      width: min(1120px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 440px);
      gap: 18px;
      align-items: stretch;
    }

    .dsAuthPitch,
    .dsAuthCard {
      border-radius: 34px;
      background:
        radial-gradient(560px circle at 0% 0%, rgba(53,216,255,.10), transparent 48%),
        rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 28px 100px rgba(0,0,0,.32);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsAuthPitch {
      display: grid;
      align-content: end;
      gap: 16px;
      padding: clamp(24px, 4vw, 50px);
      min-height: 560px;
    }

    .dsAuthPitch h1 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(48px, 7vw, 92px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsAuthPitch p,
    .dsAuthCard p {
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsAuthFeatureList {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9px;
      margin-top: 10px;
    }

    .dsAuthFeatureList div {
      min-height: 116px;
      display: grid;
      align-content: center;
      gap: 5px;
      padding: 14px;
      border-radius: 22px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.09);
    }

    .dsAuthFeatureList b {
      color: white;
      font-weight: 950;
    }

    .dsAuthFeatureList span {
      color: rgba(248,251,255,.58);
      font-size: 12px;
      line-height: 1.38;
      font-weight: 700;
    }

    .dsAuthCard {
      padding: clamp(20px, 3vw, 34px);
      display: grid;
      align-content: center;
    }

    .dsAuthSwitch {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      padding: 6px;
      margin-bottom: 18px;
      border-radius: 999px;
      background: rgba(2,3,10,.42);
      border: 1px solid rgba(255,255,255,.08);
    }

    .dsAuthSwitch a {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: rgba(248,251,255,.72);
      font-size: 13px;
      font-weight: 950;
    }

    .dsAuthSwitch a.active {
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
    }

    .dsAuthCard h2 {
      margin: 0 0 8px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: 42px;
      line-height: .95;
      letter-spacing: -.065em;
    }

    .dsSafeAuthForm {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    .dsSafeAuthForm label {
      display: grid;
      gap: 7px;
      color: rgba(248,251,255,.76);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .dsSafeAuthForm input {
      min-height: 50px;
      padding: 0 14px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-size: 15px;
      font-weight: 700;
      text-transform: none;
      letter-spacing: normal;
    }

    .dsAuthFinePrint {
      margin: 16px 0 0 !important;
      font-size: 13px;
    }

    .dsAuthFinePrint a {
      color: white;
      font-weight: 950;
      text-decoration: underline;
      text-decoration-color: rgba(255,255,255,.28);
    }

    @media(max-width: 900px) {
      .dsAuthShellSafe {
        grid-template-columns: 1fr;
      }

      .dsAuthPitch {
        min-height: auto;
      }

      .dsAuthFeatureList {
        grid-template-columns: 1fr;
      }
    }


    /* ============================================================
       v62 COUPLES EDITION
       Long-distance couple targeting: date rooms, couple dashboard,
       shared watch planning, and softer romantic UI accents.
       ============================================================ */

    :root {
      --couple-rose: #ff6ea9;
      --couple-peach: #ffc2a1;
      --couple-lavender: #bda7ff;
    }

    .dsCouplePromiseStrip,
    .dsCoupleHomeBoard,
    .dsCouplesHero,
    .dsCouplesGrid {
      max-width: 1320px;
      margin-left: auto;
      margin-right: auto;
    }

    .dsCouplePromiseStrip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      padding: 0 var(--v-left, 4vw);
      margin-top: -24px;
      margin-bottom: 48px;
      position: relative;
      z-index: 5;
    }

    .dsCouplePromiseStrip article,
    .dsCoupleHomeBoard,
    .dsCoupleCard {
      background:
        radial-gradient(520px circle at 0% 0%, rgba(255,110,169,.14), transparent 46%),
        radial-gradient(480px circle at 100% 0%, rgba(189,167,255,.12), transparent 46%),
        rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 26px 90px rgba(0,0,0,.28);
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsCouplePromiseStrip article {
      min-height: 150px;
      display: grid;
      align-content: center;
      gap: 8px;
      padding: 18px;
      border-radius: 28px;
    }

    .dsCouplePromiseStrip span {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #ffe1ec);
      font-weight: 950;
    }

    .dsCouplePromiseStrip b {
      color: white;
      font-size: 20px;
      letter-spacing: -.04em;
    }

    .dsCouplePromiseStrip p {
      margin: 0;
      color: rgba(248,251,255,.64);
      line-height: 1.45;
      font-weight: 650;
    }

    .dsCoupleHomeBoard {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: center;
      margin-bottom: 22px;
      padding: clamp(18px, 3vw, 32px);
      border-radius: 34px;
    }

    .dsCoupleHomeBoard h2,
    .dsCouplesHero h1,
    .dsCoupleCard h2 {
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      color: white;
      letter-spacing: -.075em;
    }

    .dsCoupleHomeBoard h2 {
      margin: 6px 0 8px;
      font-size: clamp(34px, 5vw, 68px);
      line-height: .92;
    }

    .dsCoupleHomeBoard p {
      max-width: 760px;
      margin: 0;
      color: rgba(248,251,255,.66);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsCoupleHomeActions {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      justify-content: flex-end;
    }

    .dsCoupleHomeCards {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9px;
    }

    .dsCoupleHomeCards article {
      min-height: 86px;
      display: grid;
      align-content: center;
      gap: 4px;
      padding: 14px;
      border-radius: 22px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.09);
    }

    .dsCoupleHomeCards b {
      color: rgba(255,255,255,.42);
      font-size: 12px;
      letter-spacing: .08em;
    }

    .dsCoupleHomeCards span {
      color: white;
      font-weight: 900;
    }

    .dsCouplesPage {
      min-height: 100svh;
      padding: clamp(18px, 4vw, 54px);
      background:
        radial-gradient(900px circle at 10% -10%, rgba(255,110,169,.16), transparent 42%),
        radial-gradient(780px circle at 95% 0%, rgba(189,167,255,.16), transparent 44%),
        linear-gradient(180deg, #050711, #080c18 56%, #050711);
    }

    .dsCouplesHero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: end;
      padding-top: clamp(36px, 7vw, 92px);
      margin-bottom: 18px;
    }

    .dsCouplesHero h1 {
      margin: 8px 0 10px;
      font-size: clamp(54px, 9vw, 126px);
      line-height: .86;
    }

    .dsCouplesHero p {
      max-width: 780px;
      margin: 0;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 650;
    }

    .dsCouplesHeroActions {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      justify-content: flex-end;
    }

    .dsCouplesGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .dsCoupleCard {
      min-height: 320px;
      display: grid;
      align-content: start;
      gap: 13px;
      padding: clamp(18px, 3vw, 30px);
      border-radius: 32px;
    }

    .dsCoupleCard > span {
      color: var(--couple-peach);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .10em;
      text-transform: uppercase;
    }

    .dsCoupleCard h2 {
      margin: 0;
      font-size: clamp(30px, 5vw, 58px);
      line-height: .92;
    }

    .dsCoupleCard p,
    .dsCoupleSavedLine {
      margin: 0;
      color: rgba(248,251,255,.66);
      line-height: 1.5;
      font-weight: 650;
    }

    .dsCoupleCard textarea,
    .dsCoupleCard input {
      width: 100%;
      min-height: 52px;
      padding: 14px;
      border-radius: 18px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font: inherit;
      font-weight: 650;
    }

    .dsCoupleCard textarea {
      min-height: 130px;
      resize: vertical;
    }

    .dsCoupleCard form {
      display: grid;
      gap: 10px;
    }

    .dsCoupleMoodGrid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 9px;
    }

    .dsCoupleMoodGrid a {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-weight: 900;
    }

    .dsCoupleMoodGrid a:hover {
      color: #050711;
      background: linear-gradient(135deg, #fff, #ffe1ec);
    }

    .dsWelcomePagePro,
    .dsHomePage,
    main {
      --v-purple: var(--couple-rose, #ff6ea9);
      --v-blue: var(--couple-lavender, #bda7ff);
    }

    @media(max-width: 920px) {
      .dsCouplePromiseStrip,
      .dsCoupleHomeBoard,
      .dsCouplesHero,
      .dsCouplesGrid {
        grid-template-columns: 1fr;
      }

      .dsCoupleHomeActions,
      .dsCouplesHeroActions {
        justify-content: flex-start;
      }

      .dsCoupleHomeCards {
        grid-template-columns: 1fr;
      }
    }

    @media(max-width: 560px) {
      .dsCouplesHeroActions,
      .dsCoupleHomeActions,
      .dsCoupleMoodGrid {
        display: grid;
        grid-template-columns: 1fr;
      }

      .dsCouplesHeroActions a,
      .dsCoupleHomeActions a {
        width: 100%;
      }
    }


    /* ============================================================
       v63 COUPLES+ PAID-WORTHY FEATURES
       Dual ready check, mood match, timed love notes, live reactions,
       and shared date jar.
       ============================================================ */

    .dsCouplesPlusGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .dsCouplesPlusTool {
      position: relative;
      overflow: hidden;
      min-height: 250px;
      display: grid;
      align-content: start;
      gap: 10px;
      padding: 18px;
      border-radius: 26px;
      background:
        radial-gradient(460px circle at 0% 0%, rgba(255,110,169,.13), transparent 48%),
        radial-gradient(420px circle at 100% 0%, rgba(189,167,255,.12), transparent 48%),
        rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.11);
      box-shadow: 0 24px 80px rgba(0,0,0,.24);
    }

    .dsCouplesPlusTool > span {
      color: var(--couple-peach, #ffc2a1);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .10em;
      text-transform: uppercase;
    }

    .dsCouplesPlusTool h3 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(26px, 4vw, 42px);
      line-height: .94;
      letter-spacing: -.065em;
    }

    .dsCouplesPlusTool p {
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.45;
      font-weight: 650;
    }

    .dsMiniState {
      min-height: 46px;
      display: grid;
      gap: 5px;
      align-content: center;
      padding: 10px 12px;
      border-radius: 16px;
      color: rgba(248,251,255,.78);
      background: rgba(2,3,10,.30);
      border: 1px solid rgba(255,255,255,.08);
      font-size: 13px;
      line-height: 1.35;
      font-weight: 750;
    }

    .dsMiniState div {
      overflow-wrap: anywhere;
    }

    .dsMoodButtons,
    .dsReactionButtons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .dsMoodButtons button,
    .dsReactionButtons button {
      min-height: 40px;
      padding: 0 12px;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 999px;
      color: white;
      background: rgba(255,255,255,.075);
      font-weight: 900;
      cursor: pointer;
    }

    .dsReactionButtons button {
      width: 46px;
      padding: 0;
      font-size: 20px;
    }

    .dsMoodButtons button:hover,
    .dsReactionButtons button:hover {
      color: #050711;
      background: linear-gradient(135deg, #fff, #ffe1ec);
      border-color: transparent;
    }

    .dsCoupleInlineForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: center;
    }

    .dsCoupleInlineForm input,
    .dsCoupleInlineForm select {
      min-height: 44px;
      padding: 0 12px;
      border-radius: 14px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 700;
    }

    .dsDateJarTool {
      grid-column: span 1;
    }

    .dsCoupleFloatingLayer {
      pointer-events: none;
      position: fixed;
      inset: 0;
      z-index: 100;
      overflow: hidden;
    }

    .dsFloatReaction {
      position: absolute;
      bottom: 12vh;
      display: grid;
      justify-items: center;
      gap: 2px;
      animation: dsReactionFloat 3.6s ease forwards;
      filter: drop-shadow(0 14px 30px rgba(0,0,0,.4));
    }

    .dsFloatReaction b {
      font-size: clamp(38px, 7vw, 76px);
      line-height: 1;
    }

    .dsFloatReaction span {
      padding: 4px 9px;
      border-radius: 999px;
      color: white;
      background: rgba(2,3,10,.54);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 11px;
      font-weight: 900;
    }

    .dsCouplePopup {
      position: fixed;
      left: 50%;
      top: 16%;
      width: min(520px, calc(100vw - 28px));
      transform: translateX(-50%);
      display: grid;
      gap: 8px;
      padding: 18px;
      border-radius: 28px;
      color: white;
      background:
        radial-gradient(500px circle at 0% 0%, rgba(255,110,169,.25), transparent 56%),
        rgba(7,9,18,.88);
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 30px 120px rgba(0,0,0,.52);
      backdrop-filter: blur(20px) saturate(1.1);
      -webkit-backdrop-filter: blur(20px) saturate(1.1);
      animation: dsLoveNotePop 6.5s ease forwards;
    }

    .dsCouplePopup span {
      color: var(--couple-peach, #ffc2a1);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .10em;
      text-transform: uppercase;
    }

    .dsCouplePopup b {
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(24px, 4vw, 40px);
      line-height: 1.04;
      letter-spacing: -.05em;
    }

    @keyframes dsReactionFloat {
      0% { opacity: 0; transform: translateY(40px) scale(.7) rotate(-4deg); }
      12% { opacity: 1; transform: translateY(0) scale(1) rotate(2deg); }
      100% { opacity: 0; transform: translateY(-220px) scale(1.28) rotate(8deg); }
    }

    @keyframes dsLoveNotePop {
      0% { opacity: 0; transform: translate(-50%, -18px) scale(.96); }
      10%, 82% { opacity: 1; transform: translate(-50%, 0) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -14px) scale(.97); }
    }

    .dsCouplesPlusSell {
      background:
        radial-gradient(580px circle at 0% 0%, rgba(255,110,169,.20), transparent 52%),
        radial-gradient(520px circle at 100% 0%, rgba(255,194,161,.12), transparent 52%),
        rgba(255,255,255,.075);
    }

    .dsCoupleRitualCard ul {
      margin: 0;
      padding-left: 18px;
      color: rgba(248,251,255,.72);
      line-height: 1.65;
      font-weight: 700;
    }

    @media(max-width: 820px) {
      .dsCouplesPlusGrid,
      .dsCoupleInlineForm {
        grid-template-columns: 1fr;
      }

      .dsCoupleInlineForm button,
      .dsCoupleInlineForm select {
        width: 100%;
      }
    }


    /* ============================================================
       v64 COUPLES PREMIUM PACK
       Adds Taste Match, Date Generator, Missing You Mode,
       Streaks, Timeline, Pause for Us, Date Room Themes,
       Couple Badges, and Sleepy Mode.
       ============================================================ */

    .dsStableRoom[data-couple-theme="cozy"] {
      background:
        radial-gradient(900px circle at 10% -10%, rgba(255,194,161,.22), transparent 44%),
        radial-gradient(800px circle at 90% 0%, rgba(255,110,169,.14), transparent 44%),
        linear-gradient(180deg, #10090b, #150f16 58%, #070409) !important;
    }

    .dsStableRoom[data-couple-theme="rainy"] {
      background:
        radial-gradient(900px circle at 10% -10%, rgba(120,180,255,.16), transparent 44%),
        radial-gradient(800px circle at 90% 0%, rgba(189,167,255,.12), transparent 44%),
        linear-gradient(180deg, #050711, #07101b 58%, #03050b) !important;
    }

    .dsStableRoom[data-couple-theme="valentine"] {
      background:
        radial-gradient(900px circle at 10% -10%, rgba(255,110,169,.30), transparent 44%),
        radial-gradient(800px circle at 90% 0%, rgba(255,194,161,.18), transparent 44%),
        linear-gradient(180deg, #100611, #170817 58%, #060207) !important;
    }

    .dsStableRoom[data-couple-theme="theater"] {
      background:
        radial-gradient(900px circle at 50% -10%, rgba(255,224,138,.16), transparent 42%),
        linear-gradient(180deg, #030207, #09030a 58%, #000) !important;
    }

    .dsStableRoom.isMissingYou::before {
      content: "♡";
      position: fixed;
      right: 6vw;
      top: 16vh;
      z-index: 0;
      color: rgba(255,110,169,.13);
      font-size: min(26vw, 280px);
      pointer-events: none;
      animation: dsMissingPulse 4s ease-in-out infinite;
    }

    .dsStableRoom.isSleepyMode {
      filter: saturate(.82) brightness(.88);
    }

    .dsStableRoom.isSleepyMode .dsStablePanel,
    .dsStableRoom.isSleepyMode .dsStableTabs,
    .dsStableRoom.isSleepyMode .dsStableRoomMeta {
      background: rgba(255,255,255,.045) !important;
      box-shadow: 0 18px 70px rgba(0,0,0,.38) !important;
    }

    .dsMissingYouAmbient {
      position: fixed;
      inset: auto 0 22px 0;
      z-index: 80;
      text-align: center;
      color: rgba(255,194,161,.62);
      font-size: 30px;
      letter-spacing: 20px;
      pointer-events: none;
      animation: dsAmbientFloat 5s ease-in-out infinite;
    }

    .dsPauseForUsBanner {
      max-width: 1560px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 18px;
      border-radius: 22px;
      color: white;
      background:
        radial-gradient(500px circle at 0% 0%, rgba(255,110,169,.18), transparent 54%),
        rgba(8,10,20,.82);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 18px 70px rgba(0,0,0,.34);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .dsPauseForUsBanner[hidden],
    .dsMissingYouAmbient[hidden] {
      display: none !important;
    }

    .dsPauseForUsBanner b {
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: 22px;
      letter-spacing: -.05em;
    }

    .dsTasteButtons,
    .dsThemeButtons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .dsTasteButtons button,
    .dsThemeButtons button {
      min-height: 40px;
      padding: 0 12px;
      border-radius: 999px;
      color: rgba(248,251,255,.82);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-weight: 900;
      cursor: pointer;
    }

    .dsTasteButtons button:hover,
    .dsTasteButtons button.isSelected,
    .dsThemeButtons button:hover {
      color: #050711;
      background: linear-gradient(135deg, #fff, #ffe1ec);
      border-color: transparent;
    }

    .dsBadgeList {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 42px;
    }

    .dsBadgeList span {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #ffe1ec);
      font-size: 12px;
      font-weight: 950;
    }

    .dsTimelineTool {
      grid-column: 1 / -1;
    }

    @keyframes dsMissingPulse {
      0%, 100% { transform: scale(.96) rotate(-6deg); opacity: .48; }
      50% { transform: scale(1.05) rotate(5deg); opacity: .82; }
    }

    @keyframes dsAmbientFloat {
      0%, 100% { transform: translateY(0); opacity: .5; }
      50% { transform: translateY(-10px); opacity: .9; }
    }

    @media(max-width: 820px) {
      .dsTimelineTool {
        grid-column: auto;
      }

      .dsPauseForUsBanner {
        display: grid;
        text-align: center;
      }
    }


    /* ============================================================
       v65 PLACEHOLDER MOVIE PROVIDER
       Movie button uses temporary ORG MP4 trailer/preview stream.
       ============================================================ */

    .dsDirectVideoShell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: clamp(320px, 64vw, 760px);
      display: grid;
      overflow: hidden;
      background: #000;
      border-radius: inherit;
    }

    .dsDirectMovieVideo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
      outline: 0;
    }

    .dsDirectVideoMeta {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 18px;
      z-index: 3;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 18px;
      color: white;
      background: linear-gradient(90deg, rgba(2,3,10,.74), rgba(2,3,10,.28));
      border: 1px solid rgba(255,255,255,.10);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: none;
    }

    .dsDirectVideoMeta span {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      padding: 0 9px;
      border-radius: 999px;
      color: #050711;
      background: linear-gradient(135deg, #fff, #dff8ff);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .06em;
    }

    .dsDirectVideoMeta strong {
      font-weight: 950;
    }

    .dsDirectVideoMeta small {
      color: rgba(248,251,255,.64);
      font-weight: 650;
    }

    .dsMovieEmbedNotice.error {
      border-color: rgba(255,110,169,.28);
      background:
        radial-gradient(520px circle at 0% 0%, rgba(255,110,169,.16), transparent 52%),
        rgba(255,255,255,.07);
    }

    @media(max-width: 720px) {
      .dsDirectVideoMeta {
        display: grid;
        left: 10px;
        right: 10px;
        bottom: 10px;
      }
    }


    /* ============================================================
       v66 PROXYVIDEO EMBED
       Movie button embeds the proxyVideo URL returned by movie API.
       ============================================================ */

    .dsProxyVideoShell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: clamp(320px, 64vw, 760px);
      overflow: hidden;
      border-radius: inherit;
      background: #000;
    }

    .dsProxyVideoFrame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }


    /* ============================================================
       v68 PROXYVIDEO RETRY + DOMAIN FALLBACK
       Shows clear proxyVideo failure instead of silently old-embedding.
       ============================================================ */

    .dsProxyVideoFail {
      padding: clamp(22px, 4vw, 48px);
      display: grid;
      align-content: center;
      justify-items: start;
      gap: 12px;
      min-height: clamp(320px, 56vw, 680px);
      border-radius: inherit;
      background:
        radial-gradient(760px circle at 0% 0%, rgba(255,110,169,.14), transparent 46%),
        rgba(255,255,255,.045);
    }

    .dsProxyVideoFail h2 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(34px, 6vw, 76px);
      line-height: .9;
      letter-spacing: -.08em;
    }

    .dsProxyVideoFail p {
      max-width: 760px;
      margin: 0;
      color: rgba(248,251,255,.72);
      line-height: 1.5;
      font-weight: 700;
    }

    .dsProxyVideoFail small {
      max-width: 100%;
      color: rgba(248,251,255,.48);
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }


    /* ============================================================
       v69 CLIENT-SIDE PROXYVIDEO WAIT
       Watch page loads instantly, then keeps trying until proxyVideo returns.
       ============================================================ */

    .dsProxyVideoWaitingShell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: clamp(320px, 64vw, 760px);
      overflow: hidden;
      border-radius: inherit;
      background:
        radial-gradient(760px circle at 20% 0%, rgba(255,110,169,.16), transparent 48%),
        radial-gradient(700px circle at 80% 0%, rgba(53,216,255,.12), transparent 46%),
        #02030a;
    }

    .dsProxyVideoWaitingCard {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 14px;
      padding: clamp(22px, 4vw, 56px);
      text-align: center;
      transition: opacity .3s ease, transform .3s ease;
    }

    .dsProxyVideoWaitingShell.isReady .dsProxyVideoWaitingCard {
      opacity: 0;
      pointer-events: none;
      transform: scale(.98);
    }

    .dsProxyLoader {
      width: 72px;
      height: 72px;
      border-radius: 999px;
      border: 5px solid rgba(255,255,255,.12);
      border-top-color: #fff;
      animation: dsProxySpin 1s linear infinite;
      box-shadow: 0 0 40px rgba(255,110,169,.25);
    }

    .dsProxyVideoWaitingCard span {
      color: var(--couple-peach, #ffc2a1);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .dsProxyVideoWaitingCard h2 {
      max-width: 760px;
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(38px, 7vw, 88px);
      line-height: .88;
      letter-spacing: -.085em;
    }

    .dsProxyVideoWaitingCard p {
      max-width: 640px;
      margin: 0;
      color: rgba(248,251,255,.68);
      line-height: 1.55;
      font-weight: 700;
    }

    .dsProxyVideoWaitStatus {
      max-width: min(760px, 100%);
      min-height: 44px;
      display: inline-grid;
      place-items: center;
      padding: 10px 14px;
      border-radius: 999px;
      color: rgba(248,251,255,.78);
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.10);
      font-size: 13px;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .dsProxyVideoWaitingShell.hasError .dsProxyVideoWaitStatus {
      color: #fff;
      background: rgba(255,110,169,.14);
      border-color: rgba(255,110,169,.28);
    }

    .dsProxyVideoWaitingShell .dsProxyVideoFrame {
      z-index: 1;
    }

    .dsProxyVideoWaitingShell.isReady .dsProxyVideoFrame {
      z-index: 5;
    }

    @keyframes dsProxySpin {
      to { transform: rotate(360deg); }
    }


    /* ============================================================
       v70 DATE ROOM MOVIE SYNC
       Host selects a TMDB movie and everyone embeds proxyVideo together.
       ============================================================ */

    .dsRoomMovieForm {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .dsRoomMovieForm input {
      min-height: 52px;
      padding: 0 15px;
      border-radius: 16px;
      color: white;
      background: rgba(255,255,255,.075);
      border: 1px solid rgba(255,255,255,.12);
      outline: 0;
      font-weight: 750;
    }

    .dsRoomMovieForm input:disabled,
    .dsRoomMovieForm button:disabled {
      opacity: .48;
      cursor: not-allowed;
    }

    .dsRoomMovieStatusCard {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
      gap: 12px;
      align-items: stretch;
    }

    .dsRoomMovieStatusCard > div {
      padding: 18px;
      border-radius: 24px;
      background: rgba(255,255,255,.065);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsRoomMovieStatusCard small,
    .dsRoomMovieCountdown small {
      display: block;
      margin-bottom: 7px;
      color: rgba(248,251,255,.55);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .dsRoomMovieStatusCard h3 {
      margin: 0 0 7px;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 4vw, 48px);
      line-height: .94;
      letter-spacing: -.065em;
    }

    .dsRoomMovieStatusCard p {
      margin: 0;
      color: rgba(248,251,255,.64);
      line-height: 1.45;
      font-weight: 650;
      overflow-wrap: anywhere;
    }

    .dsRoomMovieCountdown {
      display: grid;
      place-items: center;
      align-content: center;
      text-align: center;
    }

    .dsRoomMovieCountdown strong {
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(30px, 5vw, 58px);
      line-height: .9;
      letter-spacing: -.075em;
    }

    .dsRoomMovieStage {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: clamp(300px, 52vw, 620px);
      overflow: hidden;
      border-radius: 26px;
      background: #000;
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 22px 80px rgba(0,0,0,.32);
    }

    .dsRoomMovieFrame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }

    .dsRoomMovieFrame[hidden],
    .dsRoomMovieEmpty[hidden] {
      display: none !important;
    }

    .dsRoomMovieEmpty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 12px;
      padding: 26px;
      text-align: center;
      background:
        radial-gradient(620px circle at 50% 0%, rgba(255,110,169,.13), transparent 54%),
        rgba(5,7,17,.88);
    }

    .dsRoomMovieEmpty h3 {
      margin: 0;
      color: white;
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: clamp(28px, 5vw, 58px);
      line-height: .92;
      letter-spacing: -.07em;
    }

    .dsRoomMovieEmpty p {
      max-width: 640px;
      margin: 0;
      color: rgba(248,251,255,.62);
      line-height: 1.5;
      font-weight: 650;
    }

    @media(max-width: 720px) {
      .dsRoomMovieForm,
      .dsRoomMovieStatusCard {
        grid-template-columns: 1fr;
      }

      .dsRoomMovieForm button,
      #stableRoomMoviePanel .dsStableActions button {
        width: 100%;
      }
    }


    /* ============================================================
       v71 ROOM MOVIE SYNC ENGINE
       Server timer + host controls + 5-second drift correction for native video.
       ============================================================ */

    .dsRoomMovieStatusCard {
      grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) minmax(160px, 220px);
    }

    .dsRoomMovieTarget strong {
      color: #ffe1ec;
    }

    .dsRoomSyncControls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border-radius: 22px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
    }

    .dsRoomSyncControls small {
      color: var(--couple-peach, #ffc2a1);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .10em;
      text-transform: uppercase;
    }

    .dsRoomSyncControls p {
      margin: 5px 0 0;
      color: rgba(248,251,255,.62);
      line-height: 1.45;
      font-weight: 650;
    }

    #roomMovieVideo {
      object-fit: contain;
      background: #000;
    }

    @media(max-width: 860px) {
      .dsRoomMovieStatusCard,
      .dsRoomSyncControls {
        grid-template-columns: 1fr;
      }
    }


    /* ============================================================
       v72 DATE ROOM BUTTON FIX
       Recovery controller if the main Socket.IO room script fails.
       ============================================================ */

    .dsStablePanel.active {
      display: grid !important;
    }

    .dsStableTabs button {
      touch-action: manipulation;
    }

    .dsRoomMovieStatusCard,
    .dsRoomSyncControls,
    .dsStableActions button,
    .dsStableTabs button {
      -webkit-tap-highlight-color: transparent;
    }


    /* ============================================================
       v73 DATE ROOM POLLING FALLBACK
       If Socket.IO stays on Joining..., REST polling takes over.
       ============================================================ */

    .dsStablePanel.active {
      display: grid !important;
    }


    /* ============================================================
       v75 SYNC REGEX + SCRIPT FIX
       Removes remaining Date Room regex crash and adds iframe sync target overlay.
       ============================================================ */

    .dsIframeSyncOverlay {
      position: absolute;
      right: 14px;
      top: 14px;
      z-index: 8;
      display: grid;
      gap: 3px;
      min-width: 136px;
      max-width: min(280px, calc(100% - 28px));
      padding: 10px 12px;
      border-radius: 18px;
      color: white;
      background: rgba(2,3,10,.72);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 18px 60px rgba(0,0,0,.36);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      pointer-events: none;
    }

    .dsIframeSyncOverlay[hidden] {
      display: none !important;
    }

    .dsIframeSyncOverlay span {
      color: rgba(248,251,255,.55);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .10em;
      text-transform: uppercase;
    }

    .dsIframeSyncOverlay b {
      font-family: "Space Grotesk", Inter, Arial, sans-serif;
      font-size: 30px;
      line-height: .95;
      letter-spacing: -.06em;
    }

    .dsIframeSyncOverlay small {
      color: rgba(248,251,255,.62);
      font-size: 11px;
      line-height: 1.35;
      font-weight: 650;
    }

    @media(max-width: 640px) {
      .dsIframeSyncOverlay {
        left: 10px;
        right: 10px;
        top: 10px;
        max-width: none;
      }
    }


    /* ============================================================
       v76 VIDEO-FIRST ROOM SYNC
       Tries proxyVideo as a native video even when URL has no extension.
       This allows true currentTime drift correction when the proxy URL is a stream.
       ============================================================ */
    .dsRoomMovieFrame#roomMovieVideo {
      background: #000;
      object-fit: contain;
    }

  </style>

    <script>
      window.syncWatchButtons = window.syncWatchButtons || function syncWatchButtons() {
        try {
          document.querySelectorAll("[data-watch-mode]").forEach(function(button) {
            if (button.__swiflyWatchModeBound) return;
            button.__swiflyWatchModeBound = true;
            button.addEventListener("click", function() {
              var mode = button.getAttribute("data-watch-mode") || "";
              var id = button.getAttribute("data-id") || button.getAttribute("data-tmdb-id") || "";
              var type = button.getAttribute("data-type") || "movie";
              if (id && mode) {
                location.href = "/watch/" + type + "/" + encodeURIComponent(id) + "?mode=" + encodeURIComponent(mode);
              }
            });
          });
        } catch (error) {
          console.warn("syncWatchButtons fallback failed", error);
        }
      };
    </script>


    <script>
      window.__swiflyDateRoomErrors = [];
      window.addEventListener("error", function(event) {
        try {
          window.__swiflyDateRoomErrors.push({
            message: event.message || "",
            source: event.filename || "",
            line: event.lineno || 0,
            col: event.colno || 0
          });
        } catch {}
      });
    </script>

</head>
<body>

  <script>
    (function swiflytvAuthRequired(){
      try {
        [
          "session",
          "accounts",
          "profiles",
          "activeProfile",
          "continueWatching",
          "myList",
          "liked"
        ].forEach(function(key) {
          var oldKey = "dropstream." + key;
          var newKey = "swiflytv." + key;
          if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, localStorage.getItem(oldKey));
          }
        });
      } catch {}

      const freePaths = new Set(["/welcome", "/login", "/signup"]);
      const path = window.location.pathname;
      const isFree = freePaths.has(path);
      const session = localStorage.getItem("swiflytv.session");

      if (!session && !isFree) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        window.location.replace("/welcome?redirect=" + redirect);
        return;
      }

      if (session && (path === "/welcome" || path === "/login" || path === "/signup")) {
        const redirect = new URLSearchParams(window.location.search).get("redirect");
        window.location.replace(redirect || "/profiles");
      }
    })();
  </script>

  <header class="topbar netflixTopbar">
    <div class="container nav netflixNav">
      <div class="navLeftCluster">
        <a class="brand netflixBrand" href="/">
          <span class="netflixWordmark">${escapeHtml(BRAND_WORDMARK)}</span>
        </a>

        <nav class="navLinks netflixLinks">
          ${navLink("/", "Tonight", "home", active)}
          ${navLink("/tv", "Shows", "tv", active)}
          ${navLink("/movies", "Movies", "movies", active)}
          ${navLink("/trending", "Date Picks", "trending", active)}
          ${navLink("/my-list", "Our List", "watchlist", active)}
          ${navLink("/liked", "Hearts", "liked", active)}
          ${navLink("/couples", "Couples", "couples", active)}
          ${navLink("/watchrooms", "Date Rooms", "watchrooms", active)}
          ${navLink("/browse-by-languages", "Browse by Languages", "genres", active)}
        </nav>
      </div>

      <div class="navRightCluster dsNavActions">
        <form class="dsNavSearch" action="/search" method="get" role="search">
          <span aria-hidden="true">⌕</span>
          <input name="q" placeholder="Search" autocomplete="off" />
          <button type="submit">Go</button>
        </form>

        <a class="dsNavChip dsKidsPill" href="/kids">
          <span>Kids</span>
        </a>

        <a class="dsNavIcon dsNotify" href="/trending" aria-label="New and popular">
          <span aria-hidden="true">◌</span>
          <i aria-hidden="true"></i>
        </a>

        <details class="dsProfileMenu">
          <summary aria-label="Open profile menu">
            <span class="profilePill" aria-hidden="true"></span>
            <span class="caretTiny" aria-hidden="true">▾</span>
          </summary>
          <div class="dsProfileDropdown">
            <a href="/profiles"><span>☺</span><b>Profiles</b></a>
            <a href="/account"><span>⚙</span><b>Account</b></a>
            <a href="/watchrooms"><span>◎</span><b>Watchrooms</b></a>
            <a href="/continue-watching"><span>▶</span><b>Continue Watching</b></a>
            <a href="/my-list"><span>＋</span><b>My List</b></a>
            <a href="/liked"><span>♡</span><b>Liked</b></a>
            <a href="/kids"><span>★</span><b>Kids</b></a>
            <a href="/search"><span>⌕</span><b>Search</b></a>
          </div>
        </details>
      </div>

      <form class="searchForm mobileSearchForm" action="/search" method="get">
        <input name="q" placeholder="Search movies, shows, actors..." autocomplete="off" />
        <button type="submit">⌕</button>
      </form>
    </div>
  </header>

  ${body}

  <nav class="mobileNav">
    ${navLink("/", "Tonight", "home", active)}
    ${navLink("/watchrooms", "Date", "watchrooms", active)}
    ${navLink("/movies", "Movies", "movies", active)}
    ${navLink("/tv", "TV", "tv", active)}
    ${navLink("/search", "Search", "search", active)}
    ${navLink("/my-list", "Ours", "watchlist", active)}
  </nav>

  <div class="controlDock">
    <button id="controlToggle" class="controlButton" type="button">✦</button>
  </div>

  <section id="controlPanel" class="controlPanel">
    <h3>Style Studio</h3>
    <p>Small visual controls. Your choices save in this browser.</p>
    <div class="themeGrid">
      <button data-theme="default">Purple</button>
      <button data-theme="red">Red</button>
      <button data-theme="blue">Blue</button>
      <button data-theme="green">Green</button>
      <button data-theme="mono">Mono</button>
      <button id="motionToggle" type="button">Motion</button>
    </div>
  </section>

  <footer class="footer">
    <div class="container footerGrid">
      <div>
        <strong>${escapeHtml(SITE_NAME)}</strong><br />
        Movie, TV, cast, poster, backdrop, trailer, and metadata comes from TMDB. This website does not host movies or provide streams.
      </div>
      <div class="footerLinks">
        <a href="/api/status">API status</a>
        <a href="/genres">Genres</a>
        <button type="button" id="clearWatchlist">Clear watchlist</button>
      </div>
    </div>
  </footer>

  <div id="toast" class="toast"></div>

  <script>
    const toast = document.getElementById("toast");

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
    }

    function readLibrary(key) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function saveLibrary(key, list) {
      localStorage.setItem(key, JSON.stringify(list.slice(0, 300)));
      syncLibraryButtons();
      renderSavedGrid("watchlistGrid", "movieverse.watchlist", "watchlist");
      renderSavedGrid("likedGrid", "movieverse.liked", "liked");
    }

    function readWatchlist() {
      return readLibrary("movieverse.watchlist");
    }

    function saveWatchlist(list) {
      saveLibrary("movieverse.watchlist", list);
    }

    function readLiked() {
      return readLibrary("movieverse.liked");
    }

    function saveLiked(list) {
      saveLibrary("movieverse.liked", list);
    }

    function watchKey(type, id) {
      return type + ":" + id;
    }

    function itemFromDataset(button, prefix) {
      const type = button.dataset[prefix + "Type"] || "movie";
      const id = String(button.dataset[prefix + "Id"] || "");
      return {
        key: watchKey(type, id),
        type,
        id,
        title: button.dataset[prefix + "Title"] || "Untitled",
        poster: button.dataset[prefix + "Poster"] || "",
        backdrop: button.dataset[prefix + "Backdrop"] || "",
        rating: button.dataset[prefix + "Rating"] || "",
        year: button.dataset[prefix + "Year"] || "",
        savedAt: new Date().toISOString()
      };
    }

    function syncLibraryButtons() {
      const watchlist = readWatchlist();
      const liked = readLiked();
      const savedWatch = new Set(watchlist.map((item) => item.key));
      const savedLiked = new Set(liked.map((item) => item.key));

      document.querySelectorAll("[data-watch-id]").forEach((button) => {
        const key = watchKey(button.dataset.watchType || "movie", button.dataset.watchId);
        const isSaved = savedWatch.has(key);
        button.classList.toggle("saved", isSaved);
        button.setAttribute("aria-pressed", isSaved ? "true" : "false");
        button.textContent = isSaved ? "✓" : (button.dataset.long === "true" ? "Save to My List" : "+");
        button.title = isSaved ? "Remove from My List" : "Add to My List";
      });

      document.querySelectorAll("[data-like-id]").forEach((button) => {
        const key = watchKey(button.dataset.likeType || "movie", button.dataset.likeId);
        const isLiked = savedLiked.has(key);
        button.classList.toggle("liked", isLiked);
        button.setAttribute("aria-pressed", isLiked ? "true" : "false");
        button.textContent = isLiked ? "♥" : "♡";
        button.title = isLiked ? "Remove from Liked" : "Like this";
      });
    }

    function toggleLibraryItem(keyName, item, addedMessage, removedMessage) {
      const list = readLibrary(keyName);
      const existing = list.findIndex((entry) => entry.key === item.key);

      if (existing >= 0) {
        list.splice(existing, 1);
        saveLibrary(keyName, list);
        showToast(removedMessage);
        return false;
      }

      list.unshift(item);
      saveLibrary(keyName, list);
      showToast(addedMessage);
      return true;
    }

    document.addEventListener("click", (event) => {
      const watchButton = event.target.closest("[data-watch-id]");
      if (watchButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleLibraryItem(
          "movieverse.watchlist",
          itemFromDataset(watchButton, "watch"),
          "Added to My List",
          "Removed from My List"
        );
        return;
      }

      const likeButton = event.target.closest("[data-like-id]");
      if (likeButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleLibraryItem(
          "movieverse.liked",
          itemFromDataset(likeButton, "like"),
          "Added to Liked",
          "Removed from Liked"
        );
      }
    });

    function escapeSaved(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function renderSavedGrid(rootId, storageKey, kind) {
      const root = document.getElementById(rootId);
      if (!root) return;

      const list = readLibrary(storageKey);
      if (!list.length) {
        const title = kind === "liked" ? "No liked titles yet" : "Your list is empty";
        const sub = kind === "liked" ? "Tap the heart on any title to save favorites here." : "Tap + on any title to add it to My List.";
        root.innerHTML = '<div class="watchlistEmptyNetflix"><div><strong>' + title + '</strong><span>' + sub + '</span></div></div>';
        return;
      }

      root.innerHTML = list.map((item) => {
        const poster = item.backdrop ? "https://image.tmdb.org/t/p/w780" + item.backdrop : (item.poster ? "https://image.tmdb.org/t/p/w500" + item.poster : "");
        const href = "/" + item.type + "/" + item.id;
        const title = escapeSaved(item.title || "Untitled");
        const removeAttr = kind === "liked" ? "like" : "watch";
        const removeSymbol = kind === "liked" ? "♥" : "✓";
        const removeClass = kind === "liked" ? "liked" : "saved";
        return '<article class="movieCard dsCard">' +
          '<a href="' + href + '" class="posterWrap dsThumb">' +
            (poster ? '<img src="' + poster + '" alt="' + title + ' thumbnail" loading="lazy" />' : '<div class="posterFallback"><span>' + title.slice(0,1) + '</span></div>') +
            '<div class="dsCardOverlay">' +
              '<div class="dsCardControls">' +
                '<span class="dsPlayDot">▶</span>' +
                '<button class="dsMiniBtn ' + removeClass + '" data-' + removeAttr + '-id="' + escapeSaved(item.id) + '" data-' + removeAttr + '-type="' + escapeSaved(item.type) + '" data-' + removeAttr + '-title="' + title + '" data-' + removeAttr + '-poster="' + escapeSaved(item.poster || "") + '" data-' + removeAttr + '-backdrop="' + escapeSaved(item.backdrop || "") + '" data-' + removeAttr + '-rating="' + escapeSaved(item.rating || "") + '" data-' + removeAttr + '-year="' + escapeSaved(item.year || "") + '" type="button">' + removeSymbol + '</button>' +
              '</div>' +
              '<div class="dsCardTitle">' + title + '</div>' +
              '<div class="dsCardMeta"><b>' + (kind === "liked" ? "Liked" : "My List") + '</b><span>' + escapeSaved(item.year || "—") + '</span><span>' + (item.type === "tv" ? "TV" : "Movie") + '</span></div>' +
            '</div>' +
          '</a>' +
        '</article>';
      }).join("");
    }

    document.getElementById("clearWatchlist")?.addEventListener("click", () => {
      if (!confirm("Clear your saved watchlist in this browser?")) return;
      saveWatchlist([]);
      showToast("My List cleared");
    });

    renderSavedGrid("watchlistGrid", "movieverse.watchlist", "watchlist");
    renderSavedGrid("likedGrid", "movieverse.liked", "liked");

    const panel = document.getElementById("controlPanel");
    document.getElementById("controlToggle")?.addEventListener("click", () => {
      panel?.classList.toggle("open");
    });

    function applyTheme(theme) {
      document.body.classList.remove("theme-red", "theme-blue", "theme-green", "theme-mono");
      if (theme && theme !== "default") document.body.classList.add("theme-" + theme);
      localStorage.setItem("movieverse.theme", theme || "default");
    }

    document.querySelectorAll("[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.theme);
        showToast("Theme changed");
      });
    });

    document.getElementById("motionToggle")?.addEventListener("click", () => {
      const next = !document.body.classList.contains("reduceMotion");
      document.body.classList.toggle("reduceMotion", next);
      localStorage.setItem("movieverse.reduceMotion", next ? "on" : "off");
      showToast(next ? "Motion reduced" : "Motion enabled");
    });

    applyTheme(localStorage.getItem("movieverse.theme") || "default");
    document.body.classList.toggle("reduceMotion", localStorage.getItem("movieverse.reduceMotion") === "on");

    if (typeof syncWatchButtons === "function") syncWatchButtons();
    renderWatchlistPage();
  </script>


  <script>
    (function swiflytvV15(){
      const topbar = document.querySelector('.topbar, .netflixTopbar');
      function updateTopbar(){
        if (!topbar) return;
        topbar.classList.toggle('isScrolled', window.scrollY > 24);
      }
      window.addEventListener('scroll', updateTopbar, { passive: true });
      updateTopbar();

      function fitTitles(){
        document.querySelectorAll('.dsHeroContent h1, .dsDetailHeroContent h1').forEach((el) => {
          const text = (el.textContent || '').trim();
          el.style.fontSize = '';
          if (text.length > 20) el.style.fontSize = 'clamp(38px, 5vw, 76px)';
          if (text.length > 32) el.style.fontSize = 'clamp(32px, 4.25vw, 62px)';
        });
      }
      fitTitles();
      window.addEventListener('resize', fitTitles, { passive: true });

      document.querySelectorAll('.dsRow').forEach((section) => {
        const rail = section.querySelector('.movieRail, .dsRail, .nfTopTenRail');
        if (!rail || section.querySelector('.dsRowControls')) return;

        const controls = document.createElement('div');
        controls.className = 'dsRowControls';
        controls.innerHTML = '<button class="dsRowBtn" type="button" aria-label="Scroll row left">‹</button><button class="dsRowBtn" type="button" aria-label="Scroll row right">›</button>';
        section.appendChild(controls);

        const progress = document.createElement('div');
        progress.className = 'dsProgress';
        progress.innerHTML = '<span></span>';
        section.appendChild(progress);

        const bar = progress.querySelector('span');

        function updateProgress(){
          const max = Math.max(1, rail.scrollWidth - rail.clientWidth);
          const ratio = rail.scrollLeft / max;
          const width = Math.max(22, Math.min(100, (rail.clientWidth / Math.max(rail.scrollWidth, 1)) * 100));
          bar.style.width = width + '%';
          bar.style.transform = 'translateX(' + (ratio * (100 - width)) + '%)';
        }

        controls.children[0].addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * .88, behavior: 'smooth' }));
        controls.children[1].addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * .88, behavior: 'smooth' }));
        rail.addEventListener('scroll', updateProgress, { passive: true });
        window.addEventListener('resize', updateProgress, { passive: true });
        updateProgress();
      });
    })();
  </script>


  <script>
    (function swiflytvAnimations(){
      const rows = Array.from(document.querySelectorAll('.dsRow'));
      if ('IntersectionObserver' in window) {
        const rowObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('dsVisible');
              rowObserver.unobserve(entry.target);
            }
          });
        }, { threshold: 0.14, rootMargin: '80px 0px -40px 0px' });

        rows.forEach((row, index) => {
          row.style.transitionDelay = Math.min(index * 45, 220) + 'ms';
          rowObserver.observe(row);
        });
      } else {
        rows.forEach((row) => row.classList.add('dsVisible'));
      }

      document.querySelectorAll('.dsPrimaryBtn, .dsSecondaryBtn, .dsIconBtn, .dsMiniBtn').forEach((btn) => {
        btn.addEventListener('pointerdown', () => btn.classList.add('isPressed'));
        btn.addEventListener('pointerup', () => btn.classList.remove('isPressed'));
        btn.addEventListener('pointerleave', () => btn.classList.remove('isPressed'));
      });

      const hero = document.querySelector('.dsHero');
      const heroBg = document.querySelector('.dsHeroBg');
      const heroContent = document.querySelector('.dsHeroContent');
      if (hero && heroBg && heroContent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.addEventListener('scroll', () => {
          const y = Math.min(window.scrollY, window.innerHeight);
          heroBg.style.transform = 'translateY(' + (y * 0.08) + 'px) scale(1.04)';
          heroContent.style.transform = 'translateY(' + (y * -0.035) + 'px)';
        }, { passive: true });
      }
    })();
  </script>


  <script>
    (function swiflytvEveryCranny(){
      document.querySelectorAll('.dsProfileMenu').forEach(function(menu){
        document.addEventListener('click', function(event){
          if (!menu.contains(event.target)) menu.removeAttribute('open');
        });

        document.addEventListener('keydown', function(event){
          if (event.key === 'Escape') menu.removeAttribute('open');
        });
      });

      document.querySelectorAll('.dsNavSearch input').forEach(function(input){
        input.addEventListener('keydown', function(event){
          if (event.key === 'Escape') input.blur();
        });
      });

      document.querySelectorAll('.dsThumb').forEach(function(card){
        card.addEventListener('pointermove', function(event){
          const rect = card.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width - .5) * 4;
          const y = ((event.clientY - rect.top) / rect.height - .5) * -4;
          card.style.setProperty('--tiltX', y.toFixed(2) + 'deg');
          card.style.setProperty('--tiltY', x.toFixed(2) + 'deg');
        });
        card.addEventListener('pointerleave', function(){
          card.style.removeProperty('--tiltX');
          card.style.removeProperty('--tiltY');
        });
      });

      const style = document.createElement('style');
      style.textContent = '@media (hover:hover) and (pointer:fine) { .dsThumb:hover { transform: translateY(-6px) scale(1.035) perspective(700px) rotateX(var(--tiltX, 0deg)) rotateY(var(--tiltY, 0deg)) !important; } }';
      document.head.appendChild(style);
    })();
  </script>


  <script>
    (function swiflytvAccountsProfiles(){
      const ACCOUNT_KEY = "swiflytv.accounts";
      const SESSION_KEY = "swiflytv.session";
      const PROFILE_KEY = "swiflytv.activeProfile";
      const PROFILES_KEY = "swiflytv.profiles";
      const CONTINUE_KEY = "movieverse.continue";

      function readJson(key, fallback) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "null");
          return value === null ? fallback : value;
        } catch {
          return fallback;
        }
      }

      function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
      }

      function getAccounts() {
        const accounts = readJson(ACCOUNT_KEY, []);
        return Array.isArray(accounts) ? accounts : [];
      }

      function getSession() {
        return readJson(SESSION_KEY, null);
      }

      function getProfiles() {
        const profiles = readJson(PROFILES_KEY, null);
        if (Array.isArray(profiles) && profiles.length) return profiles;
        return [
          { name: "Main", icon: "☺", href: "/", kids: false, color: "blue" },
          { name: "Movies", icon: "▶", href: "/movies", kids: false, color: "purple" },
          { name: "Shows", icon: "★", href: "/tv", kids: false, color: "pink" },
          { name: "Kids", icon: "K", href: "/kids", kids: true, color: "green" }
        ];
      }

      function sanitizeText(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function saveProfiles(profiles) {
        writeJson(PROFILES_KEY, profiles.slice(0, 8));
      }

      function setActiveProfile(profile) {
        writeJson(PROFILE_KEY, profile);
        showToast("Profile: " + profile.name);
      }

      function updateNavIdentity() {
        const session = getSession();
        const activeProfile = readJson(PROFILE_KEY, null);
        const profilePill = document.querySelector(".dsProfileMenu .profilePill, .profilePill");
        if (profilePill && activeProfile?.icon) {
          profilePill.textContent = activeProfile.icon;
          profilePill.classList.add("hasProfileIcon");
          profilePill.dataset.color = activeProfile.color || "blue";
        }

        const dropdown = document.querySelector(".dsProfileDropdown");
        if (!dropdown) return;

        if (!session) {
          if (!dropdown.querySelector('[href="/login"]')) {
            dropdown.insertAdjacentHTML("afterbegin", '<a href="/login"><span>↳</span><b>Log in</b></a><a href="/signup"><span>＋</span><b>Sign up</b></a>');
          }
          return;
        }

        const existing = dropdown.querySelector(".dsDropdownUser");
        if (!existing) {
          dropdown.insertAdjacentHTML("afterbegin", '<div class="dsDropdownUser"><span>' + sanitizeText(activeProfile?.icon || "☺") + '</span><b>' + sanitizeText(session.name || session.email) + '</b><small>' + sanitizeText(activeProfile?.name || "Main") + ' profile</small></div>');
          dropdown.insertAdjacentHTML("beforeend", '<button class="dsDropdownLogout" type="button">Log out</button>');
          dropdown.querySelector(".dsDropdownLogout")?.addEventListener("click", () => {
            localStorage.removeItem(SESSION_KEY);
            showToast("Logged out");
            setTimeout(() => location.href = "/login", 450);
          });
        }
      }

      function setupAuthForm() {
        const page = document.querySelector(".dsAuthPage");
        const form = document.getElementById("dsAuthForm");
        if (!page || !form) return;

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const mode = page.dataset.authMode || "login";
          const email = String(formData.get("email") || "").trim().toLowerCase();
          const password = String(formData.get("password") || "");
          const name = String(formData.get("name") || email.split("@")[0] || "User").trim();
          const accounts = getAccounts();

          if (!email || password.length < 4) {
            showToast("Use an email and at least 4 characters");
            return;
          }

          if (mode === "signup") {
            if (accounts.some((account) => account.email === email)) {
              showToast("Account already exists");
              return;
            }

            const account = { email, password, name, createdAt: new Date().toISOString() };
            accounts.unshift(account);
            writeJson(ACCOUNT_KEY, accounts);
            writeJson(SESSION_KEY, { email, name });
            showToast("Account created");
            setTimeout(() => location.href = new URLSearchParams(location.search).get("redirect") || "/profiles", 600);
            return;
          }

          const found = accounts.find((account) => account.email === email && account.password === password);
          if (!found) {
            showToast("Wrong email or password");
            return;
          }

          writeJson(SESSION_KEY, { email: found.email, name: found.name || found.email });
          showToast("Logged in");
          setTimeout(() => location.href = new URLSearchParams(location.search).get("redirect") || "/profiles", 500);
        });
      }

      function openProfileDialog(index = -1) {
        const dialog = document.getElementById("profileEditor");
        if (!dialog) return;

        const profiles = getProfiles();
        const profile = index >= 0 ? profiles[index] : { name: "", icon: "", href: "/", kids: false };
        document.getElementById("profileDialogTitle").textContent = index >= 0 ? "Edit Profile" : "Add Profile";
        document.getElementById("profileIndex").value = String(index);
        document.getElementById("profileNameInput").value = profile.name || "";
        document.getElementById("profileIconInput").value = profile.icon || "";
        document.getElementById("profileKidsInput").checked = Boolean(profile.kids);
        document.getElementById("profileHrefInput").value = profile.kids ? "/kids" : (profile.href || "/");
        document.getElementById("deleteProfileBtn").style.display = index >= 0 && profiles.length > 1 ? "inline-flex" : "none";
        dialog.showModal();
      }

      function renderDynamicProfiles() {
        const root = document.getElementById("dynamicProfiles");
        if (!root) return;

        const active = readJson(PROFILE_KEY, null);
        const profiles = getProfiles();

        root.innerHTML = profiles.map((profile, index) => {
          const href = profile.kids ? "/kids" : (profile.href || "/");
          const activeClass = active?.name === profile.name ? " active" : "";
          const safeName = sanitizeText(profile.name);
          const safeIcon = sanitizeText(profile.icon || safeName.slice(0, 1).toUpperCase());
          return '<article class="profileCard dsProfileCardPro' + activeClass + '" data-profile-index="' + index + '" data-profile-name="' + safeName + '" data-profile-icon="' + safeIcon + '" data-profile-color="' + sanitizeText(profile.color || "blue") + '" data-profile-kids="' + (profile.kids ? "true" : "false") + '">' +
            '<a href="' + href + '" class="dsProfileLaunch"><span class="profileAvatar" data-color="' + sanitizeText(profile.color || "blue") + '">' + safeIcon + '</span><span>' + safeName + '</span><small>' + (profile.kids ? "Kids Safe" : "Standard") + '</small></a>' +
            '<button class="dsEditProfileBtn" type="button" data-edit-profile="' + index + '">Edit</button>' +
          '</article>';
        }).join("") + '<button class="profileCard dsAddProfileCard dsProfileCardPro" type="button" id="addProfileBtn"><span class="profileAvatar">＋</span><span>Add Profile</span><small>Create new</small></button>';

        root.querySelectorAll(".dsProfileLaunch").forEach((link) => {
          link.addEventListener("click", (event) => {
            const card = event.currentTarget.closest("[data-profile-index]");
            const profile = getProfiles()[Number(card.dataset.profileIndex)];
            if (profile) setActiveProfile(profile);
          });
        });

        root.querySelectorAll("[data-edit-profile]").forEach((button) => {
          button.addEventListener("click", (event) => {
            event.preventDefault();
            openProfileDialog(Number(button.dataset.editProfile));
          });
        });

        root.querySelector("#addProfileBtn")?.addEventListener("click", () => openProfileDialog(-1));
        document.getElementById("addProfileTopBtn")?.addEventListener("click", () => openProfileDialog(-1));
      }

      function setupProfileEditor() {
        const dialog = document.getElementById("profileEditor");
        const form = document.getElementById("profileEditorForm");
        if (!dialog || !form) return;

        document.getElementById("closeProfileDialog")?.addEventListener("click", () => dialog.close());
        document.getElementById("cancelProfileEditor")?.addEventListener("click", () => dialog.close());

        document.getElementById("profileKidsInput")?.addEventListener("change", (event) => {
          if (event.currentTarget.checked) document.getElementById("profileHrefInput").value = "/kids";
        });

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const profiles = getProfiles();
          const index = Number(document.getElementById("profileIndex").value || -1);
          const name = document.getElementById("profileNameInput").value.trim().slice(0, 18);
          const icon = (document.getElementById("profileIconInput").value.trim() || name.slice(0,1).toUpperCase() || "☺").slice(0, 2);
          const kids = document.getElementById("profileKidsInput").checked;
          const href = kids ? "/kids" : document.getElementById("profileHrefInput").value;
          if (!name) {
            showToast("Profile needs a name");
            return;
          }

          const profile = { name, icon, href, kids, color: kids ? "green" : ["blue","purple","pink","gold"][Math.abs(name.length + icon.length) % 4] };
          if (index >= 0) profiles[index] = { ...profiles[index], ...profile };
          else profiles.push(profile);

          saveProfiles(profiles);
          dialog.close();
          showToast(index >= 0 ? "Profile updated" : "Profile added");
          renderDynamicProfiles();
          updateAccountStats();
        });

        document.getElementById("deleteProfileBtn")?.addEventListener("click", () => {
          const profiles = getProfiles();
          const index = Number(document.getElementById("profileIndex").value || -1);
          if (index < 0 || profiles.length <= 1) return;
          if (!confirm("Delete this profile?")) return;
          profiles.splice(index, 1);
          saveProfiles(profiles);
          dialog.close();
          showToast("Profile deleted");
          renderDynamicProfiles();
          updateAccountStats();
        });
      }

      function updateAccountStats() {
        const setText = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = String(value);
        };
        setText("statProfiles", getProfiles().length);
        setText("statContinue", readJson(CONTINUE_KEY, []).length || 0);
        setText("statLiked", readJson("movieverse.liked", []).length || 0);
        setText("statList", readJson("movieverse.watchlist", []).length || 0);
      }

      function setupAccountPage() {
        const identity = document.getElementById("accountIdentity");
        if (!identity) return;

        const session = getSession();
        const profile = readJson(PROFILE_KEY, null);
        if (session) {
          identity.innerHTML = '<div class="dsAccountAvatar" data-color="' + sanitizeText(profile?.color || "blue") + '">' + sanitizeText(profile?.icon || "☺") + '</div><div><strong>' + sanitizeText(session.name || session.email) + '</strong><span>' + sanitizeText(session.email) + '</span><small>Active profile: ' + sanitizeText(profile?.name || "Main") + '</small></div>';
          const nameInput = document.getElementById("accountDisplayName");
          if (nameInput) nameInput.value = session.name || "";
        } else {
          identity.innerHTML = '<div class="dsAccountAvatar">?</div><div><strong>Not logged in</strong><span>Create an account to organize this browser.</span><small><a href="/login">Log in</a> or <a href="/signup">sign up</a></small></div>';
        }

        document.getElementById("accountNameForm")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const session = getSession();
          if (!session) return;
          const nextName = document.getElementById("accountDisplayName").value.trim().slice(0, 40) || session.name || "User";
          const accounts = getAccounts().map((account) => account.email === session.email ? { ...account, name: nextName } : account);
          writeJson(ACCOUNT_KEY, accounts);
          writeJson(SESSION_KEY, { ...session, name: nextName });
          showToast("Account name saved");
          setupAccountPage();
        });

        document.getElementById("logoutBtn")?.addEventListener("click", () => {
          localStorage.removeItem(SESSION_KEY);
          showToast("Logged out");
          setTimeout(() => location.href = "/login", 450);
        });

        document.querySelectorAll("[data-clear-key]").forEach((button) => {
          button.addEventListener("click", () => {
            const key = button.dataset.clearKey;
            if (!confirm("Clear this section?")) return;
            localStorage.setItem(key, "[]");
            showToast("Cleared");
            updateAccountStats();
          });
        });

        document.getElementById("wipeAccountData")?.addEventListener("click", () => {
          if (!confirm("Clear accounts, profiles, My List, Liked, Continue Watching, and local settings from this browser?")) return;
          [ACCOUNT_KEY, SESSION_KEY, PROFILE_KEY, PROFILES_KEY, "movieverse.watchlist", "movieverse.liked", CONTINUE_KEY].forEach((key) => localStorage.removeItem(key));
          showToast("Local data cleared");
          setTimeout(() => location.href = "/login", 700);
        });

        updateAccountStats();
      }

      function continueKey(type, id) {
        return type + ":" + id;
      }

      function readContinue() {
        const list = readJson(CONTINUE_KEY, []);
        return Array.isArray(list) ? list : [];
      }

      function saveContinue(list) {
        writeJson(CONTINUE_KEY, list.slice(0, 80));
        renderContinueGrid();
        renderContinueRail();
      }

      function addContinueFromButton(button) {
        const type = button.dataset.playType || "movie";
        const id = String(button.dataset.playId || "");
        if (!id) return;

        const key = continueKey(type, id);
        const list = readContinue().filter((item) => item.key !== key);
        const progress = Math.max(8, Math.min(92, Math.round(18 + Math.random() * 42)));
        list.unshift({
          key,
          type,
          id,
          title: button.dataset.playTitle || "Untitled",
          poster: button.dataset.playPoster || "",
          backdrop: button.dataset.playBackdrop || "",
          rating: button.dataset.playRating || "",
          year: button.dataset.playYear || "",
          progress,
          watchedAt: new Date().toISOString()
        });
        saveContinue(list);
      }

      document.addEventListener("click", (event) => {
        const play = event.target.closest("[data-play-id]");
        if (!play) return;
        addContinueFromButton(play);
        showToast("Saved to Continue Watching");
      }, true);

      function renderContinueItem(item) {
        const poster = item.backdrop ? "https://image.tmdb.org/t/p/w780" + item.backdrop : (item.poster ? "https://image.tmdb.org/t/p/w500" + item.poster : "");
        const href = "/" + item.type + "/" + item.id;
        const title = String(item.title || "Untitled").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
        const progress = Math.max(3, Math.min(100, Number(item.progress || 18)));
        return '<article class="movieCard dsCard dsContinueCard">' +
          '<a href="' + href + '" class="posterWrap dsThumb" data-play-id="' + item.id + '" data-play-type="' + item.type + '" data-play-title="' + title + '" data-play-poster="' + (item.poster || "") + '" data-play-backdrop="' + (item.backdrop || "") + '" data-play-rating="' + (item.rating || "") + '" data-play-year="' + (item.year || "") + '">' +
            (poster ? '<img src="' + poster + '" alt="' + title + ' thumbnail" loading="lazy" />' : '<div class="posterFallback"><span>' + title.slice(0,1) + '</span></div>') +
            '<div class="dsContinueOverlay"><span>▶</span><b>Resume</b></div>' +
            '<div class="dsWatchProgress"><i style="width:' + progress + '%"></i></div>' +
            '<div class="dsCardOverlay"><div class="dsCardTitle">' + title + '</div><div class="dsCardMeta"><b>' + progress + '% watched</b><span>' + (item.year || "—") + '</span><span>' + (item.type === "tv" ? "TV" : "Movie") + '</span></div></div>' +
          '</a>' +
        '</article>';
      }

      function renderContinueRail() {
        const section = document.getElementById("continueWatchingSection");
        const root = document.getElementById("continueWatchingRail");
        if (!section || !root) return;

        const list = readContinue();
        if (!list.length) {
          section.hidden = true;
          return;
        }

        section.hidden = false;
        root.innerHTML = list.slice(0, 18).map(renderContinueItem).join("");
      }

      function renderContinueGrid() {
        const root = document.getElementById("continueGrid");
        if (!root) return;

        const list = readContinue();
        if (!list.length) {
          root.innerHTML = '<div class="watchlistEmptyNetflix"><div><strong>Nothing saved yet</strong><span>Press Play on a title and it will show up here.</span></div></div>';
          return;
        }

        root.innerHTML = list.map(renderContinueItem).join("");
      }

      document.getElementById("manageProfilesBtn")?.addEventListener("click", () => {
        const reset = confirm("Reset custom profiles back to the defaults?");
        if (!reset) return;
        localStorage.removeItem(PROFILES_KEY);
        renderDynamicProfiles();
        showToast("Profiles reset");
      });

      setupAuthForm();
      renderDynamicProfiles();
      setupProfileEditor();
      setupAccountPage();
      renderContinueGrid();
      renderContinueRail();
      updateNavIdentity();
    })();
  </script>


  <script>
    (function swiflytvFullscreenWatch(){
      function fullscreenElement() {
        return document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement ||
          null;
      }

      function requestFullscreen(element) {
        if (!element) return Promise.reject(new Error("No fullscreen target"));
        const fn =
          element.requestFullscreen ||
          element.webkitRequestFullscreen ||
          element.webkitEnterFullscreen ||
          element.mozRequestFullScreen ||
          element.msRequestFullscreen;

        if (!fn) return Promise.reject(new Error("Fullscreen API unavailable"));

        const result = fn.call(element, { navigationUI: "hide" });
        return result && typeof result.then === "function" ? result : Promise.resolve();
      }

      function exitFullscreen() {
        const fn =
          document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.mozCancelFullScreen ||
          document.msExitFullscreen;

        if (!fn) return Promise.resolve();
        const result = fn.call(document);
        return result && typeof result.then === "function" ? result : Promise.resolve();
      }

      function getFullscreenTargets(button) {
        const page = button.closest(".dsWatchPage") || document;
        const iframe = page.querySelector(".dsMovieEmbedFrame");
        const frame = page.querySelector(".dsWatchFrame");
        const playerCard = page.querySelector(".dsWatchPlayerCard");
        return [iframe, frame, playerCard, document.documentElement].filter(Boolean);
      }

      async function enterFullscreen(button) {
        const targets = getFullscreenTargets(button);
        let lastError = null;

        for (const target of targets) {
          try {
            await requestFullscreen(target);
            document.body.classList.add("dsIsFullscreen");
            button.textContent = "Exit Fullscreen";
            return;
          } catch (error) {
            lastError = error;
          }
        }

        console.warn("Fullscreen failed:", lastError);
        showToast("Fullscreen was blocked by this browser");
      }

      document.querySelectorAll("[data-fullscreen-watch]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (fullscreenElement()) {
            await exitFullscreen();
            document.body.classList.remove("dsIsFullscreen");
            button.textContent = "⛶ Fullscreen";
            return;
          }

          await enterFullscreen(button);
        });
      });

      ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((eventName) => {
        document.addEventListener(eventName, () => {
          const active = Boolean(fullscreenElement());
          document.body.classList.toggle("dsIsFullscreen", active);
          document.querySelectorAll("[data-fullscreen-watch]").forEach((button) => {
            button.textContent = active ? "Exit Fullscreen" : "⛶ Fullscreen";
          });
        });
      });
    })();
  </script>

</body>
</html>`;
}


function netflixTopNumberCard(item = {}, index = 1, forcedType = "") {
  const type = forcedType || getType(item);
  const title = getTitle(item);
  const id = item.id || "";
  const href = `/${type}/${encodeURIComponent(id)}`;
  const thumb = item.poster_path ? img(item.poster_path, "w500") : img(item.backdrop_path, "w780");
  return `<article class="topTenCard">
    <span class="topTenNumber">${escapeHtml(String(index))}</span>
    <a href="${href}" class="topTenPoster" aria-label="${escapeHtml(title)}">
      ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)} poster" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
    </a>
  </article>`;
}

function netflixNumberRail(title, items = [], type = "") {
  const cards = (items || []).slice(0, 10).map((item, index) => netflixTopNumberCard(item, index + 1, type)).join("");
  if (!cards) return "";
  return `<section class="nfRowSection">
    <h2 class="nfRowTitle">${escapeHtml(title)}</h2>
    <div class="nfTopTenRail">${cards}</div>
  </section>`;
}

function netflixSimpleRail(title, items = [], type = "") {
  const cards = (items || []).slice(0, 18).map((item) => movieCard(item, type)).join("");
  if (!cards) return "";
  return `<section class="nfRowSection">
    <h2 class="nfRowTitle">${escapeHtml(title)}</h2>
    <div class="movieRail nfRail">${cards}</div>
  </section>`;
}

function netflixBillboardTitle(title = "") {
  const clean = String(title || "Featured").trim();
  if (!clean) return "Featured";
  const words = clean.split(/\s+/);
  if (words.length <= 2) return clean;
  if (clean.length <= 16) return clean;
  return words.slice(0, 3).join(" ");
}

function movieCard(item = {}, forcedType = "") {
  const type = forcedType || getType(item);
  const title = getTitle(item);
  const id = item.id || "";
  const href = `/${type}/${encodeURIComponent(id)}`;
  const thumbUrl = item.backdrop_path ? img(item.backdrop_path, "w780") : img(item.poster_path, "w500");
  const itemYear = getYear(getDate(item));
  const score = formatRating(item.vote_average);
  const maturity = type === "tv" ? "TV-14" : "PG-13";
  const match = metaMatch(item);

  return `<article class="movieCard dsCard" data-title="${escapeHtml(title.toLowerCase())}">
    <a href="${href}" class="posterWrap dsThumb" aria-label="${escapeHtml(title)}">
      ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)} thumbnail" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
      <div class="dsCardOverlay">
        <div class="dsCardControls">
          <span class="dsPlayDot">▶</span>
          <button
            class="dsMiniBtn"
            type="button"
            data-watch-id="${escapeHtml(id)}"
            data-watch-type="${escapeHtml(type)}"
            data-watch-title="${escapeHtml(title)}"
            data-watch-poster="${escapeHtml(item.poster_path || "")}"
            data-watch-backdrop="${escapeHtml(item.backdrop_path || "")}"
            data-watch-rating="${escapeHtml(score)}"
            data-watch-year="${escapeHtml(itemYear)}">＋</button>
          <button
            class="dsMiniBtn dsHeartBtn"
            type="button"
            aria-label="Like ${escapeHtml(title)}"
            data-like-id="${escapeHtml(id)}"
            data-like-type="${escapeHtml(type)}"
            data-like-title="${escapeHtml(title)}"
            data-like-poster="${escapeHtml(item.poster_path || "")}"
            data-like-backdrop="${escapeHtml(item.backdrop_path || "")}"
            data-like-rating="${escapeHtml(score)}"
            data-like-year="${escapeHtml(itemYear)}">♡</button>
        </div>
        <div class="dsCardTitle">${escapeHtml(title)}</div>
        <div class="dsCardMeta"><b>${escapeHtml(match)}</b><span>${escapeHtml(itemYear)}</span><span>${escapeHtml(maturity)}</span></div>
      </div>
    </a>
  </article>`;
}

function personCard(person = {}) {
  const name = person.name || "Unknown";
  const profile = img(person.profile_path, "w342");
  return `<article class="movieCard">
    <a href="/person/${encodeURIComponent(person.id)}" class="posterWrap" aria-label="${escapeHtml(name)}">
      ${profile ? `<img src="${escapeHtml(profile)}" alt="${escapeHtml(name)}" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(name.slice(0, 1))}</span></div>`}
      <div class="posterShade"></div>
      <span class="typePill">Person</span>
    </a>
    <div class="movieInfo">
      <h3><a href="/person/${encodeURIComponent(person.id)}">${escapeHtml(name)}</a></h3>
      <p>${escapeHtml(person.known_for_department || "Known for movies")}</p>
    </div>
  </article>`;
}

function rail(title, items = [], type = "", kicker = "", viewHref = "") {
  if (!items.length) return "";
  return `<section class="section">
    <div class="sectionHead">
      <div>
        ${kicker ? `<span>${escapeHtml(kicker)}</span>` : ""}
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${viewHref ? `<a href="${viewHref}">View more</a>` : ""}
    </div>
    <div class="movieRail">${items.slice(0, 20).map((item) => movieCard(item, type)).join("")}</div>
  </section>`;
}

function peopleRail(title, people = [], kicker = "", viewHref = "") {
  if (!people.length) return "";
  return `<section class="section">
    <div class="sectionHead">
      <div>
        ${kicker ? `<span>${escapeHtml(kicker)}</span>` : ""}
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${viewHref ? `<a href="${viewHref}">View more</a>` : ""}
    </div>
    <div class="movieRail">${people.slice(0, 20).map(personCard).join("")}</div>
  </section>`;
}

function errorBlock(message) {
  return `<div class="errorState"><h1>Something went wrong.</h1><p>${escapeHtml(message || "Could not load this page.")}</p></div>`;
}

async function getGenres(type = "movie") {
  const endpoint = type === "tv" ? "/genre/tv/list" : "/genre/movie/list";
  const data = await tmdb(endpoint, {}, CACHE_TTL.long);
  return Array.isArray(data.genres) ? data.genres : [];
}


function welcomePreviewCard(item = {}, forcedType = "") {
  const type = forcedType || getType(item);
  const title = getTitle(item);
  const id = item.id || "";
  const itemYear = getYear(getDate(item));
  const thumbUrl = item.backdrop_path ? img(item.backdrop_path, "w780") : img(item.poster_path, "w500");
  const href = `/signup?redirect=/${type}/${encodeURIComponent(id)}`;

  return `<article class="dsWelcomeCard">
    <a href="${href}" aria-label="Sign up to watch ${escapeHtml(title)}">
      ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)} preview" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(itemYear)} • ${type === "tv" ? "Series" : "Movie"}</span>
      </div>
    </a>
  </article>`;
}

function welcomePreviewRail(title = "", items = [], type = "") {
  const cards = (items || []).slice(0, 12).map((item) => welcomePreviewCard(item, type)).join("");
  if (!cards) return "";
  return `<section class="dsWelcomeRail">
    <div class="dsWelcomeRailHead">
      <h2>${escapeHtml(title)}</h2>
      <a href="/signup">Unlock all</a>
    </div>
    <div class="dsWelcomeRailTrack">${cards}</div>
  </section>`;
}


async function welcomePage(req, res) {
  const [trendingAll, popularMovies, popularTv, familyMovies, topMovies, welcomeSpotlightMovie] = await Promise.all([
    tmdb("/trending/all/week", {}, CACHE_TTL.short),
    tmdb("/movie/popular", {}, CACHE_TTL.medium),
    tmdb("/tv/popular", {}, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "10751", sort_by: "popularity.desc", include_adult: "false" }, CACHE_TTL.medium),
    tmdb("/movie/top_rated", {}, CACHE_TTL.medium),
    tmdb(`/movie/${SWIFLYTV_SPOTLIGHT_TMDB_ID}`, {}, CACHE_TTL.long),
  ]);

  const sources = [trendingAll, popularMovies, popularTv, familyMovies, topMovies, welcomeSpotlightMovie];
  const hasTmdb = !sources.some((data) => data && data.__error);
  const trending = hasTmdb ? (trendingAll.results || []).filter((item) => ["movie", "tv"].includes(getType(item))) : [];
  const hero = welcomeSpotlightMovie && !welcomeSpotlightMovie.__error
    ? { ...welcomeSpotlightMovie, media_type: "movie" }
    : pickHero(trending) || {};
  const heroTitle = getTitle(hero) || "Your distance date night starts here.";
  const heroBg = hero.backdrop_path ? fullBackdrop(hero.backdrop_path) : "";
  const heroPoster = hero.poster_path ? img(hero.poster_path, "w500") : "";
  const heroDesc = hero.overview || "SwiflyTV helps long-distance couples plan movie nights, share watch links, start date rooms, chat, count down together, and feel a little closer from different places.";
  const redirect = encodeURIComponent(String(req.query.redirect || "/profiles"));
  const heroType = getType(hero) || "movie";
  const heroHref = hero.id ? `/signup?redirect=${encodeURIComponent(`/${heroType}/${hero.id}`)}` : `/signup?redirect=${redirect}`;
  const previewMosaic = hasTmdb
    ? [...(popularMovies.results || []), ...(popularTv.results || [])].filter((item) => item.poster_path).slice(0, 6)
    : [];

  const body = `<main class="dsWelcomePage dsWelcomePagePro">
    <nav class="dsWelcomeNav dsWelcomeNavPro">
      <a class="dsWelcomeBrand" href="/welcome"><span></span><b>${escapeHtml(BRAND_WORDMARK)}</b></a>
      <div class="dsWelcomeNavLinks">
        <a href="#discovery">Date ideas</a>
        <a href="#features">Couple tools</a>
        <a href="/login?redirect=${redirect}">Log in</a>
        <a class="dsWelcomeJoin" href="/signup?redirect=${redirect}">Sign up</a>
      </div>
    </nav>

    <section class="dsWelcomeHero dsWelcomeHeroPro">
      ${heroBg ? `<div class="dsWelcomeHeroBg" style="background-image:url('${escapeHtml(heroBg)}')"></div>` : ""}
      <div class="dsWelcomeGlowOne"></div>
      <div class="dsWelcomeHeroCopy">
        <span class="dsEyebrow">Long-distance date nights</span>
        <h1>Feel closer, even when you are far apart.</h1>
        <p>${escapeHtml(heroDesc)}</p>

        <div class="dsWelcomeActions">
          <a class="dsPrimaryBtn" href="/signup?redirect=${redirect}">Start a date night</a>
          <a class="dsSecondaryBtn" href="#discovery">Browse date picks</a>
        </div>

        <div class="dsWelcomeStats">
          <div><b>Couple Profiles</b><span>Me, partner, and together spaces</span></div>
          <div><b>Date Rooms</b><span>Open Together, Live Share, chat</span></div>
          <div><b>Distance Sync</b><span>Countdowns and shared timeframes</span></div>
        </div>
      </div>

      <aside class="dsWelcomeShowcase">
        <div class="dsWelcomeSpotlightCard">
          ${heroPoster ? `<img src="${escapeHtml(heroPoster)}" alt="${escapeHtml(heroTitle)} poster" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(heroTitle.slice(0, 1))}</span></div>`}
          <div>
            <span>Date night spotlight</span>
            <h2>${escapeHtml(heroTitle)}</h2>
            <p>${escapeHtml(getYear(getDate(hero)))} • ${escapeHtml(metaMatch(hero))}</p>
            <a href="${heroHref}">Save for date night →</a>
          </div>
        </div>
        <div class="dsWelcomeMiniMosaic">
          ${previewMosaic.map((item) => `<img src="${escapeHtml(img(item.poster_path, "w342"))}" alt="${escapeHtml(getTitle(item))}" loading="lazy" />`).join("")}
        </div>
      </aside>
    </section>

    <section class="dsWelcomeHowItWorks">
      <article><span>1</span><strong>Pick the vibe</strong><p>Choose cozy, funny, emotional, action, comfort rewatch, or something new for tonight.</p></article>
      <article><span>2</span><strong>Create your couple space</strong><p>Use Me, Partner, and Together profiles so your date nights feel personal.</p></article>
      <article><span>3</span><strong>Start a date room</strong><p>Share a room link, chat, countdown, and press play together from anywhere.</p></article>
    </section>

    <section class="dsCouplePromiseStrip">
      <article><span>♡</span><b>Open Together</b><p>If embeds fail, both of you open the real site and use the same countdown.</p></article>
      <article><span>☾</span><b>Late-night friendly</b><p>Big buttons, clear rooms, and fewer steps when you are already on a call.</p></article>
      <article><span>✦</span><b>Our List</b><p>Save movies you both actually want instead of losing them in texts.</p></article>
    </section>

    <section id="discovery" class="dsWelcomeDiscovery dsWelcomeDiscoveryPro">
      <div class="dsWelcomeIntro">
        <span class="dsEyebrow">Date ideas before signing in</span>
        <h2>Find the movie before the “what do we watch?” argument.</h2>
        <p>SwiflyTV is built for long-distance couples who still want a normal movie night together. Browse ideas, then unlock Date Rooms, Our List, shared watch history, hearts, countdowns, and couple profiles.</p>
      </div>

      ${hasTmdb ? `
        ${welcomePreviewRail("Date-night trending", trending)}
        ${welcomePreviewRail("Movies to watch together", popularMovies.results || [], "movie")}
        ${welcomePreviewRail("Shows to binge together", popularTv.results || [], "tv")}
        ${welcomePreviewRail("Cozy comfort picks", familyMovies.results || [], "movie")}
        ${welcomePreviewRail("Serious date-night picks", topMovies.results || [], "movie")}
      ` : `
        <section class="dsWelcomeFallback">
          <h2>Connect TMDB to unlock discovery previews</h2>
          <p>Add your <code>TMDB_API_KEY</code> in your environment variables to show trending movies and shows here.</p>
          <a class="dsPrimaryBtn" href="/signup">Continue to signup</a>
        </section>
      `}
    </section>

    <section id="features" class="dsWelcomeFeatures dsWelcomeFeaturesPro">
      <article><span>Date Rooms</span><h3>Watch from two places</h3><p>Share a room, use Open Together, Live Share, countdowns, and chat while apart.</p></article>
      <article><span>Couple Profiles</span><h3>Me, you, and us</h3><p>Create profiles for each person and a shared Together space for date nights.</p></article>
      <article><span>Continue Together</span><h3>Resume the date</h3><p>Keep track of what you started so the next call can begin faster.</p></article>
      <article><span>Love Notes</span><h3>Keep it sweet</h3><p>Use the couple dashboard for date ideas, little notes, and shared plans.</p></article>
    </section>

    <section class="dsWelcomeDevice">
      <div>
        <span class="dsEyebrow">Built for phones and late-night calls</span>
        <h2>Designed for “you pick, no you pick.”</h2>
        <p>Whether you are on a phone in bed or a laptop on a call, SwiflyTV makes it easier to choose, sync, and watch together.</p>
        <a class="dsPrimaryBtn" href="/signup?redirect=${redirect}">Plan your first date room</a>
      </div>
      <div class="dsPhoneMock">
        <div class="dsPhoneTop"></div>
        <div class="dsPhoneHero"></div>
        <div class="dsPhoneRows"><span></span><span></span><span></span></div>
      </div>
    </section>

    <section class="dsWelcomeFinalCta dsWelcomeFinalCtaPro">
      <span class="dsEyebrow">Ready for date night?</span>
      <h2>Start your shared screen tradition.</h2>
      <p>Create your couple space and make distance feel a little smaller.</p>
      <div class="dsWelcomeActions">
        <a class="dsPrimaryBtn" href="/signup?redirect=${redirect}">Create couple account</a>
        <a class="dsSecondaryBtn" href="/login?redirect=${redirect}">Log in</a>
      </div>
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Welcome`, active: "welcome", body }));
}

async function homePage(req, res) {
  const [
    trendingAll,
    trendingMovies,
    trendingTv,
    popularMovies,
    popularTv,
    topMovies,
    topTv,
    nowPlaying,
    upcomingMovies,
    actionMovies,
    comedyMovies,
    dramaShows,
    familyMovies,
    animationMovies,
    thrillerMovies,
    spotlightMovie,
  ] = await Promise.all([
    tmdb("/trending/all/week", {}, CACHE_TTL.short),
    tmdb("/trending/movie/week", {}, CACHE_TTL.short),
    tmdb("/trending/tv/week", {}, CACHE_TTL.short),
    tmdb("/movie/popular", {}, CACHE_TTL.medium),
    tmdb("/tv/popular", {}, CACHE_TTL.medium),
    tmdb("/movie/top_rated", {}, CACHE_TTL.medium),
    tmdb("/tv/top_rated", {}, CACHE_TTL.medium),
    tmdb("/movie/now_playing", {}, CACHE_TTL.short),
    tmdb("/movie/upcoming", {}, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "28", sort_by: "popularity.desc" }, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "35", sort_by: "popularity.desc" }, CACHE_TTL.medium),
    tmdb("/discover/tv", { with_genres: "18", sort_by: "vote_average.desc", vote_count_gte: 200 }, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "10751", sort_by: "popularity.desc" }, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "16", sort_by: "popularity.desc" }, CACHE_TTL.medium),
    tmdb("/discover/movie", { with_genres: "53", sort_by: "popularity.desc" }, CACHE_TTL.medium),
    tmdb(`/movie/${SWIFLYTV_SPOTLIGHT_TMDB_ID}`, {}, CACHE_TTL.long),
  ]);

  const firstError = [
    trendingAll, trendingMovies, trendingTv, popularMovies, popularTv, topMovies, topTv,
    nowPlaying, upcomingMovies, actionMovies, comedyMovies, dramaShows, familyMovies,
    animationMovies, thrillerMovies, spotlightMovie,
  ].find((data) => data.__error);

  if (firstError) return res.send(setupNeededPage(firstError.message));

  const hero = spotlightMovie && !spotlightMovie.__error
    ? { ...spotlightMovie, media_type: "movie" }
    : pickHero((trendingAll.results || []).filter((item) => ["movie", "tv"].includes(getType(item))));

  const body = `<main>
    ${dsHero({ hero, context: "Date night spotlight", eyebrow: "For tonight together" })}
    <section class="dsContent">

      <section class="dsCoupleHomeBoard">
        <div>
          <span class="dsEyebrow">Tonight together</span>
          <h2>Plan a long-distance movie date in one place.</h2>
          <p>Pick something, save it to Our List, open a Date Room, start a countdown, and chat while you both get ready.</p>
        </div>
        <div class="dsCoupleHomeActions">
          <a class="dsPrimaryBtn" href="/watchrooms">Start Date Room</a>
          <a class="dsSecondaryBtn" href="/couples">Couple Dashboard</a>
          <a class="dsGhostPill" href="/my-list">Open Our List</a>
        </div>
        <div class="dsCoupleHomeCards">
          <article><b>01</b><span>Choose the vibe</span></article>
          <article><b>02</b><span>Send the room</span></article>
          <article><b>03</b><span>Press play together</span></article>
        </div>
      </section>

      <section id="continueWatchingSection" class="dsRow dsContinueSection" hidden>
        <div class="dsRowHead"><h2>Continue Watching</h2><span class="dsRowTag">Saved watching</span></div>
        <div id="continueWatchingRail" class="movieRail dsRail"></div>
      </section>
      ${dsRail("Date Night Spotlight", [{ ...spotlightMovie, media_type: "movie" }], "movie", { tag: "Featured" })}
      ${dsRail("Couples are watching", (trendingAll.results || []).filter((item) => ["movie", "tv"].includes(getType(item))), "", { tag: "Live" })}
      ${dsTopRail("Top movies for tonight", popularMovies.results || [], "movie")}
      ${dsRail("Shows for a long call", dramaShows.results || [], "tv")}
      ${dsRail("New date-night releases", nowPlaying.results || [], "movie")}
      ${dsRail("Action for high-energy dates", actionMovies.results || [], "movie")}
      ${dsRail("Binge together", popularTv.results || [], "tv")}
      ${dsTopRail("Top 10 TV Shows", topTv.results || [], "tv")}
      ${dsRail("Comedy Movies", comedyMovies.results || [], "movie")}
      ${dsRail("Family Movie Night", familyMovies.results || [], "movie")}
      ${dsRail("Animated Worlds", animationMovies.results || [], "movie")}
      ${dsRail("Thrillers to react to together", thrillerMovies.results || [], "movie")}
      ${dsRail("Coming Soon", upcomingMovies.results || [], "movie")}
      ${dsRail("Critically Acclaimed Movies", topMovies.results || [], "movie")}
    </section>
  </main>`;

  res.send(pageShell({ title: SITE_NAME, active: "home", body }));
}

function collectionHero(title, subtitle, active = "") {
  return `<section class="container netflixPageHero">
    <div>
      <span class="eyebrow">${escapeHtml(active || "Discover")}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
  </section>`;
}

function pagination(base, page, totalPages = 1) {
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages || page + 1, page + 1);
  const prevDisabled = page <= 1;
  const nextDisabled = totalPages && page >= totalPages;
  return `<nav class="pagination">
    ${prevDisabled ? "" : `<a href="${base}${base.includes("?") ? "&" : "?"}page=${prev}">← Previous</a>`}
    <a href="#">Page ${escapeHtml(String(page))}</a>
    ${nextDisabled ? "" : `<a href="${base}${base.includes("?") ? "&" : "?"}page=${next}">Next →</a>`}
  </nav>`;
}



function pickHero(items = []) {
  return (items || []).find((item) => item && item.backdrop_path && (item.overview || "").length > 90)
    || (items || []).find((item) => item && item.backdrop_path)
    || (items || [])[0]
    || {};
}

function titleArtText(title = "") {
  const clean = String(title || "Featured").trim();
  if (!clean) return "Featured";
  const words = clean.split(/\s+/);
  if (clean.length <= 18) return clean;
  if (words.length <= 3) return clean;
  return words.slice(0, 4).join(" ");
}

function metaMatch(item = {}) {
  const rating = Number(item.vote_average || 0);
  const score = rating ? Math.round(Math.min(98, Math.max(72, rating * 10 + 8))) : 91;
  return `${score}% Match`;
}

function dsHero({ hero = {}, type = "", context = "", eyebrow = "" }) {
  const mediaType = type || getType(hero);
  const title = getTitle(hero);
  const href = `/${mediaType}/${encodeURIComponent(hero.id || "")}`;
  const bg = fullBackdrop(hero.backdrop_path || hero.poster_path);
  const desc = hero.overview || "A premium streaming discovery experience for movies, shows, trailers, cast, and your saved list.";
  const maturity = mediaType === "tv" ? "TV-14" : "PG-13";
  return `<section class="dsHero">
    <div class="dsHeroBg" style="background-image:url('${escapeHtml(bg)}')"></div>
    <div class="dsHeroGlass"></div>
    <div class="dsHeroContent">
      <div class="dsEyebrow">${escapeHtml(eyebrow || context || BRAND_SUBMARK)}</div>
      <h1>${escapeHtml(titleArtText(title))}</h1>
      <div class="dsHeroMeta"><b>${escapeHtml(metaMatch(hero))}</b><span>${escapeHtml(getYear(getDate(hero)))}</span><span>${escapeHtml(maturity)}</span><span>HD</span></div>
      <p>${escapeHtml(desc)}</p>
      <div class="dsHeroActions">
        <a class="dsPrimaryBtn" href="${href}" data-play-id="${escapeHtml(hero.id || "")}" data-play-type="${escapeHtml(mediaType)}" data-play-title="${escapeHtml(title)}" data-play-poster="${escapeHtml(hero.poster_path || "")}" data-play-backdrop="${escapeHtml(hero.backdrop_path || "")}" data-play-rating="${escapeHtml(formatRating(hero.vote_average))}" data-play-year="${escapeHtml(getYear(getDate(hero)))}"><span>▶</span> Play</a>
        <a class="dsSecondaryBtn" href="${href}"><span>ⓘ</span> More Info</a>
      </div>
    </div>
    <div class="dsHeroRating"><span>🔇</span><b>${escapeHtml(maturity)}</b></div>
  </section>`;
}

function dsRail(title, items = [], type = "", options = {}) {
  const cards = (items || []).slice(0, options.limit || 18).map((item) => movieCard(item, type)).join("");
  if (!cards) return "";
  const tag = options.tag ? `<span class="dsRowTag">${escapeHtml(options.tag)}</span>` : "";
  return `<section class="dsRow">
    <div class="dsRowHead"><h2>${escapeHtml(title)}</h2>${tag}</div>
    <div class="movieRail dsRail">${cards}</div>
  </section>`;
}

function dsTopRail(title, items = [], type = "") {
  const cards = (items || []).slice(0, 10).map((item, index) => netflixTopNumberCard(item, index + 1, type)).join("");
  if (!cards) return "";
  return `<section class="dsRow dsTopRow">
    <div class="dsRowHead"><h2>${escapeHtml(title)}</h2><span class="dsRowTag">Top 10</span></div>
    <div class="nfTopTenRail">${cards}</div>
  </section>`;
}


function isKidsSafeItem(item = {}) {
  if (!item || item.adult === true) return false;
  const text = `${getTitle(item)} ${item.overview || ""}`.toLowerCase();
  const blocked = [
    "horror", "serial killer", "killer", "murder", "slasher", "erotic", "sex",
    "nude", "porn", "drug cartel", "cartel", "cocaine", "mafia", "gore",
    "suicide", "rape", "stripper", "prostitute", "demon", "exorcism"
  ];
  return !blocked.some((word) => text.includes(word));
}

function kidsSafeResults(items = []) {
  return (items || []).filter(isKidsSafeItem);
}

function kidsMovieParams(extra = {}) {
  return {
    include_adult: "false",
    certification_country: "US",
    "certification.lte": "PG",
    sort_by: "popularity.desc",
    without_genres: "27,53,80,10752",
    ...extra,
  };
}

function kidsTvParams(extra = {}) {
  return {
    include_adult: "false",
    sort_by: "popularity.desc",
    without_genres: "80,9648,10759,10765,10768",
    ...extra,
  };
}

function dsPageHeader(title, subtitle = "", kicker = "") {
  return `<section class="dsPageHeader">
    ${kicker ? `<span class="dsEyebrow">${escapeHtml(kicker)}</span>` : ""}
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
  </section>`;
}

function netflixTitleArt(title = "") {
  const clean = String(title || "Featured").trim();
  const words = clean.split(/\s+/);
  if (words.length > 3) return words.slice(0, 3).join(" ");
  return clean;
}

function netflixGenreDropdown(type, genres = []) {
  const label = type === "tv" ? "Genres" : "Genres";
  const links = genres.slice(0, 28).map((g) => `<a href="/genre/${type}/${encodeURIComponent(g.id)}?name=${encodeURIComponent(g.name)}">${escapeHtml(g.name)}</a>`).join("");
  return `<details class="genreDropdown">
    <summary>${escapeHtml(label)} <span>▾</span></summary>
    <div class="genreDropdownMenu">${links}</div>
  </details>`;
}

function netflixBrowseHero({ type, label, hero, genres, rank = 6 }) {
  const heroType = type === "tv" ? "tv" : "movie";
  const title = getTitle(hero || {});
  const href = `/${heroType}/${encodeURIComponent(hero?.id || "")}`;
  const bg = fullBackdrop(hero?.backdrop_path || hero?.poster_path);
  const desc = hero?.overview || `Browse ${label.toLowerCase()} with a Netflix-style full-screen category page.`;
  const maturity = heroType === "tv" ? "TV-14" : "PG-13";

  return `<section class="browseHero">
    <div class="browseHeroBg" style="background-image:url('${escapeHtml(bg)}')"></div>

    <div class="browseHeroTop">
      <h1>${escapeHtml(label)}</h1>
      ${netflixGenreDropdown(heroType, genres)}
    </div>

    <div class="browseHeroContent">
      <h2 class="browseLogoTitle">${escapeHtml(netflixTitleArt(title))}</h2>
      <div class="browseTopRank">
        <span class="top10Badge">TOP<br>10</span>
        <strong>#${escapeHtml(String(rank))} in ${escapeHtml(label)} Today</strong>
      </div>
      <p class="browseDesc">${escapeHtml(desc)}</p>
      <div class="browseButtons">
        <a class="browsePlay" href="${href}"><span class="browsePlayIcon">▶</span> Play</a>
        <a class="browseInfo" href="${href}"><span class="browseInfoIcon">ⓘ</span> More Info</a>
      </div>
      <div class="browseMaturity">
        <span class="browseMute">🔇</span>
        <span class="browseRating">${escapeHtml(maturity)}</span>
      </div>
    </div>
  </section>`;
}

function netflixRailCards(items = [], type = "") {
  return (items || []).slice(0, 14).map((item) => movieCard(item, type)).join("");
}

async function listingPage(req, res, type = "movie", options = {}) {
  const page = pageNumber(req.query.page);
  const sort = req.query.sort || options.sort || "popular";
  const genre = req.query.genre || "";

  const endpointMap = {
    movie: {
      popular: "/movie/popular",
      top_rated: "/movie/top_rated",
      upcoming: "/movie/upcoming",
      now_playing: "/movie/now_playing",
      discover: "/discover/movie",
    },
    tv: {
      popular: "/tv/popular",
      top_rated: "/tv/top_rated",
      airing_today: "/tv/airing_today",
      on_the_air: "/tv/on_the_air",
      discover: "/discover/tv",
    },
  };

  let endpoint = endpointMap[type][sort] || endpointMap[type].popular;
  const params = { page };

  if (genre || sort === "discover") {
    endpoint = endpointMap[type].discover;
    params.sort_by = req.query.sort_by || "popularity.desc";
    if (genre) params.with_genres = genre;
    if (type === "movie") params.include_adult = "false";
  }

  const [data, genres, rowOne, rowTwo, rowThree, rowFour, rowFive] = await Promise.all([
    tmdb(endpoint, params, CACHE_TTL.medium),
    getGenres(type),
    tmdb(type === "tv" ? "/discover/tv" : "/discover/movie", { with_genres: type === "tv" ? "18" : "28", sort_by: "popularity.desc", page: 1 }, CACHE_TTL.medium),
    tmdb(type === "tv" ? "/discover/tv" : "/discover/movie", { with_genres: "35", sort_by: "popularity.desc", page: 1 }, CACHE_TTL.medium),
    tmdb(type === "tv" ? "/discover/tv" : "/discover/movie", { with_genres: type === "tv" ? "80" : "53", sort_by: "popularity.desc", page: 1 }, CACHE_TTL.medium),
    tmdb(type === "tv" ? "/discover/tv" : "/discover/movie", { sort_by: "vote_average.desc", vote_count_gte: 200, page: 1 }, CACHE_TTL.medium),
    tmdb(type === "tv" ? "/trending/tv/week" : "/trending/movie/week", {}, CACHE_TTL.short),
  ]);

  if (data.__error) return res.send(setupNeededPage(data.message));

  const label = type === "tv" ? "TV Shows" : "Movies";
  const active = type === "tv" ? "tv" : "movies";
  const hero = pickHero(data.results || rowFive.results || []);
  const categoryOne = type === "tv" ? "Shows for a long call" : "Action Movies";
  const categoryTwo = type === "tv" ? "Comedy TV Shows" : "Comedies";
  const categoryThree = type === "tv" ? "Crime & Suspense Shows" : "Suspense Movies";
  const categoryFour = type === "tv" ? "Critically Acclaimed TV" : "Critically Acclaimed Movies";

  const genreLinks = genres.slice(0, 16).map((g) => `<a href="/genre/${type}/${encodeURIComponent(g.id)}?name=${encodeURIComponent(g.name)}">${escapeHtml(g.name)}</a>`).join("");

  const body = `<main>
    <section class="dsBrowseTop">
      <h1>${escapeHtml(label)}</h1>
      <details class="genreDropdown">
        <summary>Genres <span>▾</span></summary>
        <div class="genreDropdownMenu">${genreLinks}</div>
      </details>
    </section>
    ${dsHero({ hero, type, context: label, eyebrow: `${label} spotlight` })}
    <section class="dsContent">
      ${dsRail(categoryOne, rowOne.results || [], type)}
      ${dsTopRail(type === "tv" ? "Top 10 TV Shows Today" : "Top movies for tonight Today", data.results || [], type)}
      ${dsRail(categoryTwo, rowTwo.results || [], type)}
      ${dsRail(categoryThree, rowThree.results || [], type)}
      ${dsRail(categoryFour, rowFour.results || [], type)}
      ${dsRail(`${label} A-Z`, data.results || [], type)}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${label}`, active, body }));
}

async function trendingPage(req, res) {
  const page = pageNumber(req.query.page);
  const type = ["movie", "tv", "all"].includes(req.query.type) ? req.query.type : "all";
  const [data, popularMovies, popularTv, upcomingMovies, nowPlaying, topMovies] = await Promise.all([
    tmdb(`/trending/${type}/week`, { page }, CACHE_TTL.short),
    tmdb("/movie/popular", {}, CACHE_TTL.medium),
    tmdb("/tv/popular", {}, CACHE_TTL.medium),
    tmdb("/movie/upcoming", {}, CACHE_TTL.medium),
    tmdb("/movie/now_playing", {}, CACHE_TTL.short),
    tmdb("/movie/top_rated", {}, CACHE_TTL.medium),
  ]);
  if (data.__error) return res.send(setupNeededPage(data.message));

  const hero = pickHero((data.results || []).filter((item) => ["movie", "tv"].includes(getType(item))));
  const body = `<main>
    ${dsHero({ hero, context: "New & Popular", eyebrow: "Fresh on SwiflyTV" })}
    <section class="dsContent">
      <div class="dsTabs">
        <a class="${type === "all" ? "active" : ""}" href="/trending?type=all">All</a>
        <a class="${type === "movie" ? "active" : ""}" href="/trending?type=movie">Movies</a>
        <a class="${type === "tv" ? "active" : ""}" href="/trending?type=tv">TV Shows</a>
      </div>
      ${dsRail("Couples are watching", (data.results || []).filter((item) => ["movie", "tv"].includes(getType(item))), type === "all" ? "" : type, { tag: "Live" })}
      ${dsTopRail("Top movies for tonight Today", popularMovies.results || [], "movie")}
      ${dsRail("Popular TV Shows", popularTv.results || [], "tv")}
      ${dsRail("Coming Soon", upcomingMovies.results || [], "movie")}
      ${dsRail("Now Playing", nowPlaying.results || [], "movie")}
      ${dsRail("Critically Acclaimed", topMovies.results || [], "movie")}
      ${pagination(`/trending?type=${encodeURIComponent(type)}`, page, data.total_pages)}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — New & Popular`, active: "trending", body }));
}

async function searchPage(req, res) {
  const q = String(req.query.q || "").trim();
  const page = pageNumber(req.query.page);

  if (!q) {
    const trending = await tmdb("/trending/all/week", {}, CACHE_TTL.short);
    if (trending.__error) return res.send(setupNeededPage(trending.message));

    return res.send(pageShell({
      title: `${SITE_NAME} — Search`,
      active: "search",
      body: `<main class="dsPlainPage">
        ${dsPageHeader("Search", "Find movies, shows, actors, and creators.", "Discovery")}
        <section class="dsSearchBox">
          <form action="/search" method="get">
            <input name="q" placeholder="Search movies, shows, actors..." autocomplete="off" autofocus />
            <button type="submit">Search</button>
          </form>
        </section>
        <section class="dsContent noHero">
          ${dsRail("Popular Searches", (trending.results || []).filter((item) => ["movie", "tv"].includes(getType(item))))}
        </section>
      </main>`,
    }));
  }

  const data = await tmdb("/search/multi", { query: q, page, include_adult: "false" }, CACHE_TTL.short);
  if (data.__error) return res.send(setupNeededPage(data.message));

  const results = (data.results || []).filter((item) => ["movie", "tv", "person"].includes(getType(item) || item.media_type));
  const cards = results.map((item) => {
    if (item.media_type === "person") return personCard(item);
    return movieCard(item);
  }).join("");

  const body = `<main class="dsPlainPage">
    ${dsPageHeader(`Results for “${q}”`, "Search movies, TV, people, and creators.", "Search")}
    <section class="dsSearchBox">
      <form action="/search" method="get">
        <input name="q" value="${escapeHtml(q)}" placeholder="Search movies, shows, actors..." autocomplete="off" />
        <button type="submit">Search</button>
      </form>
    </section>
    <section class="dsContent noHero">
      ${cards ? `<div class="dsGrid">${cards}</div>` : `<div class="emptyState">No results found.</div>`}
      ${pagination(`/search?q=${encodeURIComponent(q)}`, page, data.total_pages)}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Search ${q}`, active: "search", body }));
}

async function genrePage(req, res, type) {
  const id = req.params.id;
  const name = req.query.name || "Genre";
  const data = await tmdb(type === "tv" ? "/discover/tv" : "/discover/movie", {
    with_genres: id,
    sort_by: "popularity.desc",
    page: pageNumber(req.query.page),
    include_adult: "false",
  }, CACHE_TTL.medium);

  if (data.__error) return res.send(setupNeededPage(data.message));

  const body = `<main>
    ${collectionHero(name, `${type === "tv" ? "TV shows" : "Movies"} in this genre.`, "Genre")}
    <div class="container netflixCatalog">
      <div class="movieGrid">${(data.results || []).map((item) => movieCard(item, type)).join("")}</div>
      ${pagination(`/genre/${type}/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`, pageNumber(req.query.page), data.total_pages)}
    </div>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${name}`, active: type === "tv" ? "tv" : "movies", body }));
}

async function genresPage(req, res) {
  const [movieGenres, tvGenres] = await Promise.all([getGenres("movie"), getGenres("tv")]);

  const genreGroup = (title, type, genres) => `<section class="dsGenreGroup">
    <h2>${escapeHtml(title)}</h2>
    <div class="dsGenreGrid">${genres.map((g) => `<a class="dsGenreTile" href="/genre/${type}/${encodeURIComponent(g.id)}?name=${encodeURIComponent(g.name)}">${escapeHtml(g.name)}</a>`).join("")}</div>
  </section>`;

  const body = `<main class="dsPlainPage">
    ${dsPageHeader("Browse by Languages & Genres", "Choose a mood, genre, or category and jump straight into curated rows.", "Browse")}
    <section class="dsLanguageFilters">
      <select><option>Original Language</option><option>Genres</option><option>Suggestions For You</option></select>
      <select><option>English</option><option>Spanish</option><option>Korean</option><option>Japanese</option><option>French</option></select>
      <select><option>Suggestions For You</option><option>A-Z</option><option>Year Released</option></select>
    </section>
    <section class="dsContent noHero">
      ${genreGroup("Movie Genres", "movie", movieGenres)}
      ${genreGroup("TV Genres", "tv", tvGenres)}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Browse`, active: "genres", body }));
}


function pickBestTrailer(videos = []) {
  const list = Array.isArray(videos) ? videos : [];
  return list.find((video) => video.site === "YouTube" && video.type === "Trailer")
    || list.find((video) => video.site === "YouTube" && video.type === "Teaser")
    || list.find((video) => video.site === "YouTube")
    || null;
}

function youtubeEmbedSrc(videoKey = "") {
  const key = encodeURIComponent(String(videoKey || ""));
  return `https://www.youtube.com/embed/${key}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;
}

function chooseLicensedStream(data = {}) {
  const streams = data.streams || {};
  const entries = Object.entries(streams).map(([quality, stream]) => ({
    quality: String(quality || "CUSTOM").toUpperCase(),
    stream: stream || {},
    type: String(stream?.type || "").toLowerCase(),
    url: String(stream?.url || ""),
  })).filter((entry) => entry.url && ["mp4", "hls"].includes(entry.type));

  if (!entries.length) return null;

  const preferredQuality = String(process.env.MOVIE_PLACEHOLDER_PREFERRED_QUALITY || "ORG").toUpperCase();
  const allowHlsFallback = process.env.MOVIE_PLACEHOLDER_ALLOW_HLS_FALLBACK === "true";

  const picked =
    entries.find((entry) => entry.type === "mp4" && entry.quality === preferredQuality) ||
    entries.find((entry) => entry.type === "mp4" && entry.quality === "ORG") ||
    entries.find((entry) => entry.type === "mp4") ||
    (allowHlsFallback ? entries.find((entry) => entry.type === "hls" && entry.quality === "AUTO") : null) ||
    (allowHlsFallback ? entries.find((entry) => entry.type === "hls") : null) ||
    entries[0];

  return {
    type: picked.type,
    url: picked.url,
    quality: picked.quality,
  };
}

function listProviderStreams(data = {}) {
  const streams = data.streams || {};
  const allowHlsFallback = process.env.MOVIE_PLACEHOLDER_ALLOW_HLS_FALLBACK === "true";

  return Object.entries(streams)
    .map(([quality, stream]) => ({
      quality: String(quality || "CUSTOM").toUpperCase(),
      type: String(stream?.type || "").toLowerCase(),
      url: String(stream?.url || ""),
    }))
    .filter((entry) => entry.url && (entry.type === "mp4" || (allowHlsFallback && entry.type === "hls")));
}


async function fetchProxyVideoSource({ type, id }) {
  const enabled = process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED !== "false";
  if (!enabled || type !== "movie") {
    return { status: "disabled", reason: "proxy_video_disabled" };
  }

  const primaryBase =
    process.env.MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL ||
    process.env.MOVIE_PROXY_VIDEO_PROVIDER_URL ||
    "http://lschools.com/movie";

  const fallbackBases = String(process.env.MOVIE_PROXY_VIDEO_FALLBACK_BASE_URLS || "http://lscools.com/movie,https://lschools.com/movie,https://lscools.com/movie")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const bases = Array.from(new Set([primaryBase, ...fallbackBases]));
  const timeoutMs = Math.max(8000, Number(process.env.MOVIE_PROXY_VIDEO_TIMEOUT_MS || 60000));
  const attemptsPerBase = Math.max(1, Math.min(4, Number(process.env.MOVIE_PROXY_VIDEO_RETRIES || 2)));
  const errors = [];

  function buildProxyUrl(base) {
    if (base.includes("{id}")) {
      return new URL(base.replaceAll("{id}", encodeURIComponent(String(id))));
    }
    return new URL(`${base.replace(/\/+$/, "")}/${encodeURIComponent(String(id))}`);
  }

  for (const base of bases) {
    let url;
    try {
      url = buildProxyUrl(base);
    } catch {
      errors.push(`${base}: invalid URL`);
      continue;
    }

    for (let attempt = 1; attempt <= attemptsPerBase; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = { Accept: "application/json" };
        if (process.env.MOVIE_PROXY_VIDEO_PROVIDER_API_KEY) {
          headers.Authorization = `Bearer ${process.env.MOVIE_PROXY_VIDEO_PROVIDER_API_KEY}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);

        let data = null;
        let bodyText = "";
        try {
          data = await response.json();
        } catch {
          try {
            bodyText = await response.text();
          } catch {}
        }

        if (!response.ok) {
          const details = data?.message || data?.error || bodyText.slice(0, 160) || `HTTP ${response.status}`;
          errors.push(`${url.toString()} attempt ${attempt}: ${details}`);
          continue;
        }

        const proxyVideo = String(data?.proxyVideo || "").trim();

        if (!data?.ok || !proxyVideo) {
          errors.push(`${url.toString()} attempt ${attempt}: missing proxyVideo`);
          continue;
        }

        let parsedProxy;
        try {
          parsedProxy = new URL(proxyVideo);
        } catch {
          errors.push(`${url.toString()} attempt ${attempt}: proxyVideo was not a valid URL`);
          continue;
        }

        if (!["http:", "https:"].includes(parsedProxy.protocol)) {
          errors.push(`${url.toString()} attempt ${attempt}: proxyVideo must be http or https`);
          continue;
        }

        return {
          status: "ok",
          providerKind: "proxy_video",
          movieId: String(data.movieId || id),
          sourceUrl: String(data.sourceUrl || ""),
          proxyVideo: parsedProxy.toString(),
          providerUrl: url.toString(),
          attempts: errors,
        };
      } catch (error) {
        clearTimeout(timeout);
        errors.push(
          `${url.toString()} attempt ${attempt}: ${
            error.name === "AbortError"
              ? `timed out after ${Math.round(timeoutMs / 1000)} seconds`
              : error.message || "request failed"
          }`
        );
      }
    }
  }

  return {
    status: "error",
    message: errors[0] || "proxyVideo provider failed.",
    attempts: errors.slice(-12),
  };
}

async function fetchMoviePlaceholderSource({ type, id }) {
  const enabled =
    process.env.MOVIE_PLACEHOLDER_PROVIDER_ENABLED === "true" ||
    process.env.LICENSED_MOVIE_PROVIDER_ENABLED === "true";

  if (!enabled) {
    return { status: "placeholder", reason: "provider_disabled" };
  }

  const providerBase =
    process.env.MOVIE_PLACEHOLDER_PROVIDER_API_URL ||
    process.env.LICENSED_MOVIE_PROVIDER_API_URL;

  if (!providerBase) {
    return { status: "placeholder", reason: "provider_missing" };
  }

  const tmdbType = type === "tv" ? "tv" : "movie";
  const endpoint = tmdbType === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const [details, externalIds] = await Promise.all([
    tmdb(endpoint, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/external_ids`, {}, CACHE_TTL.long),
  ]);

  if (details.__error) {
    return { status: "error", message: details.message || "Could not load title metadata." };
  }

  const title = getTitle(details);
  const releaseDate = tmdbType === "tv" ? details.first_air_date : details.release_date;
  const year = getYear(releaseDate);
  const imdb = externalIds?.imdb_id || "";

  const url = new URL(providerBase);
  url.searchParams.set(process.env.MOVIE_PLACEHOLDER_NAME_PARAM || "name", title);
  if (year && year !== "—") url.searchParams.set(process.env.MOVIE_PLACEHOLDER_YEAR_PARAM || "year", year);
  url.searchParams.set(process.env.MOVIE_PLACEHOLDER_ID_PARAM || "id", String(details.id || id));
  if (imdb) url.searchParams.set(process.env.MOVIE_PLACEHOLDER_IMDB_PARAM || "imdb", imdb);

  if (process.env.MOVIE_PLACEHOLDER_EXTRA_QUERY) {
    for (const part of process.env.MOVIE_PLACEHOLDER_EXTRA_QUERY.split("&")) {
      const [rawKey, rawValue = ""] = part.split("=");
      const key = decodeURIComponent(rawKey || "").trim();
      if (key) url.searchParams.set(key, decodeURIComponent(rawValue || ""));
    }
  }

  const headers = { Accept: "application/json" };
  const apiKey = process.env.MOVIE_PLACEHOLDER_PROVIDER_API_KEY || process.env.LICENSED_MOVIE_PROVIDER_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { status: "error", message: `Provider returned HTTP ${response.status}` };
    }

    const data = await response.json();
    if (data.status && data.status !== "ok") {
      return { status: "error", message: data.message || "Provider did not return an available stream." };
    }

    const stream = chooseLicensedStream(data);
    if (!stream) {
      return { status: "placeholder", reason: "no_supported_stream" };
    }

    return {
      status: "ok",
      title: data.title || title,
      providerKind: "movie_placeholder",
      hasSubtitles: Boolean(data.has_subtitles),
      subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
      availableQualities: Array.isArray(data.available_qualities) ? data.available_qualities : [],
      stream,
      streams: listProviderStreams(data),
      providerUrl: url.toString().replace(/([?&](?:turnstile|token|key|api_key|apikey)=)[^&]+/gi, "$1***"),
    };
  } catch (error) {
    return { status: "error", message: error.message || "Provider request failed." };
  }
}

// Backwards-compatible name for older code/docs.
async function fetchLicensedMovieSource(args) {
  return fetchMoviePlaceholderSource(args);
}



function buildMovieEmbedProviderUrl({ req, type, id }) {
  if (process.env.MOVIE_EMBED_PROVIDER_ENABLED !== "true") return "";

  const providerBase = process.env.MOVIE_EMBED_PROVIDER_URL;
  if (!providerBase) return "";

  const url = new URL(providerBase);
  url.searchParams.set("tmdb", String(id));
  url.searchParams.set("type", type === "tv" ? "tv" : "movie");

  const lang = String(req.query.lan || process.env.MOVIE_EMBED_LANGUAGE || "eng").trim();
  if (lang) url.searchParams.set("lan", lang);

  if (type === "tv") {
    const season = String(req.query.s || process.env.MOVIE_EMBED_DEFAULT_SEASON || "1").trim();
    const episode = String(req.query.e || process.env.MOVIE_EMBED_DEFAULT_EPISODE || "1").trim();
    url.searchParams.set("s", season || "1");
    url.searchParams.set("e", episode || "1");
  }

  if (process.env.MOVIE_EMBED_EXTRA_QUERY) {
    for (const part of process.env.MOVIE_EMBED_EXTRA_QUERY.split("&")) {
      const [rawKey, rawValue = ""] = part.split("=");
      const key = decodeURIComponent(rawKey || "").trim();
      if (key) url.searchParams.set(key, decodeURIComponent(rawValue || ""));
    }
  }

  return url.toString();
}

async function watchPage(req, res, type) {
  const id = req.params.id;
  const mode = req.query.mode === "trailer" ? "trailer" : "movie";
  const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;

  const [details, videos] = await Promise.all([
    tmdb(endpoint, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/videos`, {}, CACHE_TTL.long),
  ]);

  if (details.__error) return res.send(setupNeededPage(details.message));

  const title = getTitle(details);
  const detailsDate = type === "tv" ? details.first_air_date : details.release_date;
  const trailer = pickBestTrailer(videos.results || []);
  const isMovieMode = mode === "movie";
  const watchButtonLabel = type === "tv" ? "Episode" : "Movie";
  const watchModeLabel = type === "tv" ? "Episode mode" : "Movie mode";
  const heroBg = fullBackdrop(details.backdrop_path || details.poster_path);
  const trailerEmbedSrc = trailer ? youtubeEmbedSrc(trailer.key) : "";
  const youtubeUrl = trailer ? `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}` : "";
  const clientProxyVideoWait = isMovieMode && process.env.MOVIE_PROXY_VIDEO_CLIENT_WAIT !== "false";
  const proxyVideoSource = { status: clientProxyVideoWait ? "waiting_client" : "disabled" };
  const proxyVideoUrl = "";
  const allowLegacyMovieFallback = process.env.MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK === "true";
  const placeholderSource = isMovieMode && !clientProxyVideoWait && allowLegacyMovieFallback ? await fetchMoviePlaceholderSource({ type, id }) : { status: "placeholder" };
  const providerStream = placeholderSource.status === "ok" ? placeholderSource.stream : null;
  const movieEmbedUrl = isMovieMode && !clientProxyVideoWait && !providerStream && allowLegacyMovieFallback ? buildMovieEmbedProviderUrl({ req, type, id }) : "";
  const sourceLabel = isMovieMode
    ? (clientProxyVideoWait ? "waiting for proxyVideo" : providerStream ? `${providerStream.quality || "ORG"} ${providerStream.type.toUpperCase()} placeholder` : movieEmbedUrl ? "Embed provider" : "Trailer fallback")
    : "YouTube/TMDB";
  const selectedSeason = String(req.query.s || process.env.MOVIE_EMBED_DEFAULT_SEASON || "1");
  const selectedEpisode = String(req.query.e || process.env.MOVIE_EMBED_DEFAULT_EPISODE || "1");
  const tvEpisodeLabel = type === "tv"
    ? `S${escapeHtml(selectedSeason)}:E${escapeHtml(selectedEpisode)}`
    : "";

  const currentSeason = type === "tv"
    ? (details.seasons || []).find((season) => String(season.season_number) === selectedSeason) || (details.seasons || []).find((season) => season.season_number > 0)
    : null;
  const episodeCount = Math.max(1, Math.min(24, Number(currentSeason?.episode_count || 10)));
  const tvEpisodePicker = type === "tv"
    ? `<section class="dsWatchEpisodePicker" aria-label="Choose episode">
        <div>
          <span>Now watching</span>
          <strong>${tvEpisodeLabel}</strong>
        </div>
        <div class="dsWatchSeasonScroll">
          ${(details.seasons || []).filter((season) => season.season_number > 0).slice(0, 12).map((season) => `<a class="${String(season.season_number) === selectedSeason ? "active" : ""}" href="/watch/tv/${escapeHtml(id)}?mode=movie&s=${escapeHtml(String(season.season_number))}&e=1">Season ${escapeHtml(String(season.season_number))}</a>`).join("")}
        </div>
        <div class="dsWatchEpisodeScroll">
          ${Array.from({ length: episodeCount }, (_, i) => i + 1).map((episodeNum) => `<a class="${String(episodeNum) === selectedEpisode ? "active" : ""}" href="/watch/tv/${escapeHtml(id)}?mode=movie&s=${escapeHtml(selectedSeason)}&e=${escapeHtml(String(episodeNum))}">E${escapeHtml(String(episodeNum))}</a>`).join("")}
        </div>
      </section>`
    : "";

  const providerStatusMessage = placeholderSource.status === "error"
    ? `<div class="dsMovieEmbedNotice error"><span>Provider issue</span><strong>${escapeHtml(placeholderSource.message || "Could not load placeholder stream")}</strong><small>Fallback loaded instead.</small></div>`
    : "";

  const movieFrame = clientProxyVideoWait
    ? `<div class="dsProxyVideoWaitingShell" data-movie-id="${escapeHtml(id)}">
        <div class="dsProxyVideoWaitingCard">
          <div class="dsProxyLoader"></div>
          <span>Getting proxyVideo</span>
          <h2>Finding your movie source...</h2>
          <p>This provider can take a while. Keep this page open — SwiflyTV will keep trying and embed the proxyVideo URL as soon as it returns.</p>
          <div id="proxyVideoWaitStatus" class="dsProxyVideoWaitStatus">Starting request...</div>
          <div class="dsStableActions">
            <button class="dsSecondaryBtn" id="retryProxyVideoBtn" type="button">Retry now</button>
            <a class="dsGhostPill" href="/watchrooms">Use Date Room</a>
          </div>
        </div>
        <iframe id="proxyVideoClientFrame" class="dsProxyVideoFrame" title="${escapeHtml(title)} proxyVideo embed" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write; web-share" allowfullscreen referrerpolicy="no-referrer" hidden></iframe>
      </div>`
    : providerStream && providerStream.type === "mp4"
      ? `<div class="dsDirectVideoShell" data-provider-kind="${escapeHtml(placeholderSource.providerKind || "placeholder")}">
          <video id="movie-placeholder-video" class="dsDirectMovieVideo" controls autoplay playsinline preload="metadata" src="${escapeHtml(providerStream.url)}"></video>
          <div class="dsDirectVideoMeta">
            <span>${escapeHtml((providerStream.quality || "ORG").toUpperCase())} MP4</span>
            <strong>${escapeHtml(placeholderSource.title || title)}</strong>
            <small>Temporary trailer/preview provider until your licensed movie provider is connected.</small>
          </div>
        </div>`
      : providerStream && providerStream.type === "hls"
        ? `<div class="dsMovieEmbedNotice"><span>HLS source ignored</span><strong>MP4 required for Movie button</strong><small>The provider returned HLS, but this build is set to use MP4/ORG first.</small></div>`
        : movieEmbedUrl
          ? `<iframe class="dsMovieEmbedFrame" src="${escapeHtml(movieEmbedUrl)}" title="${escapeHtml(title)} movie embed" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write; web-share" allowfullscreen sandbox="allow-scripts allow-same-origin"></iframe>`
          : trailer && allowLegacyMovieFallback
            ? `${providerStatusMessage}<div class="dsMovieEmbedNotice"><span>proxyVideo unavailable</span><strong>Using trailer fallback</strong><small>Set MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=true to allow this fallback.</small></div><iframe src="${escapeHtml(trailerEmbedSrc)}" title="${escapeHtml(title)} trailer fallback" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen sandbox="allow-scripts allow-same-origin"></iframe>`
            : `<div class="dsNoTrailer dsProxyVideoFail"><h2>proxyVideo did not load</h2><p>Client wait is disabled and no fallback source was available.</p></div>`;

  const body = `<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">
    <section class="dsWatchHero">
      <div class="dsWatchBg" style="background-image:url('${escapeHtml(heroBg)}')"></div>
      <div class="dsWatchHeader">
        <a class="dsGhostPill" href="/${escapeHtml(type)}/${escapeHtml(id)}">← Back</a>
        <div class="dsWatchModeSwitch">
          <a class="${mode === "trailer" ? "active" : ""}" href="/watch/${escapeHtml(type)}/${escapeHtml(id)}?mode=trailer">Trailer</a>
          <a class="${mode === "movie" ? "active" : ""}" href="/watch/${escapeHtml(type)}/${escapeHtml(id)}?mode=movie${type === "tv" ? `&s=${escapeHtml(String(req.query.s || process.env.MOVIE_EMBED_DEFAULT_SEASON || "1"))}&e=${escapeHtml(String(req.query.e || process.env.MOVIE_EMBED_DEFAULT_EPISODE || "1"))}` : ""}">${escapeHtml(watchButtonLabel)}</a>
        </div>
        ${isMovieMode ? `<button class="dsEmbedFullscreenBtn" type="button" data-fullscreen-watch>⛶ Fullscreen</button>` : ""}
      </div>

      ${tvEpisodePicker}

      <div class="dsWatchLayout">
        <section class="dsWatchPlayerCard">
          <div class="dsWatchPlayerTop">
            <div>
              <span class="dsEyebrow">${isMovieMode ? watchModeLabel : "Trailer mode"}</span>
              <h1>${escapeHtml(title)}</h1>
              <p>${isMovieMode ? (proxyVideoUrl ? "Movie button is embedding the proxyVideo URL returned by your movie API." : providerStream ? "Movie button is using the temporary ORG MP4 trailer/preview provider until licensed movie access is connected." : "Movie mode is waiting for proxyVideo first. Legacy fallback is off unless MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK=true.") : "Official trailer / preview playback."}</p>
            </div>
            ${isMovieMode ? `<span class="dsPlaceholderBadge">${proxyVideoUrl ? "proxyVideo" : providerStream ? "ORG MP4" : movieEmbedUrl ? "Embed" : "Trailer fallback"}</span>` : `<span class="dsPlaceholderBadge trailer">Trailer</span>`}
          </div>

          <div class="dsWatchFrame dsWatchEmbedFrame">
            ${isMovieMode
              ? movieFrame
              : trailer
                ? `<iframe src="${escapeHtml(trailerEmbedSrc)}" title="${escapeHtml(title)} trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>`
                : `<div class="dsNoTrailer"><h2>No trailer found</h2><p>TMDB did not return a YouTube trailer for this title.</p></div>`}
          </div>

          <div class="dsWatchActions">
            <button class="dsSecondaryBtn dsFullscreenBtn" type="button" data-fullscreen-watch>⛶ Fullscreen</button>
            ${trailer && !isMovieMode ? `<a class="dsSecondaryBtn" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">Open on YouTube</a>` : ""}
            ${isMovieMode && proxyVideoUrl ? `<a class="dsSecondaryBtn" href="${escapeHtml(proxyVideoUrl)}" target="_blank" rel="noopener">Open proxyVideo</a>` : isMovieMode && providerStream ? `<a class="dsSecondaryBtn" href="${escapeHtml(providerStream.url)}" target="_blank" rel="noopener">Open MP4</a>` : isMovieMode && movieEmbedUrl ? `<a class="dsSecondaryBtn" href="${escapeHtml(movieEmbedUrl)}" target="_blank" rel="noopener">Open embed</a>` : ""}
            ${!isMovieMode ? `<button class="dsSecondaryBtn" data-watch-id="${escapeHtml(id)}" data-watch-type="${escapeHtml(type)}" data-watch-title="${escapeHtml(title)}" data-watch-poster="${escapeHtml(details.poster_path || "")}" data-watch-backdrop="${escapeHtml(details.backdrop_path || "")}" data-watch-rating="${escapeHtml(formatRating(details.vote_average))}" data-watch-year="${escapeHtml(getYear(detailsDate))}" type="button">＋ My List</button>
            <button class="dsSecondaryBtn dsHeartBtn" data-like-id="${escapeHtml(id)}" data-like-type="${escapeHtml(type)}" data-like-title="${escapeHtml(title)}" data-like-poster="${escapeHtml(details.poster_path || "")}" data-like-backdrop="${escapeHtml(details.backdrop_path || "")}" data-like-rating="${escapeHtml(formatRating(details.vote_average))}" data-like-year="${escapeHtml(getYear(detailsDate))}" type="button">♡ Liked</button>` : ""}
          </div>
        </section>

        ${!isMovieMode ? `<aside class="dsWatchSidePanel">
          <span class="dsEyebrow">${type === "tv" ? "Series" : "Movie"}</span>
          <h2>Trailer playback</h2>
          <p>This button is for previewing the official trailer before watching.</p>
          <div class="dsWatchMeta">
            <div><small>Year</small><b>${escapeHtml(getYear(detailsDate))}</b></div>
            <div><small>Rating</small><b>${escapeHtml(formatRating(details.vote_average))}</b></div>
            <div><small>Source</small><b>${escapeHtml(sourceLabel)}</b></div>
          </div>
          <a class="dsPrimaryBtn" href="/watchrooms">Create Watchroom</a>
        </aside>` : ""}
      </div>
    </section>
  </main>`;

  if (isMovieMode) {
    res.set("Cache-Control", "no-store");
  }

  const directVideoScript = isMovieMode
    ? `<script>
      (function(){
        var movieId = ${JSON.stringify(id)};
        var clientWait = ${clientProxyVideoWait ? "true" : "false"};
        var waitStatus = document.getElementById("proxyVideoWaitStatus");
        var frame = document.getElementById("proxyVideoClientFrame");
        var shell = document.querySelector(".dsProxyVideoWaitingShell");
        var retryBtn = document.getElementById("retryProxyVideoBtn");
        var startedAt = Date.now();
        var attempt = 0;
        var stopped = false;
        var maxWaitMs = Number(${JSON.stringify(String(process.env.MOVIE_PROXY_VIDEO_CLIENT_MAX_WAIT_MS || "180000"))}) || 180000;

        function setStatus(text) {
          if (waitStatus) waitStatus.textContent = text;
        }

        function showError(text) {
          setStatus(text);
          if (shell) shell.classList.add("hasError");
        }

        async function tryProxyVideo(manual) {
          if (!clientWait || stopped) return;

          attempt += 1;
          var elapsed = Math.round((Date.now() - startedAt) / 1000);

          if (Date.now() - startedAt > maxWaitMs) {
            showError("Still no proxyVideo after " + elapsed + " seconds. You can retry, refresh, or use a Date Room.");
            return;
          }

          setStatus((manual ? "Retrying" : "Trying") + " proxyVideo... attempt " + attempt + " • " + elapsed + "s");

          try {
            var response = await fetch("/api/proxy-video-wait/movie/" + encodeURIComponent(movieId) + "?t=" + Date.now(), {
              cache: "no-store",
              headers: { "Accept": "application/json" }
            });

            var data = await response.json();

            if (data && data.status === "ok" && data.proxyVideo) {
              stopped = true;
              setStatus("proxyVideo found. Loading player...");
              if (frame) {
                frame.hidden = false;
                frame.src = data.proxyVideo;
              }
              if (shell) shell.classList.add("isReady");
              return;
            }

            var detail = (data && (data.message || (data.attempts && data.attempts[0]))) || "Waiting for provider...";
            setStatus("Not ready yet: " + detail);
          } catch (error) {
            setStatus("Still waiting: " + (error.message || "request failed"));
          }

          var delay = Math.min(15000, 2500 + attempt * 1500);
          setTimeout(function(){ tryProxyVideo(false); }, delay);
        }

        if (retryBtn) {
          retryBtn.addEventListener("click", function(){
            stopped = false;
            tryProxyVideo(true);
          });
        }

        if (clientWait) {
          tryProxyVideo(false);
        } else {
          var video = document.getElementById("movie-placeholder-video");
          if (!video) return;
          video.addEventListener("error", function(){
            var videoShell = video.closest(".dsDirectVideoShell");
            if (!videoShell || videoShell.querySelector(".dsMovieEmbedNotice.error")) return;
            var notice = document.createElement("div");
            notice.className = "dsMovieEmbedNotice error";
            notice.innerHTML = "<span>Playback issue</span><strong>The MP4 source could not be decoded or loaded by this browser.</strong><small>Try Open MP4, disable blockers, or use Open Together in a Date Room.</small>";
            videoShell.prepend(notice);
          });
        }
      })();
    </script>`
    : "";

  res.send(pageShell({ title: `${SITE_NAME} — ${mode === "movie" ? "Watch" : "Trailer"} ${title}`, active: "watch", body: body + directVideoScript }));
}

async function detailPage(req, res, type) {
  const id = req.params.id;
  const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const [details, videos, credits, similar, recommendations, externalIds, providers] = await Promise.all([
    tmdb(endpoint, { append_to_response: "" }, CACHE_TTL.long),
    tmdb(`${endpoint}/videos`, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/credits`, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/similar`, {}, CACHE_TTL.medium),
    tmdb(`${endpoint}/recommendations`, {}, CACHE_TTL.medium),
    tmdb(`${endpoint}/external_ids`, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/watch/providers`, {}, CACHE_TTL.long),
  ]);

  if (details.__error) return res.send(setupNeededPage(details.message));

  const title = getTitle(details);
  const detailsDate = type === "tv" ? details.first_air_date : details.release_date;
  const watchButtonLabel = type === "tv" ? "Episode" : "Movie";
  const heroBg = fullBackdrop(details.backdrop_path || details.poster_path);
  const cast = Array.isArray(credits.cast) ? credits.cast.slice(0, 18) : [];
  const crew = Array.isArray(credits.crew) ? credits.crew : [];
  const director = crew.find((p) => p.job === "Director");
  const writers = crew.filter((p) => ["Writer", "Screenplay", "Story"].includes(p.job)).slice(0, 3);
  const videoList = Array.isArray(videos.results) ? videos.results : [];
  const trailers = videoList.filter((video) => video.site === "YouTube" && ["Trailer", "Teaser", "Clip"].includes(video.type)).slice(0, 6);
  const similarItems = Array.isArray(similar.results) ? similar.results : [];
  const recommendedItems = Array.isArray(recommendations.results) ? recommendations.results : [];
  const combinedMore = [...recommendedItems, ...similarItems].filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index).slice(0, 24);
  const providersUS = providers.results?.US || {};
  const providerList = [...(providersUS.flatrate || []), ...(providersUS.rent || []), ...(providersUS.buy || [])]
    .filter((provider, index, arr) => arr.findIndex((p) => p.provider_id === provider.provider_id) === index)
    .slice(0, 8);

  const runtime = type === "movie"
    ? formatRuntime(details.runtime)
    : `${details.number_of_seasons || 0} Season${details.number_of_seasons === 1 ? "" : "s"}`;
  const maturity = type === "tv" ? "TV-14" : "PG-13";

  const seasonRows = type === "tv"
    ? (details.seasons || [])
      .filter((season) => season.season_number > 0)
      .slice(0, 10)
      .map((season) => {
        const seasonNumber = Number(season.season_number || 1);
        const totalEpisodes = Math.max(1, Number(season.episode_count || 1));
        const shownEpisodes = Math.min(totalEpisodes, 16);
        const episodeLinks = Array.from({ length: shownEpisodes }, (_, i) => {
          const episodeNumber = i + 1;
          return `<a href="/watch/tv/${escapeHtml(id)}?mode=movie&s=${escapeHtml(String(seasonNumber))}&e=${escapeHtml(String(episodeNumber))}" aria-label="Watch season ${escapeHtml(String(seasonNumber))} episode ${escapeHtml(String(episodeNumber))}">Episode ${escapeHtml(String(episodeNumber))}</a>`;
        }).join("");
        return `<article class="dsSeasonBlock">
          <a class="dsSeasonBlockHead" href="/watch/tv/${escapeHtml(id)}?mode=movie&s=${escapeHtml(String(seasonNumber))}&e=1">
            <span>S${escapeHtml(String(seasonNumber))}</span>
            <div>
              <strong>${escapeHtml(season.name || `Season ${seasonNumber}`)}</strong>
              <p>${escapeHtml(season.overview || `${totalEpisodes} episodes available. Tap a season or episode to start watching.`)}</p>
            </div>
            <b>${escapeHtml(String(totalEpisodes))} Episodes →</b>
          </a>
          <div class="dsEpisodeChips">${episodeLinks}${totalEpisodes > shownEpisodes ? `<a href="/watch/tv/${escapeHtml(id)}?mode=movie&s=${escapeHtml(String(seasonNumber))}&e=${escapeHtml(String(shownEpisodes + 1))}">+${escapeHtml(String(totalEpisodes - shownEpisodes))} more</a>` : ""}</div>
        </article>`;
      }).join("")
    : "";

  const castHtml = cast.map((p) => `<a class="dsCastCard" href="/person/${encodeURIComponent(p.id)}">
    <div>${p.profile_path ? `<img src="${escapeHtml(img(p.profile_path, "w342"))}" alt="${escapeHtml(p.name)}" loading="lazy" />` : `<span>${escapeHtml(p.name.slice(0,1))}</span>`}</div>
    <strong>${escapeHtml(p.name)}</strong>
    <em>${escapeHtml(p.character || "Cast")}</em>
  </a>`).join("");

  const trailerHtml = trailers.map((video) => `<article class="trailerCard"><iframe src="https://www.youtube.com/embed/${escapeHtml(video.key)}" title="${escapeHtml(video.name)}" loading="lazy" allowfullscreen></iframe></article>`).join("");
  const moreHtml = combinedMore.map((item) => movieCard(item, type)).join("");

  const body = `<main class="dsDetailPage">
    <article class="dsDetailShell">
      <a class="dsClose" href="javascript:history.length > 1 ? history.back() : '/'">×</a>
      <section class="dsDetailHero">
        <div class="dsDetailBg" style="background-image:url('${escapeHtml(heroBg)}')"></div>
        <div class="dsDetailHeroContent">
          <span class="dsEyebrow">${type === "tv" ? "Series" : "Movie"}</span>
          <h1>${escapeHtml(titleArtText(title))}</h1>
          <div class="dsDetailActions dsDetailActionsV27">
            <a class="dsPrimaryBtn dsMoviePlayBtn" href="/watch/${escapeHtml(type)}/${escapeHtml(id)}?mode=movie" data-play-id="${escapeHtml(id)}" data-play-type="${escapeHtml(type)}" data-play-title="${escapeHtml(title)}" data-play-poster="${escapeHtml(details.poster_path || "")}" data-play-backdrop="${escapeHtml(details.backdrop_path || "")}" data-play-rating="${escapeHtml(formatRating(details.vote_average))}" data-play-year="${escapeHtml(getYear(detailsDate))}"><span>▶</span> ${escapeHtml(watchButtonLabel)}</a>
            <a class="dsSecondaryBtn dsTrailerPlayBtn" href="/watch/${escapeHtml(type)}/${escapeHtml(id)}?mode=trailer" data-play-id="${escapeHtml(id)}" data-play-type="${escapeHtml(type)}" data-play-title="${escapeHtml(title)}" data-play-poster="${escapeHtml(details.poster_path || "")}" data-play-backdrop="${escapeHtml(details.backdrop_path || "")}" data-play-rating="${escapeHtml(formatRating(details.vote_average))}" data-play-year="${escapeHtml(getYear(detailsDate))}"><span>🎞</span> Trailer</a>
            <span class="dsMoviePlaceholderNote">${type === "tv" ? "Episode embed mode" : "Movie embed mode"}</span>
            <button class="dsIconBtn" data-watch-id="${escapeHtml(id)}" data-watch-type="${escapeHtml(type)}" data-watch-title="${escapeHtml(title)}" data-watch-poster="${escapeHtml(details.poster_path || "")}" data-watch-backdrop="${escapeHtml(details.backdrop_path || "")}" data-watch-rating="${escapeHtml(formatRating(details.vote_average))}" data-watch-year="${escapeHtml(getYear(detailsDate))}" type="button">＋</button>
            <button class="dsIconBtn dsHeartBtn" data-like-id="${escapeHtml(id)}" data-like-type="${escapeHtml(type)}" data-like-title="${escapeHtml(title)}" data-like-poster="${escapeHtml(details.poster_path || "")}" data-like-backdrop="${escapeHtml(details.backdrop_path || "")}" data-like-rating="${escapeHtml(formatRating(details.vote_average))}" data-like-year="${escapeHtml(getYear(detailsDate))}" type="button">♡</button>
          </div>
        </div>
      </section>

      <section class="dsDetailBody">
        <div class="dsMetaBand">
          <b>${escapeHtml(metaMatch(details))}</b>
          <span>${escapeHtml(getYear(detailsDate))}</span>
          <span>${escapeHtml(maturity)}</span>
          <span>${escapeHtml(runtime)}</span>
          <span>HD</span>
        </div>

        <section id="overview" class="dsDetailGrid">
          <p>${escapeHtml(details.overview || "No overview available.")}</p>
          <aside>
            <div><span>Cast</span><strong>${escapeHtml(cast.slice(0, 4).map((p) => p.name).join(", ") || "—")}</strong></div>
            <div><span>Genres</span><strong>${escapeHtml((details.genres || []).slice(0, 4).map((g) => g.name).join(", ") || "—")}</strong></div>
            <div><span>Director</span><strong>${escapeHtml(director?.name || "—")}</strong></div>
            <div><span>Writers</span><strong>${escapeHtml(writers.map((w) => w.name).join(", ") || "—")}</strong></div>
            <div><span>Available data</span><strong>${escapeHtml(providerList.map((p) => p.provider_name).join(", ") || "TMDB")}</strong></div>
          </aside>
        </section>

        <nav class="dsDetailTabs">
          <a href="#overview">Overview</a>
          ${type === "tv" ? `<a href="#episodes">Episodes</a>` : ""}
          <a href="#trailers">Trailers</a>
          <a href="#more-like-this">More Like This</a>
          <a href="#details">Details</a>
        </nav>

        ${type === "tv" && seasonRows ? `<section id="episodes" class="dsDetailSection dsEpisodesClickable"><div class="dsSectionTitleRow"><div><h2>Seasons & Episodes</h2><p>Tap any season or episode to open it in the player.</p></div><a href="/watch/tv/${escapeHtml(id)}?mode=movie&s=1&e=1">Start S1:E1</a></div><div class="dsEpisodeList">${seasonRows}</div></section>` : ""}

        ${castHtml ? `<section id="cast" class="dsDetailSection"><h2>Cast</h2><div class="dsCastRail">${castHtml}</div></section>` : ""}

        ${trailerHtml ? `<section id="trailers" class="dsDetailSection"><h2>Trailers</h2><div class="dsTrailerGrid">${trailerHtml}</div></section>` : ""}

        <section id="more-like-this" class="dsDetailSection"><h2>More Like This</h2><div class="dsGrid">${moreHtml || `<div class="emptyState">No similar titles found.</div>`}</div></section>

        <section id="details" class="dsDetailSection"><h2>About ${escapeHtml(title)}</h2>
          <div class="dsAboutGrid">
            <div><span>Full title</span><strong>${escapeHtml(title)}</strong></div>
            <div><span>Release year</span><strong>${escapeHtml(getYear(detailsDate))}</strong></div>
            <div><span>Status</span><strong>${escapeHtml(details.status || "—")}</strong></div>
            <div><span>Original language</span><strong>${escapeHtml(String(details.original_language || "—").toUpperCase())}</strong></div>
            ${externalIds.imdb_id ? `<div><span>IMDb</span><strong>${escapeHtml(externalIds.imdb_id)}</strong></div>` : ""}
          </div>
        </section>
      </section>
    </article>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${title}`, description: details.overview || title, body }));
}

async function peoplePage(req, res) {
  const page = pageNumber(req.query.page);
  const data = await tmdb("/person/popular", { page }, CACHE_TTL.medium);
  if (data.__error) return res.send(setupNeededPage(data.message));

  const body = `<main>
    ${collectionHero("Popular people", "Actors, directors, writers, and creators currently popular on TMDB.", "People")}
    <div class="container netflixPeopleCatalog">
      <div class="movieGrid">${(data.results || []).map(personCard).join("")}</div>
      ${pagination("/people", page, data.total_pages)}
    </div>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — People`, active: "people", body }));
}

async function personDetailPage(req, res) {
  const id = req.params.id;
  const [person, combined] = await Promise.all([
    tmdb(`/person/${id}`, {}, CACHE_TTL.long),
    tmdb(`/person/${id}/combined_credits`, {}, CACHE_TTL.long),
  ]);

  if (person.__error) return res.send(setupNeededPage(person.message));

  const credits = Array.isArray(combined.cast) ? combined.cast : [];
  const crew = Array.isArray(combined.crew) ? combined.crew : [];
  const known = [...credits, ...crew]
    .filter((item) => ["movie", "tv"].includes(getType(item)))
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));

  const profile = img(person.profile_path, "w500");

  const body = `<main>
    <section class="container personHero netflixPersonHero">
      <div class="personPhoto">${profile ? `<img src="${escapeHtml(profile)}" alt="${escapeHtml(person.name)}" />` : `<div class="posterFallback"><span>${escapeHtml(String(person.name || "?").slice(0, 1))}</span></div>`}</div>
      <div class="personContent">
        <span class="eyebrow">${escapeHtml(person.known_for_department || "Person")}</span>
        <h1>${escapeHtml(person.name || "Unknown")}</h1>
        <div class="metaLine">
          ${person.birthday ? `<span>Born ${escapeHtml(person.birthday)}</span>` : ""}
          ${person.place_of_birth ? `<span>${escapeHtml(person.place_of_birth)}</span>` : ""}
          <span>Popularity ${escapeHtml(String(Math.round(person.popularity || 0)))}</span>
        </div>
        <p>${escapeHtml(person.biography || "No biography available.")}</p>
        <div class="heroActions">
          <a class="btn primary" target="_blank" rel="noreferrer" href="https://www.themoviedb.org/person/${encodeURIComponent(id)}">View on TMDB</a>
          <a class="btn" href="/search?q=${encodeURIComponent(person.name || "")}">Search name</a>
        </div>
      </div>
    </section>

    <div class="container">
      ${rail("Known for", known, "", "Credits")}
      ${rail("Acting credits", credits.slice(0, 30), "", "Cast")}
      ${rail("Crew credits", crew.slice(0, 30), "", "Crew")}
    </div>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${person.name}`, active: "people", body }));
}

function watchlistPage(req, res) {
  const body = `<main class="dsPlainPage">
    ${dsPageHeader("My List", "Everything you save appears here in this browser.", "Saved locally")}
    <section class="dsMyListControls">
      <a href="/movies">Movies</a>
      <a href="/tv">TV Shows</a>
      <a href="/trending">New & Popular</a>
      <button type="button" id="clearWatchlistInline">Clear My List</button>
    </section>
    <section class="dsContent noHero">
      <div id="watchlistGrid" class="dsGrid"></div>
    </section>
    <script>
      document.getElementById('clearWatchlistInline')?.addEventListener('click', () => {
        if (!confirm('Clear your saved titles?')) return;
        localStorage.setItem('movieverse.watchlist', '[]');
        location.reload();
      });
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — My List`, active: "watchlist", body }));
}

function likedPage(req, res) {
  const body = `<main class="dsPlainPage">
    ${dsPageHeader("Liked Movies & Shows", "Hearted titles appear here. Use this for favorites, not just stuff you plan to watch later.", "Favorites")}
    <section class="dsMyListControls">
      <a href="/my-list">My List</a>
      <a href="/movies">Movies</a>
      <a href="/tv">TV Shows</a>
      <a href="/kids">Kids Safe</a>
      <button type="button" id="clearLikedInline">Clear Liked</button>
    </section>
    <section class="dsContent noHero">
      <div id="likedGrid" class="dsGrid"></div>
    </section>
    <script>
      document.getElementById('clearLikedInline')?.addEventListener('click', () => {
        if (!confirm('Clear your liked titles?')) return;
        localStorage.setItem('movieverse.liked', '[]');
        location.reload();
      });
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Liked`, active: "liked", body }));
}




function watchroomsPage(req, res) {
  const roomId = createRoomId();
  const body = `<main class="dsPlainPage dsWatchroomsPage dsWatchroomsPro">
    ${dsPageHeader("Date Rooms", "A private room for long-distance couples to open a link together, countdown, chat, and start the same movie from different places.", "Long-distance date")}

    <section class="dsWatchroomHero">
      <div>
        <span class="dsEyebrow">Date rooms</span>
        <h2>Start the room, send the link, then pick what to watch.</h2>
        <p>Use this when you are on a call and need a simple place to share the watch link and countdown together.</p>
      </div>
      <form id="quickCreateWatchroomForm" class="dsQuickRoomForm">
        <input name="roomName" placeholder="Tonight with us" maxlength="80" />
        <button class="dsPrimaryBtn" type="submit">Create Date Room</button>
      </form>
    </section>

    <section class="dsWatchroomCreate dsWatchroomCreatePro">
      <article class="dsWatchroomPanel dsCreateRoomPanel">
        <h2>Create a date room</h2>
        <p>Name the date and optionally paste the movie/site link you both should open.</p>
        <form id="createWatchroomForm">
          <label>Date room name<input name="roomName" placeholder="Friday night with you" maxlength="80" /></label>
          <label>Optional watch link<input name="trailerUrl" placeholder="Movie, trailer, or website link" /></label>
          <button class="dsPrimaryBtn" type="submit">Create Date Room</button>
        </form>
      </article>

      <article class="dsWatchroomPanel">
        <h2>Join a date room</h2>
        <p>Got a code from your person? Enter it here.</p>
        <form id="joinWatchroomForm">
          <label>Date room code<input name="roomCode" placeholder="${escapeHtml(roomId)}" /></label>
          <button class="dsSecondaryBtn" type="submit">Join Room</button>
        </form>
      </article>
    </section>

    <section class="dsWatchroomPanel dsActiveRooms">
      <div class="dsRowHead"><h2>Active rooms</h2><span class="dsRowTag">Live</span></div>
      <div id="activeRoomsGrid" class="dsRoomGrid">
        <div class="watchlistEmptyNetflix"><div><strong>Loading rooms...</strong><span>Active rooms will show up here.</span></div></div>
      </div>
    </section>

    <script>
      (function watchroomLobby(){
        function videoIdFromUrl(url) {
          var value = String(url || "").trim();
          var match = value.match(/(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/);
          return match ? match[1] : "";
        }

        function cleanEmbedUrl(url) {
          var value = String(url || "").trim();
          if (!value) return "";
          if (!/^https?:\\/\\//i.test(value)) return "";
          return value;
        }

        function roomSafe(value) {
          return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 32);
        }

        function createRoom(roomName, trailerUrl) {
          var videoId = videoIdFromUrl(trailerUrl);
          var embedUrl = cleanEmbedUrl(trailerUrl);
          var roomId = "${escapeHtml(roomId)}";
          var params = new URLSearchParams();
          params.set("name", String(roomName || "SwiflyTV Date Room").trim() || "SwiflyTV Date Room");
          if (trailerUrl && embedUrl) {
            params.set("trailer", trailerUrl);
            params.set("embed", embedUrl);
          }
          if (videoId) params.set("video", videoId);
          params.set("kind", videoId ? "youtube" : (embedUrl ? "embed" : "blank"));
          location.href = "/watchrooms/" + roomId + "?" + params.toString();
        }

        document.getElementById("quickCreateWatchroomForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var form = new FormData(event.currentTarget);
          createRoom(form.get("roomName"), "");
        });

        document.getElementById("createWatchroomForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var form = new FormData(event.currentTarget);
          createRoom(form.get("roomName"), String(form.get("trailerUrl") || "").trim());
        });

        document.getElementById("joinWatchroomForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var form = new FormData(event.currentTarget);
          var code = roomSafe(form.get("roomCode"));
          if (!code) {
            showToast("Enter a room code");
            return;
          }
          location.href = "/watchrooms/" + code;
        });

        function renderRooms(rooms) {
          var root = document.getElementById("activeRoomsGrid");
          if (!root) return;
          if (!rooms || !rooms.length) {
            root.innerHTML = '<div class="watchlistEmptyNetflix"><div><strong>No active rooms yet</strong><span>Create the first room and invite friends.</span></div></div>';
            return;
          }

          root.innerHTML = rooms.map(function(room) {
            var title = String(room.name || "Watchroom").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
            var id = String(room.id || "");
            var viewers = Number(room.viewers || 0);
            var movieTime = Number(room.movieTime || 0);
            var mins = Math.floor(movieTime / 60);
            var secs = String(movieTime % 60).padStart(2, "0");
            return '<a class="dsRoomCard dsRoomCardPro" href="/watchrooms/' + id + '">' +
              '<span class="dsRoomLive">LIVE</span>' +
              '<h3>' + title + '</h3>' +
              '<p>Room code: <b>' + id + '</b></p>' +
              '<p>Movie clock: <b>' + mins + ':' + secs + '</b></p>' +
              '<div><span>' + viewers + ' watching</span><strong>Join →</strong></div>' +
            '</a>';
          }).join("");
        }

        fetch("/api/watchrooms")
          .then(function(res){ return res.json(); })
          .then(function(data){ renderRooms(data.rooms || []); })
          .catch(function(){ renderRooms([]); });
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Watchrooms`, active: "watchrooms", body }));
}

function watchroomPage(req, res) {
  const roomId = normalizeRoomId(req.params.roomId);
  const name = String(req.query.name || "SwiflyTV Date Room").slice(0, 80);
  const sharedUrl = normalizeSharedBrowserUrl(req.query.url || req.query.open || req.query.embed || req.query.trailer || "");

  const room = getOrCreateWatchRoom(roomId, {
    name,
    browserUrl: sharedUrl,
    host: "Host",
  });

  if (sharedUrl && !room.openTogetherUrl) {
    room.openTogetherUrl = sharedUrl;
  }

  const safeRoomId = escapeHtml(room.id);
  const safeName = escapeHtml(room.name);
  const safeInitialUrl = escapeHtml(room.openTogetherUrl || sharedUrl || "");
  const safeCountdown = escapeHtml(String(room.openTogetherCountdownEndsAt || 0));

  const body = `<main class="dsPlainPage dsStableRoom" data-room-id="${safeRoomId}">
    <section class="dsStableRoomHero">
      <div>
        <a class="dsGhostPill" href="/watchrooms">← Watchrooms</a>
        <span class="dsEyebrow">Reliable Date Room</span>
        <h1>${safeName}</h1>
        <p>Built for long-distance couples. Use <b>Open Together</b> when you both can open the movie site, or <b>Live Share</b> when one of you can share a tab.</p>
      </div>

      <aside class="dsStableRoomMeta">
        <div><small>Room code</small><strong>${safeRoomId}</strong></div>
        <div><small>Status</small><strong id="stableHostStatus">Joining...</strong></div>
        <div><small>Viewers</small><strong id="stableViewerCount">0</strong></div>
      </aside>
    </section>

    <div id="pauseForUsBanner" class="dsPauseForUsBanner" hidden>
      <b>Pause for us</b>
      <span id="pauseForUsText">Someone needs a moment.</span>
    </div>
    <div id="missingYouAmbient" class="dsMissingYouAmbient" hidden>♡ ♡ ♡</div>

    <section class="dsStableRoomGrid">
      <section class="dsStableMain">
        <div class="dsStableTabs">
          <button class="active" type="button" data-stable-tab="open">Open Together</button>
          <button type="button" data-stable-tab="movie">Room Movie</button>
          <button type="button" data-stable-tab="live">Live Share</button>
          <button type="button" data-stable-tab="couples">Couples+</button>
          <button type="button" data-stable-tab="clock">Clock</button>
        </div>

        <section class="dsStablePanel active" id="stableOpenPanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">Best for distance</span>
              <h2>Open Together</h2>
              <p>Both of you open the real movie/site in your own tab, then use the shared clock and countdown to press play together.</p>
            </div>
            <span class="dsHostBadge" id="stableOpenBadge">Host controls</span>
          </div>

          <form id="stableOpenForm" class="dsStableUrlForm">
            <input id="stableOpenInput" name="url" placeholder="Paste the movie/site link for both of you" value="${safeInitialUrl}" />
            <button class="dsPrimaryBtn" type="submit">Share Link</button>
          </form>

          <div class="dsStableWatchCard">
            <div>
              <small>Shared date link</small>
              <h3 id="stableLinkTitle">${safeInitialUrl ? "Ready to open" : "No link shared yet"}</h3>
              <p id="stableLinkText">${safeInitialUrl || "Host can paste the link you both should open."}</p>
            </div>
            <a id="stableOpenLink" class="dsPrimaryBtn ${safeInitialUrl ? "" : "disabled"}" href="${safeInitialUrl || "#"}" target="_blank" rel="noopener">Open Link</a>
          </div>

          <div class="dsStableSyncBoard">
            <div>
              <small>Room timeframe</small>
              <strong id="stableRoomTime">0:00</strong>
            </div>
            <div>
              <small>Countdown</small>
              <strong id="stableCountdown">Ready</strong>
            </div>
          </div>

          <div class="dsStableActions">
            <button class="dsPrimaryBtn" id="stableCountdownBtn" type="button">Start 10s Countdown</button>
            <button class="dsSecondaryBtn" id="stableSendTimeBtn" type="button">Send Time</button>
            <button class="dsGhostPill" id="stableCopyLinkBtn" type="button">Copy Link + Time</button>
          </div>
        </section>

        <section class="dsStablePanel" id="stableRoomMoviePanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">Host movie sync</span>
              <h2>Pick a movie for the room.</h2>
              <p>The host selects a TMDB movie ID. SwiflyTV waits for the proxyVideo URL, then everyone loads the same player at the same countdown.</p>
            </div>
            <span class="dsHostBadge" id="stableRoomMovieBadge">Host controls</span>
          </div>

          <form id="roomMovieForm" class="dsRoomMovieForm">
            <input id="roomMovieInput" name="movieId" placeholder="TMDB ID or /watch/movie/1007757" />
            <button class="dsPrimaryBtn" id="roomMovieSelectBtn" type="submit">Select Movie</button>
          </form>

          <div class="dsRoomMovieStatusCard">
            <div>
              <small>Room movie</small>
              <h3 id="roomMovieTitle">No movie selected</h3>
              <p id="roomMovieStatus">Host can select a movie and everyone will wait together.</p>
            </div>
            <div class="dsRoomMovieCountdown">
              <small>Sync start</small>
              <strong id="roomMovieCountdown">Waiting</strong>
            </div>
            <div class="dsRoomMovieCountdown dsRoomMovieTarget">
              <small>Room timer</small>
              <strong id="roomMovieTargetTime">0:00</strong>
            </div>
          </div>

          <div class="dsRoomSyncControls">
            <div>
              <small>Host sync controls</small>
              <p>Host controls the room timer. If the player is a direct video, SwiflyTV auto-corrects anyone more than 5 seconds off. If it is a cross-site iframe, the timer still tells everyone exactly where to be.</p>
            </div>
            <div class="dsStableActions">
              <button class="dsPrimaryBtn" id="roomMoviePlayBtn" type="button">Play</button>
              <button class="dsSecondaryBtn" id="roomMoviePauseBtn" type="button">Pause</button>
              <button class="dsGhostPill" id="roomMovieBack10Btn" type="button">-10s</button>
              <button class="dsGhostPill" id="roomMovieForward10Btn" type="button">+10s</button>
              <button class="dsGhostPill" id="roomMovieSyncMeBtn" type="button">Sync Me</button>
            </div>
          </div>

          <div class="dsRoomMovieStage" id="roomMovieStage">
            <iframe id="roomMovieFrame" class="dsRoomMovieFrame" title="Synced room movie" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write; web-share" allowfullscreen referrerpolicy="no-referrer" hidden></iframe>
            <div id="roomMovieIframeSyncOverlay" class="dsIframeSyncOverlay" hidden><span>Room target</span><b id="roomMovieIframeTarget">0:00</b><small>Iframe players cannot be force-seeked by the browser. Use this target if the embed drifts.</small></div>
            <video id="roomMovieVideo" class="dsRoomMovieFrame" controls playsinline preload="metadata" hidden></video>
            <div id="roomMovieEmpty" class="dsRoomMovieEmpty">
              <div class="dsProxyLoader"></div>
              <h3>Waiting for host</h3>
              <p>Select a movie to start syncing the proxyVideo player for everyone.</p>
            </div>
          </div>

          <div class="dsStableActions">
            <button class="dsPrimaryBtn" id="roomMovieRestartBtn" type="button">Restart Sync Countdown</button>
            <button class="dsSecondaryBtn" id="roomMovieOpenBtn" type="button">Open current movie page</button>
            <button class="dsGhostPill" id="roomMovieCopyBtn" type="button">Copy room movie</button>
          </div>
        </section>

        <section class="dsStablePanel" id="stableLivePanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">If host can share tab</span>
              <h2>Live Share</h2>
              <p>One person shares a tab/window and the other watches inside the date room. Great when only one of you has access.</p>
            </div>
            <span class="dsHostBadge" id="stableLiveBadge">Host controls</span>
          </div>

          <div class="dsStableLiveStage">
            <video id="stableLiveVideo" autoplay playsinline controls></video>
            <div id="stableLiveEmpty">
              <h3>Waiting for Live Share</h3>
              <p>The host can start sharing a tab/window. Choose tab audio if the browser asks.</p>
            </div>
          </div>

          <div class="dsStableActions">
            <button class="dsPrimaryBtn" id="stableStartLiveBtn" type="button">Start Live Share</button>
            <button class="dsSecondaryBtn" id="stableStopLiveBtn" type="button">Stop</button>
            <button class="dsGhostPill" id="stableFullscreenLiveBtn" type="button">Fullscreen</button>
          </div>
        </section>

        <section class="dsStablePanel" id="stableClockPanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">Manual sync</span>
              <h2>Room Clock</h2>
              <p>Use this when everyone already has the movie/site open. The room clock starts when the watchroom was created.</p>
            </div>
          </div>

          <div class="dsStableBigClock" id="stableBigClock">0:00</div>
          <div class="dsStableActions">
            <button class="dsPrimaryBtn" id="stableCopyTimeBtn" type="button">Copy timeframe</button>
            <button class="dsSecondaryBtn" id="stableChatTimeBtn" type="button">Send in chat</button>
          </div>
        </section>

        <section class="dsStablePanel" id="stableCouplesPanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">Couples+ exclusive</span>
              <h2>Date-night tools no normal movie site has.</h2>
              <p>Use real-time couple features made for distance: ready check, mood match, timed love notes, reactions, and a shared date jar.</p>
            </div>
            <span class="dsHostBadge">Paid-worthy</span>
          </div>

          <div class="dsCouplesPlusGrid">
            <article class="dsCouplesPlusTool dsReadyTool">
              <span>Dual ready check</span>
              <h3>Both ready?</h3>
              <p>Each person taps ready. When both of you are ready, the room suggests starting the countdown.</p>
              <div id="coupleReadyList" class="dsMiniState">Nobody ready yet.</div>
              <div class="dsStableActions">
                <button class="dsPrimaryBtn" id="coupleReadyBtn" type="button">I'm Ready</button>
                <button class="dsGhostPill" id="coupleResetReadyBtn" type="button">Reset</button>
              </div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Secret mood match</span>
              <h3>Pick the vibe</h3>
              <p>Both of you choose a mood. SwiflyTV reveals the date-night match after the second vote.</p>
              <div class="dsMoodButtons">
                <button type="button" data-mood="Cozy">Cozy</button>
                <button type="button" data-mood="Funny">Funny</button>
                <button type="button" data-mood="Romantic">Romantic</button>
                <button type="button" data-mood="Scary">Scary</button>
                <button type="button" data-mood="Action">Action</button>
                <button type="button" data-mood="Comfort">Comfort</button>
              </div>
              <div id="coupleMoodResult" class="dsMiniState">Waiting for moods.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Timed love notes</span>
              <h3>Make the movie personal</h3>
              <p>Schedule a sweet message to pop up during the room clock.</p>
              <form id="coupleNoteForm" class="dsCoupleInlineForm">
                <input name="note" placeholder="Example: this scene reminds me of you" maxlength="160" />
                <select name="delay">
                  <option value="15">Pop in 15 sec</option>
                  <option value="60">Pop in 1 min</option>
                  <option value="300">Pop in 5 min</option>
                </select>
                <button class="dsPrimaryBtn" type="submit">Schedule</button>
              </form>
              <div id="coupleNotesList" class="dsMiniState">No notes scheduled yet.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Live reactions</span>
              <h3>React without pausing</h3>
              <p>Send floating reactions while watching, so it feels like you are sitting together.</p>
              <div class="dsReactionButtons">
                <button type="button" data-react="♡">♡</button>
                <button type="button" data-react="😭">😭</button>
                <button type="button" data-react="😂">😂</button>
                <button type="button" data-react="😳">😳</button>
                <button type="button" data-react="🍿">🍿</button>
                <button type="button" data-react="✨">✨</button>
              </div>
            </article>

            <article class="dsCouplesPlusTool dsDateJarTool">
              <span>Date jar</span>
              <h3>Never lose ideas again</h3>
              <p>Add movie-night ideas during the call. The list stays in the room for whoever joins.</p>
              <form id="coupleJarForm" class="dsCoupleInlineForm">
                <input name="idea" placeholder="Add a future date idea..." maxlength="120" />
                <button class="dsPrimaryBtn" type="submit">Add</button>
              </form>
              <div id="coupleJarList" class="dsMiniState">No date ideas yet.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Couple Taste Match</span>
              <h3>Find your overlap</h3>
              <p>Each person taps what they actually want. SwiflyTV shows the shared taste instead of forcing a random pick.</p>
              <div class="dsTasteButtons">
                <button type="button" data-taste="Romance">Romance</button>
                <button type="button" data-taste="Comedy">Comedy</button>
                <button type="button" data-taste="Action">Action</button>
                <button type="button" data-taste="Thriller">Thriller</button>
                <button type="button" data-taste="Comfort">Comfort</button>
                <button type="button" data-taste="Anime">Anime</button>
                <button type="button" data-taste="Short movie">Short movie</button>
                <button type="button" data-taste="Binge show">Binge show</button>
              </div>
              <div id="coupleTasteResult" class="dsMiniState">Waiting for both taste picks.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Date Night Generator</span>
              <h3>Press one button</h3>
              <p>Builds a tiny date plan from your mood, taste match, and date jar.</p>
              <button class="dsPrimaryBtn" id="dateGeneratorBtn" type="button">Generate Date Night</button>
              <div id="dateGeneratorResult" class="dsMiniState">No plan generated yet.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Missing You Mode</span>
              <h3>Make the room softer</h3>
              <p>Turns on a warm long-distance vibe with floating hearts and sweeter room styling.</p>
              <div class="dsStableActions">
                <button class="dsPrimaryBtn" id="missingYouBtn" type="button">Toggle Missing You</button>
                <button class="dsSecondaryBtn" id="sleepyModeBtn" type="button">Toggle Sleepy Mode</button>
              </div>
              <div id="modeState" class="dsMiniState">Modes are off.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Pause for Us</span>
              <h3>Pause without awkwardness</h3>
              <p>Send a soft pause request when someone needs water, a bathroom break, or a second.</p>
              <div class="dsStableActions">
                <button class="dsPrimaryBtn" id="pauseForUsBtn" type="button">Pause for Us</button>
                <button class="dsGhostPill" id="resumeUsBtn" type="button">Resume</button>
              </div>
              <div id="pauseState" class="dsMiniState">No pause active.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Date Room Themes</span>
              <h3>Change the room vibe</h3>
              <p>Premium rooms should feel like a date, not a video player.</p>
              <div class="dsThemeButtons">
                <button type="button" data-theme="midnight">Midnight</button>
                <button type="button" data-theme="cozy">Cozy</button>
                <button type="button" data-theme="rainy">Rainy</button>
                <button type="button" data-theme="valentine">Valentine</button>
                <button type="button" data-theme="theater">Theater</button>
              </div>
              <div id="themeState" class="dsMiniState">Theme: Midnight</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Couple Streaks + Badges</span>
              <h3>Make it a ritual</h3>
              <p>Mark date nights complete and unlock little couple memories.</p>
              <div id="streakState" class="dsMiniState">No dates completed yet.</div>
              <div id="badgeList" class="dsBadgeList"></div>
              <button class="dsPrimaryBtn" id="completeDateBtn" type="button">Mark Date Complete</button>
            </article>

            <article class="dsCouplesPlusTool dsTimelineTool">
              <span>Private Couple Timeline</span>
              <h3>Your movie memories</h3>
              <p>A tiny scrapbook of room moments, notes, pauses, and completed dates.</p>
              <div id="timelineList" class="dsMiniState">No timeline yet.</div>
            </article>

            <article class="dsCouplesPlusTool">
              <span>Why paid?</span>
              <h3>Not just streaming.</h3>
              <p>Couples pay for the feeling: less “what do we do?”, more shared rituals, synced moments, and a room that feels made for the relationship.</p>
              <a class="dsSecondaryBtn" href="/couples">Open Couple Dashboard</a>
            </article>
          </div>

          <div id="coupleFloatingLayer" class="dsCoupleFloatingLayer"></div>
        </section>
      </section>

      <aside class="dsStableSide">
        <section class="dsStablePanel dsStableInvite">
          <span class="dsEyebrow">Invite</span>
          <h2>Bring friends in</h2>
          <p>Send this room to your partner. First person in becomes host; if they leave, the other person becomes host.</p>
          <button class="dsPrimaryBtn" id="stableCopyInviteBtn" type="button">Copy Invite</button>
        </section>

        <section class="dsStablePanel dsStableChat">
          <div class="dsStableChatHead">
            <div>
              <span class="dsEyebrow">Chat</span>
              <h2>Date Chat</h2>
            </div>
          </div>
          <div id="stableMessages" class="dsStableMessages"></div>
          <form id="stableChatForm">
            <input name="message" placeholder="Send something sweet..." maxlength="220" />
            <button class="dsPrimaryBtn" type="submit">Send</button>
          </form>
        </section>
      </aside>
    </section>

    <script src="/socket.io/socket.io.js"></script>
    <script>
      (function stableWatchroom(){
        var roomId = "${safeRoomId}";
        var initialName = "${safeName}";
        var initialUrl = "${safeInitialUrl}";
        var roomCreatedAt = Number("${escapeHtml(String(room.createdAt))}") || Date.now();
        var isRoomHost = false;
        var sharedUrl = initialUrl;
        var countdownEndsAt = Number("${safeCountdown}") || 0;
        var socketAvailable = typeof io === "function";
        var socket = socketAvailable ? io() : {
          id: "offline",
          emit: function(){},
          on: function(){},
        };

        var liveLocalStream = null;
        var livePeerConnections = {};
        var liveViewerPeer = null;
        var liveIceServers = [{ urls: "stun:stun.l.google.com:19302" }];
        var coupleState = { ready: {}, moods: {}, notes: [], jar: [], tastes: {}, timeline: [], badges: [], theme: "midnight", missingYou: false, sleepy: false, pause: null };
        var roomMovieState = { status: "idle", movieId: "", proxyVideo: "", playAt: 0, selectedBy: "", message: "" };
        var roomMovieTimer = null;
        var roomMovieCorrectionTimer = null;
        var ROOM_MOVIE_DRIFT_LIMIT = 1.5;
        var roomMovieRemoteApplying = false;
        var roomMovieVideoControlBound = false;
        var firedNoteIds = {};

        function esc(value) {
          return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
        }

        function getSessionName() {
          try {
            var session = JSON.parse(localStorage.getItem("swiflytv.session") || "null");
            var profile = JSON.parse(localStorage.getItem("swiflytv.activeProfile") || "null");
            return (profile && profile.name) || (session && (session.name || session.email)) || "Guest";
          } catch {
            return "Guest";
          }
        }

        function toast(text) {
          if (window.showToast) showToast(text);
          else console.log(text);
        }

        function pad(n) { return String(Math.floor(n)).padStart(2, "0"); }

        function formatTime(seconds) {
          seconds = Math.max(0, Math.floor(Number(seconds || 0)));
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          var s = seconds % 60;
          return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
        }

        function currentRoomSeconds() {
          return Math.max(0, Math.floor((Date.now() - roomCreatedAt) / 1000));
        }

        function normalizeUrl(value) {
          value = String(value || "").trim();
          if (!value) return "";
          if (value.charAt(0) === "/") return value;

          var absoluteUrl = new RegExp("^https?://", "i");
          var plainDomain = new RegExp("^[a-z0-9.-]+[.][a-z]{2,}(/.*)?$", "i");

          if (absoluteUrl.test(value)) return value;
          if (plainDomain.test(value)) return "https://" + value;
          return "";
        }

        function setTab(name) {
          document.querySelectorAll("[data-stable-tab]").forEach(function(btn) {
            btn.classList.toggle("active", btn.dataset.stableTab === name);
          });

          document.querySelectorAll(".dsStablePanel").forEach(function(panel) {
            if (panel.id === "stableOpenPanel" || panel.id === "stableRoomMoviePanel" || panel.id === "stableLivePanel" || panel.id === "stableClockPanel" || panel.id === "stableCouplesPanel") {
              panel.classList.remove("active");
            }
          });

          var target = document.getElementById(name === "movie" ? "stableRoomMoviePanel" : name === "live" ? "stableLivePanel" : name === "clock" ? "stableClockPanel" : name === "couples" ? "stableCouplesPanel" : "stableOpenPanel");
          if (target) target.classList.add("active");
        }

        function setHostMode() {
          var hostText = isRoomHost ? "You are host" : "View only";
          ["stableOpenBadge", "stableLiveBadge", "stableRoomMovieBadge"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.textContent = hostText;
          });

          ["stableOpenInput", "stableCountdownBtn", "stableStartLiveBtn", "stableStopLiveBtn", "roomMovieInput", "roomMovieSelectBtn", "roomMovieRestartBtn", "roomMoviePlayBtn", "roomMoviePauseBtn", "roomMovieBack10Btn", "roomMovieForward10Btn"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.disabled = !isRoomHost;
          });

          var status = document.getElementById("stableHostStatus");
          if (status) status.textContent = isRoomHost ? "You are host" : "Viewer";
        }

        function updateSharedLink(url) {
          sharedUrl = normalizeUrl(url);
          var link = document.getElementById("stableOpenLink");
          var title = document.getElementById("stableLinkTitle");
          var text = document.getElementById("stableLinkText");
          var input = document.getElementById("stableOpenInput");

          if (input && sharedUrl) input.value = sharedUrl;

          if (sharedUrl) {
            if (link) {
              link.href = sharedUrl;
              link.classList.remove("disabled");
              link.textContent = "Open Link";
            }
            if (title) title.textContent = "Ready to open";
            if (text) text.textContent = sharedUrl;
          } else {
            if (link) {
              link.href = "#";
              link.classList.add("disabled");
              link.textContent = "Waiting for link";
            }
            if (title) title.textContent = "No link shared yet";
            if (text) text.textContent = "Host can paste the link you both should open.";
          }
        }

        function parseRoomMovieId(value) {
          var raw = String(value || "").trim();
          if (!raw) return "";

          var urlMatch = raw.match(new RegExp("(?:movie/|tmdb=|id=)([0-9]+)", "i"));
          if (urlMatch) return urlMatch[1];

          var numericMatch = raw.match(new RegExp("^([0-9]{2,14})$"));
          if (numericMatch) return numericMatch[1];

          return "";
        }

        function setRoomMovieStatus(text) {
          var el = document.getElementById("roomMovieStatus");
          if (el) el.textContent = text || "";
        }

        function setRoomMovieTitle(text) {
          var el = document.getElementById("roomMovieTitle");
          if (el) el.textContent = text || "No movie selected";
        }

        function clearRoomMovieFrame() {
          var frame = document.getElementById("roomMovieFrame");
          var video = document.getElementById("roomMovieVideo");
          var empty = document.getElementById("roomMovieEmpty");
          var stage = document.getElementById("roomMovieStage");
          if (frame) {
            frame.hidden = true;
            frame.removeAttribute("src");
          }
          if (video) {
            video.hidden = true;
            video.pause();
            video.removeAttribute("src");
            try { video.load(); } catch {}
          }
          if (empty) empty.hidden = false;
          if (stage) stage.classList.remove("isReady");
        }

        function isLikelyDirectVideoUrl(url) {
          var value = String(url || "");
          var ext = new RegExp("[.](mp4|webm|mov)([?#]|$)", "i");
          var query = new RegExp("[?&](video|file|src)=", "i");
          return ext.test(value) || query.test(value);
        }

        function targetRoomMovieSeconds() {
          var sync = roomMovieState.sync || {};
          var offset = Math.max(0, Number(sync.offset || 0));
          if (!sync.playing || !sync.startedAt) return offset;
          return Math.max(0, offset + ((Date.now() - Number(sync.startedAt || Date.now())) / 1000));
        }

        function updateRoomMovieTimerUi() {
          var time = formatTime(targetRoomMovieSeconds());
          var el = document.getElementById("roomMovieTargetTime");
          if (el) el.textContent = time;
          var iframeTarget = document.getElementById("roomMovieIframeTarget");
          if (iframeTarget) iframeTarget.textContent = time;
        }

        function applyNativeVideoSync(force) {
          var video = document.getElementById("roomMovieVideo");
          if (!video || video.hidden || !roomMovieState.proxyVideo) return;

          var target = targetRoomMovieSeconds();
          var current = Number(video.currentTime || 0);
          var drift = Math.abs(current - target);

          roomMovieRemoteApplying = true;

          if (force || drift > ROOM_MOVIE_DRIFT_LIMIT) {
            try { video.currentTime = target; } catch {}
          }

          if (roomMovieState.sync && roomMovieState.sync.playing) {
            video.play().catch(function(){});
          } else {
            try { video.pause(); } catch {}
          }

          setTimeout(function(){ roomMovieRemoteApplying = false; }, 350);

          var status = document.getElementById("roomMovieStatus");
          if (status && !video.hidden) {
            status.textContent = drift > ROOM_MOVIE_DRIFT_LIMIT
              ? "Auto-corrected drift. Room timer: " + formatTime(target)
              : "Native video sync active. Room timer: " + formatTime(target);
          }
        }

        function startRoomMovieCorrectionLoop() {
          if (roomMovieCorrectionTimer) clearInterval(roomMovieCorrectionTimer);
          roomMovieCorrectionTimer = setInterval(function() {
            updateRoomMovieTimerUi();
            applyNativeVideoSync(false);
          }, 1000);
        }

        function showIframeSyncHint() {
          var status = document.getElementById("roomMovieStatus");
          if (!status || !roomMovieState.proxyVideo) return;
          status.textContent = "Iframe fallback loaded. Browser would not accept this URL as a native video, so use the room target timer if it drifts.";
        }

        function fallbackToRoomMovieIframe(reason) {
          var frame = document.getElementById("roomMovieFrame");
          var video = document.getElementById("roomMovieVideo");
          var overlay = document.getElementById("roomMovieIframeSyncOverlay");
          if (!frame || !roomMovieState.proxyVideo) return;

          if (video) {
            try { video.pause(); } catch {}
            video.hidden = true;
            video.removeAttribute("src");
            try { video.load(); } catch {}
          }

          if (frame.src !== roomMovieState.proxyVideo) frame.src = roomMovieState.proxyVideo;
          frame.hidden = false;
          if (overlay) overlay.hidden = false;
          showIframeSyncHint();
          if (reason) console.warn("SwiflyTV iframe fallback:", reason);
        }

        function bindRoomMovieVideoHostControls() {
          var video = document.getElementById("roomMovieVideo");
          if (!video || roomMovieVideoControlBound) return;
          roomMovieVideoControlBound = true;

          function sendFromNative(action, extra) {
            if (!isRoomHost || roomMovieRemoteApplying) return;
            if (!roomMovieState.movieId) return;
            socket.emit("watchroom:movie-control", Object.assign({
              roomId: roomId,
              action: action,
              clientTime: Number(video.currentTime || 0),
              name: getSessionName()
            }, extra || {}));
          }

          video.addEventListener("play", function(){ sendFromNative("play"); });
          video.addEventListener("pause", function(){ sendFromNative("pause"); });
          video.addEventListener("seeked", function(){ sendFromNative("set", { time: Number(video.currentTime || 0) }); });
        }

        function loadRoomMovieFrame() {
          var frame = document.getElementById("roomMovieFrame");
          var video = document.getElementById("roomMovieVideo");
          var empty = document.getElementById("roomMovieEmpty");
          var stage = document.getElementById("roomMovieStage");
          var overlay = document.getElementById("roomMovieIframeSyncOverlay");
          if (!roomMovieState.proxyVideo) return;

          if (empty) empty.hidden = true;
          if (stage) stage.classList.add("isReady");

          // v76: Always try the proxyVideo URL as a native <video> first.
          // Many proxyVideo URLs are real MP4/video streams with no .mp4 extension,
          // so extension detection alone caused SwiflyTV to iframe them and lose sync control.
          if (video) {
            bindRoomMovieVideoHostControls();

            if (frame) {
              frame.hidden = true;
              frame.removeAttribute("src");
            }
            if (overlay) overlay.hidden = true;

            video.hidden = false;
            video.onerror = function() {
              fallbackToRoomMovieIframe("native video error");
            };
            video.onloadedmetadata = function() {
              setRoomMovieStatus("Native video loaded. SwiflyTV will keep this within about 1.5 seconds of the room timer.");
              applyNativeVideoSync(true);
            };
            video.oncanplay = function() {
              applyNativeVideoSync(true);
            };

            if (video.src !== roomMovieState.proxyVideo) {
              video.src = roomMovieState.proxyVideo;
              try { video.load(); } catch {}
            }

            setRoomMovieStatus("Trying native video sync first...");
            setTimeout(function() {
              if (!video.hidden && video.readyState === 0) {
                fallbackToRoomMovieIframe("native video never became ready");
              }
            }, 9000);

            applyNativeVideoSync(true);
          } else {
            fallbackToRoomMovieIframe("native video element missing");
          }

          startRoomMovieCorrectionLoop();
        }

        function scheduleRoomMovieFrame() {
          if (roomMovieTimer) clearInterval(roomMovieTimer);
          var countdown = document.getElementById("roomMovieCountdown");

          function tick() {
            updateRoomMovieTimerUi();
            var playAt = Number(roomMovieState.playAt || 0);
            if (!roomMovieState.proxyVideo) {
              if (countdown) countdown.textContent = "Waiting";
              return;
            }

            var left = Math.ceil((playAt - Date.now()) / 1000);
            if (left > 0) {
              if (countdown) countdown.textContent = "Play in " + left;
              return;
            }

            if (countdown) countdown.textContent = "Play now";
            if (roomMovieTimer) clearInterval(roomMovieTimer);
            roomMovieTimer = null;
            loadRoomMovieFrame();
            startRoomMovieCorrectionLoop();
          }

          tick();
          roomMovieTimer = setInterval(tick, 250);
        }

        function renderRoomMovie(movie) {
          roomMovieState = Object.assign({ status: "idle", movieId: "", proxyVideo: "", playAt: 0, selectedBy: "", message: "", sync: { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() } }, movie || {});
          if (!roomMovieState.sync) roomMovieState.sync = { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() };
          var input = document.getElementById("roomMovieInput");
          if (input && roomMovieState.movieId) input.value = roomMovieState.movieId;

          if (!roomMovieState.movieId) {
            setRoomMovieTitle("No movie selected");
            setRoomMovieStatus("Host can select a movie and everyone will wait together.");
            clearRoomMovieFrame();
            return;
          }

          setRoomMovieTitle("TMDB #" + roomMovieState.movieId);

          if (roomMovieState.status === "loading") {
            clearRoomMovieFrame();
            setRoomMovieStatus((roomMovieState.selectedBy || "Host") + " selected this movie. Waiting for proxyVideo...");
            var empty = document.getElementById("roomMovieEmpty");
            if (empty) {
              empty.hidden = false;
              empty.querySelector("h3").textContent = "Finding movie source...";
              empty.querySelector("p").textContent = "This can take a little while. The room will start a sync countdown when proxyVideo returns.";
            }
            setTab("movie");
            return;
          }

          if (roomMovieState.status === "error") {
            clearRoomMovieFrame();
            setRoomMovieStatus(roomMovieState.message || "proxyVideo failed for this movie.");
            var empty = document.getElementById("roomMovieEmpty");
            if (empty) {
              empty.hidden = false;
              empty.querySelector("h3").textContent = "proxyVideo failed";
              empty.querySelector("p").textContent = roomMovieState.message || "Try another movie ID or retry.";
            }
            setTab("movie");
            return;
          }

          if (roomMovieState.status === "ready" && roomMovieState.proxyVideo) {
            setRoomMovieStatus("proxyVideo ready. The room is syncing everyone to the same start.");
            scheduleRoomMovieFrame();
            setTab("movie");
            return;
          }
        }

        function updateClock() {
          var time = formatTime(currentRoomSeconds());
          ["stableRoomTime", "stableBigClock"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.textContent = time;
          });

          var left = Math.ceil((countdownEndsAt - Date.now()) / 1000);
          var countdown = document.getElementById("stableCountdown");
          if (countdown) countdown.textContent = left > 0 ? "Play in " + left : "Ready";
        }

        function getLocalStats() {
          try {
            return JSON.parse(localStorage.getItem("swiflytv.coupleStats") || "null") || {
              completedDates: 0,
              streak: 0,
              lastCompletedDay: "",
              badges: [],
              timeline: []
            };
          } catch {
            return { completedDates: 0, streak: 0, lastCompletedDay: "", badges: [], timeline: [] };
          }
        }

        function saveLocalStats(stats) {
          localStorage.setItem("swiflytv.coupleStats", JSON.stringify(stats));
        }

        function todayKey() {
          return new Date().toISOString().slice(0, 10);
        }

        function addLocalTimeline(text) {
          var stats = getLocalStats();
          stats.timeline = Array.isArray(stats.timeline) ? stats.timeline : [];
          stats.timeline.unshift({ text: text, at: Date.now() });
          stats.timeline = stats.timeline.slice(0, 30);
          saveLocalStats(stats);
          renderCouplePlus();
        }

        function unlockBadge(name) {
          var stats = getLocalStats();
          stats.badges = Array.isArray(stats.badges) ? stats.badges : [];
          if (!stats.badges.includes(name)) stats.badges.push(name);
          saveLocalStats(stats);
        }

        function updateRoomModes() {
          var root = document.querySelector(".dsStableRoom");
          if (!root) return;
          var theme = coupleState.theme || "midnight";
          root.dataset.coupleTheme = theme;
          root.classList.toggle("isMissingYou", Boolean(coupleState.missingYou));
          root.classList.toggle("isSleepyMode", Boolean(coupleState.sleepy));

          var modeState = document.getElementById("modeState");
          if (modeState) {
            var modes = [];
            if (coupleState.missingYou) modes.push("Missing You");
            if (coupleState.sleepy) modes.push("Sleepy");
            modeState.textContent = modes.length ? "Active: " + modes.join(" + ") : "Modes are off.";
          }

          var themeState = document.getElementById("themeState");
          if (themeState) themeState.textContent = "Theme: " + theme.charAt(0).toUpperCase() + theme.slice(1);

          var ambient = document.getElementById("missingYouAmbient");
          if (ambient) ambient.hidden = !coupleState.missingYou;

          var banner = document.getElementById("pauseForUsBanner");
          var bannerText = document.getElementById("pauseForUsText");
          if (banner) banner.hidden = !coupleState.pause;
          if (bannerText && coupleState.pause) bannerText.textContent = (coupleState.pause.name || "Someone") + " needs a moment. Pause at " + formatTime(currentRoomSeconds()) + ".";
        }

        function calculateTasteMatch() {
          var entries = Object.values(coupleState.tastes || {}).filter(Boolean);
          if (entries.length < 2) return { label: "Waiting for both taste picks.", overlap: [] };
          var sets = entries.map(function(entry){ return new Set(entry.tastes || []); });
          var overlap = Array.from(sets[0]).filter(function(tag){ return sets.every(function(set){ return set.has(tag); }); });
          if (overlap.length) return { label: "Match: " + overlap.join(" + ") + ".", overlap: overlap };
          var all = Array.from(new Set(entries.flatMap(function(entry){ return entry.tastes || []; })));
          return { label: "No exact match yet. Try a blend: " + all.slice(0, 3).join(" + ") + ".", overlap: [] };
        }

        function generateDateNightPlan() {
          var moods = Object.values(coupleState.moods || {}).map(function(m){ return m.mood; }).filter(Boolean);
          var taste = calculateTasteMatch();
          var jar = (coupleState.jar || []).slice(-1)[0];
          var mood = moods[0] || "Cozy";
          var tasteText = taste.overlap && taste.overlap.length ? taste.overlap[0] : "comfort movie";
          var snackMap = {
            Cozy: "hot chocolate + popcorn",
            Funny: "sour candy + soda",
            Romantic: "chocolate + strawberries",
            Scary: "blanket + popcorn",
            Action: "chips + energy drink",
            Comfort: "cookies + tea"
          };
          var plan = {
            title: jar ? jar.text : (mood + " " + tasteText + " night"),
            snack: snackMap[mood] || "popcorn",
            rule: "phones down for the first 20 minutes",
            note: "Send one love note before the movie starts"
          };
          return plan;
        }

        function renderTimeline() {
          var stats = getLocalStats();
          var localTimeline = Array.isArray(stats.timeline) ? stats.timeline : [];
          var roomTimeline = Array.isArray(coupleState.timeline) ? coupleState.timeline : [];
          var merged = roomTimeline.concat(localTimeline).sort(function(a, b){ return Number(b.at || 0) - Number(a.at || 0); }).slice(0, 8);
          var timeline = document.getElementById("timelineList");
          if (timeline) {
            timeline.innerHTML = merged.length
              ? merged.map(function(item){ return "<div>♡ " + esc(item.text || "") + "</div>"; }).join("")
              : "No timeline yet.";
          }
        }

        function renderBadges() {
          var stats = getLocalStats();
          var earned = new Set(stats.badges || []);
          var completed = Number(stats.completedDates || 0);
          if (completed >= 1) earned.add("First Date Room");
          if (completed >= 3) earned.add("3 Dates Strong");
          if (completed >= 5) earned.add("Movie Ritual");
          if ((coupleState.notes || []).length >= 1) earned.add("Love Note Sent");
          if ((coupleState.jar || []).length >= 3) earned.add("Date Jar Builders");
          stats.badges = Array.from(earned);
          saveLocalStats(stats);

          var badgeList = document.getElementById("badgeList");
          if (badgeList) {
            badgeList.innerHTML = stats.badges.length
              ? stats.badges.map(function(b){ return "<span>" + esc(b) + "</span>"; }).join("")
              : "<span>Complete a date to earn badges</span>";
          }

          var streak = document.getElementById("streakState");
          if (streak) {
            streak.textContent = completed
              ? completed + " date nights completed • streak " + Number(stats.streak || 1)
              : "No dates completed yet.";
          }
        }

        function renderCouplePlus() {
          coupleState.ready = coupleState.ready || {};
          coupleState.moods = coupleState.moods || {};
          coupleState.notes = coupleState.notes || [];
          coupleState.jar = coupleState.jar || [];
          coupleState.tastes = coupleState.tastes || {};
          coupleState.timeline = coupleState.timeline || [];

          var readyList = document.getElementById("coupleReadyList");
          if (readyList) {
            var readyNames = Object.values(coupleState.ready || {}).filter(Boolean).map(function(item){ return item.name || "Someone"; });
            readyList.textContent = readyNames.length ? readyNames.join(" + ") + " ready" : "Nobody ready yet.";
            if (readyNames.length >= 2) readyList.textContent += " — start the countdown.";
          }

          var moodResult = document.getElementById("coupleMoodResult");
          if (moodResult) {
            var moods = Object.values(coupleState.moods || {}).filter(Boolean);
            if (!moods.length) moodResult.textContent = "Waiting for moods.";
            else if (moods.length === 1) moodResult.textContent = moods[0].name + " picked. Waiting for the other person.";
            else {
              var unique = Array.from(new Set(moods.map(function(m){ return m.mood; })));
              moodResult.textContent = unique.length === 1
                ? "Perfect match: " + unique[0] + " night."
                : "Blend night: " + unique.slice(0, 2).join(" + ") + ".";
            }
          }

          var notesList = document.getElementById("coupleNotesList");
          if (notesList) {
            var notes = (coupleState.notes || []).slice(-5);
            notesList.innerHTML = notes.length
              ? notes.map(function(note){ return "<div><b>" + esc(formatTime(note.time || 0)) + "</b> " + esc(note.from || "Someone") + ": " + esc(note.text || "") + "</div>"; }).join("")
              : "No notes scheduled yet.";
          }

          var jarList = document.getElementById("coupleJarList");
          if (jarList) {
            var ideas = (coupleState.jar || []).slice(-7);
            jarList.innerHTML = ideas.length
              ? ideas.map(function(idea){ return "<div>♡ " + esc(idea.text || "") + " <small>— " + esc(idea.from || "Someone") + "</small></div>"; }).join("")
              : "No date ideas yet.";
          }

          var tasteResult = document.getElementById("coupleTasteResult");
          if (tasteResult) tasteResult.textContent = calculateTasteMatch().label;

          updateRoomModes();
          renderBadges();
          renderTimeline();
        }

        function showCouplePopup(text, label) {
          var layer = document.getElementById("coupleFloatingLayer");
          if (!layer) return;
          var item = document.createElement("div");
          item.className = "dsCouplePopup";
          item.innerHTML = "<span>" + esc(label || "Love note") + "</span><b>" + esc(text || "") + "</b>";
          layer.appendChild(item);
          setTimeout(function(){ item.remove(); }, 6500);
        }

        function floatReaction(emoji, name) {
          var layer = document.getElementById("coupleFloatingLayer");
          if (!layer) return;
          var item = document.createElement("div");
          item.className = "dsFloatReaction";
          item.style.left = (20 + Math.random() * 60) + "%";
          item.innerHTML = "<b>" + esc(emoji || "♡") + "</b><span>" + esc(name || "Someone") + "</span>";
          layer.appendChild(item);
          setTimeout(function(){ item.remove(); }, 3600);
        }

        function checkTimedNotes() {
          var current = currentRoomSeconds();
          (coupleState.notes || []).forEach(function(note) {
            if (!note || firedNoteIds[note.id]) return;
            if (current >= Number(note.time || 0)) {
              firedNoteIds[note.id] = true;
              showCouplePopup(note.text, "From " + (note.from || "your person"));
            }
          });
        }

        function emitCoupleEvent(type, data) {
          socket.emit("watchroom:couple-event", {
            roomId: roomId,
            type: type,
            name: getSessionName(),
            data: data || {}
          });
        }

        setInterval(function(){
          updateClock();
          checkTimedNotes();
        }, 500);
        updateClock();
        renderCouplePlus();
        updateSharedLink(initialUrl);

        function addMessage(message) {
          var root = document.getElementById("stableMessages");
          if (!root) return;
          var name = esc(message.name || "Guest");
          var text = esc(message.text || "");
          if (!text) return;
          root.insertAdjacentHTML("beforeend", '<div class="dsStableMessage"><b>' + name + '</b><span>' + text + '</span></div>');
          root.scrollTop = root.scrollHeight;
        }

        function sendMessage(text) {
          text = String(text || "").trim();
          if (!text) return;
          socket.emit("watchroom:message", { roomId: roomId, name: getSessionName(), text: text });
        }

        function copyText(text, label) {
          navigator.clipboard?.writeText(text);
          toast(label || "Copied");
        }

        function stopLiveShare() {
          if (liveLocalStream) {
            liveLocalStream.getTracks().forEach(function(track) { track.stop(); });
            liveLocalStream = null;
          }

          Object.keys(livePeerConnections).forEach(function(id) {
            try { livePeerConnections[id].close(); } catch {}
          });
          livePeerConnections = {};

          var video = document.getElementById("stableLiveVideo");
          if (video) video.srcObject = null;

          var empty = document.getElementById("stableLiveEmpty");
          if (empty) empty.hidden = false;

          if (isRoomHost) socket.emit("watchroom:live-stop", { roomId: roomId });
        }

        function attachLiveStream(stream) {
          var video = document.getElementById("stableLiveVideo");
          var empty = document.getElementById("stableLiveEmpty");
          if (empty) empty.hidden = true;
          if (!video) return;
          video.srcObject = stream;
          video.muted = isRoomHost;
          video.play().catch(function(){});
          setTab("live");
        }

        function makePeer(targetSocketId, hostSide) {
          var pc = new RTCPeerConnection({ iceServers: liveIceServers });

          pc.onicecandidate = function(event) {
            if (event.candidate) {
              socket.emit("watchroom:live-ice", {
                roomId: roomId,
                target: targetSocketId,
                candidate: event.candidate
              });
            }
          };

          if (hostSide && liveLocalStream) {
            liveLocalStream.getTracks().forEach(function(track) {
              pc.addTrack(track, liveLocalStream);
            });
          }

          if (!hostSide) {
            pc.ontrack = function(event) {
              var stream = event.streams && event.streams[0];
              if (stream) attachLiveStream(stream);
            };
          }

          return pc;
        }

        async function startLiveShare() {
          if (!isRoomHost) {
            toast("Only the host can start Live Share");
            return;
          }

          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            toast("This browser does not support Live Share");
            return;
          }

          try {
            liveLocalStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            attachLiveStream(liveLocalStream);
            liveLocalStream.getVideoTracks()[0]?.addEventListener("ended", stopLiveShare);
            socket.emit("watchroom:live-start", { roomId: roomId, name: getSessionName() });
            sendMessage("Live Share started. Pick the shared video in this room.");
            toast("Live Share started");
          } catch {
            toast("Live Share cancelled or blocked");
          }
        }

        async function connectViewer(viewerSocketId) {
          if (!isRoomHost || !liveLocalStream || !viewerSocketId) return;
          var pc = makePeer(viewerSocketId, true);
          livePeerConnections[viewerSocketId] = pc;
          var offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("watchroom:live-offer", { roomId: roomId, target: viewerSocketId, description: pc.localDescription });
        }

        socket.on("connect", function() {
          socket.emit("watchroom:join", {
            roomId: roomId,
            name: initialName,
            browserUrl: sharedUrl,
            user: getSessionName()
          });
        });

        socket.on("watchroom:joined", function(data) {
          window.__swiflyDateRoomJoined = true;
          isRoomHost = Boolean(data.isHost);
          setHostMode();

          if (data.room) {
            if (data.room.createdAt) roomCreatedAt = Number(data.room.createdAt);
            if (data.room.openTogetherUrl) updateSharedLink(data.room.openTogetherUrl);
            if (data.room.openTogetherCountdownEndsAt) countdownEndsAt = Number(data.room.openTogetherCountdownEndsAt || 0);
            if (data.room.syncedMovie) renderRoomMovie(data.room.syncedMovie);
            if (data.room.couplePlus) {
              coupleState = data.room.couplePlus;
              renderCouplePlus();
            }
          }

          if (data.messages) data.messages.forEach(addMessage);
          updateClock();
        });

        socket.on("watchroom:viewers", function(data) {
          var count = Number(data.viewers || 0);
          var el = document.getElementById("stableViewerCount");
          if (el) el.textContent = String(count);
        });

        socket.on("watchroom:host", function(data) {
          isRoomHost = Boolean(data && data.isHost);
          setHostMode();
        });

        socket.on("watchroom:message", addMessage);

        socket.on("watchroom:couple-event", function(event) {
          if (!event) return;
          if (event.state) {
            coupleState = event.state;
            renderCouplePlus();
          }
          if (event.type === "reaction") {
            floatReaction(event.data && event.data.emoji, event.name);
          }
          if (event.type === "note") {
            toast("Love note scheduled");
          }
          if (event.type === "ready" && event.data && event.data.ready) {
            toast((event.name || "Someone") + " is ready");
          }
          if (event.type === "jar") {
            toast("Date idea added");
          }
          if (event.type === "pause") {
            showCouplePopup("Pause for us", (event.name || "Someone") + " needs a second");
          }
          if (event.type === "resume") {
            toast("Pause ended");
          }
          if (event.type === "complete-date") {
            unlockBadge("Date Night Complete");
            addLocalTimeline((event.name || "Someone") + " marked a date complete");
          }
          if (event.type === "mode" || event.type === "theme" || event.type === "taste") {
            renderCouplePlus();
          }
          if (event.type === "mood") {
            setTab("couples");
          }
        });

        socket.on("watchroom:movie-sync-state", function(data) {
          if (!data || !data.sync) return;
          roomMovieState.sync = data.sync;
          updateRoomMovieTimerUi();
          applyNativeVideoSync(false);
          if (data.message) setRoomMovieStatus(data.message);
        });

        socket.on("watchroom:movie-sync", function(data) {
          if (data && data.movie) {
            renderRoomMovie(data.movie);
            if (data.movie.status === "ready") {
              toast("Room movie ready. Sync countdown started.");
            }
          }
        });

        socket.on("watchroom:open-together", function(data) {
          if (data && data.url) updateSharedLink(data.url);
          if (data && data.countdownEndsAt !== undefined) countdownEndsAt = Number(data.countdownEndsAt || 0);
          updateClock();
          setTab("open");
        });

        socket.on("watchroom:live-status", function(data) {
          if (data && data.active && !isRoomHost) {
            setTab("live");
            socket.emit("watchroom:live-viewer-ready", { roomId: roomId });
          }
        });

        socket.on("watchroom:live-viewer-ready", function(data) {
          connectViewer(data && data.viewerSocketId).catch(function(){ toast("Could not connect viewer"); });
        });

        socket.on("watchroom:live-offer", async function(data) {
          if (isRoomHost || !data || !data.description) return;

          try {
            if (liveViewerPeer) {
              try { liveViewerPeer.close(); } catch {}
            }

            liveViewerPeer = makePeer(data.from, false);
            await liveViewerPeer.setRemoteDescription(data.description);
            var answer = await liveViewerPeer.createAnswer();
            await liveViewerPeer.setLocalDescription(answer);
            socket.emit("watchroom:live-answer", { roomId: roomId, target: data.from, description: liveViewerPeer.localDescription });
          } catch {
            toast("Could not connect to Live Share");
          }
        });

        socket.on("watchroom:live-answer", async function(data) {
          if (!isRoomHost || !data || !data.from || !data.description) return;
          var pc = livePeerConnections[data.from];
          if (!pc) return;
          try { await pc.setRemoteDescription(data.description); } catch {}
        });

        socket.on("watchroom:live-ice", async function(data) {
          if (!data || !data.candidate) return;
          var pc = isRoomHost ? livePeerConnections[data.from] : liveViewerPeer;
          if (!pc) return;
          try { await pc.addIceCandidate(data.candidate); } catch {}
        });

        socket.on("watchroom:live-stop", function() {
          if (!isRoomHost && liveViewerPeer) {
            try { liveViewerPeer.close(); } catch {}
            liveViewerPeer = null;
          }
          var video = document.getElementById("stableLiveVideo");
          if (!isRoomHost && video) video.srcObject = null;
          var empty = document.getElementById("stableLiveEmpty");
          if (empty) {
            empty.hidden = false;
            empty.querySelector("p").textContent = "Live Share stopped. Waiting for host.";
          }
        });

        document.querySelectorAll("[data-stable-tab]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            setTab(btn.dataset.stableTab);
            if (btn.dataset.stableTab === "live" && !isRoomHost) {
              socket.emit("watchroom:live-viewer-ready", { roomId: roomId });
            }
          });
        });

        document.getElementById("stableOpenForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          if (!isRoomHost) return toast("Only the host can share the link");

          var url = normalizeUrl(document.getElementById("stableOpenInput")?.value || "");
          if (!url) return toast("Paste a valid link");

          updateSharedLink(url);
          socket.emit("watchroom:open-together", { roomId: roomId, url: url, countdownEndsAt: countdownEndsAt });
          sendMessage("Open Together link shared. Open it and follow the room time.");
        });

        document.getElementById("stableCountdownBtn")?.addEventListener("click", function() {
          if (!isRoomHost) return toast("Only the host can start countdown");
          countdownEndsAt = Date.now() + 10000;
          socket.emit("watchroom:open-together", { roomId: roomId, url: sharedUrl, countdownEndsAt: countdownEndsAt });
          sendMessage("Countdown started. Press play when it says Ready. Set your player to " + formatTime(currentRoomSeconds()) + ".");
          updateClock();
        });

        document.getElementById("stableSendTimeBtn")?.addEventListener("click", function() {
          sendMessage("Set your player to " + formatTime(currentRoomSeconds()) + ".");
        });

        document.getElementById("stableCopyLinkBtn")?.addEventListener("click", function() {
          copyText((sharedUrl || "No link yet") + " — set player to " + formatTime(currentRoomSeconds()), "Copied link + time");
        });

        document.getElementById("stableCopyInviteBtn")?.addEventListener("click", function() {
          copyText(location.href, "Invite copied");
        });

        document.getElementById("stableCopyTimeBtn")?.addEventListener("click", function() {
          copyText("Set your player to " + formatTime(currentRoomSeconds()), "Time copied");
        });

        document.getElementById("stableChatTimeBtn")?.addEventListener("click", function() {
          sendMessage("Set your player to " + formatTime(currentRoomSeconds()) + ".");
        });

        document.getElementById("stableStartLiveBtn")?.addEventListener("click", startLiveShare);
        document.getElementById("stableStopLiveBtn")?.addEventListener("click", stopLiveShare);

        document.getElementById("stableFullscreenLiveBtn")?.addEventListener("click", function() {
          var stage = document.querySelector(".dsStableLiveStage");
          if (!stage) return;
          if (!document.fullscreenElement) stage.requestFullscreen?.();
          else document.exitFullscreen?.();
        });

        document.getElementById("stableChatForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var input = event.currentTarget.querySelector("input[name='message']");
          var text = String(input && input.value || "").trim();
          if (!text) return;
          sendMessage(text);
          input.value = "";
        });

        document.getElementById("coupleReadyBtn")?.addEventListener("click", function() {
          emitCoupleEvent("ready", { ready: true });
          setTab("couples");
        });

        document.getElementById("coupleResetReadyBtn")?.addEventListener("click", function() {
          emitCoupleEvent("reset-ready", {});
        });

        document.querySelectorAll("[data-mood]")?.forEach(function(btn) {
          btn.addEventListener("click", function() {
            emitCoupleEvent("mood", { mood: btn.dataset.mood });
          });
        });

        document.querySelectorAll("[data-react]")?.forEach(function(btn) {
          btn.addEventListener("click", function() {
            emitCoupleEvent("reaction", { emoji: btn.dataset.react });
          });
        });

        document.getElementById("coupleNoteForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var fd = new FormData(event.currentTarget);
          var text = String(fd.get("note") || "").trim();
          var delay = Math.max(5, Number(fd.get("delay") || 15));
          if (!text) return toast("Write a note first");
          emitCoupleEvent("note", { text: text, time: currentRoomSeconds() + delay });
          event.currentTarget.reset();
          setTab("couples");
        });

        document.getElementById("coupleJarForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          var fd = new FormData(event.currentTarget);
          var text = String(fd.get("idea") || "").trim();
          if (!text) return toast("Add an idea first");
          emitCoupleEvent("jar", { text: text });
          event.currentTarget.reset();
          setTab("couples");
        });

        document.querySelectorAll("[data-taste]")?.forEach(function(btn) {
          btn.addEventListener("click", function() {
            var current = coupleState.tastes && coupleState.tastes[socket.id] && coupleState.tastes[socket.id].tastes || [];
            var tag = btn.dataset.taste;
            if (current.includes(tag)) current = current.filter(function(item){ return item !== tag; });
            else current = current.concat(tag).slice(0, 5);
            emitCoupleEvent("taste", { tastes: current });
            btn.classList.toggle("isSelected", current.includes(tag));
          });
        });

        document.getElementById("dateGeneratorBtn")?.addEventListener("click", function() {
          var plan = generateDateNightPlan();
          var result = document.getElementById("dateGeneratorResult");
          if (result) {
            result.innerHTML = "<div><b>Plan:</b> " + esc(plan.title) + "</div>" +
              "<div><b>Snack:</b> " + esc(plan.snack) + "</div>" +
              "<div><b>Rule:</b> " + esc(plan.rule) + "</div>" +
              "<div><b>Sweet thing:</b> " + esc(plan.note) + "</div>";
          }
          emitCoupleEvent("timeline", { text: "Generated date plan: " + plan.title });
          setTab("couples");
        });

        document.getElementById("missingYouBtn")?.addEventListener("click", function() {
          emitCoupleEvent("mode", { missingYou: !coupleState.missingYou, sleepy: coupleState.sleepy });
        });

        document.getElementById("sleepyModeBtn")?.addEventListener("click", function() {
          emitCoupleEvent("mode", { missingYou: coupleState.missingYou, sleepy: !coupleState.sleepy });
        });

        document.getElementById("pauseForUsBtn")?.addEventListener("click", function() {
          emitCoupleEvent("pause", { active: true });
          sendMessage("Pause for us real quick ❤️");
        });

        document.getElementById("resumeUsBtn")?.addEventListener("click", function() {
          emitCoupleEvent("resume", {});
          sendMessage("Ready to resume ❤️");
        });

        document.querySelectorAll("[data-theme]")?.forEach(function(btn) {
          btn.addEventListener("click", function() {
            emitCoupleEvent("theme", { theme: btn.dataset.theme });
          });
        });

        document.getElementById("completeDateBtn")?.addEventListener("click", function() {
          var stats = getLocalStats();
          var today = todayKey();
          stats.completedDates = Number(stats.completedDates || 0) + 1;
          stats.streak = stats.lastCompletedDay && stats.lastCompletedDay !== today ? Number(stats.streak || 0) + 1 : Math.max(1, Number(stats.streak || 0));
          stats.lastCompletedDay = today;
          stats.timeline = Array.isArray(stats.timeline) ? stats.timeline : [];
          stats.timeline.unshift({ text: "Completed a SwiflyTV date night", at: Date.now() });
          saveLocalStats(stats);
          emitCoupleEvent("complete-date", { completedDates: stats.completedDates });
          sendMessage("Date night marked complete. Streak updated ♡");
          renderCouplePlus();
        });

        document.getElementById("roomMovieForm")?.addEventListener("submit", function(event) {
          event.preventDefault();
          if (!isRoomHost) return toast("Only the host can select the room movie");

          var movieId = parseRoomMovieId(document.getElementById("roomMovieInput")?.value || "");
          if (!movieId) return toast("Paste a TMDB movie ID or /watch/movie link");

          renderRoomMovie({ status: "loading", movieId: movieId, selectedBy: getSessionName(), message: "Waiting for proxyVideo..." });
          socket.emit("watchroom:movie-select", { roomId: roomId, movieId: movieId, name: getSessionName() });
          sendMessage("Selected TMDB #" + movieId + ". Waiting for proxyVideo to sync the room.");
        });

        document.getElementById("roomMovieRestartBtn")?.addEventListener("click", function() {
          if (!isRoomHost) return toast("Only the host can restart the sync countdown");
          if (!roomMovieState.proxyVideo) return toast("No room movie is ready yet");
          socket.emit("watchroom:movie-sync-start", { roomId: roomId, delayMs: 7000, name: getSessionName() });
        });

        function sendRoomMovieSync(action, extra) {
          if (!isRoomHost && action !== "sync-me") return toast("Only the host can control the room timer");
          if (!roomMovieState.movieId) return toast("No room movie selected");
          var video = document.getElementById("roomMovieVideo");
          var hostTime = video && !video.hidden ? Number(video.currentTime || 0) : targetRoomMovieSeconds();
          socket.emit("watchroom:movie-control", Object.assign({
            roomId: roomId,
            action: action,
            clientTime: hostTime,
            name: getSessionName()
          }, extra || {}));
        }

        document.getElementById("roomMoviePlayBtn")?.addEventListener("click", function() {
          sendRoomMovieSync("play");
        });

        document.getElementById("roomMoviePauseBtn")?.addEventListener("click", function() {
          sendRoomMovieSync("pause");
        });

        document.getElementById("roomMovieBack10Btn")?.addEventListener("click", function() {
          sendRoomMovieSync("seek", { delta: -10 });
        });

        document.getElementById("roomMovieForward10Btn")?.addEventListener("click", function() {
          sendRoomMovieSync("seek", { delta: 10 });
        });

        document.getElementById("roomMovieSyncMeBtn")?.addEventListener("click", function() {
          applyNativeVideoSync(true);
          showIframeSyncHint();
          toast("Synced to room timer");
        });

        document.getElementById("roomMovieOpenBtn")?.addEventListener("click", function() {
          if (!roomMovieState.movieId) return toast("No room movie selected");
          window.open("/watch/movie/" + encodeURIComponent(roomMovieState.movieId) + "?mode=movie", "_blank", "noopener");
        });

        document.getElementById("roomMovieCopyBtn")?.addEventListener("click", function() {
          var text = roomMovieState.movieId
            ? location.origin + "/watch/movie/" + roomMovieState.movieId + "?mode=movie"
            : "No room movie selected";
          navigator.clipboard?.writeText(text);
          toast("Room movie copied");
        });

        document.getElementById("stableOpenLink")?.addEventListener("click", function(event) {
          if (!sharedUrl) {
            event.preventDefault();
            toast("No link shared yet");
          }
        });

        if (!socketAvailable) {
          isRoomHost = true;
          setHostMode();
          toast("Date Room socket did not load. Buttons are in offline mode.");
        }

        window.__swiflyDateRoomMainLoaded = true;
        setHostMode();
      })();
    </script>

    <script>
      (function swiflyDateRoomRecovery(){
        function byId(id) { return document.getElementById(id); }
        function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
        function toast(msg) {
          if (window.showToast) window.showToast(msg);
          else console.log(msg);
        }
        function esc(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        }
        function pad(n) { return String(Math.floor(n)).padStart(2, "0"); }
        function formatTime(seconds) {
          seconds = Math.max(0, Math.floor(Number(seconds || 0)));
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          var s = seconds % 60;
          return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
        }
        function getName() {
          try {
            var session = JSON.parse(localStorage.getItem("swiflytv.session") || "null");
            var profile = JSON.parse(localStorage.getItem("swiflytv.activeProfile") || "null");
            return (profile && profile.name) || (session && (session.name || session.email)) || "Guest";
          } catch (e) {
            return "Guest";
          }
        }
        function parseMovieId(value) {
          var raw = String(value || "").trim();
          if (!raw) return "";

          var urlMatch = raw.match(new RegExp("(?:movie/|tmdb=|id=)([0-9]+)", "i"));
          if (urlMatch) return urlMatch[1];

          var numericMatch = raw.match(new RegExp("^([0-9]{2,14})$"));
          if (numericMatch) return numericMatch[1];

          return "";
        }
        function normalizeUrl(value) {
          value = String(value || "").trim();
          if (!value) return "";
          if (value.charAt(0) === "/") return value;

          var absoluteUrl = new RegExp("^https?://", "i");
          var plainDomain = new RegExp("^[a-z0-9.-]+[.][a-z]{2,}(/.*)?$", "i");

          if (absoluteUrl.test(value)) return value;
          if (plainDomain.test(value)) return "https://" + value;
          return "";
        }

        function bindTabs() {
          all("[data-stable-tab]").forEach(function(btn) {
            if (btn.__swiflyBound) return;
            btn.__swiflyBound = true;
            btn.addEventListener("click", function() {
              var name = btn.getAttribute("data-stable-tab") || "open";
              all("[data-stable-tab]").forEach(function(other) {
                other.classList.toggle("active", other === btn);
              });
              ["stableOpenPanel", "stableRoomMoviePanel", "stableLivePanel", "stableClockPanel", "stableCouplesPanel"].forEach(function(id) {
                var panel = byId(id);
                if (!panel) return;
                var active =
                  (name === "open" && id === "stableOpenPanel") ||
                  (name === "movie" && id === "stableRoomMoviePanel") ||
                  (name === "live" && id === "stableLivePanel") ||
                  (name === "clock" && id === "stableClockPanel") ||
                  (name === "couples" && id === "stableCouplesPanel");
                panel.classList.toggle("active", active);
              });
            });
          });
        }

        bindTabs();

        setTimeout(function(){
          bindTabs();

          if (window.__swiflyDateRoomMainLoaded) {
            return;
          }

          var roomId = "${safeRoomId}";
          var roomName = "${safeName}";
          var socketWorks = typeof io === "function";
          var socket = socketWorks ? io() : null;
          var isHost = !socketWorks;
          var movie = { status: "idle", movieId: "", proxyVideo: "", playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } };
          var timer = null;
          var driftLimit = 5;

          function setHostMode() {
            var text = isHost ? "You are host" : "View only";
            ["stableHostStatus", "stableOpenBadge", "stableLiveBadge", "stableRoomMovieBadge"].forEach(function(id) {
              var el = byId(id);
              if (el) el.textContent = text;
            });
            ["stableOpenInput", "stableCountdownBtn", "stableStartLiveBtn", "stableStopLiveBtn", "roomMovieInput", "roomMovieSelectBtn", "roomMovieRestartBtn", "roomMoviePlayBtn", "roomMoviePauseBtn", "roomMovieBack10Btn", "roomMovieForward10Btn"].forEach(function(id) {
              var el = byId(id);
              if (el) el.disabled = !isHost;
            });
          }

          function setMovieTab() {
            var btn = document.querySelector('[data-stable-tab="movie"]');
            if (btn) btn.click();
          }

          function setMovieStatus(text) {
            var el = byId("roomMovieStatus");
            if (el) el.textContent = text || "";
          }

          function setMovieTitle(text) {
            var el = byId("roomMovieTitle");
            if (el) el.textContent = text || "No movie selected";
          }

          function currentTargetTime() {
            var sync = movie.sync || {};
            var offset = Math.max(0, Number(sync.offset || 0));
            if (!sync.playing || !sync.startedAt) return offset;
            return Math.max(0, offset + ((Date.now() - Number(sync.startedAt || Date.now())) / 1000));
          }

          function updateTargetUi() {
            var el = byId("roomMovieTargetTime");
            if (el) el.textContent = formatTime(currentTargetTime());
          }

          function loadMovieFrame() {
            var frame = byId("roomMovieFrame");
            var empty = byId("roomMovieEmpty");
            var stage = byId("roomMovieStage");
            if (!frame || !movie.proxyVideo) return;

            if (frame.src !== movie.proxyVideo) frame.src = movie.proxyVideo;
            frame.hidden = false;
            if (empty) empty.hidden = true;
            if (stage) stage.classList.add("isReady");
            setMovieStatus("Movie loaded. Room timer: " + formatTime(currentTargetTime()));
          }

          function scheduleLoad() {
            if (timer) clearInterval(timer);
            var countdown = byId("roomMovieCountdown");

            timer = setInterval(function(){
              updateTargetUi();
              if (!movie.proxyVideo) {
                if (countdown) countdown.textContent = "Waiting";
                return;
              }
              var left = Math.ceil((Number(movie.playAt || 0) - Date.now()) / 1000);
              if (left > 0) {
                if (countdown) countdown.textContent = "Play in " + left;
                return;
              }
              if (countdown) countdown.textContent = "Play now";
              clearInterval(timer);
              timer = null;
              loadMovieFrame();
            }, 250);
          }

          function renderMovie(data) {
            movie = Object.assign({ status: "idle", movieId: "", proxyVideo: "", playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } }, data || {});
            if (!movie.sync) movie.sync = { playing: false, offset: 0, startedAt: 0 };

            if (movie.movieId) {
              var input = byId("roomMovieInput");
              if (input) input.value = movie.movieId;
              setMovieTitle("TMDB #" + movie.movieId);
            }

            if (movie.status === "loading") {
              setMovieTab();
              setMovieStatus("Waiting for proxyVideo...");
              var empty = byId("roomMovieEmpty");
              if (empty) {
                empty.hidden = false;
                var h = empty.querySelector("h3");
                var p = empty.querySelector("p");
                if (h) h.textContent = "Finding movie source...";
                if (p) p.textContent = "This can take awhile. Everyone will load it once proxyVideo returns.";
              }
              return;
            }

            if (movie.status === "error") {
              setMovieTab();
              setMovieStatus(movie.message || "proxyVideo failed.");
              return;
            }

            if (movie.status === "ready" && movie.proxyVideo) {
              setMovieTab();
              setMovieStatus("proxyVideo ready. Sync countdown started.");
              scheduleLoad();
            }
          }

          function localProxyPoll(movieId) {
            renderMovie({ status: "loading", movieId: movieId, message: "Waiting for proxyVideo..." });
            var started = Date.now();
            var attempts = 0;

            function poll() {
              attempts += 1;
              fetch("/api/proxy-video-wait/movie/" + encodeURIComponent(movieId) + "?t=" + Date.now(), { cache: "no-store" })
                .then(function(r){ return r.json(); })
                .then(function(data) {
                  if (data && data.status === "ok" && data.proxyVideo) {
                    renderMovie({
                      status: "ready",
                      movieId: movieId,
                      proxyVideo: data.proxyVideo,
                      playAt: Date.now() + 7000,
                      sync: { playing: true, offset: 0, startedAt: Date.now() + 7000 },
                    });
                    return;
                  }
                  if (Date.now() - started > 180000) {
                    renderMovie({ status: "error", movieId: movieId, message: "Still no proxyVideo after 3 minutes." });
                    return;
                  }
                  setMovieStatus("Still waiting for proxyVideo... attempt " + attempts);
                  setTimeout(poll, Math.min(15000, 2500 + attempts * 1500));
                })
                .catch(function(err) {
                  setMovieStatus("Still waiting: " + (err.message || "request failed"));
                  setTimeout(poll, Math.min(15000, 2500 + attempts * 1500));
                });
            }
            poll();
          }

          function emit(event, payload) {
            if (socket) socket.emit(event, payload || {});
          }

          if (socket) {
            socket.on("connect", function() {
              emit("watchroom:join", { roomId: roomId, name: roomName, user: getName() });
            });
            socket.on("watchroom:joined", function(data) {
              window.__swiflyDateRoomJoined = true;
              isHost = Boolean(data && data.isHost);
              setHostMode();
              if (data && data.room && data.room.syncedMovie) renderMovie(data.room.syncedMovie);
            });
            socket.on("watchroom:host", function(data) {
              isHost = Boolean(data && data.isHost);
              setHostMode();
            });
            socket.on("watchroom:movie-sync", function(data) {
              if (data && data.movie) renderMovie(data.movie);
            });
            socket.on("watchroom:movie-sync-state", function(data) {
              if (data && data.sync) {
                movie.sync = data.sync;
                updateTargetUi();
                setMovieStatus(data.message || "Room timer updated.");
              }
            });
            socket.on("watchroom:viewers", function(data) {
              var el = byId("stableViewerCount");
              if (el) el.textContent = String((data && data.viewers) || 0);
            });
          }

          var form = byId("roomMovieForm");
          if (form && !form.__swiflyRecoveryBound) {
            form.__swiflyRecoveryBound = true;
            form.addEventListener("submit", function(event) {
              event.preventDefault();
              if (!isHost) return toast("Only the host can select the room movie");
              var movieId = parseMovieId((byId("roomMovieInput") || {}).value || "");
              if (!movieId) return toast("Paste a TMDB movie ID or /watch/movie link");
              if (socket) {
                renderMovie({ status: "loading", movieId: movieId, selectedBy: getName(), message: "Waiting for proxyVideo..." });
                emit("watchroom:movie-select", { roomId: roomId, movieId: movieId, name: getName() });
              } else {
                localProxyPoll(movieId);
              }
            });
          }

          function bindClick(id, fn) {
            var el = byId(id);
            if (!el || el.__swiflyRecoveryBound) return;
            el.__swiflyRecoveryBound = true;
            el.addEventListener("click", fn);
          }

          bindClick("roomMovieRestartBtn", function(){
            if (!isHost) return toast("Only the host can restart sync");
            if (socket && movie.proxyVideo) emit("watchroom:movie-sync-start", { roomId: roomId, delayMs: 7000, name: getName() });
            else if (movie.proxyVideo) { movie.playAt = Date.now() + 7000; scheduleLoad(); }
          });
          bindClick("roomMovieOpenBtn", function(){
            if (!movie.movieId) return toast("No room movie selected");
            window.open("/watch/movie/" + encodeURIComponent(movie.movieId) + "?mode=movie", "_blank", "noopener");
          });
          bindClick("roomMovieCopyBtn", function(){
            navigator.clipboard && navigator.clipboard.writeText(movie.movieId ? location.origin + "/watch/movie/" + movie.movieId + "?mode=movie" : "No movie selected");
            toast("Copied");
          });
          bindClick("roomMoviePlayBtn", function(){
            if (!isHost) return toast("Only the host can control the timer");
            emit("watchroom:movie-control", { roomId: roomId, action: "play", name: getName() });
          });
          bindClick("roomMoviePauseBtn", function(){
            if (!isHost) return toast("Only the host can control the timer");
            emit("watchroom:movie-control", { roomId: roomId, action: "pause", name: getName() });
          });
          bindClick("roomMovieBack10Btn", function(){
            if (!isHost) return toast("Only the host can control the timer");
            emit("watchroom:movie-control", { roomId: roomId, action: "seek", delta: -10, name: getName() });
          });
          bindClick("roomMovieForward10Btn", function(){
            if (!isHost) return toast("Only the host can control the timer");
            emit("watchroom:movie-control", { roomId: roomId, action: "seek", delta: 10, name: getName() });
          });
          bindClick("roomMovieSyncMeBtn", function(){
            updateTargetUi();
            toast("Synced to room timer");
          });

          if (!socketWorks) {
            isHost = true;
            setHostMode();
            toast("Socket failed, Date Room recovery loaded in offline mode.");
          } else {
            setHostMode();
          }
        }, 350);
      })();

    </script>

    <script>
      (function swiflyDateRoomPollingFallback(){
        function byId(id) { return document.getElementById(id); }
        function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
        function toast(msg) {
          if (window.showToast) window.showToast(msg);
          else console.log(msg);
        }
        function pad(n) { return String(Math.floor(n)).padStart(2, "0"); }
        function formatTime(seconds) {
          seconds = Math.max(0, Math.floor(Number(seconds || 0)));
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          var s = seconds % 60;
          return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
        }
        function getName() {
          try {
            var session = JSON.parse(localStorage.getItem("swiflytv.session") || "null");
            var profile = JSON.parse(localStorage.getItem("swiflytv.activeProfile") || "null");
            return (profile && profile.name) || (session && (session.name || session.email)) || "Guest";
          } catch (e) {
            return "Guest";
          }
        }
        function getClientId() {
          var key = "swiflytv.dateRoomClientId";
          var id = localStorage.getItem(key);
          if (!id) {
            id = "c_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(key, id);
          }
          return id;
        }
        function parseMovieId(value) {
          var raw = String(value || "").trim();
          if (!raw) return "";

          var urlMatch = raw.match(new RegExp("(?:movie/|tmdb=|id=)([0-9]+)", "i"));
          if (urlMatch) return urlMatch[1];

          var numericMatch = raw.match(new RegExp("^([0-9]{2,14})$"));
          if (numericMatch) return numericMatch[1];

          return "";
        }

        function bindTabs() {
          all("[data-stable-tab]").forEach(function(btn) {
            if (btn.__swiflyPollingTabBound) return;
            btn.__swiflyPollingTabBound = true;
            btn.addEventListener("click", function() {
              var name = btn.getAttribute("data-stable-tab") || "open";
              all("[data-stable-tab]").forEach(function(other) {
                other.classList.toggle("active", other === btn);
              });
              [
                ["stableOpenPanel", "open"],
                ["stableRoomMoviePanel", "movie"],
                ["stableLivePanel", "live"],
                ["stableClockPanel", "clock"],
                ["stableCouplesPanel", "couples"]
              ].forEach(function(pair) {
                var panel = byId(pair[0]);
                if (panel) panel.classList.toggle("active", pair[1] === name);
              });
            });
          });
        }

        function startPollingFallback() {
          if (window.__swiflyDateRoomJoined) return;
          if (window.__swiflyDateRoomPollingStarted) return;
          window.__swiflyDateRoomPollingStarted = true;

          bindTabs();

          var roomId = "${safeRoomId}";
          var roomName = "${safeName}";
          var clientId = getClientId();
          var isHost = false;
          var movie = { status: "idle", movieId: "", proxyVideo: "", playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } };
          var lastMovieKey = "";
          var loadTimer = null;

          var status = byId("stableHostStatus");
          if (status) status.textContent = "Polling fallback...";

          function api(path, options) {
            options = options || {};
            options.headers = Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, options.headers || {});
            if (options.body && typeof options.body !== "string") options.body = JSON.stringify(options.body);
            return fetch(path, options).then(function(res) {
              return res.json().then(function(data) {
                if (!res.ok || data.ok === false) {
                  throw new Error(data.error || data.message || ("HTTP " + res.status));
                }
                return data;
              });
            });
          }

          function setHostMode(value) {
            isHost = Boolean(value);
            var text = isHost ? "You are host" : "View only";
            ["stableHostStatus", "stableOpenBadge", "stableLiveBadge", "stableRoomMovieBadge"].forEach(function(id) {
              var el = byId(id);
              if (el) el.textContent = text + " • polling";
            });
            ["stableOpenInput", "stableCountdownBtn", "stableStartLiveBtn", "stableStopLiveBtn", "roomMovieInput", "roomMovieSelectBtn", "roomMovieRestartBtn", "roomMoviePlayBtn", "roomMoviePauseBtn", "roomMovieBack10Btn", "roomMovieForward10Btn"].forEach(function(id) {
              var el = byId(id);
              if (el) el.disabled = !isHost;
            });
          }

          function openMovieTab() {
            var btn = document.querySelector('[data-stable-tab="movie"]');
            if (btn) btn.click();
          }

          function setMovieStatus(text) {
            var el = byId("roomMovieStatus");
            if (el) el.textContent = text || "";
          }

          function targetTime() {
            var sync = movie.sync || {};
            var offset = Math.max(0, Number(sync.offset || 0));
            if (!sync.playing || !sync.startedAt) return offset;
            return Math.max(0, offset + ((Date.now() - Number(sync.startedAt || Date.now())) / 1000));
          }

          function updateTimerUi() {
            var time = formatTime(targetTime());
            var el = byId("roomMovieTargetTime");
            if (el) el.textContent = time;
            var iframeTarget = byId("roomMovieIframeTarget");
            if (iframeTarget) iframeTarget.textContent = time;
          }

          function applyPollingVideoSync(force) {
            var video = byId("roomMovieVideo");
            if (!video || video.hidden || !movie.proxyVideo) return;
            var target = targetTime();
            var drift = Math.abs(Number(video.currentTime || 0) - target);
            if (force || drift > 1.5) {
              try { video.currentTime = target; } catch {}
            }
            if (movie.sync && movie.sync.playing) {
              video.play().catch(function(){});
            } else {
              try { video.pause(); } catch {}
            }
            setMovieStatus("Native video sync active. Room timer: " + formatTime(target));
          }

          function fallbackPollingIframe(reason) {
            var frame = byId("roomMovieFrame");
            var video = byId("roomMovieVideo");
            var overlay = byId("roomMovieIframeSyncOverlay");
            if (video) {
              try { video.pause(); } catch {}
              video.hidden = true;
              video.removeAttribute("src");
              try { video.load(); } catch {}
            }
            if (frame && movie.proxyVideo) {
              if (frame.src !== movie.proxyVideo) frame.src = movie.proxyVideo;
              frame.hidden = false;
            }
            if (overlay) overlay.hidden = false;
            setMovieStatus("Iframe fallback loaded. Use the room target timer if it drifts.");
            if (reason) console.warn("SwiflyTV polling iframe fallback:", reason);
          }

          function renderMovie(next) {
            if (!next) return;
            movie = Object.assign({ status: "idle", movieId: "", proxyVideo: "", playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } }, next);
            if (!movie.sync) movie.sync = { playing: false, offset: 0, startedAt: 0 };

            var key = [movie.status, movie.movieId, movie.proxyVideo, movie.playAt, movie.message].join("|");
            var title = byId("roomMovieTitle");
            if (title) title.textContent = movie.movieId ? ("TMDB #" + movie.movieId) : "No movie selected";

            if (!movie.movieId) {
              setMovieStatus("Host can select a movie and everyone will wait together.");
              return;
            }

            if (movie.status === "loading") {
              openMovieTab();
              setMovieStatus("Waiting for proxyVideo... this can take awhile.");
              var empty = byId("roomMovieEmpty");
              if (empty) {
                empty.hidden = false;
                var h = empty.querySelector("h3");
                var p = empty.querySelector("p");
                if (h) h.textContent = "Finding movie source...";
                if (p) p.textContent = "Waiting for proxyVideo. Everyone will load together when it returns.";
              }
              return;
            }

            if (movie.status === "error") {
              openMovieTab();
              setMovieStatus(movie.message || "proxyVideo failed.");
              return;
            }

            if (movie.status === "ready" && movie.proxyVideo) {
              openMovieTab();
              setMovieStatus("proxyVideo ready. Sync countdown active.");
              if (lastMovieKey !== key) {
                scheduleLoad();
              }
            }

            lastMovieKey = key;
          }

          function scheduleLoad() {
            if (loadTimer) clearInterval(loadTimer);
            var countdown = byId("roomMovieCountdown");
            var frame = byId("roomMovieFrame");
            var empty = byId("roomMovieEmpty");
            var stage = byId("roomMovieStage");

            loadTimer = setInterval(function() {
              updateTimerUi();
              var left = Math.ceil((Number(movie.playAt || 0) - Date.now()) / 1000);

              if (left > 0) {
                if (countdown) countdown.textContent = "Play in " + left;
                return;
              }

              if (countdown) countdown.textContent = "Play now";
              var video = byId("roomMovieVideo");
              var overlay = byId("roomMovieIframeSyncOverlay");
              if (movie.proxyVideo && video) {
                if (frame) {
                  frame.hidden = true;
                  frame.removeAttribute("src");
                }
                if (overlay) overlay.hidden = true;
                video.hidden = false;
                video.onerror = function(){ fallbackPollingIframe("native video error"); };
                video.onloadedmetadata = function(){ applyPollingVideoSync(true); };
                video.oncanplay = function(){ applyPollingVideoSync(true); };
                if (video.src !== movie.proxyVideo) {
                  video.src = movie.proxyVideo;
                  try { video.load(); } catch {}
                }
                setTimeout(function(){
                  if (!video.hidden && video.readyState === 0) fallbackPollingIframe("native video never became ready");
                }, 9000);
                applyPollingVideoSync(true);
                setInterval(function(){ updateTimerUi(); applyPollingVideoSync(false); }, 1000);
              } else if (frame && movie.proxyVideo) {
                fallbackPollingIframe("native video element missing");
              }
              if (empty) empty.hidden = true;
              if (stage) stage.classList.add("isReady");
              clearInterval(loadTimer);
              loadTimer = null;
            }, 250);
          }

          function join() {
            return api("/api/date-room/" + encodeURIComponent(roomId) + "/join", {
              method: "POST",
              body: { clientId: clientId, name: getName(), roomName: roomName }
            }).then(function(data) {
              setHostMode(data.isHost);
              if (data.room && data.room.syncedMovie) renderMovie(data.room.syncedMovie);
              var viewers = byId("stableViewerCount");
              if (viewers && data.room) viewers.textContent = String(data.room.viewers || 1);
              toast("Date Room polling fallback connected");
            }).catch(function(error) {
              var status = byId("stableHostStatus");
              if (status) status.textContent = "Offline";
              toast("Polling fallback failed: " + error.message);
            });
          }

          function poll() {
            api("/api/date-room/" + encodeURIComponent(roomId) + "/state?clientId=" + encodeURIComponent(clientId), {
              method: "GET"
            }).then(function(data) {
              setHostMode(data.isHost);
              if (data.room && data.room.syncedMovie) renderMovie(data.room.syncedMovie);
              var viewers = byId("stableViewerCount");
              if (viewers && data.room) viewers.textContent = String(data.room.viewers || 1);
            }).catch(function(){});
          }

          function postMovieControl(action, extra) {
            if (!isHost) return toast("Only host can control room movie");
            var video = byId("roomMovieVideo");
            var hostTime = video && !video.hidden ? Number(video.currentTime || 0) : targetTime();
            return api("/api/date-room/" + encodeURIComponent(roomId) + "/movie-control", {
              method: "POST",
              body: Object.assign({ clientId: clientId, action: action, clientTime: hostTime }, extra || {})
            }).then(function(data) {
              if (data.room && data.room.syncedMovie) renderMovie(data.room.syncedMovie);
            }).catch(function(error) {
              toast(error.message);
            });
          }

          var form = byId("roomMovieForm");
          if (form && !form.__swiflyPollingBound) {
            form.__swiflyPollingBound = true;
            form.addEventListener("submit", function(event) {
              if (!window.__swiflyDateRoomPollingStarted) return;
              event.preventDefault();
              event.stopImmediatePropagation();
              if (!isHost) return toast("Only host can select movie");

              var movieId = parseMovieId((byId("roomMovieInput") || {}).value || "");
              if (!movieId) return toast("Paste a TMDB movie ID or /watch/movie link");

              renderMovie({ status: "loading", movieId: movieId, message: "Waiting for proxyVideo..." });
              api("/api/date-room/" + encodeURIComponent(roomId) + "/movie-select", {
                method: "POST",
                body: { clientId: clientId, movieId: movieId, name: getName() }
              }).then(function(data) {
                if (data.room && data.room.syncedMovie) renderMovie(data.room.syncedMovie);
              }).catch(function(error) {
                setMovieStatus(error.message);
                toast(error.message);
              });
            }, true);
          }

          function bindClick(id, fn) {
            var el = byId(id);
            if (!el || el.__swiflyPollingBound) return;
            el.__swiflyPollingBound = true;
            el.addEventListener("click", function(event) {
              if (!window.__swiflyDateRoomPollingStarted) return;
              event.preventDefault();
              event.stopImmediatePropagation();
              fn();
            }, true);
          }

          bindClick("roomMovieRestartBtn", function(){ postMovieControl("restart"); });
          bindClick("roomMoviePlayBtn", function(){ postMovieControl("play"); });
          bindClick("roomMoviePauseBtn", function(){ postMovieControl("pause"); });
          bindClick("roomMovieBack10Btn", function(){ postMovieControl("seek", { delta: -10 }); });
          bindClick("roomMovieForward10Btn", function(){ postMovieControl("seek", { delta: 10 }); });
          bindClick("roomMovieOpenBtn", function(){
            if (!movie.movieId) return toast("No room movie selected");
            window.open("/watch/movie/" + encodeURIComponent(movie.movieId) + "?mode=movie", "_blank", "noopener");
          });
          bindClick("roomMovieCopyBtn", function(){
            var text = movie.movieId ? location.origin + "/watch/movie/" + movie.movieId + "?mode=movie" : "No movie selected";
            if (navigator.clipboard) navigator.clipboard.writeText(text);
            toast("Copied");
          });
          bindClick("roomMovieSyncMeBtn", function(){
            updateTimerUi();
            applyPollingVideoSync(true);
            toast("Synced to room timer");
          });

          var pollingVideo = byId("roomMovieVideo");
          if (pollingVideo && !pollingVideo.__swiflyPollingHostVideoBound) {
            pollingVideo.__swiflyPollingHostVideoBound = true;
            pollingVideo.addEventListener("play", function(){ if (isHost) postMovieControl("play", { clientTime: Number(pollingVideo.currentTime || 0) }); });
            pollingVideo.addEventListener("pause", function(){ if (isHost) postMovieControl("pause", { clientTime: Number(pollingVideo.currentTime || 0) }); });
            pollingVideo.addEventListener("seeked", function(){ if (isHost) postMovieControl("set", { time: Number(pollingVideo.currentTime || 0), clientTime: Number(pollingVideo.currentTime || 0) }); });
          }

          join().then(function() {
            poll();
            setInterval(poll, 1500);
            setInterval(updateTimerUi, 1000);
          });
        }

        bindTabs();

        setTimeout(function() {
          if (!window.__swiflyDateRoomJoined) {
            startPollingFallback();
          }
        }, 3500);
      })();

  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${room.name}`, active: "watchrooms", body }));
}

app.get("/welcome", welcomePage);
app.get("/", homePage);
app.get("/movies", (req, res) => listingPage(req, res, "movie", { sort: "popular" }));
app.get("/tv", (req, res) => listingPage(req, res, "tv", { sort: "popular" }));
app.get("/discover/movie", (req, res) => listingPage(req, res, "movie", { sort: req.query.sort || "discover" }));
app.get("/discover/tv", (req, res) => listingPage(req, res, "tv", { sort: req.query.sort || "discover" }));
app.get("/trending", trendingPage);
app.get("/search", searchPage);
app.get("/genres", genresPage);
app.get("/browse-by-languages", genresPage);
app.get("/genre/movie/:id", (req, res) => genrePage(req, res, "movie"));
app.get("/genre/tv/:id", (req, res) => genrePage(req, res, "tv"));
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/api/proxy-video-wait/movie/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({ type: "movie", id: req.params.id });
  res.json(result);
});

app.get("/api/proxy-video/movie/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({ type: "movie", id: req.params.id });
  res.json(result);
});

app.get("/api/proxy-video-debug/movie/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({ type: "movie", id: req.params.id });
  res.json({
    ...result,
    env: {
      primary: process.env.MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL || process.env.MOVIE_PROXY_VIDEO_PROVIDER_URL || "http://lschools.com/movie",
      fallbacks: process.env.MOVIE_PROXY_VIDEO_FALLBACK_BASE_URLS || "http://lscools.com/movie,https://lschools.com/movie,https://lscools.com/movie",
      timeoutMs: process.env.MOVIE_PROXY_VIDEO_TIMEOUT_MS || "60000",
      retries: process.env.MOVIE_PROXY_VIDEO_RETRIES || "2",
      legacyFallback: process.env.MOVIE_PROXY_VIDEO_ALLOW_LEGACY_FALLBACK || "false",
    }
  });
});

app.get("/api/movie-placeholder/:type/:id", async (req, res) => {
  const type = req.params.type === "tv" ? "tv" : "movie";
  const result = await fetchMoviePlaceholderSource({ type, id: req.params.id });
  res.json(result);
});

app.get("/watch/movie/:id", (req, res) => watchPage(req, res, "movie"));
app.get("/watch/tv/:id", (req, res) => watchPage(req, res, "tv"));
app.get("/movie/:id", (req, res) => detailPage(req, res, "movie"));
app.get("/tv/:id", (req, res) => detailPage(req, res, "tv"));
app.get("/people", peoplePage);
app.get("/person/:id", personDetailPage);
app.get("/watchlist", watchlistPage);
app.get("/my-list", watchlistPage);
app.get("/liked", likedPage);

function authPage(res, mode = "login") {
  const isSignup = String(mode || "login") === "signup";
  const title = isSignup ? "Create your account" : "Welcome back";
  const subtitle = isSignup
    ? "Make a local SwiflyTV account for couple profiles, date rooms, Our List, and shared watch plans on this device."
    : "Log in to your SwiflyTV couple space on this device.";

  const body = `<main class="dsAuthPage dsAuthPageSafe">
    <section class="dsAuthShell dsAuthShellSafe">
      <a class="dsAuthBrand" href="/"><span></span>${escapeHtml(SITE_NAME)}</a>

      <aside class="dsAuthPitch">
        <span class="dsEyebrow">${isSignup ? "Start your couple space" : "Welcome back"}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>

        <div class="dsAuthFeatureList">
          <div><b>Couple Profiles</b><span>Me, Partner, and Together.</span></div>
          <div><b>Date Rooms</b><span>Open Together, countdown, and chat.</span></div>
          <div><b>Our List</b><span>Save what you both want next.</span></div>
        </div>
      </aside>

      <section class="dsAuthCard">
        <div class="dsAuthSwitch">
          <a class="${!isSignup ? "active" : ""}" href="/login">Login</a>
          <a class="${isSignup ? "active" : ""}" href="/signup">Signup</a>
        </div>

        <h2>${isSignup ? "Sign up" : "Log in"}</h2>
        <p>${isSignup ? "This is a simple local account saved in your browser for your couple setup." : "Enter the same email/name you used on this device."}</p>

        <form id="safeAuthForm" class="dsSafeAuthForm">
          <label>
            <span>Name</span>
            <input name="name" placeholder="Your name" autocomplete="name" ${isSignup ? "required" : ""} />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" placeholder="Password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
          </label>

          <button class="dsPrimaryBtn" type="submit">${isSignup ? "Create account" : "Log in"}</button>
        </form>

        <p class="dsAuthFinePrint">
          ${isSignup
            ? `Already have one? <a href="/login">Log in</a>`
            : `Need an account? <a href="/signup">Sign up</a>`}
        </p>
      </section>
    </section>

    <script>
      (function safeAuth(){
        const form = document.getElementById("safeAuthForm");
        if (!form) return;

        const mode = "${isSignup ? "signup" : "login"}";
        const params = new URLSearchParams(location.search);
        const redirect = params.get("redirect") || "/profiles";

        function toast(msg) {
          if (window.showToast) showToast(msg);
          else alert(msg);
        }

        function readAccounts() {
          try {
            return JSON.parse(localStorage.getItem("swiflytv.accounts") || "[]");
          } catch {
            return [];
          }
        }

        function writeAccounts(accounts) {
          localStorage.setItem("swiflytv.accounts", JSON.stringify(accounts));
        }

        form.addEventListener("submit", function(event) {
          event.preventDefault();

          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          const email = String(fd.get("email") || "").trim().toLowerCase();
          const password = String(fd.get("password") || "");

          if (!email || !password) {
            toast("Email and password required");
            return;
          }

          let accounts = readAccounts();
          let account = accounts.find((item) => String(item.email || "").toLowerCase() === email);

          if (mode === "signup") {
            if (account) {
              toast("That account already exists on this device");
              return;
            }

            account = {
              id: Date.now().toString(36),
              name: name || email.split("@")[0] || "User",
              email,
              password,
              createdAt: Date.now()
            };

            accounts.push(account);
            writeAccounts(accounts);
          } else {
            if (!account) {
              account = {
                id: Date.now().toString(36),
                name: name || email.split("@")[0] || "User",
                email,
                password,
                createdAt: Date.now()
              };
              accounts.push(account);
              writeAccounts(accounts);
            } else if (String(account.password || "") !== password) {
              toast("Wrong password for this local account");
              return;
            }
          }

          localStorage.setItem("swiflytv.session", JSON.stringify({
            id: account.id,
            name: account.name,
            email: account.email,
            loggedInAt: Date.now()
          }));

          if (!localStorage.getItem("swiflytv.profiles")) {
            localStorage.setItem("swiflytv.profiles", JSON.stringify([
              { id: "me", name: account.name || "Me", mode: "standard" },
              { id: "partner", name: "Partner", mode: "standard" },
              { id: "together", name: "Together", mode: "standard" }
            ]));
          }

          toast(mode === "signup" ? "Account created" : "Logged in");
          location.href = redirect;
        });
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${isSignup ? "Signup" : "Login"}`, active: isSignup ? "signup" : "login", body }));
}


app.get("/login", (req, res) => authPage(res, "login"));
app.get("/signup", (req, res) => authPage(res, "signup"));

function accountPage(req, res) {
  const body = `<main class="dsPlainPage dsAccountPage">
    <section class="dsAccountHero">
      <div>
        <span class="dsEyebrow">Account</span>
        <h1>Your couple space</h1>
        <p>Manage couple profiles, Our List, hearts, date rooms, and what you are watching together.</p>
      </div>
      <div class="dsAccountActions">
        <a class="dsPrimaryBtn" href="/profiles">Profiles</a>
        <a class="dsSecondaryBtn" href="/my-list">My List</a>
        <a class="dsSecondaryBtn" href="/liked">Liked</a>
        <a class="dsGhostPill" href="/watchrooms">Date Rooms</a>
      </div>
    </section>

    <section class="dsAccountGrid">
      <a class="dsAccountCard" href="/profiles">
        <span>01</span>
        <h2>Couple Profiles</h2>
        <p>Choose Me, Partner, or Together.</p>
      </a>
      <a class="dsAccountCard" href="/continue">
        <span>02</span>
        <h2>Continue Together</h2>
        <p>Jump back into your last date-night watch.</p>
      </a>
      <a class="dsAccountCard" href="/my-list">
        <span>03</span>
        <h2>Our List</h2>
        <p>View titles saved for your next date.</p>
      </a>
      <a class="dsAccountCard" href="/watchrooms">
        <span>04</span>
        <h2>Date Rooms</h2>
        <p>Create or join a room with your person.</p>
      </a>
    </section>

    <script>
      (function accountLocalPreview(){
        try {
          var session = JSON.parse(localStorage.getItem("swiflytv.session") || "null");
          var profile = JSON.parse(localStorage.getItem("swiflytv.activeProfile") || "null");
          var title = document.querySelector(".dsAccountHero h1");
          if (title && (profile?.name || session?.name)) {
            title.textContent = "Welcome, " + (profile?.name || session?.name);
          }
        } catch {}
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Account`, active: "account", body }));
}



function apiStatus(req, res) {
  res.json({
    ok: true,
    name: SITE_NAME,
    uptime: Math.round(process.uptime()),
    timestamp: Date.now()
  });
}


function continueWatchingPage(req, res) {
  const body = `<main class="dsPlainPage dsContinuePage">
    <section class="dsContinueHero">
      <span class="dsEyebrow">Continue Watching</span>
      <h1>Pick up where you left off.</h1>
      <p>Your browser saves started titles locally. Open a title, press play, and it can show here on this device.</p>
      <div class="dsContinueActions">
        <a class="dsPrimaryBtn" href="/">Browse Home</a>
        <a class="dsSecondaryBtn" href="/movies">Movies</a>
        <a class="dsGhostPill" href="/tv">TV Shows</a>
      </div>
    </section>

    <section class="dsContinueList" id="continueList">
      <div class="dsEmptyContinue">
        <h2>No saved watching yet</h2>
        <p>When you start watching something, it will show up here.</p>
      </div>
    </section>

    <script>
      (function renderContinueWatching(){
        const root = document.getElementById("continueList");
        if (!root) return;

        let items = [];
        try {
          items = JSON.parse(localStorage.getItem("swiflytv.continueWatching") || "[]");
        } catch {}

        if (!Array.isArray(items) || !items.length) return;

        root.innerHTML = items.slice(0, 24).map((item) => {
          const type = item.type || item.media_type || "movie";
          const id = item.id || item.tmdbId || "";
          const title = String(item.title || item.name || "Untitled")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;");
          const poster = item.poster || item.poster_path || "";
          const href = id ? "/" + type + "/" + id : "#";
          const imgSrc = poster && poster.startsWith("http") ? poster : (poster ? "https://image.tmdb.org/t/p/w342" + poster : "");
          return '<a class="dsContinueCard" href="' + href + '">' +
            (imgSrc ? '<img src="' + imgSrc + '" alt="' + title + '" loading="lazy" />' : '<div class="posterFallback"><span>' + title.slice(0,1) + '</span></div>') +
            '<div><strong>' + title + '</strong><span>Continue watching</span></div>' +
          '</a>';
        }).join("");
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Continue Watching`, active: "continue", body }));
}


function profilesPage(req, res) {
  const body = `<main class="dsPlainPage dsProfilesPage">
    <section class="dsProfilesHero">
      <span class="dsEyebrow">Couple Profiles</span>
      <h1>Who is watching tonight?</h1>
      <p>Choose Me, Partner, or Together for browsing, date rooms, and saved lists.</p>
    </section>

    <section class="dsProfilesGrid" id="profilesGrid"></section>

    <section class="dsProfileCreate">
      <h2>Create couple profile</h2>
      <form id="profileCreateForm">
        <input name="name" placeholder="Me, Partner, or Together" maxlength="32" />
        <select name="mode">
          <option value="standard">Standard</option>
          <option value="kids">Kids Safe</option>
        </select>
        <button class="dsPrimaryBtn" type="submit">Add Profile</button>
      </form>
    </section>

    <script>
      (function profileUi(){
        const grid = document.getElementById("profilesGrid");
        const form = document.getElementById("profileCreateForm");
        if (!grid || !form) return;

        function readProfiles() {
          try {
            const saved = JSON.parse(localStorage.getItem("swiflytv.profiles") || "[]");
            if (Array.isArray(saved) && saved.length) return saved;
          } catch {}
          return [{ id: "me", name: "Me", mode: "standard" }, { id: "partner", name: "Partner", mode: "standard" }, { id: "together", name: "Together", mode: "standard" }];
        }

        function saveProfiles(profiles) {
          localStorage.setItem("swiflytv.profiles", JSON.stringify(profiles));
        }

        function esc(value) {
          return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
        }

        function render() {
          const profiles = readProfiles();
          grid.innerHTML = profiles.map((profile, index) => {
            return '<button class="dsProfileCard" data-index="' + index + '" type="button">' +
              '<span>' + esc(profile.name).slice(0,1).toUpperCase() + '</span>' +
              '<strong>' + esc(profile.name) + '</strong>' +
              '<small>' + (profile.mode === "kids" ? "Kids Safe" : "Standard") + '</small>' +
            '</button>';
          }).join("");

          grid.querySelectorAll(".dsProfileCard").forEach((button) => {
            button.addEventListener("click", () => {
              const profile = profiles[Number(button.dataset.index || 0)];
              localStorage.setItem("swiflytv.activeProfile", JSON.stringify(profile));
              location.href = profile.mode === "kids" ? "/kids" : "/";
            });
          });
        }

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim() || "Profile";
          const mode = String(fd.get("mode") || "standard");
          const profiles = readProfiles();
          profiles.push({ id: Date.now().toString(36), name, mode });
          saveProfiles(profiles);
          form.reset();
          render();
        });

        render();
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Profiles`, active: "profiles", body }));
}


app.get("/account", accountPage);
app.get("/continue-watching", continueWatchingPage);
app.get("/continue", continueWatchingPage);

function couplesPage(req, res) {
  const body = `<main class="dsPlainPage dsCouplesPage">
    <section class="dsCouplesHero">
      <div>
        <span class="dsEyebrow">Couple Dashboard</span>
        <h1>Tonight, together.</h1>
        <p>A small home base for long-distance couples: start a date room, save watch ideas, write a note, and keep the next movie night easy.</p>
      </div>
      <div class="dsCouplesHeroActions">
        <a class="dsPrimaryBtn" href="/watchrooms">Start Date Room</a>
        <a class="dsSecondaryBtn" href="/my-list">Open Our List</a>
        <a class="dsGhostPill" href="/profiles">Couple Profiles</a>
      </div>
    </section>

    <section class="dsCouplesGrid">
      <article class="dsCoupleCard dsCoupleNoteCard">
        <span>Love note</span>
        <h2>Leave something for them.</h2>
        <textarea id="coupleNoteInput" placeholder="Write a small note for your person..."></textarea>
        <button class="dsPrimaryBtn" id="saveCoupleNoteBtn" type="button">Save Note</button>
        <p id="coupleNotePreview"></p>
      </article>

      <article class="dsCoupleCard">
        <span>Next date</span>
        <h2>Plan the watch.</h2>
        <form id="couplePlanForm">
          <input name="title" placeholder="Movie/show idea" />
          <input name="time" placeholder="Date/time, like Friday 9PM" />
          <button class="dsPrimaryBtn" type="submit">Save Plan</button>
        </form>
        <div id="couplePlanPreview" class="dsCoupleSavedLine">No plan saved yet.</div>
      </article>

      <article class="dsCoupleCard">
        <span>Distance sync</span>
        <h2>Use the same moment.</h2>
        <p>When a video cannot embed, both of you open the real site and use a Date Room countdown.</p>
        <a class="dsSecondaryBtn" href="/watchrooms">Open Date Rooms</a>
      </article>

      <article class="dsCoupleCard">
        <span>Our vibe</span>
        <h2>Pick a mood.</h2>
        <div class="dsCoupleMoodGrid">
          <a href="/search?q=romance">Romantic</a>
          <a href="/search?q=comedy">Funny</a>
          <a href="/search?q=comfort">Comfort</a>
          <a href="/search?q=thriller">React together</a>
          <a href="/search?q=anime">Anime night</a>
          <a href="/search?q=christmas">Cozy seasonal</a>
        </div>
      </article>
          <article class="dsCoupleCard dsCouplesPlusSell">
        <span>Couples+</span>
        <h2>Premium features that feel personal.</h2>
        <p>Inside every Date Room: Taste Match, Date Night Generator, Missing You Mode, Couple Streaks, Private Timeline, Pause for Us, Date Room Themes, Couple Badges, and Sleepy Mode.</p>
        <a class="dsPrimaryBtn" href="/watchrooms">Try Couples+ in a Date Room</a>
      </article>

      <article class="dsCoupleCard">
        <span>Paid-worthy idea</span>
        <h2>Relationship memory layer.</h2>
        <p>Normal movie sites show movies. SwiflyTV keeps the little relationship moments around the movie: streaks, notes, reactions, and date memories.</p>
      </article>

      <article class="dsCoupleCard dsCoupleRitualCard">
        <span>Relationship ritual</span>
        <h2>Make movie night a habit.</h2>
        <ul>
          <li>Pick the vibe before the call</li>
          <li>Add one idea to the Date Jar</li>
          <li>Start a 10-second countdown</li>
          <li>Send one timed love note during the movie</li>
        </ul>
      </article>
    </section>

    <script>
      (function coupleDashboard(){
        const noteInput = document.getElementById("coupleNoteInput");
        const notePreview = document.getElementById("coupleNotePreview");
        const saveNote = document.getElementById("saveCoupleNoteBtn");
        const planForm = document.getElementById("couplePlanForm");
        const planPreview = document.getElementById("couplePlanPreview");

        function renderNote() {
          const note = localStorage.getItem("swiflytv.coupleNote") || "";
          if (noteInput) noteInput.value = note;
          if (notePreview) notePreview.textContent = note ? "Saved note: " + note : "No note saved yet.";
        }

        function renderPlan() {
          let plan = null;
          try { plan = JSON.parse(localStorage.getItem("swiflytv.couplePlan") || "null"); } catch {}
          if (planPreview) {
            planPreview.textContent = plan ? (plan.title + " — " + plan.time) : "No plan saved yet.";
          }
        }

        saveNote?.addEventListener("click", () => {
          localStorage.setItem("swiflytv.coupleNote", String(noteInput?.value || "").trim());
          renderNote();
          if (window.showToast) showToast("Love note saved");
        });

        planForm?.addEventListener("submit", (event) => {
          event.preventDefault();
          const fd = new FormData(planForm);
          const title = String(fd.get("title") || "").trim() || "Movie night";
          const time = String(fd.get("time") || "").trim() || "Soon";
          localStorage.setItem("swiflytv.couplePlan", JSON.stringify({ title, time, savedAt: Date.now() }));
          planForm.reset();
          renderPlan();
          if (window.showToast) showToast("Date plan saved");
        });

        renderNote();
        renderPlan();
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Couples`, active: "couples", body }));
}


app.get("/couples", couplesPage);
app.get("/watchrooms", watchroomsPage);
app.get("/watchrooms/:roomId", watchroomPage);
app.get("/profiles", profilesPage);

app.get("/kids", async (req, res) => {
  const [family, animation, disneyStyle, kidsTv, familyTv, preschoolTv] = await Promise.all([
    tmdb("/discover/movie", kidsMovieParams({ with_genres: "10751" }), CACHE_TTL.medium),
    tmdb("/discover/movie", kidsMovieParams({ with_genres: "16" }), CACHE_TTL.medium),
    tmdb("/discover/movie", kidsMovieParams({ with_keywords: "207317|210024|287501" }), CACHE_TTL.medium),
    tmdb("/discover/tv", kidsTvParams({ with_genres: "10762" }), CACHE_TTL.medium),
    tmdb("/discover/tv", kidsTvParams({ with_genres: "10751" }), CACHE_TTL.medium),
    tmdb("/discover/tv", kidsTvParams({ with_genres: "16" }), CACHE_TTL.medium),
  ]);

  const firstError = [family, animation, disneyStyle, kidsTv, familyTv, preschoolTv].find((data) => data.__error);
  if (firstError) return res.send(setupNeededPage(firstError.message));

  const familyMovies = kidsSafeResults(family.results || []);
  const animatedMovies = kidsSafeResults(animation.results || []);
  const gentleMovies = kidsSafeResults(disneyStyle.results || []);
  const kidsShows = kidsSafeResults(kidsTv.results || []);
  const familyShows = kidsSafeResults(familyTv.results || []);
  const animatedShows = kidsSafeResults(preschoolTv.results || []);
  const hero = pickHero([...familyMovies, ...animatedMovies, ...kidsShows, ...familyShows]);

  const body = `<main class="kidsModePage">
    <section class="kidsLockBanner">
      <div>
        <span class="dsEyebrow">Kids Safe Mode</span>
        <h1>Kids</h1>
        <p>Adult titles are blocked here using TMDB adult flags, family genres, US PG-and-under movie certification filters, and extra keyword filtering.</p>
      </div>
      <a class="dsSecondaryBtn" href="/profiles">Switch Profile</a>
    </section>
    ${dsHero({ hero, context: "Kids", eyebrow: "Family friendly picks" })}
    <section class="dsContent">
      ${dsRail("Family Movies", familyMovies, "movie")}
      ${dsRail("Animated Favorites", animatedMovies, "movie")}
      ${dsRail("Gentle Picks", gentleMovies, "movie")}
      ${dsRail("Kids TV", kidsShows, "tv")}
      ${dsRail("Family Shows", familyShows, "tv")}
      ${dsRail("Animated Shows", animatedShows, "tv")}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Kids`, active: "kids", body }));
});


app.get("/api/movie-source/:type/:id", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const source = await fetchMoviePlaceholderSource({ type, id: req.params.id });
    res.json(source);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Movie placeholder provider failed.",
      detail: process.env.NODE_ENV === "development" ? String(error.message || error) : undefined,
    });
  }
});

app.get("/api/watchrooms", (req, res) => {
  const rooms = [...watchRooms.values()]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 24)
    .map(publicRoom);
  res.json({ rooms });
});

app.get("/api/status", apiStatus);
app.get("/health", apiStatus);
app.get("/api/remote-browser/status", (req, res) => {
  const executablePath = findChromiumExecutable() || "";
  const enabled = process.env.REMOTE_BROWSER_ENABLED === "true";
  const hasWsUrl = Boolean(process.env.REMOTE_BROWSER_WS_URL);

  res.json({
    enabled,
    hasWsUrl,
    executablePath,
    ready: enabled && (hasWsUrl || Boolean(executablePath)) && !remoteBrowserLaunchError,
    launchError: remoteBrowserLaunchError || "",
    runtimeHint: executablePath
      ? "Chromium found. Remote Browser can launch locally."
      : hasWsUrl
        ? "Remote browser WebSocket configured."
        : "Chromium not found. On Render, deploy as Docker using the included Dockerfile, or set REMOTE_BROWSER_WS_URL.",
    dockerExpectedPath: "/ms-playwright",
    renderModeNeeded: "Docker",
  });
});


app.get("/api/tmdb/:path(*)", async (req, res) => {
  const endpoint = `/${req.params.path}`;
  const data = await tmdb(endpoint, req.query, CACHE_TTL.short);
  res.status(data.status || 200).json(data);
});


function dateRoomRestClientId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function dateRoomRestIsHost(room, clientId) {
  if (!room.restHostClientId && clientId) {
    room.restHostClientId = clientId;
  }
  return Boolean(clientId && room.restHostClientId === clientId);
}

function emitDateRoomRestState(room) {
  return {
    room: publicRoom(room),
    state: room.state,
    messages: room.messages.slice(-40),
  };
}

async function resolveDateRoomProxyVideoInBackground(roomId, movieId, selectedBy, requestId) {
  const result = await fetchProxyVideoSource({ type: "movie", id: movieId });
  const room = watchRooms.get(roomId);
  if (!room || !room.syncedMovie || room.syncedMovie.requestId !== requestId) return;

  if (result.status === "ok" && result.proxyVideo) {
    room.syncedMovie = {
      status: "ready",
      movieId,
      proxyVideo: result.proxyVideo,
      providerUrl: result.providerUrl || "",
      sourceUrl: result.sourceUrl || "",
      playAt: Date.now() + 7000,
      selectedBy,
      requestId,
      message: "proxyVideo ready. Sync countdown started.",
      sync: createMovieSyncState({ playing: true, offset: 0, startedAt: Date.now() + 7000 }),
      updatedAt: Date.now(),
    };

    room.messages.push({
      name: "System",
      text: `proxyVideo is ready for TMDB #${movieId}. Room starts in 7 seconds.`,
      createdAt: Date.now(),
    });
  } else {
    room.syncedMovie = {
      status: "error",
      movieId,
      proxyVideo: "",
      playAt: 0,
      selectedBy,
      requestId,
      message: result.message || "proxyVideo did not return for this movie.",
      attempts: result.attempts || [],
      sync: createMovieSyncState(),
      updatedAt: Date.now(),
    };

    room.messages.push({
      name: "System",
      text: `proxyVideo failed for TMDB #${movieId}: ${room.syncedMovie.message}`,
      createdAt: Date.now(),
    });
  }

  room.messages = room.messages.slice(-80);
  room.updatedAt = Date.now();

  io.to(room.id).emit("watchroom:movie-sync", {
    roomId: room.id,
    movie: room.syncedMovie,
  });
}

app.post("/api/date-room/:roomId/join", (req, res) => {
  res.set("Cache-Control", "no-store");
  const roomId = normalizeRoomId(req.params.roomId);
  const clientId = dateRoomRestClientId(req.body?.clientId);
  const name = String(req.body?.name || "Guest").slice(0, 40);
  const roomName = String(req.body?.roomName || "SwiflyTV Date Room").slice(0, 80);

  if (!roomId || !clientId) {
    return res.status(400).json({ ok: false, error: "roomId and clientId required" });
  }

  const room = getOrCreateWatchRoom(roomId, {
    name: roomName,
    host: name,
  });

  const isHost = dateRoomRestIsHost(room, clientId);
  room.restViewers = room.restViewers || {};
  room.restViewers[clientId] = { name, seenAt: Date.now() };
  room.viewers = Math.max(io.sockets.adapter.rooms.get(room.id)?.size || 0, Object.keys(room.restViewers).length);
  room.updatedAt = Date.now();

  res.json({
    ok: true,
    isHost,
    clientId,
    ...emitDateRoomRestState(room),
  });
});

app.get("/api/date-room/:roomId/state", (req, res) => {
  res.set("Cache-Control", "no-store");
  const roomId = normalizeRoomId(req.params.roomId);
  const clientId = dateRoomRestClientId(req.query.clientId);
  const room = watchRooms.get(roomId);

  if (!room) {
    return res.status(404).json({ ok: false, error: "room_not_found" });
  }

  if (clientId) {
    room.restViewers = room.restViewers || {};
    if (room.restViewers[clientId]) room.restViewers[clientId].seenAt = Date.now();
  }

  room.viewers = Math.max(io.sockets.adapter.rooms.get(room.id)?.size || 0, Object.keys(room.restViewers || {}).length);
  res.json({
    ok: true,
    isHost: dateRoomRestIsHost(room, clientId),
    ...emitDateRoomRestState(room),
  });
});

app.post("/api/date-room/:roomId/movie-select", (req, res) => {
  res.set("Cache-Control", "no-store");
  const roomId = normalizeRoomId(req.params.roomId);
  const clientId = dateRoomRestClientId(req.body?.clientId);
  const movieId = String(req.body?.movieId || "").replace(/\D/g, "").slice(0, 14);
  const name = String(req.body?.name || "Host").slice(0, 40);
  const room = watchRooms.get(roomId);

  if (!room) return res.status(404).json({ ok: false, error: "room_not_found" });
  if (!dateRoomRestIsHost(room, clientId)) return res.status(403).json({ ok: false, error: "host_only" });
  if (!movieId) return res.status(400).json({ ok: false, error: "movieId_required" });

  const requestId = Math.random().toString(36).slice(2, 10);
  room.syncedMovie = {
    status: "loading",
    movieId,
    proxyVideo: "",
    playAt: 0,
    selectedBy: name,
    requestId,
    message: "Waiting for proxyVideo...",
    sync: createMovieSyncState(),
    updatedAt: Date.now(),
  };

  room.messages.push({
    name: "System",
    text: `${name} selected TMDB #${movieId}. Waiting for proxyVideo...`,
    createdAt: Date.now(),
  });
  room.messages = room.messages.slice(-80);
  room.updatedAt = Date.now();

  io.to(room.id).emit("watchroom:movie-sync", {
    roomId: room.id,
    movie: room.syncedMovie,
  });

  resolveDateRoomProxyVideoInBackground(room.id, movieId, name, requestId).catch((error) => {
    const latest = watchRooms.get(room.id);
    if (!latest || !latest.syncedMovie || latest.syncedMovie.requestId !== requestId) return;
    latest.syncedMovie.status = "error";
    latest.syncedMovie.message = error.message || "proxyVideo background request failed.";
    latest.syncedMovie.updatedAt = Date.now();
    latest.updatedAt = Date.now();
  });

  res.json({
    ok: true,
    isHost: true,
    ...emitDateRoomRestState(room),
  });
});

app.post("/api/date-room/:roomId/movie-control", (req, res) => {
  res.set("Cache-Control", "no-store");
  const roomId = normalizeRoomId(req.params.roomId);
  const clientId = dateRoomRestClientId(req.body?.clientId);
  const action = String(req.body?.action || "").slice(0, 30);
  const room = watchRooms.get(roomId);

  if (!room) return res.status(404).json({ ok: false, error: "room_not_found" });
  if (!dateRoomRestIsHost(room, clientId)) return res.status(403).json({ ok: false, error: "host_only" });
  if (!room.syncedMovie || !room.syncedMovie.movieId) return res.status(400).json({ ok: false, error: "no_movie" });

  ensureSyncedMovieSync(room.syncedMovie);

  const now = Date.now();
  const current = currentSyncedMovieSeconds(room.syncedMovie);
  let offset = current;
  let playing = Boolean(room.syncedMovie.sync.playing);
  let message = "";

  const clientTime = Number(req.body?.clientTime);
  const hasClientTime = Number.isFinite(clientTime) && clientTime >= 0;

  if (action === "play") {
    playing = true;
    offset = hasClientTime ? clientTime : current;
    message = "Host pressed play. Room timer is running.";
  } else if (action === "pause") {
    playing = false;
    offset = hasClientTime ? clientTime : current;
    message = "Host paused the room timer.";
  } else if (action === "seek") {
    const delta = Math.max(-600, Math.min(600, Number(req.body?.delta || 0)));
    offset = Math.max(0, current + delta);
    message = `Host moved the room timer ${delta >= 0 ? "+" : ""}${delta}s.`;
  } else if (action === "set") {
    offset = Math.max(0, Number(req.body?.time || req.body?.clientTime || 0));
    message = `Host set the room timer to ${Math.floor(offset)}s.`;
  } else if (action === "restart") {
    room.syncedMovie.playAt = Date.now() + 7000;
    room.syncedMovie.sync = createMovieSyncState({ playing: true, offset: 0, startedAt: room.syncedMovie.playAt });
    room.syncedMovie.status = "ready";
    room.syncedMovie.message = "Sync countdown restarted.";
    room.syncedMovie.updatedAt = Date.now();
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:movie-sync", { roomId: room.id, movie: room.syncedMovie });
    return res.json({ ok: true, isHost: true, ...emitDateRoomRestState(room) });
  } else {
    return res.status(400).json({ ok: false, error: "unknown_action" });
  }

  room.syncedMovie.sync = createMovieSyncState({
    playing,
    offset,
    startedAt: playing ? now : 0,
  });
  room.syncedMovie.message = message;
  room.syncedMovie.updatedAt = now;
  room.updatedAt = now;

  room.messages.push({ name: "System", text: message, createdAt: now });
  room.messages = room.messages.slice(-80);

  io.to(room.id).emit("watchroom:movie-sync-state", {
    roomId: room.id,
    movieId: room.syncedMovie.movieId,
    sync: room.syncedMovie.sync,
    message,
  });

  res.json({
    ok: true,
    isHost: true,
    ...emitDateRoomRestState(room),
  });
});


app.use((req, res) => {
  res.status(404).send(pageShell({
    title: `${SITE_NAME} — Not found`,
    body: `<main class="container"><div class="emptyState"><h1>Page not found.</h1><p>That route does not exist. Try the homepage, movies, TV, search, or your watchlist.</p><a class="btn primary" href="/">Go home</a></div></main>`,
  }));
});


const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  socket.data.roomId = "";

  socket.on("watchroom:join", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId);
    if (!roomId) return;

    const room = getOrCreateWatchRoom(roomId, {
      name: payload.name,
      videoId: payload.videoId,
      embedUrl: payload.embedUrl,
      mediaKind: payload.mediaKind,
      browserUrl: payload.browserUrl,
      host: payload.user,
    });

    socket.data.roomId = room.id;
    socket.join(room.id);

    if (!room.hostSocketId) room.hostSocketId = socket.id;
    const isHost = room.hostSocketId === socket.id;
    socket.data.isWatchroomHost = isHost;

    room.viewers = io.sockets.adapter.rooms.get(room.id)?.size || 0;
    room.updatedAt = Date.now();

    socket.emit("watchroom:joined", {
      room: publicRoom(room),
      state: room.state,
      messages: room.messages.slice(-40),
      isHost,
    });

    if (room.liveShareActive && !isHost) {
      socket.emit("watchroom:live-status", { roomId: room.id, active: true, host: room.host || "Host" });
    }

    if (room.syncedMovie && room.syncedMovie.movieId) {
      socket.emit("watchroom:movie-sync", {
        roomId: room.id,
        movie: room.syncedMovie,
      });
    }

    if (room.openTogetherUrl) {
      socket.emit("watchroom:open-together", {
        roomId: room.id,
        url: room.openTogetherUrl,
        countdownEndsAt: Number(room.openTogetherCountdownEndsAt || 0),
      });
    }

    io.to(room.id).emit("watchroom:viewers", { roomId: room.id, viewers: room.viewers });
  });

  socket.on("watchroom:state", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    room.state = {
      playing: Boolean(payload.playing),
      time: Math.max(0, Number(payload.time || 0)),
      videoId: String(payload.videoId || room.videoId || "").slice(0, 40),
      updatedAt: Date.now(),
    };
    if (room.state.videoId) room.videoId = room.state.videoId;
    room.updatedAt = Date.now();

    socket.to(room.id).emit("watchroom:state", room.state);
  });

  socket.on("watchroom:trailer", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = getOrCreateWatchRoom(roomId, {
      name: payload.name,
      trailerUrl: payload.trailerUrl,
      embedUrl: payload.embedUrl,
      videoId: payload.videoId,
      mediaKind: payload.mediaKind,
    });

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can change media.",
        createdAt: Date.now(),
      });
      return;
    }

    room.videoId = String(payload.videoId || "").slice(0, 40);
    room.trailerUrl = String(payload.trailerUrl || "").slice(0, 500);
    room.embedUrl = String(payload.embedUrl || payload.trailerUrl || "").slice(0, 800);
    room.mediaKind = String(payload.mediaKind || (room.videoId ? "youtube" : "embed")).slice(0, 20);
    room.state = { playing: false, time: 0, videoId: room.videoId, updatedAt: Date.now() };
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:trailer", {
      roomId: room.id,
      videoId: room.videoId,
      embedUrl: room.embedUrl,
      trailerUrl: room.trailerUrl,
      mediaKind: room.mediaKind,
      createdAt: room.createdAt,
    });
  });

  socket.on("watchroom:browser", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can control the shared browser.",
        createdAt: Date.now(),
      });
      return;
    }

    const browserUrl = normalizeSharedBrowserUrl(payload.browserUrl || "");
    if (!browserUrl) return;

    room.browserUrl = browserUrl;
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:browser", {
      roomId: room.id,
      browserUrl: room.browserUrl,
      updatedAt: room.updatedAt,
    });
  });

  socket.on("watchroom:movie-select", async (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can select the room movie.",
        createdAt: Date.now(),
      });
      return;
    }

    const movieId = String(payload.movieId || "").replace(/\D/g, "").slice(0, 14);
    if (!movieId) return;

    const selectedBy = String(payload.name || room.host || "Host").slice(0, 40);
    const requestId = Math.random().toString(36).slice(2, 10);

    room.syncedMovie = {
      status: "loading",
      movieId,
      proxyVideo: "",
      playAt: 0,
      selectedBy,
      requestId,
      message: "Waiting for proxyVideo...",
      updatedAt: Date.now(),
    };
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:movie-sync", {
      roomId: room.id,
      movie: room.syncedMovie,
    });

    io.to(room.id).emit("watchroom:message", {
      name: "System",
      text: `${selectedBy} selected TMDB #${movieId}. Waiting for proxyVideo...`,
      createdAt: Date.now(),
    });

    const result = await fetchProxyVideoSource({ type: "movie", id: movieId });

    const latest = watchRooms.get(roomId);
    if (!latest || !latest.syncedMovie || latest.syncedMovie.requestId !== requestId) return;

    if (result.status === "ok" && result.proxyVideo) {
      latest.syncedMovie = {
        status: "ready",
        movieId,
        proxyVideo: result.proxyVideo,
        providerUrl: result.providerUrl || "",
        sourceUrl: result.sourceUrl || "",
        playAt: Date.now() + 7000,
        selectedBy,
        requestId,
        message: "proxyVideo ready. Sync countdown started.",
        sync: createMovieSyncState({ playing: true, offset: 0, startedAt: Date.now() + 7000 }),
        updatedAt: Date.now(),
      };
    } else {
      latest.syncedMovie = {
        status: "error",
        movieId,
        proxyVideo: "",
        playAt: 0,
        selectedBy,
        requestId,
        message: result.message || "proxyVideo did not return for this movie.",
        sync: createMovieSyncState(),
        attempts: result.attempts || [],
        updatedAt: Date.now(),
      };
    }

    latest.updatedAt = Date.now();

    io.to(latest.id).emit("watchroom:movie-sync", {
      roomId: latest.id,
      movie: latest.syncedMovie,
    });

    io.to(latest.id).emit("watchroom:message", {
      name: "System",
      text: latest.syncedMovie.status === "ready"
        ? `proxyVideo is ready for TMDB #${movieId}. Room starts in 7 seconds.`
        : `proxyVideo failed for TMDB #${movieId}: ${latest.syncedMovie.message}`,
      createdAt: Date.now(),
    });
  });

  socket.on("watchroom:movie-control", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || !room.syncedMovie || !room.syncedMovie.movieId) return;

    const action = String(payload.action || "").slice(0, 30);

    if (action !== "sync-me" && room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can control the room movie timer.",
        createdAt: Date.now(),
      });
      return;
    }

    ensureSyncedMovieSync(room.syncedMovie);

    const now = Date.now();
    const current = currentSyncedMovieSeconds(room.syncedMovie);
    let offset = current;
    let playing = Boolean(room.syncedMovie.sync.playing);
    let message = "";

    const clientTime = Number(payload.clientTime);
    const hasClientTime = Number.isFinite(clientTime) && clientTime >= 0;

    if (action === "play") {
      playing = true;
      offset = hasClientTime ? clientTime : current;
      message = "Host pressed play. Room timer is running.";
    } else if (action === "pause") {
      playing = false;
      offset = hasClientTime ? clientTime : current;
      message = "Host paused the room timer.";
    } else if (action === "seek") {
      const delta = Math.max(-600, Math.min(600, Number(payload.delta || 0)));
      offset = Math.max(0, current + delta);
      message = `Host moved the room timer ${delta >= 0 ? "+" : ""}${delta}s.`;
    } else if (action === "set") {
      offset = Math.max(0, Number(payload.time || payload.clientTime || 0));
      message = `Host set the room timer to ${Math.floor(offset)}s.`;
    } else if (action === "sync-me") {
      socket.emit("watchroom:movie-sync-state", {
        roomId: room.id,
        sync: room.syncedMovie.sync,
        message: "Synced to current room timer.",
      });
      return;
    } else {
      return;
    }

    room.syncedMovie.sync = createMovieSyncState({
      playing,
      offset,
      startedAt: playing ? now : 0,
    });
    room.syncedMovie.message = message;
    room.syncedMovie.updatedAt = now;
    room.updatedAt = now;

    io.to(room.id).emit("watchroom:movie-sync-state", {
      roomId: room.id,
      movieId: room.syncedMovie.movieId,
      sync: room.syncedMovie.sync,
      message,
    });

    io.to(room.id).emit("watchroom:message", {
      name: "System",
      text: message,
      createdAt: now,
    });
  });

  socket.on("watchroom:movie-sync-start", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || !room.syncedMovie || !room.syncedMovie.proxyVideo) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can restart the movie sync countdown.",
        createdAt: Date.now(),
      });
      return;
    }

    const delayMs = Math.max(1000, Math.min(30000, Number(payload.delayMs || 7000)));
    room.syncedMovie.playAt = Date.now() + delayMs;
    room.syncedMovie.status = "ready";
    room.syncedMovie.sync = createMovieSyncState({ playing: true, offset: 0, startedAt: room.syncedMovie.playAt });
    room.syncedMovie.message = "Sync countdown restarted.";
    room.syncedMovie.updatedAt = Date.now();
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:movie-sync", {
      roomId: room.id,
      movie: room.syncedMovie,
    });

    io.to(room.id).emit("watchroom:message", {
      name: "System",
      text: `Movie sync countdown restarted. Play in ${Math.ceil(delayMs / 1000)} seconds.`,
      createdAt: Date.now(),
    });
  });

  socket.on("watchroom:open-together", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        name: "System",
        text: "Only the host can share Open Together links.",
        createdAt: Date.now(),
      });
      return;
    }

    const url = normalizeSharedBrowserUrl(payload.url || "");
    if (!url) return;

    room.openTogetherUrl = url;
    room.openTogetherCountdownEndsAt = Math.max(0, Number(payload.countdownEndsAt || 0));
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:open-together", {
      roomId: room.id,
      url: room.openTogetherUrl,
      countdownEndsAt: room.openTogetherCountdownEndsAt,
    });
  });

  socket.on("watchroom:live-start", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:live-status", { active: false, message: "Only the host can start Live Share." });
      return;
    }

    room.liveShareActive = true;
    room.liveHostSocketId = socket.id;
    room.updatedAt = Date.now();

    socket.to(room.id).emit("watchroom:live-status", {
      roomId: room.id,
      active: true,
      host: String(payload.name || room.host || "Host").slice(0, 40),
    });
  });

  socket.on("watchroom:live-viewer-ready", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || !room.liveShareActive || !room.liveHostSocketId) {
      socket.emit("watchroom:live-status", { active: false, message: "Waiting for host to start Live Share." });
      return;
    }

    io.to(room.liveHostSocketId).emit("watchroom:live-viewer-ready", {
      roomId: room.id,
      viewerSocketId: socket.id,
    });
  });

  socket.on("watchroom:live-offer", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || room.liveHostSocketId !== socket.id) return;

    const target = String(payload.target || "");
    if (!target) return;

    io.to(target).emit("watchroom:live-offer", {
      roomId: room.id,
      from: socket.id,
      description: payload.description,
    });
  });

  socket.on("watchroom:live-answer", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    const target = String(payload.target || "");
    if (!target) return;

    io.to(target).emit("watchroom:live-answer", {
      roomId: room.id,
      from: socket.id,
      description: payload.description,
    });
  });

  socket.on("watchroom:live-ice", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    const target = String(payload.target || "");
    if (!target) return;

    io.to(target).emit("watchroom:live-ice", {
      roomId: room.id,
      from: socket.id,
      candidate: payload.candidate,
    });
  });

  socket.on("watchroom:live-stop", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || room.liveHostSocketId !== socket.id) return;

    room.liveShareActive = false;
    room.liveHostSocketId = "";
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:live-stop", { roomId: room.id });
  });

  socket.on("watchroom:remote-start", async (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:remote-status", {
        roomId: room.id,
        status: "locked",
        message: "Only the host can control the remote browser.",
      });
      return;
    }

    const url = await normalizeRemoteBrowserUrl(payload.url || "", socket.request);
    if (!url) {
      socket.emit("watchroom:remote-status", {
        roomId: room.id,
        status: "blocked",
        message: "Remote browser URL was blocked or invalid.",
      });
      return;
    }

    try {
      const session = await getRemoteBrowserSession(room);
      await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 18000 });
      session.url = session.page.url();
      ensureRemoteBrowserStream(io, room);
      await emitRemoteBrowserFrame(io, room, "navigate");
      io.to(room.id).emit("watchroom:remote-status", {
        roomId: room.id,
        status: "ready",
        message: "Remote browser opened.",
      });
    } catch (error) {
      socket.emit("watchroom:remote-status", {
        roomId: room.id,
        status: "error",
        message: error.message || "Remote browser failed to start.",
      });
    }
  });

  socket.on("watchroom:remote-click", async (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;

    const session = remoteBrowserSessions.get(room.id);
    if (!session?.page) return;

    try {
      const viewport = session.page.viewportSize() || { width: 1280, height: 720 };
      const x = Math.max(0, Math.min(1, Number(payload.x || 0))) * viewport.width;
      const y = Math.max(0, Math.min(1, Number(payload.y || 0))) * viewport.height;
      await session.page.mouse.click(x, y);
      session.url = session.page.url();
      await emitRemoteBrowserFrame(io, room, "click");
    } catch {
      socket.emit("watchroom:remote-status", { roomId: room.id, status: "error", message: "Remote click failed." });
    }
  });

  socket.on("watchroom:remote-type", async (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;

    const session = remoteBrowserSessions.get(room.id);
    if (!session?.page) return;

    try {
      const text = String(payload.text || "").slice(0, 180);
      await session.page.keyboard.type(text, { delay: 12 });
      await emitRemoteBrowserFrame(io, room, "type");
    } catch {
      socket.emit("watchroom:remote-status", { roomId: room.id, status: "error", message: "Remote typing failed." });
    }
  });

  socket.on("watchroom:remote-key", async (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;

    const session = remoteBrowserSessions.get(room.id);
    if (!session?.page) return;

    try {
      const key = String(payload.key || "").slice(0, 30);
      if (key === "Alt+Left") {
        await session.page.goBack({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
      } else if (key) {
        await session.page.keyboard.press(key);
      }
      session.url = session.page.url();
      await emitRemoteBrowserFrame(io, room, "key");
    } catch {
      socket.emit("watchroom:remote-status", { roomId: room.id, status: "error", message: "Remote key failed." });
    }
  });

  socket.on("watchroom:couple-event", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    if (!room.couplePlus) room.couplePlus = { ready: {}, moods: {}, notes: [], jar: [], tastes: {}, timeline: [], badges: [], theme: "midnight", missingYou: false, sleepy: false, pause: null };

    const type = String(payload.type || "").slice(0, 40);
    const name = String(payload.name || "Guest").slice(0, 40);
    const data = payload.data || {};

    const pushTimeline = (text) => {
      room.couplePlus.timeline = Array.isArray(room.couplePlus.timeline) ? room.couplePlus.timeline : [];
      room.couplePlus.timeline.unshift({
        id: Math.random().toString(36).slice(2, 10),
        text: String(text || "").slice(0, 180),
        at: Date.now(),
      });
      room.couplePlus.timeline = room.couplePlus.timeline.slice(0, 40);
    };

    if (type === "ready") {
      room.couplePlus.ready[socket.id] = { name, at: Date.now() };
    } else if (type === "reset-ready") {
      room.couplePlus.ready = {};
    } else if (type === "mood") {
      room.couplePlus.moods[socket.id] = {
        name,
        mood: String(data.mood || "").slice(0, 40),
        at: Date.now(),
      };
    } else if (type === "taste") {
      const tastes = Array.isArray(data.tastes) ? data.tastes.map((item) => String(item).slice(0, 40)).slice(0, 8) : [];
      room.couplePlus.tastes = room.couplePlus.tastes || {};
      room.couplePlus.tastes[socket.id] = { name, tastes, at: Date.now() };
    } else if (type === "note") {
      const note = {
        id: Math.random().toString(36).slice(2, 10),
        from: name,
        text: String(data.text || "").slice(0, 160),
        time: Math.max(0, Number(data.time || 0)),
        at: Date.now(),
      };
      if (note.text) {
        room.couplePlus.notes.push(note);
        pushTimeline(`${name} scheduled a love note`);
      }
      room.couplePlus.notes = room.couplePlus.notes.slice(-30);
    } else if (type === "jar") {
      const idea = {
        id: Math.random().toString(36).slice(2, 10),
        from: name,
        text: String(data.text || "").slice(0, 120),
        at: Date.now(),
      };
      if (idea.text) {
        room.couplePlus.jar.push(idea);
        pushTimeline(`${name} added a date idea: ${idea.text}`);
      }
      room.couplePlus.jar = room.couplePlus.jar.slice(-30);
    } else if (type === "reaction") {
      // Reactions are live-only and not stored.
    } else if (type === "mode") {
      room.couplePlus.missingYou = Boolean(data.missingYou);
      room.couplePlus.sleepy = Boolean(data.sleepy);
      pushTimeline(`${name} changed the room mode`);
    } else if (type === "theme") {
      const allowed = new Set(["midnight", "cozy", "rainy", "valentine", "theater"]);
      const theme = String(data.theme || "midnight").slice(0, 40);
      room.couplePlus.theme = allowed.has(theme) ? theme : "midnight";
      pushTimeline(`${name} changed the room theme to ${room.couplePlus.theme}`);
    } else if (type === "pause") {
      room.couplePlus.pause = { name, at: Date.now() };
      pushTimeline(`${name} paused for a moment`);
    } else if (type === "resume") {
      room.couplePlus.pause = null;
      pushTimeline(`${name} resumed the date`);
    } else if (type === "complete-date") {
      const badge = "Date Night Complete";
      room.couplePlus.badges = Array.isArray(room.couplePlus.badges) ? room.couplePlus.badges : [];
      if (!room.couplePlus.badges.includes(badge)) room.couplePlus.badges.push(badge);
      pushTimeline(`${name} marked the date night complete`);
    } else if (type === "timeline") {
      pushTimeline(`${name}: ${String(data.text || "").slice(0, 140)}`);
    } else {
      return;
    }

    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:couple-event", {
      roomId: room.id,
      type,
      name,
      data: {
        mood: String(data.mood || "").slice(0, 40),
        emoji: String(data.emoji || "").slice(0, 8),
        theme: String(data.theme || "").slice(0, 40),
      },
      state: room.couplePlus,
      at: Date.now(),
    });
  });

  socket.on("watchroom:message", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room) return;

    const message = {
      name: String(payload.name || "Guest").slice(0, 40),
      text: String(payload.text || "").slice(0, 220),
      at: Date.now(),
    };
    if (!message.text.trim()) return;

    room.messages.push(message);
    room.messages = room.messages.slice(-80);
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:message", message);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = watchRooms.get(roomId);
    if (!room) return;

    setTimeout(() => {
      const viewers = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      room.viewers = viewers;
      room.updatedAt = Date.now();

      if (room.couplePlus) {
        if (room.couplePlus.ready) delete room.couplePlus.ready[socket.id];
        if (room.couplePlus.moods) delete room.couplePlus.moods[socket.id];
        if (room.couplePlus.tastes) delete room.couplePlus.tastes[socket.id];
      }

      if (room.liveHostSocketId === socket.id) {
        room.liveShareActive = false;
        room.liveHostSocketId = "";
        io.to(roomId).emit("watchroom:live-stop", { roomId });
      }

      if (room.hostSocketId === socket.id) {
        room.hostSocketId = "";
        const remaining = io.sockets.adapter.rooms.get(roomId);
        const nextSocketId = remaining ? Array.from(remaining)[0] : "";
        if (nextSocketId) {
          room.hostSocketId = nextSocketId;
          io.to(nextSocketId).emit("watchroom:host", { roomId, isHost: true });
        }
      }

      io.to(roomId).emit("watchroom:viewers", { roomId, viewers });

      if (viewers === 0) {
        room.updatedAt = Date.now();
        closeRemoteBrowserSession(roomId).catch(() => {});
      }
    }, 50);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of watchRooms.entries()) {
    const viewers = io.sockets.adapter.rooms.get(id)?.size || 0;
    room.viewers = viewers;
    if (viewers === 0 && now - Number(room.updatedAt || 0) > 1000 * 60 * 60 * 3) {
      closeRemoteBrowserSession(id).catch(() => {});
      watchRooms.delete(id);
    }
  }
}, 1000 * 60 * 10);

httpServer.listen(PORT, () => {
  console.log(`${SITE_NAME} running on port ${PORT}`);
});
