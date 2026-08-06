"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { once } = require("events");
const gatewayReliable = require("./hybrid-provider-gateway-reliable.js");
const completeOptions = require("./start-cinepro-complete-option-data.js");
const sourceMenu = require("./start-cinepro-source-menu-polish.js");

function assert(condition, message) {
  if (!condition) throw new Error(`[nuvio-hls-source-menu-qa] ${message}`);
}

async function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { port: address.port, url: `http://127.0.0.1:${address.port}` };
}

async function close(server) {
  if (!server || !server.listening) return;
  server.close();
  await once(server, "close");
}

async function reservePort() {
  const server = http.createServer();
  const address = await listen(server);
  await close(server);
  return address.port;
}

async function main() {
  const gatewaySource = fs.readFileSync(
    path.join(__dirname, "hybrid-provider-gateway.js"),
    "utf8",
  );
  const gatewayPatched = gatewayReliable.patchGatewaySource(gatewaySource);
  assert(!gatewayPatched.includes('req.once("close", onClose)'), "Hybrid proxy still aborts when an incoming request completes.");
  assert(gatewayPatched.includes('res.once("close", onClose)'), "Hybrid proxy is not tied to the outgoing viewer response.");
  assert(gatewayPatched.includes("if (!res.writableEnded) controller.abort()"), "Hybrid proxy close guard is missing.");

  const themePath = path.join(__dirname, "start-cinepro-theme-unified.js");
  const themeSource = fs.readFileSync(themePath, "utf8");
  const completeTheme = completeOptions.patchThemeCompleteOptions(themeSource);
  const polishedTheme = sourceMenu.patchSourceMenu(completeTheme);
  assert(polishedTheme.includes('choices.dataset.settingKey = String(item.key || "")'), "Source detail panel is not tagged by setting key.");
  assert(polishedTheme.includes('button.classList.add("swiflySourceChoice")'), "Source buttons do not receive readable row styling.");
  assert(polishedTheme.includes("grid-template-columns:minmax(0,1fr)!important"), "Source options are still forced into cramped fixed columns.");
  assert(polishedTheme.includes("text-overflow:ellipsis!important"), "Long Source labels cannot truncate safely.");

  const upstream = http.createServer(async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (req.url === "/master.m3u8") {
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
      return res.end("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n");
    }
    if (req.url === "/bad.m3u8") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<!doctype html><html><body>blocked</body></html>");
    }
    if (req.url === "/segment.ts") {
      res.writeHead(req.headers.range ? 206 : 200, {
        "Content-Type": "video/mp2t",
        "Content-Range": "bytes 0-3/4",
      });
      return res.end(Buffer.from([0x47, 0x40, 0x00, 0x10]));
    }
    res.writeHead(404);
    res.end("not found");
  });
  const upstreamAddress = await listen(upstream);

  const nuvioPort = await reservePort();
  process.env.NUVIO_CORE_HOST = "127.0.0.1";
  process.env.NUVIO_CORE_PORT = String(nuvioPort);
  process.env.NUVIO_CORE_PUBLIC_URL = `http://127.0.0.1:${nuvioPort}`;
  process.env.NUVIO_SOURCE_VALIDATION_TIMEOUT_MS = "4000";

  const reliableCore = require("./nuvio-provider-core-reliable.js");
  const core = reliableCore.loadReliableCore();
  assert(core.patchValidationMarker === true, "Reliable Nuvio core validation marker is missing.");
  assert(
    core.inferType(
      { url: "https://cdn.example/movie.mp4" },
      { formats: ["m3u8", "mp4"] },
    ) === "mp4",
    "Provider manifest formats still override a direct MP4 URL.",
  );

  const nuvioServer = core.createServer();
  await listen(nuvioServer, nuvioPort);

  try {
    const goodProxy = core.createProxyTarget(`${upstreamAddress.url}/master.m3u8`, {}, "hls");
    const badProxy = core.createProxyTarget(`${upstreamAddress.url}/bad.m3u8`, {}, "hls");
    assert(goodProxy.startsWith(`http://127.0.0.1:${nuvioPort}/v1/proxy?data=`), "Nuvio proxy target uses the wrong local origin.");

    const manifestResponse = await fetch(goodProxy);
    const manifest = await manifestResponse.text();
    assert(manifestResponse.ok, "Delayed Nuvio HLS proxy request failed.");
    assert(/^#EXTM3U/m.test(manifest), "Nuvio proxy did not return an HLS manifest.");
    assert(manifest.includes(`/v1/proxy?data=`), "Nuvio proxy did not rewrite the segment URL.");

    const good = await core.validateNuvioPlaybackSource({
      url: goodProxy,
      type: "hls",
      quality: "1080p",
      provider: { id: "fixture", name: "Fixture" },
    });
    assert(good && good.ok, `Valid HLS source was rejected: ${good && good.reason}`);

    const bad = await core.validateNuvioPlaybackSource({
      url: badProxy,
      type: "hls",
      quality: "1080p",
      provider: { id: "blocked", name: "Blocked" },
    });
    assert(bad && bad.ok === false, "HTML masquerading as HLS was accepted.");
  } finally {
    await close(nuvioServer);
    await close(upstream);
  }

  console.log("Swifly delayed Nuvio HLS relay, source validation, and readable Source menu QA passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
