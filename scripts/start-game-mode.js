"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const syncScript = path.join(root, "scripts", "sync-monkey-games.js");
const vendorGames = path.join(root, "vendor", "monkeygg2", "games");
const vendorConfig = path.join(root, "vendor", "monkeygg2", "js", "config.js");

function ensureLocalGames() {
  if (fs.existsSync(vendorGames) && fs.existsSync(vendorConfig)) return;
  console.log("[game-mode] Local game files are missing. Installing them now...");
  const result = spawnSync(process.execPath, [syncScript], {
    cwd: root,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.status !== 0 || !fs.existsSync(vendorGames) || !fs.existsSync(vendorConfig)) {
    throw new Error("Local MonkeyGG2 game files could not be installed. Run npm run sync-games, then retry npm start.");
  }
}

ensureLocalGames();

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
  "const app = express();\nconst { registerGameMode } = require(\"./game-mode-local\");",
);

replaceOnce(
  "stylesheet slot",
  "  ${extraHead}\n  <style>",
  "  ${extraHead}\n  <link rel=\"stylesheet\" href=\"/game-mode.css\" />\n  <style>",
);

replaceOnce(
  "desktop Movies navigation",
  '${navLink("/movies", "Movies", "movies", active)}',
  '${navLink("/movies", "Games", "movies", active)}',
);
replaceOnce(
  "desktop TV navigation",
  '${navLink("/tv", "TV Shows", "tv", active)}',
  '${navLink("/tv", "Arcade", "tv", active)}',
);
replaceOnce(
  "desktop languages navigation",
  '${navLink("/browse-by-languages", "Languages", "genres", active)}',
  '${navLink("/browse-by-languages", "Genres", "genres", active)}',
);
replaceOnce(
  "mobile Movies navigation",
  '${navLink("/movies", "Movies", "movies", active)}',
  '${navLink("/movies", "Games", "movies", active)}',
);
replaceOnce(
  "mobile TV navigation",
  '${navLink("/tv", "TV", "tv", active)}',
  '${navLink("/tv", "Arcade", "tv", active)}',
);

source = source
  .replace('placeholder="Search" autocomplete="off"', 'placeholder="Search games" autocomplete="off"')
  .replace('placeholder="Search movies, shows, actors..." autocomplete="off"', 'placeholder="Search games, genres, aliases..." autocomplete="off"');

replaceOnce(
  "route registration",
  'app.get("/welcome", welcomePage);\napp.get("/", homePage);',
  'registerGameMode({ app, pageShell, escapeHtml });\n\napp.get("/welcome", welcomePage);\napp.get("/", homePage);',
);

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule._compile(source, serverPath);
