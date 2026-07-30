"use strict";

const fs = require("fs");
const path = require("path");
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
      throw new Error(`[swifly-stream-options] Could not find ${label}; refusing to start with a partial patch.`);
    }
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) {
    throw new Error(`[swifly-stream-options] Could not find ${label}; refusing to start with a partial patch.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
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

  return source;
}

function patchCustomControls(source) {
  source = patchCustomControlsCompatible(source.replace(/\r\n?/g, "\n"));

  source = replaceRequired(
    source,
    /<select data-s="speed">[\s\S]*?<\/select>/,
    '<select data-s="speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option><option value="4">4×</option></select>',
    "complete speed option list",
  );

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
  source = patchLanguagesCompatible(source.replace(/\r\n?/g, "\n"));

  source = replaceRequired(
    source,
    `'<label class="swiflyUiField"><span>Speed</span><select data-s="speed">$1</select></label><label class="swiflyUiField"><span>Audio</span><select data-s="audio"><option value="default">Default</option></select></label><label class="swiflyUiField"><span>Captions</span><select data-s="cc"><option value="off">Off</option></select></label>',`,
    `'<label class="swiflyUiField"><span>Source</span><select data-s="source"><option value="current">Current source</option></select></label><label class="swiflyUiField"><span>Speed</span><select data-s="speed">$1</select></label><label class="swiflyUiField"><span>Audio</span><select data-s="audio"><option value="default">Default</option></select></label><label class="swiflyUiField"><span>Captions</span><select data-s="cc"><option value="off">Off</option></select></label>',`,
    "source setting markup",
  );

  source = replaceRequired(
    source,
    `var audio = ui.querySelector('[data-s="audio"]');
          var cc = ui.querySelector('[data-s="cc"]');`,
    `var source = ui.querySelector('[data-s="source"]');
          var audio = ui.querySelector('[data-s="audio"]');
          var cc = ui.querySelector('[data-s="cc"]');`,
    "source setting control reference",
  );

  source = replaceRequired(
    source,
    `          function externalCaptionTracks() {
            return Array.from(media.querySelectorAll("track[data-cinepro-track]")).map(function(element) {
              return {
                element: element,
                track: element.track,
                language: element.srclang || (element.track && element.track.language) || "",
                label: element.label || (element.track && element.track.label) || ""
              };
            }).filter(function(item) { return item.track; });
          }`,
    `          function nativeCaptionTracks() {
            return Array.from(media.textTracks || []).map(function(track, index) {
              return {
                track: track,
                index: index,
                language: String(track && track.language || ""),
                label: String(track && track.label || ""),
                kind: String(track && track.kind || "")
              };
            }).filter(function(item) {
              return item.track && (!item.kind || item.kind === "subtitles" || item.kind === "captions");
            });
          }`,
    "live native caption track discovery",
  );

  source = replaceRequired(
    source,
    /          function activeCaptionValue\(\) \{[\s\S]*?\n          \}\n\n          function setCaptionSelection/,
    `          function activeCaptionValue() {
            try {
              if (hlsInstance && hlsInstance.subtitleDisplay !== false && Number.isInteger(hlsInstance.subtitleTrack) && hlsInstance.subtitleTrack >= 0) {
                return "hls:" + hlsInstance.subtitleTrack;
              }
            } catch {}
            var nativeTracks = nativeCaptionTracks();
            var activeNative = nativeTracks.findIndex(function(item) { return item.track.mode === "showing"; });
            return activeNative >= 0 ? "text:" + nativeTracks[activeNative].index : "off";
          }

          function setCaptionSelection`,
    "caption active-state detection",
  );

  source = replaceRequired(
    source,
    /          function setCaptionSelection\(value\) \{[\s\S]*?\n          \}\n\n          function fillAudioLanguages/,
    `          function setCaptionSelection(value) {
            value = String(value || "off");
            nativeCaptionTracks().forEach(function(item) { try { item.track.mode = "disabled"; } catch {} });
            try {
              if (hlsInstance) {
                hlsInstance.subtitleTrack = -1;
                hlsInstance.subtitleDisplay = false;
              }
            } catch {}

            if (value.indexOf("hls:") === 0) {
              var hlsIndex = Number(value.slice(4));
              try {
                hlsInstance.subtitleDisplay = true;
                hlsInstance.subtitleTrack = hlsIndex;
              } catch {}
              lastCaptionSelection = value;
            } else if (value.indexOf("text:") === 0) {
              var nativeIndex = Number(value.slice(5));
              var item = nativeCaptionTracks().find(function(entry) { return entry.index === nativeIndex; });
              if (item && item.track) {
                try { item.track.mode = "showing"; } catch {}
                lastCaptionSelection = value;
              }
            }

            var activeValue = activeCaptionValue();
            cc.value = Array.from(cc.options || []).some(function(option) { return option.value === activeValue; }) ? activeValue : value;
            sync();
          }

          function fillAudioLanguages`,
    "caption selection behavior",
  );

  source = replaceRequired(
    source,
    /          function fillCaptionLanguages\(\) \{[\s\S]*?\n          \}\n\n`/,
    `          function fillCaptionLanguages() {
            if (!cc) return;
            var selected = activeCaptionValue();
            var hlsTracks = hlsCaptionTracks();
            var nativeTracks = nativeCaptionTracks();
            var seen = {};
            cc.innerHTML = "";

            var off = document.createElement("option");
            off.value = "off";
            off.textContent = "Off";
            cc.appendChild(off);

            hlsTracks.forEach(function(track, index) {
              var label = languageLabel(
                track && (track.lang || track.language || (track.attrs && track.attrs.LANGUAGE)),
                track && (track.name || track.label || (track.attrs && track.attrs.NAME))
              );
              var key = ("hls:" + label).toLowerCase();
              if (seen[key]) return;
              seen[key] = true;
              var option = document.createElement("option");
              option.value = "hls:" + index;
              option.textContent = label;
              cc.appendChild(option);
            });

            nativeTracks.forEach(function(item) {
              var label = languageLabel(item.language, item.label);
              var key = label.toLowerCase();
              if (seen["hls:" + key] || seen["text:" + key]) return;
              seen["text:" + key] = true;
              var option = document.createElement("option");
              option.value = "text:" + item.index;
              option.textContent = label;
              cc.appendChild(option);
            });

            var hasCaptions = cc.options.length > 1;
            cc.disabled = !hasCaptions;
            ccButton.disabled = !hasCaptions;
            ccButton.setAttribute("aria-label", hasCaptions ? "Captions and language" : "Captions unavailable");
            ccButton.classList.toggle("unavailable", !hasCaptions);
            cc.value = Array.from(cc.options).some(function(option) { return option.value === selected; }) ? selected : "off";
          }

`,
    "complete live caption population",
  );

  source = replaceRequired(
    source,
    `          var lastCaptionSelection = "off";
`,
    `          var lastCaptionSelection = "off";
          var activeSourceData = typeof sourceData === "object" && sourceData ? sourceData : {};

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

          function qualityLabel(level, index) {
            var height = Number(level && level.height || 0);
            var width = Number(level && level.width || 0);
            var bitrate = Number(level && (level.averageBitrate || level.bitrate) || 0);
            var codec = String(level && (level.videoCodec || level.codecSet || "") || "").split(",")[0].trim();
            var label = height ? height + "p" : (width ? width + "px" : "Quality " + (index + 1));
            if (bitrate > 0) label += bitrate >= 1000000 ? " · " + (bitrate / 1000000).toFixed(bitrate >= 10000000 ? 0 : 1) + " Mbps" : " · " + Math.round(bitrate / 1000) + " kbps";
            if (codec) label += " · " + codec;
            return label;
          }

          function fillQualityOptions() {
            if (!quality) return;
            var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];
            var selectedLevel = Number(hlsInstance && hlsInstance.currentLevel);
            quality.innerHTML = '<option value="-1">Auto</option>';
            levels.forEach(function(level, index) {
              var option = document.createElement("option");
              option.value = String(index);
              option.textContent = qualityLabel(level, index);
              quality.appendChild(option);
            });
            quality.disabled = levels.length === 0;
            quality.value = Number.isInteger(selectedLevel) && selectedLevel >= 0 ? String(selectedLevel) : "-1";
          }

          function syncQualitySelection() {
            if (!quality || !hlsInstance) return;
            var currentLevel = Number(hlsInstance.currentLevel);
            quality.value = Number.isInteger(currentLevel) && currentLevel >= 0 ? String(currentLevel) : "-1";
          }

          function syncSpeedSelection() {
            if (!speed) return;
            var currentRate = String(Number(media.playbackRate || 1));
            if (Array.from(speed.options || []).some(function(option) { return String(Number(option.value)) === currentRate; })) {
              speed.value = currentRate;
            }
          }
`,
    "source, quality, and speed helpers",
  );

  source = replaceRequired(
    source,
    /`function fillSettings\(\) \{[\s\S]*?\n          \}\n\n          function togglePlay`/,
    `\`function fillSettings() {
            if (!controlsCurrent()) return;
            fillSourceOptions();
            fillQualityOptions();
            syncSpeedSelection();
            fillAudioLanguages();
            fillCaptionLanguages();
          }

          function togglePlay\``,
    "complete settings population",
  );

  source = replaceRequired(
    source,
    /`quality\.addEventListener\("change", function\(\)\{[\s\S]*?\n          \}\);\n          audio\.addEventListener/,
    `\`if (source) {
            source.addEventListener("change", function(){
              switchCineProSource(source.value);
            });
          }
          quality.addEventListener("change", function(){
            if (hlsInstance) hlsInstance.currentLevel = Number(quality.value);
            syncQualitySelection();
          });
          audio.addEventListener`,
    "source and quality change handlers",
  );

  source = replaceRequired(
    source,
    /`media\.addEventListener\("loadedmetadata", function\(\)\{ fillSettings\(\); sync\(\); \}\);[\s\S]*?setTimeout\(function\(\)\{ fillAudioLanguages\(\); fillCaptionLanguages\(\); \}, 1200\);`/,
    `\`media.addEventListener("loadedmetadata", function(){ fillSettings(); sync(); });
          media.addEventListener("loadeddata", function(){ fillSettings(); sync(); });
          media.addEventListener("ratechange", function(){ syncSpeedSelection(); });
          if (media.textTracks && media.textTracks.addEventListener) {
            media.textTracks.addEventListener("addtrack", fillCaptionLanguages);
            media.textTracks.addEventListener("removetrack", fillCaptionLanguages);
            media.textTracks.addEventListener("change", function(){ fillCaptionLanguages(); sync(); });
          }
          try {
            if (hlsInstance && window.Hls && window.Hls.Events) {
              var hlsEvents = window.Hls.Events;
              if (hlsEvents.MANIFEST_PARSED) hlsInstance.on(hlsEvents.MANIFEST_PARSED, function(){ fillQualityOptions(); fillAudioLanguages(); fillCaptionLanguages(); });
              if (hlsEvents.LEVELS_UPDATED) hlsInstance.on(hlsEvents.LEVELS_UPDATED, fillQualityOptions);
              if (hlsEvents.LEVEL_SWITCHED) hlsInstance.on(hlsEvents.LEVEL_SWITCHED, syncQualitySelection);
              if (hlsEvents.AUDIO_TRACKS_UPDATED) hlsInstance.on(hlsEvents.AUDIO_TRACKS_UPDATED, fillAudioLanguages);
              if (hlsEvents.AUDIO_TRACK_SWITCHED) hlsInstance.on(hlsEvents.AUDIO_TRACK_SWITCHED, fillAudioLanguages);
              if (hlsEvents.SUBTITLE_TRACKS_UPDATED) hlsInstance.on(hlsEvents.SUBTITLE_TRACKS_UPDATED, fillCaptionLanguages);
              if (hlsEvents.SUBTITLE_TRACK_SWITCH) hlsInstance.on(hlsEvents.SUBTITLE_TRACK_SWITCH, function(){ fillCaptionLanguages(); sync(); });
              if (hlsEvents.NON_NATIVE_TEXT_TRACKS_FOUND) hlsInstance.on(hlsEvents.NON_NATIVE_TEXT_TRACKS_FOUND, fillCaptionLanguages);
              if (hlsEvents.CUES_PARSED) hlsInstance.on(hlsEvents.CUES_PARSED, fillCaptionLanguages);
            }
          } catch {}
          setTimeout(fillSettings, 150);
          setTimeout(fillSettings, 650);
          setTimeout(fillSettings, 1600);\``,
    "live quality, speed, and caption listeners",
  );

  return source;
}

