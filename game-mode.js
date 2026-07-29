"use strict";

const crypto = require("crypto");

const MONKEY_REPO = "https://github.com/MonkeyGG2/monkeygg2.github.io";
const MONKEY_PAGES = "https://monkeygg2.github.io";
const CONFIG_URL = "https://raw.githubusercontent.com/MonkeyGG2/monkeygg2.github.io/main/config.jsonc";
const CATALOG_TTL_MS = 30 * 60 * 1000;

let catalogCache = null;
let catalogLoadedAt = 0;
let catalogPromise = null;

const FEATURED_NAMES = [
  "Retro Bowl",
  "Slope",
  "2048",
  "Drive Mad",
  "Cookie Clicker",
  "Basketball Stars",
  "Fireboy and Watergirl in the Forest Temple",
  "Tunnel Rush",
  "Moto X3M",
  "Subway Surfers",
  "Vex 6",
  "1v1.LOL",
];

const FALLBACK_GAMES = [
  ["1v1.LOL", "1v1-lol", ["online", "battle"]],
  ["2048", "2048", ["puzzle", "classic"]],
  ["A Dark Room", "a-dark-room", ["strategy", "adventure"]],
  ["Awesome Tanks", "awesome-tanks", ["action", "battle"]],
  ["Basket Random", "basket-random", ["sports", "party"]],
  ["Basketball Stars", "basketball-stars", ["sports", "multiplayer"]],
  ["Bit Life", "bit-life", ["simulation"]],
  ["Boxing Random", "boxing-random", ["sports", "party"]],
  ["Chrome Dino", "chrome-dino", ["arcade", "classic"]],
  ["Clicker Heroes", "clicker-heroes", ["idle", "strategy"]],
  ["Cookie Clicker", "cookie-clicker", ["idle", "classic"]],
  ["Crossy Road", "crossy-road", ["arcade"]],
  ["Cut The Rope", "cut-the-rope", ["puzzle"]],
  ["Doodle Jump", "doodle-jump", ["arcade"]],
  ["Drift Boss", "drift-boss", ["racing", "quick"]],
  ["Drift Hunters", "drift-hunters", ["racing"]],
  ["Drive Mad", "drive-mad", ["racing", "physics"]],
  ["Duck Life 4", "duck-life-4", ["adventure", "sports"]],
  ["EaglerCraft 1.8.8", "ampler-launcher/mc/1.8.8", ["sandbox", "multiplayer"]],
  ["Eggy Car", "eggy-car", ["racing", "physics"]],
  ["EvoWars", "evowars", ["online", "battle"]],
  ["Family Feud", "family-feud", ["trivia", "party"]],
  ["Fireboy and Watergirl in the Forest Temple", "fireboy-and-watergirl", ["puzzle", "co-op"]],
  ["Friday Night Funkin", "friday-night-funkin", ["rhythm", "music"]],
  ["Getaway Shootout", "getaway-shootout", ["action", "party"]],
  ["Hextris", "hextris", ["puzzle", "arcade"]],
  ["Idle Breakout", "idle-breakout", ["idle", "arcade"]],
  ["Moto X3M", "motox3m", ["racing", "stunts"]],
  ["OvO", "ovo", ["platformer", "speedrun"]],
  ["Pacman", "pacman", ["classic", "arcade"]],
  ["Paper.io 2", "paper-io-2", ["online", "arcade"]],
  ["Retro Bowl", "retro-bowl", ["sports", "strategy"]],
  ["Rooftop Snipers", "rooftop-snipers", ["party", "battle"]],
  ["Run 3", "run-3", ["platformer", "arcade"]],
  ["Slope", "slope", ["arcade", "quick"]],
  ["Subway Surfers", "subway-surfers", ["runner", "arcade"]],
  ["Temple Run 2", "temple-run-2", ["runner", "arcade"]],
  ["Tetris", "tetris", ["puzzle", "classic"]],
  ["Tunnel Rush", "tunnel-rush", ["quick", "arcade"]],
  ["Vex 6", "vex-6", ["platformer", "skill"]],
  ["World's Hardest Game", "worlds-hardest-game", ["skill", "puzzle"]],
].map(([name, path, categories]) => ({ name, path, aliases: [], categories }));

