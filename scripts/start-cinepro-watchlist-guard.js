"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
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
      "[swifly-watchlist-guard] Could not find the crashing renderWatchlistPage() call.",
    );
  }

  if (replacementCount > 0) {
    new vm.Script(next, { filename: serverPath });
  }

  return { source: next, replacementCount };
}

function installPatch() {
  fs.readFileSync = function swiflyWatchlistGuardRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== serverPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const resultPatch = patchWatchlistReference(source, { requireCall: true });
    console.log(
      `[swifly-watchlist-guard] Guarded ${resultPatch.replacementCount} missing Watchlist renderer call(s) before player startup.`,
    );
    return Buffer.isBuffer(result)
      ? Buffer.from(resultPatch.source, "utf8")
      : resultPatch.source;
  };
}

module.exports = {
  guardedWatchlistCall,
  installPatch,
  patchWatchlistReference,
  unsafeWatchlistCall,
};