function patchTheme(source) {
  source = source.replace(/\r\n?/g, "\n");
  return replaceRequired(
    source,
    /(var definitions = \[\n\s*)\{ key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" \},/,
    `$1{ key: "source", label: "Source", hint: "Playback provider", icon: "fa-tower-broadcast" },
             { key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" },`,
    "source setting definition",
  );
}

function patchCinema(source) {
  source = source.replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    "max-width:calc(100% - 64px)!important;max-height:min(46vh,310px)!important",
    "width:min(680px,calc(100% - 24px))!important;max-width:calc(100% - 24px)!important;max-height:min(64vh,430px)!important",
    "expanded floating settings width",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingsList{display:flex!important;width:max-content!important;max-width:100%!important;align-items:center!important;justify-content:flex-end!important;gap:2px!important;margin:0!important;padding:0!important;border:0!important;border-radius:10px!important;overflow-x:auto!important;overflow-y:hidden!important;background:transparent!important;box-shadow:none!important;scrollbar-width:none!important}",
    "body.swifly-command-settings .swiflySettingsList{display:grid!important;grid-template-columns:repeat(5,minmax(96px,1fr))!important;width:min(640px,100%)!important;max-width:100%!important;align-items:stretch!important;gap:3px!important;margin:0!important;padding:0!important;border:0!important;border-radius:10px!important;overflow:visible!important;background:transparent!important;box-shadow:none!important}",
    "five-setting grid layout",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingRow{flex:0 0 auto!important;width:auto!important;min-width:98px!important;max-width:152px!important;min-height:31px!important",
    "body.swifly-command-settings .swiflySettingRow{width:100%!important;min-width:0!important;max-width:none!important;min-height:34px!important",
    "compact setting cards",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingRow.isDisabled{display:none!important}",
    "body.swifly-command-settings .swiflySettingRow.isDisabled{display:grid!important;opacity:.42!important;cursor:not-allowed!important;filter:saturate(.45)!important}body.swifly-command-settings .swiflySettingRow.isDisabled:hover{background:transparent!important;transform:none!important}",
    "visible unavailable settings",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingsDetail{max-width:min(700px,calc(100vw - 86px))!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;padding:0!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}",
    "body.swifly-command-settings .swiflySettingsDetail{width:min(620px,calc(100vw - 56px))!important;max-width:100%!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:6px!important;padding:2px!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}",
    "unclipped setting detail panel",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflySettingsChoices{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}",
    "body.swifly-command-settings .swiflySettingsChoices{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(92px,1fr))!important;align-items:stretch!important;gap:4px!important;width:100%!important;margin:0!important;padding:0!important;max-width:100%!important;max-height:300px!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-width:thin!important}",
    "all option choices grid",
  );

  source = replaceRequired(
    source,
    "body.swifly-command-settings .swiflyChoice{flex:0 0 auto!important;min-width:62px!important;min-height:30px!important",
    "body.swifly-command-settings .swiflyChoice{width:100%!important;min-width:0!important;min-height:34px!important",
    "full-width option choices",
  );

  source = source.replace(
    /@media\(max-width:760px\)\{[^\n]*\}/,
    '@media(max-width:760px){body.swifly-command-settings .swiflyUiMenu{inset:auto 8px 52px 8px!important;width:auto!important;max-width:none!important}body.swifly-command-settings .swiflySettingsShell,body.swifly-command-settings .swiflySettingsHome,body.swifly-command-settings .swiflySettingsDetail{width:100%!important;max-width:100%!important}body.swifly-command-settings .swiflySettingsList{grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important}body.swifly-command-settings .swiflySettingsChoices{grid-template-columns:repeat(2,minmax(0,1fr))!important}body.swifly-command-settings .swiflySettingRow{min-width:0!important;max-width:none!important}}',
  );

  source = replaceRequired(
    source,
    "console.log(\"[swifly-cinema-settings] Compact floating playback tray mounted.\");",
    "console.log(\"[swifly-cinema-settings] Complete Source, quality, speed, audio, and caption tray mounted.\");",
    "settings mount log",
  );

  source = replaceRequired(
    source,
    "console.log(\"[swifly-cinema-settings] Compact floating settings tray injected into the working Aurora control deck.\");",
    "console.log(\"[swifly-cinema-settings] Complete stream settings tray injected into the working Aurora control deck.\");",
    "settings injection log",
  );

  return source;
}

function installPatch() {
  fs.readFileSync = function swiflyStreamOptionsRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patchedPaths.has(resolved)) return result;

    let patcher = null;
    let label = "";
    if (resolved === cineproClientPath) { patcher = patchCineProClient; label = "CinePro sources"; }
    if (resolved === customControlsPath) { patcher = patchCustomControls; label = "controls"; }
    if (resolved === languagesPath) { patcher = patchLanguages; label = "quality, speed, and captions"; }
    if (resolved === themePath) { patcher = patchTheme; label = "settings theme"; }
    if (resolved === cinemaPath) { patcher = patchCinema; label = "settings layout"; }
    if (!patcher) return result;

    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patcher(source);
    patchedPaths.add(resolved);
    console.log(`[swifly-stream-options] ${label} patch ready.`);
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  patchCineProClient,
  patchCustomControls,
  patchLanguages,
  patchTheme,
  patchCinema,
};

if (require.main === module) {
  installPatch();
  console.log("[swifly-stream-options] Complete quality, speed, captions, and Source settings enabled.");
  require("./start-cinepro-settings-cinema.js");
}
