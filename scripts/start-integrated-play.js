"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
let source = fs.readFileSync(serverPath, "utf8");

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
  "registerCreativePlay({ app, pageShell });\n\napp.get(\"/welcome\", welcomePage);\napp.get(\"/\", homePage);"
);

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule._compile(source, serverPath);