const DESCRIPTIONS = {
  "2048": "Slide matching numbers together and chase the legendary 2048 tile in this clean puzzle classic.",
  "1v1.LOL": "Build, aim, and battle in a fast competitive arena where every wall and shot matters.",
  "Basketball Stars": "Quick basketball matchups with sharp movement, dunks, blocks, and competitive local play.",
  "Cookie Clicker": "Start with one cookie, build an absurd production empire, and watch the numbers explode.",
  "Drive Mad": "Guide strange vehicles across physics-heavy tracks without flipping, snapping, or falling apart.",
  "Fireboy and Watergirl in the Forest Temple": "Coordinate two elemental heroes through switches, traps, and puzzle rooms.",
  "Moto X3M": "Race through stunt-packed motorcycle courses filled with flips, hazards, and impossible shortcuts.",
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

function makeGameId(name, path) {
  return `${slugify(name)}-${crypto.createHash("sha1").update(String(path)).digest("hex").slice(0, 6)}`;
}

function stripJsonComments(input) {
  return String(input)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function inferCategories(name, path, supplied = []) {
  const source = `${name} ${path} ${supplied.join(" ")}`.toLowerCase();
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

function normalizeGame(name, raw = {}) {
  const path = String(raw.path || "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || /^https?:/i.test(path)) return null;
  const categories = inferCategories(name, path, Array.isArray(raw.categories) ? raw.categories : []);
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.map(String).filter(Boolean).slice(0, 12) : [];
  const id = makeGameId(name, path);
  const score = 7.2 + (hashNumber(id) % 27) / 10;
  const primaryCategory = titleCase(categories[0] || "arcade");
  const description = DESCRIPTIONS[name] || `Jump into ${name}, a ${primaryCategory.toLowerCase()} web game from the MonkeyGG2 collection. It launches instantly inside Swifly without replacing the rest of the site.`;

  return {
    id,
    name: String(name).trim(),
    path,
    aliases,
    categories,
    primaryCategory,
    description,
    score: Math.min(9.8, Number(score.toFixed(1))),
    launchUrl: `${MONKEY_PAGES}/games/${path}`,
    featured: FEATURED_NAMES.includes(String(name).trim()),
  };
}

async function fetchRemoteCatalog() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(CONFIG_URL, {
      headers: { accept: "text/plain", "user-agent": "SwiflyGames/3.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`catalog request returned ${response.status}`);
    const parsed = JSON.parse(stripJsonComments(await response.text()));
    const games = parsed && parsed.games && typeof parsed.games === "object" ? parsed.games : {};
    const normalized = Object.entries(games)
      .map(([name, value]) => normalizeGame(name, value || {}))
      .filter(Boolean)
      .filter((game) => !/epstein|porn|hentai|nsfw/i.test(game.name));
    if (normalized.length < 20) throw new Error("catalog did not contain enough games");
    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackCatalog() {
  return FALLBACK_GAMES.map((entry) => normalizeGame(entry.name, entry)).filter(Boolean);
}

async function loadCatalog(force = false) {
  if (!force && catalogCache && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return catalogCache;
  if (!force && catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    try {
      catalogCache = await fetchRemoteCatalog();
    } catch (error) {
      console.warn("[game-mode] using fallback catalog:", error.message || error);
      catalogCache = fallbackCatalog();
    }
    catalogCache.sort((a, b) => a.name.localeCompare(b.name));
    catalogLoadedAt = Date.now();
    return catalogCache;
  })();

  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

function getGameById(catalog, id) {
  return catalog.find((game) => game.id === id) || null;
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function artSvg(game, wide = false) {
  const width = wide ? 1280 : 780;
  const height = wide ? 720 : 440;
  const seed = hashNumber(game.id);
  const hueA = seed % 360;
  const hueB = (hueA + 62 + (seed % 54)) % 360;
  const initials = game.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const title = escapeXml(game.name);
  const category = escapeXml(game.primaryCategory);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hueA} 72% 23%)"/>
      <stop offset="0.55" stop-color="hsl(${hueB} 78% 17%)"/>
      <stop offset="1" stop-color="#050712"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.18" r="0.9">
      <stop offset="0" stop-color="hsl(${hueB} 95% 70%)" stop-opacity="0.76"/>
      <stop offset="1" stop-color="hsl(${hueA} 90% 52%)" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>
  </defs>
  <rect width="${width}" height="${height}" rx="32" fill="url(#bg)"/>
  <circle cx="${width * 0.22}" cy="${height * 0.25}" r="${height * 0.45}" fill="url(#glow)" filter="url(#blur)"/>
  <g opacity="0.16" stroke="#fff" fill="none">
    <circle cx="${width * 0.83}" cy="${height * 0.28}" r="${height * 0.22}" stroke-width="2"/>
    <circle cx="${width * 0.83}" cy="${height * 0.28}" r="${height * 0.31}" stroke-width="1" stroke-dasharray="10 18"/>
    <path d="M0 ${height * 0.76} C ${width * 0.28} ${height * 0.55}, ${width * 0.55} ${height * 0.95}, ${width} ${height * 0.62}" stroke-width="3"/>
  </g>
  <rect x="${width * 0.07}" y="${height * 0.12}" width="${height * 0.22}" height="${height * 0.22}" rx="${height * 0.055}" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.28)"/>
  <text x="${width * 0.07 + height * 0.11}" y="${height * 0.12 + height * 0.145}" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="${height * 0.09}" font-weight="800">${escapeXml(initials)}</text>
  <text x="${width * 0.07}" y="${height * 0.57}" fill="#fff" font-family="Arial, sans-serif" font-size="${wide ? 62 : 42}" font-weight="800">${title.length > 29 ? `${title.slice(0, 28)}…` : title}</text>
  <text x="${width * 0.07}" y="${height * 0.68}" fill="rgba(255,255,255,.66)" font-family="Arial, sans-serif" font-size="${wide ? 24 : 18}" font-weight="600" letter-spacing="3">${category.toUpperCase()} • WEB GAME</text>
  <g transform="translate(${width * 0.82} ${height * 0.72})">
    <circle r="${height * 0.09}" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.3)"/>
    <path d="M-${height * 0.02},-${height * 0.035} L${height * 0.04},0 L-${height * 0.02},${height * 0.035} Z" fill="#fff"/>
  </g>
</svg>`;
}

function thumbnailCandidates(game) {
  const basePath = game.path.split("?")[0].replace(/\/+$/, "");
  const base = `${MONKEY_PAGES}/games/${basePath}`;
  return [
    `${base}/thumbnail.png`,
    `${base}/cover.png`,
    `${base}/icon.png`,
    `${base}/favicon.png`,
    `${base}/favicon.ico`,
    `${base}/assets/icon.png`,
    `/game-art/${encodeURIComponent(game.id)}.svg`,
  ];
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

  const imageMarkup = (game, className = "") => {
    const [first, ...fallbacks] = thumbnailCandidates(game);
    return `<img class="${esc(className)}" src="${esc(first)}" data-game-image data-game-fallbacks="${esc(JSON.stringify(fallbacks))}" alt="${esc(game.name)} game thumbnail" loading="lazy" />`;
  };

  const card = (game, options = {}) => {
    const hidden = options.hidden ? " hidden" : "";
    const dataLibrary = options.library ? ` data-game-library-id="${esc(game.id)}"` : "";
    const primary = game.primaryCategory || "Arcade";
    return `<article class="movieCard dsCard gameModeCard" data-title="${esc(game.name.toLowerCase())}"${dataLibrary}${hidden}>
      <a href="/watch/movie/${encodeURIComponent(game.id)}?mode=game" class="posterWrap dsThumb gameModeThumb" aria-label="Play ${esc(game.name)}">
        ${imageMarkup(game)}
        <div class="gameModeImageShade"></div>
        <div class="dsCardOverlay">
          <div class="dsCardControls">
            <span class="dsPlayDot">▶</span>
            <button class="dsMiniBtn" type="button" data-game-list="${esc(game.id)}" aria-label="Add ${esc(game.name)} to My List">＋</button>
            <button class="dsMiniBtn dsHeartBtn" type="button" data-game-like="${esc(game.id)}" aria-label="Like ${esc(game.name)}">♡</button>
            <button class="dsMiniBtn dsInfoBtn" type="button" data-game-info="${esc(game.id)}" aria-label="More info for ${esc(game.name)}">ⓘ</button>
          </div>
          <div class="dsCardTitle">${esc(game.name)}</div>
          <div class="dsCardMeta"><b>${esc(primary)}</b><span>${esc(game.score.toFixed(1))}</span><span>Web Game</span></div>
        </div>
      </a>
    </article>`;
  };

  const rail = (title, games, tag = "") => {
    const cards = games.slice(0, 18).map((game) => card(game)).join("");
    if (!cards) return "";
    return `<section class="dsRow gameModeRow">
      <div class="dsRowHead"><h2>${esc(title)}</h2>${tag ? `<span class="dsRowTag">${esc(tag)}</span>` : ""}</div>
      <div class="movieRail dsRail">${cards}</div>
    </section>`;
  };

  const hero = (game) => `<section class="gameModeHero container">
    <div class="gameModeHeroBackdrop">${imageMarkup(game, "gameModeHeroImage")}</div>
    <div class="gameModeHeroShade"></div>
    <div class="gameModeHeroCopy">
      <span class="gameModeEyebrow">Featured web game</span>
      <h1>${esc(game.name)}</h1>
      <p>${esc(game.description)}</p>
      <div class="gameModeHeroMeta"><b>${esc(game.primaryCategory)}</b><span>${esc(game.score.toFixed(1))} player score</span><span>Runs in your browser</span></div>
      <div class="gameModeHeroActions">
        <a class="dsPrimaryBtn" href="/watch/movie/${encodeURIComponent(game.id)}?mode=game">▶ Play now</a>
        <a class="dsSecondaryBtn" href="/movie/${encodeURIComponent(game.id)}">ⓘ More info</a>
        <button class="dsSecondaryBtn" type="button" data-game-random>✦ Surprise me</button>
      </div>
    </div>
  </section>`;

  const pageIntro = (eyebrow, title, description) => `<section class="container gameModePageIntro">
    <span class="gameModeEyebrow">${esc(eyebrow)}</span>
    <h1>${esc(title)}</h1>
    <p>${esc(description)}</p>
  </section>`;

  const listingBody = (title, description, games, options = {}) => `<main class="gameModePage">
    ${pageIntro(options.eyebrow || "Swifly Games", title, description)}
    <section class="dsContent gameModeListingContent">
      <div class="gameModeToolbar">
        <span>${games.length.toLocaleString("en-US")} games</span>
        <button class="dsSecondaryBtn" type="button" data-game-random>Random game</button>
      </div>
      <div class="gameModeGrid">${games.map((game) => card(game)).join("")}</div>
    </section>
    <script src="/game-mode.js" defer></script>
  </main>`;

  const sendPage = (res, options) => res.send(pageShell(options));

  app.get("/game-mode.css", (_req, res) => {
    res.type("text/css").sendFile(require("path").join(__dirname, "game-mode.css"));
  });

  app.get("/game-mode.js", (_req, res) => {
    res.type("application/javascript").sendFile(require("path").join(__dirname, "game-mode-client.js"));
  });

  app.get("/game-art/:id.svg", async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.status(404).end();
    res.set("Cache-Control", "public, max-age=86400");
    res.type("image/svg+xml").send(artSvg(game, req.query.wide === "1"));
  });

  app.get("/api/game-catalog", async (req, res) => {
    const catalog = await loadCatalog(req.query.refresh === "1");
    res.json({ source: MONKEY_REPO, count: catalog.length, games: catalog });
  });

  app.get("/", async (_req, res) => {
    const catalog = await loadCatalog();
    const featured = FEATURED_NAMES.map((name) => catalog.find((game) => game.name === name)).filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);
    const shuffled = seededShuffle(catalog, today);
    const heroGame = featured[0] || shuffled[0];
    const category = (name) => catalog.filter((game) => game.categories.includes(name));
    const body = `<main class="gameModePage gameModeHome">
      ${hero(heroGame)}
      <section class="dsContent">
        ${rail("Featured Games", featured.length ? featured : shuffled.slice(0, 12), "Play now")}
        ${rail("Trending Right Now", shuffled.slice(0, 18), "Updated daily")}
        ${rail("Racing & Driving", category("racing"), "High speed")}
        ${rail("Puzzle & Strategy", [...category("puzzle"), ...category("strategy")], "Think fast")}
        ${rail("Multiplayer & Battle", [...category("multiplayer"), ...category("battle")], "Play together")}
        ${rail("Arcade Classics", [...category("classic"), ...category("arcade")], "Old-school energy")}
        ${rail("Platformers & Runners", [...category("platformer"), ...category("runner")], "Keep moving")}
      </section>
      <script src="/game-mode.js" defer></script>
    </main>`;
    sendPage(res, {
      title: "SwiflyTV — Web Games",
      description: "Play browser games from the MonkeyGG2 collection inside the original SwiflyTV experience.",
      active: "home",
      body,
    });
  });

  app.get(["/movies", "/discover/movie"], async (req, res) => {
    const catalog = await loadCatalog();
    const games = req.query.sort === "top_rated" ? [...catalog].sort((a, b) => b.score - a.score) : catalog;
    sendPage(res, {
      title: "All Games | SwiflyTV",
      description: "Browse the complete Swifly web game catalog.",
      active: "movies",
      body: listingBody("All Games", "Every playable title from the connected MonkeyGG2 game catalog, presented through Swifly’s existing card experience.", games, { eyebrow: "Game library" }),
    });
  });

  app.get(["/tv", "/discover/tv"], async (_req, res) => {
    const catalog = await loadCatalog();
    const arcade = catalog.filter((game) => game.categories.some((categoryName) => ["arcade", "runner", "platformer", "quick", "battle", "multiplayer"].includes(categoryName)));
    sendPage(res, {
      title: "Arcade | SwiflyTV",
      description: "Fast browser games, arcade challenges, runners, platformers, and multiplayer picks.",
      active: "tv",
      body: listingBody("Arcade", "Fast launches, easy replays, and the games that work best when you only have a few minutes—or accidentally lose an hour.", arcade, { eyebrow: "Quick play" }),
    });
  });

  app.get("/trending", async (_req, res) => {
    const catalog = await loadCatalog();
    const day = new Date().toISOString().slice(0, 10);
    const trending = seededShuffle(catalog, `trending-${day}`).sort((a, b) => Number(b.featured) - Number(a.featured));
    sendPage(res, {
      title: "Trending Games | SwiflyTV",
      description: "Daily rotating web game picks inside SwiflyTV.",
      active: "trending",
      body: listingBody("Trending Games", "A rotating mix of featured favorites, competitive games, quick challenges, and unexpected picks.", trending, { eyebrow: "New & popular" }),
    });
  });

  app.get("/search", async (req, res) => {
    const catalog = await loadCatalog();
    const query = String(req.query.q || "").trim().toLowerCase();
    const results = query
      ? catalog.filter((game) => `${game.name} ${game.aliases.join(" ")} ${game.categories.join(" ")} ${game.description}`.toLowerCase().includes(query))
      : catalog;
    sendPage(res, {
      title: query ? `Search: ${query} | SwiflyTV` : "Search Games | SwiflyTV",
      description: "Search the Swifly web game catalog.",
      active: "search",
      body: `<main class="gameModePage">
        ${pageIntro("Search the library", query ? `Results for “${query}”` : "Find a game", query ? `${results.length} matching games.` : "Search by title, category, alias, or the kind of game you feel like playing.")}
        <section class="dsContent gameModeListingContent">
          <form class="gameModeSearchForm" action="/search" method="get"><input name="q" value="${esc(req.query.q || "")}" placeholder="Search games, categories, or aliases" autofocus /><button class="dsPrimaryBtn" type="submit">Search</button></form>
          ${results.length ? `<div class="gameModeGrid">${results.map((game) => card(game)).join("")}</div>` : `<div class="gameModeEmpty"><span>⌕</span><h2>No games found</h2><p>Try a broader word such as racing, puzzle, multiplayer, classic, or arcade.</p></div>`}
        </section>
        <script src="/game-mode.js" defer></script>
      </main>`,
    });
  });

  app.get("/browse-by-languages", async (_req, res) => {
    const catalog = await loadCatalog();
    const categories = [...new Set(catalog.flatMap((game) => game.categories))].sort();
    const body = `<main class="gameModePage">
      ${pageIntro("Browse by genre", "Game Genres", "The old language browser now organizes the same Swifly cards by game type.")}
      <section class="dsContent">${categories.map((categoryName) => rail(titleCase(categoryName), catalog.filter((game) => game.categories.includes(categoryName)))).join("")}</section>
      <script src="/game-mode.js" defer></script>
    </main>`;
    sendPage(res, { title: "Game Genres | SwiflyTV", description: "Browse web games by genre.", active: "genres", body });
  });

  app.get("/kids", async (_req, res) => {
    const catalog = await loadCatalog();
    const safe = catalog.filter((game) => !game.categories.some((categoryName) => ["battle", "horror"].includes(categoryName)));
    sendPage(res, {
      title: "Kids Games | SwiflyTV",
      description: "A lighter selection of puzzle, arcade, sports, and creative web games.",
      active: "",
      body: listingBody("Kids Games", "A lighter mix of puzzles, runners, sports, classics, and easy-to-learn browser games.", safe, { eyebrow: "Family-friendly picks" }),
    });
  });

  app.get(["/my-list", "/liked"], async (req, res) => {
    const catalog = await loadCatalog();
    const kind = req.path === "/liked" ? "liked" : "list";
    const title = kind === "liked" ? "Liked Games" : "My List";
    const body = `<main class="gameModePage" data-game-library-page="${kind}">
      ${pageIntro(kind === "liked" ? "Your favorites" : "Saved for later", title, kind === "liked" ? "Games you marked with a heart." : "Games you saved from any card or details page.")}
      <section class="dsContent gameModeListingContent">
        <div class="gameModeGrid" id="gameModeLibraryGrid">${catalog.map((game) => card(game, { hidden: true, library: true })).join("")}</div>
        <div class="gameModeEmpty" id="gameModeLibraryEmpty"><span>${kind === "liked" ? "♡" : "＋"}</span><h2>Nothing here yet</h2><p>Use the ${kind === "liked" ? "heart" : "plus"} button on a game card to build this collection.</p><a class="dsPrimaryBtn" href="/movies">Browse games</a></div>
      </section>
      <script src="/game-mode.js" defer></script>
    </main>`;
    sendPage(res, { title: `${title} | SwiflyTV`, description: title, active: kind === "list" ? "watchlist" : "", body });
  });

  const detailsHandler = async (req, res) => {
    const catalog = await loadCatalog();
    const game = getGameById(catalog, req.params.id);
    if (!game) return res.status(404).send(pageShell({ title: "Game not found | SwiflyTV", body: `<main class="gameModePage">${pageIntro("404", "Game not found", "That game is no longer in the connected catalog.")}</main>` }));
    const related = catalog.filter((item) => item.id !== game.id && item.categories.some((categoryName) => game.categories.includes(categoryName))).slice(0, 18);
    const body = `<main class="gameModePage gameModeDetailsPage">
      <section class="gameModeDetailsHero">
        <div class="gameModeDetailsBackdrop">${imageMarkup(game, "gameModeHeroImage")}</div>
        <div class="gameModeDetailsShade"></div>
        <div class="container gameModeDetailsCopy">
          <span class="gameModeEyebrow">Browser game</span>
          <h1>${esc(game.name)}</h1>
          <div class="gameModeDetailsMeta"><b>${esc(game.score.toFixed(1))} player score</b><span>Instant launch</span><span>No install</span></div>
          <p>${esc(game.description)}</p>
          <div class="gameModeGenrePills">${game.categories.map((categoryName) => `<span>${esc(titleCase(categoryName))}</span>`).join("")}</div>
          <div class="gameModeHeroActions">
            <a class="dsPrimaryBtn" href="/watch/movie/${encodeURIComponent(game.id)}?mode=game">▶ Play game</a>
            <button class="dsSecondaryBtn" type="button" data-game-list="${esc(game.id)}">＋ My List</button>
            <button class="dsSecondaryBtn" type="button" data-game-like="${esc(game.id)}">♡ Like</button>
          </div>
        </div>
      </section>
      <section class="dsContent">
        <section class="gameModeAboutGrid">
          <article><span class="gameModeEyebrow">About this game</span><h2>Ready whenever you are.</h2><p>${esc(game.description)}</p><small>Game files are loaded from the MonkeyGG2 games collection.</small></article>
          <article><span class="gameModeEyebrow">Source</span><h2>MonkeyGG2 collection</h2><p>This Swifly page keeps the interface and discovery experience here while launching the actual browser game from the upstream games folder.</p><a href="${MONKEY_REPO}" target="_blank" rel="noopener noreferrer">View source repository ↗</a></article>
        </section>
        ${rail("More Like This", related)}
      </section>
      <script src="/game-mode.js" defer></script>
    </main>`;
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
    const body = `<main class="gameModePlayerPage">
      <section class="container gameModePlayerShell">
        <header class="gameModePlayerToolbar">
          <div><a href="/movie/${encodeURIComponent(game.id)}">← Back</a><span></span><div><b>${esc(game.name)}</b><small>${esc(game.primaryCategory)} web game</small></div></div>
          <div>
            <button type="button" data-game-reload>↻ Reload</button>
            <button type="button" data-game-fullscreen>⛶ Fullscreen</button>
            <a href="${esc(game.launchUrl)}" target="_blank" rel="noopener noreferrer">Open direct ↗</a>
          </div>
        </header>
        <div class="gameModeFrameWrap" id="gameModeFrameWrap">
          <div class="gameModeFrameLoading"><span></span><b>Loading ${esc(game.name)}…</b></div>
          <iframe id="gameModeFrame" src="${esc(game.launchUrl)}" title="Play ${esc(game.name)}" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write" allowfullscreen referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads"></iframe>
        </div>
      </section>
      <section class="dsContent gameModePlayerInfo">
        <div><span class="gameModeEyebrow">Now playing</span><h1>${esc(game.name)}</h1><p>${esc(game.description)}</p></div>
        ${rail("Play Next", related)}
      </section>
      <script src="/game-mode.js" defer></script>
    </main>`;
    sendPage(res, { title: `Play ${game.name} | SwiflyTV`, description: game.description, active: "movies", body });
  };

  app.get("/watch/movie/:id", playerHandler);
  app.get("/watch/tv/:id", playerHandler);
  app.get("/play-game/:id", playerHandler);
  app.get("/games", (_req, res) => res.redirect(302, "/movies"));
}

module.exports = {
  registerGameMode,
  loadCatalog,
};
