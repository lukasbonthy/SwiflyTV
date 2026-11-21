'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createAccountStore} = require('../lib/account-store');
const {createMovieNights} = require('../lib/movie-nights');
const {FRIDAY, START, CLOSE, FILM, setup, listen, post, waitFor} = require('./movie-nights-test-helpers.cjs');

test('Friday and Saturday screenings use New York local time across spring and fall DST', async t => {
  const h = await setup(t, {time: Date.parse('2026-03-06T17:00:00Z')});
  const spring = await h.service.snapshot(h.request());
  assert.equal(spring.event.id, '2026-03-06');
  assert.equal(spring.event.startsAt, Date.parse('2026-03-07T01:00:00Z'));
  assert.equal(spring.upcoming[0].startsAt, Date.parse('2026-03-08T01:00:00Z'));
  assert.equal(spring.upcoming[1].startsAt, Date.parse('2026-03-14T00:00:00Z'));
  h.setTime(Date.parse('2026-10-30T16:00:00Z'));
  const fall = await h.service.snapshot(h.request());
  assert.equal(fall.event.startsAt, Date.parse('2026-10-31T00:00:00Z'));
  assert.equal(fall.upcoming[1].startsAt, Date.parse('2026-11-07T01:00:00Z'));
  assert.equal(fall.event.startsAt - fall.event.votingClosesAt, 300000);
});

test('schedule overrides are honored, including the spring-forward gap', async t => {
  const h = await setup(t, {
    time: Date.parse('2026-03-07T17:00:00Z'), schedule: {timeZone: 'America/New_York', hour: 2, days: [0]}
  });
  const snapshot = await h.service.snapshot(h.request());
  assert.equal(snapshot.event.startsAt, Date.parse('2026-03-08T07:00:00Z'));
  assert.equal(snapshot.upcoming[0].startsAt, Date.parse('2026-03-15T06:00:00Z'));
  assert.deepEqual(snapshot.schedule, {timeZone: 'America/New_York', hour: 2, days: [0]});
});

test('ballots persist six distinct verified released films and rotate between events', async t => {
  const h = await setup(t, {catalogue: {
    1: {release_date: '2030-01-01'}, 2: {adult: true}, 3: {runtime: 0},
    4: {id: 104}, 5: {backdrop_path: ''}, 6: {release_date: '2020-02-30'}
  }});
  const first = await h.service.snapshot(h.request());
  const ids = first.event.candidates.map(film => film.id);
  assert.equal(new Set(ids).size, 6);
  assert.ok(ids.every(id => id > 6));
  assert.ok(first.event.candidates.every(film => film.votes === 0 && film.runtime === 120 && film.poster.startsWith('https://image.tmdb.org/')));
  assert.ok(first.upcoming[0].candidates.every(film => !ids.includes(film.id)));
  const calls = h.catalog.calls.length;
  assert.deepEqual((await h.service.snapshot(h.request())).event.candidates, first.event.candidates);
  assert.equal(h.catalog.calls.length, calls);
  assert.equal(first.event.viewers, 0);
  assert.deepEqual(first.event.messages, []);
});

test('background replenishment avoids recent winners and bounds old event records', async t => {
  const h = await setup(t);
  const original = (await h.service.snapshot(h.request())).event;
  h.setTime(CLOSE);
  const locked = await h.service.snapshot(h.request(), original.id);
  h.setTime(FRIDAY + 14 * 86400000);
  const fresh = await h.service.snapshot(h.request());
  assert.ok(fresh.event.candidates.every(film => film.id !== locked.event.winner.id));
  for (let week = 1; week <= 15; week++) {
    h.setTime(FRIDAY + week * 7 * 86400000);
    await h.service.tick();
  }
  const state = (await h.store.read()).movieNights;
  const records = Object.values(state.events);
  assert.ok(records.length <= 16);
  assert.ok(!records.some(record => record.id === original.id));
});

test('a storage outage yields unavailable state without reaching the catalogue or source', async t => {
  const offline = () => { throw new Error('storage offline'); };
  const h = await setup(t, {store: {read: offline, transaction: offline}});
  const snapshot = await h.service.snapshot(h.request('alice'));
  assert.equal(snapshot.event.phase, 'unavailable');
  assert.equal(snapshot.code, 'storage_unavailable');
  assert.deepEqual(snapshot.event.candidates, []);
  assert.deepEqual(h.catalog.calls, []);
  assert.deepEqual(h.calls, []);
});

