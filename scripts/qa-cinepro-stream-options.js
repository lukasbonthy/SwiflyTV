"use strict";

const fs = require("fs");
const path = require("path");
const {
  patchCineProClient,
  patchCustomControls,
  patchLanguages,
  patchTheme,
  patchCinema,
} = require("./start-cinepro-stream-options.js");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

const patchedClient = patchCineProClient(read("../cinepro-client.js"));
const patchedControls = patchCustomControls(read("start-cinepro-custom-controls.js"));
const patchedLanguages = patchLanguages(read("start-cinepro-languages.js"));
const patchedTheme = patchTheme(read("start-cinepro-theme-unified.js"));
const patchedCinema = patchCinema(read("start-cinepro-settings-cinema.js"));

const groups = [
  ["client", patchedClient, [
    "const sourceOptions = candidates.slice(0, 16)",
    "selectedSourceId: sourceOptions[0]",
    "sourceOptions,",
  ]],
  ["controls", patchedControls, [
    "mountSwiflyControls(player, media, hlsInstance, sourceData)",
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, data)",
    '<option value="1.75">1.75×</option>',
    '<option value="4">4×</option>',
    "__swiflyControlGeneration",
    "function commitScrub()",
  ]],
  ["languages", patchedLanguages, [
    '<span>Source</span><select data-s="source">',
    "function fillSourceOptions()",
    "function switchCineProSource(sourceId)",
    "function fillQualityOptions()",
    "levels.forEach(function(level, index)",
    "function nativeCaptionTracks()",
    "Array.from(media.textTracks || [])",
    "hlsEvents.LEVELS_UPDATED",
    "hlsEvents.LEVEL_SWITCHED",
    "hlsEvents.NON_NATIVE_TEXT_TRACKS_FOUND",
    "media.addEventListener(\"ratechange\"",
  ]],
  ["theme", patchedTheme, [
    '{ key: "source", label: "Source"',
  ]],
  ["cinema", patchedCinema, [
    "grid-template-columns:repeat(5,minmax(96px,1fr))",
    "grid-template-columns:repeat(auto-fit,minmax(92px,1fr))",
    ".swiflySettingRow.isDisabled{display:grid!important",
    "Complete Source, quality, speed, audio, and caption tray mounted.",
  ]],
];

for (const [label, output, markers] of groups) {
  for (const marker of markers) {
    if (!output.includes(marker)) {
      throw new Error(`[swifly-stream-options-qa] Missing ${label} marker: ${marker}`);
    }
  }
}

if (patchedLanguages.includes("seenQuality[height]")) {
  throw new Error("[swifly-stream-options-qa] Height-only quality deduplication survived.");
}

if (patchedLanguages.includes('media.querySelectorAll("track[data-cinepro-track]")')) {
  throw new Error("[swifly-stream-options-qa] Caption discovery is still limited to injected DOM tracks.");
}

if (patchedCinema.includes(".swiflySettingRow.isDisabled{display:none!important}")) {
  throw new Error("[swifly-stream-options-qa] Unavailable settings are still hidden.");
}

console.log("Swifly complete quality, speed, captions, and Source QA passed.");
