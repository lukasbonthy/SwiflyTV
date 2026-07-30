"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[cinepro-fullscreen-safe] Could not find ${label}; server.js was not modified.`);
  }
  return source.replace(needle, replacement);
}

const watchOverlay = String.raw`
<style id="swifly-safe-fullscreen-style">
  html.swifly-watch-safe,
  body.swifly-watch-safe {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }

  body.swifly-watch-safe::before,
  body.swifly-watch-safe::after,
  body.swifly-watch-safe > .topbar,
  body.swifly-watch-safe > .netflixTopbar,
  body.swifly-watch-safe > .mobileNav,
  body.swifly-watch-safe > .controlDock,
  body.swifly-watch-safe > .controlPanel,
  body.swifly-watch-safe > .footer,
  body.swifly-watch-safe .dsWatchHeader,
  body.swifly-watch-safe .dsWatchBg,
  body.swifly-watch-safe .dsWatchHero::before,
  body.swifly-watch-safe .dsWatchPlayerTop,
  body.swifly-watch-safe .dsWatchActions {
    display: none !important;
  }

  body.swifly-watch-safe .dsWatchPage,
  body.swifly-watch-safe .dsWatchHero,
  body.swifly-watch-safe .dsWatchLayout,
  body.swifly-watch-safe .dsWatchPlayerCard,
  body.swifly-watch-safe .dsWatchFrame,
  body.swifly-watch-safe .dsWatchEmbedFrame,
  body.swifly-watch-safe .dsProxyVideoWaitingShell,
  body.swifly-watch-safe #movieButtonPlayerShell,
  body.swifly-watch-safe #movieButtonPlayerShell > .plyr,
  body.swifly-watch-safe #movieButtonPlayerShell .plyr--video,
  body.swifly-watch-safe #movieButtonPlayerShell .plyr__video-wrapper {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    min-width: 100vw !important;
    min-height: 100vh !important;
    min-height: 100dvh !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    gap: 0 !important;
    aspect-ratio: auto !important;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0 !important;
    background: #000 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    transform: none !important;
  }

  body.swifly-watch-safe .dsWatchPage,
  body.swifly-watch-safe .dsWatchHero,
  body.swifly-watch-safe .dsWatchLayout,
  body.swifly-watch-safe .dsWatchPlayerCard,
  body.swifly-watch-safe .dsWatchFrame,
  body.swifly-watch-safe .dsWatchEmbedFrame {
    z-index: 1 !important;
  }

  body.swifly-watch-safe .dsProxyVideoWaitingShell {
    z-index: 10 !important;
  }

  body.swifly-watch-safe #movieButtonPlayerShell,
  body.swifly-watch-safe #movieButtonPlayerShell > .plyr,
  body.swifly-watch-safe #movieButtonPlayerShell .plyr--video,
  body.swifly-watch-safe #movieButtonPlayerShell .plyr__video-wrapper {
    z-index: 20 !important;
  }

  body.swifly-watch-safe #movieButtonPlayerShell video,
  body.swifly-watch-safe #proxyVideoClientVideo {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: 50% 50% !important;
    background: #000 !important;
  }

  body.swifly-watch-safe .dsCinemaPlayerAura,
  body.swifly-watch-safe .dsCinemaHlsTop,
  body.swifly-watch-safe .dsVideoJsTop,
  body.swifly-watch-safe .dsVideoJsCenter,
  body.swifly-watch-safe .dsCinemaHlsHint,
  body.swifly-watch-safe .dsVideoJsHint,
  body.swifly-watch-safe .dsCinemaSeekDock,
  body.swifly-watch-safe .dsVideoJsQuality,
  body.swifly-watch-safe .dsVideoJsSpeed,
  body.swifly-watch-safe .dsVideoJsVolume,
  body.swifly-watch-safe .dsVideoJsTimelinePreview,
  body.swifly-watch-safe .swiflyVideoDock,
  body.swifly-watch-safe .swiflyNeoDock,
  body.swifly-watch-safe #movieButtonBack10,
  body.swifly-watch-safe #movieButtonBigPlay,
  body.swifly-watch-safe #movieButtonForward10,
  body.swifly-watch-safe #movieButtonSeekDock,
  body.swifly-watch-safe #movieButtonQualityToggle,
  body.swifly-watch-safe #movieButtonQualityMenu,
  body.swifly-watch-safe #movieButtonSpeedToggle,
  body.swifly-watch-safe #movieButtonSpeedMenu,
  body.swifly-watch-safe #movieButtonVolumeToggle,
  body.swifly-watch-safe #movieButtonVolumeMenu,
  body.swifly-watch-safe .dsHlsStatus:not(.isError) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  body.swifly-watch-safe.swifly-player-live .dsProxyVideoWaitingCard {
    display: none !important;
  }

  body.swifly-watch-safe .dsProxyVideoWaitingCard {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-width: none !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #000 !important;
    box-shadow: none !important;
  }

  body.swifly-watch-safe .plyr {
    --plyr-color-main: #e50914;
    --plyr-video-background: #000;
    --plyr-video-control-color: #fff;
    --plyr-video-control-background-hover: rgba(255,255,255,.15);
    --plyr-menu-background: rgba(13,14,18,.96);
    --plyr-menu-color: #fff;
    font-family: "Host Grotesk", Inter, system-ui, sans-serif !important;
  }

  body.swifly-watch-safe .plyr__controls {
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    padding: 76px 24px max(18px, env(safe-area-inset-bottom)) !important;
    gap: 7px !important;
    background: linear-gradient(to top, rgba(0,0,0,.98), rgba(0,0,0,.62) 44%, transparent) !important;
  }

  body.swifly-watch-safe .plyr__controls__item.plyr__progress__container {
    position: absolute !important;
    left: 24px !important;
    right: 24px !important;
    bottom: 66px !important;
    width: auto !important;
    margin: 0 !important;
  }

  #swiflySafeBack {
    position: fixed !important;
    top: max(14px, env(safe-area-inset-top)) !important;
    left: max(14px, env(safe-area-inset-left)) !important;
    z-index: 2147483647 !important;
    width: 46px !important;
    height: 46px !important;
    display: grid !important;
    place-items: center !important;
    border: 1px solid rgba(255,255,255,.17) !important;
    border-radius: 999px !important;
    color: #fff !important;
    background: rgba(10,12,18,.64) !important;
    box-shadow: 0 14px 42px rgba(0,0,0,.4) !important;
    cursor: pointer !important;
    font: 700 25px/1 system-ui, sans-serif !important;
  }

  @media (max-width: 760px) {
    body.swifly-watch-safe .plyr__controls {
      padding: 60px 8px max(8px, env(safe-area-inset-bottom)) !important;
      gap: 2px !important;
    }

    body.swifly-watch-safe .plyr__controls__item.plyr__progress__container {
      left: 10px !important;
      right: 10px !important;
      bottom: 53px !important;
    }
  }
</style>
<script>
(function swiflySafeWatchMount(){
  "use strict";

  var attempts = 0;
  var timer = null;

  function ensureBackButton() {
    if (document.getElementById("swiflySafeBack")) return;
    var back = document.createElement("button");
    back.id = "swiflySafeBack";
    back.type = "button";
    back.setAttribute("aria-label", "Back to title");
    back.textContent = "←";
    back.addEventListener("click", function() {
      var match = window.location.pathname.match(/^\/watch\/(movie|tv)\/([^/?#]+)/);
      window.location.href = match ? "/" + match[1] + "/" + match[2] : "/";
    });
    document.body.appendChild(back);
  }

  function mount() {
    attempts += 1;
    document.documentElement.classList.add("swifly-watch-safe");
    document.body.classList.add("swifly-watch-safe");
    ensureBackButton();

    var shell = document.getElementById("movieButtonPlayerShell");
    var plyr = shell && shell.querySelector(".plyr");
    if (shell && !shell.hidden && plyr) {
      document.body.classList.add("swifly-player-live");
      if (timer) clearInterval(timer);
      timer = null;
      console.log("[swifly-safe-watch] Player mounted; polling stopped.");
      return true;
    }

    if (attempts >= 40 && timer) {
      clearInterval(timer);
      timer = null;
      console.warn("[swifly-safe-watch] Player did not mount within 10 seconds.");
    }
    return false;
  }

  function start() {
    mount();
    if (!timer) timer = setInterval(mount, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  console.log("[swifly-safe-watch] Lightweight fullscreen watch layer loaded.");
})();
</script>`;

fs.readFileSync = function swiflyFullscreenSafeRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  const watchBodyMarker =
    '  const body = `<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">';

  const replacement =
    `  const swiflySafeWatchMarkup = isMovieMode ? ${JSON.stringify(watchOverlay)} : "";\n\n` +
    '  const body = `${swiflySafeWatchMarkup}<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">';

  source = replaceRequired(
    source,
    watchBodyMarker,
    replacement,
    "watchPage body marker",
  );

  console.log("[cinepro-fullscreen-safe] Lightweight fullscreen watch layer injected.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-plyr.js");
