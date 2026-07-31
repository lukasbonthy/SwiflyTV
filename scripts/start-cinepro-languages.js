"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const compactPath = path.join(root, "scripts", "start-cinepro-compact.js");
const cineproClientPath = path.join(root, "cinepro-client.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-languages] Could not find ${label}; source was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchCustomControls(source) {
  source = replaceRequired(
    source,
    /<label class="swiflyUiField"><span>Speed<\/span><select data-s="speed">([\s\S]*?)<\/select><\/label><label class="swiflyUiField"><span>Subtitles<\/span><select data-s="cc"><option value="-1">Off<\/option><\/select><\/label>/,
    '<label class="swiflyUiField"><span>Speed</span><select data-s="speed">$1</select></label><label class="swiflyUiField"><span>Audio</span><select data-s="audio"><option value="default">Default</option></select></label><label class="swiflyUiField"><span>Captions</span><select data-s="cc"><option value="off">Off</option></select></label>',
    "language setting markup",
  );

  source = replaceRequired(
    source,
    /var cc = ui\.querySelector\('\[data-s="cc"\]'\);\n\s*var ccButton = ui\.querySelector\('\[data-a="cc"\]'\);/,
    `var audio = ui.querySelector('[data-s="audio"]');
          var cc = ui.querySelector('[data-s="cc"]');
          var ccButton = ui.querySelector('[data-a="cc"]');`,
    "language controls",
  );

  source = replaceRequired(
    source,
    /var scrubbing = false;\n/,
    `var scrubbing = false;
          var lastCaptionSelection = "off";

          function languageLabel(code, fallback) {
            var rawCode = String(code || "").trim().replace(/_/g, "-");
            var rawFallback = String(fallback || "").trim();
            var display = "";
            try {
              if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(rawCode) && window.Intl && Intl.DisplayNames) {
                display = new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(rawCode) || "";
              }
            } catch {}
            if (display && rawFallback && display.toLowerCase() !== rawFallback.toLowerCase()) {
              return display + " · " + rawFallback;
            }
            return display || rawFallback || rawCode || "Unknown";
          }

          function hlsAudioTracks() {
            return Array.isArray(hlsInstance && hlsInstance.audioTracks) ? hlsInstance.audioTracks : [];
          }

          function hlsCaptionTracks() {
            return Array.isArray(hlsInstance && hlsInstance.subtitleTracks) ? hlsInstance.subtitleTracks : [];
          }

          function externalCaptionTracks() {
            return Array.from(media.querySelectorAll("track[data-cinepro-track]")).map(function(element) {
              return {
                element: element,
                track: element.track,
                language: element.srclang || (element.track && element.track.language) || "",
                label: element.label || (element.track && element.track.label) || ""
              };
            }).filter(function(item) { return item.track; });
          }

          function activeCaptionValue() {
            try {
              if (hlsInstance && Number.isInteger(hlsInstance.subtitleTrack) && hlsInstance.subtitleTrack >= 0) {
                return "hls:" + hlsInstance.subtitleTrack;
              }
            } catch {}
            var external = externalCaptionTracks();
            var activeExternal = external.findIndex(function(item) { return item.track.mode === "showing"; });
            return activeExternal >= 0 ? "text:" + activeExternal : "off";
          }

          function setCaptionSelection(value) {
            value = String(value || "off");
            externalCaptionTracks().forEach(function(item) { item.track.mode = "disabled"; });
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
              var textIndex = Number(value.slice(5));
              var item = externalCaptionTracks()[textIndex];
              if (item && item.track) {
                item.track.mode = "showing";
                lastCaptionSelection = value;
              }
            }

            cc.value = activeCaptionValue();
            sync();
          }

          function fillAudioLanguages() {
            if (!audio) return;
            var tracks = hlsAudioTracks();
            var current = Number(hlsInstance && hlsInstance.audioTrack);
            audio.innerHTML = "";
            if (!tracks.length) {
              var defaultOption = document.createElement("option");
              defaultOption.value = "default";
              defaultOption.textContent = "Default audio";
              audio.appendChild(defaultOption);
              audio.disabled = true;
              return;
            }
            audio.disabled = false;
            tracks.forEach(function(track, index) {
              var option = document.createElement("option");
              option.value = String(index);
              option.textContent = languageLabel(
                track && (track.lang || track.language || (track.attrs && track.attrs.LANGUAGE)),
                track && (track.name || track.label || (track.attrs && track.attrs.NAME))
              );
              audio.appendChild(option);
            });
            audio.value = String(Number.isInteger(current) && current >= 0 ? current : 0);
          }

          function fillCaptionLanguages() {
            if (!cc) return;
            var selected = activeCaptionValue();
            var hlsTracks = hlsCaptionTracks();
            var externalTracks = externalCaptionTracks();
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
              var key = label.toLowerCase();
              if (seen[key]) return;
              seen[key] = true;
              var option = document.createElement("option");
              option.value = "hls:" + index;
              option.textContent = label;
              cc.appendChild(option);
            });

            externalTracks.forEach(function(item, index) {
              var label = languageLabel(item.language, item.label);
              var key = label.toLowerCase();
              if (seen[key]) return;
              seen[key] = true;
              var option = document.createElement("option");
              option.value = "text:" + index;
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
    "caption language helpers",
  );

  source = replaceRequired(
    source,
    /function fillSettings\(\) \{[\s\S]*?\n          \}\n\n          function togglePlay/,
    `function fillSettings() {
            quality.innerHTML = '<option value="-1">Auto</option>';
            var seenQuality = {};
            (hlsInstance && hlsInstance.levels || []).forEach(function(level, index){
              var height = Number(level && level.height || 0);
              if (!height || seenQuality[height]) return;
              seenQuality[height] = true;
              var option = document.createElement("option");
              option.value = String(index);
              option.textContent = height + "p";
              quality.appendChild(option);
            });
            fillAudioLanguages();
            fillCaptionLanguages();
          }

          function togglePlay`,
    "settings population",
  );

  source = replaceRequired(
    source,
    /if \(action === "cc"\) \{[\s\S]*?\n            \}/,
    `if (action === "cc") {
              var activeCaption = activeCaptionValue();
              if (activeCaption === "off") {
                var candidate = Array.from(cc.options).some(function(option) { return option.value === lastCaptionSelection; })
                  ? lastCaptionSelection
                  : (cc.options[1] ? cc.options[1].value : "off");
                setCaptionSelection(candidate);
              } else {
                lastCaptionSelection = activeCaption;
                setCaptionSelection("off");
              }
            }`,
    "caption button handler",
  );

  source = replaceRequired(
    source,
    /quality\.addEventListener\("change", function\(\)\{\n\s*if \(hlsInstance\) hlsInstance\.currentLevel = Number\(quality\.value\);\n\s*\}\);\n\s*speed\.addEventListener/,
    `quality.addEventListener("change", function(){
            if (hlsInstance) hlsInstance.currentLevel = Number(quality.value);
          });
          audio.addEventListener("change", function(){
            if (hlsInstance && audio.value !== "default") hlsInstance.audioTrack = Number(audio.value);
          });
          speed.addEventListener`,
    "audio language handler",
  );

  source = replaceRequired(
    source,
    /cc\.addEventListener\("change", function\(\)\{[\s\S]*?\n\s*\}\);/,
    `cc.addEventListener("change", function(){
            setCaptionSelection(cc.value);
          });`,
    "caption language handler",
  );

  source = replaceRequired(
    source,
    /media\.addEventListener\("loadedmetadata", function\(\)\{ fillSettings\(\); sync\(\); \}\);/,
    `media.addEventListener("loadedmetadata", function(){ fillSettings(); sync(); });
          if (media.textTracks && media.textTracks.addEventListener) {
            media.textTracks.addEventListener("addtrack", fillCaptionLanguages);
            media.textTracks.addEventListener("removetrack", fillCaptionLanguages);
            media.textTracks.addEventListener("change", function(){ fillCaptionLanguages(); sync(); });
          }
          try {
            if (hlsInstance && window.Hls && window.Hls.Events) {
              var hlsEvents = window.Hls.Events;
              if (hlsEvents.MANIFEST_PARSED) hlsInstance.on(hlsEvents.MANIFEST_PARSED, function(){ fillAudioLanguages(); fillCaptionLanguages(); });
              if (hlsEvents.AUDIO_TRACKS_UPDATED) hlsInstance.on(hlsEvents.AUDIO_TRACKS_UPDATED, fillAudioLanguages);
              if (hlsEvents.AUDIO_TRACK_SWITCHED) hlsInstance.on(hlsEvents.AUDIO_TRACK_SWITCHED, fillAudioLanguages);
              if (hlsEvents.SUBTITLE_TRACKS_UPDATED) hlsInstance.on(hlsEvents.SUBTITLE_TRACKS_UPDATED, fillCaptionLanguages);
              if (hlsEvents.SUBTITLE_TRACK_SWITCH) hlsInstance.on(hlsEvents.SUBTITLE_TRACK_SWITCH, function(){ fillCaptionLanguages(); sync(); });
            }
          } catch {}
          setTimeout(function(){ fillAudioLanguages(); fillCaptionLanguages(); }, 250);
          setTimeout(function(){ fillAudioLanguages(); fillCaptionLanguages(); }, 1200);`,
    "live track listeners",
  );

  source = replaceRequired(
    source,
    /\.swiflyUiCc\.active\{color:#e50914\}/,
    `.swiflyUiCc.active{color:#e50914}.swiflyUiCc.unavailable{opacity:.35;cursor:not-allowed}.swiflyUiField select:disabled{opacity:.55;cursor:not-allowed}`,
    "caption availability styling",
  );

  return source;
}

function patchCompact(source) {
  return replaceRequired(
    source,
    /if \(key === "speed"\) iconClass = "fa-solid fa-gauge-high";\n\s*if \(key === "cc"\) iconClass = "fa-solid fa-closed-captioning";/,
    `if (key === "speed") iconClass = "fa-solid fa-gauge-high";
               if (key === "audio") iconClass = "fa-solid fa-language";
               if (key === "cc") iconClass = "fa-solid fa-closed-captioning";`,
    "language option icons",
  );
}

function patchCineProClient(source) {
  const normalizedProperty =
    "language: clean(subtitle && (subtitle.language || subtitle.lang || subtitle.srclang)) || clean(subtitle && subtitle.label),";
  const normalizedVariable =
    "const language = clean(subtitle && (subtitle.language || subtitle.lang || subtitle.srclang));";

  if (source.includes(normalizedProperty) || source.includes(normalizedVariable)) return source;

  return replaceRequired(
    source,
    /language:\s*clean\(subtitle && subtitle\.language\),/,
    normalizedProperty,
    "subtitle language normalization",
  );
}

fs.readFileSync = function swiflyLanguagesRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patchedPaths.has(resolved)) return result;

  let patcher = null;
  if (resolved === customControlsPath) patcher = patchCustomControls;
  if (resolved === compactPath) patcher = patchCompact;
  if (resolved === cineproClientPath) patcher = patchCineProClient;
  if (!patcher) return result;

  patchedPaths.add(resolved);
  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const next = patcher(source.replace(/\r\n?/g, "\n"));
  return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
};

console.log("[swifly-languages] Live audio and caption language selectors enabled.");
require("./start-cinepro-compact.js");
