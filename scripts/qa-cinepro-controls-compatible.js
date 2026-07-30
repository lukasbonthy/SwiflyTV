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
const cinemaSettingsSource = fs.readFileSync(
  path.join(__dirname, "start-cinepro-settings-cinema.js"),
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

const compactLayoutMarkers = [
  "min-height:62px!important",
  "position:absolute!important",
  "inset:auto 46px 53px auto!important",
  ".swiflySettingRow.isDisabled{display:none!important}",
  "Compact floating playback tray mounted.",
];

for (const marker of compactLayoutMarkers) {
  if (!cinemaSettingsSource.includes(marker)) {
    throw new Error(`[swifly-controls-compatible-qa] Missing compact layout marker: ${marker}`);
  }
}

if (cinemaSettingsSource.includes("position:relative!important;inset:auto!important;align-self:flex-end!important")) {
  throw new Error("[swifly-controls-compatible-qa] Old in-flow settings tray layout survived.");
}

console.log("Swifly control/language and compact layout QA passed.");
