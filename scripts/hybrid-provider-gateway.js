"use strict";

const crypto = require("crypto");
const http = require("http");
const { Readable } = require("stream");
const { URL } = require("url");

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function qualityNumber(value) {
  const text = clean(value).toLowerCase();
  if (text.includes("4k")) return 2160;
  const match = text.match(/(2160|1440|1080|720|576|480|360|240)/);
  return match ? Number(match[1]) : 0;
}

function normalizeType(value) {
  const type = clean(value).toLowerCase();
  if (type === "m3u8") return "hls";
  if (type === "mpd") return "dash";
  return type || "video";
}

function sourceScore(source) {
  const type = normalizeType(source && source.type);
  let score = type === "hls" ? 10_000 : type === "dash" ? 8_000 : type === "mp4" ? 7_000 : 3_000;
  score += qualityNumber(source && source.quality) * 2;
  const backend = clean(source && source.backend).toLowerCase();
  const preferred = clean(process.env.HYBRID_BACKEND_ORDER || "nuvio,cinepro")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const index = preferred.indexOf(backend);
  if (index >= 0) score += 1200 - index * 100;
  return score;
}

function defaultBackends() {
  return [
    {
      id: "cinepro",
      name: "CinePro",
      url: clean(process.env.HYBRID_CINEPRO_URL || "http://127.0.0.1:3100").replace(/\/+$/, ""),
      timeoutMs: Math.max(8_000, Number(process.env.HYBRID_CINEPRO_RESOLVE_TIMEOUT_MS || 28_000)),
    },
    {
      id: "nuvio",
      name: "Nuvio",
      url: clean(process.env.HYBRID_NUVIO_URL || "http://127.0.0.1:3201").replace(/\/+$/, ""),
      timeoutMs: Math.max(8_000, Number(process.env.HYBRID_NUVIO_RESOLVE_TIMEOUT_MS || 42_000)),
    },
  ];
}

function mediaPath(media) {
  return media.mediaType === "tv"
    ? `/v1/tv/${encodeURIComponent(media.id)}/seasons/${encodeURIComponent(media.season)}/episodes/${encodeURIComponent(media.episode)}`
    : `/v1/movies/${encodeURIComponent(media.id)}`;
}

function parseMediaRequest(pathname) {
  let match = pathname.match(/^\/v1\/movies\/(\d{1,20})\/?$/i);
  if (match) return { mediaType: "movie", id: match[1], season: null, episode: null };
  match = pathname.match(/^\/v1\/tv\/(\d{1,20})\/seasons\/(\d{1,6})\/episodes\/(\d{1,6})\/?$/i);
  if (match) {
    return {
      mediaType: "tv",
      id: match[1],
      season: Number(match[2]),
      episode: Number(match[3]),
    };
  }
  return null;
}

