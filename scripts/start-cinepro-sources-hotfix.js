"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcesPath = path.join(root, "scripts", "start-cinepro-sources.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-sources-hotfix] Could not find ${label}; source wrapper was not modified.`);
  }
  return source.replace(needle, replacement);
}

fs.readFileSync = function swiflySourcesHotfixRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== sourcesPath) return result;

  patched = true;
  fs.readFileSync = originalReadFileSync;

  let source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  source = source.replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    '`$1source.addEventListener("change", function(){\n             switchCineProSource(source.value);\n           });\n           quality.addEventListener',
    '`$1if (source) {\n             source.addEventListener("change", function(){\n               switchCineProSource(source.value);\n             });\n           }\n           quality.addEventListener',
    "unguarded Source event binding",
  );

  if (source.includes('`$1source.addEventListener("change"')) {
    throw new Error("[swifly-sources-hotfix] Unsafe Source binding remained after patching.");
  }

  console.log("[swifly-sources-hotfix] Optional Source binding guarded; settings tray can mount without Source data.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-sources.js");
