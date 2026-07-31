"use strict";

function requireInstaller(moduleValue, label) {
  if (!moduleValue || typeof moduleValue.installPatch !== "function") {
    throw new TypeError(`[swifly-stable-playback] ${label} does not export installPatch().`);
  }
  return moduleValue;
}

function start() {
  console.log("[swifly-stable-playback] Starting complete playback controls with persistent selections.");

  const grid = requireInstaller(require("./start-cinepro-options-grid.js"), "options grid");
  grid.installPatch();

  const scopeSafe = requireInstaller(
    require("./start-cinepro-source-speed-scope-safe.js"),
    "scope-safe controls",
  );
  scopeSafe.installPatch();

  const completeOptions = requireInstaller(
    require("./start-cinepro-complete-option-data.js"),
    "complete option data",
  );
  completeOptions.installPatch();

  // Install last so this layer receives the fully transformed Source, Speed,
  // language, theme, and option-grid modules and can preserve their state.
  const stableState = requireInstaller(
    require("./start-cinepro-stable-playback-state-v2.js"),
    "stable playback state",
  );
  stableState.installPatch();

  return require("./start-cinepro-settings-cinema.js");
}

module.exports = { start };

if (require.main === module) {
  start();
}
