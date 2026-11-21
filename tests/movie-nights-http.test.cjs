'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createAccountStore} = require('../lib/account-store');
const {createMovieNights} = require('../lib/movie-nights');
const {CLOSE, START, FILM, setup, listen, post, waitFor} = require('./movie-nights-test-helpers.cjs');

test('GET exposes stable event links and personalized private snapshots', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const first = await fetch(base + '/api/movie-nights');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
  const guest = await first.json();
  assert.deepEqual(guest.viewer, {signedIn: false, name: ''});
  assert.equal(guest.event.yourVote, null);
  assert.equal(guest.upcoming.length, 3);
  const direct = await fetch(base + '/api/movie-nights/' + guest.upcoming[0].id, {headers: {Cookie: 'test_session=alice'}});
  assert.equal(direct.status, 200);
  const personal = await direct.json();
  assert.equal(personal.event.id, guest.upcoming[0].id);
  assert.deepEqual(personal.viewer, {signedIn: true, name: 'Alice'});
  assert.doesNotMatch(JSON.stringify(personal), /account-private|secret-alice/);
  assert.equal((await fetch(base + '/api/movie-nights/missing')).status, 404);
  assert.equal((await fetch(base + '/api/movie-nights/2020-01-01')).status, 404);
});

test('POST validates account, JSON, exact origin and ballot movie IDs', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  const url = '/' + event.id + '/vote';
  const body = {movieId: event.candidates[0].id};
  assert.equal((await post(base, url, body, 'guest')).status, 401);
  assert.equal((await post(base, url, body, 'alice', {Origin: 'https://malicious.invalid'})).status, 403);
  assert.equal((await post(base, url, body, 'alice', {Origin: base.replace('http:', 'https:')})).status, 403);
  assert.equal((await post(base, url, body, 'alice', {Origin: base + '/lookalike'})).status, 403);
  assert.equal((await post(base, url, body, 'alice', {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  assert.equal((await post(base, url, body, 'alice', {'Content-Type': 'text/plain'})).status, 403);
  assert.equal((await post(base, url, body, 'alice', {'X-Swifly-Account': 'account-private-bob'})).status, 409);
  const malformed = await fetch(base + '/api/movie-nights' + url, {
    method: 'POST', body: '{broken', headers: {Origin: base, 'Content-Type': 'application/json'}
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'invalid_json');
  for (const movieId of [999999, true, '1x', [1], -1]) {
    assert.equal((await post(base, url, {movieId})).status, 400);
  }
  assert.equal((await h.service.snapshot(h.request(), event.id)).event.totalVotes, 0);
});

test('concurrent ballots count one vote per account and support replacement without touching other account state', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  const url = '/' + event.id + '/vote';
  const [first, second] = event.candidates;
  await h.store.transaction(state => {
    state.featureFlag = {version: 4};
    state.homes.keep = {members: ['test-home']};
    state.messages.push({text: 'existing messages'});
    state.notifications.push({kind: 'existing notifications'});
  });
  const before = await h.store.read();
  const responses = await Promise.all([
    ...Array.from({length: 6}, () => post(base, url, {movieId: first.id})),
    post(base, url, {movieId: second.id}, 'bob')
  ]);
  assert.ok(responses.every(response => response.status === 200));
  const replaced = await (await post(base, url, {movieId: second.id})).json();
  assert.equal(replaced.event.yourVote, second.id);
  assert.equal(replaced.event.totalVotes, 2);
  assert.equal(replaced.event.candidates.find(film => film.id === first.id).votes, 0);
  assert.equal(replaced.event.candidates.find(film => film.id === second.id).votes, 2);
  assert.doesNotMatch(JSON.stringify(replaced), /account-private|secret-alice/);
  const after = await h.store.read();
  delete before.movieNights;
  delete after.movieNights;
  assert.deepEqual(after, before);
  assert.equal((await h.service.snapshot(h.request(), event.id)).event.yourVote, null);
});

test('expired or reassigned persistent sessions cannot complete an authenticated vote', async t => {
  const h = await setup(t, {authenticate: async req => req.headers.cookie && {
    user: {id: 'alice', name: 'Alice'}, sessionHash: 'previous-token'
  }});
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  await h.store.transaction(state => {
    state.users.alice = {id: 'alice'};
    state.sessions['previous-token'] = {userId: 'bob', expiresAt: START};
  });
  const response = await post(base, '/' + event.id + '/vote', {movieId: event.candidates[0].id});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account_changed');
  assert.equal((await h.service.snapshot(h.request(), event.id)).event.totalVotes, 0);
});

test('a vote queued before but executed at the deadline cannot change the selected winner', async t => {
  let letAuthFinish;
  let received;
  const authReady = new Promise(resolve => { received = resolve; });
  const h = await setup(t, {authenticate: async req => {
    if (!req.headers.cookie) return null;
    received();
    await new Promise(resolve => { letAuthFinish = resolve; });
    return {id: 'alice', name: 'Alice'};
  }});
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  h.setTime(CLOSE - 1);
  const pendingVote = post(base, '/' + event.id + '/vote', {movieId: event.candidates[1].id});
  await authReady;
  h.setTime(CLOSE);
  letAuthFinish();
  const response = await pendingVote;
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'voting_closed');
  const locked = (await h.service.snapshot(h.request(), event.id)).event;
  assert.equal(locked.winner.id, event.candidates[0].id);
  assert.equal(locked.totalVotes, 0);
});

test('source retry waits for a failed selection and cooldown, then preserves the winner', async t => {
  const h = await setup(t, {resolveSource: (_id, attempt) => attempt === 1 ? {status: 'error'} : FILM});
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  const url = '/' + event.id + '/retry';
  assert.equal((await post(base, url, {})).status, 409);
  h.setTime(CLOSE);
  const failed = await waitFor(() => h.service.snapshot(h.request(), event.id), result => result.event.sourceStatus === 'error');
  assert.equal(failed.event.phase, 'unavailable');
  assert.equal(failed.event.playbackStartedAt, null);
  assert.ok(!('source' in failed.event));
  assert.equal((await post(base, url, {}, 'guest')).status, 401);
  assert.equal((await post(base, url, {})).status, 429);
  h.setTime(START + 60000);
  const responses = await Promise.all([post(base, url, {}), post(base, url, {}, 'bob')]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.ok(responses.every(response => [200, 409, 429].includes(response.status)));
  const live = await waitFor(() => h.service.snapshot(h.request(), event.id), result => result.event.phase === 'live');
  assert.equal(live.event.winner.id, failed.event.winner.id);
  assert.equal(live.event.playbackStartedAt, START + 60000);
  assert.deepEqual(h.calls, [failed.event.winner.id, failed.event.winner.id]);
});

test('repeated source failures have a persistent retry ceiling', async t => {
  const h = await setup(t, {resolveSource: async () => { throw new Error('offline media'); }});
  const base = await listen(h.server);
  const {event} = await h.service.snapshot(h.request());
  const url = '/' + event.id + '/retry';
  h.setTime(CLOSE);
  for (let i = 0; i < 3; i++) {
    await waitFor(() => h.service.snapshot(h.request(), event.id), result => result.event.sourceStatus === 'error');
    h.setTime(CLOSE + 30000 * (i + 1));
    const response = await post(base, url, {});
    if (i < 2) assert.equal(response.status, 200);
    else {
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'source_retry_exhausted');
    }
  }
  assert.equal(h.calls.length, 3);
  const stored = (await h.store.read()).movieNights.events[event.id];
  assert.equal(stored.sourceFailure.count, 3);
  assert.equal(stored.winnerId, event.candidates[0].id);
  h.service.close();
  const reopened = createAccountStore({directory: h.directory, connectionString: ''});
  const restarted = createMovieNights({...h.settings, store: reopened, io: null});
  t.after(async () => { restarted.close(); await reopened.close(); });
  h.setTime(START);
  const unavailable = await restarted.snapshot(h.request(), event.id);
  assert.equal(unavailable.event.phase, 'unavailable');
  assert.equal(unavailable.event.winner.id, stored.winnerId);
  assert.equal(h.calls.length, 3);
});

test('an expired shared stream refreshes the same winner without restarting playback', async t => {
  const h = await setup(t, {resolveSource: (_id, attempt) => ({
    ...FILM, playbackUrl: '/assets/stream-' + attempt + '.mp4', expiresAt: START + attempt * 10000
  })});
  const {event} = await h.service.snapshot(h.request());
  h.setTime(START);
  const first = await waitFor(() => h.service.snapshot(h.request()), result => result.event.phase === 'live');
  h.setTime(START + 10000);
  const refreshed = await waitFor(() => h.service.snapshot(h.request()), result => result.event.source?.playbackUrl.includes('stream-2'));
  assert.equal(refreshed.event.phase, 'live');
  assert.equal(refreshed.event.playbackStartedAt, first.event.playbackStartedAt);
  assert.deepEqual(h.calls, [event.candidates[0].id, event.candidates[0].id]);
});
