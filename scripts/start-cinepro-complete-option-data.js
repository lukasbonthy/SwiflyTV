"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-complete-options] Could not find ${label}; refusing a partial options patch.`);
  }
  return source.replace(needle, replacement);
}

function patchThemeCompleteOptions(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  const helper = String.raw`          function completeOptionNodes(item, select) {
            if (!select) return [];

            if (item && item.key === "speed") {
              var canonicalSpeeds = [
                [".5", "0.5×"],
                [".75", "0.75×"],
                ["1", "Normal"],
                ["1.25", "1.25×"],
                ["1.5", "1.5×"],
                ["1.75", "1.75×"],
                ["2", "2×"],
                ["2.5", "2.5×"],
                ["3", "3×"],
                ["4", "4×"]
              ];
              var expected = canonicalSpeeds.map(function(entry) { return entry[0] + ":" + entry[1]; }).join("|");
              var present = Array.from(select.options || []).map(function(option) {
                return String(option.value) + ":" + String(option.textContent || option.label || "").trim();
              }).join("|");

              if (present !== expected) {
                var selectedSpeed = String(select.value || media.playbackRate || "1");
                select.innerHTML = "";
                canonicalSpeeds.forEach(function(entry) {
                  var option = document.createElement("option");
                  option.value = entry[0];
                  option.textContent = entry[1];
                  select.appendChild(option);
                });
                select.value = canonicalSpeeds.some(function(entry) { return entry[0] === selectedSpeed; })
                  ? selectedSpeed
                  : "1";
              }
              select.disabled = false;
            }

            return Array.from(select.options || []);
          }

`;

  next = replaceRequired(
    next,
    "          function renderChoices(item) {\n",
    helper + "          function renderChoices(item) {\n",
    "choice completion helper insertion point",
  );

  next = replaceRequired(
    next,
    `            detailTitle.textContent = item.label;
            choices.innerHTML = "";

            Array.from(select.options || []).forEach(function(option, index) {`,
    `            var optionNodes = completeOptionNodes(item, select);
            detailTitle.textContent = item.label + (optionNodes.length ? " · " + optionNodes.length : "");
            choices.innerHTML = "";
            choices.dataset.optionCount = String(optionNodes.length);

            optionNodes.forEach(function(option, index) {`,
    "complete choice rendering",
  );

  new vm.Script(next, { filename: themePath });
  const upgrade = next.match(/const themeUpgrade = String\.raw`([\s\S]*?)`;\n/);
  if (!upgrade) {
    throw new Error("[swifly-complete-options] Could not extract generated theme code.");
  }
  new vm.Script(upgrade[1], { filename: "swifly-generated-complete-options.js" });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyCompleteOptionsRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== themePath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchThemeCompleteOptions(source);
    console.log("[swifly-complete-options] Complete option data renderer injected.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { installPatch, patchThemeCompleteOptions };
