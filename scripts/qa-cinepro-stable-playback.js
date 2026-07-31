"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const sourceSpeed = require("./start-cinepro-source-speed.js");
const scopeSafe = require("./start-cinepro-source-speed-scope-safe.js");
const completeOptions = require("./start-cinepro-complete-option-data.js");
const stable = require("./start-cinepro-stable-playback-state-v2.js");

const root = path.resolve(__dirname, "..");
const cineproPath = path.join(root, "cinepro-client.js");
const controlsPath = path.join(__dirname, "start-cinepro-custom-controls.js");
const languagesPath = path.join(__dirname, "start-cinepro-languages.js");
const themePath = path.join(__dirname, "start-cinepro-theme-unified.js");
const launcherPath = path.join(__dirname, "start-cinepro-stable-playback.js");

function requireMarkers(source, markers, label) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`[swifly-stable-playback-qa] Missing ${label} marker: ${marker}`);
    }
  }
}

const cinepro = stable.patchCineProClientState(
  sourceSpeed.patchCineProClient(fs.readFileSync(cineproPath, "utf8")),
);
new vm.Script(cinepro, { filename: cineproPath });
requireMarkers(cinepro, [
  "const sourceIdCounts = new Map();",
  "const sourceOptions = candidates.map((candidate) => {",
  'crypto.createHash("sha1")',
  "id: stableSourceId,",
], "Source normalization");
if (cinepro.includes("candidates.slice(0, 16)")) {
  throw new Error("[swifly-stable-playback-qa] The 16-source cutoff is still active.");
}

const controls = stable.patchCustomControlsState(
  scopeSafe.patchCustomControlsScopeSafe(fs.readFileSync(controlsPath, "utf8")),
);
new vm.Script(controls, { filename: controlsPath });
requireMarkers(controls, [
  '<option value="0.5">0.5×</option>',
  '<option value="0.75">0.75×</option>',
  "media.defaultPlaybackRate = nextRate;",
  "window.__swiflyPlaybackRate = nextRate;",
  '"volumechange", "ratechange"',
  "actualPlaybackValue = String(actualPlaybackRate)",
], "Speed control");
const injectedControls = controls.match(/const injected = String\.raw`([\s\S]*?)`;\n/);
if (!injectedControls) {
  throw new Error("[swifly-stable-playback-qa] Could not extract generated controls.");
}
new vm.Script(injectedControls[1], { filename: "swifly-generated-stable-controls.js" });

const languages = stable.patchLanguagesState(
  completeOptions.patchLanguagesQualityRefresh(
    sourceSpeed.patchLanguages(fs.readFileSync(languagesPath, "utf8")),
  ),
);
new vm.Script(languages, { filename: languagesPath });
requireMarkers(languages, [
  "window.__swiflySelectedSourceId || source.value || activeSourceData.selectedSourceId",
  "activeSourceData.selectedSourceId = String(source.value || \"\")",
  "activeSourceData = nextData;",
  "window.__swiflyActiveSourceData = nextData;",
], "Source selection state");

const theme = stable.patchThemeState(
  completeOptions.patchThemeCompleteOptions(
    sourceSpeed.patchTheme(fs.readFileSync(themePath, "utf8")),
  ),
);
new vm.Script(theme, { filename: themePath });
requireMarkers(theme, [
  "var settingSelections = Object.create(null);",
  "function currentSettingValue(select)",
  '["0.5", "0.5×"]',
  '["0.75", "0.75×"]',
  "rememberSetting(select, option.value);",
  'media.addEventListener("ratechange"',
  "choice.dataset.value === String(currentSettingValue(select))",
], "menu selection state");
const themeUpgrade = theme.match(/const themeUpgrade = String\.raw`([\s\S]*?)`;\n/);
if (!themeUpgrade) {
  throw new Error("[swifly-stable-playback-qa] Could not extract generated theme.");
}
new vm.Script(themeUpgrade[1], { filename: "swifly-generated-stable-theme.js" });

const launcher = fs.readFileSync(launcherPath, "utf8");
new vm.Script(launcher, { filename: launcherPath });
const order = [
  'require("./start-cinepro-options-grid.js")',
  'require("./start-cinepro-source-speed-scope-safe.js")',
  'require("./start-cinepro-complete-option-data.js")',
  'require("./start-cinepro-stable-playback-state-v2.js")',
  'require("./start-cinepro-settings-cinema.js")',
];
let previous = -1;
for (const marker of order) {
  const index = launcher.indexOf(marker);
  if (index < 0 || index <= previous) {
    throw new Error(`[swifly-stable-playback-qa] Wrong startup order near ${marker}`);
  }
  previous = index;
}

console.log("Swifly all-Source, media-backed Speed, and persistent-selection QA passed.");
