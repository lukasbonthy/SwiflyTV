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

  // Install after the option/state layers so it sees the final Source-aware
  // custom-control mount call. The guard keeps native controls available until
  // the custom deck is confirmed present, and retries on every useful media
  // lifecycle signal instead of depending only on Plyr's ready event.
  const controlPresence = requireInstaller(
    require("./start-cinepro-controls-presence.js"),
    "control presence guard",
  );
  controlPresence.installPatch();

  // Install last among state transformers so this layer receives the fully
  // transformed Source, Speed, language, theme, and option-grid modules and can
  // preserve their selected values across player remounts.
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
