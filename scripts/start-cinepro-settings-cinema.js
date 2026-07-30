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
          document.body.classList.add("swifly-chip-settings");
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
              "body.swifly-chip-settings .swiflyUiBottom{overflow:visible;display:flex;flex-direction:column;padding:34px 10px 8px;transition:padding .18s ease,border-color .18s ease,box-shadow .18s ease}",
              "body.swifly-chip-settings .swiflyUiProgress{left:10px;right:10px;top:11px;width:calc(100% - 20px)}",
              "body.swifly-chip-settings .swiflyUiRow{width:100%;min-height:40px;flex:0 0 auto}",
              "body.swifly-chip-settings .swiflyUiMenu{position:relative!important;inset:auto!important;right:auto!important;bottom:auto!important;align-self:center!important;width:min(820px,100%)!important;max-width:none!important;margin:0 auto 6px!important;padding:0!important;border:0!important;border-radius:0!important;overflow:visible!important;background:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transform:none!important;pointer-events:auto!important}",
              "body.swifly-chip-settings .swiflyUiMenu[hidden]{display:none!important}",
              "body.swifly-chip-settings .swiflyUiMenu:not([hidden]){display:block!important;animation:swiflyChipTrayReveal .18s cubic-bezier(.2,.8,.2,1) both}",
              "body.swifly-chip-settings .swiflyNativeSettings{display:none!important}",
              "body.swifly-chip-settings .swiflySettingsShell{min-height:0!important}",
              "body.swifly-chip-settings .swiflySettingsHome,body.swifly-chip-settings .swiflySettingsDetail{padding:0!important}",
              "body.swifly-chip-settings .swiflySettingsHome>.swiflySettingsHeader{display:none!important}",
              "body.swifly-chip-settings .swiflySettingsMark,body.swifly-chip-settings .swiflySettingsClose{display:none!important}",
              "body.swifly-chip-settings .swiflySettingsList{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;overflow:visible!important;background:transparent!important;box-shadow:none!important}",
              "body.swifly-chip-settings .swiflySettingRow{flex:0 1 182px!important;min-width:132px!important;max-width:196px!important;min-height:38px!important;padding:0 12px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:999px!important;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.014))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;display:grid!important;grid-template-columns:18px minmax(0,1fr) auto!important;align-items:center!important;gap:7px!important;transform:none!important;color:#fff!important;text-align:left!important;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease!important}",
              "body.swifly-chip-settings .swiflySettingRow+.swiflySettingRow{border-left-color:rgba(255,255,255,.07)!important}",
              "body.swifly-chip-settings .swiflySettingRow:hover,body.swifly-chip-settings .swiflySettingRow:focus-visible{border-color:rgba(202,171,255,.18)!important;background:linear-gradient(135deg,rgba(255,79,154,.075),rgba(124,92,255,.105))!important;box-shadow:0 8px 24px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.055)!important;transform:translateY(-1px)!important;outline:none!important}",
              "body.swifly-chip-settings .swiflySettingRow.isDisabled{display:none!important}",
              "body.swifly-chip-settings .swiflySettingIcon{width:18px!important;height:18px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:rgba(224,216,255,.74)!important;font-size:9px!important;filter:drop-shadow(0 0 8px rgba(153,112,255,.14))!important}",
              "body.swifly-chip-settings .swiflySettingCopy{min-width:0!important}",
              "body.swifly-chip-settings .swiflySettingCopy strong{display:block!important;color:rgba(255,255,255,.9)!important;font-size:10px!important;font-weight:710!important;letter-spacing:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",
              "body.swifly-chip-settings .swiflySettingCopy small{display:none!important}",
              "body.swifly-chip-settings .swiflySettingMeta{min-width:0!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:0!important;color:rgba(255,255,255,.28)!important}",
              "body.swifly-chip-settings .swiflySettingValue{max-width:78px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:rgba(255,255,255,.56)!important;font-size:9px!important;font-weight:640!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;box-shadow:none!important}",
              "body.swifly-chip-settings .swiflySettingMeta>i{display:none!important}",
              "body.swifly-chip-settings .swiflySettingsDetail{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important}",
              "body.swifly-chip-settings .swiflySettingsDetail[hidden]{display:none!important}",
              "body.swifly-chip-settings .swiflyDetailHeader{flex:0 0 auto!important;min-height:38px!important;padding:0 10px!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:999px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:6px!important;background:rgba(255,255,255,.02)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important}",
              "body.swifly-chip-settings .swiflyDetailHeader strong{font-size:9.5px!important;font-weight:700!important;color:rgba(255,255,255,.86)!important;white-space:nowrap!important}",
              "body.swifly-chip-settings .swiflyDetailHeader small{display:none!important}",
              "body.swifly-chip-settings .swiflyDetailBack{width:23px!important;height:23px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:rgba(255,255,255,.5)!important;box-shadow:none!important;font-size:8px!important}",
              "body.swifly-chip-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.07)!important;color:#fff!important}",
              "body.swifly-chip-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}",
              "body.swifly-chip-settings .swiflySettingsChoices::-webkit-scrollbar{display:none!important}",
              "body.swifly-chip-settings .swiflyChoice{flex:0 0 auto!important;min-width:72px!important;min-height:38px!important;padding:0 12px!important;border:1px solid rgba(255,255,255,.06)!important;border-radius:999px!important;background:rgba(255,255,255,.018)!important;color:rgba(255,255,255,.64)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease!important}",
              "body.swifly-chip-settings .swiflyChoice+.swiflyChoice{margin:0!important}",
              "body.swifly-chip-settings .swiflyChoice:hover,body.swifly-chip-settings .swiflyChoice:focus-visible{border-color:rgba(255,255,255,.12)!important;background:rgba(255,255,255,.065)!important;color:#fff!important;transform:translateY(-1px)!important;outline:none!important}",
              "body.swifly-chip-settings .swiflyChoice.selected{border-color:rgba(188,146,255,.24)!important;background:linear-gradient(135deg,rgba(255,79,154,.09),rgba(124,92,255,.14))!important;color:#fff!important;box-shadow:0 0 0 1px rgba(188,146,255,.045),0 8px 22px rgba(0,0,0,.12)!important}",
              "body.swifly-chip-settings .swiflyChoiceText{font-size:9.5px!important;font-weight:660!important;white-space:nowrap!important}",
              "body.swifly-chip-settings .swiflyChoiceCheck{width:14px!important;height:14px!important;color:transparent!important;background:transparent!important;box-shadow:none!important;font-size:7px!important}",
              "body.swifly-chip-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#ddcfff!important}",
              "body.swifly-chip-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.115)!important;box-shadow:0 22px 72px rgba(0,0,0,.44),0 0 28px rgba(126,88,255,.045),inset 0 1px 0 rgba(255,255,255,.07)!important}",
              "body.swifly-chip-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#f3edff!important;background:linear-gradient(145deg,rgba(255,79,154,.11),rgba(124,92,255,.16))!important;box-shadow:0 0 0 1px rgba(190,139,255,.11),0 0 18px rgba(126,88,255,.09)!important}",
              "@keyframes swiflyChipTrayReveal{from{opacity:0;transform:translateY(4px) scale(.992)}to{opacity:1;transform:none}}",
              "@media(max-width:760px){body.swifly-chip-settings .swiflyUiMenu{width:100%!important}body.swifly-chip-settings .swiflySettingsList{justify-content:flex-start!important;overflow-x:auto!important;scrollbar-width:none!important}body.swifly-chip-settings .swiflySettingsList::-webkit-scrollbar{display:none!important}body.swifly-chip-settings .swiflySettingRow{flex:0 0 148px!important;min-width:148px!important}body.swifly-chip-settings .swiflySettingsDetail{justify-content:flex-start!important;overflow:hidden!important}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-chip-settings .swiflyUiMenu:not([hidden]){animation:none!important}body.swifly-chip-settings .swiflySettingRow,body.swifly-chip-settings .swiflyChoice{transition:none!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Compact streaming settings chips mounted inside the control deck.");
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

  console.log("[swifly-cinema-settings] Compact streaming settings chips injected into the working Aurora control deck.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
