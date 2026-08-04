"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const vidNestPath = path.join(
  root,
  "vendor",
  "cinepro-core",
  "dist",
  "providers",
  "vidnest",
  "vidnest.js",
);
const PATCH_MARKER = "SWIFLY_VIDNEST_RESILIENT";

function patchVidNestSource(source) {
  const original = String(source).replace(/\r\n?/g, "\n");
  if (original.includes(PATCH_MARKER)) {
    return { source: original, changed: false };
  }

  const handlerBlock = /(^[ \t]*)const \{ sources: s, subtitles: sub \} = this\.handleServer\(\s*key,\s*result\.value\.data\s*\);\s*sources\.push\(\.\.\.s\);\s*subtitles\.push\(\.\.\.sub\);/m;
  const match = original.match(handlerBlock);
  if (!match) {
    throw new Error(
      "[swifly-vidnest] Could not find the VidNest sub-server mapping block; refusing to patch an unknown build.",
    );
  }

  const indent = match[1] || "";
  const replacement = [
    `${indent}try {`,
    `${indent}    const { sources: s, subtitles: sub } = this.handleServer(`,
    `${indent}        key,`,
    `${indent}        result.value.data`,
    `${indent}    );`,
    `${indent}    sources.push(...s);`,
    `${indent}    subtitles.push(...sub);`,
    `${indent}} catch (error) {`,
    `${indent}    diagnostics.push({`,
    `${indent}        code: 'PARTIAL_SCRAPE',`,
    `${indent}        field: '',`,
    `${indent}        message: this.name + ': ' + server.path + ' returned malformed data and was skipped (' + (error instanceof Error ? error.message : String(error)) + ') [${PATCH_MARKER}]',`,
    `${indent}        severity: 'warning'`,
    `${indent}    });`,
    `${indent}}`,
  ].join("\n");

  return {
    source: original.replace(handlerBlock, replacement),
    changed: true,
  };
}

function validateEsmSyntax(source) {
  const tempPath = path.join(
    os.tmpdir(),
    `swifly-vidnest-${process.pid}-${Date.now()}.mjs`,
  );
  fs.writeFileSync(tempPath, source, "utf8");
  try {
    const result = spawnSync(process.execPath, ["--check", tempPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `[swifly-vidnest] Patched VidNest provider failed syntax validation.\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
  }
}

function applyVidNestResiliencePatch() {
  if (!fs.existsSync(vidNestPath)) {
    console.warn("[swifly-vidnest] VidNest provider is not installed; skipping resilience patch.");
    return { path: vidNestPath, changed: false, missing: true, unsupported: false };
  }

  const original = fs.readFileSync(vidNestPath, "utf8");
  let patched;
  try {
    patched = patchVidNestSource(original);
    validateEsmSyntax(patched.source);
  } catch (error) {
    console.warn(
      `[swifly-vidnest] VidNest resilience patch was skipped safely: ${error.message || error}`,
    );
    return { path: vidNestPath, changed: false, missing: false, unsupported: true };
  }

  if (patched.changed) {
    fs.writeFileSync(vidNestPath, patched.source, "utf8");
  }

  console.log(
    patched.changed
      ? "[swifly-vidnest] Malformed VidNest sub-servers can no longer discard valid VidNest sources."
      : "[swifly-vidnest] VidNest resilience patch already active.",
  );
  return { path: vidNestPath, changed: patched.changed, missing: false, unsupported: false };
}

module.exports = {
  PATCH_MARKER,
  applyVidNestResiliencePatch,
  patchVidNestSource,
  validateEsmSyntax,
  vidNestPath,
};
