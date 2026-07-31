"use strict";

const path = require("path");
const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

function enableAllProviders() {
  const configured = String(process.env.CINEPRO_PROVIDER_ALLOWLIST || "").trim();
  const legacyDefault = /^(?:icefy\s*,\s*vixsrc|vixsrc\s*,\s*icefy)$/i.test(configured);
  if (!configured || legacyDefault) {
    process.env.CINEPRO_PROVIDER_ALLOWLIST = "*";
  }
  console.log(
    process.env.CINEPRO_PROVIDER_ALLOWLIST === "*"
      ? "[swifly-all-media] CinePro provider allowlist disabled; all installed providers will load."
      : `[swifly-all-media] Using explicit provider allowlist: ${process.env.CINEPRO_PROVIDER_ALLOWLIST}`,
  );
}

function start() {
  enableAllProviders();

  const allMedia = require("./start-cinepro-all-sources-captions-patch.js");
  if (!allMedia || typeof allMedia.installPatch !== "function") {
    throw new TypeError("[swifly-all-media] Caption/source patch does not export installPatch().");
  }
  allMedia.installPatch();

  const stablePlayback = require("./start-cinepro-stable-playback.js");
  if (!stablePlayback || typeof stablePlayback.start !== "function") {
    throw new TypeError("[swifly-all-media] Stable playback launcher does not export start().");
  }
  return stablePlayback.start();
}

module.exports = { enableAllProviders, start };

if (require.main === module) {
  start();
}
