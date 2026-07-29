"use strict";

const STORAGE_KEY = "swiflytv.play.v1";
const games = [
  { id: "trivia", name: "Trivia Blitz", category: "brain", tag: "Knowledge", icon: "?", a: "#a56eff", b: "#5b4ce9", glow: "#7d59ef", description: "Five fast questions from science, technology, geography, entertainment, and general knowledge.", meta: "5 questions · keyboard friendly" },
  { id: "memory", name: "Memory Grid", category: "brain", tag: "Memory", icon: "🧠", a: "#f16bc5", b: "#7958ed", glow: "#df58bc", description: "Flip the glass tiles, remember their positions, and clear every matching pair.", meta: "12 cards · best moves" },
  { id: "reaction", name: "Reaction Rush", category: "quick", tag: "Speed", icon: "⚡", a: "#ffb25d", b: "#ef684a", glow: "#ff864f", description: "Wait for the portal to turn green, then hit it before your brain has time to overthink.", meta: "5 attempts · timing" },
  { id: "this-or-that", name: "This or That", category: "party", tag: "Choices", icon: "◆", a: "#58e0b2", b: "#238dc6", glow: "#35caa5", description: "Impossible choices for date nights, group calls, road trips, and late-night arguments.", meta: "8 prompts · pass the phone" },
  { id: "emoji", name: "Emoji Decoder", category: "brain", tag: "Puzzle", icon: "😵", a: "#6bc8ff", b: "#5556e5", glow: "#4f9ff3", description: "Translate strange emoji chains into familiar phrases, objects, places, and ideas.", meta: "6 puzzles · optional hints" },
  { id: "story", name: "Story Spinner", category: "creative", tag: "Creative", icon: "✦", a: "#ff76d4", b: "#895bee", glow: "#e859bd", description: "Generate chaotic story setups for friends, voice calls, drawing challenges, or writing.", meta: "Unlimited prompts · no score" },
];

const trivia = [
  { q: "Which planet is the largest in our solar system?", a: ["Mars", "Jupiter", "Saturn", "Neptune"], c: 1, note: "Jupiter is the largest planet in the solar system." },
  { q: "What does HTML stand for?", a: ["HyperText Markup Language", "High Transfer Machine Link", "Home Tool Markup Logic", "Hyperlink Text Management Layer"], c: 0, note: "HTML is the standard markup language used to structure web pages." },
  { q: "How many bits are in one byte?", a: ["4", "8", "16", "32"], c: 1, note: "A conventional byte contains eight bits." },
  { q: "What is the capital of Japan?", a: ["Kyoto", "Tokyo", "Osaka", "Sapporo"], c: 1, note: "Tokyo is Japan’s capital city." },
  { q: "Which ocean is the largest?", a: ["Atlantic", "Indian", "Pacific", "Arctic"], c: 2, note: "The Pacific is Earth’s largest ocean basin." },
  { q: "Which operator checks strict equality in JavaScript?", a: ["=", "==", "===", "!="], c: 2, note: "The === operator compares value and type without coercion." },
  { q: "What is the smallest prime number?", a: ["0", "1", "2", "3"], c: 2, note: "Two is the smallest prime and the only even prime." },
  { q: "How many keys are on a standard modern piano?", a: ["72", "76", "88", "96"], c: 2, note: "A standard modern piano has 88 keys." },
  { q: "What is the chemical formula for water?", a: ["CO2", "H2O", "O2", "NaCl"], c: 1, note: "Water contains two hydrogen atoms and one oxygen atom." },
  { q: "How many degrees are in the interior angles of a triangle?", a: ["90", "180", "270", "360"], c: 1, note: "A triangle’s interior angles total 180 degrees." },
];

const thisOrThat = [
  ["Pause time for ten seconds", "Rewind time by one minute"],
  ["Perfect Wi-Fi everywhere", "Unlimited battery life"],
  ["Explore the deepest ocean", "Walk on the surface of Mars"],
  ["Know every language", "Play every instrument"],
  ["Live in a giant treehouse", "Live in a secret underground base"],
  ["Always know when someone lies", "Get away with one lie every day"],
  ["Win every game", "Win every argument"],
  ["Give up music for a year", "Give up movies and shows for a year"],
  ["Have a personal chef", "Have a personal driver"],
  ["Only speak in rhymes", "Only communicate with reaction images"],
];

