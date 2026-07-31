"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  patchCustomControlsCompatible,
  patchLanguagesCompatible,
} = require("./start-cinepro-controls-compatible.js");

const root = path.resolve(__dirname, "..");
const cinemaPath = path.join(root, "scripts", "start-cinepro-settings-cinema.js");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const cineproClientPath = path.join(root, "cinepro-client.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) {
      throw new Error(`[swifly-source-speed] Could not find ${label}; refusing a partial startup patch.`);
    }
    return source.replace(pattern, replacement);
  }

  if (!pattern.test(source)) {
    throw new Error(`[swifly-source-speed] Could not find ${label}; refusing a partial startup patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function assertModuleSyntax(source, filename) {
  new vm.Script(source, { filename });
  return source;
}

function patchCineProClient(source) {
  source = source.replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    "  const selected = candidates[0];",
    `  const sourceOptions = candidates.slice(0, 16).map((candidate, index) => {
    const optionSource = candidate.source || {};
    const optionProvider = optionSource.provider || {};
    const providerName = clean(optionProvider.name || optionProvider.id) || "CinePro source";
    const quality = clean(optionSource.quality);
    const streamMode = candidate.kind;
    return {
      id: \`cinepro-source-\${index}\`,
      label: providerName + (quality ? \` · \${quality}\` : ""),
      provider: providerName,
      providerId: clean(optionProvider.id),
      quality,
      streamMode,
      streamType: streamMode === "hls" ? "m3u8" : streamMode === "dash" ? "dash" : clean(optionSource.type) || "video",
      playbackUrl: candidate.playbackUrl,
      originalPlaybackUrl: clean(optionSource.url),
      audioTracks: Array.isArray(optionSource.audioTracks) ? optionSource.audioTracks : [],
    };
  });

  const selected = candidates[0];`,
    "CinePro source option normalization",
  );

  source = replaceRequired(
    source,
    "    responseId: clean(data && data.responseId),\n    expiresAt: clean(data && data.expiresAt),\n    subtitles,",
    `    responseId: clean(data && data.responseId),
    expiresAt: clean(data && data.expiresAt),
    selectedSourceId: sourceOptions[0] ? sourceOptions[0].id : "",
    sourceOptions,
    subtitles,`,
    "CinePro source option response fields",
  );

  return assertModuleSyntax(source, cineproClientPath);
}

function patchCustomControls(source) {
  source = patchCustomControlsCompatible(source.replace(/\r\n?/g, "\n"));

  source = replaceRequired(
    source,
    /<select data-s="speed">[\s\S]*?<\/select>/,
    '<select data-s="speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option><option value="2.5">2.5×</option><option value="3">3×</option><option value="4">4×</option></select>',
    "extended speed options",
  );

  source = replaceRequired(
    source,
    "function mountSwiflyControls(player, media, hlsInstance)",
    "function mountSwiflyControls(player, media, hlsInstance, sourceData)",
    "Source-aware control signature",
  );

  source = replaceRequired(
    source,
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance);",
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, data);",
    "Source-aware control mount",
  );

  return assertModuleSyntax(source, customControlsPath);
}

function patchLanguages(source) {
  source = patchLanguagesCompatible(source.replace(/\r\n?/g, "\n"));

  source = replaceRequired(
    source,
    `'<label class="swiflyUiField"><span>Speed</span><select data-s="speed">$1</select></label><label class="swiflyUiField"><span>Audio</span><select data-s="audio"><option value="default">Default</option></select></label><label class="swiflyUiField"><span>Captions</span><select data-s="cc"><option value="off">Off</option></select></label>',`,
    `'<label class="swiflyUiField"><span>Source</span><select data-s="source"><option value="current">Current source</option></select></label><label class="swiflyUiField"><span>Speed</span><select data-s="speed">$1</select></label><label class="swiflyUiField"><span>Audio</span><select data-s="audio"><option value="default">Default</option></select></label><label class="swiflyUiField"><span>Captions</span><select data-s="cc"><option value="off">Off</option></select></label>',`,
    "Source setting markup",
  );

  source = replaceRequired(
    source,
    `var audio = ui.querySelector('[data-s="audio"]');
          var cc = ui.querySelector('[data-s="cc"]');`,
    `var source = ui.querySelector('[data-s="source"]');
          var audio = ui.querySelector('[data-s="audio"]');
          var cc = ui.querySelector('[data-s="cc"]');`,
    "Source setting reference",
  );

  source = replaceRequired(
    source,
    `          var lastCaptionSelection = "off";
`,
    `          var lastCaptionSelection = "off";
          var activeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};

          function availableSourceOptions() {
            return Array.isArray(activeSourceData.sourceOptions)
              ? activeSourceData.sourceOptions.filter(function(item) { return item && item.playbackUrl; })
              : [];
          }

          function fillSourceOptions() {
            if (!source) return;
            var options = availableSourceOptions();
            source.innerHTML = "";

            if (!options.length) {
              var current = document.createElement("option");
              current.value = "current";
              current.textContent = String(activeSourceData.streamName || "Current source");
              source.appendChild(current);
              source.disabled = true;
              return;
            }

            options.forEach(function(item, index) {
              var option = document.createElement("option");
              option.value = String(item.id || ("source-" + index));
              option.textContent = String(item.label || item.provider || ("Source " + (index + 1)));
              source.appendChild(option);
            });

            source.disabled = false;
            var selectedId = String(activeSourceData.selectedSourceId || options[0].id || "");
            source.value = Array.from(source.options).some(function(option) { return option.value === selectedId; })
              ? selectedId
              : String(source.options[0] && source.options[0].value || "");
          }

          function switchCineProSource(sourceId) {
            var options = availableSourceOptions();
            var selected = options.find(function(item, index) {
              return String(item.id || ("source-" + index)) === String(sourceId || "");
            });
            if (!selected || !selected.playbackUrl) return;
            if (String(selected.id || "") === String(activeSourceData.selectedSourceId || "")) return;

            window.__swiflySourceResume = {
              time: Number(media.currentTime || 0),
              play: !media.paused,
              expires: Date.now() + 20000
            };

            var streamMode = String(selected.streamMode || "hls");
            var nextData = Object.assign({}, activeSourceData, {
              selectedSourceId: String(selected.id || ""),
              playbackUrl: String(selected.playbackUrl),
              proxyVideo: String(selected.playbackUrl),
              originalPlaybackUrl: String(selected.originalPlaybackUrl || ""),
              hlsProxyUrl: streamMode === "hls" ? String(selected.playbackUrl) : "",
              m3u8: streamMode === "hls" ? String(selected.playbackUrl) : "",
              embeddedM3u8Url: streamMode === "hls" ? String(selected.playbackUrl) : "",
              m3u8Embedded: streamMode === "hls",
              streamType: String(selected.streamType || (streamMode === "hls" ? "m3u8" : streamMode)),
              streamMode: streamMode,
              streamQuality: String(selected.quality || ""),
              streamName: String(selected.provider || selected.label || "CinePro"),
              audioTracks: Array.isArray(selected.audioTracks) ? selected.audioTracks : []
            });

            startPlyrHlsSource(String(selected.playbackUrl), nextData);
          }

          var sourceResume = window.__swiflySourceResume;
          if (sourceResume && Number(sourceResume.expires || 0) > Date.now()) {
            try { delete window.__swiflySourceResume; } catch { window.__swiflySourceResume = null; }
            var restoreSourcePosition = function() {
              var duration = Number(media.duration || 0);
              var target = Math.max(0, Number(sourceResume.time || 0));
              if (duration > 0) target = Math.min(target, Math.max(0, duration - 0.25));
              try { media.currentTime = target; } catch {}
              if (sourceResume.play) {
                var resumePromise = media.play();
                if (resumePromise && resumePromise.catch) resumePromise.catch(function() {});
              }
            };
            if (media.readyState >= 1) setTimeout(restoreSourcePosition, 0);
            else media.addEventListener("loadedmetadata", restoreSourcePosition, { once: true });
          }

`,
    "Source selection helpers",
  );

  source = replaceRequired(
    source,
    `            if (!controlsCurrent()) return;
            var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];`,
    `            if (!controlsCurrent()) return;
            fillSourceOptions();
            var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];`,
    "Source settings population",
  );

  source = replaceRequired(
    source,
    `quality.addEventListener("change", function(){
            if (hlsInstance) hlsInstance.currentLevel = Number(quality.value);
          });
          audio.addEventListener`,
    `if (source) {
            source.addEventListener("change", function(){
              switchCineProSource(source.value);
            });
          }
          quality.addEventListener("change", function(){
            if (hlsInstance) hlsInstance.currentLevel = Number(quality.value);
          });
          audio.addEventListener`,
    "Source change handler",
  );

  return assertModuleSyntax(source, languagesPath);
}

function patchTheme(source) {
  source = source.replace(/\r\n?/g, "\n");
  source = replaceRequired(
    source,
    /(var definitions = \[\n\s*)\{ key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" \},/,
    `$1{ key: "source", label: "Source", hint: "Playback provider", icon: "fa-tower-broadcast" },
            { key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" },`,
    "Source setting theme definition",
  );
  return assertModuleSyntax(source, themePath);
}

function installPatch() {
  fs.readFileSync = function swiflySourceSpeedRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) { patcher = patchCineProClient; label = "CinePro Source data"; }
    if (resolved === customControlsPath) { patcher = patchCustomControls; label = "working controls and extended speed"; }
    if (resolved === languagesPath) { patcher = patchLanguages; label = "Source selector"; }
    if (resolved === themePath) { patcher = patchTheme; label = "Source menu row"; }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-source-speed] ${label} patch ready.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  patchCineProClient,
  patchCustomControls,
  patchLanguages,
  patchTheme,
};

if (require.main === module) {
  installPatch();
  console.log("[swifly-source-speed] Stable Source selector and speeds through 4× enabled.");
  require("./start-cinepro-settings-cinema.js");
}
