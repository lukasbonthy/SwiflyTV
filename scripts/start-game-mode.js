"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");

// MonkeyGG2's editable config is JSONC with inline comments. Its generated
// js/config.js contains the same full catalog as valid JSON prefixed by
// `var json=`. Normalize only that catalog request before game-mode.js sees it.
const nativeFetch = global.fetch;
if (typeof nativeFetch === "function") {
  global.fetch = async (resource, options) => {
    const requestedUrl = String(resource || "");
    if (requestedUrl.includes("MonkeyGG2/monkeygg2.github.io") && requestedUrl.endsWith("/config.jsonc")) {
      const generatedUrl = requestedUrl.replace(/\/config\.jsonc$/, "/js/config.js");
      const response = await nativeFetch(generatedUrl, options);
      const sourceText = await response.text();
      const normalized = sourceText
        .replace(/^\s*var\s+json\s*=\s*/, "")
        .replace(/;\s*$/, "");
      return new Response(normalized, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    return nativeFetch(resource, options);
  };
}

let source = fs.readFileSync(serverPath, "utf8").replace(/\r\n?/g, "\n");

function replaceOnce(label, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`[game-mode] Could not find ${label}; server.js was not modified.`);
  }
  source = source.replace(needle, replacement);
}

replaceOnce(
  "app declaration",
  "const app = express();",
  "const app = express();\nconst { registerGameMode } = require(\"./game-mode\");"
);

replaceOnce(
  "stylesheet slot",
  "  ${extraHead}\n  <style>",
  "  ${extraHead}\n  <link rel=\"stylesheet\" href=\"/game-mode.css\" />\n  <style>"
);

replaceOnce(
  "desktop Movies navigation",
  '${navLink("/movies", "Movies", "movies", active)}',
  '${navLink("/movies", "Games", "movies", active)}'
);
replaceOnce(
  "desktop TV navigation",
  '${navLink("/tv", "TV Shows", "tv", active)}',
  '${navLink("/tv", "Arcade", "tv", active)}'
);
replaceOnce(
  "desktop languages navigation",
  '${navLink("/browse-by-languages", "Languages", "genres", active)}',
  '${navLink("/browse-by-languages", "Genres", "genres", active)}'
);
replaceOnce(
  "mobile Movies navigation",
  '${navLink("/movies", "Movies", "movies", active)}',
  '${navLink("/movies", "Games", "movies", active)}'
);
replaceOnce(
  "mobile TV navigation",
  '${navLink("/tv", "TV", "tv", active)}',
  '${navLink("/tv", "Arcade", "tv", active)}'
);

source = source
  .replace('placeholder="Search" autocomplete="off"', 'placeholder="Search games" autocomplete="off"')
  .replace('placeholder="Search movies, shows, actors..." autocomplete="off"', 'placeholder="Search games, genres, aliases..." autocomplete="off"');

replaceOnce(
  "route registration",
  'app.get("/welcome", welcomePage);\napp.get("/", homePage);',
  'registerGameMode({ app, pageShell, escapeHtml });\n\napp.get("/welcome", welcomePage);\napp.get("/", homePage);'
);

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule._compile(source, serverPath);