const emojiPuzzles = [
  { e: "🌧️🐱🐶", answer: "raining cats and dogs", hint: "A phrase about very heavy rain" },
  { e: "⏰💰", answer: "time is money", hint: "A common phrase about productivity" },
  { e: "🧊☕", answer: "iced coffee", hint: "A cold caffeinated drink" },
  { e: "🌙🦉", answer: "night owl", hint: "Someone who stays awake late" },
  { e: "📖🐛", answer: "bookworm", hint: "Someone who loves reading" },
  { e: "🔥🚒", answer: "fire truck", hint: "An emergency vehicle" },
  { e: "⭐🐟", answer: "starfish", hint: "A sea animal" },
  { e: "🍎🥧", answer: "apple pie", hint: "A familiar dessert" },
];

const storyCharacters = ["a retired superhero", "a suspicious youth pastor", "an alien delivery driver", "a time-traveling substitute teacher", "a talking vending machine", "a knight who is terrified of horses", "a detective who can only communicate through emojis", "a gamer trapped inside a loading screen"];
const storyPlaces = ["an abandoned mall at midnight", "a Minecraft church floating above the clouds", "a town where nobody can lie", "the final open Blockbuster", "a school that resets every twenty-four hours", "a theme park hidden underground", "a spaceship powered by energy drinks", "a group chat that became a real place"];
const storyProblems = ["must prevent tomorrow from being deleted", "accidentally starts a cult around a household object", "discovers every mirror leads somewhere different", "has ten minutes to explain the internet to medieval villagers", "must win a talent show against an evil clone", "finds a button labeled DO NOT PRESS and presses it", "needs to solve a mystery before the Wi-Fi returns", "is followed by an increasingly polite monster"];
const symbols = ["🎮", "🚀", "⚡", "🧠", "🎯", "👾"];

const state = loadState();
let activeFilter = "all";
let activeCleanup = null;
let toastTimer = null;

const page = document.querySelector(".swPlayPage");
if (page) init();

function defaultState() {
  return { xp: 0, wins: 0, streak: 1, lastVisit: "", dailyDone: "", played: {}, quest: [] };
}

function loadState() {
  try { return { ...defaultState(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}) }; }
  catch { return defaultState(); }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function init() {
  updateVisit();
  renderCards();
  renderDaily();
  renderStats();
  bindEvents();
}

function updateVisit() {
  const today = dateKey();
  if (state.lastVisit !== today) {
    state.streak = state.lastVisit === yesterdayKey() ? Math.max(1, Number(state.streak || 1) + 1) : 1;
    state.lastVisit = today;
    saveState();
  }
}

function renderCards() {
  const grid = document.getElementById("swPlayGrid");
  const search = document.getElementById("swPlaySearch").value.trim().toLowerCase();
  const filtered = games.filter((game) => (activeFilter === "all" || game.category === activeFilter) && (!search || `${game.name} ${game.description} ${game.tag}`.toLowerCase().includes(search)));
  grid.innerHTML = filtered.map((game) => `<article class="swPlayCard" style="--swPlayA:${game.a};--swPlayB:${game.b};--swPlayGlow:${game.glow}">
    <div class="swPlayCardHead"><span class="swPlayCardIcon">${escapeHtml(game.icon)}</span><span class="swPlayCardTag">${escapeHtml(game.tag)}</span></div>
    <h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description)}</p>
    <div class="swPlayCardFoot"><span>${escapeHtml(game.meta)}</span><button type="button" data-sw-play="${escapeHtml(game.id)}" aria-label="Open ${escapeHtml(game.name)}">▶</button></div>
  </article>`).join("");
  document.getElementById("swPlayEmpty").hidden = filtered.length > 0;
}

function dailyGame() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((new Date() - start) / 86400000);
  return games.filter((game) => game.id !== "story")[day % 5];
}

function renderDaily() {
  const game = dailyGame();
  document.getElementById("swPlayDailyIcon").textContent = game.icon;
  document.getElementById("swPlayDailyName").textContent = game.name;
  document.getElementById("swPlayDailyDescription").textContent = `${game.description} Complete it today for the daily bonus.`;
  document.getElementById("swPlayDailyStatus").textContent = state.dailyDone === dateKey() ? "Completed today" : "Not completed";
}

