"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const cineproClientPath = path.join(root, "cinepro-client.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) {
      throw new Error(`[swifly-stable-state] Could not find ${label}; refusing a partial state patch.`);
    }
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) {
    throw new Error(`[swifly-stable-state] Could not find ${label}; refusing a partial state patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function assertSyntax(source, filename) {
  new vm.Script(source, { filename });
  return source;
}

function patchCineProClientState(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    "  const sourceOptions = candidates.slice(0, 16).map((candidate, index) => {",
    `  const sourceIdCounts = new Map();
  const sourceOptions = candidates.map((candidate) => {`,
    "arbitrary 16-source cutoff",
  );

  next = replaceRequired(
    next,
    `    const streamMode = candidate.kind;
    return {`,
    `    const streamMode = candidate.kind;
    const sourceIdentity = [
      clean(optionProvider.id || optionProvider.name),
      clean(optionSource.type),
      quality,
      clean(optionSource.url),
    ].join("|");
    const sourceHash = crypto.createHash("sha1").update(sourceIdentity).digest("hex").slice(0, 14);
    const duplicateNumber = Number(sourceIdCounts.get(sourceHash) || 0) + 1;
    sourceIdCounts.set(sourceHash, duplicateNumber);
    const stableSourceId = "cinepro-source-" + sourceHash + (duplicateNumber > 1 ? "-" + duplicateNumber : "");
    return {`,
    "stable Source identity",
  );

  next = replaceRequired(
    next,
    "      id: `cinepro-source-${index}` ,",
    "      id: stableSourceId,",
    "sequential Source id",
  ).replace("      id: `cinepro-source-${index}`,", "      id: stableSourceId,");

  if (next.includes("candidates.slice(0, 16)")) {
    throw new Error("[swifly-stable-state] Source cutoff survived patching.");
  }
  return assertSyntax(next, cineproClientPath);
}

function patchCustomControlsState(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    '<select data-s="speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option><option value="2.5">2.5×</option><option value="3">3×</option><option value="4">4×</option></select>',
    '<select data-s="speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option><option value="2.5">2.5×</option><option value="3">3×</option><option value="4">4×</option></select>',
    "canonical numeric Speed values",
  );

  next = replaceRequired(
    next,
    `          var speed = ui.querySelector('[data-s="speed"]');`,
    `          var speed = ui.querySelector('[data-s="speed"]');
          var rememberedPlaybackRate = Number(window.__swiflyPlaybackRate || media.playbackRate || media.defaultPlaybackRate || 1);
          if (!Number.isFinite(rememberedPlaybackRate) || rememberedPlaybackRate <= 0) rememberedPlaybackRate = 1;
          try {
            media.defaultPlaybackRate = rememberedPlaybackRate;
            media.playbackRate = rememberedPlaybackRate;
          } catch {}
          if (speed) speed.value = String(rememberedPlaybackRate);`,
    "remembered Speed restoration",
  );

  next = replaceRequired(
    next,
    `            var tracks = Array.from(media.textTracks || []);`,
    `            var actualPlaybackRate = Number(media.playbackRate || 1);
            if (!Number.isFinite(actualPlaybackRate) || actualPlaybackRate <= 0) actualPlaybackRate = 1;
            var actualPlaybackValue = String(actualPlaybackRate);
            if (speed && Array.from(speed.options || []).some(function(option){ return option.value === actualPlaybackValue; })) {
              speed.value = actualPlaybackValue;
            }
            window.__swiflyPlaybackRate = actualPlaybackRate;
            var tracks = Array.from(media.textTracks || []);`,
    "Speed synchronization from media state",
  );

  next = replaceRequired(
    next,
    `          speed.addEventListener("change", function(){
            media.playbackRate = Number(speed.value || 1);
          });`,
    `          speed.addEventListener("change", function(){
            var nextRate = Number(speed.value || 1);
            if (!Number.isFinite(nextRate) || nextRate <= 0) nextRate = 1;
            window.__swiflyPlaybackRate = nextRate;
            try {
              media.defaultPlaybackRate = nextRate;
              media.playbackRate = nextRate;
            } catch {}
            speed.value = String(nextRate);
            sync();
          });`,
    "persistent Speed change handler",
  );

  next = replaceRequired(
    next,
    `["play", "pause", "ended", "timeupdate", "durationchange", "progress", "volumechange"]`,
    `["play", "pause", "ended", "timeupdate", "durationchange", "progress", "volumechange", "ratechange"]`,
    "ratechange synchronization event",
  );

  return assertSyntax(next, customControlsPath);
}

function patchLanguagesState(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    `            var options = availableSourceOptions();
            source.innerHTML = "";`,
    `            var options = availableSourceOptions();
            var preferredSourceId = String(
              window.__swiflySelectedSourceId || source.value || activeSourceData.selectedSourceId || ""
            );
            source.innerHTML = "";`,
    "Source selection preservation before rebuild",
  );

  next = replaceRequired(
    next,
    `            var selectedId = String(activeSourceData.selectedSourceId || options[0].id || "");
            source.value = Array.from(source.options).some(function(option) { return option.value === selectedId; })
              ? selectedId
              : String(source.options[0] && source.options[0].value || "");`,
    `            var selectedId = preferredSourceId || String(activeSourceData.selectedSourceId || options[0].id || "");
            source.value = Array.from(source.options).some(function(option) { return option.value === selectedId; })
              ? selectedId
              : String(source.options[0] && source.options[0].value || "");
            activeSourceData.selectedSourceId = String(source.value || "");
            window.__swiflySelectedSourceId = activeSourceData.selectedSourceId;`,
    "Source selection restoration after rebuild",
  );

  next = replaceRequired(
    next,
    `            if (!selected || !selected.playbackUrl) return;
            if (String(selected.id || "") === String(activeSourceData.selectedSourceId || "")) return;

            window.__swiflySourceResume = {`,
    `            if (!selected || !selected.playbackUrl) return;
            if (String(selected.id || "") === String(activeSourceData.selectedSourceId || "")) return;

            activeSourceData.selectedSourceId = String(selected.id || "");
            window.__swiflySelectedSourceId = activeSourceData.selectedSourceId;
            source.value = activeSourceData.selectedSourceId;
            window.__swiflySourceResume = {`,
    "immediate Source selection commitment",
  );

  next = replaceRequired(
    next,
    `            startPlyrHlsSource(String(selected.playbackUrl), nextData);`,
    `            activeSourceData = nextData;
            window.__swiflyActiveSourceData = nextData;
            window.__swiflySelectedSourceId = String(nextData.selectedSourceId || "");
            startPlyrHlsSource(String(selected.playbackUrl), nextData);`,
    "Source state handoff before remount",
  );

  return assertSyntax(next, languagesPath);
}

function patchThemeState(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    `          var choices = detail.querySelector(".swiflySettingsChoices");

          function selectedText(select) {`,
    `          var choices = detail.querySelector(".swiflySettingsChoices");
          var settingSelections = Object.create(null);

          function settingKey(select) {
            return select ? String(select.getAttribute("data-s") || "") : "";
          }

          function optionExists(select, value) {
            return !!select && Array.from(select.options || []).some(function(option) {
              return String(option.value) === String(value);
            });
          }

          function normalizedSpeedValue(value) {
            var rate = Number(value);
            if (!Number.isFinite(rate) || rate <= 0) rate = 1;
            return String(rate);
          }

          function currentSettingValue(select) {
            if (!select) return "";
            var key = settingKey(select);
            if (key === "speed") {
              var actualSpeed = normalizedSpeedValue(media.playbackRate || window.__swiflyPlaybackRate || 1);
              settingSelections.speed = actualSpeed;
              return actualSpeed;
            }
            var remembered = String(settingSelections[key] || "");
            if (remembered && optionExists(select, remembered)) return remembered;
            return String(select.value || "");
          }

          function rememberSetting(select, value) {
            var key = settingKey(select);
            if (!key) return;
            var normalized = key === "speed" ? normalizedSpeedValue(value) : String(value || "");
            settingSelections[key] = normalized;
            if (key === "speed") window.__swiflyPlaybackRate = Number(normalized);
          }

          function selectedText(select) {`,
    "stable setting selection helpers",
  );

  next = replaceRequired(
    next,
    `            var option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;`,
    `            var currentValue = currentSettingValue(select);
            if (optionExists(select, currentValue)) select.value = currentValue;
            var option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;`,
    "selected summary from committed state",
  );

  next = replaceRequired(
    next,
    `                [".5", "0.5×"],
                [".75", "0.75×"],`,
    `                ["0.5", "0.5×"],
                ["0.75", "0.75×"],`,
    "canonical Speed option values in renderer",
  );

  next = replaceRequired(
    next,
    `                var selectedSpeed = String(select.value || media.playbackRate || "1");`,
    `                var selectedSpeed = normalizedSpeedValue(media.playbackRate || settingSelections.speed || select.value || 1);`,
    "Speed option rebuild source of truth",
  );

  next = replaceRequired(
    next,
    `              select.disabled = false;
            }

            return Array.from(select.options || []);`,
    `              select.disabled = false;
              settingSelections.speed = normalizedSpeedValue(media.playbackRate || selectedSpeed || 1);
              if (optionExists(select, settingSelections.speed)) select.value = settingSelections.speed;
            }

            var rememberedValue = currentSettingValue(select);
            if (optionExists(select, rememberedValue)) select.value = rememberedValue;
            return Array.from(select.options || []);`,
    "reapply committed option after rebuild",
  );

  next = replaceRequired(
    next,
    `              var isSelected = String(select.value) === String(option.value);`,
    `              var isSelected = String(currentSettingValue(select)) === String(option.value);`,
    "selected choice from committed state",
  );

  next = replaceRequired(
    next,
    `                select.value = String(option.value);
                select.dispatchEvent(new Event("change", { bubbles: true }));
                syncRows();`,
    `                rememberSetting(select, option.value);
                select.value = String(option.value);
                if (item.key === "speed") {
                  var committedRate = Number(option.value || 1);
                  try {
                    media.defaultPlaybackRate = committedRate;
                    media.playbackRate = committedRate;
                  } catch {}
                }
                select.dispatchEvent(new Event("change", { bubbles: true }));
                syncRows();`,
    "commit setting before change event",
  );

  next = replaceRequired(
    next,
    `                  choice.classList.toggle("selected", choice.dataset.value === String(select.value));`,
    `                  choice.classList.toggle("selected", choice.dataset.value === String(currentSettingValue(select)));`,
    "selected check after setting change",
  );

  next = replaceRequired(
    next,
    `            select.addEventListener("change", syncRows);`,
    `            rememberSetting(select, select.value);
            select.addEventListener("change", function() {
              rememberSetting(select, select.value);
              syncRows();
            });`,
    "persistent native select state",
  );

  next = replaceRequired(
    next,
    `              var observer = new MutationObserver(function() {
                syncRows();`,
    `              var observer = new MutationObserver(function() {
                var rememberedValue = currentSettingValue(select);
                if (optionExists(select, rememberedValue)) select.value = rememberedValue;
                syncRows();`,
    "selection restoration after option mutations",
  );

  next = replaceRequired(
    next,
    `          header.querySelector(".swiflySettingsClose").addEventListener`,
    `          if (fields.speed && fields.speed.select) {
            media.addEventListener("ratechange", function() {
              var speedSelect = fields.speed.select;
              var actualRate = normalizedSpeedValue(media.playbackRate || 1);
              rememberSetting(speedSelect, actualRate);
              if (optionExists(speedSelect, actualRate)) speedSelect.value = actualRate;
              syncRows();
            });
          }

          header.querySelector(".swiflySettingsClose").addEventListener`,
    "media ratechange menu synchronization",
  );

  new vm.Script(next, { filename: themePath });
  const upgrade = next.match(/const themeUpgrade = String\.raw`([\s\S]*?)`;\n/);
  if (!upgrade) {
    throw new Error("[swifly-stable-state] Could not extract generated theme state code.");
  }
  new vm.Script(upgrade[1], { filename: "swifly-generated-stable-state.js" });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflyStableStateRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) {
      patcher = patchCineProClientState;
      label = "all stable Source options";
    }
    if (resolved === customControlsPath) {
      patcher = patchCustomControlsState;
      label = "media-backed Speed state";
    }
    if (resolved === languagesPath) {
      patcher = patchLanguagesState;
      label = "persistent Source selection";
    }
    if (resolved === themePath) {
      patcher = patchThemeState;
      label = "persistent playback menu selections";
    }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-stable-state] ${label} injected.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchCineProClientState,
  patchCustomControlsState,
  patchLanguagesState,
  patchThemeState,
};
