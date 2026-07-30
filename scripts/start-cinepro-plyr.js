"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
require("dotenv").config({ path: path.join(root, ".env") });

process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "vixsrc,icefy";
process.env.CINEPRO_PROVIDER_ORDER = process.env.CINEPRO_PROVIDER_ORDER || "vixsrc,icefy";

const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[cinepro-plyr] Could not find ${label}; server.js was not modified.`);
  }
  return source.replace(needle, replacement);
}

fs.readFileSync = function swiflyPlyrRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  // The project already contains a complete Plyr + HLS.js implementation. Route the
  // active HLS flow into it instead of mounting the old Vidstack/Video.js hybrid.
  const playerFunction = "        function startVideoJsCinemaSource(src, data) {";
  source = replaceRequired(
    source,
    playerFunction,
    `${playerFunction}\n          return startPlyrHlsSource(src, data);`,
    "movie player entry point",
  );

  source = replaceRequired(
    source,
    `              "play",\n               "progress",`,
    `              "play",\n               "rewind",\n               "fast-forward",\n               "progress",`,
    "Plyr rewind controls",
  );

  source = replaceRequired(
    source,
    `              "volume",\n               "settings",`,
    `              "volume",\n               "captions",\n               "settings",`,
    "Plyr captions control",
  );

  source = replaceRequired(
    source,
    `            settings: ["quality", "speed"],\n            speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },`,
    `            settings: ["captions", "quality", "speed"],\n            seekTime: 10,\n            storage: { enabled: true, key: "swifly-plyr" },\n            speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },`,
    "Plyr settings",
  );

  // Add CinePro subtitle files directly to the native video before HLS.js attaches.
  const destroyMarker = `            destroyRegularMoviePlayers();\n\n            try {`;
  source = replaceRequired(
    source,
    destroyMarker,
    `            destroyRegularMoviePlayers();\n\n            try {\n              Array.from(video.querySelectorAll("track[data-cinepro-track]"))\n                .forEach(function(track){ try { track.remove(); } catch {} });\n              var subtitles = Array.isArray(data && data.subtitles) ? data.subtitles : [];\n              subtitles.slice(0, 24).forEach(function(item, index) {\n                var url = item && item.url ? String(item.url) : "";\n                if (!url) return;\n                var track = document.createElement("track");\n                track.setAttribute("data-cinepro-track", "true");\n                track.kind = "subtitles";\n                track.src = url;\n                track.label = String((item && (item.label || item.language)) || ("Subtitle " + (index + 1)));\n                track.srclang = String((item && item.language) || "und");\n                video.appendChild(track);\n              });\n            } catch {}\n\n            try {`,
    "Plyr subtitle setup",
  );

  const styleClose = "\n  </style>` : \"\",";
  const styleIndex = source.lastIndexOf(styleClose);
  if (styleIndex === -1) {
    throw new Error("[cinepro-plyr] Could not find final style block; server.js was not modified.");
  }

  const css = String.raw`

    /* ============================================================
       SWIFLY PLYR CINEMA PLAYER
       Real Plyr + HLS.js controls; no duplicate legacy overlays.
       ============================================================ */
    .dsVideoJsCinemaShell.usesPlyr {
      --plyr-color-main: #e50914;
      --plyr-video-background: #000;
      --plyr-video-control-color: rgba(255,255,255,.96);
      --plyr-video-control-background-hover: rgba(255,255,255,.13);
      --plyr-menu-background: rgba(13,16,25,.96);
      --plyr-menu-color: rgba(255,255,255,.92);
      --plyr-tooltip-background: rgba(248,250,255,.96);
      --plyr-tooltip-color: #0a0d15;
      width: min(100%, 1540px, 160svh) !important;
      height: auto !important;
      min-height: 0 !important;
      aspect-ratio: 16 / 9 !important;
      margin-inline: auto !important;
      overflow: hidden !important;
      border-radius: 24px !important;
      background: #000 !important;
      outline: 1px solid rgba(255,255,255,.11) !important;
      box-shadow: 0 32px 100px rgba(0,0,0,.58), 0 0 58px rgba(229,9,20,.08) !important;
    }

    .dsVideoJsCinemaShell.usesPlyr::after {
      opacity: .22 !important;
      background: linear-gradient(to top, rgba(0,0,0,.38), transparent 26%) !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .dsCinemaPlayerAura,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsTop,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsCenter,
    .dsVideoJsCinemaShell.usesPlyr .dsCinemaSeekDock,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsQuality,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsSpeed,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsVolume,
    .dsVideoJsCinemaShell.usesPlyr .swiflyVideoDock,
    .dsVideoJsCinemaShell.usesPlyr .swiflyNeoDock,
    .dsVideoJsCinemaShell.usesPlyr .dsVideoJsTimelinePreview {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .dsVideoJsCinemaShell.usesPlyr.isReady .dsHlsStatus:not(.isError),
    .dsVideoJsCinemaShell.usesPlyr.isPlaying .dsHlsStatus:not(.isError) {
      display: none !important;
    }

    .dsVideoJsCinemaShell.usesPlyr > .plyr,
    .dsVideoJsCinemaShell.usesPlyr .plyr--video,
    .dsVideoJsCinemaShell.usesPlyr .plyr__video-wrapper {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      border-radius: inherit !important;
      overflow: hidden !important;
      background: #000 !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr video {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: 50% 50% !important;
      background: #000 !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__controls {
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      gap: 5px !important;
      padding: 28px 18px 15px !important;
      background: linear-gradient(to top, rgba(0,0,0,.96), rgba(0,0,0,.52) 58%, transparent) !important;
      backdrop-filter: none !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__control {
      border-radius: 11px !important;
      transition: transform .16s ease, background .16s ease, color .16s ease !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__control:hover,
    .dsVideoJsCinemaShell.usesPlyr .plyr__control:focus-visible {
      transform: translateY(-1px) !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__control--overlaid {
      width: 78px !important;
      height: 78px !important;
      padding: 23px !important;
      border: 1px solid rgba(255,255,255,.24) !important;
      background: linear-gradient(145deg, #f32631, #b90711) !important;
      box-shadow: 0 20px 54px rgba(229,9,20,.34), 0 0 0 1px rgba(255,255,255,.12) inset !important;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__progress__buffer,
    .dsVideoJsCinemaShell.usesPlyr .plyr__progress input[type="range"] {
      border-radius: 999px !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__progress input[type="range"] {
      height: 22px !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__menu__container {
      border: 1px solid rgba(255,255,255,.12) !important;
      border-radius: 16px !important;
      background: rgba(13,16,25,.96) !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.56) !important;
      backdrop-filter: blur(22px) saturate(1.12) !important;
      -webkit-backdrop-filter: blur(22px) saturate(1.12) !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__tooltip {
      border-radius: 999px !important;
      padding: 6px 9px !important;
      font-weight: 700 !important;
    }

    .dsVideoJsCinemaShell.usesPlyr .plyr__captions {
      bottom: 76px !important;
      font-size: clamp(17px, 2vw, 30px) !important;
      line-height: 1.3 !important;
      text-shadow: 0 2px 7px rgba(0,0,0,.96) !important;
    }

    .dsVideoJsCinemaShell.usesPlyr:fullscreen,
    .dsVideoJsCinemaShell.usesPlyr:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      aspect-ratio: auto !important;
      border-radius: 0 !important;
    }

    @media(max-width: 900px) {
      .dsVideoJsCinemaShell.usesPlyr {
        width: 100% !important;
        aspect-ratio: 16 / 9 !important;
        border-radius: 16px !important;
      }
      .dsVideoJsCinemaShell.usesPlyr .plyr__controls {
        padding: 22px 8px 8px !important;
        gap: 1px !important;
      }
      .dsVideoJsCinemaShell.usesPlyr .plyr__control--overlaid {
        width: 64px !important;
        height: 64px !important;
        padding: 19px !important;
      }
    }
`;

  source = source.slice(0, styleIndex) + css + source.slice(styleIndex);
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
console.log("[cinepro-plyr] Plyr + HLS.js is now the active movie player.");
console.log("[cinepro-plyr] Rewind, fast-forward, captions, quality, speed, PiP, and fullscreen enabled.");
require("./start-cinepro.js");