function renderStats() {
  document.getElementById("swPlayXp").textContent = Number(state.xp || 0).toLocaleString();
  document.getElementById("swPlayStreak").textContent = state.streak || 1;
  document.getElementById("swPlayWins").textContent = state.wins || 0;
  const unique = new Set(state.quest || []).size;
  document.getElementById("swPlayQuestText").textContent = `${Math.min(3, unique)} / 3 complete`;
  document.getElementById("swPlayQuestProgress").style.width = `${Math.min(100, unique / 3 * 100)}%`;
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-sw-play]");
    if (!opener) return;
    const id = opener.dataset.swPlay;
    openGame(id === "daily" ? dailyGame().id : id, id === "daily");
  });

  document.querySelectorAll("[data-sw-filter]").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.swFilter;
    document.querySelectorAll("[data-sw-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderCards();
  }));

  document.getElementById("swPlaySearch").addEventListener("input", renderCards);
  document.getElementById("swPlayDailyButton").addEventListener("click", () => openGame(dailyGame().id, true));
  document.getElementById("swPlaySurprise").addEventListener("click", () => openGame(games[Math.floor(Math.random() * games.length)].id, false));
  document.getElementById("swPlayDialogClose").addEventListener("click", closeGame);
  const dialog = document.getElementById("swPlayDialog");
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeGame(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeGame(); });
}

function openGame(id, daily = false) {
  const game = games.find((item) => item.id === id);
  if (!game) return;
  if (activeCleanup) activeCleanup();
  activeCleanup = null;
  const dialog = document.getElementById("swPlayDialog");
  document.getElementById("swPlayDialogKicker").textContent = daily ? "Daily challenge" : game.tag;
  document.getElementById("swPlayDialogTitle").textContent = game.name;
  document.getElementById("swPlayDialogSubtitle").textContent = game.description;
  document.getElementById("swPlayDialogBody").replaceChildren();
  if (!dialog.open) dialog.showModal();
  ({ trivia: runTrivia, memory: runMemory, reaction: runReaction, "this-or-that": runThisOrThat, emoji: runEmoji, story: runStory }[id])(daily);
}

function closeGame() {
  if (activeCleanup) activeCleanup();
  activeCleanup = null;
  const dialog = document.getElementById("swPlayDialog");
  if (dialog.open) dialog.close();
  document.getElementById("swPlayDialogBody").replaceChildren();
}

function award(id, xp, daily) {
  let earned = xp;
  state.wins = Number(state.wins || 0) + 1;
  state.played[id] = Number(state.played[id] || 0) + 1;
  state.quest = Array.from(new Set([...(state.quest || []), id]));
  if (new Set(state.quest).size === 3 && !state.questRewarded) {
    earned += 300;
    state.questRewarded = true;
    setTimeout(() => toast("Weekly quest complete · +300 XP"), 500);
  }
  if (daily && state.dailyDone !== dateKey()) {
    earned += 150;
    state.dailyDone = dateKey();
  }
  state.xp = Number(state.xp || 0) + earned;
  saveState();
  renderStats();
  renderDaily();
  return earned;
}

function result({ icon, title, message, stats, id, daily, xp }) {
  const earned = award(id, xp, daily);
  document.getElementById("swPlayDialogBody").innerHTML = `<section class="swPlayResult"><div class="swPlayResultIcon">${escapeHtml(icon)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p><div class="swPlayResultStats">${stats.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}<span>+${earned} XP</span></div><div class="swPlayResultActions"><button class="dsPrimaryBtn" type="button" id="swPlayAgain">Play again</button><button class="dsSecondaryBtn" type="button" id="swPlayFinish">Back to the room</button></div></section>`;
  document.getElementById("swPlayAgain").addEventListener("click", () => openGame(id, false));
  document.getElementById("swPlayFinish").addEventListener("click", closeGame);
  if (daily) toast("Daily challenge complete — streak secured.");
}

