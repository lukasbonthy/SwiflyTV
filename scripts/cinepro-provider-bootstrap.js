"use strict";

const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const service = require("./cinepro-core-service.js");

let coreChild = null;
let closing = false;

function shutdown(signal = "SIGTERM") {
  if (closing) return;
  closing = true;
  if (coreChild && !coreChild.killed) {
    try { coreChild.kill(signal); } catch {}
  }
  setTimeout(() => process.exit(signal === "SIGINT" ? 130 : 0), 1200).unref();
}

async function start() {
  console.log("[hybrid-cinepro] Preparing CinePro in a worker process...");
  service.ensureInstalled();
  service.applyRuntimePatches();

  coreChild = spawn(process.execPath, [service.coreEntry], {
    cwd: path.dirname(service.coreEntry),
    stdio: "inherit",
    windowsHide: true,
    env: service.childEnvironment(),
  });

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  coreChild.once("exit", (code, signal) => {
    if (!closing && code && code !== 0) {
      console.error(
        `[hybrid-cinepro] Core exited with code ${code}${signal ? ` (${signal})` : ""}.`,
      );
    }
    process.exit(code == null ? 1 : code);
  });

  return coreChild;
}

module.exports = { shutdown, start };

if (require.main === module) {
  start().catch((error) => {
    console.error("[hybrid-cinepro] Bootstrap failed:", error.stack || error.message || error);
    process.exit(1);
  });
}
