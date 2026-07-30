"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let layoutPatched = false;

fs.readFileSync = function swiflyLayoutRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (layoutPatched || resolved !== serverPath) return result;

  layoutPatched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  const desktopSize = `      height: clamp(380px, 74vh, 860px) !important;
      min-height: clamp(380px, 74vh, 860px) !important;`;
  const desktopSizeFixed = `      width: min(100%, 1600px, 160svh) !important;
      height: auto !important;
      min-height: 0 !important;
      aspect-ratio: 16 / 9 !important;
      margin-inline: auto !important;`;

  const mobileSize = `        height: clamp(300px, 58vh, 640px) !important;
        min-height: clamp(300px, 58vh, 640px) !important;`;
  const mobileSizeFixed = `        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        aspect-ratio: 16 / 9 !important;`;

  const controlsMarker = "    .dsVideoJsCinemaShell.v149Vidstack media-video-layout {";
  const controlsPolish = `    /* CinePro cinema fit/alignment patch. Keep only the active Vidstack UI. */
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonBack10,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonBigPlay,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonForward10,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSeekDock,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonQualityToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonQualityMenu,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSpeedToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSpeedMenu,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonVolumeToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonVolumeMenu {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack.v149Ready .dsHlsStatus:not(.isError),
    .dsVideoJsCinemaShell.v149Vidstack.v149Playing .dsHlsStatus:not(.isError) {
      display: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer,
    .dsVideoJsCinemaShell.v149Vidstack media-provider,
    .dsVideoJsCinemaShell.v149Vidstack [data-media-provider],
    .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
      width: 100% !important;
      height: 100% !important;
      inset: 0 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls"],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-media-controls],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-controls] {
      padding: 0 14px 12px !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 14px !important;
    }

`;

  if (!source.includes(desktopSize)) throw new Error("[cinepro] Could not find desktop player sizing CSS.");
  if (!source.includes(mobileSize)) throw new Error("[cinepro] Could not find mobile player sizing CSS.");
  if (!source.includes("      object-fit: cover !important;")) throw new Error("[cinepro] Could not find video object-fit CSS.");
  if (!source.includes(controlsMarker)) throw new Error("[cinepro] Could not find Vidstack layout marker.");

  source = source.replace(desktopSize, desktopSizeFixed);
  source = source.replace(mobileSize, mobileSizeFixed);
  source = source.replace("      object-fit: cover !important;", "      object-fit: contain !important;");
  source = source.replace(controlsMarker, controlsPolish + controlsMarker);

  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

console.log("[cinepro] Centered 16:9 cinema layout and contain-fit video enabled.");
require("./start-cinepro-preferred.js");
