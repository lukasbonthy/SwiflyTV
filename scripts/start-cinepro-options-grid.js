"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchSettingsCinema } = require("./start-cinepro-settings-polished.js");

const root = path.resolve(__dirname, "..");
const settingsCinemaPath = path.join(root, "scripts", "start-cinepro-settings-cinema.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-options-grid] Could not find ${label}; refusing a partial option-grid patch.`);
  }
  return source.replace(needle, replacement);
}

function patchSettingsCinemaGrid(source) {
  let next = patchSettingsCinema(source);

  const reducedMotionRule =
    '              "@media(prefers-reduced-motion:reduce){body.swifly-command-settings .swiflyUiMenu,body.swifly-command-settings .swiflySettingRow,body.swifly-command-settings .swiflyChoice,body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings] i{animation:none!important;transition:none!important;transform:none!important;opacity:1!important}}"';

  const gridRules = [
    '              "body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail{width:min(var(--swifly-option-panel-width,420px),calc(100vw - 32px))!important;min-width:0!important;max-width:calc(100vw - 32px)!important;padding:8px!important}",',
    '              "body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail .swiflySettingsShell{width:100%!important;min-width:0!important;max-width:none!important}",',
    '              "body.swifly-command-settings .swiflySettingsDetail:not([hidden]){display:block!important;width:100%!important;min-width:0!important;max-width:none!important;overflow:visible!important}",',
    '              "body.swifly-command-settings .swiflyDetailHeader{width:100%!important;min-height:30px!important;margin-bottom:4px!important;padding:0 3px!important;justify-content:flex-start!important}",',
    '              "body.swifly-command-settings .swiflySettingsChoices{display:grid!important;grid-template-columns:repeat(var(--swifly-option-columns,1),72px)!important;width:max-content!important;max-width:100%!important;max-height:min(42vh,248px)!important;gap:6px!important;margin:0!important;padding:2px!important;justify-content:start!important;overflow-x:auto!important;overflow-y:auto!important;scroll-snap-type:none!important}",',
    '              "body.swifly-command-settings .swiflyChoice{width:72px!important;min-width:72px!important;min-height:34px!important;padding:0 8px!important;justify-content:center!important}",',
    '              "body.swifly-command-settings .swiflyChoiceText{font-size:9px!important}",',
    '              "body.swifly-command-settings .swiflyChoiceEmpty{grid-column:1/-1;padding:12px 14px;color:rgba(255,255,255,.55);font-size:10px;text-align:center}",',
    '              "body.swifly-command-settings .swiflyUiProgress,body.swifly-command-settings .swiflyPlayerUi.menuOpen .swiflyUiProgress{accent-color:#ff4f9a!important;background:linear-gradient(90deg,#ff4f9a 0 var(--p),rgba(124,92,255,.58) var(--p) var(--b),rgba(255,255,255,.15) var(--b))!important;box-shadow:0 0 14px rgba(124,92,255,.1)!important;filter:none!important}",',
    '              "body.swifly-command-settings .swiflyUiProgress:hover,body.swifly-command-settings .swiflyUiProgress:focus,body.swifly-command-settings .swiflyUiProgress:focus-visible{background:linear-gradient(90deg,#ff4f9a 0 var(--p),rgba(124,92,255,.58) var(--p) var(--b),rgba(255,255,255,.15) var(--b))!important;filter:none!important;outline:none!important}",',
    '              "body.swifly-command-settings .swiflyUiProgress::-webkit-slider-thumb{background:#fff!important;box-shadow:0 0 0 3px rgba(124,92,255,.18),0 3px 11px rgba(0,0,0,.5)!important}",',
    '              "body.swifly-command-settings .swiflyUiProgress::-moz-range-progress{background:#ff4f9a!important}",',
    '              "body.swifly-command-settings .swiflyUiProgress::-moz-range-thumb{border:0!important;background:#fff!important;box-shadow:0 0 0 3px rgba(124,92,255,.18),0 3px 11px rgba(0,0,0,.5)!important}",',
    '              "@media(max-width:760px){body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail{inset:auto 6px 52px 6px!important;width:auto!important;max-width:none!important}body.swifly-command-settings .swiflySettingsChoices{grid-template-columns:repeat(var(--swifly-option-columns,1),68px)!important;max-height:min(48vh,280px)!important}body.swifly-command-settings .swiflyChoice{width:68px!important;min-width:68px!important}}",',
  ].join("\n");

  next = replaceRequired(
    next,
    reducedMotionRule,
    `${gridRules}\n${reducedMotionRule}`,
    "reduced-motion CSS insertion point",
  );

  new vm.Script(next, { filename: settingsCinemaPath });
  const upgrade = next.match(/const cinemaUpgrade = String\.raw`([\s\S]*?)`;\n/);
  if (!upgrade) {
    throw new Error("[swifly-options-grid] Could not extract generated cinema settings code.");
  }
  new vm.Script(upgrade[1], { filename: "swifly-generated-options-grid.js" });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyOptionsGridRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== settingsCinemaPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchSettingsCinemaGrid(source);
    console.log("[swifly-options-grid] Tight content-sized playback-option grid injected.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { installPatch, patchSettingsCinemaGrid };
