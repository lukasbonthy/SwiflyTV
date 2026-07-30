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
              "body.swifly-command-settings .swiflyUiBottom{overflow:visible!important;display:block!important;min-height:62px!important;padding:19px 10px 7px!important;transition:border-color .18s ease,box-shadow .2s ease,background .2s ease!important}",
              "body.swifly-command-settings .swiflyUiProgress{left:10px!important;right:10px!important;top:9px!important;bottom:auto!important;width:calc(100% - 20px)!important}",
              "body.swifly-command-settings .swiflyUiRow{width:100%!important;min-height:36px!important;margin:0!important;flex:0 0 auto!important}",
              "body.swifly-command-settings .swiflyUiMenu{display:block!important;position:absolute!important;inset:auto 46px 53px auto!important;z-index:8!important;width:fit-content!important;min-width:0!important;max-width:calc(100% - 64px)!important;max-height:min(46vh,310px)!important;margin:0!important;padding:4px!important;border:1px solid rgba(255,255,255,.11)!important;border-radius:14px!important;overflow:hidden!important;visibility:hidden!important;opacity:0!important;background:radial-gradient(circle at 85% 0,rgba(126,88,255,.16),transparent 42%),linear-gradient(180deg,rgba(20,20,34,.96),rgba(8,9,17,.97))!important;box-shadow:0 18px 56px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07)!important;-webkit-backdrop-filter:blur(22px) saturate(1.2)!important;backdrop-filter:blur(22px) saturate(1.2)!important;transform:translateY(8px) scale(.98)!important;transform-origin:right bottom!important;pointer-events:none!important;transition:opacity .15s ease,transform .2s cubic-bezier(.22,1,.36,1),visibility 0s linear .2s!important}",
              "body.swifly-command-settings .swiflyUiMenu:not([hidden]){visibility:visible!important;opacity:1!important;transform:none!important;pointer-events:auto!important;transition-delay:0s!important}",
              "body.swifly-command-settings .swiflyNativeSettings{display:none!important}",
              "body.swifly-command-settings .swiflySettingsShell,body.swifly-command-settings .swiflySettingsHome,body.swifly-command-settings .swiflySettingsDetail{width:fit-content!important;min-width:0!important;max-width:100%!important;padding:0!important}",
              "body.swifly-command-settings .swiflySettingsHome[hidden],body.swifly-command-settings .swiflySettingsDetail[hidden]{display:none!important}",
              "body.swifly-command-settings .swiflySettingsHome:not([hidden]){display:block!important;animation:swiflyCommandHomeIn .16s cubic-bezier(.22,1,.36,1) both}",
              "body.swifly-command-settings .swiflySettingsDetail:not([hidden]){display:flex!important;animation:swiflyCommandDetailIn .16s cubic-bezier(.22,1,.36,1) both}",
              "body.swifly-command-settings .swiflySettingsHome>.swiflySettingsHeader{display:none!important}",
              "body.swifly-command-settings .swiflySettingsMark,body.swifly-command-settings .swiflySettingsClose{display:none!important}",
              "body.swifly-command-settings .swiflySettingsList{display:flex!important;width:max-content!important;max-width:100%!important;align-items:center!important;justify-content:flex-end!important;gap:2px!important;margin:0!important;padding:0!important;border:0!important;border-radius:10px!important;overflow-x:auto!important;overflow-y:hidden!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}",
              "body.swifly-command-settings .swiflySettingsList::-webkit-scrollbar{display:none!important}",
              "body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;width:auto!important;min-width:98px!important;max-width:152px!important;min-height:31px!important;padding:0 9px!important;border:0!important;border-radius:9px!important;background:transparent!important;box-shadow:none!important;display:grid!important;grid-template-columns:14px minmax(max-content,1fr) auto!important;align-items:center!important;gap:6px!important;color:#fff!important;text-align:left!important;opacity:0;transform:translateY(4px);animation:swiflyCommandItemIn .17s cubic-bezier(.22,1,.36,1) forwards;transition:background .13s ease,color .13s ease,transform .13s ease,opacity .13s ease!important}",
              "body.swifly-command-settings .swiflySettingRow+.swiflySettingRow{box-shadow:inset 1px 0 0 rgba(255,255,255,.055)!important}",
              "body.swifly-command-settings .swiflySettingRow:nth-child(1){animation-delay:.01s}body.swifly-command-settings .swiflySettingRow:nth-child(2){animation-delay:.025s}body.swifly-command-settings .swiflySettingRow:nth-child(3){animation-delay:.04s}body.swifly-command-settings .swiflySettingRow:nth-child(4){animation-delay:.055s}",
              "body.swifly-command-settings .swiflySettingRow:hover,body.swifly-command-settings .swiflySettingRow:focus-visible{background:linear-gradient(135deg,rgba(255,79,154,.08),rgba(124,92,255,.12))!important;transform:translateY(-1px)!important;outline:none!important}",
              "body.swifly-command-settings .swiflySettingRow:active{transform:scale(.985)!important}",
              "body.swifly-command-settings .swiflySettingRow.isDisabled{display:none!important}",
              "body.swifly-command-settings .swiflySettingIcon{width:14px!important;height:14px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:rgba(224,216,255,.78)!important;font-size:8px!important}",
              "body.swifly-command-settings .swiflySettingCopy{min-width:max-content!important}",
              "body.swifly-command-settings .swiflySettingCopy strong{display:block!important;color:rgba(255,255,255,.94)!important;font-size:9.5px!important;font-weight:760!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}",
              "body.swifly-command-settings .swiflySettingCopy small{display:none!important}",
              "body.swifly-command-settings .swiflySettingMeta{min-width:0!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;color:rgba(255,255,255,.3)!important}",
              "body.swifly-command-settings .swiflySettingValue{max-width:70px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:rgba(255,255,255,.58)!important;font-size:8px!important;font-weight:680!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",
              "body.swifly-command-settings .swiflySettingMeta>i{display:none!important}",
              "body.swifly-command-settings .swiflySettingsDetail{max-width:min(700px,calc(100vw - 86px))!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;padding:0!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}",
              "body.swifly-command-settings .swiflyDetailHeader{flex:0 0 auto!important;min-height:31px!important;padding:0 7px!important;border:0!important;border-radius:9px!important;display:flex!important;align-items:center!important;gap:5px!important;background:transparent!important;box-shadow:none!important}",
              "body.swifly-command-settings .swiflyDetailHeader strong{font-size:9px!important;font-weight:700!important;color:rgba(255,255,255,.82)!important;white-space:nowrap!important}",
              "body.swifly-command-settings .swiflyDetailHeader small{display:none!important}",
              "body.swifly-command-settings .swiflyDetailBack{width:23px!important;height:23px!important;border:0!important;border-radius:7px!important;background:rgba(255,255,255,.045)!important;color:rgba(255,255,255,.66)!important;box-shadow:none!important;font-size:7.5px!important}",
              "body.swifly-command-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}",
              "body.swifly-command-settings .swiflySettingsChoices::-webkit-scrollbar{display:none!important}",
              "body.swifly-command-settings .swiflyChoice{flex:0 0 auto!important;min-width:62px!important;min-height:30px!important;padding:0 10px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:rgba(255,255,255,.68)!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;opacity:0;transform:translateX(6px);animation:swiflyChoiceIn .17s cubic-bezier(.22,1,.36,1) forwards}",
              "body.swifly-command-settings .swiflyChoice:hover,body.swifly-command-settings .swiflyChoice:focus-visible{background:rgba(255,255,255,.07)!important;color:#fff!important;outline:none!important}",
              "body.swifly-command-settings .swiflyChoice.selected{background:linear-gradient(135deg,rgba(255,79,154,.13),rgba(124,92,255,.18))!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(188,146,255,.14)!important}",
              "body.swifly-command-settings .swiflyChoiceText{font-size:8.75px!important;font-weight:690!important;white-space:nowrap!important}",
              "body.swifly-command-settings .swiflyChoiceCheck{width:12px!important;height:12px!important;color:transparent!important;background:transparent!important;font-size:6px!important}",
              "body.swifly-command-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#e0d4ff!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.12)!important;background:linear-gradient(180deg,rgba(18,19,31,.46),rgba(6,7,13,.76))!important;box-shadow:0 18px 56px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.07)!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#f4efff!important;background:linear-gradient(145deg,rgba(255,79,154,.14),rgba(124,92,255,.22))!important;box-shadow:0 0 0 1px rgba(190,139,255,.13),0 0 18px rgba(126,88,255,.1)!important}",
              "body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings] i{transform:rotate(90deg)!important;transition:transform .22s cubic-bezier(.22,1,.36,1)!important}",
              "@keyframes swiflyCommandHomeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyCommandDetailIn{from{opacity:0;transform:translateX(7px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyCommandItemIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
              "@keyframes swiflyChoiceIn{from{opacity:0;transform:translateX(6px)}to{opacity:1;transform:none}}",
              "@media(max-width:760px){body.swifly-command-settings .swiflyUiBottom{min-height:58px!important;padding:18px 7px 5px!important}body.swifly-command-settings .swiflyUiProgress{left:7px!important;right:7px!important;top:8px!important;width:calc(100% - 14px)!important}body.swifly-command-settings .swiflyUiMenu{inset:auto 6px 50px 6px!important;width:auto!important;max-width:none!important}body.swifly-command-settings .swiflySettingsShell,body.swifly-command-settings .swiflySettingsHome,body.swifly-command-settings .swiflySettingsDetail{width:100%!important}body.swifly-command-settings .swiflySettingsList{width:100%!important;justify-content:flex-start!important}body.swifly-command-settings .swiflySettingRow{min-width:104px!important;max-width:148px!important}body.swifly-command-settings .swiflySettingsDetail{justify-content:flex-start!important;max-width:100%!important}body.swifly-command-settings .swiflySettingsChoices{justify-content:flex-start!important}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-command-settings .swiflyUiMenu,body.swifly-command-settings .swiflySettingRow,body.swifly-command-settings .swiflyChoice,body.swifly-command-settings .swiflyPlayerUi.menuOpen [data-a=settings] i{animation:none!important;transition:none!important;transform:none!important;opacity:1!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Compact floating playback tray mounted.");
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

  console.log("[swifly-cinema-settings] Compact floating settings tray injected into the working Aurora control deck.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
