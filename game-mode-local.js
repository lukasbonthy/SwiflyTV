"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

const MONKEY_REPO = "https://github.com/MonkeyGG2/monkeygg2.github.io";
const VENDOR_ROOT = path.join(__dirname, "vendor", "monkeygg2");
const GAMES_ROOT = path.join(VENDOR_ROOT, "games");
const IMGS_ROOT = path.join(VENDOR_ROOT, "imgs");
const CONFIG_FILE = path.join(VENDOR_ROOT, "js", "config.js");
const CATALOG_TTL_MS = 30 * 60 * 1000;

let catalogCache = null;
let catalogLoadedAt = 0;
const artworkCache = new Map();

const FEATURED_NAMES = [
  "Retro Bowl",
  "Slope",
  "2048",
  "Drive Mad",
  "Cookie Clicker",
  "Basketball Stars",
  "Fireboy and Watergirl in the Forest Temple",
  "Tunnel Rush",
  "MotoX3M",
  "Subway Surfers",
  "Vex 6",
  "1v1.LOL",
];

const FALLBACK_GAMES = [
  ["1v1.LOL", "1v1-lol", ["online", "battle"]],
  ["2048", "2048", ["puzzle", "classic"]],
  ["Basketball Stars", "basketball-stars", ["sports", "multiplayer"]],
  ["Chrome Dino", "chrome-dino", ["arcade", "classic"]],
  ["Cookie Clicker", "cookie-clicker", ["idle", "classic"]],
  ["Crossy Road", "crossy-road", ["arcade"]],
  ["Drive Mad", "drive-mad", ["racing", "physics"]],
  ["Fireboy and Watergirl in the Forest Temple", "fireboy-and-watergirl", ["puzzle", "co-op"]],
  ["Friday Night Funkin", "friday-night-funkin", ["rhythm", "music"]],
  ["MotoX3M", "motox3m", ["racing", "stunts"]],
  ["Retro Bowl", "retro-bowl", ["sports", "strategy"]],
  ["Run 3", "run-3", ["platformer", "arcade"]],
  ["Slope", "slope", ["arcade", "quick"]],
  ["Subway Surfers", "subway-surfers", ["runner", "arcade"]],
  ["Tunnel Rush", "tunnel-rush", ["quick", "arcade"]],
  ["Vex 6", "vex-6", ["platformer", "skill"]],
].map(([name, gamePath, categories]) => ({ name, path: gamePath, aliases: [], categories }));

const DESCRIPTIONS = {
  "2048": "Slide matching numbers together and chase the legendary 2048 tile in this clean puzzle classic.",
  "1v1.LOL": "Build, aim, and battle in a fast competitive arena where every wall and shot matters.",
  "Basketball Stars": "Quick basketball matchups with sharp movement, dunks, blocks, and competitive local play.",
  "Cookie Clicker": "Start with one cookie, build an absurd production empire, and watch the numbers explode.",
  "Drive Mad": "Guide strange vehicles across physics-heavy tracks without flipping, snapping, or falling apart.",
  "Fireboy and Watergirl in the Forest Temple": "Coordinate two elemental heroes through switches, traps, and puzzle rooms.",
  "MotoX3M": "Race through stunt-packed motorcycle courses filled with flips, hazards, and impossible shortcuts.",
  "Retro Bowl": "Manage a football team, call the plays, and build a championship run with retro-styled action.",
  "Slope": "Stay alive on a neon downhill course that becomes faster, tighter, and more chaotic every second.",
  "Subway Surfers": "Dash through tracks, dodge obstacles, and chase a longer run in the endless runner favorite.",
  "Tunnel Rush": "React instantly while flying through a twisting tunnel full of shifting shapes and sudden gaps.",
  "Vex 6": "Run, jump, slide, and survive precision platforming courses built around speed and timing.",
};

function hashNumber(value) {
  const digest = crypto.createHash("sha1").update(String(value)).digest();
  return digest.readUInt32BE(0);
}

function slugify(value) {
  return String(value || "game")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "game";
}

