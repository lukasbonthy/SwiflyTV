"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sourceSpeedPath = path.join(root, "scripts", "start-cinepro-source-speed.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function patchSourceList(source) {
  const original = String(source).replace(/\r\n?/g, "\n");
  const limited = "const sourceOptions = candidates.slice(0, 16).map";
  const unlimited = "const sourceOptions = candidates.map";

  if (original.includes(unlimited)) return original;
  if (!original.includes(limited)) {
    throw new Error(
      "[swifly-source-list] Could not find the 16-source cap; refusing to patch an unknown Source data build.",
    );
  }

  const next = original.replace(limited, unlimited);
  new vm.Script(next, { filename: sourceSpeedPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflySourceListRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== sourceSpeedPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchSourceList(source);
    console.log("[swifly-source-list] Every playable CinePro source will be exposed to the Source control.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchSourceList,
  sourceSpeedPath,
};
