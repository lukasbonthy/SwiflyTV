"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { runStartupChain } = require("./start-cinepro-settings-polished-server.js");

const launcherPath = path.join(__dirname, "start-cinepro-settings-polished-server.js");
const launcherSource = fs.readFileSync(launcherPath, "utf8");
new vm.Script(launcherSource, { filename: launcherPath });

const order = [];
const result = runStartupChain({
  loadPolished() {
    order.push("load-polished");
    return {
      installPatch() {
        order.push("install-polished");
      },
    };
  },
  loadScopeSafe() {
    if (order[order.length - 1] !== "install-polished") {
      throw new Error("[swifly-settings-server-qa] Scope-safe module loaded before the polished hook was installed.");
    }
    order.push("load-scope-safe");
    return {
      installPatch() {
        order.push("install-scope-safe");
      },
    };
  },
  loadCinema() {
    if (order[order.length - 1] !== "install-scope-safe") {
      throw new Error("[swifly-settings-server-qa] Cinema server loaded before the scope-safe hook was installed.");
    }
    order.push("load-cinema-server");
    return { started: true };
  },
});

const expected = [
  "load-polished",
  "install-polished",
  "load-scope-safe",
  "install-scope-safe",
  "load-cinema-server",
];

if (JSON.stringify(order) !== JSON.stringify(expected)) {
  throw new Error(`[swifly-settings-server-qa] Wrong startup order: ${order.join(" -> ")}`);
}

if (!result || result.started !== true) {
  throw new Error("[swifly-settings-server-qa] Final cinema/server entrypoint was not loaded.");
}

for (const marker of [
  'require("./start-cinepro-settings-polished.js")',
  'require("./start-cinepro-source-speed-scope-safe.js")',
  'require("./start-cinepro-settings-cinema.js")',
]) {
  if (!launcherSource.includes(marker)) {
    throw new Error(`[swifly-settings-server-qa] Missing launcher marker: ${marker}`);
  }
}

console.log("Swifly polished settings server startup-chain QA passed.");