function runTrivia(daily) {
  const questions = shuffle(trivia).slice(0, 5);
  let index = 0;
  let score = 0;
  let locked = false;
  const body = document.getElementById("swPlayDialogBody");

  function draw() {
    locked = false;
    const item = questions[index];
    body.innerHTML = `<section class="swPlayStage"><div class="swPlayProgressRow"><span>Question ${index + 1} of ${questions.length}</span><span>${score} correct</span></div><div class="swPlayProgressTrack"><span style="width:${index / questions.length * 100}%"></span></div><div class="swPlayQuestion"><small>TRIVIA BLITZ</small><h3>${escapeHtml(item.q)}</h3><p>Choose an answer or press 1–4.</p></div><div class="swPlayAnswerGrid">${item.a.map((answer, answerIndex) => `<button class="swPlayAnswer" type="button" data-answer="${answerIndex}"><b>${answerIndex + 1}</b><span>${escapeHtml(answer)}</span></button>`).join("")}</div><div id="swPlayFeedback"></div></section>`;
    body.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => answer(Number(button.dataset.answer))));
  }

  function answer(selected) {
    if (locked) return;
    locked = true;
    const item = questions[index];
    const correct = selected === item.c;
    if (correct) score += 1;
    body.querySelectorAll("[data-answer]").forEach((button, buttonIndex) => {
      button.disabled = true;
      if (buttonIndex === item.c) button.classList.add("correct");
      else if (buttonIndex === selected) button.classList.add("wrong");
    });
    document.getElementById("swPlayFeedback").innerHTML = `<div class="swPlayFeedback"><b>${correct ? "Correct." : "Not quite."}</b> ${escapeHtml(item.note)}</div><button class="dsPrimaryBtn swPlayNext" id="swPlayNext" type="button">${index + 1 === questions.length ? "See results" : "Next question"}</button>`;
    document.getElementById("swPlayNext").addEventListener("click", next);
  }

  function next() {
    index += 1;
    if (index < questions.length) draw();
    else {
      activeCleanup = null;
      document.removeEventListener("keydown", keys);
      result({ icon: score >= 4 ? "🏆" : "?", title: `${score} out of ${questions.length}`, message: score >= 4 ? "That was a seriously strong run." : "Nice run. The questions shuffle every time.", stats: [`${Math.round(score / questions.length * 100)}% accuracy`], id: "trivia", daily, xp: 55 + score * 22 });
    }
  }

  function keys(event) {
    if (locked || !document.getElementById("swPlayDialog").open) return;
    const number = Number(event.key);
    if (number >= 1 && number <= 4) body.querySelector(`[data-answer="${number - 1}"]`)?.click();
  }

  document.addEventListener("keydown", keys);
  activeCleanup = () => document.removeEventListener("keydown", keys);
  draw();
}

function runMemory(daily) {
  const deck = shuffle([...symbols, ...symbols]);
  let first = null;
  let second = null;
  let locked = false;
  let matched = 0;
  let moves = 0;
  const started = Date.now();
  const body = document.getElementById("swPlayDialogBody");
  body.innerHTML = `<section class="swPlayStage"><div class="swPlayProgressRow"><span id="swMemoryMoves">0 moves</span><span id="swMemoryTime">0s</span></div><div class="swPlayProgressTrack"><span id="swMemoryProgress" style="width:0"></span></div><div class="swPlayMemoryGrid">${deck.map((symbol, index) => `<button class="swPlayMemoryCard" type="button" data-memory="${index}" aria-label="Hidden memory tile">${symbol}</button>`).join("")}</div></section>`;
  const timer = setInterval(() => { const node = document.getElementById("swMemoryTime"); if (node) node.textContent = `${Math.round((Date.now() - started) / 1000)}s`; }, 500);
  activeCleanup = () => clearInterval(timer);

  body.querySelectorAll("[data-memory]").forEach((button) => button.addEventListener("click", () => {
    if (locked || button.classList.contains("matched") || button === first) return;
    button.classList.add("flipped");
    if (!first) { first = button; return; }
    second = button;
    moves += 1;
    document.getElementById("swMemoryMoves").textContent = `${moves} moves`;
    if (deck[Number(first.dataset.memory)] === deck[Number(second.dataset.memory)]) {
      first.classList.add("matched"); second.classList.add("matched"); matched += 2;
      document.getElementById("swMemoryProgress").style.width = `${matched / deck.length * 100}%`;
      first = null; second = null;
      if (matched === deck.length) {
        clearInterval(timer); activeCleanup = null;
        const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
        result({ icon: "🧠", title: "Grid cleared", message: "You found every pair. Fewer moves earns a stronger score.", stats: [`${moves} moves`, `${seconds} seconds`], id: "memory", daily, xp: Math.max(90, 255 - moves * 8) });
      }
    } else {
      locked = true;
      setTimeout(() => { first.classList.remove("flipped"); second.classList.remove("flipped"); first = null; second = null; locked = false; }, 700);
    }
  }));
}

