"use strict";

function required(source, find, replacement, label) {
  if (!source.includes(find)) throw new Error(`[swifly-controls] Missing ${label}; refusing a partial patch.`);
  return source.replace(find, replacement);
}

function patchLanguages(source) {
  return required(source,
    `            fillAudioLanguages();
            fillCaptionLanguages();`,
    `            quality.disabled = !(hlsInstance && Array.isArray(hlsInstance.levels) && hlsInstance.levels.length);
            fillAudioLanguages();
            fillCaptionLanguages();`,
    "direct-video quality state");
}

function patchTheme(source) {
  [
    `          playerShell.addEventListener("mouseleave", function() {\n`,
    `          media.addEventListener("pause", function() {\n`,
    `          document.addEventListener("keydown", function(event) {\n`,
  ].forEach(function(anchor) {
    source = required(source, anchor,
      anchor + `            if (!ui.isConnected || playerShell.querySelector(".swiflyPlayerUi") !== ui) return;\n`,
      "stale theme listener guard");
  });
  return source;
}

module.exports = { patchLanguages, patchTheme };
