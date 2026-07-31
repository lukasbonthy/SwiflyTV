"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  patchWatchlistReference,
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

const serverPath = path.join(__dirname, "..", "server.js");
const realServer = fs.readFileSync(serverPath, "utf8");
const realPatched = patchWatchlistReference(realServer, { requireCall: true });
if (realPatched.replacementCount < 1) {
  throw new Error("[swifly-watchlist-guard-qa] The current server did not receive a Watchlist guard.");
}
new vm.Script(realPatched.source, { filename: serverPath });

console.log(
  `Swifly Watchlist bootstrap guard QA passed (${realPatched.replacementCount} real call(s) guarded).`,
);
