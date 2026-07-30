"use strict";

const crypto = require("crypto");
const { Readable } = require("stream");

const relayTargets = new Map();
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RELAY_TTL_MS = 3 * 60 * 60 * 1000;

function enabled() {
  return process.env.CINEPRO_ENABLED !== "false";
}

function coreBaseUrl() {
  return String(process.env.CINEPRO_CORE_URL || `http://127.0.0.1:${process.env.CINEPRO_PORT || "3100"}`)
    .trim()
    .replace(/\/+$/, "");
}

function timeoutMs() {
  return Math.max(8_000, Number(process.env.CINEPRO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function qualityNumber(value) {
  const match = clean(value).match(/(2160|1440|1080|720|480|360|240)/);
  return match ? Number(match[1]) : 0;
}

function preferredLanguages() {
  return String(process.env.CINEPRO_LANGUAGE_ORDER || "en,eng,english")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function providerOrder() {
  return String(process.env.CINEPRO_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function sourceScore(source) {
  const type = clean(source && source.type).toLowerCase();
  const provider = clean(source && source.provider && (source.provider.id || source.provider.name)).toLowerCase();
  const languages = Array.isArray(source && source.audioTracks)
    ? source.audioTracks.flatMap((track) => [clean(track && track.language), clean(track && track.label)]).map((item) => item.toLowerCase())
    : [];

  let score = 0;
  if (type === "hls" || type === "m3u8") score += 10_000;
  else if (type === "dash" || type === "mpd") score += 7_000;
  else if (type === "mp4" || type === "file" || type === "video") score += 5_000;

  score += qualityNumber(source && source.quality) * 2;

  const languagesWanted = preferredLanguages();
  const languageIndex = languagesWanted.findIndex((wanted) => languages.some((actual) => actual === wanted || actual.includes(wanted)));
  if (languageIndex >= 0) score += 2_000 - languageIndex * 100;

  const providersWanted = providerOrder();
  const providerIndex = providersWanted.findIndex((wanted) => provider === wanted || provider.includes(wanted));
  if (providerIndex >= 0) score += 3_000 - providerIndex * 100;

  return score;
}

function cleanupRelayTargets() {
  const now = Date.now();
  for (const [token, entry] of relayTargets) {
    if (!entry || entry.expiresAt <= now) relayTargets.delete(token);
  }
}

function safeCoreProxyTarget(value) {
  const base = new URL(coreBaseUrl());
  let parsed;
  try {
    parsed = new URL(clean(value), base);
  } catch {
    return null;
  }

  if (parsed.origin !== base.origin) return null;
  if (!/^\/v1\/proxy\/?$/i.test(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}`;
}

function relayFilename(kind) {
  if (kind === "hls") return "master.m3u8";
  if (kind === "dash") return "manifest.mpd";
  if (kind === "subtitle") return "subtitle.vtt";
  return "video.mp4";
}

function registerRelayTarget(target, kind, expiresAt) {
  const safeTarget = safeCoreProxyTarget(target);
  if (!safeTarget) return "";

  cleanupRelayTargets();
  const token = crypto.randomBytes(24).toString("base64url");
  const parsedExpiry = Date.parse(clean(expiresAt));
  relayTargets.set(token, {
    target: safeTarget,
    kind,
    expiresAt: Number.isFinite(parsedExpiry) ? Math.max(Date.now() + 60_000, parsedExpiry) : Date.now() + DEFAULT_RELAY_TTL_MS,
  });
  return `/api/cinepro/stream/${token}/${relayFilename(kind)}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs());
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "SwiflyTV-CinePro/1.0",
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let data = null;
    try { data = JSON.parse(body); } catch {}
    if (!response.ok) {
      const message = clean(data && (data.message || data.error)) || body.slice(0, 180) || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCineProSource({ mediaType = "movie", id = "", season = "1", episode = "1", attempts = [] }) {
  if (!enabled()) return null;

  const numericId = clean(id);
  if (!/^\d{1,20}$/.test(numericId)) {
    attempts.push("cinepro: TMDB id must be numeric");
    return null;
  }

  const base = coreBaseUrl();
  const endpoint = mediaType === "tv"
    ? `/v1/tv/${encodeURIComponent(numericId)}/seasons/${encodeURIComponent(clean(season) || "1")}/episodes/${encodeURIComponent(clean(episode) || "1")}`
    : `/v1/movies/${encodeURIComponent(numericId)}`;

  const data = await fetchJson(`${base}${endpoint}`);
  const sources = Array.isArray(data && data.sources) ? data.sources : [];
  const candidates = sources
    .map((source) => {
      const type = clean(source && source.type).toLowerCase();
      const kind = type === "hls" || type === "m3u8" ? "hls" : type === "dash" || type === "mpd" ? "dash" : "video";
      const playbackUrl = registerRelayTarget(source && source.url, kind, data && data.expiresAt);
      return playbackUrl ? { source, kind, playbackUrl, score: sourceScore(source) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  if (!selected) {
    const diagnostics = Array.isArray(data && data.diagnostics) ? data.diagnostics : [];
    const detail = diagnostics.map((item) => clean(item && (item.message || item.code || item.provider))).filter(Boolean).slice(0, 3).join("; ");
    attempts.push(`cinepro: no playable proxied sources${detail ? ` (${detail})` : ""}`);
    return null;
  }

  const source = selected.source || {};
  const provider = source.provider || {};
  const subtitles = (Array.isArray(data && data.subtitles) ? data.subtitles : [])
    .map((subtitle) => {
      const url = registerRelayTarget(subtitle && subtitle.url, "subtitle", data && data.expiresAt);
      if (!url) return null;
      return {
        url,
        label: clean(subtitle && subtitle.label) || "Subtitle",
        language: clean(subtitle && subtitle.language),
        format: clean(subtitle && subtitle.format) || "vtt",
      };
    })
    .filter(Boolean);

  const isHls = selected.kind === "hls";
  const isDash = selected.kind === "dash";
  const providerName = clean(provider.name || provider.id) || "CinePro";

  attempts.push(`cinepro: selected ${providerName}${source.quality ? ` ${source.quality}` : ""}`);

  return {
    status: "ok",
    providerKind: `cinepro_omss_${selected.kind}`,
    movieId: numericId,
    sourceUrl: endpoint,
    playbackUrl: selected.playbackUrl,
    proxyVideo: selected.playbackUrl,
    originalPlaybackUrl: clean(source.url),
    hlsProxyUrl: isHls ? selected.playbackUrl : "",
    hlsProxyId: "",
    hlsProxyStatusUrl: "",
    m3u8: isHls ? selected.playbackUrl : "",
    embeddedM3u8Url: isHls ? selected.playbackUrl : "",
    m3u8Embedded: isHls,
    streamType: isHls ? "m3u8" : isDash ? "dash" : clean(source.type) || "video",
    streamQuality: clean(source.quality),
    streamName: providerName,
    streamHeaders: {},
    streamMode: isHls ? "hls" : isDash ? "dash" : "video",
    isLiveM3u8: false,
    apiProvider: "cinepro",
    responseId: clean(data && data.responseId),
    expiresAt: clean(data && data.expiresAt),
    subtitles,
    audioTracks: Array.isArray(source.audioTracks) ? source.audioTracks : [],
    diagnostics: Array.isArray(data && data.diagnostics) ? data.diagnostics : [],
    normalized: data,
    attempts,
  };
}

function copyUpstreamHeaders(upstream, res) {
  const headers = [
    "content-type",
    "accept-ranges",
    "content-range",
    "cache-control",
    "etag",
    "last-modified",
    "content-disposition",
  ];
  for (const name of headers) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

function registerCineProBridge(app) {
  if (!app || app.locals.__cineproBridgeRegistered) return;
  app.locals.__cineproBridgeRegistered = true;

  app.get("/api/cinepro/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (!enabled()) return res.status(503).json({ ok: false, enabled: false });
    try {
      const data = await fetchJson(`${coreBaseUrl()}/v1/health`, { timeoutMs: 10_000 });
      return res.json({ ok: true, coreUrl: coreBaseUrl(), ...data });
    } catch (error) {
      return res.status(502).json({ ok: false, coreUrl: coreBaseUrl(), message: error.message || "CinePro unavailable" });
    }
  });

  app.get("/api/cinepro/stream/:token/:filename", async (req, res) => {
    cleanupRelayTargets();
    const entry = relayTargets.get(clean(req.params.token));
    if (!entry || entry.expiresAt <= Date.now()) {
      relayTargets.delete(clean(req.params.token));
      return res.status(404).send("CinePro stream token expired or was not found.");
    }

    const controller = new AbortController();
    const onClose = () => controller.abort();
    req.once("close", onClose);

    try {
      const target = new URL(entry.target, coreBaseUrl()).toString();
      const headers = {
        Accept: req.get("accept") || "*/*",
        "User-Agent": req.get("user-agent") || "SwiflyTV-CinePro/1.0",
      };
      const range = req.get("range");
      if (range) headers.Range = range;

      const upstream = await fetch(target, { method: "GET", headers, signal: controller.signal, redirect: "follow" });
      res.status(upstream.status);
      copyUpstreamHeaders(upstream, res);
      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body).on("error", (error) => {
        if (!res.headersSent) res.status(502);
        try { res.end(error.message || "CinePro relay failed"); } catch {}
      }).pipe(res);
    } catch (error) {
      if (!res.headersSent) res.status(error.name === "AbortError" ? 499 : 502);
      if (!res.writableEnded) res.end(error.name === "AbortError" ? "Request closed" : (error.message || "CinePro relay failed"));
    } finally {
      req.off("close", onClose);
    }
  });
}

module.exports = {
  fetchCineProSource,
  registerCineProBridge,
};
