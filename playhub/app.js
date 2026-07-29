"use strict";

const STORAGE_KEY = "swifly.play.state.v1";
const MOTION_KEY = "swifly.play.reduceMotion";

const games = [
  { id: "trivia", name: "Trivia Blitz", category: "brain", tag: "Knowledge", icon: "?", color: "violet", description: "Ten rapid-fire questions across science, tech, geography, and pop culture.", meta: "10 questions · +XP" },
  { id: "memory", name: "Memory Match", category: "brain", tag: "Memory", icon: "🧠", color: "pink", description: "Flip the cards, remember their positions, and clear the board in as few moves as possible.", meta: "16 cards · best moves" },
  { id: "higher-lower", name: "Higher or Lower", category: "quick", tag: "Quick pick", icon: "↕", color: "cyan", description: "Compare surprising numbers and decide whether the hidden value is higher or lower.", meta: "8 rounds · instant" },
  { id: "reaction", name: "Reaction Rush", category: "quick", tag: "Speed", icon: "⚡", color: "orange", description: "Wait for the signal, then tap as fast as possible. Five attempts decide your average.", meta: "5 attempts · timing" },
  { id: "would-you-rather", name: "Would You Rather", category: "party", tag: "Party", icon: "◆", color: "green", description: "Pass the phone around and choose between ridiculous, difficult, and oddly revealing options.", meta: "8 prompts · group play" },
  { id: "word-scramble", name: "Word Scramble", category: "words", tag: "Words", icon: "Aa", color: "blue", description: "Unscramble each word before your hints run out and build the longest correct streak.", meta: "6 words · hints" },
];

