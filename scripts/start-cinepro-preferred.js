"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
require("dotenv").config({ path: path.join(root, ".env") });

// VixSrc returned a valid source alongside Icefy in real Swifly logs, while
// Icefy's TikTok CDN segments intermittently returned HTTP 403. Keep Icefy
// available as a resolver fallback, but make VixSrc the deterministic first
// playback choice unless the user explicitly overrides these values.
process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "vixsrc,icefy";
process.env.CINEPRO_PROVIDER_ORDER = process.env.CINEPRO_PROVIDER_ORDER || "vixsrc,icefy";

const originalReadFileSync = fs.readFileSync.bind(fs);
let resumePatchApplied = false;

fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}

  if (resumePatchApplied || resolved !== serverPath) return result;
  resumePatchApplied = true;
  fs.readFileSync = originalReadFileSync;

  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const normalized = source.replace(/\r\n?/g, "\n");
  const needle = `            function markPlaying() {
              if (playerShell) playerShell.classList.add("v149Playing");
              setVideoUiState("playing");
              hidePlayerStatusSoon();
            }

            function markPaused() {
              if (playerShell) playerShell.classList.remove("v149Playing");
              setVideoUiState("paused");
            }`;

  const replacement = `            var cineproResponseId = data && data.responseId ? String(data.responseId) : "";
            var cineproResumeArmed = false;
            var cineproResumeRefreshing = false;
            var cineproResumeBypassPlay = false;
            var cineproHasPlayed = false;
            var cineproResumeTime = 0;

            function finishPlayingUi() {
              cineproHasPlayed = true;
              if (playerShell) playerShell.classList.add("v149Playing");
              setVideoUiState("playing");
              hidePlayerStatusSoon();
            }

            function waitForCineProResumeReady() {
              return new Promise(function(resolve) {
                var settled = false;
                var timer = null;
                function done() {
                  if (settled) return;
                  settled = true;
                  if (timer) clearTimeout(timer);
                  try { player.removeEventListener("can-play", done); } catch {}
                  try { player.removeEventListener("loaded-metadata", done); } catch {}
                  resolve();
                }
                try { player.addEventListener("can-play", done); } catch {}
                try { player.addEventListener("loaded-metadata", done); } catch {}
                timer = setTimeout(done, 10000);
              });
            }

            async function refreshCineProForResume() {
              if (cineproResumeRefreshing) return;
              cineproResumeRefreshing = true;
              cineproResumeArmed = false;

              var resumeAt = Math.max(0, Number(player.currentTime || cineproResumeTime || 0));
              setVideoUiState("loading");
              setStatus("Refreshing CinePro stream after pause...");
              setPlayerStatus("Refreshing CinePro", "Renewing the signed stream and restoring your position.", false);

              try { player.pause && player.pause(); } catch {}

              try {
                var refreshUrl = "/api/cinepro/refresh/" + encodeURIComponent(cineproResponseId || "fresh-source") + "/" + encodeURIComponent(movieType || "movie") + "/" + encodeURIComponent(movieId);
                refreshUrl += "?t=" + Date.now();
                if ((movieType || "movie") === "tv") {
                  refreshUrl += "&season=" + encodeURIComponent(selectedSeason || "1") + "&episode=" + encodeURIComponent(selectedEpisode || "1");
                }

                var response = await fetch(refreshUrl, {
                  cache: "no-store",
                  headers: { "Accept": "application/json" }
                });
                var fresh = await response.json();
                if (!response.ok || !fresh || fresh.status !== "ok") {
                  throw new Error((fresh && (fresh.message || (fresh.attempts && fresh.attempts[0]))) || "CinePro refresh failed");
                }

                var freshSrc = chooseMoviePlaybackSource(fresh);
                if (!freshSrc) throw new Error("CinePro returned no refreshed playback URL");

                cineproResponseId = fresh.responseId ? String(fresh.responseId) : cineproResponseId;
                var freshIsM3u8 = /\.m3u8(?:[?#]|$)/i.test(String(freshSrc || ""));
                var ready = waitForCineProResumeReady();

                player.setAttribute("src", freshSrc);
                player.setAttribute("data-swifly-src", freshSrc);
                if (freshIsM3u8) {
                  player.setAttribute("data-swifly-m3u8-src", freshSrc);
                  player.setAttribute("data-swifly-hls", "true");
                }
                try {
                  player.src = freshIsM3u8
                    ? { src: freshSrc, type: "application/x-mpegurl" }
                    : freshSrc;
                } catch {}

                await ready;
                try { player.currentTime = resumeAt; } catch {}
                await new Promise(function(resolve){ setTimeout(resolve, 180); });
                try {
                  if (Math.abs(Number(player.currentTime || 0) - resumeAt) > 2) player.currentTime = resumeAt;
                } catch {}

                cineproResumeBypassPlay = true;
                var playResult = player.play && player.play();
                if (playResult && typeof playResult.then === "function") await playResult;
                setStatus("CinePro stream refreshed. Resumed at " + Math.round(resumeAt) + "s.");
              } catch (error) {
                cineproResumeArmed = true;
                setVideoUiState("paused");
                setStatus("CinePro resume refresh failed: " + (error.message || "request failed"));
                setPlayerStatus("Resume refresh failed", error.message || "Could not renew the CinePro stream.", true);
              } finally {
                cineproResumeRefreshing = false;
              }
            }

            function markPlaying() {
              if (cineproResumeBypassPlay) {
                cineproResumeBypassPlay = false;
                finishPlayingUi();
                return;
              }
              if (cineproResumeRefreshing) return;
              if (cineproResumeArmed && cineproResponseId) {
                refreshCineProForResume();
                return;
              }
              finishPlayingUi();
            }

            function markPaused() {
              if (playerShell) playerShell.classList.remove("v149Playing");
              setVideoUiState("paused");
              if (cineproHasPlayed && !cineproResumeRefreshing) {
                cineproResumeTime = Math.max(0, Number(player.currentTime || 0));
                cineproResumeArmed = true;
                setStatus("Paused. CinePro will renew the stream when you resume.");
              }
            }`;

  if (!normalized.includes(needle)) {
    throw new Error("[cinepro] Could not install pause/resume refresh; Vidstack player block was not found.");
  }

  const patched = normalized.replace(needle, replacement);
  return Buffer.isBuffer(result) ? Buffer.from(patched, "utf8") : patched;
};

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
console.log("[cinepro] Pause/resume refresh protection enabled.");
require("./start-cinepro.js");
