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
        function upgradeSwiflyPlayerUi(media) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media) return;

          document.body.classList.add("swifly-premium-player");

          function removeExtraBackButton() {
            var fallback = document.getElementById("swiflyCleanBack");
            if (fallback) fallback.remove();
          }

          removeExtraBackButton();
          var cleanupPass = 0;
          var cleanupTimer = setInterval(function() {
            removeExtraBackButton();
            cleanupPass += 1;
            if (cleanupPass >= 16) clearInterval(cleanupTimer);
          }, 250);

          var subtitle = ui.querySelector(".swiflyUiTitle span");
          if (subtitle) subtitle.textContent = "Swifly cinema";

          var top = ui.querySelector(".swiflyUiTop");
          if (top && !top.querySelector(".swiflyPremiumBadge")) {
            var badge = document.createElement("div");
            badge.className = "swiflyPremiumBadge";
            badge.textContent = "CinePro · Auto";
            top.appendChild(badge);
          }

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
              preview.style.left = (event.clientX - rect.left) + "px";
              preview.hidden = false;
            });
            progress.addEventListener("pointerleave", function() { preview.hidden = true; });
          }

          if (!document.getElementById("swiflyPremiumPlayerStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyPremiumPlayerStyle";
            style.textContent = [
              "#swiflyCleanBack{display:none!important}",
              "body.swifly-premium-player .swiflyPlayerUi{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}",
              "body.swifly-premium-player .swiflyUiTop{gap:14px;padding:24px 32px 92px;background:linear-gradient(180deg,rgba(0,0,0,.64),rgba(0,0,0,.22) 52%,transparent)}",
              "body.swifly-premium-player .swiflyUiBottom{padding:104px 32px max(24px,env(safe-area-inset-bottom));background:linear-gradient(0deg,rgba(0,0,0,.94),rgba(0,0,0,.48) 48%,transparent)}",
              "body.swifly-premium-player .swiflyUiBack{width:46px;height:46px;background:rgba(11,13,18,.5);border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 42px rgba(0,0,0,.38);backdrop-filter:blur(18px) saturate(1.15)}",
              "body.swifly-premium-player .swiflyUiTitle b{font-size:17px;font-weight:760;letter-spacing:-.015em;text-shadow:0 2px 18px rgba(0,0,0,.86)}",
              "body.swifly-premium-player .swiflyUiTitle span{margin-top:5px;color:rgba(255,255,255,.52);font-size:9px;font-weight:850;letter-spacing:.17em}",
              ".swiflyPremiumBadge{margin-left:auto;padding:7px 10px;border:1px solid rgba(255,255,255,.13);border-radius:999px;color:rgba(255,255,255,.7);background:rgba(10,12,18,.38);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;backdrop-filter:blur(14px)}",
              "body.swifly-premium-player .swiflyUiBtn{width:44px;height:44px;transition:background .16s ease,transform .16s ease,color .16s ease}",
              "body.swifly-premium-player .swiflyUiBtn:hover,body.swifly-premium-player .swiflyUiBtn:focus-visible{background:rgba(255,255,255,.14);transform:scale(1.06);outline:none}",
              "body.swifly-premium-player .swiflyUiMain{width:78px;height:78px;color:#090b0f;background:#fff;box-shadow:0 22px 72px rgba(0,0,0,.58),0 0 0 1px rgba(255,255,255,.22)}",
              "body.swifly-premium-player .swiflyUiMain:hover{background:#fff;transform:scale(1.08)}",
              "body.swifly-premium-player .swiflyUiSkip{width:54px;height:54px;background:rgba(10,12,18,.48);border-color:rgba(255,255,255,.14);backdrop-filter:blur(14px)}",
              "body.swifly-premium-player .swiflyUiProgress{left:32px;right:32px;bottom:77px;width:calc(100% - 64px);height:3px;background:linear-gradient(90deg,#e50914 0 var(--p),rgba(255,255,255,.43) var(--p) var(--b),rgba(255,255,255,.2) var(--b));transition:height .12s ease,filter .12s ease}",
              "body.swifly-premium-player .swiflyUiProgress:hover,body.swifly-premium-player .swiflyUiProgress:focus-visible{height:6px;filter:brightness(1.12);outline:none}",
              "body.swifly-premium-player .swiflyUiProgress::-webkit-slider-thumb{box-shadow:0 2px 12px rgba(0,0,0,.6)}",
              ".swiflyPremiumPreview{position:absolute;bottom:92px;transform:translateX(-50%);padding:6px 9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#fff;background:rgba(8,10,14,.88);box-shadow:0 12px 32px rgba(0,0,0,.42);font-size:11px;font-weight:800;pointer-events:none;backdrop-filter:blur(14px)}",
              ".swiflyPremiumPreview[hidden]{display:none}",
              "body.swifly-premium-player .swiflyUiRow{gap:2px}",
              "body.swifly-premium-player .swiflyUiVolume{width:0;opacity:0;transition:width .18s ease,opacity .18s ease}",
              "body.swifly-premium-player [data-a=\"mute\"]:hover + .swiflyUiVolume,body.swifly-premium-player .swiflyUiVolume:hover,body.swifly-premium-player .swiflyUiVolume:focus{width:88px;opacity:1}",
              "body.swifly-premium-player .swiflyUiTime{color:rgba(255,255,255,.7);font-size:12px;font-weight:700}",
              "body.swifly-premium-player .swiflyUiMenu{right:32px;bottom:90px;width:min(316px,calc(100vw - 32px));padding:12px;border-color:rgba(255,255,255,.14);border-radius:20px;background:rgba(13,15,21,.9);box-shadow:0 30px 90px rgba(0,0,0,.68);backdrop-filter:blur(28px) saturate(1.18)}",
              "body.swifly-premium-player .swiflyUiMenu h3{font-size:14px;font-weight:820}",
              "body.swifly-premium-player .swiflyUiField{padding:8px 6px;border-radius:12px}",
              "body.swifly-premium-player .swiflyUiField select{border-color:rgba(255,255,255,.12);background:#191c24}",
              "@media(max-width:720px){body.swifly-premium-player .swiflyUiTop{padding:14px 14px 60px}body.swifly-premium-player .swiflyUiBottom{padding:82px 12px max(12px,env(safe-area-inset-bottom))}body.swifly-premium-player .swiflyUiProgress{left:12px;right:12px;bottom:62px;width:calc(100% - 24px)}.swiflyPremiumBadge{display:none}.swiflyPremiumPreview{bottom:77px}}"
            ].join("");
            document.head.appendChild(style);
          }

          console.log("[swifly-premium] Premium player polish mounted; duplicate back button removed.");
        }

`;

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
    `$1            setTimeout(function(){ upgradeSwiflyPlayerUi(video); }, 0);\n`,
    "Plyr ready event",
  );

  console.log("[swifly-premium] Premium player layer injected.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-custom-controls.js");
