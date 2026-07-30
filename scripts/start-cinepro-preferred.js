"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
require("dotenv").config({ path: path.join(root, ".env") });

process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "vixsrc,icefy";
process.env.CINEPRO_PROVIDER_ORDER = process.env.CINEPRO_PROVIDER_ORDER || "vixsrc,icefy";

const readFileSync = fs.readFileSync.bind(fs);
let patchedOnce = false;

fs.readFileSync = function(filePath, ...args) {
  const result = readFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patchedOnce || resolved !== serverPath) return result;

  patchedOnce = true;
  fs.readFileSync = readFileSync;

  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");
  const functionMarker = "        function startVideoJsCinemaSource(src, data) {";
  const mountMarker = `            if (playerShell) {
              playerShell.appendChild(player);
              movieButtonVidstack = player;
            }`;

  const bridge = String.raw`        function wireCineProVidstackControls(player) {
          if (!player || player.dataset.swiflyControlsBridge === "true") return;
          player.dataset.swiflyControlsBridge = "true";

          function current() {
            var value = Number(player.currentTime || 0);
            return Number.isFinite(value) && value >= 0 ? value : 0;
          }
          function windowInfo() {
            var start = Number(player.seekableStart || 0);
            var end = Number(player.seekableEnd || 0);
            var duration = Number(player.duration || 0);
            if (!Number.isFinite(start) || start < 0) start = 0;
            if (!Number.isFinite(duration) || duration <= 0) duration = end > start ? end - start : 0;
            if (!Number.isFinite(end) || end <= start) end = start + duration;
            return { start: start, end: end, duration: Math.max(0, duration), live: false, seekable: duration > 0.5 };
          }
          function seekTo(value) {
            var win = windowInfo();
            var max = win.end > win.start ? win.end - 0.15 : Number(value || 0);
            try { player.currentTime = Math.max(win.start, Math.min(max, Number(value || 0))); } catch {}
          }
          function seekBy(delta) { seekTo(current() + Number(delta || 0)); }
          function play() {
            try {
              var value = player.play && player.play();
              if (value && typeof value.catch === "function") value.catch(function(){});
            } catch {}
          }
          function pause() { try { player.pause && player.pause(); } catch {} }
          function toggle() { if (player.paused) play(); else pause(); }

          getSeekWindow = windowInfo;
          seekCustomRangeValue = function(value) {
            var win = windowInfo();
            if (!win.seekable || !seekRange) return;
            seekTo(win.start + win.duration * (Math.max(0, Math.min(1000, Number(value || 0))) / 1000));
            syncCustomSeekBar();
          };
          syncCustomSeekBar = function() {
            if (!seekRange) return;
            var win = windowInfo();
            var offset = Math.max(0, Math.min(win.duration, current() - win.start));
            var value = win.duration ? Math.round(offset / win.duration * 1000) : 0;
            if (seekDock) {
              seekDock.hidden = false;
              seekDock.classList.toggle("isDisabled", !win.seekable);
            }
            seekRange.disabled = !win.seekable;
            if (!isSeekingWithRange) seekRange.value = String(value);
            seekRange.style.setProperty("--seek-pct", String(value / 10));
            if (seekCurrent) seekCurrent.textContent = formatClock(offset);
            if (seekDuration) seekDuration.textContent = win.duration ? formatClock(win.duration) : "--:--";
            if (seekMode) seekMode.textContent = "VOD";
            if (seekLabel) seekLabel.textContent = win.seekable ? "Timeline" : "Loading timeline";
          };

          function bind(button, action) {
            if (!button) return;
            button.onclick = function(event) {
              event.preventDefault();
              event.stopPropagation();
              action();
            };
          }
          bind(bigPlayButton, toggle);
          bind(back10Button, function(){ seekBy(-10); });
          bind(forward10Button, function(){ seekBy(10); });
          bind(dockPlay, toggle);
          bind(dockBack, function(){ seekBy(-10); });
          bind(dockForward, function(){ seekBy(10); });

          function sync() {
            var paused = Boolean(player.paused);
            if (bigPlayButton) {
              var icon = bigPlayButton.querySelector("span");
              if (icon) icon.textContent = paused ? "▶" : "❚❚";
            }
            if (dockPlay) setDockButtonIcon(dockPlay, paused ? "play" : "pause");
            syncCustomSeekBar();
          }

          ["can-play", "loaded-metadata", "duration-change", "time-update", "play", "playing", "pause", "seeked"].forEach(function(name) {
            try { player.addEventListener(name, sync); } catch {}
          });

          if (playerShell && playerShell.dataset.cineproKeys !== "true") {
            playerShell.dataset.cineproKeys = "true";
            playerShell.addEventListener("keydown", function(event) {
              if (movieButtonVidstack !== player) return;
              var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
              if (tag === "input" || tag === "textarea" || tag === "select") return;
              var key = String(event.key || "").toLowerCase();
              if (key === " " || key === "k") { event.preventDefault(); event.stopImmediatePropagation(); toggle(); }
              else if (key === "arrowleft" || key === "j") { event.preventDefault(); event.stopImmediatePropagation(); seekBy(-10); }
              else if (key === "arrowright" || key === "l") { event.preventDefault(); event.stopImmediatePropagation(); seekBy(10); }
            }, true);
          }

          setInterval(sync, 350);
          setTimeout(sync, 0);
        }

`;

  if (!source.includes(functionMarker) || !source.includes(mountMarker)) {
    throw new Error("[cinepro] Could not install Vidstack controls bridge; server markers changed.");
  }

  source = source.replace(functionMarker, bridge + functionMarker);
  source = source.replace(mountMarker, `            if (playerShell) {
              playerShell.appendChild(player);
              movieButtonVidstack = player;
              wireCineProVidstackControls(player);
            }`);

  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
console.log("[cinepro] Vidstack controls now target the active player.");
require("./start-cinepro.js");
