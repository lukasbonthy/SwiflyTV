"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const cineproClientPath = path.join(root, "cinepro-client.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-direct-proxy] Could not find ${label}; refusing a partial proxy patch.`);
  }
  return source.replace(needle, replacement);
}

function patchDirectSourceProxy(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  const helper = String.raw`
function ensureCoreProxyTarget(value, headers = {}) {
  const cleaned = clean(value);
  if (!cleaned) return "";

  const existing = safeCoreProxyTarget(cleaned);
  if (existing) return existing;

  let parsed;
  try { parsed = new URL(cleaned); } catch { return ""; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";

  const safeHeaders = headers && typeof headers === "object" && !Array.isArray(headers)
    ? headers
    : {};
  const payload = encodeURIComponent(JSON.stringify({
    url: parsed.toString(),
    headers: safeHeaders,
  }));
  return "/v1/proxy?data=" + payload;
}
`;

  next = replaceRequired(
    next,
    "function relayFilename(kind) {",
    `${helper}\nfunction relayFilename(kind) {`,
    "Core proxy helper insertion point",
  );

  next = replaceRequired(
    next,
    `      const playbackUrl = registerRelayTarget(source && source.url, kind, data && data.expiresAt);`,
    `      const playbackTarget = ensureCoreProxyTarget(
        source && source.url,
        source && (source.headers || source.streamHeaders || source.requestHeaders),
      );
      const playbackUrl = registerRelayTarget(playbackTarget, kind, data && data.expiresAt);`,
    "direct source normalization",
  );

  next = replaceRequired(
    next,
    `  const rewritten = registerRelayTarget(value, hlsKindForUri(value, hint), expiresAt);`,
    `  const relayTarget = ensureCoreProxyTarget(value);
  const rewritten = registerRelayTarget(relayTarget, hlsKindForUri(value, hint), expiresAt);`,
    "direct HLS child normalization",
  );

  next = replaceRequired(
    next,
    `      const url = registerRelayTarget(originalUrl, "subtitle", data && data.expiresAt, { format });`,
    `      const subtitleTarget = ensureCoreProxyTarget(
        originalUrl,
        subtitle && (subtitle.headers || subtitle.requestHeaders),
      );
      const url = registerRelayTarget(subtitleTarget, "subtitle", data && data.expiresAt, { format });`,
    "direct subtitle normalization",
  );

  new vm.Script(next, { filename: cineproClientPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyDirectSourceRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== cineproClientPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchDirectSourceProxy(source);
    console.log("[swifly-direct-proxy] Direct CinePro sources and subtitles routed through Core proxy.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { installPatch, patchDirectSourceProxy };
