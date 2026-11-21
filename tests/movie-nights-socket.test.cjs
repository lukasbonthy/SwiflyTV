'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const WebSocket = require('ws');
const {createKids} = require('../lib/kids');
const {createSiteGate} = require('../lib/site-gate');
const {START, setup, listen, post, waitFor} = require('./movie-nights-test-helpers.cjs');

const NS = '/movie-nights,';

function socket(t, base, cookie = '', origin = base) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', {
    headers: {Cookie: cookie, Origin: origin}
  });
  t.after(() => ws.terminate());
  const messages = [];
  const callbacks = new Map();
  let nextId = 0;
  let connected;
  let rejectConnect;
  const ready = new Promise((resolve, reject) => { connected = resolve; rejectConnect = reject; });
  const timeout = setTimeout(() => rejectConnect(new Error('Socket namespace handshake timed out')), 2000);
  ready.finally(() => clearTimeout(timeout)).catch(() => {});
  ws.on('error', rejectConnect);
  ws.on('message', input => {
    const frame = input.toString();
    if (frame[0] === '0') ws.send('40' + NS);
    else if (frame === '2') ws.send('3');
    else if (frame.startsWith('40' + NS)) connected();
    else if (frame.startsWith('44' + NS)) rejectConnect(new Error(JSON.parse(frame.slice(2 + NS.length)).message));
    else if (frame.startsWith('42' + NS)) messages.push(JSON.parse(frame.slice(2 + NS.length)));
    else if (frame.startsWith('43' + NS)) {
      const content = frame.slice(2 + NS.length);
      const jsonAt = content.indexOf('[');
      const id = Number(content.slice(0, jsonAt));
      callbacks.get(id)?.(JSON.parse(content.slice(jsonAt))[0]);
    }
  });
  const client = {
    ws, messages,
    emit(event, data) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          callbacks.delete(id);
          reject(new Error('Socket ACK timed out for ' + event));
        }, 2000);
        callbacks.set(id, value => {
          clearTimeout(timeout);
          callbacks.delete(id);
          resolve(value);
        });
        ws.send('42' + NS + id + JSON.stringify([event, data]));
      });
    },
    close() {
      return new Promise(resolve => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once('close', resolve);
        ws.close();
      });
    }
  };
  return ready.then(() => client, async error => { await client.close(); throw error; });
}

function last(client, event) {
  return client.messages.findLast(item => item[0] === event)?.[1];
}

test('join and sync share the saved clock, personalize votes, and count actual viewers through disconnect', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event: {id, candidates}} = await h.service.snapshot(h.request());
  const guest = await socket(t, base);
  const alice = await socket(t, base, 'test_session=alice');
  assert.equal((await guest.emit('night:join', {id})).event.viewers, 1);
  assert.equal((await guest.emit('night:join', {id})).event.viewers, 1);
  const joined = await alice.emit('night:join', {id});
  assert.equal(joined.event.viewers, 2);
  assert.deepEqual(joined.viewer, {signedIn: true, name: 'Alice'});
  await waitFor(() => last(guest, 'night:presence'), value => value?.viewers === 2);
  const voted = await post(base, '/' + id + '/vote', {movieId: candidates[1].id});
  assert.equal(voted.status, 200);
  const publicUpdate = await waitFor(() => last(guest, 'night:update'), result => result?.event.totalVotes === 1);
  assert.equal(publicUpdate.event.yourVote, null);
  assert.equal(publicUpdate.viewer.signedIn, false);
  assert.doesNotMatch(JSON.stringify(publicUpdate), /account-private|secret-alice/);
  h.setTime(START);
  await waitFor(() => h.service.snapshot(h.request(), id), value => value.event.phase === 'live');
  h.setTime(START + 18700);
  const [guestSync, aliceSync] = await Promise.all([
    guest.emit('night:sync', {id, sentAt: START + 18000}),
    alice.emit('night:sync', {id, sentAt: START + 19000})
  ]);
  assert.equal(guestSync.event.playbackStartedAt, START);
  assert.equal(guestSync.event.source.playbackUrl, aliceSync.event.source.playbackUrl);
  assert.equal(guestSync.serverTime - guestSync.event.playbackStartedAt, 18700);
  assert.equal(aliceSync.serverTime, guestSync.serverTime);
  assert.equal(aliceSync.event.yourVote, candidates[1].id);
  const lateJoin = await socket(t, base);
  assert.equal((await lateJoin.emit('night:join', {id})).event.playbackStartedAt, START);
  await alice.close();
  await lateJoin.close();
  const remaining = await waitFor(() => last(guest, 'night:presence'), value => value?.viewers === 1);
  assert.deepEqual(remaining, {id, viewers: 1});
  await guest.close();
  assert.equal((await h.service.snapshot(h.request(), id)).event.viewers, 0);
});

