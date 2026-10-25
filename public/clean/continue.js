/* Profile-local playback progress and Continue Watching controls. */
(() => {
  "use strict";
  if (window.SwiflyContinue) return;
  const key = "movieverse.continue";
  const legacyKey = "swiflytv.continueWatching";
  const actionStates = new WeakMap();
  const nextRequests = new Map(), completedSaves = new Set(), revisions = new Map();
  let started = false, renderFrame = 0;
  const text = value => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const numeric = value => typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  function json(name, fallback) {
    try { const value = JSON.parse(localStorage.getItem(name) || "null"); return value === null ? fallback : value; } catch { return fallback; }
  }
  const sameProfile = (a, b) => a && b && (a.id && b.id ? a.id === b.id : a.name && a.name === b.name);
  function viewer() {
    const selected = json("swiflytv.activeProfile", null);
    const configured = json("swiflytv.profiles", []);
    // Match the IDs supplied by the profile chooser before comparing names.
    let profiles = Array.isArray(configured) ? configured.filter(item => item && typeof item === "object")
      .map((item, index) => ({...item, id:item.id || "legacy-" + index})) : [];
    if (!profiles.length) profiles = [{id:"main", name:"Main"}, {id:"kids", name:"Kids"}];
    const index = selected ? profiles.findIndex(item => sameProfile(item, selected)) : profiles.length ? 0 : -1;
    const active = profiles[index] || selected || profiles[0];
    const id = text(active?.id) || (index >= 0 ? "legacy-" + index : text(active?.name) ? "name:" + text(active.name) : "main");
    return { id, adoptLegacy: profiles.length === 1 && (!selected || sameProfile(profiles[0], selected)) };
  }
  const profileId = () => viewer().id;
  function write(items, announce = true) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      if (announce) window.dispatchEvent(new Event("swifly:continue-change"));
      return true;
    } catch { return false; }
  }
  function all() {
    let raw;
    try { raw = localStorage.getItem(key); } catch { return []; }
    const items = json(raw === null ? legacyKey : key, []);
    if (!Array.isArray(items)) return [];
    const owner = viewer();
    if (owner.adoptLegacy && items.some(item => item && !item.profileId)) {
      const adopted = items.map(item => item && typeof item === "object" && !item.profileId ? { ...item, profileId: owner.id } : item);
      write(adopted, false);
      return adopted;
    }
    return items;
  }
  const positiveInteger = value => Number.isSafeInteger(numeric(value)) && numeric(value) > 0 ? numeric(value) : null;
  function normalize(item) {
    if (!item || typeof item !== "object") return null;
    const id = positiveInteger(item.id || item.tmdbId);
    const rawType = item.type || item.media_type || "movie";
    const type = ["tv", "series"].includes(rawType) ? "tv" : rawType === "movie" ? "movie" : "";
    if (!id || !type) return null;
    const rawTime = numeric(item.currentTime ?? item.positionSeconds ?? item.position);
    const rawDuration = numeric(item.duration ?? item.durationSeconds);
    const currentTime = Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : 0;
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
    const season = positiveInteger(item.season ?? item.s), episode = positiveInteger(item.episode ?? item.e);
    const completed = item.completed === true || item.ended === true || duration > 0 && currentTime >= duration;
    return { ...item, id: String(id), type, key: type + ":" + id, title: text(item.title) || text(item.name) || "Untitled",
      year:text(item.year), rating:text(item.rating),
      poster: typeof (item.poster || item.poster_path) === "string" ? item.poster || item.poster_path : "",
      backdrop: typeof (item.backdrop || item.backdrop_path) === "string" ? item.backdrop || item.backdrop_path : "",
      currentTime, duration, season: season || 1, episode: episode || 1, completed,
      resumable: !completed && currentTime >= 1 && duration > currentTime && (type !== "tv" || Boolean(season && episode)) };
  }
  function read(owner = profileId()) {
    if (window.SwiflyLibrary?.active === false) return [];
    const seen = new Set();
    return all().filter(item => item?.profileId === owner).map(normalize).filter(item => {
      if (!item || item.completed || seen.has(item.key)) return false;
      seen.add(item.key); return true;
    });
  }
  function find(type, id, owner = profileId()) {
    return read(owner).find(item => item.type === type && item.id === String(id) && item.resumable) || null;
  }
  function remove(itemKey, owner = profileId()) {
    const changeKey = owner + ':' + itemKey;
    revisions.set(changeKey, (revisions.get(changeKey) || 0) + 1);
    return write(all().filter(item => item?.profileId !== owner || normalize(item)?.key !== itemKey));
  }
  function nextEpisode(progress, owner, requestKey, revision) {
    const library = window.SwiflyLibrary;
    if (!library || typeof window.fetch !== 'function' || nextRequests.has(requestKey)) return;
    const context = library.contextId(), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const query = new URLSearchParams({s:String(progress.season),e:String(progress.episode)});
    const task = (async () => {
      try {
        const response = await fetch('/api/library/next/tv/' + progress.id + '?' + query, {signal:controller.signal,headers:{Accept:'application/json'}});
        if (!response.ok) return;
        const data = await response.json(), next = data?.next;
        if (!library.active || context !== library.contextId() || owner !== profileId() || revision !== revisions.get(owner + ':' + progress.key)) return;
        const season = positiveInteger(next?.season), episode = positiveInteger(next?.episode);
        if (!season || !episode || season < progress.season || season === progress.season && episode <= progress.episode) return;
        if (next.airDate && (!/^\d{4}-\d{2}-\d{2}$/.test(next.airDate) || next.airDate > new Date().toISOString().slice(0,10))) return;
        const items = all();
        if (items.some(item => item?.profileId === owner && normalize(item)?.key === progress.key)) return;
        write([{...progress,profileId:owner,season,episode,currentTime:0,duration:0,completed:false,ended:false,nextEpisode:true,watchedAt:new Date().toISOString()},...items]);
      } catch {} finally {clearTimeout(timeout);}
    })();
    nextRequests.set(requestKey,task);
    if (nextRequests.size > 80) nextRequests.delete(nextRequests.keys().next().value);
  }
  function saveProgress(progress, owner = profileId()) {
    const next = normalize(progress);
    if (!next || !Number.isFinite(numeric(progress.currentTime)) || numeric(progress.currentTime) < 0 || !next.duration
        || next.type === "tv" && (!positiveInteger(progress.season) || !positiveInteger(progress.episode))) return false;
    const items = all(), previous = items.find(item => item?.profileId === owner && normalize(item)?.key === next.key) || {};
    const remaining = items.filter(item => item?.profileId !== owner || normalize(item)?.key !== next.key);
    const episodeKey = [owner,next.key,next.type === 'tv' ? next.season : '',next.type === 'tv' ? next.episode : ''].join(':'), changeKey = owner + ':' + next.key;
    if (next.completed) {
      if (completedSaves.has(episodeKey)) return true;
      const differentEpisode = next.type === 'tv' && previous.type === 'tv' && (Number(previous.season) !== next.season || Number(previous.episode) !== next.episode);
      if (!write(differentEpisode ? items : remaining)) return false;
      completedSaves.add(episodeKey);
      window.SwiflyLibrary?.remember?.({...next,completed:true},{owner});
      if (!differentEpisode && next.type === 'tv') {
        const revision = (revisions.get(changeKey) || 0) + 1;revisions.set(changeKey,revision);
        nextEpisode(next,owner,episodeKey,revision);
      }
      return true;
    }
    completedSaves.delete(episodeKey);nextRequests.delete(episodeKey);
    revisions.set(changeKey,(revisions.get(changeKey) || 0) + 1);
    const saved = { ...previous, profileId: owner, key: next.key, id: next.id, type: next.type,
      title: next.title, poster: next.poster, backdrop: next.backdrop, year: progress.year || previous.year || "",
      rating: progress.rating || previous.rating || "", currentTime: next.currentTime, duration: next.duration, completed: false, ended: false, nextEpisode:false,
      ...(next.type === "tv" ? { season: next.season, episode: next.episode } : {}), watchedAt: new Date().toISOString() };
    let count = 0;
    const success = write([saved, ...remaining].filter(item => item?.profileId !== owner || ++count <= 80));
    if (success) window.SwiflyLibrary?.remember?.(saved,{owner});
    return success;
  }
  function watchHref(item) {
    const params = new URLSearchParams({ mode: "movie" });
    if (item.type === "tv") { params.set("s", item.season); params.set("e", item.episode); }
    if (item.resumable) params.set("resume", "1");
    return "/watch/" + item.type + "/" + encodeURIComponent(item.id) + "?" + params;
  }
  function formatTime(seconds) {
    const value = Math.floor(seconds), hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60);
    return (hours ? hours + ":" + String(minutes).padStart(2, "0") : minutes) + ":" + String(value % 60).padStart(2, "0");
  }
  function decorate(root = document) {
    for (const link of root.querySelectorAll(".dsHeroActions a[data-play-id], .svDetailActions a[data-play-id]")) {
      let url; try { url = new URL(link.href, location.href); } catch { continue; }
      if (url.origin !== location.origin || !/^\/watch\/(movie|tv)\/\d+$/.test(url.pathname) || url.searchParams.get("mode") === "trailer" || url.searchParams.has("roomId") || url.searchParams.has("party")) continue;
      const saved = find(link.dataset.playType || "movie", link.dataset.playId);
      let state = actionStates.get(link);
      if (!saved) {
        if (state) { state.resume.remove(); link.classList.toggle("dsPrimaryBtn", state.primary); link.classList.toggle("dsSecondaryBtn", state.secondary); actionStates.delete(link); }
        continue;
      }
      if (!state) {
        const resume = document.createElement("a"); resume.className = "dsPrimaryBtn"; resume.dataset.resumeAction = saved.key;
        const label = document.createElement("span"); resume.append(label);
        state = { resume, label, primary: link.classList.contains("dsPrimaryBtn"), secondary: link.classList.contains("dsSecondaryBtn") }; actionStates.set(link, state);
        link.before(resume); link.classList.remove("dsPrimaryBtn"); link.classList.add("dsSecondaryBtn");
      }
      state.resume.href = watchHref(saved);
      state.label.textContent = "Resume" + (saved.type === "tv" ? " S" + saved.season + " E" + saved.episode : "") + " · " + formatTime(saved.currentTime);
      state.resume.setAttribute("aria-label", "Resume " + saved.title + (saved.type === "tv" ? ", season " + saved.season + ", episode " + saved.episode : "") + " at " + formatTime(saved.currentTime));
    }
  }
  function imageUrl(path) { if (!path) return ""; if (/^https?:\/\//i.test(path)) return path; return path.startsWith("/") ? "https://image.tmdb.org/t/p/w780" + path : ""; }
  function card(item) {
    const id = encodeURIComponent(item.id);
    const href = watchHref(item);
    const details = "/" + item.type + "/" + id;
    const title = escape(item.title), image = imageUrl(item.backdrop || item.poster);
    const fields = { id: item.id, type: item.type, title: item.title, poster: item.poster, backdrop: item.backdrop, rating: item.rating || "", year: item.year || "" };
    const attrs = Object.entries(fields).map(([name, value]) => ' data-play-' + name + '="' + escape(value) + '"').join("");
    const elapsed = Number(item.currentTime ?? item.positionSeconds ?? item.position), duration = Number(item.duration ?? item.durationSeconds);
    const percent = Number.isFinite(elapsed) && Number.isFinite(duration) && elapsed > 0 && duration > 0 ? Math.round(Math.max(0, Math.min(100, elapsed / duration * 100))) : null;
    const progress = percent === null ? "" : '<div class="svResumeProgress" role="progressbar" aria-label="Playback progress for ' + title + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div>';
    const timestamp = Date.parse(item.watchedAt || ''), age = Number.isFinite(timestamp) ? Math.max(0,Date.now()-timestamp) : null;
    const days = age === null ? 0 : Math.floor(age/86400000), stale = age !== null && age >= 14*86400000;
    const ageText = age === null ? '' : age < 60000 ? 'Just now' : age < 3600000 ? Math.floor(age/60000)+'m ago' : age < 86400000 ? Math.floor(age/3600000)+'h ago' : days+'d ago';
    const ageBadge = ageText ? '<time class="svResumeAge" datetime="' + escape(new Date(timestamp).toISOString()) + '" title="Last watched ' + escape(new Date(timestamp).toLocaleDateString()) + '">' + ageText + '</time>' : '';
    return '<article class="svResumeCard" data-continue-stale="' + stale + '"><div class="svResumeArtwork">' +
      '<a class="svResumeLink" href="' + escape(href) + '" aria-label="Continue watching ' + title + '"' + attrs + '>' +
      (image ? '<img src="' + escape(image) + '" alt="' + title + '" loading="lazy" decoding="async" />' : '<div class="svResumeFallback">' + escape(item.title.slice(0, 1)) + '</div>') +
      '<span class="svResumePlay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg></span></a>' +
      '<button class="svResumeRemove" type="button" data-continue-remove="' + escape(item.key) + '" aria-label="Remove ' + title + ' from Continue Watching"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>' +
      progress + '</div><div class="svResumeCaption"><a class="svResumeTitle" href="' + escape(details) + '" title="' + title + '">' + title + '</a>' +
      '<div class="svResumeMeta">' + (item.nextEpisode ? '<span class="svResumeUpNext">Up next</span><span aria-hidden="true">·</span>' : '') + (item.year ? '<span>' + escape(item.year) + '</span><span aria-hidden="true">·</span>' : '') + '<span>' + (item.type === "tv" ? "S" + item.season + " · E" + item.episode : "Movie") + '</span>' + (item.resumable ? '<span aria-hidden="true">·</span><span>' + formatTime(item.currentTime) + '</span>' : '') + '</div>' + ageBadge + '</div></article>';
  }
  function render() {
    const items = read(), section = document.getElementById("continueWatchingSection"), rail = document.getElementById("continueWatchingRail");
    if (section && rail) { section.hidden = items.length === 0; rail.innerHTML = items.slice(0, 18).map(card).join(""); }
    for (const id of ["continueWatchingPageRail", "continueGrid"]) { const grid = document.getElementById(id); if (grid) { grid.hidden = items.length === 0; grid.innerHTML = items.map(card).join(""); } }
    const empty = document.getElementById("continueWatchingEmpty"); if (empty) empty.hidden = items.length > 0;
    document.querySelectorAll("[data-continue-count]").forEach(node => { node.textContent = items.length + (items.length === 1 ? " title" : " titles"); });
    const accountCount = document.getElementById("statContinue"); if (accountCount) accountCount.textContent = String(items.length);
    decorate();
    window.SwiflyLibrary?.renderDecorations?.();
  }
  function boot() {
    if (started) return; started = true; render();
    window.addEventListener("swifly:continue-change", () => { if (renderFrame) return; renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); }); });
    window.addEventListener("storage", event => { if (!event.key || [key, legacyKey, "swiflytv.activeProfile", "swiflytv.profiles"].includes(event.key)) render(); });
    document.addEventListener("swifly:profile-changed", render);
    document.addEventListener('swifly:account-hydrated',render);
    document.addEventListener('swifly:account-suspended',render);
    document.addEventListener("click", event => {
      const remove = event.target.closest("[data-continue-remove]");
      if (remove) { if (window.SwiflyContinue.remove(remove.dataset.continueRemove)) { render(); if (typeof window.showToast === "function") window.showToast("Removed from Continue Watching"); } return; }
      const scroll = event.target.closest("[data-continue-scroll]"), rail = document.getElementById("continueWatchingRail");
      if (scroll && rail) { const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; if (window.SwiflyMotion) window.SwiflyMotion.scrollBy(rail, {left: Number(scroll.dataset.continueScroll) * rail.clientWidth * .85}); else rail.scrollBy({ left: Number(scroll.dataset.continueScroll) * rail.clientWidth * .85, behavior: reduced ? "auto" : "smooth" }); }
    });
  }
  window.SwiflyContinue = Object.freeze({ render, read, find, saveProgress, remove, profileId, decorate });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
