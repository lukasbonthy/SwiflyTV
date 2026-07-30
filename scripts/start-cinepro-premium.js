"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-premium] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const premiumUpgrade = String.raw`
        function upgradeSwiflyPlayerUi(media, hlsInstance) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media) return;

          document.body.classList.add("swifly-premium-player");
          playerShell.classList.add("swiflyAuroraCinema");

          function removeExtraBackButton() {
            var fallback = document.getElementById("swiflyCleanBack");
            if (fallback) fallback.remove();
          }

          removeExtraBackButton();
          var cleanupPass = 0;
          var cleanupTimer = setInterval(function() {
            removeExtraBackButton();
            cleanupPass += 1;
            if (cleanupPass >= 20) clearInterval(cleanupTimer);
          }, 200);

          var subtitle = ui.querySelector(".swiflyUiTitle span");
          if (subtitle) {
            subtitle.textContent = "";
            var titleDot = document.createElement("i");
            titleDot.className = "swiflyPremiumTitleDot";
            subtitle.appendChild(titleDot);
            subtitle.appendChild(document.createTextNode("SWIFLY CINEMA"));
          }

          var top = ui.querySelector(".swiflyUiTop");
          var badge = top && top.querySelector(".swiflyPremiumBadge");
          if (top && !badge) {
            badge = document.createElement("div");
            badge.className = "swiflyPremiumBadge";
            badge.innerHTML = "<span class=swiflyPremiumDot></span><span class=swiflyPremiumQuality>AUTO</span>";
            top.appendChild(badge);
          }

          function updateQualityBadge() {
            if (!badge) return;
            var label = "AUTO";
            try {
              var levelIndex = hlsInstance && Number.isInteger(hlsInstance.currentLevel)
                ? hlsInstance.currentLevel
                : -1;
              var level = levelIndex >= 0 && hlsInstance && hlsInstance.levels
                ? hlsInstance.levels[levelIndex]
                : null;
              if (level && level.height) label = String(level.height) + "P";
            } catch {}
            var target = badge.querySelector(".swiflyPremiumQuality");
            if (target) target.textContent = label;
          }

          updateQualityBadge();
          try {
            if (hlsInstance && window.Hls && window.Hls.Events) {
              hlsInstance.on(window.Hls.Events.LEVEL_SWITCHED, updateQualityBadge);
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
              var ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              preview.textContent = formatTime(Number(media.duration || 0) * ratio);
              preview.style.left = Math.max(18, Math.min(rect.width - 18, event.clientX - rect.left)) + "px";
              preview.hidden = false;
            });
            progress.addEventListener("pointerleave", function() { preview.hidden = true; });
          }

          if (!document.getElementById("swiflyPremiumPlayerStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyPremiumPlayerStyle";
            style.textContent = [
              "#swiflyCleanBack{display:none!important}",
              "body.swifly-premium-player{background:#03040a}",
              "body.swifly-premium-player .swiflyPlayerUi{--swifly-a:#ff4f9a;--swifly-b:#7c5cff;--swifly-c:#5ee7ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}",
              "body.swifly-premium-player .swiflyPlayerUi:before{content:none}",
              "body.swifly-premium-player .swiflyUiTop{gap:14px;padding:20px 26px 96px;background:linear-gradient(180deg,rgba(2,3,9,.88),rgba(2,3,9,.34) 48%,transparent)}",
              "body.swifly-premium-player .swiflyUiBack{width:44px;height:44px;background:rgba(13,15,25,.56);border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 38px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(20px) saturate(1.25)}",
              "body.swifly-premium-player .swiflyUiTitle b{font-size:16px;font-weight:780;letter-spacing:-.018em;text-shadow:0 3px 20px rgba(0,0,0,.82)}",
              "body.swifly-premium-player .swiflyUiTitle span{display:flex;align-items:center;gap:7px;margin-top:5px;color:rgba(255,255,255,.48);font-size:9px;font-weight:900;letter-spacing:.19em}",
              ".swiflyPremiumTitleDot{display:inline-block;width:6px;height:6px;border-radius:999px;background:linear-gradient(135deg,var(--swifly-a),var(--swifly-b));box-shadow:0 0 14px rgba(255,79,154,.7)}",
              ".swiflyPremiumBadge{margin-left:auto;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:rgba(255,255,255,.76);background:rgba(12,14,24,.48);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);font-size:10px;font-weight:900;letter-spacing:.1em;backdrop-filter:blur(18px) saturate(1.2)}",
              ".swiflyPremiumDot{width:7px;height:7px;border-radius:999px;background:linear-gradient(135deg,var(--swifly-a),var(--swifly-b));box-shadow:0 0 14px rgba(124,92,255,.85)}",
              "body.swifly-premium-player .swiflyUiCenter{gap:16px}",
              "body.swifly-premium-player .swiflyUiBtn{width:42px;height:42px;color:#fff;transition:background .16s ease,transform .16s ease,color .16s ease,box-shadow .16s ease}",
              "body.swifly-premium-player .swiflyUiBtn:hover,body.swifly-premium-player .swiflyUiBtn:focus-visible{background:rgba(255,255,255,.13);transform:translateY(-1px) scale(1.045);outline:none}",
              "body.swifly-premium-player .swiflyUiMain{width:76px;height:76px;color:#fff;background:linear-gradient(145deg,rgba(255,255,255,.23),rgba(255,255,255,.08));border:1px solid rgba(255,255,255,.23);box-shadow:0 24px 80px rgba(0,0,0,.62),0 0 42px rgba(124,92,255,.18),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(22px) saturate(1.3)}",
              "body.swifly-premium-player .swiflyUiMain:hover{background:linear-gradient(145deg,rgba(255,255,255,.28),rgba(255,255,255,.11));transform:scale(1.075)}",
              "body.swifly-premium-player .swiflyUiSkip{width:52px;height:52px;background:rgba(10,12,22,.46);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(18px)}",
              "body.swifly-premium-player .swiflyUiBottom{left:50%;right:auto;bottom:18px;width:min(1180px,calc(100% - 36px));padding:50px 16px 13px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.11);border-radius:22px;background:radial-gradient(circle at 12% 0,rgba(255,79,154,.09),transparent 34%),radial-gradient(circle at 88% 0,rgba(124,92,255,.1),transparent 36%),linear-gradient(180deg,rgba(22,24,37,.48),rgba(7,9,17,.76));box-shadow:0 26px 90px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(26px) saturate(1.3)}",
              "body.swifly-premium-player .swiflyUiProgress{left:16px;right:16px;top:16px;bottom:auto;width:calc(100% - 32px);height:3px;background:linear-gradient(90deg,var(--swifly-a) 0 var(--p),rgba(124,92,255,.65) var(--p) var(--b),rgba(255,255,255,.17) var(--b));box-shadow:0 0 18px rgba(124,92,255,.12);transition:height .12s ease,filter .12s ease}",
              "body.swifly-premium-player .swiflyUiProgress:hover,body.swifly-premium-player .swiflyUiProgress:focus-visible{height:6px;filter:brightness(1.15);outline:none}",
              "body.swifly-premium-player .swiflyUiProgress::-webkit-slider-thumb{background:#fff;box-shadow:0 0 0 4px rgba(124,92,255,.22),0 4px 14px rgba(0,0,0,.55)}",
              "body.swifly-premium-player .swiflyUiProgress::-moz-range-thumb{border:0;background:#fff;box-shadow:0 0 0 4px rgba(124,92,255,.22),0 4px 14px rgba(0,0,0,.55)}",
              ".swiflyPremiumPreview{position:absolute;top:27px;transform:translateX(-50%);padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:9px;color:#fff;background:rgba(8,10,18,.9);box-shadow:0 14px 40px rgba(0,0,0,.5);font-size:11px;font-weight:850;pointer-events:none;backdrop-filter:blur(18px)}",
              ".swiflyPremiumPreview[hidden]{display:none}",
              "body.swifly-premium-player .swiflyUiRow{position:relative;z-index:2;gap:2px;min-height:42px}",
              "body.swifly-premium-player .swiflyUiRow .swiflyUiBtn{border-radius:13px}",
              "body.swifly-premium-player .swiflyUiVolume{width:0;opacity:0;accent-color:#a66bff;transition:width .18s ease,opacity .18s ease}",
              "body.swifly-premium-player [data-a=mute]:hover + .swiflyUiVolume,body.swifly-premium-player .swiflyUiVolume:hover,body.swifly-premium-player .swiflyUiVolume:focus{width:92px;opacity:1}",
              "body.swifly-premium-player .swiflyUiTime{margin-left:8px;color:rgba(255,255,255,.68);font-size:12px;font-weight:720}",
              "body.swifly-premium-player .swiflyUiCc.active{color:#ff74ac;text-shadow:0 0 16px rgba(255,79,154,.55)}",
              "body.swifly-premium-player .swiflyUiMenu{right:24px;bottom:104px;width:min(340px,calc(100vw - 32px));padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(180deg,rgba(24,26,40,.94),rgba(10,12,21,.96));box-shadow:0 34px 100px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(30px) saturate(1.3)}",
              "body.swifly-premium-player .swiflyUiMenu h3{margin:2px 4px 12px;font-size:15px;font-weight:820;letter-spacing:-.01em}",
              "body.swifly-premium-player .swiflyUiField{grid-template-columns:92px 1fr;margin-top:7px;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.62)}",
              "body.swifly-premium-player .swiflyUiField select{height:40px;border:1px solid rgba(255,255,255,.1);border-radius:11px;color:#fff;background:rgba(13,15,25,.9);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}",
              "@media(max-width:720px){body.swifly-premium-player .swiflyUiTop{padding:14px 14px 64px}body.swifly-premium-player .swiflyUiBottom{bottom:8px;width:calc(100% - 16px);padding:45px 8px 8px;border-radius:17px}body.swifly-premium-player .swiflyUiProgress{left:10px;right:10px;top:13px;width:calc(100% - 20px)}body.swifly-premium-player .swiflyUiRow .swiflyUiBtn{width:38px;height:38px}.swiflyPremiumBadge{display:none}.swiflyPremiumPreview{top:25px}body.swifly-premium-player .swiflyUiMenu{right:8px;bottom:78px;width:calc(100vw - 16px)}body.swifly-premium-player .swiflyUiVolume{display:none}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-premium-player .swiflyUiBtn,body.swifly-premium-player .swiflyUiProgress{transition:none!important}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-premium] Aurora Cinema player mounted.");
        }

`;

if (premiumUpgrade.includes(String.raw`\"`)) {
  throw new Error("[swifly-premium] Nested escaped quotes are unsafe inside the rendered watch script.");
}

fs.readFileSync = function swiflyPremiumRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    /(\n[ \t]*function initPlyrUi\(hlsInstance,\s*levels\)\s*\{)/,
    `${premiumUpgrade}$1`,
    "Plyr initializer",
  );

  source = replaceRequired(
    source,
    /(movieButtonPlyr\.on\("ready",\s*function\(\)\s*\{\s*\n)/,
    `$1            setTimeout(function(){ upgradeSwiflyPlayerUi(video, hlsInstance); }, 0);\n`,
    "Plyr ready event",
  );

  console.log("[swifly-premium] Aurora Cinema visual system injected safely.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-custom-controls.js");
