"use strict";

function requireInstaller(moduleValue, label) {
  if (!moduleValue || typeof moduleValue.installPatch !== "function") {
    throw new TypeError(`[swifly-complete-playback] ${label} does not export installPatch().`);
  }
  return moduleValue;
}

function start() {
  console.log("[swifly-complete-playback] Starting complete playback-option controls.");

  const grid = requireInstaller(require("./start-cinepro-options-grid.js"), "options grid");
  grid.installPatch();

  // Load after the grid hook so the scope-safe wrapper captures it.
  const scopeSafe = requireInstaller(
    require("./start-cinepro-source-speed-scope-safe.js"),
    "scope-safe controls",
  );
  scopeSafe.installPatch();

  // Load last so this renderer sees the Source definition inserted by the
  // scope-safe Source patch before the cinema layer mounts the theme.
  const completeOptions = requireInstaller(
    require("./start-cinepro-complete-option-data.js"),
    "complete option data",
  );
  completeOptions.installPatch();

  return require("./start-cinepro-settings-cinema.js");
}

module.exports = { start };

if (require.main === module) {
  start();
}
