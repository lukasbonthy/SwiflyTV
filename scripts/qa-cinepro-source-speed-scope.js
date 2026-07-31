"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchCustomControlsScopeSafe } = require("./start-cinepro-source-speed-scope-safe.js");

const scriptsDir = __dirname;
const root = path.resolve(scriptsDir, "..");
const controlsPath = path.join(scriptsDir, "start-cinepro-custom-controls.js");
const serverPath = path.join(root, "server.js");
const originalControls = fs.readFileSync(controlsPath, "utf8");
const patchedControls = patchCustomControlsScopeSafe(originalControls);

new vm.Script(patchedControls, { filename: controlsPath });

const requiredWrapperMarkers = [
  "window.__swiflyActiveSourceData = data",
  "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, window.__swiflyActiveSourceData || {})",
  '<option value="1.75">1.75×</option>',
  '<option value="2.5">2.5×</option>',
  '<option value="3">3×</option>',
  '<option value="4">4×</option>',
];

for (const marker of requiredWrapperMarkers) {
  if (!patchedControls.includes(marker)) {
    throw new Error(`[swifly-source-speed-scope-qa] Missing wrapper marker: ${marker}`);
  }
}

if (/mountSwiflyControls\(movieButtonPlyr, video, hlsInstance,\s*data\s*\)/.test(patchedControls)) {
  throw new Error("[swifly-source-speed-scope-qa] Free data identifier survived in the ready callback.");
}

const injectedMatch = patchedControls.match(/const injected = String\.raw`([\s\S]*?)`;\n/);
if (!injectedMatch) {
  throw new Error("[swifly-source-speed-scope-qa] Could not extract generated browser controls.");
}
new vm.Script(injectedMatch[1], { filename: "swifly-generated-browser-controls.js" });

const fakeServer = `
function startPlyrHlsSource(src, data) {
  return src;
}

function initPlyrUi(hlsInstance, levels) {
  movieButtonPlyr.on("ready", function() {
    resizePlyrArea();
    refreshSpeedSetting();
    refreshDblClickSetting();
  });
}
`;

let transformedServer = "";
const fakeFs = {
  readFileSync(filePath) {
    const resolved = path.resolve(String(filePath));
    if (resolved === path.resolve(serverPath)) return fakeServer;
    throw new Error(`[swifly-source-speed-scope-qa] Unexpected file read: ${resolved}`);
  },
};

const wrapperContext = {
  require(request) {
    if (request === "fs") return fakeFs;
    if (request === "path") return path;
    if (request === "../server.js") {
      transformedServer = String(fakeFs.readFileSync(serverPath, "utf8"));
      return {};
    }
    throw new Error(`[swifly-source-speed-scope-qa] Unexpected require: ${request}`);
  },
  module: { exports: {} },
  exports: {},
  __dirname: scriptsDir,
  __filename: controlsPath,
  console: { log() {}, warn() {}, error() {} },
  Buffer,
};

vm.runInNewContext(patchedControls, wrapperContext, { filename: controlsPath });

if (!transformedServer) {
  throw new Error("[swifly-source-speed-scope-qa] Custom controls did not transform the server fixture.");
}
new vm.Script(transformedServer, { filename: "swifly-transformed-server.js" });

const browserContext = {
  window: {},
  playerShell: null,
  video: {},
  movieButtonPlyr: {
    on(event, callback) {
      if (event === "ready") callback();
    },
  },
  resizePlyrArea() {},
  refreshSpeedSetting() {},
  refreshDblClickSetting() {},
  console: { log() {}, warn() {}, error() {} },
};

vm.runInNewContext(
  `${transformedServer}\nstartPlyrHlsSource("fixture", { marker: "captured" });\ninitPlyrUi({}, []);`,
  browserContext,
  { filename: "swifly-transformed-server-runtime.js" },
);

if (!browserContext.window.__swiflyActiveSourceData || browserContext.window.__swiflyActiveSourceData.marker !== "captured") {
  throw new Error("[swifly-source-speed-scope-qa] Source data was not captured at the stream entry point.");
}

console.log("Swifly Source data scope and visible-control runtime QA passed.");
