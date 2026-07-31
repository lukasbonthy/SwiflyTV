"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const base = require("./start-cinepro-source-speed.js");

const root = path.resolve(__dirname, "..");
const cinemaPath = path.join(root, "scripts", "start-cinepro-settings-cinema.js");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const cineproClientPath = path.join(root, "cinepro-client.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceExact(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-source-speed-scope] Could not find ${label}; refusing a partial patch.`);
  }
  return source.replace(needle, replacement);
}

function patchCustomControlsScopeSafe(source) {
  let next = base.patchCustomControls(source);

  next = replaceExact(
    next,
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, data);",
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, window.__swiflyActiveSourceData || {});",
    "free Source data argument",
  );

  const sourceReadAnchor = String.raw`    let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

`;
  const sourceCapturePatch = String.raw`    source = replaceRequired(
      source,
      /(\n[ \t]*function startPlyrHlsSource\(src,\s*data\)\s*\{)/,
      '$1\n          window.__swiflyActiveSourceData = data && typeof data === "object" ? data : {};',
      "active Source data capture",
    );

`;

  next = replaceExact(
    next,
    sourceReadAnchor,
    sourceReadAnchor + sourceCapturePatch,
    "server source-read anchor",
  );

  if (/mountSwiflyControls\(movieButtonPlyr, video, hlsInstance,\s*data\s*\)/.test(next)) {
    throw new Error("[swifly-source-speed-scope] Free data identifier survived control patching.");
  }

  new vm.Script(next, { filename: customControlsPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflySourceSpeedScopeRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) {
      patcher = base.patchCineProClient;
      label = "CinePro Source data";
    }
    if (resolved === customControlsPath) {
      patcher = patchCustomControlsScopeSafe;
      label = "scope-safe controls and extended speed";
    }
    if (resolved === languagesPath) {
      patcher = base.patchLanguages;
      label = "Source selector";
    }
    if (resolved === themePath) {
      patcher = base.patchTheme;
      label = "Source menu row";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-source-speed-scope] ${label} patch ready.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchCustomControlsScopeSafe,
};

if (require.main === module) {
  installPatch();
  console.log("[swifly-source-speed-scope] Source data scope validated; controls can mount safely.");
  require("./start-cinepro-settings-cinema.js");
}
