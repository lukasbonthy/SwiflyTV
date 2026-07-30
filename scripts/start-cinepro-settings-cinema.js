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
          var home = menu && menu.querySelector(".swiflySettingsHome");
          var detail = menu && menu.querySelector(".swiflySettingsDetail");
          var settingsButton = ui && ui.querySelector('[data-a="settings"]');
          if (!ui || !menu || !bottom || !row || !media || ui.dataset.swiflyCinemaSettings === "true") return;

          ui.dataset.swiflyCinemaSettings = "true";
          document.body.classList.add("swifly-command-settings");
          menu.classList.add("swiflySettingsCommandStrip");
          menu.setAttribute("aria-label", "Playback settings");

          if (menu.parentNode !== bottom) bottom.insertBefore(menu, row);

          function syncTrayState() {
            var open = !menu.hidden;
            var detailOpen = !!(detail && !detail.hidden);
            bottom.classList.toggle("swiflyTrayOpen", open);
            menu.classList.toggle("swiflyTrayVisible", open);
            menu.classList.toggle("swiflyTrayDetail", detailOpen);
            menu.dataset.view = detailOpen ? "detail" : "home";
            if (settingsButton) settingsButton.setAttribute("aria-expanded", open ? "true" : "false");
          }

          try {
            var stateObserver = new MutationObserver(syncTrayState);
            stateObserver.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
            if (home) stateObserver.observe(home, { attributes: true, attributeFilter: ["hidden"] });
            if (detail) stateObserver.observe(detail, { attributes: true, attributeFilter: ["hidden"] });
          } catch {}

          syncTrayState();

          if (!document.getElementById("swiflyCinemaSettingsStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyCinemaSettingsStyle";
            style.textContent = [
              "body.swifly-command-settings .swiflyUiBottom{overflow:visible;display:flex;flex-direction:column;padding:24px 9px 7px;transition:padding .2s cubic-bezier(.22,1,.36,1),border-color .18s ease,box-shadow .2s ease,background .2s ease}",
              "body.swifly-command-settings .swiflyUiProgress{left:9px;right:9px;top:10px;width:calc(100% - 18px)}",
              "body.swifly-command-settings .swiflyUiRow{width:100%;min-height:37px;flex:0 0 auto}",
              "body.swifly-command-settings .swiflyUiMenu{display:block!important;position:relative!important;inset:auto!important;align-self:flex-end!important;width:fit-content!important;min-width:0!important;max-width:calc(100% - 58px)!important;max-height:0!important;margin:0 42px 0 auto!important;padding:0!important;border:0!important;border-radius:0!important;overflow:visible!important;visibility:hidden!important;opacity:0!important;background:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transform:translateY(5px) scale(.994)!important;transform-origin:right bottom!important;pointer-events:none!important;transition:max-height .2s cubic-bezier(.22,1,.36,1),margin .2s cubic-bezier(.22,1,.36,1),opacity .12s ease,transform .2s cubic-bezier(.22,1,.36,1),visibility 0s linear .2s!important}",
              "body.swifly-command-settings .swiflyUiMenu:not([hidden]){max-height:44px!important;margin-bottom:2px!important;visibility:visible!important;opacity:1!important;transform:none!important;pointer-events:auto!important;transition-delay:0s!important}",
              "body.swifly-command-settings .swiflyNativeSettings{display:none!important}",
              "body.swifly-command-settings .swiflySettingsShell,body.swifly-command-settings .swiflySettingsHome,body.swifly-command-settings .swiflySettingsDetail{width:fit-content!important;min-width:0!important;max-width:100%!important;padding:0!important}",
              "body.swifly-command-settings .swiflySettingsHome[hidden],body.swifly-command-settings .swiflySettingsDetail[hidden]{display:none!important}",
              "body.swifly-command-settings .swiflySettingsHome:not([hidden]){display:block!important;animation:swiflyCommandHomeIn .16s cubic-bezier(.22,1,.36,1) both}",
              "body.swifly-command-settings .swiflySettingsDetail:not([hidden]){display:flex!important;animation:swiflyCommandDetailIn .16s cubic-bezier(.22,1,.36,1) both}",
              "body.swifly-command-settings .swiflySettingsHome>.swiflySettingsHeader{display:none!important}",
              "body.swifly-command-settings .swiflySettingsMark,body.swifly-command-settings .swiflySettingsClose{display:none!important}",
              "body.swifly-command-settings .swiflySettingsList{display:flex!important;width:max-content!important;max-width:100%!important;align-items:center!important;justify-content:flex-end!important;gap:0!important;margin:0!important;padding:2px 4px 3px!important;border:0!important;border-radius:0!important;overflow-x:auto!important;overflow-y:hidden!important;background:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;scrollbar-width:none!important}",
              "body.swifly-command-settings .swiflySettingsList::-webkit-scrollbar{display:none!important}",
              "body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;width:auto!important;min-width:112px!important;max-width:176px!important;min-height:32px!important;padding:0 10px!important;border:0!important;border-radius:9px!important;background:transparent!important;box-shadow:none!important;display:grid!important;grid-template-columns:15px minmax(max-content,1fr) auto!important;align-items:center!important;gap:6px!important;color:#fff!important;text-align:left!important;opacity:0;transform:translateY(4px);animation:swiflyCommandItemIn .17s cubic-bezier(.22,1,.36,1) forwards;transition:background .13s ease,color .13s ease,transform .13s ease,opacity .13s ease!important}",
              "body.swifly-command-settings .swiflySettingRow+.swiflySettingRow{box-shadow:inset 1px 0 0 rgba(255,255,255,.055)!important}",
              "body.swifly-command-settings .swiflySettingRow:nth-child(1){animation-delay:.01s}body.swifly-command-settings .swiflySettingRow:nth-child(2){animation-delay:.025s}body.swifly-command-settings .swiflySettingRow:nth-child(3){animation-delay:.04s}body.swifly-command-settings .swiflySettingRow:nth-child(4){animation-delay:.055s}",
              "body.swifly-command-settings .swiflySettingRow:hover,body.swifly-command-settings .swiflySettingRow:focus-visible{background:linear-gradient(135deg,rgba(255,79,154,.055),rgba(124,92,255,.085))!important;transform:translateY(-1px)!important;outline:none!important}",
              "body.swifly-command-settings .swiflySettingRow:active{transform:scale(.985)!important}",
              "body.swifly-command-settings .swiflySettingRow.isDisabled{display:grid!important;opacity:.45!important;cursor:not-allowed!important;filter:saturate(.4)!important}",
              "body.swifly-command-settings .swiflySettingRow.isDisabled:hover{background:transparent!important;transform:none!important}",
              "body.swifly-command-settings .swiflySettingIcon{width:15px!important;height:15px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:rgba(224,216,255,.74)!important;font-size:8px!important}",
              "body.swifly-command-settings .swiflySettingCopy{min-width:max-content!important}",
              "body.swifly-command-settings .swiflySettingCopy strong{display:block!important;color:rgba(255,255,255,.93)!important;font-size:9.5px!important;font-weight:730!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}",
              "body.swifly-command-settings .swiflySettingCopy small{display:none!important}",
              "body.swifly-command-settings .swiflySettingMeta{min-width:0!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;color:rgba(255,255,255,.28)!important}",
              "body.swifly-command-settings .swiflySettingValue{max-width:82px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:rgba(255,255,255,.58)!important;font-size:8px!important;font-weight:680!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",
              "body.swifly-command-settings .swiflySettingRow.isDisabled .swiflySettingValue{max-width:74px!important;color:rgba(255,255,255,.5)!important}",
              "body.swifly-command-settings .swiflySettingMeta>i{display:none!important}",
              "body.swifly-command-settings .swiflySettingsDetail{max-width:min(720px,calc(100vw - 100px))!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;padding:2px 4px 3px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}",
              "body.swifly-command-settings .swiflyDetailHeader{flex:0 0 auto!important;min-height:32px!important;padding:0 7px!important;border:0!important;border-radius:9px!important;display:flex!important;align-items:center!important;gap:5px!important;background:transparent!important;box-shadow:none!important}",
              "body.swifly-command-settings .swiflyDetailHeader strong{font-size:9px!important;font-weight:700!important;color:rgba(255,255,255,.8)!important;white-space:nowrap!important}",
              "body.swifly-command-settings .swiflyDetailHeader small{display:none!important}",
              "body.swifly-command-settings .swiflyDetailBack{width:22px!important;height:22px!important;border:0!important;border-radius:7px!important;background:rgba(255,255,255,.035)!important;color:rgba(255,255,255,.58)!important;box-shadow:none!important;font-size:7.5px!important}",
              "body.swifly-command-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}",
              "body.swifly-command-settings .swiflySettingsChoices::-webkit-scrollbar{display:none!important}",
              "body.swifly-command-settings .swiflyChoice{flex:0 0 auto!important;min-width:62px!important;min-height:30px!important;padding:0 10px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:rgba(255,255,255,.64)!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;opacity:0;transform:translateX(6px);animation:swiflyChoiceIn .17s cubic-bezier(.22,1,.36,1) forwards}",
              "body.swifly-command-settings .swiflyChoice:hover,body.swifly-command-settings .swiflyChoice:focus-visible{background:rgba(255,255,255,.065)!important;color:#fff!important;outline:none!important}",
              "body.swifly-command-settings .swiflyChoice.selected{background:linear-gradient(135deg,rgba(255,79,154,.1),rgba(124,92,255,.15))!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(188,146,255,.12)!important}",
              "body.swifly-command-settings .swiflyChoiceText{font-size:8.75px!important;font-weight:670!important;white-space:nowrap!important}",
              "body.swifly-command-settings .swiflyChoiceCheck{width:12px!important;height:12px!important;color:transparent!important;background:transparent!important;font-size:6px!important}",
              "body.swifly-command-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#e0d4ff!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.12)!important;background:radial-gradient(circle at 82% 0,rgba(124,92,255,.065),transparent 34%),radial-gradient(circle at 18% 0,rgba(255,79,154,.04),transparent 32%),linear-gradient(180deg,rgba(19,21,33,.48),rgba(6,8,15,.76))!important;box-shadow:0 22px 72px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.075)!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#f4efff!important;background:linear-gradient(145deg,rgba(255,79,154,.12),rgba(124,92,255,.18))!important;box-shadow:0 0 0 1px rgba(190,139,255,.12),0 0 18px rgba(126,88,255,.09)!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings] i{transform:rotate(90deg)!important;transition:transform .22s cubic-bezier(.22,1,.36,1)!important}",
              "@keyframes swiflyCommandHomeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyCommandDetailIn{from{opacity:0;transform:translateX(7px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyCommandItemIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyChoiceIn{from{opacity:0;transform:translateX(6px)}to{opacity:1;transform:none}}",
              "@media(max-width:760px){body.swifly-command-settings .swiflyUiMenu{align-self:stretch!important;width:100%!important;max-width:100%!important;margin-right:0!important}body.swifly-command-settings .swiflySettingsShell,body.swifly-command-settings .swiflySettingsHome,body.swifly-command-settings .swiflySettingsDetail{width:100%!important}body.swifly-command-settings .swiflySettingsList{width:100%!important;justify-content:flex-start!important}body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;min-width:124px!important;max-width:164px!important}body.swifly-command-settings .swiflySettingsDetail{justify-content:flex-start!important;max-width:100%!important}body.swifly-command-settings .swiflySettingsChoices{justify-content:flex-start!important}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-command-settings .swiflyUiMenu,body.swifly-command-settings .swiflySettingRow,body.swifly-command-settings .swiflyChoice,body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings] i{animation:none!important;transition:none!important;transform:none!important;opacity:1!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Readable fit-content playback tray mounted.");
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

  console.log("[swifly-cinema-settings] Readable fit-content settings tray injected into the working Aurora control deck.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
