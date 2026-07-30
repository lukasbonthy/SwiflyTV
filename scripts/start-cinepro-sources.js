"use strict";

const fs = require("fs");
const path = require("path");

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
      throw new Error(`[swifly-sources] Could not find ${label}; source was not modified.`);
    }
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) {
    throw new Error(`[swifly-sources] Could not find ${label}; source was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchCineProClient(source) {
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

  return source;
}

function patchCustomControls(source) {
  source = replaceRequired(
    source,
    "function mountSwiflyControls(player, media, hlsInstance)",
    "function mountSwiflyControls(player, media, hlsInstance, sourceData)",
    "custom controls source-data signature",
  );

  source = replaceRequired(
    source,
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance);",
    "mountSwiflyControls(movieButtonPlyr, video, hlsInstance, data);",
    "custom controls source-data mount",
  );

  return source;
}

function patchLanguages(source) {
  source = replaceRequired(
    source,
    "'<label class=\"swiflyUiField\"><span>Speed</span><select data-s=\"speed\">$1</select></label><label class=\"swiflyUiField\"><span>Audio</span><select data-s=\"audio\"><option value=\"default\">Default</option></select></label><label class=\"swiflyUiField\"><span>Captions</span><select data-s=\"cc\"><option value=\"off\">Off</option></select></label>',",
    "'<label class=\"swiflyUiField\"><span>Source</span><select data-s=\"source\"><option value=\"current\">Current source</option></select></label><label class=\"swiflyUiField\"><span>Speed</span><select data-s=\"speed\">$1</select></label><label class=\"swiflyUiField\"><span>Audio</span><select data-s=\"audio\"><option value=\"default\">Default</option></select></label><label class=\"swiflyUiField\"><span>Captions</span><select data-s=\"cc\"><option value=\"off\">Off</option></select></label>',",
    "source setting markup",
  );

  source = replaceRequired(
    source,
    "`var audio = ui.querySelector('[data-s=\"audio\"]');\n          var cc = ui.querySelector('[data-s=\"cc\"]');",
    "`var source = ui.querySelector('[data-s=\"source\"]');\n          var audio = ui.querySelector('[data-s=\"audio\"]');\n          var cc = ui.querySelector('[data-s=\"cc\"]');",
    "source setting control reference",
  );

  source = replaceRequired(
    source,
    "          var lastCaptionSelection = \"off\";\n",
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
            if (!selected || !selected.playbackUrl || String(selected.id || "") === String(activeSourceData.selectedSourceId || "")) return;

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

          var pendingSourceResume = window.__swiflySourceResume;
          if (pendingSourceResume && Number(pendingSourceResume.expires || 0) > Date.now()) {
            try { delete window.__swiflySourceResume; } catch { window.__swiflySourceResume = null; }
            var restoreSourcePosition = function() {
              var duration = Number(media.duration || 0);
              var target = Math.max(0, Number(pendingSourceResume.time || 0));
              if (duration > 0) target = Math.min(target, Math.max(0, duration - 0.25));
              try { media.currentTime = target; } catch {}
              if (pendingSourceResume.play) {
                var resumePromise = media.play();
                if (resumePromise && resumePromise.catch) resumePromise.catch(function() {});
              }
            };
            if (media.readyState >= 1) setTimeout(restoreSourcePosition, 0);
            else media.addEventListener("loadedmetadata", restoreSourcePosition, { once: true });
          }
`,
    "source selection helpers",
  );

  source = replaceRequired(
    source,
    /(`function fillSettings\(\) \{\n\s*)quality\.innerHTML = '<option value="-1">Auto<\/option>';/,
    "$1fillSourceOptions();\n             quality.innerHTML = '<option value=\"-1\">Auto</option>';",
    "source settings population",
  );

  source = replaceRequired(
    source,
    /(`)quality\.addEventListener\("change", function\(\)\{\n\s*if \(hlsInstance\) hlsInstance\.currentLevel = Number\(quality\.value\);\n\s*\}\);\n\s*audio\.addEventListener/,
    `$1source.addEventListener("change", function(){
             switchCineProSource(source.value);
           });
           quality.addEventListener("change", function(){
             if (hlsInstance) hlsInstance.currentLevel = Number(quality.value);
           });
           audio.addEventListener`,
    "source selection change handler",
  );

  return source;
}

function patchTheme(source) {
  return replaceRequired(
    source,
    /(var definitions = \[\n\s*)\{ key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" \},/,
    `$1{ key: "source", label: "Source", hint: "CinePro provider", icon: "fa-tower-broadcast" },
             { key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" },`,
    "source setting definition",
  );
}

function patchCinema(source) {
  source = replaceRequired(
    source,
    "width:min(720px,calc(100% - 118px))!important",
    "width:min(900px,calc(100% - 82px))!important",
    "command strip width",
  );
  source = replaceRequired(
    source,
    "margin:0 66px 0 0!important",
    "margin:0 54px 0 0!important",
    "command strip gear alignment",
  );
  source = replaceRequired(
    source,
    "flex:0 1 158px!important;min-width:118px!important;max-width:178px!important",
    "flex:1 1 0!important;min-width:116px!important;max-width:none!important",
    "five-setting command segments",
  );
  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingRow:nth-child(1){animation-delay:.015s}body.swifly-command-settings .swiflySettingRow:nth-child(2){animation-delay:.04s}body.swifly-command-settings .swiflySettingRow:nth-child(3){animation-delay:.065s}body.swifly-command-settings .swiflySettingRow:nth-child(4){animation-delay:.09s}",
    "body.swifly-command-settings .swiflySettingRow:nth-child(1){animation-delay:.015s}body.swifly-command-settings .swiflySettingRow:nth-child(2){animation-delay:.035s}body.swifly-command-settings .swiflySettingRow:nth-child(3){animation-delay:.055s}body.swifly-command-settings .swiflySettingRow:nth-child(4){animation-delay:.075s}body.swifly-command-settings .swiflySettingRow:nth-child(5){animation-delay:.095s}",
    "five-setting stagger animation",
  );
  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingRow.isDisabled{display:none!important}",
    "body.swifly-command-settings .swiflySettingRow.isDisabled{display:grid!important;opacity:.38!important;cursor:not-allowed!important;filter:saturate(.45)!important}body.swifly-command-settings .swiflySettingRow.isDisabled:hover{background:transparent!important;transform:none!important}",
    "visible unavailable settings",
  );
  return source;
}

fs.readFileSync = function swiflySourcesRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patchedPaths.has(resolved)) return result;

  let patcher = null;
  if (resolved === cineproClientPath) patcher = patchCineProClient;
  if (resolved === customControlsPath) patcher = patchCustomControls;
  if (resolved === languagesPath) patcher = patchLanguages;
  if (resolved === themePath) patcher = patchTheme;
  if (resolved === cinemaPath) patcher = patchCinema;
  if (!patcher) return result;

  patchedPaths.add(resolved);
  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const next = patcher(source.replace(/\r\n?/g, "\n"));
  return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
};

console.log("[swifly-sources] CinePro source switching and persistent playback settings enabled.");
require("./start-cinepro-settings-cinema.js");
