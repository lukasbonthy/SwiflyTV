"use strict";

const fs = require("fs");
const path = require("path");
const { patchCustomControls } = require("./start-cinepro-controls-fixed.js");

const sourcePath = path.join(__dirname, "start-cinepro-custom-controls.js");
const source = fs.readFileSync(sourcePath, "utf8");
const patched = patchCustomControls(source);

const requiredMarkers = [
  "__swiflyControlGeneration",
  "function commitScrub()",
  'progress.addEventListener("pointercancel", commitScrub)',
  'document.addEventListener("fullscreenchange", syncFullscreen)',
  'key === " " || key === "k"',
  "quality.disabled = levels.length === 0",
];

for (const marker of requiredMarkers) {
  if (!patched.includes(marker)) {
    throw new Error(`[swifly-controls-fixed-qa] Missing patched marker: ${marker}`);
  }
}

if ((patched.match(/function mountSwiflyControls\(/g) || []).length !== 1) {
  throw new Error("[swifly-controls-fixed-qa] Control mount function count changed unexpectedly.");
}

console.log("Swifly control reliability QA passed.");
