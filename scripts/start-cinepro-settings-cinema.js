"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-cinema-settings] Could not find ${label}; source was not modified.`);
  }
  return source.replace(needle, replacement);
}

const cinemaUpgrade = String.raw`
        function mountSwiflyCinemaSettings(media) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          var menu = ui && ui.querySelector(".swiflyUiMenu");
          var bottom = ui && ui.querySelector(".swiflyUiBottom");
          var row = bottom && bottom.querySelector(".swiflyUiRow");
          if (!ui || !menu || !bottom || !row || !media || ui.dataset.swiflyCinemaSettings === "true") return;

          ui.dataset.swiflyCinemaSettings = "true";
          document.body.classList.add("swifly-tray-settings");
          menu.classList.add("swiflySettingsTray");
          menu.setAttribute("aria-label", "Playback settings");

          if (menu.parentNode !== bottom) bottom.insertBefore(menu, row);

          function syncTrayState() {
            bottom.classList.toggle("swiflyTrayOpen", !menu.hidden);
          }

          try {
            var menuObserver = new MutationObserver(syncTrayState);
            menuObserver.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
          } catch {}

          syncTrayState();

          if (!document.getElementById("swiflyCinemaSettingsStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyCinemaSettingsStyle";
            style.textContent = [
              "body.swifly-tray-settings .swiflyUiBottom{overflow:visible;display:flex;flex-direction:column;padding:34px 10px 8px;transition:padding .18s ease,border-color .18s ease,box-shadow .18s ease}",
              "body.swifly-tray-settings .swiflyUiProgress{left:10px;right:10px;top:11px;width:calc(100% - 20px)}",
              "body.swifly-tray-settings .swiflyUiRow{width:100%;min-height:40px;flex:0 0 auto}",
              "body.swifly-tray-settings .swiflyUiMenu{position:relative!important;inset:auto!important;right:auto!important;bottom:auto!important;width:100%!important;max-width:none!important;margin:0 0 5px;padding:0!important;border:0!important;border-radius:0!important;overflow:visible!important;background:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transform:none!important;transform-origin:center bottom;pointer-events:auto}",
              "body.swifly-tray-settings .swiflyUiMenu[hidden]{display:none!important}",
              "body.swifly-tray-settings .swiflyUiMenu:not([hidden]){display:block!important;animation:swiflyTrayReveal .18s cubic-bezier(.2,.8,.2,1) both}",
              "body.swifly-tray-settings .swiflyNativeSettings{display:none!important}",
              "body.swifly-tray-settings .swiflySettingsShell{min-height:0!important}",
              "body.swifly-tray-settings .swiflySettingsHome,body.swifly-tray-settings .swiflySettingsDetail{padding:0!important}",
              "body.swifly-tray-settings .swiflySettingsHome>.swiflySettingsHeader{display:none!important}",
              "body.swifly-tray-settings .swiflySettingsMark,body.swifly-tray-settings .swiflySettingsClose{display:none!important}",
              "body.swifly-tray-settings .swiflySettingsList{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:12px!important;overflow:hidden!important;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.01))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important}",
              "body.swifly-tray-settings .swiflySettingRow{width:100%!important;min-height:43px!important;padding:0 10px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;display:grid!important;grid-template-columns:18px minmax(0,1fr) auto!important;align-items:center!important;gap:7px!important;transform:none!important;color:#fff!important;text-align:left!important;transition:background .14s ease,color .14s ease!important}",
              "body.swifly-tray-settings .swiflySettingRow+.swiflySettingRow{border-left:1px solid rgba(255,255,255,.05)!important}",
              "body.swifly-tray-settings .swiflySettingRow:hover,body.swifly-tray-settings .swiflySettingRow:focus-visible{background:linear-gradient(135deg,rgba(255,79,154,.055),rgba(124,92,255,.08))!important;outline:none!important}",
              "body.swifly-tray-settings .swiflySettingRow.isDisabled{opacity:.38!important;cursor:not-allowed!important}",
              "body.swifly-tray-settings .swiflySettingIcon{width:18px!important;height:18px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:rgba(223,214,255,.72)!important;font-size:9px!important}",
              "body.swifly-tray-settings .swiflySettingCopy{min-width:0!important}",
              "body.swifly-tray-settings .swiflySettingCopy strong{display:block!important;color:rgba(255,255,255,.88)!important;font-size:10px!important;font-weight:700!important;letter-spacing:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",
              "body.swifly-tray-settings .swiflySettingCopy small{display:none!important}",
              "body.swifly-tray-settings .swiflySettingMeta{min-width:0!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:5px!important;color:rgba(255,255,255,.27)!important}",
              "body.swifly-tray-settings .swiflySettingValue{max-width:92px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:rgba(255,255,255,.52)!important;font-size:9px!important;font-weight:620!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;box-shadow:none!important}",
              "body.swifly-tray-settings .swiflySettingMeta>i{font-size:7px!important;transition:transform .14s ease,color .14s ease!important}",
              "body.swifly-tray-settings .swiflySettingRow:hover .swiflySettingMeta>i{transform:translateX(2px)!important;color:rgba(218,204,255,.75)!important}",
              "body.swifly-tray-settings .swiflySettingsDetail{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:center!important;gap:6px!important}",
              "body.swifly-tray-settings .swiflySettingsDetail[hidden]{display:none!important}",
              "body.swifly-tray-settings .swiflyDetailHeader{min-height:43px!important;padding:0 9px!important;border:1px solid rgba(255,255,255,.06)!important;border-radius:11px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:7px!important;background:rgba(255,255,255,.018)!important}",
              "body.swifly-tray-settings .swiflyDetailHeader strong{font-size:10px!important;font-weight:700!important;color:rgba(255,255,255,.88)!important;white-space:nowrap!important}",
              "body.swifly-tray-settings .swiflyDetailHeader small{display:none!important}",
              "body.swifly-tray-settings .swiflyDetailBack{width:25px!important;height:25px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:rgba(255,255,255,.48)!important;box-shadow:none!important;font-size:9px!important}",
              "body.swifly-tray-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.07)!important;color:#fff!important}",
              "body.swifly-tray-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;gap:4px!important;margin:0!important;padding:0!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}",
              "body.swifly-tray-settings .swiflySettingsChoices::-webkit-scrollbar{display:none!important}",
              "body.swifly-tray-settings .swiflyChoice{flex:0 0 auto!important;min-width:78px!important;min-height:43px!important;padding:0 11px!important;border:1px solid rgba(255,255,255,.055)!important;border-radius:11px!important;background:rgba(255,255,255,.018)!important;color:rgba(255,255,255,.64)!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;transition:background .14s ease,border-color .14s ease,color .14s ease!important}",
              "body.swifly-tray-settings .swiflyChoice+.swiflyChoice{margin:0!important}",
              "body.swifly-tray-settings .swiflyChoice:hover,body.swifly-tray-settings .swiflyChoice:focus-visible{border-color:rgba(255,255,255,.1)!important;background:rgba(255,255,255,.06)!important;color:#fff!important;outline:none!important}",
              "body.swifly-tray-settings .swiflyChoice.selected{border-color:rgba(172,123,255,.22)!important;background:linear-gradient(135deg,rgba(255,79,154,.075),rgba(124,92,255,.11))!important;color:#fff!important}",
              "body.swifly-tray-settings .swiflyChoiceText{font-size:9.5px!important;font-weight:650!important;white-space:nowrap!important}",
              "body.swifly-tray-settings .swiflyChoiceCheck{width:16px!important;height:16px!important;color:transparent!important;background:transparent!important;box-shadow:none!important;font-size:7px!important}",
              "body.swifly-tray-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#d9caff!important}",
              "body.swifly-tray-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.11)!important;box-shadow:0 22px 72px rgba(0,0,0,.44),0 0 26px rgba(126,88,255,.045),inset 0 1px 0 rgba(255,255,255,.07)!important}",
              "body.swifly-tray-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#f1ebff!important;background:linear-gradient(145deg,rgba(255,79,154,.1),rgba(124,92,255,.15))!important;box-shadow:0 0 0 1px rgba(190,139,255,.1),0 0 18px rgba(126,88,255,.08)!important}",
              "@keyframes swiflyTrayReveal{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}",
              "@media(max-width:760px){body.swifly-tray-settings .swiflySettingsList{grid-template-columns:none!important;grid-auto-flow:column!important;grid-auto-columns:minmax(128px,1fr)!important;overflow-x:auto!important;scrollbar-width:none!important}body.swifly-tray-settings .swiflySettingsList::-webkit-scrollbar{display:none!important}body.swifly-tray-settings .swiflySettingRow+.swiflySettingRow{border-left:1px solid rgba(255,255,255,.05)!important}body.swifly-tray-settings .swiflySettingsDetail{grid-template-columns:auto minmax(0,1fr)!important}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-tray-settings .swiflyUiMenu:not([hidden]){animation:none!important}body.swifly-tray-settings .swiflySettingMeta>i{transition:none!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Integrated horizontal settings tray mounted inside the control deck.");
        }

`;

fs.readFileSync = function swiflyCinemaSettingsRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== themePath) return result;

  patched = true;
  fs.readFileSync = originalReadFileSync;

  let source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  source = source.replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    "const themeUpgrade = String.raw`\n",
    `const themeUpgrade = String.raw\`\n${cinemaUpgrade}`,
    "theme upgrade insertion point",
  );

  source = replaceRequired(
    source,
    "`mountSwiflyUnifiedTheme(media);\\n          $1`",
    "`mountSwiflyUnifiedTheme(media);\\n          mountSwiflyCinemaSettings(media);\\n          $1`",
    "theme mount replacement",
  );

  console.log("[swifly-cinema-settings] Horizontal settings tray injected into the working Aurora control deck.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
