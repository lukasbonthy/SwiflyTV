"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  customControlsPath,
  polishedPath,
  premiumPath,
  replacementForResolvedPath,
} = require("./start-cinepro-safe-style-chain.js");

const root = path.resolve(__dirname, "..");
const compactPath = path.join(root, "scripts", "start-cinepro-compact.js");
const hotfixPath = path.join(root, "scripts", "start-cinepro-languages-hotfix.js");

if (replacementForResolvedPath(polishedPath) !== customControlsPath) {
  throw new Error("[swifly-safe-style-qa] Polished injector is not redirected to stable custom controls.");
}
if (replacementForResolvedPath(premiumPath) !== customControlsPath) {
  throw new Error("[swifly-safe-style-qa] Premium injector is not redirected to stable custom controls.");
}
if (replacementForResolvedPath(customControlsPath)) {
  throw new Error("[swifly-safe-style-qa] Stable custom controls were incorrectly treated as a legacy injector.");
}

const compactSource = fs.readFileSync(compactPath, "utf8").replace(/\r\n?/g, "\n");
if (!compactSource.includes('require("./start-cinepro-polished.js");')) {
  throw new Error("[swifly-safe-style-qa] Compact startup no longer exposes the expected legacy redirect point.");
}

const hotfixSource = fs.readFileSync(hotfixPath, "utf8").replace(/\r\n?/g, "\n");
if (!hotfixSource.includes('require("./start-cinepro-safe-style-chain.js")')) {
  throw new Error("[swifly-safe-style-qa] Language startup is not routed through the safe style chain.");
}
if (!hotfixSource.includes("loadLanguagesWithoutLegacyStyles()")) {
  throw new Error("[swifly-safe-style-qa] Safe style chain is loaded but never executed.");
}

const controlsSource = fs.readFileSync(customControlsPath, "utf8").replace(/\r\n?/g, "\n");
const marker = "const injected = String.raw`\n";
const start = controlsSource.indexOf(marker);
const end = start >= 0 ? controlsSource.indexOf("\n`;\n", start + marker.length) : -1;
if (start < 0 || end < 0) {
  throw new Error("[swifly-safe-style-qa] Could not extract the stable browser control payload.");
}
const browserPayload = controlsSource.slice(start + marker.length, end);
new vm.Script(browserPayload, { filename: "swifly-stable-browser-controls.js" });

if (/font-family:[^\n]*["']Segoe UI["']/.test(browserPayload)) {
  throw new Error("[swifly-safe-style-qa] Unsafe nested Segoe UI quotes survived in the active browser payload.");
}
if (/\[data-a=["']mute["']\]/.test(browserPayload)) {
  throw new Error("[swifly-safe-style-qa] Unsafe nested mute-selector quotes survived in the active browser payload.");
}

console.log("Swifly safe style chain and stable browser-control syntax QA passed.");
