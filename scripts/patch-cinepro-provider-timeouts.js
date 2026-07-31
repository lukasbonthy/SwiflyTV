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
const PATCH_MARKER = "SWIFLY_PROVIDER_TIMEOUT";

function providerTimeoutMs() {
  const parsed = Number(process.env.CINEPRO_PROVIDER_TIMEOUT_MS || 8000);
  return Math.min(30_000, Math.max(3_000, Number.isFinite(parsed) ? parsed : 8_000));
}

function patchFrameworkSource(source) {
  const original = String(source).replace(/\r\n?/g, "\n");
  if (original.includes(PATCH_MARKER)) {
    return { source: original, changed: false };
  }

  const promisesAnchor = /(^[ \t]*)const promises = supportedProviders\.map\(async \(provider\) => \{/m;
  const promisesMatch = original.match(promisesAnchor);
  if (!promisesMatch) {
    throw new Error(
      "[swifly-provider-timeout] Could not find OMSS provider promise anchor; refusing to patch an unknown framework build.",
    );
  }

  const indent = promisesMatch[1] || "";
  const inner = indent + "    ";
  const timeoutHelpers = [
    `${indent}const swiflyProviderTimeoutMs = Math.min(`,
    `${inner}30000,`,
    `${inner}Math.max(3000, Number(process.env.CINEPRO_PROVIDER_TIMEOUT_MS || 8000) || 8000),`,
    `${indent});`,
    `${indent}const swiflyRunProvider = async (provider, task) => {`,
    `${inner}let timeoutHandle;`,
    `${inner}try {`,
    `${inner}    return await Promise.race([`,
    `${inner}        Promise.resolve().then(task),`,
    `${inner}        new Promise((_, reject) => {`,
    `${inner}            timeoutHandle = setTimeout(() => {`,
    `${inner}                reject(new Error(` + "`" + `[${PATCH_MARKER}] Provider '${'${provider.name}'}' exceeded ${'${swiflyProviderTimeoutMs}'}ms` + "`" + `));`,
    `${inner}            }, swiflyProviderTimeoutMs);`,
    `${inner}        }),`,
    `${inner}    ]);`,
    `${inner}} finally {`,
    `${inner}    if (timeoutHandle) clearTimeout(timeoutHandle);`,
    `${inner}}`,
    `${indent}};`,
    "",
  ].join("\n");

  let next = original.replace(promisesAnchor, `${timeoutHelpers}$&`);

  const providerCallBlock = /if\s*\(type === ['"]movie['"]\)\s*\{\s*result\s*=\s*await provider\.getMovieSources\(media\);?\s*\}\s*else\s*\{\s*result\s*=\s*await provider\.getTVSources\(media\);?\s*\}/m;
  if (!providerCallBlock.test(next)) {
    throw new Error(
      "[swifly-provider-timeout] Could not find OMSS provider call block; refusing a partial timeout patch.",
    );
  }

  next = next.replace(
    providerCallBlock,
    `result = await swiflyRunProvider(provider, () =>\n${inner}type === 'movie'\n${inner}    ? provider.getMovieSources(media)\n${inner}    : provider.getTVSources(media)\n${indent});`,
  );

  return { source: next, changed: true };
}

function validateEsmSyntax(source) {
  const tempPath = path.join(
    os.tmpdir(),
    `swifly-omss-source-service-${process.pid}-${Date.now()}.mjs`,
  );
  fs.writeFileSync(tempPath, source, "utf8");
  try {
    const result = spawnSync(process.execPath, ["--check", tempPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `[swifly-provider-timeout] Patched OMSS source service failed syntax validation.\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
  }
}

function ensureFrameworkInstalled() {
  if (fs.existsSync(frameworkSourcePath)) return;

  const setupScript = path.join(root, "scripts", "setup-cinepro.js");
  console.log("[swifly-provider-timeout] CinePro framework is missing; running one-time setup before applying provider timeouts.");
  const result = spawnSync(process.execPath, [setupScript, "--build"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(frameworkSourcePath)) {
    throw new Error("[swifly-provider-timeout] CinePro setup did not produce the OMSS source service.");
  }
}

function applyProviderTimeoutPatch() {
  ensureFrameworkInstalled();

  const original = fs.readFileSync(frameworkSourcePath, "utf8");
  const patched = patchFrameworkSource(original);
  validateEsmSyntax(patched.source);

  if (patched.changed) {
    fs.writeFileSync(frameworkSourcePath, patched.source, "utf8");
  }

  console.log(
    `[swifly-provider-timeout] Each CinePro provider is capped at ${providerTimeoutMs()}ms; completed providers can return without a hung provider.`,
  );
  return { path: frameworkSourcePath, changed: patched.changed };
}

async function runWithTimeout(task, timeoutMs = 50, name = "test provider") {
  let timeoutHandle;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`[${PATCH_MARKER}] Provider '${name}' exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

module.exports = {
  PATCH_MARKER,
  frameworkSourcePath,
  providerTimeoutMs,
  patchFrameworkSource,
  validateEsmSyntax,
  ensureFrameworkInstalled,
  applyProviderTimeoutPatch,
  runWithTimeout,
};
