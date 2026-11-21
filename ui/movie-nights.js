'use strict';

const {existsSync} = require('node:fs');
const path = require('node:path');

const hasWebpCover = existsSync(path.join(__dirname, '../public/community/movie-nights-cover.webp'));
const eventCover = '/assets/community/movie-nights-cover.' + (hasWebpCover ? 'webp' : 'png');

const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
const paths = {
  play: 'm9 5 11 7-11 7V5Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 3a4 4 0 0 1 0 8m9 10v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  check: 'm5 12 4 4L19 6',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5Z',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
  link: 'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2m3 5a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
};
const eventId = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const filmId = value => /^[1-9]\d{0,9}$/.test(String(value));
const artwork = value => typeof value === 'string' &&
  /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9_.-]+$/.test(value) ? value : '';
const textDay = (value, timeZone = 'America/New_York') => new Intl.DateTimeFormat('en-US', {
  weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone, timeZoneName:'short'
}).format(new Date(value));
const asTime = (value, timeZone) => Number.isFinite(value)
  ? `<time data-night-date datetime="${new Date(value).toISOString()}">${esc(textDay(value, timeZone))}</time>`
  : '';
const roomLink = id => eventId(id) ? '/movie-night/' + id : '/movie-nights';
const phaseLabel = event => ({
  voting:'Voting open', countdown:'Starting soon', live:'Live', ended:'Screening ended', unavailable:'Unavailable'
}[event?.phase] || 'Schedule');

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}

function leadingFilm(event) {
  if (event?.winner) return event.winner;
  if (!event?.candidates?.length) return null;
  return event.candidates.reduce((leader, film) => film.votes > leader.votes ? film : leader);
}

function scheduleLabel(schedule = {}) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const days = (schedule.days || [5, 6]).filter(day => Number.isInteger(day) && weekdays[day]).map(day => weekdays[day]);
  const hour = Number.isInteger(schedule.hour) ? schedule.hour : 20;
  const zone = schedule.timeZone === 'America/New_York' || !schedule.timeZone ? 'Eastern' : schedule.timeZone;
  return days.join(' & ') + ' · ' + (hour % 12 || 12) + (hour < 12 ? ' a.m. ' : ' p.m. ') + zone;
}

