"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { patchLanguagesSafe } = require("./start-cinepro-stream-options-hotfix.js");

const languagesPath = path.join(__dirname, "start-cinepro-languages.js");
const original = fs.readFileSync(languagesPath, "utf8");
const transformed = patchLanguagesSafe(original);

new vm.Script(transformed, { filename: languagesPath });

if (!transformed.includes('function fillSourceOptions()')) {
  throw new Error("[swifly-stream-options-runtime-qa] Source options were not generated.");
}

if (!transformed.includes('function fillQualityOptions()')) {
  throw new Error("[swifly-stream-options-runtime-qa] Complete quality options were not generated.");
}

if (!transformed.includes('function nativeCaptionTracks()')) {
  throw new Error("[swifly-stream-options-runtime-qa] Native caption discovery was not generated.");
}

if (!transformed.includes('\n          }\n\n`,\n    "caption language helpers",')) {
  throw new Error("[swifly-stream-options-runtime-qa] Caption helper template is not closed safely.");
}

console.log("Swifly runtime-generated settings syntax QA passed.");
