'use strict';

const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');

const MAX_PARTICIPANTS = 8;
const WINDOW_MS = 10000;
const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedString = (value, max) => typeof value === 'string' && value.length <= max;
const validRequestId = value => boundedString(value, 96) && value.length > 0;

function validIceUrl(value) {
  if (!boundedString(value, 512)) return false;
  const match = /^(?:stun|stuns|turn|turns):([a-z\d.-]+|\[[a-f\d:]+\])(?::(\d{1,5}))?(?:\?transport=(?:udp|tcp))?$/i.exec(value);
  if (!match || (match[2] !== undefined && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
  const host = match[1];
  if (host.startsWith('[')) return isIP(host.slice(1, -1)) === 6;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isIP(host) === 4;
  return host.length <= 253 && host.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
}

// Configuration is deployment-owned. Invalid configuration falls back as a whole;
// no TURN service or credentials are guessed. Credentials are sent only to callers.
function iceConfiguration(env) {
  const raw = env?.WATCHROOM_ICE_SERVERS;
  if (!boundedString(raw, 16384) || !raw.trim()) return DEFAULT_ICE;
  try {
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || !entries.length || entries.length > 8) return DEFAULT_ICE;
    const result = [];
    for (const entry of entries) {
      if (!object(entry)) return DEFAULT_ICE;
      const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
      if (!urls.length || urls.length > 4 || !urls.every(validIceUrl)) return DEFAULT_ICE;
      const turn = urls.some(url => /^turns?:/i.test(url));
      if (turn && (!boundedString(entry.username, 256) || !entry.username || !boundedString(entry.credential, 1024) || !entry.credential)) return DEFAULT_ICE;
      if (entry.username !== undefined && (!boundedString(entry.username, 256) || !turn)) return DEFAULT_ICE;
      if (entry.credential !== undefined && (!boundedString(entry.credential, 1024) || !turn)) return DEFAULT_ICE;
      result.push({ urls: Array.isArray(entry.urls) ? [...urls] : urls[0], ...(turn ? { username: entry.username, credential: entry.credential } : {}) });
    }
    return result;
  } catch { return DEFAULT_ICE; }
}

function createWatchroomCalls({ io, watchRooms, env = process.env }) {
  const iceServers = iceConfiguration(env);
  const rooms = new Map();
  const sessions = new Map();
  const limits = new WeakMap();

  function memberOf(socket, roomId) {
    return typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 80
      && socket.data.roomId === roomId && watchRooms.has(roomId) && socket.rooms.has(roomId);
  }

  function allowance(socket, key, max, cost = 1) {
    let buckets = limits.get(socket);
    if (!buckets) { buckets = new Map(); limits.set(socket, buckets); }
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= WINDOW_MS) { bucket = { start: now, count: 0 }; buckets.set(key, bucket); }
    bucket.count += cost;
    return bucket.count <= max;
  }

  function error(socket, payload, code, message) {
    if (!allowance(socket, 'errors', 20)) return;
    const roomId = boundedString(payload?.roomId, 80) ? payload.roomId : socket.data.roomId || '';
    socket.emit('watchroom:call-error', { roomId, code, message, ...(validRequestId(payload?.requestId) ? { requestId: payload.requestId } : {}) });
  }

  function payloadSize(payload) {
    try { return Buffer.byteLength(JSON.stringify(payload) || ''); } catch { return Infinity; }
  }

  function validPayload(socket, payload, maxBytes) {
    if (object(payload) && payloadSize(payload) <= maxBytes) return true;
    error(socket, payload, 'invalid-payload', 'This call update is invalid.');
    return false;
  }

  function members(roomId) {
    return Array.from(rooms.get(roomId)?.values() || [], record => ({
      id: record.id, name: record.name, sessionId: record.sessionId, audio: record.audio, video: record.video,
    }));
  }

  function publish(roomId) {
    io.to(roomId).emit('watchroom:call-members', { roomId, members: members(roomId) });
  }

  function sendMembers(socket) {
    const roomId = socket.data.roomId;
    if (memberOf(socket, roomId)) socket.emit('watchroom:call-members', { roomId, members: members(roomId) });
  }

  function liveSession(socket, payload) {
    if (!memberOf(socket, payload.roomId)) {
      error(socket, payload, 'not-in-room', 'Join this watchroom before using its call.');
      return null;
    }
    const record = sessions.get(socket.id);
    // A late packet from an earlier call is harmless and must not affect this one.
    if (!record || record.roomId !== payload.roomId || record.sessionId !== payload.sessionId) return null;
    return record;
  }

  // This trusted lifecycle hook also works after Socket.IO removes rooms on disconnect.
  function leave(socket) {
    const record = sessions.get(socket.id);
    if (!record) return;
    sessions.delete(socket.id);
    const room = rooms.get(record.roomId);
    room?.delete(socket.id);
    if (room && !room.size) rooms.delete(record.roomId);
    socket.emit('watchroom:call-left', { roomId: record.roomId, sessionId: record.sessionId });
    publish(record.roomId);
  }

  function attach(socket) {
    socket.on('watchroom:call-join', payload => {
      if (!allowance(socket, 'join', 10)) return error(socket, payload, 'rate-limit', 'Please wait before sending more call updates.');
      if (!validPayload(socket, payload, 1024)) return;
      if (Object.hasOwn(payload, 'requestId') && !validRequestId(payload.requestId)) return error(socket, payload, 'invalid-payload', 'This call join request is invalid.');
      if (!memberOf(socket, payload.roomId)) return error(socket, payload, 'not-in-room', 'Join this watchroom before using its call.');
      const existing = sessions.get(socket.id);
      const room = rooms.get(payload.roomId);
      if ((room?.size || 0) >= MAX_PARTICIPANTS && existing?.roomId !== payload.roomId) return error(socket, payload, 'capacity', 'This call has eight people. Try again when someone leaves.');
      if (existing && existing.roomId !== payload.roomId) leave(socket);
      const record = { id: socket.id, roomId: payload.roomId, name: String(socket.data.watchroomName || 'Guest').slice(0, 40), sessionId: randomUUID(), audio: false, video: false };
      if (!rooms.has(record.roomId)) rooms.set(record.roomId, new Map());
      rooms.get(record.roomId).set(socket.id, record);
      sessions.set(socket.id, record);
      socket.emit('watchroom:call-joined', { roomId: record.roomId, selfId: socket.id, sessionId: record.sessionId, iceServers, maxParticipants: MAX_PARTICIPANTS, members: members(record.roomId), ...(validRequestId(payload.requestId) ? { requestId: payload.requestId } : {}) });
      publish(record.roomId);
    });

    socket.on('watchroom:call-state', payload => {
      if (!allowance(socket, 'state', 40)) return error(socket, payload, 'rate-limit', 'Please wait before sending more call updates.');
      if (!validPayload(socket, payload, 1024)) return;
      const record = liveSession(socket, payload);
      if (!record) return;
      if (typeof payload.audio !== 'boolean' || typeof payload.video !== 'boolean') return error(socket, payload, 'invalid-payload', 'Call device states must be on or off.');
      if (record.audio === payload.audio && record.video === payload.video) return;
      record.audio = payload.audio;
      record.video = payload.video;
      publish(record.roomId);
    });

    socket.on('watchroom:call-signal', payload => {
      if (!allowance(socket, 'signal', 240)) return error(socket, payload, 'rate-limit', 'Please wait before sending more call updates.');
      if (!validPayload(socket, payload, 65536 + 4096)) return;
      if (!allowance(socket, 'signal-bytes', 1024 * 1024, payloadSize(payload))) return error(socket, payload, 'rate-limit', 'Please wait before sending more call updates.');
      const record = liveSession(socket, payload);
      if (!record) return;
      const target = sessions.get(payload.to), recipient = io.sockets.sockets.get(payload.to);
      if (!target || !recipient || target.id === record.id || target.roomId !== record.roomId || target.sessionId !== payload.targetSessionId || !memberOf(recipient, record.roomId)) return;
      const hasDescription = Object.hasOwn(payload, 'description'), hasCandidate = Object.hasOwn(payload, 'candidate');
      const outgoing = { roomId: record.roomId, from: socket.id, sessionId: record.sessionId, targetSessionId: target.sessionId };
      let valid = hasDescription !== hasCandidate;
      if (valid && hasDescription) {
        const value = payload.description;
        valid = object(value) && ['offer', 'answer'].includes(value.type) && typeof value.sdp === 'string' && Buffer.byteLength(value.sdp) <= 65536;
        if (valid) outgoing.description = { type: value.type, sdp: value.sdp };
      } else if (valid && hasCandidate) {
        const value = payload.candidate;
        valid = object(value) && boundedString(value.candidate, 2048)
          && (value.sdpMid === undefined || value.sdpMid === null || boundedString(value.sdpMid, 128))
          && (value.sdpMLineIndex === undefined || value.sdpMLineIndex === null || (Number.isSafeInteger(value.sdpMLineIndex) && value.sdpMLineIndex >= 0 && value.sdpMLineIndex <= 65535))
          && (value.usernameFragment === undefined || value.usernameFragment === null || boundedString(value.usernameFragment, 256));
        if (valid) outgoing.candidate = Object.fromEntries(['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
      }
      if (!valid) return error(socket, payload, 'invalid-payload', 'This call signal is invalid.');
      io.to(target.id).emit('watchroom:call-signal', outgoing);
    });

    socket.on('watchroom:call-leave', payload => {
      if (!validPayload(socket, payload, 1024)) return;
      if (liveSession(socket, payload)) leave(socket);
    });
  }

  return { attach, leave, sendMembers };
}

module.exports = { createWatchroomCalls };