test('chat confirms sanitized plain text with account-derived names and deduplicates across sockets', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event: {id}} = await h.service.snapshot(h.request());
  const guest = await socket(t, base);
  const alice = await socket(t, base, 'test_session=alice');
  const aliceOther = await socket(t, base, 'test_session=alice');
  await guest.emit('night:join', {id});
  await alice.emit('night:join', {id});
  await aliceOther.emit('night:join', {id});
  const input = {id, clientId: 'chat-1', text: '  <img src=x onerror=bad> hi\u0000there\u202e ', name: 'Impersonator'};
  assert.equal((await guest.emit('night:message', input)).code, 'signin_required');
  const received = await alice.emit('night:message', input);
  assert.equal(received.ok, true);
  assert.equal(received.message.name, 'Alice');
  assert.equal(received.message.text, '<img src=x onerror=bad> hi there');
  assert.doesNotMatch(JSON.stringify(received), /account-private|secret-alice|Impersonator/);
  const replay = await aliceOther.emit('night:message', {...input, text: 'altered'});
  assert.deepEqual(replay, received);
  assert.deepEqual(await waitFor(() => last(guest, 'night:message'), Boolean), received.message);
  assert.equal(guest.messages.filter(entry => entry[0] === 'night:message').length, 1);
  for (const [clientId, text] of [['too-long', 'a'.repeat(501)], ['<>', 'hello'], ['blank', ' \n ']]) {
    assert.equal((await alice.emit('night:message', {id, text, clientId})).code, 'invalid_message');
  }
  await aliceOther.emit('night:message', {id, text: 'Message two', clientId: 'chat-2'});
  await alice.emit('night:message', {id, text: 'Message three', clientId: 'chat-3'});
  assert.equal((await aliceOther.emit('night:message', {id, text: 'Message four', clientId: 'chat-4'})).code, 'rate_limited');
  const synchronized = await guest.emit('night:sync', {id, sentAt: 0});
  assert.equal(synchronized.event.messages.length, 3);
  assert.equal(synchronized.event.messages[0].id, received.message.id);
});

test('chat replay history is persisted and bounded', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const first = await h.service.snapshot(h.request());
  const {id} = first.event;
  const alice = await socket(t, base, 'test_session=alice');
  await alice.emit('night:join', {id});
  for (let index = 0; index <= 256; index++) {
    h.setTime(first.serverTime + index * 10000);
    const result = await alice.emit('night:message', {id, clientId: 'bounded-' + index, text: 'Message ' + index});
    assert.equal(result.ok, true);
  }
  await alice.close();
  const guest = await socket(t, base);
  const snapshot = await guest.emit('night:join', {id});
  assert.equal(snapshot.event.messages.length, 50);
  assert.equal(snapshot.event.messages[0].text, 'Message 207');
  assert.equal(snapshot.event.messages.at(-1).text, 'Message 256');
  const persisted = (await h.store.read()).movieNights.events[id];
  assert.equal(persisted.receipts.length, 256);
  assert.equal(persisted.messages.length, 50);
});

test('the established socket rechecks logout and rejects a reassigned identity for chat', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event: {id}} = await h.service.snapshot(h.request());
  const alice = await socket(t, base, 'test_session=alice');
  await alice.emit('night:join', {id});
  h.accounts.delete('alice');
  const loggedOut = await alice.emit('night:sync', {id});
  assert.deepEqual(loggedOut.viewer, {signedIn: false, name: ''});
  const input = {id, clientId: 'changed-identity', text: 'try from stale socket'};
  assert.equal((await alice.emit('night:message', input)).code, 'signin_required');
  h.accounts.set('alice', h.accounts.get('bob'));
  assert.equal((await alice.emit('night:message', input)).code, 'account_changed');
  await alice.close();
  const newClient = await socket(t, base, 'test_session=alice');
  assert.equal((await newClient.emit('night:join', {id})).viewer.name, 'Bob');
  assert.equal((await newClient.emit('night:message', input)).message.name, 'Bob');
});

