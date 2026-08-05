"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message) {
  if (!condition) throw new Error(`[hybrid-localhost-qa] ${message}`);
}

const root = path.resolve(__dirname, "..");
const launcherPath = path.join(__dirname, "start-hybrid-provider-core.js");
const cineproServicePath = path.join(__dirname, "cinepro-core-service.js");
const cineproBootstrapPath = path.join(__dirname, "cinepro-provider-bootstrap.js");
const nuvioBootstrapPath = path.join(__dirname, "nuvio-provider-bootstrap.js");

const launcher = fs.readFileSync(launcherPath, "utf8").replace(/\r\n?/g, "\n");
const cineproService = fs.readFileSync(cineproServicePath, "utf8").replace(/\r\n?/g, "\n");
const cineproBootstrap = fs.readFileSync(cineproBootstrapPath, "utf8").replace(/\r\n?/g, "\n");
const nuvioBootstrap = fs.readFileSync(nuvioBootstrapPath, "utf8").replace(/\r\n?/g, "\n");

new vm.Script(launcher, { filename: launcherPath });
new vm.Script(cineproService, { filename: cineproServicePath });
new vm.Script(cineproBootstrap, { filename: cineproBootstrapPath });
new vm.Script(nuvioBootstrap, { filename: nuvioBootstrapPath });

const startFunction = launcher.match(/async function start\(\) \{([\s\S]*?)\n\}/);
assert(startFunction, "Could not inspect the hybrid start() function.");
const startBody = startFunction[1];
const frontendIndex = startBody.indexOf("stablePlayback.start()");
const warmupIndex = startBody.indexOf("startBackendWarmup()");
assert(frontendIndex >= 0, "The Swifly frontend startup call is missing.");
assert(warmupIndex > frontendIndex, "Backend warm-up still runs before localhost startup.");
assert(!startBody.includes("await warmBackends"), "The frontend still awaits scraper warm-up.");
assert(!startBody.includes("await Promise.all(["), "The frontend still awaits both scraper backends.");

assert(
  launcher.includes('path.join(__dirname, "nuvio-provider-bootstrap.js")'),
  "Nuvio setup is not delegated to its bootstrap worker.",
);
assert(
  cineproService.includes('path.join(root, "scripts", "cinepro-provider-bootstrap.js")'),
  "CinePro setup is not delegated to its bootstrap worker.",
);
assert(
  !launcher.includes("setup.ensureNuvioProviders();"),
  "The localhost process still performs synchronous Nuvio clone/install work.",
);
assert(
  nuvioBootstrap.includes("setup.ensureNuvioProviders();"),
  "The Nuvio bootstrap worker does not perform provider setup.",
);
assert(
  cineproBootstrap.includes("service.ensureInstalled();") &&
    cineproBootstrap.includes("service.applyRuntimePatches();"),
  "The CinePro bootstrap worker does not own setup and patching.",
);
assert(
  launcher.includes("startGatewayWithFallback"),
  "Hybrid API port-conflict fallback is missing.",
);
assert(
  launcher.includes("EADDRINUSE") && launcher.includes("configured + 2"),
  "Hybrid API does not recover from a stale process on its default port.",
);
assert(
  launcher.includes('require("dotenv").config'),
  "The hybrid launcher does not load .env before constructing child environments.",
);
assert(
  launcher.includes('process.env.CINEPRO_STRICT = "false"'),
  "Hybrid compatibility still enables strict CinePro startup during backend warm-up.",
);
assert(
  !launcher.includes('process.env.CINEPRO_STRICT = "true"'),
  "A strict-mode assignment can still terminate localhost before backends finish warming.",
);
assert(
  launcher.includes("Compatibility strict mode disabled until scraper warm-up completes"),
  "The startup log does not identify warm-up compatibility mode.",
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(
  packageJson.scripts.start === "node scripts/start-hybrid-provider-core.js",
  "npm start is not using the localhost-first hybrid launcher.",
);

console.log("Swifly localhost-first hybrid startup, non-strict warm-up, worker setup, and port fallback QA passed.");
