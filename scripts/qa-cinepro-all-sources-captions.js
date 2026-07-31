"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const allMedia = require("./start-cinepro-all-sources-captions-patch.js");
const directProxy = require("./start-cinepro-direct-source-proxy.js");
const sourceSpeed = require("./start-cinepro-source-speed.js");
const stableState = require("./start-cinepro-stable-playback-state-v2.js");

const root = path.resolve(__dirname, "..");
const cineproPath = path.join(root, "cinepro-client.js");
const plyrPath = path.join(__dirname, "start-cinepro-plyr.js");
const launcherPath = path.join(__dirname, "start-cinepro-all-sources-captions.js");

function requireMarkers(source, markers, label) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`[swifly-all-media-qa] Missing ${label} marker: ${marker}`);
    }
  }
}

const bridgedBase = allMedia.patchCineProClientAllMedia(fs.readFileSync(cineproPath, "utf8"));
const proxyAwareBase = directProxy.patchDirectSourceProxy(bridgedBase);
const sourceAware = sourceSpeed.patchCineProClient(proxyAwareBase);
const transformedClient = stableState.patchCineProClientState(sourceAware);
new vm.Script(transformedClient, { filename: cineproPath });

requireMarkers(transformedClient, [
  "const sourceOptions = candidates.map((candidate) => {",
  "function ensureCoreProxyTarget",
  "const playbackTarget = ensureCoreProxyTarget",
  "const subtitleTarget = ensureCoreProxyTarget",
  "const subtitleInputs = [",
  "item && item.subtitles",
  "item && item.captions",
  "item && item.subtitleTracks",
  'entry.kind === "subtitle"',
  'Content-Type", "text/vtt; charset=utf-8',
  "function subtitleBodyToVtt",
  "sourceCount: candidates.length",
  "subtitleCount: subtitles.length",
], "CinePro bridge");

if (transformedClient.includes("candidates.slice(0, 16)")) {
  throw new Error("[swifly-all-media-qa] The old 16-source cutoff survived.");
}

const executableClient = transformedClient +
  "\nmodule.exports.__swiflyCaptionTest = { subtitleBodyToVtt, detectSubtitleFormat, ensureCoreProxyTarget };\n";
const sandbox = {
  module: { exports: {} },
  exports: {},
  require,
  process,
  console,
  URL,
  Buffer,
  AbortController,
  fetch: global.fetch,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(executableClient, sandbox, { filename: "swifly-cinepro-caption-runtime.js" });
const captionTest = sandbox.module.exports.__swiflyCaptionTest;
if (!captionTest || typeof captionTest.subtitleBodyToVtt !== "function") {
  throw new Error("[swifly-all-media-qa] Caption converter was not executable.");
}

const directTarget = captionTest.ensureCoreProxyTarget("https://media.example/video.m3u8", { Referer: "https://media.example/" });
if (!directTarget.startsWith("/v1/proxy?data=")) {
  throw new Error("[swifly-all-media-qa] Direct media URL was not wrapped through CinePro Core.");
}

const srt = "1\n00:00:01,250 --> 00:00:03,500\nHello from SRT\n";
const convertedSrt = captionTest.subtitleBodyToVtt(srt, "srt");
if (!convertedSrt.startsWith("WEBVTT") || !convertedSrt.includes("00:00:01.250 --> 00:00:03.500")) {
  throw new Error("[swifly-all-media-qa] SRT was not converted into valid WebVTT timing.");
}

const ass = "[Events]\nDialogue: 0,0:00:01.20,0:00:02.50,Default,,0,0,0,,Hello\\Nworld\n";
const convertedAss = captionTest.subtitleBodyToVtt(ass, "ass");
if (!convertedAss.startsWith("WEBVTT") || !convertedAss.includes("Hello\nworld")) {
  throw new Error("[swifly-all-media-qa] ASS was not converted into WebVTT cues.");
}

const transformedPlyr = allMedia.patchPlyrAllCaptions(fs.readFileSync(plyrPath, "utf8"));
new vm.Script(transformedPlyr, { filename: plyrPath });
requireMarkers(transformedPlyr, [
  "subtitles.forEach(function(item, index)",
  'track.setAttribute("data-cinepro-track", "true")',
  'track.track.mode = "disabled"',
], "caption attachment");
if (transformedPlyr.includes("subtitles.slice(0, 24)")) {
  throw new Error("[swifly-all-media-qa] The old 24-caption cap survived.");
}

const launcher = fs.readFileSync(launcherPath, "utf8");
new vm.Script(launcher, { filename: launcherPath });
requireMarkers(launcher, [
  'process.env.CINEPRO_PROVIDER_ALLOWLIST = "*"',
  'require("./start-cinepro-all-sources-captions-patch.js")',
  'require("./start-cinepro-direct-source-proxy.js")',
  'require("./start-cinepro-stable-playback.js")',
  "stablePlayback.start()",
], "all-provider startup");

console.log("Swifly all-provider sources, direct Core proxying, and WebVTT caption bridge QA passed.");
