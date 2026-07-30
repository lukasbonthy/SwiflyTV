"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

fs.readFileSync = function swiflyFullWindowRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");
  const styleClose = "\n  </style>` : \"\",";
  const styleIndex = source.lastIndexOf(styleClose);
  if (styleIndex === -1) {
    throw new Error("[cinepro-fullwindow] Could not find the final CSS block; server.js was not modified.");
  }

  const css = String.raw`

    /* ============================================================
       FULL-WINDOW WATCH EXPERIENCE
       The real player fills the viewport instead of sitting in a card.
       ============================================================ */
    html:has(.dsWatchFullscreenMovie),
    body:has(.dsWatchFullscreenMovie) {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      overflow: hidden !important;
      background: #000 !important;
    }

    body:has(.dsWatchFullscreenMovie)::before,
    body:has(.dsWatchFullscreenMovie)::after,
    body:has(.dsWatchFullscreenMovie) .topbar,
    body:has(.dsWatchFullscreenMovie) .netflixTopbar,
    body:has(.dsWatchFullscreenMovie) .mobileNav,
    body:has(.dsWatchFullscreenMovie) .controlDock,
    body:has(.dsWatchFullscreenMovie) .controlPanel,
    body:has(.dsWatchFullscreenMovie) .footer {
      display: none !important;
    }

    .dsWatchPage.dsWatchFullscreenMovie,
    .dsWatchFullscreenMovie .dsWatchHero,
    .dsWatchFullscreenMovie .dsWatchLayout,
    .dsWatchFullscreenMovie .dsWatchPlayerCard {
      position: relative !important;
      width: 100vw !important;
      height: 100svh !important;
      min-width: 100vw !important;
      min-height: 100svh !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: #000 !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    .dsWatchFullscreenMovie .dsWatchBg,
    .dsWatchFullscreenMovie .dsWatchHero::before,
    .dsWatchFullscreenMovie .dsWatchPlayerTop,
    .dsWatchFullscreenMovie .dsWatchActions {
      display: none !important;
    }

    .dsWatchFullscreenMovie .dsWatchHeader {
      position: fixed !important;
      inset: 0 0 auto 0 !important;
      z-index: 1000 !important;
      min-height: 76px !important;
      margin: 0 !important;
      padding: 16px clamp(14px, 2.5vw, 32px) 30px !important;
      border: 0 !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.84), rgba(0,0,0,.28) 62%, transparent) !important;
      pointer-events: none !important;
    }

    .dsWatchFullscreenMovie .dsWatchHeader > * {
      pointer-events: auto !important;
    }

    .dsWatchFullscreenMovie .dsWatchFrame,
    .dsWatchFullscreenMovie .dsWatchEmbedFrame {
      position: fixed !important;
      inset: 0 !important;
      z-index: 1 !important;
      width: 100vw !important;
      height: 100svh !important;
      min-width: 100vw !important;
      min-height: 100svh !important;
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
    }

    .dsWatchFullscreenMovie .dsProxyVideoWaitingShell,
    .dsWatchFullscreenMovie .dsMovieButtonPlayerShell,
    .dsWatchFullscreenMovie .dsVideoJsCinemaShell,
    .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr,
    .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr > .plyr,
    .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr .plyr--video,
    .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr .plyr__video-wrapper {
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
    }

    .dsWatchFullscreenMovie .dsVideoJsCinemaShell.usesPlyr .plyr video {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: 50% 50% !important;
      background: #000 !important;
    }

    .dsWatchFullscreenMovie .dsProxyVideoWaitingCard {
      position: absolute !important;
      inset: 0 !important;
      z-index: 20 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: radial-gradient(circle at 50% 42%, rgba(229,9,20,.10), transparent 32%), #000 !important;
      box-shadow: none !important;
    }

    .dsWatchFullscreenMovie .dsProxyVideoWaitingShell.isReady .dsProxyVideoWaitingCard,
    .dsWatchFullscreenMovie .dsProxyVideoWaitingShell:has(.usesPlyr) .dsProxyVideoWaitingCard {
      display: none !important;
    }

    .dsWatchFullscreenMovie .dsWatchEpisodePicker {
      position: fixed !important;
      top: 78px !important;
      left: 18px !important;
      right: 18px !important;
      z-index: 900 !important;
      max-width: min(920px, calc(100vw - 36px)) !important;
      margin: 0 auto !important;
      opacity: 0 !important;
      transform: translateY(-8px) !important;
      transition: opacity .18s ease, transform .18s ease !important;
    }

    .dsWatchFullscreenMovie:hover .dsWatchEpisodePicker,
    .dsWatchFullscreenMovie .dsWatchEpisodePicker:focus-within {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    .dsWatchFullscreenMovie .plyr__controls {
      padding: 42px 22px max(18px, env(safe-area-inset-bottom)) !important;
    }

    .dsWatchFullscreenMovie .plyr--fullscreen-active,
    .dsWatchFullscreenMovie .plyr:fullscreen {
      width: 100vw !important;
      height: 100vh !important;
      border-radius: 0 !important;
    }

    @media (max-width: 760px) {
      .dsWatchFullscreenMovie .dsWatchHeader {
        min-height: 62px !important;
        padding: 10px 10px 22px !important;
      }

      .dsWatchFullscreenMovie .dsWatchEpisodePicker {
        top: 64px !important;
      }

      .dsWatchFullscreenMovie .plyr__controls {
        padding: 30px 8px max(8px, env(safe-area-inset-bottom)) !important;
      }
    }
  `;

  source = source.slice(0, styleIndex) + css + source.slice(styleIndex);
  console.log("[cinepro-fullwindow] Watch player now fills the entire browser viewport.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-plyr.js");
