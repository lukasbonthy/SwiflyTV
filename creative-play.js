"use strict";

const path = require("path");

function playHomeSpotlight() {
  return `<section class="dsRow swPlayHomeSpotlight" aria-labelledby="swPlayHomeTitle">
    <div class="swPlayHomeGlow swPlayHomeGlowA" aria-hidden="true"></div>
    <div class="swPlayHomeGlow swPlayHomeGlowB" aria-hidden="true"></div>
    <div class="swPlayHomeCopy">
      <span class="swPlayEyebrow">New inside SwiflyTV</span>
      <h2 id="swPlayHomeTitle">Take a break between episodes.</h2>
      <p>Quick trivia, memory rounds, reaction tests, impossible choices, and creative party prompts—all inside the same Swifly experience.</p>
      <div class="swPlayHomeActions">
        <a class="dsPrimaryBtn" href="/play">Enter Play Room</a>
        <a class="dsSecondaryBtn" href="/play#daily">Try today’s challenge</a>
      </div>
    </div>
    <div class="swPlayHomeOrbit" aria-hidden="true">
      <span class="swPlayOrbitCore">▶</span>
      <span class="swPlayOrbitCard swPlayOrbitOne"><b>?</b><small>Trivia</small></span>
      <span class="swPlayOrbitCard swPlayOrbitTwo"><b>⚡</b><small>Reaction</small></span>
      <span class="swPlayOrbitCard swPlayOrbitThree"><b>✦</b><small>Creative</small></span>
    </div>
  </section>`;
}

