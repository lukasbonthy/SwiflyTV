"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-compact] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const compactUpgrade = String.raw`
        function mountSwiflyCompactOptions(media) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media) return;

          document.body.classList.add("swifly-compact-player");

          var menu = ui.querySelector(".swiflyUiMenu");
          if (menu) {
            var heading = menu.querySelector("h3");
            if (heading) heading.textContent = "Playback";

            Array.from(menu.querySelectorAll(".swiflyUiField")).forEach(function(field) {
              if (field.querySelector(".swiflyCompactIcon")) return;

              var select = field.querySelector("select");
              var key = select ? String(select.getAttribute("data-s") || "") : "";
              var iconClass = "fa-solid fa-sliders";
              if (key === "quality") iconClass = "fa-solid fa-display";
              if (key === "speed") iconClass = "fa-solid fa-gauge-high";
              if (key === "cc") iconClass = "fa-solid fa-closed-captioning";

              var icon = document.createElement("span");
              icon.className = "swiflyCompactIcon";
              var glyph = document.createElement("i");
              glyph.className = iconClass;
              icon.appendChild(glyph);
              field.insertBefore(icon, field.firstChild);
              if (key) field.classList.add("swiflyCompactField-" + key);
            });
          }

          if (!document.getElementById("swiflyCompactPlayerStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyCompactPlayerStyle";
            style.textContent = [
              "body.swifly-compact-player .swiflyUiBottom{bottom:7px;width:min(980px,calc(100% - 22px));padding:31px 10px 7px;border-radius:16px;background:radial-gradient(circle at 15% 0,rgba(255,79,154,.055),transparent 28%),radial-gradient(circle at 85% 0,rgba(124,92,255,.065),transparent 30%),linear-gradient(180deg,rgba(17,19,30,.4),rgba(6,8,15,.74));box-shadow:0 18px 58px rgba(0,0,0,.46),inset 0 1px 0 rgba(255,255,255,.055);backdrop-filter:blur(20px) saturate(1.2)}",
              "body.swifly-compact-player .swiflyUiProgress{left:10px;right:10px;top:9px;width:calc(100% - 20px);height:3px}",
              "body.swifly-compact-player .swiflyUiProgress:hover,body.swifly-compact-player .swiflyUiProgress:focus-visible{height:5px}",
              "body.swifly-compact-player .swiflyUiRow{min-height:36px;gap:0}",
              "body.swifly-compact-player .swiflyUiRow .swiflyUiBtn{width:36px;height:36px;border-radius:10px;font-size:15px}",
              "body.swifly-compact-player .swiflyUiTime{margin-left:5px;font-size:10.5px}",
              "body.swifly-compact-player .swiflyUiVolume{height:3px}",
              "body.swifly-compact-player .swiflyUiMenu{right:max(11px,calc((100vw - 980px)/2));bottom:68px;width:min(276px,calc(100vw - 22px));padding:8px;border-radius:16px;background:linear-gradient(180deg,rgba(18,20,32,.92),rgba(7,9,17,.96));box-shadow:0 24px 72px rgba(0,0,0,.64),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(24px) saturate(1.22);animation:swiflyCompactMenuIn .16s ease both}",
              "body.swifly-compact-player .swiflyUiMenu h3{margin:2px 4px 7px;font-size:12.5px;font-weight:850;letter-spacing:-.006em}",
              "body.swifly-compact-player .swiflyUiField{grid-template-columns:28px 66px 1fr;min-height:42px;align-items:center;gap:7px;margin-top:4px;padding:4px 5px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.018));color:rgba(255,255,255,.6);font-size:10px;transition:border-color .15s ease,background .15s ease,transform .15s ease}",
              "body.swifly-compact-player .swiflyUiField:hover{border-color:rgba(166,107,255,.24);background:linear-gradient(180deg,rgba(124,92,255,.07),rgba(255,255,255,.02));transform:translateY(-1px)}",
              ".swiflyCompactIcon{width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#d9d1ff;background:linear-gradient(145deg,rgba(124,92,255,.18),rgba(255,79,154,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.05);font-size:11px}",
              "body.swifly-compact-player .swiflyUiField>span:not(.swiflyCompactIcon){font-weight:760;letter-spacing:.01em}",
              "body.swifly-compact-player .swiflyUiField select{height:32px;padding:0 9px;border:1px solid rgba(255,255,255,.085);border-radius:9px;color:#fff;background:linear-gradient(180deg,rgba(20,22,34,.96),rgba(10,12,21,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.035);font-size:10.5px;font-weight:720;outline:none;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}",
              "body.swifly-compact-player .swiflyUiField select:hover{border-color:rgba(166,107,255,.28);background:linear-gradient(180deg,rgba(28,27,45,.98),rgba(12,13,24,.98))}",
              "body.swifly-compact-player .swiflyUiField select:focus{border-color:rgba(166,107,255,.7);box-shadow:0 0 0 3px rgba(124,92,255,.14),inset 0 1px 0 rgba(255,255,255,.04)}",
              "@keyframes swiflyCompactMenuIn{from{opacity:0;transform:translateY(7px) scale(.98)}to{opacity:1;transform:none}}",
              "@media(max-width:720px){body.swifly-compact-player .swiflyUiBottom{bottom:5px;width:calc(100% - 10px);padding:29px 5px 5px;border-radius:13px}body.swifly-compact-player .swiflyUiProgress{left:7px;right:7px;top:8px;width:calc(100% - 14px)}body.swifly-compact-player .swiflyUiMenu{right:5px;bottom:62px;width:calc(100vw - 10px)}body.swifly-compact-player .swiflyUiField{grid-template-columns:28px 62px 1fr}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-compact] Compact control deck and option cards mounted.");
        }

`;

if (compactUpgrade.includes(String.raw`\"`)) {
  throw new Error("[swifly-compact] Nested escaped quotes are unsafe inside the rendered watch script.");
}

fs.readFileSync = function swiflyCompactRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    /(\n[ \t]*function initPlyrUi\(hlsInstance,\s*levels\)\s*\{)/,
    `${compactUpgrade}$1`,
    "Plyr initializer",
  );

  source = replaceRequired(
    source,
    /(movieButtonPlyr\.on\("ready",\s*function\(\)\s*\{\s*\n)/,
    `$1            setTimeout(function(){ mountSwiflyCompactOptions(video); }, 30);\n`,
    "Plyr ready event",
  );

  console.log("[swifly-compact] Compact player polish injected safely.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-polished.js");