test('the namespace enforces the real site gate and Kids lock on admission and existing sessions', async t => {
  const gate = createSiteGate({pin: '123456', secret: 'Movie Nights test access key'});
  const kids = createKids({secret: 'Movie Nights test Kids signing key', tmdb: async () => ({})});
  const h = await setup(t, {
    authorizeSocket: candidate => gate.validCookie(candidate.handshake.headers.cookie) && kids.socketAllowed(candidate),
    middleware(app) {
      app.use(express.json());
      app.use(gate.router);
      app.use(gate.protect);
      app.use(kids.protect);
      app.use('/api/kids', kids.router);
    }
  });
  const base = await listen(h.server);
  const {event: {id}} = await h.service.snapshot(h.request());
  await assert.rejects(socket(t, base, 'test_session=alice'), /current access settings/);
  assert.equal((await fetch(base + '/api/movie-nights')).status, 401);
  const access = await fetch(base + '/access', {
    method: 'POST', redirect: 'manual', headers: {Origin: base, 'Content-Type': 'application/json'},
    body: JSON.stringify({code: '123456', next: '/movie-nights'})
  });
  assert.equal(access.status, 303);
  const accessCookie = access.headers.getSetCookie()[0].split(';')[0];
  const open = await fetch(base + '/api/movie-nights', {headers: {Cookie: accessCookie}});
  assert.equal(open.status, 200);
  const guardCookie = open.headers.getSetCookie().find(value => value.startsWith('swifly_kids_guard=')).split(';')[0];
  const original = [accessCookie, guardCookie, 'test_session=alice'].join('; ');
  await assert.rejects(socket(t, base, original, 'https://other.invalid'), /current access settings/);
  const alice = await socket(t, base, original);
  assert.equal((await alice.emit('night:join', {id})).ok, true);
  const lock = await fetch(base + '/api/kids/setup', {
    method: 'POST', headers: {Cookie: original, Origin: base, 'Content-Type': 'application/json'},
    body: JSON.stringify({password: 'test parent password', confirm: 'test parent password'})
  });
  assert.equal(lock.status, 201);
  const locked = [accessCookie, ...lock.headers.getSetCookie().map(value => value.split(';')[0])].join('; ');
  assert.equal((await fetch(base + '/api/movie-nights', {headers: {Cookie: locked}})).status, 423);
  await assert.rejects(socket(t, base, locked), /current access settings/);
  const denied = await alice.emit('night:message', {id, clientId: 'locked-out', text: 'Should be blocked'});
  assert.equal(denied.code, 'access_denied');
  await waitFor(() => h.service.snapshot(h.request(), id), result => result.event.viewers === 0);
  assert.deepEqual((await h.service.snapshot(h.request(), id)).event.messages, []);
});

test('an acknowledged vote remains current while upcoming catalogue discovery hangs and fails', async t => {
  let catalogue;
  let pendingList;
  let pendingStarted;
  const started = new Promise(resolve => { pendingStarted = resolve; });
  const h = await setup(t, {tmdb: (...args) => {
    if (pendingList && args[0] === '/discover/movie') {
      pendingStarted();
      return pendingList;
    }
    return catalogue(...args);
  }});
  catalogue = h.catalog.tmdb;
  const base = await listen(h.server);
  const {event: {id, candidates}} = await h.service.snapshot(h.request());
  const alice = await socket(t, base, 'test_session=alice');
  await alice.emit('night:join', {id});
  await h.store.transaction(state => {
    const events = state.movieNights.events;
    delete events[Object.keys(events).sort().at(-1)];
  });
  let failDiscovery;
  pendingList = new Promise(resolve => { failDiscovery = resolve; });
  t.after(() => failDiscovery({__error: true}));
  const tick = h.service.tick();
  await started;
  const vote = await post(base, '/' + id + '/vote', {movieId: candidates[1].id});
  assert.equal((await vote.json()).event.yourVote, candidates[1].id);
  const synchronized = alice.emit('night:sync', {id});
  let timeout;
  const finishedWhilePending = await Promise.race([
    synchronized, new Promise(resolve => { timeout = setTimeout(resolve, 400); })
  ]);
  clearTimeout(timeout);
  failDiscovery({__error: true});
  const sync = await synchronized;
  await tick;
  assert.ok(finishedWhilePending);
  assert.equal(sync.event.yourVote, candidates[1].id);
  assert.equal(sync.event.totalVotes, 1);
  const update = await waitFor(() => last(alice, 'night:update'), value => value?.event.totalVotes === 1);
  assert.equal(update.event.yourVote, null);
  assert.equal((await h.service.snapshot(h.request('alice'), id)).event.yourVote, candidates[1].id);
});

test('a closed instance releases namespace admission and rejects mutations through a retained router', async t => {
  const {createMovieNights} = require('../lib/movie-nights');
  const h = await setup(t);
  const base = await listen(h.server);
  const {event: {id, candidates}} = await h.service.snapshot(h.request());
  h.service.close();
  const response = await post(base, '/' + id + '/vote', {movieId: candidates[0].id});
  assert.equal(response.status, 503);
  const replacement = createMovieNights(h.settings);
  t.after(() => replacement.close());
  const guest = await socket(t, base);
  const joined = await guest.emit('night:join', {id});
  assert.equal(joined.ok, true);
  assert.equal(joined.event.totalVotes, 0);
});

test('other accounts cannot evict an active chat rate limit from the idempotency queue', async t => {
  const h = await setup(t);
  const base = await listen(h.server);
  const {event: {id}} = await h.service.snapshot(h.request());
  const alice = await socket(t, base, 'test_session=alice');
  await alice.emit('night:join', {id});
  for (let index = 0; index < 3; index++) {
    assert.equal((await alice.emit('night:message', {id, clientId: 'alice-' + index, text: 'Within the same window'})).ok, true);
  }
  for (let index = 0; index < 86; index++) {
    const user = 'sender' + index;
    h.accounts.set(user, {id: user, name: 'Additional sender'});
    const member = await socket(t, base, 'test_session=' + user);
    await member.emit('night:join', {id});
    for (let message = 0; message < 3; message++) {
      assert.equal((await member.emit('night:message', {id, clientId: 'sender-' + message, text: 'Other messages'})).ok, true);
    }
    await member.close();
  }
  assert.equal((await alice.emit('night:message', {id, clientId: 'alice-4', text: 'Still in the same window'})).code, 'rate_limited');
});