function playPageBody() {
  return `<main class="swPlayPage">
    <section class="swPlayHero container">
      <div class="swPlayHeroCopy">
        <span class="swPlayEyebrow"><i></i> Swifly Play Room</span>
        <h1>Pick a mood.<br /><em>Make the night less boring.</em></h1>
        <p>Fast games, weird questions, creative prompts, and daily challenges—built into the SwiflyTV world instead of replacing it.</p>
        <div class="swPlayHeroActions">
          <button class="dsPrimaryBtn" type="button" data-sw-play="trivia">Start Trivia Blitz</button>
          <a class="dsSecondaryBtn" href="#swPlayLibrary">Browse the room</a>
        </div>
        <div class="swPlayHeroStats" aria-label="Player progress">
          <span><b id="swPlayXp">0</b><small>XP</small></span>
          <span><b id="swPlayStreak">1</b><small>day streak</small></span>
          <span><b id="swPlayWins">0</b><small>games finished</small></span>
        </div>
      </div>

      <div class="swPlayPortal" aria-label="Featured game preview">
        <div class="swPlayPortalGlow" aria-hidden="true"></div>
        <div class="swPlayPortalRing swPlayPortalRingA" aria-hidden="true"></div>
        <div class="swPlayPortalRing swPlayPortalRingB" aria-hidden="true"></div>
        <button class="swPlayPortalCore" type="button" data-sw-play="daily" aria-label="Play the daily challenge">
          <span>✦</span>
          <b>Daily Mix</b>
          <small>A different game every day</small>
        </button>
        <button class="swPlayFloat swPlayFloatA" type="button" data-sw-play="memory"><span>🧠</span><b>Memory Grid</b><small>Find every pair</small></button>
        <button class="swPlayFloat swPlayFloatB" type="button" data-sw-play="reaction"><span>⚡</span><b>Reaction Rush</b><small>Beat your best time</small></button>
        <button class="swPlayFloat swPlayFloatC" type="button" data-sw-play="this-or-that"><span>◆</span><b>This or That</b><small>Impossible choices</small></button>
      </div>
    </section>

    <section class="container swPlayDaily" id="daily" aria-labelledby="swPlayDailyTitle">
      <div class="swPlaySectionHead">
        <div><span class="swPlayEyebrow">Changes at midnight</span><h2 id="swPlayDailyTitle">Today’s challenge</h2></div>
        <span class="swPlayDailyStatus" id="swPlayDailyStatus">Not completed</span>
      </div>
      <article class="swPlayDailyCard">
        <div class="swPlayDailyIcon" id="swPlayDailyIcon">?</div>
        <div>
          <span class="swPlayDailyLabel">TODAY’S PICK</span>
          <h3 id="swPlayDailyName">Trivia Blitz</h3>
          <p id="swPlayDailyDescription">Five fast questions. Finish the round to keep your streak alive.</p>
          <div class="swPlayRewardPills"><span>+150 XP</span><span>Daily streak</span><span>New mix tomorrow</span></div>
        </div>
        <button class="dsPrimaryBtn" type="button" id="swPlayDailyButton">Play challenge</button>
      </article>
    </section>

    <section class="container swPlayLibrary" id="swPlayLibrary" aria-labelledby="swPlayLibraryTitle">
      <div class="swPlaySectionHead swPlayLibraryHead">
        <div><span class="swPlayEyebrow">Pick your energy</span><h2 id="swPlayLibraryTitle">The Play Room</h2></div>
        <label class="swPlaySearch"><span aria-hidden="true">⌕</span><input id="swPlaySearch" type="search" placeholder="Find a game or activity" autocomplete="off" /></label>
      </div>
      <div class="swPlayFilters" role="group" aria-label="Filter activities">
        <button class="active" type="button" data-sw-filter="all">Everything</button>
        <button type="button" data-sw-filter="brain">Brain</button>
        <button type="button" data-sw-filter="quick">Quick</button>
        <button type="button" data-sw-filter="party">Party</button>
        <button type="button" data-sw-filter="creative">Creative</button>
      </div>
      <div class="swPlayGrid" id="swPlayGrid"></div>
      <p class="swPlayEmpty" id="swPlayEmpty" hidden>No activities match that search.</p>
    </section>

    <section class="container swPlayBottomGrid">
      <article class="swPlayQuestCard">
        <span class="swPlayEyebrow">Weekly quest</span>
        <h2>Complete three different games.</h2>
        <p>Try something thoughtful, something fast, and something strange.</p>
        <div class="swPlayQuestTrack"><span id="swPlayQuestProgress"></span></div>
        <div class="swPlayQuestMeta"><b id="swPlayQuestText">0 / 3 complete</b><span>Reward: 300 XP</span></div>
      </article>
      <article class="swPlaySurpriseCard">
        <div class="swPlaySurpriseIcon">✦</div>
        <span class="swPlayEyebrow">Can’t decide?</span>
        <h2>Let Swifly choose.</h2>
        <p>One click launches a random activity from the room.</p>
        <button class="dsSecondaryBtn" type="button" id="swPlaySurprise">Surprise me</button>
      </article>
    </section>

    <dialog class="swPlayDialog" id="swPlayDialog" aria-labelledby="swPlayDialogTitle">
      <div class="swPlayDialogShell">
        <header class="swPlayDialogHead">
          <div><span class="swPlayEyebrow" id="swPlayDialogKicker">Swifly Play</span><h2 id="swPlayDialogTitle">Game</h2><p id="swPlayDialogSubtitle"></p></div>
          <button type="button" id="swPlayDialogClose" aria-label="Close activity">×</button>
        </header>
        <div class="swPlayDialogBody" id="swPlayDialogBody"></div>
      </div>
    </dialog>

    <div class="swPlayToast" id="swPlayToast" role="status" aria-live="polite"></div>
    <script src="/swifly-play.js" defer></script>
  </main>`;
}

function registerCreativePlay({ app, pageShell }) {
  const root = __dirname;

  app.get("/swifly-play.css", (_req, res) => {
    res.type("text/css").sendFile(path.join(root, "creative-play.css"));
  });

  app.get("/swifly-play.js", (_req, res) => {
    res.type("application/javascript").sendFile(path.join(root, "creative-play-client.js"));
  });

  app.get("/play", (_req, res) => {
    res.send(pageShell({
      title: "Play Room | SwiflyTV",
      description: "Trivia, reaction games, memory challenges, party questions, and creative activities inside SwiflyTV.",
      active: "play",
      body: playPageBody(),
    }));
  });

  app.get("/games", (_req, res) => res.redirect(302, "/play"));
}

module.exports = { registerCreativePlay, playHomeSpotlight };
