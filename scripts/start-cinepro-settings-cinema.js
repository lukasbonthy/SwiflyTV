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
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{width:min(344px,calc(100vw - 24px));border-radius:17px;border-color:rgba(255,255,255,.11);background:radial-gradient(circle at 84% -20%,rgba(126,88,255,.13),transparent 43%),linear-gradient(180deg,rgba(18,19,30,.95),rgba(7,8,14,.98));box-shadow:0 24px 72px rgba(0,0,0,.68),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(24px) saturate(1.22)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHome,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsDetail{padding:10px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeader,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{min-height:40px;padding:2px 3px 9px;border-bottom:1px solid rgba(255,255,255,.06)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading{gap:0}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsMark{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading strong,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader strong{font-size:13.5px;font-weight:800;letter-spacing:-.01em}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading small,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack{width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:rgba(255,255,255,.56);box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.07);color:#fff;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsList{display:block;margin-top:8px;overflow:hidden;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.018)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{min-height:50px;padding:0 11px;border:0;border-radius:0;background:transparent;box-shadow:none;grid-template-columns:24px minmax(0,1fr) minmax(82px,auto);gap:9px;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow+.swiflySettingRow{border-top:1px solid rgba(255,255,255,.055)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.055),rgba(126,88,255,.075));box-shadow:none;transform:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingIcon{width:24px;height:24px;border:0;border-radius:0;background:transparent;box-shadow:none;color:rgba(219,207,255,.8);font-size:11px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy strong{font-size:11.5px;font-weight:760;letter-spacing:0}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta{gap:7px;color:rgba(255,255,255,.28)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:142px;padding:0;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.56);font-size:10.5px;font-weight:650;box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{font-size:8px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{gap:8px;justify-content:flex-start}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsChoices{display:block;margin-top:8px;overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.018);padding:0;max-height:min(330px,55vh)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice{min-height:44px;padding:0 11px;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.7);box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice+.swiflyChoice{border-top:1px solid rgba(255,255,255,.055)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.055),rgba(126,88,255,.075));color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.075),rgba(126,88,255,.1));box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceText{font-size:11px;font-weight:690}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceCheck{width:20px;height:20px;color:transparent;background:transparent;box-shadow:none;font-size:9px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#d7c7ff;background:transparent;box-shadow:none}",
              "@media(max-width:720px){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{width:calc(100vw - 12px)}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{grid-template-columns:24px minmax(0,1fr) minmax(72px,auto)}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:110px}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Minimal cinema settings sheet mounted.");
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

  console.log("[swifly-cinema-settings] Minimal settings sheet injected above the working Aurora player.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
