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
          if (menu) {
            menu.classList.add("swiflyUiMenuGrid");

            var heading = menu.querySelector("h3");
            if (heading) {
              heading.innerHTML = "<span>Playback</span><small>Stream, sound and captions</small>";
            }

            var fields = Array.from(menu.querySelectorAll(".swiflyUiField"));
            var fieldByKey = {};
            fields.forEach(function(field) {
              var select = field.querySelector("select");
              var key = select ? String(select.getAttribute("data-s") || "") : "";
              if (key) {
                field.dataset.option = key;
                fieldByKey[key] = field;
                select.title = select.getAttribute("aria-label") || "Choose " + key;
              }
            });
            ["quality", "audio", "speed", "cc"].forEach(function(key) {
              if (fieldByKey[key]) menu.appendChild(fieldByKey[key]);
            });
          }

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
              "body.swifly-unified-theme .swiflyUiMenu{right:max(11px,calc((100vw - 980px)/2));bottom:66px;width:min(500px,calc(100vw - 22px));padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:radial-gradient(circle at 14% 0,rgba(255,79,154,.1),transparent 34%),radial-gradient(circle at 90% 4%,rgba(124,92,255,.13),transparent 38%),linear-gradient(180deg,rgba(20,21,35,.91),rgba(7,8,16,.97));box-shadow:0 26px 82px rgba(0,0,0,.68),0 0 0 1px rgba(124,92,255,.04),inset 0 1px 0 rgba(255,255,255,.075);backdrop-filter:blur(26px) saturate(1.3);transform-origin:bottom right}",
              "body.swifly-unified-theme .swiflyUiMenu[hidden]{display:none}",
              "body.swifly-unified-theme .swiflyUiMenu:not([hidden]){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;animation:swiflyOptionsIn .17s ease both}",
              "body.swifly-unified-theme .swiflyUiMenu h3{grid-column:1/-1;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:1px 3px 4px;color:rgba(255,255,255,.94);font-size:13px;font-weight:880;letter-spacing:-.005em}",
              "body.swifly-unified-theme .swiflyUiMenu h3 small{color:rgba(255,255,255,.4);font-size:9px;font-weight:700;letter-spacing:.02em}",
              "body.swifly-unified-theme .swiflyUiField{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:auto auto;align-items:center;column-gap:9px;row-gap:3px;min-width:0;min-height:66px;margin:0;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:linear-gradient(145deg,rgba(255,79,154,.035),rgba(124,92,255,.05) 58%,rgba(255,255,255,.02));color:rgba(255,255,255,.58);font-size:10px;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}",
              "body.swifly-unified-theme .swiflyUiField:hover,body.swifly-unified-theme .swiflyUiField:focus-within{border-color:rgba(174,112,255,.3);background:linear-gradient(145deg,rgba(255,79,154,.07),rgba(124,92,255,.1) 58%,rgba(255,255,255,.028));box-shadow:0 12px 30px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.05);transform:translateY(-1px)}",
              "body.swifly-unified-theme .swiflyCompactIcon{grid-row:1/3;width:34px;height:34px;border-color:rgba(255,255,255,.09);border-radius:10px;color:#f1edff;background:linear-gradient(145deg,rgba(255,79,154,.16),rgba(124,92,255,.22));box-shadow:0 8px 22px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.07);font-size:12px}",
              "body.swifly-unified-theme .swiflyUiField>span:not(.swiflyCompactIcon){grid-column:2;grid-row:1;color:rgba(255,255,255,.58);font-weight:800;letter-spacing:.02em;line-height:1}",
              "body.swifly-unified-theme .swiflyUiField select{grid-column:2;grid-row:2;width:100%;min-width:0;max-width:100%;height:28px;padding:0 25px 0 0;border:0;border-radius:0;color:#fff;color-scheme:dark;background:transparent;box-shadow:none;font-size:11px;font-weight:790;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;outline:none;appearance:auto;cursor:pointer}",
              "body.swifly-unified-theme .swiflyUiField select:hover{filter:brightness(1.12)}",
              "body.swifly-unified-theme .swiflyUiField select:focus{filter:brightness(1.16)}",
              "body.swifly-unified-theme .swiflyUiField select option{color:#fff;background:#11131f}",
              "body.swifly-unified-theme .swiflyUiField select:disabled{opacity:.45;filter:saturate(.45);cursor:not-allowed}",
              "body.swifly-unified-theme .swiflyUiField[data-option=quality]{background:linear-gradient(145deg,rgba(124,92,255,.075),rgba(255,255,255,.018))}",
              "body.swifly-unified-theme .swiflyUiField[data-option=audio]{background:linear-gradient(145deg,rgba(255,79,154,.06),rgba(255,255,255,.018))}",
              "body.swifly-unified-theme .swiflyUiCc.unavailable{opacity:.32;filter:saturate(.35)}",
              "@keyframes swiflyOptionsIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}",
              "@media(max-width:720px){body.swifly-unified-theme .swiflyUiMenu{right:5px;bottom:60px;width:calc(100vw - 10px);padding:9px;border-radius:16px}body.swifly-unified-theme .swiflyUiMenu:not([hidden]){grid-template-columns:1fr;gap:6px}body.swifly-unified-theme .swiflyUiMenu h3 small{display:none}body.swifly-unified-theme .swiflyUiField{min-height:58px;padding:7px 8px}body.swifly-unified-theme .swiflyCompactIcon{width:32px;height:32px}}"
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

          document.addEventListener("keydown", function(event) {
            if (event.key === "Escape" && menu && !menu.hidden) {
              menu.hidden = true;
              ui.classList.remove("menuOpen");
              if (!media.paused) ui.classList.remove("show");
            }
          });

          console.log("[swifly-theme] Wide playback grid and clean control fade mounted.");
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

console.log("[swifly-theme] Wide Aurora playback grid and clean control fading enabled.");
require("./start-cinepro-languages-hotfix.js");
