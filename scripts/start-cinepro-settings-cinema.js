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
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:max(10px,calc((100vw - 980px)/2 + 44px));bottom:54px;width:min(286px,calc(100vw - 20px));position:absolute;isolation:isolate;overflow:visible;border:1px solid rgba(255,255,255,.095);border-bottom-color:rgba(255,255,255,.055);border-radius:14px 14px 10px 10px;background:radial-gradient(circle at 16% -12%,rgba(255,78,157,.09),transparent 42%),radial-gradient(circle at 95% 0,rgba(126,88,255,.13),transparent 44%),linear-gradient(180deg,rgba(19,21,33,.46),rgba(6,8,15,.73));box-shadow:0 -10px 36px rgba(0,0,0,.27),0 8px 24px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.075);-webkit-backdrop-filter:blur(24px) saturate(1.25);backdrop-filter:blur(24px) saturate(1.25);animation:swiflyCinemaDockIn .17s cubic-bezier(.2,.8,.2,1) both}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu::before{content:'';position:absolute;z-index:-1;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.04),transparent 28%,transparent 68%,rgba(149,105,255,.035))}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu::after{content:'';position:absolute;right:17px;bottom:-14px;width:46px;height:15px;pointer-events:none;border-left:1px solid rgba(255,255,255,.075);border-right:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg,rgba(8,9,16,.72),rgba(8,9,16,.58));-webkit-backdrop-filter:blur(24px) saturate(1.25);backdrop-filter:blur(24px) saturate(1.25);box-shadow:8px 8px 20px rgba(0,0,0,.12)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsShell{position:relative;z-index:1;overflow:hidden;border-radius:inherit}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHome,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsDetail{padding:7px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeader,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{min-height:28px;padding:0 3px 5px;border-bottom:1px solid rgba(255,255,255,.045)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading{gap:0}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsMark{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading strong,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader strong{font-size:11.5px;font-weight:760;letter-spacing:0;color:rgba(255,255,255,.88);text-shadow:0 1px 10px rgba(0,0,0,.25)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsHeading small,body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsClose{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack{width:24px;height:24px;border:0;border-radius:7px;background:transparent;color:rgba(255,255,255,.46);box-shadow:none;font-size:9px;transition:background .15s ease,color .15s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailBack:hover{background:rgba(255,255,255,.06);color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsList{display:block;margin-top:4px;overflow:hidden;border:0;border-radius:8px;background:rgba(255,255,255,.008)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{min-height:39px;padding:0 8px;border:0;border-radius:0;background:transparent;box-shadow:none;grid-template-columns:20px minmax(0,1fr) minmax(74px,auto);gap:7px;transform:none;transition:background .15s ease,color .15s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow+.swiflySettingRow{border-top:1px solid rgba(255,255,255,.035)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.045),rgba(126,88,255,.065));box-shadow:inset 2px 0 0 rgba(195,125,255,.42);transform:none;outline:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingIcon{width:20px;height:20px;border:0;border-radius:0;background:transparent;box-shadow:none;color:rgba(224,216,255,.74);font-size:9.5px;filter:drop-shadow(0 0 8px rgba(152,108,255,.14))}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy strong{font-size:10.5px;font-weight:690;letter-spacing:0;color:rgba(255,255,255,.88)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingCopy small{display:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta{gap:5px;color:rgba(255,255,255,.26)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:112px;padding:0;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.54);font-size:9.5px;font-weight:620;box-shadow:none;text-shadow:0 1px 8px rgba(0,0,0,.25)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{font-size:7px;transition:transform .15s ease,color .15s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow:hover .swiflySettingMeta>i{transform:translateX(2px);color:rgba(215,199,255,.68)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyDetailHeader{gap:6px;justify-content:flex-start}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflySettingsChoices{display:block;margin-top:4px;overflow:auto;border:0;border-radius:8px;background:rgba(255,255,255,.008);padding:0;max-height:min(252px,48vh)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice{min-height:38px;padding:0 8px;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.66);box-shadow:none;transition:background .15s ease,color .15s ease}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice+.swiflyChoice{border-top:1px solid rgba(255,255,255,.035)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:hover,body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice:focus-visible{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.045),rgba(126,88,255,.065));color:#fff;outline:none}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected{border-color:transparent;background:linear-gradient(90deg,rgba(255,78,157,.06),rgba(126,88,255,.085));box-shadow:inset 2px 0 0 rgba(195,125,255,.48);color:#fff}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceText{font-size:10px;font-weight:640}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoiceCheck{width:18px;height:18px;color:transparent;background:transparent;box-shadow:none;font-size:8px}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyChoice.selected .swiflyChoiceCheck{color:#d7c8ff;background:transparent;box-shadow:0 0 14px rgba(160,116,255,.18)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyPlayerUi.menuOpen .swiflyUiBottom{border-color:rgba(255,255,255,.11);box-shadow:0 22px 72px rgba(0,0,0,.42),0 0 26px rgba(126,88,255,.045),inset 0 1px 0 rgba(255,255,255,.065)}",
              "body.swifly-unified-theme.swifly-cinema-settings .swiflyPlayerUi.menuOpen [data-a=settings]{color:#eee7ff;background:linear-gradient(145deg,rgba(255,78,157,.11),rgba(126,88,255,.16));box-shadow:0 0 0 1px rgba(195,125,255,.12),0 0 20px rgba(126,88,255,.09)}",
              "@keyframes swiflyCinemaDockIn{from{opacity:0;transform:translateY(5px) scale(.992)}to{opacity:1;transform:none}}",
              "@media(max-width:720px){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{right:6px;bottom:53px;width:min(278px,calc(100vw - 12px))}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingRow{grid-template-columns:20px minmax(0,1fr) minmax(66px,auto)}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingValue{max-width:96px}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-unified-theme.swifly-cinema-settings .swiflyUiMenu{animation:none}body.swifly-unified-theme.swifly-cinema-settings .swiflySettingMeta>i{transition:none}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-cinema-settings] Docked settings extension mounted into the control deck.");
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

  console.log("[swifly-cinema-settings] Docked settings extension injected above the working Aurora player.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-theme-unified.js");