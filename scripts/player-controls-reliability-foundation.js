"use strict";

function required(source, find, replacement, label) {
  const found = typeof find === "string" ? source.includes(find) : find.test(source);
  if (!found) throw new Error(`[swifly-controls] Missing ${label}; refusing a partial patch.`);
  if (find instanceof RegExp) find.lastIndex = 0;
  return source.replace(find, replacement);
}

function patchFoundation(source) {
  source = required(source,
    /if \(!playerShell \|\| !media\) return;\n\s*var prior = playerShell\.querySelector\("\.swiflyPlayerUi"\);\n\s*if \(prior\) prior\.remove\(\);/,
    `if (!playerShell || !media) return;
          if (typeof playerShell.__swiflyControlCleanup === "function") {
            try { playerShell.__swiflyControlCleanup(); } catch {}
          }
          var prior = playerShell.querySelector(".swiflyPlayerUi");
          if (prior) prior.remove();`,
    "player cleanup anchor");

  source = required(source,
    `          var hideTimer = null;
          var scrubbing = false;
`,
    `          var hideTimer = null;
          var scrubbing = false;
          var dead = false;
          var cleanup = [];
          var generation = Number(playerShell.__swiflyControlGeneration || 0) + 1;
          playerShell.__swiflyControlGeneration = generation;

          function alive() {
            return !dead && ui.isConnected && playerShell.__swiflyControlGeneration === generation;
          }
          function clamp(value, min, max) {
            value = Number(value);
            return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
          }
          function safeDuration() {
            var value = Number(media.duration);
            return Number.isFinite(value) && value > 0 ? value : 0;
          }
          function safeSeek(value) {
            var total = safeDuration();
            if (!total) return;
            try { media.currentTime = clamp(value, 0, Math.max(0, total - .05)); } catch {}
          }
          function fullscreenActive() {
            try { if (player.fullscreen && typeof player.fullscreen.active === "boolean") return player.fullscreen.active; } catch {}
            var element = document.fullscreenElement || document.webkitFullscreenElement;
            return Boolean(element && (element === playerShell || playerShell.contains(element)));
          }
          function syncFullscreen() {
            if (!alive()) return;
            var button = ui.querySelector('[data-a="fullscreen"]');
            var icon = button && button.querySelector("i");
            var active = fullscreenActive();
            if (button) button.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
            if (icon) icon.className = active ? "fa-solid fa-compress" : "fa-solid fa-expand";
          }
          function toggleFullscreen() {
            try {
              if (player.fullscreen && typeof player.fullscreen.toggle === "function") {
                var result = player.fullscreen.toggle();
                if (result && result.catch) result.catch(function(){});
                return;
              }
            } catch {}
            try {
              var result = document.fullscreenElement ? document.exitFullscreen() : playerShell.requestFullscreen();
              if (result && result.catch) result.catch(function(){});
            } catch {}
          }
          function closeMenu() {
            menu.hidden = true;
            ui.classList.remove("menuOpen");
            var button = ui.querySelector('[data-a="settings"]');
            if (button) button.setAttribute("aria-expanded", "false");
          }
          playerShell.__swiflyControlCleanup = function() {
            if (dead) return;
            dead = true;
            clearTimeout(hideTimer);
            cleanup.splice(0).forEach(function(fn){ try { fn(); } catch {} });
            if (ui.isConnected) ui.remove();
          };
`,
    "control lifecycle anchor");

  source = required(source,
    `          function show(sticky) {
            ui.classList.add("show");`,
    `          function show(sticky) {
            if (!alive()) return;
            ui.classList.add("show");`,
    "show guard");
  source = required(source,
    `            if (!sticky && !media.paused && menu.hidden) {`,
    `            if (!sticky && !media.paused && menu.hidden && !scrubbing && !ui.matches(":focus-within")) {`,
    "hide guard");
  source = required(source,
    `          function sync() {
            var playing = !media.paused && !media.ended;`,
    `          function sync() {
            if (!alive()) return;
            var playing = !media.paused && !media.ended;`,
    "sync guard");
  source = required(source,
    /var duration = Number\(media\.duration \|\| 0\);\n\s*var current = Number\(media\.currentTime \|\| 0\);/,
    `var duration = safeDuration();
            var current = Number(media.currentTime);
            if (!Number.isFinite(current) || current < 0) current = 0;
            progress.disabled = !duration;`,
    "finite duration");
  source = required(source,
    `              progress.style.setProperty("--b", Math.max(played, buffered) + "%");`,
    `              progress.style.setProperty("--b", clamp(Math.max(played, buffered), 0, 100) + "%");`,
    "buffer clamp");
  source = required(source,
    `            muteIcon.className = media.muted || media.volume === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";`,
    `            muteIcon.className = media.muted || media.volume === 0 ? "fa-solid fa-volume-xmark" : (media.volume < .5 ? "fa-solid fa-volume-low" : "fa-solid fa-volume-high");
            syncFullscreen();`,
    "fullscreen sync");
  source = required(source,
    `          function togglePlay() {
            if (media.paused || media.ended) {`,
    `          function togglePlay() {
            if (!alive()) return;
            if (media.paused || media.ended) {
              if (media.ended) safeSeek(0);`,
    "safe play");
  source = required(source,
    `            if (action === "fullscreen") {
              try {
                player.fullscreen.toggle();
              } catch {
                try { playerShell.requestFullscreen(); } catch {}
              }
            }`,
    `            if (action === "fullscreen") toggleFullscreen();`,
    "fullscreen action");
  return source;
}

module.exports = { patchFoundation };
