"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
require("dotenv").config({ path: path.join(root, ".env") });

// Keep the providers that have produced the most stable source responses in
// Swifly testing. Users can still override either value in .env.
process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "vixsrc,icefy";
process.env.CINEPRO_PROVIDER_ORDER = process.env.CINEPRO_PROVIDER_ORDER || "vixsrc,icefy";

const originalReadFileSync = fs.readFileSync.bind(fs);
let playerPatched = false;

function replaceOnce(source, label, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`[cinepro-player] Could not find ${label}; server.js was not modified.`);
  }
  return source.replace(needle, replacement);
}

fs.readFileSync = function swiflyPlayerRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (playerPatched || resolved !== serverPath) return result;

  playerPatched = true;
  fs.readFileSync = originalReadFileSync;

  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  // Serve a pinned Vidstack build from node_modules. This removes the player UI's
  // dependency on a third-party CDN while preserving CinePro's existing source flow.
  source = replaceOnce(
    source,
    "local Vidstack static route",
    'const PORT = process.env.PORT || 3000;',
    'app.use("/_swifly/vidstack", express.static(path.join(__dirname, "node_modules", "vidstack"), { immutable: true, maxAge: "7d" }));\n\nconst PORT = process.env.PORT || 3000;',
  );

  source = source
    .replace('https://cdn.jsdelivr.net/npm/vidstack@^1.0.0/player/styles/default/theme.min.css', '/_swifly/vidstack/player/styles/default/theme.min.css')
    .replace('https://cdn.jsdelivr.net/npm/vidstack@^1.0.0/player/styles/default/layouts/video.min.css', '/_swifly/vidstack/player/styles/default/layouts/video.min.css')
    .replace('https://cdn.jsdelivr.net/npm/vidstack@^1.0.0/cdn/with-layouts/vidstack.js', '/_swifly/vidstack/cdn/with-layouts/vidstack.js');

  source = replaceOnce(
    source,
    "player title fallback",
    '            var title = (data && (data.title || data.name)) || "SwiflyTV";',
    '            var title = (data && (data.title || data.name)) || String(document.title || "").split("|")[0].trim() || "SwiflyTV";',
  );

  source = replaceOnce(
    source,
    "premium player attributes",
    '            player.setAttribute("keep-alive", "");\n            player.setAttribute("data-swifly-src", src);',
    `            player.setAttribute("keep-alive", "");
            player.setAttribute("storage", "swifly-player");
            player.setAttribute("key-target", "player");
            player.setAttribute("controls-delay", "2400");
            player.setAttribute("aspect-ratio", "16/9");
            player.setAttribute("aria-label", title + " video player");
            player.setAttribute("data-swifly-player", "premium");
            player.setAttribute("data-swifly-src", src);`,
  );

  source = replaceOnce(
    source,
    "Vidstack provider and layout",
    `            var provider = document.createElement("media-provider");
            var layout = document.createElement("media-video-layout");
            layout.setAttribute("thumbnails", "");
            layout.setAttribute("data-swifly-layout", "default");

            player.appendChild(provider);
            player.appendChild(layout);`,
    `            var provider = document.createElement("media-provider");

            if (poster) {
              var posterElement = document.createElement("media-poster");
              posterElement.className = "swiflyPremiumPoster";
              posterElement.setAttribute("src", poster);
              posterElement.setAttribute("alt", title + " poster");
              provider.appendChild(posterElement);
            }

            var subtitleTracks = Array.isArray(data && data.subtitles) ? data.subtitles : [];
            subtitleTracks.slice(0, 24).forEach(function(item, index) {
              var trackUrl = item && item.url ? String(item.url) : "";
              if (!trackUrl) return;
              var track = document.createElement("track");
              track.setAttribute("src", trackUrl);
              track.setAttribute("kind", "subtitles");
              track.setAttribute("label", String((item && item.label) || (item && item.language) || ("Subtitle " + (index + 1))));
              track.setAttribute("srclang", String((item && item.language) || "und"));
              provider.appendChild(track);
            });

            var layout = document.createElement("media-video-layout");
            layout.setAttribute("color-scheme", "dark");
            layout.setAttribute("data-swifly-layout", "premium-default");

            player.appendChild(provider);
            player.appendChild(layout);`,
  );

  // Vidstack's official layout already supplies accessible keyboard shortcuts.
  // Disable the old duplicate listener so one key press cannot seek twice.
  source = replaceOnce(
    source,
    "duplicate keyboard listener",
    '            if (playerShell && !playerShell.dataset.v149Keys) {',
    '            if (false && playerShell && !playerShell.dataset.v149Keys) {',
  );

  const finalStyleMarker = `    @media(max-width: 900px) {
      .dsVideoJsCinemaShell.v149Vidstack {
        --v149-radius: 18px;
        height: clamp(300px, 58vh, 640px) !important;
        min-height: clamp(300px, 58vh, 640px) !important;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
        --media-button-size: 36px;
        --media-slider-height: 32px;
        --media-slider-track-height: 5px;
        --media-slider-thumb-size: 12px;
      }
    }

  </style>\` : "",`;

  const premiumStyles = `    @media(max-width: 900px) {
      .dsVideoJsCinemaShell.v149Vidstack {
        --v149-radius: 18px;
        height: clamp(300px, 58vh, 640px) !important;
        min-height: clamp(300px, 58vh, 640px) !important;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
        --media-button-size: 36px;
        --media-slider-height: 32px;
        --media-slider-track-height: 5px;
        --media-slider-thumb-size: 12px;
      }
    }

    /* ============================================================
       SWIFLY PREMIUM VIDSTACK PLAYER
       One active player, one control system, no legacy overlays.
       ============================================================ */
    .dsVideoJsCinemaShell.v149Vidstack {
      --swifly-player-radius: 24px;
      width: min(100%, 1600px, 160svh) !important;
      height: auto !important;
      min-height: 0 !important;
      aspect-ratio: 16 / 9 !important;
      margin-inline: auto !important;
      border-radius: var(--swifly-player-radius) !important;
      background: #000 !important;
      outline: 1px solid rgba(255,255,255,.11) !important;
      box-shadow:
        0 30px 90px rgba(0,0,0,.58),
        0 0 0 1px rgba(255,255,255,.025) inset,
        0 0 64px rgba(104,120,255,.075) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack::after {
      opacity: .34 !important;
      background:
        linear-gradient(to bottom, rgba(0,0,0,.34), transparent 22%),
        linear-gradient(to top, rgba(0,0,0,.48), transparent 30%) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack #movieButtonBack10,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonBigPlay,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonForward10,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSeekDock,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonQualityToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonQualityMenu,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSpeedToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonSpeedMenu,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonVolumeToggle,
    .dsVideoJsCinemaShell.v149Vidstack #movieButtonVolumeMenu,
    .dsVideoJsCinemaShell.v149Vidstack .swiflyVideoDock,
    .dsVideoJsCinemaShell.v149Vidstack .swiflyNeoDock,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsTop,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsCenter,
    .dsVideoJsCinemaShell.v149Vidstack .dsVideoJsHint,
    .dsVideoJsCinemaShell.v149Vidstack .dsCinemaPlayerAura {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack.v149Ready .dsHlsStatus:not(.isError),
    .dsVideoJsCinemaShell.v149Vidstack.v149Playing .dsHlsStatus:not(.isError) {
      display: none !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      overflow: hidden !important;
      container-type: inline-size;
      border-radius: inherit !important;
      background: #000 !important;
      color: #fff;
      --media-font-family: var(--font-ui, "Host Grotesk", Inter, system-ui, sans-serif);
      --media-brand: #ffffff;
      --media-controls-color: rgba(255,255,255,.96);
      --media-focus-ring-color: rgba(156,170,255,.82);
      --media-button-size: 42px;
      --media-button-icon-size: 76%;
      --media-button-border-radius: 13px;
      --media-button-hover-bg: rgba(255,255,255,.13);
      --media-button-hover-transform: scale(1.06);
      --media-slider-track-bg: rgba(255,255,255,.24);
      --media-slider-track-fill-bg: #ffffff;
      --media-slider-track-progress-bg: rgba(255,255,255,.42);
      --media-slider-thumb-bg: #ffffff;
      --media-slider-thumb-size: 14px;
      --media-slider-track-height: 5px;
      --media-menu-bg: rgba(12,15,24,.94);
      --media-menu-color: rgba(255,255,255,.92);
      --media-menu-border: 1px solid rgba(255,255,255,.12);
      --media-menu-border-radius: 17px;
      --media-tooltip-bg: rgba(248,250,255,.96);
      --media-tooltip-color: #0a0d15;
      --media-tooltip-border-radius: 999px;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-provider,
    .dsVideoJsCinemaShell.v149Vidstack [data-media-provider],
    .dsVideoJsCinemaShell.v149Vidstack media-video-layout {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      border-radius: inherit !important;
      overflow: hidden !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer video,
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-media-provider] video {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: 50% 50% !important;
      background: #000 !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-poster,
    .dsVideoJsCinemaShell.v149Vidstack .swiflyPremiumPoster {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls"] {
      padding: 18px 18px 14px !important;
      background: linear-gradient(to top, rgba(0,0,0,.93), rgba(0,0,0,.42) 56%, transparent) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls-group"] {
      gap: 5px !important;
      align-items: center !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"],
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 16px !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"] .vds-button,
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] .vds-button {
      width: 58px !important;
      height: 58px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      background: rgba(12,16,28,.60) !important;
      box-shadow: 0 12px 34px rgba(0,0,0,.30) !important;
      backdrop-filter: blur(16px) saturate(1.16);
      -webkit-backdrop-filter: blur(16px) saturate(1.16);
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer .vds-play-button {
      border-color: rgba(255,255,255,.28) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"] .vds-play-button,
    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] .vds-play-button {
      width: 76px !important;
      height: 76px !important;
      background: linear-gradient(145deg, rgba(134,151,255,.96), rgba(92,105,213,.96)) !important;
      box-shadow: 0 18px 48px rgba(73,83,189,.38), 0 0 0 1px rgba(255,255,255,.14) inset !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer .vds-time-slider {
      --media-slider-track-height: 5px;
      --media-slider-thumb-size: 14px;
      margin-inline: 2px !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer .vds-menu-items {
      border-radius: 17px !important;
      border: 1px solid rgba(255,255,255,.12) !important;
      background: rgba(12,15,24,.94) !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.54) !important;
      backdrop-filter: blur(24px) saturate(1.12);
      -webkit-backdrop-filter: blur(24px) saturate(1.12);
    }

    .dsVideoJsCinemaShell.v149Vidstack media-captions {
      bottom: clamp(78px, 10cqw, 118px) !important;
      font-size: clamp(17px, 2.1cqw, 31px) !important;
      line-height: 1.3 !important;
      text-shadow: 0 2px 6px rgba(0,0,0,.96) !important;
    }

    .dsVideoJsCinemaShell.v149Vidstack media-player[data-waiting] .vds-buffering-indicator {
      filter: drop-shadow(0 10px 24px rgba(0,0,0,.42));
    }

    .dsVideoJsCinemaShell.v149Vidstack:fullscreen,
    .dsVideoJsCinemaShell.v149Vidstack:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      aspect-ratio: auto !important;
      border-radius: 0 !important;
    }

    @container (max-width: 700px) {
      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer {
        --media-button-size: 36px;
        --media-slider-thumb-size: 12px;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="controls"] {
        padding: 10px 9px 8px !important;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"] .vds-button,
      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] .vds-button {
        width: 48px !important;
        height: 48px !important;
      }

      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-part="center-controls"] .vds-play-button,
      .dsVideoJsCinemaShell.v149Vidstack media-player.swiflyVidstackPlayer [data-center-controls] .vds-play-button {
        width: 64px !important;
        height: 64px !important;
      }
    }

    @media(max-width: 900px) {
      .dsVideoJsCinemaShell.v149Vidstack {
        --swifly-player-radius: 16px;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        aspect-ratio: 16 / 9 !important;
      }
    }

  </style>\` : "",`;

  source = replaceOnce(source, "final Vidstack style block", finalStyleMarker, premiumStyles);

  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
console.log("[cinepro-player] Premium local Vidstack player enabled.");
console.log("[cinepro-player] Official controls, saved preferences, subtitles, quality, PiP, and fullscreen enabled.");
require("./start-cinepro.js");
