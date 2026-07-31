"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const scopeSafe = require("./start-cinepro-source-speed-scope-safe.js");
const stableState = require("./start-cinepro-stable-playback-state-v2.js");
const presence = require("./start-cinepro-controls-presence.js");

const customControlsPath = path.join(__dirname, "start-cinepro-custom-controls.js");
let transformed = fs.readFileSync(customControlsPath, "utf8");
transformed = scopeSafe.patchCustomControlsScopeSafe(transformed);
transformed = stableState.patchCustomControlsState(transformed);
transformed = presence.patchCustomControlsPresence(transformed);

new vm.Script(transformed, { filename: "swifly-controls-presence-composed.js" });

const markers = [
  "swiflyCustomControlsMounted",
  "ensureSwiflyControlsMounted",
  "setTimeout(ensureSwiflyControlsMounted, 0)",
  "setTimeout(ensureSwiflyControlsMounted, 250)",
  "setTimeout(ensureSwiflyControlsMounted, 1000)",
  'video.addEventListener("loadedmetadata", ensureSwiflyControlsMounted',
  'video.addEventListener("canplay", ensureSwiflyControlsMounted',
  "video.controls = true",
  "video.controls = false",
  "Custom controls failed; native controls restored.",
  "window.__swiflyActiveSourceData || {}",
];

for (const marker of markers) {
  if (!transformed.includes(marker)) {
    throw new Error(`[swifly-controls-presence-qa] Missing composed marker: ${marker}`);
  }
}

const unsafeHideRule =
  'body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls,body.swifly-watch-clean #movieButtonPlayerShell .plyr__control--overlaid,#swiflyCleanBack{display:none!important}';
if (transformed.includes(unsafeHideRule)) {
  throw new Error("[swifly-controls-presence-qa] Stock controls are still hidden before the custom deck mounts.");
}

const gatedHideRule =
  "#movieButtonPlayerShell.swiflyCustomControlsMounted .plyr__controls";
if (!transformed.includes(gatedHideRule)) {
  throw new Error("[swifly-controls-presence-qa] Custom-control mount marker does not gate stock-control hiding.");
}

const readyMounts = (transformed.match(/ensureSwiflyControlsMounted\(\)/g) || []).length;
if (readyMounts < 2) {
  throw new Error("[swifly-controls-presence-qa] Immediate and Plyr-ready control mounts were not both retained.");
}

console.log("Swifly fail-safe custom controls and native fallback composition QA passed.");