function makeGameId(name, gamePath) {
  return `${slugify(name)}-${crypto.createHash("sha1").update(String(gamePath)).digest("hex").slice(0, 6)}`;
}

function inferCategories(name, gamePath, supplied = []) {
  const source = `${name} ${gamePath} ${supplied.join(" ")}`.toLowerCase();
  const result = new Set(supplied.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  const add = (value) => result.add(value);

  if (/drift|drive|moto|car|race|racing|kart/.test(source)) add("racing");
  if (/basket|football|soccer|boxing|sports|golf|tennis|hockey/.test(source)) add("sports");
  if (/puzzle|escape|bloxorz|2048|tetris|breaklock|fireboy/.test(source)) add("puzzle");
  if (/online|1v1|battle|io\b|multiplayer|evo/.test(source)) add("multiplayer");
  if (/clicker|idle|miner/.test(source)) add("idle");
  if (/run|runner|subway|temple/.test(source)) add("runner");
  if (/platform|vex|ovo|jump|ninja/.test(source)) add("platformer");
  if (/minecraft|eagler|sandbox/.test(source)) add("sandbox");
  if (/quiz|trivia|feud/.test(source)) add("trivia");
  if (/rhythm|funkin|music/.test(source)) add("music");
  if (/flash\/?/.test(source)) add("classic");
  if (!result.size) add("arcade");
  return [...result].slice(0, 4);
}

function titleCase(value) {
  return String(value || "Arcade")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function encodeGamePath(rawPath) {
  const text = String(rawPath || "").replace(/^\/+/, "");
  const queryIndex = text.indexOf("?");
  const pathname = queryIndex >= 0 ? text.slice(0, queryIndex) : text;
  const query = queryIndex >= 0 ? text.slice(queryIndex) : "";
  const encoded = pathname.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${encoded}${query}`;
}

function normalizeGame(name, raw = {}) {
  const gamePath = String(raw.path || "").trim().replace(/^\/+/, "");
  if (!gamePath || gamePath.includes("..") || /^https?:/i.test(gamePath)) return null;
  const categories = inferCategories(name, gamePath, Array.isArray(raw.categories) ? raw.categories : []);
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.map(String).filter(Boolean).slice(0, 12) : [];
  const id = makeGameId(name, gamePath);
  const score = 7.2 + (hashNumber(id) % 27) / 10;
  const primaryCategory = titleCase(categories[0] || "arcade");
  const description = DESCRIPTIONS[name] || `Jump into ${name}, a ${primaryCategory.toLowerCase()} browser game stored in Swifly's local MonkeyGG2 game library.`;

  return {
    id,
    name: String(name).trim(),
    path: gamePath,
    aliases,
    categories,
    primaryCategory,
    description,
    score: Math.min(9.8, Number(score.toFixed(1))),
    launchUrl: `/vendor-games/${encodeGamePath(gamePath)}`,
    featured: FEATURED_NAMES.includes(String(name).trim()),
  };
}

function readLocalConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error("vendor/monkeygg2/js/config.js is missing. Run npm run sync-games.");
  }
  const source = fs.readFileSync(CONFIG_FILE, "utf8")
    .replace(/^\s*(?:var|let|const)\s+json\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(source);
}

async function loadCatalog(force = false) {
  if (!force && catalogCache && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return catalogCache;

  try {
    const parsed = readLocalConfig();
    const games = parsed && parsed.games && typeof parsed.games === "object" ? parsed.games : {};
    catalogCache = Object.entries(games)
      .map(([name, value]) => normalizeGame(name, value || {}))
      .filter(Boolean)
      .filter((game) => !/epstein|porn|hentai|nsfw/i.test(game.name));
    if (catalogCache.length < 20) throw new Error("local catalog did not contain enough games");
  } catch (error) {
    console.warn("[game-mode] local catalog fallback:", error.message || error);
    catalogCache = FALLBACK_GAMES.map((entry) => normalizeGame(entry.name, entry)).filter(Boolean);
  }

  catalogCache.sort((a, b) => a.name.localeCompare(b.name));
  catalogLoadedAt = Date.now();
  return catalogCache;
}

function getGameById(catalog, id) {
  return catalog.find((game) => game.id === id) || null;
}

function safeWithin(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function gameEntryLocation(game) {
  const pathname = game.path.split("?")[0].replace(/^\/+|\/+$/g, "");
  const resolved = safeWithin(GAMES_ROOT, path.join(GAMES_ROOT, pathname));
  if (!resolved) return null;
  try {
    const stat = fs.statSync(resolved);
    return stat.isDirectory()
      ? { directory: resolved, indexFile: path.join(resolved, "index.html") }
      : { directory: path.dirname(resolved), indexFile: resolved };
  } catch {
    return { directory: resolved, indexFile: path.join(resolved, "index.html") };
  }
}

function imageScore(file, htmlBonus = 0) {
  const base = path.basename(file).toLowerCase();
  const full = file.toLowerCase();
  let score = htmlBonus;
  if (/thumbnail|thumb/.test(base)) score += 260;
  if (/cover/.test(base)) score += 245;
  if (/logo/.test(base)) score += 235;
  if (/title/.test(base)) score += 220;
  if (/splash/.test(base)) score += 205;
  if (/icon/.test(base)) score += 185;
  if (/favicon/.test(base)) score += 160;
  if (/loading|loader/.test(base)) score += 105;
  if (/background|\bbg\b/.test(base)) score += 90;
  if (/assets|images|imgs/.test(full)) score += 18;
  if (/sprite|atlas|button|cursor|particle|font|tile|badge|achievement|avatar|skin|enemy|character|player/.test(base)) score -= 180;
  try {
    const size = fs.statSync(file).size;
    score += Math.min(80, Math.log2(Math.max(1, size)) * 4);
    if (size < 1200) score -= 80;
  } catch {
    score -= 500;
  }
  return score;
}

function resolveHtmlReference(reference, directory) {
  const clean = String(reference || "").trim().split(/[?#]/)[0];
  if (!clean || /^(?:data:|blob:|javascript:|https?:|\/\/)/i.test(clean)) return null;
  let candidate;
  if (clean.startsWith("/games/")) candidate = path.join(GAMES_ROOT, clean.slice("/games/".length));
  else if (clean.startsWith("/imgs/")) candidate = path.join(IMGS_ROOT, clean.slice("/imgs/".length));
  else if (clean.startsWith("/")) candidate = path.join(VENDOR_ROOT, clean.slice(1));
  else candidate = path.resolve(directory, clean);
  const safe = safeWithin(VENDOR_ROOT, candidate);
  return safe && fs.existsSync(safe) ? safe : null;
}

function htmlArtworkCandidates(indexFile, directory) {
  if (!fs.existsSync(indexFile)) return [];
  let html;
  try {
    html = fs.readFileSync(indexFile, "utf8");
  } catch {
    return [];
  }

  const refs = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
    /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    let count = 0;
    while ((match = pattern.exec(html)) && count < 30) {
      const resolved = resolveHtmlReference(match[1], directory);
      if (resolved && /\.(?:png|jpe?g|webp|gif|svg|ico)$/i.test(resolved)) refs.push(resolved);
      count += 1;
    }
  }
  return refs;
}

function recursiveArtworkCandidates(directory, maxDepth = 3, maxFiles = 1200) {
  const results = [];
  let visited = 0;

  function walk(current, depth) {
    if (depth > maxDepth || visited >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= maxFiles) break;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!/audio|sound|music|fonts?|levels?|maps?|scripts?|js$/i.test(entry.name)) walk(full, depth + 1);
      } else {
        visited += 1;
        if (/\.(?:png|jpe?g|webp|gif|svg|ico)$/i.test(entry.name)) results.push(full);
      }
    }
  }

  walk(directory, 0);
  return results;
}

function resolveArtwork(game) {
  if (artworkCache.has(game.id)) return artworkCache.get(game.id);
  const location = gameEntryLocation(game);
  if (!location || !fs.existsSync(location.directory)) {
    artworkCache.set(game.id, null);
    return null;
  }

  const directNames = [
    "thumbnail.png", "thumbnail.jpg", "thumbnail.webp",
    "cover.png", "cover.jpg", "cover.webp",
    "logo.png", "logo.svg", "logo.webp",
    "title.png", "title.svg",
    "splash.png", "splash.jpg", "splash.webp",
    "icon.png", "icon.webp", "favicon.png", "favicon.ico",
    path.join("assets", "thumbnail.png"), path.join("assets", "cover.png"), path.join("assets", "logo.png"), path.join("assets", "icon.png"),
    path.join("images", "thumbnail.png"), path.join("images", "cover.png"), path.join("images", "logo.png"), path.join("images", "icon.png"),
    path.join("img", "thumbnail.png"), path.join("img", "cover.png"), path.join("img", "logo.png"), path.join("img", "icon.png"),
  ].map((relative) => path.join(location.directory, relative)).filter((candidate) => fs.existsSync(candidate));

  const htmlCandidates = htmlArtworkCandidates(location.indexFile, location.directory);
  const scanned = recursiveArtworkCandidates(location.directory);
  const unique = [...new Set([...directNames, ...htmlCandidates, ...scanned])];
  const htmlSet = new Set(htmlCandidates);
  const ranked = unique
    .map((file) => ({ file, score: imageScore(file, htmlSet.has(file) ? 120 : 0) }))
    .sort((a, b) => b.score - a.score);
  const chosen = ranked[0] && ranked[0].score > 0 ? ranked[0].file : null;
  artworkCache.set(game.id, chosen);
  return chosen;
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[char]);
}

