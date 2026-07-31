"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const plyrPath = path.join(__dirname, "start-cinepro-plyr.js");
const sourceSpeedPath = path.join(__dirname, "start-cinepro-source-speed.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceExact(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-source-transition] Could not find ${label}; refusing a partial wrapper patch.`);
  }
  return source.replace(needle, replacement);
}

function patchPlyrWrapper(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceExact(
    next,
    'const path = require("path");',
    'const path = require("path");\nconst sourceTransitionCore = require("./cinepro-source-transition-core.js");',
    "Plyr transition-core import",
  );

  next = replaceExact(
    next,
    '  console.log("[cinepro-plyr] Stock Plyr, native, and legacy seek controls disabled; custom Swifly UI only.");',
    '  source = sourceTransitionCore.patchPlyrServerSource(source);\n\n  console.log("[cinepro-plyr] Stock Plyr, native, and legacy seek controls disabled; custom Swifly UI only.");',
    "Plyr server transition invocation",
  );

  new vm.Script(next, { filename: plyrPath });
  return next;
}

function patchSourceSpeedWrapper(source) {
  let next = String(source).replace(/\r\n?/g, "\n");
  const originalCall = '            startPlyrHlsSource(String(selected.playbackUrl), nextData);';
  const replacement = `            activeSourceData = nextData;
            window.__swiflyActiveSourceData = nextData;
            window.__swiflyPendingSourceId = String(selected.id || "");

            if (source) {
              source.value = String(selected.id || "");
              source.disabled = true;
              source.setAttribute("aria-busy", "true");
            }

            var sourceTransitionFinished = false;
            var finishSourceTransition = function() {
              if (sourceTransitionFinished) return;
              sourceTransitionFinished = true;
              if (source) {
                source.disabled = false;
                source.removeAttribute("aria-busy");
              }
              if (String(window.__swiflyPendingSourceId || "") === String(selected.id || "")) {
                window.__swiflyPendingSourceId = "";
              }
              media.removeEventListener("loadedmetadata", finishSourceTransition);
              media.removeEventListener("canplay", finishSourceTransition);
              media.removeEventListener("error", finishSourceTransition);
            };

            media.addEventListener("loadedmetadata", finishSourceTransition, { once: true });
            media.addEventListener("canplay", finishSourceTransition, { once: true });
            media.addEventListener("error", finishSourceTransition, { once: true });
            setTimeout(finishSourceTransition, 10000);

            try {
              return startPlyrHlsSource(String(selected.playbackUrl), nextData);
            } catch (error) {
              finishSourceTransition();
              throw error;
            }`;

  next = replaceExact(
    next,
    originalCall,
    replacement,
    "Source-switch player handoff",
  );

  new vm.Script(next, { filename: sourceSpeedPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflySourceTransitionRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === plyrPath) {
      patcher = patchPlyrWrapper;
      label = "safe HLS/direct media lifecycle";
    }
    if (resolved === sourceSpeedPath) {
      patcher = patchSourceSpeedWrapper;
      label = "committed Source selection handoff";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-source-transition] ${label} injected.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchPlyrWrapper,
  patchSourceSpeedWrapper,
};
