"use strict";

function required(source, find, replacement, label) {
  const found = typeof find === "string" ? source.includes(find) : find.test(source);
  if (!found) throw new Error(`[swifly-controls] Missing ${label}; refusing a partial patch.`);
  if (find instanceof RegExp) find.lastIndex = 0;
  return source.replace(find, replacement);
}

function patchInteractions(source) {
  source = required(source,
    `          ui.addEventListener("click", function(event){`,
    `          function keyboard(event) {
            if (!alive() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.target && event.target.closest && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
            var key = String(event.key || "").toLowerCase();
            if (key === " " || key === "k") togglePlay();
            else if (key === "arrowleft") safeSeek(media.currentTime - 5);
            else if (key === "arrowright") safeSeek(media.currentTime + 5);
            else if (key === "j") safeSeek(media.currentTime - 10);
            else if (key === "l") safeSeek(media.currentTime + 10);
            else if (key === "m") media.muted = !media.muted;
            else if (key === "f") toggleFullscreen();
            else if (key === "c" && !ccButton.disabled) ccButton.click();
            else if (key === "escape" && !menu.hidden) closeMenu();
            else return;
            event.preventDefault();
            sync();
            show(false);
          }

          ui.addEventListener("click", function(event){`,
    "keyboard controls");

  source = required(source,
    /progress\.addEventListener\("pointerdown", function\(\)\{ scrubbing = true; show\(true\); \}\);[\s\S]*?progress\.addEventListener\("change", function\(\)\{[\s\S]*?\n\s*\}\);/,
    `function scrubTarget() {
            return safeDuration() * clamp(Number(progress.value || 0), 0, 1000) / 1000;
          }
          function finishScrub(commit) {
            if (!scrubbing) return;
            if (commit) safeSeek(scrubTarget());
            scrubbing = false;
            sync();
            show(false);
          }
          progress.addEventListener("pointerdown", function(){ if (!progress.disabled) { scrubbing = true; show(true); } });
          progress.addEventListener("input", function(){
            var percent = clamp(Number(progress.value || 0) / 10, 0, 100);
            progress.style.setProperty("--p", percent + "%");
            now.textContent = clock(scrubTarget());
          });
          progress.addEventListener("change", function(){ finishScrub(true); });
          progress.addEventListener("pointerup", function(){ finishScrub(true); });
          progress.addEventListener("pointercancel", function(){ finishScrub(false); });
          progress.addEventListener("blur", function(){ finishScrub(true); });`,
    "seek lifecycle");

  source = required(source,
    `          ["play", "pause", "ended", "timeupdate", "durationchange", "progress", "volumechange"].forEach(function(name){
            media.addEventListener(name, sync);
          });`,
    `          ["play", "pause", "ended", "timeupdate", "durationchange", "progress", "volumechange", "ratechange", "seeked"].forEach(function(name){
            media.addEventListener(name, sync);
            cleanup.push(function(){ media.removeEventListener(name, sync); });
          });`,
    "media cleanup");
  source = required(source,
    `          playerShell.addEventListener("mousemove", function(){ show(false); });
          playerShell.addEventListener("pointerdown", function(){ show(false); });
          document.addEventListener("click", function(event){
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {
              menu.hidden = true;
              ui.classList.remove("menuOpen");
              show(false);
            }
          });`,
    `          var move = function(){ show(false); };
          var down = function(){ show(false); };
          var outside = function(event){
            if (!alive()) return;
            if (!menu.hidden && !menu.contains(event.target) && !(event.target.closest && event.target.closest('[data-a="settings"]'))) {
              closeMenu();
              show(false);
            }
          };
          playerShell.addEventListener("mousemove", move);
          playerShell.addEventListener("pointerdown", down);
          document.addEventListener("click", outside);
          document.addEventListener("keydown", keyboard);
          document.addEventListener("fullscreenchange", syncFullscreen);
          cleanup.push(function(){ playerShell.removeEventListener("mousemove", move); });
          cleanup.push(function(){ playerShell.removeEventListener("pointerdown", down); });
          cleanup.push(function(){ document.removeEventListener("click", outside); });
          cleanup.push(function(){ document.removeEventListener("keydown", keyboard); });
          cleanup.push(function(){ document.removeEventListener("fullscreenchange", syncFullscreen); });`,
    "external cleanup");
  return source;
}

module.exports = { patchInteractions };
