"use strict";

(() => {
  const LIST_KEY = "swifly.games.list.v1";
  const LIKE_KEY = "swifly.games.likes.v1";

  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function write(key, values) {
    try { localStorage.setItem(key, JSON.stringify([...new Set(values)])); } catch {}
  }

  function toggle(key, id) {
    const values = read(key);
    const index = values.indexOf(id);
    if (index >= 0) values.splice(index, 1);
    else values.push(id);
    write(key, values);
    updateButtons();
    updateLibrary();
    return index < 0;
  }

  function updateButtons() {
    const listed = new Set(read(LIST_KEY));
    const liked = new Set(read(LIKE_KEY));
    document.querySelectorAll("[data-game-list]").forEach((button) => {
      const active = listed.has(button.dataset.gameList);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      if (button.classList.contains("dsMiniBtn")) button.textContent = active ? "✓" : "＋";
      else button.textContent = active ? "✓ In My List" : "＋ My List";
    });
    document.querySelectorAll("[data-game-like]").forEach((button) => {
      const active = liked.has(button.dataset.gameLike);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      if (button.classList.contains("dsMiniBtn")) button.textContent = active ? "♥" : "♡";
      else button.textContent = active ? "♥ Liked" : "♡ Like";
    });
  }

  function updateLibrary() {
    const page = document.querySelector("[data-game-library-page]");
    if (!page) return;
    const key = page.dataset.gameLibraryPage === "liked" ? LIKE_KEY : LIST_KEY;
    const saved = new Set(read(key));
    let visible = 0;
    document.querySelectorAll("[data-game-library-id]").forEach((card) => {
      const show = saved.has(card.dataset.gameLibraryId);
      card.hidden = !show;
      if (show) visible += 1;
    });
    const empty = document.getElementById("gameModeLibraryEmpty");
    if (empty) empty.hidden = visible > 0;
  }

  function setupImageFallbacks(root = document) {
    root.querySelectorAll("img[data-game-image]:not([data-game-image-ready])").forEach((img) => {
      img.dataset.gameImageReady = "true";
      let fallbacks = [];
      try { fallbacks = JSON.parse(img.dataset.gameFallbacks || "[]"); } catch {}
      img.addEventListener("error", () => {
        const next = fallbacks.shift();
        if (next) img.src = next;
      });
    });
  }

  function randomGame() {
    fetch("/api/game-catalog")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog failed")))
      .then((data) => {
        const games = Array.isArray(data.games) ? data.games : [];
        if (!games.length) return;
        const game = games[Math.floor(Math.random() * games.length)];
        window.location.href = `/watch/movie/${encodeURIComponent(game.id)}?mode=game`;
      })
      .catch(() => { window.location.href = "/movies"; });
  }

  document.addEventListener("click", (event) => {
    const listButton = event.target.closest("[data-game-list]");
    if (listButton) {
      event.preventDefault();
      event.stopPropagation();
      toggle(LIST_KEY, listButton.dataset.gameList);
      return;
    }

    const likeButton = event.target.closest("[data-game-like]");
    if (likeButton) {
      event.preventDefault();
      event.stopPropagation();
      toggle(LIKE_KEY, likeButton.dataset.gameLike);
      return;
    }

    const infoButton = event.target.closest("[data-game-info]");
    if (infoButton) {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = `/movie/${encodeURIComponent(infoButton.dataset.gameInfo)}`;
      return;
    }

    if (event.target.closest("[data-game-random]")) {
      event.preventDefault();
      randomGame();
      return;
    }

    if (event.target.closest("[data-game-fullscreen]")) {
      event.preventDefault();
      const target = document.getElementById("gameModeFrameWrap");
      if (target && target.requestFullscreen) target.requestFullscreen().catch(() => {});
      return;
    }

    if (event.target.closest("[data-game-reload]")) {
      event.preventDefault();
      const frame = document.getElementById("gameModeFrame");
      if (frame) frame.src = frame.src;
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    setupImageFallbacks();
    updateButtons();
    updateLibrary();
    const frame = document.getElementById("gameModeFrame");
    if (frame) frame.addEventListener("load", () => document.querySelector(".gameModeFrameLoading")?.classList.add("hidden"));
  });
})();
