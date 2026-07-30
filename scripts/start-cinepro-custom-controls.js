"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-player] Could not find ${label}; server.js was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const injected = String.raw`
        function mountSwiflyControls(player, media, hlsInstance) {
          if (!playerShell || !media) return;
          var prior = playerShell.querySelector(".swiflyPlayerUi");
          if (prior) prior.remove();

          if (!document.getElementById("swiflyPlayerUiStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyPlayerUiStyle";
            style.textContent =
              "body.swifly-watch-clean #movieButtonPlayerShell .plyr__controls,body.swifly-watch-clean #movieButtonPlayerShell .plyr__control--overlaid,#swiflyCleanBack{display:none!important}" +
              "#movieButtonPlayerShell.swiflyUiIdle{cursor:none!important}.swiflyPlayerUi{position:absolute;inset:0;z-index:100;color:#fff;font-family:Inter,system-ui,sans-serif;pointer-events:none;transition:opacity .2s ease}.swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen){opacity:0}" +
              ".swiflyUiTop,.swiflyUiBottom,.swiflyUiCenter{position:absolute;left:0;right:0}.swiflyUiTop{top:0;display:flex;align-items:center;gap:14px;padding:22px 28px 72px;background:linear-gradient(#000c,transparent)}.swiflyUiBottom{bottom:0;padding:90px 28px max(22px,env(safe-area-inset-bottom));background:linear-gradient(transparent,#000e)}" +
              ".swiflyUiCenter{top:50%;left:50%;right:auto;transform:translate(-50%,-50%);display:flex;align-items:center;gap:18px;transition:.18s}.swiflyPlayerUi:not(.paused) .swiflyUiCenter{opacity:0;transform:translate(-50%,-46%) scale(.96)}" +
              ".swiflyUiBtn{width:42px;height:42px;border:0;border-radius:999px;color:#fff;background:transparent;display:grid;place-items:center;cursor:pointer;pointer-events:auto;font-size:18px;transition:.15s}.swiflyUiBtn:hover{background:#ffffff24;transform:scale(1.06)}.swiflyUiBack{background:#090b11a8;border:1px solid #ffffff20;backdrop-filter:blur(14px)}" +
              ".swiflyUiMain{width:76px;height:76px;color:#0a0c10;background:#fff;font-size:26px;box-shadow:0 18px 60px #0008}.swiflyUiMain:hover{background:#fff;transform:scale(1.08)}.swiflyUiSkip{width:54px;height:54px;background:#090b1190;border:1px solid #ffffff1c;font-size:19px}.swiflyUiSkip small{position:absolute;font-size:9px;font-weight:900}" +
              ".swiflyUiTitle{min-width:0;text-shadow:0 2px 15px #000}.swiflyUiTitle b{display:block;max-width:min(58vw,760px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px}.swiflyUiTitle span{display:block;margin-top:3px;color:#ffffff9c;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}" +
              ".swiflyUiProgress{--p:0%;--b:0%;position:absolute;left:28px;right:28px;bottom:70px;width:calc(100% - 56px);height:4px;margin:0;appearance:none;border-radius:99px;cursor:pointer;pointer-events:auto;background:linear-gradient(90deg,#e50914 0 var(--p),#ffffff78 var(--p) var(--b),#ffffff35 var(--b))}.swiflyUiProgress:hover{height:6px}.swiflyUiProgress::-webkit-slider-thumb{appearance:none;width:0;height:0;border-radius:50%;background:#fff;transition:.12s}.swiflyUiProgress:hover::-webkit-slider-thumb{width:14px;height:14px}" +
              ".swiflyUiRow{display:flex;align-items:center;gap:4px;min-height:44px}.swiflyUiRow>*{pointer-events:auto}.swiflyUiSpacer{flex:1;pointer-events:none}.swiflyUiVolume{width:88px;accent-color:#fff}.swiflyUiTime{margin-left:6px;color:#ffffffc7;font-size:12px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}.swiflyUiCc.active{color:#e50914}" +
              ".swiflyUiMenu{position:absolute;right:28px;bottom:82px;width:min(300px,calc(100vw - 32px));padding:16px;border:1px solid #ffffff1f;border-radius:18px;background:#0d0f14f2;box-shadow:0 25px 80px #000a;backdrop-filter:blur(22px);pointer-events:auto}.swiflyUiMenu[hidden]{display:none}.swiflyUiMenu h3{margin:0 0 12px;font-size:15px}.swiflyUiField{display:grid;grid-template-columns:84px 1fr;align-items:center;gap:10px;margin-top:10px;color:#ffffffb8;font-size:12px;font-weight:700}.swiflyUiField select{height:38px;padding:0 10px;border:1px solid #ffffff1c;border-radius:10px;color:#fff;background:#1a1d25}" +
              "@media(max-width:720px){.swiflyUiTop{padding:14px 14px 60px}.swiflyUiBottom{padding:76px 12px max(12px,env(safe-area-inset-bottom))}.swiflyUiProgress{left:12px;right:12px;bottom:58px;width:calc(100% - 24px)}.swiflyUiVolume,.swiflyUiTime .duration{display:none}.swiflyUiBtn{width:38px;height:38px}.swiflyUiCenter{gap:10px}.swiflyUiMain{width:66px;height:66px}.swiflyUiSkip{width:46px;height:46px}.swiflyUiMenu{right:12px;bottom:70px}}";
            document.head.appendChild(style);
          }

          var titleNode = document.querySelector(".dsWatchPlayerTop h1");
          var title = titleNode && titleNode.textContent ? titleNode.textContent.trim() : "SwiflyTV";
          var ui = document.createElement("div");
          ui.className = "swiflyPlayerUi show paused";
          ui.innerHTML =
            '<div class="swiflyUiTop"><button class="swiflyUiBtn swiflyUiBack" data-a="back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button><div class="swiflyUiTitle"><b></b><span>Now playing</span></div></div>' +
            '<div class="swiflyUiCenter"><button class="swiflyUiBtn swiflyUiSkip" data-a="back10" aria-label="Back 10 seconds"><i class="fa-solid fa-rotate-left"></i><small>10</small></button><button class="swiflyUiBtn swiflyUiMain" data-a="play" aria-label="Play"><i class="fa-solid fa-play"></i></button><button class="swiflyUiBtn swiflyUiSkip" data-a="forward10" aria-label="Forward 10 seconds"><i class="fa-solid fa-rotate-right"></i><small>10</small></button></div>' +
            '<div class="swiflyUiBottom"><input class="swiflyUiProgress" type="range" min="0" max="1000" value="0" aria-label="Seek"><div class="swiflyUiRow"><button class="swiflyUiBtn" data-a="play" aria-label="Play"><i class="fa-solid fa-play"></i></button><button class="swiflyUiBtn" data-a="back10" aria-label="Back 10 seconds"><i class="fa-solid fa-rotate-left"></i></button><button class="swiflyUiBtn" data-a="forward10" aria-label="Forward 10 seconds"><i class="fa-solid fa-rotate-right"></i></button><button class="swiflyUiBtn" data-a="mute" aria-label="Mute"><i class="fa-solid fa-volume-high"></i></button><input class="swiflyUiVolume" type="range" min="0" max="1" step=".02" value="1" aria-label="Volume"><div class="swiflyUiTime"><span class="current">0:00</span> / <span class="duration">0:00</span></div><div class="swiflyUiSpacer"></div><button class="swiflyUiBtn swiflyUiCc" data-a="cc" aria-label="Captions"><i class="fa-solid fa-closed-captioning"></i></button><button class="swiflyUiBtn" data-a="settings" aria-label="Settings"><i class="fa-solid fa-gear"></i></button><button class="swiflyUiBtn" data-a="fullscreen" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button></div></div>' +
            '<div class="swiflyUiMenu" hidden><h3>Playback settings</h3><label class="swiflyUiField"><span>Quality</span><select data-s="quality"><option value="-1">Auto</option></select></label><label class="swiflyUiField"><span>Speed</span><select data-s="speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label class="swiflyUiField"><span>Subtitles</span><select data-s="cc"><option value="-1">Off</option></select></label></div>';
          playerShell.appendChild(ui);
          ui.querySelector(".swiflyUiTitle b").textContent = title;

          var progress = ui.querySelector(".swiflyUiProgress");
          var volume = ui.querySelector(".swiflyUiVolume");
          var now = ui.querySelector(".current");
          var total = ui.querySelector(".duration");
          var menu = ui.querySelector(".swiflyUiMenu");
          var quality = ui.querySelector('[data-s="quality"]');
          var speed = ui.querySelector('[data-s="speed"]');
          var cc = ui.querySelector('[data-s="cc"]');
          var ccButton = ui.querySelector('[data-a="cc"]');
          var hideTimer = null;
          var scrubbing = false;

          function clock(seconds) {
            seconds = Math.max(0, Math.floor(Number(seconds || 0)));
            var h = Math.floor(seconds / 3600);
            var m = Math.floor(seconds % 3600 / 60);
            var s = seconds % 60;
            return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
          }

          function show(sticky) {
            ui.classList.add("show");
            playerShell.classList.remove("swiflyUiIdle");
            clearTimeout(hideTimer);
            if (!sticky && !media.paused && menu.hidden) {
              hideTimer = setTimeout(function(){ ui.classList.remove("show"); playerShell.classList.add("swiflyUiIdle"); }, 2400);
            }
          }

          function sync() {
            var playing = !media.paused && !media.ended;
            ui.classList.toggle("paused", !playing);
            ui.querySelectorAll('[data-a="play"] i').forEach(function(icon){
              icon.className = playing ? "fa-solid fa-pause" : "fa-solid fa-play";
            });
            var duration = Number(media.duration || 0);
            var current = Number(media.currentTime || 0);
            now.textContent = clock(current);
            total.textContent = clock(duration);
            if (!scrubbing) {
              var played = duration ? current / duration * 100 : 0;
              progress.value = String(Math.round(played * 10));
              progress.style.setProperty("--p", played + "%");
              var buffered = played;
              try { if (media.buffered.length) buffered = media.buffered.end(media.buffered.length - 1) / duration * 100; } catch {}
              progress.style.setProperty("--b", Math.max(played, buffered) + "%");
            }
            volume.value = media.muted ? "0" : String(media.volume);
            var muteIcon = ui.querySelector('[data-a="mute"] i');
            muteIcon.className = media.muted || media.volume === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
            var tracks = Array.from(media.textTracks || []);
            ccButton.classList.toggle("active", tracks.some(function(track){ return track.mode === "showing"; }));
          }

          function fillSettings() {
            quality.innerHTML = '<option value="-1">Auto</option>';
            var seen = {};
            (hlsInstance && hlsInstance.levels || []).forEach(function(level, index){
              var height = Number(level && level.height || 0);
              if (!height || seen[height]) return;
              seen[height] = true;
              var option = document.createElement("option");
              option.value = String(index);
              option.textContent = height + "p";
              quality.appendChild(option);
            });
            cc.innerHTML = '<option value="-1">Off</option>';
            Array.from(media.textTracks || []).forEach(function(track, index){
              var option = document.createElement("option");
              option.value = String(index);
              option.textContent = track.label || track.language || ("Subtitle " + (index + 1));
              cc.appendChild(option);
            });
          }

          function togglePlay() {
            if (media.paused || media.ended) {
              var promise = media.play();
              if (promise && promise.catch) promise.catch(function(){});
            } else media.pause();
          }

          ui.addEventListener("click", function(event){
            var button = event.target.closest("[data-a]");
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            var action = button.getAttribute("data-a");
            if (action === "play") togglePlay();
            if (action === "back10") media.currentTime = Math.max(0, media.currentTime - 10);
            if (action === "forward10") media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 10);
            if (action === "mute") media.muted = !media.muted;
            if (action === "back") {
              var match = location.pathname.match(/^\/watch\/(movie|tv)\/([^/?#]+)/);
              location.href = match ? "/" + match[1] + "/" + match[2] : "/";
            }
            if (action === "fullscreen") {
              try { player.fullscreen.toggle(); } catch { try { playerShell.requestFullscreen(); } catch {} }
            }
            if (action === "settings") {
              menu.hidden = !menu.hidden;
              ui.classList.toggle("menuOpen", !menu.hidden);
              show(true);
            }
            if (action === "cc") {
              var tracks = Array.from(media.textTracks || []);
              var active = tracks.findIndex(function(track){ return track.mode === "showing"; });
              tracks.forEach(function(track){ track.mode = "disabled"; });
              if (active < 0 && tracks[0]) tracks[0].mode = "showing";
            }
            sync();
            show(false);
          });

          progress.addEventListener("pointerdown", function(){ scrubbing = true; show(true); });
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
          });
          volume.addEventListener("input", function(){ media.muted = false; media.volume = Number(volume.value || 0); sync(); });
          quality.addEventListener("change", function(){ if (hlsInstance) hlsInstance.currentLevel = Number(quality.value); });
          speed.addEventListener("change", function(){ media.playbackRate = Number(speed.value || 1); });
          cc.addEventListener("change", function(){
            var selected = Number(cc.value);
            Array.from(media.textTracks || []).forEach(function(track, index){ track.mode = index === selected ? "showing" : "disabled"; });
            sync();
          });

          ["play","pause","ended","timeupdate","durationchange","progress","volumechange"].forEach(function(name){ media.addEventListener(name, sync); });
          media.addEventListener("loadedmetadata", function(){ fillSettings(); sync(); });
          playerShell.addEventListener("mousemove", function(){ show(false); });
          playerShell.addEventListener("pointerdown", function(){ show(false); });
          document.addEventListener("click", function(event){
            if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-a="settings"]')) {
              menu.hidden = true;
              ui.classList.remove("menuOpen");
              show(false);
            }
          });

          fillSettings();
          sync();
          show(true);
          console.log("[swifly-player] Custom control interface mounted.");
        }

`;

fs.readFileSync = function swiflyPlayerRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patched || resolved !== serverPath) return result;

  patched = true;
  let source = (Buffer.isBuffer(result) ? result.toString("utf8") : String(result)).replace(/\r\n?/g, "\n");

  source = replaceRequired(
    source,
    /(\n[ \t]*function initPlyrUi\(hlsInstance,\s*levels\)\s*\{)/,
    `${injected}$1`,
    "Plyr initializer",
  );

  source = replaceRequired(
    source,
    /(movieButtonPlyr\.on\("ready",\s*function\(\)\s*\{\s*\n)/,
    `$1            mountSwiflyControls(movieButtonPlyr, video, hlsInstance);\n`,
    "Plyr ready event",
  );

  console.log("[swifly-player] Custom control markup injected.");
  return Buffer.isBuffer(result) ? Buffer.from(source, "utf8") : source;
};

require("./start-cinepro-fullscreen-safe.js");