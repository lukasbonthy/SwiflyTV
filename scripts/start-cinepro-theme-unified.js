"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-theme] Could not find ${label}; source was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const themeUpgrade = String.raw`
        function mountSwiflyUnifiedTheme(media) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media || ui.dataset.swiflyUnifiedTheme === "true") return;
          ui.dataset.swiflyUnifiedTheme = "true";
          document.body.classList.add("swifly-unified-theme");

          var menu = ui.querySelector(".swiflyUiMenu");

          if (!document.getElementById("swiflyUnifiedThemeStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyUnifiedThemeStyle";
            style.textContent = [
              "body.swifly-unified-theme .swiflyPlayerUi{opacity:1!important}",
              "body.swifly-unified-theme .swiflyUiTop,body.swifly-unified-theme .swiflyUiBottom,body.swifly-unified-theme .swiflyUiMenu{transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s linear 0s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiTop{opacity:0;visibility:hidden;transform:translateY(-10px);pointer-events:none;transition-delay:0s,0s,.2s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiBottom{opacity:0;visibility:hidden;transform:translate(-50%,14px);pointer-events:none;transition-delay:0s,0s,.2s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiCenter{opacity:0;visibility:hidden;pointer-events:none}",
              "body.swifly-unified-theme .swiflyPlayerUi.menuOpen .swiflyUiTop{opacity:1;visibility:visible;transform:none;pointer-events:auto}",
              "body.swifly-unified-theme .swiflyPlayerUi.menuOpen .swiflyUiBottom{opacity:1;visibility:visible;transform:translateX(-50%);pointer-events:auto}",
              "body.swifly-unified-theme .swiflyUiMenu{right:max(11px,calc((100vw - 980px)/2));bottom:66px;width:min(292px,calc(100vw - 22px));padding:9px;border:1px solid rgba(255,255,255,.1);border-radius:17px;background:radial-gradient(circle at 18% 0,rgba(255,79,154,.09),transparent 34%),radial-gradient(circle at 86% 0,rgba(124,92,255,.12),transparent 36%),linear-gradient(180deg,rgba(20,21,35,.9),rgba(7,8,16,.96));box-shadow:0 24px 72px rgba(0,0,0,.64),0 0 0 1px rgba(124,92,255,.035),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(24px) saturate(1.28)}",
              "body.swifly-unified-theme .swiflyUiMenu[hidden]{display:none}",
              "body.swifly-unified-theme .swiflyUiMenu h3{margin:3px 5px 8px;color:rgba(255,255,255,.9);font-size:12px;font-weight:850;letter-spacing:.01em}",
              "body.swifly-unified-theme .swiflyUiField{position:relative;grid-template-columns:28px 62px minmax(0,1fr);min-height:40px;gap:7px;margin-top:4px;padding:4px 5px;border:1px solid rgba(255,255,255,.065);border-radius:12px;background:linear-gradient(135deg,rgba(255,79,154,.032),rgba(124,92,255,.04) 58%,rgba(255,255,255,.018));color:rgba(255,255,255,.57);font-size:10px;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}",
              "body.swifly-unified-theme .swiflyUiField:hover,body.swifly-unified-theme .swiflyUiField:focus-within{border-color:rgba(166,107,255,.28);background:linear-gradient(135deg,rgba(255,79,154,.065),rgba(124,92,255,.085) 58%,rgba(255,255,255,.025));box-shadow:0 10px 28px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.045);transform:translateY(-1px)}",
              "body.swifly-unified-theme .swiflyCompactIcon{width:28px;height:28px;border-color:rgba(255,255,255,.085);color:#efeaff;background:linear-gradient(145deg,rgba(255,79,154,.14),rgba(124,92,255,.2));box-shadow:0 7px 20px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.06)}",
              "body.swifly-unified-theme .swiflyUiField>span:not(.swiflyCompactIcon){color:rgba(255,255,255,.62);font-weight:790;letter-spacing:.015em}",
              "body.swifly-unified-theme .swiflyUiField select{width:100%;height:31px;padding:0 26px 0 10px;border:1px solid rgba(255,255,255,.09);border-radius:9px;color:#fff;color-scheme:dark;background:linear-gradient(135deg,rgba(255,79,154,.065),rgba(124,92,255,.105)),rgba(8,10,18,.88);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);font-size:10.5px;font-weight:760;appearance:auto;outline:none;transition:border-color .15s ease,box-shadow .15s ease,filter .15s ease}",
              "body.swifly-unified-theme .swiflyUiField select:hover{border-color:rgba(255,116,172,.25);filter:brightness(1.08)}",
              "body.swifly-unified-theme .swiflyUiField select:focus{border-color:rgba(180,119,255,.72);box-shadow:0 0 0 3px rgba(124,92,255,.15),inset 0 1px 0 rgba(255,255,255,.04)}",
              "body.swifly-unified-theme .swiflyUiField select option{color:#fff;background:#11131f}",
              "body.swifly-unified-theme .swiflyUiField select:disabled{opacity:.48;filter:saturate(.5);cursor:not-allowed}",
              "body.swifly-unified-theme .swiflyUiCc.unavailable{opacity:.32;filter:saturate(.35)}",
              "@media(max-width:720px){body.swifly-unified-theme .swiflyUiMenu{right:5px;bottom:60px;width:calc(100vw - 10px);padding:7px;border-radius:14px}body.swifly-unified-theme .swiflyUiField{grid-template-columns:28px 58px minmax(0,1fr);min-height:38px}body.swifly-unified-theme .swiflyUiField select{height:30px}}"
            ].join("");
            document.head.appendChild(style);
          }

          playerShell.addEventListener("mouseleave", function() {
            if (!media.paused && menu && menu.hidden) {
              ui.classList.remove("show");
              playerShell.classList.add("swiflyUiIdle");
            }
          });

          media.addEventListener("pause", function() {
            ui.classList.add("show", "paused");
            playerShell.classList.remove("swiflyUiIdle");
          });

          menu && menu.addEventListener("click", function(event) {
            event.stopPropagation();
          });

          console.log("[swifly-theme] Unified Aurora settings and control fade mounted.");
        }

