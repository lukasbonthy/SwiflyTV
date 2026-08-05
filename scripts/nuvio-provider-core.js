"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Readable } = require("stream");
const { URL } = require("url");
const setup = require("./setup-nuvio-providers.js");

const root = path.resolve(__dirname, "..");
const host = String(process.env.NUVIO_CORE_HOST || "127.0.0.1");
const port = Math.max(1, Number(process.env.NUVIO_CORE_PORT || 3200));
const manifestPath = path.join(setup.vendorDir, "manifest.json");
const providerTimeoutMs = Math.max(3000, Number(process.env.NUVIO_PROVIDER_TIMEOUT_MS || 18000));
const cacheTtlMs = Math.max(15_000, Number(process.env.NUVIO_CACHE_TTL_MS || 10 * 60 * 1000));
const proxyTtlMs = Math.max(60_000, Number(process.env.NUVIO_PROXY_TTL_MS || 3 * 60 * 60 * 1000));
const concurrency = Math.max(1, Math.min(12, Number(process.env.NUVIO_PROVIDER_CONCURRENCY || 6)));

const resultCache = new Map();
const responseKeys = new Map();
const proxyTargets = new Map();

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function splitList(value) {
  return clean(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function publicBaseUrl() {
  return String(process.env.NUVIO_CORE_PUBLIC_URL || `http://${host}:${port}`).replace(/\/+$/, "");
}

function readMarker() {
  try { return JSON.parse(fs.readFileSync(setup.markerPath, "utf8")); } catch { return null; }
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Nuvio provider manifest is missing. Run npm run nuvio:setup.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const scrapers = Array.isArray(manifest && manifest.scrapers) ? manifest.scrapers : [];
  if (!scrapers.length) throw new Error("Nuvio provider manifest contains no scrapers.");
  return { manifest, scrapers };
}

function providerSelection(mediaType) {
  const { scrapers } = loadManifest();
  const allow = new Set(splitList(process.env.NUVIO_PROVIDER_ALLOWLIST));
  const deny = new Set(splitList(process.env.NUVIO_PROVIDER_DENYLIST));
  const wantedType = mediaType === "tv" ? "tv" : "movie";

  return scrapers.filter((entry) => {
    const id = clean(entry && entry.id).toLowerCase();
    if (!id || entry.enabled === false) return false;
    if (allow.size && !allow.has(id)) return false;
    if (deny.has(id)) return false;
    const supported = Array.isArray(entry.supportedTypes)
      ? entry.supportedTypes.map((item) => clean(item).toLowerCase())
      : [];
    return !supported.length || supported.includes(wantedType);
  });
}

function inferType(stream, entry) {
  const rawType = clean(stream && (stream.streamType || stream.type || stream.format)).toLowerCase();
  const url = clean(stream && (stream.url || stream.file || stream.link)).toLowerCase();
  const formats = Array.isArray(entry && entry.formats)
    ? entry.formats.map((item) => clean(item).toLowerCase())
    : [];
  const combined = [rawType, url, ...formats].join(" ");

  if (/m3u8|\bhls\b/.test(combined)) return "hls";
  if (/\.mpd(?:[?#]|$)|\bdash\b|\bmpd\b/.test(combined)) return "dash";
  if (/\.mp4(?:[?#]|$)|\bmp4\b/.test(combined)) return "mp4";
  if (/\.webm(?:[?#]|$)|\bwebm\b/.test(combined)) return "webm";
  if (/\.mkv(?:[?#]|$)|\bmkv\b/.test(combined)) return "mkv";
  return "video";
}

function qualityLabel(stream) {
  const direct = clean(stream && (stream.quality || stream.resolution || stream.label));
  if (direct) return direct;
  const text = `${clean(stream && stream.name)} ${clean(stream && stream.title)}`;
  const match = text.match(/\b(2160p?|4k|1440p?|1080p?|720p?|576p?|480p?|360p?)\b/i);
  return match ? match[1] : "Auto";
}

function qualityNumber(value) {
  const text = clean(value).toLowerCase();
  if (text.includes("4k")) return 2160;
  const match = text.match(/(2160|1440|1080|720|576|480|360|240)/);
  return match ? Number(match[1]) : 0;
}

function sanitizeHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    "accept",
    "accept-language",
    "authorization",
    "cookie",
    "origin",
    "referer",
    "user-agent",
  ]);
  const headers = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalized = clean(key).toLowerCase();
    const headerValue = clean(rawValue);
    if (allowed.has(normalized) && headerValue) headers[normalized] = headerValue;
  }
  return headers;
}

function cleanupMaps() {
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    if (!entry || entry.expiresAt <= now) resultCache.delete(key);
  }
  for (const [key, entry] of responseKeys) {
    if (!entry || entry.expiresAt <= now) responseKeys.delete(key);
  }
  for (const [token, entry] of proxyTargets) {
    if (!entry || entry.expiresAt <= now) proxyTargets.delete(token);
  }
}

function createProxyTarget(target, headers = {}, kind = "asset", ttlMs = proxyTtlMs) {
  let parsed;
  try { parsed = new URL(clean(target)); } catch { return ""; }
  if (!/^https?:$/i.test(parsed.protocol)) return "";

  cleanupMaps();
  const token = crypto.randomBytes(24).toString("base64url");
  proxyTargets.set(token, {
    target: parsed.toString(),
    headers: sanitizeHeaders(headers),
    kind: clean(kind).toLowerCase() || "asset",
    expiresAt: Date.now() + Math.max(60_000, ttlMs),
  });
  return `${publicBaseUrl()}/v1/proxy?data=${encodeURIComponent(token)}`;
}

function resolveUrl(value, baseUrl) {
  try { return new URL(clean(value), baseUrl).toString(); } catch { return ""; }
}

function rewriteHlsManifest(manifest, baseUrl, headers = {}) {
  const source = String(manifest || "");
  if (!/^\s*#EXTM3U/m.test(source)) return { body: source, rewritten: 0 };

  let rewritten = 0;
  let nextHint = "asset";
  const lines = source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) nextHint = "hls";
      let attributeKind = "asset";
      if (/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i.test(trimmed)) attributeKind = "hls";
      else if (/^#EXT-X-KEY:/i.test(trimmed)) attributeKind = "key";
      else if (/^#EXT-X-MAP:/i.test(trimmed)) attributeKind = "asset";

      return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
        const absolute = resolveUrl(uri, baseUrl);
        const proxied = absolute ? createProxyTarget(absolute, headers, attributeKind) : "";
        if (!proxied) return match;
        rewritten += 1;
        return `URI="${proxied}"`;
      });
    }

    const absolute = resolveUrl(trimmed, baseUrl);
    const kind = nextHint;
    nextHint = "asset";
    const proxied = absolute ? createProxyTarget(absolute, headers, kind) : "";
    if (!proxied) return line;
    rewritten += 1;
    return line.replace(trimmed, proxied);
  });

  return { body: lines.join("\n"), rewritten };
}

function subtitleCandidates(stream) {
  const values = [
    stream && stream.subtitle,
    stream && stream.subtitles,
    stream && stream.captions,
    stream && stream.tracks,
  ];
  const flattened = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) flattened.push(...value);
    else flattened.push(value);
  }
  return flattened;
}

function normalizeSubtitle(value, provider, headers) {
  const item = typeof value === "string" ? { url: value } : value;
  if (!item || typeof item !== "object") return null;
  const target = clean(item.url || item.file || item.src);
  const proxied = createProxyTarget(target, item.headers || headers, "subtitle");
  if (!proxied) return null;
  const extensionMatch = target.match(/\.(vtt|srt|ass|ssa|ttml)(?:[?#]|$)/i);
  return {
    url: proxied,
    label: clean(item.label || item.name || item.language || item.lang) || `${provider.name} subtitle`,
    language: clean(item.language || item.lang),
    format: clean(item.format || (extensionMatch && extensionMatch[1])) || "vtt",
  };
}

function normalizeStream(raw, provider) {
  if (!raw || typeof raw !== "object") return null;
  const target = clean(raw.url || raw.file || raw.link);
  if (!target) return null;
  const type = inferType(raw, provider);
  if (type === "mkv" && process.env.NUVIO_ALLOW_MKV !== "true") return null;
  const headers = sanitizeHeaders(raw.headers || raw.requestHeaders);
  const proxied = createProxyTarget(target, headers, type);
  if (!proxied) return null;

  return {
    source: {
      url: proxied,
      type,
      quality: qualityLabel(raw),
      provider: {
        id: clean(provider.id),
        name: clean(provider.name || provider.id),
      },
      audioTracks: Array.isArray(raw.audioTracks) ? raw.audioTracks : [],
    },
    subtitles: subtitleCandidates(raw)
      .map((item) => normalizeSubtitle(item, provider, headers))
      .filter(Boolean),
    identity: [clean(provider.id), target, type, qualityLabel(raw)].join("|"),
  };
}

function loadProviderModule(entry) {
  const filename = clean(entry && entry.filename);
  if (!filename) throw new Error("provider filename is missing");
  const resolved = path.resolve(setup.vendorDir, filename);
  if (!resolved.startsWith(path.resolve(setup.vendorDir) + path.sep)) {
    throw new Error("provider filename escaped the vendor directory");
  }
  if (!fs.existsSync(resolved)) throw new Error(`provider module is missing: ${filename}`);

  delete require.cache[resolved];
  const loaded = require(resolved);
  const getStreams = loaded && typeof loaded.getStreams === "function"
    ? loaded.getStreams
    : loaded && loaded.default && typeof loaded.default.getStreams === "function"
      ? loaded.default.getStreams
      : null;
  if (!getStreams) throw new Error("provider does not export getStreams()");
  return getStreams;
}

function withTimeout(task, timeout, label) {
  let timer;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} exceeded ${timeout}ms`)),
        timeout,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runProvider(entry, media) {
  const started = Date.now();
  const id = clean(entry.id);
  const name = clean(entry.name || id);
  try {
    const getStreams = loadProviderModule(entry);
    const raw = await withTimeout(
      () => getStreams(media.id, media.mediaType, media.season, media.episode),
      providerTimeoutMs,
      name,
    );
    const streams = Array.isArray(raw) ? raw : [];
    console.log(`[nuvio-core] ${name} returned ${streams.length} stream(s) in ${Date.now() - started}ms.`);
    return { entry, streams, elapsedMs: Date.now() - started, error: "" };
  } catch (error) {
    const message = clean(error && error.message) || String(error);
    console.warn(`[nuvio-core] ${name} failed after ${Date.now() - started}ms: ${message}`);
    return { entry, streams: [], elapsedMs: Date.now() - started, error: message };
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function sourceScore(source) {
  const type = clean(source && source.type).toLowerCase();
  let score = type === "hls" ? 10_000 : type === "dash" ? 8_000 : type === "mp4" ? 7_000 : 3_000;
  score += qualityNumber(source && source.quality) * 2;
  const preferred = splitList(process.env.NUVIO_PROVIDER_ORDER);
  const id = clean(source && source.provider && source.provider.id).toLowerCase();
  const index = preferred.indexOf(id);
  if (index >= 0) score += 5000 - index * 100;
  return score;
}

function cacheKey(media) {
  return [media.mediaType, media.id, media.season || "", media.episode || ""].join(":");
}

async function resolveMedia(media, options = {}) {
  cleanupMaps();
  const key = cacheKey(media);
  const cached = resultCache.get(key);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    console.log(`[nuvio-core] Cache HIT for ${key}.`);
    return cached.data;
  }

  const providers = providerSelection(media.mediaType);
  console.log(`[nuvio-core] Fetching ${key} from ${providers.length} provider(s), concurrency ${concurrency}.`);
  const providerResults = await mapLimit(providers, concurrency, (entry) => runProvider(entry, media));

  const sources = [];
  const subtitles = [];
  const diagnostics = [];
  const seenSources = new Set();
  const seenSubtitles = new Set();
  const providerStats = [];

  for (const result of providerResults) {
    const providerName = clean(result.entry && (result.entry.name || result.entry.id));
    providerStats.push({
      id: clean(result.entry && result.entry.id),
      name: providerName,
      elapsedMs: result.elapsedMs,
      rawStreams: result.streams.length,
      error: result.error,
    });
    if (result.error) {
      diagnostics.push({
        code: "PROVIDER_ERROR",
        provider: providerName,
        message: `${providerName}: ${result.error}`,
        severity: "warning",
      });
    }

    for (const raw of result.streams) {
      const normalized = normalizeStream(raw, result.entry);
      if (!normalized || seenSources.has(normalized.identity)) continue;
      seenSources.add(normalized.identity);
      sources.push(normalized.source);
      for (const subtitle of normalized.subtitles) {
        const subtitleKey = `${subtitle.url}|${subtitle.language}|${subtitle.label}`;
        if (seenSubtitles.has(subtitleKey)) continue;
        seenSubtitles.add(subtitleKey);
        subtitles.push(subtitle);
      }
    }
  }

  sources.sort((a, b) => sourceScore(b) - sourceScore(a));
  const responseId = crypto.randomUUID();
  const expiresAt = Date.now() + cacheTtlMs;
  const data = {
    responseId,
    status: "ok",
    spec: "omss",
    backend: "swifly-nuvio-provider-core",
    expiresAt: new Date(expiresAt).toISOString(),
    sources,
    subtitles,
    diagnostics,
    providerStats,
  };

  resultCache.set(key, { data, expiresAt });
  responseKeys.set(responseId, { key, expiresAt });
  console.log(`[nuvio-core] Resolved ${sources.length} playable source(s) and ${subtitles.length} subtitle(s) for ${key}.`);
  return data;
}

function sendJson(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(text);
}

function copyProxyHeaders(upstream, res) {
  const names = [
    "content-type",
    "accept-ranges",
    "content-range",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "content-disposition",
  ];
  for (const name of names) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

async function proxyRequest(req, res, requestUrl) {
  cleanupMaps();
  const token = clean(requestUrl.searchParams.get("data"));
  const entry = proxyTargets.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    return sendJson(res, 404, { status: "error", message: "Proxy target expired or not found." });
  }

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.once("close", onClose);
  const headers = { ...entry.headers };
  if (req.headers.range) headers.range = req.headers.range;
  if (!headers["user-agent"]) headers["user-agent"] = "Mozilla/5.0 SwiflyTV/NuvioCore";

  try {
    const upstream = await fetch(entry.target, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    res.statusCode = upstream.status;
    copyProxyHeaders(upstream, res);
    const contentType = clean(upstream.headers.get("content-type")).toLowerCase();
    const looksHls = entry.kind === "hls" || contentType.includes("mpegurl") || /\.m3u8(?:[?#]|$)/i.test(entry.target);

    if (upstream.ok && looksHls) {
      const manifest = await upstream.text();
      const rewritten = rewriteHlsManifest(manifest, entry.target, entry.headers);
      res.removeHeader("content-length");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Swifly-Nuvio-Rewritten", String(rewritten.rewritten));
      return res.end(rewritten.body);
    }

    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body)
      .on("error", (error) => {
        if (!res.headersSent) res.statusCode = 502;
        try { res.end(error.message || "Nuvio proxy failed"); } catch {}
      })
      .pipe(res);
  } catch (error) {
    if (!res.headersSent) res.statusCode = error && error.name === "AbortError" ? 499 : 502;
    if (!res.writableEnded) res.end(clean(error && error.message) || "Nuvio proxy failed");
  } finally {
    req.off("close", onClose);
  }
}

function parseMediaRequest(pathname) {
  let match = pathname.match(/^\/v1\/movies\/(\d{1,20})\/?$/i);
  if (match) return { mediaType: "movie", id: match[1], season: null, episode: null };
  match = pathname.match(/^\/v1\/tv\/(\d{1,20})\/seasons\/(\d{1,6})\/episodes\/(\d{1,6})\/?$/i);
  if (match) return { mediaType: "tv", id: match[1], season: Number(match[2]), episode: Number(match[3]) };
  return null;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", publicBaseUrl());
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
      });
      return res.end();
    }
    if (req.method !== "GET") return sendJson(res, 405, { status: "error", message: "Method not allowed." });

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/v1/health") {
      const marker = readMarker();
      const providers = providerSelection("movie");
      return sendJson(res, 200, {
        status: "operational",
        spec: "omss",
        name: "Swifly Nuvio Provider Core",
        version: "1.0.0",
        providerCount: providers.length,
        providerRef: marker && marker.ref,
        cacheEntries: resultCache.size,
        proxyTargets: proxyTargets.size,
      });
    }

    if (requestUrl.pathname === "/v1/providers") {
      const { scrapers } = loadManifest();
      return sendJson(res, 200, {
        providers: scrapers.map((entry) => ({
          id: clean(entry.id),
          name: clean(entry.name || entry.id),
          enabled: entry.enabled !== false,
          supportedTypes: Array.isArray(entry.supportedTypes) ? entry.supportedTypes : [],
          formats: Array.isArray(entry.formats) ? entry.formats : [],
        })),
      });
    }

    if (requestUrl.pathname === "/v1/proxy") {
      return proxyRequest(req, res, requestUrl);
    }

    const refreshMatch = requestUrl.pathname.match(/^\/v1\/refresh\/([A-Za-z0-9_-]{8,200})\/?$/);
    if (refreshMatch) {
      cleanupMaps();
      const response = responseKeys.get(refreshMatch[1]);
      if (response) resultCache.delete(response.key);
      responseKeys.delete(refreshMatch[1]);
      return sendJson(res, 200, { status: "ok", refreshed: Boolean(response) });
    }

    const media = parseMediaRequest(requestUrl.pathname);
    if (media) {
      try {
        const data = await resolveMedia(media, { force: requestUrl.searchParams.get("refresh") === "1" });
        return sendJson(res, 200, data);
      } catch (error) {
        console.error("[nuvio-core] Resolve failed:", error.stack || error.message || error);
        return sendJson(res, 500, { status: "error", message: clean(error && error.message) || "Resolve failed." });
      }
    }

    return sendJson(res, 404, { status: "error", message: "Not found." });
  });
}

function startServer() {
  loadManifest();
  const server = createServer();
  server.listen(port, host, () => {
    const marker = readMarker();
    console.log(`[nuvio-core] Listening on ${publicBaseUrl()}.`);
    console.log(`[nuvio-core] Provider ref: ${clean(marker && marker.ref) || "unknown"}.`);
    console.log(`[nuvio-core] Enabled movie providers: ${providerSelection("movie").length}.`);
  });
  return server;
}

module.exports = {
  cacheKey,
  clean,
  createProxyTarget,
  createServer,
  inferType,
  loadManifest,
  normalizeStream,
  parseMediaRequest,
  providerSelection,
  publicBaseUrl,
  rewriteHlsManifest,
  sourceScore,
  startServer,
};

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    console.error("[nuvio-core] Startup failed:", error.stack || error.message || error);
    process.exit(1);
  }
}
