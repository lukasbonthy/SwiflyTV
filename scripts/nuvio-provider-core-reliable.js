"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");
const vm = require("vm");

const corePath = path.join(__dirname, "nuvio-provider-core.js");

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[nuvio-core-reliable] Could not find ${label}; refusing a partial playback patch.`);
  }
  return source.replace(needle, replacement);
}

const validationHelpers = String.raw`
function firstHlsChild(manifest) {
  const lines = String(manifest || "").split(/\r?\n/);
  let nextIsPlaylist = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) nextIsPlaylist = true;
      const attribute = trimmed.match(/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):.*?URI="([^"]+)"/i);
      if (attribute && attribute[1]) return { url: attribute[1], kind: "playlist" };
      continue;
    }
    const kind = nextIsPlaylist ? "playlist" : "segment";
    return { url: trimmed, kind };
  }

  return null;
}

function responseLooksLikeMarkup(response, sample) {
  const contentType = clean(response && response.headers && response.headers.get("content-type")).toLowerCase();
  const text = String(sample || "").trim().toLowerCase();
  return contentType.includes("text/html") || contentType.includes("application/json") ||
    text.startsWith("<!doctype html") || text.startsWith("<html") || text.startsWith("{") || text.startsWith("[");
}

async function fetchPlaybackProbe(url, options = {}) {
  const timeout = Math.max(2500, Number(process.env.NUVIO_SOURCE_VALIDATION_TIMEOUT_MS || 12000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      method: "GET",
      headers: options.headers || {},
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function validateNuvioPlaybackSource(source) {
  const label = clean(source && source.provider && (source.provider.name || source.provider.id)) || "Nuvio source";
  const quality = clean(source && source.quality);
  const type = clean(source && source.type).toLowerCase();
  const url = clean(source && source.url);
  if (!url) return { ok: false, reason: "missing playback URL" };

  try {
    if (type === "hls" || type === "m3u8") {
      const response = await fetchPlaybackProbe(url, {
        headers: { Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" },
      });
      if (!response.ok) return { ok: false, reason: "manifest HTTP " + response.status };
      const manifest = await response.text();
      if (!/^\s*#EXTM3U/m.test(manifest)) {
        return { ok: false, reason: responseLooksLikeMarkup(response, manifest) ? "manifest returned markup instead of HLS" : "invalid HLS manifest" };
      }

      const child = firstHlsChild(manifest);
      if (child && child.url) {
        const childUrl = resolveUrl(child.url, url);
        const childResponse = await fetchPlaybackProbe(childUrl, {
          headers: child.kind === "segment"
            ? { Accept: "*/*", Range: "bytes=0-2047" }
            : { Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" },
        });
        if (!childResponse.ok && childResponse.status !== 206) {
          return { ok: false, reason: child.kind + " HTTP " + childResponse.status };
        }
        if (child.kind === "playlist") {
          const childManifest = await childResponse.text();
          if (!/^\s*#EXTM3U/m.test(childManifest)) {
            return { ok: false, reason: "child playlist is not HLS" };
          }
        } else {
          const sample = Buffer.from(await childResponse.arrayBuffer()).subarray(0, 96).toString("utf8");
          if (responseLooksLikeMarkup(childResponse, sample)) {
            return { ok: false, reason: "first segment returned markup" };
          }
        }
      }

      return { ok: true };
    }

    if (type === "dash" || type === "mpd") {
      const response = await fetchPlaybackProbe(url, { headers: { Accept: "application/dash+xml,*/*" } });
      if (!response.ok) return { ok: false, reason: "DASH manifest HTTP " + response.status };
      const manifest = await response.text();
      return /<MPD\b/i.test(manifest)
        ? { ok: true }
        : { ok: false, reason: "invalid DASH manifest" };
    }

    const response = await fetchPlaybackProbe(url, {
      headers: { Accept: "video/*,application/octet-stream,*/*", Range: "bytes=0-2047" },
    });
    if (!response.ok && response.status !== 206) {
      return { ok: false, reason: "media HTTP " + response.status };
    }
    const sample = Buffer.from(await response.arrayBuffer()).subarray(0, 96).toString("utf8");
    if (responseLooksLikeMarkup(response, sample)) {
      return { ok: false, reason: "media URL returned markup" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: clean(error && error.message) || String(error) };
  } finally {
    if (process.env.NUVIO_SOURCE_VALIDATION_LOG === "verbose") {
      console.log("[nuvio-core] Validated " + label + (quality ? " " + quality : "") + ".");
    }
  }
}

async function filterVerifiedNuvioSources(sources, diagnostics) {
  const candidates = Array.isArray(sources) ? sources : [];
  if (!candidates.length) return [];
  if (process.env.NUVIO_SOURCE_VALIDATION === "false") return candidates;

  const checked = await mapLimit(
    candidates,
    Math.max(1, Math.min(6, Number(process.env.NUVIO_SOURCE_VALIDATION_CONCURRENCY || 4))),
    async function(source) {
      const result = await validateNuvioPlaybackSource(source);
      return { source, result };
    },
  );

  const verified = [];
  for (const item of checked) {
    if (item.result && item.result.ok) {
      item.source.verified = true;
      verified.push(item.source);
      continue;
    }
    const provider = clean(item.source && item.source.provider && (item.source.provider.name || item.source.provider.id)) || "Nuvio source";
    const quality = clean(item.source && item.source.quality);
    const reason = clean(item.result && item.result.reason) || "playback validation failed";
    console.warn("[nuvio-core] Rejected " + provider + (quality ? " " + quality : "") + ": " + reason + ".");
    if (Array.isArray(diagnostics)) {
      diagnostics.push({
        code: "SOURCE_PLAYBACK_REJECTED",
        provider,
        message: provider + (quality ? " " + quality : "") + ": " + reason,
        severity: "warning",
      });
    }
  }

  console.log("[nuvio-core] Playback validation kept " + verified.length + " of " + candidates.length + " normalized source(s).");
  return verified;
}

`;

function patchCoreSource(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    '  const combined = [rawType, url, ...formats].join(" ");\n\n  if (/m3u8|\\bhls\\b/.test(combined)) return "hls";\n  if (/\\.mpd(?:[?#]|$)|\\bdash\\b|\\bmpd\\b/.test(combined)) return "dash";\n  if (/\\.mp4(?:[?#]|$)|\\bmp4\\b/.test(combined)) return "mp4";\n  if (/\\.webm(?:[?#]|$)|\\bwebm\\b/.test(combined)) return "webm";\n  if (/\\.mkv(?:[?#]|$)|\\bmkv\\b/.test(combined)) return "mkv";\n  return "video";',
    '  const direct = [rawType, url].join(" ");\n\n  if (/m3u8|\\bhls\\b/.test(direct)) return "hls";\n  if (/\\.mpd(?:[?#]|$)|\\bdash\\b|\\bmpd\\b/.test(direct)) return "dash";\n  if (/\\.mp4(?:[?#]|$)|\\bmp4\\b/.test(direct)) return "mp4";\n  if (/\\.webm(?:[?#]|$)|\\bwebm\\b/.test(direct)) return "webm";\n  if (/\\.mkv(?:[?#]|$)|\\bmkv\\b/.test(direct)) return "mkv";\n\n  if (formats.length === 1) {\n    const fallback = formats[0];\n    if (/m3u8|hls/.test(fallback)) return "hls";\n    if (/mpd|dash/.test(fallback)) return "dash";\n    if (/mp4/.test(fallback)) return "mp4";\n    if (/webm/.test(fallback)) return "webm";\n    if (/mkv/.test(fallback)) return "mkv";\n  }\n  return "video";',
    "direct-first stream type inference",
  );

  next = replaceRequired(
    next,
    "async function resolveMedia(media, options = {}) {",
    validationHelpers + "async function resolveMedia(media, options = {}) {",
    "source validation helper insertion point",
  );

  next = replaceRequired(
    next,
    "  sources.sort((a, b) => sourceScore(b) - sourceScore(a));",
    "  const verifiedSources = await filterVerifiedNuvioSources(sources, diagnostics);\n  sources.length = 0;\n  sources.push(...verifiedSources);\n  sources.sort((a, b) => sourceScore(b) - sourceScore(a));",
    "normalized source sorting point",
  );

  next = replaceRequired(
    next,
    '  const onClose = () => controller.abort();\n  req.once("close", onClose);',
    '  const onClose = () => { if (!res.writableEnded) controller.abort(); };\n  res.once("close", onClose);',
    "request completion abort handler",
  );
  next = replaceRequired(
    next,
    '    req.off("close", onClose);',
    '    res.off("close", onClose);',
    "request close cleanup",
  );

  next = replaceRequired(
    next,
    "  normalizeStream,\n  parseMediaRequest,",
    "  normalizeStream,\n  parseMediaRequest,\n  patchValidationMarker: true,\n  validateNuvioPlaybackSource,\n  filterVerifiedNuvioSources,",
    "reliability exports",
  );

  new vm.Script(next, { filename: corePath });
  return next;
}

function loadReliableCore() {
  const source = fs.readFileSync(corePath, "utf8");
  const patched = patchCoreSource(source);
  const runtimeModule = new Module(corePath, module.parent);
  runtimeModule.filename = corePath;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(corePath));
  runtimeModule._compile(patched, corePath);
  console.log("[nuvio-core-reliable] HLS proxy lifecycle and pre-playback source validation enabled.");
  return runtimeModule.exports;
}

module.exports = {
  corePath,
  loadReliableCore,
  patchCoreSource,
  validationHelpers,
};
