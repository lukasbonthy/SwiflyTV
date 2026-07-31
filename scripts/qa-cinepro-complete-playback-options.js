"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchSettingsCinemaGrid } = require("./start-cinepro-options-grid.js");
const { patchThemeCompleteOptions } = require("./start-cinepro-complete-option-data.js");
const { patchTheme } = require("./start-cinepro-source-speed.js");

const settingsPath = path.join(__dirname, "start-cinepro-settings-cinema.js");
const themePath = path.join(__dirname, "start-cinepro-theme-unified.js");
const launcherPath = path.join(__dirname, "start-cinepro-complete-playback-options.js");

const patchedSettings = patchSettingsCinemaGrid(fs.readFileSync(settingsPath, "utf8"));
new vm.Script(patchedSettings, { filename: settingsPath });

for (const marker of [
  ".swiflyUiMenu.swiflyTrayDetail{width:min(760px,calc(100vw - 48px))",
  "grid-template-columns:repeat(5,minmax(72px,1fr))",
  "grid-template-columns:repeat(3,minmax(72px,1fr))",
  ".swiflyChoice{width:100%!important",
]) {
  if (!patchedSettings.includes(marker)) {
    throw new Error(`[swifly-complete-playback-qa] Missing option-grid marker: ${marker}`);
  }
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
  'choices.dataset.optionCount = String(optionNodes.length)',
  'detailTitle.textContent = item.label + (optionNodes.length ? " · " + optionNodes.length : "")',
]) {
  if (!patchedTheme.includes(marker)) {
    throw new Error(`[swifly-complete-playback-qa] Missing complete-option marker: ${marker}`);
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

console.log("Swifly complete playback option data and grid QA passed.");
