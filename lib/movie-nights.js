'use strict';

const express = require('express');
const {randomUUID} = require('node:crypto');

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CLOSE_EARLY = 5 * MINUTE;
const START_WINDOW = 6 * HOUR;
const HISTORY = 12;
const UPCOMING = 3;
const BALLOT_SIZE = 6;
const BALLOT_COOLDOWN = MINUTE;
const SOURCE_RETRY_COOLDOWN = 30000;
const SOURCE_FAILURE_LIMIT = 3;
const SOURCE_DEADLINE = 90000;
const SOURCE_LEASE = SOURCE_DEADLINE + 1000;
const MIN_SOURCE_LEASE = 5000;
const MESSAGE_HISTORY = 50;
const MESSAGE_RECEIPTS = 256;
const MESSAGE_WINDOW = 10000;
const MAX_CONNECTIONS = 1000;
const MAX_VOTES = 10000;
const TITLE = 'Movie Night';
const EMPTY = Object.freeze({});
const GUEST = Object.freeze({signedIn: false, name: ''});
const EVENT_ID = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE = /^\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/i;
const CLIENT_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const namespaceAdmissions = new WeakMap();

function fault(status, code, message) {
  return Object.assign(new Error(message), {status, code, movieNights: true});
}

const storageFault = () => fault(503, 'storage_unavailable', 'Voting and chat are temporarily unavailable. Try again shortly.');
const ballotFault = () => fault(503, 'ballot_unavailable', 'The Movie Night ballot is temporarily unavailable. Try again shortly.');
const unknownEvent = () => fault(404, 'event_not_found', 'This Movie Night could not be found.');
const closedVote = () => fault(409, 'voting_closed', 'Voting for this Movie Night has closed.');
const signIn = () => fault(401, 'signin_required', 'Sign in to participate in Movie Nights.');
const accountChanged = () => fault(409, 'account_changed', 'Your account changed. Reconnect to Movie Nights to continue.');
const denied = () => fault(403, 'access_denied', 'Movie Nights is unavailable with your current access settings.');
const disposed = () => fault(503, 'service_unavailable', 'Movie Nights is temporarily unavailable.');

function clean(value, limit) {
  return typeof value === 'string'
    ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

function configuredSchedule(options = {}) {
  const timeZone = options.timeZone ?? 'America/New_York';
  const hour = options.hour ?? 20;
  const days = [...new Set(options.days ?? [5, 6])].sort();
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new TypeError('Configure a local Movie Night hour and weekday numbers from 0 to 6.');
  }
  const calendar = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  return {value: {timeZone, hour, days}, calendar};
}

