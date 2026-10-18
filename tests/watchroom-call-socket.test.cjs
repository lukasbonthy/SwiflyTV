'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), WebSocket = require('ws');
const { loadServer } = require('./ui-helpers.cjs');
const api = loadServer();
let port;
const clients = [];
function connect(atPort = port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${atPort}/socket.io/?EIO=4&transport=websocket`), queue = [], waiters = [];
    const client = { ws, queue, send(name, data) { ws.send('42' + JSON.stringify([name, data])); }, wait(name, predicate = () => true) {
      return new Promise((yes, no) => {
        const index = queue.findIndex(event => event.name === name && predicate(event.data));
        if (index >= 0) return yes(queue.splice(index, 1)[0].data);
        const pending = { name, predicate, yes };
        pending.timer = setTimeout(() => { waiters.splice(waiters.indexOf(pending), 1); no(Error('Missing ' + name)); }, 1200);
        waiters.push(pending);
      });
    } };
    ws.on('error', reject);
    ws.on('message', raw => {
      const value = raw.toString();
      if (value.startsWith('0')) return ws.send('40');
      if (value.startsWith('40')) { client.id = JSON.parse(value.slice(2)).sid; clients.push(client); resolve(client); return; }
      if (value === '2') return ws.send('3');
      if (!value.startsWith('42')) return;
      const [name, data] = JSON.parse(value.slice(2)), index = waiters.findIndex(p => p.name === name && p.predicate(data));
      if (index < 0) queue.push({ name, data });
      else { const pending = waiters.splice(index, 1)[0]; clearTimeout(pending.timer); pending.yes(data); }
    });
  });
}
async function join(client, roomId, user = 'Guest') {
  client.send('watchroom:join', { roomId, user });
  return client.wait('watchroom:joined', value => value.room.id === roomId);
}
async function call(client, roomId) {
  client.send('watchroom:call-join', { roomId, name: 'Forged name' });
  return client.wait('watchroom:call-joined', value => value.roomId === roomId);
}
function signal(from, source, to, target, body = { description: { type: 'offer', sdp: 'v=0\r\n' } }) {
  from.send('watchroom:call-signal', { roomId: source.roomId, sessionId: source.sessionId, to: to.id, targetSessionId: target.sessionId, ...body });
}
async function noSignals(client) {
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(client.queue.filter(event => event.name === 'watchroom:call-signal').length, 0);
}
test.before(async () => { await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve)); port = api.httpServer.address().port; });
test.after(async () => { clients.forEach(client => client.ws.close()); await new Promise(resolve => api.io.close(resolve)); });

test('Only current watchroom members join with server identity, devices off, fresh sessions and bounded ICE', async () => {
  const outsider = await connect(); outsider.send('watchroom:call-join', { roomId: 'call-members' });
  assert.equal((await outsider.wait('watchroom:call-error')).code, 'not-in-room');
  const host = await connect(), guest = await connect(); await join(host, 'call-members', 'Ava'); const member = await join(guest, 'call-members', 'Ben'); assert.equal(member.isHost, false);
  const first = await call(guest, 'call-members'); assert.equal(first.selfId, guest.id); assert.equal(first.maxParticipants, 8);
  assert.deepEqual(first.members, [{ id: guest.id, name: 'Ben', sessionId: first.sessionId, audio: false, video: false }]);
  assert.deepEqual(first.iceServers, [{ urls: 'stun:stun.l.google.com:19302' }]);
  const second = await call(guest, 'call-members'); assert.notEqual(second.sessionId, first.sessionId); assert.equal((await join(guest, 'call-members', 'Ben')).isHost, false);
  const newcomer = await connect(); await join(newcomer, 'call-members'); const roster = await newcomer.wait('watchroom:call-members'); assert.equal(roster.roomId, 'call-members'); assert.equal(roster.members[0].sessionId, second.sessionId);
});

test('Call join request IDs correlate acknowledgements and errors while old cancellation cannot leave a newer call', async () => {
  const client = await connect(); await join(client, 'call-request-race');
  client.send('watchroom:call-join', { roomId: 'call-request-race', requestId: 'join-request-1' });
  client.send('watchroom:call-join', { roomId: 'call-request-race', requestId: 'join-request-2' });
  const first = await client.wait('watchroom:call-joined'); assert.equal(first.requestId, 'join-request-1');
  const second = await client.wait('watchroom:call-joined'); assert.equal(second.requestId, 'join-request-2'); assert.notEqual(first.sessionId, second.sessionId);
  client.send('watchroom:call-leave', { roomId: first.roomId, sessionId: first.sessionId });
  client.send('watchroom:call-state', { roomId: second.roomId, sessionId: second.sessionId, audio: true, video: false });
  await client.wait('watchroom:call-members', data => data.members.some(row => row.sessionId === second.sessionId && row.audio));
  assert.equal(client.queue.some(event => event.name === 'watchroom:call-left'), false);
  client.send('watchroom:call-leave', { roomId: second.roomId, sessionId: second.sessionId }); assert.equal((await client.wait('watchroom:call-left')).sessionId, second.sessionId);
  client.send('watchroom:call-join', { roomId: 'another-request-room', requestId: 'join-rejection' });
  const rejected = await client.wait('watchroom:call-error'); assert.equal(rejected.code, 'not-in-room'); assert.equal(rejected.requestId, 'join-rejection');
  for (const requestId of ['', 'x'.repeat(97), null, [], 123]) {
    client.send('watchroom:call-join', { roomId: 'call-request-race', requestId });
    const invalid = await client.wait('watchroom:call-error'); assert.equal(invalid.code, 'invalid-payload'); assert.equal(Object.hasOwn(invalid, 'requestId'), false);
  }
});

test('Guest state uses booleans and signals relay to only the named live peer', async () => {
  const a = await connect(), b = await connect(), c = await connect(); for (const client of [a, b, c]) await join(client, 'call-relay', client === a ? 'Ava' : 'Ben');
  const ac = await call(a, 'call-relay'), bc = await call(b, 'call-relay'); await call(c, 'call-relay');
  b.send('watchroom:call-state', { roomId: bc.roomId, sessionId: bc.sessionId, audio: true, video: false, name: 'Forged' });
  const roster = await a.wait('watchroom:call-members', data => data.members.some(row => row.id === b.id && row.audio)); assert.equal(roster.members.find(row => row.id === b.id).name, 'Ben');
  signal(a, ac, b, bc, { description: { type: 'offer', sdp: 'v=0\r\n' }, from: 'forged-sender', credential: 'private-unrelated-secret' }); const received = await b.wait('watchroom:call-signal'); assert.deepEqual(received, { roomId: ac.roomId, from: a.id, sessionId: ac.sessionId, targetSessionId: bc.sessionId, description: { type: 'offer', sdp: 'v=0\r\n' } });
  signal(b, bc, a, ac, { candidate: { candidate: 'candidate:valid', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'ufrag' } }); assert.equal((await a.wait('watchroom:call-signal')).candidate.candidate, 'candidate:valid');
  await noSignals(c); await noSignals(a);
});

test('Cross-room and stale sender or target sessions cannot receive signaling or mutate state', async () => {
  const a = await connect(), b = await connect(), other = await connect(); await join(a, 'call-isolation'); await join(b, 'call-isolation'); await join(other, 'call-other');
  const ac = await call(a, 'call-isolation'), old = await call(b, 'call-isolation'), oc = await call(other, 'call-other'), current = await call(b, 'call-isolation');
  signal(a, ac, other, oc); signal(a, ac, b, old); signal(b, old, a, ac);
  b.send('watchroom:call-state', { roomId: old.roomId, sessionId: old.sessionId, audio: true, video: true }); b.send('watchroom:call-leave', { roomId: old.roomId, sessionId: old.sessionId });
  await join(b, 'call-isolation'); const roster = await b.wait('watchroom:call-members', data => data.members.some(row => row.sessionId === current.sessionId)); assert.equal(roster.members.find(row => row.id === b.id).audio, false);
  await noSignals(a); await noSignals(b); await noSignals(other);
  signal(a, ac, b, current); assert.equal((await b.wait('watchroom:call-signal')).targetSessionId, current.sessionId);
});

test('Call leave preserves watchroom membership while room switch and disconnect remove call members', async () => {
  const a = await connect(), b = await connect(); await join(a, 'call-lifecycle'); await join(b, 'call-lifecycle'); const ac = await call(a, 'call-lifecycle'), bc = await call(b, 'call-lifecycle');
  a.queue.length = 0;
  b.send('watchroom:call-leave', { roomId: bc.roomId, sessionId: bc.sessionId }); assert.deepEqual(await b.wait('watchroom:call-left'), { roomId: bc.roomId, sessionId: bc.sessionId });
  await a.wait('watchroom:call-members', data => data.members.length === 1); const rejoined = await call(b, 'call-lifecycle'); assert.notEqual(rejoined.sessionId, bc.sessionId);
  await a.wait('watchroom:call-members', data => data.members.length === 2 && data.members.some(row => row.sessionId === rejoined.sessionId)); a.queue.length = 0;
  await join(b, 'call-switched'); await a.wait('watchroom:call-members', data => data.members.length === 1);
  b.send('watchroom:call-join', { roomId: 'call-lifecycle' }); assert.equal((await b.wait('watchroom:call-error')).code, 'not-in-room');
  await join(b, 'call-lifecycle'); const back = await call(b, 'call-lifecycle'); await a.wait('watchroom:call-members', data => data.members.some(row => row.sessionId === back.sessionId)); a.queue.length = 0; b.ws.close(); await a.wait('watchroom:call-members', data => data.members.length === 1);
  a.send('watchroom:leave'); await a.wait('watchroom:call-left', data => data.sessionId === ac.sessionId); a.send('watchroom:call-join', { roomId: 'call-lifecycle' }); assert.equal((await a.wait('watchroom:call-error')).code, 'not-in-room');
});

test('Calls admit eight participants and free a slot after leaving', async () => {
  const joined = [];
  for (let index = 0; index < 9; index++) { const client = await connect(); await join(client, 'call-capacity'); joined.push(client); if (index < 8) client.call = await call(client, 'call-capacity'); }
  joined[8].send('watchroom:call-join', { roomId: 'call-capacity' }); assert.equal((await joined[8].wait('watchroom:call-error')).code, 'capacity');
  joined[0].send('watchroom:call-leave', { roomId: 'call-capacity', sessionId: joined[0].call.sessionId }); await joined[0].wait('watchroom:call-left'); assert.equal((await call(joined[8], 'call-capacity')).members.length, 8);
});

test('Malformed call operations and bounded SDP/ICE reject safely without echoing private payloads', async () => {
  const a = await connect(), b = await connect(); await join(a, 'call-validation'); await join(b, 'call-validation'); const ac = await call(a, 'call-validation'), bc = await call(b, 'call-validation');
  const bad = [null, 'text', [], 12];
  for (const payload of bad) { a.send('watchroom:call-state', payload); assert.equal((await a.wait('watchroom:call-error')).code, 'invalid-payload'); }
  for (const name of ['watchroom:call-join', 'watchroom:call-signal', 'watchroom:call-leave']) { a.send(name, null); assert.equal((await a.wait('watchroom:call-error')).code, 'invalid-payload'); }
  a.send('watchroom:call-state', { roomId: ac.roomId, sessionId: ac.sessionId, audio: 'true', video: false }); assert.equal((await a.wait('watchroom:call-error')).code, 'invalid-payload');
  for (const body of [{ description: { type: 'offer', sdp: 'private-sdp' + 'x'.repeat(65536) } }, { description: { type: 'offer', sdp: 'é'.repeat(32769) } }, { description: { type: 'rollback', sdp: 'private-sdp' } }, { candidate: { candidate: 'private-ice' + 'x'.repeat(2048) } }, { candidate: { candidate: 'x', sdpMLineIndex: -1 } }, { candidate: null }, { description: { type: 'offer', sdp: 'private-sdp' }, candidate: { candidate: 'private-ice' } }]) {
    signal(a, ac, b, bc, body); const error = await a.wait('watchroom:call-error'); assert.equal(error.code, 'invalid-payload'); assert.doesNotMatch(JSON.stringify(error), /private-sdp|private-ice/);
  }
  await noSignals(b);
  signal(a, ac, b, bc, { description: { type: 'answer', sdp: 'v'.repeat(65536) } }); assert.equal((await b.wait('watchroom:call-signal')).description.sdp.length, 65536);
  signal(a, ac, b, bc, { candidate: { candidate: 'c'.repeat(2048), sdpMid: null, sdpMLineIndex: null } }); assert.equal((await b.wait('watchroom:call-signal')).candidate.candidate.length, 2048);
});

test('Signaling and state floods are bounded while leave remains available', async () => {
  const a = await connect(), b = await connect(); await join(a, 'call-rate'); await join(b, 'call-rate'); const ac = await call(a, 'call-rate'), bc = await call(b, 'call-rate');
  for (let index = 0; index < 260; index++) signal(a, ac, b, bc, { candidate: { candidate: 'candidate:' + index } });
  assert.equal((await a.wait('watchroom:call-error', data => data.code === 'rate-limit')).roomId, ac.roomId);
  await new Promise(resolve => setTimeout(resolve, 40)); const count = b.queue.filter(event => event.name === 'watchroom:call-signal').length; assert(count > 0 && count <= 240);
  for (let index = 0; index < 45; index++) b.send('watchroom:call-state', { roomId: bc.roomId, sessionId: bc.sessionId, audio: !!(index % 2), video: false });
  await b.wait('watchroom:call-error', data => data.code === 'rate-limit'); a.send('watchroom:call-leave', { roomId: ac.roomId, sessionId: ac.sessionId }); await a.wait('watchroom:call-left');
});

test('Large signals exhaust the byte budget before the message count limit', async () => {
  const a = await connect(), b = await connect(); await join(a, 'call-byte-limit'); await join(b, 'call-byte-limit'); const ac = await call(a, 'call-byte-limit'), bc = await call(b, 'call-byte-limit');
  for (let index = 0; index < 17; index++) signal(a, ac, b, bc, { description: { type: 'offer', sdp: 'v'.repeat(65536) } });
  const rejected = await a.wait('watchroom:call-error', data => data.code === 'rate-limit'); assert.doesNotMatch(JSON.stringify(rejected), /vvvvv/);
  await new Promise(resolve => setTimeout(resolve, 40)); const count = b.queue.filter(event => event.name === 'watchroom:call-signal').length; assert(count > 0 && count < 17);
});

test('Join floods are limited independently of safe call teardown', async () => {
  const client = await connect(); await join(client, 'call-join-limit'); let current;
  for (let index = 0; index < 10; index++) current = await call(client, 'call-join-limit');
  client.send('watchroom:call-join', { roomId: 'call-join-limit' }); assert.equal((await client.wait('watchroom:call-error')).code, 'rate-limit');
  client.send('watchroom:call-leave', { roomId: current.roomId, sessionId: current.sessionId }); assert.equal((await client.wait('watchroom:call-left')).sessionId, current.sessionId);
});

test('Deployment ICE config accepts bounded TURN credentials and safely falls back from invalid JSON', async () => {
  const { createWatchroomCalls } = require('../lib/watchroom-calls');
  const { Server } = require('socket.io'), http = require('node:http');
  for (const [configured, expected] of [
    [JSON.stringify([{ urls: ['stun:stun.example.org:3478', 'turns:relay.example.org:5349?transport=tcp'], username: 'user', credential: 'deployment-secret' }]), [{ urls: ['stun:stun.example.org:3478', 'turns:relay.example.org:5349?transport=tcp'], username: 'user', credential: 'deployment-secret' }]],
    ['{broken', [{ urls: 'stun:stun.l.google.com:19302' }]],
    [JSON.stringify([{ urls: 'turn:relay.example.org:3478' }]), [{ urls: 'stun:stun.l.google.com:19302' }]],
    [JSON.stringify([{ urls: 'https://untrusted.example' }]), [{ urls: 'stun:stun.l.google.com:19302' }]],
    [JSON.stringify([{ urls: 'stun:stun.example.org:99999' }]), [{ urls: 'stun:stun.l.google.com:19302' }]],
    [JSON.stringify([{ urls: 'stun:...' }]), [{ urls: 'stun:stun.l.google.com:19302' }]],
    [JSON.stringify(Array(9).fill({ urls: 'stun:stun.example.org:3478' })), [{ urls: 'stun:stun.l.google.com:19302' }]],
  ]) {
    const server = http.createServer(), io = new Server(server), rooms = new Map([['ice', {}]]), service = createWatchroomCalls({ io, watchRooms: rooms, env: { WATCHROOM_ICE_SERVERS: configured } });
    io.on('connection', socket => { socket.data.roomId = 'ice'; socket.data.watchroomName = 'Ava'; socket.join('ice'); service.attach(socket); socket.on('disconnect', () => service.leave(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { const client = await connect(server.address().port); assert.deepEqual((await call(client, 'ice')).iceServers, expected); client.ws.close(); }
    finally { await new Promise(resolve => io.close(resolve)); }
  }
});
