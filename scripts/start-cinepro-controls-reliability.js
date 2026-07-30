"use strict";

const fs = require("fs");
const path = require("path");
const { patchFoundation } = require("./player-controls-reliability-foundation.js");
const { patchInteractions } = require("./player-controls-reliability-interactions.js");
const { patchLanguages, patchTheme } = require("./player-controls-reliability-layers.js");

const root = path.resolve(__dirname, "..");
const targets = {
  controls: path.join(root, "scripts", "start-cinepro-custom-controls.js"),
  languages: path.join(root, "scripts", "start-cinepro-languages.js"),
  theme: path.join(root, "scripts", "start-cinepro-theme-unified.js"),
};
const readFileSync = fs.readFileSync.bind(fs);
const patched = new Set();

function patchControls(source) {
  return patchInteractions(patchFoundation(source));
}

function patchFile(filePath, result) {
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched.has(resolved)) return result;
  const patcher = resolved === targets.controls ? patchControls : resolved === targets.languages ? patchLanguages : resolved === targets.theme ? patchTheme : null;
  if (!patcher) return result;
  patched.add(resolved);
  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const next = patcher(source.replace(/\r\n?/g, "\n"));
  return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
}

if (process.env.SWIFLY_PLAYER_PATCH_TEST === "1") {
  module.exports = { patchControls, patchLanguages, patchTheme };
} else {
  fs.readFileSync = function(filePath, ...args) {
    return patchFile(filePath, readFileSync(filePath, ...args));
  };
  console.log("[swifly-controls] Reliable seek, remount cleanup, keyboard, and fullscreen controls enabled.");
  require("./start-cinepro-settings-cinema.js");
}
