"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRegexRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[cinepro-controls] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

fs.readFileSync = function swiflyVisibleControlsRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRegexRequired(
    source,
    /new\s+window\.Plyr\(video,\s*\{/,
    (match) => `${match}\n                hideControls: false,`,
    "Plyr constructor",
  );

  const pageStyleMarker = "\n</style>\n\n    <script>\n      window.syncWatchButtons";
  const styleIndex = source.indexOf(pageStyleMarker);
  if (styleIndex === -1) {
    throw new Error("[cinepro-controls] Could not find pageShell stylesheet; server.js was not modified.");
  }

  const css = String.raw`

    /* Keep the fullscreen Plyr controls above the video and usable. */
    body.swifly-watch-safe #movieButtonPlayerShell .plyr__video-wrapper,
    body.swifly-watch-safe #movieButtonPlayerShell video {
      z-index: 0 !important;
    }

    body.swifly-watch-safe #movieButtonPlayerShell .plyr__controls,
    body.swifly-watch-safe #movieButtonPlayerShell .plyr--hide-controls .plyr__controls,
    body.swifly-watch-safe #movieButtonPlayerShell .plyr--playing .plyr__controls {
      position: absolute !important;
      z-index: 50 !important;
      display: flex !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      transform: translateY(0) !important;
    }

    body.swifly-watch-safe #movieButtonPlayerShell .plyr__control--overlaid {
      z-index: 51 !important;
      display: inline-flex !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    body.swifly-watch-safe #movieButtonPlayerShell .plyr__progress,
    body.swifly-watch-safe #movieButtonPlayerShell .plyr__controls button,
    body.swifly-watch-safe #movieButtonPlayerShell .plyr__controls input {
      pointer-events: auto !important;
    }
  `;

  source = source.slice(0, styleIndex) + css + source.slice(styleIndex);
  console.log("[cinepro-controls] Plyr controls forced visible above the fullscreen video.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-fullscreen-safe.js");
