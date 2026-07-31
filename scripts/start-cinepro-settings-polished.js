"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const settingsCinemaPath = path.join(root, "scripts", "start-cinepro-settings-cinema.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-settings-polished] Could not find ${label}; refusing a partial UI patch.`);
  }
  return source.replace(needle, replacement);
}

function patchSettingsCinema(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    `            if (settingsButton) settingsButton.setAttribute("aria-expanded", open ? "true" : "false");`,
    `            if (settingsButton) settingsButton.setAttribute("aria-expanded", open ? "true" : "false");
            if (detailOpen && detail) {
              var choiceStrip = detail.querySelector(".swiflySettingsChoices");
              if (choiceStrip) {
                setTimeout(function() { choiceStrip.scrollLeft = 0; }, 0);
              }
            }`,
    "detail option scroll reset",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyUiBottom{overflow:visible!important;display:block!important;min-height:62px!important;padding:19px 10px 7px!important;transition:border-color .18s ease,box-shadow .2s ease,background .2s ease!important}`,
    `body.swifly-command-settings .swiflyUiBottom{overflow:visible!important;display:block!important;min-height:64px!important;padding:20px 12px 8px!important;transition:border-color .18s ease,box-shadow .2s ease,background .2s ease!important}`,
    "control deck spacing",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyUiProgress{left:10px!important;right:10px!important;top:9px!important;bottom:auto!important;width:calc(100% - 20px)!important}`,
    `body.swifly-command-settings .swiflyUiProgress{left:12px!important;right:12px!important;top:9px!important;bottom:auto!important;width:calc(100% - 24px)!important}`,
    "progress inset",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyUiMenu{display:block!important;position:absolute!important;inset:auto 46px 53px auto!important;z-index:8!important;width:fit-content!important;min-width:0!important;max-width:calc(100% - 64px)!important;max-height:min(46vh,310px)!important;margin:0!important;padding:4px!important;border:1px solid rgba(255,255,255,.11)!important;border-radius:14px!important;overflow:hidden!important;visibility:hidden!important;opacity:0!important;background:radial-gradient(circle at 85% 0,rgba(126,88,255,.16),transparent 42%),linear-gradient(180deg,rgba(20,20,34,.96),rgba(8,9,17,.97))!important;box-shadow:0 18px 56px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07)!important;-webkit-backdrop-filter:blur(22px) saturate(1.2)!important;backdrop-filter:blur(22px) saturate(1.2)!important;transform:translateY(8px) scale(.98)!important;transform-origin:right bottom!important;pointer-events:none!important;transition:opacity .15s ease,transform .2s cubic-bezier(.22,1,.36,1),visibility 0s linear .2s!important}`,
    `body.swifly-command-settings .swiflyUiMenu{display:block!important;position:absolute!important;inset:auto 42px 62px auto!important;z-index:8!important;width:fit-content!important;min-width:0!important;max-width:calc(100% - 64px)!important;max-height:min(48vh,330px)!important;margin:0!important;padding:6px!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:16px!important;overflow:hidden!important;visibility:hidden!important;opacity:0!important;background:radial-gradient(circle at 88% -12%,rgba(137,91,255,.22),transparent 46%),linear-gradient(180deg,rgba(21,21,36,.97),rgba(7,8,15,.985))!important;box-shadow:0 22px 68px rgba(0,0,0,.64),0 0 0 1px rgba(145,104,255,.035),inset 0 1px 0 rgba(255,255,255,.085)!important;-webkit-backdrop-filter:blur(24px) saturate(1.25)!important;backdrop-filter:blur(24px) saturate(1.25)!important;transform:translateY(8px) scale(.98)!important;transform-origin:right bottom!important;pointer-events:none!important;transition:opacity .15s ease,transform .2s cubic-bezier(.22,1,.36,1),visibility 0s linear .2s!important}`,
    "floating tray shell",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyUiMenu:not([hidden]){visibility:visible!important;opacity:1!important;transform:none!important;pointer-events:auto!important;transition-delay:0s!important}`,
    `body.swifly-command-settings .swiflyUiMenu:not([hidden]){visibility:visible!important;opacity:1!important;transform:none!important;pointer-events:auto!important;transition-delay:0s!important}body.swifly-command-settings .swiflyUiMenu.swiflyTrayDetail{width:min(690px,calc(100% - 64px))!important}`,
    "detail tray width",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflySettingsList{display:flex!important;width:max-content!important;max-width:100%!important;align-items:center!important;justify-content:flex-end!important;gap:2px!important;margin:0!important;padding:0!important;border:0!important;border-radius:10px!important;overflow-x:auto!important;overflow-y:hidden!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}`,
    `body.swifly-command-settings .swiflySettingsList{display:flex!important;width:max-content!important;max-width:100%!important;align-items:center!important;justify-content:flex-start!important;gap:4px!important;margin:0!important;padding:0!important;border:0!important;border-radius:11px!important;overflow-x:auto!important;overflow-y:hidden!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}`,
    "home setting alignment",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;width:auto!important;min-width:98px!important;max-width:152px!important;min-height:31px!important;padding:0 9px!important;border:0!important;border-radius:9px!important;background:transparent!important;box-shadow:none!important;display:grid!important;grid-template-columns:14px minmax(max-content,1fr) auto!important;align-items:center!important;gap:6px!important;color:#fff!important;text-align:left!important;opacity:0;transform:translateY(4px);animation:swiflyCommandItemIn .17s cubic-bezier(.22,1,.36,1) forwards;transition:background .13s ease,color .13s ease,transform .13s ease,opacity .13s ease!important}`,
    `body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;width:auto!important;min-width:108px!important;max-width:168px!important;min-height:34px!important;padding:0 10px!important;border:1px solid transparent!important;border-radius:10px!important;background:rgba(255,255,255,.012)!important;box-shadow:none!important;display:grid!important;grid-template-columns:15px minmax(max-content,1fr) auto!important;align-items:center!important;gap:7px!important;color:#fff!important;text-align:left!important;opacity:0;transform:translateY(4px);animation:swiflyCommandItemIn .17s cubic-bezier(.22,1,.36,1) forwards;transition:background .13s ease,border-color .13s ease,color .13s ease,transform .13s ease,opacity .13s ease!important}`,
    "home setting rows",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflySettingRow:hover,body.swifly-command-settings .swiflySettingRow:focus-visible{background:linear-gradient(135deg,rgba(255,79,154,.08),rgba(124,92,255,.12))!important;transform:translateY(-1px)!important;outline:none!important}`,
    `body.swifly-command-settings .swiflySettingRow:hover,body.swifly-command-settings .swiflySettingRow:focus-visible{border-color:rgba(186,145,255,.14)!important;background:linear-gradient(135deg,rgba(255,79,154,.09),rgba(124,92,255,.14))!important;transform:translateY(-1px)!important;outline:none!important}`,
    "home setting hover",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflySettingsDetail{max-width:min(700px,calc(100vw - 86px))!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;padding:0!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}`,
    `body.swifly-command-settings .swiflySettingsDetail{width:100%!important;max-width:min(690px,calc(100vw - 86px))!important;min-width:0!important;align-items:center!important;justify-content:flex-start!important;gap:6px!important;padding:0!important;border:0!important;border-radius:11px!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}`,
    "detail setting layout",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}`,
    `body.swifly-command-settings .swiflySettingsChoices{display:flex!important;flex:1 1 auto!important;min-width:0!important;width:100%!important;align-items:center!important;justify-content:flex-start!important;gap:4px!important;margin:0!important;padding:2px!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;scroll-behavior:smooth!important;scroll-snap-type:x proximity!important;scrollbar-width:none!important}`,
    "choice strip alignment",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyChoice{flex:0 0 auto!important;min-width:62px!important;min-height:30px!important;padding:0 10px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:rgba(255,255,255,.68)!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;opacity:0;transform:translateX(6px);animation:swiflyChoiceIn .17s cubic-bezier(.22,1,.36,1) forwards}`,
    `body.swifly-command-settings .swiflyChoice{flex:0 0 auto!important;min-width:56px!important;min-height:32px!important;padding:0 10px!important;border:1px solid transparent!important;border-radius:9px!important;background:rgba(255,255,255,.012)!important;color:rgba(255,255,255,.72)!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;scroll-snap-align:start!important;opacity:0;transform:translateX(6px);animation:swiflyChoiceIn .17s cubic-bezier(.22,1,.36,1) forwards}`,
    "choice buttons",
  );

  next = replaceRequired(
    next,
    `body.swifly-command-settings .swiflyChoice.selected{background:linear-gradient(135deg,rgba(255,79,154,.13),rgba(124,92,255,.18))!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(188,146,255,.14)!important}`,
    `body.swifly-command-settings .swiflyChoice.selected{border-color:rgba(199,163,255,.2)!important;background:linear-gradient(135deg,rgba(255,79,154,.16),rgba(124,92,255,.23))!important;color:#fff!important;box-shadow:0 5px 16px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.07)!important}`,
    "selected choice treatment",
  );

  new vm.Script(next, { filename: settingsCinemaPath });

  const upgrade = next.match(/const cinemaUpgrade = String\.raw`([\s\S]*?)`;\n/);
  if (!upgrade) {
    throw new Error("[swifly-settings-polished] Could not extract generated cinema settings code.");
  }
  new vm.Script(upgrade[1], { filename: "swifly-generated-cinema-settings.js" });

  return next;
}

function installPatch() {
  fs.readFileSync = function swiflySettingsPolishedRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== settingsCinemaPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchSettingsCinema(source);
    console.log("[swifly-settings-polished] Cleaner tray and fully visible option strip injected.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { installPatch, patchSettingsCinema };

if (require.main === module) {
  installPatch();
  require("./start-cinepro-source-speed-scope-safe.js");
}
