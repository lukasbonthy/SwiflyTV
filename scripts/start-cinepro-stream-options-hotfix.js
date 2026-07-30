"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  patchCineProClient,
  patchCustomControls,
  patchLanguages,
  patchTheme,
  patchCinema,
} = require("./start-cinepro-stream-options.js");

const root = path.resolve(__dirname, "..");
const cinemaPath = path.join(root, "scripts", "start-cinepro-settings-cinema.js");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const cineproClientPath = path.join(root, "cinepro-client.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function patchLanguagesSafe(source) {
  let next = patchLanguages(source);

  // v3.4.0 replaced the complete fillCaptionLanguages template including its
  // closing backtick, but did not restore that delimiter in the replacement.
  // Repair the generated patch module before Node compiles it.
  const brokenTail = '\n          }\n\n,\n    "caption language helpers",';
  const fixedTail = '\n          }\n\n`,\n    "caption language helpers",';

  if (next.includes(brokenTail)) {
    next = next.replace(brokenTail, fixedTail);
  }

  if (!next.includes(fixedTail)) {
    throw new Error(
      "[swifly-stream-options-hotfix] Caption helper template delimiter could not be verified.",
    );
  }

  // Compile the exact transformed module, not merely the unmodified files.
  // This catches malformed generated JavaScript before the normal require path.
  new vm.Script(next, { filename: languagesPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyStreamOptionsHotfixRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) {
      patcher = patchCineProClient;
      label = "CinePro sources";
    }
    if (resolved === customControlsPath) {
      patcher = patchCustomControls;
      label = "controls";
    }
    if (resolved === languagesPath) {
      patcher = patchLanguagesSafe;
      label = "quality, speed, and captions";
    }
    if (resolved === themePath) {
      patcher = patchTheme;
      label = "settings theme";
    }
    if (resolved === cinemaPath) {
      patcher = patchCinema;
      label = "settings layout";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-stream-options] ${label} patch ready.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchLanguagesSafe,
};

if (require.main === module) {
  installPatch();
  console.log("[swifly-stream-options-hotfix] Runtime-generated settings modules passed syntax validation.");
  console.log("[swifly-stream-options] Complete quality, speed, captions, and Source settings enabled.");
  require("./start-cinepro-settings-cinema.js");
}
