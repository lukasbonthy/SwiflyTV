"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const sourceList = require("./patch-cinepro-source-list.js");
const stableState = require("./start-cinepro-stable-playback-state-v2.js");
const vidNest = require("./patch-cinepro-vidnest-resilience.js");

function requireMarker(source, marker) {
  if (!String(source).includes(marker)) {
    throw new Error(`[swifly-source-recovery-qa] Missing marker: ${marker}`);
  }
}

const sourceListFixture = `
const crypto = require("crypto");
function clean(value) { return value == null ? "" : String(value).trim(); }
function normalize() {
  const candidates = [];
  const sourceOptions = candidates.slice(0, 16).map((candidate, index) => {
    const optionSource = candidate.source || {};
    const optionProvider = optionSource.provider || {};
    const providerName = clean(optionProvider.name || optionProvider.id) || "CinePro source";
    const quality = clean(optionSource.quality);
    const streamMode = candidate.kind;
    return {
      id: \`cinepro-source-\${index}\`,
      label: providerName + (quality ? \` · \${quality}\` : ""),
      provider: providerName,
      quality,
      streamMode,
      playbackUrl: candidate.playbackUrl,
    };
  });
  return sourceOptions;
}
`;

const unlimitedSource = sourceList.patchSourceList(sourceListFixture);
requireMarker(unlimitedSource, "const sourceOptions = candidates.map");
if (unlimitedSource.includes("slice(0, 16)")) {
  throw new Error("[swifly-source-recovery-qa] The sixteen-source limit survived patching.");
}

const composedSource = stableState.patchCineProClientState(unlimitedSource);
new vm.Script(composedSource, { filename: "swifly-unlimited-stable-source-fixture.js" });
requireMarker(composedSource, "const sourceIdCounts = new Map();");
requireMarker(composedSource, "const sourceOptions = candidates.map((candidate) => {");
requireMarker(composedSource, "const stableSourceId =");
requireMarker(composedSource, "id: stableSourceId");
if (composedSource.includes("slice(0, 16)")) {
  throw new Error("[swifly-source-recovery-qa] Stable-state composition restored the Source cutoff.");
}

const idempotentSource = stableState.patchCineProClientState(composedSource);
if (idempotentSource !== composedSource) {
  throw new Error("[swifly-source-recovery-qa] Stable Source state was not idempotent.");
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

console.log("Swifly unlimited Source and stable-state composition QA passed.");
