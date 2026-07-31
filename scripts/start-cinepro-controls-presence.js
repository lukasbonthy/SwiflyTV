"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!String(source).includes(needle)) {
    throw new Error(`[swifly-controls-presence] Could not find ${label}; refusing a partial visibility patch.`);
  }
  return String(source).replace(needle, replacement);
}

function patchCustomControlsPresence(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    'body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls,body.swifly-watch-clean #movieButtonPlayerShell .plyr__control--overlaid,#swiflyCleanBack{display:none!important}',
    'body.swifly-watch-clean #movieButtonPlayerShell.swiflyCustomControlsMounted .plyr__controls,body.swifly-watch-clean #movieButtonPlayerShell.swiflyCustomControlsMounted .plyr__control--overlaid,body.swifly-watch-clean #movieButtonPlayerShell.swiflyCustomControlsMounted~#swiflyCleanBack{display:none!important}',
    "custom-controls-only stock-control hiding rule",
  );

  next = replaceRequired(
    next,
    `          if (!playerShell || !media) return;\n`,
    `          if (!playerShell || !media) return;\n          try { playerShell.classList.remove("swiflyCustomControlsMounted"); } catch {}\n`,
    "control mount entry point",
  );

  next = replaceRequired(
    next,
    `          playerShell.appendChild(ui);\n`,
    `          playerShell.appendChild(ui);\n          playerShell.classList.add("swiflyCustomControlsMounted");\n          try { media.controls = false; } catch {}\n`,
    "successful custom-control mount marker",
  );

  const readyMountNeedle =
    '`$1            mountSwiflyControls(movieButtonPlyr, video, hlsInstance, window.__swiflyActiveSourceData || {});\\n`';

  const readyMountReplacement = [
    '`            var swiflyControlsMountedFor = null;',
    '            function ensureSwiflyControlsMounted() {',
    '              if (!playerShell || !video || !video.isConnected) return;',
    '              var existingControls = playerShell.querySelector(".swiflyPlayerUi");',
    '              if (existingControls && existingControls.isConnected && swiflyControlsMountedFor === movieButtonPlyr) {',
    '                playerShell.classList.add("swiflyCustomControlsMounted");',
    '                try { video.controls = false; } catch {}',
    '                return;',
    '              }',
    '',
    '              try { video.controls = true; } catch {}',
    '              try {',
    '                mountSwiflyControls(movieButtonPlyr, video, hlsInstance, window.__swiflyActiveSourceData || {});',
    '                var mountedControls = playerShell.querySelector(".swiflyPlayerUi");',
    '                if (!mountedControls || !mountedControls.isConnected) {',
    '                  throw new Error("Custom control markup did not attach to the player shell.");',
    '                }',
    '                swiflyControlsMountedFor = movieButtonPlyr;',
    '                playerShell.classList.add("swiflyCustomControlsMounted");',
    '                try { video.controls = false; } catch {}',
    '              } catch (controlError) {',
    '                playerShell.classList.remove("swiflyCustomControlsMounted");',
    '                try { video.controls = true; } catch {}',
    '                try { console.error("[swifly-controls-presence] Custom controls failed; native controls restored.", controlError); } catch {}',
    '              }',
    '            }',
    '',
    '            try { video.controls = true; } catch {}',
    '            setTimeout(ensureSwiflyControlsMounted, 0);',
    '            setTimeout(ensureSwiflyControlsMounted, 250);',
    '            setTimeout(ensureSwiflyControlsMounted, 1000);',
    '            video.addEventListener("loadedmetadata", ensureSwiflyControlsMounted, { once: true });',
    '            video.addEventListener("canplay", ensureSwiflyControlsMounted, { once: true });',
    '$1            ensureSwiflyControlsMounted();\\n`',
  ].join("\n");

  next = replaceRequired(
    next,
    readyMountNeedle,
    readyMountReplacement,
    "scope-safe Plyr ready control mount",
  );

  const requiredMarkers = [
    "swiflyCustomControlsMounted",
    "ensureSwiflyControlsMounted",
    "video.controls = true",
    "video.controls = false",
    'video.addEventListener("loadedmetadata", ensureSwiflyControlsMounted',
    'video.addEventListener("canplay", ensureSwiflyControlsMounted',
    "Custom controls failed; native controls restored.",
  ];
  for (const marker of requiredMarkers) {
    if (!next.includes(marker)) {
      throw new Error(`[swifly-controls-presence] Missing required visibility marker: ${marker}`);
    }
  }

  new vm.Script(next, { filename: customControlsPath });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyControlsPresenceRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== customControlsPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchCustomControlsPresence(source);
    console.log("[swifly-controls-presence] Custom controls are fail-safe mounted with native fallback protection.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchCustomControlsPresence,
};
