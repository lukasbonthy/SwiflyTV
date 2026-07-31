"use strict";

const vm = require("vm");

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-source-transition] Could not find ${label}; refusing an unsafe partial patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchPlyrServerSource(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    /if\s*\(movieButtonHls\)\s*\{\s*try\s*\{\s*movieButtonHls\.destroy\(\);\s*\}\s*catch\s*\{\s*\}\s*movieButtonHls\s*=\s*null;\s*\}/,
    `var swiflySourceToken = Number(window.__swiflySourceToken || 0) + 1;
          window.__swiflySourceToken = swiflySourceToken;
          try {
            console.log(
              "[swifly-source-switch] Loading " + String(data && data.streamName || "selected source"),
              url
            );
          } catch {}

          if (movieButtonHls) {
            try { movieButtonHls.stopLoad(); } catch {}
            try { movieButtonHls.detachMedia(); } catch {}
            try { movieButtonHls.destroy(); } catch {}
            movieButtonHls = null;
          }

          try { video.pause(); } catch {}
          try { video.removeAttribute("src"); } catch {}
          try { video.load(); } catch {}

          video.addEventListener("loadedmetadata", function swiflySelectedSourceReady() {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken) return;
            try {
              console.log(
                "[swifly-source-switch] Ready " + String(data && data.streamName || "selected source"),
                video.currentSrc || url
              );
            } catch {}
          }, { once: true });`,
    "previous HLS and media teardown",
  );

  next = replaceRequired(
    next,
    /movieButtonHls\.loadSource\(url\);\s*movieButtonHls\.attachMedia\(video\);\s*movieButtonHls\.on\(Hls\.Events\.MANIFEST_PARSED,\s*function\(\)\s*\{/,
    `var sourceHls = movieButtonHls;
          sourceHls.on(Hls.Events.MEDIA_ATTACHED, function() {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;
            sourceHls.loadSource(url);
          });
          sourceHls.attachMedia(video);
          sourceHls.on(Hls.Events.MANIFEST_PARSED, function() {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;`,
    "HLS attach-before-load transition",
  );

  next = replaceRequired(
    next,
    /movieButtonHls\.on\(Hls\.Events\.ERROR,\s*function\(event,\s*errorData\)\s*\{/,
    `sourceHls.on(Hls.Events.ERROR, function(event, errorData) {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;`,
    "stale HLS error guard",
  );

  if (/movieButtonHls\.loadSource\(url\);\s*movieButtonHls\.attachMedia\(video\);/.test(next)) {
    throw new Error("[swifly-source-transition] The unsafe HLS load-before-reset sequence survived.");
  }

  new vm.Script(next, { filename: "swifly-transition-patched-server.js" });
  return next;
}

module.exports = { patchPlyrServerSource };