function wallTime(calendar, instant) {
  const parts = Object.fromEntries(calendar.formatToParts(instant).map(({type, value}) => [type, Number(value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function localInstant(calendar, target) {
  // The offsets on either side also describe DST's ambiguous and missing hours.
  const offsets = [target - DAY, target + DAY].map(sample => wallTime(calendar, sample) - sample);
  const candidates = [...new Set(offsets.map(offset => target - offset))].sort((a, b) => a - b);
  return candidates.find(value => wallTime(calendar, value) === target)
    ?? candidates.find(value => wallTime(calendar, value) > target);
}

function localDate(calendar, instant) {
  return new Date(wallTime(calendar, instant)).toISOString().slice(0, 10);
}

function eventSlots({value, calendar}, time, events) {
  const today = Math.floor(wallTime(calendar, time) / DAY) * DAY;
  const slots = [];
  for (let day = today - DAY; day <= today + 35 * DAY && slots.length < UPCOMING + 1; day += DAY) {
    const date = new Date(day);
    if (!value.days.includes(date.getUTCDay())) continue;
    const id = date.toISOString().slice(0, 10);
    const startsAt = localInstant(calendar, day + value.hour * HOUR);
    const stored = events[id];
    if (stored ? hasEnded(stored, time) : startsAt + START_WINDOW <= time) continue;
    slots.push(stored || {id, title: TITLE, startsAt, votingClosesAt: startsAt - CLOSE_EARLY});
  }
  return slots;
}

function timestampIsDate(value) {
  if (typeof value !== 'string' || !EVENT_ID.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function movieId(value) {
  if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 && value <= 9999999999 ? value : null;
}

function candidate(data, id, releasedBy) {
  if (!data || data.__error || movieId(data.id) !== id || data.adult !== false ||
      (data.media_type && data.media_type !== 'movie') || !timestampIsDate(data.release_date) ||
      data.release_date > releasedBy || !Number.isInteger(data.runtime) || data.runtime <= 0 ||
      !IMAGE.test(data.poster_path || '') || !IMAGE.test(data.backdrop_path || '')) return null;
  const title = clean(data.title, 160);
  if (!title) return null;
  return {
    id, title, year: data.release_date.slice(0, 4),
    poster: 'https://image.tmdb.org/t/p/w342' + data.poster_path,
    backdrop: 'https://image.tmdb.org/t/p/w1280' + data.backdrop_path,
    overview: clean(data.overview, 1200), runtime: data.runtime
  };
}

function duration(event) {
  return (event.candidates?.find(film => film.id === event.winnerId)?.runtime || 0) * 60;
}

function hasEnded(event, time) {
  return event.playbackStartedAt != null
    ? time >= event.playbackStartedAt + duration(event) * 1000
    : time >= event.startsAt + START_WINDOW;
}

function sourceEstablished(event) {
  return event.sourceEstablishedAt != null || event.playbackStartedAt != null;
}

function activeLease(event, time) {
  return !sourceEstablished(event) && event.sourceLease?.until > time;
}

function voteKey(accountId) {
  return 'account:' + accountId;
}

function voteTotals(event) {
  const votes = new Map(event.candidates.map(film => [film.id, 0]));
  for (const id of Object.values(event.votes)) {
    if (votes.has(id)) votes.set(id, votes.get(id) + 1);
  }
  return votes;
}

function lockWinner(event, time) {
  if (event.winnerId || time < event.votingClosesAt) return;
  const votes = voteTotals(event);
  const winner = event.candidates.reduce((best, film) => votes.get(film.id) > votes.get(best.id) ? film : best);
  event.winnerId = winner.id;
}

function messageItem({id, name, text, createdAt, clientId}) {
  return {id, name, text, createdAt, clientId};
}

function playbackUrl(source) {
  if (!source || source.status === 'error' || source.status === 'placeholder') return null;
  const value = source.playbackUrl || source.proxyVideo || source.hlsProxyUrl || source.m3u8 || source.url;
  if (typeof value !== 'string' || !value || value.length > 16384 || /[\s\\<>"]/.test(value)) return null;
  try {
    const parsed = new URL(value, 'https://swifly.invalid');
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return (value.startsWith('/') && !value.startsWith('//')) || /^https?:\/\//i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function originAllowed(headers, secure, requireEvidence) {
  const origin = headers.origin;
  const site = headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return false;
  if (origin == null) return !requireEvidence || site === 'same-origin';
  try {
    const parsed = new URL(origin);
    const protocol = secure ? 'https:' : 'http:';
    return parsed.origin === origin && parsed.origin === new URL(protocol + '//' + headers.host).origin;
  } catch {
    return false;
  }
}

function socketRequest(socket) {
  const req = socket.request;
  const headers = req?.headers || socket.handshake.headers;
  const trustedProxy = process.env.RENDER || process.env.SWIFLY_TRUST_PROXY === 'true';
  const forwarded = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req?.secure ?? Boolean(socket.handshake.secure || (trustedProxy && forwarded === 'https'));
  return {headers, secure};
}

function admissionFor(namespace) {
  const existing = namespaceAdmissions.get(namespace);
  if (existing) return existing;
  const slot = {};
  namespaceAdmissions.set(namespace, slot);
  namespace.use((socket, next) => {
    const active = slot.active;
    if (!active) return next(denied());
    void active(socket).then(valid => next(valid && slot.active === active ? undefined : denied()));
  });
  return slot;
}

function createMovieNights({
  store, tmdb, authenticate = () => null, io, authorizeSocket, resolveSource,
  now = Date.now, schedule, autoStart = true
} = {}) {
  if (!store || typeof tmdb !== 'function' || typeof resolveSource !== 'function' ||
      (io && typeof authorizeSocket !== 'function')) {
    throw new TypeError('Movie Nights requires persistent storage, a catalogue and source resolver, and socket authorization.');
  }
  const router = express.Router();
  const config = configuredSchedule(schedule);
  const namespace = io?.of('/movie-nights');
  const sources = new Map();
  const sourceJobs = new Map();
  const sourceBackoff = new Map();
  const localFailures = new Map();
  const members = new Map();
  const lastPublicState = new Map();
  const lifetime = new AbortController();
  let activeTick;
  let activeSeed;
  let ballotRetryAt = -Infinity;
  let ballotStorageFailure = false;
  let lastReconciledAt = -Infinity;
  let latest = {revision: -1, events: EMPTY};
  let storageReachable = false;
  let previewCache;
  let timer;

  async function storage(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error.movieNights) throw error;
      throw storageFault();
    }
  }

  function remember(record) {
    if (record.revision >= latest.revision) latest = record;
    return latest.events;
  }

  async function read() {
    const state = await storage(() => store.read());
    const movieNights = state.movieNights;
    return remember({revision: movieNights?.revision || 0, events: movieNights?.events || {}});
  }

  async function write(change) {
    const committed = await storage(() => store.transaction(async state => {
      if (lifetime.signal.aborted) throw disposed();
      const movieNights = state.movieNights ||= {events: {}};
      const value = await change(movieNights.events, state, now());
      if (lifetime.signal.aborted) throw disposed();
      movieNights.revision = (movieNights.revision || 0) + 1;
      return {record: {revision: movieNights.revision, events: movieNights.events}, value};
    }));
    remember(committed.record);
    return committed.value;
  }

  async function identity(req) {
    try {
      const result = await authenticate(req);
      const user = result?.user || result;
      if (typeof user?.id === 'string' && user.id) {
        return {id: user.id, name: clean(user.name, 40) || 'Viewer', sessionHash: result.sessionHash};
      }
      return null;
    } catch (error) {
      if (error.status === 401) return null;
      throw storageFault();
    }
  }

  function checkSession(state, account, time) {
    if (!account) throw signIn();
    if (account.sessionHash) {
      const session = state.sessions?.[account.sessionHash];
      if (!session || session.userId !== account.id || session.expiresAt <= time || !state.users?.[account.id]) throw accountChanged();
    }
  }

  async function catalogPool(releasedBy) {
    const pool = [];
    const seen = new Set();
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(12000)]);
    const aborted = new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    });
    aborted.catch(() => {});
    function request(endpoint, query) {
      return Promise.race([
        Promise.resolve().then(() => tmdb(endpoint, query, 60 * MINUTE, signal)),
        aborted
      ]).catch(() => null);
    }
    for (let page = 1; page <= 3 && pool.length < (UPCOMING + 1) * BALLOT_SIZE + 4; page++) {
      if (signal.aborted) break;
      const listing = await request('/discover/movie', {
        include_adult: false, sort_by: 'popularity.desc', 'primary_release_date.lte': releasedBy, page
      });
      const ids = [];
      const results = Array.isArray(listing?.results) ? listing.results : [];
      for (const entry of results.slice(0, 20)) {
        const id = movieId(entry?.id);
        if (!id || seen.has(id) || entry.adult === true) continue;
        seen.add(id);
        ids.push(id);
      }
      for (let index = 0; index < ids.length; index += 10) {
        const batch = ids.slice(index, index + 10);
        const details = await Promise.all(batch.map(async id => candidate(await request('/movie/' + id, {}), id, releasedBy)));
        pool.push(...details.filter(Boolean));
      }
      if (!listing || page >= listing.total_pages) break;
    }
    return pool;
  }

  function seedBallots(events, slots, pool) {
    for (const slot of slots) {
      if (events[slot.id]) continue;
      const preceding = Object.values(events).filter(event => event.startsAt < slot.startsAt)
        .sort((a, b) => b.startsAt - a.startsAt);
      const recentWinners = new Set(preceding.filter(event => event.winnerId).slice(0, 4).map(event => event.winnerId));
      const recentCandidates = new Set(preceding.slice(0, 4).flatMap(event => event.candidates.map(film => film.id)));
      const eligible = pool.filter(film => !recentWinners.has(film.id));
      const ordered = [...eligible.filter(film => !recentCandidates.has(film.id)), ...eligible.filter(film => recentCandidates.has(film.id))];
      if (ordered.length < BALLOT_SIZE) continue;
      events[slot.id] = {...slot, candidates: ordered.slice(0, BALLOT_SIZE), votes: {}, messages: [], receipts: []};
    }
    return events;
  }

  function viewers(id) {
    let count = 0;
    for (const member of members.values()) if (member.id === id) count++;
    return count;
  }

  function eventView(event, time, account) {
    const ended = hasEnded(event, time);
    const source = sources.get(event.id);
    const ready = !ended && source?.expiresAt > time && source;
    const storageBackoff = sourceBackoff.get(event.id) > time;
    const loading = !ended && (sourceJobs.has(event.id) || (!storageBackoff && activeLease(event, time)));
    const unavailable = failureFor(event) || storageBackoff;
    const sourceStatus = ready ? 'ready' : loading ? 'loading' : unavailable ? 'error' : 'idle';
    const phase = ended ? 'ended' : !event.candidates ? 'unavailable' : time < event.votingClosesAt ? 'voting'
      : sourceStatus === 'error' ? 'unavailable'
      : event.playbackStartedAt != null && ready ? 'live' : 'countdown';
    const totals = event.candidates ? voteTotals(event) : new Map();
    const candidates = (event.candidates || []).map(film => ({...film, votes: totals.get(film.id)}));
    return {
      id: event.id, title: event.title, startsAt: event.startsAt, votingClosesAt: event.votingClosesAt,
      phase, candidates, winner: candidates.find(film => film.id === event.winnerId) || null,
      totalVotes: candidates.reduce((total, film) => total + film.votes, 0),
      yourVote: account ? event.votes?.[voteKey(account.id)] ?? null : null,
      playbackStartedAt: event.playbackStartedAt ?? null, duration: duration(event),
      sourceStatus, ...(ready ? {source: ready.payload} : {}),
      viewers: viewers(event.id), messages: (event.messages || []).map(messageItem)
    };
  }

  function selectedEvent(events, slots, time, id) {
    const active = Object.values(events).filter(event => event.votingClosesAt <= time && !hasEnded(event, time))
      .sort((a, b) => a.startsAt - b.startsAt)[0];
    return id ? events[id] || slots.find(slot => slot.id === id) : active || slots[0];
  }

  // Home reads the scheduler's latest state without waking the database,
  // resolving media, or adding a polling client to the catalog.
  function homePreview() {
    const time = now();
    if (previewCache?.until > time && previewCache.revision === latest.revision &&
        previewCache.reachable === storageReachable) return previewCache.value;
    const events = storageReachable ? latest.events : EMPTY;
    const slot = selectedEvent(events, eventSlots(config, time, events), time);
    if (!slot) return null;
    const {id, startsAt, phase, candidates, winner, viewers} = eventView(slot, time, null);
    const value = {id, startsAt, phase, candidates, winner, viewers, timeZone: config.value.timeZone};
    previewCache = {until: time + 1000, revision: latest.revision, reachable: storageReachable, value};
    return value;
  }

  function snapshotFrom(events, id, account, problem) {
    const time = now();
    const slots = eventSlots(config, time, events);
    const event = selectedEvent(events, slots, time, id);
    if (!event) {
      if (problem) throw problem;
      throw unknownEvent();
    }
    const eventProblem = problem || (!event.candidates && (ballotStorageFailure ? storageFault() : ballotFault()));
    return {
      event: eventView(event, time, account),
      upcoming: slots.filter(slot => slot.id !== event.id && slot.startsAt >= time).slice(0, UPCOMING)
        .map(slot => eventView(slot, time, account)),
      serverTime: time,
      viewer: account ? {signedIn: true, name: account.name} : GUEST,
      schedule: config.value,
      ...(eventProblem ? {code: eventProblem.code, message: eventProblem.message} : {})
    };
  }

  function publish(problem) {
    if (lifetime.signal.aborted) return;
    const events = problem ? EMPTY : latest.events;
    for (const id of new Set([...members.values()].map(member => member.id).filter(Boolean))) {
      let data;
      try { data = snapshotFrom(events, id, null, problem); } catch { continue; }
      const signature = JSON.stringify({
        ...data, serverTime: 0, event: {...data.event, viewers: 0},
        upcoming: data.upcoming.map(event => ({...event, viewers: 0}))
      });
      if (signature === lastPublicState.get(id)) continue;
      lastPublicState.set(id, signature);
      broadcast(id, 'night:update', data, () => lastPublicState.get(id) === signature);
    }
  }

  function beginPlayback(event, source, time) {
    if (source?.expiresAt > time && event.playbackStartedAt == null && time >= event.startsAt && !hasEnded(event, time)) {
      event.playbackStartedAt = Math.max(event.startsAt, source.readyAt);
    }
  }

  function failureFor(event) {
    // An established screening may need a new in-memory stream on another process.
    return sourceEstablished(event) ? localFailures.get(event.id) : event.sourceFailure;
  }

  function reserveSource(event, time) {
    const token = randomUUID();
    event.sourceLease = {token, until: time + SOURCE_LEASE};
    return token;
  }

  async function claimSource(event) {
    if (sourceEstablished(event)) return {event};
    return write((events, _state, time) => {
      const stored = events[event.id];
      if (!stored || hasEnded(stored, time) || !stored.winnerId) return null;
      if (sourceEstablished(stored)) return {event: stored};
      if (stored.sourceFailure || activeLease(stored, time)) return null;
      return {event: stored, token: reserveSource(stored, time)};
    });
  }

  function startSource(event, reservedToken) {
    if (lifetime.signal.aborted || sourceJobs.has(event.id)) return;
    const id = event.id;
    const job = new AbortController();
    sourceJobs.set(id, job);
    const signal = AbortSignal.any([job.signal, lifetime.signal]);
    const deadline = new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    });
    deadline.catch(() => {});
    let timer;
    let claim;
    void (async () => {
      try {
        claim = reservedToken ? {event, token: reservedToken} : await claimSource(event);
        if (!claim || signal.aborted) return;
        timer = setTimeout(() => job.abort(new Error('Source deadline exceeded')), SOURCE_DEADLINE);
        timer.unref?.();
        const payload = await Promise.race([
          Promise.resolve().then(() => {
            signal.throwIfAborted();
            return resolveSource(claim.event.winnerId, {signal});
          }),
          deadline
        ]);
        signal.throwIfAborted();
        const readyAt = now();
        const expiryProvided = payload && Object.hasOwn(payload, 'expiresAt');
        const expiresAt = expiryProvided ? payload.expiresAt : Infinity;
        if (!playbackUrl(payload) || (expiryProvided && !Number.isFinite(expiresAt)) ||
            expiresAt <= readyAt + MIN_SOURCE_LEASE) throw new Error('Source unavailable');
        const source = {payload, readyAt, expiresAt};
        const accepted = await write((events, _state, time) => {
          const stored = events[id];
          if (signal.aborted || !stored || hasEnded(stored, time) ||
              (claim.token && stored.sourceLease?.token !== claim.token)) return false;
          stored.sourceEstablishedAt ??= readyAt;
          delete stored.sourceLease;
          delete stored.sourceFailure;
          delete stored.sourceRetryAt;
          beginPlayback(stored, source, time);
          return true;
        });
        if (accepted && !lifetime.signal.aborted) {
          sources.set(id, source);
          localFailures.delete(id);
        }
      } catch (error) {
        if (lifetime.signal.aborted) return;
        if (error.code === 'storage_unavailable') {
          sourceBackoff.set(id, now() + SOURCE_RETRY_COOLDOWN);
          return;
        }
        if (claim?.token) {
          await write((events, _state, time) => {
            const stored = events[id];
            if (!stored || hasEnded(stored, time) || sourceEstablished(stored) || stored.sourceLease?.token !== claim.token) return;
            delete stored.sourceLease;
            stored.sourceFailure = {at: time, count: (stored.sourceFailure?.count || 0) + 1};
          }).catch(() => {
            if (!lifetime.signal.aborted) sourceBackoff.set(id, now() + SOURCE_RETRY_COOLDOWN);
          });
        } else if (claim) {
          const previous = localFailures.get(id);
          localFailures.set(id, {at: now(), count: (previous?.count || 0) + 1});
        }
      } finally {
        clearTimeout(timer);
        if (sourceJobs.get(id) === job) sourceJobs.delete(id);
        if (!lifetime.signal.aborted) void refresh();
      }
    })();
  }

  async function reconcile(events, time) {
    for (const [id, source] of sources) {
      if (!events[id] || source.expiresAt <= time || hasEnded(events[id], time)) sources.delete(id);
    }
    for (const [id, at] of sourceBackoff) if (at <= time || !events[id] || hasEnded(events[id], time)) sourceBackoff.delete(id);
    for (const id of localFailures.keys()) if (!events[id] || hasEnded(events[id], time)) localFailures.delete(id);
    const archive = Object.values(events)
      .filter(event => hasEnded(event, time)).sort((a, b) => b.startsAt - a.startsAt).slice(HISTORY);
    const needsWrite = archive.length || Object.values(events).some(event =>
      (!event.winnerId && time >= event.votingClosesAt) ||
      (sources.has(event.id) && event.playbackStartedAt == null && time >= event.startsAt));
    if (needsWrite) {
      events = await write((current, _state, at) => {
        for (const event of archive) if (current[event.id] && hasEnded(current[event.id], at)) delete current[event.id];
        for (const event of Object.values(current)) {
          lockWinner(event, at);
          beginPlayback(event, sources.get(event.id), at);
        }
        return current;
      });
    }
    for (const event of Object.values(events)) {
      if (event.winnerId && !failureFor(event) && !hasEnded(event, time) &&
          !activeLease(event, time) && !sources.has(event.id) && !sourceBackoff.has(event.id)) startSource(event);
    }
  }

  function scheduleWake(events) {
    if (!autoStart || lifetime.signal.aborted) return;
    clearTimeout(timer);
    const time = now();
    let wakeAt = time + BALLOT_COOLDOWN;
    if (events !== EMPTY) {
      const reconciledAt = Math.min(lastReconciledAt, time);
      const deadlines = [];
      for (const event of Object.values(events)) {
        if (hasEnded(event, reconciledAt)) continue;
        if (!event.winnerId) deadlines.push(event.votingClosesAt);
        if (event.playbackStartedAt == null) deadlines.push(event.startsAt, event.startsAt + START_WINDOW);
        else deadlines.push(event.playbackStartedAt + duration(event) * 1000);
        deadlines.push(event.sourceLease?.until, sources.get(event.id)?.expiresAt, sourceBackoff.get(event.id));
      }
      if (eventSlots(config, time, events).some(slot => !events[slot.id])) deadlines.push(ballotRetryAt);
      // A boundary reached between reconciliation and scheduling still needs its own pass.
      wakeAt = deadlines.filter(at => Number.isFinite(at) && at > reconciledAt)
        .reduce((next, at) => Math.min(at, next), Infinity);
    }
    if (wakeAt !== Infinity) {
      const delay = Math.max(1, Math.min(wakeAt - time, 2147483647));
      timer = setTimeout(() => void refresh().then(prepareBallots), delay);
      timer.unref?.();
    }
  }

  async function refresh() {
    if (lifetime.signal.aborted) return EMPTY;
    try {
      const events = await read();
      if (lifetime.signal.aborted) return EMPTY;
      const time = now();
      await reconcile(events, time);
      storageReachable = true;
      lastReconciledAt = time;
      publish();
      scheduleWake(latest.events);
      return latest.events;
    } catch {
      storageReachable = false;
      publish(storageFault());
      scheduleWake(EMPTY);
      return EMPTY;
    }
  }

  function prepareBallots(events) {
    if (activeSeed) return activeSeed;
    const time = now();
    const slots = eventSlots(config, time, events);
    if (events === EMPTY || lifetime.signal.aborted || time < ballotRetryAt || !slots.some(slot => !events[slot.id])) {
      return Promise.resolve(events);
    }
    activeSeed = (async () => {
      const pool = await catalogPool(localDate(config.calendar, time));
      if (lifetime.signal.aborted) return EMPTY;
      if (pool.length >= BALLOT_SIZE) {
        await write((current, _state, at) => seedBallots(current, eventSlots(config, at, current), pool));
      }
      ballotStorageFailure = false;
      const updated = latest.events;
      ballotRetryAt = eventSlots(config, now(), updated).some(slot => !updated[slot.id])
        ? now() + BALLOT_COOLDOWN : -Infinity;
      return refresh();
    })().catch(error => {
      ballotStorageFailure = error.code === 'storage_unavailable';
      ballotRetryAt = now() + BALLOT_COOLDOWN;
      publish();
      scheduleWake(latest.events);
      return latest.events;
    }).finally(() => { activeSeed = undefined; });
    return activeSeed;
  }

  function tick() {
    if (activeTick) return activeTick;
    activeTick = refresh().then(prepareBallots).finally(() => { activeTick = undefined; });
    return activeTick;
  }

  async function currentEvents(id) {
    const events = await refresh();
    if (events === EMPTY) return EMPTY;
    const time = now();
    const selected = selectedEvent(events, eventSlots(config, time, events), time, id);
    const seed = prepareBallots(events);
    if (selected && !selected.candidates) return seed;
    return latest.events;
  }

  async function snapshot(req, id) {
    if (id != null && !EVENT_ID.test(id)) throw unknownEvent();
    const [events, account] = await Promise.all([currentEvents(id), identity(req).catch(error => error)]);
    const problem = events === EMPTY || account instanceof Error ? storageFault() : undefined;
    return snapshotFrom(events === EMPTY ? EMPTY : latest.events, id, account instanceof Error ? null : account, problem);
  }

  function replyError(res, error) {
    const problem = error.movieNights ? error : storageFault();
    res.status(problem.status).json({code: problem.code, message: problem.message});
  }

  const route = operation => (req, res) => {
    Promise.resolve().then(() => operation(req, res)).catch(error => replyError(res, error));
  };

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.get(['/', '/:id'], route(async (req, res) => {
    const data = await snapshot(req, req.params.id);
    res.status(data.code ? 503 : 200).json(data);
  }));

  function mutation(req, res, next) {
    if (lifetime.signal.aborted) return replyError(res, disposed());
    if (!req.is('application/json') || !originAllowed(req.headers, req.secure, true)) {
      return replyError(res, fault(403, 'same_origin_required', 'Open Movie Nights directly in SwiflyTV to make this change.'));
    }
    next();
  }

  const json = express.json({limit: '2kb'});
  router.post('/:id/vote', mutation, json, route(async (req, res) => {
    const id = req.params.id;
    const film = movieId(req.body?.movieId);
    if (!EVENT_ID.test(id)) throw unknownEvent();
    if (!film) throw fault(400, 'invalid_movie', 'Choose a movie from the ballot.');
    const account = await identity(req);
    if (!account) throw signIn();
    const expected = req.get('X-Swifly-Account');
    if (expected && expected !== account.id) throw accountChanged();
    const result = await write((events, state, time) => {
      checkSession(state, account, time);
      const event = events[id];
      if (!event) throw unknownEvent();
      lockWinner(event, time);
      if (event.winnerId) return true;
      if (!event.candidates.some(candidate => candidate.id === film)) throw fault(400, 'invalid_movie', 'Choose a movie from the ballot.');
      const key = voteKey(account.id);
      if (!Object.hasOwn(event.votes, key) && Object.keys(event.votes).length >= MAX_VOTES) {
        throw fault(503, 'ballot_full', 'This ballot has reached its voting capacity.');
      }
      event.votes[key] = film;
      return false;
    });
    if (result) {
      void refresh();
      throw closedVote();
    }
    publish();
    res.json(snapshotFrom(latest.events, id, account));
  }));

  router.post('/:id/retry', mutation, json, route(async (req, res) => {
    const id = req.params.id;
    if (!EVENT_ID.test(id)) throw unknownEvent();
    const account = await identity(req);
    if (!account) throw signIn();
    const expected = req.get('X-Swifly-Account');
    if (expected && expected !== account.id) throw accountChanged();
    const result = await write((events, state, time) => {
      checkSession(state, account, time);
      const event = events[id];
      if (!event) throw unknownEvent();
      const failure = failureFor(event);
      if (!event.winnerId || !failure || sources.has(id) || sourceJobs.has(id) ||
          activeLease(event, time) || hasEnded(event, time)) {
        throw fault(409, 'source_not_retryable', 'This screening does not have a failed source to retry.');
      }
      if (failure.count >= SOURCE_FAILURE_LIMIT) {
        throw fault(409, 'source_retry_exhausted', 'This screening has reached its source retry limit.');
      }
      if (Math.max(failure.at, event.sourceRetryAt || 0) + SOURCE_RETRY_COOLDOWN > time) {
        throw fault(429, 'source_retry_cooldown', 'Wait briefly before retrying this screening.');
      }
      event.sourceRetryAt = time;
      return {event, token: sourceEstablished(event) ? undefined : reserveSource(event, time)};
    });
    startSource(result.event, result.token);
    publish();
    res.json(snapshotFrom(latest.events, id, account));
  }));

  router.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const problem = error.status === 413 ? fault(413, 'request_too_large', 'This Movie Nights request is too large.')
      : fault(400, 'invalid_json', 'Send a valid JSON request.');
    replyError(res, problem);
  });

  async function allowed(socket) {
    if (lifetime.signal.aborted) return false;
    try {
      const request = socketRequest(socket);
      return originAllowed(request.headers, request.secure, false) && await authorizeSocket(socket);
    } catch {
      return false;
    }
  }

  function broadcast(id, event, value, isCurrent = () => true) {
    for (const member of members.values()) {
      if (member.id !== id) continue;
      void allowed(member.socket).then(valid => {
        if (!member.socket.connected || member.id !== id) return;
        if (valid && isCurrent()) member.socket.emit(event, value);
        if (!valid) member.socket.disconnect();
      });
    }
  }

  function presence(id) {
    if (!id || lifetime.signal.aborted) return;
    const count = viewers(id);
    if (count) broadcast(id, 'night:presence', {id, viewers: count});
    else lastPublicState.delete(id);
  }

  function connection(socket) {
    if (members.size >= MAX_CONNECTIONS || lifetime.signal.aborted) {
      socket.disconnect();
      return;
    }
    const request = socketRequest(socket);
    const accountAtConnection = identity(request).catch(() => null);
    const member = {socket, id: null, windowStartedAt: now(), count: 0};
    members.set(socket.id, member);
    socket.on('disconnect', () => {
      members.delete(socket.id);
      presence(member.id);
      member.id = null;
    });

    function handle(name, operation) {
      socket.on(name, (input, ack) => {
        if (typeof ack !== 'function') return;
        void (async () => {
          const time = now();
          if (time - member.windowStartedAt >= MESSAGE_WINDOW) {
            member.windowStartedAt = time;
            member.count = 0;
          }
          if (++member.count > 30) throw fault(429, 'rate_limited', 'Slow down and try again.');
          if (!await allowed(socket)) throw denied();
          if (typeof input?.id !== 'string' || !EVENT_ID.test(input.id)) throw unknownEvent();
          const account = await identity(request);
          const result = await operation(input, account);
          if (!await allowed(socket)) throw denied();
          ack({ok: true, ...result});
        })().catch(error => {
          const problem = error.movieNights ? error : storageFault();
          ack({ok: false, code: problem.code, message: problem.message});
          if (problem.code === 'access_denied') socket.disconnect();
        });
      });
    }

    handle('night:join', async ({id}, account) => {
      const events = await currentEvents(id);
      const data = snapshotFrom(events, id, account, events === EMPTY ? storageFault() : undefined);
      if (!socket.connected || !await allowed(socket)) throw denied();
      const previous = member.id;
      member.id = id;
      if (previous !== id) {
        presence(previous);
        presence(id);
      }
      return {...data, event: {...data.event, viewers: viewers(id)}};
    });

    handle('night:sync', async ({id}, account) => {
      if (member.id !== id) throw unknownEvent();
      const events = await currentEvents(id);
      return snapshotFrom(events, id, account, events === EMPTY ? storageFault() : undefined);
    });

    handle('night:message', async ({id, text: rawText, clientId}, account) => {
      if (member.id !== id) throw unknownEvent();
      if (!account) throw signIn();
      if (account.id !== (await accountAtConnection)?.id) throw accountChanged();
      const text = clean(rawText, 500);
      if (!text || rawText.length > 500 || typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) {
        throw fault(400, 'invalid_message', 'Enter a message of up to 500 characters.');
      }
      const result = await write(async (events, state, time) => {
        if (!socket.connected || !await allowed(socket)) throw denied();
        checkSession(state, account, time);
        const event = events[id];
        if (!event || hasEnded(event, time)) throw unknownEvent();
        const duplicate = event.receipts.find(item => item.accountId === account.id && item.clientId === clientId);
        if (duplicate) return {message: messageItem(duplicate), duplicate: true};
        const activity = event.chatRate ||= {};
        for (const [key, timestamps] of Object.entries(activity)) {
          const recent = timestamps.filter(at => time - at < MESSAGE_WINDOW);
          if (recent.length) activity[key] = recent;
          else delete activity[key];
        }
        const key = voteKey(account.id);
        const timestamps = activity[key] || [];
        if (timestamps.length >= 3 || (!timestamps.length && Object.keys(activity).length >= MAX_VOTES)) {
          throw fault(429, 'rate_limited', 'Slow down and try again.');
        }
        activity[key] = [...timestamps, time];
        const record = {id: randomUUID(), accountId: account.id, name: account.name, text, createdAt: time, clientId};
        event.receipts = [...event.receipts.slice(1 - MESSAGE_RECEIPTS), record];
        event.messages = [...event.messages.slice(1 - MESSAGE_HISTORY), record];
        return {message: messageItem(record), duplicate: false};
      });
      if (!result.duplicate) broadcast(id, 'night:message', result.message);
      return {message: result.message};
    });
  }

  const admission = socket => allowed(socket).then(valid => valid && members.size < MAX_CONNECTIONS);
  const admissionSlot = namespace && admissionFor(namespace);
  if (admissionSlot) {
    if (admissionSlot.active) throw new Error('Movie Nights is already mounted on this Socket.IO server.');
    admissionSlot.active = admission;
  }
  namespace?.on('connection', connection);
  if (autoStart) void tick();

  function close() {
    if (lifetime.signal.aborted) return;
    clearTimeout(timer);
    lifetime.abort();
    if (admissionSlot?.active === admission) delete admissionSlot.active;
    namespace?.off('connection', connection);
    for (const {socket} of members.values()) socket.disconnect();
    members.clear();
    lastPublicState.clear();
    sourceJobs.clear();
    sourceBackoff.clear();
    localFailures.clear();
    sources.clear();
  }

  return {router, snapshot, homePreview, tick, close};
}

module.exports = {createMovieNights};
