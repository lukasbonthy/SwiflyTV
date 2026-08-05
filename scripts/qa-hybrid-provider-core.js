"use strict";

const http = require("http");
const { once } = require("events");
const setup = require("./setup-nuvio-providers.js");
const { createGateway, parseMediaRequest } = require("./hybrid-provider-gateway.js");
const hybridStartup = require("./start-hybrid-provider-core.js");
const cineproService = require("./cinepro-core-service.js");

function assert(condition, message) {
  if (!condition) throw new Error(`[hybrid-core-qa] ${message}`);
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server || !server.listening) return;
  server.close();
  await once(server, "close");
}

function createMockBackend(config) {
  let baseUrl = "";
  let refreshes = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", baseUrl || "http://127.0.0.1");
    const json = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(text),
        "Access-Control-Allow-Origin": "*",
      });
      res.end(text);
    };

    if (url.pathname === "/v1/health") {
      return json(200, {
        status: "operational",
        spec: "omss",
        name: `${config.name} Mock`,
      });
    }
    if (url.pathname === "/v1/providers") {
      return json(200, {
        providers: [{ id: config.providerId, name: config.providerName, enabled: true }],
      });
    }
    if (url.pathname === "/v1/movies/1226863") {
      return json(200, {
        responseId: `${config.id}-response-1234`,
        status: "ok",
        spec: "omss",
        sources: [{
          url: `${baseUrl}/media/master.m3u8`,
          type: "hls",
          quality: config.quality,
          provider: { id: config.providerId, name: config.providerName },
        }],
        subtitles: [{
          url: `${baseUrl}/media/subtitles/en.vtt`,
          label: `${config.name} English`,
          language: "en",
          format: "vtt",
        }],
        diagnostics: [],
      });
    }
    if (/^\/v1\/refresh\//.test(url.pathname)) {
      refreshes += 1;
      return json(200, { status: "ok", refreshed: true });
    }
    if (url.pathname === "/media/master.m3u8") {
      res.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end([
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=1000000",
        "variant/index.m3u8",
        "#EXT-X-MEDIA:TYPE=SUBTITLES,URI=\"subtitles/en.m3u8\"",
      ].join("\n"));
    }
    if (url.pathname === "/media/variant/index.m3u8" || url.pathname === "/media/subtitles/en.m3u8") {
      res.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end("#EXTM3U\n#EXTINF:5,\nsegment.ts\n");
    }
    if (url.pathname === "/media/subtitles/en.vtt") {
      res.writeHead(200, { "Content-Type": "text/vtt", "Access-Control-Allow-Origin": "*" });
      return res.end("WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n");
    }
    if (url.pathname.endsWith("segment.ts")) {
      res.writeHead(200, { "Content-Type": "video/mp2t", "Access-Control-Allow-Origin": "*" });
      return res.end(Buffer.from([0, 1, 2, 3]));
    }
    return json(404, { status: "error", message: "not found" });
  });
  return {
    server,
    setBaseUrl(value) { baseUrl = value; },
    refreshCount() { return refreshes; },
  };
}

async function reservePort() {
  const server = http.createServer();
  const url = await listen(server);
  const port = Number(new URL(url).port);
  await close(server);
  return port;
}

async function main() {
  assert(
    setup.repoUrl === "https://github.com/paregi12/nuvio-providers.git",
    "The Paregi provider fork is not configured.",
  );
  assert(
    setup.pinnedRef === "8e31152f8fc6a0266c5153ec7641f7341d120fde",
    "The reviewed Paregi provider commit is not pinned.",
  );
  assert(
    JSON.stringify(parseMediaRequest("/v1/movies/1226863")) ===
      JSON.stringify({ mediaType: "movie", id: "1226863", season: null, episode: null }),
    "Hybrid movie route parsing failed.",
  );

  const cineproMock = createMockBackend({
    id: "cinepro",
    name: "CinePro",
    providerId: "vixsrc",
    providerName: "VixSrc",
    quality: "1080p",
  });
  const nuvioMock = createMockBackend({
    id: "nuvio",
    name: "Paregi Nuvio",
    providerId: "vidking",
    providerName: "VidKing",
    quality: "720p",
  });
  const cineproUrl = await listen(cineproMock.server);
  cineproMock.setBaseUrl(cineproUrl);
  const nuvioUrl = await listen(nuvioMock.server);
  nuvioMock.setBaseUrl(nuvioUrl);

  const gatewayPort = await reservePort();
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
  const gateway = createGateway({
    host: "127.0.0.1",
    port: gatewayPort,
    publicUrl: gatewayUrl,
    cacheTtlMs: 30_000,
    backends: [
      { id: "cinepro", name: "CinePro", url: cineproUrl, timeoutMs: 5000 },
      { id: "nuvio", name: "Paregi Nuvio", url: nuvioUrl, timeoutMs: 5000 },
    ],
  });
  await gateway.start();

  try {
    const health = await fetch(`${gatewayUrl}/v1/health`).then((response) => response.json());
    assert(health.status === "operational", "Hybrid health is not operational.");
    assert(health.operationalBackends === 2, "Both mock backends were not reported online.");

    const result = await fetch(`${gatewayUrl}/v1/movies/1226863`).then((response) => response.json());
    assert(result.backend === "swifly-hybrid-provider-core", "Hybrid response backend marker is missing.");
    assert(result.sources.length === 2, "CinePro and Nuvio sources were not both retained.");
    assert(result.subtitles.length === 2, "CinePro and Nuvio subtitles were not both retained.");
    assert(
      result.sources.some((source) => source.provider.name === "CinePro · VixSrc"),
      "CinePro source label was not retained.",
    );
    assert(
      result.sources.some((source) => source.provider.name === "Paregi Nuvio · VidKing"),
      "Paregi Nuvio source label was not retained.",
    );
    assert(
      result.sources.every((source) => source.url.startsWith(`${gatewayUrl}/v1/proxy?data=`)),
      "A backend source escaped the hybrid proxy boundary.",
    );

    const manifest = await fetch(result.sources[0].url).then((response) => response.text());
    assert(
      (manifest.match(new RegExp(`${gatewayUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/v1/proxy\\?data=`, "g")) || []).length >= 2,
      "Hybrid HLS child resources were not recursively rewritten.",
    );

    const refresh = await fetch(`${gatewayUrl}/v1/refresh/${result.responseId}`).then((response) => response.json());
    assert(refresh.refreshed === true, "Hybrid response refresh did not invalidate the cache.");
    assert(cineproMock.refreshCount() === 1, "CinePro backend refresh was not forwarded.");
    assert(nuvioMock.refreshCount() === 1, "Nuvio backend refresh was not forwarded.");

    const oldSecret = process.env.SWIFLY_QA_SECRET;
    process.env.SWIFLY_QA_SECRET = "do-not-forward";
    const nuvioEnv = hybridStartup.childEnvironment();
    const cineproEnv = cineproService.childEnvironment();
    if (oldSecret == null) delete process.env.SWIFLY_QA_SECRET;
    else process.env.SWIFLY_QA_SECRET = oldSecret;
    assert(!("SWIFLY_QA_SECRET" in nuvioEnv), "Swifly secrets leak into Nuvio provider workers.");
    assert(!("SWIFLY_QA_SECRET" in cineproEnv), "Swifly secrets leak into CinePro workers.");
  } finally {
    await close(gateway.server);
    await close(cineproMock.server);
    await close(nuvioMock.server);
  }

  console.log("Swifly CinePro + Paregi Nuvio hybrid aggregation, proxy, refresh, and isolation QA passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