function cacheKey(media) {
  return [media.mediaType, media.id, media.season || "", media.episode || ""].join(":");
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

function createGateway(options = {}) {
  const host = clean(options.host || process.env.HYBRID_CORE_HOST || "127.0.0.1");
  const port = Math.max(1, Number(options.port || process.env.HYBRID_CORE_PORT || 3200));
  const publicUrl = clean(
    options.publicUrl || process.env.HYBRID_CORE_PUBLIC_URL || `http://${host}:${port}`,
  ).replace(/\/+$/, "");
  const backends = Array.isArray(options.backends) && options.backends.length
    ? options.backends.map((backend) => ({
      id: clean(backend.id).toLowerCase(),
      name: clean(backend.name || backend.id),
      url: clean(backend.url).replace(/\/+$/, ""),
      timeoutMs: Math.max(1000, Number(backend.timeoutMs || 30_000)),
    }))
    : defaultBackends();
  const cacheTtlMs = Math.max(15_000, Number(options.cacheTtlMs || process.env.HYBRID_CACHE_TTL_MS || 5 * 60 * 1000));
  const proxyTtlMs = Math.max(60_000, Number(options.proxyTtlMs || process.env.HYBRID_PROXY_TTL_MS || 3 * 60 * 60 * 1000));

  const resultCache = new Map();
  const responseKeys = new Map();
  const proxyTargets = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [key, entry] of resultCache) {
      if (!entry || entry.expiresAt <= now) resultCache.delete(key);
    }
    for (const [key, entry] of responseKeys) {
      if (!entry || entry.expiresAt <= now) responseKeys.delete(key);
    }
    for (const [key, entry] of proxyTargets) {
      if (!entry || entry.expiresAt <= now) proxyTargets.delete(key);
    }
  }

  function absoluteTarget(value, backendUrl = "") {
    try {
      const parsed = new URL(clean(value), backendUrl ? `${backendUrl}/` : undefined);
      return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : "";
    } catch {
      return "";
    }
  }

  function registerProxyTarget(target, config = {}) {
    const absolute = absoluteTarget(target, config.backendUrl);
    if (!absolute) return "";
    cleanup();
    const token = crypto.randomBytes(24).toString("base64url");
    proxyTargets.set(token, {
      target: absolute,
      headers: sanitizeHeaders(config.headers),
      backend: clean(config.backend),
      kind: clean(config.kind).toLowerCase() || "asset",
      expiresAt: Date.now() + Math.max(60_000, Number(config.ttlMs || proxyTtlMs)),
    });
    return `${publicUrl}/v1/proxy?data=${encodeURIComponent(token)}`;
  }

  function resolveUrl(value, baseUrl) {
    try { return new URL(clean(value), baseUrl).toString(); } catch { return ""; }
  }

  function rewriteHlsManifest(manifest, baseUrl, config = {}) {
    const source = String(manifest || "");
    if (!/^\s*#EXTM3U/m.test(source)) return { body: source, rewritten: 0 };
    let rewritten = 0;
    let nextHint = "asset";
    const lines = source.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) nextHint = "hls";
        let kind = "asset";
        if (/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i.test(trimmed)) kind = "hls";
        else if (/^#EXT-X-KEY:/i.test(trimmed)) kind = "key";
        return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
          const absolute = resolveUrl(uri, baseUrl);
          const proxied = absolute ? registerProxyTarget(absolute, { ...config, kind }) : "";
          if (!proxied) return match;
          rewritten += 1;
          return `URI="${proxied}"`;
        });
      }
      const absolute = resolveUrl(trimmed, baseUrl);
      const kind = nextHint;
      nextHint = "asset";
      const proxied = absolute ? registerProxyTarget(absolute, { ...config, kind }) : "";
      if (!proxied) return line;
      rewritten += 1;
      return line.replace(trimmed, proxied);
    });
    return { body: lines.join("\n"), rewritten };
  }

  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "SwiflyTV-Hybrid/1.0" },
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!response.ok) {
        throw new Error(clean(data && (data.message || data.error)) || text.slice(0, 180) || `HTTP ${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function backendHealth(backend) {
    const started = Date.now();
    try {
      const data = await fetchJson(`${backend.url}/v1/health`, Math.min(5000, backend.timeoutMs));
      return {
        id: backend.id,
        name: backend.name,
        ok: Boolean(data && (data.status === "operational" || data.status === "healthy" || data.spec === "omss")),
        elapsedMs: Date.now() - started,
        data,
        error: "",
      };
    } catch (error) {
      return {
        id: backend.id,
        name: backend.name,
        ok: false,
        elapsedMs: Date.now() - started,
        data: null,
        error: clean(error && error.message) || String(error),
      };
    }
  }

  async function resolveBackend(backend, media, force = false) {
    const started = Date.now();
    try {
      const suffix = force ? "?refresh=1" : "";
      const data = await fetchJson(`${backend.url}${mediaPath(media)}${suffix}`, backend.timeoutMs);
      const rawSources = Array.isArray(data && data.sources) ? data.sources : [];
      console.log(
        `[hybrid-core] ${backend.name} returned ${rawSources.length} source(s) in ${Date.now() - started}ms.`,
      );
      return {
        backend,
        data,
        elapsedMs: Date.now() - started,
        error: "",
      };
    } catch (error) {
      const message = clean(error && error.message) || String(error);
      console.warn(`[hybrid-core] ${backend.name} failed after ${Date.now() - started}ms: ${message}`);
      return {
        backend,
        data: null,
        elapsedMs: Date.now() - started,
        error: message,
      };
    }
  }

  function normalizeSource(source, result) {
    if (!source || typeof source !== "object") return null;
    const backend = result.backend;
    const type = normalizeType(source.type || source.streamType);
    const target = absoluteTarget(source.url || source.file || source.link, backend.url);
    if (!target) return null;
    const provider = source.provider && typeof source.provider === "object" ? source.provider : {};
    const providerId = clean(provider.id || provider.name || "unknown").toLowerCase();
    const providerName = clean(provider.name || provider.id || "Unknown");
    const quality = clean(source.quality || source.resolution || source.label) || "Auto";
    const proxied = registerProxyTarget(target, {
      backend: backend.id,
      backendUrl: backend.url,
      headers: source.headers || source.requestHeaders,
      kind: type,
    });
    if (!proxied) return null;
    return {
      identity: [backend.id, providerId, target, type, quality].join("|"),
      source: {
        ...source,
        url: proxied,
        type,
        quality,
        backend: backend.id,
        provider: {
          id: `${backend.id}:${providerId}`,
          name: `${backend.name} · ${providerName}`,
        },
      },
    };
  }

  function normalizeSubtitle(subtitle, result) {
    const item = typeof subtitle === "string" ? { url: subtitle } : subtitle;
    if (!item || typeof item !== "object") return null;
    const backend = result.backend;
    const target = absoluteTarget(item.url || item.file || item.src, backend.url);
    if (!target) return null;
    const proxied = registerProxyTarget(target, {
      backend: backend.id,
      backendUrl: backend.url,
      headers: item.headers,
      kind: "subtitle",
    });
    if (!proxied) return null;
    return {
      identity: [backend.id, target, clean(item.language || item.lang), clean(item.label || item.name)].join("|"),
      subtitle: {
        ...item,
        url: proxied,
        backend: backend.id,
        label: clean(item.label || item.name || item.language || item.lang) || `${backend.name} subtitle`,
        language: clean(item.language || item.lang),
        format: clean(item.format) || "vtt",
      },
    };
  }

  function mergeBackendResults(results) {
    const sources = [];
    const subtitles = [];
    const diagnostics = [];
    const providerStats = [];
    const seenSources = new Set();
    const seenSubtitles = new Set();
    const refreshTargets = [];

    for (const result of results) {
      const rawSources = Array.isArray(result.data && result.data.sources) ? result.data.sources : [];
      const rawSubtitles = Array.isArray(result.data && result.data.subtitles) ? result.data.subtitles : [];
      providerStats.push({
        backend: result.backend.id,
        id: result.backend.id,
        name: result.backend.name,
        elapsedMs: result.elapsedMs,
        rawStreams: rawSources.length,
        error: result.error,
      });

      if (result.error) {
        diagnostics.push({
          code: "BACKEND_ERROR",
          backend: result.backend.id,
          provider: result.backend.name,
          message: `${result.backend.name}: ${result.error}`,
          severity: "warning",
        });
      }

      for (const diagnostic of Array.isArray(result.data && result.data.diagnostics) ? result.data.diagnostics : []) {
        diagnostics.push({ ...diagnostic, backend: result.backend.id });
      }
      for (const stat of Array.isArray(result.data && result.data.providerStats) ? result.data.providerStats : []) {
        providerStats.push({ ...stat, backend: result.backend.id });
      }
      if (clean(result.data && result.data.responseId)) {
        refreshTargets.push({
          backend: result.backend.id,
          url: result.backend.url,
          responseId: clean(result.data.responseId),
        });
      }

      for (const raw of rawSources) {
        const normalized = normalizeSource(raw, result);
        if (!normalized || seenSources.has(normalized.identity)) continue;
        seenSources.add(normalized.identity);
        sources.push(normalized.source);
      }
      for (const raw of rawSubtitles) {
        const normalized = normalizeSubtitle(raw, result);
        if (!normalized || seenSubtitles.has(normalized.identity)) continue;
        seenSubtitles.add(normalized.identity);
        subtitles.push(normalized.subtitle);
      }
    }

    sources.sort((a, b) => sourceScore(b) - sourceScore(a));
    return { sources, subtitles, diagnostics, providerStats, refreshTargets };
  }

  async function resolveMedia(media, options = {}) {
    cleanup();
    const key = cacheKey(media);
    const cached = resultCache.get(key);
    if (!options.force && cached && cached.expiresAt > Date.now()) {
      console.log(`[hybrid-core] Cache HIT for ${key}.`);
      return cached.data;
    }

    console.log(`[hybrid-core] Resolving ${key} through ${backends.map((item) => item.name).join(" + ")}.`);
    const results = await Promise.all(
      backends.map((backend) => resolveBackend(backend, media, Boolean(options.force))),
    );
    const merged = mergeBackendResults(results);
    const responseId = crypto.randomUUID();
    const expiresAt = Date.now() + cacheTtlMs;
    const data = {
      responseId,
      status: "ok",
      spec: "omss",
      backend: "swifly-hybrid-provider-core",
      backendStatus: results.map((result) => ({
        id: result.backend.id,
        name: result.backend.name,
        ok: !result.error,
        elapsedMs: result.elapsedMs,
        sourceCount: Array.isArray(result.data && result.data.sources) ? result.data.sources.length : 0,
        error: result.error,
      })),
      expiresAt: new Date(expiresAt).toISOString(),
      sources: merged.sources,
      subtitles: merged.subtitles,
      diagnostics: merged.diagnostics,
      providerStats: merged.providerStats,
    };
    resultCache.set(key, { data, expiresAt });
    responseKeys.set(responseId, {
      key,
      expiresAt,
      refreshTargets: merged.refreshTargets,
    });
    console.log(
      `[hybrid-core] Combined ${merged.sources.length} playable source(s) and ${merged.subtitles.length} subtitle(s) for ${key}.`,
    );
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
    cleanup();
    const token = clean(requestUrl.searchParams.get("data"));
    const entry = proxyTargets.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
      return sendJson(res, 404, { status: "error", message: "Hybrid proxy target expired or not found." });
    }
    const controller = new AbortController();
    const onClose = () => controller.abort();
    req.once("close", onClose);
    const headers = { ...entry.headers };
    if (req.headers.range) headers.range = req.headers.range;
    if (!headers["user-agent"]) headers["user-agent"] = "Mozilla/5.0 SwiflyTV/HybridCore";
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
        const rewritten = rewriteHlsManifest(manifest, entry.target, {
          backend: entry.backend,
          headers: entry.headers,
        });
        res.removeHeader("content-length");
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Swifly-Hybrid-Rewritten", String(rewritten.rewritten));
        return res.end(rewritten.body);
      }
      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body)
        .on("error", (error) => {
          if (!res.headersSent) res.statusCode = 502;
          try { res.end(error.message || "Hybrid proxy failed"); } catch {}
        })
        .pipe(res);
    } catch (error) {
      if (!res.headersSent) res.statusCode = error && error.name === "AbortError" ? 499 : 502;
      if (!res.writableEnded) res.end(clean(error && error.message) || "Hybrid proxy failed");
    } finally {
      req.off("close", onClose);
    }
  }

  async function refreshResponse(responseId) {
    cleanup();
    const entry = responseKeys.get(responseId);
    if (!entry) return false;
    resultCache.delete(entry.key);
    responseKeys.delete(responseId);
    await Promise.all(
      (entry.refreshTargets || []).map(async (target) => {
        try {
          await fetchJson(
            `${target.url}/v1/refresh/${encodeURIComponent(target.responseId)}`,
            10_000,
          );
        } catch {}
      }),
    );
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", publicUrl);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
      });
      return res.end();
    }
    if (req.method !== "GET") {
      return sendJson(res, 405, { status: "error", message: "Method not allowed." });
    }

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/v1/health") {
      const statuses = await Promise.all(backends.map((backend) => backendHealth(backend)));
      const operational = statuses.filter((status) => status.ok);
      return sendJson(res, operational.length ? 200 : 503, {
        status: operational.length ? "operational" : "unavailable",
        spec: "omss",
        name: "Swifly Hybrid Provider Core",
        version: "1.0.0",
        backendCount: backends.length,
        operationalBackends: operational.length,
        degraded: operational.length !== backends.length,
        backends: statuses,
        cacheEntries: resultCache.size,
        proxyTargets: proxyTargets.size,
      });
    }

    if (requestUrl.pathname === "/v1/providers") {
      const backendProviders = await Promise.all(backends.map(async (backend) => {
        try {
          const data = await fetchJson(`${backend.url}/v1/providers`, 5000);
          const providers = Array.isArray(data && data.providers) ? data.providers : [];
          return providers.map((provider) => ({
            ...provider,
            id: `${backend.id}:${clean(provider.id).toLowerCase()}`,
            name: `${backend.name} · ${clean(provider.name || provider.id)}`,
            backend: backend.id,
          }));
        } catch {
          return [{
            id: backend.id,
            name: backend.name,
            backend: backend.id,
            enabled: true,
            aggregate: true,
          }];
        }
      }));
      return sendJson(res, 200, { providers: backendProviders.flat() });
    }

    if (requestUrl.pathname === "/v1/proxy") {
      return proxyRequest(req, res, requestUrl);
    }

    const refreshMatch = requestUrl.pathname.match(/^\/v1\/refresh\/([A-Za-z0-9_-]{8,200})\/?$/);
    if (refreshMatch) {
      const refreshed = await refreshResponse(refreshMatch[1]);
      return sendJson(res, 200, { status: "ok", refreshed });
    }

    const media = parseMediaRequest(requestUrl.pathname);
    if (media) {
      try {
        const data = await resolveMedia(media, {
          force: requestUrl.searchParams.get("refresh") === "1",
        });
        return sendJson(res, 200, data);
      } catch (error) {
        console.error("[hybrid-core] Resolve failed:", error.stack || error.message || error);
        return sendJson(res, 500, {
          status: "error",
          message: clean(error && error.message) || "Hybrid resolve failed.",
        });
      }
    }

    return sendJson(res, 404, { status: "error", message: "Not found." });
  });

  function start() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        const address = server.address();
        const actualPort = address && typeof address === "object" ? address.port : port;
        console.log(`[hybrid-core] Listening on http://${host}:${actualPort}.`);
        console.log(`[hybrid-core] Combining ${backends.map((item) => item.name).join(" + ")}.`);
        resolve(server);
      });
    });
  }

  return {
    backends,
    cacheKey,
    host,
    mergeBackendResults,
    normalizeSource,
    normalizeSubtitle,
    parseMediaRequest,
    port,
    proxyTargets,
    publicUrl,
    registerProxyTarget,
    resolveMedia,
    rewriteHlsManifest,
    server,
    sourceScore,
    start,
  };
}

module.exports = {
  cacheKey,
  clean,
  createGateway,
  defaultBackends,
  mediaPath,
  normalizeType,
  parseMediaRequest,
  qualityNumber,
  sourceScore,
};

if (require.main === module) {
  const gateway = createGateway();
  gateway.start().catch((error) => {
    console.error("[hybrid-core] Startup failed:", error.stack || error.message || error);
    process.exit(1);
  });
}
