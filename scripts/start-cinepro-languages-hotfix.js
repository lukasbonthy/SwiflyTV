"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

const unsafePattern = String.raw`/cc\.addEventListener\("change", function\(\)\{[\s\S]*?\n\s*\}\);/`;
const safePattern = String.raw`/cc\.addEventListener\("change", function\(\)\{\n\s*var selected = Number\(cc\.value\);\n\s*Array\.from\(media\.textTracks \|\| \[\]\)\.forEach\(function\(track, index\)\{\n\s*track\.mode = index === selected \? "showing" : "disabled";\n\s*\}\);\n\s*sync\(\);\n\s*\}\);/`;

fs.readFileSync = function swiflyLanguagesHotfixRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== languagesPath) return result;

  patched = true;
  fs.readFileSync = originalReadFileSync;

  let source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  source = source.replace(/\r\n?/g, "\n");

  if (!source.includes(unsafePattern)) {
    throw new Error("[swifly-languages-hotfix] Could not find the unsafe captions handler matcher.");
  }

  source = source.replace(unsafePattern, safePattern);

  if (source.includes(unsafePattern)) {
    throw new Error("[swifly-languages-hotfix] Unsafe captions handler matcher survived replacement.");
  }

  console.log("[swifly-languages-hotfix] Captions handler replacement fixed before watch-page injection.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

const safeStyleChain = require("./start-cinepro-safe-style-chain.js");
safeStyleChain.loadLanguagesWithoutLegacyStyles();
