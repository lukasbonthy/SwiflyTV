"use strict";

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`[swifly-settings-server] ${label} must be a function.`);
  }
  return value;
}

function runStartupChain(loaders) {
  const loadPolished = requireFunction(loaders && loaders.loadPolished, "loadPolished");
  const loadScopeSafe = requireFunction(loaders && loaders.loadScopeSafe, "loadScopeSafe");
  const loadCinema = requireFunction(loaders && loaders.loadCinema, "loadCinema");

  const polished = loadPolished();
  if (!polished || typeof polished.installPatch !== "function") {
    throw new TypeError("[swifly-settings-server] Polished settings module does not export installPatch().");
  }
  polished.installPatch();

  // Load this module only after the polished hook is active. Its loader wrapper
  // intentionally captures the current fs.readFileSync implementation.
  const scopeSafe = loadScopeSafe();
  if (!scopeSafe || typeof scopeSafe.installPatch !== "function") {
    throw new TypeError("[swifly-settings-server] Scope-safe controls module does not export installPatch().");
  }
  scopeSafe.installPatch();

  return loadCinema();
}

function start() {
  console.log("[swifly-settings-server] Starting polished controls through the complete cinema server chain.");
  return runStartupChain({
    loadPolished: function loadPolished() {
      return require("./start-cinepro-settings-polished.js");
    },
    loadScopeSafe: function loadScopeSafe() {
      return require("./start-cinepro-source-speed-scope-safe.js");
    },
    loadCinema: function loadCinema() {
      return require("./start-cinepro-settings-cinema.js");
    },
  });
}

module.exports = { runStartupChain, start };

if (require.main === module) {
  start();
}
