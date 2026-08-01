"use strict";

const Module = require("module");
const path = require("path");

const root = path.resolve(__dirname, "..");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const polishedPath = path.join(root, "scripts", "start-cinepro-polished.js");
const premiumPath = path.join(root, "scripts", "start-cinepro-premium.js");

let loading = false;

function normalizeResolvedPath(value) {
  try {
    return path.resolve(String(value));
  } catch {
    return "";
  }
}

function replacementForResolvedPath(resolvedPath) {
  const normalized = normalizeResolvedPath(resolvedPath);
  if (normalized === polishedPath || normalized === premiumPath) {
    return customControlsPath;
  }
  return "";
}

function loadLanguagesWithoutLegacyStyles() {
  if (loading) return require(languagesPath);
  loading = true;

  const originalLoad = Module._load;
  let redirectCount = 0;

  Module._load = function swiflySafeStyleLoad(request, parent, isMain) {
    let resolved = "";
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      return originalLoad.call(this, request, parent, isMain);
    }

    const replacement = replacementForResolvedPath(resolved);
    if (replacement) {
      redirectCount += 1;
      console.log(
        `[swifly-safe-style] Bypassing unsafe legacy injector ${path.basename(resolved)}; loading ${path.basename(replacement)} directly.`,
      );
      return originalLoad.call(this, replacement, parent, isMain);
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const result = require(languagesPath);
    if (redirectCount < 1) {
      throw new Error(
        "[swifly-safe-style] The compact startup did not request a legacy style injector; refusing an unverified chain.",
      );
    }
    console.log(
      `[swifly-safe-style] Safe control chain loaded with ${redirectCount} legacy style redirect(s).`,
    );
    return result;
  } finally {
    Module._load = originalLoad;
    loading = false;
  }
}

module.exports = {
  customControlsPath,
  languagesPath,
  loadLanguagesWithoutLegacyStyles,
  polishedPath,
  premiumPath,
  replacementForResolvedPath,
};
