"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const polishPath = path.join(root, "ui-polish.css");

function fail(message, error) {
  console.error(`[ui-polish] ${message}`);
  if (error) console.error(error.stack || error.message || error);
  process.exit(1);
}

let source;
let css;

try {
  source = fs.readFileSync(serverPath, "utf8");
  css = fs.readFileSync(polishPath, "utf8");
} catch (error) {
  fail("Could not read server.js or ui-polish.css.", error);
}

if (css.includes("</style")) {
  fail("ui-polish.css cannot contain a closing style tag.");
}

const headClosePattern = /\r?\n<\/head>\r?\n<body>/;
if (!headClosePattern.test(source)) {
  fail("Could not find the page-shell head marker in server.js. The UI layer was not applied.");
}

const injectedSource = source.replace(
  headClosePattern,
  `\n<style id="swifly-ui-polish">\n${css}\n</style>\n</head>\n<body>`
);

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule._compile(injectedSource, serverPath);
