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
    '              "body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail{width:min(760px,calc(100vw - 48px))!important;max-width:calc(100vw - 48px)!important;padding:8px!important}",',
    '              "body.swifly-command-settings .swiflySettingsDetail:not([hidden]){display:block!important;width:100%!important;max-width:none!important;overflow:visible!important}",',
    '              "body.swifly-command-settings .swiflyDetailHeader{width:100%!important;min-height:34px!important;margin-bottom:5px!important;padding:0 4px!important;justify-content:flex-start!important}",',
    '              "body.swifly-command-settings .swiflySettingsChoices{display:grid!important;grid-template-columns:repeat(5,minmax(72px,1fr))!important;width:100%!important;max-width:none!important;max-height:min(42vh,248px)!important;gap:6px!important;padding:2px!important;overflow-x:hidden!important;overflow-y:auto!important;scroll-snap-type:none!important}",',
    '              "body.swifly-command-settings .swiflyChoice{width:100%!important;min-width:0!important;min-height:36px!important;padding:0 10px!important;justify-content:center!important}",',
    '              "body.swifly-command-settings .swiflyChoiceText{font-size:9px!important}",',
    '              "body.swifly-command-settings .swiflyChoiceEmpty{grid-column:1/-1;padding:16px 18px;color:rgba(255,255,255,.55);font-size:10px;text-align:center}",',
    '              "@media(max-width:760px){body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail{inset:auto 6px 52px 6px!important;width:auto!important;max-width:none!important}body.swifly-command-settings .swiflySettingsChoices{grid-template-columns:repeat(3,minmax(72px,1fr))!important;max-height:min(48vh,280px)!important}}",',
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
    console.log("[swifly-options-grid] Full playback-option grid injected.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { installPatch, patchSettingsCinemaGrid };