function artSvg(game, wide = false) {
  const width = wide ? 1280 : 780;
  const height = wide ? 720 : 440;
  const seed = hashNumber(game.id);
  const hueA = seed % 360;
  const hueB = (hueA + 70) % 360;
  const initials = game.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const title = escapeXml(game.name.length > 30 ? `${game.name.slice(0, 29)}…` : game.name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hueA} 72% 25%)"/><stop offset=".58" stop-color="hsl(${hueB} 75% 17%)"/><stop offset="1" stop-color="#050712"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="36"/></filter></defs>
  <rect width="${width}" height="${height}" rx="30" fill="url(#bg)"/><circle cx="${width * 0.22}" cy="${height * 0.22}" r="${height * 0.42}" fill="hsl(${hueB} 90% 62% / .35)" filter="url(#b)"/>
  <rect x="${width * 0.075}" y="${height * 0.13}" width="${height * 0.22}" height="${height * 0.22}" rx="${height * 0.05}" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.3)"/>
  <text x="${width * 0.075 + height * 0.11}" y="${height * 0.13 + height * 0.145}" text-anchor="middle" fill="#fff" font-family="Arial" font-size="${height * 0.09}" font-weight="800">${escapeXml(initials)}</text>
  <text x="${width * 0.075}" y="${height * 0.62}" fill="#fff" font-family="Arial" font-size="${wide ? 62 : 42}" font-weight="800">${title}</text>
  <text x="${width * 0.075}" y="${height * 0.72}" fill="rgba(255,255,255,.65)" font-family="Arial" font-size="${wide ? 23 : 17}" font-weight="700" letter-spacing="3">LOCAL WEB GAME</text>