test('Home uses the latest public ballot and falls back to the schedule during an outage', async t => {
  const h = await setup(t);
  const {event} = await h.service.snapshot(h.request('alice'));
  const base = await listen(h.server);
  const film = event.candidates.at(-1);
  assert.equal((await post(base, '/' + event.id + '/vote', {movieId: film.id})).status, 200);
  const read = h.store.read;
  const write = t.mock.method(h.store, 'transaction');
  const brokenRead = t.mock.method(h.store, 'read', async () => { throw new Error('storage offline'); });
  const before = h.catalog.calls.length;
  const preview = h.service.homePreview();
  assert.equal(preview.id, event.id);
  assert.equal(preview.phase, 'voting');
  assert.equal(preview.candidates.find(row => row.id === film.id).votes, 1);
  assert.deepEqual(Object.keys(preview).sort(), ['candidates','id','phase','startsAt','timeZone','viewers','winner']);
  assert.equal(h.service.homePreview(), preview);
  assert.equal(brokenRead.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(h.catalog.calls.length, before);
  assert.deepEqual(h.calls, []);
  await h.service.tick();
  const schedule = h.service.homePreview();
  assert.equal(schedule.phase, 'unavailable');
  assert.equal(schedule.startsAt, event.startsAt);
  assert.deepEqual(schedule.candidates, []);
  h.store.read = read;
  await h.service.tick();
  assert.equal(h.service.homePreview().phase, 'voting');
});

test('a catalogue outage never creates an empty persisted ballot', async t => {
  const h = await setup(t, {tmdb: async () => ({__error: true})});
  const snapshot = await h.service.snapshot(h.request());
  assert.equal(snapshot.event.phase, 'unavailable');
  assert.equal(snapshot.code, 'ballot_unavailable');
  assert.deepEqual((await h.store.read()).movieNights?.events || {}, {});
});

test('failure to write the first verified ballot reports a storage outage', async t => {
  const h = await setup(t, {store: {
    read: async () => ({}),
    transaction: async () => { throw new Error('read-only storage'); }
  }});
  const result = await h.service.snapshot(h.request());
  assert.ok(h.catalog.calls.some(call => call.path === '/movie/6'));
  assert.equal(result.event.phase, 'unavailable');
  assert.equal(result.code, 'storage_unavailable');
  assert.deepEqual(result.event.candidates, []);
  assert.equal((await h.service.snapshot(h.request())).code, 'storage_unavailable');
});

test('a failed upcoming seed does not make an established ballot unavailable', async t => {
  let backend;
  let failWrites = false;
  const h = await setup(t, {store: {
    read: () => backend.read(),
    transaction: change => failWrites ? Promise.reject(new Error('read-only storage')) : backend.transaction(change)
  }});
  backend = createAccountStore({directory: h.directory, connectionString: ''});
  t.after(() => backend.close());
  const initial = await h.service.snapshot(h.request());
  const missing = initial.upcoming.at(-1).id;
  await backend.transaction(state => { delete state.movieNights.events[missing]; });
  failWrites = true;
  const upcoming = await h.service.snapshot(h.request(), missing);
  assert.equal(upcoming.code, 'storage_unavailable');
  const established = await h.service.snapshot(h.request(), initial.event.id);
  assert.equal(established.code, undefined);
  assert.deepEqual(established.event.candidates, initial.event.candidates);
});

test('a persistent write outage does not fabricate playback or spin the source resolver', async t => {
  let failWrites = false;
  let backend;
  const h = await setup(t, {store: {
    read: () => backend.read(),
    transaction(change) {
      if (failWrites) return Promise.reject(new Error('read-only storage'));
      return backend.transaction(change);
    }
  }, resolveSource: () => {
    failWrites = true;
    return FILM;
  }});
  backend = createAccountStore({directory: h.directory, connectionString: ''});
  t.after(() => backend.close());
  const {event} = await h.service.snapshot(h.request());
  h.setTime(START);
  const failed = await waitFor(() => h.service.snapshot(h.request(), event.id), value => value.event.phase === 'unavailable');
  assert.equal(failed.event.playbackStartedAt, null);
  assert.equal(failed.event.winner.id, event.candidates[0].id);
  assert.ok(!('source' in failed.event));
  await h.service.tick();
  await h.service.tick();
  assert.equal(h.calls.length, 1);
});

test('vote at the cutoff is refused and a tied vote locks once in persisted order', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  const [first, second, third] = event.candidates;
  assert.equal((await post(base, '/' + event.id + '/vote', {movieId: second.id})).status, 200);
  assert.equal((await post(base, '/' + event.id + '/vote', {movieId: first.id}, 'bob')).status, 200);
  h.setTime(CLOSE);
  const [past, locked] = await Promise.all([
    post(base, '/' + event.id + '/vote', {movieId: third.id}),
    h.service.snapshot(h.request(), event.id)
  ]);
  assert.equal(past.status, 409);
  assert.equal((await past.json()).code, 'voting_closed');
  assert.equal(locked.event.winner.id, first.id);
  assert.equal(locked.event.totalVotes, 2);
  h.setTime(START);
  assert.equal((await h.service.snapshot(h.request(), event.id)).event.winner.id, first.id);
  assert.deepEqual(h.calls, [first.id]);
});

