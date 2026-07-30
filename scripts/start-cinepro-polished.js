"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-polish] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const polishedUpgrade = String.raw`
        function polishSwiflyPlayerUi(media, hlsInstance) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media) return;

          document.body.classList.add("swifly-polished-player");
          playerShell.classList.add("swiflyPolishedCinema");

          function removeFallbackBack() {
            var fallback = document.getElementById("swiflyCleanBack");
            if (fallback) fallback.remove();
          }

          removeFallbackBack();
          var cleanupCount = 0;
          var cleanupTimer = setInterval(function() {
            removeFallbackBack();
            cleanupCount += 1;
            if (cleanupCount >= 16) clearInterval(cleanupTimer);
          }, 200);

          var subtitle = ui.querySelector(".swiflyUiTitle span");
          if (subtitle) {
            subtitle.textContent = "";
            var dot = document.createElement("i");
            dot.className = "swiflyPolishedTitleDot";
            subtitle.appendChild(dot);
            subtitle.appendChild(document.createTextNode("SWIFLY CINEMA"));
          }

          var top = ui.querySelector(".swiflyUiTop");
          var badge = top && top.querySelector(".swiflyPremiumBadge");
          if (top && !badge) {
            badge = document.createElement("div");
            badge.className = "swiflyPremiumBadge";
            badge.innerHTML = "<span class=swiflyPolishedQualityDot></span><span class=swiflyPremiumQuality>AUTO</span>";
            top.appendChild(badge);
          }

          function currentHeight() {
            try {
              if (!hlsInstance || !Array.isArray(hlsInstance.levels)) return 0;
              var index = Number.isInteger(hlsInstance.currentLevel) && hlsInstance.currentLevel >= 0
                ? hlsInstance.currentLevel
                : (Number.isInteger(hlsInstance.loadLevel) && hlsInstance.loadLevel >= 0 ? hlsInstance.loadLevel : -1);
              var level = index >= 0 ? hlsInstance.levels[index] : null;
              return Number(level && level.height || 0);
            } catch {
              return 0;
            }
          }

          function updateQualityBadge() {
            if (!badge) return;
            var height = currentHeight();
            var adaptive = true;
            try { adaptive = hlsInstance ? hlsInstance.autoLevelEnabled !== false : true; } catch {}
            var label = adaptive ? "AUTO" : "FIXED";
            if (height) label += " · " + height + "P";
            var target = badge.querySelector(".swiflyPremiumQuality");
            if (target) target.textContent = label;
          }

          updateQualityBadge();
          try {
            if (hlsInstance && window.Hls && window.Hls.Events) {
              hlsInstance.on(window.Hls.Events.LEVEL_SWITCHED, updateQualityBadge);
              hlsInstance.on(window.Hls.Events.LEVEL_LOADED, updateQualityBadge);
            }
          } catch {}

          var bottom = ui.querySelector(".swiflyUiBottom");
          var progress = ui.querySelector(".swiflyUiProgress");
          if (bottom && progress && !bottom.querySelector(".swiflyPremiumPreview")) {
            var preview = document.createElement("div");
            preview.className = "swiflyPremiumPreview";
            preview.hidden = true;
            bottom.appendChild(preview);

            function formatTime(seconds) {
              seconds = Math.max(0, Math.floor(Number(seconds || 0)));
              var hours = Math.floor(seconds / 3600);
              var minutes = Math.floor(seconds % 3600 / 60);
              var secs = seconds % 60;
              return (hours ? hours + ":" + String(minutes).padStart(2, "0") : minutes) + ":" + String(secs).padStart(2, "0");
            }

            progress.addEventListener("pointermove", function(event) {
              var rect = progress.getBoundingClientRect();
              var ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
              preview.textContent = formatTime(Number(media.duration || 0) * ratio);
              preview.style.left = Math.max(20, Math.min(rect.width - 20, event.clientX - rect.left)) + "px";
              preview.hidden = false;
            });
            progress.addEventListener("pointerleave", function() { preview.hidden = true; });
          }

          if (!document.getElementById("swiflyPolishedPlayerStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyPolishedPlayerStyle";
            style.textContent = [
              "#swiflyCleanBack{display:none!important}",
              "body.swifly-polished-player{background:#03040a}",
              "body.swifly-polished-player .swiflyPlayerUi{--swifly-a:#ff4f9a;--swifly-b:#7c5cff;--swifly-c:#5ee7ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}",
              "body.swifly-polished-player .swiflyUiTop{gap:12px;padding:18px 22px 82px;background:linear-gradient(180deg,rgba(2,3,9,.72),rgba(2,3,9,.2) 52%,transparent)}",
              "body.swifly-polished-player .swiflyUiBack{width:42px;height:42px;background:rgba(12,14,23,.48);border:1px solid rgba(255,255,255,.13);box-shadow:0 10px 32px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(18px) saturate(1.2)}",
              "body.swifly-polished-player .swiflyUiTitle b{font-size:15px;font-weight:780;letter-spacing:-.015em;text-shadow:0 3px 18px rgba(0,0,0,.78)}",
              "body.swifly-polished-player .swiflyUiTitle span{display:flex;align-items:center;gap:7px;margin-top:4px;color:rgba(255,255,255,.45);font-size:8px;font-weight:900;letter-spacing:.18em}",
              ".swiflyPolishedTitleDot{display:inline-block;width:5px;height:5px;border-radius:999px;background:linear-gradient(135deg,var(--swifly-a),var(--swifly-b));box-shadow:0 0 12px rgba(255,79,154,.64)}",
              ".swiflyPremiumBadge{margin-left:auto;display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,255,255,.11);border-radius:999px;color:rgba(255,255,255,.72);background:rgba(10,12,20,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);font-size:9px;font-weight:900;letter-spacing:.09em;backdrop-filter:blur(16px) saturate(1.18)}",
              ".swiflyPolishedQualityDot{width:6px;height:6px;border-radius:999px;background:linear-gradient(135deg,var(--swifly-a),var(--swifly-b));box-shadow:0 0 12px rgba(124,92,255,.78)}",
              "body.swifly-polished-player .swiflyUiCenter{gap:14px}",
              "body.swifly-polished-player .swiflyUiBtn{width:40px;height:40px;color:#fff;transition:background .16s ease,transform .16s ease,box-shadow .16s ease}",
              "body.swifly-polished-player .swiflyUiBtn:hover,body.swifly-polished-player .swiflyUiBtn:focus-visible{background:rgba(255,255,255,.12);transform:translateY(-1px) scale(1.04);outline:none}",
              "body.swifly-polished-player .swiflyUiMain{width:70px;height:70px;color:#fff;background:linear-gradient(145deg,rgba(255,255,255,.2),rgba(255,255,255,.075));border:1px solid rgba(255,255,255,.2);box-shadow:0 20px 68px rgba(0,0,0,.56),0 0 34px rgba(124,92,255,.15),inset 0 1px 0 rgba(255,255,255,.14);backdrop-filter:blur(20px) saturate(1.28)}",
              "body.swifly-polished-player .swiflyUiMain:hover{background:linear-gradient(145deg,rgba(255,255,255,.25),rgba(255,255,255,.1));transform:scale(1.065)}",
              "body.swifly-polished-player .swiflyUiSkip{width:48px;height:48px;background:rgba(9,11,20,.42);border:1px solid rgba(255,255,255,.1);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(16px)}",
              "body.swifly-polished-player .swiflyUiBottom{left:50%;right:auto;bottom:10px;width:min(1040px,calc(100% - 28px));padding:40px 12px 9px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.095);border-radius:18px;background:radial-gradient(circle at 14% 0,rgba(255,79,154,.07),transparent 30%),radial-gradient(circle at 86% 0,rgba(124,92,255,.08),transparent 32%),linear-gradient(180deg,rgba(19,21,33,.42),rgba(6,8,15,.72));box-shadow:0 22px 72px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(22px) saturate(1.24)}",
              "body.swifly-polished-player .swiflyUiProgress{left:12px;right:12px;top:12px;bottom:auto;width:calc(100% - 24px);height:3px;background:linear-gradient(90deg,var(--swifly-a) 0 var(--p),rgba(124,92,255,.58) var(--p) var(--b),rgba(255,255,255,.15) var(--b));box-shadow:0 0 14px rgba(124,92,255,.1);transition:height .12s ease,filter .12s ease}",
              "body.swifly-polished-player .swiflyUiProgress:hover,body.swifly-polished-player .swiflyUiProgress:focus-visible{height:5px;filter:brightness(1.13);outline:none}",
              "body.swifly-polished-player .swiflyUiProgress::-webkit-slider-thumb{background:#fff;box-shadow:0 0 0 3px rgba(124,92,255,.18),0 3px 11px rgba(0,0,0,.5)}",
              "body.swifly-polished-player .swiflyUiProgress::-moz-range-thumb{border:0;background:#fff;box-shadow:0 0 0 3px rgba(124,92,255,.18),0 3px 11px rgba(0,0,0,.5)}",
              ".swiflyPremiumPreview{position:absolute;top:23px;transform:translateX(-50%);padding:5px 8px;border:1px solid rgba(255,255,255,.11);border-radius:8px;color:#fff;background:rgba(7,9,16,.88);box-shadow:0 12px 34px rgba(0,0,0,.46);font-size:10px;font-weight:850;pointer-events:none;backdrop-filter:blur(16px)}",
              ".swiflyPremiumPreview[hidden]{display:none}",
              "body.swifly-polished-player .swiflyUiRow{position:relative;z-index:2;gap:1px;min-height:40px}",
              "body.swifly-polished-player .swiflyUiRow .swiflyUiBtn{border-radius:12px}",
              "body.swifly-polished-player .swiflyUiVolume{width:0;opacity:0;accent-color:#a66bff;transition:width .18s ease,opacity .18s ease}",
              "body.swifly-polished-player [data-a=mute]:hover + .swiflyUiVolume,body.swifly-polished-player .swiflyUiVolume:hover,body.swifly-polished-player .swiflyUiVolume:focus{width:82px;opacity:1}",
              "body.swifly-polished-player .swiflyUiTime{margin-left:6px;color:rgba(255,255,255,.64);font-size:11px;font-weight:720}",
              "body.swifly-polished-player .swiflyUiCc.active{color:#ff74ac;text-shadow:0 0 14px rgba(255,79,154,.48)}",
              "body.swifly-polished-player .swiflyUiMenu{right:max(14px,calc((100vw - 1040px)/2));bottom:86px;width:min(286px,calc(100vw - 28px));padding:10px;border:1px solid rgba(255,255,255,.11);border-radius:18px;background:linear-gradient(180deg,rgba(21,23,36,.9),rgba(8,10,18,.94));box-shadow:0 28px 82px rgba(0,0,0,.66),inset 0 1px 0 rgba(255,255,255,.065);backdrop-filter:blur(26px) saturate(1.24)}",
              "body.swifly-polished-player .swiflyUiMenu h3{margin:2px 4px 9px;font-size:13px;font-weight:820;letter-spacing:-.008em}",
              "body.swifly-polished-player .swiflyUiField{grid-template-columns:76px 1fr;margin-top:5px;padding:7px 8px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.028);color:rgba(255,255,255,.58);font-size:11px}",
              "body.swifly-polished-player .swiflyUiField select{height:34px;padding:0 9px;border:1px solid rgba(255,255,255,.09);border-radius:9px;color:#fff;background:rgba(12,14,23,.9);box-shadow:inset 0 1px 0 rgba(255,255,255,.035);font-size:11px}",
              "body.swifly-polished-player .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiTop,body.swifly-polished-player .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiBottom{transform:translateY(8px)}",
              "@media(max-width:720px){body.swifly-polished-player .swiflyUiTop{padding:13px 12px 58px}body.swifly-polished-player .swiflyUiBottom{bottom:6px;width:calc(100% - 12px);padding:39px 6px 6px;border-radius:15px}body.swifly-polished-player .swiflyUiProgress{left:8px;right:8px;top:11px;width:calc(100% - 16px)}body.swifly-polished-player .swiflyUiRow .swiflyUiBtn{width:36px;height:36px}.swiflyPremiumBadge{display:none}.swiflyPremiumPreview{top:22px}body.swifly-polished-player .swiflyUiMenu{right:6px;bottom:70px;width:calc(100vw - 12px)}body.swifly-polished-player .swiflyUiVolume{display:none}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-polished-player .swiflyUiBtn,body.swifly-polished-player .swiflyUiProgress{transition:none!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-polish] Aurora Cinema polish mounted.");
        }

`;

if (polishedUpgrade.includes(String.raw`\"`)) {
  throw new Error("[swifly-polish] Nested escaped quotes are unsafe inside the rendered watch script.");
}

fs.readFileSync = function swiflyPolishRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    /(\n[ \t]*function initPlyrUi\(hlsInstance,\s*levels\)\s*\{)/,
    `${polishedUpgrade}$1`,
    "Plyr initializer",
  );

  source = replaceRequired(
    source,
    /(movieButtonPlyr\.on\("ready",\s*function\(\)\s*\{\s*\n)/,
    `$1            setTimeout(function(){ polishSwiflyPlayerUi(video, hlsInstance); }, 0);\n`,
    "Plyr ready event",
  );

  console.log("[swifly-polish] Final Aurora Cinema polish injected safely.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-custom-controls.js");
