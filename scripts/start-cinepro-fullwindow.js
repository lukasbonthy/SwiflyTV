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

fs.readFileSync = function swiflyFullWindowRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  const pageStyleMarker = "\n</style>\n\n    <script>\n      window.syncWatchButtons";
  const styleIndex = source.indexOf(pageStyleMarker);
  if (styleIndex === -1) {
    throw new Error("[cinepro-fullwindow] Could not find the real pageShell stylesheet; server.js was not modified.");
  }

  const css = String.raw`

    /* ============================================================
       SWIFLY FULL-VIEWPORT WATCH PLAYER
       Applied in the real pageShell stylesheet, not a nested template.
       ============================================================ */
    html.swifly-watch-fullwindow,
    body.swifly-watch-fullwindow {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: #000 !important;
      overscroll-behavior: none;
    }

    body.swifly-watch-fullwindow::before,
    body.swifly-watch-fullwindow::after,
    body.swifly-watch-fullwindow .topbar,
    body.swifly-watch-fullwindow .netflixTopbar,
    body.swifly-watch-fullwindow .mobileNav,
    body.swifly-watch-fullwindow .controlDock,
    body.swifly-watch-fullwindow .controlPanel,
    body.swifly-watch-fullwindow .footer,
    body.swifly-watch-fullwindow .dsWatchHeader,
    body.swifly-watch-fullwindow .dsWatchBg,
    body.swifly-watch-fullwindow .dsWatchHero::before,
    body.swifly-watch-fullwindow .dsWatchPlayerTop,
    body.swifly-watch-fullwindow .dsWatchActions {
      display: none !important;
    }

    body.swifly-watch-fullwindow .dsWatchPage,
    body.swifly-watch-fullwindow .dsWatchHero,
    body.swifly-watch-fullwindow .dsWatchLayout,
    body.swifly-watch-fullwindow .dsWatchPlayerCard,
    body.swifly-watch-fullwindow .dsWatchFrame,
    body.swifly-watch-fullwindow .dsWatchEmbedFrame {
      position: fixed !important;
      inset: 0 !important;
      z-index: 1 !important;
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

    body.swifly-watch-fullwindow .dsProxyVideoWaitingShell,
    body.swifly-watch-fullwindow #movieButtonPlayerShell,
    body.swifly-watch-fullwindow .dsMovieButtonPlayerShell,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr > .plyr,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr .plyr--video,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr .plyr__video-wrapper {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-width: 100% !important;
      min-height: 100% !important;
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

    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr .plyr video,
    body.swifly-watch-fullwindow .dsVideoJsCinemaShell.usesPlyr video {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: 50% 50% !important;
      background: #000 !important;
    }

    body.swifly-watch-fullwindow .dsCinemaPlayerAura,
    body.swifly-watch-fullwindow .dsCinemaHlsTop,
    body.swifly-watch-fullwindow .dsVideoJsTop,
    body.swifly-watch-fullwindow .dsVideoJsCenter,
    body.swifly-watch-fullwindow .dsCinemaHlsHint,
    body.swifly-watch-fullwindow .dsVideoJsHint,
    body.swifly-watch-fullwindow .dsCinemaSeekDock,
    body.swifly-watch-fullwindow .dsVideoJsQuality,
    body.swifly-watch-fullwindow .dsVideoJsSpeed,
    body.swifly-watch-fullwindow .dsVideoJsVolume,
    body.swifly-watch-fullwindow .dsVideoJsTimelinePreview,
    body.swifly-watch-fullwindow .swiflyVideoDock,
    body.swifly-watch-fullwindow .swiflyNeoDock,
    body.swifly-watch-fullwindow #movieButtonBack10,
    body.swifly-watch-fullwindow #movieButtonBigPlay,
    body.swifly-watch-fullwindow #movieButtonForward10,
    body.swifly-watch-fullwindow #movieButtonSeekDock,
    body.swifly-watch-fullwindow #movieButtonQualityToggle,
    body.swifly-watch-fullwindow #movieButtonQualityMenu,
    body.swifly-watch-fullwindow #movieButtonSpeedToggle,
    body.swifly-watch-fullwindow #movieButtonSpeedMenu,
    body.swifly-watch-fullwindow #movieButtonVolumeToggle,
    body.swifly-watch-fullwindow #movieButtonVolumeMenu {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    body.swifly-watch-fullwindow.swifly-player-mounted .dsProxyVideoWaitingCard,
    body.swifly-watch-fullwindow .dsHlsStatus:not(.isError) {
      display: none !important;
    }

    body.swifly-watch-fullwindow .dsProxyVideoWaitingCard {
      position: absolute !important;
      inset: 0 !important;
      z-index: 50 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: #000 !important;
      box-shadow: none !important;
    }

    body.swifly-watch-fullwindow .plyr {
      --plyr-color-main: #e50914;
      --plyr-video-background: #000;
      --plyr-video-control-color: #fff;
      --plyr-video-control-background-hover: rgba(255,255,255,.14);
      --plyr-menu-background: rgba(14,14,18,.96);
      --plyr-menu-color: #fff;
      font-family: "Host Grotesk", Inter, system-ui, sans-serif !important;
    }

    body.swifly-watch-fullwindow .plyr__controls {
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      padding: 72px 24px max(18px, env(safe-area-inset-bottom)) !important;
      gap: 7px !important;
      background: linear-gradient(to top, rgba(0,0,0,.96), rgba(0,0,0,.58) 48%, transparent) !important;
    }

    body.swifly-watch-fullwindow .plyr__controls__item.plyr__progress__container {
      position: absolute !important;
      left: 24px !important;
      right: 24px !important;
      bottom: 64px !important;
      width: auto !important;
      margin: 0 !important;
    }

    body.swifly-watch-fullwindow .plyr__progress input[type="range"] {
      height: 24px !important;
    }

    body.swifly-watch-fullwindow .plyr__control {
      border-radius: 10px !important;
    }

    body.swifly-watch-fullwindow .plyr__control--overlaid {
      width: 86px !important;
      height: 86px !important;
      padding: 25px !important;
      border: 1px solid rgba(255,255,255,.24) !important;
      border-radius: 999px !important;
      color: #fff !important;
      background: rgba(13,15,22,.72) !important;
      box-shadow: 0 20px 60px rgba(0,0,0,.54), inset 0 1px 0 rgba(255,255,255,.12) !important;
      backdrop-filter: blur(18px) saturate(1.15);
      -webkit-backdrop-filter: blur(18px) saturate(1.15);
    }

    body.swifly-watch-fullwindow .plyr__menu__container {
      border: 1px solid rgba(255,255,255,.12) !important;
      border-radius: 16px !important;
      background: rgba(14,14,18,.96) !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.62) !important;
      backdrop-filter: blur(22px) saturate(1.12);
      -webkit-backdrop-filter: blur(22px) saturate(1.12);
    }

    body.swifly-watch-fullwindow .plyr__captions {
      bottom: 94px !important;
      font-size: clamp(18px, 2.1vw, 34px) !important;
      line-height: 1.3 !important;
      text-shadow: 0 2px 8px rgba(0,0,0,.98) !important;
    }

    #swiflyWatchBack {
      position: fixed;
      top: max(14px, env(safe-area-inset-top));
      left: max(14px, env(safe-area-inset-left));
      z-index: 2147483647;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px;
      color: #fff;
      background: rgba(10,12,18,.62);
      box-shadow: 0 14px 38px rgba(0,0,0,.34);
      backdrop-filter: blur(16px) saturate(1.12);
      -webkit-backdrop-filter: blur(16px) saturate(1.12);
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      opacity: .72;
      transition: opacity .16s ease, transform .16s ease, background .16s ease;
    }

    #swiflyWatchBack:hover,
    #swiflyWatchBack:focus-visible {
      opacity: 1;
      transform: scale(1.04);
      background: rgba(18,20,28,.88);
      outline: 2px solid rgba(255,255,255,.62);
      outline-offset: 2px;
    }

    body.swifly-watch-fullwindow .dsWatchEpisodePicker {
      position: fixed !important;
      top: 14px !important;
      left: 72px !important;
      right: 72px !important;
      z-index: 2147483000 !important;
      max-width: min(980px, calc(100vw - 144px)) !important;
      margin: 0 auto !important;
      opacity: 0 !important;
      transform: translateY(-8px) !important;
      transition: opacity .18s ease, transform .18s ease !important;
    }

    body.swifly-watch-fullwindow:hover .dsWatchEpisodePicker,
    body.swifly-watch-fullwindow .dsWatchEpisodePicker:focus-within {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    @media (max-width: 760px) {
      body.swifly-watch-fullwindow .plyr__controls {
        padding: 58px 8px max(8px, env(safe-area-inset-bottom)) !important;
        gap: 2px !important;
      }

      body.swifly-watch-fullwindow .plyr__controls__item.plyr__progress__container {
        left: 10px !important;
        right: 10px !important;
        bottom: 52px !important;
      }

      body.swifly-watch-fullwindow .plyr__control--overlaid {
        width: 70px !important;
        height: 70px !important;
        padding: 20px !important;
      }

      #swiflyWatchBack {
        width: 40px;
        height: 40px;
        font-size: 21px;
      }
    }
  `;

  source = source.slice(0, styleIndex) + css + source.slice(styleIndex);

  const bodyMarker = "</head>\n<body>\n\n  <script>\n    (function swiflytvAuthRequired(){";
  const bootScript = `</head>
<body>
  <script>
    (function swiflyFullWindowBoot(){
      try {
        var params = new URLSearchParams(window.location.search || "");
        var isMovieWatch = /^\\/watch\\/(?:movie|tv)\\//.test(window.location.pathname || "") &&
          params.get("mode") !== "trailer";
        if (!isMovieWatch) return;

        document.documentElement.classList.add("swifly-watch-fullwindow");
        document.body.classList.add("swifly-watch-fullwindow");

        function mountFullWindowUi() {
          document.documentElement.classList.add("swifly-watch-fullwindow");
          document.body.classList.add("swifly-watch-fullwindow");

          if (!document.getElementById("swiflyWatchBack")) {
            var back = document.createElement("button");
            back.id = "swiflyWatchBack";
            back.type = "button";
            back.setAttribute("aria-label", "Back to title");
            back.innerHTML = '<span aria-hidden="true">←</span>';
            back.addEventListener("click", function() {
              var match = window.location.pathname.match(/^\\/watch\\/(movie|tv)\\/([^/?#]+)/);
              window.location.href = match ? "/" + match[1] + "/" + match[2] : "/";
            });
            document.body.appendChild(back);
          }

          function syncMountedState() {
            var shell = document.getElementById("movieButtonPlayerShell");
            var activePlyr = shell && shell.querySelector(".plyr");
            var mounted = Boolean(shell && !shell.hidden && (shell.classList.contains("usesPlyr") || activePlyr));
            document.body.classList.toggle("swifly-player-mounted", mounted);
          }

          syncMountedState();
          var observer = new MutationObserver(syncMountedState);
          observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "hidden"]
          });
          setTimeout(syncMountedState, 250);
          setTimeout(syncMountedState, 1200);
          setTimeout(syncMountedState, 3000);
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", mountFullWindowUi, { once: true });
        } else {
          mountFullWindowUi();
        }
      } catch (error) {
        console.warn("[cinepro-fullwindow] Browser boot failed", error);
      }
    })();
  </script>

  <script>
    (function swiflytvAuthRequired(){`;

  source = replaceRequired(source, bodyMarker, bootScript, "pageShell body boot marker");

  console.log("[cinepro-fullwindow] Real pageShell CSS and body class injected.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-plyr.js");
