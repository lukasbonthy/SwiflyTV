"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("./nuvio-provider-core.js");
const setup = require("./setup-nuvio-providers.js");
const startup = require("./start-nuvio-provider-core.js");

function assert(condition, message) {
  if (!condition) throw new Error(`[nuvio-core-qa] ${message}`);
}

assert(
  setup.repoUrl === "https://github.com/paregi12/nuvio-providers.git",
  "The Paregi provider repository is not configured.",
);
assert(
  setup.pinnedRef === "8e31152f8fc6a0266c5153ec7641f7341d120fde",
  "The reviewed Paregi provider-pack commit is not pinned.",
);

assert(
  JSON.stringify(core.parseMediaRequest("/v1/movies/1226863")) ===
    JSON.stringify({ mediaType: "movie", id: "1226863", season: null, episode: null }),
  "Movie route parsing failed.",
);
assert(
  JSON.stringify(core.parseMediaRequest("/v1/tv/1399/seasons/2/episodes/4")) ===
    JSON.stringify({ mediaType: "tv", id: "1399", season: 2, episode: 4 }),
  "TV route parsing failed.",
);
assert(core.parseMediaRequest("/v1/movies/not-a-number") === null, "Invalid media IDs were accepted.");

assert(
  core.inferType({ url: "https://cdn.example/video/master.m3u8" }, {}) === "hls",
  "HLS type inference failed.",
);
assert(
  core.inferType({ url: "https://cdn.example/video.mp4" }, {}) === "mp4",
  "MP4 type inference failed.",
);

const normalized = core.normalizeStream(
  {
    url: "https://cdn.example/master.m3u8?token=test",
    quality: "1080p",
    headers: {
      Referer: "https://provider.example/",
      "User-Agent": "QA Agent",
      "X-Unsafe-Header": "must be removed",
    },
    subtitles: [
      { url: "https://cdn.example/subtitles/en.srt", language: "en", label: "English" },
    ],
  },
  { id: "fixture", name: "Fixture Provider", formats: ["m3u8"] },
);
assert(normalized, "A valid provider stream was not normalized.");
assert(normalized.source.type === "hls", "Normalized source type is not HLS.");
assert(normalized.source.quality === "1080p", "Normalized source quality was lost.");
assert(
  normalized.source.url.startsWith(`${core.publicBaseUrl()}/v1/proxy?data=`),
  "Normalized source did not use the local proxy boundary.",
);
assert(normalized.subtitles.length === 1, "Provider subtitles were not retained.");
assert(
  normalized.subtitles[0].url.startsWith(`${core.publicBaseUrl()}/v1/proxy?data=`),
  "Subtitle did not use the local proxy boundary.",
);

const rewritten = core.rewriteHlsManifest(
  [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=2400000",
    "high/index.m3u8",
    "#EXT-X-MEDIA:TYPE=SUBTITLES,URI=\"subs/en.m3u8\"",
    "#EXT-X-KEY:METHOD=AES-128,URI=\"keys/main.key\"",
  ].join("\n"),
  "https://cdn.example/path/master.m3u8",
  { Referer: "https://provider.example/" },
);
assert(rewritten.rewritten === 3, "HLS child URL rewrite count is incorrect.");
assert(!rewritten.body.includes("high/index.m3u8"), "Relative HLS playlist survived rewriting.");
assert(!rewritten.body.includes("subs/en.m3u8"), "Subtitle rendition survived rewriting.");
assert(!rewritten.body.includes("keys/main.key"), "Encryption key URI survived rewriting.");
assert(
  (rewritten.body.match(/\/v1\/proxy\?data=/g) || []).length === 3,
  "HLS child resources were not routed through the local proxy.",
);

const oldSecret = process.env.SWIFLY_QA_SECRET;
process.env.SWIFLY_QA_SECRET = "do-not-forward";
const childEnv = startup.childEnvironment();
if (oldSecret == null) delete process.env.SWIFLY_QA_SECRET;
else process.env.SWIFLY_QA_SECRET = oldSecret;
assert(!("SWIFLY_QA_SECRET" in childEnv), "Unrelated Swifly secrets leak into provider workers.");
assert(childEnv.NUVIO_CORE_PORT === startup.corePort, "Provider worker port was not configured consistently.");
assert(childEnv.NUVIO_CORE_HOST === startup.coreHost, "Provider worker host was not configured consistently.");

const startupPath = path.join(__dirname, "start-nuvio-provider-core.js");
const startupSource = fs.readFileSync(startupPath, "utf8").replace(/\r\n?/g, "\n");
new vm.Script(startupSource, { filename: startupPath });
assert(startupSource.includes('process.env.CINEPRO_AUTO_START = "false"'), "CinePro autostart is not disabled.");
assert(startupSource.includes("Nuvio backend ready"), "Nuvio backend startup marker is missing.");
assert(startupSource.includes("function installSignalHandlers()"), "Launcher lifecycle handler installer is missing.");
assert(
  startupSource.indexOf("process.once(\"SIGINT\"") > startupSource.indexOf("function installSignalHandlers()"),
  "Signal handlers are still registered during a harmless module import.",
);
assert(!startupSource.includes("applyProviderTimeoutPatch"), "CinePro provider mutation leaked into Nuvio startup.");
assert(!startupSource.includes("applyProviderVariantPatch"), "CinePro deduplication mutation leaked into Nuvio startup.");
assert(!startupSource.includes("applyVidNestResiliencePatch"), "CinePro VidNest mutation leaked into Nuvio startup.");

const gitignore = fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8");
assert(gitignore.includes("vendor/nuvio-providers/"), "Vendored provider checkout is not ignored by Git.");

console.log("Swifly pinned Paregi Nuvio provider core, proxy, isolation, lifecycle, and startup QA passed.");
