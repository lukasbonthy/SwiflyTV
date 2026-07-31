"use strict";

const fs = require("fs");
const Module = require("module");
const vm = require("vm");
const {
  installPatch,
  patchWatchlistReference,
  serverPath,
} = require("./start-cinepro-watchlist-guard.js");

const aliasFixture = `
var watchlistCalls = 0;
function renderWatchListPage() { watchlistCalls += 1; }
if (true) renderWatchlistPage();
`;
const aliasPatched = patchWatchlistReference(aliasFixture, { requireCall: true });
const aliasContext = { console };
vm.runInNewContext(aliasPatched.source, aliasContext, {
  filename: "swifly-watchlist-alias-fixture.js",
});
if (aliasContext.watchlistCalls !== 1) {
  throw new Error("[swifly-watchlist-guard-qa] The capitalization-compatible Watchlist renderer was not called.");
}

const missingFixture = `
var startupContinued = false;
renderWatchlistPage();
startupContinued = true;
`;
const missingPatched = patchWatchlistReference(missingFixture, { requireCall: true });
const missingContext = {
  console: { warn() {} },
};
vm.runInNewContext(missingPatched.source, missingContext, {
  filename: "swifly-watchlist-missing-fixture.js",
});
if (missingContext.startupContinued !== true) {
  throw new Error("[swifly-watchlist-guard-qa] Page startup did not continue after a missing Watchlist renderer.");
}

const realServer = fs.readFileSync(serverPath, "utf8");
const realPatched = patchWatchlistReference(realServer, { requireCall: true });
if (realPatched.replacementCount < 1) {
  throw new Error("[swifly-watchlist-guard-qa] The current server did not receive a Watchlist guard.");
}
new vm.Script(realPatched.source, { filename: serverPath });

// Exercise the exact production interception point. start-cinepro.js compiles
// the fully transformed server through Module._compile(source, serverPath).
globalThis.__swiflyWatchlistCompileQa = { aliasCalls: 0, continued: false };
installPatch();
const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(require("path").dirname(serverPath));
runtimeModule._compile(`
function renderWatchListPage() {
  globalThis.__swiflyWatchlistCompileQa.aliasCalls += 1;
}
renderWatchlistPage();
globalThis.__swiflyWatchlistCompileQa.continued = true;
`, serverPath);

if (globalThis.__swiflyWatchlistCompileQa.aliasCalls !== 1) {
  throw new Error("[swifly-watchlist-guard-qa] Final compile hook did not resolve the compatible Watchlist renderer.");
}
if (globalThis.__swiflyWatchlistCompileQa.continued !== true) {
  throw new Error("[swifly-watchlist-guard-qa] Final compile hook did not allow page startup to continue.");
}
delete globalThis.__swiflyWatchlistCompileQa;

console.log(
  `Swifly Watchlist final-compile guard QA passed (${realPatched.replacementCount} real call(s) found).`,
);