test('no-vote source resolves once and shared delayed playback uses the persisted readiness instant', async t => {
  let resolve;
  const source = new Promise(done => { resolve = done; });
  const h = await setup(t, {resolveSource: () => source});
  const {event} = await h.service.snapshot(h.request());
  h.setTime(CLOSE);
  const pending = (await h.service.snapshot(h.request())).event;
  assert.equal(pending.winner.id, event.candidates[0].id);
  assert.equal(pending.sourceStatus, 'loading');
  assert.ok(!('source' in pending));
  h.setTime(START + 10000);
  const late = (await h.service.snapshot(h.request())).event;
  assert.equal(late.phase, 'countdown');
  assert.equal(late.playbackStartedAt, null);
  resolve(FILM);
  const live = await waitFor(() => h.service.snapshot(h.request()), value => value.event.phase === 'live');
  assert.equal(live.event.playbackStartedAt, START + 10000);
  assert.equal(live.event.duration, 7200);
  assert.equal(live.event.source.playbackUrl, FILM.playbackUrl);
  assert.deepEqual(h.calls, [event.candidates[0].id]);
  assert.ok(!JSON.stringify((await h.store.read()).movieNights).includes(FILM.playbackUrl));
});

test('ready-before-show start and winner survive restart without resetting the shared clock', async t => {
  const h = await setup(t);
  const {event} = await h.service.snapshot(h.request());
  h.setTime(CLOSE);
  await waitFor(() => h.service.snapshot(h.request()), value => value.event.sourceStatus === 'ready');
  h.setTime(START + 900);
  const first = await h.service.snapshot(h.request());
  assert.equal(first.event.playbackStartedAt, START);
  h.service.close();
  await h.store.close();
  const reopened = createAccountStore({directory: h.directory, connectionString: ''});
  const replay = createMovieNights({...h.settings, io: null, store: reopened});
  t.after(async () => { replay.close(); await reopened.close(); });
  h.setTime(START + 125000);
  const later = await waitFor(() => replay.snapshot(h.request(), event.id), value => value.event.phase === 'live');
  assert.equal(later.event.winner.id, first.event.winner.id);
  assert.equal(later.event.playbackStartedAt, START);
  assert.equal(later.serverTime - later.event.playbackStartedAt, 125000);
  assert.equal(later.event.source.playbackUrl, FILM.playbackUrl);
  h.setTime(START + 7200000);
  const ended = await replay.snapshot(h.request(), event.id);
  assert.equal(ended.event.phase, 'ended');
  assert.ok(!('source' in ended.event));
  assert.equal((await replay.snapshot(h.request())).event.id, '2026-11-21');
});

