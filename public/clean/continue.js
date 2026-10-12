/* SwiflyTV v153: one history component for homepage and Continue Watching. */
(() => {
  "use strict";
  if (window.SwiflyContinue) return;
  const key = "movieverse.continue";
  let started = false, renderFrame = 0;
  const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  function read() {
    try {
      const raw = localStorage.getItem(key);
      const items = JSON.parse(raw === null ? localStorage.getItem("swiflytv.continueWatching") || "[]" : raw);
      if (!Array.isArray(items)) return [];
      const seen = new Set();
      return items.filter(item => item && (item.id || item.tmdbId)).map(item => {
        const id = String(item.id || item.tmdbId);
        const type = ["tv", "series"].includes(item.type || item.media_type) ? "tv" : "movie";
        return { ...item, id, type, key: type + ":" + id, title: item.title || item.name || "Untitled", poster: item.poster || item.poster_path || "", backdrop: item.backdrop || item.backdrop_path || "" };
      }).filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; });
    } catch { return []; }
  }
  function imageUrl(path) { if (!path) return ""; if (/^https?:\/\//i.test(path)) return path; return path.startsWith("/") ? "https://image.tmdb.org/t/p/w780" + path : ""; }
  function card(item) {
    const id = encodeURIComponent(item.id);
    const season = Math.max(1, Math.floor(Number(item.season || item.s) || 1));
    const episode = Math.max(1, Math.floor(Number(item.episode || item.e) || 1));
    const href = "/watch/" + item.type + "/" + id + "?mode=movie" + (item.type === "tv" ? "&s=" + season + "&e=" + episode : "");
    const details = "/" + item.type + "/" + id;
    const title = escape(item.title), image = imageUrl(item.backdrop || item.poster);
    const fields = { id: item.id, type: item.type, title: item.title, poster: item.poster, backdrop: item.backdrop, rating: item.rating || "", year: item.year || "" };
    const attrs = Object.entries(fields).map(([name, value]) => ' data-play-' + name + '="' + escape(value) + '"').join("");
    const elapsed = Number(item.currentTime ?? item.positionSeconds ?? item.position), duration = Number(item.duration ?? item.durationSeconds);
    const percent = Number.isFinite(elapsed) && Number.isFinite(duration) && elapsed > 0 && duration > 0 ? Math.round(Math.max(0, Math.min(100, elapsed / duration * 100))) : null;
    const progress = percent === null ? "" : '<div class="svResumeProgress" role="progressbar" aria-label="Playback progress for ' + title + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div>';
    return '<article class="svResumeCard"><div class="svResumeArtwork">' +
      '<a class="svResumeLink" href="' + escape(href) + '" aria-label="Continue watching ' + title + '"' + attrs + '>' +
      (image ? '<img src="' + escape(image) + '" alt="' + title + '" loading="lazy" decoding="async" />' : '<div class="svResumeFallback">' + escape(item.title.slice(0, 1)) + '</div>') +
      '<span class="svResumePlay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg></span></a>' +
      '<button class="svResumeRemove" type="button" data-continue-remove="' + escape(item.key) + '" aria-label="Remove ' + title + ' from Continue Watching"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>' +
      progress + '</div><div class="svResumeCaption"><a class="svResumeTitle" href="' + escape(details) + '" title="' + title + '">' + title + '</a>' +
      '<div class="svResumeMeta">' + (item.year ? '<span>' + escape(item.year) + '</span><span aria-hidden="true">·</span>' : '') + '<span>' + (item.type === "tv" ? "Series" : "Movie") + '</span></div></div></article>';
  }
  function render() {
    const items = read(), section = document.getElementById("continueWatchingSection"), rail = document.getElementById("continueWatchingRail");
    if (section && rail) { section.hidden = items.length === 0; rail.innerHTML = items.slice(0, 18).map(card).join(""); }
    for (const id of ["continueWatchingPageRail", "continueGrid"]) { const grid = document.getElementById(id); if (grid) { grid.hidden = items.length === 0; grid.innerHTML = items.map(card).join(""); } }
    const empty = document.getElementById("continueWatchingEmpty"); if (empty) empty.hidden = items.length > 0;
    document.querySelectorAll("[data-continue-count]").forEach(node => { node.textContent = items.length + (items.length === 1 ? " title" : " titles"); });
  }
  function boot() {
    if (started) return; started = true; render();
    window.addEventListener("swifly:continue-change", () => { if (renderFrame) return; renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); }); });
    window.addEventListener("storage", event => { if (!event.key || [key, "swiflytv.continueWatching"].includes(event.key)) render(); });
    document.addEventListener("click", event => {
      const remove = event.target.closest("[data-continue-remove]");
      if (remove) { localStorage.setItem(key, JSON.stringify(read().filter(item => item.key !== remove.dataset.continueRemove))); render(); if (typeof window.showToast === "function") window.showToast("Removed from Continue Watching"); return; }
      const scroll = event.target.closest("[data-continue-scroll]"), rail = document.getElementById("continueWatchingRail");
      if (scroll && rail) { const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; rail.scrollBy({ left: Number(scroll.dataset.continueScroll) * rail.clientWidth * .85, behavior: reduced ? "auto" : "smooth" }); }
    });
  }
  window.SwiflyContinue = Object.freeze({ render, read });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
