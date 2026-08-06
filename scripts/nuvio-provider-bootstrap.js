"use strict";

const path = require("path");
const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const setup = require("./setup-nuvio-providers.js");
const reliableCore = require("./nuvio-provider-core-reliable.js");
const core = reliableCore.loadReliableCore();

let server = null;
let closing = false;

function shutdown(signal = "SIGTERM") {
  if (closing) return;
  closing = true;
  if (server && server.listening) {
    try {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
      return;
    } catch {}
  }
  process.exit(signal === "SIGINT" ? 130 : 0);
}

async function start() {
  console.log("[hybrid-nuvio] Preparing the pinned Paregi provider pack in a worker process...");
  setup.ensureNuvioProviders();
  server = core.startServer();
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

module.exports = { shutdown, start };

if (require.main === module) {
  start().catch((error) => {
    console.error("[hybrid-nuvio] Bootstrap failed:", error.stack || error.message || error);
    process.exit(1);
  });
}
