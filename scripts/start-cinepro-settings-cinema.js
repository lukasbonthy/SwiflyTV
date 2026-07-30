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
          if (!ui || !menu || !media || ui.dataset.swiflyCinemaSettings === "true") return;
          ui.dataset.swiflyCinemaSettings = "true";
          document.body.classList.add("swifly-cinema-settings");

          var heading = menu.querySelector(".swiflySettingsHeading strong");
          var headingSub = menu.querySelector(".swiflySettingsHeading small");
          var detailSub = menu.querySelector(".swiflyDetailHeader small");
          if (heading) heading.textContent = "Playback";
          if (headingSub) headingSub.textContent = "";
          if (detailSub) detailSub.textContent = "";

          if (!document.getElementById("swiflyCinemaSettingsStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyCinemaSettingsStyle";
            style.textContent = [
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:max(10px,calc((100vw - 980px)/2 + 46px));bottom:58px;width:min(286px,calc(100vw - 20px));border:1px solid rgba(255,255,255,.085);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(16,16,27,.91),rgba(8,8,15,.96));box-shadow:0 18px 52px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.055),0 0 0 1px rgba(128,92,255,.025);backdrop-filter:blur(18px) saturate(1.16)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHome,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsDetail{padding:7px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeader,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{min-height:32px;padding:0 3px 6px;border-bottom:1px solid rgba(255,255,255,.045)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading{gap:0}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsMark{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading strong,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader strong{font-size:12px;font-weight:780;letter-spacing:0;color:rgba(255,255,255,.88)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading small,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack{width:25px;height:25px;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.45);box-shadow:none;font-size:10px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.055);color:#fff;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsList{display:block;margin-top:5px;overflow:hidden;border:0;border-radius:9px;background:rgba(255,255,255,.012)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{min-height:40px;padding:0 8px;border:0;border-radius:0;background:transparent;box-shadow:none;grid-template-columns:20px minmax(0,1fr) minmax(74px,auto);gap:7px;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow+.swiflySettingRow{border-top:1px solid rgba(255,255,255,.042)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.04),rgba(126,88,255,.055));box-shadow:none;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingIcon{width:20px;height:20px;border:0;border-radius:0;background:transparent;box-shadow:none;color:rgba(221,211,255,.72);font-size:9.5px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy strong{font-size:10.5px;font-weight:700;letter-spacing:0;color:rgba(255,255,255,.88)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta{gap:5px;color:rgba(255,255,255,.24)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:112px;padding:0;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.5);font-size:9.5px;font-weight:620;box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{font-size:7px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{gap:6px;justify-content:flex-start}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsChoices{display:block;margin-top:5px;overflow:auto;border:0;border-radius:9px;background:rgba(255,255,255,.012);padding:0;max-height:min(252px,48vh)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice{min-height:38px;padding:0 8px;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.64);box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice+.swiflyChoice{border-top:1px solid rgba(255,255,255,.042)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.04),rgba(126,88,255,.055));color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.055),rgba(126,88,255,.075));box-shadow:none;color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceText{font-size:10px;font-weight:650}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceCheck{width:18px;height:18px;color:transparent;background:transparent;box-shadow:none;font-size:8px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#cbb8ff;background:transparent;box-shadow:none}",
              "@media(max-width:720px){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:6px;bottom:57px;width:min(278px,calc(100vw - 12px))}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{grid-template-columns:20px minmax(0,1fr) minmax(66px,auto)}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:96px}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Compact docked cinema settings mounted.");
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

  console.log("[swifly-cinema-settings] Compact settings popover injected above the working Aurora player.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
