"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const frameworkSourcePath = path.join(
  root,
  "vendor",
  "cinepro-core",
  "node_modules",
  "@omss",
  "framework",
  "dist",
  "services",
  "source.service.js",
);
const PATCH_MARKER = "SWIFLY_PROVIDER_VARIANTS";

function cleanKeyPart(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function providerVariantKey(source, upstreamUrl = "") {
  const provider = source && source.provider && typeof source.provider === "object"
    ? source.provider
    : {};
  return [
    cleanKeyPart(provider.id || provider.name || "unknown-provider"),
    cleanKeyPart(upstreamUrl || (source && source.url)),
    cleanKeyPart(source && source.type),
    cleanKeyPart(source && source.quality),
  ].join("|");
}

function patchFrameworkSource(source) {
  const original = String(source).replace(/\r\n?/g, "\n");
  if (original.includes(PATCH_MARKER)) {
    return { source: original, changed: false };
  }

  const resultsAnchor = /(^[ \t]*)results\.forEach\(\(r\) => \{/m;
  const anchorMatch = original.match(resultsAnchor);
  if (!anchorMatch) {
    throw new Error(
      "[swifly-provider-variants] Could not find OMSS result aggregation anchor; refusing to patch an unknown framework build.",
    );
  }

  const indent = anchorMatch[1] || "";
  const helper = [
    `${indent}const swiflyRawSourceCount = results.reduce((total, result) => {`,
    `${indent}    return total + (Array.isArray(result && result.sources) ? result.sources.length : 0);`,
    `${indent}}, 0);`,
    `${indent}const swiflyProviderVariantKey = (source, upstreamUrl) => {`,
    `${indent}    const provider = source && source.provider && typeof source.provider === 'object'`,
    `${indent}        ? source.provider`,
    `${indent}        : {};`,
    `${indent}    return [`,
    `${indent}        provider.id || provider.name || 'unknown-provider',`,
    `${indent}        upstreamUrl || (source && source.url) || '',`,
    `${indent}        source && source.type || '',`,
    `${indent}        source && source.quality || '',`,
    `${indent}    ].map((value) => String(value || '').trim().toLowerCase()).join('|');`,
    `${indent}}; // ${PATCH_MARKER}`,
    "",
  ].join("\n");

  let next = original.replace(resultsAnchor, `${helper}$&`);

  const decodedDedupe = /if\s*\(!allSourcesMap\.has\(proxyData\.url\)\)\s*\{\s*allSourcesMap\.set\(proxyData\.url,\s*source\);?\s*\}/m;
  if (!decodedDedupe.test(next)) {
    throw new Error(
      "[swifly-provider-variants] Could not find decoded source deduplication block; refusing a partial patch.",
    );
  }
  next = next.replace(
    decodedDedupe,
    `const swiflyVariantKey = swiflyProviderVariantKey(source, proxyData.url);\n                    if (!allSourcesMap.has(swiflyVariantKey)) {\n                        allSourcesMap.set(swiflyVariantKey, source);\n                    }`,
  );

  const fallbackDedupe = /if\s*\(!allSourcesMap\.has\(source\.url\)\)\s*\{\s*allSourcesMap\.set\(source\.url,\s*source\);?\s*\}/m;
  if (!fallbackDedupe.test(next)) {
    throw new Error(
      "[swifly-provider-variants] Could not find fallback source deduplication block; refusing a partial patch.",
    );
  }
  next = next.replace(
    fallbackDedupe,
    `const swiflyVariantKey = swiflyProviderVariantKey(source, source.url);\n                    if (!allSourcesMap.has(swiflyVariantKey)) {\n                        allSourcesMap.set(swiflyVariantKey, source);\n                    }`,
  );

  const uniqueAnchor = /(^[ \t]*)const uniqueSources = Array\.from\(allSourcesMap\.values\(\)\);/m;
  const uniqueMatch = next.match(uniqueAnchor);
  if (!uniqueMatch) {
    throw new Error(
      "[swifly-provider-variants] Could not find unique source output anchor; refusing a partial patch.",
    );
  }
  const uniqueIndent = uniqueMatch[1] || "";
  next = next.replace(
    uniqueAnchor,
    `$&\n${uniqueIndent}console.log(\`[SourceService] Preserved \${uniqueSources.length} provider-specific source variant(s) from \${swiflyRawSourceCount} validated source result(s).\`);`,
  );

  return { source: next, changed: true };
}

function validateEsmSyntax(source) {
  const tempPath = path.join(
    os.tmpdir(),
    `swifly-omss-provider-variants-${process.pid}-${Date.now()}.mjs`,
  );
  fs.writeFileSync(tempPath, source, "utf8");
  try {
    const result = spawnSync(process.execPath, ["--check", tempPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `[swifly-provider-variants] Patched OMSS source service failed syntax validation.\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
  }
}

function ensureFrameworkInstalled() {
  if (fs.existsSync(frameworkSourcePath)) return;

  const setupScript = path.join(root, "scripts", "setup-cinepro.js");
  console.log("[swifly-provider-variants] CinePro framework is missing; running one-time setup before preserving provider variants.");
  const result = spawnSync(process.execPath, [setupScript, "--build"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(frameworkSourcePath)) {
    throw new Error("[swifly-provider-variants] CinePro setup did not produce the OMSS source service.");
  }
}

function applyProviderVariantPatch() {
  ensureFrameworkInstalled();

  const original = fs.readFileSync(frameworkSourcePath, "utf8");
  const patched = patchFrameworkSource(original);
  validateEsmSyntax(patched.source);

  if (patched.changed) {
    fs.writeFileSync(frameworkSourcePath, patched.source, "utf8");
  }

  console.log(
    "[swifly-provider-variants] CinePro now preserves one source per provider, URL, type, and quality instead of collapsing providers by CDN URL alone.",
  );
  return { path: frameworkSourcePath, changed: patched.changed };
}

module.exports = {
  PATCH_MARKER,
  frameworkSourcePath,
  providerVariantKey,
  patchFrameworkSource,
  validateEsmSyntax,
  ensureFrameworkInstalled,
  applyProviderVariantPatch,
};
