"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchSettingsCinemaGrid } = require("./start-cinepro-options-grid.js");
const {
  patchLanguagesQualityRefresh,
  patchThemeCompleteOptions,
} = require("./start-cinepro-complete-option-data.js");
const {
  patchLanguages,
  patchTheme,
} = require("./start-cinepro-source-speed.js");

const settingsPath = path.join(__dirname, "start-cinepro-settings-cinema.js");
const themePath = path.join(__dirname, "start-cinepro-theme-unified.js");
const languagesPath = path.join(__dirname, "start-cinepro-languages.js");
const launcherPath = path.join(__dirname, "start-cinepro-complete-playback-options.js");

const patchedSettings = patchSettingsCinemaGrid(fs.readFileSync(settingsPath, "utf8"));
new vm.Script(patchedSettings, { filename: settingsPath });

for (const marker of [
  ".swiflyUiMenu.swiflyTrayDetail{width:min(var(--swifly-option-panel-width,420px),calc(100vw - 32px))",
  "grid-template-columns:repeat(var(--swifly-option-columns,1),72px)",
  "grid-template-columns:repeat(var(--swifly-option-columns,1),68px)",
  ".swiflyChoice{width:72px!important;min-width:72px!important",
  "accent-color:#ff4f9a!important",
  "body.swifly-command-settings .swiflyPlayerUi.menuOpen .swiflyUiProgress",
  "linear-gradient(90deg,#ff4f9a 0 var(--p)",
  ".swiflyUiProgress::-webkit-slider-thumb{background:#fff!important",
]) {
  if (!patchedSettings.includes(marker)) {
    throw new Error(`[swifly-complete-playback-qa] Missing compact-grid or timeline marker: ${marker}`);
  }
}

if (patchedSettings.includes("width:min(760px,calc(100vw - 48px))")) {
  throw new Error("[swifly-complete-playback-qa] Fixed 760px detail-panel width survived.");
}

const sourceAwareTheme = patchTheme(fs.readFileSync(themePath, "utf8"));
const patchedTheme = patchThemeCompleteOptions(sourceAwareTheme);
new vm.Script(patchedTheme, { filename: themePath });

const themeUpgrade = patchedTheme.match(/const themeUpgrade = String\.raw`([\s\S]*?)`;\n/);
if (!themeUpgrade) {
  throw new Error("[swifly-complete-playback-qa] Could not extract generated theme code.");
}
new vm.Script(themeUpgrade[1], { filename: "swifly-generated-complete-playback-options.js" });

for (const marker of [
  'var canonicalSpeeds = [',
  '[".5", "0.5×"]',
  '["1", "Normal"]',
  '["1.75", "1.75×"]',
  '["2.5", "2.5×"]',
  '["3", "3×"]',
  '["4", "4×"]',
  "completeOptionNodes(item, select)",
  "var optionCount = optionNodes.length",
  "var optionColumns = Math.min(5, Math.max(1, optionCount))",
  "var panelWidth = Math.max(170, Math.min(420",
  'choices.style.setProperty("--swifly-option-columns", String(optionColumns))',
  'menu.style.setProperty("--swifly-option-panel-width", panelWidth + "px")',
  'choices.dataset.optionCount = String(optionCount)',
  'detailTitle.textContent = item.label + (optionCount ? " · " + optionCount : "")',
]) {
  if (!patchedTheme.includes(marker)) {
    throw new Error(`[swifly-complete-playback-qa] Missing complete-option sizing marker: ${marker}`);
  }
}

const sourceAwareLanguages = patchLanguages(fs.readFileSync(languagesPath, "utf8"));
const patchedLanguages = patchLanguagesQualityRefresh(sourceAwareLanguages);
new vm.Script(patchedLanguages, { filename: languagesPath });
for (const marker of [
  "hlsEvents.MANIFEST_PARSED",
  "hlsEvents.LEVELS_UPDATED",
  "hlsEvents.LEVEL_UPDATED",
  "hlsEvents.LEVEL_SWITCHED",
  "fillSettings();",
  "quality.value = String(Number.isInteger(hlsInstance.currentLevel)",
]) {
  if (!patchedLanguages.includes(marker)) {
    throw new Error(`[swifly-complete-playback-qa] Missing live Quality marker: ${marker}`);
  }
}

const launcher = fs.readFileSync(launcherPath, "utf8");
new vm.Script(launcher, { filename: launcherPath });
const orderMarkers = [
  'require("./start-cinepro-options-grid.js")',
  'require("./start-cinepro-source-speed-scope-safe.js")',
  'require("./start-cinepro-complete-option-data.js")',
  'require("./start-cinepro-settings-cinema.js")',
];
let previous = -1;
for (const marker of orderMarkers) {
  const index = launcher.indexOf(marker);
  if (index < 0 || index <= previous) {
    throw new Error(`[swifly-complete-playback-qa] Wrong or missing startup marker: ${marker}`);
  }
  previous = index;
}

console.log("Swifly compact playback panels, stable timeline colors, live Quality refresh, and complete option QA passed.");
