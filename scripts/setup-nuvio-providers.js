"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const vendorRoot = path.join(root, "vendor");
const vendorDir = path.join(vendorRoot, "nuvio-providers");
const repoUrl = "https://github.com/yoruix/nuvio-providers.git";
const pinnedRef = "ed38d1aee0024f56479369c9423fefb278e0b62a";
const markerPath = path.join(vendorDir, ".swifly-nuvio-ready.json");

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    windowsHide: true,
    shell: Boolean(options.shell),
    env: options.env || process.env,
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} could not start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${command} ${args.join(" ")} was terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${String(result.stderr || result.stdout || "").trim()}`
      : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.${detail}`);
  }
  return result;
}

function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) || "";
}

function runNpm(args, cwd) {
  const npmCli = resolveNpmCli();
  if (npmCli) {
    run(process.execPath, [npmCli, ...args], cwd);
    return;
  }
  run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd, {
    shell: process.platform === "win32",
  });
}

function requestedRef() {
  return String(process.env.NUVIO_PROVIDERS_REF || pinnedRef).trim() || pinnedRef;
}

function currentHead() {
  if (!fs.existsSync(path.join(vendorDir, ".git"))) return "";
  try {
    return String(run("git", ["rev-parse", "HEAD"], vendorDir, { capture: true }).stdout || "").trim();
  } catch {
    return "";
  }
}

function markerMatches(ref) {
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return marker && marker.ref === ref && currentHead() === ref;
  } catch {
    return false;
  }
}

function ensureRepository(ref) {
  fs.mkdirSync(vendorRoot, { recursive: true });

  if (!fs.existsSync(path.join(vendorDir, ".git"))) {
    if (fs.existsSync(vendorDir)) {
      fs.rmSync(vendorDir, { recursive: true, force: true });
    }
    console.log("[nuvio-setup] Cloning the Nuvio provider pack...");
    run("git", ["clone", "--filter=blob:none", "--no-checkout", repoUrl, vendorDir], root);
  }

  console.log(`[nuvio-setup] Pinning provider pack to ${ref}.`);
  run("git", ["fetch", "--depth", "1", "origin", ref], vendorDir);
  run("git", ["checkout", "--detach", "--force", ref], vendorDir);
  run("git", ["reset", "--hard", ref], vendorDir);
  run("git", ["clean", "-fd", "--exclude=node_modules", "--exclude=.swifly-nuvio-ready.json"], vendorDir);
}

function installDependencies() {
  console.log("[nuvio-setup] Installing provider runtime dependencies...");
  runNpm(["install", "--omit=dev", "--no-audit", "--no-fund"], vendorDir);
}

function validateInstall(ref) {
  const required = [
    path.join(vendorDir, "manifest.json"),
    path.join(vendorDir, "providers"),
    path.join(vendorDir, "package.json"),
  ];
  for (const requiredPath of required) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`[nuvio-setup] Required provider asset is missing: ${requiredPath}`);
    }
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(vendorDir, "manifest.json"), "utf8"));
  const scrapers = Array.isArray(manifest && manifest.scrapers) ? manifest.scrapers : [];
  if (!scrapers.length) {
    throw new Error("[nuvio-setup] Provider manifest did not contain any scrapers.");
  }

  const marker = {
    repository: repoUrl,
    ref,
    installedAt: new Date().toISOString(),
    providerCount: scrapers.length,
    node: process.version,
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  return marker;
}

function ensureNuvioProviders(options = {}) {
  const ref = requestedRef();
  const force = Boolean(options.force || process.argv.includes("--force"));

  if (!force && markerMatches(ref)) {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    console.log(
      `[nuvio-setup] Provider pack already ready at ${ref.slice(0, 12)} (${marker.providerCount} manifest entries).`,
    );
    return { vendorDir, marker, changed: false };
  }

  ensureRepository(ref);
  installDependencies();
  const marker = validateInstall(ref);
  console.log(
    `[nuvio-setup] Provider pack ready at ${ref.slice(0, 12)} with ${marker.providerCount} manifest entries.`,
  );
  return { vendorDir, marker, changed: true };
}

module.exports = {
  ensureNuvioProviders,
  markerPath,
  pinnedRef,
  repoUrl,
  requestedRef,
  vendorDir,
};

if (require.main === module) {
  try {
    ensureNuvioProviders();
  } catch (error) {
    console.error("[nuvio-setup] Setup failed:", error.stack || error.message || error);
    process.exit(1);
  }
}