function movieNightHomeMarkup(event) {
  const leader = leadingFilm(event);
  const destination = roomLink(event?.id);
  const open = event?.phase === 'voting';
  const live = event?.phase === 'live';
  const candidates = open ? (event.candidates || []).filter(film => filmId(film.id) && film.id !== leader?.id).slice(0, 3) : [];
  const image = artwork(leader?.backdrop);
  const filmPoster = artwork(leader?.poster);
  const state = event?.phase === 'unavailable' && !leader ? 'Voting temporarily unavailable' : live ? 'Live now' : phaseLabel(event);
  const date = asTime(event?.startsAt, event?.timeZone);
  const heading = leader?.title || 'The next screening';
  const detail = open ? (leader?.votes > 0 ? 'Leading the vote' : '')
    : live ? `${Number(event.viewers) || 0} watching` : event?.winner ? 'Community pick' : '';
  const mainAction = live ? 'Watch live' : open ? 'View ballot' : 'View screening';
  const mainDestination = destination + (open ? '#nightBallotTitle' : '');
  const picks = candidates.map(film => {
    const poster = artwork(film.poster);
    return `<li><a href="${destination}#night-film-${film.id}" aria-label="View ${esc(film.title)} on the ballot">
      <span class="svHomeNightPickFrame${poster ? '' : ' isEventPoster'}"><img src="${esc(poster || eventCover)}" width="200" height="300" alt="" loading="lazy" decoding="async"${poster ? ` data-night-event-cover="${eventCover}"` : ''}></span>
      <span class="svHomeNightPickName"><span>${esc(film.title)}</span>${icon('arrow')}</span></a></li>`;
  }).join('');
  return `<section class="svMovieNightFeature" data-home-movie-night data-home-night-phase="${esc(event?.phase || 'unavailable')}" aria-labelledby="svHomeMovieNightsTitle">
    <div class="svHomeNightProgram${picks ? ' hasBallot' : ''}">
      ${image ? `<img class="svHomeNightArt" data-night-backdrop src="${esc(image)}" width="1280" height="720" alt="" loading="lazy" decoding="async" fetchpriority="low">` : ''}
      <header class="svHomeNightHead"><h2 id="svHomeMovieNightsTitle">Movie Nights</h2><a class="svHomeNightMore" href="/movie-nights">All screenings ${icon('arrow')}</a></header>
      <div class="svHomeNightLayout">
        <a class="svHomeNightSpotlight" href="${mainDestination}">
          <div class="svHomeNightCopy">
            <span class="svHomeNightState"><i aria-hidden="true"></i>${esc(state)}</span>
            <strong>${esc(heading)}</strong>
            ${date || detail ? `<span class="svHomeNightFacts">${date ? `<span>${icon('clock')}${date}</span>` : ''}${detail ? `<span>${esc(detail)}</span>` : ''}</span>` : ''}
            <span class="svHomeNightAction">${mainAction}${icon(live ? 'play' : 'arrow')}</span>
          </div>
          <figure class="svHomeNightPoster${filmPoster ? '' : ' isEventPoster'}" aria-hidden="true">
            <img src="${esc(filmPoster || eventCover)}" width="400" height="600" alt="" loading="lazy" decoding="async" fetchpriority="low"${filmPoster ? ` data-night-event-cover="${eventCover}"` : ''}>
            <span class="svHomeNightPosterTitle">Movie<br>Nights</span>
          </figure>
        </a>
        ${picks ? `<section class="svHomeNightBallot" aria-labelledby="svHomeNightBallotTitle"><h3 id="svHomeNightBallotTitle">Also on the ballot</h3><ul>${picks}</ul></section>` : ''}
      </div>
    </div>
  </section>`;
}

function nightMessage(message, timeZone = 'America/New_York') {
  const timestamp = new Date(Number(message.createdAt) || 0);
  const name = message.name || 'Member';
  return `<article class="nightMessage" data-night-message-id="${esc(message.id)}">
    <span class="nightAvatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>
    <div><header><strong>${esc(name)}</strong><time datetime="${timestamp.toISOString()}">${new Intl.DateTimeFormat('en-US', {hour:'numeric', minute:'2-digit', timeZone}).format(timestamp)}</time></header><p>${esc(message.text)}</p></div>
  </article>`;
}

function ballotCard(film, event) {
  const mine = Number(event.yourVote) === Number(film.id);
  const winner = Number(event.winner?.id) === Number(film.id);
  const votes = Number(film.votes) || 0;
  const percent = event.totalVotes ? Math.round(100 * votes / event.totalVotes) : 0;
  const poster = artwork(film.poster);
  const meta = [film.year, film.runtime ? film.runtime + ' min' : ''].filter(Boolean).join(' · ');
  return `<article class="nightBallotCard${mine ? ' isSelected' : ''}${winner ? ' isWinner' : ''}" id="night-film-${esc(film.id)}" data-night-candidate="${esc(film.id)}">
    <div class="nightBallotPoster">${poster ? `<img src="${esc(poster)}" alt="" width="200" height="300" loading="lazy" decoding="async">` : ''}</div>
    <div class="nightBallotCopy">
      <div class="nightBallotInfo">
        <h3>${esc(film.title)}</h3>
        <p class="nightBallotMeta"${meta ? '' : ' hidden'}>${esc(meta)}</p>
        <span class="nightBallotWinner" data-night-film-winner${winner ? '' : ' hidden'}>Screening pick</span>
      </div>
      <div class="nightBallotVote">
        <div class="nightVoteTotals"><span><b data-night-film-votes>${votes}</b><span data-night-film-vote-unit> ${votes === 1 ? 'vote' : 'votes'}</span></span><span data-night-film-percent>${percent}%</span></div>
        <span class="nightVoteBar" aria-hidden="true"><i style="width:${percent}%"></i></span>
      </div>
      <button class="nightVoteButton" type="button" data-night-vote="${esc(film.id)}" aria-pressed="${mine}"${event.phase !== 'voting' ? ' disabled' : ''}><span>${mine ? 'Your vote' : event.phase === 'voting' ? 'Vote' : 'Voting closed'}</span></button>
    </div>
  </article>`;
}

