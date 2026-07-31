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

  // Preserve Source, Speed, language, theme, and option-grid selections before
  // the final visibility layer inspects the composed control module.
  const stableState = requireInstaller(
    require("./start-cinepro-stable-playback-state-v2.js"),
    "stable playback state",
  );
  stableState.installPatch();

  // Install after the Source-aware control transforms. Native controls remain
  // available until the custom deck is confirmed present, with retries on
  // ready, metadata, canplay, and short startup timers.
  const controlPresence = requireInstaller(
    require("./start-cinepro-controls-presence.js"),
    "control presence guard",
  );
  controlPresence.installPatch();

  // Install last so this sees the fully generated server source. A missing or
  // differently-capitalized Watchlist renderer must not abort the entire page
  // before the movie player and its controls have a chance to mount.
  const watchlistGuard = requireInstaller(
    require("./start-cinepro-watchlist-guard.js"),
    "Watchlist bootstrap guard",
  );
  watchlistGuard.installPatch();

  return require("./start-cinepro-settings-cinema.js");
}

module.exports = { start };

if (require.main === module) {
  start();
}
