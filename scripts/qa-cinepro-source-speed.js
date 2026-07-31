"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  patchCineProClient,
  patchCustomControls,
  patchLanguages,
  patchTheme,
} = require("./start-cinepro-source-speed.js");

const scriptsDir = __dirname;
const controlsPath = path.join(scriptsDir, "start-cinepro-custom-controls.js");
const languagesPath = path.join(scriptsDir, "start-cinepro-languages.js");
const themePath = path.join(scriptsDir, "start-cinepro-theme-unified.js");
const clientPath = path.join(scriptsDir, "..", "cinepro-client.js");

const originalControls = fs.readFileSync(controlsPath, "utf8");
const originalLanguages = fs.readFileSync(languagesPath, "utf8");
const originalTheme = fs.readFileSync(themePath, "utf8");
const originalClient = fs.readFileSync(clientPath, "utf8");

const patchedControls = patchCustomControls(originalControls);
const patchedLanguages = patchLanguages(originalLanguages);
const patchedTheme = patchTheme(originalTheme);
const patchedClient = patchCineProClient(originalClient);

for (const [filename, source] of [
  [controlsPath, patchedControls],
  [languagesPath, patchedLanguages],
  [themePath, patchedTheme],
  [clientPath, patchedClient],
]) {
  new vm.Script(source, { filename });
}

const fakeFs = {
  readFileSync(filePath) {
    const resolved = path.resolve(String(filePath));
    if (resolved === path.resolve(controlsPath)) return patchedControls;
    throw new Error(`[swifly-source-speed-qa] Unexpected runtime read: ${resolved}`);
  },
};

const languageContext = {
  require(request) {
    if (request === "fs") return fakeFs;
    if (request === "path") return path;
    if (request === "./start-cinepro-compact.js") return {};
    throw new Error(`[swifly-source-speed-qa] Unexpected runtime require: ${request}`);
  },
  module: { exports: {} },
  exports: {},
  __dirname: scriptsDir,
  __filename: languagesPath,
  console: { log() {}, warn() {}, error() {} },
  Buffer,
  process,
  setTimeout,
  clearTimeout,
};

vm.runInNewContext(patchedLanguages, languageContext, { filename: languagesPath });
const finalControls = fakeFs.readFileSync(controlsPath, "utf8");
new vm.Script(finalControls, { filename: controlsPath });

const injectedMatch = finalControls.match(/const injected = String\.raw`([\s\S]*?)`;\n/);
if (!injectedMatch) {
  throw new Error("[swifly-source-speed-qa] Could not extract generated browser controls.");
}
new vm.Script(injectedMatch[1], { filename: "swifly-generated-browser-controls.js" });

const requiredControlMarkers = [
  '<span>Source</span><select data-s="source">',
  '<option value="1.75">1.75×</option>',
  '<option value="2.5">2.5×</option>',
  '<option value="3">3×</option>',
  '<option value="4">4×</option>',
  "function fillSourceOptions()",
  "source.disabled = false;",
  "function switchCineProSource(sourceId)",
  "mountSwiflyControls(player, media, hlsInstance, sourceData)",
  "__swiflyControlGeneration",
  "function commitScrub()",
];

for (const marker of requiredControlMarkers) {
  if (!finalControls.includes(marker)) {
    throw new Error(`[swifly-source-speed-qa] Missing generated control marker: ${marker}`);
  }
}

const requiredClientMarkers = [
  "const sourceOptions = candidates.slice(0, 16)",
  "selectedSourceId: sourceOptions[0]",
  "sourceOptions,",
];
for (const marker of requiredClientMarkers) {
  if (!patchedClient.includes(marker)) {
    throw new Error(`[swifly-source-speed-qa] Missing CinePro marker: ${marker}`);
  }
}

if (!patchedTheme.includes('{ key: "source", label: "Source"')) {
  throw new Error("[swifly-source-speed-qa] Source row is missing from the settings theme.");
}

if (finalControls.includes("source.disabled = options.length < 2")) {
  throw new Error("[swifly-source-speed-qa] Single-provider Source rows would still be hidden.");
}

if (finalControls.includes("[swifly-stream-options]")) {
  throw new Error("[swifly-source-speed-qa] Broken complete-settings wrapper leaked into active controls.");
}

console.log("Swifly generated Source and extended-speed controls QA passed.");