function accountDialog(accountNotice) {
  return `<div class="nightAuthOverlay" data-night-auth-overlay data-lenis-prevent hidden>
    <section class="nightAuthPanel" role="dialog" aria-modal="true" aria-labelledby="nightAuthTitle" aria-describedby="nightAuthIntro">
      <button type="button" class="nightAuthClose" data-night-auth-close aria-label="Close account setup">×</button>
      <h2 id="nightAuthTitle" data-night-auth-title>Create a SwiflyTV account</h2>
      <p id="nightAuthIntro">${accountNotice ? esc(accountNotice) : 'Use your SwiflyTV account to vote and join the chat.'}</p>
      <div class="nightAuthModes" role="tablist" aria-label="Choose account action">
        <button type="button" role="tab" data-night-auth-mode="signup" aria-selected="true">Create account</button>
        <button type="button" role="tab" data-night-auth-mode="login" aria-selected="false" tabindex="-1">Sign in</button>
      </div>
      <form class="nightAuthForm" data-night-auth-form method="post" action="/api/connect/auth/signup" autocomplete="on">
        <div class="nightAuthTwoFields" data-night-signup-field>
          <label>Display name<input type="text" name="name" maxlength="40" autocomplete="nickname" required></label>
          <label>Handle<input type="text" name="handle" maxlength="24" minlength="3" pattern="[a-zA-Z0-9_]+" autocomplete="username" required></label>
        </div>
        <label>Email address<input type="email" name="email" maxlength="254" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="new-password" required></label>
        <p class="nightAuthHint" data-night-signup-field>Choose a password from 15 to 128 characters.</p>
        <label data-night-auth-confirm>Confirm password<input type="password" name="confirmPassword" autocomplete="new-password" required></label>
        <p class="nightAuthError" role="alert" data-night-auth-error hidden></p>
        <button class="nightAuthSubmit" type="submit" data-night-auth-submit>Create account</button>
      </form>
    </section>
  </div>`;
}

