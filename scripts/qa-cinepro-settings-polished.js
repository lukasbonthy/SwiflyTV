"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchSettingsCinema } = require("./start-cinepro-settings-polished.js");

const settingsPath = path.join(__dirname, "start-cinepro-settings-cinema.js");
const original = fs.readFileSync(settingsPath, "utf8");
const patched = patchSettingsCinema(original);

new vm.Script(patched, { filename: settingsPath });

const requiredMarkers = [
  "choiceStrip.scrollLeft = 0",
  ".swiflyUiMenu.swiflyTrayDetail{width:min(690px",
  ".swiflySettingsDetail{width:100%!important",
  ".swiflySettingsChoices{display:flex!important;flex:1 1 auto!important",
  "justify-content:flex-start!important",
  "scroll-snap-type:x proximity!important",
  ".swiflyChoice{flex:0 0 auto!important;min-width:56px!important",
];

for (const marker of requiredMarkers) {
  if (!patched.includes(marker)) {
    throw new Error(`[swifly-settings-polished-qa] Missing marker: ${marker}`);
  }
}

if (patched.includes(
  ".swiflySettingsChoices{display:flex!important;align-items:center!important;justify-content:flex-end!important",
)) {
  throw new Error("[swifly-settings-polished-qa] Choice strip is still right-justified.");
}

const upgrade = patched.match(/const cinemaUpgrade = String\.raw`([\s\S]*?)`;\n/);
if (!upgrade) {
  throw new Error("[swifly-settings-polished-qa] Generated cinema settings code was not found.");
}
new vm.Script(upgrade[1], { filename: "swifly-generated-cinema-settings.js" });

const sourceSpeedPath = path.join(__dirname, "start-cinepro-source-speed.js");
const sourceSpeed = fs.readFileSync(sourceSpeedPath, "utf8");
for (const speed of [".5", ".75", "1", "1.25", "1.5", "1.75", "2", "2.5", "3", "4"]) {
  if (!sourceSpeed.includes(`<option value=\"${speed}\"`)) {
    throw new Error(`[swifly-settings-polished-qa] Missing speed option: ${speed}`);
  }
}

console.log("Swifly polished tray and all-speed option visibility QA passed.");
