"use strict";

const fs = require("fs");
const path = require("path");
const {
  languageCaptionMatcher,
  patchCustomControlsCompatible,
  patchLanguagesCompatible,
} = require("./start-cinepro-controls-compatible.js");

const controlsSource = fs.readFileSync(
  path.join(__dirname, "start-cinepro-custom-controls.js"),
  "utf8",
);
const languagesSource = fs.readFileSync(
  path.join(__dirname, "start-cinepro-languages.js"),
  "utf8",
);

const patchedControls = patchCustomControlsCompatible(controlsSource);
const patchedLanguages = patchLanguagesCompatible(languagesSource);

const controlMarkers = [
  "__swiflyControlGeneration",
  "function commitScrub()",
  'progress.addEventListener("pointercancel", commitScrub)',
  'document.addEventListener("fullscreenchange", syncFullscreen)',
  'key === " " || key === "k"',
  "if (ccButton && !ccButton.disabled) ccButton.click();",
];

for (const marker of controlMarkers) {
  if (!patchedControls.includes(marker)) {
    throw new Error(`[swifly-controls-compatible-qa] Missing control marker: ${marker}`);
  }
}

if (!languageCaptionMatcher.test(patchedControls)) {
  throw new Error("[swifly-controls-compatible-qa] Language caption matcher cannot see the patched CC handler.");
}

if (patchedControls.includes('if (action === "cc") toggleCaptions();')) {
  throw new Error("[swifly-controls-compatible-qa] Incompatible shorthand CC handler survived.");
}

const languageMarkers = [
  "if (!controlsCurrent()) return;",
  "var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];",
  "quality.disabled = levels.length === 0;",
  "levels.forEach(function(level, index){",
];

for (const marker of languageMarkers) {
  if (!patchedLanguages.includes(marker)) {
    throw new Error(`[swifly-controls-compatible-qa] Missing language compatibility marker: ${marker}`);
  }
}

const hotfixUnsafePattern = String.raw`/cc\.addEventListener\("change", function\(\)\{[\s\S]*?\n\s*\}\);/`;
if (!patchedLanguages.includes(hotfixUnsafePattern)) {
  throw new Error("[swifly-controls-compatible-qa] Existing captions hotfix can no longer patch the language layer.");
}

console.log("Swifly control/language startup compatibility QA passed.");
