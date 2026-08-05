"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message) {
  if (!condition) throw new Error(`[hybrid-warmup-qa] ${message}`);
}

const launcherPath = path.join(__dirname, "start-hybrid-provider-core.js");
const cineproPath = path.join(__dirname, "start-cinepro.js");
const launcher = fs.readFileSync(launcherPath, "utf8").replace(/\r\n?/g, "\n");
const cinepro = fs.readFileSync(cineproPath, "utf8").replace(/\r\n?/g, "\n");

new vm.Script(launcher, { filename: launcherPath });
new vm.Script(cinepro, { filename: cineproPath });

const configure = launcher.match(/function configureCompatibilityClient\(\) \{([\s\S]*?)\n\}/);
assert(configure, "Could not inspect configureCompatibilityClient().");
assert(
  configure[1].includes('process.env.CINEPRO_STRICT = "false"'),
  "Hybrid launcher does not disable strict CinePro startup during warm-up.",
);
assert(
  configure[1].includes('process.env.CINEPRO_AUTO_START = "false"'),
  "Hybrid launcher can still start a second CinePro process against the gateway port.",
);
assert(
  configure[1].includes("process.env.CINEPRO_CORE_URL = hybridUrl"),
  "Hybrid launcher does not point the compatibility client at the merged gateway.",
);

assert(
  cinepro.includes("if (strictMode()) throw new Error"),
  "The regression fixture no longer covers the strict-mode termination branch.",
);
assert(
  cinepro.includes("Swifly will use its existing fallback providers"),
  "The non-strict warm-up continuation branch is missing from the CinePro launcher.",
);

console.log("Swifly hybrid gateway warm-up no longer triggers CinePro strict-mode termination.");
