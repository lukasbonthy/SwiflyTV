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

function replaceRegexRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[cinepro-plyr] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

fs.readFileSync = function swiflyPlyrRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRegexRequired(
    source,
    /(\n[ \t]*function startVideoJsCinemaSource\(src,\s*data\)\s*\{)/,
    "$1\n          return startPlyrHlsSource(src, data);",
    "movie player entry point",
  );

  // Plyr remains responsible for its media/fullscreen API, but renders no stock UI.
  // The custom Swifly overlay is the only control surface.
  source = replaceRegexRequired(
    source,
    /new window\.Plyr\(video,\s*\{\s*controls:\s*\[[\s\S]*?\],\s*settings:\s*\[\s*"quality"\s*,\s*"speed"\s*\],/,
    `new window.Plyr(video, {
            controls: false,
            settings: [],
            hideControls: true,
            clickToPlay: true,
            seekTime: 10,
            storage: { enabled: true, key: "swifly-plyr" },
            captions: { active: false, language: "auto", update: true },`,
    "Plyr controls configuration",
  );

  source = replaceRegexRequired(
    source,
    /keyboard:\s*\{\s*focused:\s*true,\s*global:\s*false\s*\}/,
    'keyboard: { focused: true, global: true }',
    "Plyr keyboard configuration",
  );

  // Keep native controls only when Plyr failed to load. When Plyr is present, the
  // custom Swifly controls own the entire interface.
  source = replaceRegexRequired(
    source,
    /(function startPlyrHlsSource\(src,\s*data\)\s*\{[\s\S]*?video\.className\s*=\s*"dsMovieButtonVideo dsCinemaHlsVideo";\s*\n\s*)video\.controls\s*=\s*true;/,
    "$1video.controls = !plyrLoaded;",
    "native controls fallback",
  );

  // The old Swifly seek dock was still being installed beside the new control UI.
  // Remove every legacy seek-bar hook in this runtime build.
  source = source
    .replace(/^[ \t]*installCustomSeekBar\(\);\s*$/gm, "")
    .replace(/^[ \t]*setTimeout\(syncCustomSeekBar,\s*\d+\);\s*$/gm, "")
    .replace(/^[ \t]*movieButtonPlyr\.on\("(?:timeupdate|seeked|loadedmetadata|canplay)",\s*syncCustomSeekBar\);\s*$/gm, "");

  const subtitleCode = `
              Array.from(video.querySelectorAll("track[data-cinepro-track]"))
                .forEach(function(track){ try { track.remove(); } catch {} });
              var subtitles = Array.isArray(data && data.subtitles) ? data.subtitles : [];
              subtitles.slice(0, 24).forEach(function(item, index) {
                var url = item && item.url ? String(item.url) : "";
                if (!url) return;
                var track = document.createElement("track");
                track.setAttribute("data-cinepro-track", "true");
                track.kind = "subtitles";
                track.src = url;
                track.label = String((item && (item.label || item.language)) || ("Subtitle " + (index + 1)));
                track.srclang = String((item && item.language) || "und");
                video.appendChild(track);
              });
`;

  source = replaceRegexRequired(
    source,
    /(function startPlyrHlsSource\(src,\s*data\)\s*\{[\s\S]*?destroyRegularMoviePlayers\(\);\s*\n\s*try\s*\{)/,
    (match) => match + subtitleCode,
    "Plyr subtitle setup",
  );

  console.log("[cinepro-plyr] Stock Plyr, native, and legacy seek controls disabled; custom Swifly UI only.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
console.log("[cinepro-plyr] Plyr + HLS.js is the active movie engine.");
require("./start-cinepro.js");