for (const newerFinishesFirst of [false, true]) {
  test(`overlapping source generations preserve restart recovery (newer finishes ${newerFinishesFirst ? 'first' : 'second'})`, async t => {
    let rejectOlder;
    let fulfillNewer;
    const h = await setup(t, {resolveSource: () => new Promise((_, reject) => { rejectOlder ||= reject; })});
    const {event} = await h.service.snapshot(h.request());
    h.setTime(START);
    await waitFor(() => h.service.snapshot(h.request(), event.id), () => typeof rejectOlder === 'function');
    const replacement = createMovieNights({...h.settings, io: null,
      resolveSource: () => new Promise(resolve => { fulfillNewer ||= resolve; })
    });
    t.after(() => replacement.close());
    const beforeExpiry = await replacement.snapshot(h.request(), event.id);
    assert.equal(beforeExpiry.event.sourceStatus, 'loading');
    assert.equal(fulfillNewer, undefined);
    h.setTime(START + 100000);
    await waitFor(() => replacement.snapshot(h.request(), event.id), () => typeof fulfillNewer === 'function');
    if (!newerFinishesFirst) {
      rejectOlder(new Error('Older source failed'));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    fulfillNewer(FILM);
    const live = await waitFor(() => replacement.snapshot(h.request(), event.id), value => value.event.phase === 'live');
    if (newerFinishesFirst) {
      rejectOlder(new Error('Older source failed'));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    h.service.close();
    replacement.close();
    let recovered = 0;
    const successor = createMovieNights({...h.settings, io: null, resolveSource: async () => { recovered++; return FILM; }});
    t.after(() => successor.close());
    h.setTime(live.event.playbackStartedAt + 1000);
    const replay = await waitFor(() => successor.snapshot(h.request(), event.id), value => value.event.phase === 'live');
    assert.equal(replay.event.playbackStartedAt, live.event.playbackStartedAt);
    assert.equal(replay.event.winner.id, event.candidates[0].id);
    assert.equal(recovered, 1);
    assert.equal((await h.store.read()).movieNights.events[event.id].sourceFailure, undefined);
  });
}

test('a process unable to reacquire an established source leaves the common start recoverable', async t => {
  const h = await setup(t);
  const {event} = await h.service.snapshot(h.request());
  h.setTime(START);
  const live = await waitFor(() => h.service.snapshot(h.request(), event.id), value => value.event.phase === 'live');
  const failedWorker = createMovieNights({...h.settings, io: null, resolveSource: async () => ({status: 'error'})});
  t.after(() => failedWorker.close());
  h.setTime(START + 1000);
  await waitFor(() => failedWorker.snapshot(h.request(), event.id), value => value.event.sourceStatus === 'error');
  assert.equal((await h.service.snapshot(h.request(), event.id)).event.phase, 'live');
  assert.equal((await h.store.read()).movieNights.events[event.id].sourceFailure, undefined);
  h.service.close();
  failedWorker.close();
  const recovered = createMovieNights({...h.settings, io: null});
  t.after(() => recovered.close());
  const resumed = await waitFor(() => recovered.snapshot(h.request(), event.id), value => value.event.phase === 'live');
  assert.equal(resumed.event.playbackStartedAt, live.event.playbackStartedAt);
});

test('idle automatic scheduling avoids full-store polling and wakes for the next cutoff', async t => {
  t.mock.timers.enable({apis: ['setTimeout', 'setInterval']});
  let reads = 0;
  let backend;
  let unblock;
  const initialized = new Promise(resolve => { unblock = resolve; });
  let invoked;
  const sourceInvoked = new Promise(resolve => { invoked = resolve; });
  const h = await setup(t, {
    autoStart: true,
    store: {read: async () => { reads++; await initialized; return backend.read(); }, transaction: change => backend.transaction(change)},
    resolveSource: () => { invoked(); return FILM; }
  });
  backend = createAccountStore({directory: h.directory, connectionString: ''});
  t.after(() => backend.close());
  unblock();
  await h.service.tick();
  const idleReads = reads;
  h.setTime(FRIDAY + 30000);
  t.mock.timers.tick(30000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, idleReads);
  assert.equal(h.calls.length, 0);
  h.setTime(CLOSE);
  t.mock.timers.tick(CLOSE - FRIDAY - 30000);
  await deadlineFor(sourceInvoked);
  assert.equal(h.calls.length, 1);
});

test('idle storage retries back off when a ballot retry is due and resume after recovery', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const retryInterval = 60000;
  let state = {};
  let reads = 0;
  let offline = false;
  let catalog;
  const h = await setup(t, {
    autoStart: true,
    tmdb: (...args) => catalog ? catalog(...args) : {__error: true},
    store: {
      async read() {
        reads++;
        if (offline) throw new Error('offline storage');
        return structuredClone(state);
      },
      async transaction(change) {
        const next = structuredClone(state);
        const result = await change(next);
        state = next;
        return result;
      }
    }
  });
  await h.service.tick();
  const initialReads = reads;
  const advance = async (elapsed, delta) => {
    h.setTime(FRIDAY + elapsed);
    t.mock.timers.tick(delta);
    await new Promise(resolve => setImmediate(resolve));
  };

  offline = true;
  await advance(retryInterval, retryInterval);
  assert.equal(reads, initialReads + 1);
  for (let offset = 1; offset <= 3; offset++) await advance(retryInterval + offset, 1);
  assert.equal(reads, initialReads + 1);
  await advance(retryInterval * 2, retryInterval - 3);
  assert.equal(reads, initialReads + 2);

  offline = false;
  catalog = h.catalog.tmdb;
  await advance(retryInterval * 3, retryInterval);
  assert.equal(state.movieNights.events['2026-11-20'].candidates.length, 6);
  const recoveredReads = reads;
  await advance(retryInterval * 4, retryInterval);
  assert.equal(reads, recoveredReads);
});

for (const boundary of ['cutoff', 'start']) {
  test(`idle scheduling follows up when reconciliation crosses the screening ${boundary}`, async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    let instant = FRIDAY;
    let jumpAfterReading;
    const h = await setup(t, {autoStart: true, now: () => {
      const observed = instant;
      if (jumpAfterReading != null) {
        instant = jumpAfterReading;
        jumpAfterReading = undefined;
      }
      return observed;
    }});
    const initial = await h.service.tick();
    const id = Object.keys(initial).sort()[0];
    const stored = async () => (await h.store.read()).movieNights.events[id];
    if (boundary === 'start') {
      instant = CLOSE;
      await h.service.tick();
      await waitForStored(stored, event => event.sourceEstablishedAt === CLOSE);
      await h.service.tick();
    }
    const deadline = boundary === 'cutoff' ? CLOSE : START;
    instant = deadline - 1;
    jumpAfterReading = deadline + 1;
    await h.service.tick();
    assert.equal(instant, deadline + 1);
    assert.equal(boundary === 'cutoff' ? (await stored()).winnerId : (await stored()).playbackStartedAt, undefined);
    t.mock.timers.tick(1);
    const settled = await waitForStored(stored, event => boundary === 'cutoff' ? Boolean(event.winnerId) : event.playbackStartedAt != null);
    if (boundary === 'cutoff') assert.equal(settled.winnerId, initial[id].candidates[0].id);
    else assert.equal(settled.playbackStartedAt, START);
  });
}

