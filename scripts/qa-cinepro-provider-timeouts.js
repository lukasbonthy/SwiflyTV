"use strict";

const fs = require("fs");
const path = require("path");
const timeoutPatch = require("./patch-cinepro-provider-timeouts.js");

function requireMarker(source, marker) {
  if (!String(source).includes(marker)) {
    throw new Error(`[swifly-provider-timeout-qa] Missing marker: ${marker}`);
  }
}

const fixture = `export class SourceService {
    async fetchFromProviders(type, media) {
        const supportedProviders = [];
        const promises = supportedProviders.map(async (provider) => {
            try {
                let result;
                if (type === 'movie') {
                    result = await provider.getMovieSources(media);
                } else {
                    result = await provider.getTVSources(media);
                }
                return result;
            } catch (error) {
                return { sources: [], subtitles: [], diagnostics: [] };
            }
        });
        return Promise.allSettled(promises);
    }
}`;

const transformedFixture = timeoutPatch.patchFrameworkSource(fixture).source;
timeoutPatch.validateEsmSyntax(transformedFixture);
requireMarker(transformedFixture, "const swiflyProviderTimeoutMs = Math.min(");
requireMarker(transformedFixture, "Promise.race([");
requireMarker(transformedFixture, timeoutPatch.PATCH_MARKER);
requireMarker(transformedFixture, "provider.getMovieSources(media)");
requireMarker(transformedFixture, "provider.getTVSources(media)");

if (fs.existsSync(timeoutPatch.frameworkSourcePath)) {
  const installed = fs.readFileSync(timeoutPatch.frameworkSourcePath, "utf8");
  const dryRun = timeoutPatch.patchFrameworkSource(installed).source;
  timeoutPatch.validateEsmSyntax(dryRun);
  requireMarker(dryRun, timeoutPatch.PATCH_MARKER);
}

(async () => {
  const fast = await timeoutPatch.runWithTimeout(
    () => Promise.resolve("fast-source"),
    100,
    "fast provider",
  );
  if (fast !== "fast-source") {
    throw new Error("[swifly-provider-timeout-qa] A completed provider result was not preserved.");
  }

  const started = Date.now();
  let timedOut = false;
  try {
    await timeoutPatch.runWithTimeout(
      () => new Promise(() => {}),
      35,
      "hung provider",
    );
  } catch (error) {
    timedOut = String(error && error.message || error).includes(timeoutPatch.PATCH_MARKER);
  }

  if (!timedOut || Date.now() - started > 1000) {
    throw new Error("[swifly-provider-timeout-qa] A hung provider did not fail independently.");
  }

  const launcher = fs.readFileSync(
    path.join(__dirname, "start-cinepro-all-sources-captions.js"),
    "utf8",
  );
  requireMarker(launcher, 'require("./patch-cinepro-provider-timeouts.js")');
  requireMarker(launcher, "providerTimeouts.applyProviderTimeoutPatch();");

  console.log("Swifly non-blocking CinePro provider timeout QA passed.");
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
