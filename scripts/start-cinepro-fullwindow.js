"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[cinepro-fullwindow] Could not find ${label}; server.js was not modified.`);
  }
  return source.replace(needle, replacement);
}

const directWatchMarkup = String.raw`
<style id="swifly-direct-watch-style">
  html,
  body {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
    overscroll-behavior: none !important;
  }

  body > .topbar,
  body > .netflixTopbar,
  body > .mobileNav,
  body > .controlDock,
  body > .controlPanel,
  body > .footer,
  .dsWatchFullscreenMovie .dsWatchHeader,
  .dsWatchFullscreenMovie .dsWatchBg,
  .dsWatchFullscreenMovie .dsWatchHero::before,
  .dsWatchFullscreenMovie .dsWatchPlayerTop,
  .dsWatchFullscreenMovie .dsWatchActions {
    display: none !important;
  }

  .dsWatchPage.dsWatchFullscreenMovie,
  .dsWatchFullscreenMovie .dsWatchHero,
  .dsWatchFullscreenMovie .dsWatchLayout,
  .dsWatchFullscreenMovie .dsWatchPlayerCard,
  .dsWatchFullscreenMovie .dsWatchFrame,
  .dsWatchFullscreenMovie .dsWatchEmbedFrame {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147480000 !important;
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

  .dsWatchFullscreenMovie .dsProxyVideoWaitingShell {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147481000 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #000 !important;
    overflow: hidden !important;
  }

  .dsWatchFullscreenMovie #movieButtonPlayerShell,
  .dsWatchFullscreenMovie .dsMovieButtonPlayerShell,
  .dsWatchFullscreenMovie .dsVideoJsCinemaShell,
  .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr,
  .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr > .plyr,
  .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr .plyr--video,
  .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr .plyr__video-wrapper {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147482000 !important;
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
    aspect-ratio: auto !important;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0 !important;
    background: #000 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    transform: none !important;
  }

  .dsWatchFullscreenMovie .plyr video,
  .dsWatchFullscreenMovie #proxyVideoClientVideo {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: 50% 50% !important;
    background: #000 !important;
  }

  .dsWatchFullscreenMovie .dsCinemaPlayerAura,
  .dsWatchFullscreenMovie .dsCinemaHlsTop,
  .dsWatchFullscreenMovie .dsVideoJsTop,
  .dsWatchFullscreenMovie .dsVideoJsCenter,
  .dsWatchFullscreenMovie .dsCinemaHlsHint,
  .dsWatchFullscreenMovie .dsVideoJsHint,
  .dsWatchFullscreenMovie .dsCinemaSeekDock,
  .dsWatchFullscreenMovie .dsVideoJsQuality,
  .dsWatchFullscreenMovie .dsVideoJsSpeed,
  .dsWatchFullscreenMovie .dsVideoJsVolume,
  .dsWatchFullscreenMovie .dsVideoJsTimelinePreview,
  .dsWatchFullscreenMovie .swiflyVideoDock,
  .dsWatchFullscreenMovie .swiflyNeoDock,
  .dsWatchFullscreenMovie #movieButtonBack10,
  .dsWatchFullscreenMovie #movieButtonBigPlay,
  .dsWatchFullscreenMovie #movieButtonForward10,
  .dsWatchFullscreenMovie #movieButtonSeekDock,
  .dsWatchFullscreenMovie #movieButtonQualityToggle,
  .dsWatchFullscreenMovie #movieButtonQualityMenu,
  .dsWatchFullscreenMovie #movieButtonSpeedToggle,
  .dsWatchFullscreenMovie #movieButtonSpeedMenu,
  .dsWatchFullscreenMovie #movieButtonVolumeToggle,
  .dsWatchFullscreenMovie #movieButtonVolumeMenu,
  .dsWatchFullscreenMovie .dsHlsStatus:not(.isError) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  body.swifly-player-live .dsProxyVideoWaitingCard {
    display: none !important;
  }

  .dsWatchFullscreenMovie .dsProxyVideoWaitingCard {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147481500 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-width: none !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #000 !important;
    box-shadow: none !important;
  }

  .dsWatchFullscreenMovie .plyr {
    --plyr-color-main: #e50914;
    --plyr-video-background: #000;
    --plyr-video-control-color: #fff;
    --plyr-video-control-background-hover: rgba(255,255,255,.15);
    --plyr-menu-background: rgba(13,14,18,.96);
    --plyr-menu-color: #fff;
    font-family: "Host Grotesk", Inter, system-ui, sans-serif !important;
  }

  .dsWatchFullscreenMovie .plyr__controls {
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    padding: 76px 24px max(18px, env(safe-area-inset-bottom)) !important;
    gap: 7px !important;
    background: linear-gradient(to top, rgba(0,0,0,.98), rgba(0,0,0,.62) 44%, transparent) !important;
  }

  .dsWatchFullscreenMovie .plyr__controls__item.plyr__progress__container {
    position: absolute !important;
    left: 24px !important;
    right: 24px !important;
    bottom: 66px !important;
    width: auto !important;
    margin: 0 !important;
  }

  .dsWatchFullscreenMovie .plyr__control--overlaid {
    width: 88px !important;
    height: 88px !important;
    padding: 26px !important;
    border: 1px solid rgba(255,255,255,.23) !important;
    border-radius: 999px !important;
    color: #fff !important;
    background: rgba(12,14,20,.72) !important;
    box-shadow: 0 22px 64px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.12) !important;
    backdrop-filter: blur(18px) saturate(1.15) !important;
  }

  .dsWatchFullscreenMovie .plyr__menu__container {
    border: 1px solid rgba(255,255,255,.12) !important;
    border-radius: 16px !important;
    background: rgba(13,14,18,.96) !important;
    box-shadow: 0 24px 70px rgba(0,0,0,.62) !important;
    backdrop-filter: blur(22px) saturate(1.12) !important;
  }

  #swiflyDirectBack {
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
    backdrop-filter: blur(16px) saturate(1.12) !important;
    cursor: pointer !important;
    font: 700 25px/1 system-ui, sans-serif !important;
    opacity: .76 !important;
  }

  #swiflyDirectBack:hover,
  #swiflyDirectBack:focus-visible {
    opacity: 1 !important;
    transform: scale(1.04) !important;
    outline: 2px solid rgba(255,255,255,.68) !important;
    outline-offset: 2px !important;
  }

  @media (max-width: 760px) {
    .dsWatchFullscreenMovie .plyr__controls {
      padding: 60px 8px max(8px, env(safe-area-inset-bottom)) !important;
      gap: 2px !important;
    }

    .dsWatchFullscreenMovie .plyr__controls__item.plyr__progress__container {
      left: 10px !important;
      right: 10px !important;
      bottom: 53px !important;
    }
  }
</style>
<script>
(function swiflyDirectWatchMount(){
  "use strict";

  function important(element, property, value) {
    if (element && element.style) element.style.setProperty(property, value, "important");
  }

  function fillViewport(element, zIndex) {
    if (!element) return;
    important(element, "position", "fixed");
    important(element, "inset", "0");
    important(element, "z-index", String(zIndex));
    important(element, "width", "100vw");
    important(element, "height", "100dvh");
    important(element, "min-width", "100vw");
    important(element, "min-height", "100dvh");
    important(element, "max-width", "none");
    important(element, "max-height", "none");
    important(element, "margin", "0");
    important(element, "padding", "0");
    important(element, "border", "0");
    important(element, "border-radius", "0");
    important(element, "outline", "0");
    important(element, "background", "#000");
    important(element, "box-shadow", "none");
    important(element, "overflow", "hidden");
    important(element, "transform", "none");
    important(element, "aspect-ratio", "auto");
  }

  function hide(selector) {
    document.querySelectorAll(selector).forEach(function(element) {
      important(element, "display", "none");
      important(element, "visibility", "hidden");
      important(element, "pointer-events", "none");
    });
  }

  function mount() {
    try {
      document.documentElement.classList.add("swifly-direct-watch");
      document.body.classList.add("swifly-direct-watch");

      [
        "body > .topbar",
        "body > .netflixTopbar",
        "body > .mobileNav",
        "body > .controlDock",
        "body > .controlPanel",
        "body > .footer",
        ".dsWatchHeader",
        ".dsWatchBg",
        ".dsWatchPlayerTop",
        ".dsWatchActions"
      ].forEach(hide);

      [
        ".dsWatchPage.dsWatchFullscreenMovie",
        ".dsWatchFullscreenMovie .dsWatchHero",
        ".dsWatchFullscreenMovie .dsWatchLayout",
        ".dsWatchFullscreenMovie .dsWatchPlayerCard",
        ".dsWatchFullscreenMovie .dsWatchFrame",
        ".dsWatchFullscreenMovie .dsWatchEmbedFrame"
      ].forEach(function(selector) {
        document.querySelectorAll(selector).forEach(function(element) {
          fillViewport(element, 2147480000);
        });
      });

      var waiting = document.querySelector(".dsProxyVideoWaitingShell");
      fillViewport(waiting, 2147481000);

      var shell = document.getElementById("movieButtonPlayerShell");
      var plyr = shell && shell.querySelector(".plyr");
      if (shell && !shell.hidden) {
        fillViewport(shell, 2147482000);
        document.body.classList.add("swifly-player-live");
      }
      if (plyr) {
        fillViewport(plyr, 2147482100);
        document.body.classList.add("swifly-player-live");
      }

      if (!document.getElementById("swiflyDirectBack")) {
        var back = document.createElement("button");
        back.id = "swiflyDirectBack";
        back.type = "button";
        back.setAttribute("aria-label", "Back to title");
        back.textContent = "←";
        back.addEventListener("click", function() {
          var match = window.location.pathname.match(/^\/watch\/(movie|tv)\/([^/?#]+)/);
          window.location.href = match ? "/" + match[1] + "/" + match[2] : "/";
        });
        document.body.appendChild(back);
      }
    } catch (error) {
      console.warn("[swifly-direct-watch] mount failed", error);
    }
  }

  function requestPlayerFullscreen(event) {
    var playButton = event.target && event.target.closest
      ? event.target.closest('[data-plyr="play"], .plyr__control--overlaid')
      : null;
    if (!playButton || document.fullscreenElement) return;

    var target = document.querySelector("#movieButtonPlayerShell .plyr") ||
      document.getElementById("movieButtonPlayerShell");
    if (!target || typeof target.requestFullscreen !== "function") return;

    target.requestFullscreen().catch(function(){});
    document.removeEventListener("click", requestPlayerFullscreen, true);
  }

  mount();
  document.addEventListener("DOMContentLoaded", mount, { once: true });
  document.addEventListener("click", requestPlayerFullscreen, true);

  var observer = new MutationObserver(mount);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "style"]
  });

  setTimeout(mount, 250);
  setTimeout(mount, 1000);
  setTimeout(mount, 2500);
  console.log("[swifly-direct-watch] Direct watch-page overlay mounted.");
})();
</script>`;

fs.readFileSync = function swiflyFullWindowRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  const watchBodyMarker =
    '  const body = `<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">';

  const replacement =
    `  const swiflyDirectWatchMarkup = isMovieMode ? ${JSON.stringify(directWatchMarkup)} : "";\n\n` +
    '  const body = `${swiflyDirectWatchMarkup}<main class="dsWatchPage ${isMovieMode ? "dsWatchFullscreenMovie dsWatchEmbedMode" : "dsWatchTrailerMode"}">';

  source = replaceRequired(
    source,
    watchBodyMarker,
    replacement,
    "watchPage body marker",
  );

  console.log("[cinepro-fullwindow] Direct CSS and DOM overlay injected into watchPage().");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-plyr.js");