function runReaction(daily) {
  let attempts = [];
  let phase = "start";
  let readyAt = 0;
  let timer = null;
  const body = document.getElementById("swPlayDialogBody");
  body.innerHTML = `<section class="swPlayStage"><div class="swPlayProgressRow"><span id="swReactionCount">Attempt 1 of 5</span><span id="swReactionBest">Best: —</span></div><div class="swPlayProgressTrack"><span id="swReactionProgress" style="width:0"></span></div><button class="swPlayReaction" id="swReactionZone" type="button"><div><h3>Start test</h3><p>Click, then wait for green. Spacebar works too.</p></div></button></section>`;
  const zone = document.getElementById("swReactionZone");

  function begin() {
    phase = "waiting"; zone.className = "swPlayReaction waiting"; zone.innerHTML = "<div><h3>Wait…</h3><p>Do not click until the portal turns green.</p></div>";
    timer = setTimeout(() => { phase = "ready"; readyAt = performance.now(); zone.className = "swPlayReaction ready"; zone.innerHTML = "<div><h3>TAP!</h3><p>Now!</p></div>"; }, 1300 + Math.random() * 2500);
  }

  function click() {
    if (phase === "start" || phase === "result") return begin();
    if (phase === "waiting") { clearTimeout(timer); phase = "start"; zone.className = "swPlayReaction waiting"; zone.innerHTML = "<div><h3>Too early!</h3><p>Click to retry this attempt.</p></div>"; return; }
    if (phase === "ready") {
      const time = Math.round(performance.now() - readyAt); attempts.push(time); phase = "result"; zone.className = "swPlayReaction"; zone.innerHTML = `<div><h3>${time} ms</h3><p>${attempts.length < 5 ? "Click for the next attempt." : "Calculating average…"}</p></div>`;
      document.getElementById("swReactionProgress").style.width = `${attempts.length / 5 * 100}%`;
      document.getElementById("swReactionBest").textContent = `Best: ${Math.min(...attempts)} ms`;
      if (attempts.length >= 5) setTimeout(finish, 650); else document.getElementById("swReactionCount").textContent = `Attempt ${attempts.length + 1} of 5`;
    }
  }

  function finish() {
    activeCleanup = null; document.removeEventListener("keydown", keys);
    const average = Math.round(attempts.reduce((sum, value) => sum + value, 0) / attempts.length);
    result({ icon: "⚡", title: `${average} ms average`, message: average < 260 ? "That was genuinely fast." : "Solid run. Relaxing usually works better than anticipating.", stats: [`Best ${Math.min(...attempts)} ms`, "5 attempts"], id: "reaction", daily, xp: Math.max(75, 275 - Math.round(average / 2)) });
  }

  function keys(event) { if (event.code === "Space" && document.getElementById("swPlayDialog").open) { event.preventDefault(); click(); } }
  zone.addEventListener("click", click); document.addEventListener("keydown", keys);
  activeCleanup = () => { clearTimeout(timer); document.removeEventListener("keydown", keys); };
}

function runThisOrThat(daily) {
  const prompts = shuffle(thisOrThat).slice(0, 8);
  let index = 0;
  const body = document.getElementById("swPlayDialogBody");
  function draw() {
    const [left, right] = prompts[index];
    body.innerHTML = `<section class="swPlayStage"><div class="swPlayProgressRow"><span>Choice ${index + 1} of ${prompts.length}</span><span>No wrong answers</span></div><div class="swPlayProgressTrack"><span style="width:${index / prompts.length * 100}%"></span></div><div class="swPlayQuestion"><small>THIS OR THAT</small><h3>Choose one.</h3><p>Pass the phone after each pick for party mode.</p></div><div class="swPlayChoiceGrid"><button class="swPlayChoice" type="button" data-choice="0">${escapeHtml(left)}</button><button class="swPlayChoice" type="button" data-choice="1">${escapeHtml(right)}</button></div><div id="swChoiceFeedback"></div></section>`;
    body.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => choose(Number(button.dataset.choice))));
  }
  function choose(selected) {
    body.querySelectorAll("[data-choice]").forEach((button) => { button.disabled = true; });
    const leftPercent = 35 + ((index * 17 + 9) % 31); const rightPercent = 100 - leftPercent;
    document.getElementById("swChoiceFeedback").innerHTML = `<div class="swPlayFeedback"><b>You picked option ${selected + 1}.</b> Fun crowd estimate: ${leftPercent}% chose the first option and ${rightPercent}% chose the second.</div><button class="dsPrimaryBtn swPlayNext" id="swChoiceNext" type="button">${index + 1 === prompts.length ? "Finish" : "Next choice"}</button>`;
    document.getElementById("swChoiceNext").addEventListener("click", () => { index += 1; if (index < prompts.length) draw(); else result({ icon: "◆", title: "Choices locked in", message: "You survived every impossible decision. Run it again with someone else and compare answers.", stats: [`${prompts.length} choices`], id: "this-or-that", daily, xp: 105 }); });
  }
  draw();
}