function movieNightsMarkup({snapshot = {}, playerHtml = '', accountNotice = ''} = {}) {
  const {event, viewer = {}, schedule} = snapshot;
  const zone = schedule?.timeZone;
  const leader = leadingFilm(event);
  const phase = event?.phase || 'unavailable';
  const open = phase === 'voting';
  const ended = phase === 'ended';
  const hasBallot = Boolean(event?.candidates?.length);
  const profileUrl = '/login?redirect=' + encodeURIComponent(roomLink(event?.id));
  const picture = artwork(leader?.backdrop);
  const date = asTime(event?.startsAt, zone);
  const joinDisabled = !event || ended || phase === 'unavailable';
  const eventTitle = phase === 'live' && event.winner ? event.winner.title : event?.title || 'Movie Night';
  const ballotTitle = open ? 'Vote for the next movie' : hasBallot ? 'Voting results' : 'Movie ballot';
  const ballotCopy = open ? 'You can change your vote until five minutes before the screening.'
    : hasBallot ? 'The community’s pick is shown above.' : '';
  const context = open ? 'The most voted film plays at showtime.'
    : ended ? 'See the schedule for the next screening.'
    : phase === 'unavailable' ? 'Check back for the next screening.'
    : 'Watch together and pause whenever you need.';
  const serialized = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<main class="svNightPage dsPlainPage" data-movie-nights data-night-phase-state="${esc(phase)}" data-night-id="${esc(event?.id || '')}">
    <div class="nightPageTop">
      <div><nav class="nightBreadcrumb" aria-label="Community"><a href="/social?tab=chat">Community</a></nav>
        <h1>Movie Nights</h1>
      </div>
      <div class="nightHeaderActions">
        ${viewer.signedIn ? '' : '<button class="nightButton" type="button" data-night-auth-open="signup">Create account</button>'}
        <a class="nightBackLink" href="/social?tab=watchrooms" aria-label="Your watchrooms">Watchrooms ${icon('arrow')}</a>
      </div>
    </div>
    <div class="nightScreeningGrid">
      <section class="nightBroadcast" aria-label="Featured screening">
        <div class="nightStage" data-night-stage>
          <div class="nightLobby" data-night-lobby>
            <img class="nightCoverArt" src="${eventCover}" alt="" width="400" height="600" loading="lazy">
            ${picture ? `<img class="nightFeatureArt" data-night-art src="${esc(picture)}" alt="" width="1280" height="720" fetchpriority="high">` : ''}
            <div class="nightStageShade"></div>
            <div class="nightStageTop">
              <span class="nightPhase" data-night-phase>${esc(phaseLabel(event))}</span>
            </div>
            <div class="nightLobbyCopy">
              <span class="nightEyebrow" data-night-feature-label>${event?.winner ? 'COMMUNITY PICK' : leader ? 'ON THE BALLOT' : 'SCHEDULED SCREENING'}</span>
              <h2 data-night-feature-title>${esc(leader?.title || 'The next screening')}</h2>
              <p data-night-feature-meta>${esc([leader?.year, leader?.runtime ? leader.runtime + ' min' : ''].filter(Boolean).join(' · '))}</p>
            </div>
          </div>
          <div class="nightPlayerMount" data-night-player hidden></div><template data-night-player-template>${playerHtml}</template>
        </div>
        <div class="nightBroadcastInfo">
          <div class="nightScreeningDetails">
            <div class="nightEventLine">
              <span class="nightOnAir" data-night-on-air${phase === 'live' ? '' : ' hidden'}><i aria-hidden="true"></i>Live</span>
              <span class="nightScreeningTime">${icon('clock')}<time data-night-event-date${date ? ` datetime="${new Date(event.startsAt).toISOString()}"` : ''}>${date ? esc(textDay(event.startsAt, zone)) : 'Schedule unavailable'}</time></span>
              <span class="nightPresence" data-night-presence${!event || snapshot.code === 'storage_unavailable' ? ' hidden' : ''}>${icon('people')}<span data-night-viewers>${Number(event?.viewers) || 0} here</span></span>
            </div>
            <h2 data-night-event-title>${esc(eventTitle)}</h2>
            <strong class="nightCountdown" data-night-countdown>${open ? 'Voting is open' : phase === 'live' ? 'The screening is live' : ''}</strong>
            <p data-night-event-copy>${context}</p>
          </div>
          <div class="nightScreeningActions">
            <a class="nightButton nightButtonPrimary" href="#nightBallotTitle" data-night-view-ballot${open ? '' : ' hidden'}>View ballot ${icon('arrow')}</a>
            <button class="nightButton" type="button" data-night-join${joinDisabled ? ' hidden disabled' : ''}>${icon('play')}<span>Join screening</span></button>
            <button class="nightButton nightButtonPrimary" type="button" data-night-live hidden>${icon('clock')}Resume live</button>
            <button class="nightButton nightIconButton" type="button" data-night-share aria-label="Copy screening invite" title="Copy invite"${!event ? ' hidden' : ''}>${icon('link')}</button>
          </div>
        </div>
        <p class="nightStatus" data-night-status role="status" aria-live="polite">${esc(snapshot.message || '')}</p>
        <button class="nightTextButton" type="button" data-night-refresh${snapshot.code ? '' : ' hidden'}>Try again ${icon('arrow')}</button>
        <button class="nightTextButton" type="button" data-night-retry${event?.sourceStatus === 'error' && viewer.signedIn ? '' : ' hidden'}>Retry the shared source ${icon('arrow')}</button>
      </section>
      <aside class="nightChat" data-night-chat aria-label="Screening chat">
        <header class="nightChatHeader"><div>${icon('chat')}<h2>Live chat</h2></div><button type="button" class="nightTextButton" data-night-chat-toggle aria-expanded="true" aria-controls="nightChatBody">Hide</button></header>
        <div class="nightChatBody" id="nightChatBody" data-night-chat-body>
          <div class="nightMessages" data-night-message-list role="log" aria-live="polite" aria-relevant="additions" aria-label="Screening messages">
            ${event?.messages?.length ? event.messages.map(message => nightMessage(message, zone)).join('') : '<p class="nightChatEmpty" data-night-chat-empty>No messages yet.</p>'}
          </div>
          <div class="nightComposerWrap">
            <a class="nightChatSignin" href="${profileUrl}" data-night-signin data-night-auth-open="login"${viewer.signedIn || ended || snapshot.code === 'storage_unavailable' ? ' hidden' : ''}>Sign in to chat ${icon('arrow')}</a>
            <form class="nightComposer" data-night-message-form${viewer.signedIn && !ended && snapshot.code !== 'storage_unavailable' ? '' : ' hidden'}>
              <label class="nightSrOnly" for="nightMessage">Message this screening</label><input id="nightMessage" name="message" data-night-message maxlength="500" placeholder="Message the room…" autocomplete="off"><button class="nightSend" type="submit" aria-label="Send message">${icon('send')}</button>
            </form>
            <p class="nightComposeStatus" data-night-compose-status role="status">${ended ? 'Chat is closed for this screening.' : snapshot.code === 'storage_unavailable' ? 'Chat is temporarily unavailable.' : ''}</p>
          </div>
        </div>
      </aside>
      <section class="nightBallot" aria-labelledby="nightBallotTitle">
        <header class="nightSectionHead"><div><h2 id="nightBallotTitle">${ballotTitle}</h2><p data-night-ballot-copy>${ballotCopy}</p>
          <a class="nightBallotSignin" href="${profileUrl}" data-night-ballot-signin data-night-auth-open="login"${open && !viewer.signedIn ? '' : ' hidden'}>Sign in to vote ${icon('arrow')}</a></div>
          <div class="nightBallotSummary" data-night-ballot-summary${hasBallot ? '' : ' hidden'}><span><strong data-night-total-votes>${Number(event?.totalVotes) || 0}</strong><span data-night-total-vote-unit>${Number(event?.totalVotes) === 1 ? ' vote' : ' votes'}</span></span><span data-night-vote-deadline>${hasBallot ? 'Voting ' + (open ? 'closes ' : 'closed ') + esc(textDay(event.votingClosesAt, zone)) : ''}</span></div>
        </header>
        <div class="nightBallotGrid" data-night-ballot>${hasBallot ? event.candidates.map(film => ballotCard(film, event)).join('') : '<p class="nightEmptyBallot">The ballot is currently unavailable.</p>'}</div>
        <p class="nightVoteStatus" data-night-vote-status role="status" aria-live="polite"></p>
      </section>
    </div>
    <section class="nightUpcoming" aria-labelledby="nightUpcomingTitle">
      <header class="nightSectionHead"><h2 id="nightUpcomingTitle">Upcoming screenings</h2><p data-night-schedule>${esc(scheduleLabel(schedule))}</p></header>
      <div class="nightUpcomingGrid" data-night-upcoming>
        ${(snapshot.upcoming || []).filter(row => eventId(row.id) && row.id !== event?.id).map(row => `<a class="nightUpcomingCard" href="${roomLink(row.id)}"><span class="nightUpcomingIcon">${icon('clock')}</span><span><strong>${esc(row.title)}</strong>${asTime(row.startsAt, zone)}</span><span class="nightUpcomingAction">${row.phase === 'voting' ? 'Vote now' : 'View screening'} ${icon('arrow')}</span></a>`).join('')}
      </div>
    </section>
    ${accountDialog(accountNotice)}
    <script type="application/json" data-night-boot>${serialized}</script>
  </main>`;
}

module.exports = {movieNightsMarkup, movieNightHomeMarkup, ballotCard, nightMessage};
