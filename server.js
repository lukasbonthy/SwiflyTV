// ===== Render/Docker startup diagnostics =====
process.on("uncaughtException", (error) => {
  console.error("[fatal] uncaughtException:", error && (error.stack || error.message || error));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason && (reason.stack || reason.message || reason));
  process.exit(1);
});
console.log("[boot] server.js starting", {
  node: process.version,
  cwd: process.cwd(),
  port: process.env.PORT || "",
  host: process.env.HOST || "0.0.0.0",
  playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || "",
  vidsrcEnabled: process.env.VIDSRC_ENABLED || "",
  consumetEnabled: process.env.CONSUMET_ENABLED || ""
});



require("dotenv").config();
const { configureBrowserEnvironment, createBrowserRuntime } = require("./lib/browser-runtime");
const { captureProviderMedia } = require("./lib/provider-capture");
const { runProviderRace } = require("./lib/provider-race");
const { classifyMediaCandidate } = require("./lib/media-discovery");
const { resolveNuvioProvider, PROVIDERS: NUVIO_ALLOWED_PROVIDERS } = require("./lib/nuvio-provider");
const { createMediaFileProxy } = require("./lib/media-file-proxy");
const { normalizeAudioLanguage, normalizeSubtitles } = require("./lib/playback-options");
const { createPlaybackHandoff } = require("./lib/playback-handoff");
const { createVerifiedMediaEntryResolver } = require("./lib/native-source-entry");
const { createSubtitleProxy } = require("./lib/subtitle-proxy");
const { cleanHeaders: cleanNuvioHeaders } = require("./lib/nuvio-http");

// ===== SwiflyTV no-env mode =====
// This build is meant to run without manually setting a pile of Render env vars.
// It applies the StreamProvider defaults unless you explicitly set
// SWIFLY_NO_ENV_MODE=false.
if (process.env.SWIFLY_NO_ENV_MODE !== "false") {
  Object.assign(process.env, {
    DEFAULT_PLAY_PROVIDER: "streamprovider",
    USE_EXTERNAL_PROVIDER_API: "false",

    STREAMPROVIDER_ENABLED: "true",
    STREAMPROVIDER_ORDER: process.env.STREAMPROVIDER_ORDER || "vidrift,hexa,cinezo",
    STREAMPROVIDER_NAV_TIMEOUT_MS: "10000",
    STREAMPROVIDER_STREAM_TIMEOUT_MS: "15000",
    STREAMPROVIDER_PROVIDER_TIMEOUT_MS: "27000",
    STREAMPROVIDER_ROUTE_TIMEOUT_MS: "60000",
    SFLIX_BASE_URL: "https://sflix2.to",

    VIDSRC_ENABLED: "false",
    CONSUMET_ENABLED: "false",
    FILMU_ENABLED: "false",

    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    REMOTE_BROWSER_ENABLED: "true",
    REMOTE_BROWSER_FPS: "1",
    REMOTE_BROWSER_JPEG_QUALITY: "58"
  });
}
configureBrowserEnvironment();

const express = require("express");
const { studioMarkup } = require("./ui/studio");
const { welcomeMarkup } = require("./ui/welcome");
const { partyMarkup } = require("./ui/party");
const { playerMarkup, episodePickerMarkup } = require("./ui/player");
const { watchPartyMarkup, partyBrowseMarkup } = require("./ui/watch-party");
const { createSourceJobs } = require("./lib/source-jobs");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const http = require("http");
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();

const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || "SwiflyTV";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const NUVIO_ENABLED = process.env.NUVIO_ENABLED !== "false";
const NUVIO_PROVIDER_ORDER = String(process.env.NUVIO_PROVIDER_ORDER || "vidlink,vidsrc,videasy").split(",").map(value => value.trim().toLowerCase()).filter(value => NUVIO_ALLOWED_PROVIDERS.includes(value));
const NUVIO_PROVIDER_TIMEOUT_MS = Math.max(1000, Math.min(12000, Number(process.env.NUVIO_PROVIDER_TIMEOUT_MS) || 9000));
const NUVIO_TIMEOUT_MS = Math.max(1000, Math.min(15000, Number(process.env.NUVIO_TIMEOUT_MS) || 12000));
const BRAND_WORDMARK = process.env.BRAND_WORDMARK || "SWIFLYTV";
const BRAND_SUBMARK = process.env.BRAND_SUBMARK || "SWIFLYTV";

// ===== SwiflyTV backend-only provider API integration =====
// These variables stay server-side. Never expose API_KEY in frontend JavaScript.
const API_BASE_URL = (process.env.API_BASE_URL || "").replace(/\/$/, "");
const API_KEY = process.env.API_KEY || "";

// Strict mode: use the uploaded source-code flows locally.
// The external API docs server is OFF by default. Turn it back on only with:
// USE_EXTERNAL_PROVIDER_API=true
const USE_EXTERNAL_PROVIDER_API = process.env.USE_EXTERNAL_PROVIDER_API === "true";
const DEFAULT_PLAY_PROVIDER = String(process.env.DEFAULT_PLAY_PROVIDER || "streamprovider").toLowerCase();
const API_PROVIDER_TIMEOUT_MS = Math.max(8000, Number(process.env.API_PROVIDER_TIMEOUT_MS || 45000));

// Optional local Consumet bridge from uploaded api.consumet.org source.
// This uses @consumet/extensions server-side only; nothing is exposed to frontend JS.
const CONSUMET_ENABLED = process.env.CONSUMET_ENABLED !== "false";
const CONSUMET_PROVIDER_ORDER = String(
  process.env.CONSUMET_PROVIDER_ORDER ||
  "flixhq,sflix,goku,movieshd,fmovies,zoro,gogoanime,animepahe"
).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

// Optional local VidSrc scraper bridge from uploaded vidsrc-scraper source.
// Server-side only. Uses Playwright to watch network requests for real .m3u8 URLs.
const VIDSRC_ENABLED = process.env.VIDSRC_ENABLED === "true";
const VIDSRC_PROVIDER_ORDER = String(
  process.env.VIDSRC_PROVIDER_ORDER ||
  "https://vidsrc.xyz,https://vidsrc.in,https://vidsrc.pm,https://vidsrc.net"
).split(",").map((x) => x.trim().replace(/\/$/, "")).filter(Boolean);
const VIDSRC_TIMEOUT_MS = Math.max(12000, Number(process.env.VIDSRC_TIMEOUT_MS || 28000));
const VIDSRC_WAIT_MS = Math.max(2500, Number(process.env.VIDSRC_WAIT_MS || 9000));
const VIDSRC_CONCURRENCY = Math.max(1, Math.min(3, Number(process.env.VIDSRC_CONCURRENCY || 2)));

// Filmu m3u8 backend-only scraper.
// User-provided target example: https://embedm3u8.filmu.in/movietrailer/112321
// The scraper replaces "use-tmdbid-for-your-scraper" with the TMDB id, then watches
// browser network traffic for real .m3u8 URLs exactly like DevTools Network.
const FILMU_ENABLED = process.env.FILMU_ENABLED !== "false";
const FILMU_EMBED_TEMPLATE = process.env.FILMU_EMBED_TEMPLATE || "https://embedm3u8.filmu.in/movietrailer/{tmdb}";
const FILMU_TIMEOUT_MS = Math.max(10000, Number(process.env.FILMU_TIMEOUT_MS || 30000));
const FILMU_WAIT_MS = Math.max(2500, Number(process.env.FILMU_WAIT_MS || 12000));
const FILMU_ROUTE_TIMEOUT_MS = Math.max(8000, Number(process.env.FILMU_ROUTE_TIMEOUT_MS || 35000));
const FILMU_TRY_FALLBACKS = process.env.FILMU_TRY_FALLBACKS === "true";

// Local StreamProvider-main media scrapers ported into SwiflyTV.
// Uses the uploaded StreamProvider source pattern: open provider page with Playwright
// and capture real .m3u8 requests from Network, then send through Swifly HLS proxy.
const STREAMPROVIDER_ENABLED = process.env.STREAMPROVIDER_ENABLED !== "false";
const STREAMPROVIDER_ORDER = String(process.env.STREAMPROVIDER_ORDER || "vidrift,hexa,cinezo")
  .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const STREAMPROVIDER_MOVIE_ORDER = String(process.env.STREAMPROVIDER_MOVIE_ORDER || STREAMPROVIDER_ORDER.join(","))
  .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const STREAMPROVIDER_TV_ORDER = String(process.env.STREAMPROVIDER_TV_ORDER || ["vidrift", ...STREAMPROVIDER_ORDER].join(","))
  .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const STREAMPROVIDER_NAV_TIMEOUT_MS = Math.max(8000, Number(process.env.STREAMPROVIDER_NAV_TIMEOUT_MS || 10000));
const STREAMPROVIDER_STREAM_TIMEOUT_MS = Math.max(8000, Number(process.env.STREAMPROVIDER_STREAM_TIMEOUT_MS || 15000));
const STREAMPROVIDER_PROVIDER_TIMEOUT_MS = Math.max(8000, Math.min(30000, Number(process.env.STREAMPROVIDER_PROVIDER_TIMEOUT_MS || 27000)));
const STREAMPROVIDER_ROUTE_TIMEOUT_MS = Math.max(12000, Math.min(60000, Number(process.env.STREAMPROVIDER_ROUTE_TIMEOUT_MS || 60000)));
const configuredProviderHedge = Number(process.env.STREAMPROVIDER_HEDGE_DELAY_MS ?? 1800);
const STREAMPROVIDER_HEDGE_DELAY_MS = Number.isFinite(configuredProviderHedge) ? Math.max(0, Math.min(10000, configuredProviderHedge)) : 1800;
const configuredProviderConcurrency = Number(process.env.STREAMPROVIDER_MAX_CONCURRENT ?? 2);
const STREAMPROVIDER_MAX_CONCURRENT = Number.isFinite(configuredProviderConcurrency) ? Math.max(1, Math.min(2, Math.floor(configuredProviderConcurrency))) : 2;
const STREAMPROVIDER_SFLIX_BASE_URL = String(process.env.SFLIX_BASE_URL || "https://sflix2.to").replace(/\/+$/, "");

const API_PROVIDERS = {
  "4khdhub": { home: "/api/4khdhub", search: "/api/4khdhub/search", details: "/api/4khdhub/details", gadget: "/api/4khdhub/gadget" },
  desiremovies: { home: "/api/desiremovies", search: "/api/desiremovies/search", details: "/api/desiremovies/details" },
  drive: { home: "/api/drive", search: "/api/drive/search", details: "/api/drive/details", mdrive: "/api/drive/mdrive" },
  netmirror: { home: "/api/netmirror", search: "/api/netmirror/search", details: "/api/netmirror/getpost", stream: "/api/netmirror/stream", eps: "/api/netmirror/eps" },
  movies4u: { home: "/api/movies4u", search: "/api/movies4u/search", details: "/api/movies4u/details", m4ulinks: "/api/movies4u/m4ulinks" },
  hdhub4u: { home: "/api/hdhub4u", search: "/api/hdhub4u/search", details: "/api/hdhub4u/details" },
  zeefliz: { home: "/api/zeefliz", search: "/api/zeefliz/search", details: "/api/zeefliz/details", nextdrive: "/api/zeefliz/nextdrive" },
  vega: { home: "/api/vega", search: "/api/vega/search", details: "/api/vega/details", nextdrive: "/api/vega/nextdrive" },
  zinkmovies: { home: "/api/zinkmovies", search: "/api/zinkmovies/search", details: "/api/zinkmovies/details", zinkcloud: "/api/zinkmovies/zinkcloud" },
  animesalt: { home: "/api/animesalt", search: "/api/animesalt/search", details: "/api/animesalt/details", stream: "/api/animesalt/stream" },
  animepahe: { home: "/api/animepahe", details: "/api/animepahe/details", stream: "/api/animepahe/stream" },
  castel: { stream: "/api/castel" },
  vid: { stream: "/api/vid" },
  themovie: { home: "/api/themovie", search: "/api/themovie/search", details: "/api/themovie/det", stream: "/api/themovie/stream" },
  tm: { stream: "/api/tm" },
  kmmovies: { home: "/api/kmmovies", search: "/api/kmmovies/search", details: "/api/kmmovies/details", magiclinks: "/api/kmmovies/magiclinks" },
  uhdmovies: { home: "/api/uhdmovies", search: "/api/uhdmovies/search", details: "/api/uhdmovies/details", tech: "/api/uhdmovies/tech" },
  mod: { home: "/api/mod", search: "/api/mod/search", details: "/api/mod/details", modpro: "/api/mod/modpro" },
  hubcloud: { extract: "/api/extractors/hubcloud" },
  gdflix: { extract: "/api/extractors/gdflix" },
  xprime: { stream: "/api/extractors/xprime" }
};

const API_SEARCH_PROVIDERS = [
  "netmirror", "4khdhub", "movies4u", "hdhub4u", "zeefliz", "vega", "zinkmovies",
  "animesalt", "kmmovies", "uhdmovies", "mod", "drive", "desiremovies"
];

const API_STREAM_PROVIDER_ORDER = ["vid", "castel", "themovie", "xprime", "netmirror", "animepahe", "animesalt"];

// Full provider order for finding .m3u8/media sources. The first four are direct-stream
// providers; the rest usually need search -> details -> extractor/action.
const API_M3U8_PROVIDER_ORDER = [
  "streamprovider"
];

const API_DETAILS_SEARCH_FALLBACK_PROVIDERS = [
  "animesalt",
  "4khdhub",
  "movies4u",
  "hdhub4u",
  "zeefliz",
  "vega",
  "zinkmovies",
  "kmmovies",
  "uhdmovies",
  "mod",
  "drive",
  "desiremovies"
];

function apiProviderConfigured() {
  return Boolean(USE_EXTERNAL_PROVIDER_API && API_BASE_URL && API_KEY);
}

function apiClean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function apiFirst(...values) {
  return values.map(apiClean).find(Boolean) || "";
}

function apiYearFrom(value) {
  const match = String(value || "").match(/(?:19|20)\d{2}/);
  return match ? match[0] : "";
}

function apiWalk(value, callback, seen = new Set()) {
  if (value == null) return;
  if (typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
  }
  callback(value);
  if (Array.isArray(value)) return value.forEach((item) => apiWalk(item, callback, seen));
  if (typeof value === "object") Object.values(value).forEach((item) => apiWalk(item, callback, seen));
}

function apiLooksLikeImage(url = "") {
  return /\.(?:jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i.test(String(url || ""));
}

function apiIsM3u8Url(url = "") {
  return /\.m3u8(?:[?#]|$)/i.test(String(url || ""));
}

function apiIsMpdUrl(url = "") {
  return /\.mpd(?:[?#]|$)/i.test(String(url || ""));
}

function apiUrlPath(url = "") {
  try {
    return new URL(String(url || "")).pathname || "";
  } catch {
    return String(url || "").split(/[?#]/)[0] || "";
  }
}

function apiUrlEndsWithFileExtension(url = "") {
  const path = apiUrlPath(url).toLowerCase();
  return /\.[a-z0-9]{2,8}$/.test(path);
}

function apiIsBlockedFileExtensionUrl(url = "") {
  const path = apiUrlPath(url).toLowerCase();

  // Hard block anything that is not a playable media file/playlist.
  // This fixes false wins like:
  //   /site.webmanifest
  //   /xmlrpc.php
  //   /sitemap.xml
  //   /wp-comments-post.php
  //   privacy-policy.html / terms / dmca
  return /\.(?:jpe?g|png|webp|gif|avif|svg|ico|bmp|css|js|mjs|map|json|webmanifest|xml|rss|atom|php|html?|txt|md|csv|srt|ass|vtt|zip|rar|7z|tar|gz|torrent|pdf|apk|exe|dmg|pkg|deb|rpm|woff2?|ttf|eot|wasm)$/i.test(path);
}


function apiIsAllowedMediaExtensionUrl(url = "") {
  const path = apiUrlPath(url).toLowerCase();

  // Only real playable media files or playlist manifests.
  // Do NOT treat every random extension as playable; .php/.xml/.html/.webmanifest
  // were being incorrectly embedded as video.
  return /\.(?:m3u8|mpd|mp4|m4v|webm|mkv|mov|avi|flv|ts|m2ts|mts|m4s|fmp4)(?:$)/i.test(path);
}

function apiStreamFormatForUrl(url = "") {
  if (apiIsM3u8Url(url)) return "m3u8";
  if (apiIsMpdUrl(url)) return "mpd";
  const match = apiUrlPath(url).toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? match[1] : "";
}


function apiNodeSaysHls(url = "", node = {}) {
  const value = String(url || "").toLowerCase();
  const text = `${Object.keys(node || {}).join(" ")} ${Object.values(node || {}).slice(0, 16).join(" ")}`.toLowerCase();

  // Only force HLS when the API/source explicitly says HLS/m3u8.
  // Do NOT treat the word "manifest" in a URL as HLS; site.webmanifest is not video.
  return (
    node?.forceHls === true ||
    apiIsM3u8Url(value) ||
    /\b(hls|m3u8|mpegurl|mpeg-url|application\/vnd\.apple\.mpegurl)\b/i.test(text)
  );
}


function apiHasEmbeddableFileExtensionOrHlsProxy(url = "", node = {}) {
  if (apiIsAllowedMediaExtensionUrl(url)) return true;

  // Some APIs return an extensionless HLS endpoint but mark it as hls/m3u8 in
  // the response. That can still be embedded safely through our local HLS proxy,
  // whose public URL ends in /master.m3u8.
  if (apiNodeSaysHls(url, node)) return hlsProxyEnabled();
  return Boolean(apiVerifiedMediaFormat(url, node));
}

function apiVerifiedMediaFormat(url = "", node = {}) {
  if (node?.mediaVerified !== true) return "";
  return classifyMediaCandidate({ url, type: node.format, confirmed: true,
    isNonMediaUrl: (value) => apiLooksDefinitelyNonMediaUrl(value, { allowManifestEndpoint: ["m3u8", "mpd"].includes(node.format) })
  })?.format || "";
}

function apiIsYouTubeUrl(url = "") {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com") ||
      host === "googlevideo.com" ||
      host.endsWith(".googlevideo.com") ||
      host === "ytimg.com" ||
      host.endsWith(".ytimg.com")
    );
  } catch {
    return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com|ytimg\.com)/i.test(value);
  }
}

function apiLooksTmdbId(value = "") {
  return /^\d{1,10}$/.test(apiClean(value));
}

async function apiResolveTmdbIdForApi({ mediaType = "movie", id = "", attempts = [] }) {
  const value = apiClean(id);

  if (apiLooksTmdbId(value)) return value;

  // Provider routes like Castel need numeric TMDB ids. If an older route sends an
  // IMDb id, convert it before calling the provider API.
  if (/^tt\d{6,}$/i.test(value)) {
    try {
      const found = await tmdb(`/find/${value}`, { external_source: "imdb_id" }, CACHE_TTL.long);
      const list = mediaType === "tv" ? found?.tv_results : found?.movie_results;
      const tmdbId = apiClean(list?.[0]?.id);
      if (apiLooksTmdbId(tmdbId)) return tmdbId;
      attempts.push(`tmdb: no ${mediaType} result found for IMDb id ${value}`);
    } catch (error) {
      attempts.push(`tmdb: failed to convert IMDb id ${value}: ${error.message || "request failed"}`);
    }
  }

  return "";
}

function apiProviderNeedsTmdb(providerName = "", action = "", endpoint = "") {
  const provider = apiClean(providerName).toLowerCase();
  const actionName = apiClean(action).toLowerCase();
  const path = apiClean(endpoint).toLowerCase();

  // Docs: Castel requires tmdb. This also catches future/provider actions that
  // are clearly TMDB-based.
  return (
    provider === "castel" ||
    provider === "vid" ||
    actionName === "tmdb" ||
    actionName === "stream-tmdb" ||
    /\btmdb\b/.test(actionName) ||
    /\btmdb\b/.test(path)
  );
}

async function apiApplyTmdbParamsIfNeeded({ providerName = "", action = "", endpoint = "", params = {}, mediaType = "movie", attempts = [] }) {
  if (!apiProviderNeedsTmdb(providerName, action, endpoint)) return params;

  const sourceId = apiClean(params.tmdb || params.tmdbId || params.id || params.imdb || params.url);
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id: sourceId, attempts });

  if (!tmdbId) {
    throw new Error(`${providerName}: provider route needs a numeric TMDB id`);
  }

  const next = { ...params };
  next.tmdb = tmdbId;
  next.tmdbId = tmdbId;
  next.id = tmdbId;
  delete next.imdb;
  return next;
}

function apiLooksLikeDownloadUrl(url = "", node = {}) {
  const value = String(url || "").toLowerCase();
  const nodeText = `${Object.keys(node || {}).join(" ")} ${Object.values(node || {}).slice(0, 12).join(" ")}`.toLowerCase();

  // YouTube links are never used for SwiflyTV provider embeds.
  if (apiIsYouTubeUrl(value)) return true;

  // Provider embeds should be actual media file/manifest URLs. Exception:
  // extensionless HLS endpoints are allowed only if we can expose them as our
  // own /api/hls-proxy/<id>/master.m3u8 URL.
  if (!apiUrlEndsWithFileExtension(value) && !apiHasEmbeddableFileExtensionOrHlsProxy(value, node)) return true;

  // Never reject HLS just because a provider used a sloppy field name.
  if (apiIsM3u8Url(value)) return false;

  // New rule: actual file-extension URLs are allowed even if the field name
  // is downloadUrl/directUrl/file/etc. Only block known non-video/archive/subtitle assets.
  if (apiIsBlockedFileExtensionUrl(value)) return true;

  // Extensionless known download/detail hosts are pages, not files.
  if (!apiUrlEndsWithFileExtension(value) && /\b(download|downloads|gdtot|gdflix|hubcloud|hub-cloud|drivebot|resumebot|resume-bot|v-cloud|vcloud|nextdrive|zinkcloud|gadget|gadgetsworld|tech\.unblockedgames|ddl|torrent)\b/i.test(nodeText)) return true;
  if (!apiUrlEndsWithFileExtension(value) && /(\/|\?|&|=)(download|dl|ddl|file|attachment|export=download)(\/|\?|&|=|$)/i.test(value)) return true;

  return false;
}

function apiLooksStreamLike(url = "", node = {}) {
  const value = String(url || "").toLowerCase();

  if (apiIsYouTubeUrl(value)) return false;

  // Prefer actual file-extension URLs. If the API gives an extensionless HLS
  // endpoint but labels it hls/m3u8, it can still work through HLS proxy because
  // the browser sees /master.m3u8.
  if (!apiIsAllowedMediaExtensionUrl(value)) {
    return apiHasEmbeddableFileExtensionOrHlsProxy(value, node);
  }

  if (apiIsAllowedMediaExtensionUrl(value)) return true;

  return false;
}


function apiSourceIsM3u8(source = {}) {
  return apiIsM3u8Url(source.url || "") || source.format === "m3u8" || /m3u8|hls/i.test(`${source.name || ""} ${source.quality || ""} ${source.type || ""}`);
}

function apiHasM3u8Source(sources = []) {
  return Array.isArray(sources) && sources.some((source) => apiSourceIsM3u8(source));
}

function apiPreferM3u8Sources(sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  const m3u8s = list.filter((source) => apiSourceIsM3u8(source));
  if (m3u8s.length) return m3u8s.sort((a, b) => apiSourceScore(b) - apiSourceScore(a));
  return list.sort((a, b) => apiSourceScore(b) - apiSourceScore(a));
}

function apiSourceScore(source = {}) {
  const url = String(source.url || "");
  const text = `${source.name || ""} ${source.quality || ""} ${source.format || ""} ${source.type || ""}`.toLowerCase();

  if (!apiLooksPlayable(url, source)) return -9999;

  let score = 0;
  if (apiIsM3u8Url(url)) score += 10000;
  else if (source.forceHls === true) score += 9500;
  else if (/m3u8|hls/.test(text)) score += 9000;
  else if (apiIsMpdUrl(url)) score += 5500;
  else if (/(stream|embed|player|play|watch|manifest|playlist)/i.test(url)) score += 4200;
  else if (/\.(?:mp4|m4v|webm|mov)(?:[?#]|$)/i.test(url)) score += 2500;
  else score += 900;

  if (/1080|fhd|full.?hd/i.test(text)) score += 240;
  if (/720|hd/i.test(text)) score += 160;
  if (/4k|2160|uhd/i.test(text)) score += 120;
  if (/cam|ts|hdcam/i.test(text)) score -= 500;

  // Prefer real embed/stream URLs over obvious file/download links.
  if (apiLooksLikeDownloadUrl(url, source)) score -= 8000;

  return score;
}

function apiLooksDefinitelyNonMediaUrl(url = "", { allowManifestEndpoint = false } = {}) {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return true;

  let parsed = null;
  try { parsed = new URL(value); } catch {}

  const host = (parsed?.hostname || "").replace(/^www\./, "");
  const path = parsed?.pathname || value.split(/[?#]/)[0] || "";
  const query = parsed?.search || "";

  if (apiIsYouTubeUrl(value)) return true;
  if (apiLooksLikeImage(value)) return true;
  if (/\/api\/adult\//i.test(value)) return true;

  // Keep Swifly from following/embedding social/share/ad/analytics/admin pages.
  if (/(^|\.)telegram\.org$|(^|\.)t\.me$|(^|\.)facebook\.com$|(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)whatsapp\.com$|(^|\.)googletagmanager\.com$|(^|\.)google-analytics\.com$|(^|\.)cloudflareinsights\.com$|(^|\.)cloudflare\.com$|^dash\.cloudflare\.com$|(^|\.)wordpress\.org$|(^|\.)googleapis\.com$|(^|\.)fontawesome\.com$|(^|\.)cdnjs\.cloudflare\.com$/i.test(host)) return true;

  // Never treat provider protection/landing-page demo videos as movie sources.
  if (/hero-background-video|demo(?:[_-]?2x)?\.(?:mp4|webm)|sample\.(?:mp4|webm)|placeholder\.(?:mp4|webm)|background(?:[_-]?video)?\.(?:mp4|webm)/i.test(value)) return true;
  if (/(?:^|\/)(?:ads?|advertisements?|trailers?|teasers?)(?:[/.]|$)/i.test(path)) return true;

  // Block obvious adult mirrors/categories even when they came from a non-adult page.
  if (/(?:^|\.)zeefliz18\.|(?:^|\.)xhamster\.|(?:^|\.)xvideos\.|(?:^|\.)spankbang\.|(?:^|\.)xxx|(?:^|\.)porn|\/18(?:plus|\+|-adult|_adult)?\b|\/adult\b|\/hentai\b/i.test(value)) return true;

  // WordPress/admin/nav/support files are not player sources.
  if (/\/(?:xmlrpc\.php|wp-comments-post\.php|wp-login\.php|wp-admin\/|wp-json\/|feed\/|comments\/feed\/|privacy-policy|terms-of-service|dmca|contact|sign-up|login|register|cdn-cgi\/|wp-content\/themes\/|wp-content\/plugins\/|wp-includes\/|sitemap\.xml|site\.webmanifest)(?:[?#]|$|\/)/i.test(value)) return true;

  // Category/search/nav pages are not streams.
  if (/\/(?:category|genre|tag|author|page|privacy-policy|terms|dmca|contact|how-to-download|report-broken-links)(?:\/|[?#]|$)/i.test(value)) return true;

  // A root endpoint is accepted only with verified playlist evidence.
  if (!allowManifestEndpoint && parsed && (path === "/" || path === "")) return true;

  // Hard block non-media file extensions.
  if (apiIsBlockedFileExtensionUrl(value) && !(allowManifestEndpoint && /\.(?:php|xml|txt)$/i.test(path))) return true;

  return false;
}

function apiLooksPlayable(url = "", node = {}) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (apiLooksDefinitelyNonMediaUrl(value, { allowManifestEndpoint: node?.mediaVerified === true && (apiNodeSaysHls(value, node) || node.format === "mpd") })) return false;

  // Accept known media extensions or explicitly verified media endpoints.
  // For extensionless upstream HLS endpoints, we only accept them when HLS proxy is enabled,
  // because the actual browser URL becomes /api/hls-proxy/<id>/master.m3u8.
  if (!apiIsAllowedMediaExtensionUrl(value) && !apiHasEmbeddableFileExtensionOrHlsProxy(value, node)) return false;

  // Main target: actual HLS .m3u8 URLs.
  if (apiIsM3u8Url(value) || apiNodeSaysHls(value, node)) return true;

  // Secondary fallback: non-download media URLs only.
  if (apiLooksLikeDownloadUrl(value, node)) return false;
  if (!apiLooksStreamLike(value, node)) return false;

  return true;
}

function apiNormalizeSources(input) {
  const sources = [];

  apiWalk(input, (node) => {
    if (typeof node === "string") {
      const stringUrls = apiExtractMediaUrlsFromStringDeep(node);
      if (apiLooksPlayable(node, { raw: node })) stringUrls.unshift(node);

      for (const mediaUrl of Array.from(new Set(stringUrls))) {
        sources.push({
          name: apiIsM3u8Url(mediaUrl) ? "hls" : "source",
          quality: "",
          url: mediaUrl,
          headers: {},
          format: apiIsM3u8Url(mediaUrl) ? "m3u8" : (apiIsMpdUrl(mediaUrl) ? "mpd" : "")
        });
      }
      return;
    }

    if (!node || typeof node !== "object") return;

    const candidates = [
      ["m3u8", node.m3u8],
      ["m3u8_url", node.m3u8_url],
      ["m3u8Url", node.m3u8Url],
      ["hls", node.hls],
      ["hls_url", node.hls_url],
      ["hlsUrl", node.hlsUrl],
      ["playlist", node.playlist],
      ["playlist_url", node.playlist_url],
      ["playlistUrl", node.playlistUrl],
      ["manifest", node.manifest],
      ["manifest_url", node.manifest_url],
      ["playbackUrl", node.playbackUrl],
      ["playback_url", node.playback_url],
      ["proxyVideo", node.proxyVideo],
      ["proxy_video", node.proxy_video],
      ["streamUrl", node.streamUrl],
      ["stream_url", node.stream_url],
      ["streamingUrl", node.streamingUrl],
      ["streaming_url", node.streaming_url],
      ["videoUrl", node.videoUrl],
      ["video_url", node.video_url],
      ["embedUrl", node.embedUrl],
      ["embed_url", node.embed_url],
      ["playerUrl", node.playerUrl],
      ["player_url", node.player_url],
      ["sourceUrl", node.sourceUrl],
      ["source_url", node.source_url],
      ["src", node.src],
      ["file", node.file],
      ["file_url", node.file_url],
      ["url", node.url],
      ["link", node.link],
      ["href", node.href],
      ["downloadUrl", node.downloadUrl],
      ["download_url", node.download_url],
      ["directUrl", node.directUrl],
      ["direct_url", node.direct_url],
      ["fullUrl", node.fullUrl],
      ["full_url", node.full_url],
      ["watchUrl", node.watchUrl],
      ["watch_url", node.watch_url],
      ["playApiUrl", node.playApiUrl],
      ["play_api_url", node.play_api_url],
      ["hls4", node.hls4],
      ["hls3", node.hls3],
      ["hls2", node.hls2],
      ["primary", node.primary],
      ["fallback1", node.fallback1],
      ["fallback2", node.fallback2]
    ];

    for (const [field, value] of candidates) {
      const mediaUrl = apiClean(value);
      if (!apiLooksPlayable(mediaUrl, { ...node, sourceField: field })) continue;

      sources.push({
        name: apiFirst(node.name, node.server, node.provider, node.label, node.source, node.host, field) || "source",
        quality: apiFirst(node.quality, node.resolution, node.size, node.format, node.type),
        url: mediaUrl,
        headers: node.headers && typeof node.headers === "object" ? node.headers : {},
        format: apiNodeSaysHls(mediaUrl, node) ? "m3u8" : (apiIsMpdUrl(mediaUrl) ? "mpd" : apiVerifiedMediaFormat(mediaUrl, node) || apiStreamFormatForUrl(mediaUrl)),
        forceHls: apiNodeSaysHls(mediaUrl, node),
        mediaVerified: node.mediaVerified === true,
        requiresProxy: node.requiresProxy === true,
        codecName: String(node.codecName || "").slice(0, 32),
        audioLanguage: normalizeAudioLanguage(node.audioLanguage || node.audio_language || node.language || node.lang),
        subtitles: normalizeSubtitles(node.subtitles || node.captions, { headers: node.headers || {}, baseUrl: mediaUrl })
      });
    }
  });

  const unique = new Map();
  for (const source of sources) {
    const previous = unique.get(source.url);
    // apiWalk also visits raw URL strings inside source records. Keep the richer record.
    if (!previous || source.mediaVerified === true || (!previous.mediaVerified && Object.keys(source.headers || {}).length > Object.keys(previous.headers || {}).length)) unique.set(source.url, source);
  }
  return apiPreferM3u8Sources(Array.from(unique.values()));
}

function apiTopList(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["data", "results", "items", "movies", "shows", "anime", "posts", "list", "latest", "trending", "popular", "slider"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  let found = null;
  apiWalk(json, (node) => {
    if (!found && Array.isArray(node) && node.some((entry) => entry && typeof entry === "object")) found = node;
  });
  return found || [];
}

function apiInferType(item = {}, fallback = "movie") {
  const raw = String(item.type || item.mediaType || item.category || item.kind || item.contentType || "").toLowerCase();
  if (raw.includes("anime")) return "anime";
  if (raw.includes("tv") || raw.includes("show") || raw.includes("series")) return "tv";
  if (raw.includes("movie") || raw.includes("film")) return "movie";
  const title = String(item.title || item.name || "");
  if (/season|episode|s\d{1,2}e\d{1,2}/i.test(title)) return "tv";
  return fallback;
}

function apiNormalizeItem(item = {}, provider = "", fallbackType = "movie") {
  const title = apiFirst(item.title, item.name, item.movie, item.post_title, item.label, item.original_title);
  return {
    provider,
    id: apiFirst(item.id, item.tmdb, item.tmdbId, item.postId, item.contentId, item.session, item._id),
    url: apiFirst(item.fullUrl, item.url, item.link, item.href, item.path, item.detailsUrl, item.postUrl, item.playUrl, item.watchUrl),
    title,
    year: apiFirst(item.year, item.releaseYear, apiYearFrom(title), apiYearFrom(item.date), apiYearFrom(item.releaseDate)),
    type: apiInferType(item, fallbackType),
    poster: apiFirst(item.poster, item.image, item.imageUrl, item.thumbnail, item.cover, item.logo, item.img),
    backdrop: apiFirst(item.backdrop, item.banner, item.background, item.cover, item.backdropUrl),
    overview: apiFirst(item.overview, item.description, item.plot, item.synopsis, item.content, item.excerpt),
    formats: Array.isArray(item.formats) ? item.formats : [],
    sources: apiNormalizeSources(item.sources || item.streams || item.links || item.downloads || item.servers || item.data)
  };
}

function apiNormalizeResponse(raw = {}, provider = "", fallbackType = "movie") {
  const root = raw?.data || raw?.result || raw;
  const item = apiNormalizeItem(root && !Array.isArray(root) ? root : {}, provider, fallbackType);
  item.sources = apiNormalizeSources(raw);
  return item;
}

async function apiProviderFetch(endpoint, params = {}) {
  if (!apiProviderConfigured()) throw new Error("Missing API_BASE_URL or API_KEY env vars");
  if (String(endpoint || "").includes("/api/adult/")) throw new Error("Adult provider routes are disabled");
  if (String(endpoint || "").includes("/api/youtubes/")) throw new Error("YouTube API routes are disabled for SwiflyTV embeds");

  const url = new URL(API_BASE_URL + endpoint);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!response.ok) throw new Error(data?.error || data?.message || `Provider HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function apiGetProvider(name = "") {
  const provider = apiClean(name).toLowerCase();
  if (!API_PROVIDERS[provider]) throw new Error(`Unsupported provider: ${provider || "missing"}`);
  return [provider, API_PROVIDERS[provider]];
}



function apiHtmlEntityDecodeLite(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function apiTryDecodeURIComponentSafe(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function apiTryAtobText(value = "") {
  try {
    const clean = String(value || "").trim();
    if (clean.length < 24 || clean.length > 12000) return "";
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) return "";
    const normalized = clean.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    if (!/https?:\/\//i.test(decoded) && !/\.(m3u8|mp4|mkv|webm|mov|avi|ts|m4s)\b/i.test(decoded)) return "";
    return decoded;
  } catch {
    return "";
  }
}

function apiUnescapeJsStringLite(value = "") {
  let text = String(value || "");
  try {
    text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    text = text.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    text = text.replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/\\'/g, "'");
  } catch {}
  return text;
}


function apiTryInflateEncodedUrlVariants(value = "") {
  const source = String(value || "");
  const out = [];
  function add(v) {
    if (!v || out.includes(v)) return;
    if (out.length > 80) return;
    out.push(v);
  }

  add(source);
  add(apiHtmlEntityDecodeLite(source));
  add(apiUnescapeJsStringLite(source));
  add(apiTryDecodeURIComponentSafe(source));
  add(apiTryDecodeURIComponentSafe(apiHtmlEntityDecodeLite(source)));
  add(apiUnescapeJsStringLite(apiTryDecodeURIComponentSafe(source)));

  for (const match of source.matchAll(/https?%3A%2F%2F[^\s"'<>]+/gi)) add(apiTryDecodeURIComponentSafe(match[0]));
  for (const match of source.matchAll(/https?:\\\/\\\/[^\s"'<>]+/gi)) add(apiUnescapeJsStringLite(match[0]));

  for (const match of source.matchAll(/atob\(\s*["']([A-Za-z0-9+/_=-]{16,})["']\s*\)/g)) {
    const decoded = apiTryAtobText(match[1]);
    if (decoded) add(decoded);
  }

  for (const match of source.matchAll(/decodeURIComponent\(\s*["']([^"']{12,})["']\s*\)/g)) add(apiTryDecodeURIComponentSafe(match[1]));
  for (const match of source.matchAll(/["']((?:https?:)?\\?\/\\?\/[^"']+)["']/g)) add(apiUnescapeJsStringLite(match[1]));

  return out;
}

function apiExtractLikelyUrlsFromConcatenatedStrings(value = "") {
  const source = String(value || "");
  const urls = [];

  const concatRe = /((?:"[^"]*"|'[^']*')\s*(?:\+\s*(?:"[^"]*"|'[^']*')\s*){1,12})/g;
  let match;
  while ((match = concatRe.exec(source))) {
    const parts = [];
    const partRe = /"([^"]*)"|'([^']*)'/g;
    let part;
    while ((part = partRe.exec(match[1]))) parts.push(part[1] ?? part[2] ?? "");
    const joined = apiUnescapeJsStringLite(parts.join(""));
    if (/^https?:\/\//i.test(joined) || /\.(?:m3u8|mp4|mkv|webm|mov|avi|ts|m4s)(?:[?#]|$)/i.test(joined)) urls.push(joined);
  }

  const joinRe = /\[((?:"[^"]*"|'[^']*')\s*,\s*)+(?:"[^"]*"|'[^']*')\]\.join\(\s*["']{0,1}["']{0,1}\s*\)/g;
  while ((match = joinRe.exec(source))) {
    const parts = [];
    const partRe = /"([^"]*)"|'([^']*)'/g;
    let part;
    while ((part = partRe.exec(match[0]))) parts.push(part[1] ?? part[2] ?? "");
    const joined = apiUnescapeJsStringLite(parts.join(""));
    if (/^https?:\/\//i.test(joined)) urls.push(joined);
  }

  return urls;
}

function apiExtractUrlsFromStringDeep(value = "") {
  const original = String(value || "");
  const variants = [];
  const urls = [];

  function addVariant(v) {
    if (!v || variants.includes(v)) return;
    if (variants.length > 80) return;
    variants.push(v);
  }

  for (const inflated of apiTryInflateEncodedUrlVariants(original)) addVariant(inflated);

  const b64Decoded = apiTryAtobText(original);
  if (b64Decoded) for (const inflated of apiTryInflateEncodedUrlVariants(b64Decoded)) addVariant(inflated);

  for (const concatenated of apiExtractLikelyUrlsFromConcatenatedStrings(original)) urls.push(concatenated);

  for (const text of variants) {
    const source = apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(text));
    for (const concatenated of apiExtractLikelyUrlsFromConcatenatedStrings(source)) urls.push(concatenated);

    const absoluteRe = /https?:\/\/[^\s"'`<>\\)\\]}]+/gi;
    let match;
    while ((match = absoluteRe.exec(source))) urls.push(match[0].replace(/[),.;]+$/g, "").replace(/&amp;/g, "&"));

    const protocolRelRe = /(?<!:)\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`<>\\)\\]}]*/gi;
    while ((match = protocolRelRe.exec(source))) urls.push(`https:${match[0].replace(/[),.;]+$/g, "")}`);

    const fieldRe = /\b(?:file|src|url|link|href|hls|m3u8|video|videoUrl|stream|streamUrl|downloadUrl|directUrl|playbackUrl|playlist|manifest|source|sources|master|fileUrl|embedUrl|playerUrl)\b\s*[:=]\s*["']([^"']+)["']/gi;
    while ((match = fieldRe.exec(source))) {
      const raw = apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(match[1]));
      if (/^\/\//.test(raw)) urls.push(`https:${raw}`);
      else if (/^https?:\/\//i.test(raw)) urls.push(raw);
    }

    const attrRe = /\b(?:src|href|data-src|data-href|data-file|data-url|data-video|data-stream|data-hls|poster|action)\s*=\s*["']([^"']+)["']/gi;
    while ((match = attrRe.exec(source))) {
      const raw = apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(match[1]));
      if (/^\/\//.test(raw)) urls.push(`https:${raw}`);
      else if (/^https?:\/\//i.test(raw)) urls.push(raw);
    }

    const qRe = /[?&](?:q|data|url|file|src|u|payload|source)=([^&"'<>]+)/gi;
    while ((match = qRe.exec(source))) {
      const decoded = apiTryDecodeURIComponentSafe(match[1]);
      const maybeB64 = apiTryAtobText(decoded);
      if (maybeB64) for (const nested of apiExtractUrlsFromStringDeep(maybeB64)) urls.push(nested);
      for (const nested of apiExtractUrlsFromStringDeep(decoded)) if (nested !== decoded) urls.push(nested);
    }
  }

  return Array.from(new Set(urls.map((url) => apiClean(url)).filter(Boolean)));
}

function apiExtractMediaUrlsFromStringDeep(value = "") {
  return apiExtractUrlsFromStringDeep(value).filter((url) => apiLooksPlayable(url, { raw: value, forceHls: apiIsM3u8Url(url) }));
}

function apiCollectCandidateUrls(input) {
  const urls = [];

  function pushUrl(value) {
    const url = apiClean(value);
    if (!/^https?:\/\//i.test(url)) return;
    if (apiLooksDefinitelyNonMediaUrl(url)) return;
    if (apiLooksLikeImage(url)) return;
    if (apiIsYouTubeUrl(url)) return;
    if (/\/api\/adult\//i.test(url)) return;
    urls.push(url);
  }

  apiWalk(input, (node) => {
    if (typeof node === "string") {
      pushUrl(node);
      for (const nestedUrl of apiExtractUrlsFromStringDeep(node)) pushUrl(nestedUrl);
      return;
    }

    if (!node || typeof node !== "object") return;

    for (const key of [
      "m3u8", "m3u8_url", "m3u8Url", "hls", "hls_url", "hlsUrl",
      "playlist", "playlist_url", "playlistUrl", "manifest", "manifest_url",
      "playbackUrl", "playback_url", "proxyVideo", "proxy_video",
      "streamUrl", "stream_url", "streamingUrl", "streaming_url",
      "videoUrl", "video_url", "embedUrl", "embed_url", "playerUrl", "player_url",
      "sourceUrl", "source_url", "src", "file", "file_url", "url", "link", "href",
      "downloadUrl", "download_url", "directUrl", "direct_url",
      "redirectUrl", "redirect_url", "serverUrl", "server_url",
      "pageUrl", "page_url", "episodeUrl", "episode_url",
      "fullUrl", "full_url", "watchUrl", "watch_url",
      "playApiUrl", "play_api_url", "streamUrl", "stream_url",
      "hls4", "hls3", "hls2", "primary", "fallback1", "fallback2",
      "next", "source"
    ]) {
      pushUrl(node[key]);
    }
  });

  return Array.from(new Set(urls));
}

function apiCanBeIntermediateExtractorUrl(url = "") {
  const value = apiClean(url).toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (apiIsYouTubeUrl(value)) return false;
  if (apiLooksLikeImage(value)) return false;
  if (/\/api\/adult\//i.test(value)) return false;

  // If it is already playable, it should be tested as a source first.
  if (apiLooksPlayable(value, { url: value })) return false;

  // These are known intermediate/detail/extractor links from the provided docs.
  return (
    /gadget|gadgetsweb|hubcloud|hub-cloud|gdflix|nextdrive|v[-]?cloud|vcloud|zinkcloud|magic|tech\.unblockedgames|modpro|mdrive|drive|server|link|episode|watch|play/i.test(value)
  );
}

function apiExtractorJobsForUrl(providerName = "", providerConfig = {}, url = "") {
  const value = apiClean(url);
  const lower = value.toLowerCase();
  const jobs = [];
  const seen = new Set();

  function add(provider, endpoint, params, action) {
    if (!endpoint || String(endpoint).includes("/api/adult/") || String(endpoint).includes("/api/youtubes/")) return;
    const key = `${provider}:${action}:${endpoint}:${JSON.stringify(params)}`;
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ provider, endpoint, params, action });
  }

  // Exact/provider-specific extractors from the source/docs.
  // AnimeSalt/AnimePahe details usually return episode/player URLs first; their
  // stream endpoints are the next step that returns the real .m3u8.
  if (providerConfig.stream && ["animepahe", "animesalt"].includes(apiClean(providerName).toLowerCase())) {
    add(providerName, providerConfig.stream, { url: value }, "stream");
  }

  // TheMovie route source shows search -> det -> stream. The stream route accepts
  // a moviebox detail URL or play API URL as ?url= and returns playback data.
  if (apiClean(providerName).toLowerCase() === "themovie" && providerConfig.stream) {
    if (/themoviebox\.org|moviesDetail|wefeed-h5api-bff/i.test(lower)) {
      add(providerName, providerConfig.stream, { url: value }, "stream");
    }
  }

  // /api/tm extracts hls4/hls3/hls2 from vibuxer embeds.
  if (API_PROVIDERS.tm?.stream && /vibuxer\.com\/e\//i.test(lower)) {
    add("tm", API_PROVIDERS.tm.stream, { url: value, check: "0" }, "tm");
  }

  if (providerConfig.gadget) add(providerName, providerConfig.gadget, { link: value }, "gadget");
  if (providerConfig.mdrive) add(providerName, providerConfig.mdrive, { url: value }, "mdrive");
  if (providerConfig.m4ulinks) add(providerName, providerConfig.m4ulinks, { url: value }, "m4ulinks");
  if (providerConfig.nextdrive) add(providerName, providerConfig.nextdrive, { url: value }, "nextdrive");
  if (providerConfig.zinkcloud) add(providerName, providerConfig.zinkcloud, { url: value }, "zinkcloud");
  if (providerConfig.magiclinks) add(providerName, providerConfig.magiclinks, { url: value }, "magiclinks");
  if (providerConfig.tech) add(providerName, providerConfig.tech, { url: value }, "tech");
  if (providerConfig.modpro) add(providerName, providerConfig.modpro, { url: value }, "modpro");

  // Domain-matched generic extractors from the docs.
  if (API_PROVIDERS.hubcloud?.extract && /hubcloud|hub-cloud/i.test(lower)) {
    add("hubcloud", API_PROVIDERS.hubcloud.extract, { url: value }, "hubcloud");
  }
  if (API_PROVIDERS.gdflix?.extract && /gdflix/i.test(lower)) {
    add("gdflix", API_PROVIDERS.gdflix.extract, { url: value }, "gdflix");
  }
  if (API_PROVIDERS.vega?.nextdrive && /nextdrive|v[-]?cloud|vcloud/i.test(lower)) {
    add("vega", API_PROVIDERS.vega.nextdrive, { url: value }, "nextdrive");
  }
  if (API_PROVIDERS.uhdmovies?.tech && /tech\.unblockedgames|sid=/i.test(lower)) {
    add("uhdmovies", API_PROVIDERS.uhdmovies.tech, { url: value }, "tech");
  }

  // Broad fallback: docs use a lot of intermediate pages whose host/field names vary.
  // Try safe non-adult extractor/action endpoints, but cap recursion elsewhere.
  if (apiCanBeIntermediateExtractorUrl(value)) {
    if (providerConfig.stream && ["animepahe", "animesalt"].includes(apiClean(providerName).toLowerCase())) {
      add(providerName, providerConfig.stream, { url: value }, "stream");
    }

    if (apiClean(providerName).toLowerCase() === "themovie" && providerConfig.stream) {
      add(providerName, providerConfig.stream, { url: value }, "stream");
    }

    if (API_PROVIDERS.tm?.stream && /vibuxer\.com\/e\//i.test(lower)) {
      add("tm", API_PROVIDERS.tm.stream, { url: value, check: "0" }, "tm");
    }
    if (API_PROVIDERS.hubcloud?.extract) add("hubcloud", API_PROVIDERS.hubcloud.extract, { url: value }, "hubcloud");
    if (API_PROVIDERS.gdflix?.extract) add("gdflix", API_PROVIDERS.gdflix.extract, { url: value }, "gdflix");
    if (API_PROVIDERS.vega?.nextdrive) add("vega", API_PROVIDERS.vega.nextdrive, { url: value }, "nextdrive");
    if (API_PROVIDERS.uhdmovies?.tech) add("uhdmovies", API_PROVIDERS.uhdmovies.tech, { url: value }, "tech");
  }

  return jobs;
}

async function apiTryNetMirrorByTmdb({ mediaType = "movie", id = "", season = "1", episode = "1", title = "", year = "", attempts = [] }) {
  const providerName = "netmirror";
  const providerConfig = API_PROVIDERS.netmirror;
  if (!providerConfig?.search || !providerConfig?.stream) return null;

  const q = apiClean(title);
  if (!q) return null;

  const searchData = await apiProviderFetch(providerConfig.search, { q });
  const results = apiTopList(searchData).map((entry) => apiNormalizeItem(entry, providerName, mediaType));
  const picked =
    results.find((entry) => year && String(entry.year) === String(year)) ||
    results.find((entry) => entry.title && entry.title.toLowerCase().includes(q.toLowerCase().slice(0, 8))) ||
    results[0];

  if (!picked) {
    attempts.push("netmirror: search returned no result");
    return null;
  }

  const possibleIds = Array.from(new Set([
    apiClean(picked.id),
    apiClean(picked.url),
    apiClean(picked.link),
    apiClean(picked.href),
    apiClean(picked.contentId),
    apiClean(picked.postId)
  ].filter(Boolean)));

  // getpost may expose the actual stream id even when search result shape changes.
  if (providerConfig.details) {
    for (const possibleId of possibleIds.slice()) {
      try {
        const postData = await apiProviderFetch(providerConfig.details, { id: possibleId });
        const postIds = apiCollectCandidateUrls(postData);
        const postNormalized = apiNormalizeResponse(postData, providerName, mediaType);
        if (postNormalized.id) possibleIds.unshift(postNormalized.id);

        // Some getpost responses contain stream-like URLs directly.
        const direct = await apiFindPlayableFromPayload({
          payload: postData,
          providerName,
          providerConfig,
          mediaType,
          id,
          season,
          episode,
          attempts,
          depth: 1,
          seen: new Set()
        });
        if (direct) return direct;

        for (const u of postIds) {
          const match = String(u).match(/(?:id|post|content|video)[=/:-]([A-Za-z0-9_-]+)/i);
          if (match?.[1]) possibleIds.unshift(match[1]);
        }
      } catch (error) {
        attempts.push(`netmirror/getpost: ${error.message || "failed"}`);
      }
    }
  }

  for (const streamId of Array.from(new Set(possibleIds)).filter(Boolean)) {
    try {
      const streamData = await apiProviderFetch(providerConfig.stream, { id: streamId });
      const result = await apiFindPlayableFromPayload({
        payload: streamData,
        providerName,
        providerConfig,
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen: new Set()
      });
      if (result) return result;
      attempts.push(`netmirror: stream id ${streamId} had no usable source`);
    } catch (error) {
      attempts.push(`netmirror/stream ${streamId}: ${error.message || "failed"}`);
    }
  }

  return null;
}


function apiTrustedProviderCanForceHls(providerName = "") {
  const p = apiClean(providerName).toLowerCase();
  return ["vid", "vid-local", "castel", "castle", "castle-local", "xprime", "xprime-local", "netmirror", "animepahe", "animesalt", "themovie", "tm"].includes(p) || p.startsWith("consumet-");
}

function apiCollectTrustedStreamSources(providerName = "", payload = {}) {
  const provider = apiClean(providerName).toLowerCase();
  const sources = [];

  function addStringUrl(value = "", field = "raw") {
    const url = apiClean(value);
    if (!/^https?:\/\//i.test(url)) return;
    if (apiIsYouTubeUrl(url) || apiLooksLikeImage(url)) return;

    sources.push({
      name: apiIsM3u8Url(url) ? "hls" : field,
      quality: "",
      url,
      headers: {},
      format: apiIsM3u8Url(url) ? "m3u8" : "",
      forceHls: apiTrustedProviderCanForceHls(provider) && !apiIsAllowedMediaExtensionUrl(url)
    });
  }

  function addFromNode(node = {}, field = "url") {
    if (typeof node === "string") {
      addStringUrl(node, field);
      return;
    }

    if (!node || typeof node !== "object") return;
    const url = apiFirst(
      node.m3u8,
      node.m3u8_url,
      node.m3u8Url,
      node.hls,
      node.hls_url,
      node.hlsUrl,
      node.playlist,
      node.playlist_url,
      node.playbackUrl,
      node.playback_url,
      node.streamUrl,
      node.stream_url,
      node.url,
      node.link,
      node.file,
      node.src
    );

    if (!/^https?:\/\//i.test(url)) return;
    if (apiIsYouTubeUrl(url) || apiLooksLikeImage(url)) return;

    sources.push({
      name: apiFirst(node.name, node.server, node.provider, node.label, node.source, field) || provider || "api",
      quality: apiFirst(node.quality, node.resolution, node.size, node.format, node.type),
      url,
      headers: node.headers && typeof node.headers === "object" ? node.headers : {},
      format: apiIsM3u8Url(url) ? "m3u8" : apiVerifiedMediaFormat(url, node),
      forceHls: apiTrustedProviderCanForceHls(provider) && !apiIsAllowedMediaExtensionUrl(url),
      mediaVerified: node.mediaVerified === true,
      requiresProxy: node.requiresProxy === true,
      codecName: String(node.codecName || "").slice(0, 32),
      audioLanguage: normalizeAudioLanguage(node.audioLanguage || node.audio_language || node.language || node.lang),
      subtitles: normalizeSubtitles(node.subtitles || node.captions, { headers: node.headers || {}, baseUrl: url })
    });
  }

  const roots = [
    payload?.data,
    payload?.result,
    payload?.results,
    payload?.sources,
    payload?.streams,
    payload?.links,
    payload?.servers,
    payload
  ];

  for (const root of roots) {
    if (typeof root === "string") {
      addStringUrl(root, "raw");
    } else if (Array.isArray(root)) {
      for (const node of root) addFromNode(node);
    } else if (root && typeof root === "object") {
      for (const key of ["data", "sources", "streams", "links", "servers", "results", "items"]) {
        if (Array.isArray(root[key])) {
          for (const node of root[key]) addFromNode(node, key);
        }
      }
      addFromNode(root);
    }
  }

  return Array.from(new Map(sources.map((source) => [source.url, source])).values())
    .sort((a, b) => apiSourceScore(b) - apiSourceScore(a));
}

async function apiFindPlayableFromPayload({
  payload,
  providerName,
  providerConfig,
  mediaType,
  id,
  season = "",
  episode = "",
  attempts = [],
  depth = 0,
  seen = new Set()
}) {
  const normalized = apiNormalizeResponse(payload, providerName, mediaType);
  const trustedSources = apiCollectTrustedStreamSources(providerName, payload);
  const candidates = [
    ...trustedSources,
    ...(Array.isArray(normalized.sources) ? normalized.sources : [])
  ];
  // Captured providers verify their winner before returning. Alternate files
  // stay available as options, but must never replace it before verification.
  const captured = ["vidsrc-local", "streamprovider-local"].includes(apiClean(providerName).toLowerCase());
  const sources = apiPreferM3u8Sources(captured ? candidates.filter(source => source.mediaVerified === true) : candidates);

  for (const source of sources) {
    const result = apiSourceToProxyResult({
      source,
      raw: normalized,
      provider: providerName,
      type: mediaType,
      id,
      season,
      episode,
      playbackCandidates: Array.isArray(payload?.sources) ? payload.sources : candidates,
      subtitles: payload?.subtitles || payload?.captions || [],
      attempts
    });
    if (result) return result;
  }

  // VidSrc Playwright provider should only trust URLs captured from browser network
  // as sources. If Playwright did not capture an m3u8, do not deep-dig 403/Cloudflare
  // pages because those can contain unrelated demo videos.
  if (["vidsrc-local", "streamprovider-local"].includes(apiClean(providerName).toLowerCase())) return null;

  if (depth >= 2) return null;

  const candidateUrls = apiCollectCandidateUrls(payload);

  // Test playable-looking URLs directly first, in case the normalizer missed the field name.
  const directUrls = apiPreferM3u8Sources(candidateUrls
    .map((url) => ({
      url,
      name: apiIsM3u8Url(url) ? "hls" : "source",
      quality: "",
      headers: {},
      format: apiIsM3u8Url(url) ? "m3u8" : "",
      forceHls: apiTrustedProviderCanForceHls(providerName) && !apiIsAllowedMediaExtensionUrl(url)
    }))
    .filter((source) => apiLooksPlayable(source.url, source)));

  for (const source of directUrls) {
    const result = apiSourceToProxyResult({
      source,
      raw: normalized,
      provider: providerName,
      type: mediaType,
      id,
      season,
      episode,
      attempts
    });
    if (result) return result;
  }

  // Then try local source-code extractors copied from the uploaded API project.
  // This does not call the hosted API docs server.
  for (const url of candidateUrls) {
    const localResult = await localTrySourceCodeExtractorForUrl({
      url,
      providerName,
      mediaType,
      id,
      season,
      episode,
      attempts,
      seen
    });
    if (localResult) return localResult;
  }

  // Generic source-code deep digger: if provider payload has page/embed URLs that
  // are not covered by named routes, fetch and recursively scan those pages for media.
  if (candidateUrls.length && depth < 1) {
    const deepResult = await localDeepDigForPlayableUrl({
      seedUrls: candidateUrls,
      providerName,
      mediaType,
      id,
      season,
      episode,
      attempts,
      seen,
      maxDepth: 2
    });
    if (deepResult) return deepResult;
  }

  // Then try intermediate API extractor routes. This fixes details responses that
  // return link pages first, then actual .m3u8/media URLs after a second API call.
  for (const url of candidateUrls) {
    if (!apiCanBeIntermediateExtractorUrl(url)) continue;

    const jobs = apiExtractorJobsForUrl(providerName, providerConfig, url);

    for (const job of jobs) {
      const seenKey = `${job.provider}:${job.action}:${url}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);

      try {
        attempts.push(`${providerName}: trying ${job.action}`);
        const extracted = await apiProviderFetch(job.endpoint, job.params);
        const result = await apiFindPlayableFromPayload({
          payload: extracted,
          providerName: job.provider || providerName,
          providerConfig: API_PROVIDERS[job.provider] || providerConfig,
          mediaType,
          id,
          season,
          episode,
          attempts,
          depth: depth + 1,
          seen
        });
        if (result) return result;
      } catch (error) {
        attempts.push(`${job.provider || providerName}/${job.action}: ${error.message || "extract failed"}`);
      }
    }
  }

  return null;
}

function apiSourceToProxyResult({ source, raw, provider, type, id, season = "", episode = "", attempts = [], playbackCandidates = [], subtitles = [] }) {
  if (!source || !source.url) return null;

  let parsed;
  try { parsed = new URL(source.url); } catch { return null; }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const originalUrl = parsed.toString();

  if (apiIsYouTubeUrl(originalUrl)) {
    attempts.push(`${provider}: skipped YouTube source`);
    return null;
  }

  const isHls = apiIsM3u8Url(originalUrl) || apiNodeSaysHls(originalUrl, source);
  const isDash = apiIsMpdUrl(originalUrl) || apiVerifiedMediaFormat(originalUrl, source) === "mpd";

  if (!apiLooksPlayable(originalUrl, source)) {
    attempts.push(`${provider}: skipped download/detail/non-media URL`);
    return null;
  }

  const needsFileProxy = !isHls && source.mediaVerified === true && source.requiresProxy === true
    && apiVerifiedMediaFormat(originalUrl, source) === "mp4";
  const hlsProxy = (isHls || needsFileProxy) && hlsProxyEnabled()
    ? registerHlsProxySource(originalUrl, source.headers || {}, {
        movieId: String(id || ""),
        provider,
        type,
        season,
        episode,
        streamName: source.name || "",
        streamQuality: source.quality || "",
        ...(needsFileProxy ? { sourceFormat: "mp4", sourceCodec: String(source.codecName || "").slice(0, 32) } : {})
      })
    : { enabled: false, id: "", url: "" };

  const fileProxyUrl = needsFileProxy && hlsProxy.id ? `/api/media-file-proxy/${hlsProxy.id}/video.mp4` : "";
  if (needsFileProxy && !fileProxyUrl) return null;
  const playbackUrl = fileProxyUrl || hlsProxy.url || originalUrl;

  // HLS endpoints use the local master.m3u8 proxy. Direct extensionless media
  // requires verified format evidence retained from the capture pipeline.
  if ((!apiIsAllowedMediaExtensionUrl(playbackUrl) && !(source.mediaVerified && !isHls && apiVerifiedMediaFormat(playbackUrl, source))) || apiLooksDefinitelyNonMediaUrl(playbackUrl, { allowManifestEndpoint: isDash && source.mediaVerified === true })) {
    attempts.push(`${provider}: final embed URL was not a real playable media file/playlist`);
    return null;
  }

  const pathExtMatch = apiUrlPath(playbackUrl).toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  const sourceExt = pathExtMatch ? pathExtMatch[1] : "";
  const streamType = isHls ? "m3u8" : (isDash ? "dash" : (apiVerifiedMediaFormat(originalUrl, source) || sourceExt || "video"));
  const streamMode = isHls ? "hls" : (isDash ? "dash" : "video");

  return preparePlaybackOptions({
    status: "ok",
    providerKind: `api_${provider}${isHls ? (hlsProxy.url ? "_hls_proxy" : "_direct_hls") : "_non_download"}`,
    movieId: String(id || ""),
    sourceUrl: String(raw?.sourceUrl || raw?.url || ""),
    playbackUrl,
    proxyVideo: playbackUrl,
    originalPlaybackUrl: originalUrl,
    hlsProxyUrl: isHls ? hlsProxy.url || "" : "",
    hlsProxyId: isHls ? hlsProxy.id || "" : "",
    hlsProxyStatusUrl: isHls && hlsProxy.id ? `/api/hls-proxy/${hlsProxy.id}/status` : "",
    m3u8: isHls ? originalUrl : "",
    embeddedM3u8Url: isHls ? playbackUrl : "",
    m3u8Embedded: Boolean(isHls),
    streamType,
    streamCodec: String(source.codecName || "").slice(0, 32),
    streamQuality: source.quality || "",
    streamName: source.name || provider,
    streamHeaders: Object.fromEntries(Object.entries(source.headers || {}).filter(([key]) => !/^(cookie|authorization|proxy-authorization)$/i.test(key))),
    streamMode,
    isLiveM3u8: false,
    apiProvider: provider,
    normalized: Object.fromEntries(["title", "year", "poster", "backdrop", "overview"].map(key => [key, ["string", "number"].includes(typeof raw?.[key]) ? raw[key] : ""])),
    attempts
  }, { source, sources: playbackCandidates, subtitles, metadata: { movieId: String(id || ""), provider, type, season, episode } });
}



// ===== Local port of uploaded ScarperApi-zero app/api/vid/route.ts =====
// This does the API source-code flow directly inside SwiflyTV instead of burning
// API quota on /api/vid. It uses TMDB id -> VideoEasy servers -> enc-dec decrypt
// -> streams[].url, exactly like the uploaded source.
const LOCAL_VID_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Connection: "keep-alive"
};

const LOCAL_VID_DEC_API = "https://enc-dec.app/api";
const LOCAL_VID_TMDB_API_KEY = process.env.TMDB_API_KEY || "d131017ccc6e5462a81c9304d21476de";
const LOCAL_VID_TMDB_BASE_URL = "https://twilight-cake-defb.hunternisha55.workers.dev/3";

const LOCAL_VID_SERVERS = {
  Neon: { url: "https://api.videasy.net/myflixerzupcloud/sources-with-title", language: "Original" },
  Sage: { url: "https://api.videasy.net/1movies/sources-with-title", language: "Original" },
  Cypher: { url: "https://api.videasy.net/moviebox/sources-with-title", language: "Original" },
  Yoru: { url: "https://api.videasy.net/cdn/sources-with-title", language: "Original", moviesOnly: true },
  Reyna: { url: "https://api2.videasy.net/primewire/sources-with-title", language: "Original" },
  Omen: { url: "https://api.videasy.net/onionplay/sources-with-title", language: "Original" },
  Breach: { url: "https://api.videasy.net/m4uhd/sources-with-title", language: "Original" },
  Vyse: { url: "https://api.videasy.net/hdmovie/sources-with-title", language: "Original" },
  Killjoy: { url: "https://api.videasy.net/meine/sources-with-title", language: "German", params: { language: "german" } },
  Harbor: { url: "https://api.videasy.net/meine/sources-with-title", language: "Italian", params: { language: "italian" } },
  Chamber: { url: "https://api.videasy.net/meine/sources-with-title", language: "French", params: { language: "french" }, moviesOnly: true },
  Fade: { url: "https://api.videasy.net/hdmovie/sources-with-title", language: "Hindi" },
  Gekko: { url: "https://api2.videasy.net/cuevana-latino/sources-with-title", language: "Latin" },
  Kayo: { url: "https://api2.videasy.net/cuevana-spanish/sources-with-title", language: "Spanish" },
  Raze: { url: "https://api.videasy.net/superflix/sources-with-title", language: "Portuguese" },
  Phoenix: { url: "https://api2.videasy.net/overflix/sources-with-title", language: "Portuguese" },
  Astra: { url: "https://api.videasy.net/visioncine/sources-with-title", language: "Portuguese" }
};

async function localVidFetchText(url) {
  const response = await fetch(url, { method: "GET", headers: LOCAL_VID_HEADERS, cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.text();
}

async function localVidPostJson(url, jsonBody, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...LOCAL_VID_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(jsonBody),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

async function localVidDecryptVideoEasy(encryptedText, tmdbId) {
  const data = await localVidPostJson(`${LOCAL_VID_DEC_API}/dec-videasy`, {
    text: encryptedText,
    id: tmdbId
  });
  return data && data.result ? data.result : {};
}

async function localVidFetchMediaDetails(tmdbId, mediaType = "movie") {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${LOCAL_VID_TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${LOCAL_VID_TMDB_API_KEY}&append_to_response=external_ids`;
  const data = await (async () => {
    const response = await fetch(url, { method: "GET", headers: LOCAL_VID_HEADERS, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  })();

  const title = mediaType === "tv" ? data.name : data.title;
  const date = mediaType === "tv" ? data.first_air_date : data.release_date;

  return {
    id: data.id,
    title: title || "",
    year: date ? String(date).split("-")[0] : "",
    imdbId: data.external_ids && data.external_ids.imdb_id ? data.external_ids.imdb_id : "",
    mediaType,
    overview: data.overview || "",
    poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : "",
    backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : "",
    numberOfSeasons: data.number_of_seasons,
    numberOfEpisodes: data.number_of_episodes
  };
}

function localVidBuildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId) {
  const params = {
    title,
    mediaType,
    year,
    tmdbId,
    imdbId
  };

  if (serverConfig.params) Object.assign(params, serverConfig.params);

  if (mediaType === "tv" && seasonId !== null && episodeId !== null) {
    params.seasonId = String(seasonId);
    params.episodeId = String(episodeId);
  }

  const queryString = Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] || "")}`)
    .join("&");

  return `${serverConfig.url}?${queryString}`;
}

function localVidNormalizeLanguage(language = "") {
  const map = {
    en: "English", eng: "English", english: "English",
    hi: "Hindi", hin: "Hindi", hindi: "Hindi",
    de: "German", ger: "German", german: "German",
    it: "Italian", ita: "Italian", italian: "Italian",
    fr: "French", fre: "French", french: "French",
    es: "Spanish", spa: "Spanish", spanish: "Spanish",
    pt: "Portuguese", por: "Portuguese", portuguese: "Portuguese"
  };
  const key = String(language || "").toLowerCase().trim();
  return map[key] || language || "";
}

function localVidExtractQuality(url = "") {
  const value = String(url || "");
  const patterns = [
    /(\d{3,4})p/i,
    /quality[_-]?(\d{3,4})/i,
    /res[_-]?(\d{3,4})/i,
    /(\d{3,4})x\d{3,4}/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (n >= 240 && n <= 4320) return `${n}p`;
  }

  if (value.includes("2160") || value.toLowerCase().includes("4k")) return "2160p";
  if (value.includes("1080") || value.includes("1920")) return "1080p";
  if (value.includes("720") || value.includes("1280")) return "720p";
  if (value.includes("480") || value.includes("854")) return "480p";
  if (value.includes("360") || value.includes("640")) return "360p";
  return "Adaptive";
}

function localVidQualityRank(quality = "") {
  const q = String(quality || "").toLowerCase().replace(/p$/, "");
  if (q === "4k" || q === "2160") return 2160;
  if (q === "1440") return 1440;
  if (q === "1080") return 1080;
  if (q === "720") return 720;
  if (q === "480") return 480;
  if (q === "360") return 360;
  if (q === "240") return 240;
  if (q === "adaptive" || q === "auto") return 4000;
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

function localVidFormatStreams(mediaData, serverName, serverConfig, mediaDetails) {
  if (!mediaData || typeof mediaData !== "object" || !Array.isArray(mediaData.sources)) return [];

  const streams = [];

  for (const source of mediaData.sources) {
    if (!source || !source.url) continue;
    if (apiIsYouTubeUrl(source.url)) continue;

    let quality = source.quality || localVidExtractQuality(source.url);
    if (!quality || quality === "unknown") quality = source.url.includes(".m3u8") ? "Adaptive" : localVidExtractQuality(source.url);

    let languageInfo = "";
    if (source.language) {
      const normalizedLanguage = localVidNormalizeLanguage(source.language);
      if (normalizedLanguage) languageInfo = ` [${normalizedLanguage}]`;
    }

    const headers = source.url.includes(".m3u8")
      ? {
          ...LOCAL_VID_HEADERS,
          Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
          Referer: "https://videasy.net/"
        }
      : {
          ...LOCAL_VID_HEADERS,
          Accept: "video/mp4,video/x-matroska,*/*",
          Range: "bytes=0-"
        };

    streams.push({
      name: `VIDEASY ${serverName} (${serverConfig.language})${languageInfo} - ${quality}`,
      title: `${mediaDetails.title} (${mediaDetails.year})`,
      url: source.url,
      quality,
      size: "Unknown",
      headers,
      provider: "videasy",
      forceHls: true
    });
  }

  return streams;
}

async function localVidFetchFromServer(serverName, serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId, mediaDetails) {
  if (mediaType === "tv" && serverConfig.moviesOnly) return [];

  try {
    const url = localVidBuildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId);
    const encryptedData = await localVidFetchText(url);
    if (!encryptedData || !encryptedData.trim()) return [];
    const decryptedData = await localVidDecryptVideoEasy(encryptedData, tmdbId);
    return localVidFormatStreams(decryptedData, serverName, serverConfig, mediaDetails);
  } catch (error) {
    return [];
  }
}

async function localVidGetStreams({ tmdbId = "", mediaType = "movie", season = "", episode = "" }) {
  const seasonNum = mediaType === "tv" && season ? Number(season) : null;
  const episodeNum = mediaType === "tv" && episode ? Number(episode) : null;

  const mediaDetails = await localVidFetchMediaDetails(tmdbId, mediaType);
  const names = Object.keys(LOCAL_VID_SERVERS);
  const jobs = names.map((serverName) => {
    const serverConfig = LOCAL_VID_SERVERS[serverName];
    return localVidFetchFromServer(
      serverName,
      serverConfig,
      mediaDetails.mediaType,
      mediaDetails.title,
      mediaDetails.year,
      tmdbId,
      mediaDetails.imdbId,
      seasonNum,
      episodeNum,
      mediaDetails
    );
  });

  const results = await Promise.all(jobs);
  const allStreams = results.flat();
  const unique = [];
  const seen = new Set();

  for (const stream of allStreams) {
    if (!stream.url || seen.has(stream.url)) continue;
    seen.add(stream.url);
    unique.push(stream);
  }

  unique.sort((a, b) => localVidQualityRank(b.quality) - localVidQualityRank(a.quality));

  return {
    success: true,
    provider: "vid-local",
    tmdbId,
    mediaType,
    ...(mediaType === "tv" ? { season: seasonNum, episode: episodeNum } : {}),
    streams: unique,
    count: unique.length
  };
}

// ===== Local port of uploaded ScarperApi-zero app/api/castel/route.ts =====
const LOCAL_CASTLE_TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const LOCAL_CASTLE_TMDB_BASE_URL = "https://api.themoviedb.org/3";
const LOCAL_CASTLE_BASE = "https://api.fstcy.com";
const LOCAL_CASTLE_PKG = "com.external.castle";
const LOCAL_CASTLE_CHANNEL = "IndiaA";
const LOCAL_CASTLE_CLIENT = "1";
const LOCAL_CASTLE_LANG = "en-US";

const LOCAL_CASTLE_HEADERS = {
  "User-Agent": "okhttp/4.9.3",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "Keep-Alive",
  "Referer": LOCAL_CASTLE_BASE
};

const LOCAL_CASTLE_PLAYBACK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "video",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "DNT": "1"
};

async function localCastleDecrypt(encryptedB64, securityKeyB64) {
  const response = await fetch("https://aesdec.nuvioapp.space/decrypt-castle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encryptedData: encryptedB64, securityKey: securityKeyB64 })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.decrypted;
}

async function localCastleRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { ...LOCAL_CASTLE_HEADERS, ...(options.headers || {}) },
    body: options.body,
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response;
}

async function localCastleExtractCipher(response) {
  const text = await response.text();
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Empty response");

  try {
    const json = JSON.parse(trimmed);
    if (json && json.data && typeof json.data === "string") return json.data.trim();
  } catch {}

  return trimmed;
}

async function localCastleGetSecurityKey() {
  const url = `${LOCAL_CASTLE_BASE}/v0.1/system/getSecurityKey/1?channel=${LOCAL_CASTLE_CHANNEL}&clientType=${LOCAL_CASTLE_CLIENT}&lang=${LOCAL_CASTLE_LANG}`;
  const response = await localCastleRequest(url);
  const data = await response.json();

  if (data.code !== 200 || !data.data) {
    throw new Error(`Security key API error: ${JSON.stringify(data)}`);
  }

  return data.data;
}

async function localCastleSearch(securityKey, keyword, page = 1, size = 30) {
  const params = new URLSearchParams({
    channel: LOCAL_CASTLE_CHANNEL,
    clientType: LOCAL_CASTLE_CLIENT,
    keyword,
    lang: LOCAL_CASTLE_LANG,
    mode: "1",
    packageName: LOCAL_CASTLE_PKG,
    page: String(page),
    size: String(size)
  });

  const url = `${LOCAL_CASTLE_BASE}/film-api/v1.1.0/movie/searchByKeyword?${params.toString()}`;
  const response = await localCastleRequest(url);
  const cipher = await localCastleExtractCipher(response);
  const decrypted = await localCastleDecrypt(cipher, securityKey);
  return JSON.parse(decrypted);
}

async function localCastleDetails(securityKey, movieId) {
  const url = `${LOCAL_CASTLE_BASE}/film-api/v1.1/movie?channel=${LOCAL_CASTLE_CHANNEL}&clientType=${LOCAL_CASTLE_CLIENT}&lang=${LOCAL_CASTLE_LANG}&movieId=${movieId}&packageName=${LOCAL_CASTLE_PKG}`;
  const response = await localCastleRequest(url);
  const cipher = await localCastleExtractCipher(response);
  const decrypted = await localCastleDecrypt(cipher, securityKey);
  return JSON.parse(decrypted);
}

async function localCastleGetVideo2(securityKey, movieId, episodeId, resolution = 2) {
  const url = `${LOCAL_CASTLE_BASE}/film-api/v2.0.1/movie/getVideo2?clientType=${LOCAL_CASTLE_CLIENT}&packageName=${LOCAL_CASTLE_PKG}&channel=${LOCAL_CASTLE_CHANNEL}&lang=${LOCAL_CASTLE_LANG}`;
  const body = {
    mode: "1",
    appMarket: "GuanWang",
    clientType: "1",
    woolUser: "false",
    apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
    androidVersion: "13",
    movieId: String(movieId),
    episodeId: String(episodeId),
    isNewUser: "true",
    resolution: String(resolution),
    packageName: LOCAL_CASTLE_PKG
  };

  const response = await localCastleRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const cipher = await localCastleExtractCipher(response);
  const decrypted = await localCastleDecrypt(cipher, securityKey);
  return JSON.parse(decrypted);
}

async function localCastleGetVideoV1(securityKey, movieId, episodeId, languageId, resolution = 2) {
  const params = new URLSearchParams({
    apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
    channel: LOCAL_CASTLE_CHANNEL,
    clientType: LOCAL_CASTLE_CLIENT,
    episodeId: String(episodeId),
    lang: LOCAL_CASTLE_LANG,
    languageId: String(languageId),
    mode: "1",
    movieId: String(movieId),
    packageName: LOCAL_CASTLE_PKG,
    resolution: String(resolution)
  });

  const url = `${LOCAL_CASTLE_BASE}/film-api/v1.9.1/movie/getVideo?${params.toString()}`;
  const response = await localCastleRequest(url);
  const cipher = await localCastleExtractCipher(response);
  const decrypted = await localCastleDecrypt(cipher, securityKey);
  return JSON.parse(decrypted);
}

function localCastleDataBlock(obj) {
  if (obj && typeof obj === "object" && obj.data && typeof obj.data === "object") return obj.data;
  return obj || {};
}

async function localCastleTmdbDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${LOCAL_CASTLE_TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${LOCAL_CASTLE_TMDB_API_KEY}&append_to_response=external_ids`;
  const response = await localCastleRequest(url);
  const data = await response.json();

  const title = mediaType === "tv" ? (data.name || "") : (data.title || "");
  const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
  const year = releaseDate ? parseInt(String(releaseDate).split("-")[0], 10) : null;

  return { title, year, tmdbId };
}

async function localCastleFindMovieId(securityKey, tmdbInfo) {
  const searchTerm = tmdbInfo.year ? `${tmdbInfo.title} ${tmdbInfo.year}` : tmdbInfo.title;
  const searchResult = await localCastleSearch(securityKey, searchTerm);
  const data = localCastleDataBlock(searchResult);
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (!rows.length) throw new Error("No search results found");

  for (const item of rows) {
    const itemTitle = String(item.title || item.name || "").toLowerCase();
    const searchTitle = String(tmdbInfo.title || "").toLowerCase();

    if (itemTitle.includes(searchTitle) || searchTitle.includes(itemTitle)) {
      const movieId = item.id || item.redirectId || item.redirectIdStr;
      if (movieId) return String(movieId);
    }
  }

  const firstItem = rows[0];
  const movieId = firstItem.id || firstItem.redirectId || firstItem.redirectIdStr;
  if (movieId) return String(movieId);

  throw new Error("Could not extract movie ID from search results");
}

function localCastleQualityValue(quality) {
  if (!quality) return 0;
  const cleanQuality = String(quality).toLowerCase().replace(/^(sd|hd|fhd|uhd|4k)\s*/i, "").replace(/p$/, "").trim();
  if (cleanQuality === "4k" || cleanQuality === "2160") return 2160;
  if (cleanQuality === "1440") return 1440;
  if (cleanQuality === "1080") return 1080;
  if (cleanQuality === "720") return 720;
  if (cleanQuality === "480") return 480;
  if (cleanQuality === "360") return 360;
  if (cleanQuality === "240") return 240;
  const n = parseInt(cleanQuality, 10);
  return !Number.isNaN(n) && n > 0 ? n : 0;
}

function localCastleProcessVideo(videoData, mediaInfo, seasonNum, episodeNum, resolution, languageInfo) {
  const streams = [];
  const data = localCastleDataBlock(videoData);
  const videoUrl = data.videoUrl;

  if (!videoUrl) return streams;

  let mediaTitle = mediaInfo.title || "Unknown";
  if (mediaInfo.year) mediaTitle += ` (${mediaInfo.year})`;
  if (seasonNum && episodeNum) mediaTitle = `${mediaInfo.title} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;

  const qualityMap = { 1: "480p", 2: "720p", 3: "1080p" };
  const quality = qualityMap[resolution] || `${resolution}p`;

  if (data.videos && Array.isArray(data.videos)) {
    for (const video of data.videos) {
      let videoQuality = video.resolutionDescription || video.resolution || quality;
      videoQuality = String(videoQuality).replace(/^(SD|HD|FHD)\s+/i, "");

      const sizeValue = video.size;
      const formattedSize = (typeof sizeValue === "number" && sizeValue > 0)
        ? (sizeValue > 1000000000 ? `${(sizeValue / 1000000000).toFixed(2)} GB` : `${(sizeValue / 1000000).toFixed(0)} MB`)
        : "Unknown";

      streams.push({
        name: languageInfo ? `Castle ${languageInfo} - ${videoQuality}` : `Castle - ${videoQuality}`,
        title: mediaTitle,
        url: video.url || videoUrl,
        quality: videoQuality,
        size: formattedSize,
        headers: LOCAL_CASTLE_PLAYBACK_HEADERS,
        provider: "castle"
      });
    }
  } else {
    const sizeValue = data.size;
    const formattedSize = (typeof sizeValue === "number" && sizeValue > 0)
      ? (sizeValue > 1000000000 ? `${(sizeValue / 1000000000).toFixed(2)} GB` : `${(sizeValue / 1000000).toFixed(0)} MB`)
      : "Unknown";

    streams.push({
      name: languageInfo ? `Castle ${languageInfo} - ${quality}` : `Castle - ${quality}`,
      title: mediaTitle,
      url: videoUrl,
      quality,
      size: formattedSize,
      headers: LOCAL_CASTLE_PLAYBACK_HEADERS,
      provider: "castle"
    });
  }

  return streams;
}

async function localCastleGetStreams({ tmdbId = "", mediaType = "movie", season = "", episode = "" }) {
  const seasonNum = mediaType === "tv" && season ? parseInt(season, 10) : null;
  const episodeNum = mediaType === "tv" && episode ? parseInt(episode, 10) : null;

  const tmdbInfo = await localCastleTmdbDetails(tmdbId, mediaType);
  const securityKey = await localCastleGetSecurityKey();
  const movieId = await localCastleFindMovieId(securityKey, tmdbInfo);

  let details = await localCastleDetails(securityKey, movieId);
  let finalMovieId = movieId;

  if (mediaType === "tv" && seasonNum && episodeNum) {
    const data = localCastleDataBlock(details);
    const seasons = Array.isArray(data.seasons) ? data.seasons : [];
    const seasonData = seasons.find((s) => s.number === seasonNum);
    if (seasonData && seasonData.movieId && String(seasonData.movieId) !== movieId) {
      details = await localCastleDetails(securityKey, String(seasonData.movieId));
      finalMovieId = String(seasonData.movieId);
    }
  }

  const data = localCastleDataBlock(details);
  const episodes = Array.isArray(data.episodes) ? data.episodes : [];

  let episodeId = null;
  if (mediaType === "tv" && seasonNum && episodeNum) {
    const ep = episodes.find((e) => e.number === episodeNum);
    if (ep && ep.id) episodeId = String(ep.id);
  } else if (episodes.length > 0) {
    episodeId = String(episodes[0].id);
  }

  if (!episodeId) throw new Error("Could not find episode ID");

  const episodeData = episodes.find((e) => String(e.id) === String(episodeId));
  const tracks = (episodeData && Array.isArray(episodeData.tracks)) ? episodeData.tracks : [];
  const resolution = 2;
  const allStreams = [];

  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const langName = track.languageName || track.abbreviate || `Lang${i + 1}`;

    if (track.existIndividualVideo && track.languageId) {
      try {
        const videoData = await localCastleGetVideoV1(securityKey, finalMovieId, episodeId, track.languageId, resolution);
        const langStreams = localCastleProcessVideo(videoData, tmdbInfo, seasonNum, episodeNum, resolution, `[${langName}]`);
        allStreams.push(...langStreams);
      } catch {}
    }
  }

  if (!allStreams.length) {
    const videoData = await localCastleGetVideo2(securityKey, finalMovieId, episodeId, resolution);
    allStreams.push(...localCastleProcessVideo(videoData, tmdbInfo, seasonNum, episodeNum, resolution, "[Shared]"));
  }

  const seen = new Set();
  const unique = [];
  for (const stream of allStreams) {
    if (!stream.url || seen.has(stream.url)) continue;
    seen.add(stream.url);
    unique.push(stream);
  }

  unique.sort((a, b) => localCastleQualityValue(b.quality) - localCastleQualityValue(a.quality));

  return {
    success: true,
    provider: "castle-local",
    tmdbId,
    mediaType,
    ...(seasonNum ? { season: seasonNum } : {}),
    ...(episodeNum ? { episode: episodeNum } : {}),
    streams: unique,
    count: unique.length
  };
}
// ===== End local Castle source port =====

// ===== More local ports from uploaded ScarperApi-zero source =====
let LOCAL_SOURCE_PROVIDER_CACHE = null;
let LOCAL_SOURCE_COOKIES_CACHE = null;

const LOCAL_SOURCE_FALLBACK_PROVIDERS = {
  moviebox: { name: "MovieBox", url: process.env.MOVIEBOX_BASE_URL || "https://themoviebox.org/" },
  nfMirror: { name: "NetMirror", url: process.env.NETMIRROR_BASE_URL || "https://net22.cc" },
  netmirror: { name: "NetMirror", url: process.env.NETMIRROR_BASE_URL || "https://net22.cc" },
  "4khdhub": { name: "4kHDHub", url: process.env.PROVIDER_4KHDHUB_BASE_URL || "" },
  "desiremovies": { name: "DesireMovies", url: process.env.PROVIDER_DESIREMOVIES_BASE_URL || "" },
  "drive": { name: "Drive", url: process.env.PROVIDER_DRIVE_BASE_URL || "" },
  "hdhub": { name: "HDHub4U", url: process.env.PROVIDER_HDHUB4U_BASE_URL || "" },
  "hdhub4u": { name: "HDHub4U", url: process.env.PROVIDER_HDHUB4U_BASE_URL || "" },
  "KMMovies": { name: "KMMovies", url: process.env.PROVIDER_KMMOVIES_BASE_URL || "" },
  "kmmovies": { name: "KMMovies", url: process.env.PROVIDER_KMMOVIES_BASE_URL || "" },
  "Moviesmod": { name: "Moviesmod", url: process.env.PROVIDER_MOVIESMOD_BASE_URL || "" },
  "mod": { name: "Moviesmod", url: process.env.PROVIDER_MOVIESMOD_BASE_URL || "" },
  "movies4u": { name: "Movies4u", url: process.env.PROVIDER_MOVIES4U_BASE_URL || "" },
  "UhdMovies": { name: "UhdMovies", url: process.env.PROVIDER_UHDMOVIES_BASE_URL || "" },
  "uhdmovies": { name: "UhdMovies", url: process.env.PROVIDER_UHDMOVIES_BASE_URL || "" },
  "Vega": { name: "Vega", url: process.env.PROVIDER_VEGA_BASE_URL || "" },
  "vega": { name: "Vega", url: process.env.PROVIDER_VEGA_BASE_URL || "" },
  "zeefliz": { name: "Zeefliz", url: process.env.PROVIDER_ZEEFLIZ_BASE_URL || "" },
  "zinkmovies": { name: "ZinkMovies", url: process.env.PROVIDER_ZINKMOVIES_BASE_URL || "" }
};

async function localSourceGetProviders() {
  if (LOCAL_SOURCE_PROVIDER_CACHE) return LOCAL_SOURCE_PROVIDER_CACHE;

  const response = await fetch("https://raw.githubusercontent.com/Anshu78780/json/main/providers.json", {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScraperAPI/1.0)",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    LOCAL_SOURCE_PROVIDER_CACHE = LOCAL_SOURCE_FALLBACK_PROVIDERS;
    return LOCAL_SOURCE_PROVIDER_CACHE;
  }

  try {
    LOCAL_SOURCE_PROVIDER_CACHE = await response.json();
  } catch {
    LOCAL_SOURCE_PROVIDER_CACHE = LOCAL_SOURCE_FALLBACK_PROVIDERS;
  }

  return { ...LOCAL_SOURCE_FALLBACK_PROVIDERS, ...LOCAL_SOURCE_PROVIDER_CACHE };
}

async function localSourceGetBaseUrl(key = "") {
  const providers = await localSourceGetProviders();
  const provider = providers[key] || LOCAL_SOURCE_FALLBACK_PROVIDERS[key];
  if (!provider || !provider.url) throw new Error(`Provider key "${key}" not found or has empty URL`);
  return String(provider.url).replace(/\/$/, "");
}

async function localSourceGetCookies() {
  if (LOCAL_SOURCE_COOKIES_CACHE !== null) return LOCAL_SOURCE_COOKIES_CACHE;

  const envCookies = process.env.SOURCE_COOKIES || process.env.NETMIRROR_COOKIES || process.env.MOVIEBOX_COOKIES || "";
  if (envCookies) {
    LOCAL_SOURCE_COOKIES_CACHE = envCookies;
    return LOCAL_SOURCE_COOKIES_CACHE;
  }

  const response = await fetch("https://raw.githubusercontent.com/Anshu78780/json/main/cookies.json", {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScraperAPI/1.0)",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    // The uploaded source depends on a remote cookies.json that can disappear/404.
    // Keep local-source-only mode alive instead of killing the entire chain.
    LOCAL_SOURCE_COOKIES_CACHE = "";
    return LOCAL_SOURCE_COOKIES_CACHE;
  }

  const data = await response.json();
  if (!data.cookies) {
    LOCAL_SOURCE_COOKIES_CACHE = "";
    return LOCAL_SOURCE_COOKIES_CACHE;
  }

  LOCAL_SOURCE_COOKIES_CACHE = data.cookies;
  return LOCAL_SOURCE_COOKIES_CACHE;
}


function localSourceReleaseStatus({ mediaType = "movie", releaseDate = "", firstAirDate = "" } = {}) {
  const dateText = mediaType === "tv" ? firstAirDate : releaseDate;
  if (!dateText) return { known: false, future: false, label: "unknown" };

  const release = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(release.getTime())) return { known: false, future: false, label: "unknown" };

  return {
    known: true,
    future: release.getTime() > Date.now(),
    label: release.getTime() > Date.now() ? "unreleased" : "released",
    date: dateText
  };
}

function localSourceDeepCollectIds(input) {
  const ids = new Set();

  apiWalk(input, (node) => {
    if (typeof node === "string") {
      const text = node;
      for (const match of text.matchAll(/[?&](?:id|post|content|video)=([A-Za-z0-9_-]+)/g)) ids.add(match[1]);
      for (const match of text.matchAll(/\b(?:id|post|content|video)["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{2,})/g)) ids.add(match[1]);
      return;
    }

    if (!node || typeof node !== "object") return;
    for (const key of ["id", "postId", "contentId", "videoId", "movieId", "redirectId", "redirectIdStr", "subjectId"]) {
      const value = node[key];
      if (typeof value === "string" || typeof value === "number") ids.add(String(value));
    }
  });

  return Array.from(ids).filter(Boolean);
}

// ===== Local NetMirror port from uploaded app/api/netmirror/* =====
async function localNetMirrorFetchMaybeJson(url, headers, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    body: options.body,
    cache: "no-store",
    headers
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("application/json")) {
    try { return JSON.parse(text); } catch {}
  }

  try { return JSON.parse(text); } catch {
    return { rawResponse: text, contentType, url };
  }
}

async function localNetMirrorSearchRaw(query) {
  const baseUrl = "https://net22.cc";
  const cookies = await localSourceGetCookies();
  const t = Date.now().toString();
  const searchUrl = `${baseUrl}/search.php?s=${encodeURIComponent(query)}&t=${t}`;

  const data = await localNetMirrorFetchMaybeJson(searchUrl, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "Cookie": cookies,
    "Referer": baseUrl,
    "X-Requested-With": "XMLHttpRequest"
  });

  return { success: true, data: { searchUrl, searchResults: data, requestParams: { query, timestamp: t } } };
}

async function localNetMirrorGetPlayHash(id) {
  const cookies = await localSourceGetCookies();

  const response = await fetch("https://net22.cc/play.php", {
    method: "POST",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.5",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookies,
      "Referer": "https://net20.cc/",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: `id=${encodeURIComponent(id)}`
  });

  if (!response.ok) throw new Error(`play.php HTTP ${response.status}`);
  const data = await response.json();
  if (!data.h) throw new Error("Hash parameter not found in play.php response");
  return data.h;
}

function localNetMirrorAddPrefixToSources(data) {
  const PREFIX_URL = "https://net51.cc";

  if (Array.isArray(data)) return data.map((item) => localNetMirrorAddPrefixToSources(item));

  if (data && typeof data === "object") {
    const processed = { ...data };

    if (Array.isArray(processed.sources)) {
      processed.sources = processed.sources.map((source) => {
        if (source && typeof source.file === "string" && source.file.startsWith("/")) {
          return { ...source, file: PREFIX_URL + source.file };
        }
        return source;
      });
    }

    for (const key of Object.keys(processed)) {
      if (processed[key] && typeof processed[key] === "object") {
        processed[key] = localNetMirrorAddPrefixToSources(processed[key]);
      }
    }

    return processed;
  }

  return data;
}

async function localNetMirrorStreamRaw(id) {
  const cookies = await localSourceGetCookies();
  const h = await localNetMirrorGetPlayHash(id);
  const timestamp = Date.now().toString();
  const playlistUrl = `https://net52.cc/playlist.php?id=${encodeURIComponent(id)}&tm=${timestamp}&h=${encodeURIComponent(h)}`;

  const streamData = await localNetMirrorFetchMaybeJson(playlistUrl, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "Cookie": cookies,
    "Referer": "https://net51.cc/",
    "X-Requested-With": "XMLHttpRequest"
  });

  return {
    success: true,
    data: {
      playlistUrl,
      streamData: localNetMirrorAddPrefixToSources(streamData),
      requestParams: { id, timestamp, h }
    }
  };
}


function localSourceTitleVariants(title = "", year = "") {
  const raw = String(title || "").trim();
  const y = String(year || "").trim();
  const clean = raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/[:–—-]+/g, " ").replace(/\s+/g, " ").trim();
  const noLeadingThe = clean.replace(/^the\s+/i, "").trim();
  const compact = clean.replace(/[^a-z0-9]+/gi, " ").trim();
  const variants = [raw, clean, y ? `${clean} ${y}` : "", y ? `${noLeadingThe} ${y}` : "", noLeadingThe, compact].filter(Boolean);
  return Array.from(new Set(variants.map((v) => v.trim()).filter(Boolean)));
}

async function localNetMirrorByTitle({ title = "", year = "", mediaType = "movie", id = "", season = "", episode = "", attempts = [] }) {
  const variants = localSourceTitleVariants(title, year);
  const ids = [];

  for (const q of variants.slice(0, 6)) {
    try {
      const searchPayload = await localNetMirrorSearchRaw(q);
      for (const found of localSourceDeepCollectIds(searchPayload)) {
        if (!ids.includes(found)) ids.push(found);
      }
      if (ids.length) break;
    } catch (error) {
      attempts.push(`netmirror-local search "${q}": ${error.message || "failed"}`);
    }
  }

  if (!ids.length) {
    attempts.push("netmirror-local: search returned no IDs");
    return null;
  }

  for (const netId of ids.slice(0, 16)) {
    try {
      const streamPayload = await localNetMirrorStreamRaw(netId);
      const result = await apiFindPlayableFromPayload({
        payload: streamPayload,
        providerName: "netmirror",
        providerConfig: API_PROVIDERS.netmirror || {},
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen: new Set()
      });
      if (result) return result;
    } catch (error) {
      attempts.push(`netmirror-local ${netId}: ${error.message || "failed"}`);
    }
  }

  return null;
}

// ===== Local /api/tm port from uploaded source =====
const LOCAL_TM_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

function localTmBuildEmbedUrl(url, code) {
  if (url && /^https?:\/\//i.test(url)) return url;
  if (code && String(code).trim()) return `https://vibuxer.com/e/${String(code).trim()}`;
  return null;
}

function localTmDecodePackerPayload(payload, base, count, dict) {
  let output = payload;
  for (let i = count - 1; i >= 0; i -= 1) {
    const token = dict[i];
    if (!token) continue;
    const word = i.toString(base);
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "g"), token);
  }
  return output;
}

function localTmUnpackInlineScript(html) {
  const packerMatch = String(html || "").match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('(.*?)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)\)\)/);
  if (!packerMatch) return null;

  const payload = packerMatch[1];
  const base = Number(packerMatch[2]);
  const count = Number(packerMatch[3]);
  const dict = packerMatch[4].split("|");

  if (!Number.isFinite(base) || !Number.isFinite(count)) return null;
  return localTmDecodePackerPayload(payload, base, count, dict);
}

function localTmSafeParseObjectLiteral(script, variableNames) {
  for (const variableName of variableNames) {
    const re = new RegExp(`var\\s+${variableName}\\s*=\\s*(\\{[\\s\\S]*?\\});`);
    const match = String(script || "").match(re);
    if (!match) continue;
    try { return JSON.parse(match[1]); } catch {}
  }
  return null;
}

function localTmResolveMaybeRelative(url, baseUrl) {
  if (!url) return undefined;
  try { return new URL(url, baseUrl).toString(); } catch { return undefined; }
}

function localTmExtractStreams(script, embedUrl) {
  const linksObj = localTmSafeParseObjectLiteral(script, ["links", "o"]);
  if (!linksObj) return {};

  const hls4 = localTmResolveMaybeRelative(linksObj.hls4 ?? linksObj["1f"], embedUrl);
  const hls3 = localTmResolveMaybeRelative(linksObj.hls3 ?? linksObj["1c"], embedUrl);
  const hls2 = localTmResolveMaybeRelative(linksObj.hls2 ?? linksObj["1m"], embedUrl);

  return { hls4, hls3, hls2, primary: hls4 ?? hls3 ?? hls2, fallback1: hls3 ?? hls2, fallback2: hls2 };
}

async function localTmExtract({ url = "", code = "", check = "0" }) {
  const embedUrl = localTmBuildEmbedUrl(url, code);
  if (!embedUrl) throw new Error("Pass either url or code");

  const response = await fetch(embedUrl, {
    method: "GET",
    headers: {
      "user-agent": LOCAL_TM_USER_AGENT,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "referer": "https://vibuxer.com/"
    },
    redirect: "follow",
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Failed to fetch embed page: ${response.status}`);

  const html = await response.text();
  const unpackedScript = localTmUnpackInlineScript(html);
  if (!unpackedScript) throw new Error("Packed player script not found");

  const streams = localTmExtractStreams(unpackedScript, embedUrl);
  const streamUrl = streams.hls4 || streams.hls3 || streams.hls2;
  if (!streamUrl) throw new Error("No stream URLs found in player script");

  return { success: true, embedUrl, streamUrl, streams, checkAlive: false };
}

// ===== Local TheMovie partial port from uploaded source =====
const LOCAL_THEMOVIE_PLAY_COOKIE =
  'mb_token=%22eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEzMzI1MTYyOTA2MjM4NTEyMDgsImF0cCI6MywiZXh0IjoiMTc2OTU3NDU3NyIsImV4cCI6MTc3NzM1MDU3NywiaWF0IjoxNzY5NTc0Mjc3fQ.Gc4HmKDugVKcWSGoxtCqBTWdZix5dvRpp_22_Z7-7Vk%22; i18n_lang=en';

function localTheMovieNormalizeTitle(title) {
  return String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function localTheMovieReadAttr(attrText = "", name = "") {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = String(attrText || "").match(re);
  return match ? match[1] : "";
}

function localTheMovieStripHtml(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localTheMovieExtractCards(html, baseUrl) {
  const results = [];
  const seen = new Set();
  const source = String(html || "");

  // This mirrors the uploaded source selector:
  // $('a.card[href^="/moviesDetail/"]')
  // but without cheerio. It is order-independent, so it works if href comes
  // before class or class comes before href.
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(source))) {
    const attrs = match[1] || "";
    const block = match[2] || "";
    const className = localTheMovieReadAttr(attrs, "class");
    const href = localTheMovieReadAttr(attrs, "href");

    if (!/\bcard\b/i.test(className)) continue;
    if (!href || !/^\/?moviesDetail\//i.test(href.replace(/^https?:\/\/[^/]+/i, ""))) continue;

    const titleTag =
      block.match(/<h2\b([^>]*)class=["'][^"']*\bcard-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) ||
      block.match(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/i);

    const titleAttr = titleTag ? localTheMovieReadAttr(titleTag[1], "title") : "";
    const title = (titleAttr || localTheMovieStripHtml(titleTag ? titleTag[2] : "") || localTheMovieReadAttr(attrs, "title")).trim();

    let imageUrl = "";
    const imgMatch = block.match(/<img\b([^>]*)>/i);
    if (imgMatch) {
      imageUrl = localTheMovieReadAttr(imgMatch[1], "src") || localTheMovieReadAttr(imgMatch[1], "data-src") || "";
    }

    const ratingMatch = block.match(/<span\b[^>]*class=["'][^"']*\brate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const rating = ratingMatch ? localTheMovieStripHtml(ratingMatch[1]) : "";

    if (title && href) {
      const fullUrl = href.startsWith("http") ? href : new URL(href.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);

      results.push({
        title,
        href,
        fullUrl,
        imageUrl,
        rating
      });
    }
  }

  // Fallback: if site changed class names but still has moviesDetail links,
  // collect those links so details can still run.
  if (!results.length) {
    const linkRegex = /href=["']([^"']*\/moviesDetail\/[^"']+)["'][\s\S]{0,900}?/gi;
    let m;
    while ((m = linkRegex.exec(source))) {
      const href = m[1];
      const around = source.slice(Math.max(0, m.index - 700), Math.min(source.length, m.index + 1400));
      const title =
        (around.match(/<h2[^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/h2>/i)?.[1]) ||
        localTheMovieStripHtml(around.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "") ||
        localTheMovieStripHtml(around.match(/title=["']([^"']+)["']/i)?.[1] || "");

      if (!title) continue;
      const fullUrl = href.startsWith("http") ? href : new URL(href.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      results.push({ title, href, fullUrl, imageUrl: "", rating: "" });
    }
  }

  return results;
}

async function localTheMovieSearchRaw(query) {
  const baseUrl = await localSourceGetBaseUrl("moviebox");
  const searchUrlObj = new URL("newWeb/searchResult", baseUrl);
  searchUrlObj.searchParams.set("keyword", query);

  const response = await fetch(searchUrlObj.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Ch-Ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Brave\";v=\"144\"",
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": "\"Android\"",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Gpc": "1"
    },
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`TheMovie search failed: ${response.status}`);
  const html = await response.text();

  return {
    success: true,
    query,
    baseUrl,
    searchUrl: searchUrlObj.toString(),
    totalResults: localTheMovieExtractCards(html, baseUrl).length,
    results: localTheMovieExtractCards(html, baseUrl)
  };
}

function localTheMovieBuildPlayApiUrl(subjectId, season, episode, detailPath) {
  const playUrl = new URL("https://themoviebox.org/wefeed-h5api-bff/subject/play");
  playUrl.searchParams.set("subjectId", subjectId);
  playUrl.searchParams.set("se", String(season));
  playUrl.searchParams.set("ep", String(episode));
  playUrl.searchParams.set("detailPath", detailPath);
  return playUrl.toString();
}

function localTheMovieResolveNuxt(html) {
  const match = String(html || "").match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let raw;
  try { raw = JSON.parse(match[1]); } catch { return null; }

  const payloadIdx = raw.findIndex((item) => item && typeof item === "object" && !Array.isArray(item) && "subject" in item && "resource" in item && "stars" in item);
  if (payloadIdx === -1) return null;

  const cache = new Map();
  function r(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) return undefined;
    if (cache.has(idx)) return cache.get(idx);

    const v = raw[idx];
    if (v === null || v === undefined || typeof v !== "object") {
      cache.set(idx, v);
      return v;
    }

    if (Array.isArray(v)) {
      if (v[0] === "ShallowReactive" || v[0] === "Reactive") {
        const res = r(v[1]);
        cache.set(idx, res);
        return res;
      }
      if (v[0] === "Set") {
        const res = v.slice(1).map((x) => typeof x === "number" ? r(x) : x);
        cache.set(idx, res);
        return res;
      }
      const res = [];
      cache.set(idx, res);
      v.forEach((x) => res.push(typeof x === "number" ? r(x) : x));
      return res;
    }

    const res = {};
    cache.set(idx, res);
    for (const [k, val] of Object.entries(v)) res[k] = typeof val === "number" ? r(val) : val;
    return res;
  }

  const payload = r(payloadIdx);
  if (!payload || !payload.subject) return null;

  const subject = payload.subject || {};
  const resource = payload.resource || {};
  const subjectId = subject.subjectId;
  const detailPath = subject.detailPath;

  const seasons = [];
  if (resource.seasons && Array.isArray(resource.seasons)) {
    for (const s of resource.seasons) {
      const seasonNumber = s.se ?? 0;
      const totalEpisodes = s.maxEp ?? 0;
      const episodeStart = seasonNumber > 0 ? 1 : 0;
      const episodeEnd = totalEpisodes > 0 ? totalEpisodes : episodeStart;
      for (let ep = episodeStart; ep <= episodeEnd; ep += 1) {
        seasons.push({
          season: seasonNumber,
          episode: ep,
          episodes: totalEpisodes,
          playApiUrl: subjectId && detailPath ? localTheMovieBuildPlayApiUrl(subjectId, seasonNumber, ep, detailPath) : undefined
        });
      }
    }
  }

  return {
    subjectId,
    subjectType: subject.subjectType,
    title: subject.title,
    description: subject.description,
    releaseDate: subject.releaseDate,
    detailPath,
    source: resource.source,
    seasons,
    dubs: Array.isArray(subject.dubs) ? subject.dubs.map((d) => ({ name: d.lanName, code: d.lanCode, subjectId: d.subjectId, detailPath: d.detailPath })) : [],
    subtitles: subject.subtitles
  };
}

async function localTheMovieDetailsAndPlay(inputUrl, customSeason = "", customEpisode = "") {
  const parsedUrl = new URL(inputUrl);
  const pageRes = await fetch(inputUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cookie": LOCAL_THEMOVIE_PLAY_COOKIE,
      "Referer": "https://themoviebox.org/"
    },
    cache: "no-store"
  });

  if (!pageRes.ok) throw new Error(`TheMovie detail fetch failed: ${pageRes.status}`);
  const html = await pageRes.text();
  const meta = localTheMovieResolveNuxt(html);
  if (!meta) throw new Error("Could not parse TheMovie Nuxt data");

  const slug = meta.detailPath || parsedUrl.pathname.split("/").pop() || "";
  const subjectId = meta.subjectId || parsedUrl.searchParams.get("id");
  const isTV = meta.subjectType === 2 || (meta.seasons && meta.seasons.length && meta.seasons[0].season > 0);
  const finalSeason = customSeason || (isTV ? "1" : "0");
  const finalEpisode = customEpisode || (isTV ? "1" : "0");
  const playApiUrl = localTheMovieBuildPlayApiUrl(String(subjectId), Number(finalSeason), Number(finalEpisode), slug);
  const referer = `https://themoviebox.org/movies/${slug}?id=${subjectId}&type=${parsedUrl.searchParams.get("type") || "/movie/detail"}`;

  const playRes = await fetch(playApiUrl, {
    headers: {
      "Cookie": LOCAL_THEMOVIE_PLAY_COOKIE,
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      "X-Source": "h5",
      "X-Client-Info": '{"timezone":"Asia/Calcutta"}',
      "Referer": referer,
      "Sec-Ch-Ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Brave";v="144"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Gpc": "1"
    },
    cache: "no-store"
  });

  let playData = null;
  if (playRes.ok) {
    try { playData = await playRes.json(); } catch {}
  }

  return {
    success: true,
    meta,
    watchOnline: {
      subjectId,
      season: Number(finalSeason),
      episode: Number(finalEpisode),
      playApiUrl,
      ...(playData && playData.data ? playData.data : {})
    },
    playbackHeaders: { Referer: referer },
    data: playData ? { ...playData, playbackHeaders: { Referer: referer } } : null
  };
}

async function localTheMovieByTitle({ title = "", year = "", mediaType = "movie", id = "", season = "", episode = "", attempts = [] }) {
  const variants = localSourceTitleVariants(title, year);
  let results = [];
  let usedQuery = "";

  for (const q of variants.slice(0, 7)) {
    try {
      const search = await localTheMovieSearchRaw(q);
      const rows = Array.isArray(search.results) ? search.results : [];
      if (rows.length) {
        results = rows;
        usedQuery = q;
        break;
      }
    } catch (error) {
      attempts.push(`themovie-local search "${q}": ${error.message || "failed"}`);
    }
  }

  const normTitle = localTheMovieNormalizeTitle(title);
  const normNoThe = normTitle.replace(/^the\s+/, "");
  const picked =
    results.find((entry) => year && String(entry.title || "").includes(String(year))) ||
    results.find((entry) => entry.title && localTheMovieNormalizeTitle(entry.title).includes(normTitle.slice(0, 8))) ||
    results.find((entry) => entry.title && localTheMovieNormalizeTitle(entry.title).includes(normNoThe.slice(0, 8))) ||
    results[0];

  if (!picked || !picked.fullUrl) {
    attempts.push(`themovie-local: search returned no usable details URL${usedQuery ? ` for ${usedQuery}` : ""}`);
    return null;
  }

  const detail = await localTheMovieDetailsAndPlay(picked.fullUrl, mediaType === "tv" ? season : "", mediaType === "tv" ? episode : "");
  let result = await apiFindPlayableFromPayload({
    payload: detail,
    providerName: "themovie",
    providerConfig: API_PROVIDERS.themovie || {},
    mediaType,
    id,
    season,
    episode,
    attempts,
    depth: 0,
    seen: new Set()
  });

  if (result) return result;

  const urls = apiCollectCandidateUrls(detail);
  for (const url of urls) {
    if (!/vibuxer\.com\/e\//i.test(url)) continue;
    try {
      const tmPayload = await localTmExtract({ url, check: "0" });
      result = await apiFindPlayableFromPayload({
        payload: tmPayload,
        providerName: "tm",
        providerConfig: API_PROVIDERS.tm || {},
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen: new Set()
      });
      if (result) return result;
    } catch (error) {
      attempts.push(`tm-local: ${error.message || "failed"}`);
    }
  }

  const deepResult = await localDeepDigForPlayableUrl({
    seedUrls: urls,
    providerName: "themovie",
    mediaType,
    id,
    season,
    episode,
    attempts,
    seen: new Set(),
    maxDepth: 3
  });
  if (deepResult) return deepResult;

  return null;
}

// ===== Local XPrime port from uploaded ScarperApi-zero app/api/extractors/xprime/route.ts =====
const LOCAL_XPRIME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LOCAL_XPRIME_FALLBACK_BACKEND_BASE = "https://mznxiwqjdiq00239q.space";
const LOCAL_XPRIME_FORCED_PROXY_BASE = "https://xprime.hunternisha55.workers.dev";
const LOCAL_XPRIME_TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const LOCAL_XPRIME_TMDB_BASE_URL = "https://api.themoviedb.org/3";

function localXprimeToPositiveInt(value) {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function localXprimeSha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function localXprimeMaxnumberToTargetHex(maxnumber) {
  const max256 = (BigInt(1) << BigInt(256)) - BigInt(1);
  return (max256 / BigInt(maxnumber + 1)).toString(16).padStart(64, "0");
}

function localXprimeSolveAltchaPow(challenge) {
  const target = localXprimeMaxnumberToTargetHex(challenge.maxnumber);
  const startedAt = Date.now();
  const maxIterations = Math.min(challenge.maxnumber * 10, 2_000_000);

  for (let n = 0; n <= maxIterations; n += 1) {
    const hash = localXprimeSha256Hex(`${challenge.algorithm}:${challenge.challenge}:${challenge.salt}:${n}`);
    if (hash <= target) return { number: n, tookMs: Date.now() - startedAt };
  }

  throw new Error("No PoW solution found within iteration limit");
}

async function localXprimeGenerateAltchaToken(backendBase) {
  try {
    const response = await fetch(`${backendBase}/altcha/challenge`, {
      headers: {
        "User-Agent": LOCAL_XPRIME_USER_AGENT,
        Accept: "application/json,text/plain,*/*"
      },
      cache: "no-store"
    });

    if (!response.ok) return { ok: false, error: `Challenge endpoint failed: ${response.status}` };

    const challenge = await response.json();
    if (!challenge || !challenge.challenge || !challenge.salt || !challenge.signature) {
      return { ok: false, error: "Invalid challenge payload" };
    }

    const solved = localXprimeSolveAltchaPow(challenge);
    const tokenPayload = {
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      maxnumber: challenge.maxnumber,
      number: solved.number,
      salt: challenge.salt,
      signature: challenge.signature,
      took: solved.tookMs
    };

    return {
      ok: true,
      token: Buffer.from(JSON.stringify(tokenPayload)).toString("base64"),
      tookMs: solved.tookMs,
      foundNumber: solved.number
    };
  } catch (error) {
    return { ok: false, error: error.message || "Failed to generate altcha token" };
  }
}

async function localXprimeFetchText(url, accept = "*/*") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": LOCAL_XPRIME_USER_AGENT,
      Accept: accept
    },
    cache: "no-store",
    redirect: "follow"
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

function localXprimeExtractAppEntryUrl(html, pageUrl) {
  const match = String(html || "").match(/(?:import\(|src=["'])([^"']*_app\/immutable\/entry\/app\.[^"']+\.js)/i);
  if (!match || !match[1]) return null;

  const raw = match[1].trim();
  const page = new URL(pageUrl);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("../") || raw.startsWith("./") || raw.startsWith("/")) return new URL(raw, pageUrl).toString();
  if (raw.startsWith("_app/")) return new URL(`/${raw}`, page.origin).toString();
  return new URL(raw, pageUrl).toString();
}

function localXprimeExtractChunkPaths(appBundle) {
  const found = String(appBundle || "").match(/\.\.\/chunks\/[A-Za-z0-9_-]+\.js/g) || [];
  const unique = new Set();
  for (const item of found) unique.add(item.replace("../", "/_app/immutable/"));
  return Array.from(unique);
}

function localXprimeDiscoverBackendBase(chunkText) {
  if (!String(chunkText || "").includes('SERVERS:"/servers"')) return null;
  const match = String(chunkText || "").match(/https?:\/\/[^"']+/);
  return match ? match[0] : null;
}

async function localXprimeDiscoverBackend(watchUrl) {
  const page = await localXprimeFetchText(watchUrl, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  if (!page.ok) return { backendBase: LOCAL_XPRIME_FALLBACK_BACKEND_BASE, appEntryUrl: null, analyzedChunk: null };

  const appEntryUrl = localXprimeExtractAppEntryUrl(page.body, watchUrl);
  if (!appEntryUrl) return { backendBase: LOCAL_XPRIME_FALLBACK_BACKEND_BASE, appEntryUrl: null, analyzedChunk: null };

  const appEntry = await localXprimeFetchText(appEntryUrl);
  if (!appEntry.ok || !appEntry.body) return { backendBase: LOCAL_XPRIME_FALLBACK_BACKEND_BASE, appEntryUrl, analyzedChunk: null };

  const chunkPaths = localXprimeExtractChunkPaths(appEntry.body).slice(0, 30);
  const origin = new URL(watchUrl).origin;

  for (const chunkPath of chunkPaths) {
    const chunkUrl = new URL(chunkPath, origin).toString();
    const chunk = await localXprimeFetchText(chunkUrl);
    if (!chunk.ok || !chunk.body) continue;

    const backend = localXprimeDiscoverBackendBase(chunk.body);
    if (backend) return { backendBase: backend, appEntryUrl, analyzedChunk: chunkUrl };
  }

  return { backendBase: LOCAL_XPRIME_FALLBACK_BACKEND_BASE, appEntryUrl, analyzedChunk: null };
}

async function localXprimeFetchTmdbDetails(tmdbId, mediaTypeHint) {
  if (!LOCAL_XPRIME_TMDB_API_KEY) return null;
  const tryTypes = mediaTypeHint === "tv" ? ["tv", "movie"] : ["movie", "tv"];

  for (const mediaType of tryTypes) {
    const url = `${LOCAL_XPRIME_TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${LOCAL_XPRIME_TMDB_API_KEY}&append_to_response=external_ids`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": LOCAL_XPRIME_USER_AGENT,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) continue;

    const data = await response.json();
    const title = (data.title || data.name || "").trim();
    if (!title) continue;

    const date = data.release_date || data.first_air_date;
    const year = date ? Number(String(date).slice(0, 4)) : undefined;

    return {
      mediaType,
      id: Number(tmdbId),
      title,
      year: Number.isFinite(year) ? year : undefined,
      imdbId: data.external_ids && data.external_ids.imdb_id ? data.external_ids.imdb_id : ""
    };
  }

  return null;
}

async function localXprimeFetchServerList(backendBase) {
  const result = await localXprimeFetchText(`${backendBase}/servers`, "application/json,text/plain,*/*");
  if (!result.ok) return [];
  try {
    const parsed = JSON.parse(result.body);
    return Array.isArray(parsed.servers) ? parsed.servers : [];
  } catch {
    return [];
  }
}

function localXprimeMaybeJsonParse(input) {
  try { return JSON.parse(input); } catch { return null; }
}

function localXprimeDecodeMaybeBase64(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed || trimmed.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return null;
  try { return Buffer.from(trimmed, "base64").toString("utf8"); } catch { return null; }
}

function localXprimeParseServerPayload(rawText) {
  const direct = localXprimeMaybeJsonParse(rawText);
  if (direct !== null) return direct;

  const unescaped = String(rawText || "").replace(/\\\//g, "/");
  const unescapedParsed = localXprimeMaybeJsonParse(unescaped);
  if (unescapedParsed !== null) return unescapedParsed;

  const decoded = localXprimeDecodeMaybeBase64(rawText);
  if (decoded) {
    const decodedParsed = localXprimeMaybeJsonParse(decoded);
    if (decodedParsed !== null) return decodedParsed;
  }

  return { raw: rawText };
}

function localXprimeIsLikelyStreamUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  const lower = String(url || "").toLowerCase();
  if (/\.(vtt|srt|ass|ssa|sub)(\?|$)/i.test(lower)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ttf|ico)(\?|$)/i.test(lower)) return false;
  return true;
}

function localXprimeNormalizeStreamUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) {
      const forced = new URL(LOCAL_XPRIME_FORCED_PROXY_BASE);
      const rewritten = new URL(forced.toString());
      rewritten.pathname = parsed.pathname || "/";
      rewritten.search = parsed.search;
      return rewritten.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function localXprimeExtractUrlsDeep(value, out) {
  if (!value) return;

  if (typeof value === "string") {
    const normalized = value.trim().replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    if (/^https?:\/\//i.test(normalized)) out.add(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) localXprimeExtractUrlsDeep(item, out);
    return;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value)) localXprimeExtractUrlsDeep(nested, out);
  }
}

function localXprimePayloadError(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  const error =
    (typeof parsed.error === "string" && parsed.error) ||
    (typeof parsed.message === "string" && parsed.message) ||
    (typeof parsed.status === "string" && parsed.status === "error" ? "status:error" : "");
  return error || "";
}

function localXprimeBuildServerRequestUrl(backendBase, serverName, tmdb, watch, token) {
  const params = new URLSearchParams();
  if (tmdb.title) params.set("name", tmdb.title);
  if (tmdb.year) params.set("year", String(tmdb.year));
  params.set("id", String(watch.tmdbId));
  if (tmdb.imdbId) params.set("imdb", tmdb.imdbId);
  if (watch.season) params.set("season", String(watch.season));
  if (watch.episode) params.set("episode", String(watch.episode));
  if (token) params.set("altcha", token);
  return `${backendBase}/${serverName}?${params.toString()}`;
}

function localXprimeLooksLikeVerificationBlock(status, rawText, parsed) {
  if (status === 403) return true;
  const blob = [rawText, JSON.stringify(parsed)].filter(Boolean).join(" ").toLowerCase();
  return blob.includes("verification token") || blob.includes("turnstile");
}

async function localXprimeProbeServer(backendBase, serverName, tmdb, watch, token) {
  const requestUrl = localXprimeBuildServerRequestUrl(backendBase, serverName, tmdb, watch, token);
  const response = await localXprimeFetchText(requestUrl, "application/json,text/plain,*/*");
  const parsed = localXprimeParseServerPayload(response.body);

  const urlSet = new Set();
  localXprimeExtractUrlsDeep(parsed, urlSet);

  const streams = Array.from(new Set(
    Array.from(urlSet)
      .filter((url) => localXprimeIsLikelyStreamUrl(url))
      .map((url) => localXprimeNormalizeStreamUrl(url))
  ));

  return {
    name: serverName,
    status: response.status,
    ok: response.ok && streams.length > 0,
    requestUrl,
    requiresVerification: localXprimeLooksLikeVerificationBlock(response.status, response.body, parsed),
    error: localXprimePayloadError(parsed),
    streams
  };
}

async function localXprimeGetStreams({ tmdbId = "", mediaType = "movie", season = "", episode = "", token = "" }) {
  const idNum = localXprimeToPositiveInt(String(tmdbId));
  if (!idNum) throw new Error("Invalid or missing TMDB id");

  const seasonNum = localXprimeToPositiveInt(String(season || ""));
  const episodeNum = localXprimeToPositiveInt(String(episode || ""));
  if ((seasonNum && !episodeNum) || (!seasonNum && episodeNum)) {
    throw new Error("Both season and episode are required for series requests");
  }

  const watch = {
    watchUrl: seasonNum && episodeNum
      ? `https://xprime.su/watch/${idNum}/${seasonNum}/${episodeNum}`
      : `https://xprime.su/watch/${idNum}`,
    tmdbId: idNum,
    season: seasonNum,
    episode: episodeNum,
    mediaTypeHint: seasonNum && episodeNum ? "tv" : mediaType
  };

  const backend = await localXprimeDiscoverBackend(watch.watchUrl);
  const tmdbInfo = await localXprimeFetchTmdbDetails(watch.tmdbId, watch.mediaTypeHint);
  if (!tmdbInfo) throw new Error("Could not resolve TMDB metadata for XPrime");

  const servers = await localXprimeFetchServerList(backend.backendBase);
  const activeServers = servers.filter((s) => (s.status || "ok").toLowerCase() === "ok");
  const probeTargets = (activeServers.length ? activeServers : [{ name: "primenet" }]).map((s) => s.name);

  const probeResults = [];
  const verificationServers = new Set();

  for (const serverName of probeTargets) {
    try {
      const result = await localXprimeProbeServer(backend.backendBase, serverName, tmdbInfo, watch, token || "");
      probeResults.push(result);
      if (result.requiresVerification && !token) verificationServers.add(serverName);
    } catch (error) {
      probeResults.push({
        name: serverName,
        status: 0,
        ok: false,
        requestUrl: localXprimeBuildServerRequestUrl(backend.backendBase, serverName, tmdbInfo, watch, token || ""),
        requiresVerification: false,
        error: error.message || "Probe failed",
        streams: []
      });
    }
  }

  let autoTokenResult = null;
  if (!token && verificationServers.size > 0) {
    autoTokenResult = await localXprimeGenerateAltchaToken(backend.backendBase);
    if (autoTokenResult.ok && autoTokenResult.token) {
      for (const serverName of verificationServers) {
        try {
          const retried = await localXprimeProbeServer(backend.backendBase, serverName, tmdbInfo, watch, autoTokenResult.token);
          const idx = probeResults.findIndex((item) => item.name === serverName);
          if (idx >= 0) probeResults[idx] = retried;
          else probeResults.push(retried);
        } catch {}
      }
    }
  }

  const allStreamsSet = new Set();
  for (const row of probeResults) {
    for (const stream of row.streams || []) allStreamsSet.add(stream);
  }

  const streams = Array.from(allStreamsSet).map((url, idx) => ({
    name: `XPrime ${idx + 1}`,
    quality: apiIsM3u8Url(url) ? "HLS" : "",
    url,
    headers: {
      "User-Agent": LOCAL_XPRIME_USER_AGENT,
      "Referer": watch.watchUrl
    },
    provider: "xprime",
    format: apiIsM3u8Url(url) ? "m3u8" : ""
  }));

  return {
    success: streams.length > 0,
    provider: "xprime-local",
    tmdbId: String(tmdbId),
    mediaType: tmdbInfo.mediaType || mediaType,
    watch,
    backend,
    autoToken: autoTokenResult ? { ok: autoTokenResult.ok, error: autoTokenResult.error || "", tookMs: autoTokenResult.tookMs || 0 } : null,
    serversTried: probeResults.length,
    streamsFound: streams.length,
    streams,
    serverResults: probeResults.filter((p) => (p.streams || []).length > 0)
  };
}

// ===== Local deep source-code URL extractor =====

function localDeepLooksUnsafeUrl(url = "") {
  const value = apiClean(url).toLowerCase();
  return !/^https?:\/\//i.test(value) ||
    apiLooksDefinitelyNonMediaUrl(value) ||
    /\/api\/adult\//i.test(value) ||
    /(?:^|\/)(adult|porn|hentai|xhamster|xvideos|spankbang|xxx|eporner)(?:\/|\.|$)/i.test(value);
}


function localDeepPageHeaders(url = "", ref = "") {
  let origin = "";
  try { origin = new URL(url).origin; } catch {}
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": ref || origin || "https://google.com/",
    "Origin": origin || undefined,
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
  };
}

function localDeepExtractHtmlLinks(text = "", baseUrl = "") {
  const urls = [];
  const html = apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(String(text || "")));

  function push(raw) {
    const value = apiClean(apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(raw || "")));
    if (!value) return;
    try {
      if (/^\/\//.test(value)) urls.push(`https:${value}`);
      else urls.push(new URL(value, baseUrl).toString());
    } catch {}
  }

  for (const re of [
    /\b(?:src|href|data-src|data-href|data-file|data-url|data-video|data-stream|data-hls|poster|action)\s*=\s*["']([^"']+)["']/gi,
    /\b(?:file|url|link|source|sources|stream|hls|m3u8|videoUrl|streamUrl|downloadUrl|directUrl|playbackUrl|playlist|manifest|master)\b\s*[:=]\s*["']([^"']+)["']/gi,
    /window\.location(?:\.href|\.replace)?\s*(?:=|\()\s*["']([^"']+)["']/gi,
    /location\.replace\(\s*["']([^"']+)["']/gi,
    /setAttribute\(\s*["'](?:href|src|data-src|data-url)["']\s*,\s*["']([^"']+)["']/gi,
    /content=["'][^"']*url=([^"']+)["']/gi,
    /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<source\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<video\b[^>]*\bsrc=["']([^"']+)["']/gi
  ]) {
    let match;
    while ((match = re.exec(html))) push(match[1]);
  }

  for (const match of html.matchAll(/["']([^"']+\.(?:m3u8|mp4|mkv|webm|mov|avi|ts|m4s)(?:\?[^"']*)?)["']/gi)) push(match[1]);
  for (const nested of apiExtractUrlsFromStringDeep(html)) push(nested);

  return Array.from(new Set(urls.filter((url) => !localDeepLooksUnsafeUrl(url))));
}

async function localDeepFetchPagePayload(url = "", ref = "", attempts = []) {
  if (localDeepLooksUnsafeUrl(url)) return null;

  const response = await fetch(url, {
    method: "GET",
    headers: localDeepPageHeaders(url, ref),
    redirect: "follow",
    cache: "no-store"
  });

  const contentType = response.headers.get("content-type") || "";
  const finalUrl = response.url || url;
  const text = await response.text();

  if (!response.ok) {
    attempts.push(`deep-fetch ${response.status}: ${url.slice(0, 100)}`);
  }

  // If the fetched URL/content itself is a playlist, return it as a source and
  // also expose the text so nested segments/variants can be inspected.
  if (isHlsLikeResponse(finalUrl, contentType) || /\.m3u8(?:[?#]|$)/i.test(finalUrl)) {
    return {
      success: true,
      provider: "deep-page",
      finalUrl,
      contentType,
      sources: [{ name: "hls", quality: "", url: finalUrl, headers: {}, format: "m3u8" }],
      text,
      candidateUrls: localDeepExtractHtmlLinks(text, finalUrl)
    };
  }

  if (contentType.includes("application/json") || /^[\s\r\n]*[\[{]/.test(text)) {
    try {
      const json = JSON.parse(text);
      return {
        success: true,
        provider: "deep-json",
        finalUrl,
        contentType,
        raw: json,
        candidateUrls: apiCollectCandidateUrls(json)
      };
    } catch {}
  }

  const candidateUrls = localDeepExtractHtmlLinks(text, finalUrl);
  const sources = apiExtractMediaUrlsFromStringDeep(text).map((mediaUrl) => ({
    name: apiIsM3u8Url(mediaUrl) ? "hls" : "deep-file",
    quality: "",
    url: mediaUrl,
    headers: {},
    format: apiIsM3u8Url(mediaUrl) ? "m3u8" : ""
  }));

  return {
    success: true,
    provider: "deep-html",
    finalUrl,
    contentType,
    sources,
    candidateUrls,
    textSample: text.slice(0, 1200)
  };
}

async function localDeepDigForPlayableUrl({ seedUrls = [], providerName = "", mediaType = "movie", id = "", season = "", episode = "", attempts = [], seen = new Set(), maxDepth = 2 }) {
  const queue = Array.from(new Set((seedUrls || []).map((url) => apiClean(url)).filter(Boolean)));
  const localSeen = seen || new Set();

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const levelCount = queue.length;
    for (let i = 0; i < levelCount; i += 1) {
      const url = queue.shift();
      if (!url || localSeen.has(`deep:${url}`) || localDeepLooksUnsafeUrl(url)) continue;
      localSeen.add(`deep:${url}`);

      try {
        const payload = await localDeepFetchPagePayload(url, "", attempts);
        if (!payload) continue;

        const result = await apiFindPlayableFromPayload({
          payload,
          providerName: providerName || "deep-page",
          providerConfig: API_PROVIDERS[providerName] || {},
          mediaType,
          id,
          season,
          episode,
          attempts,
          depth: maxDepth + 1,
          seen: localSeen
        });

        if (result) return result;

        const nextUrls = Array.from(new Set([
          ...(payload.candidateUrls || []),
          ...apiCollectCandidateUrls(payload)
        ]));

        for (const nextUrl of nextUrls) {
          if (!localSeen.has(`deep:${nextUrl}`) && !localDeepLooksUnsafeUrl(nextUrl)) {
            queue.push(nextUrl);
          }
        }
      } catch (error) {
        attempts.push(`deep-dig ${providerName || "url"}: ${error.message || "failed"} for ${url.slice(0, 80)}`);
      }
    }
  }

  return null;
}


function localPackerBaseN(num, base) {
  if (num < base) return num < 36 ? num.toString(36) : String.fromCharCode(num + 29);
  return localPackerBaseN(Math.floor(num / base), base) + localPackerBaseN(num % base, base);
}

function localDeanEdwardsUnpack(packedCode = "") {
  try {
    const match = String(packedCode || "").match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.*?)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s);
    if (!match) return "";
    let payload = match[1];
    const base = parseInt(match[2], 10);
    let count = parseInt(match[3], 10);
    const keywords = match[4].split("|");
    while (count--) {
      if (keywords[count]) {
        payload = payload.replace(new RegExp("\\b" + localPackerBaseN(count, base) + "\\b", "g"), keywords[count]);
      }
    }
    return payload;
  } catch {
    return "";
  }
}

function localExtractM3u8FromScript(code = "") {
  const text = String(code || "");
  const patterns = [
    /(?:var|let|const)\s+q\s*=\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
    /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
    /url\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return apiHtmlEntityDecodeLite(match[1]);
  }
  return "";
}

async function localAnimePaheStreamExtract(url = "") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://animepahe.si/",
      "Cookie": "__ddgid_=GIsAbopI81hATr14; res=720; aud=jpn; av1=0"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`AnimePahe stream fetch failed: ${response.status}`);
  const html = await response.text();
  const unpacked = localDeanEdwardsUnpack(html);
  const m3u8 = localExtractM3u8FromScript(unpacked) || localExtractM3u8FromScript(html);
  return {
    success: Boolean(m3u8),
    provider: "animepahe-local",
    streamUrl: m3u8,
    sources: m3u8 ? [{ name: "animepahe hls", quality: "", url: m3u8, format: "m3u8", headers: { Referer: "https://kwik.cx/", Origin: "https://kwik.cx" } }] : [],
    htmlUrls: apiExtractUrlsFromStringDeep(html),
    unpackedUrls: apiExtractUrlsFromStringDeep(unpacked)
  };
}

async function localTrySourceCodeExtractorForUrl({ url = "", providerName = "", mediaType = "movie", id = "", season = "", episode = "", attempts = [], seen = new Set() }) {
  const value = apiClean(url);
  const lower = value.toLowerCase();
  if (!value || seen.has(value)) return null;
  seen.add(value);

  try {
    if (/vibuxer\.com\/e\//i.test(lower)) {
      const payload = await localTmExtract({ url: value, check: "0" });
      return await apiFindPlayableFromPayload({
        payload,
        providerName: "tm",
        providerConfig: API_PROVIDERS.tm || {},
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen
      });
    }

    if (/xprime\.su\/watch\/\d+/i.test(lower)) {
      const parts = new URL(value).pathname.split("/").filter(Boolean);
      const tmdbId = parts[1] || id;
      const s = parts[2] || season;
      const e = parts[3] || episode;
      const payload = await localXprimeGetStreams({ tmdbId, mediaType: s && e ? "tv" : mediaType, season: s, episode: e });
      return await apiFindPlayableFromPayload({
        payload,
        providerName: "xprime-local",
        providerConfig: API_PROVIDERS.xprime || {},
        mediaType,
        id: tmdbId,
        season: s || season,
        episode: e || episode,
        attempts,
        depth: 0,
        seen
      });
    }

    if (/themoviebox\.org\/moviesdetail\//i.test(lower)) {
      const payload = await localTheMovieDetailsAndPlay(value, mediaType === "tv" ? season : "", mediaType === "tv" ? episode : "");
      return await apiFindPlayableFromPayload({
        payload,
        providerName: "themovie",
        providerConfig: API_PROVIDERS.themovie || {},
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen
      });
    }

    if (/animepahe\./i.test(lower) && (/\/play\//i.test(lower) || /kwik\./i.test(lower))) {
      const payload = await localAnimePaheStreamExtract(value);
      return await apiFindPlayableFromPayload({
        payload,
        providerName: "animepahe",
        providerConfig: API_PROVIDERS.animepahe || {},
        mediaType,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen
      });
    }

    // Last local source-code style pass: fetch the page and recursively scan
    // HTML/JS/JSON for actual media URLs, iframe URLs, redirect URLs, and packed
    // player snippets.
    if (apiCanBeIntermediateExtractorUrl(value) || /player|embed|watch|stream|source|video|movie|detail|download|link/i.test(lower)) {
      return await localDeepDigForPlayableUrl({
        seedUrls: [value],
        providerName,
        mediaType,
        id,
        season,
        episode,
        attempts,
        seen,
        maxDepth: 2
      });
    }
  } catch (error) {
    attempts.push(`local-extractor ${providerName || "url"}: ${error.message || "failed"} for ${value.slice(0, 80)}`);
  }

  return null;
}


// ===== Generic local URL providers from ScarperApi-main non-adult source routes =====
const LOCAL_DOWNLOAD_SITE_PROVIDERS = [
  { id: "4khdhub", label: "4kHDHub", baseKeys: ["4khdhub"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "desiremovies", label: "DesireMovies", baseKeys: ["desiremovies"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "drive", label: "Drive", baseKeys: ["drive"], searchPaths: ["/?s={q}", "?s={q}", "/search/{q}"] },
  { id: "hdhub4u", label: "HDHub4U", baseKeys: ["hdhub4u", "hdhub"], searchPaths: ["/?s={q}", "?s={q}", "/search/{q}"] },
  { id: "kmmovies", label: "KMMovies", baseKeys: ["KMMovies", "kmmovies"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "movies4u", label: "Movies4u", baseKeys: ["movies4u"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "moviesmod", label: "Moviesmod", baseKeys: ["Moviesmod", "mod"], searchPaths: ["/search/{q}", "search/{q}", "/?s={q}"] },
  { id: "uhdmovies", label: "UhdMovies", baseKeys: ["UhdMovies", "uhdmovies"], searchPaths: ["/page/1/?s={q}", "/?s={q}", "?s={q}"] },
  { id: "vega", label: "Vega", baseKeys: ["Vega", "vega"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "zeefliz", label: "Zeefliz", baseKeys: ["zeefliz"], searchPaths: ["/?s={q}", "?s={q}"] },
  { id: "zinkmovies", label: "ZinkMovies", baseKeys: ["zinkmovies"], searchPaths: ["/?s={q}", "?s={q}"] }
];

function localDownloadSiteText(value = "") {
  return String(value || "").toLowerCase().replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\b(?:the|a|an|movie|film|download|watch|online|full|hd|bluray|webdl|webrip|dual|audio|hindi|english|season|episode)\b/g, " ").replace(/\s+/g, " ").trim();
}

function localDownloadSiteScore(entry = {}, title = "", year = "") {
  const titleText = localDownloadSiteText(entry.title || "");
  const hrefText = localDownloadSiteText(entry.href || "");
  const aroundText = localDownloadSiteText(entry.around || "");
  const titleHref = `${titleText} ${hrefText}`;
  const target = localDownloadSiteText(title);
  const targetCompact = target.replace(/\s+/g, "");
  const titleHrefCompact = titleHref.replace(/\s+/g, "");

  let score = 0;

  // Main matching should come from the link title/href, not nearby page text.
  // Nearby text made homepages like MoviesDrives.CV and Telegram look like winners.
  if (target && titleHref.includes(target)) score += 100;
  if (target && titleHrefCompact.includes(targetCompact)) score += 80;

  for (const word of target.split(/\s+/).filter((w) => w.length > 2)) {
    if (titleHref.includes(word)) score += 10;
    else if (aroundText.includes(word)) score += 1;
  }

  if (year && `${entry.title || ""} ${entry.href || ""}`.includes(String(year))) score += 25;
  if (year && !`${entry.title || ""} ${entry.href || ""}`.includes(String(year))) score -= 12;

  if (/download|watch|play|stream|file|link|server|cloud|drive|episode|movie/i.test(`${entry.title || ""} ${entry.href || ""}`)) score += 8;

  // Big penalties for navigation/social/admin/adult/junk pages.
  if (apiLooksDefinitelyNonMediaUrl(entry.href || "")) score -= 80;
  if (/category|genre|tag|author|comment|privacy|contact|dmca|telegram|login|register|lostpassword|how-to-download|report-broken-links/i.test(entry.href || "")) score -= 80;
  if (/^(moviesdrive|telegram logo|join telegram|adult movies|4k uhd movies|hindi|urdu|web-series|music show|musical series|sitcom series)$/i.test(String(entry.title || "").trim())) score -= 90;

  return score;
}


function localDownloadSiteExtractAnchors(html = "", baseUrl = "") {
  const source = String(html || "");
  const anchors = [];
  const seen = new Set();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(source))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const hrefRaw = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (!hrefRaw || /^#|^javascript:|^mailto:/i.test(hrefRaw)) continue;
    let href = "";
    try {
      const cleanHref = apiHtmlEntityDecodeLite(apiUnescapeJsStringLite(hrefRaw));
      href = /^\/\//.test(cleanHref) ? `https:${cleanHref}` : new URL(cleanHref, baseUrl).toString();
    } catch { continue; }
    if (seen.has(href) || localDeepLooksUnsafeUrl(href) || apiLooksLikeImage(href)) continue;
    seen.add(href);
    const titleAttr = attrs.match(/\b(?:title|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const imgAlt = body.match(/<img\b[^>]*\b(?:alt|title)\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const bodyText = String(body).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const around = source.slice(Math.max(0, match.index - 700), Math.min(source.length, match.index + 1400)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    anchors.push({ href, title: apiHtmlEntityDecodeLite(titleAttr || imgAlt || bodyText || href), around });
  }
  return anchors;
}

function localDownloadSiteSearchUrl(baseUrl = "", searchPath = "", query = "") {
  const safeQ = encodeURIComponent(query);
  const plusQ = query.trim().replace(/\s+/g, "+");
  try { return new URL(searchPath.replace("{q}", safeQ).replace("{q+}", plusQ), `${baseUrl.replace(/\/$/, "")}/`).toString(); } catch { return ""; }
}

async function localDownloadSiteFetch(url = "", referer = "") {
  const response = await fetch(url, {
    method: "GET", redirect: "follow", cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": referer || url,
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType: response.headers.get("content-type") || "", text: await response.text() };
}

async function localDownloadSiteBaseUrls(config = {}) {
  const urls = [];
  for (const key of config.baseKeys || []) {
    try { const base = await localSourceGetBaseUrl(key); if (base && !urls.includes(base)) urls.push(base); } catch {}
  }
  const envName = `PROVIDER_${String(config.id || "").toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BASE_URL`;
  const envBase = process.env[envName] || "";
  if (envBase && !urls.includes(envBase)) urls.unshift(envBase.replace(/\/$/, ""));
  return urls;
}

async function localDownloadSiteSearch(config = {}, title = "", year = "", attempts = []) {
  const variants = localSourceTitleVariants(title, year);
  const bases = await localDownloadSiteBaseUrls(config);
  const all = [];
  if (!bases.length) { attempts.push(`${config.id}: no base URL from providers.json/env`); return []; }
  for (const base of bases.slice(0, 3)) {
    for (const q of variants.slice(0, 5)) {
      for (const path of config.searchPaths || ["/?s={q}", "?s={q}"]) {
        const searchUrl = localDownloadSiteSearchUrl(base, path, q);
        if (!searchUrl) continue;
        try {
          const page = await localDownloadSiteFetch(searchUrl, base);
          if (!page.ok) { attempts.push(`${config.id} search ${page.status}: ${searchUrl.slice(0, 100)}`); continue; }
          const rows = localDownloadSiteExtractAnchors(page.text, page.finalUrl).map((entry) => ({ ...entry, provider: config.id, searchUrl, score: localDownloadSiteScore(entry, title, year) })).filter((entry) => entry.score > 10).sort((a, b) => b.score - a.score);
          for (const row of rows.slice(0, 12)) if (!all.some((x) => x.href === row.href)) all.push(row);
          if (rows.length) break;
        } catch (error) { attempts.push(`${config.id} search "${q}": ${error.message || "failed"}`); }
      }
      if (all.length) break;
    }
    if (all.length) break;
  }
  return all.sort((a, b) => b.score - a.score);
}

async function localDownloadSiteDetailPayload(config = {}, detailUrl = "", attempts = []) {
  const page = await localDownloadSiteFetch(detailUrl);
  if (!page.ok) attempts.push(`${config.id} detail ${page.status}: ${detailUrl.slice(0, 100)}`);

  const anchors = localDownloadSiteExtractAnchors(page.text, page.finalUrl);
  const candidateUrls = Array.from(new Set([
    page.finalUrl,
    ...anchors.map((a) => a.href),
    ...localDeepExtractHtmlLinks(page.text, page.finalUrl),
    ...apiExtractUrlsFromStringDeep(page.text)
  ].filter(Boolean)));

  // Actual media goes to sources. Intermediate pages go to candidateUrls so the
  // local source-code extractors can follow m4ulinks/magiclinks/zinkcloud/nexdrive/etc.
  const mediaUrls = candidateUrls.filter((url) => apiLooksPlayable(url, { url }));
  const intermediateUrls = candidateUrls.filter((url) => {
    const lower = String(url || "").toLowerCase();
    if (apiLooksDefinitelyNonMediaUrl(lower)) return false;
    return apiCanBeIntermediateExtractorUrl(lower) ||
      /m4uplay|m4ulinks|magiclinks|modpro|zinkcloud|nexdrive|nextdrive|hubcloud|hub-cloud|gdflix|vcloud|v-cloud|tech\.unblockedgames|cloud\.unblockedgames|gyaniguru|gadget|gadgetsworld|hrujo|play\//i.test(lower);
  });

  const importantUrls = Array.from(new Set([...mediaUrls, ...intermediateUrls]));

  return {
    success: true,
    provider: `${config.id}-local`,
    finalUrl: page.finalUrl,
    candidateUrls: importantUrls.slice(0, 160),
    allUrls: candidateUrls.filter((url) => !apiLooksDefinitelyNonMediaUrl(url)).slice(0, 260),
    sources: mediaUrls.map((url) => ({
      name: apiIsM3u8Url(url) ? "hls" : "media-file",
      quality: "",
      url,
      headers: {},
      format: apiIsM3u8Url(url) ? "m3u8" : ""
    })),
    textSample: page.text.slice(0, 1200)
  };
}


async function localDownloadSitesByTitle({ title = "", year = "", mediaType = "movie", id = "", season = "", episode = "", attempts = [], providerIds = [] }) {
  const configs = LOCAL_DOWNLOAD_SITE_PROVIDERS.filter((config) => !providerIds.length || providerIds.includes(config.id));
  const providerSummaries = [];
  for (const config of configs) {
    const searchResults = await localDownloadSiteSearch(config, title, year, attempts);
    providerSummaries.push({ provider: config.id, resultCount: searchResults.length, top: searchResults.slice(0, 5).map((r) => ({ title: r.title, href: r.href, score: r.score })) });
    for (const result of searchResults.slice(0, 4)) {
      try {
        const payload = await localDownloadSiteDetailPayload(config, result.href, attempts);
        const playable = await apiFindPlayableFromPayload({ payload, providerName: `${config.id}-local`, providerConfig: {}, mediaType, id, season, episode, attempts, depth: 0, seen: new Set() });
        if (playable) { playable.searchProvider = config.id; playable.searchTitle = result.title; playable.searchUrl = result.href; playable.localProviderSummaries = providerSummaries; return playable; }
      } catch (error) { attempts.push(`${config.id} detail/extract: ${error.message || "failed"} for ${result.href.slice(0, 80)}`); }
    }
  }
  return { status: "not_found", providerSummaries };
}

async function localDownloadSitesDebug({ title = "", year = "", mediaType = "movie", id = "", season = "", episode = "", providerIds = [] }) {
  const attempts = [];
  const rows = [];
  let winner = null;
  const configs = LOCAL_DOWNLOAD_SITE_PROVIDERS.filter((config) => !providerIds.length || providerIds.includes(config.id));
  for (const config of configs) {
    const startedAt = Date.now();
    try {
      const searchResults = await localDownloadSiteSearch(config, title, year, attempts);
      const providerRow = { provider: config.id, ms: Date.now() - startedAt, resultCount: searchResults.length, topResults: searchResults.slice(0, 8).map((r) => ({ title: r.title, href: r.href, score: r.score })), details: [] };
      for (const result of searchResults.slice(0, 3)) {
        const detailStarted = Date.now();
        try {
          const payload = await localDownloadSiteDetailPayload(config, result.href, attempts);
          const urls = Array.from(new Set([...(payload.candidateUrls || []), ...(payload.allUrls || [])]));
          const playable = await apiFindPlayableFromPayload({ payload, providerName: `${config.id}-local`, providerConfig: {}, mediaType, id, season, episode, attempts, depth: 0, seen: new Set() });
          providerRow.details.push({ title: result.title, url: result.href, ms: Date.now() - detailStarted, ok: Boolean(playable), playable: playable || null, candidateUrlCount: urls.length, candidateUrls: urls.slice(0, 40) });
          if (!winner && playable) winner = playable;
        } catch (error) { providerRow.details.push({ title: result.title, url: result.href, ms: Date.now() - detailStarted, ok: false, error: error.message || "failed" }); }
      }
      rows.push(providerRow);
    } catch (error) { rows.push({ provider: config.id, ms: Date.now() - startedAt, error: error.message || "failed" }); }
  }
  return { attempts, rows, winner };
}



// ===== Local Consumet bridge from uploaded api.consumet.org source =====
// The uploaded Consumet API routes are Fastify+TypeScript wrappers around
// @consumet/extensions. For this Express app we call the same extension methods
// directly, server-side only.
let __consumetExtensionsCache = null;
let __consumetModelsCache = null;

function localConsumetExtensions() {
  if (__consumetExtensionsCache) return __consumetExtensionsCache;
  try {
    __consumetExtensionsCache = require("@consumet/extensions");
    return __consumetExtensionsCache;
  } catch (error) {
    throw new Error(`@consumet/extensions not installed: ${error.message || "npm install failed"}`);
  }
}

function localConsumetStreamingServers() {
  if (__consumetModelsCache) return __consumetModelsCache;
  try {
    const models = require("@consumet/extensions/dist/models");
    __consumetModelsCache = Object.values(models.StreamingServers || {}).filter(Boolean);
  } catch {
    __consumetModelsCache = [];
  }
  return __consumetModelsCache;
}

function localConsumetProviderConfig(provider = "") {
  const id = apiClean(provider).toLowerCase();
  const configs = {
    flixhq: {
      id: "flixhq",
      kind: "movie",
      make: () => new (localConsumetExtensions().MOVIES.FlixHQ)(),
      info: (p, id) => p.fetchMediaInfo(id),
      sources: (p, episodeId, mediaId, server) => p.fetchEpisodeSources(episodeId, mediaId, server)
    },
    sflix: {
      id: "sflix",
      kind: "movie",
      make: () => new (localConsumetExtensions().MOVIES.SFlix)(),
      info: (p, id) => p.fetchMediaInfo(id),
      sources: (p, episodeId, mediaId, server) => p.fetchEpisodeSources(episodeId, mediaId, server)
    },
    goku: {
      id: "goku",
      kind: "movie",
      make: () => new (localConsumetExtensions().MOVIES.Goku)(),
      info: (p, id) => p.fetchMediaInfo(id),
      sources: (p, episodeId, mediaId, server) => p.fetchEpisodeSources(episodeId, mediaId, server)
    },
    movieshd: {
      id: "movieshd",
      kind: "movie",
      make: () => new (localConsumetExtensions().MOVIES.MovieHdWatch)(),
      info: (p, id) => p.fetchMediaInfo(id),
      sources: (p, episodeId, mediaId, server) => p.fetchEpisodeSources(episodeId, mediaId, server)
    },
    fmovies: {
      id: "fmovies",
      kind: "movie",
      make: () => new (localConsumetExtensions().MOVIES.Fmovies)(),
      info: (p, id) => p.fetchMediaInfo(id),
      sources: (p, episodeId, mediaId, server) => p.fetchEpisodeSources(episodeId, mediaId, server)
    },
    zoro: {
      id: "zoro",
      kind: "anime",
      make: () => new (localConsumetExtensions().ANIME.Zoro)(process.env.ZORO_URL),
      info: (p, id) => p.fetchAnimeInfo(id),
      sources: (p, episodeId, _mediaId, server) => p.fetchEpisodeSources(episodeId, server)
    },
    gogoanime: {
      id: "gogoanime",
      kind: "anime",
      make: () => new (localConsumetExtensions().ANIME.Gogoanime)(process.env.GOGOANIME_URL),
      info: (p, id) => p.fetchAnimeInfo(id),
      sources: (p, episodeId, _mediaId, server) => p.fetchEpisodeSources(episodeId, server)
    },
    animepahe: {
      id: "animepahe",
      kind: "anime",
      make: () => new (localConsumetExtensions().ANIME.AnimePahe)(),
      info: (p, id) => p.fetchAnimeInfo(id),
      sources: (p, episodeId, _mediaId, server) => p.fetchEpisodeSources(episodeId, server)
    }
  };
  return configs[id] || null;
}

function localConsumetSearchResults(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return apiTopList(payload);
}

function localConsumetTitleScore(entry = {}, title = "", year = "") {
  const hay = `${entry.title || ""} ${entry.name || ""} ${entry.id || ""} ${entry.url || ""} ${entry.releaseDate || ""} ${entry.description || ""}`;
  const target = apiClean(title);
  let score = 0;
  const cleanHay = localDownloadSiteText ? localDownloadSiteText(hay) : hay.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const cleanTarget = localDownloadSiteText ? localDownloadSiteText(target) : target.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (cleanTarget && cleanHay.includes(cleanTarget)) score += 100;
  if (cleanTarget && cleanHay.replace(/\s+/g, "").includes(cleanTarget.replace(/\s+/g, ""))) score += 80;
  for (const word of cleanTarget.split(/\s+/).filter((w) => w.length > 2)) if (cleanHay.includes(word)) score += 8;
  if (year && hay.includes(String(year))) score += 25;
  if (/movie|film/i.test(`${entry.type || ""}`)) score += 8;
  if (/tv|show|series/i.test(`${entry.type || ""}`)) score += 4;
  return score;
}

async function localConsumetSearch(providerInstance, title = "", year = "", attempts = []) {
  const variants = localSourceTitleVariants(title, year);
  const all = [];

  for (const q of variants.slice(0, 5)) {
    try {
      const payload = await providerInstance.search(q, 1);
      const rows = localConsumetSearchResults(payload)
        .map((entry) => ({ ...entry, score: localConsumetTitleScore(entry, title, year) }))
        .filter((entry) => entry.id && entry.score > 8)
        .sort((a, b) => b.score - a.score);

      for (const row of rows.slice(0, 10)) {
        if (!all.some((x) => String(x.id) === String(row.id))) all.push(row);
      }
      if (rows.length) break;
    } catch (error) {
      attempts.push(`consumet search "${q}": ${error.message || "failed"}`);
    }
  }

  return all.sort((a, b) => b.score - a.score);
}

function localConsumetEpisodeCandidates(info = {}, mediaType = "movie", season = "1", episode = "1") {
  const episodes = Array.isArray(info?.episodes) ? info.episodes : [];
  const wantedSeason = Number(season || 1);
  const wantedEpisode = Number(episode || 1);

  const candidates = [];
  function add(ep) {
    const id = apiClean(ep?.id || ep?.episodeId || ep?.url);
    if (!id) return;
    if (!candidates.some((x) => x.id === id)) candidates.push({ id, raw: ep });
  }

  if (mediaType === "tv") {
    for (const ep of episodes) {
      const epSeason = Number(ep.season ?? ep.seasonNumber ?? ep.season_number ?? 1);
      const epNumber = Number(ep.number ?? ep.episode ?? ep.episodeNumber ?? ep.episode_number ?? ep.ep ?? 0);
      if ((epSeason === wantedSeason || !ep.season) && (epNumber === wantedEpisode || String(ep.title || "").match(new RegExp(`\\b${wantedEpisode}\\b`)))) add(ep);
    }
  } else {
    for (const ep of episodes) add(ep);
  }

  if (!candidates.length && apiClean(info?.episodeId)) candidates.push({ id: apiClean(info.episodeId), raw: info });
  if (!candidates.length && apiClean(info?.id) && mediaType === "movie") candidates.push({ id: apiClean(info.id), raw: info });
  return candidates.slice(0, 8);
}

function localConsumetNormalizeSources(payload = {}, providerId = "") {
  const out = [];
  const payloadHeaders = payload?.headers && typeof payload.headers === "object" ? payload.headers : {};

  function add(node = {}, field = "source") {
    if (typeof node === "string") node = { url: node };
    if (!node || typeof node !== "object") return;

    const url = apiClean(node.url || node.file || node.src || node.link || node.m3u8 || node.hls);
    if (!/^https?:\/\//i.test(url)) return;
    if (apiLooksDefinitelyNonMediaUrl(url)) return;

    const isHls = node.isM3U8 === true || node.isM3u8 === true || node.isHls === true || /m3u8|hls/i.test(`${node.quality || ""} ${node.type || ""} ${node.format || ""} ${node.name || ""}`);
    const headers = {
      ...payloadHeaders,
      ...(node.headers && typeof node.headers === "object" ? node.headers : {})
    };

    out.push({
      name: apiFirst(node.name, node.server, node.provider, providerId, field) || `consumet-${providerId}`,
      quality: apiFirst(node.quality, node.resolution, node.type),
      url,
      headers,
      format: apiIsM3u8Url(url) || isHls ? "m3u8" : (apiIsMpdUrl(url) ? "mpd" : ""),
      forceHls: Boolean(isHls && !apiIsAllowedMediaExtensionUrl(url))
    });
  }

  if (Array.isArray(payload?.sources)) payload.sources.forEach((s) => add(s, "sources"));
  if (Array.isArray(payload?.data?.sources)) payload.data.sources.forEach((s) => add(s, "data.sources"));
  if (Array.isArray(payload?.stream)) payload.stream.forEach((s) => add(s, "stream"));
  if (Array.isArray(payload?.streams)) payload.streams.forEach((s) => add(s, "streams"));
  apiWalk(payload, (node) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      if (node.url || node.file || node.src || node.link || node.m3u8 || node.hls) add(node, "deep");
    }
  });

  return apiPreferM3u8Sources(Array.from(new Map(out.map((source) => [source.url, source])).values()));
}

function localConsumetTrySources({ sourcePayload, providerId, mediaType, id, season, episode, attempts }) {
  const sources = localConsumetNormalizeSources(sourcePayload, providerId);
  for (const source of sources) {
    const result = apiSourceToProxyResult({
      source,
      raw: sourcePayload,
      provider: `consumet-${providerId}`,
      type: mediaType,
      id,
      season,
      episode,
      attempts
    });
    if (result) {
      result.normalized = {
        provider: `consumet-${providerId}`,
        id,
        url: "",
        title: "",
        year: "",
        type: mediaType,
        poster: "",
        backdrop: "",
        overview: "",
        formats: [],
        sources
      };
      result.consumetProvider = providerId;
      return result;
    }
  }
  return null;
}

async function localConsumetProviderByTitle({ providerId = "", title = "", year = "", mediaType = "movie", id = "", season = "1", episode = "1", attempts = [] }) {
  if (!CONSUMET_ENABLED) {
    attempts.push("consumet: disabled by CONSUMET_ENABLED=false");
    return null;
  }

  const config = localConsumetProviderConfig(providerId);
  if (!config) {
    attempts.push(`consumet-${providerId}: unknown provider`);
    return null;
  }

  if (config.kind === "anime" && mediaType !== "anime" && !/anime/i.test(String(title || ""))) {
    // Still usable manually with ?provider=consumet-zoro etc, but do not spam anime providers for normal movie titles.
    if (!String(providerId).includes("anime") && !["zoro", "gogoanime"].includes(providerId)) return null;
  }

  const providerInstance = config.make();
  const searchResults = await localConsumetSearch(providerInstance, title, year, attempts);
  const debugRows = [];

  for (const found of searchResults.slice(0, 5)) {
    const row = { id: found.id, title: found.title || found.name || "", score: found.score, ok: false, attempts: [] };
    try {
      const info = await config.info(providerInstance, found.id);
      row.infoTitle = info?.title || info?.name || "";
      const episodes = localConsumetEpisodeCandidates(info, mediaType, season, episode);
      row.episodeCount = Array.isArray(info?.episodes) ? info.episodes.length : 0;
      row.candidateEpisodes = episodes.map((ep) => ({ id: ep.id, title: ep.raw?.title, number: ep.raw?.number, season: ep.raw?.season }));

      const serverValues = [undefined, ...localConsumetStreamingServers(), "vidcloud", "upcloud", "mixdrop", "streamsb", "streamtape", "filemoon", "mp4upload"];
      const seenServers = new Set();

      for (const ep of episodes) {
        for (const serverValue of serverValues) {
          const serverKey = String(serverValue || "default").toLowerCase();
          if (seenServers.has(`${ep.id}:${serverKey}`)) continue;
          seenServers.add(`${ep.id}:${serverKey}`);

          try {
            const sourcePayload = await config.sources(providerInstance, ep.id, info?.id || found.id, serverValue);
            const result = localConsumetTrySources({
              sourcePayload,
              providerId,
              mediaType,
              id,
              season,
              episode,
              attempts
            });
            row.sourceKeys = Object.keys(sourcePayload || {});
            row.ok = Boolean(result);
            if (result) {
              result.consumetSearch = {
                provider: providerId,
                searchTitle: found.title || found.name || "",
                searchId: found.id,
                infoTitle: row.infoTitle,
                episodeId: ep.id,
                server: serverValue || "default"
              };
              return { result, debugRows: [...debugRows, row] };
            }
            row.attempts.push(`${ep.id}:${serverValue || "default"} no playable media`);
          } catch (error) {
            row.attempts.push(`${ep.id}:${serverValue || "default"} ${error.message || "failed"}`);
          }
        }
      }
    } catch (error) {
      row.error = error.message || "failed";
    }
    debugRows.push(row);
  }

  return { result: null, debugRows };
}

function localConsumetProviderIdsFromPreferred(preferred = "") {
  const clean = apiClean(preferred).toLowerCase();
  if (!clean || clean === "consumet") return CONSUMET_PROVIDER_ORDER;
  if (clean.startsWith("consumet-")) return [clean.replace(/^consumet-/, "")];
  return CONSUMET_PROVIDER_ORDER;
}

async function localConsumetByTitle({ title = "", year = "", mediaType = "movie", id = "", season = "1", episode = "1", attempts = [], preferred = "" }) {
  const providerIds = localConsumetProviderIdsFromPreferred(preferred);
  const rows = [];

  for (const providerId of providerIds) {
    const startedAt = Date.now();
    try {
      const probe = await localConsumetProviderByTitle({ providerId, title, year, mediaType, id, season, episode, attempts });
      rows.push({ provider: providerId, ms: Date.now() - startedAt, ok: Boolean(probe?.result), rows: probe?.debugRows || [] });
      if (probe?.result) {
        probe.result.consumetProviderRows = rows;
        return probe.result;
      }
    } catch (error) {
      rows.push({ provider: providerId, ms: Date.now() - startedAt, ok: false, error: error.message || "failed" });
      attempts.push(`consumet-${providerId}: ${error.message || "failed"}`);
    }
  }

  return null;
}

async function localConsumetDebug({ title = "", year = "", mediaType = "movie", id = "", season = "1", episode = "1", provider = "" }) {
  const attempts = [];
  const providerIds = provider ? localConsumetProviderIdsFromPreferred(provider) : CONSUMET_PROVIDER_ORDER;
  const rows = [];
  let winner = null;

  for (const providerId of providerIds) {
    const startedAt = Date.now();
    try {
      const probe = await localConsumetProviderByTitle({ providerId, title, year, mediaType, id, season, episode, attempts });
      const row = { provider: providerId, ms: Date.now() - startedAt, ok: Boolean(probe?.result), result: probe?.result || null, rows: probe?.debugRows || [] };
      rows.push(row);
      if (!winner && probe?.result) winner = probe.result;
    } catch (error) {
      rows.push({ provider: providerId, ms: Date.now() - startedAt, ok: false, error: error.message || "failed" });
      attempts.push(`consumet-${providerId}: ${error.message || "failed"}`);
    }
  }

  return { attempts, rows, winner };
}



// ===== Local VidSrc scraper bridge from uploaded vidsrc-scraper source =====
let __vidsrcBrowserPromise = null;

function localVidSrcNormalizeDomain(domain = "") {
  const clean = String(domain || "").trim().replace(/\/$/, "");
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://${clean}`;
}

function localVidSrcDomains() {
  return Array.from(new Set(VIDSRC_PROVIDER_ORDER.map(localVidSrcNormalizeDomain).filter(Boolean)));
}

function localVidSrcBuildEmbedUrl(domain = "", mediaType = "movie", tmdbId = "", season = "1", episode = "1") {
  const base = localVidSrcNormalizeDomain(domain);
  if (mediaType === "tv") return `${base}/embed/tv?tmdb=${encodeURIComponent(tmdbId)}&season=${encodeURIComponent(season || "1")}&episode=${encodeURIComponent(episode || "1")}`;
  return `${base}/embed/movie/${encodeURIComponent(tmdbId)}`;
}

function localVidSrcIsSubtitleUrl(url = "") {
  return /\.(?:vtt|srt|ass)(?:[?#]|$)/i.test(String(url || ""));
}

function localVidSrcLoadChromium() {
  if (!VIDSRC_ENABLED) {
    throw new Error("VIDSRC_ENABLED is false. Enable only on Docker/Playwright-ready Render, not native Node builds.");
  }
  try {
    return require("playwright-core").chromium;
  } catch (coreError) {
    try {
      return require("playwright").chromium;
    } catch (fullError) {
      throw new Error(`Playwright not installed/available: ${coreError.message || fullError.message || "missing package"}`);
    }
  }
}

function localVidSrcPrepareBrowserEnv() {
  const explicitExecutable = process.env.VIDSRC_BROWSER_EXECUTABLE_PATH || process.env.REMOTE_BROWSER_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "";
  if (explicitExecutable) return;

  // Native Render Node deploys do NOT have the Playwright Docker image's /ms-playwright folder.
  // The package postinstall below installs Chromium into node_modules with PLAYWRIGHT_BROWSERS_PATH=0,
  // so force runtime to look there when /ms-playwright is missing.
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === "/ms-playwright" && !fs.existsSync("/ms-playwright")) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
  }

  try {
    const corePkgDir = path.dirname(require.resolve("playwright-core/package.json"));
    const localBrowserDir = path.join(corePkgDir, ".local-browsers");
    if (fs.existsSync(localBrowserDir) && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
    }
  } catch {}
}

async function localVidSrcBrowser() {
  if (__vidsrcBrowserPromise) return __vidsrcBrowserPromise;
  localVidSrcPrepareBrowserEnv();
  const chromium = localVidSrcLoadChromium();
  const executablePath = process.env.VIDSRC_BROWSER_EXECUTABLE_PATH || process.env.REMOTE_BROWSER_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "";

  __vidsrcBrowserPromise = chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--autoplay-policy=no-user-gesture-required"
    ]
  }).catch((error) => {
    __vidsrcBrowserPromise = null;
    throw error;
  });

  return __vidsrcBrowserPromise;
}

async function localVidSrcScrapeProvider(domain = "", embedUrl = "") {
  const browser = await localVidSrcBrowser();
  const found = { domain, embedUrl, hls_url: "", subtitles: [], requests: [], error: null };
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
    viewport: { width: 1365, height: 768 },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9", "Referer": embedUrl }
  });
  const page = await context.newPage();

  function rememberUrl(url = "") {
    const value = String(url || "");
    if (!value) return;
    if (!found.requests.includes(value) && found.requests.length < 80) found.requests.push(value);
    if (!found.hls_url && apiIsM3u8Url(value)) found.hls_url = value;
    if (localVidSrcIsSubtitleUrl(value) && !found.subtitles.includes(value)) found.subtitles.push(value);
  }

  try {
    await page.route("**/*", async (route) => {
      rememberUrl(route.request().url());
      await route.continue().catch(() => {});
    });
    page.on("request", (request) => rememberUrl(request.url()));
    page.on("response", (response) => rememberUrl(response.url()));
    page.on("framenavigated", (frame) => rememberUrl(frame.url()));

    await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: VIDSRC_TIMEOUT_MS });

    for (const selector of ["#the_frame", "iframe", "video", ".jwplayer", ".plyr", "button[aria-label*='Play' i]", ".play", ".play-button", "[class*='play']"]) {
      try {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
          await loc.click({ timeout: 2500, force: true }).catch(() => {});
          await page.waitForTimeout(1000);
          if (found.hls_url) break;
        }
      } catch {}
    }

    if (!found.hls_url) {
      await page.mouse.click(683, 384).catch(() => {});
    }

    const endAt = Date.now() + VIDSRC_WAIT_MS;
    while (!found.hls_url && Date.now() < endAt) await page.waitForTimeout(750);

    try {
      const html = await page.content();
      for (const url of apiExtractMediaUrlsFromStringDeep(html)) rememberUrl(url);
    } catch {}

    if (!found.hls_url) found.error = "HLS URL not found";
  } catch (error) {
    found.error = error.message || "scrape failed";
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return found;
}

async function localVidSrcGetStreams({ tmdbId = "", mediaType = "movie", season = "1", episode = "1", attempts = [] }) {
  if (!VIDSRC_ENABLED) throw new Error("VIDSRC_ENABLED=false");
  if (!tmdbId) throw new Error("missing TMDB id");

  const domains = localVidSrcDomains();
  const results = {};
  const streams = [];
  let index = 0;

  async function worker() {
    while (index < domains.length) {
      const domain = domains[index++];
      const embedUrl = localVidSrcBuildEmbedUrl(domain, mediaType, tmdbId, season, episode);
      const startedAt = Date.now();

      try {
        const result = await localVidSrcScrapeProvider(domain, embedUrl);
        result.ms = Date.now() - startedAt;
        results[domain] = result;

        if (result.hls_url && apiIsM3u8Url(result.hls_url)) {
          streams.push({
            name: `vidsrc ${new URL(domain).hostname.replace(/^www\./, "")}`,
            quality: "auto",
            url: result.hls_url,
            headers: {
              "Referer": embedUrl,
              "Origin": domain,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
            },
            format: "m3u8",
            forceHls: true,
            subtitles: result.subtitles || []
          });
        } else {
          attempts.push(`vidsrc ${domain}: ${result.error || "no m3u8"}`);
        }
      } catch (error) {
        results[domain] = { domain, embedUrl, hls_url: "", subtitles: [], requests: [], error: error.message || "failed", ms: Date.now() - startedAt };
        attempts.push(`vidsrc ${domain}: ${error.message || "failed"}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(VIDSRC_CONCURRENCY, domains.length) }, () => worker()));

  return { success: streams.length > 0, provider: "vidsrc-local", tmdbId, mediaType, season: mediaType === "tv" ? season : "", episode: mediaType === "tv" ? episode : "", domains, results, streamsFound: streams.length, sources: streams };
}

async function localVidSrcResult({ mediaType = "movie", id = "", season = "1", episode = "1", attempts = [] }) {
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  if (!tmdbId) throw new Error("missing numeric TMDB id");

  const payload = await localVidSrcGetStreams({ tmdbId, mediaType, season, episode, attempts });
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) return null;
  return await apiFindPlayableFromPayload({ payload, providerName: "vidsrc-local", providerConfig: {}, mediaType, id: tmdbId, season, episode, attempts });
}

async function localVidSrcDebug({ mediaType = "movie", id = "", season = "1", episode = "1" }) {
  const attempts = [];
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  if (!tmdbId) throw new Error("missing numeric TMDB id");

  const payload = await localVidSrcGetStreams({ tmdbId, mediaType, season, episode, attempts });
  const winner = Array.isArray(payload.sources) && payload.sources.length
    ? await apiFindPlayableFromPayload({ payload, providerName: "vidsrc-local", providerConfig: {}, mediaType, id: tmdbId, season, episode, attempts })
    : null;
  return { attempts, payload, winner };
}




// ===== StreamProvider-main local media scrapers =====
let __streamProviderRuntime = null;

async function localStreamProviderScope({ signal = null, timeoutMs, timeoutMessage }, run) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timer = null;
  const onAbort = () => {
    clearTimeout(timer);
    controller.abort(signal.reason);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  timer = setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs);
  timer?.unref?.();
  try {
    // Await cleanup instead of leaving a losing scraper running after a race.
    // Browser startup and metadata requests can retain this slot until settled.
    const result = await run(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function localStreamProviderLoadChromium() {
  try {
    return require("playwright-core").chromium;
  } catch (coreError) {
    try {
      return require("playwright").chromium;
    } catch (fullError) {
      throw new Error(`Playwright not installed/available: ${coreError.message || fullError.message || "missing package"}`);
    }
  }
}

function localStreamProviderRuntime() {
  if (!__streamProviderRuntime) __streamProviderRuntime = createBrowserRuntime({ loadChromium: localStreamProviderLoadChromium });
  return __streamProviderRuntime;
}

async function localStreamProviderBrowser() {
  return localStreamProviderRuntime().getBrowser();
}

function localStreamProviderHeaders(pageUrl = "", requestHeaders = {}) {
  let origin = "";
  try { origin = new URL(pageUrl).origin; } catch {}
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    ...(pageUrl ? { referer: pageUrl } : {}), ...(origin ? { origin } : {})
  };
  for (const [key, value] of Object.entries(requestHeaders || {})) {
    if (/^(referer|origin|user-agent|accept|accept-language|cookie|authorization)$/i.test(key) && typeof value === "string" && value.length <= 16384 && !/[\r\n]/.test(value)) headers[key.toLowerCase()] = value;
  }
  return headers;
}

function localStreamProviderSearchSlug(title = "") {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function localStreamProviderSimpleTitle(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localStreamProviderTitleScore(candidateTitle = "", wantedTitle = "", candidateYear = "", wantedYear = "") {
  const c = localStreamProviderSimpleTitle(candidateTitle);
  const w = localStreamProviderSimpleTitle(wantedTitle);
  if (!c || !w) return -9999;
  let score = 0;
  if (c === w) score += 1000;
  else if (c.includes(w) || w.includes(c)) score += 650;
  else {
    const cw = new Set(c.split(" ").filter(Boolean));
    const ww = w.split(" ").filter(Boolean);
    const hits = ww.filter((x) => cw.has(x)).length;
    score += hits * 80 - Math.max(0, ww.length - hits) * 40;
  }
  if (wantedYear && candidateYear) score += String(candidateYear) === String(wantedYear) ? 350 : -150;
  return score;
}

async function localStreamProviderGetTmdbMetadata({ tmdbId = "", mediaType = "movie", season = "", episode = "", attempts = [] }) {
  const out = { title: "", originalTitle: "", year: "", mediaType, seasonName: "", episodeName: "" };
  try {
    const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const details = await tmdb(endpoint, {}, CACHE_TTL.long);
    out.title = getTitle(details);
    out.originalTitle = details?.original_title || details?.original_name || "";
    out.year = getYear(mediaType === "tv" ? details?.first_air_date : details?.release_date);
    if (mediaType === "tv" && season && episode) {
      const ep = await tmdb(`/tv/${tmdbId}/season/${season}/episode/${episode}`, {}, CACHE_TTL.long);
      out.episodeName = ep?.name || "";
    }
  } catch (error) {
    attempts.push(`streamprovider tmdb metadata: ${error.message || "failed"}`);
  }
  return out;
}

async function localStreamProviderCaptureMedia({ provider = "", url = "", referer = "", attempts = [], signal = null }) {
  const result = await captureProviderMedia({
    getBrowser: localStreamProviderBrowser, provider, url, referer, signal,
    navigationTimeoutMs: STREAMPROVIDER_NAV_TIMEOUT_MS,
    streamTimeoutMs: STREAMPROVIDER_STREAM_TIMEOUT_MS,
    isNonMediaUrl: (value) => apiLooksDefinitelyNonMediaUrl(value, { allowManifestEndpoint: true }),
    extractUrls: apiExtractMediaUrlsFromStringDeep,
    makeHeaders: localStreamProviderHeaders,
    now: () => Date.now()
  });
  if (!result.ok) attempts.push(`${provider}: ${result.code}`);
  return result;
}

async function localStreamProviderSflixWatchUrl({ tmdbId = "", mediaType = "movie", season = "", episode = "", attempts = [], signal = null }) {
  signal?.throwIfAborted();
  if (mediaType === "tv") {
    attempts.push("streamprovider-sflix: TV selection skipped; hexa/cinezo handle tv directly");
    return "";
  }

  const metadata = await localStreamProviderGetTmdbMetadata({ tmdbId, mediaType, season, episode, attempts });
  signal?.throwIfAborted();
  const titles = Array.from(new Set([metadata.title, metadata.originalTitle].filter(Boolean)));
  if (!titles.length) {
    attempts.push("streamprovider-sflix: missing TMDB title");
    return "";
  }

  let context = null, page = null, closing = null;
  const closeContext = () => {
    if (!context) return Promise.resolve();
    if (!closing) closing = Promise.resolve().then(() => context.close()).catch(() => {});
    return closing;
  };
  const onAbort = () => { void closeContext(); };

  try {
    const browser = await localStreamProviderBrowser();
    signal?.throwIfAborted();
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      viewport: { width: 1365, height: 768 }
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    signal?.throwIfAborted();
    page = await context.newPage();
    signal?.throwIfAborted();
    for (const title of titles) {
      signal?.throwIfAborted();
      const slug = localStreamProviderSearchSlug(title);
      if (!slug) continue;
      const searchUrl = `${STREAMPROVIDER_SFLIX_BASE_URL}/search/${slug}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: STREAMPROVIDER_NAV_TIMEOUT_MS });
      signal?.throwIfAborted();
      const candidates = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".film_list-wrap > div, .film_list-grid > div, .flw-item"));
        return cards.map((card, index) => {
          const titleText = card.querySelector(".film-detail h2 a, h2 a, .film-name a, a")?.textContent?.trim() || "";
          const yearText = card.querySelector(".fd-infor span, .fdi-item")?.textContent?.trim() || card.textContent || "";
          const href = card.querySelector(".fd-btn a, h2 a, .film-name a, a")?.getAttribute("href") || "";
          const yearMatch = String(yearText).match(/\b(19|20)\d{2}\b/);
          return { index, title: titleText, year: yearMatch ? yearMatch[0] : "", href };
        }).filter((x) => x.title && x.href);
      });
      signal?.throwIfAborted();
      let best = null;
      let bestScore = -99999;
      for (const candidate of candidates) {
        const score = localStreamProviderTitleScore(candidate.title, title, candidate.year, metadata.year);
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
      if (best && bestScore > 100) {
        let href = String(best.href || "");
        if (!/^https?:\/\//i.test(href)) href = `${STREAMPROVIDER_SFLIX_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
        if (!href.includes("/watch-movie/") && href.includes("/movie/")) href = href.replace("/movie/", "/watch-movie/");
        return href;
      }
    }
    attempts.push("streamprovider-sflix: no matching search result");
    return "";
  } catch (error) {
    signal?.throwIfAborted();
    attempts.push(`streamprovider-sflix: ${error.message || "search failed"}`);
    return "";
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await closeContext();
    signal?.throwIfAborted();
  }
}

async function localNuvioGetStreams({ tmdbId, mediaType, season, episode, signal }) {
  if (!NUVIO_ENABLED) return { results: [], winner: null };
  return runProviderRace({
    jobs: Array.from(new Set(NUVIO_PROVIDER_ORDER)).map(id => ({ provider: `nuvio-${id}`, id, timeoutMs: NUVIO_PROVIDER_TIMEOUT_MS })),
    signal, timeoutMs: NUVIO_TIMEOUT_MS, hedgeDelayMs: 300, maxConcurrent: 2,
    now: () => Date.now(), setTimeout, clearTimeout,
    isPlayable: result => result?.ok && result.source?.mediaVerified === true && apiHasEmbeddableFileExtensionOrHlsProxy(result.source.url, result.source),
    run: (job, { signal: providerSignal, timeoutMs }) => resolveNuvioProvider({
      provider: job.id, tmdbId, mediaType, season, episode, signal: providerSignal, timeoutMs,
      isNonMediaUrl: value => apiLooksDefinitelyNonMediaUrl(value, { allowManifestEndpoint: true })
    })
  });
}

async function localStreamProviderGetStreams({ tmdbId = "", mediaType = "movie", season = "1", episode = "1", attempts = [], signal = null }) {
  signal?.throwIfAborted();
  if (!STREAMPROVIDER_ENABLED) throw new Error("STREAMPROVIDER_ENABLED=false");
  if (!tmdbId) throw new Error("missing TMDB id");

  const nuvio = await localNuvioGetStreams({ tmdbId, mediaType, season, episode, signal });
  signal?.throwIfAborted();
  if (nuvio.winner) return {
    success: true, code: "", provider: "streamprovider-local", tmdbId, mediaType,
    season: mediaType === "tv" ? season : "", episode: mediaType === "tv" ? episode : "",
    providersTried: nuvio.results.map(result => result.provider), results: nuvio.results,
    streamsFound: (nuvio.winner.sources || [nuvio.winner.source]).length,
    sources: nuvio.winner.sources || [nuvio.winner.source], subtitles: nuvio.winner.subtitles || []
  };

  const configuredOrder = mediaType === "tv" ? STREAMPROVIDER_TV_ORDER : STREAMPROVIDER_MOVIE_ORDER;
  const order = Array.from(new Set(configuredOrder.length ? configuredOrder : ["vidrift", "hexa", "cinezo"]));
  const jobs = [];
  for (const name of order) {
    if (name === "vidrift") jobs.push({ provider: name, url: mediaType === "tv" ? `https://embed.vidrift.in/embed/tv/${tmdbId}/${season}/${episode}` : `https://embed.vidrift.in/embed/movie/${tmdbId}` });
    if (name === "hexa") jobs.push({ provider: name, url: mediaType === "tv" ? `https://hexa.su/watch/tv/${tmdbId}/${season}/${episode}` : `https://hexa.su/watch/movie/${tmdbId}` });
    if (name === "cinezo") jobs.push({ provider: name, url: mediaType === "tv" ? `https://www.cinezo.net/watch/tv/${tmdbId}?season=${season}&episode=${episode}` : `https://www.cinezo.net/watch/movie/${tmdbId}` });
  }
  // Optional title search runs after the direct TMDB providers.
  if (order.includes("sflix") && mediaType === "movie") jobs.push({ provider: "sflix", url: "", waitForPrevious: true });
  const { results: browserResults, winner } = await runProviderRace({
    jobs: jobs.map(job => ({ ...job, timeoutMs: STREAMPROVIDER_PROVIDER_TIMEOUT_MS })), signal,
    timeoutMs: STREAMPROVIDER_ROUTE_TIMEOUT_MS, hedgeDelayMs: STREAMPROVIDER_HEDGE_DELAY_MS,
    maxConcurrent: STREAMPROVIDER_MAX_CONCURRENT, now: () => Date.now(), setTimeout, clearTimeout,
    isPlayable: result => result?.ok && result.source?.url && apiHasEmbeddableFileExtensionOrHlsProxy(result.source.url, result.source),
    run: async (job, { signal: providerSignal, timeoutMs: budget }) => {
      let watchUrl = job.url;
      if (job.provider === "sflix") {
        try {
          watchUrl = await localStreamProviderScope({ signal: providerSignal, timeoutMs: Math.min(STREAMPROVIDER_NAV_TIMEOUT_MS, budget), timeoutMessage: "sflix: search timed out" },
            searchSignal => localStreamProviderSflixWatchUrl({ tmdbId, mediaType, season, episode, attempts, signal: searchSignal }));
        } catch (error) {
          providerSignal.throwIfAborted();
          attempts.push(`streamprovider-sflix: skipped after ${Math.min(STREAMPROVIDER_NAV_TIMEOUT_MS, budget)}ms resolving search URL`);
        }
      }
      if (!watchUrl) return { ok: false, provider: job.provider, code: "no_source" };
      return localStreamProviderCaptureMedia({ provider: job.provider, url: watchUrl, attempts, signal: providerSignal });
    }
  });
  signal?.throwIfAborted();
  const results = [...nuvio.results, ...browserResults];
  const sources = winner ? [winner.source] : [];
  for (const result of results) if (!result.ok) attempts.push(`${result.provider}: ${result.code}`);
  const code = sources.length ? "" : results.some(result => result.code === "browser_unavailable") ? "browser_unavailable"
    : results.some(result => result.code === "provider_blocked") ? "provider_blocked" : "no_source";
  return {
    success: sources.length > 0, code, provider: "streamprovider-local", tmdbId, mediaType,
    season: mediaType === "tv" ? season : "", episode: mediaType === "tv" ? episode : "",
    providersTried: results.map(result => result.provider), results, streamsFound: sources.length, sources
  };
}

async function localStreamProviderResult({ mediaType = "movie", id = "", season = "1", episode = "1", attempts = [], signal = null }) {
  signal?.throwIfAborted();
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  signal?.throwIfAborted();
  if (!tmdbId) throw new Error("missing numeric TMDB id");
  const payload = await localStreamProviderScope({
    signal,
    timeoutMs: STREAMPROVIDER_ROUTE_TIMEOUT_MS,
    timeoutMessage: `streamprovider timed out after ${STREAMPROVIDER_ROUTE_TIMEOUT_MS}ms`
  }, (captureSignal) => localStreamProviderGetStreams({ tmdbId, mediaType, season, episode, attempts, signal: captureSignal }));
  signal?.throwIfAborted();
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) {
    const error = new Error("Stream providers returned no playable source.");
    error.code = payload.code || "no_source";
    throw error;
  }
  const result = await apiFindPlayableFromPayload({
    payload,
    providerName: "streamprovider-local",
    providerConfig: {},
    mediaType,
    id: tmdbId,
    season,
    episode,
    attempts
  });
  signal?.throwIfAborted();
  return result;
}

async function localStreamProviderDebug({ mediaType = "movie", id = "", season = "1", episode = "1", attempts = [] }) {
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  const payload = await localStreamProviderScope({ timeoutMs: STREAMPROVIDER_ROUTE_TIMEOUT_MS, timeoutMessage: "streamprovider debug timed out" },
    (signal) => localStreamProviderGetStreams({ tmdbId, mediaType, season, episode, attempts, signal }));
  const winner = await apiFindPlayableFromPayload({
    payload,
    providerName: "streamprovider-local",
    providerConfig: {},
    mediaType,
    id: tmdbId,
    season,
    episode,
    attempts
  });
  return { tmdbId, attempts, payload, winner };
}

// ===== Filmu m3u8 scraper: watches Network for .m3u8 =====
let __filmuBrowserPromise = null;

function localFilmuLoadChromium() {
  try {
    return require("playwright-core").chromium;
  } catch (coreError) {
    try {
      return require("playwright").chromium;
    } catch (fullError) {
      throw new Error(`Playwright not installed/available: ${coreError.message || fullError.message || "missing package"}`);
    }
  }
}

async function localFilmuBrowser() {
  if (__filmuBrowserPromise) return __filmuBrowserPromise;
  const chromium = localFilmuLoadChromium();
  const executablePath =
    process.env.FILMU_BROWSER_EXECUTABLE_PATH ||
    process.env.REMOTE_BROWSER_EXECUTABLE_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "";

  __filmuBrowserPromise = chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  }).catch((error) => {
    __filmuBrowserPromise = null;
    throw error;
  });

  return __filmuBrowserPromise;
}

function localFilmuResolveUrl(input = "", base = "") {
  try {
    if (!input) return "";
    if (/^\/\//.test(input)) return `https:${input}`;
    return new URL(input, base || "https://embedm3u8.filmu.in/").toString();
  } catch {
    return "";
  }
}

function localFilmuBuildEmbedUrls({ tmdbId = "", mediaType = "movie", season = "1", episode = "1" }) {
  const id = encodeURIComponent(String(tmdbId || "").trim());
  const s = encodeURIComponent(String(season || "1").trim());
  const e = encodeURIComponent(String(episode || "1").trim());
  const template = String(FILMU_EMBED_TEMPLATE || "https://embedm3u8.filmu.in/movietrailer/{tmdb}").trim();
  const urls = new Set();

  // Exact user-provided pattern first:
  // https://embedm3u8.filmu.in/movietrailer/112321
  urls.add(`https://embedm3u8.filmu.in/movietrailer/${id}`);

  if (template) {
    urls.add(template
      .replace(/\{tmdb(?:Id)?\}/gi, id)
      .replace(/\{id\}/gi, id)
      .replace(/\{type\}/gi, encodeURIComponent(mediaType))
      .replace(/\{season\}/gi, s)
      .replace(/\{episode\}/gi, e)
      .replace(/use-tmdbid-for-your-scraper/gi, id));

    // If the template itself does not contain a placeholder, try it with query params too.
    urls.add(`${template.replace(/\/$/, "")}?tmdb=${id}&type=${encodeURIComponent(mediaType)}${mediaType === "tv" ? `&season=${s}&episode=${e}` : ""}`);
    urls.add(`${template.replace(/\/$/, "")}?tmdbId=${id}&type=${encodeURIComponent(mediaType)}${mediaType === "tv" ? `&season=${s}&episode=${e}` : ""}`);
  }

  const origin = (() => {
    try { return new URL(template).origin; } catch { return "https://embedm3u8.filmu.in"; }
  })();

  if (FILMU_TRY_FALLBACKS) {
    // Optional extra fallbacks. Disabled by default because each fallback can take
    // a full browser timeout and make /api/local/filmu-debug look stuck.
    urls.add(`${origin}/movietrailer/${id}`);
    urls.add(`${origin}/movietrailer?tmdb=${id}`);
    urls.add(`${origin}/movietrailer?tmdbId=${id}`);
    urls.add(`${origin}/movie/${id}`);
    urls.add(`${origin}/embed/movie/${id}`);
    if (mediaType === "tv") {
      urls.add(`${origin}/tv/${id}/${s}/${e}`);
      urls.add(`${origin}/embed/tv/${id}/${s}/${e}`);
      urls.add(`${origin}/movietrailer/${id}/${s}/${e}`);
      urls.add(`${origin}/movietrailer?tmdb=${id}&season=${s}&episode=${e}`);
    }
  }

  return Array.from(urls).filter((url) => /^https?:\/\//i.test(url));
}

function localFilmuLooksInterestingUrl(url = "") {
  const value = String(url || "");
  return (
    apiIsM3u8Url(value) ||
    /\.(?:mp4|webm|mkv|m4v|ts)(?:[?#]|$)/i.test(value) ||
    /(?:m3u8|playlist|master|manifest|hls|stream|source|player|embed|file|media|video|api|ajax|movie|trailer)/i.test(value)
  );
}

function localFilmuMaybeHeaders(embedUrl = "") {
  let origin = "";
  try { origin = new URL(embedUrl).origin; } catch {}
  return {
    "Referer": embedUrl,
    ...(origin ? { "Origin": origin } : {}),
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
  };
}

async function localFilmuScrapeOne(embedUrl = "") {
  const browser = await localFilmuBrowser();
  const found = {
    embedUrl,
    finalUrl: "",
    hlsUrl: "",
    mediaUrls: [],
    interestingUrls: [],
    responses: [],
    errors: []
  };

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
    viewport: { width: 1365, height: 768 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": embedUrl
    }
  });

  const page = await context.newPage();

  function remember(url = "", meta = {}) {
    const raw = String(url || "").trim();
    if (!raw) return;
    const resolved = localFilmuResolveUrl(raw, meta.base || found.finalUrl || embedUrl);
    if (!resolved || apiLooksDefinitelyNonMediaUrl(resolved) || apiIsYouTubeUrl(resolved)) return;

    if (apiIsM3u8Url(resolved) && !found.hlsUrl) found.hlsUrl = resolved;
    if ((apiIsM3u8Url(resolved) || apiIsAllowedMediaExtensionUrl(resolved)) && !found.mediaUrls.includes(resolved)) found.mediaUrls.push(resolved);
    if (localFilmuLooksInterestingUrl(resolved) && !found.interestingUrls.includes(resolved) && found.interestingUrls.length < 160) found.interestingUrls.push(resolved);
  }

  try {
    await page.route("**/*", async (route) => {
      const req = route.request();
      remember(req.url(), { base: embedUrl });
      await route.continue().catch(() => {});
    });

    page.on("request", (request) => remember(request.url(), { base: embedUrl }));
    page.on("framenavigated", (frame) => remember(frame.url(), { base: embedUrl }));

    page.on("response", async (response) => {
      const url = response.url();
      const headers = response.headers() || {};
      const contentType = String(headers["content-type"] || headers["Content-Type"] || "");
      remember(url, { base: embedUrl });
      if (found.responses.length < 80 && (localFilmuLooksInterestingUrl(url) || /mpegurl|m3u8|json|javascript|html|text/i.test(contentType))) {
        found.responses.push({ url, status: response.status(), contentType });
      }
      if (!found.hlsUrl && /mpegurl|m3u8/i.test(contentType)) remember(url, { base: embedUrl });
      if (!found.hlsUrl && /json|javascript|html|text/i.test(contentType)) {
        try {
          const text = await response.text();
          for (const u of apiExtractMediaUrlsFromStringDeep(text)) remember(u, { base: url });
          // Also catch escaped URLs that may not include an extension until decoded.
          const decoded = text.replace(/\\\//g, "/").replace(/&amp;/g, "&");
          for (const u of apiExtractMediaUrlsFromStringDeep(decoded)) remember(u, { base: url });
        } catch {}
      }
    });

    await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: FILMU_TIMEOUT_MS });
    found.finalUrl = page.url();

    // Network m3u8 often appears only after clicking the embedded player.
    for (const selector of [
      "video",
      "iframe",
      "#player",
      "#the_frame",
      ".jwplayer",
      ".plyr",
      ".vjs-big-play-button",
      "button[aria-label*='play' i]",
      "button[title*='play' i]",
      ".play",
      ".play-button",
      "[class*='play']",
      "body"
    ]) {
      if (found.hlsUrl) break;
      try {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
          await loc.click({ timeout: 1800, force: true }).catch(() => {});
          await page.waitForTimeout(700);
        }
      } catch {}
    }

    // Try clicking center of page/frames.
    if (!found.hlsUrl) {
      await page.mouse.click(683, 384).catch(() => {});
      await page.waitForTimeout(1000).catch(() => {});
    }

    // Scan DOM, iframes, storage, and scripts.
    const endAt = Date.now() + FILMU_WAIT_MS;
    while (Date.now() < endAt && !found.hlsUrl) {
      try {
        const html = await page.content();
        for (const u of apiExtractMediaUrlsFromStringDeep(html)) remember(u, { base: found.finalUrl || embedUrl });
        const storageText = await page.evaluate(() => {
          const out = [];
          try { for (let i = 0; i < localStorage.length; i++) out.push(`${localStorage.key(i)}=${localStorage.getItem(localStorage.key(i))}`); } catch {}
          try { for (let i = 0; i < sessionStorage.length; i++) out.push(`${sessionStorage.key(i)}=${sessionStorage.getItem(sessionStorage.key(i))}`); } catch {}
          try { out.push(document.documentElement.innerHTML); } catch {}
          return out.join("\n");
        }).catch(() => "");
        for (const u of apiExtractMediaUrlsFromStringDeep(storageText)) remember(u, { base: found.finalUrl || embedUrl });
        for (const frame of page.frames()) {
          remember(frame.url(), { base: embedUrl });
          const frameHtml = await frame.content().catch(() => "");
          for (const u of apiExtractMediaUrlsFromStringDeep(frameHtml)) remember(u, { base: frame.url() || found.finalUrl || embedUrl });
        }
      } catch {}
      if (found.hlsUrl) break;
      await page.waitForTimeout(700);
    }

    if (!found.hlsUrl && found.mediaUrls.find(apiIsM3u8Url)) found.hlsUrl = found.mediaUrls.find(apiIsM3u8Url);
  } catch (error) {
    found.errors.push(error.message || "scrape failed");
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return found;
}

async function localFilmuGetStreams({ tmdbId = "", mediaType = "movie", season = "1", episode = "1", attempts = [] }) {
  if (!FILMU_ENABLED) throw new Error("FILMU_ENABLED=false");
  if (!tmdbId) throw new Error("missing TMDB id");

  const embedUrls = localFilmuBuildEmbedUrls({ tmdbId, mediaType, season, episode });
  const results = [];
  const sources = [];

  for (const embedUrl of embedUrls) {
    const startedAt = Date.now();
    const result = await localFilmuScrapeOne(embedUrl);
    result.ms = Date.now() - startedAt;
    results.push(result);

    if (result.hlsUrl) {
      sources.push({
        name: "Filmu HLS",
        quality: "auto",
        url: result.hlsUrl,
        headers: localFilmuMaybeHeaders(result.finalUrl || embedUrl),
        format: "m3u8",
        forceHls: true
      });
      break;
    }

    attempts.push(`filmu: no m3u8 from ${embedUrl}${result.errors.length ? ` (${result.errors.join("; ")})` : ""}`);
  }

  return {
    success: sources.length > 0,
    provider: "filmu-local",
    tmdbId,
    mediaType,
    season: mediaType === "tv" ? season : "",
    episode: mediaType === "tv" ? episode : "",
    embedUrls,
    results,
    streamsFound: sources.length,
    sources
  };
}

async function localFilmuResult({ mediaType = "movie", id = "", season = "1", episode = "1", attempts = [] }) {
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  if (!tmdbId) throw new Error("missing numeric TMDB id");
  const payload = await localFilmuGetStreams({ tmdbId, mediaType, season, episode, attempts });
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) return null;
  return await apiFindPlayableFromPayload({
    payload,
    providerName: "filmu-local",
    providerConfig: {},
    mediaType,
    id: tmdbId,
    season,
    episode,
    attempts
  });
}

async function localFilmuDebug({ mediaType = "movie", id = "", season = "1", episode = "1" }) {
  const attempts = [];
  const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
  const payload = await localFilmuGetStreams({ tmdbId, mediaType, season, episode, attempts });
  const winner = await apiFindPlayableFromPayload({
    payload,
    providerName: "filmu-local",
    providerConfig: {},
    mediaType,
    id: tmdbId,
    season,
    episode,
    attempts
  });
  return { attempts, payload, winner };
}


// ===== End more local source ports =====


// ===== End local uploaded API source port =====

async function apiFetchCastelVariants({ tmdbId = "", mediaType = "movie", season = "", episode = "", attempts = [] }) {
  const providerConfig = API_PROVIDERS.castel;
  if (!providerConfig?.stream) throw new Error("castel stream endpoint missing");

  const variants = [
    { id: tmdbId, type: mediaType },
    { tmdb: tmdbId, type: mediaType },
    { tmdbId, type: mediaType },
    { id: tmdbId, tmdb: tmdbId, tmdbId, type: mediaType }
  ].map((params) => ({
    ...params,
    season: mediaType === "tv" ? season : "",
    episode: mediaType === "tv" ? episode : ""
  }));

  let lastError = null;

  for (const params of variants) {
    try {
      const data = await apiProviderFetch(providerConfig.stream, params);

      // If it contains any possible URL at all, use this response. The parser will
      // decide what is playable. This prevents a good response from being overwritten
      // by later variant calls.
      const urls = apiCollectCandidateUrls(data);
      const trusted = apiCollectTrustedStreamSources("castel", data);
      if (urls.length || trusted.length) return data;

      // Some APIs wrap source arrays without URLs until deeper parsing. Return first
      // successful JSON response anyway, but record the attempt.
      attempts.push(`castel: ${Object.keys(params).join("+")} returned JSON but no URLs`);
      return data;
    } catch (error) {
      lastError = error;
      attempts.push(`castel ${Object.keys(params).join("+")}: ${error.message || "failed"}`);
    }
  }

  throw lastError || new Error("Castel failed");
}

async function fetchApiProviderSource({ type = "movie", id = "", season = "1", episode = "1", provider = "", signal = null }) {
  signal?.throwIfAborted();
  // Local uploaded source-code providers run even without API_BASE_URL/API_KEY.
  // External provider API calls are optional and disabled unless USE_EXTERNAL_PROVIDER_API=true.
  const mediaType = type === "tv" ? "tv" : "movie";
  const attempts = [];
  const preferred = apiClean(provider || DEFAULT_PLAY_PROVIDER).toLowerCase();
  const providerOrder = Array.from(new Set([preferred, ...API_M3U8_PROVIDER_ORDER].filter(Boolean)));
  let discoveryCode = "";

  let title = "";
  let releaseYear = "";

  // 0-streamprovider) Local StreamProvider-main any-media implementation.
  if (preferred === "streamprovider" || providerOrder.includes("streamprovider")) {
    try {
      const streamProviderResult = await localStreamProviderResult({ mediaType, id, season, episode, attempts, signal });
      signal?.throwIfAborted();
      if (streamProviderResult) return streamProviderResult;
      attempts.push("streamprovider-local: no playable media captured");
    } catch (error) {
      signal?.throwIfAborted();
      if (["browser_unavailable", "provider_blocked", "no_source"].includes(error.code)) discoveryCode = error.code;
      attempts.push(`streamprovider-local: ${error.message || "failed"}`);
    }
  }

  // Title metadata is only needed once direct TMDB-id discovery has failed.
  try {
    const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
    signal?.throwIfAborted();
    if (tmdbId) {
      const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
      const details = await tmdb(endpoint, {}, CACHE_TTL.long);
      signal?.throwIfAborted();
      title = getTitle(details);
      releaseYear = getYear(mediaType === "tv" ? details.first_air_date : details.release_date);
      id = tmdbId;
    }
  } catch (error) {
    signal?.throwIfAborted();
    attempts.push(`tmdb metadata: ${error.message || "failed"}`);
  }

  // 0) Local uploaded /api/vid source-code implementation. This bypasses the
  // external API quota/key layer and does what the uploaded route.ts does directly.
  if (preferred === "vid" || providerOrder.includes("vid")) {
    try {
      const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
      signal?.throwIfAborted();
      if (tmdbId) {
        const vidPayload = await localVidGetStreams({
          tmdbId,
          mediaType,
          season: mediaType === "tv" ? season : "",
          episode: mediaType === "tv" ? episode : ""
        });
        signal?.throwIfAborted();

        const localVidResult = await apiFindPlayableFromPayload({
          payload: vidPayload,
          providerName: "vid-local",
          providerConfig: API_PROVIDERS.vid || {},
          mediaType,
          id: tmdbId,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (localVidResult) return localVidResult;
        attempts.push("vid-local: uploaded source-code flow returned no usable stream");
      } else {
        attempts.push("vid-local: missing numeric TMDB id");
      }
    } catch (error) {
      signal?.throwIfAborted();
      attempts.push(`vid-local: ${error.message || "failed"}`);
    }
  }

  // 0b) Local uploaded /api/castel source-code implementation. This ports the
  // Castle source route directly instead of relying on the external provider API.
  if (preferred === "castel" || preferred === "castle" || providerOrder.includes("castel")) {
    try {
      const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
      signal?.throwIfAborted();
      if (tmdbId) {
        const castlePayload = await localCastleGetStreams({
          tmdbId,
          mediaType,
          season: mediaType === "tv" ? season : "",
          episode: mediaType === "tv" ? episode : ""
        });
        signal?.throwIfAborted();

        const localCastleResult = await apiFindPlayableFromPayload({
          payload: castlePayload,
          providerName: "castle-local",
          providerConfig: API_PROVIDERS.castel || {},
          mediaType,
          id: tmdbId,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (localCastleResult) return localCastleResult;
        attempts.push("castle-local: uploaded source-code flow returned no usable stream");
      } else {
        attempts.push("castle-local: missing numeric TMDB id");
      }
    } catch (error) {
      signal?.throwIfAborted();
      attempts.push(`castle-local: ${error.message || "failed"}`);
    }
  }

  // 0c) Local NetMirror and TheMovie ports from uploaded source. These do not use
  // the external docs API/key; they copy the route.ts flows directly.
  if (title) {
    if (preferred === "netmirror" || providerOrder.includes("netmirror")) {
      try {
        const netResult = await localNetMirrorByTitle({
          title,
          year: releaseYear,
          mediaType,
          id,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();
        if (netResult) return netResult;
        attempts.push("netmirror-local: source-code flow returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`netmirror-local: ${error.message || "failed"}`);
      }
    }

    if (preferred === "themovie" || providerOrder.includes("themovie")) {
      try {
        const movieBoxResult = await localTheMovieByTitle({
          title,
          year: releaseYear,
          mediaType,
          id,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();
        if (movieBoxResult) return movieBoxResult;
        attempts.push("themovie-local: source-code flow returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`themovie-local: ${error.message || "failed"}`);
      }
    }

    if (preferred === "xprime" || providerOrder.includes("xprime")) {
      try {
        const xprimePayload = await localXprimeGetStreams({
          tmdbId: id,
          mediaType,
          season: mediaType === "tv" ? season : "",
          episode: mediaType === "tv" ? episode : ""
        });
        signal?.throwIfAborted();

        const xprimeResult = await apiFindPlayableFromPayload({
          payload: xprimePayload,
          providerName: "xprime-local",
          providerConfig: API_PROVIDERS.xprime || {},
          mediaType,
          id,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (xprimeResult) return xprimeResult;
        attempts.push("xprime-local: source-code flow returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`xprime-local: ${error.message || "failed"}`);
      }
    }

    if (preferred === "filmu" || providerOrder.includes("filmu")) {
      try {
        const filmuResult = await localFilmuResult({ mediaType, id, season, episode, attempts });
        signal?.throwIfAborted();
        if (filmuResult) return filmuResult;
        attempts.push("filmu-local: no m3u8 captured");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`filmu-local: ${error.message || "failed"}`);
      }
    }

    if (preferred === "vidsrc" || providerOrder.includes("vidsrc")) {
      try {
        const vidsrcResult = await localVidSrcResult({ mediaType, id, season, episode, attempts });
        signal?.throwIfAborted();
        if (vidsrcResult) return vidsrcResult;
        attempts.push("vidsrc-local: source-code flow returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`vidsrc-local: ${error.message || "failed"}`);
      }
    }

    if ((preferred === "consumet" || preferred.startsWith("consumet-") || providerOrder.includes("consumet")) && title) {
      try {
        const consumetResult = await localConsumetByTitle({
          title,
          year: releaseYear,
          mediaType,
          id,
          season,
          episode,
          attempts,
          preferred
        });
        signal?.throwIfAborted();
        if (consumetResult) return consumetResult;
        attempts.push("consumet: source-code flow returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`consumet: ${error.message || "failed"}`);
      }
    }

    // Title-only download searches cannot identify the selected TV episode.
    // Keep the automatic fallback for movies and explicitly selected adapters.
    if (preferred === "download-sites" || providerOrder.includes("download-sites") || (mediaType === "movie" && process.env.LOCAL_DOWNLOAD_SITES !== "false")) {
      try {
        const downloadSitesResult = await localDownloadSitesByTitle({ title, year: releaseYear, mediaType, id, season, episode, attempts });
        signal?.throwIfAborted();
        if (downloadSitesResult && downloadSitesResult.status === "ok") return downloadSitesResult;
        if (downloadSitesResult?.providerSummaries) attempts.push(`download-sites-local: no playable source; providers checked ${downloadSitesResult.providerSummaries.map((p) => `${p.provider}:${p.resultCount}`).join(", ")}`);
        else attempts.push("download-sites-local: source-code search returned no usable stream");
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`download-sites-local: ${error.message || "failed"}`);
      }
    }
  }

  // 1) Optional external docs API fallback.
  // Disabled by default so SwiflyTV uses the uploaded source code directly.
  if (USE_EXTERNAL_PROVIDER_API && apiProviderConfigured()) {
  for (const providerName of providerOrder) {
    const providerConfig = API_PROVIDERS[providerName];
    if (!providerConfig) continue;

    try {
      if (providerName === "vid" && providerConfig.stream) {
        const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
        signal?.throwIfAborted();

        if (!tmdbId) {
          attempts.push("vid: missing numeric TMDB id");
          continue;
        }

        const data = await apiProviderFetch(providerConfig.stream, {
          tmdb: tmdbId,
          s: mediaType === "tv" ? season : "",
          e: mediaType === "tv" ? episode : ""
        });
        signal?.throwIfAborted();

        const result = await apiFindPlayableFromPayload({
          payload: data,
          providerName,
          providerConfig,
          mediaType,
          id: tmdbId,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (result) return result;
        attempts.push("vid: no m3u8/media source in API response");
        continue;
      }

      if (providerName === "castel" && providerConfig.stream) {
        const tmdbId = await apiResolveTmdbIdForApi({ mediaType, id, attempts });
        signal?.throwIfAborted();
        if (!tmdbId) {
          attempts.push("castel: missing numeric TMDB id");
          continue;
        }

        const data = await apiFetchCastelVariants({
          tmdbId,
          mediaType,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        const result = await apiFindPlayableFromPayload({
          payload: data,
          providerName,
          providerConfig,
          mediaType,
          id: tmdbId,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (result) return result;
        attempts.push("castel: response parsed but no URL-like stream source was found; check /api/provider/raw-debug?provider=castel&action=stream&tmdb=<id>&type=movie");
        continue;
      }

      if (providerName === "netmirror" && providerConfig.stream) {
        // NetMirror stream id is not the TMDB id. Search title/year first.
        const result = await apiTryNetMirrorByTmdb({
          mediaType,
          id,
          season,
          episode,
          title,
          year: releaseYear,
          attempts
        });
        signal?.throwIfAborted();
        if (result) return result;
        continue;
      }

      if ((providerName === "animepahe" || providerName === "animesalt") && providerConfig.stream && String(id).startsWith("http")) {
        const data = await apiProviderFetch(providerConfig.stream, { url: id });
        signal?.throwIfAborted();
        const result = await apiFindPlayableFromPayload({
          payload: data,
          providerName,
          providerConfig,
          mediaType,
          id,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();
        if (result) return result;
        attempts.push(`${providerName}: no m3u8/media source in API response`);
      }
    } catch (error) {
      signal?.throwIfAborted();
      attempts.push(`${providerName}: ${error.message || "request failed"}`);
    }
  }

  }

  // 2) Optional external docs API details/extractor chain. Search by TMDB title/year, call details,
  // then follow provider-specific extraction routes until a real media URL appears.
  if (USE_EXTERNAL_PROVIDER_API && apiProviderConfigured() && process.env.API_PROVIDER_SEARCH_FALLBACK !== "false" && title) {
    const providerList = Array.from(new Set([
      preferred,
      ...API_M3U8_PROVIDER_ORDER,
      ...API_DETAILS_SEARCH_FALLBACK_PROVIDERS
    ].filter(Boolean)));

    for (const providerName of providerList) {
      const providerConfig = API_PROVIDERS[providerName];
      if (!providerConfig?.search) continue;

      try {
        // NetMirror has its own id -> stream flow.
        if (providerName === "netmirror") {
          const result = await apiTryNetMirrorByTmdb({
            mediaType,
            id,
            season,
            episode,
            title,
            year: releaseYear,
            attempts
          });
          signal?.throwIfAborted();
          if (result) return result;
          continue;
        }

        if (!providerConfig.details) continue;

        const searchData = await apiProviderFetch(providerConfig.search, { q: title, page: 1 });
        signal?.throwIfAborted();
        const results = apiTopList(searchData).map((entry) => apiNormalizeItem(entry, providerName, mediaType));
        const picked =
          results.find((entry) => releaseYear && String(entry.year) === String(releaseYear)) ||
          results.find((entry) => entry.title && title && entry.title.toLowerCase().includes(title.toLowerCase().slice(0, 8))) ||
          results[0];

        if (!picked?.url) {
          attempts.push(`${providerName}: search had no detail URL`);
          continue;
        }

        let detailParams = { url: picked.url };
        detailParams = await apiApplyTmdbParamsIfNeeded({
          providerName,
          action: "details",
          endpoint: providerConfig.details,
          params: { ...detailParams, tmdb: id, tmdbId: id, id },
          mediaType,
          attempts
        });
        signal?.throwIfAborted();

        const detailData = await apiProviderFetch(providerConfig.details, detailParams);
        signal?.throwIfAborted();
        const result = await apiFindPlayableFromPayload({
          payload: detailData,
          providerName,
          providerConfig,
          mediaType,
          id,
          season,
          episode,
          attempts
        });
        signal?.throwIfAborted();

        if (result) return result;
        attempts.push(`${providerName}: details/extractors found no m3u8/media URL`);
      } catch (error) {
        signal?.throwIfAborted();
        attempts.push(`${providerName}: ${error.message || "search/details failed"}`);
      }
    }
  } else if (!title) {
    attempts.push("local source lookup skipped title-based sources because TMDB title was not found");
  } else if (!USE_EXTERNAL_PROVIDER_API) {
    attempts.push("external API fallback disabled; using uploaded source-code providers only");
  }

  return {
    status: "error",
    code: discoveryCode || "unavailable",
    message: attempts[0] || "Uploaded source-code providers did not return a usable m3u8/media URL.",
    attempts: attempts.slice(-48),
    sourceMode: USE_EXTERNAL_PROVIDER_API ? "local+external-api" : "local-source-code-only",
    note: title && releaseYear && Number(releaseYear) > new Date().getUTCFullYear()
      ? "TMDB metadata says this title is unreleased/future-dated, so providers may correctly return no streams."
      : ""
  };
}

// ===== End backend-only provider API integration =====


const CACHE_TTL = {
  short: 1000 * 60 * 5,
  medium: 1000 * 60 * 20,
  long: 1000 * 60 * 60 * 6,
};

const SWIFLYTV_SPOTLIGHT_TMDB_ID = process.env.SWIFLYTV_SPOTLIGHT_TMDB_ID || process.env.DROPSTREAM_SPOTLIGHT_TMDB_ID || "76479";
const memoryCache = new Map();
const watchRooms = new Map();
const remoteBrowserSessions = new Map();
const hlsProxySources = new Map();
const subtitleProxySources = new Map();
const preparePlaybackOptions = createPlaybackHandoff({ registerSource: registerHlsProxySource,
  registerSubtitle: registerSubtitleSource, enabled: hlsProxyEnabled });
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
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// v150: versioned, locally hosted navigation glass assets.
// Versioned glass URLs can be cached across navigation; v= tags change with edits.
app.use("/assets/liquid-glass", express.static(path.join(__dirname, "public", "liquid-glass"), { maxAge: "1d", dotfiles: "deny" }));
// v151: shared clean catalog styles and compact navigation behavior.
app.use("/assets/clean", express.static(path.join(__dirname, "public", "clean"), { maxAge: "1d", dotfiles: "deny" }));
app.use("/assets/studio", express.static(path.join(__dirname, "public", "studio"), { maxAge: "1d", dotfiles: "deny" }));
app.use("/assets/party", express.static(path.join(__dirname, "public", "party"), { maxAge: "1d", dotfiles: "deny" }));
app.use("/assets/player", express.static(path.join(__dirname, "public", "player"), { maxAge: "1d", dotfiles: "deny" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 600),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ["/api/hls-proxy/", "/api/media-file-proxy/"].some(prefix => String(req.path || "").startsWith(prefix)),
  })
);


function hlsProxyEnabled() {
  return process.env.HLS_PROXY_ENABLED !== "false";
}

function hlsProxyId() {
  return crypto.randomBytes(12).toString("hex");
}

function hlsProxyBase64UrlEncode(value = "") {
  return Buffer.from(String(value || ""), "utf8").toString("base64url");
}

function hlsProxyBase64UrlDecode(value = "") {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function sanitizeHlsProxyHeaders(headers = {}) {
  const clean = {};
  const allowed = new Set(["origin", "referer", "user-agent", "accept", "accept-language", "cookie", "authorization"]);
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = String(key || "").toLowerCase();
    if (!allowed.has(lower)) continue;
    if (typeof value !== "string" || !value.trim() || value.length > 16384 || /[\r\n]/.test(value)) continue;
    clean[lower] = value.trim();
  }
  if (!clean["user-agent"]) {
    clean["user-agent"] = process.env.HLS_PROXY_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  }
  if (!clean.accept) clean.accept = "*/*";
  return clean;
}

function registerHlsProxySource(sourceUrl, headers = {}, meta = {}) {
  if (!hlsProxyEnabled()) {
    return { enabled: false, url: "", id: "" };
  }

  let parsed;
  try {
    parsed = new URL(String(sourceUrl || ""));
  } catch {
    return { enabled: false, url: "", id: "" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { enabled: false, url: "", id: "" };
  }

  // Unselected quality options may never be opened, so request-time cleanup
  // alone cannot release them. Bound the registry when registering each source.
  const now = Date.now();
  for (const [key, entry] of hlsProxySources) if (Number(entry.expiresAt) <= now) hlsProxySources.delete(key);
  while (hlsProxySources.size >= 4096) hlsProxySources.delete(hlsProxySources.keys().next().value);
  const id = hlsProxyId();
  const ttlMs = Math.max(5 * 60 * 1000, Number(process.env.HLS_PROXY_TTL_MS || 1000 * 60 * 60 * 2));
  hlsProxySources.set(id, {
    id,
    sourceUrl: parsed.toString(),
    // Native files must use the same headers that passed source verification.
    // HLS-only defaults (especially User-Agent) can make signed MP4s return 428.
    headers: String(meta?.sourceFormat || "").toLowerCase() === "mp4"
      ? cleanNuvioHeaders(headers)
      : sanitizeHlsProxyHeaders(headers),
    meta: meta || {},
    requests: [],
    lastError: "",
    createdAt: now,
    expiresAt: now + ttlMs,
  });

  return {
    enabled: true,
    id,
    url: `/api/hls-proxy/${id}/master.m3u8`,
  };
}

function getHlsProxyEntry(id) {
  const entry = hlsProxySources.get(String(id || ""));
  if (!entry) return null;
  if (Date.now() > Number(entry.expiresAt || 0)) {
    hlsProxySources.delete(entry.id);
    return null;
  }
  return entry;
}

function registerSubtitleSource(track) {
  const now = Date.now();
  for (const [id, entry] of subtitleProxySources) if (entry.expiresAt <= now) subtitleProxySources.delete(id);
  while (subtitleProxySources.size >= 4096) subtitleProxySources.delete(subtitleProxySources.keys().next().value);
  const id = hlsProxyId();
  subtitleProxySources.set(id, { sourceUrl: track.url, headers: cleanNuvioHeaders(track.headers || {}), expiresAt: now + 2 * 60 * 60 * 1000 });
  return { id, url: `/api/subtitle-proxy/${id}/track.vtt` };
}

function getSubtitleProxyEntry(id) {
  const entry = subtitleProxySources.get(String(id || ""));
  if (!entry || entry.expiresAt <= Date.now()) { subtitleProxySources.delete(String(id || "")); return null; }
  return entry;
}

function recordHlsProxyRequest(entry, item = {}) {
  if (!entry) return;
  entry.requests = entry.requests || [];
  entry.requests.push({
    at: Date.now(),
    kind: item.kind || "asset",
    url: item.url || "",
    status: item.status || 0,
    contentType: item.contentType || "",
    bytes: Number(item.bytes || 0),
    error: item.error || "",
  });
  entry.requests = entry.requests.slice(-80);
  if (item.error) entry.lastError = item.error;
}

function setHlsProxyCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Origin, Referer, User-Agent");
  res.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
}

function hlsProxyResponseHeaders(upstream, fallbackType = "application/octet-stream") {
  const headers = {};
  const pass = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag", "cache-control"];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  if (!headers["content-type"]) headers["content-type"] = fallbackType;
  if (!headers["accept-ranges"]) headers["accept-ranges"] = "bytes";
  return headers;
}

function hlsProxyRequestHeaders(entry, req = null, targetUrl = entry.sourceUrl) {
  const headers = { ...(entry.headers || {}) };
  let sameOrigin = false;
  try { sameOrigin = new URL(targetUrl).origin === new URL(entry.sourceUrl).origin; } catch {}
  if (!sameOrigin) { delete headers.cookie; delete headers.authorization; }
  if (req?.headers?.range) headers.range = req.headers.range;
  if (req?.headers?.accept && !headers.accept) headers.accept = req.headers.accept;
  return headers;
}

function hlsProxyAssetUrl(id, absoluteUrl) {
  return `/api/hls-proxy/${encodeURIComponent(id)}/asset?u=${encodeURIComponent(hlsProxyBase64UrlEncode(absoluteUrl))}`;
}

function hlsProxyRewriteUriValue(uri = "", baseUrl = "", id = "") {
  try {
    const value = String(uri || "").trim();
    if (!value) return uri;
    if (value.startsWith("/api/hls-proxy/")) return value;
    if (/^(data|blob|javascript):/i.test(value)) return uri;
    const absolute = new URL(value, baseUrl).toString();
    return hlsProxyAssetUrl(id, absolute);
  } catch {
    return uri;
  }
}

function rewriteHlsTagUris(line = "", baseUrl = "", id = "") {
  let next = String(line || "");

  // Quoted URI attributes: URI="..." or URI='...'
  next = next.replace(/\bURI=(["'])(.*?)\1/g, (match, quote, uri) => {
    return `URI=${quote}${hlsProxyRewriteUriValue(uri, baseUrl, id)}${quote}`;
  });

  // Unquoted URI attributes: URI=https://... or URI=segment.mp4
  next = next.replace(/\bURI=([^,\s]+)/g, (match, uri) => {
    // Skip if the quoted replacer already handled it.
    if (/^["']/.test(uri)) return match;
    return `URI=${hlsProxyRewriteUriValue(uri, baseUrl, id)}`;
  });

  // Some providers put absolute media URLs in non-standard tag attributes that
  // are not named URI. Rewrite any raw http(s) URL still left in a tag line.
  next = next.replace(/https?:\/\/[^\s,"')]+/g, (url) => {
    if (url.includes("/api/hls-proxy/")) return url;
    return hlsProxyRewriteUriValue(url, baseUrl, id);
  });

  return next;
}

function rewriteHlsPlaylist(text = "", baseUrl = "", id = "") {
  const lines = String(text || "").split(/\r?\n/);

  return lines.map((line) => {
    const trimmed = line.trim();

    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      // Rewrite URI attributes in EXT-X-KEY, EXT-X-MAP, EXT-X-PART,
      // EXT-X-PRELOAD-HINT, I-FRAME-STREAM-INF, and provider-specific tags.
      return rewriteHlsTagUris(line, baseUrl, id);
    }

    return hlsProxyRewriteUriValue(trimmed, baseUrl, id);
  }).join("\n");
}

async function fetchHlsProxyUrl(entry, targetUrl, req = null) {
  let nextUrl = targetUrl;
  for (let hop = 0; hop <= 5; hop++) {
    const upstream = await fetch(nextUrl, { headers: hlsProxyRequestHeaders(entry, req, nextUrl), redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(upstream.status) || !upstream.headers.get("location")) return upstream;
    await upstream.body?.cancel().catch(() => {});
    if (hop === 5) throw new Error("Playlist redirect limit reached.");
    const redirected = new URL(upstream.headers.get("location"), nextUrl);
    if (!["http:", "https:"].includes(redirected.protocol)) throw new Error("Invalid playlist redirect.");
    nextUrl = redirected.toString();
  }
}

function isHlsLikeResponse(url = "", contentType = "") {
  return String(contentType || "").toLowerCase().includes("mpegurl") ||
    String(contentType || "").toLowerCase().includes("m3u8") ||
    new RegExp("[.]m3u8([?#]|$)", "i").test(String(url || ""));
}




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
    name: String(data.name || "SwiflyTV Watch Room").slice(0, 80),
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
  return `<a class="${active === key ? "active" : ""}" href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
}

function cleanIcon(name) {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6M18 14a6 6 0 0 1 4 5v2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>'
  };
  return `<svg class="svIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;
}

function mediaDataAttributes(prefix, item = {}, type = "") {
  const fields = { id: item.id || "", type: type || getType(item), title: getTitle(item), poster: item.poster_path || "", backdrop: item.backdrop_path || "", rating: formatRating(item.vote_average), year: getYear(getDate(item)) };
  return Object.entries(fields).map(([key, value]) => `data-${prefix}-${key}="${escapeHtml(value)}"`).join(" ");
}

function pageShell({ title = SITE_NAME, description = "Stream movies, TV shows, trailers, cast pages, watchlists, and synced watch rooms.", body = "", active = "", extraHead = "", player = false, partyBrowse = false }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta name="theme-color" content="#000000" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <link rel="preconnect" href="https://image.tmdb.org" />
  <link rel="preconnect" href="https://www.youtube.com" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700;800&family=Unbounded:wght@500;700;800&display=swap" rel="stylesheet" />
  ${extraHead}
  <link rel="stylesheet" href="/assets/clean/base.css?v=163" />

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


    <script>
      window.ROOM_MOVIE_DRIFT_LIMIT = window.ROOM_MOVIE_DRIFT_LIMIT || 10;
    </script>


    ${player || active === "watch" || active === "social" ? '<script defer src="https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js"></script>' : ""}

    ${body.includes("fa-solid") ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />' : ""}
    ${player || partyBrowse || active === "social" ? '<script defer src="/socket.io/socket.io.js"></script>' : ""}
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/modern-normalize@2.0.0/modern-normalize.min.css" />
    <link rel="stylesheet" href="/assets/liquid-glass/liquid-glass.css?v=222" />
    <script defer src="/assets/liquid-glass/liquid-glass.js?v=226"></script>
    <link rel="stylesheet" href="/assets/clean/clean.css?v=153" />
    <script defer src="/assets/clean/clean.js?v=151"></script>
    <script defer src="/assets/clean/avatars.js?v=209"></script>
    ${active === "profiles" ? '<script defer src="/assets/clean/profiles.js?v=209"></script>' : ""}
    <script defer src="/assets/clean/continue.js?v=154"></script>
    <link rel="stylesheet" href="/assets/clean/details.css?v=229" />
    <link rel="stylesheet" href="/assets/clean/motion.css?v=208" />
    <script defer src="/assets/clean/motion.js?v=204"></script>
    <script defer src="/assets/clean/details.js?v=229"></script>
    <link rel="stylesheet" href="/assets/liquid-glass/surfaces.css?v=222" />
    <script defer src="/assets/liquid-glass/surfaces.js?v=230"></script>
    <link rel="stylesheet" href="/assets/studio/studio.css?v=164" />
    <script defer src="/assets/studio/studio.js?v=164"></script>
    <link rel="stylesheet" href="/assets/clean/aurora.css?v=208" />
    <script defer src="/assets/clean/aurora.js?v=202"></script>
    ${active === "welcome" ? '<link rel="stylesheet" href="/assets/clean/welcome.css?v=205" />' : ""}
    ${active === "login" || active === "signup" ? '<link rel="stylesheet" href="/assets/clean/auth.css?v=173" />' : ""}
    
    ${player || active === "social" ? '<script defer src="/assets/player/player.js?v=211"></script>' : ""}
    ${active === "social" ? '<script defer src="/assets/party/party.js?v=205"></script><script defer src="/assets/party/lobby.js?v=199"></script>' : ""}
    ${player || partyBrowse ? '<script defer src="/assets/player/watch-party.js?v=160"></script>' : ""}
    ${player ? "" : '<link rel="stylesheet" href="/assets/clean/finish.css?v=175" />'}
    ${player ? "" : '<link rel="stylesheet" href="/assets/clean/polish.css?v=176" />'}
    <link rel="stylesheet" href="/assets/clean/hero-fade.css?v=205" />
    <link rel="stylesheet" href="/assets/liquid-glass/controls.css?v=228" />
    ${player ? "" : '<link rel="stylesheet" href="/assets/clean/experience.css?v=202" />'}
    <link rel="stylesheet" href="/assets/clean/cinema.css?v=207" />
    <link rel="stylesheet" href="/assets/clean/profiles.css?v=209" />
    ${player || active === "social" ? '<link rel="stylesheet" href="/assets/player/player.css?v=211" />' : ""}
    ${active === "social" ? '<link rel="stylesheet" href="/assets/party/party.css?v=205" /><link rel="stylesheet" href="/assets/player/watchroom.css?v=205" />' : ""}
    ${player || partyBrowse ? '<link rel="stylesheet" href="/assets/player/watch-party.css?v=199" />' : ""}
    <link rel="stylesheet" href="/assets/clean/performance.css?v=208" />
</head>
<body class="svCleanShell">

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

  <header class="topbar netflixTopbar" data-sv-liquid-nav>
    <div class="container nav netflixNav">
      <div class="svLiquidPane" data-swifly-glass data-glass-tint="0.2" data-glass-saturation="1" aria-hidden="true"></div>
      <div class="navLeftCluster">
        <a class="brand netflixBrand" href="/" aria-label="${escapeHtml(SITE_NAME)} home">
          <span class="netflixWordmark">${escapeHtml(BRAND_WORDMARK)}</span>
        </a>
        <nav class="navLinks netflixLinks" aria-label="Main navigation">
          ${navLink("/", "Home", "home", active)}
          ${navLink("/movies", "Movies", "movies", active)}
          ${navLink("/tv", "Series", "tv", active)}
          ${navLink("/trending", "Discover", "trending", active)}
          ${navLink("/my-list", "List", "watchlist", active)}
        </nav>
      </div>
      <div class="navRightCluster dsNavActions">
        <button id="svNavSearchToggle" class="svNavButton" type="button" aria-label="Search movies and series" aria-controls="svNavSearchPopup" aria-expanded="false">${cleanIcon("search")}</button>
        <a class="svNavButton svNavPartyLink${active === "social" ? " active" : ""}" href="/social?tab=watchrooms" aria-label="Party Hub" title="Party Hub"${active === "social" ? ' aria-current="page"' : ""}>${cleanIcon("people")}</a>
        <button id="controlToggleTop" class="svNavButton" type="button" aria-label="Open Swifly Studio" aria-haspopup="dialog" aria-controls="controlPanel" aria-expanded="false">${cleanIcon("settings")}</button>
        <details class="dsProfileMenu">
          <summary aria-label="Open profile menu"><span class="profilePill" aria-hidden="true">${cleanIcon("user")}</span></summary>
          <div class="dsProfileDropdown svLiquidDropdown">
            <div class="svLiquidPane" data-swifly-glass data-glass-tint="0.2" data-glass-saturation="1" data-glass-radius="22" aria-hidden="true"></div>
            <a href="/profiles"><span>☺</span><b>Switch profile</b></a>
            <a href="/profiles/manage"><span>✎</span><b>Manage profiles</b></a>
            <a href="/account"><span>⚙</span><b>Account</b></a>
            <a href="/continue-watching"><span>▶</span><b>Continue watching</b></a>
            <a href="/my-list"><span>＋</span><b>My List</b></a>
            <a href="/liked"><span>♡</span><b>Liked titles</b></a>
            <a href="/social"><span>◉</span><b>Social</b></a>
            <a href="/social?tab=watchrooms"><span>◎</span><b>Watch parties</b></a>
            <a href="/browse-by-languages"><span>文</span><b>Languages & genres</b></a>
            <a href="/kids"><span>★</span><b>Kids</b></a>
          </div>
        </details>
      </div>
      <form id="svNavSearchPopup" class="dsNavSearch svSearchPopup" action="/search" method="get" role="search" hidden>
        <input id="svNavSearchInput" type="search" name="q" placeholder="Search movies, series, people…" aria-label="Search movies, series, and people" autocomplete="off" />
        <button type="submit" aria-label="Submit search">${cleanIcon("search")}</button>
      </form>
    </div>
  </header>

  <div class="svBrowseScene" data-sv-browse-scene>
  ${body}

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
  </div>

  <nav class="mobileNav" data-sv-liquid-nav aria-label="Mobile navigation">
    <div class="svLiquidPane" data-swifly-glass data-glass-tint="0.2" data-glass-saturation="1" aria-hidden="true"></div>
    ${navLink("/", "Home", "home", active)}
    ${navLink("/movies", "Movies", "movies", active)}
    ${navLink("/tv", "Series", "tv", active)}
    ${navLink("/trending", "Discover", "trending", active)}
    ${navLink("/my-list", "List", "watchlist", active)}
  </nav>

  ${studioMarkup()}

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
        button.setAttribute("aria-label", (isSaved ? "Remove " : "Add ") + (button.dataset.watchTitle || "title") + (isSaved ? " from My List" : " to My List"));
      });

      document.querySelectorAll("[data-like-id]").forEach((button) => {
        const key = watchKey(button.dataset.likeType || "movie", button.dataset.likeId);
        const isLiked = savedLiked.has(key);
        button.classList.toggle("liked", isLiked);
        button.setAttribute("aria-pressed", isLiked ? "true" : "false");
        button.textContent = isLiked ? "♥" : "♡";
        button.title = isLiked ? "Remove from Liked" : "Like this";
        button.setAttribute("aria-label", (isLiked ? "Unlike " : "Like ") + (button.dataset.likeTitle || "title"));
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
        return;
      }

      const infoButton = event.target.closest("[data-info-url]");
      if (infoButton) {
        event.preventDefault();
        event.stopPropagation();
        const url = infoButton.getAttribute("data-info-url") || "/";
        window.location.href = url;
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
        const title = kind === "liked" ? "No liked titles yet" : "My List is empty";
        const sub = kind === "liked" ? "Tap the heart on any title to save favorites here." : "Tap + on any title to add it to My List.";
        root.innerHTML = '<div class="watchlistEmptyNetflix"><div><strong>' + title + '</strong><span>' + sub + '</span></div></div>';
        return;
      }
      root.innerHTML = list.map((item) => {
        const poster = item.poster ? "https://image.tmdb.org/t/p/w342" + item.poster : (item.backdrop ? "https://image.tmdb.org/t/p/w500" + item.backdrop : "");
        const type = item.type === "tv" ? "tv" : "movie";
        const href = "/watch/" + type + "/" + encodeURIComponent(item.id) + "?mode=movie" + (type === "tv" ? "&s=1&e=1" : "");
        const details = "/" + type + "/" + encodeURIComponent(item.id);
        const title = escapeSaved(item.title || "Untitled");
        const prefix = kind === "liked" ? "like" : "watch";
        const symbol = kind === "liked" ? "♥" : "✓";
        const attrs = Object.entries({ id: item.id, type, title: item.title, poster: item.poster || "", backdrop: item.backdrop || "", rating: item.rating || "", year: item.year || "" })
          .map(([key, value]) => ' data-' + prefix + '-' + key + '="' + escapeSaved(value) + '"').join('');
        return '<article class="movieCard dsCard"><div class="dsCardArtwork">' +
          '<a href="' + details + '" class="posterWrap dsThumb" aria-label="Details for ' + title + '">' +
          (poster ? '<img src="' + escapeSaved(poster) + '" alt="' + title + ' poster" loading="lazy" />' : '<div class="posterFallback"><span>' + title.slice(0,1) + '</span></div>') +
          '<span class="dsPlayDot" aria-hidden="true">ⓘ</span></a>' +
          '<div class="dsCardQuickActions"><button class="dsMiniBtn ' + (kind === "liked" ? "liked" : "saved") + '"' + attrs + ' aria-label="Remove ' + title + ' from ' + (kind === "liked" ? "Liked" : "My List") + '" type="button">' + symbol + '</button>' +
          '<a class="dsMiniBtn dsQuickPlay" href="' + href + '" aria-label="Play ' + title + '">▶</a></div></div>' +
          '<div class="dsCardInfo"><a class="dsCardTitle" href="' + details + '" title="' + title + '">' + title + '</a>' +
          '<div class="dsCardMeta"><span>' + escapeSaved(item.year || "—") + '</span><span>' + (type === "tv" ? "Series" : "Movie") + '</span></div></div></article>';
      }).join("");
    }

    document.getElementById("clearWatchlist")?.addEventListener("click", () => {
      if (!confirm("Clear your saved watchlist in this browser?")) return;
      saveWatchlist([]);
      showToast("My List cleared");
    });

    renderSavedGrid("watchlistGrid", "movieverse.watchlist", "watchlist");
    renderSavedGrid("likedGrid", "movieverse.liked", "liked");

    (function enablePremiumPosterTilt(){
      if (document.body.classList.contains("svCleanShell")) return;
      let raf = null;
      document.addEventListener("pointermove", (event) => {
        const wrap = event.target?.closest?.(".posterWrap");
        if (!wrap || document.body.classList.contains("reduceMotion") || document.body.classList.contains("effect-off") || document.body.classList.contains("effect-calm")) return;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const rect = wrap.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width;
          const py = (event.clientY - rect.top) / rect.height;
          wrap.style.setProperty("--mx", Math.round(px * 100) + "%");
          wrap.style.setProperty("--my", Math.round(py * 100) + "%");
          const maxDetail = document.body.classList.contains("detail-max");
          const tiltAmount = maxDetail ? 11 : 7;
          wrap.style.setProperty("--tilt-x", ((px - .5) * tiltAmount).toFixed(2));
          wrap.style.setProperty("--tilt-y", ((py - .5) * tiltAmount).toFixed(2));
          wrap.style.setProperty("--light-x", ((px * 100).toFixed(1)) + "%");
          wrap.style.setProperty("--light-y", ((py * 100).toFixed(1)) + "%");
        });
      }, { passive: true });

      document.addEventListener("pointerleave", (event) => {
        const wrap = event.target?.closest?.(".posterWrap");
        if (!wrap) return;
        wrap.style.removeProperty("--tilt-x");
        wrap.style.removeProperty("--tilt-y");
      }, true);

      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add("isRevealed");
          });
        }, { threshold: .08 });

        document.querySelectorAll(".movieCard, .dsRow, .dsMovieHomeBoard, .sectionHead").forEach((el) => {
          el.classList.add("v111Reveal");
          observer.observe(el);
        });
      }
    })();

    if (typeof syncWatchButtons === "function") syncWatchButtons();

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
        (section.querySelector(".svSectionActions") || section).appendChild(controls);

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

        function moveRail(direction) {
          if (window.SwiflyMotion) window.SwiflyMotion.scrollBy(rail, {left:direction * rail.clientWidth * .88});
          else rail.scrollBy({left:direction * rail.clientWidth * .88, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        }
        controls.children[0].addEventListener('click', () => moveRail(-1));
        controls.children[1].addEventListener('click', () => moveRail(1));
        rail.addEventListener('scroll', updateProgress, { passive: true });
        window.addEventListener('resize', updateProgress, { passive: true });
        updateProgress();
      });
    })();
  </script>


  <script>
    (function swiflytvAnimations(){
      if (document.body.classList.contains("svCleanShell")) return;
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

      if (document.body.classList.contains('svCleanShell')) return;
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
        window.dispatchEvent(new Event("swifly:continue-change"));
      }

      function addContinueFromButton(button) {
        const type = button.dataset.playType || "movie";
        const id = String(button.dataset.playId || "");
        if (!id) return;

        const key = continueKey(type, id);
        const previous = readContinue().find((item) => item.key === key) || {};
        const list = readContinue().filter((item) => item.key !== key);
        list.unshift({
          ...previous,
          key,
          type,
          id,
          title: button.dataset.playTitle || "Untitled",
          poster: button.dataset.playPoster || "",
          backdrop: button.dataset.playBackdrop || "",
          rating: button.dataset.playRating || "",
          year: button.dataset.playYear || "",
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


  <script>
    window.swiflyToast = window.swiflyToast || function(message, type) {
      try {
        if (window.Notyf) {
          window.__swiflyNotyf = window.__swiflyNotyf || new Notyf({
            duration: 1800,
            position: { x: "right", y: "bottom" },
            types: [
              { type: "info", background: "#2563eb", icon: false },
              { type: "success", background: "#16a34a", icon: false },
              { type: "error", background: "#dc2626", icon: false }
            ]
          });
          window.__swiflyNotyf.open({ type: type || "success", message: String(message || "Done") });
          return;
        }
      } catch {}
      console.log("[SwiflyTV]", message);
    };

    window.swiflyCopy = window.swiflyCopy || async function(text) {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        swiflyToast("Copied");
        return true;
      } catch {
        var area = document.createElement("textarea");
        area.value = String(text || "");
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try { document.execCommand("copy"); swiflyToast("Copied"); return true; }
        catch { swiflyToast("Copy failed", "error"); return false; }
        finally { area.remove(); }
      }
    };

    document.addEventListener("click", function(event) {
      var button = event.target.closest("button, a");
      if (!button || button.classList.contains("no-press")) return;
      button.classList.add("is-pressing");
      setTimeout(function(){ button.classList.remove("is-pressing"); }, 160);
    }, true);
  </script>

  <script>
    (function swiflyTvFocusNavigation(){
      if (window.__swiflyTvFocusNavigationLoaded) return;
      window.__swiflyTvFocusNavigationLoaded = true;

      var enabled = localStorage.getItem("swiflytv.tvFocusMode") === "true" ||
        localStorage.getItem("swiflytv.tvControllerMode") === "true";

      var focused = null;
      var hint = null;
      var raf = null;
      var lastFrame = performance.now();
      var lastButtons = {};
      var lastMoveAt = 0;
      var lastAxisDirection = "";
      var axisRepeatStartedAt = 0;
      var lastScrollAt = 0;
      var hintTimer = null;

      var FOCUSABLE_SELECTOR = [
        "a[href]",
        "summary",
        "button:not([disabled])",
        "input:not([disabled])",
        "textarea:not([disabled])",
        "select:not([disabled])",
        "[role='button']",
        "[role='link']",
        "[tabindex]:not([tabindex='-1'])",
        "video",
        ".movieCard",
        ".posterCard",
        ".nfCard",
        ".topTenPoster",
        ".dsCustomControlRow button",
        "#roomMoviePlayerSyncBtn",
        "#roomMovieProgress",
        "#roomMovieVolume"
      ].join(",");

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function ensureHint() {
        if (!hint) {
          hint = document.createElement("div");
          hint.id = "swiflyTvHint";
          hint.innerHTML = "<b>TV Mode:</b> D-pad moves • Select clicks • Back goes back • Menu fullscreen";
          document.body.appendChild(hint);
        }
      }

      function showHint(reason) {
        ensureHint();
        if (reason) {
          hint.innerHTML = "<b>TV Mode:</b> " + escapeHtml(reason) + " • D-pad moves • Select clicks • Back goes back";
        }
        clearTimeout(hintTimer);
        hintTimer = setTimeout(function(){
          if (hint) hint.innerHTML = "<b>TV Mode:</b> D-pad moves • Select clicks • Back goes back • Menu fullscreen";
        }, 2600);
      }

      function activeModal() {
        var focusedModal = document.activeElement && document.activeElement.closest("dialog[open]");
        return focusedModal || document.querySelector(".svStudioDialog[open]") ||
          Array.from(document.querySelectorAll("dialog[open]")).pop() || null;
      }

      function isVisible(el) {
        if (!el || !el.isConnected) return false;
        var modal = activeModal();
        if (modal && !modal.contains(el)) return false;
        var r = el.getBoundingClientRect();
        var style = getComputedStyle(el);
        return r.width > 6 &&
          r.height > 6 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < window.innerHeight &&
          r.left < window.innerWidth &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || 1) > 0.05;
      }

      function getFocusable() {
        var root = activeModal() || document;
        return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
          .filter(function(el) {
            if (!isVisible(el)) return false;
            if (el.closest("[hidden], [aria-hidden='true']")) return false;
            if (el.disabled) return false;
            return true;
          });
      }

      function centerOf(el) {
        var r = el.getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          rect: r
        };
      }

      function clearFocus() {
        if (focused && focused.classList) {
          focused.classList.remove("swifly-tv-focus-target", "swifly-tv-focus-pressed");
        }
        focused = null;
      }

      function setFocus(el, options) {
        if (!el || !isVisible(el)) return false;
        if (focused === el) return true;

        clearFocus();
        focused = el;
        focused.classList.add("swifly-tv-focus-target");

        try { focused.focus?.({ preventScroll: true }); } catch {}

        if (!options || options.scroll !== false) {
          try {
            focused.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          } catch {
            focused.scrollIntoView?.();
          }
        }

        return true;
      }

      function firstFocus() {
        var active = document.activeElement;
        if (active && active !== document.body && isVisible(active) && active.matches?.(FOCUSABLE_SELECTOR)) {
          return setFocus(active);
        }

        var all = getFocusable();
        if (!all.length) return false;

        var preferred = all.find(function(el) {
          return el.matches(".active, [aria-current='page'], .is-active, .selected");
        }) || all[0];

        return setFocus(preferred);
      }

      function setEnabled(value, reason) {
        enabled = Boolean(value);
        localStorage.setItem("swiflytv.tvFocusMode", enabled ? "true" : "false");
        localStorage.removeItem("swiflytv.tvControllerMode");

        document.body.classList.toggle("swifly-tv-focus-mode", enabled);
        document.body.classList.remove("swifly-tv-controller-mode");

        ensureHint();

        var oldCursor = document.getElementById("swiflyTvCursor");
        if (oldCursor) oldCursor.remove();

        if (enabled) {
          showHint(reason || "TV focus mode enabled");
          firstFocus();
          startLoop();
        } else {
          clearFocus();
          cancelAnimationFrame(raf);
          raf = null;
        }
      }

      function directionFromAxes(x, y) {
        var dead = 0.34;
        if (Math.abs(x) < dead && Math.abs(y) < dead) return "";
        if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
        return y > 0 ? "down" : "up";
      }

      function moveFocus(direction, force) {
        if (!enabled) setEnabled(true, "TV focus mode enabled");
        if (!focused || !isVisible(focused)) firstFocus();
        if (!focused) return;

        var now = Date.now();
        if (!force && now - lastMoveAt < 135) return;
        lastMoveAt = now;

        var current = centerOf(focused);
        var candidates = getFocusable().filter(function(el) { return el !== focused; });
        var best = null;
        var bestScore = Infinity;

        candidates.forEach(function(el) {
          var c = centerOf(el);
          var dx = c.x - current.x;
          var dy = c.y - current.y;
          var absX = Math.abs(dx);
          var absY = Math.abs(dy);

          if (direction === "left" && dx >= -8) return;
          if (direction === "right" && dx <= 8) return;
          if (direction === "up" && dy >= -8) return;
          if (direction === "down" && dy <= 8) return;

          var primary = direction === "left" || direction === "right" ? absX : absY;
          var secondary = direction === "left" || direction === "right" ? absY : absX;

          // Fire TV-like behavior: prefer items lined up in the requested direction.
          var alignmentPenalty = secondary * 2.2;
          var distancePenalty = primary * 1.05;
          var diagonalPenalty = secondary > primary * 1.6 ? 1200 : 0;
          var score = distancePenalty + alignmentPenalty + diagonalPenalty;

          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        });

        if (best) {
          setFocus(best);
          return;
        }

        if (direction === "up") scrollByAmount(0, -360);
        if (direction === "down") scrollByAmount(0, 360);
        if (direction === "left") scrollByAmount(-360, 0);
        if (direction === "right") scrollByAmount(360, 0);

        setTimeout(function(){ firstVisibleAfterScroll(direction); }, 160);
      }

      function firstVisibleAfterScroll(direction) {
        var all = getFocusable();
        if (!all.length) return;

        var current = focused && isVisible(focused) ? centerOf(focused) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        var best = null;
        var bestScore = Infinity;

        all.forEach(function(el) {
          var c = centerOf(el);
          var score = Math.abs(c.x - current.x) + Math.abs(c.y - current.y);
          if (direction === "down") score += c.y < current.y ? 1000 : 0;
          if (direction === "up") score += c.y > current.y ? 1000 : 0;
          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        });

        if (best) setFocus(best, { scroll: false });
      }

      function scrollByAmount(dx, dy) {
        var now = Date.now();
        if (now - lastScrollAt < 20) return;
        lastScrollAt = now;

        var base = focused || document.activeElement;
        var scrollParent = base;

        while (scrollParent && scrollParent !== document.body) {
          var style = getComputedStyle(scrollParent);
          var canScrollY = /(auto|scroll)/.test(style.overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight + 4;
          var canScrollX = /(auto|scroll)/.test(style.overflowX) && scrollParent.scrollWidth > scrollParent.clientWidth + 4;
          if (canScrollY || canScrollX) {
            scrollParent.scrollBy({ left: dx, top: dy, behavior: "auto" });
            return;
          }
          scrollParent = scrollParent.parentElement;
        }

        window.scrollBy({ left: dx, top: dy, behavior: "auto" });
      }

      function clickFocused() {
        if (!enabled) setEnabled(true, "TV focus mode enabled");
        if (!focused || !isVisible(focused)) firstFocus();
        if (!focused) return;

        focused.classList.add("swifly-tv-focus-pressed");
        setTimeout(function(){ focused && focused.classList.remove("swifly-tv-focus-pressed"); }, 140);

        try { focused.focus?.({ preventScroll: true }); } catch {}

        if (focused.tagName === "VIDEO") {
          if (focused.paused) focused.play?.().catch(function(){});
          else focused.pause?.();
          return;
        }

        if (focused.matches("input, textarea, select")) {
          focused.click();
          return;
        }

        focused.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }

      function goBack() {
        var modal = activeModal();
        if (modal && modal.matches(".svDetailDialog, .svStudioDialog, .sv100CallModal, .svWatchPartyDialog")) {
          if (modal.matches(".svDetailDialog") && window.SwiflyDetails) window.SwiflyDetails.back();
          else modal.close();
          return;
        }
        var backLink = document.querySelector("[data-sv-player-back], .svDetailPage [data-sv-details-back]");
        if (backLink) { backLink.click(); return; }
        if (history.length > 1) history.back();
        else location.href = "/";
      }

      function focusSearch() {
        var search = document.querySelector("input[type='search'], input[name='q'], input[placeholder*='Search' i], .searchInput");
        if (search && isVisible(search)) {
          setFocus(search);
          try { search.focus(); } catch {}
        } else {
          showHint("No search box on this page");
        }
      }

      function tryMenu() {
        var menu = document.querySelector(".mobileMenuButton, [aria-label*='menu' i], [data-menu], .menu button, nav a");
        if (menu && isVisible(menu)) {
          setFocus(menu);
          clickFocused();
        }
      }

      function toggleFullscreen() {
        var target = document.querySelector(".dsRoomMovieStage, .dsWatchShell, .watchPlayer, main") || document.documentElement;
        if (!document.fullscreenElement) target.requestFullscreen?.();
        else document.exitFullscreen?.();
      }

      function buttonPressed(gamepad, index) {
        return Boolean(gamepad && gamepad.buttons && gamepad.buttons[index] && gamepad.buttons[index].pressed);
      }

      function onButtonEdge(gamepad, index, key, callback) {
        var pressed = buttonPressed(gamepad, index);
        if (pressed && !lastButtons[key]) callback();
        lastButtons[key] = pressed;
      }

      function processGamepad(gamepad) {
        if (!gamepad) return;

        var dir = "";

        if (buttonPressed(gamepad, 12)) dir = "up";
        else if (buttonPressed(gamepad, 13)) dir = "down";
        else if (buttonPressed(gamepad, 14)) dir = "left";
        else if (buttonPressed(gamepad, 15)) dir = "right";
        else dir = directionFromAxes(Number(gamepad.axes?.[0] || 0), Number(gamepad.axes?.[1] || 0));

        var now = Date.now();
        if (dir) {
          if (dir !== lastAxisDirection) {
            lastAxisDirection = dir;
            axisRepeatStartedAt = now;
            moveFocus(dir, true);
          } else if (now - axisRepeatStartedAt > 340) {
            moveFocus(dir, false);
          }
        } else {
          lastAxisDirection = "";
          axisRepeatStartedAt = 0;
        }

        var scrollX = 0;
        var scrollY = 0;
        var rx = Math.abs(Number(gamepad.axes?.[2] || 0)) > 0.25 ? Number(gamepad.axes?.[2] || 0) : 0;
        var ry = Math.abs(Number(gamepad.axes?.[3] || 0)) > 0.25 ? Number(gamepad.axes?.[3] || 0) : 0;
        scrollX += rx * 42;
        scrollY += ry * 42;
        if (buttonPressed(gamepad, 4)) scrollY -= 46;
        if (buttonPressed(gamepad, 5)) scrollY += 46;
        if (scrollX || scrollY) scrollByAmount(scrollX, scrollY);

        onButtonEdge(gamepad, 0, "a", clickFocused);       // A / Cross
        onButtonEdge(gamepad, 1, "b", goBack);             // B / Circle
        onButtonEdge(gamepad, 2, "x", focusSearch);        // X / Square
        onButtonEdge(gamepad, 3, "y", tryMenu);            // Y / Triangle
        onButtonEdge(gamepad, 8, "select", function(){ showHint("D-pad moves • A selects • B goes back • Start fullscreen"); });
        onButtonEdge(gamepad, 9, "start", toggleFullscreen);
        onButtonEdge(gamepad, 16, "home", function(){ location.href = "/"; });
      }

      function loop(now) {
        raf = null;
        if (!enabled || document.hidden) return;

        var pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        if (!pads.length) return;

        if (!focused || !isVisible(focused)) firstFocus();

        processGamepad(pads[0]);

        lastFrame = now;
        if (enabled && !document.hidden) raf = requestAnimationFrame(loop);
      }

      function startLoop() {
        if (enabled && !document.hidden && !raf) {
          lastFrame = performance.now();
          raf = requestAnimationFrame(loop);
        }
      }

      window.addEventListener("gamepadconnected", function(event) {
        setEnabled(true, (event.gamepad && event.gamepad.id ? event.gamepad.id : "Controller") + " connected");
      });

      window.addEventListener("gamepaddisconnected", function() {
        showHint("Controller disconnected");
      });

      document.addEventListener("visibilitychange", function() {
        if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
        else startLoop();
      });

      document.addEventListener("keydown", function(event) {
        var key = event.key;
        var modal = activeModal();
        if (modal && key !== "F8" && (key === "Escape" || !enabled)) return;
        // Keep typing, native buttons, and popup menus usable in the compact header.
        var studioSwitch = event.target?.closest?.(".svStudioDialog input[type=checkbox][data-st-setting]");
        if (key !== "F8" && !studioSwitch && event.target?.closest?.("input, textarea, select, [contenteditable=true], .netflixNav")) return;

        if (key === "F8") {
          setEnabled(!enabled, enabled ? "TV mode disabled" : "TV mode enabled");
          event.preventDefault();
          return;
        }

        if (!enabled && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Backspace"].includes(key)) {
          setEnabled(true, "TV focus mode enabled");
        }

        if (!enabled) return;

        if (key === "ArrowUp") { moveFocus("up", true); event.preventDefault(); }
        else if (key === "ArrowDown") { moveFocus("down", true); event.preventDefault(); }
        else if (key === "ArrowLeft") { moveFocus("left", true); event.preventDefault(); }
        else if (key === "ArrowRight") { moveFocus("right", true); event.preventDefault(); }
        else if (key === "Enter" || key === " ") { clickFocused(); event.preventDefault(); }
        else if (key === "Escape" || key === "Backspace") { goBack(); event.preventDefault(); }
        else if (key.toLowerCase() === "f") { toggleFullscreen(); event.preventDefault(); }
        else if (key === "/") { focusSearch(); event.preventDefault(); }
      }, true);

      document.addEventListener("focusin", function(event) {
        if (!enabled) return;
        if (event.target && event.target.matches && event.target.matches(FOCUSABLE_SELECTOR)) {
          setFocus(event.target, { scroll: false });
        }
      });

      document.addEventListener("DOMContentLoaded", function() {
        var oldCursor = document.getElementById("swiflyTvCursor");
        if (oldCursor) oldCursor.remove();

        ensureHint();
        if (enabled) setEnabled(true, "TV mode restored");
        startLoop();
      });

      setInterval(function() {
        if (document.hidden || !navigator.getGamepads) return;
        var pads = Array.from(navigator.getGamepads()).filter(Boolean);
        if (pads.length && !enabled) setEnabled(true, "Controller detected");
      }, 1500);
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
  const detailsHref = `/${type}/${encodeURIComponent(id)}`;
  const watchHref = `/watch/${type}/${encodeURIComponent(id)}?mode=movie${type === "tv" ? "&s=1&e=1" : ""}`;
  const poster = item.poster_path ? img(item.poster_path, "w342") : img(item.backdrop_path, "w500");
  return `<article class="movieCard dsCard" data-title="${escapeHtml(title.toLowerCase())}">
    <div class="dsCardArtwork">
      <a href="${detailsHref}" class="posterWrap dsThumb" aria-label="Details for ${escapeHtml(title)}">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)} poster" loading="lazy" decoding="async" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
        <span class="dsPlayDot" aria-hidden="true">${cleanIcon("info")}</span>
      </a>
      <div class="dsCardQuickActions">
        <a class="dsMiniBtn dsQuickPlay" href="${watchHref}" aria-label="Play ${escapeHtml(title)}" ${mediaDataAttributes("play", item, type)}>${cleanIcon("play")}</a>
        <button class="dsMiniBtn" type="button" aria-label="Add ${escapeHtml(title)} to My List" ${mediaDataAttributes("watch", item, type)}>＋</button>
        <button class="dsMiniBtn dsHeartBtn" type="button" aria-label="Like ${escapeHtml(title)}" ${mediaDataAttributes("like", item, type)}>♡</button>
      </div>
    </div>
    <div class="dsCardInfo">
      <a class="dsCardTitle" href="${detailsHref}" title="${escapeHtml(title)}">${escapeHtml(title)}</a>
      <div class="dsCardMeta"><span>${escapeHtml(getYear(getDate(item)))}</span><span>${type === "tv" ? "Series" : "Movie"}</span></div>
    </div>
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
  const thumbUrl = item.poster_path ? img(item.poster_path, "w342") : img(item.backdrop_path, "w500");
  const href = `/signup?redirect=/${type}/${encodeURIComponent(id)}`;

  return `<article class="dsWelcomeCard">
    <a href="${href}" aria-label="Sign up to watch ${escapeHtml(title)}">
      ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)} preview" width="342" height="513" loading="lazy" decoding="async" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
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
      <a href="/signup">Browse all</a>
    </div>
    <div class="dsWelcomeRailTrack">${cards}</div>
  </section>`;
}


async function welcomePage(req, res) {
  const [trendingMovies, popularMovies, popularTv] = await Promise.all([
    tmdb("/trending/movie/week", {}, CACHE_TTL.short),
    tmdb("/movie/popular", {}, CACHE_TTL.medium),
    tmdb("/tv/popular", {}, CACHE_TTL.medium),
  ]);
  const hero = pickHero([...(trendingMovies.results || []), ...(popularMovies.results || [])]);
  const redirect = encodeURIComponent(String(req.query.redirect || "/profiles"));
  const body = welcomeMarkup({
    siteName: SITE_NAME, brand: BRAND_WORDMARK, redirect, hero,
    trendingMovies: trendingMovies.results || [], popularMovies: popularMovies.results || [], popularTv: popularTv.results || [],
    renderRail: welcomePreviewRail, backdropUrl: fullBackdrop, posterUrl: value => img(value, "w342")
  });
  res.send(pageShell({ title: `${SITE_NAME} — Welcome`, active: "welcome", body }));
}

async function homePage(req, res) {
  const [trendingMovies, trendingTv, popularMovies, popularTv, topMovies, topTv, nowPlaying] = await Promise.all([
    tmdb("/trending/movie/week", {}, CACHE_TTL.short),
    tmdb("/trending/tv/week", {}, CACHE_TTL.short),
    tmdb("/movie/popular", {}, CACHE_TTL.medium),
    tmdb("/tv/popular", {}, CACHE_TTL.medium),
    tmdb("/movie/top_rated", {}, CACHE_TTL.medium),
    tmdb("/tv/top_rated", {}, CACHE_TTL.medium),
    tmdb("/movie/now_playing", {}, CACHE_TTL.short),
  ]);
  const sources = [trendingMovies, trendingTv, popularMovies, popularTv, topMovies, topTv, nowPlaying];
  if (sources.every(data => data.__error)) return res.send(setupNeededPage(sources[0].message));
  const hero = pickHero([...(trendingMovies.results || []), ...(popularMovies.results || []), ...(trendingTv.results || []).map(item => ({ ...item, media_type: "tv" }))]);
  const body = `<main>
    ${hero.id ? dsHero({ hero, context: "Featured" }) : dsPageHeader("Discover", "Explore movies and series.")}
    <section class="dsContent ${hero.id ? "" : "noHero"}">
      <section id="continueWatchingSection" class="svResumeSection" hidden>
        <div class="svSectionHead"><h2>Continue watching</h2><div class="svSectionActions"><a class="svRowMore" href="/continue-watching">View all</a><div class="svRowArrows"><button class="svRowArrow" type="button" data-continue-scroll="-1" aria-label="Scroll Continue Watching left">‹</button><button class="svRowArrow" type="button" data-continue-scroll="1" aria-label="Scroll Continue Watching right">›</button></div></div></div>
        <div id="continueWatchingRail" class="svResumeRail" aria-label="Continue Watching titles"></div>
      </section>
      ${dsRail("Trending movies", trendingMovies.results || [], "movie", { viewHref: "/trending?type=movie" })}
      ${dsRail("Trending series", trendingTv.results || [], "tv", { viewHref: "/trending?type=tv" })}
      ${dsRail("Popular movies", popularMovies.results || [], "movie", { viewHref: "/movies" })}
      ${dsRail("Popular series", popularTv.results || [], "tv", { viewHref: "/tv" })}
      ${dsRail("Top rated movies", topMovies.results || [], "movie", { viewHref: "/movies?sort=top_rated" })}
      ${dsRail("Top rated series", topTv.results || [], "tv", { viewHref: "/tv?sort=top_rated" })}
      ${dsRail("New releases", nowPlaying.results || [], "movie", { viewHref: "/movies?sort=now_playing" })}
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

function dsHero({ hero = {}, type = "", context = "", eyebrow = "", trailer = null, embedOrigin = "" }) {
  const mediaType = type || getType(hero);
  const title = getTitle(hero);
  const href = `/${mediaType}/${encodeURIComponent(hero.id || "")}`;
  const bg = fullBackdrop(hero.backdrop_path || hero.poster_path);
  const spillSrc = img(hero.backdrop_path || hero.poster_path, "w300");
  const desc = hero.overview || "Discover this title, explore the cast, and add it to your list.";
  const maturity = mediaType === "tv" ? "TV-14" : "PG-13";
  const trailerKey = trailer && trailer.key ? String(trailer.key) : "";
  const trailerSrc = trailerKey ? youtubeHeroAutoplaySrc(trailerKey, embedOrigin) : "";
  return `<section class="dsHero ${trailerSrc ? "dsHeroHasTrailer" : ""}">
    <div class="dsHeroArt" aria-hidden="true"><div class="dsHeroBg" style="background-image:url('${escapeHtml(bg)}')"></div></div>
    ${trailerSrc ? `<div class="dsHeroTrailerLayer" aria-hidden="true">
      <iframe id="dsHeroTrailerFrame" class="dsHeroTrailerFrame" src="${escapeHtml(trailerSrc)}" title="${escapeHtml(title)} muted trailer preview" loading="eager" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
    <div class="dsHeroTrailerPill"><span id="dsHeroTrailerPillText">Trailer preview</span></div>` : ""}
    <div class="dsHeroGlass"></div>
    <div class="dsHeroContent">
      <div class="dsEyebrow">${escapeHtml(eyebrow || context || BRAND_SUBMARK)}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="dsHeroMeta">${Number(hero.vote_average) > 0 ? `<b>★ ${escapeHtml(formatRating(hero.vote_average))}<small>/10</small></b>` : ""}<span>${escapeHtml(getYear(getDate(hero)))}</span><span>${mediaType === "tv" ? "Series" : "Movie"}</span>${hero.runtime ? `<span>${escapeHtml(formatRuntime(hero.runtime))}</span>` : ""}</div>
      <p>${escapeHtml(desc)}</p>
      <div class="dsHeroActions">
        <a class="dsPrimaryBtn" href="/watch/${mediaType}/${encodeURIComponent(hero.id || "")}?mode=movie${mediaType === "tv" ? "&s=1&e=1" : ""}" data-play-id="${escapeHtml(hero.id || "")}" data-play-type="${escapeHtml(mediaType)}" data-play-title="${escapeHtml(title)}" data-play-poster="${escapeHtml(hero.poster_path || "")}" data-play-backdrop="${escapeHtml(hero.backdrop_path || "")}" data-play-rating="${escapeHtml(formatRating(hero.vote_average))}" data-play-year="${escapeHtml(getYear(getDate(hero)))}"><span>▶</span> Play</a>
        <a class="dsSecondaryBtn" href="${href}">Details</a>
        <button class="dsIconBtn" type="button" aria-label="Add ${escapeHtml(title)} to My List" ${mediaDataAttributes("watch", hero, mediaType)}>＋</button>
      </div>
    </div>
    ${trailerSrc ? `<div class="dsHeroRating"><button id="dsHeroMuteToggle" class="dsHeroMuteToggle" type="button" aria-label="Unmute trailer" aria-pressed="true" data-hero-mute-toggle><span aria-hidden="true">🔇</span></button></div>` : ""}
    ${trailerSrc ? `<script>
      (function swiflyHeroTrailerMuteControl(){
        var iframe = document.getElementById("dsHeroTrailerFrame");
        var button = document.getElementById("dsHeroMuteToggle");
        var pill = document.getElementById("dsHeroTrailerPillText");
        var hero = iframe && iframe.closest ? iframe.closest(".dsHero") : null;
        if (!iframe || !button) return;

        var muted = true;
        var player = null;
        var ready = false;
        var desiredVolume = 70;

        function setVisualState() {
          var icon = button.querySelector("span");
          if (icon) icon.textContent = muted ? "🔇" : "🔊";
          button.setAttribute("aria-label", muted ? "Unmute trailer" : "Mute trailer");
          button.setAttribute("aria-pressed", muted ? "true" : "false");
          button.classList.toggle("isUnmuted", !muted);
          if (pill) pill.textContent = muted ? "Muted trailer preview" : "Trailer sound on";
        }

        function setTrailerPlaying(isPlaying) {
          if (!hero) return;
          if (isPlaying) {
            hero.classList.add("dsHeroTrailerIsPlaying");
          }
          hero.classList.remove("dsHeroTrailerWaiting");
        }

        function sendCommand(command, args) {
          try {
            iframe.contentWindow.postMessage(JSON.stringify({
              event: "command",
              func: command,
              args: args || []
            }), "https://www.youtube.com");
          } catch {}
        }

        function applyAudioState() {
          setVisualState();

          if (player && ready) {
            try {
              if (muted) {
                player.mute();
              } else {
                player.unMute();
                player.setVolume(desiredVolume);
                player.playVideo();
              }
              return;
            } catch {}
          }

          sendCommand(muted ? "mute" : "unMute");
          if (!muted) {
            sendCommand("setVolume", [desiredVolume]);
            sendCommand("playVideo");
          }
        }

        function bootPlayer() {
          if (player || !window.YT || !window.YT.Player) return;
          try {
            player = new window.YT.Player("dsHeroTrailerFrame", {
              events: {
                onReady: function(event) {
                  ready = true;
                  setTrailerPlaying(false);
                  try {
                    event.target.mute();
                    event.target.playVideo();
                  } catch {}
                  applyAudioState();
                },
                onStateChange: function(event) {
                  var state = event && typeof event.data === "number" ? event.data : null;
                  var playing = window.YT && window.YT.PlayerState ? window.YT.PlayerState.PLAYING : 1;
                  setTrailerPlaying(state === playing);
                  if (state === playing && pill && muted) {
                    pill.textContent = "Muted trailer preview";
                  }
                }
              }
            });
          } catch {}
        }

        function ensureYouTubeApi() {
          if (window.YT && window.YT.Player) {
            bootPlayer();
            return;
          }

          window.__swiflyYouTubeReadyCallbacks = window.__swiflyYouTubeReadyCallbacks || [];
          if (!window.__swiflyYouTubeReadyCallbacks._swiflyPatched) {
            var oldReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function() {
              if (typeof oldReady === "function") {
                try { oldReady(); } catch {}
              }
              (window.__swiflyYouTubeReadyCallbacks || []).splice(0).forEach(function(callback) {
                try { callback(); } catch {}
              });
            };
            window.__swiflyYouTubeReadyCallbacks._swiflyPatched = true;
          }

          window.__swiflyYouTubeReadyCallbacks.push(bootPlayer);

          if (!document.querySelector('script[data-swifly-youtube-api="true"]')) {
            var tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            tag.async = true;
            tag.dataset.swiflyYoutubeApi = "true";
            document.head.appendChild(tag);
          }
        }

        button.addEventListener("click", function(event) {
          event.preventDefault();
          event.stopPropagation();
          muted = !muted;
          applyAudioState();
          ensureYouTubeApi();
        });

        setVisualState();
        setTrailerPlaying(false);
        ensureYouTubeApi();

        // Fallback reveal: YouTube sometimes does not fire PLAYING reliably in embedded/autoplay cases.
        // This keeps the hero trailer visible instead of hiding it forever.
        window.setTimeout(function() {
          setTrailerPlaying(true);
        }, 2600);
      })();
    </script>` : ""}
  </section>
  <div class="svHeroLightBridge" aria-hidden="true">${spillSrc ? `<div class="svHeroSpill"><img src="${escapeHtml(spillSrc)}" alt="" width="300" height="169" decoding="async" fetchpriority="low" /></div>` : ""}</div>`;
}


function dsCleanSpotlight(item = {}, forcedType = "movie") {
  if (!item || !item.id) return "";
  const type = forcedType || getType(item);
  const title = getTitle(item);
  const href = `/${type}/${encodeURIComponent(item.id)}`;
  const backdropUrl = item.backdrop_path ? fullBackdrop(item.backdrop_path) : img(item.poster_path, "w780");
  const posterUrl = item.poster_path ? img(item.poster_path, "w500") : "";
  const year = getYear(getDate(item));
  const score = formatRating(item.vote_average);
  const overview = item.overview || "A featured pick for your next SwiflyTV watch night.";
  const match = metaMatch(item);
  return `<section class="dsRow dsCleanSpotlightSection">
    <div class="dsRowHead dsCleanSpotlightHead">
      <h2>Featured Movie Spotlight</h2>
      <span class="dsRowTag">Curated</span>
    </div>
    <article class="dsCleanSpotlightCard">
      ${backdropUrl ? `<img class="dsCleanSpotlightBg" src="${escapeHtml(backdropUrl)}" alt="" loading="lazy" />` : ""}
      <div class="dsCleanSpotlightVeil"></div>
      <div class="dsCleanSpotlightContent">
        <span class="dsCleanKicker">Tonight's pick</span>
        <h3>${escapeHtml(title)}</h3>
        <div class="dsCleanMeta">
          <b>${escapeHtml(match)}</b>
          <span>${escapeHtml(year)}</span>
          <span>${escapeHtml(type === "tv" ? "TV" : "Movie")}</span>
          <span>★ ${escapeHtml(score)}</span>
        </div>
        <p>${escapeHtml(overview).slice(0, 190)}${overview.length > 190 ? "…" : ""}</p>
        <div class="dsCleanActions">
          <a class="dsPrimaryBtn" href="${href}" data-play-id="${escapeHtml(item.id)}" data-play-type="${escapeHtml(type)}" data-play-title="${escapeHtml(title)}" data-play-poster="${escapeHtml(item.poster_path || "")}" data-play-backdrop="${escapeHtml(item.backdrop_path || "")}" data-play-rating="${escapeHtml(score)}" data-play-year="${escapeHtml(year)}"><span>▶</span> Watch</a>
          <a class="dsSecondaryBtn" href="${href}"><span>ⓘ</span> Details</a>
        </div>
      </div>
      <div class="dsCleanSpotlightPoster">
        ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)} poster" loading="lazy" />` : `<div class="posterFallback"><span>${escapeHtml(title.slice(0, 1))}</span></div>`}
      </div>
    </article>
  </section>`;
}


function dsRail(title, items = [], type = "", options = {}) {
  const cards = (items || []).slice(0, options.limit || 18).map((item) => movieCard(item, type)).join("");
  if (!cards) return "";
  const more = options.viewHref ? `<a class="svRowMore" href="${escapeHtml(options.viewHref)}">View all</a>` : "";
  return `<section class="dsRow svCatalogRow">
    <div class="svSectionHead"><h2>${escapeHtml(title)}</h2><div class="svSectionActions">${more}</div></div>
    <div class="movieRail dsRail">${cards}</div>
  </section>`;
}

function dsTopRail(title, items = [], type = "") {
  return dsRail(title, items, type, { limit: 10 });
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
  const partyBrowse = type === "movie" && req.query.party === "1";
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
  const categoryOne = type === "tv" ? "Popular Drama Shows" : "Action Movies";
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
      ${partyBrowse ? partyBrowseMarkup() : ""}
      ${dsRail(categoryOne, rowOne.results || [], type)}
      ${dsTopRail(type === "tv" ? "Top 10 TV Shows Today" : "Top Movies Today", data.results || [], type)}
      ${dsRail(categoryTwo, rowTwo.results || [], type)}
      ${dsRail(categoryThree, rowThree.results || [], type)}
      ${dsRail(categoryFour, rowFour.results || [], type)}
      ${dsRail(`${label} A-Z`, data.results || [], type)}
    </section>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — ${label}`, active, body, partyBrowse }));
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
      ${dsRail("Trending Now", (data.results || []).filter((item) => ["movie", "tv"].includes(getType(item))), type === "all" ? "" : type, { tag: "Live" })}
      ${dsTopRail("Top Movies Today", popularMovies.results || [], "movie")}
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

function normalizeYouTubeVideoKey(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.searchParams.get("v")) return parsed.searchParams.get("v").trim();
      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.indexOf("embed");
      const shortsIndex = parts.indexOf("shorts");
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1].trim();
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1].trim();
    }

    if (host === "youtu.be" && parsed.pathname) {
      return parsed.pathname.split("/").filter(Boolean)[0] || "";
    }
  } catch {}

  return raw
    .replace(/^.*youtube\.com\/watch\?v=/i, "")
    .replace(/^.*youtu\.be\//i, "")
    .split("&")[0]
    .split("?")[0]
    .trim();
}

function youtubeEmbedOrigin(req) {
  const configured = String(
    process.env.YOUTUBE_EMBED_ORIGIN ||
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  ).trim().replace(/\/$/, "");

  if (configured) return configured;

  if (req && req.get) {
    const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim() || "https";
    const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    if (host) return `${proto}://${host}`;
  }

  return "";
}

function withYouTubeIdentityParams(urlString = "", origin = "") {
  const cleanOrigin = String(origin || "").trim().replace(/\/$/, "");
  try {
    const url = new URL(urlString);
    if (cleanOrigin) {
      url.searchParams.set("origin", cleanOrigin);
      url.searchParams.set("widget_referrer", cleanOrigin);
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function youtubeWatchUrl(videoKey = "") {
  const key = encodeURIComponent(normalizeYouTubeVideoKey(videoKey));
  return key ? `https://www.youtube.com/watch?v=${key}` : "";
}

function youtubeEmbedSrc(videoKey = "", origin = "") {
  const key = encodeURIComponent(normalizeYouTubeVideoKey(videoKey));
  if (!key) return "";
  return withYouTubeIdentityParams(
    `https://www.youtube.com/embed/${key}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
    origin
  );
}

function youtubeHeroAutoplaySrc(videoKey = "", origin = "") {
  const key = encodeURIComponent(normalizeYouTubeVideoKey(videoKey));
  if (!key) return "";
  return withYouTubeIdentityParams(
    `https://www.youtube.com/embed/${key}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=${key}&enablejsapi=1`,
    origin
  );
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


async function fetchProxyVideoSourceRaw({ type, id, season = "1", episode = "1", provider = "", signal = null }) {
  signal?.throwIfAborted();
  const mediaType = type === "tv" ? "tv" : "movie";

  const apiResult = await fetchApiProviderSource({ type: mediaType, id, season, episode, provider, signal });
  signal?.throwIfAborted();
  if (apiResult && apiResult.status === "ok") {
    return apiResult;
  }

  const enabled = process.env.MOVIE_PROXY_VIDEO_PROVIDER_ENABLED !== "false";
  if (!enabled || mediaType !== "movie") {
    return apiResult && apiResult.status === "error"
      ? apiResult
      : { status: "disabled", reason: "proxy_video_disabled", apiProvider: apiResult || null };
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
    signal?.throwIfAborted();
    let url;
    try {
      url = buildProxyUrl(base);
    } catch {
      errors.push(`${base}: invalid URL`);
      continue;
    }

    for (let attempt = 1; attempt <= attemptsPerBase; attempt += 1) {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort(signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const headers = { Accept: "application/json" };
        if (process.env.MOVIE_PROXY_VIDEO_PROVIDER_API_KEY) {
          headers.Authorization = `Bearer ${process.env.MOVIE_PROXY_VIDEO_PROVIDER_API_KEY}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        signal?.throwIfAborted();
        let data = null;
        const bodyText = await response.text();
        signal?.throwIfAborted();
        try { data = JSON.parse(bodyText); } catch {}

        if (!response.ok) {
          const details = data?.message || data?.error || bodyText.slice(0, 160) || `HTTP ${response.status}`;
          errors.push(`${url.toString()} attempt ${attempt}: ${details}`);
          continue;
        }

        const resolverM3u8 = String(data?.m3u8 || "").trim();
        const streamUrl = String(data?.stream?.url || "").trim();
        const streamType = String(data?.stream?.type || (resolverM3u8 || streamUrl.endsWith(".m3u8") ? "m3u8" : "")).toLowerCase();
        const chosenVideo = String(resolverM3u8 || streamUrl || data?.proxyVideo || "").trim();
        const streamHeaders = data?.headers || data?.stream?.headers || {};
        const streamQuality = String(data?.stream?.quality || "").slice(0, 40);
        const streamName = String(data?.stream?.name || "").slice(0, 90);
        const streamMode = String(
          data?.streamMode ||
          data?.mode ||
          (process.env.M3U8_FORCE_LIVE === "true" && (resolverM3u8 || streamType === "m3u8" || streamType === "hls") ? "live-hls" : (resolverM3u8 || streamType === "m3u8" || streamType === "hls" ? "hls" : "video"))
        ).toLowerCase();

        if (!data?.ok || !chosenVideo) {
          errors.push(`${url.toString()} attempt ${attempt}: missing m3u8/stream.url/proxyVideo`);
          continue;
        }

        let parsedProxy;
        try {
          parsedProxy = new URL(chosenVideo);
        } catch {
          errors.push(`${url.toString()} attempt ${attempt}: chosen stream URL was not valid`);
          continue;
        }

        if (!["http:", "https:"].includes(parsedProxy.protocol)) {
          errors.push(`${url.toString()} attempt ${attempt}: stream URL must be http or https`);
          continue;
        }

        if (apiIsYouTubeUrl(parsedProxy.toString())) {
          errors.push(`${url.toString()} attempt ${attempt}: YouTube links are disabled`);
          continue;
        }

        const isHlsResolverSource = Boolean(resolverM3u8 || streamType === "m3u8" || streamType === "hls");

        if (!apiIsAllowedMediaExtensionUrl(parsedProxy.toString()) && !(isHlsResolverSource && hlsProxyEnabled())) {
          errors.push(`${url.toString()} attempt ${attempt}: stream URL must end with a media file extension or be proxied HLS`);
          continue;
        }
        const hlsProxy = isHlsResolverSource && hlsProxyEnabled()
          ? registerHlsProxySource(parsedProxy.toString(), streamHeaders, {
              movieId: String(data.movieId || id),
              sourceUrl: String(data.sourceUrl || ""),
              providerUrl: url.toString(),
              streamName,
              streamQuality,
            })
          : { enabled: false, id: "", url: "" };

        // v88: direct m3u8 player mode. Use the raw resolver m3u8 URL by default.
        // HLS proxy remains available only if HLS_PROXY_ENABLED=true.
        const browserPlaybackUrl = hlsProxy.url || parsedProxy.toString();

        return {
          status: "ok",
          providerKind: isHlsResolverSource ? (hlsProxy.url ? "movie_resolver_hls_proxy" : "movie_resolver_direct_m3u8") : "proxy_video",
          movieId: String(data.movieId || id),
          sourceUrl: String(data.sourceUrl || ""),
          playbackUrl: browserPlaybackUrl,
          proxyVideo: browserPlaybackUrl,
          originalPlaybackUrl: parsedProxy.toString(),
          hlsProxyUrl: hlsProxy.url || "",
          hlsProxyId: hlsProxy.id || "",
          hlsProxyStatusUrl: hlsProxy.id ? `/api/hls-proxy/${hlsProxy.id}/status` : "",
          m3u8: resolverM3u8 || (streamType === "m3u8" || streamType === "hls" ? streamUrl : ""),
          streamType: streamType === "hls" ? "m3u8" : streamType,
          streamQuality,
          streamName,
          streamHeaders,
          streamMode,
          isLiveM3u8: streamMode.includes("live") || process.env.M3U8_FORCE_LIVE === "true",
          apiProxyUrl: String(data?.apiProxyUrl || data?.stream?.apiProxyUrl || ""),
          providerUrl: url.toString(),
          attempts: errors,
        };
      } catch (error) {
        signal?.throwIfAborted();
        errors.push(
          `${url.toString()} attempt ${attempt}: ${
            error.name === "AbortError"
              ? `timed out after ${Math.round(timeoutMs / 1000)} seconds`
              : error.message || "request failed"
          }`
        );
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  return {
    status: "error",
    code: apiResult?.code || "unavailable",
    message: errors[0] || "proxyVideo provider failed.",
    attempts: errors.slice(-12),
  };
}

const configuredSourceDeadline = Number(process.env.MOVIE_SOURCE_DEADLINE_MS || 75000);
const configuredSourceConcurrency = Number(process.env.MOVIE_SOURCE_MAX_CONCURRENT || 2);
let movieSourceJobs = createSourceJobs({
  deadlineMs: Number.isFinite(configuredSourceDeadline) ? Math.round(Math.max(10000, Math.min(75000, configuredSourceDeadline))) : 75000,
  maxConcurrentResolvers: Number.isFinite(configuredSourceConcurrency) ? Math.round(Math.max(1, Math.min(6, configuredSourceConcurrency))) : 2,
  successTtlMs: 10 * 60 * 1000,
  errorTtlMs: 2500,
  staleSuccessTtlMs: 20 * 60 * 1000,
  resolve: (params, { signal }) => fetchProxyVideoSourceRaw({ ...params, signal }),
});
function fetchProxyVideoSource(params, options = {}) {
  return movieSourceJobs.resolve(params, { retry: params.retry === true || options.retry === true });
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
  const id = partyMovieId(req.params.id);
  if (!id) return res.status(404).send(pageShell({title: `${SITE_NAME} — Title unavailable`, body: '<main class="dsPlainPage"><h1>Title unavailable</h1><a class="dsSecondaryBtn" href="/movies">Browse movies</a></main>'}));
  const mode = req.query.mode === "trailer" ? "trailer" : "movie";
  const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const [details, videos] = await Promise.all([
    tmdb(endpoint, {}, CACHE_TTL.long),
    tmdb(`${endpoint}/videos`, {}, CACHE_TTL.long),
  ]);
  if (details.__error) return res.send(setupNeededPage(details.message));
  const title = getTitle(details);
  const trailer = pickBestTrailer(videos.results || []);
  const roomId = typeof req.query.roomId === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(req.query.roomId) ? req.query.roomId : "";
  const seasons = (details.seasons || []).filter(season => Number.isSafeInteger(season.season_number) && season.season_number > 0);
  const season = partyMovieId(req.query.s || req.query.season) || String(seasons[0]?.season_number || 1);
  const episode = partyMovieId(req.query.e || req.query.episode) || "1";
  const currentSeason = seasons.find(item => String(item.season_number) === season);
  const provider = typeof req.query.provider === "string" ? req.query.provider : "";
  const seasonDetails = type === "tv" && mode === "movie"
    ? await tmdb(`${endpoint}/season/${season}`, {}, CACHE_TTL.long).catch(() => ({ episodes: [] })) : { episodes: [] };
  const episodes = (Array.isArray(seasonDetails.episodes) ? seasonDetails.episodes : []).map(item => ({ ...item, still: item.still_path ? img(item.still_path, "w342") : "" }));
  const episodeTitle = episodes.find(item => String(item.episode_number) === episode)?.name || "";
  const episodePickerHtml = type === "tv" && mode === "movie" ? episodePickerMarkup({
    id, season, episode, seasons, provider, episodes, episodeCount: currentSeason?.episode_count || 1
  }) : "";
  const body = playerMarkup({
    id, type, title, mode, season, episode,
    year: getYear(type === "tv" ? details.first_air_date : details.release_date),
    poster: details.poster_path ? img(details.poster_path, "w342") : "",
    backdrop: fullBackdrop(details.backdrop_path || details.poster_path),
    provider, episodeTitle,
    trailerUrl: trailer ? youtubeEmbedSrc(trailer.key, youtubeEmbedOrigin(req)) : "",
    episodePickerHtml,
    managed: type === "movie" && mode === "movie" && Boolean(roomId),
    partyPanelHtml: type === "movie" && mode === "movie" ? watchPartyMarkup({movieId:id,title,poster:details.poster_path?img(details.poster_path,"w185"):""}) : "",
  });
  res.send(pageShell({title:`${SITE_NAME} — ${title}`,active:type === "tv" ? "tv" : "movies",body,player:true}));
}

async function detailPage(req, res, type) {
  const id = req.params.id;
  const partyId = type === "movie" ? partyMovieId(id) : "";
  const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const [details, videos, credits, similar, recommendations, externalIds, providers] = await Promise.all([
    tmdb(endpoint, { append_to_response: "images", include_image_language: "en,null" }, CACHE_TTL.long),
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
  const year = getYear(detailsDate);
  const heroBg = fullBackdrop(details.backdrop_path || details.poster_path);
  const logos = (details.images?.logos || []).filter(image => image.file_path && (!image.iso_639_1 || image.iso_639_1 === "en"))
    .sort((a, b) => Number(b.iso_639_1 === "en") - Number(a.iso_639_1 === "en") || Number(b.vote_average || 0) - Number(a.vote_average || 0));
  const titleLogo = logos[0] ? img(logos[0].file_path, "w500") : "";
  const collectionId = Number(details.belongs_to_collection?.id);
  const collection = type === "movie" && Number.isInteger(collectionId) && collectionId > 0
    ? await tmdb(`/collection/${collectionId}`, {}, CACHE_TTL.long).catch(() => null) : null;
  const collectionParts = (Array.isArray(collection?.parts) ? collection.parts : [])
    .filter(item => item.id).sort((a, b) => String(a.release_date || "9999").localeCompare(String(b.release_date || "9999"))).slice(0, 18);
  const collectionHtml = collectionParts.length ? `<section id="collection" class="svDetailSection"><h2>${escapeHtml(collection.name || details.belongs_to_collection.name)}</h2><div class="svDetailCollectionRail">${collectionParts.map(item => `<div class="svCollectionItem"${Number(item.id) === Number(id) ? ' aria-current="true"' : ""}>${movieCard(item, "movie")}${Number(item.id) === Number(id) ? '<span class="svCollectionViewing">Viewing</span>' : ""}</div>`).join("")}</div></section>` : "";
  const cast = Array.isArray(credits.cast) ? credits.cast.slice(0, 18) : [];
  const crew = Array.isArray(credits.crew) ? credits.crew : [];
  const director = crew.find(person => person.job === "Director");
  const writers = crew.filter(person => ["Writer", "Screenplay", "Story"].includes(person.job)).slice(0, 3);
  const trailers = (videos.results || []).filter(video => video.site === "YouTube" && ["Trailer", "Teaser", "Clip"].includes(video.type)).slice(0, 3);
  const more = [...(recommendations.results || []), ...(similar.results || [])]
    .filter((item, index, items) => item.id && item.id !== Number(id) && items.findIndex(other => other.id === item.id) === index).slice(0, 18);
  const providersUS = providers.results?.US || {};
  const providerList = [...(providersUS.flatrate || []), ...(providersUS.rent || []), ...(providersUS.buy || [])]
    .filter((provider, index, list) => list.findIndex(other => other.provider_id === provider.provider_id) === index).slice(0, 8);
  const seasons = type === "tv" ? (details.seasons || []).filter(season => season.season_number > 0).slice(0, 20) : [];
  const startSeason = seasons[0]?.season_number || 1;
  const runtime = type === "tv"
    ? `${details.number_of_seasons || seasons.length || 1} Season${Number(details.number_of_seasons || seasons.length || 1) === 1 ? "" : "s"}`
    : Number(details.runtime) > 0 ? formatRuntime(details.runtime) : "";
  const watchHref = `/watch/${type}/${encodeURIComponent(id)}?mode=movie${type === "tv" ? `&s=${startSeason}&e=1` : ""}`;
  const playLabel = type === "tv" ? `Play S${startSeason} E1` : "Play";
  const genreHtml = (details.genres || []).map(genre => `<a href="/${type === "tv" ? "tv" : "movies"}?genre=${encodeURIComponent(genre.id)}">${escapeHtml(genre.name)}</a>`).join('<span class="svDetailDot" aria-hidden="true">·</span>');
  const castHtml = cast.map(person => `<a class="dsCastCard" href="/person/${encodeURIComponent(person.id)}">
    <div>${person.profile_path ? `<img src="${escapeHtml(img(person.profile_path, "w342"))}" alt="${escapeHtml(person.name)}" loading="lazy" decoding="async" />` : `<span>${escapeHtml(String(person.name || "?").slice(0, 1))}</span>`}</div>
    <strong>${escapeHtml(person.name)}</strong><em>${escapeHtml(person.character || "Cast")}</em>
  </a>`).join("");
  const seasonHtml = seasons.map((season, index) => {
    const number = Number(season.season_number);
    const total = Math.max(0, Number(season.episode_count || 0));
    const shown = Math.min(total, 24);
    const episodeLinks = Array.from({ length: shown }, (_, i) => `<a class="svDetailEpisodeTile" href="/watch/tv/${encodeURIComponent(id)}?mode=movie&s=${number}&e=${i + 1}" aria-label="Watch season ${number} episode ${i + 1}"><span class="svEpisodeOrdinal">${String(i + 1).padStart(2, "0")}</span><span>Episode ${i + 1}</span>${cleanIcon("play")}</a>`).join("");
    return `<details class="svSeason"${index === 0 ? " open" : ""}><summary><span class="svSeasonIdentity"><b class="svSeasonNumber">${String(number).padStart(2, "0")}</b><strong>${escapeHtml(season.name || `Season ${number}`)}</strong></span><span>${total} episodes</span></summary>
      ${season.overview ? `<p>${escapeHtml(season.overview)}</p>` : ""}<div class="dsEpisodeChips">${episodeLinks}${total > shown ? `<a href="/watch/tv/${encodeURIComponent(id)}?mode=movie&s=${number}&e=${shown + 1}">Continue with episode ${shown + 1}</a>` : ""}</div></details>`;
  }).join("");
  const about = [
    ["Release year", year], ["Runtime", runtime || "—"], ["Original language", String(details.original_language || "—").toUpperCase()],
    ["Director", director?.name || "—"], ["Writers", writers.map(person => person.name).join(", ") || "—"], ["Status", details.status || "—"],
    ["Genres", (details.genres || []).map(genre => genre.name).join(", ") || "—"],
    ...(externalIds.imdb_id ? [["IMDb", externalIds.imdb_id]] : []),
    ...(providerList.length ? [["Available on", providerList.map(provider => provider.provider_name).join(", ")]] : [])
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");

  const body = `<main class="dsDetailPage svDetailPage svCinemaPage" data-cinema-page="details">
    <article class="dsDetailShell svTitleDetails" aria-labelledby="svDetailTitle" data-detail-id="${escapeHtml(id)}" data-detail-type="${type}" style="--sv-detail-art:url(\'${escapeHtml(heroBg)}\')">
      <a class="dsSecondaryBtn svDetailReturn" href="/" data-sv-details-back aria-label="Back to browsing"><svg class="svIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>Back to browsing</a>
      <section class="svDetailHero">
        <div class="svDetailBackdrop" style="background-image:url('${escapeHtml(heroBg)}')"></div><div class="svDetailShade"></div>
        <div class="svDetailIdentity" data-cinema-reveal>
          <span class="svDetailEdition">SwiflyTV <span aria-hidden="true">/</span> ${type === "tv" ? "Series" : "Cinema"}</span>
          <h1 id="svDetailTitle" class="svDetailTitle"><span class="svDetailTitleText">${escapeHtml(title)}</span>${titleLogo ? `<img class="svDetailLogo" src="${escapeHtml(titleLogo)}" alt="" aria-hidden="true" decoding="async" />` : ""}</h1>
          ${genreHtml ? `<div class="svDetailGenres">${genreHtml}</div>` : ""}
          <div class="svDetailFacts">
            ${Number(details.vote_average) > 0 ? `<span class="svDetailScore"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1Z"/></svg>${escapeHtml(formatRating(details.vote_average))}/10<small>TMDB</small></span>` : ""}
            <span>${escapeHtml(year)}</span>${runtime ? `<span>${escapeHtml(runtime)}</span>` : ""}<span>${type === "tv" ? "Series" : "Movie"}</span>
          </div>
          <div class="svDetailActions">
            <a class="dsPrimaryBtn" href="${watchHref}" ${mediaDataAttributes("play", details, type)}>${cleanIcon("play")}${escapeHtml(playLabel)}</a>
            ${trailers.length ? `<a class="dsSecondaryBtn" href="/watch/${type}/${encodeURIComponent(id)}?mode=trailer">${cleanIcon("play")}Trailer</a>` : ""}
            ${partyId ? `<a class="dsSecondaryBtn" href="/watch/movie/${partyId}?mode=movie&party=create" data-sv-party-movie-id="${partyId}" aria-label="Start a watch party for ${escapeHtml(title)}">${cleanIcon("user")}Start a watch party</a>` : ""}
            <button class="dsIconBtn" type="button" aria-label="Add ${escapeHtml(title)} to My List" ${mediaDataAttributes("watch", details, type)}>＋</button>
            <button class="dsIconBtn dsHeartBtn" type="button" aria-label="Like ${escapeHtml(title)}" ${mediaDataAttributes("like", details, type)}>♡</button>
          </div>
        </div>
        ${details.poster_path ? `<div class="svDetailPosterCard" aria-hidden="true"><img src="${escapeHtml(img(details.poster_path, "w342"))}" alt="" decoding="async"/><span>${type === "tv" ? "The series" : "The film"}</span></div>` : ""}
      </section>
      <div class="svDetailBody">
        <nav class="svDetailChapterNav" aria-label="Title sections"><a href="#overview">The story</a>${castHtml ? '<a href="#cast">Cast</a>' : ""}${seasonHtml ? '<a href="#episodes">Episodes</a>' : ""}${collectionHtml ? '<a href="#collection">Collection</a>' : ""}<a href="#details">Film notes</a></nav>
        <section id="overview" class="svDetailSection svDetailOverview"><div><span class="svCinemaEyebrow">THE STORY</span><h2>${type === "tv" ? "One episode is never enough." : "A story worth settling into."}</h2></div><p>${escapeHtml(details.overview || "No overview available yet.")}</p></section>
        ${castHtml ? `<section id="cast" class="svDetailSection"><h2>Cast</h2><div class="svDetailCastRail" aria-label="Cast">${castHtml}</div></section>` : ""}
        ${seasonHtml ? `<section id="episodes" class="svDetailSection"><h2>Episodes</h2>${seasonHtml}</section>` : ""}
        ${collectionHtml}
        ${more.length ? `<section id="more-like-this" class="svDetailSection"><h2>More like this</h2><div class="svDetailRecommendations">${more.map(item => movieCard(item, type)).join("")}</div></section>` : ""}
        ${trailers.length ? `<section id="trailers" class="svDetailSection"><h2>Trailers</h2><div class="svDetailTrailers">${trailers.map(video => `<iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.key)}" title="${escapeHtml(video.name || title + " trailer")}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`).join("")}</div></section>` : ""}
        <section id="details" class="svDetailSection"><h2>Details</h2><dl class="svDetailAbout">${about}</dl></section>
      </div>
    </article>
  </main>`;
  if (req.query.view === "modal") return res.send(body);
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
    ${dsPageHeader("Watch Parties", "A private room for movie fans to open a link together, countdown, chat, and start the same movie from different places.", "Watch together")}

    <section class="dsWatchroomHero">
      <div>
        <span class="dsEyebrow">Watch rooms</span>
        <h2>Start the room, send the link, then pick what to watch.</h2>
        <p>Use this when you are on a call and need a simple place to share the watch link and countdown together.</p>
      </div>
      <form id="quickCreateWatchroomForm" class="dsQuickRoomForm">
        <input name="roomName" placeholder="Movie night" maxlength="80" />
        <button class="dsPrimaryBtn" type="submit">Create Watch Room</button>
      </form>
    </section>

    <section class="dsWatchroomCreate dsWatchroomCreatePro">
      <article class="dsWatchroomPanel dsCreateRoomPanel">
        <h2>Create a watch room</h2>
        <p>Name the room and optionally paste the movie/site link you both should open.</p>
        <form id="createWatchroomForm">
          <label>Date room name<input name="roomName" placeholder="Friday movie night" maxlength="80" /></label>
          <label>Optional watch link<input name="trailerUrl" placeholder="Movie, trailer, or website link" /></label>
          <button class="dsPrimaryBtn" type="submit">Create Watch Room</button>
        </form>
      </article>

      <article class="dsWatchroomPanel">
        <h2>Join a watch room</h2>
        <p>Got a code from your friends? Enter it here.</p>
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
          params.set("name", String(roomName || "SwiflyTV Watch Room").trim() || "SwiflyTV Watch Room");
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
  const name = String(req.query.name || "SwiflyTV Watch Room").slice(0, 80);
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

  const isSocialEmbed = String(req.query.socialEmbed || "") === "1";
  const body = `<main class="dsPlainPage dsStableRoom svWatchroomPage svCinemaPage ${isSocialEmbed ? "dsSocialEmbeddedRoom" : ""}" data-cinema-page="watchroom" data-room-id="${safeRoomId}">
    <section class="dsStableRoomHero" data-cinema-reveal>
      <div>
        ${isSocialEmbed ? "" : '<a class="dsGhostPill" href="/social?tab=watchrooms">← Party Hub</a>'}
        <span class="dsEyebrow">SwiflyTV · Watch together</span>
        <h1>${safeName}</h1>
        <p>Your screen. Your people. The same moment.</p>
      </div>

      <aside class="dsStableRoomMeta">
        <div><small>Room code</small><strong>${safeRoomId}</strong></div>
        <div><small>Status</small><strong id="stableHostStatus">Joining...</strong></div>
        <div><small>Viewers</small><strong id="stableViewerCount">0</strong></div><button class="dsSecondaryBtn" id="stableCopyInviteBtn" type="button">Copy invite</button>
      </aside>
    </section>

    <div id="pauseForUsBanner" class="dsPauseForUsBanner" hidden>
      <b>Pause for us</b>
      <span id="pauseForUsText">Someone needs a moment.</span>
    </div>
    <div id="missingYouAmbient" class="dsMissingYouAmbient" hidden>♡ ♡ ♡</div>

    <section class="dsStableRoomGrid" data-cinema-reveal>
      <section class="dsStableMain">
        <div class="dsStableTabs">
          <button class="active" type="button" data-stable-tab="open">Shared link</button>
          <button type="button" data-stable-tab="movie">Room movie</button>
          <button type="button" data-stable-tab="live">Share a tab</button>
          <button type="button" data-stable-tab="couples">Room tools</button>
          <button type="button" data-stable-tab="clock">Clock</button>
        </div>

        <section class="dsStablePanel active" id="stableOpenPanel">
          <div class="dsStablePanelHead">
            <div>
              <span class="dsEyebrow">Bring your own film</span>
              <h2>One link. One movie night.</h2>
              <p>Open the same link, then use the countdown to press play together.</p>
            </div>
            <span class="dsHostBadge" id="stableOpenBadge">Host controls</span>
          </div>

          <form id="stableOpenForm" class="dsStableUrlForm">
            <input id="stableOpenInput" name="url" placeholder="Paste the movie/site link for both of you" value="${safeInitialUrl}" />
            <button class="dsPrimaryBtn" type="submit">Share Link</button>
          </form>

          <div class="dsStableWatchCard">
            <div>
              <small>Shared link</small>
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
              <p>Paste a movie page or its catalog ID. Your room will prepare the film and stay in sync.</p>
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
              <p>Playback follows the host. Use Sync playback if your player drifts.</p>
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
            <video id="roomMovieVideo" class="dsRoomMovieFrame dsCustomMovieVideo video-js vjs-big-play-centered vjs-theme-swifly" playsinline preload="metadata" crossorigin="anonymous" hidden></video>
            <div id="roomMovieHlsStatus" class="dsHlsStatus" hidden><b>Loading m3u8...</b><span>Starting HLS player</span></div>
            <div id="roomMoviePlayerChrome" class="dsCustomPlayerChrome" hidden>
              <div class="dsCustomPlayerTop">
                <div>
                  <span>SwiflyTV Player</span>
                  <b id="roomMoviePlayerTitle">Room Movie</b>
                  <em id="roomMoviePlayerType">M3U8 Player</em>
                </div>
                <button type="button" id="roomMoviePlayerSyncBtn" title="Sync to room timer">Sync</button>
              </div>

              <div class="dsCustomPlayerCenter">
                <button type="button" id="roomMovieBigPlayBtn" class="dsBigPlayBtn" aria-label="Play or pause">▶</button>
              </div>

              <div class="dsCustomPlayerControls">
                <div class="dsCustomProgressWrap">
                  <input id="roomMovieProgress" class="dsCustomProgress" type="range" min="0" max="1000" value="0" step="1" aria-label="Video progress" />
                  <div class="dsCustomTimeRow">
                    <span id="roomMovieCurrentTime">0:00</span>
                    <span id="roomMovieDriftBadge">Sync ready</span>
                    <span id="roomMovieDuration">0:00</span>
                  </div>
                </div>

                <div class="dsCustomControlRow">
                  <button type="button" id="roomMoviePlayerPlayBtn" aria-label="Play or pause">▶</button>
                  <button type="button" id="roomMovieRewindBtn" aria-label="Back 10 seconds">-10</button>
                  <button type="button" id="roomMovieForwardBtn" aria-label="Forward 10 seconds">+10</button>
                  <button type="button" id="roomMovieMuteBtn" aria-label="Mute">🔊</button>
                  <input id="roomMovieVolume" class="dsCustomVolume" type="range" min="0" max="1" value="1" step="0.01" aria-label="Volume" />
                  <button type="button" id="roomMoviePlayerFullscreenBtn" aria-label="Fullscreen">⛶</button>
                </div>
              </div>
            </div>
            <div id="roomMovieEmpty" class="dsRoomMovieEmpty">
              <div class="dsProxyLoader"></div>
              <h3>Waiting for host</h3>
              <p>Choose a film to watch together.</p>
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
              <p>One person shares a tab/window and the other watches inside the watch room. Great when only one of you has access.</p>
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
              <span class="dsEyebrow">A little more company</span>
              <h2>Make it your night.</h2>
              <p>Ready checks, reactions and little moments between scenes.</p>
            </div>

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
              <p>Turns on a warm remote vibe with floating hearts and sweeter room styling.</p>
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
              <span>Watch Room Themes</span>
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


          </div>

          <div id="coupleFloatingLayer" class="dsCoupleFloatingLayer"></div>
        </section>
      </section>

      <aside class="dsStableSide">
        <section class="dsStablePanel dsStableChat">
          <div class="dsStableChatHead">
            <div>
              <span class="dsEyebrow">Chat</span>
              <h2>The conversation</h2>
            </div>
          </div>
          <div id="stableMessages" class="dsStableMessages" role="log" aria-label="Room messages" aria-live="polite"><div class="dsStableChatEmpty"><span>Room chat</span><h3>Make yourself comfortable.</h3><p>Say hello while everyone gets ready.</p></div></div>
          <form id="stableChatForm">
            <input name="message" placeholder="Add to the conversation…" maxlength="220" />
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
        var roomMovieGuestWatchdogTimer = null;
        var ROOM_MOVIE_DRIFT_LIMIT = Number(window.ROOM_MOVIE_DRIFT_LIMIT || 10);
        var roomMovieRemoteApplying = false;
        var roomMovieIgnoreNativeEventsUntil = 0;
        var roomMovieLastNativeSetSentAt = 0;
        var roomMovieLastNativeSetValue = -1;
        var roomMovieInitialNativeSyncDone = false;
        var roomMovieLastCorrectionAt = 0;
        var roomMovieLastPlayPauseAt = 0;
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
            setCustomPlayerVisible(false);
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

        function markRoomMovieRemoteApply(ms) {
          roomMovieRemoteApplying = true;
          roomMovieIgnoreNativeEventsUntil = Date.now() + (ms || 1800);
          setTimeout(function(){
            if (Date.now() >= roomMovieIgnoreNativeEventsUntil) {
              roomMovieRemoteApplying = false;
            }
          }, ms || 1800);
        }

        function forceRoomMovieVideoTo(target, shouldPlay) {
          var video = document.getElementById("roomMovieVideo");
          if (!video || video.hidden) return false;

          target = Math.max(0, Number(target || 0));
          markRoomMovieRemoteApply(3000);

          try {
            if (!video.paused) video.pause();
          } catch {}

          if (typeof isRoomMovieLiveM3u8 === "function" && isRoomMovieLiveM3u8()) {
            seekRoomMovieLiveEdge();
          } else {
            if (typeof isPollingLiveM3u8 === "function" && isPollingLiveM3u8()) {
              seekPollingLiveEdge();
            } else {
              try {
                video.currentTime = target;
              } catch {
                return false;
              }
            }
          }

          // v81: Some streams ignore the first seek while loading/buffering.
          // Verify shortly after, and try one more time if still outside tolerance.
          setTimeout(function() {
            if (!video || video.hidden) return;
            var freshTarget = targetRoomMovieSeconds();
            var freshDrift = Math.abs(Number(video.currentTime || 0) - freshTarget);
            if (freshDrift >= ROOM_MOVIE_DRIFT_LIMIT) {
              markRoomMovieRemoteApply(2600);
              if (typeof isRoomMovieLiveM3u8 === "function" && isRoomMovieLiveM3u8()) seekRoomMovieLiveEdge();
              else { try { video.currentTime = freshTarget; } catch {} }
            }
          }, 700);

          if (shouldPlay) {
            setTimeout(function() {
              markRoomMovieRemoteApply(1200);
              video.play().catch(function(){});
            }, 420);
          }

          return true;
        }

        function applyNativeVideoSync(force) {
          var video = document.getElementById("roomMovieVideo");
          if (!video || video.hidden || !(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) return;

          var liveMode = typeof isRoomMovieLiveM3u8 === "function" && isRoomMovieLiveM3u8();
          if (isRoomMovieHlsUrl(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo) && !roomMovieState.hlsReady) {
            return;
          }

          var target = targetRoomMovieSeconds();
          var current = Number(video.currentTime || 0);
          var drift = Math.abs(current - target);

          if (liveMode) {
            try {
              if (video.seekable && video.seekable.length) {
                var liveEdge = video.seekable.end(video.seekable.length - 1);
                drift = Math.abs(liveEdge - current);
                target = Math.max(0, liveEdge - 2);
              }
            } catch {}
          }
          var now = Date.now();
          var corrected = false;
          var shouldPlay = Boolean(roomMovieState.sync && roomMovieState.sync.playing);

          // v81: Guests get an actual watchdog correction. If they are 10s+ away,
          // correct even when no host button/socket event has happened.
          var cooldownReady = now - roomMovieLastCorrectionAt > 2500;
          var canCorrectNow = force || (drift >= ROOM_MOVIE_DRIFT_LIMIT && cooldownReady);

          if (canCorrectNow) {
            roomMovieLastCorrectionAt = now;
            corrected = forceRoomMovieVideoTo(target, shouldPlay);
          } else {
            // Only keep play/pause aligned occasionally, without touching currentTime.
            if (now - roomMovieLastPlayPauseAt > 3500) {
              if (shouldPlay && video.paused) {
                markRoomMovieRemoteApply(1200);
                roomMovieLastPlayPauseAt = now;
                video.play().catch(function(){});
              } else if (!shouldPlay && !video.paused) {
                markRoomMovieRemoteApply(1200);
                roomMovieLastPlayPauseAt = now;
                try { video.pause(); } catch {}
              }
            }
          }

          var status = document.getElementById("roomMovieStatus");
          if (status && !video.hidden) {
            status.textContent = corrected
              ? (liveMode ? "Jumped back to live edge." : "Guest auto-corrected " + Math.round(drift) + "s drift. Room timer: " + formatTime(target))
              : (liveMode ? "Live m3u8 active. Latency " + Math.round(drift) + "s" : "Smooth sync active. Drift " + Math.round(drift) + "s • correction distance " + ROOM_MOVIE_DRIFT_LIMIT + "s");
          }
        }

        function startRoomMovieCorrectionLoop() {
          if (roomMovieCorrectionTimer) clearInterval(roomMovieCorrectionTimer);
          if (roomMovieGuestWatchdogTimer) clearInterval(roomMovieGuestWatchdogTimer);

          roomMovieCorrectionTimer = setInterval(function() {
            updateRoomMovieTimerUi();
            applyNativeVideoSync(false);
          }, 2000);

          // v81: A separate guest watchdog keeps checking the actual video time.
          // This fixes guests who drift far away without any new socket event.
          roomMovieGuestWatchdogTimer = setInterval(function() {
            var video = document.getElementById("roomMovieVideo");
            if (!video || video.hidden || !(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) return;
            if (video.readyState < 1) return;

            var target = targetRoomMovieSeconds();
            var drift = Math.abs(Number(video.currentTime || 0) - target);
            if (drift >= ROOM_MOVIE_DRIFT_LIMIT) {
              applyNativeVideoSync(true);
            }
          }, 2500);
        }

        function showIframeSyncHint() {
          var status = document.getElementById("roomMovieStatus");
          if (!status || !(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) return;
          status.textContent = "Iframe fallback loaded. Browser would not accept this URL as a native video, so use the room target timer if it drifts.";
        }

        function fallbackToRoomMovieIframe(reason) {
          var frame = document.getElementById("roomMovieFrame");
          var video = document.getElementById("roomMovieVideo");
          var overlay = document.getElementById("roomMovieIframeSyncOverlay");
          if (!frame || !(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) return;

          if (video) {
            try { video.pause(); } catch {}
            video.hidden = true;
            setCustomPlayerVisible(false);
            video.removeAttribute("src");
            try { video.load(); } catch {}
          }

          if (frame.src !== (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) frame.src = (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo);
          frame.hidden = false;
          if (overlay) overlay.hidden = false;
          showIframeSyncHint();
          if (reason) console.warn("SwiflyTV iframe fallback:", reason);
        }

        function setCustomPlayerVisible(visible) {
          var chrome = document.getElementById("roomMoviePlayerChrome");
          if (chrome) chrome.hidden = !visible;
        }

        function customPlayerFormatTime(seconds) {
          seconds = Math.max(0, Math.floor(Number(seconds || 0)));
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          var s = seconds % 60;
          return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0");
        }

        function updateCustomPlayerUi() {
          var video = document.getElementById("roomMovieVideo");
          if (!video) return;

          var playBtn = document.getElementById("roomMoviePlayerPlayBtn");
          var bigPlay = document.getElementById("roomMovieBigPlayBtn");
          var progress = document.getElementById("roomMovieProgress");
          var currentTime = document.getElementById("roomMovieCurrentTime");
          var duration = document.getElementById("roomMovieDuration");
          var muteBtn = document.getElementById("roomMovieMuteBtn");
          var volume = document.getElementById("roomMovieVolume");
          var driftBadge = document.getElementById("roomMovieDriftBadge");
          var playerTitle = document.getElementById("roomMoviePlayerTitle");

          var isPlaying = !video.paused && !video.ended;
          var icon = isPlaying ? "❚❚" : "▶";
          if (playBtn) playBtn.textContent = icon;
          if (bigPlay) {
            bigPlay.textContent = icon;
            bigPlay.classList.toggle("isPlaying", isPlaying);
          }

          var dur = Number(video.duration || 0);
          var cur = Number(video.currentTime || 0);
          var live = typeof isRoomMovieLiveM3u8 === "function" && isRoomMovieLiveM3u8();
          if (progress) {
            if (live || !Number.isFinite(dur) || dur <= 0) {
              progress.value = "1000";
              progress.disabled = true;
              progress.classList.add("isLive");
            } else {
              progress.disabled = false;
              progress.classList.remove("isLive");
              if (!progress.matches(":active")) {
                progress.value = String(Math.max(0, Math.min(1000, Math.round((cur / dur) * 1000))));
              }
            }
          }
          if (currentTime) currentTime.textContent = live ? "LIVE" : customPlayerFormatTime(cur);
          if (duration) duration.textContent = live ? "Live edge" : dur > 0 ? customPlayerFormatTime(dur) : "Live";
          if (muteBtn) muteBtn.textContent = video.muted || Number(video.volume || 0) === 0 ? "🔇" : "🔊";
          if (volume && !volume.matches(":active")) volume.value = String(video.muted ? 0 : Number(video.volume || 1));
          if (playerTitle) playerTitle.textContent = roomMovieState && roomMovieState.movieId ? "TMDB #" + roomMovieState.movieId : "Room Movie";
          var playerType = document.getElementById("roomMoviePlayerType");
          if (playerType) {
            var isHls = typeof isRoomMovieHlsUrl === "function" && isRoomMovieHlsUrl(roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo);
            var quality = roomMovieState.streamQuality ? " • " + roomMovieState.streamQuality : "";
            playerType.textContent = isHls ? ((roomMovieState && roomMovieState.hlsProxyUrl) ? "PROXIED M3U8 Player" : "DIRECT M3U8 Player") + quality : "Native Video Player" + quality;
          }

          if (driftBadge && typeof targetRoomMovieSeconds === "function") {
            var target = targetRoomMovieSeconds();
            var drift = Math.round(Math.abs(cur - target));
            driftBadge.textContent = video.hidden ? "Waiting" : drift <= ROOM_MOVIE_DRIFT_LIMIT ? "In sync" : drift + "s off";
            driftBadge.classList.toggle("isOff", drift > ROOM_MOVIE_DRIFT_LIMIT);
          }
        }

        function seekCustomPlayer(delta) {
          var video = document.getElementById("roomMovieVideo");
          if (!video) return;
          try {
            video.currentTime = Math.max(0, Number(video.currentTime || 0) + Number(delta || 0));
          } catch {}
          updateCustomPlayerUi();
        }

        function toggleCustomPlayerPlayback() {
          var video = document.getElementById("roomMovieVideo");
          if (!video) return;
          if (video.paused) {
            video.play().catch(function(){});
          } else {
            try { video.pause(); } catch {}
          }
          updateCustomPlayerUi();
        }

        function bindCustomRoomMoviePlayer() {
          var video = document.getElementById("roomMovieVideo");
          var chrome = document.getElementById("roomMoviePlayerChrome");
          if (!video || !chrome || chrome.__swiflyCustomPlayerBound) return;
          chrome.__swiflyCustomPlayerBound = true;

          try { video.controls = false; } catch {}

          var playBtn = document.getElementById("roomMoviePlayerPlayBtn");
          var bigPlay = document.getElementById("roomMovieBigPlayBtn");
          var rewindBtn = document.getElementById("roomMovieRewindBtn");
          var forwardBtn = document.getElementById("roomMovieForwardBtn");
          var muteBtn = document.getElementById("roomMovieMuteBtn");
          var volume = document.getElementById("roomMovieVolume");
          var fullscreenBtn = document.getElementById("roomMoviePlayerFullscreenBtn");
          var progress = document.getElementById("roomMovieProgress");
          var syncBtn = document.getElementById("roomMoviePlayerSyncBtn");
          var stage = document.getElementById("roomMovieStage");

          [playBtn, bigPlay].forEach(function(btn) {
            if (btn) btn.addEventListener("click", toggleCustomPlayerPlayback);
          });

          if (rewindBtn) rewindBtn.addEventListener("click", function(){ seekCustomPlayer(-10); });
          if (forwardBtn) forwardBtn.addEventListener("click", function(){ seekCustomPlayer(10); });

          if (muteBtn) {
            muteBtn.addEventListener("click", function() {
              video.muted = !video.muted;
              updateCustomPlayerUi();
            });
          }

          if (volume) {
            volume.addEventListener("input", function() {
              video.volume = Math.max(0, Math.min(1, Number(volume.value || 0)));
              video.muted = video.volume <= 0;
              updateCustomPlayerUi();
            });
          }

          if (progress) {
            progress.addEventListener("input", function() {
              if (typeof isRoomMovieLiveM3u8 === "function" && isRoomMovieLiveM3u8()) {
                seekRoomMovieLiveEdge();
                updateCustomPlayerUi();
                return;
              }
              var dur = Number(video.duration || 0);
              if (dur <= 0 || !Number.isFinite(dur)) return;
              try {
                video.currentTime = (Number(progress.value || 0) / 1000) * dur;
              } catch {}
              updateCustomPlayerUi();
            });
          }

          if (syncBtn) {
            syncBtn.addEventListener("click", function() {
              roomMovieLastCorrectionAt = 0;
              applyNativeVideoSync(true);
              updateCustomPlayerUi();
            });
          }

          if (fullscreenBtn) {
            fullscreenBtn.addEventListener("click", function() {
              var target = stage || video;
              if (!document.fullscreenElement) {
                target.requestFullscreen?.();
              } else {
                document.exitFullscreen?.();
              }
            });
          }

          ["play", "pause", "timeupdate", "durationchange", "volumechange", "loadedmetadata", "seeked", "ended"].forEach(function(eventName) {
            video.addEventListener(eventName, updateCustomPlayerUi);
          });

          setInterval(updateCustomPlayerUi, 1000);
          updateCustomPlayerUi();
        }

        function bindRoomMovieVideoHostControls() {
          var video = document.getElementById("roomMovieVideo");
          if (!video || roomMovieVideoControlBound) return;
          roomMovieVideoControlBound = true;

          function shouldIgnoreNativeEvent() {
            return roomMovieRemoteApplying || Date.now() < roomMovieIgnoreNativeEventsUntil;
          }

          function sendFromNative(action, extra) {
            if (!isRoomHost || shouldIgnoreNativeEvent()) return;
            if (!roomMovieState.movieId) return;
            socket.emit("watchroom:movie-control", Object.assign({
              roomId: roomId,
              action: action,
              clientTime: Number(video.currentTime || 0),
              name: getSessionName()
            }, extra || {}));
          }

          var lastNativePlayPauseSentAt = 0;

          video.addEventListener("play", function(){
            var now = Date.now();
            if (now - lastNativePlayPauseSentAt < 1200) return;
            lastNativePlayPauseSentAt = now;
            sendFromNative("play");
          });

          video.addEventListener("pause", function(){
            var now = Date.now();
            if (now - lastNativePlayPauseSentAt < 1200) return;
            lastNativePlayPauseSentAt = now;
            sendFromNative("pause");
          });

          video.addEventListener("seeked", function(){
            if (!isRoomHost || shouldIgnoreNativeEvent()) return;

            var now = Date.now();
            var current = Number(video.currentTime || 0);
            var roomTarget = targetRoomMovieSeconds();
            var drift = Math.abs(current - roomTarget);

            // Do not spam "set timer" for tiny or repeated seek events.
            if (drift <= ROOM_MOVIE_DRIFT_LIMIT) return;
            if (now - roomMovieLastNativeSetSentAt < 2500 && Math.abs(current - roomMovieLastNativeSetValue) < ROOM_MOVIE_DRIFT_LIMIT) return;

            roomMovieLastNativeSetSentAt = now;
            roomMovieLastNativeSetValue = current;
            sendFromNative("set", { time: current });
          });
        }

        function setRoomMovieHlsStatus(title, detail, isError) {
          var box = document.getElementById("roomMovieHlsStatus");
          if (!box) return;
          box.hidden = false;
          box.classList.toggle("isError", Boolean(isError));
          var b = box.querySelector("b");
          var s = box.querySelector("span");
          if (b) b.textContent = title || "HLS";
          if (s) s.textContent = detail || "";
        }

        function hideRoomMovieHlsStatus() {
          var box = document.getElementById("roomMovieHlsStatus");
          if (box) box.hidden = true;
        }

        function loadHlsScriptFallback(callback) {
          if (window.Hls) return callback(true);

          var urls = [
            "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
            "https://unpkg.com/hls.js@1.5.17/dist/hls.min.js",
            "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js"
          ];
          var i = 0;

          function next() {
            if (window.Hls) return callback(true);
            if (i >= urls.length) return callback(false);

            var script = document.createElement("script");
            script.src = urls[i++];
            script.async = true;
            script.onload = function(){ callback(Boolean(window.Hls)); };
            script.onerror = next;
            document.head.appendChild(script);
          }

          next();
        }

        function isRoomMovieHlsUrl(url) {
          var value = String(url || "");
          var type = String(roomMovieState.streamType || "").toLowerCase();
          return new RegExp("[.]m3u8([?#]|$)", "i").test(value) || type === "m3u8" || type === "hls";
        }

        function isRoomMovieLiveM3u8() {
          return Boolean(roomMovieState.isLiveM3u8) || Boolean(roomMovieState.hlsIsLive) || String(roomMovieState.streamMode || "").includes("live");
        }

        function seekRoomMovieLiveEdge() {
          var video = document.getElementById("roomMovieVideo");
          if (!video) return false;
          try {
            if (video.seekable && video.seekable.length) {
              var end = video.seekable.end(video.seekable.length - 1);
              if (Number.isFinite(end) && end > 0) {
                video.currentTime = Math.max(0, end - 2);
                return true;
              }
            }
          } catch {}
          return false;
        }

        function destroyRoomMovieHls() {
          var video = document.getElementById("roomMovieVideo");
          if (window.__roomMovieVideoJs) {
            try { window.__roomMovieVideoJs.dispose(); } catch {}
            window.__roomMovieVideoJs = null;
          }
          if (window.__roomMovieHls) {
            try { window.__roomMovieHls.destroy(); } catch {}
            window.__roomMovieHls = null;
          }
          if (video) video.dataset.hlsSrc = "";
        }

        function attachRoomMovieVideoJs(video, src) {
          if (!video || !src || !window.videojs) return false;

          setRoomMovieHlsStatus("Loading m3u8...", "Starting Video.js HLS player", false);

          try {
            if (window.__roomMovieVideoJs) {
              window.__roomMovieVideoJs.dispose();
              window.__roomMovieVideoJs = null;
            }
          } catch {}

          try {
            video.classList.add("video-js", "vjs-big-play-centered", "vjs-theme-swifly");
            var player = window.videojs(video, {
              controls: false,
              autoplay: false,
              preload: "auto",
              fluid: false,
              responsive: true,
              liveui: true,
              html5: {
                vhs: {
                  overrideNative: !(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
                  withCredentials: false,
                  enableLowInitialPlaylist: true,
                  smoothQualityChange: true,
                },
                nativeAudioTracks: false,
                nativeVideoTracks: false,
              },
              sources: [{
                src: src,
                type: "application/x-mpegURL"
              }],
            });

            window.__roomMovieVideoJs = player;

            player.ready(function() {
              roomMovieState.hlsReady = true;
              setRoomMovieHlsStatus("m3u8 ready", "Video.js player loaded. Press play.", false);
              setRoomMovieStatus("m3u8 loaded in Video.js. Press play when ready.");
              updateCustomPlayerUi();
              setTimeout(hideRoomMovieHlsStatus, 2500);
            });

            player.on("loadedmetadata", function() {
              roomMovieState.hlsReady = true;
              updateCustomPlayerUi();
            });

            player.on("error", function() {
              var err = player.error && player.error();
              var message = err && (err.message || err.code) ? String(err.message || ("Code " + err.code)) : "Unknown Video.js error";
              setRoomMovieHlsStatus("Video.js error", message, true);
              console.warn("SwiflyTV Video.js error", err);
            });

            return true;
          } catch (error) {
            console.warn("Video.js attach failed", error);
            setRoomMovieHlsStatus("Video.js failed", error.message || "Trying HLS.js fallback", true);
            return false;
          }
        }

        function attachRoomMovieVideoSource(video, src) {
          if (!video || !src) return false;

          roomMovieState.hlsReady = false;
          roomMovieState.hlsIsLive = Boolean(roomMovieState.isLiveM3u8) || String(roomMovieState.streamMode || "").includes("live");

          try {
            video.crossOrigin = "anonymous";
            video.removeAttribute("src");
            video.load();
          } catch {}

          if (isRoomMovieHlsUrl(src)) {
            destroyRoomMovieHls();
            setRoomMovieHlsStatus("Loading m3u8...", "Preparing Video.js player", false);

            if (attachRoomMovieVideoJs(video, src)) {
              return true;
            }

            setRoomMovieHlsStatus("Loading m3u8...", "Video.js unavailable. Trying HLS.js fallback.", false);

            // Safari/iOS can play HLS natively. Chrome/Edge/Firefox need hls.js.
            var nativeHls = video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl");

            if (nativeHls) {
              video.src = src;
              video.dataset.hlsSrc = src;
              try { video.load(); } catch {}
              roomMovieState.hlsReady = true;
              setRoomMovieHlsStatus("m3u8 ready", "Native Safari HLS loaded. Press play.", false);
              setTimeout(hideRoomMovieHlsStatus, 1800);
              return true;
            }

            loadHlsScriptFallback(function(loaded) {
              if (!loaded || !window.Hls || !window.Hls.isSupported || !window.Hls.isSupported()) {
                setRoomMovieHlsStatus("HLS.js did not load", "The browser cannot play this m3u8 without HLS.js.", true);
                return;
              }

              var hls = new window.Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                startPosition: -1,
                capLevelToPlayerSize: true,
                manifestLoadingMaxRetry: 4,
                manifestLoadingRetryDelay: 1000,
                levelLoadingMaxRetry: 4,
                levelLoadingRetryDelay: 1000,
                fragLoadingMaxRetry: 6,
                fragLoadingRetryDelay: 1000,
                fragLoadingTimeOut: 30000,
                manifestLoadingTimeOut: 30000,
                levelLoadingTimeOut: 30000,
              });

              window.__roomMovieHls = hls;
              video.dataset.hlsSrc = src;

              hls.on(window.Hls.Events.MEDIA_ATTACHED, function() {
                setRoomMovieHlsStatus("Loading m3u8...", "Fetching manifest", false);
                hls.loadSource(src);
              });

              hls.on(window.Hls.Events.MANIFEST_LOADING, function() {
                setRoomMovieHlsStatus("Loading m3u8...", "Manifest request sent", false);
              });

              hls.on(window.Hls.Events.MANIFEST_PARSED, function(event, data) {
                roomMovieState.hlsReady = true;
                setRoomMovieHlsStatus("m3u8 ready", "Levels: " + ((data && data.levels && data.levels.length) || 1) + ". Press play.", false);
                setRoomMovieStatus("m3u8 loaded. Press play when ready.");
                updateCustomPlayerUi();
                setTimeout(hideRoomMovieHlsStatus, 2500);
              });

              hls.on(window.Hls.Events.LEVEL_LOADED, function(event, data) {
                var live = Boolean(data && data.details && data.details.live);
                roomMovieState.hlsIsLive = live || Boolean(roomMovieState.isLiveM3u8) || String(roomMovieState.streamMode || "").includes("live");
                updateCustomPlayerUi();
              });

              hls.on(window.Hls.Events.ERROR, function(event, data) {
                if (!data) return;
                var details = String(data.details || data.reason || data.type || "Unknown HLS error");
                console.warn("SwiflyTV HLS error", data);

                if (!data.fatal) {
                  setRoomMovieHlsStatus("HLS warning", details, false);
                  return;
                }

                if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                  setRoomMovieHlsStatus("HLS network error", "Retrying stream load...", true);
                  try { hls.startLoad(); } catch {}
                  return;
                }

                if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                  setRoomMovieHlsStatus("HLS media error", "Trying media recovery...", true);
                  try { hls.recoverMediaError(); } catch {}
                  return;
                }

                setRoomMovieHlsStatus("HLS failed", details, true);
              });

              hls.attachMedia(video);
            });

            return true;
          }

          destroyRoomMovieHls();
          hideRoomMovieHlsStatus();
          video.src = src;
          try { video.load(); } catch {}
          return true;
        }

        function loadRoomMovieFrame() {
          var frame = document.getElementById("roomMovieFrame");
          var video = document.getElementById("roomMovieVideo");
          var empty = document.getElementById("roomMovieEmpty");
          var stage = document.getElementById("roomMovieStage");
          var overlay = document.getElementById("roomMovieIframeSyncOverlay");
          if (!roomMovieState.playbackUrl) return;

          if (empty) empty.hidden = true;
          if (stage) stage.classList.add("isReady");

          // v76: Always try the proxyVideo URL as a native <video> first.
          // Many proxyVideo URLs are real MP4/video streams with no .mp4 extension,
          // so extension detection alone caused SwiflyTV to iframe them and lose sync control.
          if (video) {
            bindCustomRoomMoviePlayer();
            bindRoomMovieVideoHostControls();

            if (frame) {
              frame.hidden = true;
              frame.removeAttribute("src");
            }
            if (overlay) overlay.hidden = true;

            video.hidden = false;
            setCustomPlayerVisible(true);
            updateCustomPlayerUi();
            video.onerror = function() {
              fallbackToRoomMovieIframe("native video error");
            };
            video.onloadedmetadata = function() {
              setRoomMovieStatus((isRoomMovieLiveM3u8() ? "Live m3u8 loaded." : isRoomMovieHlsUrl((roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) ? "m3u8/HLS loaded." : "Native video loaded.") + " Player is active.");
              if (!roomMovieInitialNativeSyncDone) {
                roomMovieInitialNativeSyncDone = true;
                applyNativeVideoSync(true);
              }
            };
            video.oncanplay = function() {
              if (!roomMovieInitialNativeSyncDone) {
                roomMovieInitialNativeSyncDone = true;
                applyNativeVideoSync(true);
              }
            };

            if (video.src !== (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo) && video.dataset.hlsSrc !== (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) {
              roomMovieInitialNativeSyncDone = false;
              roomMovieLastCorrectionAt = 0;
              roomMovieLastPlayPauseAt = 0;
              attachRoomMovieVideoSource(video, (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo));
            }

            setRoomMovieStatus(isRoomMovieHlsUrl((roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) ? (roomMovieState.hlsProxyUrl ? "Loading proxied live m3u8 in the custom player..." : "Loading direct live m3u8 in the custom player...") : "Trying native video sync first...");
            setTimeout(function() {
              if (!video.hidden && video.readyState === 0) {
                fallbackToRoomMovieIframe("native video never became ready after 30s");
              }
            }, 30000);

            applyNativeVideoSync(false);
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
            if (!roomMovieState.playbackUrl) {
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
          roomMovieState = Object.assign({ status: "idle", movieId: "", playbackUrl: "", proxyVideo: "", m3u8: "", streamType: "", streamQuality: "", streamName: "", streamMode: "", isLiveM3u8: false, hlsIsLive: false, hlsReady: false, playAt: 0, selectedBy: "", message: "", sync: { playing: false, offset: 0, startedAt: 0, updatedAt: Date.now() } }, movie || {});
          roomMovieState.playbackUrl = roomMovieState.playbackUrl || roomMovieState.m3u8 || (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo);
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
            setRoomMovieStatus((roomMovieState.selectedBy || "Host") + " selected this movie. Waiting for m3u8/stream...");
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

          if (roomMovieState.status === "ready" && (roomMovieState.playbackUrl || roomMovieState.m3u8 || roomMovieState.proxyVideo)) {
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
          if (completed >= 1) earned.add("First Watch Room");
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
              showCouplePopup(note.text, "From " + (note.from || "your friends"));
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
          root.querySelector(".dsStableChatEmpty")?.remove();
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

          renderRoomMovie({ status: "loading", movieId: movieId, selectedBy: getSessionName(), message: "Waiting for m3u8/stream..." });
          socket.emit("watchroom:movie-select", { roomId: roomId, movieId: movieId, name: getSessionName() });
          sendMessage("Selected TMDB #" + movieId + ". Waiting for m3u8/stream to sync the room.");
        });

        document.getElementById("roomMovieRestartBtn")?.addEventListener("click", function() {
          if (!isRoomHost) return toast("Only the host can restart the sync countdown");
          if (!roomMovieState.playbackUrl) return toast("No room movie is ready yet");
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
          roomMovieLastCorrectionAt = 0;
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
          toast("Watch Room socket did not load. Buttons are in offline mode.");
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
          var movie = { status: "idle", movieId: "", playbackUrl: "", proxyVideo: "", m3u8: "", streamType: "", streamQuality: "", streamName: "", streamMode: "", isLiveM3u8: false, hlsIsLive: false, hlsReady: false, playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } };
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
            if (!frame || !(movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) return;

            if (frame.src !== (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) frame.src = (movie.playbackUrl || movie.m3u8 || movie.proxyVideo);
            frame.hidden = false;
            if (empty) empty.hidden = true;
            if (stage) stage.classList.add("isReady");
            setMovieStatus("Movie loaded. Room timer: " + formatTime(currentTargetTime()));
          }

          function setPollingHlsStatus(title, detail, isError) {
            var box = byId("roomMovieHlsStatus");
            if (!box) return;
            box.hidden = false;
            box.classList.toggle("isError", Boolean(isError));
            var b = box.querySelector("b");
            var s = box.querySelector("span");
            if (b) b.textContent = title || "HLS";
            if (s) s.textContent = detail || "";
          }

          function hidePollingHlsStatus() {
            var box = byId("roomMovieHlsStatus");
            if (box) box.hidden = true;
          }

          function loadPollingHlsScript(callback) {
            if (window.Hls) return callback(true);
            var urls = [
              "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
              "https://unpkg.com/hls.js@1.5.17/dist/hls.min.js",
              "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js"
            ];
            var i = 0;
            function next() {
              if (window.Hls) return callback(true);
              if (i >= urls.length) return callback(false);
              var script = document.createElement("script");
              script.src = urls[i++];
              script.async = true;
              script.onload = function(){ callback(Boolean(window.Hls)); };
              script.onerror = next;
              document.head.appendChild(script);
            }
            next();
          }

          function isPollingHlsUrl(url) {
            var value = String(url || "");
            var type = String(movie.streamType || "").toLowerCase();
            return new RegExp("[.]m3u8([?#]|$)", "i").test(value) || type === "m3u8" || type === "hls";
          }

          function isPollingLiveM3u8() {
            return Boolean(movie.isLiveM3u8) || Boolean(movie.hlsIsLive) || String(movie.streamMode || "").includes("live");
          }

          function seekPollingLiveEdge() {
            var video = byId("roomMovieVideo");
            if (!video) return false;
            try {
              if (video.seekable && video.seekable.length) {
                var end = video.seekable.end(video.seekable.length - 1);
                if (Number.isFinite(end) && end > 0) {
                  video.currentTime = Math.max(0, end - 2);
                  return true;
                }
              }
            } catch {}
            return false;
          }

          function destroyPollingHls() {
            var video = byId("roomMovieVideo");
            if (window.__roomMoviePollingVideoJs) {
              try { window.__roomMoviePollingVideoJs.dispose(); } catch {}
              window.__roomMoviePollingVideoJs = null;
            }
            if (window.__roomMoviePollingHls) {
              try { window.__roomMoviePollingHls.destroy(); } catch {}
              window.__roomMoviePollingHls = null;
            }
            if (video) video.dataset.hlsSrc = "";
          }

          function attachPollingVideoJs(video, src) {
            if (!video || !src || !window.videojs) return false;

            setPollingHlsStatus("Loading m3u8...", "Starting Video.js HLS player", false);

            try {
              if (window.__roomMoviePollingVideoJs) {
                window.__roomMoviePollingVideoJs.dispose();
                window.__roomMoviePollingVideoJs = null;
              }
            } catch {}

            try {
              video.classList.add("video-js", "vjs-big-play-centered", "vjs-theme-swifly");
              var player = window.videojs(video, {
                controls: false,
                autoplay: false,
                preload: "auto",
                fluid: false,
                responsive: true,
                liveui: true,
                html5: {
                  vhs: {
                    overrideNative: !(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
                    withCredentials: false,
                    enableLowInitialPlaylist: true,
                    smoothQualityChange: true,
                  },
                  nativeAudioTracks: false,
                  nativeVideoTracks: false,
                },
                sources: [{
                  src: src,
                  type: "application/x-mpegURL"
                }],
              });

              window.__roomMoviePollingVideoJs = player;

              player.ready(function() {
                movie.hlsReady = true;
                setPollingHlsStatus("m3u8 ready", "Video.js player loaded. Press play.", false);
                setMovieStatus("m3u8 loaded in Video.js. Press play when ready.");
                bindPollingCustomPlayer();
                setTimeout(hidePollingHlsStatus, 2500);
              });

              player.on("loadedmetadata", function() {
                movie.hlsReady = true;
              });

              player.on("error", function() {
                var err = player.error && player.error();
                var message = err && (err.message || err.code) ? String(err.message || ("Code " + err.code)) : "Unknown Video.js error";
                setPollingHlsStatus("Video.js error", message, true);
                console.warn("SwiflyTV polling Video.js error", err);
              });

              return true;
            } catch (error) {
              console.warn("Polling Video.js attach failed", error);
              setPollingHlsStatus("Video.js failed", error.message || "Trying HLS.js fallback", true);
              return false;
            }
          }

          function attachPollingVideoSource(video, src) {
            if (!video || !src) return false;

            movie.hlsReady = false;
            movie.hlsIsLive = Boolean(movie.isLiveM3u8) || String(movie.streamMode || "").includes("live");

            try {
              video.crossOrigin = "anonymous";
              video.removeAttribute("src");
              video.load();
            } catch {}

            if (isPollingHlsUrl(src)) {
              destroyPollingHls();
              setPollingHlsStatus("Loading m3u8...", "Preparing Video.js player", false);

              if (attachPollingVideoJs(video, src)) {
                return true;
              }

              setPollingHlsStatus("Loading m3u8...", "Video.js unavailable. Trying HLS.js fallback.", false);

              var nativeHls = video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl");

              if (nativeHls) {
                video.src = src;
                video.dataset.hlsSrc = src;
                try { video.load(); } catch {}
                movie.hlsReady = true;
                setPollingHlsStatus("m3u8 ready", "Native Safari HLS loaded. Press play.", false);
                setTimeout(hidePollingHlsStatus, 1800);
                return true;
              }

              loadPollingHlsScript(function(loaded) {
                if (!loaded || !window.Hls || !window.Hls.isSupported || !window.Hls.isSupported()) {
                  setPollingHlsStatus("HLS.js did not load", "The browser cannot play this m3u8 without HLS.js.", true);
                  return;
                }

                var hls = new window.Hls({
                  debug: false,
                  enableWorker: true,
                  lowLatencyMode: false,
                  backBufferLength: 90,
                  maxBufferLength: 60,
                  maxMaxBufferLength: 120,
                  startPosition: -1,
                  capLevelToPlayerSize: true,
                  manifestLoadingMaxRetry: 4,
                  manifestLoadingRetryDelay: 1000,
                  levelLoadingMaxRetry: 4,
                  levelLoadingRetryDelay: 1000,
                  fragLoadingMaxRetry: 6,
                  fragLoadingRetryDelay: 1000,
                  fragLoadingTimeOut: 30000,
                  manifestLoadingTimeOut: 30000,
                  levelLoadingTimeOut: 30000,
                });

                window.__roomMoviePollingHls = hls;
                video.dataset.hlsSrc = src;

                hls.on(window.Hls.Events.MEDIA_ATTACHED, function() {
                  setPollingHlsStatus("Loading m3u8...", "Fetching manifest", false);
                  hls.loadSource(src);
                });

                hls.on(window.Hls.Events.MANIFEST_PARSED, function(event, data) {
                  movie.hlsReady = true;
                  setPollingHlsStatus("m3u8 ready", "Levels: " + ((data && data.levels && data.levels.length) || 1) + ". Press play.", false);
                  setMovieStatus("m3u8 loaded. Press play when ready.");
                  bindPollingCustomPlayer();
                  setTimeout(hidePollingHlsStatus, 2500);
                });

                hls.on(window.Hls.Events.LEVEL_LOADED, function(event, data) {
                  var live = Boolean(data && data.details && data.details.live);
                  movie.hlsIsLive = live || Boolean(movie.isLiveM3u8) || String(movie.streamMode || "").includes("live");
                });

                hls.on(window.Hls.Events.ERROR, function(event, data) {
                  if (!data) return;
                  var details = String(data.details || data.reason || data.type || "Unknown HLS error");
                  console.warn("SwiflyTV polling HLS error", data);

                  if (!data.fatal) {
                    setPollingHlsStatus("HLS warning", details, false);
                    return;
                  }

                  if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                    setPollingHlsStatus("HLS network error", "Retrying stream load...", true);
                    try { hls.startLoad(); } catch {}
                    return;
                  }

                  if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                    setPollingHlsStatus("HLS media error", "Trying media recovery...", true);
                    try { hls.recoverMediaError(); } catch {}
                    return;
                  }

                  setPollingHlsStatus("HLS failed", details, true);
                });

                hls.attachMedia(video);
              });

              return true;
            }

            destroyPollingHls();
            hidePollingHlsStatus();
            video.src = src;
            try { video.load(); } catch {}
            return true;
          }

          function scheduleLoad() {
            if (timer) clearInterval(timer);
            var countdown = byId("roomMovieCountdown");

            timer = setInterval(function(){
              updateTargetUi();
              if (!movie.playbackUrl) {
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
              setMovieStatus("Waiting for m3u8/stream...");
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

            if (movie.status === "ready" && (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) {
              setMovieTab();
              setMovieStatus("m3u8/stream ready. Sync countdown started.");
              scheduleLoad();
            }
          }

          function localProxyPoll(movieId) {
            renderMovie({ status: "loading", movieId: movieId, message: "Waiting for m3u8/stream..." });
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
                  setMovieStatus("Still waiting for m3u8/stream... attempt " + attempts);
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
                renderMovie({ status: "loading", movieId: movieId, selectedBy: getName(), message: "Waiting for m3u8/stream..." });
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
            if (socket && (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) emit("watchroom:movie-sync-start", { roomId: roomId, delayMs: 7000, name: getName() });
            else if ((movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) { movie.playAt = Date.now() + 7000; scheduleLoad(); }
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
            toast("Socket failed, Watch Room recovery loaded in offline mode.");
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
          var pollingDriftLimit = Number(window.ROOM_MOVIE_DRIFT_LIMIT || 10);
          var pollingLastCorrectionAt = 0;
          var pollingLastPlayPauseAt = 0;
          var pollingGuestWatchdogTimer = null;
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

          function setPollingCustomPlayerVisible(visible) {
            var chrome = byId("roomMoviePlayerChrome");
            if (chrome) chrome.hidden = !visible;
          }

          function bindPollingCustomPlayer() {
            var video = byId("roomMovieVideo");
            var chrome = byId("roomMoviePlayerChrome");
            if (!video || !chrome || chrome.__swiflyPollingCustomPlayerBound) return;
            chrome.__swiflyPollingCustomPlayerBound = true;

            try { video.controls = false; } catch {}

            function updateUi() {
              var playBtn = byId("roomMoviePlayerPlayBtn");
              var bigPlay = byId("roomMovieBigPlayBtn");
              var progress = byId("roomMovieProgress");
              var currentTime = byId("roomMovieCurrentTime");
              var duration = byId("roomMovieDuration");
              var muteBtn = byId("roomMovieMuteBtn");
              var volume = byId("roomMovieVolume");
              var driftBadge = byId("roomMovieDriftBadge");
              var playerTitle = byId("roomMoviePlayerTitle");

              var isPlaying = !video.paused && !video.ended;
              var icon = isPlaying ? "❚❚" : "▶";
              if (playBtn) playBtn.textContent = icon;
              if (bigPlay) {
                bigPlay.textContent = icon;
                bigPlay.classList.toggle("isPlaying", isPlaying);
              }

              var dur = Number(video.duration || 0);
              var cur = Number(video.currentTime || 0);
              var live = typeof isPollingLiveM3u8 === "function" && isPollingLiveM3u8();
              if (progress) {
                if (live || !Number.isFinite(dur) || dur <= 0) {
                  progress.value = "1000";
                  progress.disabled = true;
                  progress.classList.add("isLive");
                } else {
                  progress.disabled = false;
                  progress.classList.remove("isLive");
                  if (!progress.matches(":active")) {
                    progress.value = String(Math.max(0, Math.min(1000, Math.round((cur / dur) * 1000))));
                  }
                }
              }
              if (currentTime) currentTime.textContent = live ? "LIVE" : formatTime(cur);
              if (duration) duration.textContent = live ? "Live edge" : dur > 0 ? formatTime(dur) : "Live";
              if (muteBtn) muteBtn.textContent = video.muted || Number(video.volume || 0) === 0 ? "🔇" : "🔊";
              if (volume && !volume.matches(":active")) volume.value = String(video.muted ? 0 : Number(video.volume || 1));
              if (playerTitle) playerTitle.textContent = movie && movie.movieId ? "TMDB #" + movie.movieId : "Room Movie";
              var playerType = byId("roomMoviePlayerType");
              if (playerType) {
                var isHls = typeof isPollingHlsUrl === "function" && isPollingHlsUrl(movie.playbackUrl || movie.m3u8 || (movie.playbackUrl || movie.m3u8 || movie.proxyVideo));
                var quality = movie.streamQuality ? " • " + movie.streamQuality : "";
                playerType.textContent = isHls ? ((movie && movie.hlsProxyUrl) ? "PROXIED M3U8 Player" : "DIRECT M3U8 Player") + quality : "Native Video Player" + quality;
              }

              if (driftBadge) {
                var drift = Math.round(Math.abs(Number(video.currentTime || 0) - targetTime()));
                driftBadge.textContent = video.hidden ? "Waiting" : drift <= pollingDriftLimit ? "In sync" : drift + "s off";
                driftBadge.classList.toggle("isOff", drift > pollingDriftLimit);
              }
            }

            function togglePlay() {
              if (video.paused) video.play().catch(function(){});
              else { try { video.pause(); } catch {} }
              updateUi();
            }

            var playBtn = byId("roomMoviePlayerPlayBtn");
            var bigPlay = byId("roomMovieBigPlayBtn");
            var rewindBtn = byId("roomMovieRewindBtn");
            var forwardBtn = byId("roomMovieForwardBtn");
            var muteBtn = byId("roomMovieMuteBtn");
            var volume = byId("roomMovieVolume");
            var fullscreenBtn = byId("roomMoviePlayerFullscreenBtn");
            var progress = byId("roomMovieProgress");
            var syncBtn = byId("roomMoviePlayerSyncBtn");
            var stage = byId("roomMovieStage");

            [playBtn, bigPlay].forEach(function(btn) {
              if (btn) btn.addEventListener("click", togglePlay);
            });
            if (rewindBtn) rewindBtn.addEventListener("click", function(){ try { video.currentTime = Math.max(0, Number(video.currentTime || 0) - 10); } catch {}; updateUi(); });
            if (forwardBtn) forwardBtn.addEventListener("click", function(){ try { video.currentTime = Number(video.currentTime || 0) + 10; } catch {}; updateUi(); });
            if (muteBtn) muteBtn.addEventListener("click", function(){ video.muted = !video.muted; updateUi(); });
            if (volume) volume.addEventListener("input", function(){ video.volume = Math.max(0, Math.min(1, Number(volume.value || 0))); video.muted = video.volume <= 0; updateUi(); });
            if (progress) progress.addEventListener("input", function(){
              if (typeof isPollingLiveM3u8 === "function" && isPollingLiveM3u8()) {
                seekPollingLiveEdge();
                updateUi();
                return;
              }
              var dur = Number(video.duration || 0);
              if (dur > 0 && Number.isFinite(dur)) {
                try { video.currentTime = (Number(progress.value || 0) / 1000) * dur; } catch {}
              }
              updateUi();
            });
            if (syncBtn) syncBtn.addEventListener("click", function(){ pollingLastCorrectionAt = 0; applyPollingVideoSync(true); updateUi(); });
            if (fullscreenBtn) fullscreenBtn.addEventListener("click", function(){ var target = stage || video; if (!document.fullscreenElement) target.requestFullscreen?.(); else document.exitFullscreen?.(); });

            ["play", "pause", "timeupdate", "durationchange", "volumechange", "loadedmetadata", "seeked", "ended"].forEach(function(eventName) {
              video.addEventListener(eventName, updateUi);
            });
            setInterval(updateUi, 1000);
            updateUi();
          }

          function forcePollingVideoTo(target, shouldPlay) {
            var video = byId("roomMovieVideo");
            if (!video || video.hidden) return false;

            target = Math.max(0, Number(target || 0));
            try {
              if (!video.paused) video.pause();
            } catch {}
            try {
              video.currentTime = target;
            } catch {
              return false;
            }

            setTimeout(function() {
              if (!video || video.hidden) return;
              var freshTarget = targetTime();
              var freshDrift = Math.abs(Number(video.currentTime || 0) - freshTarget);
              if (freshDrift >= pollingDriftLimit) {
                if (typeof isPollingLiveM3u8 === "function" && isPollingLiveM3u8()) seekPollingLiveEdge();
                else { try { video.currentTime = freshTarget; } catch {} }
              }
            }, 700);

            if (shouldPlay) {
              setTimeout(function(){ video.play().catch(function(){}); }, 420);
            }
            return true;
          }

          function applyPollingVideoSync(force) {
            var video = byId("roomMovieVideo");
            if (!video || video.hidden || !(movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) return;
            var liveMode = typeof isPollingLiveM3u8 === "function" && isPollingLiveM3u8();
            if (isPollingHlsUrl(movie.playbackUrl || movie.m3u8 || movie.proxyVideo) && !movie.hlsReady) {
              return;
            }

            var target = targetTime();
            var drift = Math.abs(Number(video.currentTime || 0) - target);
            if (liveMode) {
              try {
                if (video.seekable && video.seekable.length) {
                  var liveEdge = video.seekable.end(video.seekable.length - 1);
                  drift = Math.abs(liveEdge - Number(video.currentTime || 0));
                  target = Math.max(0, liveEdge - 2);
                }
              } catch {}
            }
            var now = Date.now();
            var shouldPlay = Boolean(movie.sync && movie.sync.playing);
            var corrected = false;

            var cooldownReady = now - pollingLastCorrectionAt > 2500;
            if (force || (drift >= pollingDriftLimit && cooldownReady)) {
              pollingLastCorrectionAt = now;
              corrected = forcePollingVideoTo(target, shouldPlay);
            } else if (now - pollingLastPlayPauseAt > 3500) {
              if (shouldPlay && video.paused) {
                pollingLastPlayPauseAt = now;
                video.play().catch(function(){});
              } else if (!shouldPlay && !video.paused) {
                pollingLastPlayPauseAt = now;
                try { video.pause(); } catch {}
              }
            }

            setMovieStatus(corrected
              ? (liveMode ? "Jumped back to live edge." : "Guest auto-corrected " + Math.round(drift) + "s drift. Room timer: " + formatTime(target))
              : (liveMode ? "Live m3u8 active. Latency " + Math.round(drift) + "s" : "Smooth native video sync active. Drift " + Math.round(drift) + "s • correction distance " + pollingDriftLimit + "s"));
          }

          function fallbackPollingIframe(reason) {
            var frame = byId("roomMovieFrame");
            var video = byId("roomMovieVideo");
            var overlay = byId("roomMovieIframeSyncOverlay");
            if (video) {
              try { video.pause(); } catch {}
              video.hidden = true;
              setPollingCustomPlayerVisible(false);
              video.removeAttribute("src");
              try { video.load(); } catch {}
            }
            if (frame && (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) {
              if (frame.src !== (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) frame.src = (movie.playbackUrl || movie.m3u8 || movie.proxyVideo);
              frame.hidden = false;
            }
            if (overlay) overlay.hidden = false;
            setMovieStatus("Iframe fallback loaded. Use the room target timer if it drifts.");
            if (reason) console.warn("SwiflyTV polling iframe fallback:", reason);
          }

          function renderMovie(next) {
            if (!next) return;
            movie = Object.assign({ status: "idle", movieId: "", playbackUrl: "", proxyVideo: "", m3u8: "", streamType: "", streamQuality: "", streamName: "", streamMode: "", isLiveM3u8: false, hlsIsLive: false, hlsReady: false, playAt: 0, sync: { playing: false, offset: 0, startedAt: 0 } }, next);
            movie.playbackUrl = movie.playbackUrl || movie.m3u8 || (movie.playbackUrl || movie.m3u8 || movie.proxyVideo);
            if (!movie.sync) movie.sync = { playing: false, offset: 0, startedAt: 0 };

            var key = [movie.status, movie.movieId, (movie.playbackUrl || movie.m3u8 || movie.proxyVideo), movie.playAt, movie.message].join("|");
            var title = byId("roomMovieTitle");
            if (title) title.textContent = movie.movieId ? ("TMDB #" + movie.movieId) : "No movie selected";

            if (!movie.movieId) {
              setMovieStatus("Host can select a movie and everyone will wait together.");
              return;
            }

            if (movie.status === "loading") {
              openMovieTab();
              setMovieStatus("Waiting for m3u8/stream... this can take awhile.");
              var empty = byId("roomMovieEmpty");
              if (empty) {
                empty.hidden = false;
                var h = empty.querySelector("h3");
                var p = empty.querySelector("p");
                if (h) h.textContent = "Finding movie source...";
                if (p) p.textContent = "Waiting for m3u8/stream. Everyone will load together when it returns.";
              }
              return;
            }

            if (movie.status === "error") {
              openMovieTab();
              setMovieStatus(movie.message || "proxyVideo failed.");
              return;
            }

            if (movie.status === "ready" && (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) {
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
              if ((movie.playbackUrl || movie.m3u8 || movie.proxyVideo) && video) {
                if (frame) {
                  frame.hidden = true;
                  frame.removeAttribute("src");
                }
                if (overlay) overlay.hidden = true;
                video.hidden = false;
                video.onerror = function(){ fallbackPollingIframe("native video error"); };
                var pollingInitialSyncDone = false;
                video.onloadedmetadata = function(){
                  if (!pollingInitialSyncDone) {
                    pollingInitialSyncDone = true;
                    applyPollingVideoSync(true);
                  }
                };
                video.oncanplay = function(){
                  if (!pollingInitialSyncDone) {
                    pollingInitialSyncDone = true;
                    applyPollingVideoSync(true);
                  }
                };
                if (video.src !== (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) {
                  attachPollingVideoSource(video, (movie.playbackUrl || movie.m3u8 || movie.proxyVideo));
                }
                setTimeout(function(){
                  if (!video.hidden && video.readyState === 0) fallbackPollingIframe("native video never became ready after 30s");
                }, 30000);
                applyPollingVideoSync(true);
                if (pollingGuestWatchdogTimer) clearInterval(pollingGuestWatchdogTimer);
                pollingGuestWatchdogTimer = setInterval(function(){
                  updateTimerUi();
                  applyPollingVideoSync(false);
                  var v = byId("roomMovieVideo");
                  if (!v || v.hidden || !(movie.playbackUrl || movie.m3u8 || movie.proxyVideo) || v.readyState < 1) return;
                  var d = Math.abs(Number(v.currentTime || 0) - targetTime());
                  if (d >= pollingDriftLimit) applyPollingVideoSync(true);
                }, 2500);
              } else if (frame && (movie.playbackUrl || movie.m3u8 || movie.proxyVideo)) {
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
              toast("Watch Room polling fallback connected");
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

              renderMovie({ status: "loading", movieId: movieId, message: "Waiting for m3u8/stream..." });
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

  res.send(pageShell({
    title: `${SITE_NAME} — ${room.name}`,
    active: "social",
    extraHead: isSocialEmbed ? `<style>
      body { background: #0f111a !important; }
      .topbar, .mobileTabBar, .nav, .profileDropdown { display: none !important; }
      .dsStableRoom { padding: 0 !important; min-height: 100vh; }
      .dsStableRoomHero { margin-top: 0 !important; border-radius: 0 0 22px 22px !important; }
      .dsStableRoomGrid { margin-bottom: 0 !important; }
  
    /* ============================================================
       v146 REMOVE HOME BOARD + FIX AUTOTRAILER VISIBILITY
       - removes the entire old home board section
       - keeps the YouTube hero trailer visible even if PLAYING state
         does not fire
       ============================================================ */

    .dsMovieHomeBoard {
      display: none !important;
    }

    .dsHeroHasTrailer .dsHeroTrailerLayer {
      opacity: 0 !important;
      animation: dsHeroTrailerFadeInV146 1.25s ease 2.15s forwards !important;
      transition: opacity .85s ease, transform .85s ease, filter .25s ease !important;
      transform: scale(1.03) !important;
      filter: brightness(.92) saturate(1.08) contrast(1.04) !important;
    }

    .dsHeroHasTrailer.dsHeroTrailerIsPlaying .dsHeroTrailerLayer {
      opacity: .96 !important;
      transform: scale(1) !important;
    }

    .dsHeroHasTrailer.dsHeroTrailerWaiting .dsHeroTrailerLayer {
      opacity: 0 !important;
      animation: dsHeroTrailerFadeInV146 1.25s ease 2.15s forwards !important;
    }

    .dsHeroHasTrailer .dsHeroBg {
      animation: dsHeroPosterFadeV146 6.8s ease 0s both !important;
    }

    .dsHeroHasTrailer.dsHeroTrailerIsPlaying .dsHeroBg {
      opacity: .14 !important;
      filter: brightness(.48) saturate(1.02) contrast(1.03) !important;
    }

    .dsHeroHasTrailer .dsHeroTrailerPill {
      animation: dsHeroPreviewPillInV146 .65s ease 3s forwards !important;
    }

    @keyframes dsHeroTrailerFadeInV146 {
      0% {
        opacity: 0;
        transform: scale(1.03);
      }
      100% {
        opacity: .96;
        transform: scale(1);
      }
    }

    @keyframes dsHeroPosterFadeV146 {
      0%, 32% {
        opacity: 1;
        filter: brightness(.66) saturate(1.05) contrast(1.03) !important;
      }
      100% {
        opacity: .14;
        filter: brightness(.48) saturate(1.02) contrast(1.03) !important;
      }
    }

    @keyframes dsHeroPreviewPillInV146 {
      to {
        opacity: .92;
        transform: translateY(0);
      }
    }

    @media(max-width: 900px) {
      .dsHeroHasTrailer .dsHeroTrailerLayer {
        display: none !important;
      }

      .dsHeroHasTrailer .dsHeroBg {
        animation: none !important;
        opacity: 1 !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dsHeroHasTrailer .dsHeroTrailerLayer,
      .dsHeroHasTrailer .dsHeroBg,
      .dsHeroHasTrailer .dsHeroTrailerPill {
        animation: none !important;
      }

      .dsHeroHasTrailer .dsHeroTrailerLayer {
        opacity: 0 !important;
      }
    }


    /* ============================================================
       v149 VIDSTACK M3U8 PLAYER
       - Vidstack Default Layout first
       - Swifly-styled through CSS
       - keeps m3u8/proxy src exactly as resolved
       - removes broken Video.js/custom dock from active player
       ============================================================ */

    .dsVideoJsCinemaShell.v149Vidstack {
      --v149-radius: 26px;
      --media-brand: #ffffff;
      --media-focus-ring-color: rgba(255,255,255,.50);
      --media-font-family: var(--font-ui, "Host Grotesk", Inter, system-ui, sans-serif);
      position: relative !important;
      height: clamp(380px, 74vh, 860px) !important;
      min-height: clamp(380px, 74vh, 860px) !important;
      border-radius: var(--v149-radius) !important;
      background: #000 !important;
      overflow: hidden !important;
      isolation: isolate !important;
      outline: 1px solid rgba(255,255,255,.075) !important;
      box-shadow:
        0 36px 120px rgba(0,0,0,.62),
        0 0 58px rgba(120,150,255,.055) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      background:
        linear-gradient(to top, rgba(0,0,0,.38), transparent 28%, transparent 72%, rgba(0,0,0,.16)),
        radial-gradient(circle at 50% 100%, rgba(255,255,255,.08), transparent 34%);
      opacity: .7;
    }

    .dsVideoJsCinemaShell.v149Vidstack #proxyVideoClientVideo,
    .dsVideoJsCinemaShell.v149Vidstack .isVidstackHidden,
    .dsVideoJsCinemaShell.v149Vidstack .video-js,
    .dsVideoJsCinemaShell.v149Vidstack .vjs-control-bar,
    .dsVideoJsCinemaShell.v149Vidstack .vjs-big-play-button,
    .dsVideoJsCinemaShell.v149Vidstack .swiflyVideoDock,
    .dsVideoJsCinemaShell.v149Vidstack .swiflyNeoDock,
    .dsVideoJsCinemaShell.v149Vidstack .dsCinemaSeekDock,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsTop,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsCenter,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsHint,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsQuality,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsSpeed,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsVolume,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsTimelinePreview,
    .dsVideoJsCinemaShell.v149Vidstack .dsCinemaPlayerAura {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      border-radius: inherit;
      overflow: hidden;
      background: #000;
      z-index: 1;
      --video-border-radius: var(--v149-radius);
      --media-font-family: var(--font-ui, "Host Grotesk", Inter, system-ui, sans-serif);
      --media-brand: #f5f7fb;
      --media-focus-ring-color: rgba(245,247,251,.54);
      --media-tooltip-bg: rgba(245,247,251,.96);
      --media-tooltip-color: #080b12;
      --media-menu-bg: rgba(17,20,26,.96);
      --media-menu-color: rgba(255,255,255,.86);
      --media-menu-border: 1px solid rgba(255,255,255,.10);
      --media-slider-track-bg: rgba(255,255,255,.25);
      --media-slider-track-fill-bg: #f5f7fb;
      --media-slider-thumb-bg: #f5f7fb;
      --media-controls-color: rgba(255,255,255,.92);
    }

    .dsVideoJsCinemaShell.v149Vidstack media-provider,
    .dsVideoJsCinemaShell.v149Vidstack [data-media-provider] {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      border-radius: inherit !important;
      overflow: hidden !important;
      background: #000 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer video,
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-media-provider] video {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      object-position: center center !important;
      background: #000 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
      --media-button-size: 40px;
      --media-menu-border-radius: 16px;
      --media-slider-height: 36px;
      --media-slider-track-height: 5px;
      --media-slider-thumb-size: 13px;
      --media-tooltip-border-radius: 999px;
      z-index: 5;
      font-family: var(--font-ui, "Host Grotesk", Inter, system-ui, sans-serif);
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls"],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-media-controls],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-controls] {
      backdrop-filter: blur(18px) saturate(1.08);
      -webkit-backdrop-filter: blur(18px) saturate(1.08);
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls-group"],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-controls-group] {
      border-radius: 999px;
    }

    .dsVideoJsCinemaShell.v149Vidstack .dsHlsStatus {
      left: 16px !important;
      top: 16px !important;
      bottom: auto !important;
      max-width: min(250px, calc(100% - 32px)) !important;
      padding: 8px 10px !important;
      border-radius: 13px !important;
      color: rgba(255,255,255,.86) !important;
      background: rgba(15,18,28,.54) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      box-shadow: 0 12px 32px rgba(0,0,0,.28) !important;
      backdrop-filter: blur(14px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(14px) saturate(1.08) !important;
      z-index: 12 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack.v149Ready .dsHlsStatus:not(.isError),
    .dsVideoJsCinemaShell.v149Vidstack.v149Playing .dsHlsStatus:not(.isError) {
      opacity: 0 !important;
      transform: translateY(-6px) !important;
      pointer-events: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack:fullscreen,
    .dsVideoJsCinemaShell.v149Vidstack:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack:fullscreen media-player.swiflyVidstackPlayer,
    .dsVideoJsCinemaShell.v149Vidstack:-webkit-full-screen media-player.swiflyVidstackPlayer {
      width: 100vw !important;
      height: 100vh !important;
      border-radius: 0 !important;
    }

    @media(max-width: 900px) {
      .dsVideoJsCinemaShell.v149Vidstack {
        --v149-radius: 18px;
        height: clamp(300px, 58vh, 640px) !important;
        min-height: clamp(300px, 58vh, 640px) !important;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
        --media-button-size: 36px;
        --media-slider-height: 32px;
        --media-slider-track-height: 5px;
        --media-slider-thumb-size: 12px;
      }
    }

  </style>` : "",
    body
  }));
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

app.get("/m3u8-player", (req, res) => {
  const rawSrc = String(req.query.url || req.query.src || "").trim();
  const srcHeaders = {
    referer: String(req.query.referer || req.query.ref || ""),
    origin: String(req.query.origin || ""),
  };
  const useProxy = String(req.query.proxy || "").toLowerCase() === "true";
  const hlsProxy = rawSrc && useProxy ? registerHlsProxySource(rawSrc, srcHeaders, { standalone: true }) : { url: "" };
  const src = hlsProxy.url || rawSrc;
  const body = `<main class="dsWatchPage dsM3u8Standalone">
    <section class="dsWatchHero">
      <div>
        <span class="dsEyebrow">Video.js / M3U8 Player</span>
        <h1>SwiflyTV M3U8 Player</h1>
        <p>Paste a licensed m3u8 URL as <code>?url=</code>. This uses Video.js/VHS first, with HLS.js fallback.</p>
      </div>
    </section>

    <section class="dsWatchShell dsStandaloneHlsShell">
      ${src ? `<video id="standaloneM3u8Video" class="dsDirectMovieVideo video-js vjs-big-play-centered vjs-theme-swifly" controls playsinline crossorigin="anonymous" preload="auto"></video>
      <div id="standaloneHlsStatus" class="dsHlsStatus"><b>Loading m3u8...</b><span>Preparing Video.js player</span></div>` : `<div class="dsNoTrailer"><h2>No m3u8 URL</h2><p>Add <code>?url=https://example.com/master.m3u8</code></p></div>`}
    </section>

    <script>
      (function(){
        var src = ${JSON.stringify(src)};
        var video = document.getElementById("standaloneM3u8Video");
        var status = document.getElementById("standaloneHlsStatus");
        if (!src || !video) return;

        function setStatus(title, detail, isError) {
          if (!status) return;
          status.hidden = false;
          status.classList.toggle("isError", Boolean(isError));
          status.querySelector("b").textContent = title || "Player";
          status.querySelector("span").textContent = detail || "";
        }

        function hideStatusSoon() {
          setTimeout(function(){ if (status) status.hidden = true; }, 2500);
        }

        function loadHls(callback) {
          if (window.Hls) return callback(true);
          var urls = [
            "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
            "https://unpkg.com/hls.js@1.5.17/dist/hls.min.js",
            "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js"
          ];
          var i = 0;
          function next() {
            if (window.Hls) return callback(true);
            if (i >= urls.length) return callback(false);
            var script = document.createElement("script");
            script.src = urls[i++];
            script.async = true;
            script.onload = function(){ callback(Boolean(window.Hls)); };
            script.onerror = next;
            document.head.appendChild(script);
          }
          next();
        }

        try { video.crossOrigin = "anonymous"; } catch {}

        if (video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl")) {
          setStatus("Loading stream...", "Preparing playback", false);
          video.addEventListener("canplay", function() {
            setStatus("Stream ready", "Press play to begin.", false);
            hideStatusSoon();
          });
          video.addEventListener("error", function() {
            setStatus("Playback unavailable", "This stream could not load. Please retry.", true);
          });
          video.src = src;
          try { video.load(); } catch {}
          return;
        }

        if (window.videojs) {
          try {
            var player = window.videojs(video, {
              controls: true,
              autoplay: false,
              preload: "auto",
              liveui: true,
              responsive: true,
              fluid: true,
              html5: {
                vhs: {
                  overrideNative: true,
                  withCredentials: false,
                  enableLowInitialPlaylist: true,
                  smoothQualityChange: true
                },
                nativeAudioTracks: false,
                nativeVideoTracks: false
              },
              sources: [{ src: src, type: "application/x-mpegURL" }]
            });

            player.ready(function(){
              setStatus("m3u8 ready", "Video.js loaded. Press play.", false);
              hideStatusSoon();
            });

            player.on("error", function(){
              var err = player.error && player.error();
              var message = err && (err.message || err.code) ? String(err.message || ("Code " + err.code)) : "Unknown Video.js error";
              setStatus("Video.js error", message, true);
            });

            return;
          } catch (error) {
            setStatus("Video.js failed", error.message || "Trying HLS.js fallback", true);
          }
        }

        loadHls(function(loaded) {
          if (!loaded || !window.Hls || !window.Hls.isSupported()) {
            setStatus("HLS.js did not load", "This browser needs Video.js or HLS.js to play m3u8.", true);
            return;
          }

          var hls = new window.Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
            maxBufferLength: 60,
            maxMaxBufferLength: 120,
            startPosition: -1,
            capLevelToPlayerSize: true,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 4,
            fragLoadingMaxRetry: 6,
            manifestLoadingTimeOut: 30000,
            levelLoadingTimeOut: 30000,
            fragLoadingTimeOut: 30000
          });

          hls.on(window.Hls.Events.MEDIA_ATTACHED, function() {
            setStatus("Loading m3u8...", "Fetching manifest", false);
            hls.loadSource(src);
          });

          hls.on(window.Hls.Events.MANIFEST_PARSED, function(event, data) {
            setStatus("m3u8 ready", "HLS.js loaded. Press play.", false);
            hideStatusSoon();
          });

          hls.on(window.Hls.Events.ERROR, function(event, data) {
            if (!data) return;
            var details = String(data.details || data.reason || data.type || "Unknown HLS error");
            if (!data.fatal) {
              setStatus("HLS warning", details, false);
              return;
            }
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
              setStatus("HLS network error", "Retrying stream load...", true);
              try { hls.startLoad(); } catch {}
              return;
            }
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              setStatus("HLS media error", "Trying media recovery...", true);
              try { hls.recoverMediaError(); } catch {}
              return;
            }
            setStatus("HLS failed", details, true);
          });

          hls.attachMedia(video);
        });
      })();
    </script>
  </main>`;
  res.send(pageShell({ title: `${SITE_NAME} — M3U8 Player`, active: "watch", body }));
});


async function handleHlsProxyMaster(req, res) {
  setHlsProxyCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const entry = getHlsProxyEntry(req.params.id);
  if (!entry || String(entry.meta?.sourceFormat || "").toLowerCase() === "mp4") {
    return res.status(404).type("text/plain").send("HLS proxy source expired or missing.");
  }

  try {
    const upstream = await fetchHlsProxyUrl(entry, entry.sourceUrl, req);
    const contentType = upstream.headers.get("content-type") || "application/vnd.apple.mpegurl";

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      recordHlsProxyRequest(entry, {
        kind: "master",
        url: entry.sourceUrl,
        status: upstream.status,
        contentType,
        error: body.slice(0, 180) || `HTTP ${upstream.status}`,
      });
      return res.status(upstream.status).type("text/plain").send(`HLS upstream returned HTTP ${upstream.status}: ${body.slice(0, 240)}`);
    }

    const playlist = await upstream.text();
    const rewritten = rewriteHlsPlaylist(playlist, entry.sourceUrl, entry.id);

    recordHlsProxyRequest(entry, {
      kind: "master",
      url: entry.sourceUrl,
      status: upstream.status,
      contentType,
      bytes: Buffer.byteLength(rewritten),
    });

    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.set("X-Swifly-HLS-Proxy", "playlist");
    res.set("X-Swifly-HLS-Proxy", "master");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(rewritten);
  } catch (error) {
    recordHlsProxyRequest(entry, {
      kind: "master",
      url: entry.sourceUrl,
      status: 0,
      error: error.message || "unknown error",
    });
    return res.status(502).type("text/plain").send(`HLS proxy failed: ${error.message || "unknown error"}`);
  }
}

async function handleHlsProxyAsset(req, res) {
  setHlsProxyCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const entry = getHlsProxyEntry(req.params.id);
  if (!entry || String(entry.meta?.sourceFormat || "").toLowerCase() === "mp4") {
    return res.status(404).type("text/plain").send("HLS proxy source expired or missing.");
  }

  let targetUrl = "";
  try {
    targetUrl = hlsProxyBase64UrlDecode(String(req.query.u || ""));
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).type("text/plain").send("Invalid HLS asset URL.");
    }
  } catch {
    return res.status(400).type("text/plain").send("Invalid HLS asset URL.");
  }

  try {
    const upstream = await fetchHlsProxyUrl(entry, targetUrl, req);
    const contentType = upstream.headers.get("content-type") || "";
    const kind = isHlsLikeResponse(targetUrl, contentType) ? "playlist" : "asset";

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      recordHlsProxyRequest(entry, {
        kind,
        url: targetUrl,
        status: upstream.status,
        contentType,
        error: body.slice(0, 180) || `HTTP ${upstream.status}`,
      });
      return res.status(upstream.status).type("text/plain").send(`HLS asset upstream returned HTTP ${upstream.status}: ${body.slice(0, 240)}`);
    }

    res.set("Cache-Control", kind === "playlist" ? "no-store" : "public, max-age=30");

    if (kind === "playlist") {
      const nested = await upstream.text();
      const rewritten = rewriteHlsPlaylist(nested, targetUrl, entry.id);
      recordHlsProxyRequest(entry, {
        kind,
        url: targetUrl,
        status: upstream.status,
        contentType: contentType || "application/vnd.apple.mpegurl",
        bytes: Buffer.byteLength(rewritten),
      });
      res.set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).send(rewritten);
    }

    const headers = hlsProxyResponseHeaders(upstream, contentType || "application/octet-stream");
    for (const [key, value] of Object.entries(headers)) res.set(key, value);

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    recordHlsProxyRequest(entry, {
      kind,
      url: targetUrl,
      status: upstream.status,
      contentType: headers["content-type"],
      bytes: buffer.length,
    });

    if (req.method === "HEAD") return res.status(upstream.status).end();
    return res.status(upstream.status).send(buffer);
  } catch (error) {
    recordHlsProxyRequest(entry, {
      kind: "asset",
      url: targetUrl,
      status: 0,
      error: error.message || "unknown error",
    });
    return res.status(502).type("text/plain").send(`HLS asset proxy failed: ${error.message || "unknown error"}`);
  }
}

const handleMediaFileProxy = createMediaFileProxy({ getEntry: createVerifiedMediaEntryResolver({ getEntry: getHlsProxyEntry }) });
app.options("/api/media-file-proxy/:id/video.mp4", handleMediaFileProxy);
app.head("/api/media-file-proxy/:id/video.mp4", handleMediaFileProxy);
app.get("/api/media-file-proxy/:id/video.mp4", handleMediaFileProxy);

const handleSubtitleProxy = createSubtitleProxy({ getEntry: getSubtitleProxyEntry });
app.options("/api/subtitle-proxy/:id/track.vtt", handleSubtitleProxy);
app.head("/api/subtitle-proxy/:id/track.vtt", handleSubtitleProxy);
app.get("/api/subtitle-proxy/:id/track.vtt", handleSubtitleProxy);

app.options("/api/hls-proxy/:id/master.m3u8", handleHlsProxyMaster);
app.head("/api/hls-proxy/:id/master.m3u8", handleHlsProxyMaster);
app.get("/api/hls-proxy/:id/master.m3u8", handleHlsProxyMaster);

app.options("/api/hls-proxy/:id/asset", handleHlsProxyAsset);
app.head("/api/hls-proxy/:id/asset", handleHlsProxyAsset);
app.get("/api/hls-proxy/:id/asset", handleHlsProxyAsset);

app.get("/api/hls-proxy/:id/debug-master", async (req, res) => {
  res.set("Cache-Control", "no-store");
  setHlsProxyCors(res);

  const entry = getHlsProxyEntry(req.params.id);
  if (!entry || String(entry.meta?.sourceFormat || "").toLowerCase() === "mp4") {
    return res.status(404).type("text/plain").send("HLS proxy source expired or missing.");
  }

  try {
    const upstream = await fetchHlsProxyUrl(entry, entry.sourceUrl, req);
    const playlist = await upstream.text();
    const rewritten = rewriteHlsPlaylist(playlist, entry.sourceUrl, entry.id);

    res.type("text/plain");
    return res.send(rewritten);
  } catch (error) {
    return res.status(502).type("text/plain").send(`HLS debug failed: ${error.message || "unknown error"}`);
  }
});


app.get("/api/hls-proxy/:id/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  const entry = getHlsProxyEntry(req.params.id);
  if (!entry || String(entry.meta?.sourceFormat || "").toLowerCase() === "mp4") {
    return res.status(404).json({ ok: false, error: "HLS proxy source expired or missing" });
  }

  res.json({
    ok: true,
    id: entry.id,
    sourceUrl: entry.sourceUrl,
    headers: Object.keys(entry.headers || {}),
    meta: entry.meta || {},
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    lastError: entry.lastError || "",
    requests: entry.requests || [],
  });
});



app.get("/api/providers", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    configured: apiProviderConfigured(),
    defaultPlayProvider: DEFAULT_PLAY_PROVIDER,
    providers: Object.keys(API_PROVIDERS),
    searchProviders: API_SEARCH_PROVIDERS,
    streamProviderOrder: API_STREAM_PROVIDER_ORDER
  });
});

app.get("/api/provider/home", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [providerName, providerConfig] = apiGetProvider(req.query.provider || "netmirror");
    if (!providerConfig.home) return res.status(400).json({ ok: false, error: "Provider has no home route" });
    const data = await apiProviderFetch(providerConfig.home, { page: req.query.page || 1, maxPages: req.query.maxPages });
    res.json({
      ok: true,
      provider: providerName,
      results: apiTopList(data).map((entry) => apiNormalizeItem(entry, providerName, providerName.includes("anime") ? "anime" : "movie")),
      rawShapeUsed: ["title", "url", "imageUrl", "year", "formats"]
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/provider/search", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const q = apiClean(req.query.q);
  if (!q) return res.status(400).json({ ok: false, error: "Missing q" });
  const requestedProvider = apiClean(req.query.provider).toLowerCase();
  const providers = requestedProvider ? [requestedProvider] : API_SEARCH_PROVIDERS;
  const jobs = await Promise.all(providers.map(async (providerName) => {
    try {
      const providerConfig = API_PROVIDERS[providerName];
      if (!providerConfig?.search) return { provider: providerName, results: [] };
      const data = await apiProviderFetch(providerConfig.search, { q, page: req.query.page || 1 });
      return {
        provider: providerName,
        results: apiTopList(data).map((entry) => apiNormalizeItem(entry, providerName, providerName.includes("anime") ? "anime" : "movie"))
      };
    } catch (error) {
      return { provider: providerName, error: error.message, results: [] };
    }
  }));
  res.json({ ok: true, q, results: jobs.flatMap((job) => job.results), errors: jobs.filter((job) => job.error) });
});

app.get("/api/provider/details", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [providerName, providerConfig] = apiGetProvider(req.query.provider);
    if (!providerConfig.details) return res.status(400).json({ ok: false, error: "Provider has no details route" });
    let params = providerName === "netmirror" ? { id: req.query.id || req.query.url, t: req.query.t } : { url: req.query.url };
    params = await apiApplyTmdbParamsIfNeeded({
      providerName,
      action: "details",
      endpoint: providerConfig.details,
      params: { ...params, tmdb: req.query.tmdb, tmdbId: req.query.tmdbId, id: req.query.id || params.id },
      mediaType: req.query.type === "tv" ? "tv" : "movie",
      attempts: []
    });
    const data = await apiProviderFetch(providerConfig.details, params);
    res.json({
      ok: true,
      provider: providerName,
      item: apiNormalizeResponse(data, providerName, providerName.includes("anime") ? "anime" : "movie")
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/provider/action", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [providerName, providerConfig] = apiGetProvider(req.query.provider);
    const action = apiClean(req.query.action).toLowerCase();
    const endpoint = providerConfig[action];
    if (!endpoint || endpoint.includes("/api/adult/")) return res.status(400).json({ ok: false, error: "Unsupported action" });
    let params = { ...req.query };
    delete params.provider;
    delete params.action;

    params = await apiApplyTmdbParamsIfNeeded({
      providerName,
      action,
      endpoint,
      params,
      mediaType: params.type === "tv" ? "tv" : "movie",
      attempts: []
    });

    if (providerName === "vid") {
      const tmdbId = apiClean(params.tmdb || params.tmdbId || params.id);
      params = {
        tmdb: tmdbId,
        s: params.s || params.season || "",
        e: params.e || params.episode || ""
      };
    }

    const data = await apiProviderFetch(endpoint, params);
    res.json({
      ok: true,
      provider: providerName,
      action,
      item: apiNormalizeResponse(data, providerName, providerName.includes("anime") ? "anime" : "movie"),
      raw: data
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/local/xprime", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const tmdbId = apiClean(req.query.id || req.query.tmdb || req.query.tmdbId);
    const mediaType = req.query.type === "tv" ? "tv" : "movie";
    const season = apiClean(req.query.season || req.query.s || "");
    const episode = apiClean(req.query.episode || req.query.e || "");
    const token = apiClean(req.query.token || req.query.altcha || "");

    if (!tmdbId) return res.status(400).json({ success: false, error: "Missing id/tmdb parameter", streams: [] });

    const data = await localXprimeGetStreams({ tmdbId, mediaType, season, episode, token });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, provider: "xprime-local", error: error.message || "local xprime failed", streams: [] });
  }
});

app.get("/api/local/deep-url-dig", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const url = apiClean(req.query.url);
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  const attempts = [];

  if (!url) return res.status(400).json({ ok: false, error: "Missing url parameter" });

  const result = await localDeepDigForPlayableUrl({
    seedUrls: [url],
    providerName: "deep-url",
    mediaType: type,
    id,
    season,
    episode,
    attempts,
    seen: new Set(),
    maxDepth: 3
  });

  res.json({
    ok: Boolean(result),
    result,
    attempts
  });
});

app.get("/api/local/source-audit", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, generatedFrom: "ScarperApi-zero(1).zip static audit", routes: [{"route":"/api/4khdhub/details","chars":5899,"urls":[],"fields":["URL","downloadLinks","file","href","src","url"]},{"route":"/api/4khdhub/gadget","chars":5874,"urls":[],"fields":["URL","url"]},{"route":"/api/4khdhub","chars":2624,"urls":[],"fields":["href","src","url"]},{"route":"/api/4khdhub/search","chars":3092,"urls":[],"fields":["href","src","url"]},{"route":"/api/animepahe/details","chars":9219,"urls":["https://animepahe.si${href}","https://animepahe.si/api?m=release&id=${session}&sort=episode_asc&page=${currentPage}"],"fields":["URL","downloadLinks","href","src","streamUrl","url"]},{"route":"/api/animepahe","chars":2276,"urls":["https://animepahe.si/api?m=airing&page=${page}"],"fields":["URL","url"]},{"route":"/api/animepahe/search","chars":2194,"urls":["https://animepahe.si/api?m=search&q=${encodeURIComponent(query"],"fields":["URL","url"]},{"route":"/api/animepahe/stream","chars":4714,"urls":[],"fields":["URL","m3u8","url"]},{"route":"/api/animesalt/details","chars":8021,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/animesalt","chars":3376,"urls":[],"fields":["href","src","url"]},{"route":"/api/animesalt/search","chars":3322,"urls":[],"fields":["href","src","url"]},{"route":"/api/animesalt/stream","chars":3549,"urls":[],"fields":["URL","src","url"]},{"route":"/api/castel","chars":24315,"urls":["https://aesdec.nuvioapp.space/decrypt-castle","https://api.fstcy.com","https://api.themoviedb.org/3"],"fields":["URL","streams","url","videoUrl"]},{"route":"/api/desiremovies/details","chars":2863,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/desiremovies/gyaniguru","chars":1795,"urls":["https://desiremovies.gripe/"],"fields":["URL","downloadLinks","href","url"]},{"route":"/api/desiremovies","chars":2374,"urls":[],"fields":["href","src","url"]},{"route":"/api/desiremovies/search","chars":2779,"urls":["https://desiremovies.gripe/kalamkaval-2025-web-hdrip/"],"fields":["href","src","url"]},{"route":"/api/drive/details","chars":3945,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/drive/mdrive","chars":2523,"urls":[],"fields":["HubCloud","URL","href","hubcloud","url"]},{"route":"/api/drive","chars":2363,"urls":[],"fields":["href","src","url"]},{"route":"/api/drive/search","chars":2904,"urls":[],"fields":["url"]},{"route":"/api/extractors/gdflix","chars":1584,"urls":["https://scarperapi-extractor-7tr4.vercel.app/api/gdflix?url=${encodeURIComponent(url"],"fields":["URL","gdflix","url"]},{"route":"/api/extractors/hubcloud","chars":1590,"urls":["https://scarperapi-extractor-7tr4.vercel.app/api/hubcloud?url=${encodeURIComponent(url"],"fields":["URL","hubcloud","url"]},{"route":"/api/extractors/streamtape","chars":0,"urls":[],"fields":[]},{"route":"/api/extractors/xprime","chars":18282,"urls":["https://api.themoviedb.org/3","https://mznxiwqjdiq00239q.space","https://xprime.hunternisha55.workers.dev","https://xprime.su/watch/${tmdbId}","https://xprime.su/watch/${tmdbId}/${season}/${episode}"],"fields":["URL","XPrime","src","streams","url","xprime"]},{"route":"/api/hdhub4u/details","chars":4722,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/hdhub4u/extractor","chars":11472,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/hdhub4u","chars":2194,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/hdhub4u/search","chars":3147,"urls":["https://new2.hdhub4u.fo","https://new2.hdhub4u.fo/","https://search.pingora.fyi/collections/post/documents/search?q=${formattedQuery}&query_by=post_title&page=${page}"],"fields":["url"]},{"route":"/api/kmmovies/details","chars":6044,"urls":[],"fields":["URL","downloadLinks","file","href","src","url"]},{"route":"/api/kmmovies/magiclinks","chars":3981,"urls":["https://kmmovies.store/","https://net-cookie-kacj.vercel.app/api/redirect?url=${encodeURIComponent(link.url"],"fields":["File","URL","downloadLinks","file","href","url"]},{"route":"/api/kmmovies","chars":3220,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/kmmovies/search","chars":3067,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/mod/details","chars":5030,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/mod/modpro","chars":5122,"urls":["https://moviesmod.build/"],"fields":["URL","downloadLinks","href","serverLinks","techLinks","url"]},{"route":"/api/mod","chars":2418,"urls":[],"fields":["href","src","url"]},{"route":"/api/mod/search","chars":2163,"urls":[],"fields":["href","src","url"]},{"route":"/api/movies4u/details","chars":5470,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/movies4u/m4ulinks","chars":4568,"urls":[],"fields":["URL","href","hubcloud","hubcloudLinks","url"]},{"route":"/api/movies4u","chars":3432,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/movies4u/search","chars":2851,"urls":[],"fields":["href","src","url"]},{"route":"/api/netmirror/getpost","chars":3598,"urls":[],"fields":["URL","url"]},{"route":"/api/netmirror","chars":6442,"urls":["https://net22.cc"],"fields":["URL","net22.cc","src","url"]},{"route":"/api/netmirror/search","chars":3537,"urls":["https://net22.cc"],"fields":["URL","net22.cc","url"]},{"route":"/api/netmirror/stream","chars":6912,"urls":["https://net20.cc/","https://net22.cc/play.php","https://net51.cc","https://net51.cc/","https://net51.cc/playlist.php?id=${id}&tm=${currentTimestamp}&h=${encodeURIComponent(h","https://net52.cc/playlist.php?id=${id}&tm=${timestamp}&h=${encodeURIComponent(h"],"fields":["URL","file","net20.cc","net22.cc","net51.cc","net52.cc","playlist","sources","url"]},{"route":"/api/search","chars":5478,"urls":[],"fields":["url"]},{"route":"/api/themovie/det","chars":9305,"urls":["https://themoviebox.org/","https://themoviebox.org/movies/${slug}?id=${id}&type=${parsedUrl.searchParams.get(","https://themoviebox.org/wefeed-h5api-bff/subject/play"],"fields":["URL","playApiUrl","themoviebox","url"]},{"route":"/api/themovie","chars":2270,"urls":[],"fields":["URL","fullUrl","href","src"]},{"route":"/api/themovie/search","chars":8547,"urls":[],"fields":["URL","fullUrl","href","src","url"]},{"route":"/api/themovie/stream","chars":17695,"urls":["https://themoviebox.org/","https://themoviebox.org/movies/${slug}","https://themoviebox.org/moviesDetail/${slug}","https://themoviebox.org/wefeed-h5api-bff/subject/play"],"fields":["URL","src","themoviebox","url"]},{"route":"/api/tm","chars":5749,"urls":["https://vibuxer.com/","https://vibuxer.com/e/${code.trim("],"fields":["URL","streamUrl","streams","url","vibuxer"]},{"route":"/api/uhdmovies/details","chars":7162,"urls":[],"fields":["URL","downloadLinks","file","href","src","url"]},{"route":"/api/uhdmovies","chars":2234,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/uhdmovies/search","chars":2873,"urls":[],"fields":["URL","href","src","url"]},{"route":"/api/uhdmovies/tech","chars":9222,"urls":["https://${mainUrl}${path}","https://net-cookie-kacj.vercel.app/api/vlich?url=${encodeURIComponent(cdnInstantLink"],"fields":["URL","file","href","url","videoUrl"]},{"route":"/api/vega/details","chars":4450,"urls":[],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/vega/nextdrive","chars":1532,"urls":[],"fields":["URL","href","url","vcloudLinks"]},{"route":"/api/vega","chars":1967,"urls":[],"fields":["href","src","url"]},{"route":"/api/vega/search","chars":2567,"urls":[],"fields":["href","src","url"]},{"route":"/api/vid","chars":18078,"urls":["https://api.videasy.net/1movies/sources-with-title","https://api.videasy.net/cdn/sources-with-title","https://api.videasy.net/hdmovie/sources-with-title","https://api.videasy.net/m4uhd/sources-with-title","https://api.videasy.net/meine/sources-with-title","https://api.videasy.net/moviebox/sources-with-title","https://api.videasy.net/myflixerzupcloud/sources-with-title","https://api.videasy.net/onionplay/sources-with-title","https://api.videasy.net/superflix/sources-with-title","https://api.videasy.net/visioncine/sources-with-title","https://api2.videasy.net/cuevana-latino/sources-with-title","https://api2.videasy.net/cuevana-spanish/sources-with-title","https://api2.videasy.net/overflix/sources-with-title","https://api2.videasy.net/primewire/sources-with-title","https://enc-dec.app/api","https://image.tmdb.org/t/p/w1280${data.backdrop_path}","https://image.tmdb.org/t/p/w500${data.poster_path}","https://twilight-cake-defb.hunternisha55.workers.dev/3","https://videasy.net/"],"fields":["VIDEASY","m3u8","mp4","sources","streams","url","videasy"]},{"route":"/api/zeefliz/details","chars":7022,"urls":["https://www.youtube.com/watch?v=${trailerDiv.attr("],"fields":["URL","downloadLinks","href","src","url"]},{"route":"/api/zeefliz/nextdrive","chars":3515,"urls":[],"fields":["URL","href","url","zeeCloudLinks"]},{"route":"/api/zeefliz","chars":2607,"urls":[],"fields":["href","src","url"]},{"route":"/api/zeefliz/search","chars":3681,"urls":[],"fields":["href","src","url"]},{"route":"/api/zinkmovies/details","chars":2064,"urls":[],"fields":["URL","downloadLinks","href","url"]},{"route":"/api/zinkmovies","chars":5927,"urls":[],"fields":["href","src","url"]},{"route":"/api/zinkmovies/search","chars":3245,"urls":[],"fields":["href","src","url"]},{"route":"/api/zinkmovies/zinkcloud","chars":2718,"urls":[],"fields":["File","URL","ZinkCloud","file","href","hubCloudLinks","hubcloud","url","zinkcloud"]}] });
});

app.get("/api/local/runtime-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  let playwrightCoreVersion = "";
  let consumetInstalled = false;
  let chromiumExecutablePath = "";
  let chromiumExecutableExists = false;
  try { playwrightCoreVersion = require("playwright-core/package.json").version; } catch {}
  try { require.resolve("@consumet/extensions"); consumetInstalled = true; } catch {}
  try {
    const chromium = localVidSrcLoadChromium();
    chromiumExecutablePath = chromium.executablePath();
    chromiumExecutableExists = require("fs").existsSync(chromiumExecutablePath);
  } catch (error) {
    chromiumExecutablePath = error.message || "not available";
  }
  res.json({
    ok: true,
    node: process.version,
    playwrightCoreVersion,
    expectedPlaywrightCoreVersion: "1.49.1",
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || "",
    chromiumExecutablePath,
    chromiumExecutableExists,
    consumetInstalled,
    vidsrcEnabled: VIDSRC_ENABLED,
    vidsrcDomains: localVidSrcDomains()
  });
});

app.get("/api/local/streamprovider-urls", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  if (!id) return res.status(400).json({ ok: false, error: "Pass ?tmdb=id" });
  res.json({
    ok: true,
    sourceMode: "streamprovider-url-list-no-browser",
    tmdb: id,
    type,
    order: type === "tv" ? STREAMPROVIDER_TV_ORDER : STREAMPROVIDER_MOVIE_ORDER,
    urls: {
      vidrift: type === "tv" ? `https://embed.vidrift.in/embed/tv/${id}/${season}/${episode}` : `https://embed.vidrift.in/embed/movie/${id}`,
      hexa: type === "tv" ? `https://hexa.su/watch/tv/${id}/${season}/${episode}` : `https://hexa.su/watch/movie/${id}`,
      cinezo: type === "tv" ? `https://www.cinezo.net/watch/tv/${id}?season=${season}&episode=${episode}` : `https://www.cinezo.net/watch/movie/${id}`,
      sflix: "disabled by default because sflix2.to search timed out"
    }
  });
});

app.get("/api/playback/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true, browser: localStreamProviderRuntime().getStatus(),
    discovery: { enabled: STREAMPROVIDER_ENABLED, providers: STREAMPROVIDER_MOVIE_ORDER, tvProviders: STREAMPROVIDER_TV_ORDER, providerTimeoutMs: STREAMPROVIDER_PROVIDER_TIMEOUT_MS, routeTimeoutMs: STREAMPROVIDER_ROUTE_TIMEOUT_MS, hedgeDelayMs: STREAMPROVIDER_HEDGE_DELAY_MS, maxConcurrentCaptures: STREAMPROVIDER_MAX_CONCURRENT,
      nuvio: { enabled: NUVIO_ENABLED, providers: NUVIO_PROVIDER_ORDER, providerTimeoutMs: NUVIO_PROVIDER_TIMEOUT_MS, timeoutMs: NUVIO_TIMEOUT_MS } }
  });
});

app.get("/api/local/streamprovider-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");

  if (!/^\d{1,10}$/.test(id) || !/^[1-9]\d{0,3}$/.test(season) || !/^[1-9]\d{0,3}$/.test(episode)) return res.status(400).json({ ok: false, error: "Pass a numeric TMDB id and valid season/episode." });

  const attempts = [];
  const startedAt = Date.now();
  try {
    const debug = await localStreamProviderDebug({ mediaType: type, id, season, episode, attempts });
    res.json({
      ok: Boolean(debug.winner),
      sourceMode: "local-streamprovider-main-any-media",
      tmdb: debug.tmdbId || id,
      type,
      season: type === "tv" ? season : "",
      episode: type === "tv" ? episode : "",
      ms: Date.now() - startedAt,
      providerOrder: type === "tv" ? STREAMPROVIDER_TV_ORDER : STREAMPROVIDER_MOVIE_ORDER,
      code: debug.payload?.code || "",
      browser: localStreamProviderRuntime().getStatus(),
      winner: debug.winner ? { playbackUrl: debug.winner.playbackUrl, streamType: debug.winner.streamType, apiProvider: debug.winner.apiProvider } : null,
      providersTried: debug.payload?.providersTried || [],
      results: (debug.payload?.results || []).map(result => ({ provider: result.provider, ok: result.ok, code: result.code || "", ms: result.ms, diagnostics: result.diagnostics || {} }))
    });
  } catch (error) {
    res.status(504).json({
      ok: false,
      sourceMode: "local-streamprovider-main-any-media",
      code: ["browser_unavailable", "provider_blocked", "no_source"].includes(error.code) ? error.code : "timeout",
      error: "Source discovery did not complete. Check playback health and retry.",
      browser: localStreamProviderRuntime().getStatus(),
      tmdb: id,
      type,
      season: type === "tv" ? season : "",
      episode: type === "tv" ? episode : "",
      ms: Date.now() - startedAt,
      providerOrder: type === "tv" ? STREAMPROVIDER_TV_ORDER : STREAMPROVIDER_MOVIE_ORDER
    });
  }
});

app.get("/api/local/filmu-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");

  if (!id) return res.status(400).json({ ok: false, error: "Pass ?tmdb=id" });

  const embedUrls = localFilmuBuildEmbedUrls({ tmdbId: id, mediaType: type, season, episode });
  const startedAt = Date.now();

  try {
    const debug = await Promise.race([
      localFilmuDebug({ mediaType: type, id, season, episode }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`filmu debug timed out after ${FILMU_ROUTE_TIMEOUT_MS}ms`)), FILMU_ROUTE_TIMEOUT_MS))
    ]);

    res.json({
      ok: Boolean(debug.winner),
      sourceMode: "local-filmu-network-m3u8",
      target: FILMU_EMBED_TEMPLATE,
      embedUrls,
      tmdb: id,
      type,
      season: type === "tv" ? season : "",
      episode: type === "tv" ? episode : "",
      ms: Date.now() - startedAt,
      winner: debug.winner,
      attempts: debug.attempts,
      payload: debug.payload
    });
  } catch (error) {
    res.status(504).json({
      ok: false,
      sourceMode: "local-filmu-network-m3u8",
      error: error.message || "failed",
      target: FILMU_EMBED_TEMPLATE,
      embedUrls,
      tmdb: id,
      type,
      season: type === "tv" ? season : "",
      episode: type === "tv" ? episode : "",
      ms: Date.now() - startedAt,
      hint: "This route uses Playwright. If it times out, test the first embedUrl directly in a browser and check Render logs for [fatal] or Playwright errors."
    });
  }
});

app.get("/api/local/filmu-url", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  if (!id) return res.status(400).json({ ok: false, error: "Pass ?tmdb=id" });
  const embedUrls = localFilmuBuildEmbedUrls({ tmdbId: id, mediaType: type, season, episode });
  res.json({
    ok: true,
    sourceMode: "local-filmu-url-only",
    tmdb: id,
    type,
    season: type === "tv" ? season : "",
    episode: type === "tv" ? episode : "",
    target: FILMU_EMBED_TEMPLATE,
    embedUrl: embedUrls[0] || "",
    embedUrls,
    fallbackEnabled: FILMU_TRY_FALLBACKS
  });
});

app.get("/api/local/vidsrc-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");

  if (!id) return res.status(400).json({ ok: false, error: "Pass ?tmdb=id" });

  try {
    const debug = await localVidSrcDebug({ mediaType: type, id, season, episode });
    res.json({
      ok: Boolean(debug.winner),
      sourceMode: "local-vidsrc-playwright-source-code",
      tmdb: id,
      type,
      season: type === "tv" ? season : "",
      episode: type === "tv" ? episode : "",
      winner: debug.winner,
      attempts: debug.attempts,
      payload: debug.payload
    });
  } catch (error) {
    res.status(500).json({ ok: false, sourceMode: "local-vidsrc-playwright-source-code", error: error.message || "failed" });
  }
});

app.get("/api/local/consumet-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : (req.query.type === "anime" ? "anime" : "movie");
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const provider = apiClean(req.query.provider || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  let title = apiClean(req.query.q || req.query.title || "");
  let year = apiClean(req.query.year || "");
  const metaAttempts = [];

  if (!title && id && type !== "anime") {
    try {
      const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
      const details = await tmdb(endpoint, {}, CACHE_TTL.long);
      title = getTitle(details);
      year = getYear(type === "tv" ? details.first_air_date : details.release_date);
    } catch (error) {
      metaAttempts.push(`tmdb metadata: ${error.message || "failed"}`);
    }
  }

  if (!title) return res.status(400).json({ ok: false, error: "Pass ?q=title or ?tmdb=id" });

  const debug = await localConsumetDebug({ title, year, mediaType: type, id, season, episode, provider });
  res.json({
    ok: Boolean(debug.winner),
    sourceMode: "local-consumet-source-code",
    title,
    year,
    titleVariants: localSourceTitleVariants(title, year),
    winner: debug.winner,
    attempts: [...metaAttempts, ...debug.attempts],
    providers: debug.rows
  });
});

app.get("/api/local/download-sites-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || "");
  const provider = apiClean(req.query.provider || "");
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  let title = apiClean(req.query.q || req.query.title || "");
  let year = apiClean(req.query.year || "");
  const attempts = [];
  if (!title && id) {
    try {
      const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
      const details = await tmdb(endpoint, {}, CACHE_TTL.long);
      title = getTitle(details);
      year = getYear(type === "tv" ? details.first_air_date : details.release_date);
    } catch (error) { attempts.push(`tmdb metadata: ${error.message || "failed"}`); }
  }
  if (!title) return res.status(400).json({ ok: false, error: "Pass ?q=title or ?tmdb=id" });
  const providerIds = provider ? provider.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
  const debug = await localDownloadSitesDebug({ title, year, mediaType: type, id, season, episode, providerIds });
  res.json({ ok: Boolean(debug.winner), title, year, titleVariants: localSourceTitleVariants(title, year), winner: debug.winner, attempts: [...attempts, ...debug.attempts], providers: debug.rows });
});

app.get("/api/local/source-url-patterns", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    mode: "source-code-pattern-map",
    playableFields: [
      "streams[].url",
      "sources[].url",
      "sources[].file",
      "data.videoUrl",
      "data.videos[].url",
      "streamUrl",
      "streams.hls4",
      "streams.hls3",
      "streams.hls2",
      "primary",
      "fallback1",
      "fallback2",
      "downloadLinks[].url",
      "serverLinks[].url",
      "techLinks[].url",
      "vcloudLinks[].url",
      "zeeCloudLinks[]",
      "hubcloudLinks[]"
    ],
    localSourcePorts: [
      "vid",
      "castle",
      "xprime",
      "netmirror",
      "themovie",
      "tm/vibuxer",
      "animepahe stream extractor",
      "generic deep html/js/json digger",
      "download-sites multi-provider: 4khdhub/hdhub4u/movies4u/zeefliz/vega/zinkmovies/kmmovies/uhdmovies/moviesmod/drive/desiremovies",
      "consumet local bridge: flixhq/sflix/goku/movieshd/fmovies/zoro/gogoanime/animepahe"
    ],
    safetySkips: [
      "/api/adult/*",
      "hentai",
      "youtube downloaders",
      "image/archive/subtitle-only files"
    ]
  });
});


app.get("/api/local/super-source-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || req.query.url);
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");
  const provider = apiClean(req.query.provider || "vid");

  const attempts = [];
  const probes = [];
  let winner = null;

  async function probe(label, promiseFactory, providerName, providerConfig) {
    const startedAt = Date.now();
    try {
      const payload = await promiseFactory();
      const urls = apiCollectCandidateUrls(payload);
      const result = await apiFindPlayableFromPayload({
        payload,
        providerName,
        providerConfig,
        mediaType: type,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen: new Set()
      });
      const row = {
        provider: label,
        ok: Boolean(result),
        ms: Date.now() - startedAt,
        result: result || null,
        candidateUrlCount: urls.length,
        candidateUrls: urls.slice(0, 25),
        streamCount: Array.isArray(payload?.streams) ? payload.streams.length : undefined,
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : []
      };
      probes.push(row);
      if (!winner && result) winner = result;
      return result;
    } catch (error) {
      probes.push({ provider: label, ok: false, ms: Date.now() - startedAt, error: error.message || "failed" });
      return null;
    }
  }

  let title = "";
  let releaseYear = "";
  try {
    const tmdbId = await apiResolveTmdbIdForApi({ mediaType: type, id, attempts });
    const endpoint = type === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const details = await tmdb(endpoint, {}, CACHE_TTL.long);
    title = getTitle(details);
    releaseYear = getYear(type === "tv" ? details.first_air_date : details.release_date);
  } catch (error) {
    attempts.push(`tmdb metadata: ${error.message || "failed"}`);
  }

  if (id) {
    await probe("streamprovider-local", () => localStreamProviderGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "streamprovider-local", {});
    await probe("vid-local", () => localVidGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "vid-local", API_PROVIDERS.vid || {});
    await probe("castle-local", () => localCastleGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "castle-local", API_PROVIDERS.castel || {});
    await probe("xprime-local", () => localXprimeGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "xprime-local", API_PROVIDERS.xprime || {});
    await probe("filmu-local", () => localFilmuGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "filmu-local", {});
    await probe("vidsrc-local", () => localVidSrcGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "vidsrc-local", {});
  }

  if (title) {
    try {
      const net = await localNetMirrorByTitle({ title, year: releaseYear, mediaType: type, id, season, episode, attempts });
      probes.push({ provider: "netmirror-local", ok: Boolean(net), result: net || null });
      if (!winner && net) winner = net;
    } catch (error) {
      probes.push({ provider: "netmirror-local", ok: false, error: error.message || "failed" });
    }

    try {
      const movieBox = await localTheMovieByTitle({ title, year: releaseYear, mediaType: type, id, season, episode, attempts });
      probes.push({ provider: "themovie-local", ok: Boolean(movieBox), result: movieBox || null });
      if (!winner && movieBox) winner = movieBox;
    } catch (error) {
      probes.push({ provider: "themovie-local", ok: false, error: error.message || "failed" });
    }

    try {
      const debugConsumet = await localConsumetDebug({ title, year: releaseYear, mediaType: type, id, season, episode, provider });
      probes.push({
        provider: "consumet-local",
        ok: Boolean(debugConsumet.winner),
        result: debugConsumet.winner || null,
        providerRows: debugConsumet.rows,
        attempts: debugConsumet.attempts
      });
      if (!winner && debugConsumet.winner) winner = debugConsumet.winner;
    } catch (error) {
      probes.push({ provider: "consumet-local", ok: false, error: error.message || "failed" });
    }

    try {
      const debugDownloadSites = await localDownloadSitesDebug({ title, year: releaseYear, mediaType: type, id, season, episode });
      probes.push({ provider: "download-sites-local", ok: Boolean(debugDownloadSites.winner), result: debugDownloadSites.winner || null, providerRows: debugDownloadSites.rows, attempts: debugDownloadSites.attempts });
      if (!winner && debugDownloadSites.winner) winner = debugDownloadSites.winner;
    } catch (error) {
      probes.push({ provider: "download-sites-local", ok: false, error: error.message || "failed" });
    }
  }

  const normal = await fetchApiProviderSource({ type, id, season, episode, provider });
  if (!winner && normal?.status === "ok") winner = normal;

  res.json({
    ok: Boolean(winner),
    sourceMode: USE_EXTERNAL_PROVIDER_API ? "local+external-api" : "local-source-code-only",
    tmdb: id,
    title,
    year: releaseYear,
    winner,
    normalSource: normal,
    attempts,
    probes
  });
});


app.get("/api/local/all-source-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || req.query.url);
  const season = apiClean(req.query.season || req.query.s || "1");
  const episode = apiClean(req.query.episode || req.query.e || "1");

  const attempts = [];
  const results = [];

  let title = "";
  let releaseYear = "";
  let releaseStatus = { known: false, future: false, label: "unknown" };

  try {
    const tmdbId = await apiResolveTmdbIdForApi({ mediaType: type, id, attempts });
    const endpoint = type === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const details = await tmdb(endpoint, {}, CACHE_TTL.long);
    title = getTitle(details);
    releaseYear = getYear(type === "tv" ? details.first_air_date : details.release_date);
    releaseStatus = localSourceReleaseStatus({
      mediaType: type,
      releaseDate: details.release_date,
      firstAirDate: details.first_air_date
    });
  } catch (error) {
    attempts.push(`tmdb metadata: ${error.message || "failed"}`);
  }

  async function tryPayload(label, promiseFactory, providerName, providerConfig) {
    try {
      const payload = await promiseFactory();
      const result = await apiFindPlayableFromPayload({
        payload,
        providerName,
        providerConfig,
        mediaType: type,
        id,
        season,
        episode,
        attempts,
        depth: 0,
        seen: new Set()
      });
      results.push({
        provider: label,
        ok: Boolean(result),
        result: result || null,
        streamCount: Array.isArray(payload?.streams) ? payload.streams.length : undefined,
        payloadSummary: payload && typeof payload === "object" ? Object.keys(payload) : []
      });
      return result;
    } catch (error) {
      results.push({ provider: label, ok: false, error: error.message || "failed" });
      return null;
    }
  }

  if (id) {
    await tryPayload("streamprovider-local", () => localStreamProviderGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "streamprovider-local", {});
    await tryPayload("vid-local", () => localVidGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "vid-local", API_PROVIDERS.vid || {});
    await tryPayload("castle-local", () => localCastleGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "castle-local", API_PROVIDERS.castel || {});
    await tryPayload("xprime-local", () => localXprimeGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "xprime-local", API_PROVIDERS.xprime || {});
    await tryPayload("filmu-local", () => localFilmuGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "filmu-local", {});
    await tryPayload("vidsrc-local", () => localVidSrcGetStreams({ tmdbId: id, mediaType: type, season: type === "tv" ? season : "", episode: type === "tv" ? episode : "" }), "vidsrc-local", {});
  }

  if (title) {
    try {
      const net = await localNetMirrorByTitle({ title, year: releaseYear, mediaType: type, id, season, episode, attempts });
      results.push({ provider: "netmirror-local", ok: Boolean(net), result: net || null });
    } catch (error) {
      results.push({ provider: "netmirror-local", ok: false, error: error.message || "failed" });
    }

    try {
      const movieBox = await localTheMovieByTitle({ title, year: releaseYear, mediaType: type, id, season, episode, attempts });
      results.push({ provider: "themovie-local", ok: Boolean(movieBox), result: movieBox || null });
    } catch (error) {
      results.push({ provider: "themovie-local", ok: false, error: error.message || "failed" });
    }
  }

  res.json({
    ok: results.some((entry) => entry.ok),
    sourceMode: "local-source-code-only",
    tmdb: id,
    title,
    year: releaseYear,
    titleVariants: localSourceTitleVariants(title, releaseYear),
    releaseStatus,
    note: releaseStatus.future
      ? "This title is not released yet. Local source-code providers returning zero streams is expected unless a provider has a pre-release placeholder stream."
      : "",
    attempts,
    results
  });
});


app.get("/api/local/netmirror", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const q = apiClean(req.query.q || req.query.title);
    const id = apiClean(req.query.id);
    if (id) {
      return res.json(await localNetMirrorStreamRaw(id));
    }
    if (!q) return res.status(400).json({ success: false, error: "Pass ?q=title or ?id=netmirror_id" });
    const data = await localNetMirrorSearchRaw(q);
    res.json({ ...data, extractedIds: localSourceDeepCollectIds(data) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "local netmirror failed" });
  }
});

app.get("/api/local/themovie", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const q = apiClean(req.query.q || req.query.title);
    const url = apiClean(req.query.url);
    if (url) {
      return res.json(await localTheMovieDetailsAndPlay(url, apiClean(req.query.season), apiClean(req.query.episode)));
    }
    if (!q) return res.status(400).json({ success: false, error: "Pass ?q=title or ?url=detail_url" });
    res.json(await localTheMovieSearchRaw(q));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "local themovie failed" });
  }
});

app.get("/api/local/tm", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const url = apiClean(req.query.url);
    const code = apiClean(req.query.code);
    res.json(await localTmExtract({ url, code, check: apiClean(req.query.check || "0") }));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "local tm failed" });
  }
});


app.get("/api/local/castle", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const tmdbId = apiClean(req.query.id || req.query.tmdb || req.query.tmdbId);
    const mediaType = req.query.type === "tv" ? "tv" : "movie";
    const season = apiClean(req.query.season || req.query.s || "");
    const episode = apiClean(req.query.episode || req.query.e || "");

    if (!tmdbId) {
      return res.status(400).json({ success: false, error: "Missing id/tmdb parameter", streams: [] });
    }

    if (mediaType === "tv" && (!season || !episode)) {
      return res.status(400).json({ success: false, error: "TV requires season and episode", streams: [] });
    }

    const data = await localCastleGetStreams({ tmdbId, mediaType, season, episode });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, provider: "castle-local", error: error.message || "local castle failed", streams: [] });
  }
});


app.get("/api/local/vid", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const tmdbId = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id);
    const season = apiClean(req.query.s || req.query.season || "");
    const episode = apiClean(req.query.e || req.query.episode || "");
    const mediaType = season && episode ? "tv" : (req.query.type === "tv" ? "tv" : "movie");

    if (!tmdbId) {
      return res.status(400).json({ success: false, error: "Missing tmdb/id parameter" });
    }

    const data = await localVidGetStreams({ tmdbId, mediaType, season, episode });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "local vid failed", streams: [] });
  }
});

app.get("/api/provider/all-source-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || req.query.url);
  const results = [];

  for (const providerName of API_M3U8_PROVIDER_ORDER) {
    try {
      const result = await fetchApiProviderSource({
        type,
        id,
        season: apiClean(req.query.season || req.query.s || "1"),
        episode: apiClean(req.query.episode || req.query.e || "1"),
        provider: providerName
      });
      results.push({ provider: providerName, ...result });
      if (result?.status === "ok" && req.query.stopOnFirst !== "false") break;
    } catch (error) {
      results.push({ provider: providerName, status: "error", message: error.message || "failed" });
    }
  }

  res.json({
    ok: results.some((entry) => entry.status === "ok"),
    tried: API_M3U8_PROVIDER_ORDER,
    results
  });
});

app.get("/api/provider/raw-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const providerName = apiClean(req.query.provider || DEFAULT_PLAY_PROVIDER).toLowerCase();
    const action = apiClean(req.query.action || "stream").toLowerCase();
    const providerConfig = API_PROVIDERS[providerName];
    if (!providerConfig) return res.status(400).json({ ok: false, error: "Unsupported provider" });
    const endpoint = providerConfig[action] || providerConfig.stream || providerConfig.details || providerConfig.search || providerConfig.home;
    if (!endpoint) return res.status(400).json({ ok: false, error: "Provider action missing endpoint" });

    let params = { ...req.query };
    delete params.provider;
    delete params.action;
    params = await apiApplyTmdbParamsIfNeeded({
      providerName,
      action,
      endpoint,
      params,
      mediaType: params.type === "tv" ? "tv" : "movie",
      attempts: []
    });

    const data = await apiProviderFetch(endpoint, params);
    res.json({
      ok: true,
      provider: providerName,
      action,
      endpoint,
      paramsSent: params,
      normalizedSources: apiNormalizeSources(data),
      candidateUrls: apiCollectCandidateUrls(data),
      raw: data
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/provider/source-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || req.query.url);
    const result = await fetchApiProviderSource({
      type,
      id,
      season: apiClean(req.query.season || req.query.s || "1"),
      episode: apiClean(req.query.episode || req.query.e || "1"),
      provider: req.query.provider
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ status: "error", error: error.message });
  }
});

app.get("/api/provider/embed", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const id = apiClean(req.query.tmdb || req.query.tmdbId || req.query.id || req.query.url);
    const result = await fetchApiProviderSource({
      type,
      id,
      season: apiClean(req.query.season || req.query.s || "1"),
      episode: apiClean(req.query.episode || req.query.e || "1"),
      provider: req.query.provider
    });

    if (result.status !== "ok") {
      return res.status(404).json({
        ok: false,
        error: result.message || result.reason || "No API source found",
        attempts: result.attempts || [],
        sources: []
      });
    }

    res.json({
      ok: true,
      title: result.normalized?.title || "",
      year: result.normalized?.year || "",
      type,
      poster: result.normalized?.poster || "",
      backdrop: result.normalized?.backdrop || "",
      overview: result.normalized?.overview || "",
      sources: [{
        name: result.streamName || result.apiProvider || "api source",
        quality: result.streamQuality || "",
        url: result.playbackUrl,
        headers: result.streamHeaders || {},
        type: result.streamType === "m3u8" ? "application/x-mpegurl" : (result.streamType === "dash" ? "application/dash+xml" : (
          result.streamType === "webm" ? "video/webm" :
          result.streamType === "mov" ? "video/quicktime" :
          result.streamType === "mkv" ? "video/x-matroska" :
          result.streamType === "avi" ? "video/x-msvideo" :
          result.streamType === "ts" ? "video/mp2t" :
          "video/mp4"
        )),
        format: result.streamType || ""
      }],
      providerKind: result.providerKind,
      apiProvider: result.apiProvider || "",
      tmdbId: result.movieId || "",
      embedUrl: result.playbackUrl || "",
      embeddedM3u8Url: result.embeddedM3u8Url || "",
      m3u8Embedded: Boolean(result.m3u8Embedded),
      originalPlaybackUrl: result.originalPlaybackUrl || "",
      hlsProxyUrl: result.hlsProxyUrl || "",
      attempts: result.attempts || []
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, sources: [] });
  }
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/api/proxy-video-wait/:type/:id", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const params = {
    type: req.params.type,
    id: req.params.id,
    season: req.query.season || req.query.s || "1",
    episode: req.query.episode || req.query.e || "1",
    provider: req.query.provider || ""
  };
  const requestedWait = Number(req.query.wait || 0);
  const waitMs = Number.isFinite(requestedWait) ? Math.max(0, Math.min(8000, requestedWait)) : 0;
  const controller = new AbortController();
  const onClose = () => { if (!res.writableEnded) controller.abort(new Error("Source viewer disconnected.")); };
  if (waitMs) res.on("close", onClose);
  try {
    const result = waitMs
      ? await movieSourceJobs.wait(params, { retry: req.query.retry === "1", timeoutMs: waitMs, signal: controller.signal })
      : movieSourceJobs.poll(params, { retry: req.query.retry === "1" });
    if (controller.signal.aborted) return;
    if (result.code === "invalid_request") res.status(400);
    res.json({ ...result, ...(waitMs && result.status === "loading" ? { retryAfterMs: 250 } : {}), serverTime: Date.now() });
  } catch (error) { if (!controller.signal.aborted) next(error); }
  finally { res.off("close", onClose); }
});

app.get("/api/proxy-video/:type/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({
    type: req.params.type,
    id: req.params.id,
    season: req.query.season || req.query.s || "1",
    episode: req.query.episode || req.query.e || "1",
    provider: req.query.provider || "",
    retry: req.query.retry === "1",
  });
  if (result.code === "invalid_request") res.status(400);
  res.json(result);
});

app.get("/api/hls-source/movie/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({ type: "movie", id: req.params.id, provider: req.query.provider || "" });
  res.json({
    ok: result.status === "ok",
    status: result.status,
    providerKind: result.providerKind || "",
    movieId: result.movieId || req.params.id,
    playbackUrl: result.playbackUrl || "",
    originalPlaybackUrl: result.originalPlaybackUrl || "",
    hlsProxyUrl: result.hlsProxyUrl || "",
    hlsProxyId: result.hlsProxyId || "",
    hlsProxyStatusUrl: result.hlsProxyStatusUrl || "",
    m3u8: result.m3u8 || "",
    streamType: result.streamType || "",
    streamMode: result.streamMode || "",
    streamQuality: result.streamQuality || "",
    streamName: result.streamName || "",
    streamNameFix: true,
    audioLanguage: result.audioLanguage || "",
    playbackSources: result.playbackSources || [],
    subtitles: result.subtitles || [],
    m3u8ProxyDefault: true,
    hlsProxyEnabled: hlsProxyEnabled(),
    message: result.message || "",
    attempts: result.attempts || [],
  });
});

app.get("/api/proxy-video-debug/movie/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = await fetchProxyVideoSource({ type: "movie", id: req.params.id, provider: req.query.provider || "" });
  res.json({
    ...result,
    hlsProxyEnabled: hlsProxyEnabled(),
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
    ? "Make a local SwiflyTV account for profiles, watchlists, continue watching, and watch room features on this device."
    : "Log in to your SwiflyTV profile on this device.";

  const body = `<main class="dsAuthPage dsAuthPageSafe ${isSignup ? "svAuthSignupPage" : "svAuthLoginPage"}">
    <div class="dsAuthTopActions">
      <a href="/welcome">Explore Swifly</a>
      <button type="button" data-st-open aria-label="Customize appearance" title="Swifly Studio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3 14.7 9.3 21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/></svg>
      </button>
    </div>
    <section class="dsAuthShell dsAuthShellSafe">
      <a class="dsAuthBrand" href="/welcome"><span aria-hidden="true"></span>${escapeHtml(SITE_NAME)}</a>
      <section class="dsAuthCard">
        <div class="dsAuthSwitch" aria-label="Account options">
          <a class="${!isSignup ? "active" : ""}" href="/login"${!isSignup ? ' aria-current="page"' : ""}>Log in</a>
          <a class="${isSignup ? "active" : ""}" href="/signup"${isSignup ? ' aria-current="page"' : ""}>Sign up</a>
        </div>
        <h1>${isSignup ? "Create account" : "Welcome back"}</h1>
        <p class="svAuthIntro">${isSignup ? "Save your favorites. Make movie night your own." : "Log in to continue watching."}</p>
        <form id="safeAuthForm" class="dsSafeAuthForm">
          ${isSignup ? `<label><span>Name</span><input name="name" type="text" placeholder="Your name" autocomplete="name" required /></label>` : ""}
          <label><span>Email</span><input name="email" type="email" placeholder="you@example.com" autocomplete="email" required /></label>
          <label><span>Password</span><span class="svAuthPasswordField"><input name="password" type="password" placeholder="Your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required /><button type="button" class="svAuthPasswordToggle" data-auth-toggle-password aria-label="Show password" aria-pressed="false">Show</button></span></label>
          <button class="dsPrimaryBtn" type="submit"><span>${isSignup ? "Create account" : "Log in"}</span><span aria-hidden="true">↗</span></button>
        </form>
        <p class="dsAuthFinePrint">${isSignup ? `Already have an account? <a href="/login">Log in</a>` : `New to Swifly? <a href="/signup">Sign up</a>`}</p>
        <p class="svAuthPrivacy">Your profile is stored on this device.</p>
      </section>
    </section>

    <script>
      (function safeAuth(){
        const form = document.getElementById("safeAuthForm");
        if (!form) return;

        const mode = "${isSignup ? "signup" : "login"}";
        const passwordToggle = form.querySelector("[data-auth-toggle-password]");
        passwordToggle?.addEventListener("click", function() {
          const input = form.elements.namedItem("password");
          if (!input) return;
          const showing = input.type === "password";
          input.type = showing ? "text" : "password";
          passwordToggle.textContent = showing ? "Hide" : "Show";
          passwordToggle.setAttribute("aria-label", showing ? "Hide password" : "Show password");
          passwordToggle.setAttribute("aria-pressed", String(showing));
        });
        const params = new URLSearchParams(location.search);
        const requestedRedirect=params.get("redirect") || "/profiles";
        const redirect=requestedRedirect.startsWith("/")&&!requestedRedirect.startsWith("//")?requestedRedirect:"/profiles";

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
              { id: "main", name: account.name || "Main", mode: "standard" },
              { id: "kids", name: "Kids", mode: "kids" }
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
  const body = `<main class="dsPlainPage dsAccountPage svCinemaPage" data-cinema-page="account">
    <section class="dsAccountHero" data-cinema-reveal>
      <div class="svAccountIdentity">
        <div class="svAccountIdentityHeader">
          <span class="svAccountAvatar" data-account-avatar aria-hidden="true">S</span>
          <span class="dsEyebrow">Your SwiflyTV<span class="svAccountIdentityCaption">A space that feels like you.</span></span>
        </div>
        <h1>Your world of stories.</h1>
        <p>Your favorites, your next watch, your people. All in one place.</p>
      </div>
      <div class="dsAccountActions">
        <span class="svCinemaEyebrow">YOUR NEXT GOOD EVENING</span>
        <a class="dsPrimaryBtn" href="/continue">${cleanIcon("play")}Pick up where you left off</a>
        <a class="dsSecondaryBtn" href="/profiles">${cleanIcon("user")}Switch profile</a>
        <a class="dsGhostPill" href="/social?tab=watchrooms">${cleanIcon("people")}Make it a movie night</a>
      </div>
    </section>

    <div class="svAccountSectionHead" data-cinema-reveal><span class="svCinemaEyebrow">YOUR SPACE</span><h2>A little more you.</h2><p>Keep the stories you love close.</p></div>
    <section class="dsAccountGrid" aria-label="Account shortcuts" data-cinema-reveal>
      <a class="dsAccountCard" href="/profiles">
        <span class="svAccountTileIcon">${cleanIcon("user")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span>
        <h2>Profiles</h2>
        <p>A seat for everyone. Choose who's watching.</p>
      </a>
      <a class="dsAccountCard" href="/profiles/manage">
        <span class="svAccountTileIcon">${cleanIcon("settings")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span>
        <h2>Manage Profiles</h2>
        <p>Create, rename, or remove profiles.</p>
      </a>
      <a class="dsAccountCard" href="/continue">
        <span class="svAccountTileIcon">${cleanIcon("play")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span>
        <h2>Continue Watching</h2>
        <p>Jump back into what you were watching.</p>
      </a>
      <a class="dsAccountCard" href="/my-list">
        <span class="svAccountTileIcon">${cleanIcon("bookmark")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span>
        <h2>My List</h2>
        <p>View titles saved for later.</p>
      </a>
      <a class="dsAccountCard" href="/social?tab=watchrooms">
        <span class="svAccountTileIcon">${cleanIcon("people")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span>
        <h2>Party Hub</h2>
        <p>Create or join a synced room.</p>
      </a>
      <a class="dsAccountCard" href="/liked"><span class="svAccountTileIcon">${cleanIcon("heart")}</span><span class="svAccountTileArrow">${cleanIcon("arrow")}</span><h2>Favorites</h2><p>The films and series you keep coming back to.</p></a>
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
          var avatar = document.querySelector("[data-account-avatar]");
          if (avatar) avatar.textContent = Array.from(String(profile?.name || session?.name || "SwiflyTV"))[0].toUpperCase();
        } catch {}
      })();
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Account`, active: "account", body }));
}


function profilesPage(req, res) {
  const body = `<main class="dsPlainPage dsProfilesPage dsProfilesSelectPage svProfilesCinematic svCinemaPage" data-cinema-page="profiles">
    <section class="dsProfilesHero dsCleanHero" data-cinema-reveal>
      <span class="dsEyebrow">Your home cinema</span>
      <h1>Who is watching?</h1>
      <p>Your movies, your favorites, your space. Choose who's watching.</p>
    </section>

    <section class="dsProfilesSelectShell" data-cinema-reveal>
      <div class="dsProfilesGrid dsProfilesChoiceGrid" id="profilesGrid"></div>

      <div class="dsProfilesQuickActions">
        <a class="dsSecondaryBtn" href="/profiles/manage">${cleanIcon("settings")}Manage profiles</a>
        <a class="dsGhostPill" href="/account">${cleanIcon("user")}Your account</a>
      </div>
    </section>

    <p class="svProfileError" data-profile-error role="alert" hidden></p>
    <script>
      document.addEventListener("DOMContentLoaded", function () { window.SwiflyProfiles?.mount(); }, { once: true });
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Profiles`, active: "profiles", body }));
}



function profilesManagePage(req, res) {
  const body = `<main class="dsPlainPage dsProfilesManagePage svProfilesCinematic svCinemaPage" data-cinema-page="profile-settings">
    <section class="dsCleanHero dsProfilesManageHero" data-cinema-reveal>
      <div class="svProfileManageIntro">
        <span class="dsEyebrow">Your home cinema</span>
        <h1>A space for everyone.</h1>
        <p>Personal lists. Familiar favorites. A seat of their own.</p>
      </div>
      <div class="dsHeroMiniActions">
        <a class="dsPrimaryBtn" href="/profiles">${cleanIcon("people")}Choose a profile</a>
        <a class="dsSecondaryBtn" href="/account">${cleanIcon("user")}Your account</a>
      </div>
    </section>

    <section class="dsProfileManagerLayout" data-cinema-reveal>
      <aside class="dsProfileManagerPanel">
        <span class="svProfileCreateMark" aria-hidden="true">${cleanIcon("user")}</span>
        <span class="dsPanelLabel">Create profile</span>
        <h2>Add someone new.</h2>
        <p class="svProfilePanelCopy">A little corner of SwiflyTV, just for them.</p>
        <form id="profileCreateForm" class="dsStackedForm">
          <button id="profileCreateAvatar" class="svProfileCreateAvatar" type="button" aria-label="Choose icon for new profile">
            <span class="svProfileCreatePreview" data-profile-create-preview aria-hidden="true"></span>
            <span><strong>Profile icon</strong><small>Choose an icon or photo</small></span>
            <span class="svProfileAvatarPencil" aria-hidden="true">${cleanIcon("settings")}</span>
          </button>
          <label>
            <span>Name</span>
            <input name="name" placeholder="Name this profile" maxlength="32" />
          </label>
          <label>
            <span>Viewing experience</span>
            <select name="mode">
              <option value="standard">Regular profile</option>
              <option value="kids">Kids Safe</option>
            </select>
          </label>
          <button class="dsPrimaryBtn" type="submit">${cleanIcon("user")}Add profile</button>
        </form>
      </aside>

      <section class="dsProfileManagerList">
        <div class="dsSectionHeaderSplit">
          <div>
            <span class="dsEyebrow">Your profiles</span>
            <h2>Everyone at home.</h2>
          </div>
          <button id="resetProfilesBtn" class="dsGhostPill" type="button">Reset</button>
        </div>
        <div id="profilesManageList" class="dsManageProfileList"></div>
      </section>
    </section>

    <p class="svProfileError" data-profile-error role="alert" hidden></p>
    <dialog class="svAvatarDialog" id="profileAvatarDialog" aria-labelledby="profileAvatarTitle" aria-describedby="profileAvatarDescription">
      <div class="svAvatarDialogHeader">
        <div><span class="svAvatarEyebrow">PROFILE ICON</span><h2 id="profileAvatarTitle">Make it yours.</h2></div>
        <button class="svAvatarClose" data-avatar-cancel type="button" aria-label="Close icon editor"><svg class="svIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
      </div>
      <p id="profileAvatarDescription">Choose a character. Bring a little personality.</p>
      <div class="svAvatarIdentity">
        <span class="svAvatarPreview" data-avatar-preview aria-hidden="true"></span>
        <div><strong data-avatar-profile-name></strong><span data-avatar-status role="status" aria-live="polite"></span></div>
      </div>
      <div class="svAvatarPresetGrid" data-avatar-presets role="group" aria-label="Original profile icons"></div>
      <div class="svAvatarPersonalChoice">
        <button class="svAvatarUpload dsSecondaryBtn" data-avatar-upload type="button"><svg class="svIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="svAvatarUploadText">Upload a photo<small>PNG, JPG or WebP · up to 5 MB</small></span></button>
        <input data-avatar-file type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Choose profile photo" />
        <button class="svAvatarInitial dsSecondaryBtn" data-avatar-initial type="button" aria-pressed="false">Use initial</button>
      </div>
      <p class="svAvatarLocalNote">Your photo stays in this browser.</p>
      <p class="svAvatarError" data-avatar-error role="alert" aria-live="assertive"></p>
      <div class="svAvatarDialogActions">
        <button class="svAvatarCancel dsSecondaryBtn" data-avatar-cancel type="button">Cancel</button>
        <button class="svAvatarSave dsPrimaryBtn" data-avatar-save type="button">Save icon</button>
      </div>
    </dialog>
    <script>
      document.addEventListener("DOMContentLoaded", function () { window.SwiflyProfiles?.mount(); }, { once: true });
    </script>
  </main>`;

  res.send(pageShell({ title: `${SITE_NAME} — Manage Profiles`, active: "profiles", body }));
}


app.get("/account", accountPage);


const socialRooms = new Map();

function getSocialRoom(roomId = "general") {
  const id = String(roomId || "general").slice(0, 80);
  if (!socialRooms.has(id)) {
    socialRooms.set(id, {
      id,
      messages: [],
      members: new Map(),
      createdAt: Date.now(),
    });
  }
  return socialRooms.get(id);
}


function socialCreatorNames() {
  return String(process.env.SOCIAL_CREATOR_NAMES || "Main,Admin,Owner,Lukas")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function socialOpenRoomCreation() {
  return process.env.SOCIAL_OPEN_ROOM_CREATION !== "false";
}

function socialPermissionsForName(name = "") {
  const normalized = String(name || "").trim().toLowerCase();
  const allowed = socialCreatorNames();
  const isCreator = Boolean(normalized && allowed.includes(normalized));
  return {
    isCreator,
    canCreateGroups: isCreator,
    canCreateChannels: isCreator,
    canCreateWatchRooms: socialOpenRoomCreation() || isCreator,
    canManageSocial: isCreator,
    allowedCreators: allowed,
    openRoomCreation: socialOpenRoomCreation(),
  };
}


function partyMovieId(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : "";
}

function partyMovieMetadata(movie) {
  const id = partyMovieId(movie?.id);
  const title = (typeof movie?.title === "string" ? movie.title.trim() : "")
    || (typeof movie?.original_title === "string" ? movie.original_title.trim() : "");
  if (!id || !title || movie.adult) return null;
  return { id: Number(id), title, year: movie.release_date ? getYear(movie.release_date) : "", poster: img(movie.poster_path, "w342"), backdrop: backdrop(movie.backdrop_path, "w1280"), overview: typeof movie.overview === "string" ? movie.overview : "" };
}

function socialPage(req, res) {
  const tab = String(req.query.tab || "").toLowerCase();
  const requestedRoomId = normalizeRoomId(req.query.roomId || (!/^(channel-|group-|dm-)/.test(String(req.query.room || "")) ? req.query.room : "") || "");
  const initialTab = requestedRoomId || (tab !== "chat" && !/^(channel-|group-|dm-)/.test(String(req.query.room || ""))) ? "rooms" : "chat";
  const denied = String(req.query.denied || "");
  const allowedCreators = socialCreatorNames();
  const initialRoomName = String(req.query.name || "Social Watch Room").slice(0, 80);
  const initialKind = String(req.query.kind || "").slice(0, 24);
  const initialVideoId = String(req.query.videoId || "").slice(0, 64);
  const initialEmbedUrl = String(req.query.embedUrl || "").slice(0, 1000);
  const selectedMovieId = partyMovieId(req.query.movieId);

  const body = partyMarkup({initialTab, requestedRoomId, initialRoomName, initialKind, initialVideoId, initialEmbedUrl, selectedMovieId, denied, allowedCreators, openRoomCreation:socialOpenRoomCreation()});

  res.send(pageShell({ title: `${SITE_NAME} — Party Hub`, active: "social", body }));
}


function continueWatchingPage(req, res) {
  const body = `<main class="dsPlainPage dsContinueWatchingPage">
    <section class="dsAccountHero">
      <div><span class="dsEyebrow">Your library</span><h1>Continue watching</h1><p>Your recently opened movies and series, all in one place.</p></div>
      <div class="dsAccountActions"><a class="dsSecondaryBtn" href="/movies">Browse movies</a><a class="dsSecondaryBtn" href="/tv">Browse series</a></div>
    </section>
    <section class="svHistoryPanel">
      <div class="svSectionHead"><h2>Recent titles</h2><span class="svHistoryCount" data-continue-count></span></div>
      <div id="continueWatchingPageRail" class="svResumeGrid"></div>
      <div id="continueWatchingEmpty" class="svHistoryEmpty" hidden><h2>Nothing here yet</h2><p>Open a movie or series and it will appear here for your next visit.</p><a class="dsSecondaryBtn" href="/movies">Find something to watch</a></div>
    </section>
  </main>`;
  res.send(pageShell({ title: `${SITE_NAME} — Continue Watching`, active: "continue", body }));
}

app.get("/continue-watching", continueWatchingPage);
app.get("/continue", continueWatchingPage);

function removedDateProfilePage(req, res) {
  res.redirect("/");
}


app.get("/date-profile", removedDateProfilePage);
app.get("/couples", removedDateProfilePage);

app.get("/watchrooms/new", (req, res) => {
  const creator = String(req.query.creator || req.query.name || "").slice(0, 80);
  const perms = socialPermissionsForName(creator);
  if (!perms.canCreateWatchRooms && process.env.SOCIAL_LOCK_WATCHROOM_CREATION === "true") {
    const denied = new URLSearchParams();
    denied.set("tab", "watchrooms");
    denied.set("denied", "create-party");
    return res.redirect(`/social?${denied.toString()}`);
  }

  const roomId = createRoomId();
  const name = String(req.query.name || "SwiflyTV Watch Room").slice(0, 80);
  const rawLink = String(req.query.watchLink || req.query.url || "").trim();
  const params = new URLSearchParams();
  params.set("name", name);

  const youtubeMatch = rawLink.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (youtubeMatch) {
    params.set("kind", "youtube");
    params.set("videoId", youtubeMatch[1]);
  } else if (/^https?:\/\//i.test(rawLink)) {
    params.set("kind", "embed");
    params.set("embedUrl", rawLink);
  } else {
    params.set("kind", "blank");
  }

  getOrCreateWatchRoom(roomId, {
    name, host: creator || "Host", mediaKind: params.get("kind"),
    videoId: params.get("videoId") || "", embedUrl: params.get("embedUrl") || "",
  });

  if (String(req.query.social || "") === "1") {
    const socialParams = new URLSearchParams(params);
    socialParams.set("tab", "watchrooms");
    socialParams.set("roomId", roomId);
    return res.redirect(`/social?${socialParams.toString()}`);
  }

  res.redirect(`/social?tab=watchrooms&roomId=${encodeURIComponent(roomId)}&${params.toString()}`);
});

app.get("/watchrooms/join", (req, res) => {
  const code = String(req.query.code || req.query.room || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

  if (!code) return res.redirect("/social?tab=watchrooms");

  const params = new URLSearchParams();
  params.set("name", String(req.query.name || "SwiflyTV Watch Room").slice(0, 80));
  params.set("kind", "blank");
  const socialParams = new URLSearchParams(params);
  socialParams.set("tab", "watchrooms");
  socialParams.set("roomId", code);
  res.redirect(`/social?${socialParams.toString()}`);
});


app.get("/watchrooms", (req, res) => res.redirect("/social?tab=watchrooms"));
app.get("/watchrooms/embed/:roomId", watchroomPage);
app.get("/watchrooms/:roomId", (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);
  const params = new URLSearchParams(req.query || {});
  params.set("tab", "watchrooms");
  params.set("roomId", roomId);
  res.redirect(`/social?${params.toString()}`);
});
app.get("/profiles", profilesPage);
app.get("/profiles/manage", profilesManagePage);
app.get("/social", (req, res) => {
  const movieId = partyMovieId(req.query.movieId);
  if (movieId) return res.redirect(`/watch/movie/${movieId}?mode=movie&party=create`);
  const roomId = normalizeRoomId(req.query.roomId || req.query.room || "");
  const room = roomId ? watchRooms.get(roomId) : null;
  const roomMovieId = partyMovieId(room?.syncedMovie?.movieId);
  if (roomMovieId) return res.redirect(`/watch/movie/${roomMovieId}?mode=movie&roomId=${encodeURIComponent(roomId)}`);
  // The navigation's Social link should enter the real, integrated Party Hub,
  // not unexpectedly jump into the catalog's embedded party section.
  return socialPage(req, res);
});

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


function apiStatus(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    site: SITE_NAME,
    version: "v94",
    uptime: Math.round(process.uptime()),
    now: Date.now(),
    features: {
      regularMovieSite: true,
      dateIdeasRemoved: true,
      socialHub: true,
      socialWatchRooms: true,
      socialButtonsFixed: true,
      socialRebuiltV99: true,
      discordSocialV100: true,
      integratedSocialWatchroomV102: true,
      nativeSocialWatchroomsV103: true,
      openWatchRoomCreationV104: true,
      swiflyHubRefreshV104: true,
      galaxySocialThemeV105: true,
      watchroomM3u8FixV106: true,
      socialNavOffsetFixV106: true,
      socialPermissions: true,
      noJsWatchRoomFallbacks: true,
      socialLayoutV2: true,
      profileManager: true,
      dateProfile: false,
      regularMovieM3u8Player: true,
      videojsM3u8Player: true,
      hlsProxyEnabled: typeof hlsProxyEnabled === "function" ? hlsProxyEnabled() : false,
    },
  });
}

app.get("/api/status", apiStatus);



app.get("/api/social/movies/search", async (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 120);
  if (query.length < 2) return res.json({ ok: true, results: [] });
  try {
    const data = await tmdb("/search/movie", { query, include_adult: false, page: 1 }, CACHE_TTL.short);
    if (data.__error) throw new Error("Metadata unavailable");
    const results = (data.results || []).filter(movie => Number.isInteger(Number(movie.id)) && Number(movie.id) > 0 && !movie.adult).slice(0, 12)
      .map(movie => ({ id: movie.id, title: movie.title || movie.original_title || "Movie", year: getYear(movie.release_date), poster: img(movie.poster_path, "w185") }));
    res.json({ ok: true, results });
  } catch {
    res.status(503).json({ ok: false, message: "Movie search is unavailable right now. Please try again." });
  }
});

app.get("/api/social/movies/featured", async (req, res) => {
  try {
    const data = await tmdb("/trending/movie/week", {}, CACHE_TTL.short);
    if (!data || data.__error || !Array.isArray(data.results)) throw new Error("Metadata unavailable");
    const movies = data.results.map(partyMovieMetadata).filter(Boolean).slice(0, 6);
    res.json({ ok: true, movies });
  } catch {
    res.status(503).json({ ok: false, message: "Movie choices are unavailable right now. Please try again." });
  }
});

app.get("/api/social/movies/:id", async (req, res) => {
  const id = partyMovieId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "Enter a valid movie ID." });
  try {
    const data = await tmdb(`/movie/${id}`, {}, CACHE_TTL.long);
    if ((data?.__error && Number(data.status) === 404) || data?.adult) {
      return res.status(404).json({ ok: false, message: "This movie was not found." });
    }
    const movie = data && !data.__error ? partyMovieMetadata(data) : null;
    if (!movie || String(movie.id) !== id) throw new Error("Metadata unavailable");
    res.json({ ok: true, movie });
  } catch {
    res.status(503).json({ ok: false, message: "Movie details are unavailable right now. Please try again." });
  }
});

app.post("/api/social/watchrooms/create", (req, res) => {
  const creator = String(req.body?.creator || "").slice(0, 80);
  const perms = socialPermissionsForName(creator);
  if (!perms.canCreateWatchRooms && process.env.SOCIAL_LOCK_WATCHROOM_CREATION === "true") {
    return res.status(403).json({ ok: false, message: "You do not have permission to create Watch Parties." });
  }

  const id = createRoomId();
  const name = String(req.body?.name || "SwiflyTV Watch Room").slice(0, 80);
  const mediaUrl = String(req.body?.mediaUrl || "").trim();
  const youtubeMatch = mediaUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);

  const room = getOrCreateWatchRoom(id, {
    name,
    host: creator || "Host",
    mediaKind: youtubeMatch ? "youtube" : mediaUrl ? "embed" : "blank",
    videoId: youtubeMatch ? youtubeMatch[1] : "",
    embedUrl: youtubeMatch ? "" : mediaUrl,
  });

  res.json({ ok: true, room: publicRoom(room), socialUrl: `/social?tab=watchrooms&roomId=${encodeURIComponent(room.id)}&name=${encodeURIComponent(room.name)}` });
});

app.get("/api/social/watchrooms", (req, res) => {
  res.set("Cache-Control", "no-store");
  const rooms = [...watchRooms.values()]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 24)
    .map(publicRoom);
  res.json({ ok: true, rooms });
});


app.get("/api/social/permissions", (req, res) => {
  res.set("Cache-Control", "no-store");
  const name = String(req.query.name || "").slice(0, 80);
  res.json({
    ok: true,
    name,
    permissions: socialPermissionsForName(name),
  });
});

app.get("/api/social/rooms", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    rooms: Array.from(socialRooms.values()).map((room) => ({
      id: room.id,
      members: Array.from(room.members.values()),
      messages: room.messages.slice(-30),
      createdAt: room.createdAt,
    })),
  });
});


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
  res.status(data.__error ? (data.status || 500) : 200).json(data);
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
      playbackUrl: result.playbackUrl || result.m3u8 || result.proxyVideo,
      proxyVideo: result.playbackUrl || result.m3u8 || result.proxyVideo,
      providerUrl: result.providerUrl || "",
      sourceUrl: result.sourceUrl || "",
      m3u8: result.m3u8 || "",
      streamType: result.streamType || "",
      streamQuality: result.streamQuality || "",
      streamName: result.streamName || "",
      streamMode: result.streamMode || "",
      audioLanguage: result.audioLanguage || "",
      playbackSources: result.playbackSources || [],
      subtitles: result.subtitles || [],
      isLiveM3u8: Boolean(result.isLiveM3u8),
      originalPlaybackUrl: result.originalPlaybackUrl || "",
      hlsProxyUrl: result.hlsProxyUrl || "",
      hlsProxyId: result.hlsProxyId || "",
      hlsProxyStatusUrl: result.hlsProxyStatusUrl || "",
      apiProxyUrl: result.apiProxyUrl || "",
      playAt: Date.now() + 7000,
      selectedBy,
      requestId,
      message: "The film is ready. Starting in 7 seconds.",
      sync: createMovieSyncState({ playing: true, offset: 0, startedAt: Date.now() + 7000 }),
      updatedAt: Date.now(),
    };

    room.messages.push({
      name: "System",
      text: "The film is ready. Your party starts in 7 seconds.",
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
      message: "This film could not start. Please retry or choose another film.",
      attempts: result.attempts || [],
      sync: createMovieSyncState(),
      updatedAt: Date.now(),
    };

    room.messages.push({
      name: "System",
      text: "This film could not start. Please retry or choose another film.",
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
  const roomName = String(req.body?.roomName || "SwiflyTV Watch Room").slice(0, 80);

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
    message: "Getting the film ready…",
    sync: createMovieSyncState(),
    updatedAt: Date.now(),
  };

  room.messages.push({
    name: "System",
    text: `${name} selected a film. Getting it ready…`,
    createdAt: Date.now(),
  });
  room.messages = room.messages.slice(-80);
  room.updatedAt = Date.now();

  io.to(room.id).emit("watchroom:movie-sync", {
    roomId: room.id,
    movie: room.syncedMovie,
  });

  resolveDateRoomProxyVideoInBackground(room.id, movieId, name, requestId).catch(() => {
    const latest = watchRooms.get(room.id);
    if (!latest || !latest.syncedMovie || latest.syncedMovie.requestId !== requestId) return;
    latest.syncedMovie.status = "error";
    latest.syncedMovie.message = "This film could not start. Please retry or choose another film.";
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
    const requested = Math.max(0, Number(req.body?.time || req.body?.clientTime || 0));
    const setDriftLimit = Math.max(1, Number(process.env.ROOM_MOVIE_SYNC_DRIFT_LIMIT_SECONDS || 10));

    // Prevent feedback loops from freezing the timer at the same value.
    if (Math.abs(requested - current) <= setDriftLimit) {
      return res.json({
        ok: true,
        isHost: true,
        ...emitDateRoomRestState(room),
      });
    }

    offset = requested;
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

function publishWatchRoomPresence(room) {
  const ids = Array.from(io.sockets.adapter.rooms.get(room.id) || []);
  room.viewers = ids.length;
  room.updatedAt = Date.now();
  io.to(room.id).emit("watchroom:viewers", { roomId: room.id, viewers: room.viewers });
  io.to(room.id).emit("watchroom:members", { roomId: room.id, members: ids.map(id => ({
    id, name: io.sockets.sockets.get(id)?.data.watchroomName || "Guest", isHost: room.hostSocketId === id,
  })) });
}

function leaveWatchRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = watchRooms.get(roomId);
  socket.data.roomId = "";
  socket.data.isWatchroomHost = false;
  socket.data.watchroomName = "";
  socket.leave(roomId);
  if (!room) return;
  if (room.couplePlus) {
    for (const key of ["ready", "moods", "tastes"]) if (room.couplePlus[key]) delete room.couplePlus[key][socket.id];
  }
  if (room.liveHostSocketId === socket.id) {
    room.liveShareActive = false;
    room.liveHostSocketId = "";
    io.to(roomId).emit("watchroom:live-stop", { roomId });
  }
  if (room.hostSocketId === socket.id) {
    const nextId = Array.from(io.sockets.adapter.rooms.get(roomId) || [])[0] || "";
    room.hostSocketId = nextId;
    const next = io.sockets.sockets.get(nextId);
    if (next) {
      next.data.isWatchroomHost = true;
      room.host = next.data.watchroomName || "Host";
      next.emit("watchroom:host", { roomId, isHost: true });
    }
  }
  publishWatchRoomPresence(room);
  if (room.viewers === 0) closeRemoteBrowserSession(roomId).catch(() => {});
}

io.on("connection", (socket) => {

  socket.on("social:join", (payload = {}) => {
    const roomId = String(payload.roomId || "general").slice(0, 80);
    const name = String(payload.name || "Guest").slice(0, 40);
    const room = getSocialRoom(roomId);
    socket.join(`social:${roomId}`);
    room.members.set(socket.id, name);
    socket.emit("social:members", { roomId, members: Array.from(room.members.values()) });
    socket.to(`social:${roomId}`).emit("social:members", { roomId, members: Array.from(room.members.values()) });
  });

  socket.on("social:message", (message = {}) => {
    const roomId = String(message.roomId || "general").slice(0, 80);
    const room = getSocialRoom(roomId);
    const safeMessage = {
      roomId,
      author: String(message.author || "Guest").slice(0, 40),
      text: String(message.text || "").slice(0, 1200),
      createdAt: Number(message.createdAt || Date.now()),
    };
    if (!safeMessage.text.trim()) return;
    room.messages.push(safeMessage);
    room.messages = room.messages.slice(-200);
    io.to(`social:${roomId}`).emit("social:message", safeMessage);
  });

  socket.on("social:typing", (payload = {}) => {
    const roomId = String(payload.roomId || "general").slice(0, 80);
    const name = String(payload.name || "Guest").slice(0, 40);
    socket.to(`social:${roomId}`).emit("social:typing", { roomId, name });
  });

  socket.on("social:call-join", (payload = {}) => {
    const roomId = String(payload.roomId || "general").slice(0, 80);
    const name = String(payload.name || "Guest").slice(0, 40);
    socket.join(`social-call:${roomId}`);
    io.to(`social:${roomId}`).emit("social:call-event", { roomId, name, type: "joined the call" });
  });

  socket.on("social:call-leave", (payload = {}) => {
    const roomId = String(payload.roomId || "general").slice(0, 80);
    const name = String(payload.name || "Guest").slice(0, 40);
    socket.leave(`social-call:${roomId}`);
    io.to(`social:${roomId}`).emit("social:call-event", { roomId, name, type: "left the call" });
  });


  socket.data.roomId = "";

  socket.on("watchroom:join", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId);
    if (!roomId) return;
    if (socket.data.roomId && socket.data.roomId !== roomId) leaveWatchRoom(socket);

    const room = getOrCreateWatchRoom(roomId, {
      name: payload.name,
      videoId: payload.videoId,
      embedUrl: payload.embedUrl,
      mediaKind: payload.mediaKind,
      browserUrl: payload.browserUrl,
      host: payload.user,
    });

    socket.data.roomId = room.id;
    socket.data.watchroomName = String(payload.user || "Guest").slice(0, 40);
    socket.join(room.id);

    if (!room.hostSocketId) room.hostSocketId = socket.id;
    const isHost = room.hostSocketId === socket.id;
    socket.data.isWatchroomHost = isHost;

    room.viewers = io.sockets.adapter.rooms.get(room.id)?.size || 0;
    room.updatedAt = Date.now();

    socket.emit("watchroom:joined", {
      serverTime: Date.now(),
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
        serverTime: Date.now(),
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

    publishWatchRoomPresence(room);
  });

  socket.on("watchroom:leave", () => leaveWatchRoom(socket));

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
        roomId: room.id,
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
        roomId: room.id,
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
    if (!room || socket.data.roomId !== roomId) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        roomId: room.id,
        name: "System",
        text: "Only the host can select the room movie.",
        createdAt: Date.now(),
      });
      return;
    }

    const movieId = partyMovieId(payload.movieId);
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
      message: "Getting the film ready…",
      updatedAt: Date.now(),
    };
    room.updatedAt = Date.now();

    io.to(room.id).emit("watchroom:movie-sync", {
      serverTime: Date.now(),
      roomId: room.id,
      movie: room.syncedMovie,
    });

    io.to(room.id).emit("watchroom:message", {
      roomId: room.id,
      name: "System",
      text: `${selectedBy} selected a film. Getting it ready…`,
      createdAt: Date.now(),
    });

    const result = await fetchProxyVideoSource({ type: "movie", id: movieId, retry: payload.retry === true });

    const latest = watchRooms.get(roomId);
    if (!latest || !latest.syncedMovie || latest.syncedMovie.requestId !== requestId) return;

    const playbackUrl = result.playbackUrl || result.hlsProxyUrl || result.embeddedM3u8Url || result.proxyVideo || result.m3u8;
    if (result.status === "ok" && playbackUrl) {
      latest.syncedMovie = {
        ...result,
        status: "ready",
        movieId,
        playbackUrl,
        proxyVideo: playbackUrl,
        providerUrl: result.providerUrl || "",
        sourceUrl: result.sourceUrl || "",
      m3u8: result.m3u8 || "",
      streamType: result.streamType || "",
      streamQuality: result.streamQuality || "",
      streamName: result.streamName || "",
      streamMode: result.streamMode || "",
      isLiveM3u8: Boolean(result.isLiveM3u8),
      originalPlaybackUrl: result.originalPlaybackUrl || "",
      hlsProxyUrl: result.hlsProxyUrl || "",
      hlsProxyId: result.hlsProxyId || "",
      apiProxyUrl: result.apiProxyUrl || "",
        playAt: Date.now() + 7000,
        selectedBy,
        requestId,
        message: "The film is ready. Starting in 7 seconds.",
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
        message: "This film could not start. Please retry or choose another film.",
        sync: createMovieSyncState(),
        attempts: result.attempts || [],
        updatedAt: Date.now(),
      };
    }

    latest.updatedAt = Date.now();

    io.to(latest.id).emit("watchroom:movie-sync", {
      serverTime: Date.now(),
      roomId: latest.id,
      movie: latest.syncedMovie,
    });

    io.to(latest.id).emit("watchroom:message", {
      roomId: latest.id,
      name: "System",
      text: latest.syncedMovie.status === "ready"
        ? "The film is ready. Your party starts in 7 seconds."
        : "This film could not start. Please retry or choose another film.",
      createdAt: Date.now(),
    });
  });

  socket.on("watchroom:movie-control", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
    const room = watchRooms.get(roomId);
    if (!room || socket.data.roomId !== roomId || !room.syncedMovie || !room.syncedMovie.movieId) return;

    const action = String(payload.action || "").slice(0, 30);

    if (action !== "sync-me" && room.hostSocketId && room.hostSocketId !== socket.id) {
      socket.emit("watchroom:message", {
        roomId: room.id,
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
      const requested = Math.max(0, Number(payload.time || payload.clientTime || 0));
      const setDriftLimit = Math.max(1, Number(process.env.ROOM_MOVIE_SYNC_DRIFT_LIMIT_SECONDS || 10));

      // Prevent native-video feedback loops: if this set is already close to the server timer,
      // do not reset/broadcast the timer again.
      if (payload.intent !== "user" && Math.abs(requested - current) <= setDriftLimit) {
        socket.emit("watchroom:movie-sync-state", {
          serverTime: Date.now(),
          roomId: room.id,
          movieId: room.syncedMovie.movieId,
          sync: room.syncedMovie.sync,
          message: `Already within ${setDriftLimit}s tolerance.`,
        });
        return;
      }

      offset = requested;
      message = `Host set the room timer to ${Math.floor(offset)}s.`;
    } else if (action === "sync-me") {
      socket.emit("watchroom:movie-sync-state", {
          serverTime: Date.now(),
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
      serverTime: Date.now(),
      roomId: room.id,
      movieId: room.syncedMovie.movieId,
      sync: room.syncedMovie.sync,
      message,
    });

    io.to(room.id).emit("watchroom:message", {
      roomId: room.id,
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
      roomId: room.id,
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
    socialRooms.forEach((room) => {
      if (room.members.delete(socket.id)) {
        io.to(`social:${room.id}`).emit("social:members", {
          roomId: room.id,
          members: Array.from(room.members.values()),
        });
      }
    });
  });

  socket.on("disconnect", () => leaveWatchRoom(socket));

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

const HOST = process.env.HOST || "0.0.0.0";
httpServer.on("error", (error) => {
  console.error("[fatal] httpServer error:", error && (error.stack || error.message || error));
  process.exit(1);
});
httpServer.listen(Number(PORT), HOST, () => {
  console.log(`${SITE_NAME} running on http://${HOST}:${PORT}`);
});
