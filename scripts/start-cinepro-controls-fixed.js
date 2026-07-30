"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-controls-fixed] Could not find ${label}; refusing to start with a partial control patch.`);
  }
  return source.replace(needle, replacement);
}

function patchCustomControls(source) {
  source = source.replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    `        function mountSwiflyControls(player, media, hlsInstance) {
          if (!playerShell || !media) return;
          var prior = playerShell.querySelector(".swiflyPlayerUi");`,
    `        function mountSwiflyControls(player, media, hlsInstance) {
          if (!playerShell || !media) return;
          var controlGeneration = Number(playerShell.__swiflyControlGeneration || 0) + 1;
          playerShell.__swiflyControlGeneration = controlGeneration;
          function controlsCurrent() {
            return playerShell.__swiflyControlGeneration === controlGeneration && !!(ui && ui.isConnected);
          }
          var prior = playerShell.querySelector(".swiflyPlayerUi");`,
    "control generation guard",
  );

  source = replaceRequired(
    source,
    `          function show(sticky) {
            ui.classList.add("show");`,
    `          function show(sticky) {
            if (!controlsCurrent()) return;
            ui.classList.add("show");`,
    "control visibility guard",
  );

  source = replaceRequired(
    source,
    `          function sync() {
            var playing = !media.paused && !media.ended;`,
    `          function sync() {
            if (!controlsCurrent()) return;
            var playing = !media.paused && !media.ended;`,
    "control synchronization guard",
  );

  source = replaceRequired(
    source,
    `            var duration = Number(media.duration || 0);
            var current = Number(media.currentTime || 0);`,
    `            var rawDuration = Number(media.duration);
            var duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
            var rawCurrent = Number(media.currentTime);
            var current = Number.isFinite(rawCurrent) ? Math.max(0, rawCurrent) : 0;
            if (duration) current = Math.min(duration, current);`,
    "finite playback timing",
  );

  source = replaceRequired(
    source,
    `              var played = duration ? current / duration * 100 : 0;`,
    `              var played = duration ? Math.min(100, Math.max(0, current / duration * 100)) : 0;`,
    "clamped played progress",
  );

  source = replaceRequired(
    source,
    `              progress.style.setProperty("--b", Math.max(played, buffered) + "%");`,
    `              buffered = Math.min(100, Math.max(played, Number.isFinite(buffered) ? buffered : played));
              progress.style.setProperty("--b", buffered + "%");`,
    "clamped buffered progress",
  );

  source = replaceRequired(
    source,
    `          function fillSettings() {
            quality.innerHTML = '<option value="-1">Auto</option>';
            var seen = {};
            (hlsInstance && hlsInstance.levels || []).forEach(function(level, index){`,
    `          function fillSettings() {
            if (!controlsCurrent()) return;
            var levels = Array.isArray(hlsInstance && hlsInstance.levels) ? hlsInstance.levels : [];
            quality.innerHTML = '<option value="-1">Auto</option>';
            quality.disabled = levels.length === 0;
            var seen = {};
            levels.forEach(function(level, index){`,
    "direct-upload quality handling",
  );

  source = replaceRequired(
    source,
    `          function leaveWatchPage() {`,
    `          function toggleFullscreen() {
            try {
              if (player && player.fullscreen && typeof player.fullscreen.toggle === "function") {
                player.fullscreen.toggle();
                return;
              }
            } catch {}
            try {
              if (document.fullscreenElement) document.exitFullscreen();
              else playerShell.requestFullscreen();
            } catch {}
          }

          function syncFullscreen() {
            if (!controlsCurrent()) return;
            var button = ui.querySelector('[data-a="fullscreen"]');
            var icon = button && button.querySelector("i");
            var active = Boolean(document.fullscreenElement === playerShell || (player && player.fullscreen && player.fullscreen.active));
            if (button) button.setAttribute("aria-label", active ? "Exit fullscreen" : "Fullscreen");
            if (icon) icon.className = active ? "fa-solid fa-compress" : "fa-solid fa-expand";
          }

          function toggleCaptions() {
            var tracks = Array.from(media.textTracks || []);
            var active = tracks.findIndex(function(track){ return track.mode === "showing"; });
            tracks.forEach(function(track){ track.mode = "disabled"; });
            if (active < 0 && tracks[0]) tracks[0].mode = "showing";
          }

          function leaveWatchPage() {`,
    "fullscreen and caption helpers",
  );

  source = replaceRequired(
    source,
    `            if (action === "fullscreen") {
              try {
                player.fullscreen.toggle();
              } catch {
                try { playerShell.requestFullscreen(); } catch {}
              }
            }`,
    `            if (action === "fullscreen") toggleFullscreen();`,
    "fullscreen action",
  );

  source = replaceRequired(
    source,
    `            if (action === "cc") {
              var tracks = Array.from(media.textTracks || []);
              var active = tracks.findIndex(function(track){ return track.mode === "showing"; });
              tracks.forEach(function(track){ track.mode = "disabled"; });
              if (active < 0 && tracks[0]) tracks[0].mode = "showing";
            }`,
    `            if (action === "cc") toggleCaptions();`,
    "caption action",
  );

  source = replaceRequired(
    source,
    `          progress.addEventListener("pointerdown", function(){ scrubbing = true; show(true); });
          progress.addEventListener("input", function(){
            var percent = Number(progress.value || 0) / 10;
            progress.style.setProperty("--p", percent + "%");
            now.textContent = clock(Number(media.duration || 0) * percent / 100);
          });
          progress.addEventListener("change", function(){
            if (media.duration) media.currentTime = media.duration * Number(progress.value || 0) / 1000;
            scrubbing = false;
            sync();
            show(false);
          });`,
    `          function previewScrub() {
            if (!controlsCurrent()) return;
            scrubbing = true;
            var percent = Math.min(100, Math.max(0, Number(progress.value || 0) / 10));
            progress.style.setProperty("--p", percent + "%");
            var duration = Number(media.duration);
            now.textContent = clock(Number.isFinite(duration) && duration > 0 ? duration * percent / 100 : 0);
            show(true);
          }
          function commitScrub() {
            if (!controlsCurrent()) return;
            var duration = Number(media.duration);
            if (Number.isFinite(duration) && duration > 0) {
              media.currentTime = duration * Math.min(1000, Math.max(0, Number(progress.value || 0))) / 1000;
            }
            scrubbing = false;
            sync();
            show(false);
          }
          progress.addEventListener("pointerdown", function(event){
            scrubbing = true;
            try { progress.setPointerCapture(event.pointerId); } catch {}
            show(true);
          });
          progress.addEventListener("input", previewScrub);
          progress.addEventListener("pointerup", commitScrub);
          progress.addEventListener("pointercancel", commitScrub);
          progress.addEventListener("change", commitScrub);
          progress.addEventListener("blur", commitScrub);`,
    "reliable seek lifecycle",
  );

  source = replaceRequired(
    source,
    `          document.addEventListener("click", function(event){
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {`,
    `          document.addEventListener("click", function(event){
            if (!controlsCurrent()) return;
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {`,
    "stale document click guard",
  );

  source = replaceRequired(
    source,
    `          document.addEventListener("click", function(event){
            if (!controlsCurrent()) return;
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {
              menu.hidden = true;
              ui.classList.remove("menuOpen");
              show(false);
            }
          });

          fillSettings();`,
    `          document.addEventListener("click", function(event){
            if (!controlsCurrent()) return;
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {
              menu.hidden = true;
              ui.classList.remove("menuOpen");
              show(false);
            }
          });
          document.addEventListener("fullscreenchange", syncFullscreen);
          document.addEventListener("keydown", function(event){
            if (!controlsCurrent() || event.altKey || event.ctrlKey || event.metaKey) return;
            var target = event.target;
            var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
            if (target && (target.isContentEditable || tag === "input" || tag === "select" || tag === "textarea" || tag === "button")) return;
            var key = String(event.key || "").toLowerCase();
            var handled = true;
            if (key === " " || key === "k") togglePlay();
            else if (key === "arrowleft") media.currentTime = Math.max(0, media.currentTime - 5);
            else if (key === "arrowright") media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 5);
            else if (key === "j") media.currentTime = Math.max(0, media.currentTime - 10);
            else if (key === "l") media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 10);
            else if (key === "m") media.muted = !media.muted;
            else if (key === "f") toggleFullscreen();
            else if (key === "c") toggleCaptions();
            else handled = false;
            if (!handled) return;
            event.preventDefault();
            sync();
            show(false);
          });

          fillSettings();`,
    "keyboard and fullscreen synchronization",
  );

  source = replaceRequired(
    source,
    `          fillSettings();
          sync();
          show(true);`,
    `          fillSettings();
          sync();
          syncFullscreen();
          show(true);`,
    "initial fullscreen synchronization",
  );

  return source;
}

function installPatch() {
  fs.readFileSync = function swiflyControlsFixedRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== customControlsPath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchCustomControls(source);
    console.log("[swifly-controls-fixed] Reliable seek, remount, keyboard, fullscreen, and upload controls injected.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = { patchCustomControls };

if (require.main === module) {
  installPatch();
  require("./start-cinepro-settings-cinema.js");
}
