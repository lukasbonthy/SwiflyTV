"use strict";

const Module = require("module");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalCompile = Module.prototype._compile;
let installed = false;
let patched = false;

const unsafeWatchlistCall = /\brenderWatchlistPage\s*\(\s*\)\s*;/g;

const guardedWatchlistCall = `(function swiflyRenderWatchlistSafely() {
  if (typeof renderWatchlistPage === "function") return renderWatchlistPage();
  if (typeof renderWatchListPage === "function") return renderWatchListPage();
  if (typeof renderMyListPage === "function") return renderMyListPage();
  if (typeof renderLibraryPage === "function") return renderLibraryPage();
  try {
    console.warn("[swifly-watchlist-guard] Watchlist renderer is unavailable; continuing page startup.");
  } catch {}
  return null;
})();`;

function patchWatchlistReference(source, options = {}) {
  let next = String(source).replace(/\r\n?/g, "\n");
  let replacementCount = 0;

  unsafeWatchlistCall.lastIndex = 0;
  next = next.replace(unsafeWatchlistCall, function replaceWatchlistCall() {
    replacementCount += 1;
    return guardedWatchlistCall;
  });

  if (options.requireCall && replacementCount === 0) {
    throw new Error(
      "[swifly-watchlist-guard] Could not find the crashing renderWatchlistPage() call in the final generated server source.",
    );
  }

  if (replacementCount > 0) {
    new vm.Script(next, { filename: serverPath });
  }

  return { source: next, replacementCount };
}

function installPatch() {
  if (installed) return;
  installed = true;

  Module.prototype._compile = function swiflyWatchlistGuardCompile(content, filename) {
    let resolved = "";
    try { resolved = path.resolve(String(filename)); } catch {}

    if (patched || resolved !== serverPath) {
      return originalCompile.call(this, content, filename);
    }

    const resultPatch = patchWatchlistReference(content, { requireCall: true });
    patched = true;

    // Restore the normal compiler before executing server.js. The source has
    // already passed through every Swifly/CinePro transform at this point.
    Module.prototype._compile = originalCompile;

    console.log(
      `[swifly-watchlist-guard] Guarded ${resultPatch.replacementCount} Watchlist renderer call(s) in the final generated server source.`,
    );

    return originalCompile.call(this, resultPatch.source, filename);
  };
}

module.exports = {
  guardedWatchlistCall,
  installPatch,
  patchWatchlistReference,
  serverPath,
  unsafeWatchlistCall,
};