const triviaQuestions = [
  { category: "Science", question: "Which planet is the largest in our solar system?", answers: ["Mars", "Jupiter", "Saturn", "Neptune"], correct: 1, explanation: "Jupiter is the largest planet and has more than twice the mass of all the other planets combined." },
  { category: "Technology", question: "What does HTML stand for?", answers: ["HyperText Markup Language", "High Transfer Machine Link", "Home Tool Markup Logic", "Hyperlink Text Management Layer"], correct: 0, explanation: "HTML is HyperText Markup Language, the standard structure language for web pages." },
  { category: "Geography", question: "What is the capital city of Japan?", answers: ["Kyoto", "Osaka", "Tokyo", "Sapporo"], correct: 2, explanation: "Tokyo is Japan's capital and largest metropolitan area." },
  { category: "Technology", question: "How many bits are in one byte?", answers: ["4", "8", "16", "32"], correct: 1, explanation: "A byte is conventionally made of eight bits." },
  { category: "Space", question: "Which planet is commonly called the Red Planet?", answers: ["Venus", "Mercury", "Mars", "Uranus"], correct: 2, explanation: "Iron minerals in Martian soil oxidize and give Mars its reddish appearance." },
  { category: "Web", question: "Which symbol begins a CSS ID selector?", answers: [".", "#", "@", "&"], correct: 1, explanation: "A hash symbol selects an element by its ID in CSS." },
  { category: "Geography", question: "Which is Earth's largest ocean?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3, explanation: "The Pacific Ocean is the largest and deepest ocean basin." },
  { category: "General", question: "How many days are in a leap year?", answers: ["364", "365", "366", "367"], correct: 2, explanation: "A leap year adds February 29, bringing the total to 366 days." },
  { category: "Science", question: "What is the chemical formula for water?", answers: ["CO2", "H2O", "O2", "NaCl"], correct: 1, explanation: "A water molecule contains two hydrogen atoms and one oxygen atom." },
  { category: "Technology", question: "What does CPU stand for?", answers: ["Central Processing Unit", "Computer Power Utility", "Core Program User", "Central Pixel Unit"], correct: 0, explanation: "CPU means Central Processing Unit, the component that executes program instructions." },
  { category: "Games", question: "How many pieces does each player begin with in chess?", answers: ["12", "14", "16", "18"], correct: 2, explanation: "Each chess player begins with sixteen pieces." },
  { category: "Math", question: "How many degrees are in the interior angles of a triangle?", answers: ["90", "180", "270", "360"], correct: 1, explanation: "The interior angles of a triangle add up to 180 degrees." },
  { category: "Animals", question: "Which of these mammals lays eggs?", answers: ["Dolphin", "Platypus", "Kangaroo", "Bat"], correct: 1, explanation: "The platypus is one of the few living egg-laying mammals." },
  { category: "Geography", question: "Rome is the capital of which country?", answers: ["Spain", "Greece", "Italy", "Portugal"], correct: 2, explanation: "Rome is the capital of Italy." },
  { category: "Science", question: "Which travels faster?", answers: ["Sound", "Light", "They are equal", "It depends on color"], correct: 1, explanation: "Light travels vastly faster than sound, which is why lightning is seen before thunder is heard." },
  { category: "Technology", question: "What decimal number does binary 1010 represent?", answers: ["8", "9", "10", "12"], correct: 2, explanation: "Binary 1010 equals 8 + 2, which is 10." },
  { category: "Books", question: "Who wrote the novel 1984?", answers: ["George Orwell", "Aldous Huxley", "Ray Bradbury", "J.R.R. Tolkien"], correct: 0, explanation: "George Orwell wrote 1984." },
  { category: "Color", question: "Which are the primary additive colors of light?", answers: ["Red, yellow, blue", "Red, green, blue", "Cyan, magenta, yellow", "Orange, green, purple"], correct: 1, explanation: "Displays create color by combining red, green, and blue light." },
  { category: "Animals", question: "What is the tallest living land animal?", answers: ["Elephant", "Ostrich", "Giraffe", "Camel"], correct: 2, explanation: "Adult giraffes are the tallest living land animals." },
  { category: "Math", question: "What is the square root of 144?", answers: ["10", "11", "12", "14"], correct: 2, explanation: "Twelve multiplied by twelve equals 144." },
  { category: "Space", question: "The Moon's surface gravity is roughly what fraction of Earth's?", answers: ["One half", "One third", "One sixth", "One tenth"], correct: 2, explanation: "The Moon's surface gravity is about one sixth of Earth's." },
  { category: "JavaScript", question: "Which operator checks strict equality in JavaScript?", answers: ["=", "==", "===", "!="], correct: 2, explanation: "The === operator compares both value and type without coercion." },
  { category: "Math", question: "What is the smallest prime number?", answers: ["0", "1", "2", "3"], correct: 2, explanation: "Two is the smallest prime number and the only even prime." },
  { category: "Music", question: "How many keys are on a standard modern piano?", answers: ["72", "76", "88", "96"], correct: 2, explanation: "A standard modern piano has 88 keys." },
];

const comparisonItems = [
  { label: "Height of Mount Everest", value: 8849, display: "8,849 m" },
  { label: "Depth of the Mariana Trench", value: 10935, display: "10,935 m" },
  { label: "Minutes in one week", value: 10080, display: "10,080" },
  { label: "Keys on a standard piano", value: 88, display: "88" },
  { label: "Elements on the periodic table", value: 118, display: "118" },
  { label: "Squares on a chessboard", value: 64, display: "64" },
  { label: "Bones in an adult human body", value: 206, display: "206" },
  { label: "Countries in the United Nations", value: 193, display: "193" },
  { label: "Seconds in one day", value: 86400, display: "86,400" },
  { label: "Cards in a standard deck", value: 52, display: "52" },
  { label: "Degrees in a full circle", value: 360, display: "360" },
  { label: "Average Earth–Moon distance", value: 384400, display: "384,400 km" },
];

const wouldYouRatherQuestions = [
  ["Be able to pause time for ten seconds", "Rewind time by one minute"],
  ["Always know when someone is lying", "Always get away with one lie a day"],
  ["Explore the deepest ocean", "Visit the surface of Mars"],
  ["Give up music for a year", "Give up movies and shows for a year"],
  ["Have unlimited battery life", "Have perfect Wi-Fi everywhere"],
  ["Only speak in rhymes", "Only communicate through movie quotes"],
  ["Win every board game", "Win every argument"],
  ["Live in a giant treehouse", "Live in a secret underground base"],
  ["Know every language", "Play every musical instrument"],
  ["Have a personal chef", "Have a personal driver"],
];

const wordBank = [
  { word: "galaxy", hint: "A huge system of stars" },
  { word: "pixel", hint: "A tiny unit on a screen" },
  { word: "thunder", hint: "The sound after lightning" },
  { word: "compass", hint: "It helps show direction" },
  { word: "volcano", hint: "A mountain that can erupt" },
  { word: "rhythm", hint: "A repeated musical pattern" },
  { word: "crystal", hint: "A solid with an ordered structure" },
  { word: "journey", hint: "Travel from one place to another" },
  { word: "puzzle", hint: "A problem designed to be solved" },
  { word: "nebula", hint: "A cloud of gas and dust in space" },
  { word: "velocity", hint: "Speed in a given direction" },
  { word: "lantern", hint: "A portable source of light" },
];

const memorySymbols = ["🎮", "🚀", "⚡", "🧠", "🎯", "👾", "🔥", "💎"];
const colorPairs = [["#956cff", "#4fb8ef"], ["#f36bc5", "#7a5cf2"], ["#49d5c0", "#347edb"], ["#ff9d5c", "#ea4f90"], ["#60c3ff", "#5b5ce4"]];

const els = {
  gameGrid: document.getElementById("gameGrid"),
  gameSearch: document.getElementById("gameSearch"),
  emptyResults: document.getElementById("emptyResults"),
  dialog: document.getElementById("gameDialog"),
  dialogTitle: document.getElementById("gameDialogTitle"),
  dialogSubtitle: document.getElementById("gameDialogSubtitle"),
  dialogKicker: document.getElementById("gameDialogKicker"),
  gameBody: document.getElementById("gameBody"),
  toast: document.getElementById("toast"),
};

let activeFilter = "all";
let activeCleanup = null;
let toastTimer = null;
let state = loadState();

function defaultState() {
  return {
    name: "Player",
    xp: 0,
    coins: 0,
    streak: 1,
    lastVisit: "",
    dailyDone: "",
    completed: 0,
    played: {},
    best: {},
    weekly: { key: weekKey(), brain: [], rewarded: false },
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...defaultState(), ...(parsed || {}), weekly: { ...defaultState().weekly, ...((parsed && parsed.weekly) || {}) } };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekKey(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return localDateKey(copy);
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

function touchVisit() {
  const today = localDateKey();
  if (state.lastVisit !== today) {
    state.streak = state.lastVisit === yesterdayKey() ? Math.max(1, state.streak + 1) : 1;
    state.lastVisit = today;
  }
  if (!state.weekly || state.weekly.key !== weekKey()) {
    state.weekly = { key: weekKey(), brain: [], rewarded: false };
  }
  saveState();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setCleanup(callback) {
  if (activeCleanup) activeCleanup();
  activeCleanup = callback || null;
}

function openGame(game, isDaily = false) {
  if (!game) return;
  setCleanup(null);
  els.dialogTitle.textContent = game.name;
  els.dialogSubtitle.textContent = game.description;
  els.dialogKicker.textContent = isDaily ? "DAILY CHALLENGE" : game.tag.toUpperCase();
  els.gameBody.replaceChildren();
  if (!els.dialog.open) els.dialog.showModal();

  const runners = {
    trivia: runTrivia,
    memory: runMemory,
    "higher-lower": runHigherLower,
    reaction: runReaction,
    "would-you-rather": runWouldYouRather,
    "word-scramble": runWordScramble,
  };
  runners[game.id](isDaily);
}

function closeGame() {
  setCleanup(null);
  if (els.dialog.open) els.dialog.close();
  els.gameBody.replaceChildren();
}

function awardGame(gameId, { xp, coins, brain = false, daily = false, bestKey = "", bestValue = null, lowerIsBetter = false }) {
  let earnedXp = xp;
  let earnedCoins = coins;
  state.completed += 1;
  state.played[gameId] = (state.played[gameId] || 0) + 1;

  if (bestKey && bestValue !== null) {
    const previous = state.best[bestKey];
    const improved = previous === undefined || (lowerIsBetter ? bestValue < previous : bestValue > previous);
    if (improved) state.best[bestKey] = bestValue;
  }

  if (brain && !state.weekly.brain.includes(gameId)) {
    state.weekly.brain.push(gameId);
  }

  if (state.weekly.brain.length >= 3 && !state.weekly.rewarded) {
    state.weekly.rewarded = true;
    earnedXp += 300;
    setTimeout(() => showToast("Weekly quest complete · +300 XP"), 600);
  }

  if (daily && state.dailyDone !== localDateKey()) {
    state.dailyDone = localDateKey();
    earnedXp += 150;
    earnedCoins += 40;
  }

  state.xp += earnedXp;
  state.coins += earnedCoins;
  saveState();
  renderDashboard();
  return { earnedXp, earnedCoins };
}

function renderResult({ icon = "🏆", title, message, stats = [], gameId, daily = false, reward }) {
  els.gameBody.innerHTML = `
    <section class="result-screen">
      <div>
        <div class="result-orb" aria-hidden="true">${escapeHtml(icon)}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="result-stats">
          ${stats.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          <span>+${reward.earnedXp} XP</span>
          <span>+${reward.earnedCoins} coins</span>
        </div>
        <div class="result-actions">
          <button class="primary-button" type="button" id="playAgain">Play again</button>
          <button class="secondary-button" type="button" id="finishGame">Back to games</button>
        </div>
      </div>
    </section>`;
  document.getElementById("playAgain").addEventListener("click", () => openGame(games.find((game) => game.id === gameId), false));
  document.getElementById("finishGame").addEventListener("click", closeGame);
  if (daily) showToast("Daily challenge complete — streak secured!");
}

function renderGameCards() {
  const query = els.gameSearch.value.trim().toLowerCase();
  const filtered = games.filter((game) => {
    const matchesFilter = activeFilter === "all" || game.category === activeFilter;
    const matchesSearch = !query || `${game.name} ${game.description} ${game.tag}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  els.gameGrid.innerHTML = filtered.map((game) => `
    <article class="game-card glow-${game.color}">
      <div class="game-card-head">
        <div class="game-icon ${game.color}" aria-hidden="true">${escapeHtml(game.icon)}</div>
        <span class="game-tag">${escapeHtml(game.tag)}</span>
      </div>
      <h3>${escapeHtml(game.name)}</h3>
      <p>${escapeHtml(game.description)}</p>
      <div class="game-card-footer">
        <span>${escapeHtml(game.meta)}</span>
        <button class="play-card-button" type="button" data-play="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.name)}">▶</button>
      </div>
    </article>`).join("");
  els.emptyResults.hidden = filtered.length > 0;
}

function renderDashboard() {
  document.getElementById("streakValue").textContent = state.streak;
  document.getElementById("xpValue").textContent = state.xp.toLocaleString();
  document.getElementById("coinValue").textContent = state.coins.toLocaleString();
  document.getElementById("gamesValue").textContent = state.completed.toLocaleString();
  document.getElementById("headerName").textContent = state.name;
  document.getElementById("headerAvatar").textContent = (state.name.trim()[0] || "P").toUpperCase();

  const brainCount = Math.min(3, state.weekly.brain.length);
  document.getElementById("questText").textContent = `${brainCount} / 3 games`;
  document.getElementById("questProgress").style.width = `${(brainCount / 3) * 100}%`;

  const done = state.dailyDone === localDateKey();
  document.getElementById("dailyStatus").textContent = done ? "Completed today" : "Not completed";
  const dailyButton = document.getElementById("dailyButton");
  dailyButton.textContent = done ? "Play again" : "Start challenge";
  renderLeaderboard();
}

function dailyGame() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((new Date() - start) / 86400000);
  return games[day % games.length];
}

function renderDaily() {
  const game = dailyGame();
  document.getElementById("dailyName").textContent = game.name;
  document.getElementById("dailyDescription").textContent = `${game.description} Complete it today for the daily bonus.`;
  document.getElementById("dailyArt").innerHTML = `<span>${escapeHtml(game.icon)}</span>`;
}

function renderLeaderboard() {
  const seeded = [
    { name: "Nova", xp: 3250 },
    { name: "PixelPilot", xp: 2460 },
    { name: "QuizKid", xp: 1780 },
    { name: "Brainwave", xp: 1210 },
    { name: "NightOwl", xp: 760 },
  ];
  const rows = [...seeded, { name: state.name, xp: state.xp, you: true }].sort((a, b) => b.xp - a.xp).slice(0, 6);
  const container = document.getElementById("leaderboardList");
  container.innerHTML = rows.map((row, index) => {
    const colors = colorPairs[index % colorPairs.length];
    return `<div class="leader-row${row.you ? " you" : ""}">
      <div class="rank-number">${index + 1}</div>
      <div class="leader-profile">
        <span class="leader-avatar" style="--leader-a:${colors[0]};--leader-b:${colors[1]}">${escapeHtml(row.name.trim()[0] || "P")}</span>
        <div><strong>${escapeHtml(row.name)}${row.you ? " (You)" : ""}</strong><small>Level ${Math.floor(row.xp / 500) + 1}</small></div>
      </div>
      <div class="leader-score"><strong>${row.xp.toLocaleString()} XP</strong><small>${row.you ? "Your local score" : "Demo rival"}</small></div>
    </div>`;
  }).join("");
}

function runTrivia(isDaily) {
  const questions = shuffle(triviaQuestions).slice(0, isDaily ? 5 : 10);
  let index = 0;
  let score = 0;
  let locked = false;

  function draw() {
    locked = false;
    const item = questions[index];
    els.gameBody.innerHTML = `
      <section class="game-stage">
        <div class="game-progress-row"><span>Question ${index + 1} of ${questions.length}</span><span>${score} correct</span></div>
        <div class="game-progress-track"><span style="width:${(index / questions.length) * 100}%"></span></div>
        <div class="question"><span class="question-badge">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.question)}</h3><p>Choose an answer or press 1–4.</p></div>
        <div class="answer-grid">
          ${item.answers.map((answer, answerIndex) => `<button class="answer-button" type="button" data-answer="${answerIndex}"><span class="answer-letter">${answerIndex + 1}</span><span>${escapeHtml(answer)}</span></button>`).join("")}
        </div>
        <div id="triviaFeedback"></div>
      </section>`;

    els.gameBody.querySelectorAll("[data-answer]").forEach((button) => {
      button.addEventListener("click", () => answer(Number(button.dataset.answer)));
    });
  }

  function answer(selected) {
    if (locked) return;
    locked = true;
    const item = questions[index];
    const correct = selected === item.correct;
    if (correct) score += 1;
    const buttons = [...els.gameBody.querySelectorAll("[data-answer]")];
    buttons.forEach((button, buttonIndex) => {
      button.disabled = true;
      if (buttonIndex === item.correct) button.classList.add("correct");
      else if (buttonIndex === selected) button.classList.add("wrong");
    });
    const feedback = document.getElementById("triviaFeedback");
    feedback.innerHTML = `<div class="feedback-panel"><strong>${correct ? "Correct!" : "Not quite."}</strong> ${escapeHtml(item.explanation)}</div><button class="primary-button game-next" id="nextQuestion" type="button">${index + 1 === questions.length ? "See results" : "Next question"}</button>`;
    document.getElementById("nextQuestion").addEventListener("click", next);
  }

  function next() {
    index += 1;
    if (index < questions.length) return draw();
    setCleanup(null);
    const reward = awardGame("trivia", { xp: score * 22 + 50, coins: score * 3 + 8, brain: true, daily: isDaily, bestKey: "trivia", bestValue: score });
    renderResult({ icon: score >= questions.length * .8 ? "🏆" : "✦", title: `${score} out of ${questions.length}`, message: score >= questions.length * .8 ? "That was a seriously strong trivia run." : "Nice run. Every replay pulls a different mix of questions.", stats: [`${Math.round((score / questions.length) * 100)}% accuracy`], gameId: "trivia", daily: isDaily, reward });
  }

  const keyHandler = (event) => {
    if (!els.dialog.open || locked) return;
    const number = Number(event.key);
    if (number >= 1 && number <= 4) {
      const button = els.gameBody.querySelector(`[data-answer="${number - 1}"]`);
      if (button) button.click();
    }
  };
  document.addEventListener("keydown", keyHandler);
  setCleanup(() => document.removeEventListener("keydown", keyHandler));
  draw();
}

function runMemory(isDaily) {
  const deck = shuffle([...memorySymbols, ...memorySymbols].map((symbol, index) => ({ symbol, id: `${symbol}-${index}` })));
  let first = null;
  let second = null;
  let locked = false;
  let matched = 0;
  let moves = 0;
  const startedAt = Date.now();
  let timer = null;

  els.gameBody.innerHTML = `
    <section class="game-stage">
      <div class="game-progress-row"><span id="memoryMoves">0 moves</span><span id="memoryTime">0s</span></div>
      <div class="game-progress-track"><span id="memoryProgress" style="width:0"></span></div>
      <div class="memory-grid">
        ${deck.map((card, index) => `<button class="memory-card" type="button" data-memory="${index}" aria-label="Hidden memory card">${card.symbol}</button>`).join("")}
      </div>
    </section>`;

  function elapsedSeconds() { return Math.max(1, Math.round((Date.now() - startedAt) / 1000)); }
  timer = setInterval(() => {
    const node = document.getElementById("memoryTime");
    if (node) node.textContent = `${elapsedSeconds()}s`;
  }, 500);
  setCleanup(() => clearInterval(timer));

  els.gameBody.querySelectorAll("[data-memory]").forEach((button) => {
    button.addEventListener("click", () => flip(button));
  });

  function flip(button) {
    if (locked || button.classList.contains("matched") || button === first) return;
    button.classList.add("flipped");
    button.setAttribute("aria-label", `Card showing ${button.textContent}`);
    if (!first) {
      first = button;
      return;
    }
    second = button;
    moves += 1;
    document.getElementById("memoryMoves").textContent = `${moves} moves`;
    const firstCard = deck[Number(first.dataset.memory)];
    const secondCard = deck[Number(second.dataset.memory)];
    if (firstCard.symbol === secondCard.symbol) {
      first.classList.add("matched");
      second.classList.add("matched");
      matched += 2;
      document.getElementById("memoryProgress").style.width = `${(matched / deck.length) * 100}%`;
      first = null;
      second = null;
      if (matched === deck.length) finish();
    } else {
      locked = true;
      setTimeout(() => {
        first.classList.remove("flipped");
        second.classList.remove("flipped");
        first.setAttribute("aria-label", "Hidden memory card");
        second.setAttribute("aria-label", "Hidden memory card");
        first = null;
        second = null;
        locked = false;
      }, 700);
    }
  }

  function finish() {
    const seconds = elapsedSeconds();
    setCleanup(null);
    const reward = awardGame("memory", { xp: Math.max(90, 270 - moves * 7), coins: Math.max(12, 45 - moves), brain: true, daily: isDaily, bestKey: "memoryMoves", bestValue: moves, lowerIsBetter: true });
    renderResult({ icon: "🧠", title: "Board cleared", message: "You found every pair. Fewer moves means a stronger memory score.", stats: [`${moves} moves`, `${seconds} seconds`], gameId: "memory", daily: isDaily, reward });
  }
}

function runHigherLower(isDaily) {
  let round = 0;
  let score = 0;
  let currentPair = [];
  const totalRounds = 8;

  function newPair() {
    currentPair = shuffle(comparisonItems).slice(0, 2);
    if (currentPair[0].value === currentPair[1].value) return newPair();
    draw();
  }

  function draw() {
    const [left, right] = currentPair;
    els.gameBody.innerHTML = `
      <section class="game-stage">
        <div class="game-progress-row"><span>Round ${round + 1} of ${totalRounds}</span><span>${score} correct</span></div>
        <div class="game-progress-track"><span style="width:${(round / totalRounds) * 100}%"></span></div>
        <div class="comparison">
          <article class="comparison-card"><small>KNOWN VALUE</small><h3>${escapeHtml(left.label)}</h3><strong>${escapeHtml(left.display)}</strong></article>
          <div class="versus">VS</div>
          <article class="comparison-card hidden-value"><small>HIDDEN VALUE</small><h3>${escapeHtml(right.label)}</h3><strong id="hiddenComparison">${escapeHtml(right.display)}</strong></article>
        </div>
        <div class="choice-row"><button class="secondary-button" type="button" data-choice="lower">Lower ↓</button><button class="primary-button" type="button" data-choice="higher">Higher ↑</button></div>
        <div id="compareFeedback"></div>
      </section>`;
    els.gameBody.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => choose(button.dataset.choice)));
  }

  function choose(choice) {
    const [left, right] = currentPair;
    const correctChoice = right.value > left.value ? "higher" : "lower";
    const correct = choice === correctChoice;
    if (correct) score += 1;
    document.querySelectorAll("[data-choice]").forEach((button) => { button.disabled = true; });
    els.gameBody.querySelector(".hidden-value").classList.remove("hidden-value");
    document.getElementById("compareFeedback").innerHTML = `<div class="feedback-panel"><strong>${correct ? "Correct." : "Wrong pick."}</strong> ${escapeHtml(right.label)} is ${escapeHtml(right.display)}.</div><button class="primary-button game-next" id="nextCompare" type="button">${round + 1 === totalRounds ? "See results" : "Next round"}</button>`;
    document.getElementById("nextCompare").addEventListener("click", () => {
      round += 1;
      if (round < totalRounds) newPair(); else finish();
    });
  }

  function finish() {
    const reward = awardGame("higher-lower", { xp: score * 20 + 45, coins: score * 3 + 7, daily: isDaily, bestKey: "higherLower", bestValue: score });
    renderResult({ icon: "↕", title: `${score} of ${totalRounds}`, message: "Your instincts survived a collection of wildly different numbers.", stats: [`${Math.round((score / totalRounds) * 100)}% accuracy`], gameId: "higher-lower", daily: isDaily, reward });
  }

  newPair();
}

function runReaction(isDaily) {
  let attempts = [];
  let timeout = null;
  let readyAt = 0;
  let phase = "start";

  els.gameBody.innerHTML = `<section class="game-stage"><div class="game-progress-row"><span id="reactionCount">Attempt 1 of 5</span><span id="reactionBest">Best: —</span></div><div class="game-progress-track"><span id="reactionProgress" style="width:0"></span></div><button class="reaction-zone" id="reactionZone" type="button"><div><h3>Start test</h3><p>Click here, then wait for green. Spacebar works too.</p></div></button></section>`;
  const zone = document.getElementById("reactionZone");
  zone.addEventListener("click", handleClick);
  const keyHandler = (event) => {
    if (event.code === "Space" && els.dialog.open) {
      event.preventDefault();
      zone.click();
    }
  };
  document.addEventListener("keydown", keyHandler);
  setCleanup(() => { clearTimeout(timeout); document.removeEventListener("keydown", keyHandler); });

  function handleClick() {
    if (phase === "start" || phase === "result") return beginWait();
    if (phase === "waiting") {
      clearTimeout(timeout);
      phase = "start";
      zone.className = "reaction-zone waiting";
      zone.innerHTML = "<div><h3>Too early!</h3><p>Tap to try this attempt again.</p></div>";
      return;
    }
    if (phase === "ready") {
      const reaction = Math.round(performance.now() - readyAt);
      attempts.push(reaction);
      phase = "result";
      zone.className = "reaction-zone";
      zone.innerHTML = `<div><h3>${reaction} ms</h3><p>${attempts.length < 5 ? "Tap for the next attempt." : "Calculating your average…"}</p></div>`;
      document.getElementById("reactionProgress").style.width = `${(attempts.length / 5) * 100}%`;
      document.getElementById("reactionBest").textContent = `Best: ${Math.min(...attempts)} ms`;
      if (attempts.length >= 5) setTimeout(finish, 700);
      else document.getElementById("reactionCount").textContent = `Attempt ${attempts.length + 1} of 5`;
    }
  }

  function beginWait() {
    phase = "waiting";
    zone.className = "reaction-zone waiting";
    zone.innerHTML = "<div><h3>Wait…</h3><p>Do not tap until the panel turns green.</p></div>";
    timeout = setTimeout(() => {
      phase = "ready";
      readyAt = performance.now();
      zone.className = "reaction-zone ready";
      zone.innerHTML = "<div><h3>TAP!</h3><p>Now!</p></div>";
    }, 1400 + Math.random() * 2600);
  }

  function finish() {
    setCleanup(null);
    const average = Math.round(attempts.reduce((sum, value) => sum + value, 0) / attempts.length);
    const best = Math.min(...attempts);
    const reward = awardGame("reaction", { xp: Math.max(70, 280 - Math.round(average / 2)), coins: Math.max(10, 55 - Math.round(average / 12)), daily: isDaily, bestKey: "reaction", bestValue: average, lowerIsBetter: true });
    renderResult({ icon: "⚡", title: `${average} ms average`, message: average < 260 ? "That is a genuinely quick reaction run." : "Solid attempt. Anticipating the signal usually makes it worse, so stay relaxed.", stats: [`Best ${best} ms`, "5 attempts"], gameId: "reaction", daily: isDaily, reward });
  }
}

function runWouldYouRather(isDaily) {
  const questions = shuffle(wouldYouRatherQuestions).slice(0, 8);
  let index = 0;
  let choices = 0;

  function draw() {
    const [left, right] = questions[index];
    els.gameBody.innerHTML = `
      <section class="game-stage">
        <div class="game-progress-row"><span>Prompt ${index + 1} of ${questions.length}</span><span>No wrong answers</span></div>
        <div class="game-progress-track"><span style="width:${(index / questions.length) * 100}%"></span></div>
        <div class="question"><span class="question-badge">WOULD YOU RATHER</span><h3>Choose one.</h3><p>Pass the phone after every pick for party mode.</p></div>
        <div class="wyr-options"><button class="wyr-button" type="button" data-wyr="0">${escapeHtml(left)}</button><button class="wyr-button" type="button" data-wyr="1">${escapeHtml(right)}</button></div>
        <div id="wyrResult"></div>
      </section>`;
    els.gameBody.querySelectorAll("[data-wyr]").forEach((button) => button.addEventListener("click", () => choose(Number(button.dataset.wyr))));
  }

  function choose(selected) {
    choices += 1;
    const leftPercent = 34 + ((index * 17 + 11) % 33);
    const rightPercent = 100 - leftPercent;
    els.gameBody.querySelectorAll("[data-wyr]").forEach((button) => { button.disabled = true; });
    document.getElementById("wyrResult").innerHTML = `<div class="feedback-panel"><strong>Your pick: option ${selected + 1}.</strong> Fun crowd estimate: ${leftPercent}% chose option one and ${rightPercent}% chose option two.<div class="poll-result"><span style="width:${leftPercent}%"></span></div></div><button class="primary-button game-next" id="nextWyr" type="button">${index + 1 === questions.length ? "Finish" : "Next prompt"}</button>`;
    document.getElementById("nextWyr").addEventListener("click", () => {
      index += 1;
      if (index < questions.length) draw(); else finish();
    });
  }

  function finish() {
    const reward = awardGame("would-you-rather", { xp: 95, coins: 18, daily: isDaily });
    renderResult({ icon: "◆", title: "Choices locked in", message: "You made it through every impossible decision. Hand it to someone else and compare answers.", stats: [`${choices} choices`], gameId: "would-you-rather", daily: isDaily, reward });
  }

  draw();
}

function runWordScramble(isDaily) {
  const words = shuffle(wordBank).slice(0, 6);
  let index = 0;
  let score = 0;
  let hints = 2;

  function scrambled(word) {
    let result = shuffle(word.split("")).join("");
    if (result === word) result = word.slice(1) + word[0];
    return result;
  }

  function draw() {
    const item = words[index];
    const letters = scrambled(item.word);
    els.gameBody.innerHTML = `
      <section class="game-stage">
        <div class="game-progress-row"><span>Word ${index + 1} of ${words.length}</span><span>${score} correct · ${hints} hints</span></div>
        <div class="game-progress-track"><span style="width:${(index / words.length) * 100}%"></span></div>
        <div class="word-stage">
          <span class="question-badge">UNSCRAMBLE</span>
          <div class="scrambled-word">${escapeHtml(letters)}</div>
          <p class="word-hint" id="wordHint">The word has ${item.word.length} letters.</p>
          <form class="word-form" id="wordForm"><input id="wordInput" autocomplete="off" spellcheck="false" placeholder="Type your answer" aria-label="Your answer" /><button class="primary-button" type="submit">Check</button></form>
          <button class="secondary-button" id="useHint" type="button" style="margin-top:10px">Use hint</button>
          <div id="wordFeedback"></div>
        </div>
      </section>`;
    const input = document.getElementById("wordInput");
    input.focus();
    document.getElementById("wordForm").addEventListener("submit", (event) => {
      event.preventDefault();
      check(input.value);
    });
    document.getElementById("useHint").addEventListener("click", () => {
      if (hints <= 0) return showToast("No hints left this run.");
      hints -= 1;
      document.getElementById("wordHint").textContent = item.hint;
      document.getElementById("useHint").disabled = true;
    });
  }

  function check(value) {
    const item = words[index];
    const correct = value.trim().toLowerCase() === item.word;
    if (correct) score += 1;
    document.getElementById("wordForm").querySelectorAll("input,button").forEach((node) => { node.disabled = true; });
    document.getElementById("wordFeedback").innerHTML = `<div class="feedback-panel"><strong>${correct ? "Correct!" : "The answer was " + escapeHtml(item.word) + "."}</strong> ${correct ? "Nice unscramble." : "You will get a new mix next round."}</div><button class="primary-button game-next" id="nextWord" type="button">${index + 1 === words.length ? "See results" : "Next word"}</button>`;
    document.getElementById("nextWord").addEventListener("click", () => {
      index += 1;
      if (index < words.length) draw(); else finish();
    });
  }

  function finish() {
    const reward = awardGame("word-scramble", { xp: score * 26 + 45, coins: score * 4 + hints * 2, brain: true, daily: isDaily, bestKey: "wordScramble", bestValue: score });
    renderResult({ icon: "Aa", title: `${score} of ${words.length}`, message: "Your word run is complete. Unused hints added a small coin bonus.", stats: [`${hints} hints left`], gameId: "word-scramble", daily: isDaily, reward });
  }

  draw();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const playButton = event.target.closest("[data-play]");
    if (playButton) {
      const game = games.find((item) => item.id === playButton.dataset.play);
      if (game) openGame(game, false);
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderGameCards();
    });
  });

  els.gameSearch.addEventListener("input", renderGameCards);
  document.getElementById("dailyButton").addEventListener("click", () => openGame(dailyGame(), true));
  document.getElementById("closeDialog").addEventListener("click", closeGame);
  els.dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeGame(); });
  els.dialog.addEventListener("click", (event) => { if (event.target === els.dialog) closeGame(); });

  document.getElementById("editProfile").addEventListener("click", () => {
    const nextName = window.prompt("What should your player name be?", state.name);
    if (!nextName) return;
    state.name = nextName.trim().slice(0, 24) || "Player";
    saveState();
    renderDashboard();
    showToast("Player name updated.");
  });

  document.getElementById("motionToggle").addEventListener("click", () => {
    document.body.classList.toggle("reduce-motion");
    const reduced = document.body.classList.contains("reduce-motion");
    try { localStorage.setItem(MOTION_KEY, reduced ? "true" : "false"); } catch {}
    showToast(reduced ? "Motion reduced." : "Motion restored.");
  });
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.siteName) document.title = config.siteName;
  } catch {}
}

function init() {
  touchVisit();
  try {
    if (localStorage.getItem(MOTION_KEY) === "true") document.body.classList.add("reduce-motion");
  } catch {}
  renderGameCards();
  renderDaily();
  renderDashboard();
  bindEvents();
  loadConfig();
}

init();
