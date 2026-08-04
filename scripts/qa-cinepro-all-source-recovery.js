"use strict";

const fs = require("fs");
const path = require("path");
const sourceList = require("./patch-cinepro-source-list.js");
const vidNest = require("./patch-cinepro-vidnest-resilience.js");

function requireMarker(source, marker) {
  if (!String(source).includes(marker)) {
    throw new Error(`[swifly-source-recovery-qa] Missing marker: ${marker}`);
  }
}

const sourceListFixture = `function normalize() {
  const candidates = [];
  const sourceOptions = candidates.slice(0, 16).map((candidate, index) => ({ index, candidate }));
  return sourceOptions;
}`;
const sourceListResult = sourceList.patchSourceList(sourceListFixture);
requireMarker(sourceListResult, "const sourceOptions = candidates.map");
if (sourceListResult.includes("slice(0, 16)")) {
  throw new Error("[swifly-source-recovery-qa] The sixteen-source limit survived patching.");
}

const vidNestFixture = `export class VidNestProvider {
  getSources() {
    const sources = [];
    const subtitles = [];
    const diagnostics = [];
    const results = [];
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const server = this.SERVERS[i];
      const key = server.path;
      const { sources: s, subtitles: sub } = this.handleServer(
        key,
        result.value.data
      );
      sources.push(...s);
      subtitles.push(...sub);
    });
    return { sources, subtitles, diagnostics };
  }
}`;
const vidNestResult = vidNest.patchVidNestSource(vidNestFixture).source;
vidNest.validateEsmSyntax(vidNestResult);
requireMarker(vidNestResult, "try {");
requireMarker(vidNestResult, vidNest.PATCH_MARKER);
requireMarker(vidNestResult, "diagnostics.push({");

const launcher = fs.readFileSync(
  path.join(__dirname, "start-cinepro-all-sources-captions.js"),
  "utf8",
);
requireMarker(launcher, 'require("./patch-cinepro-source-list.js")');
requireMarker(launcher, "sourceList.installPatch();");
requireMarker(launcher, 'require("./patch-cinepro-vidnest-resilience.js")');
requireMarker(launcher, "vidNestResilience.applyVidNestResiliencePatch();");
requireMarker(launcher, 'process.env.CINEPRO_PROVIDER_TIMEOUT_MS = "20000"');

console.log("Swifly all-source recovery QA passed.");
