'use strict';

const express = require('express');
const {randomUUID} = require('node:crypto');
const catalog = require('../public/study/catalog.json');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum, fallback = '') => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maximum) || fallback : fallback;
const DEFAULT_ICE = [{urls: 'stun:stun.l.google.com:19302'}];
const MAX_MEMBERS = 8;

function boundedIce(value) {
  if (!Array.isArray(value) || !value.length || value.length > 8) return DEFAULT_ICE;
  const result = [];
  for (const entry of value) {
    if (!object(entry)) return DEFAULT_ICE;
    const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
    if (!urls.length || urls.length > 4 || !urls.every(url => typeof url === 'string' && url.length <= 512 && /^(stun|stuns|turn|turns):[^\s/]+$/i.test(url))) return DEFAULT_ICE;
    const turn = urls.some(url => /^turns?:/i.test(url));
    if (turn && (!text(entry.username, 256) || !text(entry.credential, 1024))) return DEFAULT_ICE;
    result.push({urls: Array.isArray(entry.urls) ? [...urls] : urls[0], ...(turn ? {username: entry.username, credential: entry.credential} : {})});
  }
  return result;
}

function createStudy({io, authorizeSocket, iceServers, now = Date.now} = {}) {
  if (!io || typeof authorizeSocket !== 'function') throw new Error('Study needs Socket.IO and an explicit socket authorization callback.');
  const namespace = io.of('/study'), router = express.Router(), members = new Map(), timers = new Map();
  const ice = boundedIce(iceServers), board = [];
  let communitySeconds = 0, closed = false;
  const roomKey = id => 'swifly-study:' + id;
  const roster = roomId => [...members.values()].filter(member => member.roomId === roomId).map(member => ({...member}));
  const presence = () => ({online: namespace.sockets.size, rooms: catalog.rooms.map(room => ({...room, online: roster(room.id).length}))});
  const focusBoard = () => ({scope: 'this-server-session', communityMinutes: Math.floor(communitySeconds / 60), board: [...board].sort((a, b) => b.seconds - a.seconds || b.at - a.at).slice(0, 10).map(row => ({name: row.name, minutes: Math.floor(row.seconds / 60), at: row.at}))});
  const publishPresence = () => {if (!closed) namespace.emit('study:presence', presence());};
  const publishMembers = id => namespace.to(roomKey(id)).emit('study:members', {roomId: id, members: roster(id)});
  function leave(socket) {
    const member = members.get(socket.id);
    if (!member) return;
    members.delete(socket.id);
    socket.leave(roomKey(member.roomId));
    socket.to(roomKey(member.roomId)).emit('study:peer-left', {id: socket.id, sessionId: member.sessionId, roomId: member.roomId});
    publishMembers(member.roomId); publishPresence();
  }
  namespace.use((socket, next) => {
    Promise.resolve().then(() => authorizeSocket(socket)).then(allowed => next(allowed && !closed ? undefined : new Error('Access code required.'))).catch(() => next(new Error('Access code required.')));
  });
  namespace.on('connection', socket => {
    const buckets = new Map();
    function allowance(key, maximum, cost = 1) {
      const time = now(); let bucket = buckets.get(key);
      if (!bucket || time - bucket.at >= 10000) {bucket = {at: time, count: 0}; buckets.set(key, bucket);}
      bucket.count += cost; return bucket.count <= maximum;
    }
    const validSession = data => object(data) && typeof data.sessionId === 'string' && members.get(socket.id)?.sessionId === data.sessionId;
    const reply = (ack, data) => {if (typeof ack === 'function') ack(data);};
    const reject = (ack, code) => reply(ack, {ok: false, code});
    socket.emit('study:presence', presence());
    socket.on('study:join', (data, ack) => {
      if (!allowance('join', 12)) return reject(ack, 'rate-limit');
      const room = object(data) && catalog.rooms.find(item => item.id === data.roomId);
      if (!room) return reject(ack, 'unknown-room');
      if (roster(room.id).filter(member => member.id !== socket.id).length >= MAX_MEMBERS) return reject(ack, 'room-full');
      leave(socket);
      const member = {id: socket.id, sessionId: randomUUID(), roomId: room.id, name: text(data.name, 28, 'Guest'), intention: text(data.intention, 90, 'Quiet focus'), audio: false, video: false, screen: false};
      members.set(socket.id, member); socket.join(roomKey(room.id));
      reply(ack, {ok: true, selfId: socket.id, sessionId: member.sessionId, room, members: roster(room.id), iceServers: ice, maxParticipants: MAX_MEMBERS});
      socket.to(roomKey(room.id)).emit('study:peer-joined', {...member});
      publishMembers(room.id); publishPresence();
    });
    socket.on('study:media', (data, ack) => {
      if (!allowance('media', 40)) return reject(ack, 'rate-limit');
      if (!validSession(data) || !['audio', 'video', 'screen'].every(key => typeof data[key] === 'boolean')) return reject(ack, 'invalid-session');
      const member = members.get(socket.id);
      for (const key of ['audio', 'video', 'screen']) member[key] = data[key];
      publishMembers(member.roomId); reply(ack, {ok: true, members: roster(member.roomId)});
    });
    socket.on('study:signal', (data, ack) => {
      let bytes = Infinity; try {bytes = Buffer.byteLength(JSON.stringify(data));} catch {}
      if (!allowance('signal', 200) || !allowance('signal-bytes', 1024 * 1024, bytes)) return reject(ack, 'rate-limit');
      if (!validSession(data) || bytes > 70000) return reject(ack, 'invalid-signal');
      const sender = members.get(socket.id), target = members.get(data.to);
      if (!target || target.id === socket.id || data.roomId !== sender.roomId || target.roomId !== sender.roomId || data.targetSessionId !== target.sessionId) return reject(ack, 'not-in-room');
      const outgoing = {roomId: sender.roomId, from: sender.id, sessionId: sender.sessionId, targetSessionId: target.sessionId};
      if (object(data.description) && data.candidate === undefined) {
        if (!['offer', 'answer'].includes(data.description.type) || typeof data.description.sdp !== 'string' || Buffer.byteLength(data.description.sdp) > 65536) return reject(ack, 'invalid-signal');
        outgoing.description = {type: data.description.type, sdp: data.description.sdp};
      } else if (object(data.candidate) && data.description === undefined) {
        const candidate = data.candidate;
        if (typeof candidate.candidate !== 'string' || candidate.candidate.length > 2048 || ![undefined, null, 'string'].includes(candidate.sdpMid === undefined ? undefined : candidate.sdpMid === null ? null : typeof candidate.sdpMid) || typeof candidate.sdpMid === 'string' && candidate.sdpMid.length > 256 || candidate.sdpMLineIndex !== undefined && candidate.sdpMLineIndex !== null && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 64) || candidate.usernameFragment !== undefined && (typeof candidate.usernameFragment !== 'string' || candidate.usernameFragment.length > 256)) return reject(ack, 'invalid-signal');
        outgoing.candidate = {candidate: candidate.candidate, ...(candidate.sdpMid !== undefined ? {sdpMid: candidate.sdpMid} : {}), ...(candidate.sdpMLineIndex !== undefined ? {sdpMLineIndex: candidate.sdpMLineIndex} : {}), ...(candidate.usernameFragment !== undefined ? {usernameFragment: candidate.usernameFragment} : {})};
      } else return reject(ack, 'invalid-signal');
      namespace.to(target.id).emit('study:signal', outgoing); reply(ack, {ok: true});
    });
    socket.on('study:leave', (data, ack) => {
      if (!validSession(data)) return reject(ack, 'invalid-session');
      leave(socket); reply(ack, {ok: true});
    });
    function accrue(timer) {
      if (!timer.running) return;
      const elapsed = Math.min(timer.remaining, Math.max(0, now() - timer.lastAt));
      timer.remaining -= elapsed; timer.elapsed += elapsed; timer.lastAt = now();
      if (timer.remaining === 0) timer.running = false;
    }
    socket.on('study:focus', (data, ack) => {
      if (!allowance('focus', 40) || !object(data)) return reject(ack, 'invalid-timer');
      let timer = timers.get(socket.id);
      if (data.action === 'reset') {timers.delete(socket.id); return reply(ack, {ok: true});}
      if (data.action === 'start') {
        if (!timer || timer.counted || data.duration !== undefined) {
          if (!Number.isInteger(data.duration) || data.duration < 60 || data.duration > 10800) return reject(ack, 'invalid-timer');
          timer = {remaining: data.duration * 1000, elapsed: 0, name: text(data.name, 28, 'Guest'), running: false, counted: false}; timers.set(socket.id, timer);
        }
        accrue(timer); if (timer.remaining <= 0 || timer.counted) return reject(ack, 'invalid-timer');
        timer.lastAt = now(); timer.running = true; return reply(ack, {ok: true});
      }
      if (!timer || timer.counted) return reject(ack, 'invalid-timer');
      accrue(timer);
      if (data.action === 'pause') {timer.running = false; return reply(ack, {ok: true});}
      if (data.action !== 'complete' || timer.remaining > 0) return reply(ack, {ok: false, code: 'not-complete', remainingMs: Math.ceil(timer.remaining)});
      timer.counted = true; communitySeconds += timer.elapsed / 1000;
      board.push({name: timer.name, seconds: timer.elapsed / 1000, at: now()}); if (board.length > 60) board.shift();
      const payload = focusBoard(); namespace.emit('study:focus-board', payload); reply(ack, {ok: true, ...payload});
    });
    socket.on('disconnecting', () => {leave(socket); timers.delete(socket.id);});
    socket.on('disconnect', publishPresence);
    publishPresence();
  });
  router.use((_req, res, next) => {res.set('Cache-Control', 'no-store'); next();});
  router.get('/catalog', (_req, res) => res.json(catalog));
  router.get('/rooms', (_req, res) => res.json(presence()));
  router.get('/focus', (_req, res) => res.json(focusBoard()));
  function close() {closed = true; namespace.disconnectSockets(true); namespace.removeAllListeners(); members.clear(); timers.clear();}
  return {router, namespace, close};
}

module.exports = {createStudy};