function runEmoji(daily) {
  const puzzles = shuffle(emojiPuzzles).slice(0, 6);
  let index = 0; let score = 0; let hints = 2;
  const body = document.getElementById("swPlayDialogBody");
  function draw() {
    const item = puzzles[index];
    body.innerHTML = `<section class="swPlayStage"><div class="swPlayProgressRow"><span>Puzzle ${index + 1} of ${puzzles.length}</span><span>${score} solved · ${hints} hints</span></div><div class="swPlayProgressTrack"><span style="width:${index / puzzles.length * 100}%"></span></div><div class="swPlayEmoji"><small class="swPlayEyebrow">DECODE THIS</small><div class="swPlayEmojiSymbols">${item.e}</div><p id="swEmojiHint">Turn the emoji into a familiar word or phrase.</p><form class="swPlayForm" id="swEmojiForm"><input id="swEmojiInput" autocomplete="off" placeholder="Type your answer" aria-label="Emoji puzzle answer" /><button class="dsPrimaryBtn" type="submit">Check</button></form><button class="dsSecondaryBtn" id="swEmojiHintButton" type="button" style="margin-top:10px">Use hint</button><div id="swEmojiFeedback"></div></div></section>`;
    const input = document.getElementById("swEmojiInput"); input.focus();
    document.getElementById("swEmojiForm").addEventListener("submit", (event) => { event.preventDefault(); check(input.value); });
    document.getElementById("swEmojiHintButton").addEventListener("click", () => { if (hints <= 0) return toast("No hints left this run."); hints -= 1; document.getElementById("swEmojiHint").textContent = item.hint; document.getElementById("swEmojiHintButton").disabled = true; });
  }
  function check(value) {
    const item = puzzles[index]; const correct = value.trim().toLowerCase() === item.answer; if (correct) score += 1;
    document.getElementById("swEmojiForm").querySelectorAll("input,button").forEach((node) => { node.disabled = true; });
    document.getElementById("swEmojiFeedback").innerHTML = `<div class="swPlayFeedback"><b>${correct ? "Correct!" : `The answer was ${escapeHtml(item.answer)}.`}</b> ${correct ? "Nice decode." : "You’ll get a different mix next round."}</div><button class="dsPrimaryBtn swPlayNext" id="swEmojiNext" type="button">${index + 1 === puzzles.length ? "See results" : "Next puzzle"}</button>`;
    document.getElementById("swEmojiNext").addEventListener("click", () => { index += 1; if (index < puzzles.length) draw(); else result({ icon: "😵", title: `${score} of ${puzzles.length}`, message: "Your emoji decoding run is complete.", stats: [`${hints} hints left`], id: "emoji", daily, xp: 50 + score * 25 }); });
  }
  draw();
}

function runStory(daily) {
  const body = document.getElementById("swPlayDialogBody");
  let spins = 0;
  function prompt() { return `${storyCharacters[Math.floor(Math.random() * storyCharacters.length)]} in ${storyPlaces[Math.floor(Math.random() * storyPlaces.length)]} ${storyProblems[Math.floor(Math.random() * storyProblems.length)]}.`; }
  function draw() {
    body.innerHTML = `<section class="swPlayStage"><div class="swPlayStoryCard"><span class="swPlayEyebrow">YOUR RANDOM SETUP</span><blockquote>“${escapeHtml(prompt())}”</blockquote><p>Use it as a one-minute story, drawing prompt, roleplay setup, or group challenge.</p><div class="swPlayResultActions" style="margin-top:22px"><button class="dsPrimaryBtn" type="button" id="swStorySpin">Spin again</button><button class="dsSecondaryBtn" type="button" id="swStoryDone">Save the chaos</button></div></div></section>`;
    document.getElementById("swStorySpin").addEventListener("click", () => { spins += 1; draw(); });
    document.getElementById("swStoryDone").addEventListener("click", () => result({ icon: "✦", title: "Prompt generated", message: "The rest is up to your imagination—or whoever you pass the phone to next.", stats: [`${spins + 1} prompts seen`], id: "story", daily, xp: 60 }););
  }
  draw();
}

function toast(message) {
  const node = document.getElementById("swPlayToast");
  clearTimeout(toastTimer); node.textContent = message; node.classList.add("show");
  toastTimer = setTimeout(() => node.classList.remove("show"), 2500);
}
