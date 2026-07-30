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
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiBottom{z-index:40}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:max(14px,calc((100vw - 1040px)/2));bottom:10px;width:min(300px,calc(100vw - 28px));z-index:30;position:absolute;isolation:isolate;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:radial-gradient(circle at 88% -16%,rgba(126,88,255,.12),transparent 42%),linear-gradient(180deg,rgba(20,22,34,.48),rgba(7,8,15,.72));box-shadow:0 -18px 48px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.065);-webkit-backdrop-filter:blur(24px) saturate(1.22);backdrop-filter:blur(24px) saturate(1.22);transform-origin:bottom right;animation:swiflyControlWingIn .17s cubic-bezier(.2,.8,.2,1) both}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu::before{content:'';position:absolute;z-index:-1;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.035),transparent 34%,transparent 72%,rgba(126,88,255,.03))}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsShell{position:relative;z-index:1;padding-bottom:54px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHome,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsDetail{padding:7px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHome>.swiflySettingsHeader{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsMark,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsList{display:block;margin:0;overflow:hidden;border:0;border-radius:10px;background:rgba(255,255,255,.008)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{min-height:39px;padding:0 9px;border:0;border-radius:8px;background:transparent;box-shadow:none;grid-template-columns:18px minmax(0,1fr) minmax(84px,auto);gap:8px;transform:none;transition:background .14s ease,color .14s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow+.swiflySettingRow{margin-top:1px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:focus-visible{background:rgba(255,255,255,.06);box-shadow:none;transform:none;outline:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingIcon{width:18px;height:18px;border:0;border-radius:0;background:transparent;box-shadow:none;color:rgba(219,211,244,.64);font-size:9px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy strong{font-size:10.5px;font-weight:680;letter-spacing:0;color:rgba(255,255,255,.9)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta{gap:6px;color:rgba(255,255,255,.25)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:128px;padding:0;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.55);font-size:9.5px;font-weight:600;box-shadow:none;text-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{font-size:7px;transition:transform .14s ease,color .14s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover .swiflySettingMeta>i{transform:translateX(2px);color:rgba(255,255,255,.62)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{min-height:34px;padding:0 2px 6px;display:flex;align-items:center;justify-content:flex-start;gap:7px;border-bottom:1px solid rgba(255,255,255,.045)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader strong{font-size:11px;font-weight:720;color:rgba(255,255,255,.9)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack{width:25px;height:25px;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.48);box-shadow:none;font-size:9px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.06);color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsChoices{display:block;margin-top:5px;overflow:auto;border:0;border-radius:9px;background:rgba(255,255,255,.008);padding:0;max-height:min(246px,46vh)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice{min-height:38px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.68);box-shadow:none;transition:background .14s ease,color .14s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice+.swiflyChoice{margin-top:1px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:focus-visible{background:rgba(255,255,255,.06);color:#fff;outline:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected{background:linear-gradient(90deg,rgba(255,78,157,.055),rgba(126,88,255,.08));color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceText{font-size:10px;font-weight:620}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceCheck{width:18px;height:18px;color:transparent;background:transparent;box-shadow:none;font-size:8px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#d7c8ff;background:transparent;box-shadow:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.105);box-shadow:0 22px 72px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.065)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#fff;background:rgba(255,255,255,.08);box-shadow:0 0 0 1px rgba(195,125,255,.11),0 0 18px rgba(126,88,255,.08)}",
              "@keyframes swiflyControlWingIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
              "@media(max-width:720px){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:6px;bottom:8px;width:min(286px,calc(100vw - 12px))}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{grid-template-columns:18px minmax(0,1fr) minmax(72px,auto)}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:106px}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{animation:none}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{transition:none}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Integrated control-deck settings wing mounted.");
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

  console.log("[swifly-cinema-settings] Integrated settings wing injected above the working Aurora player.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");
