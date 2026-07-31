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

function verifyCommonLifecycle(source, label) {
  new vm.Script(source, { filename: `swifly-${label}-server.js` });
  requireMarkers(source, [
    "movieButtonHls.stopLoad()",
    "movieButtonHls.detachMedia()",
    'video.removeAttribute("src")',
    "var sourceHls = movieButtonHls",
    "window.__swiflySourceToken",
    "movieButtonHls !== sourceHls",
    "video.currentSrc || url",
  ], label);
  if (!core.isFullyPatched(source)) {
    throw new Error(`[swifly-source-transition-qa] ${label} was not recognized as fully guarded.`);
  }
}

const classicServerFixture = `
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

const patchedClassicServer = core.patchPlyrServerSource(classicServerFixture);
verifyCommonLifecycle(patchedClassicServer, "classic HLS lifecycle");
requireMarkers(patchedClassicServer, [
  "Hls.Events.MEDIA_ATTACHED",
  "sourceHls.loadSource(url)",
  "sourceHls.attachMedia(video)",
], "classic attach-on-ready lifecycle");

// Runtime wrappers can alter the order and insert statements between attach,
// load, and event registration. This mirrors the startup shape that previously
// passed isolated QA and then failed inside npm start.
const transformedServerFixture = `
let movieButtonHls = null;
function startPlyrHlsSource(src, data) {
  var video = document.createElement("video");
  var url = String(src || "");
  if (movieButtonHls) {
    try { movieButtonHls.destroy(); } catch {}
    movieButtonHls = null;
  }
  if (window.Hls && window.Hls.isSupported()) {
    movieButtonHls = new window.Hls({});
    movieButtonHls.attachMedia(video);
    var startupMarker = "already transformed";
    movieButtonHls.loadSource(url);
    movieButtonHls.on(window.Hls.Events.MANIFEST_PARSED, function(event, manifestData) {
      if (startupMarker) video.play();
    });
    movieButtonHls.on(window.Hls.Events.ERROR, function(event, errorData) {
      console.error(errorData);
    });
  } else {
    video.src = url;
    video.load();
  }
}
`;

const patchedTransformedServer = core.patchPlyrServerSource(transformedServerFixture);
verifyCommonLifecycle(patchedTransformedServer, "transformed HLS lifecycle");
requireMarkers(patchedTransformedServer, [
  "movieButtonHls.attachMedia(video)",
  "movieButtonHls.loadSource(url)",
  "sourceHls.on(window.Hls.Events.MANIFEST_PARSED",
  "sourceHls.on(window.Hls.Events.ERROR",
], "transformed lifecycle preservation");

const patchedTwice = core.patchPlyrServerSource(patchedTransformedServer);
if (patchedTwice !== patchedTransformedServer) {
  throw new Error("[swifly-source-transition-qa] Reapplying the lifecycle patch changed already-safe code.");
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

console.log("Swifly transformed-runtime HLS transition and persistent-option QA passed.");
