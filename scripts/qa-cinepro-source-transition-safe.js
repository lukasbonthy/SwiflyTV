"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("./cinepro-source-transition-core.js");
const transition = require("./start-cinepro-source-transition-safe.js");

function requireMarkers(source, markers, label) {
  for (const marker of markers) {
    if (!String(source).includes(marker)) {
      throw new Error(`[swifly-source-transition-qa] Missing ${label} marker: ${marker}`);
    }
  }
}

const serverFixture = `
let movieButtonHls = null;
function startPlyrHlsSource(src, data) {
  var video = document.createElement("video");
  var url = String(src || "");
  if (movieButtonHls) {
    try { movieButtonHls.destroy(); } catch {}
    movieButtonHls = null;
  }
  if (window.Hls && Hls.isSupported()) {
    movieButtonHls = new Hls({});
    movieButtonHls.loadSource(url);
    movieButtonHls.attachMedia(video);
    movieButtonHls.on(Hls.Events.MANIFEST_PARSED, function() {
      video.play();
    });
    movieButtonHls.on(Hls.Events.ERROR, function(event, errorData) {
      console.error(errorData);
    });
  } else {
    video.src = url;
    video.load();
  }
}
`;

const patchedServer = core.patchPlyrServerSource(serverFixture);
requireMarkers(patchedServer, [
  "movieButtonHls.stopLoad()",
  "movieButtonHls.detachMedia()",
  'video.removeAttribute("src")',
  "Hls.Events.MEDIA_ATTACHED",
  "sourceHls.loadSource(url)",
  "window.__swiflySourceToken",
  "video.currentSrc || url",
], "server lifecycle");
if (/movieButtonHls\.loadSource\(url\);\s*movieButtonHls\.attachMedia\(video\);/.test(patchedServer)) {
  throw new Error("[swifly-source-transition-qa] Unsafe HLS load/attach order survived.");
}

const plyrPath = path.join(__dirname, "start-cinepro-plyr.js");
const patchedPlyrWrapper = transition.patchPlyrWrapper(fs.readFileSync(plyrPath, "utf8"));
new vm.Script(patchedPlyrWrapper, { filename: plyrPath });
requireMarkers(patchedPlyrWrapper, [
  'require("./cinepro-source-transition-core.js")',
  "sourceTransitionCore.patchPlyrServerSource(source)",
], "Plyr wrapper");

const sourceSpeedPath = path.join(__dirname, "start-cinepro-source-speed.js");
const patchedSourceSpeed = transition.patchSourceSpeedWrapper(fs.readFileSync(sourceSpeedPath, "utf8"));
new vm.Script(patchedSourceSpeed, { filename: sourceSpeedPath });
const stableStateHandoffAnchor = "            startPlyrHlsSource(String(selected.playbackUrl), nextData);";
requireMarkers(patchedSourceSpeed, [
  "retainedSourceOptions",
  "retainedSubtitles",
  "window.__swiflySourceOptions",
  "window.__swiflySubtitleOptions",
  "activeSourceData = nextData",
  "window.__swiflyActiveSourceData = nextData",
  "window.__swiflySelectedSourceId = nextData.selectedSourceId",
  'source.setAttribute("aria-busy", "true")',
  'media.addEventListener("canplay", finishSourceTransition',
  stableStateHandoffAnchor,
], "Source handoff");
if (!patchedSourceSpeed.includes(stableStateHandoffAnchor)) {
  throw new Error("[swifly-source-transition-qa] Stable-state Source handoff anchor disappeared.");
}
if (patchedSourceSpeed.includes("return startPlyrHlsSource(String(selected.playbackUrl), nextData)")) {
  throw new Error("[swifly-source-transition-qa] Incompatible returned Source handoff survived.");
}

console.log("Swifly safe HLS/direct Source transition and stable-state composition QA passed.");
