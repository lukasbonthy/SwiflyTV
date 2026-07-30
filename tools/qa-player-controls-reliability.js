"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.env.SWIFLY_PLAYER_PATCH_TEST = "1";
const root = path.resolve(__dirname, "..");
const patcher = require(path.join(root, "scripts", "start-cinepro-controls-reliability.js"));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");
const parse = (source, file) => new vm.Script(source, { filename: file });

const controls = patcher.patchControls(read("scripts/start-cinepro-custom-controls.js"));
parse(controls, "patched-controls.js");
[
  "__swiflyControlCleanup",
  "function finishScrub(commit)",
  "function keyboard(event)",
  "syncFullscreen",
].forEach((marker) => assert(controls.includes(marker), `Missing ${marker}`));
[
  "var scrubbing = false;",
  "media.addEventListener(\"loadedmetadata\", function(){ fillSettings(); sync(); });",
  "quality.addEventListener(\"change\", function(){",
  "console.log(\"[swifly-player] Custom control interface mounted.\");",
].forEach((anchor) => assert(controls.includes(anchor), `Lost downstream anchor: ${anchor}`));

const languages = patcher.patchLanguages(read("scripts/start-cinepro-languages.js"));
parse(languages, "patched-languages.js");
assert(languages.includes("quality.disabled = !(hlsInstance"));

const theme = patcher.patchTheme(read("scripts/start-cinepro-theme-unified.js"));
parse(theme, "patched-theme.js");
assert((theme.match(/playerShell\.querySelector\("\.swiflyPlayerUi"\) !== ui/g) || []).length === 3);

console.log("Player controls reliability QA passed.");
