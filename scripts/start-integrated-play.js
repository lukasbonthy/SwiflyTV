"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");

// Git commonly checks files out with CRLF on Windows. Normalize the in-memory
// source before matching so the same loader works on Windows, Linux, and macOS.
let source = fs.readFileSync(serverPath, "utf8").replace(/\r\n?/g, "\n");

function replaceOnce(label, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`[integrated-play] Could not find ${label}; server.js was not modified.`);
  }
  source = source.replace(needle, replacement);
}

replaceOnce(
  "app declaration",
  "const app = express();",
  "const app = express();\nconst { registerCreativePlay, playHomeSpotlight } = require(\"./creative-play\");"
);

replaceOnce(
  "play stylesheet slot",
  "  ${extraHead}\n  <style>",
  "  ${extraHead}\n  <link rel=\"stylesheet\" href=\"/swifly-play.css\" />\n  <style>"
);

replaceOnce(
  "desktop navigation",
  "          ${navLink(\"/\", \"Home\", \"home\", active)}\n          ${navLink(\"/movies\", \"Movies\", \"movies\", active)}",
  "          ${navLink(\"/\", \"Home\", \"home\", active)}\n          ${navLink(\"/play\", \"Play\", \"play\", active)}\n          ${navLink(\"/movies\", \"Movies\", \"movies\", active)}"
);

replaceOnce(
  "mobile navigation",
  "    ${navLink(\"/\", \"Home\", \"home\", active)}\n    ${navLink(\"/movies\", \"Movies\", \"movies\", active)}",
  "    ${navLink(\"/\", \"Home\", \"home\", active)}\n    ${navLink(\"/play\", \"Play\", \"play\", active)}\n    ${navLink(\"/movies\", \"Movies\", \"movies\", active)}"
);

replaceOnce(
  "homepage play spotlight",
  "      ${dsCleanSpotlight(spotlightMovie, \"movie\")}\n      ${dsRail(\"Trending Now\"",
  "      ${dsCleanSpotlight(spotlightMovie, \"movie\")}\n      ${playHomeSpotlight()}\n      ${dsRail(\"Trending Now\""
);

replaceOnce(
  "route registration",
  "app.get(\"/welcome\", welcomePage);\napp.get(\"/\", homePage);",
  "app.get(\"/swifly-play.js\", (_req, res) => {\n  const repairedClient = fs.readFileSync(path.join(__dirname, \"creative-play-client.js\"), \"utf8\").replace(\"}););\", \"}));\");\n  res.type(\"application/javascript\").send(repairedClient);\n});\nregisterCreativePlay({ app, pageShell });\n\napp.get(\"/welcome\", welcomePage);\napp.get(\"/\", homePage);"
);

const requiredMarkers = [
  "registerCreativePlay({ app, pageShell });",
  "href=\"/swifly-play.css\"",
  "navLink(\"/play\", \"Play\", \"play\", active)",
  "${playHomeSpotlight()}",
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`[integrated-play] Verification failed for marker: ${marker}`);
  }
}

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule._compile(source, serverPath);
