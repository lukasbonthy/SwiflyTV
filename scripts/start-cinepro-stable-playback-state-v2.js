"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const base = require("./start-cinepro-stable-playback-state.js");

const root = path.resolve(__dirname, "..");
const cineproClientPath = path.join(root, "cinepro-client.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-stable-state] Could not find ${label}; refusing a partial state patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchCineProClientState(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  const cappedSourceHeader =
    /  const sourceOptions = candidates\.slice\(0,\s*16\)\.map\(\(candidate,\s*index\) => \{/;
  const unlimitedSourceHeader =
    /  const sourceOptions = candidates\.map\(\(candidate,\s*index\) => \{/;
  const stableSourceHeader =
    /  const sourceIdCounts = new Map\(\);\n  const sourceOptions = candidates\.map\(\(candidate\) => \{/;

  if (!stableSourceHeader.test(next)) {
    const sourceHeader = cappedSourceHeader.test(next)
      ? cappedSourceHeader
      : unlimitedSourceHeader.test(next)
        ? unlimitedSourceHeader
        : null;

    if (!sourceHeader) {
      throw new Error(
        "[swifly-stable-state] Could not find capped or already-unlimited Source options; refusing a partial state patch.",
      );
    }

    sourceHeader.lastIndex = 0;
    next = next.replace(
      sourceHeader,
      `  const sourceIdCounts = new Map();
  const sourceOptions = candidates.map((candidate) => {`,
    );
  }

  if (!next.includes("const stableSourceId =")) {
    next = replaceRequired(
      next,
      /    const streamMode = candidate\.kind;\n    return \{/,
      `    const streamMode = candidate.kind;
    const sourceIdentity = [
      clean(optionProvider.id || optionProvider.name),
      clean(optionSource.type),
      quality,
      clean(optionSource.url),
    ].join("|");
    const sourceHash = crypto.createHash("sha1").update(sourceIdentity).digest("hex").slice(0, 14);
    const duplicateNumber = Number(sourceIdCounts.get(sourceHash) || 0) + 1;
    sourceIdCounts.set(sourceHash, duplicateNumber);
    const stableSourceId = "cinepro-source-" + sourceHash + (duplicateNumber > 1 ? "-" + duplicateNumber : "");
    return {`,
      "stable Source identity",
    );
  }

  if (!next.includes("id: stableSourceId")) {
    next = replaceRequired(
      next,
      /      id: `cinepro-source-\$\{index\}`,/,
      "      id: stableSourceId,",
      "sequential Source id",
    );
  }

  if (next.includes("candidates.slice(0, 16)")) {
    throw new Error("[swifly-stable-state] Source cutoff survived patching.");
  }
  if (!stableSourceHeader.test(next) || !next.includes("id: stableSourceId")) {
    throw new Error("[swifly-stable-state] Stable unlimited Source state was not fully generated.");
  }

  new vm.Script(next, { filename: cineproClientPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyStableStateV2Read(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) {
      patcher = patchCineProClientState;
      label = "all stable Source options";
    }
    if (resolved === customControlsPath) {
      patcher = base.patchCustomControlsState;
      label = "media-backed Speed state";
    }
    if (resolved === languagesPath) {
      patcher = base.patchLanguagesState;
      label = "persistent Source selection";
    }
    if (resolved === themePath) {
      patcher = base.patchThemeState;
      label = "persistent playback menu selections";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-stable-state] ${label} injected.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchCineProClientState,
  patchCustomControlsState: base.patchCustomControlsState,
  patchLanguagesState: base.patchLanguagesState,
  patchThemeState: base.patchThemeState,
};