async function waitForStored(read, predicate) {
  const deadline = AbortSignal.timeout(1000);
  for (;;) {
    const event = await read();
    if (predicate(event)) return event;
    assert.equal(deadline.aborted, false, 'Expected persisted event transition');
    await new Promise(resolve => setImmediate(resolve));
  }
}

for (const onDeadline of [true, false]) {
  test(`resolver receives cancellation on ${onDeadline ? 'deadline' : 'disposal'}`, async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    let resolverSignal;
    let stopped = false;
    let invoked;
    const sourceInvoked = new Promise(resolve => { invoked = resolve; });
    const h = await setup(t, {resolveSource: (_id, _attempt, context) => {
      resolverSignal = context?.signal;
      invoked();
      return new Promise((_, reject) => resolverSignal?.addEventListener('abort', () => {
        stopped = true;
        reject(resolverSignal.reason);
      }, {once: true}));
    }});
    await h.service.snapshot(h.request());
    h.setTime(CLOSE);
    await h.service.tick();
    await deadlineFor(sourceInvoked);
    assert.ok(resolverSignal instanceof AbortSignal);
    assert.equal(resolverSignal.aborted, false);
    if (onDeadline) t.mock.timers.tick(90000);
    else h.service.close();
    assert.equal(resolverSignal.aborted, true);
    assert.equal(stopped, true);
  });
}

function deadlineFor(promise) {
  const watchdog = AbortSignal.timeout(1000);
  return Promise.race([promise, new Promise((_, reject) => {
    watchdog.addEventListener('abort', () => reject(new Error('Expected source resolver invocation')), {once: true});
  })]);
}

test('closing the service invalidates a source failure already queued for the store', async t => {
  let backend;
  let blockCompletion = false;
  let queued;
  const writeQueued = new Promise(resolve => { queued = resolve; });
  let release;
  const allowWrite = new Promise(resolve => { release = resolve; });
  let rejectSource;
  const h = await setup(t, {
    store: {read: () => backend.read(), transaction: async change => {
      if (blockCompletion) { queued(); await allowWrite; }
      return backend.transaction(change);
    }},
    resolveSource: () => new Promise((_, reject) => { rejectSource = reject; })
  });
  backend = createAccountStore({directory: h.directory, connectionString: ''});
  t.after(() => backend.close());
  const {event} = await h.service.snapshot(h.request());
  h.setTime(CLOSE);
  await waitFor(() => h.service.snapshot(h.request(), event.id), () => typeof rejectSource === 'function');
  blockCompletion = true;
  rejectSource(new Error('Queued provider failure'));
  await writeQueued;
  h.service.close();
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await backend.read()).movieNights.events[event.id].sourceFailure, undefined);
});

for (const expiresAt of [0, 'invalid', null]) {
  test(`an explicit invalid source expiry is rejected (${String(expiresAt)})`, async t => {
    const h = await setup(t, {resolveSource: async () => ({...FILM, expiresAt})});
    const {event} = await h.service.snapshot(h.request());
    h.setTime(START);
    const failed = await waitFor(() => h.service.snapshot(h.request(), event.id), value => value.event.sourceStatus === 'error');
    assert.equal(failed.event.phase, 'unavailable');
    assert.ok(!('source' in failed.event));
  });
}
