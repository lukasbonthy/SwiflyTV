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
<style id="swifly-clean-watch-style">
  html.swifly-watch-clean,
  body.swifly-watch-clean {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }

  body.swifly-watch-clean::before,
  body.swifly-watch-clean::after,
  body.swifly-watch-clean > .topbar,
  body.swifly-watch-clean > .netflixTopbar,
  body.swifly-watch-clean > .mobileNav,
  body.swifly-watch-clean > .controlDock,
  body.swifly-watch-clean > .controlPanel,
  body.swifly-watch-clean > .footer,
  body.swifly-watch-clean .dsWatchHeader,
  body.swifly-watch-clean .dsWatchBg,
  body.swifly-watch-clean .dsWatchHero::before,
  body.swifly-watch-clean .dsWatchPlayerTop,
  body.swifly-watch-clean .dsWatchActions {
    display: none !important;
  }

  body.swifly-watch-clean .dsWatchPage,
  body.swifly-watch-clean .dsWatchHero,
  body.swifly-watch-clean .dsWatchLayout,
  body.swifly-watch-clean .dsWatchPlayerCard,
  body.swifly-watch-clean .dsWatchFrame,
  body.swifly-watch-clean .dsWatchEmbedFrame,
  body.swifly-watch-clean .dsProxyVideoWaitingShell,
  body.swifly-watch-clean #movieButtonPlayerShell,
  body.swifly-watch-clean #movieButtonPlayerShell > .plyr,
  body.swifly-watch-clean #movieButtonPlayerShell .plyr--video {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    min-width: 100vw !important;
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

  body.swifly-watch-clean .dsWatchPage,
  body.swifly-watch-clean .dsWatchHero,
  body.swifly-watch-clean .dsWatchLayout,
  body.swifly-watch-clean .dsWatchPlayerCard,
  body.swifly-watch-clean .dsWatchFrame,
  body.swifly-watch-clean .dsWatchEmbedFrame { z-index: 1 !important; }
  body.swifly-watch-clean .dsProxyVideoWaitingShell { z-index: 10 !important; }
  body.swifly-watch-clean #movieButtonPlayerShell,
  body.swifly-watch-clean #movieButtonPlayerShell > .plyr,
  body.swifly-watch-clean #movieButtonPlayerShell .plyr--video { z-index: 20 !important; }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__video-wrapper {
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #000 !important;
    overflow: hidden !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell video,
  body.swifly-watch-clean #proxyVideoClientVideo {
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
    background: #000 !important;
  }

  body.swifly-watch-clean .dsCinemaPlayerAura,
  body.swifly-watch-clean .dsCinemaHlsTop,
  body.swifly-watch-clean .dsVideoJsTop,
  body.swifly-watch-clean .dsVideoJsCenter,
  body.swifly-watch-clean .dsCinemaHlsHint,
  body.swifly-watch-clean .dsVideoJsHint,
  body.swifly-watch-clean .dsCinemaSeekDock,
  body.swifly-watch-clean .dsVideoJsQuality,
  body.swifly-watch-clean .dsVideoJsSpeed,
  body.swifly-watch-clean .dsVideoJsVolume,
  body.swifly-watch-clean .dsVideoJsTimelinePreview,
  body.swifly-watch-clean .swiflyVideoDock,
  body.swifly-watch-clean .swiflyNeoDock,
  body.swifly-watch-clean #movieButtonBack10,
  body.swifly-watch-clean #movieButtonBigPlay,
  body.swifly-watch-clean #movieButtonForward10,
  body.swifly-watch-clean #movieButtonSeekDock,
  body.swifly-watch-clean #movieButtonQualityToggle,
  body.swifly-watch-clean #movieButtonQualityMenu,
  body.swifly-watch-clean #movieButtonSpeedToggle,
  body.swifly-watch-clean #movieButtonSpeedMenu,
  body.swifly-watch-clean #movieButtonVolumeToggle,
  body.swifly-watch-clean #movieButtonVolumeMenu,
  body.swifly-watch-clean .dsHlsStatus:not(.isError) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  body.swifly-watch-clean.swifly-player-live .dsProxyVideoWaitingCard { display: none !important; }

  body.swifly-watch-clean .dsProxyVideoWaitingCard {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-width: none !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: radial-gradient(circle at 50% 45%, rgba(229,9,20,.08), transparent 28%), #000 !important;
    box-shadow: none !important;
  }

  body.swifly-watch-clean .plyr {
    --plyr-color-main: #e50914;
    --plyr-video-background: #000;
    --plyr-video-control-color: #fff;
    --plyr-video-control-background-hover: rgba(255,255,255,.13);
    --plyr-menu-background: rgba(14,14,18,.96);
    --plyr-menu-color: #fff;
    font-family: "Host Grotesk", Inter, system-ui, sans-serif !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls {
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 40 !important;
    width: 100% !important;
    min-height: 86px !important;
    display: flex !important;
    align-items: flex-end !important;
    gap: 6px !important;
    padding: 76px 26px max(20px, env(safe-area-inset-bottom)) !important;
    background: linear-gradient(to top, rgba(0,0,0,.96), rgba(0,0,0,.54) 42%, transparent) !important;
    transition: opacity .22s ease, transform .22s ease !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr--hide-controls .plyr__controls {
    opacity: 0 !important;
    visibility: hidden !important;
    transform: translateY(10px) !important;
    pointer-events: none !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr--paused .plyr__controls,
  body.swifly-watch-clean #movieButtonPlayerShell .plyr:hover .plyr__controls,
  body.swifly-watch-clean #movieButtonPlayerShell .plyr:focus-within .plyr__controls {
    opacity: 1 !important;
    visibility: visible !important;
    transform: translateY(0) !important;
    pointer-events: auto !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls__item.plyr__progress__container {
    position: absolute !important;
    left: 28px !important;
    right: 28px !important;
    bottom: 72px !important;
    width: auto !important;
    margin: 0 !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__control {
    width: 42px !important;
    height: 42px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 10px !important;
    border-radius: 999px !important;
    color: rgba(255,255,255,.94) !important;
    background: transparent !important;
    transition: background .16s ease, transform .16s ease, color .16s ease !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__control:hover,
  body.swifly-watch-clean #movieButtonPlayerShell .plyr__control:focus-visible {
    color: #fff !important;
    background: rgba(255,255,255,.14) !important;
    transform: scale(1.06);
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__control--overlaid {
    z-index: 35 !important;
    width: 76px !important;
    height: 76px !important;
    padding: 22px !important;
    border: 1px solid rgba(255,255,255,.22) !important;
    color: #fff !important;
    background: rgba(9,11,16,.62) !important;
    box-shadow: 0 20px 58px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.12) !important;
    backdrop-filter: blur(16px) saturate(1.1);
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__time {
    min-width: max-content !important;
    color: rgba(255,255,255,.82) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__volume {
    width: auto !important;
    min-width: 112px !important;
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__menu__container {
    border: 1px solid rgba(255,255,255,.12) !important;
    border-radius: 16px !important;
    color: #fff !important;
    background: rgba(14,14,18,.96) !important;
    box-shadow: 0 24px 70px rgba(0,0,0,.62) !important;
    backdrop-filter: blur(22px) saturate(1.12);
  }

  body.swifly-watch-clean #movieButtonPlayerShell .plyr__captions {
    bottom: 100px !important;
    font-size: clamp(18px, 2vw, 34px) !important;
    line-height: 1.3 !important;
    text-shadow: 0 2px 8px rgba(0,0,0,.98) !important;
  }

  #swiflyCleanBack {
    position: fixed !important;
    top: max(16px, env(safe-area-inset-top)) !important;
    left: max(16px, env(safe-area-inset-left)) !important;
    z-index: 100 !important;
    width: 44px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
    border: 1px solid rgba(255,255,255,.14) !important;
    border-radius: 999px !important;
    color: #fff !important;
    background: rgba(8,10,14,.52) !important;
    box-shadow: 0 12px 34px rgba(0,0,0,.34) !important;
    cursor: pointer !important;
    font: 700 24px/1 system-ui, sans-serif !important;
    opacity: .78;
  }

  @media (max-width: 760px) {
    body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls {
      min-height: 76px !important;
      gap: 2px !important;
      padding: 62px 8px max(10px, env(safe-area-inset-bottom)) !important;
    }
    body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls__item.plyr__progress__container {
      left: 12px !important;
      right: 12px !important;
      bottom: 57px !important;
    }
    body.swifly-watch-clean #movieButtonPlayerShell .plyr__control {
      width: 38px !important;
      height: 38px !important;
      padding: 9px !important;
    }
    body.swifly-watch-clean #movieButtonPlayerShell .plyr__time--duration,
    body.swifly-watch-clean #movieButtonPlayerShell .plyr__volume { display: none !important; }
  }
</style>
<script>
(function swiflyCleanWatchMount(){
  "use strict";
  var attempts = 0;
  var timer = null;

  function ensureBackButton() {
    if (document.getElementById("swiflyCleanBack")) return;
    var back = document.createElement("button");
    back.id = "swiflyCleanBack";
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
    document.documentElement.classList.add("swifly-watch-clean");
    document.body.classList.add("swifly-watch-clean");
    ensureBackButton();

    var shell = document.getElementById("movieButtonPlayerShell");
    var plyr = shell && shell.querySelector(".plyr");
    if (shell && !shell.hidden && plyr) {
      document.body.classList.add("swifly-player-live");
      if (timer) clearInterval(timer);
      timer = null;
      console.log("[swifly-clean-watch] Player mounted; clean controls active.");
      return true;
    }

    if (attempts >= 40 && timer) {
      clearInterval(timer);
      timer = null;
      console.warn("[swifly-clean-watch] Player did not mount within 10 seconds.");
    }
    return false;
  }

  function start() {
    mount();
    if (!timer) timer = setInterval(mount, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  console.log("[swifly-clean-watch] Clean streaming-player layout loaded.");
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
    `  const swiflyCleanWatchMarkup = isMovieMode ? ${JSON.stringify(watchOverlay)} : "";\n\n` +
    '  const body = `${swiflyCleanWatchMarkup}<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">';

  source = replaceRequired(source, watchBodyMarker, replacement, "watchPage body marker");
  console.log("[cinepro-fullscreen-safe] Clean full-window streaming-player layout injected.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-plyr.js");