`;

function patchCustomControls(source) {
  source = replaceRequired(
    source,
    /(const injected = String\.raw`\n)/,
    `$1${themeUpgrade}`,
    "custom player injection block",
  );

  source = replaceRequired(
    source,
    /(console\.log\("\[swifly-player\] Custom control interface mounted\."\);)/,
    `mountSwiflyUnifiedTheme(media);\n          $1`,
    "custom player mount log",
  );

  return source;
}

function patchLanguages(source) {
  return replaceRequired(
    source,
    /if \(display && rawFallback && display\.toLowerCase\(\) !== rawFallback\.toLowerCase\(\)\) \{\n\s*return display \+ " · " \+ rawFallback;\n\s*\}/,
    `if (display && rawFallback) {
              var simplified = rawFallback.replace(/\\s*\\[(?:cc|sdh)\\]\\s*$/i, "").trim();
              if (simplified && (simplified.toLowerCase().indexOf(display.toLowerCase()) === 0 || display.toLowerCase().indexOf(simplified.toLowerCase()) === 0)) {
                return rawFallback;
              }
              if (display.toLowerCase() !== rawFallback.toLowerCase()) return display + " · " + rawFallback;
            }`,
    "duplicate language label formatting",
  );
}

fs.readFileSync = function swiflyThemeRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patchedPaths.has(resolved)) return result;

  let patcher = null;
  if (resolved === customControlsPath) patcher = patchCustomControls;
  if (resolved === languagesPath) patcher = patchLanguages;
  if (!patcher) return result;

  patchedPaths.add(resolved);
  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const next = patcher(source.replace(/\r\n?/g, "\n"));
  return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
};

console.log("[swifly-theme] Unified Aurora options and clean control fading enabled.");
require("./start-cinepro-languages-hotfix.js");
