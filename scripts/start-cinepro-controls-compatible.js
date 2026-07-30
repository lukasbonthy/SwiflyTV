"use strict";

const fs = require("fs");
const path = require("path");
const { patchCustomControls } = require("./start-cinepro-controls-fixed.js");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

const languageCaptionMatcher = /if \(action === "cc"\) \{\n\s*var tracks = Array\.from\(media\.textTracks \|\| \[\]\);\n\s*var active = tracks\.findIndex\(function\(track\)\{ return track\.mode === "showing"; \}\);\n\s*tracks\.forEach\(function\(track\)\{ track\.mode = "disabled"; \}\);\n\s*if \(active < 0 && tracks\[0\]\) tracks\[0\]\.mode = "showing";\n\s*\}/;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-controls-compatible] Could not find ${label}; refusing to start with a partial compatibility patch.`);
  }
  return source.replace(needle, replacement);
}

function replacePatternRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-controls-compatible] Could not find ${label}; refusing to start with a partial compatibility patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchCustomControlsCompatible(source) {
  let next = patchCustomControls(source);

  next = replaceRequired(
    next,
    `            if (action === "cc") toggleCaptions();`,
    `            if (action === "cc") {
              var tracks = Array.from(media.textTracks || []);
              var active = tracks.findIndex(function(track){ return track.mode === "showing"; });
              tracks.forEach(function(track){ track.mode = "disabled"; });
              if (active < 0 && tracks[0]) tracks[0].mode = "showing";
            }`,
    "language-compatible caption button handler",
  );

  next = replaceRequired(
    next,
    `            else if (key === "c") toggleCaptions();`,
    `            else if (key === "c") {
              if (ccButton && !ccButton.disabled) ccButton.click();
            }`,
    "language-aware caption keyboard shortcut",
  );

  if (!languageCaptionMatcher.test(next)) {
    throw new Error("[swifly-controls-compatible] Caption button handler is not compatible with the language layer.");
  }

  return next;
}

function patchLanguagesCompatible(source) {
  source = source.replace(/\r\n?/g, "\n");

  return replacePatternRequired(
    source,
    /`function fillSettings\(\) \{\n\s*quality\.innerHTML = '<option value="-1">Auto<\/option>';\n\s*var seenQuality = \{\};\n\s*\(hlsInstance && hlsInstance\.levels \|\| \[\]\)\.forEach\(function\(level, index\)\{/,
    `\`function fillSettings() {
            if (!controlsCurrent()) return;
            var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];
            quality.innerHTML = '<option value="-1">Auto</option>';
            quality.disabled = levels.length === 0;
            var seenQuality = {};
            levels.forEach(function(level, index){`,
    "language settings population template",
  );
}

function installPatch() {
  fs.readFileSync = function swiflyControlsCompatibleRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}

    let patcher = null;
    let label = "";
    if (resolved === customControlsPath) {
      patcher = patchCustomControlsCompatible;
      label = "controls";
    }
    if (resolved === languagesPath) {
      patcher = patchLanguagesCompatible;
      label = "languages";
    }
    if (!patcher || patchedPaths.has(resolved)) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);

    if (label === "controls") {
      console.log("[swifly-controls-compatible] Reliable controls injected without breaking audio or caption languages.");
    } else {
      console.log("[swifly-controls-compatible] Language settings preserved reliable direct-upload controls.");
    }

    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  languageCaptionMatcher,
  patchCustomControlsCompatible,
  patchLanguagesCompatible,
};

if (require.main === module) {
  installPatch();
  require("./start-cinepro-settings-cinema.js");
}
