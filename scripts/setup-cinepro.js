"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const vendorDir = path.join(root, "vendor", "cinepro-core");
const repoUrl = "https://github.com/cinepro-org/core.git";
const update = process.argv.includes("--update");
const build = process.argv.includes("--build") || !process.argv.includes("--no-build");

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: false,
    shell: Boolean(options.shell),
    env: { ...process.env, NODE_ENV: "development" },
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} could not start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${command} ${args.join(" ")} was terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || "";
}

function runNpm(args, cwd) {
  const npmCli = resolveNpmCli();
  if (npmCli) {
    run(process.execPath, [npmCli, ...args], cwd);
    return;
  }

  // Last-resort Windows fallback for installations where npm is available only
  // through npm.cmd on PATH. shell=true is required for .cmd resolution.
  run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd, {
    shell: process.platform === "win32",
  });
}

function main() {
  fs.mkdirSync(path.dirname(vendorDir), { recursive: true });

  if (!fs.existsSync(path.join(vendorDir, ".git"))) {
    if (fs.existsSync(vendorDir)) fs.rmSync(vendorDir, { recursive: true, force: true });
    console.log("[cinepro] Cloning CinePro Core...");
    run("git", ["clone", "--depth", "1", repoUrl, vendorDir]);
  } else if (update) {
    console.log("[cinepro] Updating CinePro Core...");
    run("git", ["fetch", "--depth", "1", "origin", "main"], vendorDir);
    run("git", ["reset", "--hard", "origin/main"], vendorDir);
  }

  console.log("[cinepro] Installing Core dependencies...");
  runNpm(["install", "--include=dev"], vendorDir);

  if (build) {
    console.log("[cinepro] Building Core...");
    runNpm(["run", "build"], vendorDir);
  }

  const marker = {
    repository: repoUrl,
    installedAt: new Date().toISOString(),
    built: build,
    node: process.version,
  };
  fs.writeFileSync(path.join(vendorDir, ".swifly-cinepro-ready.json"), JSON.stringify(marker, null, 2));
  console.log("[cinepro] CinePro Core is ready in vendor/cinepro-core.");
}

try {
  main();
} catch (error) {
  console.error("[cinepro] Setup failed:", error.stack || error.message || error);
  process.exit(1);
}