</svg>`;
}

function seededShuffle(items, seedText) {
  const copy = [...items];
  let seed = hashNumber(seedText);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function registerGameMode({ app, pageShell, escapeHtml }) {
  const esc = typeof escapeHtml === "function"
    ? escapeHtml
    : (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  const staticOptions = {
    index: "index.html",
    fallthrough: true,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    setHeaders(res, file) {
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (/\.html?$/i.test(file)) res.setHeader("Cache-Control", "no-cache");
    },
  };

  app.use("/vendor-games", express.static(GAMES_ROOT, staticOptions));
  app.use("/games", express.static(GAMES_ROOT, staticOptions));
  app.use("/imgs", express.static(IMGS_ROOT, staticOptions));

  const imageMarkup = (game, className = "") => `<img class="${esc(className)}" src="/game-cover/${encodeURIComponent(game.id)}" data-game-image data-game-fallbacks="${esc(JSON.stringify([`/game-art/${encodeURIComponent(game.id)}.svg`]))}" alt="${esc(game.name)} logo or game artwork" loading="lazy" />`;

  const card = (game, options = {}) => {
    const hidden = options.hidden ? " hidden" : "";
    const dataLibrary = options.library ? ` data-game-library-id="${esc(game.id)}"` : "";
    return `<article class="movieCard dsCard gameModeCard" data-title="${esc(game.name.toLowerCase())}"${dataLibrary}${hidden}>
      <a href="/watch/movie/${encodeURIComponent(game.id)}?mode=game" class="posterWrap dsThumb gameModeThumb" aria-label="Play ${esc(game.name)}">
        <div class="gameModeArtworkBackdrop">${imageMarkup(game)}</div>
        <div class="gameModeArtworkLogo">${imageMarkup(game)}</div>
        <div class="gameModeImageShade"></div>
        <div class="dsCardOverlay">
          <div class="dsCardControls">
            <span class="dsPlayDot">▶</span>
            <button class="dsMiniBtn" type="button" data-game-list="${esc(game.id)}" aria-label="Add ${esc(game.name)} to My List">＋</button>
            <button class="dsMiniBtn dsHeartBtn" type="button" data-game-like="${esc(game.id)}" aria-label="Like ${esc(game.name)}">♡</button>
            <button class="dsMiniBtn dsInfoBtn" type="button" data-game-info="${esc(game.id)}" aria-label="More info for ${esc(game.name)}">ⓘ</button>
          </div>
          <div class="dsCardTitle">${esc(game.name)}</div>
          <div class="dsCardMeta"><b>${esc(game.primaryCategory)}</b><span>${esc(game.score.toFixed(1))}</span><span>Local Game</span></div>
        </div>
      </a>
    </article>`;
  };

  const rail = (title, games, tag = "") => {
    const cards = games.slice(0, 18).map((game) => card(game)).join("");
    if (!cards) return "";
    return `<section class="dsRow gameModeRow"><div class="dsRowHead"><h2>${esc(title)}</h2>${tag ? `<span class="dsRowTag">${esc(tag)}</span>` : ""}</div><div class="movieRail dsRail">${cards}</div></section>`;
  };

  const hero = (game) => `<section class="gameModeHero container">
    <div class="gameModeHeroBackdrop"><div class="gameModeHeroBlur">${imageMarkup(game, "gameModeHeroImage")}</div><div class="gameModeHeroLogo">${imageMarkup(game, "gameModeHeroImage")}</div></div>
    <div class="gameModeHeroShade"></div>
    <div class="gameModeHeroCopy">
      <span class="gameModeEyebrow">Featured local web game</span><h1>${esc(game.name)}</h1><p>${esc(game.description)}</p>
      <div class="gameModeHeroMeta"><b>${esc(game.primaryCategory)}</b><span>${esc(game.score.toFixed(1))} player score</span><span>Served from your files</span></div>
      <div class="gameModeHeroActions"><a class="dsPrimaryBtn" href="/watch/movie/${encodeURIComponent(game.id)}?mode=game">▶ Play now</a><a class="dsSecondaryBtn" href="/movie/${encodeURIComponent(game.id)}">ⓘ More info</a><button class="dsSecondaryBtn" type="button" data-game-random>✦ Surprise me</button></div>
    </div>
  </section>`;

  const pageIntro = (eyebrow, title, description) => `<section class="container gameModePageIntro"><span class="gameModeEyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></section>`;
  const listingBody = (title, description, games, options = {}) => `<main class="gameModePage">${pageIntro(options.eyebrow || "Swifly Games", title, description)}<section class="dsContent gameModeListingContent"><div class="gameModeToolbar"><span>${games.length.toLocaleString("en-US")} games</span><button class="dsSecondaryBtn" type="button" data-game-random>Random game</button></div><div class="gameModeGrid">${games.map((game) => card(game)).join("")}</div></section><script src="/game-mode.js" defer></script></main>`;
  const sendPage = (res, options) => res.send(pageShell(options));

  app.get("/game-mode.css", (_req, res) => res.type("text/css").sendFile(path.join(__dirname, "game-mode.css")));
  app.get("/game-mode.js", (_req, res) => res.type("application/javascript").sendFile(path.join(__dirname, "game-mode-client.js")));

  app.get("/game-cover/:id", async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.status(404).end();
    const artwork = resolveArtwork(game);
    res.set("Cache-Control", "public, max-age=86400");
    if (artwork) return res.sendFile(artwork);
    return res.type("image/svg+xml").send(artSvg(game, req.query.wide === "1"));
  });

  app.get("/game-art/:id.svg", async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.status(404).end();
    res.set("Cache-Control", "public, max-age=86400");
    return res.type("image/svg+xml").send(artSvg(game, req.query.wide === "1"));
  });

  app.get("/api/game-catalog", async (req, res) => {
    const catalog = await loadCatalog(req.query.refresh === "1");
    res.json({ source: "local-files", repository: MONKEY_REPO, count: catalog.length, games: catalog });
  });

  app.get("/", async (_req, res) => {
    const catalog = await loadCatalog();
    const featured = FEATURED_NAMES.map((name) => catalog.find((game) => game.name === name)).filter(Boolean);
    const shuffled = seededShuffle(catalog, new Date().toISOString().slice(0, 10));
    const heroGame = featured[0] || shuffled[0];
    const category = (name) => catalog.filter((game) => game.categories.includes(name));
    const body = `<main class="gameModePage gameModeHome">${hero(heroGame)}<section class="dsContent">${rail("Featured Games", featured.length ? featured : shuffled.slice(0, 12), "Play now")}${rail("Trending Right Now", shuffled.slice(0, 18), "Updated daily")}${rail("Racing & Driving", category("racing"), "High speed")}${rail("Puzzle & Strategy", [...category("puzzle"), ...category("strategy")], "Think fast")}${rail("Multiplayer & Battle", [...category("multiplayer"), ...category("battle")], "Play together")}${rail("Arcade Classics", [...category("classic"), ...category("arcade")], "Old-school energy")}${rail("Platformers & Runners", [...category("platformer"), ...category("runner")], "Keep moving")}</section><script src="/game-mode.js" defer></script></main>`;
    sendPage(res, { title: "SwiflyTV — Local Web Games", description: "Play locally served browser games from the MonkeyGG2 collection inside SwiflyTV.", active: "home", body });
  });

  app.get(["/movies", "/discover/movie"], async (req, res) => {
    const catalog = await loadCatalog();
    const games = req.query.sort === "top_rated" ? [...catalog].sort((a, b) => b.score - a.score) : catalog;
    sendPage(res, { title: "All Games | SwiflyTV", description: "Browse the complete local game catalog.", active: "movies", body: listingBody("All Games", "Every title is loaded from the MonkeyGG2 files stored under vendor/monkeygg2/games.", games, { eyebrow: "Local game library" }) });
  });

  app.get(["/tv", "/discover/tv"], async (_req, res) => {
    const catalog = await loadCatalog();
    const arcade = catalog.filter((game) => game.categories.some((categoryName) => ["arcade", "runner", "platformer", "quick", "battle", "multiplayer"].includes(categoryName)));
    sendPage(res, { title: "Arcade | SwiflyTV", description: "Fast local browser games.", active: "tv", body: listingBody("Arcade", "Fast launches, easy replays, runners, platformers, battles, and quick games.", arcade, { eyebrow: "Quick play" }) });
  });

  app.get("/trending", async (_req, res) => {
    const catalog = await loadCatalog();
    const trending = seededShuffle(catalog, `trending-${new Date().toISOString().slice(0, 10)}`).sort((a, b) => Number(b.featured) - Number(a.featured));
    sendPage(res, { title: "Trending Games | SwiflyTV", description: "Daily rotating local game picks.", active: "trending", body: listingBody("Trending Games", "A rotating mix of featured favorites, competitive games, quick challenges, and unexpected picks.", trending, { eyebrow: "New & popular" }) });
  });

  app.get("/search", async (req, res) => {
    const catalog = await loadCatalog();
    const query = String(req.query.q || "").trim().toLowerCase();
    const results = query ? catalog.filter((game) => `${game.name} ${game.aliases.join(" ")} ${game.categories.join(" ")} ${game.description}`.toLowerCase().includes(query)) : catalog;
    sendPage(res, {
      title: query ? `Search: ${query} | SwiflyTV` : "Search Games | SwiflyTV",
      description: "Search the local Swifly game catalog.",
      active: "search",
      body: `<main class="gameModePage">${pageIntro("Search the library", query ? `Results for “${query}”` : "Find a game", query ? `${results.length} matching games.` : "Search by title, category, alias, or game style.")}<section class="dsContent gameModeListingContent"><form class="gameModeSearchForm" action="/search" method="get"><input name="q" value="${esc(req.query.q || "")}" placeholder="Search games, categories, or aliases" autofocus /><button class="dsPrimaryBtn" type="submit">Search</button></form>${results.length ? `<div class="gameModeGrid">${results.map((game) => card(game)).join("")}</div>` : `<div class="gameModeEmpty"><span>⌕</span><h2>No games found</h2><p>Try racing, puzzle, multiplayer, classic, or arcade.</p></div>`}</section><script src="/game-mode.js" defer></script></main>`,
    });
  });

  app.get("/browse-by-languages", async (_req, res) => {
    const catalog = await loadCatalog();
    const categories = [...new Set(catalog.flatMap((game) => game.categories))].sort();
    const body = `<main class="gameModePage">${pageIntro("Browse by genre", "Game Genres", "The original Swifly rails now organize the locally stored games by category.")}<section class="dsContent">${categories.map((categoryName) => rail(titleCase(categoryName), catalog.filter((game) => game.categories.includes(categoryName)))).join("")}</section><script src="/game-mode.js" defer></script></main>`;
    sendPage(res, { title: "Game Genres | SwiflyTV", description: "Browse local web games by genre.", active: "genres", body });
  });

  app.get("/kids", async (_req, res) => {
    const catalog = await loadCatalog();
    const safe = catalog.filter((game) => !game.categories.some((categoryName) => ["battle", "horror"].includes(categoryName)));
    sendPage(res, { title: "Kids Games | SwiflyTV", description: "A lighter local game selection.", active: "", body: listingBody("Kids Games", "A lighter mix of puzzles, runners, sports, classics, and easy-to-learn games.", safe, { eyebrow: "Family-friendly picks" }) });
  });

  app.get(["/my-list", "/liked"], async (req, res) => {
    const catalog = await loadCatalog();
    const kind = req.path === "/liked" ? "liked" : "list";
    const title = kind === "liked" ? "Liked Games" : "My List";
    const body = `<main class="gameModePage" data-game-library-page="${kind}">${pageIntro(kind === "liked" ? "Your favorites" : "Saved for later", title, kind === "liked" ? "Games you marked with a heart." : "Games you saved from any card or details page.")}<section class="dsContent gameModeListingContent"><div class="gameModeGrid" id="gameModeLibraryGrid">${catalog.map((game) => card(game, { hidden: true, library: true })).join("")}</div><div class="gameModeEmpty" id="gameModeLibraryEmpty"><span>${kind === "liked" ? "♡" : "＋"}</span><h2>Nothing here yet</h2><p>Use the ${kind === "liked" ? "heart" : "plus"} button on a game card.</p><a class="dsPrimaryBtn" href="/movies">Browse games</a></div></section><script src="/game-mode.js" defer></script></main>`;
    sendPage(res, { title: `${title} | SwiflyTV`, description: title, active: kind === "list" ? "watchlist" : "", body });
  });

  const detailsHandler = async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.status(404).send(pageShell({ title: "Game not found | SwiflyTV", body: `<main class="gameModePage">${pageIntro("404", "Game not found", "That game is no longer in the local catalog.")}</main>` }));
    const related = catalog.filter((item) => item.id !== game.id && item.categories.some((categoryName) => game.categories.includes(categoryName))).slice(0, 18);
    const body = `<main class="gameModePage gameModeDetailsPage"><section class="gameModeDetailsHero"><div class="gameModeDetailsBackdrop"><div class="gameModeHeroBlur">${imageMarkup(game, "gameModeHeroImage")}</div><div class="gameModeHeroLogo">${imageMarkup(game, "gameModeHeroImage")}</div></div><div class="gameModeDetailsShade"></div><div class="container gameModeDetailsCopy"><span class="gameModeEyebrow">Local browser game</span><h1>${esc(game.name)}</h1><div class="gameModeDetailsMeta"><b>${esc(game.score.toFixed(1))} player score</b><span>Instant launch</span><span>Stored locally</span></div><p>${esc(game.description)}</p><div class="gameModeGenrePills">${game.categories.map((categoryName) => `<span>${esc(titleCase(categoryName))}</span>`).join("")}</div><div class="gameModeHeroActions"><a class="dsPrimaryBtn" href="/watch/movie/${encodeURIComponent(game.id)}?mode=game">▶ Play game</a><button class="dsSecondaryBtn" type="button" data-game-list="${esc(game.id)}">＋ My List</button><button class="dsSecondaryBtn" type="button" data-game-like="${esc(game.id)}">♡ Like</button></div></div></section><section class="dsContent"><section class="gameModeAboutGrid"><article><span class="gameModeEyebrow">About this game</span><h2>Ready whenever you are.</h2><p>${esc(game.description)}</p><small>Loaded from vendor/monkeygg2/games/${esc(game.path.split("?")[0])}.</small></article><article><span class="gameModeEyebrow">Local source</span><h2>MonkeyGG2 files</h2><p>Swifly serves the actual checked-out game files. It does not iframe the MonkeyGG2 live website or its redirect domain.</p><a href="${MONKEY_REPO}" target="_blank" rel="noopener noreferrer">View source repository ↗</a></article></section>${rail("More Like This", related)}</section><script src="/game-mode.js" defer></script></main>`;
    sendPage(res, { title: `${game.name} | SwiflyTV`, description: game.description, active: "movies", body });
  };

  app.get("/movie/:id", detailsHandler);
  app.get("/tv/:id", detailsHandler);
  app.get("/game/:id", detailsHandler);

  const playerHandler = async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.redirect(302, "/movies");
    const related = catalog.filter((item) => item.id !== game.id && item.categories.some((categoryName) => game.categories.includes(categoryName))).slice(0, 12);
    const body = `<main class="gameModePlayerPage"><section class="container gameModePlayerShell"><header class="gameModePlayerToolbar"><div><a href="/movie/${encodeURIComponent(game.id)}">← Back</a><span></span><div><b>${esc(game.name)}</b><small>${esc(game.primaryCategory)} · local files</small></div></div><div><button type="button" data-game-reload>↻ Reload</button><button type="button" data-game-fullscreen>⛶ Fullscreen</button><a href="${esc(game.launchUrl)}" target="_blank" rel="noopener noreferrer">Open local ↗</a></div></header><div class="gameModeFrameWrap" id="gameModeFrameWrap"><div class="gameModeFrameLoading"><span></span><b>Loading ${esc(game.name)} from local files…</b></div><iframe id="gameModeFrame" src="${esc(game.launchUrl)}" title="Play ${esc(game.name)}" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write" allowfullscreen referrerpolicy="same-origin" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads"></iframe></div></section><section class="dsContent gameModePlayerInfo"><div><span class="gameModeEyebrow">Now playing locally</span><h1>${esc(game.name)}</h1><p>${esc(game.description)}</p></div>${rail("Play Next", related)}</section><script src="/game-mode.js" defer></script></main>`;
    sendPage(res, { title: `Play ${game.name} | SwiflyTV`, description: game.description, active: "movies", body });
  };

  app.get("/watch/movie/:id", playerHandler);
  app.get("/watch/tv/:id", playerHandler);
  app.get("/play-game/:id", playerHandler);
  app.get("/games", (_req, res) => res.redirect(302, "/movies"));
}

module.exports = { registerGameMode, loadCatalog };
