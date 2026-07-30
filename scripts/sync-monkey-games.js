"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const vendorParent = path.join(root, "vendor");
const vendorDir = path.join(vendorParent, "monkeygg2");
const gamesDir = path.join(vendorDir, "games");
const configFile = path.join(vendorDir, "js", "config.js");
const markerFile = path.join(vendorDir, ".swifly-vendor-ready.json");
const repoUrl = "https://github.com/MonkeyGG2/monkeygg2.github.io.git";
const updateRequested = process.argv.includes("--update");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    windowsHide: false,
  });
  if (!options.allowFailure && result.status !== 0) {
    const details = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}.${details}`);
  }
  return result;
}

function ready() {
  return fs.existsSync(gamesDir) && fs.existsSync(configFile) && fs.existsSync(markerFile);
}

function cloneOrUpdate() {
  fs.mkdirSync(vendorParent, { recursive: true });

  if (!fs.existsSync(path.join(vendorDir, ".git"))) {
    if (fs.existsSync(vendorDir)) fs.rmSync(vendorDir, { recursive: true, force: true });
    console.log("[games] Downloading the MonkeyGG2 game files into vendor/monkeygg2...");
    run("git", [
      "-c", "core.longpaths=true",
      "clone",
      "--depth", "1",
      "--filter=blob:none",
      "--sparse",
      repoUrl,
      vendorDir,
    ]);
    run("git", ["-c", "core.longpaths=true", "-C", vendorDir, "sparse-checkout", "set", "games", "imgs", "js"]);
  } else if (updateRequested || !ready()) {
    console.log("[games] Updating and sanitizing the local MonkeyGG2 files...");
    run("git", ["-c", "core.longpaths=true", "-C", vendorDir, "fetch", "--depth", "1", "origin", "main"]);
    run("git", ["-c", "core.longpaths=true", "-C", vendorDir, "reset", "--hard", "origin/main"]);
    run("git", ["-c", "core.longpaths=true", "-C", vendorDir, "sparse-checkout", "set", "games", "imgs", "js"]);
  }
}

function patchRedirects() {
  const grep = run(
    "git",
    [
      "-C", vendorDir,
      "grep", "-Il",
      "-e", "pijgalk.desarrollos-lowcost.com",
      "-e", "monkeygg2.github.io/games",
      "--", "games",
    ],
    { capture: true, allowFailure: true },
  );

  if (grep.status !== 0 || !grep.stdout.trim()) return 0;

  let changed = 0;
  for (const relative of grep.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const file = path.join(vendorDir, relative);
    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const repaired = source
      .replace(/https?:\/\/pijgalk\.desarrollos-lowcost\.com\/games\//gi, "/games/")
      .replace(/\/\/pijgalk\.desarrollos-lowcost\.com\/games\//gi, "/games/")
      .replace(/https?:\/\/monkeygg2\.github\.io\/games\//gi, "/games/")
      .replace(/\/\/monkeygg2\.github\.io\/games\//gi, "/games/");
    if (repaired !== source) {
      fs.writeFileSync(file, repaired, "utf8");
      changed += 1;
    }
  }
  return changed;
}

function currentCommit() {
  const result = run("git", ["-C", vendorDir, "rev-parse", "HEAD"], { capture: true, allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function main() {
  if (ready() && !updateRequested) {
    console.log("[games] Local MonkeyGG2 files are already installed and sanitized.");
    return;
  }

  cloneOrUpdate();
  if (!fs.existsSync(gamesDir) || !fs.existsSync(configFile)) {
    throw new Error("MonkeyGG2 checkout completed, but games/ or js/config.js is missing.");
  }

  const patchedFiles = patchRedirects();
  fs.writeFileSync(markerFile, JSON.stringify({
    repository: repoUrl,
    commit: currentCommit(),
    patchedRedirectFiles: patchedFiles,
    installedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`[games] Local files ready. Removed external game redirects from ${patchedFiles} file(s).`);
}

try {
  main();
} catch (error) {
  console.error("[games] Failed to install the local game files:", error.message || error);
  process.exit(1);
}
