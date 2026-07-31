"use strict";

const vm = require("vm");

function replaceRequired(source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) {
    throw new Error(`[swifly-source-transition] Could not find ${label}; refusing an unsafe partial patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function guardCount(source) {
  return (String(source).match(/movieButtonHls !== sourceHls/g) || []).length;
}

function isFullyPatched(source) {
  const value = String(source);
  return value.includes("window.__swiflySourceToken")
    && value.includes("movieButtonHls.stopLoad()")
    && value.includes("movieButtonHls.detachMedia()")
    && value.includes("var sourceHls = movieButtonHls;")
    && guardCount(value) >= 2;
}

function patchManifestListener(source) {
  const exactTransition = /movieButtonHls\.loadSource\(url\);\s*movieButtonHls\.attachMedia\(video\);\s*movieButtonHls\.on\(((?:window\.)?Hls\.Events\.MANIFEST_PARSED),\s*function\s*\(([^)]*)\)\s*\{/;
  exactTransition.lastIndex = 0;

  if (exactTransition.test(source)) {
    exactTransition.lastIndex = 0;
    return source.replace(exactTransition, function replaceClassicTransition(match, manifestEvent, callbackArgs) {
      return `var sourceHls = movieButtonHls;
          sourceHls.on(Hls.Events.MEDIA_ATTACHED, function() {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;
            sourceHls.loadSource(url);
          });
          sourceHls.attachMedia(video);
          sourceHls.on(${manifestEvent}, function(${callbackArgs}) {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;`;
    });
  }

  // Other wrappers may already have changed the load/attach order or inserted
  // statements between those calls. HLS.js supports its documented
  // loadSource()+attachMedia() lifecycle, so preserve that existing ordering
  // and add only the stale-instance guard around the manifest callback.
  const listener = /movieButtonHls\.on\(((?:window\.)?Hls\.Events\.MANIFEST_PARSED),\s*function\s*\(([^)]*)\)\s*\{/;
  return replaceRequired(
    source,
    listener,
    function replaceTransformedManifest(match, manifestEvent, callbackArgs) {
      return `var sourceHls = movieButtonHls;
          sourceHls.on(${manifestEvent}, function(${callbackArgs}) {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;`;
    },
    "HLS manifest listener for stale-source guarding",
  );
}

function patchErrorListener(source) {
  const listener = /(?:movieButtonHls|sourceHls)\.on\(((?:window\.)?Hls\.Events\.ERROR),\s*function\s*\(([^)]*)\)\s*\{/;
  return replaceRequired(
    source,
    listener,
    function replaceErrorGuard(match, errorEvent, callbackArgs) {
      return `sourceHls.on(${errorEvent}, function(${callbackArgs}) {
            if (Number(window.__swiflySourceToken || 0) !== swiflySourceToken || movieButtonHls !== sourceHls) return;`;
    },
    "stale HLS error guard",
  );
}

function patchPlyrServerSource(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  if (isFullyPatched(next)) {
    new vm.Script(next, { filename: "swifly-transition-patched-server.js" });
    return next;
  }

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

  next = patchManifestListener(next);
  next = patchErrorListener(next);

  if (!isFullyPatched(next)) {
    throw new Error("[swifly-source-transition] Safe teardown and stale-source guards were not fully installed.");
  }

  new vm.Script(next, { filename: "swifly-transition-patched-server.js" });
  return next;
}

module.exports = {
  isFullyPatched,
  patchErrorListener,
  patchManifestListener,
  patchPlyrServerSource,
};
