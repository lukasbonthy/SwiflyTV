"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const cineproClientPath = path.join(root, "cinepro-client.js");
const plyrPath = path.join(__dirname, "start-cinepro-plyr.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-all-media] Could not find ${label}; refusing a partial patch.`);
  }
  return source.replace(needle, replacement);
}

function patchCineProClientAllMedia(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    "function registerRelayTarget(target, kind, expiresAt) {",
    "function registerRelayTarget(target, kind, expiresAt, metadata = {}) {",
    "relay metadata signature",
  );

  next = replaceRequired(
    next,
    `    kind: clean(kind).toLowerCase() || "asset",
    expiresAt: normalizeExpiry(expiresAt),`,
    `    kind: clean(kind).toLowerCase() || "asset",
    format: clean(metadata && metadata.format).toLowerCase(),
    expiresAt: normalizeExpiry(expiresAt),`,
    "relay subtitle format metadata",
  );

  const subtitleHelpers = String.raw`
function detectSubtitleFormat(value, target = "", contentType = "") {
  const explicit = clean(value).toLowerCase().replace(/^\./, "");
  if (["vtt", "webvtt"].includes(explicit)) return "vtt";
  if (["srt", "subrip"].includes(explicit)) return "srt";
  if (["ass", "ssa"].includes(explicit)) return "ass";

  const haystack = (clean(target) + " " + clean(contentType)).toLowerCase();
  if (/\.(?:srt)(?:[?#]|\s|$)|subrip/.test(haystack)) return "srt";
  if (/\.(?:ass|ssa)(?:[?#]|\s|$)|substation/.test(haystack)) return "ass";
  return "vtt";
}

function assTimeToVtt(value) {
  const match = clean(value).match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
  if (!match) return "00:00:00.000";
  const hours = String(Number(match[1]) || 0).padStart(2, "0");
  const minutes = String(Number(match[2]) || 0).padStart(2, "0");
  const seconds = String(Number(match[3]) || 0).padStart(2, "0");
  const fraction = String(match[4] || "0").padEnd(3, "0").slice(0, 3);
  return hours + ":" + minutes + ":" + seconds + "." + fraction;
}

function subtitleBodyToVtt(body, format = "") {
  const source = String(body || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^\s*WEBVTT(?:\s|$)/i.test(source)) return source;

  const detected = detectSubtitleFormat(format, "", source.slice(0, 120));
  if (detected === "ass" || /^\s*\[(?:Script Info|V4\+? Styles|Events)\]/im.test(source)) {
    const cues = [];
    for (const line of source.split("\n")) {
      if (!/^Dialogue\s*:/i.test(line)) continue;
      const payload = line.replace(/^Dialogue\s*:\s*/i, "");
      const parts = payload.split(",");
      if (parts.length < 10) continue;
      const start = assTimeToVtt(parts[1]);
      const end = assTimeToVtt(parts[2]);
      const text = parts.slice(9).join(",")
        .replace(/\\N/gi, "\n")
        .replace(/\\h/gi, " ")
        .replace(/\{[^}]*\}/g, "")
        .trim();
      if (text) cues.push(start + " --> " + end + "\n" + text);
    }
    return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
  }

  const converted = source
    .replace(/(\d{1,2}:\d{2}:\d{2}),([0-9]{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}),([0-9]{3})/g, "$1.$2 --> $3.$4")
    .replace(/(\d{2}:\d{2}),([0-9]{3})\s*-->\s*(\d{2}:\d{2}),([0-9]{3})/g, "00:$1.$2 --> 00:$3.$4");
  return "WEBVTT\n\n" + converted.trim() + "\n";
}
`;

  next = replaceRequired(
    next,
    "function responseLooksLikeHls(upstream, entry) {",
    `${subtitleHelpers}\nfunction responseLooksLikeHls(upstream, entry) {`,
    "subtitle conversion helper insertion point",
  );

  next = replaceRequired(
    next,
    `  const source = selected.source || {};
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
    .filter(Boolean);`,
    `  const source = selected.source || {};
  const provider = source.provider || {};
  const subtitleInputs = [
    ...(Array.isArray(data && data.subtitles) ? data.subtitles : []),
    ...sources.flatMap((item) => [
      ...(Array.isArray(item && item.subtitles) ? item.subtitles : []),
      ...(Array.isArray(item && item.captions) ? item.captions : []),
      ...(Array.isArray(item && item.subtitleTracks) ? item.subtitleTracks : []),
    ]),
  ];
  const seenSubtitles = new Set();
  const subtitles = subtitleInputs
    .map((subtitle) => {
      const originalUrl = clean(subtitle && (subtitle.url || subtitle.src || subtitle.file));
      const format = detectSubtitleFormat(
        subtitle && (subtitle.format || subtitle.type || subtitle.extension),
        originalUrl,
      );
      const language = clean(subtitle && (subtitle.language || subtitle.lang || subtitle.srclang));
      const label = clean(subtitle && (subtitle.label || subtitle.name || subtitle.title)) || language || "Subtitle";
      const identity = [originalUrl, language.toLowerCase(), label.toLowerCase()].join("|");
      if (!originalUrl || seenSubtitles.has(identity)) return null;
      seenSubtitles.add(identity);
      const url = registerRelayTarget(originalUrl, "subtitle", data && data.expiresAt, { format });
      if (!url) return null;
      return { url, label, language, format: "vtt", originalFormat: format };
    })
    .filter(Boolean);`,
    "complete subtitle aggregation",
  );

  next = replaceRequired(
    next,
    `    subtitles,
    audioTracks: Array.isArray(source.audioTracks) ? source.audioTracks : [],`,
    `    subtitles,
    sourceCount: candidates.length,
    subtitleCount: subtitles.length,
    rawSourceCount: sources.length,
    audioTracks: Array.isArray(source.audioTracks) ? source.audioTracks : [],`,
    "source and subtitle diagnostics",
  );

  next = replaceRequired(
    next,
    `      if (upstream.ok && responseLooksLikeHls(upstream, entry)) {`,
    `      if (upstream.ok && entry.kind === "subtitle") {
        const subtitleBody = await upstream.text();
        const subtitleFormat = detectSubtitleFormat(
          entry.format,
          entry.target,
          upstream.headers.get("content-type") || "",
        );
        const vtt = subtitleBodyToVtt(subtitleBody, subtitleFormat);
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("X-Swifly-Subtitle-Format", subtitleFormat);
        return res.send(vtt);
      }

      if (upstream.ok && responseLooksLikeHls(upstream, entry)) {`,
    "subtitle relay conversion",
  );

  new vm.Script(next, { filename: cineproClientPath });
  return next;
}

function patchPlyrAllCaptions(source) {
  let next = String(source).replace(/\r\n?/g, "\n");
  next = replaceRequired(
    next,
    "              subtitles.slice(0, 24).forEach(function(item, index) {",
    "              subtitles.forEach(function(item, index) {",
    "24-caption display cap",
  );
  next = replaceRequired(
    next,
    `                track.srclang = String((item && item.language) || "und");
                video.appendChild(track);`,
    `                track.srclang = String((item && item.language) || "und");
                track.default = false;
                video.appendChild(track);
                try { track.track.mode = "disabled"; } catch {}`,
    "caption track initialization",
  );
  new vm.Script(next, { filename: plyrPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyAllMediaRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) {
      patcher = patchCineProClientAllMedia;
      label = "all-source and WebVTT subtitle bridge";
    }
    if (resolved === plyrPath) {
      patcher = patchPlyrAllCaptions;
      label = "uncapped caption track attachment";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-all-media] ${label} injected.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchCineProClientAllMedia,
  patchPlyrAllCaptions,
};
