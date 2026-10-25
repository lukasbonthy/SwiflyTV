(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {root.SwiflyStudy = api; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.mount(root), {once: true}); else api.mount(root);}
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const clamp = (value, minimum, maximum, fallback = minimum) => Number.isFinite(Number(value)) ? Math.max(minimum, Math.min(maximum, Number(value))) : fallback;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const cleanText = (value, maximum = 120) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, maximum) : '';
  const sceneIds = ['moon-cat', 'garden-cat', 'sunset-train', 'cozy-hobbit', 'frog-rain', 'raccoon-room', 'forest-tape'];
  const stations = ['all', 'study', 'rain', 'night', 'cram', 'favorites'];
  const layouts = ['balanced', 'scenic', 'focus'];
  const validTrack = value => /^track-(?:[1-9]|1[0-9])$/.test(value);
  const mixValue = value => Object.fromEntries(['rain', 'room', 'vinyl', 'thunder'].map(key => [key, clamp(value?.[key], 0, 1, 0)]));
  const visualValue = value => ({rain: clamp(value?.rain, 0, 100, 8), dim: clamp(value?.dim, 0, 80, 14), blur: clamp(value?.blur, 0, 6, 0), motion: clamp(value?.motion, 0, 100, 50)});
  function defaultState() {
    return {version: 1, scene: 'garden-cat', track: 'track-15', station: 'all', layout: 'balanced', volume: .65, muted: false, shuffle: false, repeat: false, night: false, clock: true, ambient: false, mix: {rain: .12, room: .08, vinyl: 0, thunder: 0}, visual: {rain: 8, dim: 14, blur: 0, motion: 50}, favorites: [], tasks: [], setups: [], stats: {totalSeconds: 0, days: {}, sessions: 0, tasksDone: 0}};
  }
  function normalizeSetup(value) {
    if (!object(value) || !sceneIds.includes(value.scene) || !validTrack(value.track)) return null;
    return {id: cleanText(value.id, 64), name: cleanText(value.name, 48) || 'My study room', scene: value.scene, track: value.track, station: stations.includes(value.station) ? value.station : 'all', layout: layouts.includes(value.layout) ? value.layout : 'balanced', volume: clamp(value.volume, 0, 1, .65), night: value.night === true, ambient: value.ambient === true, mix: mixValue(value.mix), visual: visualValue(value.visual)};
  }
  function normalizeState(value) {
    const base = defaultState(); if (!object(value)) return base;
    for (const key of ['scene', 'track', 'station']) {if (key === 'scene' && sceneIds.includes(value[key]) || key === 'track' && validTrack(value[key]) || key === 'station' && stations.includes(value[key])) base[key] = value[key];}
    base.volume = clamp(value.volume, 0, 1, base.volume);
    if (layouts.includes(value.layout)) base.layout = value.layout;
    for (const key of ['muted', 'shuffle', 'repeat', 'night', 'clock', 'ambient']) if (typeof value[key] === 'boolean') base[key] = value[key];
    base.mix = mixValue(value.mix || base.mix); base.visual = visualValue(value.visual || base.visual);
    base.favorites = Array.isArray(value.favorites) ? [...new Set(value.favorites.filter(validTrack))].slice(0, 19) : [];
    base.tasks = Array.isArray(value.tasks) ? value.tasks.filter(object).map(task => ({id: cleanText(task.id, 64), text: cleanText(task.text), done: task.done === true, credited: task.credited === true || task.done === true})).filter(task => task.id && task.text).slice(0, 30) : [];
    base.setups = Array.isArray(value.setups) ? value.setups.map(normalizeSetup).filter(Boolean).slice(0, 12) : [];
    if (object(value.stats)) {
      for (const key of ['totalSeconds', 'sessions', 'tasksDone']) base.stats[key] = clamp(value.stats[key], 0, 1e10, 0);
      if (object(value.stats.days)) for (const key of Object.keys(value.stats.days).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-400)) base.stats.days[key] = clamp(value.stats.days[key], 0, 86400, 0);
    }
    return base;
  }
  function createStore({storage, owner}) {
    const key = 'swifly.study.v1.' + String(owner || 'guest');
    return {key, read() {try {const raw = storage.getItem(key); return raw && raw.length <= 262144 ? normalizeState(JSON.parse(raw)) : defaultState();} catch {return defaultState();}}, write(value) {const next = normalizeState(value); try {storage.setItem(key, JSON.stringify(next));} catch {throw new Error('Could not save Study data on this browser. Free some storage, then try again.');} return next;}};
  }
  function dayKey(value = Date.now()) {const date = new Date(value);return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');}
  function creditStudy(stats, startAt, endAt) {
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return;
    const end = Math.min(endAt, startAt + 86400000); let cursor = startAt;
    stats.days = object(stats.days) ? stats.days : {};
    while (cursor < end) {const date = new Date(cursor), midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(), until = Math.min(end, midnight), seconds = (until - cursor) / 1000, key = dayKey(cursor);stats.days[key] = (stats.days[key] || 0) + seconds;stats.totalSeconds = (stats.totalSeconds || 0) + seconds;cursor = until;}
  }
  function studyStats(stats, now = Date.now()) {
    const today = dayKey(now), date = new Date(now); let cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate()), streak = 0;
    if (!(stats.days?.[today] > 0)) cursor.setDate(cursor.getDate() - 1);
    for (let index = 0; index < 400 && stats.days?.[dayKey(cursor.getTime())] > 0; index++) {streak++;cursor.setDate(cursor.getDate() - 1);}
    return {todayMinutes: Math.floor((stats.days?.[today] || 0) / 60), totalMinutes: Math.floor((stats.totalSeconds || 0) / 60), sessions: Math.floor(stats.sessions || 0), tasksDone: Math.floor(stats.tasksDone || 0), streak};
  }
  function createTimer({now = () => performance.now(), wallNow = Date.now, onElapsed = () => {}, onComplete = () => {}} = {}) {
    let duration = 1500, remaining = 1500, deadline = 0, wallDeadline = 0, running = false;
    function tick() {
      if (!running) return remaining;
      const next = Math.max(0, (deadline - now()) / 1000), consumed = Math.max(0, remaining - next);
      if (consumed) onElapsed(consumed, {startAt: wallDeadline - remaining * 1000, endAt: wallDeadline - next * 1000});
      remaining = Math.min(remaining, next);
      if (remaining === 0) {running = false; onComplete(duration);}
      return remaining;
    }
    return {get duration() {return duration;}, get remaining() {return remaining;}, get running() {return running;}, tick,
      set(seconds) {tick(); running = false; duration = clamp(Math.round(seconds), 60, 10800, 1500); remaining = duration;},
      start() {if (running) return;if (remaining <= 0) remaining = duration;deadline = now() + remaining * 1000;wallDeadline = wallNow() + remaining * 1000;running = true;},
      pause() {tick();running = false;}, reset() {tick();running = false;remaining = duration;}};
  }
  function createMediaController({getUserMedia, getDisplayMedia, onChange = () => {}, onError = () => {}} = {}) {
    let session = '', epoch = 0, camera = null, microphone = null, screen = null;
    const pending = {audio: 0, video: 0, screen: 0}, owned = new Set();
    const stopTrack = track => {if (!track) return;track.onended = null;try {track.stop();} catch {}owned.delete(track);};
    const state = () => ({audio: !!microphone, video: !!camera || !!screen, screen: !!screen});
    const changed = () => onChange(state());
    function stop() {epoch++;session = '';camera = null;microphone = null;screen = null;for (const track of [...owned]) stopTrack(track);changed();}
    async function capture(kind, screenCapture = false) {
      if (!session) return false;
      const current = screenCapture ? screen : kind === 'video' ? camera : microphone;
      if (current) {if (screenCapture) screen = null;else if (kind === 'video') camera = null;else microphone = null;stopTrack(current);changed();return true;}
      const generation = epoch, request = ++pending[screenCapture ? 'screen' : kind], key = screenCapture ? 'screen' : kind;
      try {
        if (typeof (screenCapture ? getDisplayMedia : getUserMedia) !== 'function') throw new Error('This browser does not support that device. You can stay in the room without it.');
        const stream = await (screenCapture ? getDisplayMedia({video: true, audio: false}) : getUserMedia({video: kind === 'video', audio: kind === 'audio' ? {echoCancellation: true, noiseSuppression: true} : false}));
        if (generation !== epoch || request !== pending[key] || !session) {stream.getTracks().forEach(stopTrack);return false;}
        const track = stream.getTracks().find(item => item.kind === kind);
        for (const item of stream.getTracks()) if (item === track) owned.add(item); else stopTrack(item);
        if (!track) throw new Error('No usable device was returned. You can stay in the room without it.');
        if (screenCapture) screen = track;else if (kind === 'video') camera = track;else microphone = track;
        track.onended = () => {if (screen === track) screen = null;if (camera === track) camera = null;if (microphone === track) microphone = null;stopTrack(track);changed();};
        changed();return true;
      } catch (error) {if (generation === epoch && session) onError(error);return false;}
    }
    return {state, devices: () => ({microphone: !!microphone, camera: !!camera, screen: !!screen}), tracks: () => [microphone, screen || camera].filter(Boolean), setSession(id) {stop();session = String(id || '');}, toggle: kind => capture(kind), toggleScreen: () => capture('video', true), stop};
  }

  // Accrue the union of visible-page time and running-timer time. Updating the
  // mode first settles the previous interval, so visibility events cannot count
  // the same seconds twice or extend a hidden timer past its deadline.
  function createActivityTracker({now = () => performance.now(), wallNow = Date.now, onElapsed = () => {}} = {}) {
    let last = now(), visible = false, timerSeconds = 0;
    return {update(next) {
      const time = now(), elapsed = Math.max(0, (time - last) / 1000);
      const seconds = visible ? elapsed : Math.min(elapsed, timerSeconds);
      if (seconds > 0) {const endAt = wallNow();onElapsed(seconds, {startAt: endAt - elapsed * 1000, endAt: endAt - (elapsed - seconds) * 1000});}
      last = time;visible = !!next.visible;timerSeconds = Math.max(0, next.timerSeconds || 0);
    }};
  }

  function createRoomClient({socket, media, RTCPeerConnection, MediaStream, onState = () => {}, onMembers = () => {}, onStream = () => {}, onError = () => {}}) {
    let epoch = 0, destroyed = false, joining = false, room = null, selfId = '', sessionId = '', iceServers = [], members = [];
    const peers = new Map(), handlers = new Map(), requests = new Set();
    const state = () => ({connected: !!socket?.connected, joining, room, selfId, sessionId, members: [...members]});
    const publish = () => {onState(state());onMembers([...members], selfId);};
    const listen = (event, callback) => {handlers.set(event, callback);socket?.on(event, callback);};
    const current = peer => !destroyed && peers.get(peer.id) === peer && peer.epoch === epoch && !!sessionId;
    function request(event, data) {
      if (!socket?.connected || destroyed) return Promise.resolve({ok: false, code: 'disconnected'});
      return new Promise(resolve => {let timer;const done = value => {clearTimeout(timer);requests.delete(done);resolve(value || {ok: false, code: 'no-response'});};requests.add(done);timer = setTimeout(() => done({ok: false, code: 'timeout'}), 5000);socket.emit(event, data, done);});
    }
    function closePeer(id) {
      const peer = peers.get(id);if (!peer) return;
      peers.delete(id);peer.pc.ontrack = null;peer.pc.onicecandidate = null;peer.pc.onconnectionstatechange = null;
      try {peer.pc.getReceivers().forEach(receiver => receiver.track?.stop());peer.pc.close();} catch {}
      onStream(id, null, false);
    }
    function signal(peer, value) {
      if (current(peer)) socket.emit('study:signal', {roomId: room.id, sessionId, to: peer.id, targetSessionId: peer.sessionId, ...value});
    }
    async function replaceTracks(peer) {
      const tracks = media.tracks();
      await Promise.all(['audio', 'video'].map(kind => peer.senders[kind]?.replaceTrack(tracks.find(track => track.kind === kind) || null)));
    }
    function createPeer(member) {
      if (typeof RTCPeerConnection !== 'function' || typeof MediaStream !== 'function') return null;
      const pc = new RTCPeerConnection({iceServers}), peer = {id: member.id, sessionId: member.sessionId, epoch, pc, candidates: [], chain: Promise.resolve(), remote: new MediaStream(), senders: {}};
      peers.set(member.id, peer);
      const initiator = selfId.localeCompare(peer.id) < 0;
      // Only the offerer creates m-lines. The answerer adopts these offered
      // transceivers, otherwise its devices attach to unused extra m-lines.
      if (initiator) for (const kind of ['audio', 'video']) peer.senders[kind] = pc.addTransceiver(kind, {direction: 'sendrecv'}).sender;
      pc.onicecandidate = event => {if (event.candidate) signal(peer, {candidate: event.candidate.toJSON?.() || event.candidate});};
      pc.ontrack = event => {
        if (!current(peer)) return;
        if (event.streams?.[0]) peer.remote = event.streams[0];
        else if (!peer.remote.getTracks().includes(event.track)) peer.remote.addTrack(event.track);
        onStream(peer.id, peer.remote, false);
      };
      pc.onconnectionstatechange = () => {if (current(peer) && pc.connectionState === 'failed') onError(new Error('A peer connection could not reach this network. Presence still works; a TURN relay may be needed.'));};
      peer.chain = replaceTracks(peer).then(async () => {
        if (!current(peer) || !initiator) return;
        const offer = await pc.createOffer();if (!current(peer)) return;
        await pc.setLocalDescription(offer);if (current(peer)) signal(peer, {description: {type: pc.localDescription.type, sdp: pc.localDescription.sdp}});
      }).catch(error => {if (current(peer)) onError(error);});
      return peer;
    }
    function updateMembers(next) {
      members = next.filter(member => object(member) && member.roomId === room?.id && typeof member.id === 'string' && typeof member.sessionId === 'string');
      for (const [id, peer] of peers) if (!members.some(member => member.id === id && member.sessionId === peer.sessionId)) closePeer(id);
      for (const member of members) if (member.id !== selfId && !peers.has(member.id)) {try {createPeer(member);} catch (error) {onError(error);}}
      publish();
    }
    function leave(notify = true) {
      const previous = sessionId;epoch++;joining = false;room = null;selfId = '';sessionId = '';members = [];
      media.stop();for (const id of [...peers.keys()]) closePeer(id);
      if (notify && previous && socket?.connected) socket.emit('study:leave', {sessionId: previous});
      publish();
    }
    async function join(roomId, name, intention) {
      leave();joining = true;publish();const generation = epoch;
      const response = await request('study:join', {roomId, name, intention});
      if (generation !== epoch || destroyed) {if (response.ok) socket?.emit('study:leave', {sessionId: response.sessionId});return false;}
      joining = false;
      if (!response.ok) {publish();onError(new Error(response.code === 'room-full' ? 'This room is full. Choose another room.' : 'Could not join the room. Check your connection, then try again.'));return false;}
      room = response.room;selfId = response.selfId;sessionId = response.sessionId;iceServers = response.iceServers;
      media.setSession(sessionId);updateMembers(response.members || []);return true;
    }
    function updateMedia() {
      if (!sessionId) return;
      const values = media.state();members = members.map(member => member.id === selfId ? {...member, ...values} : member);
      socket?.emit('study:media', {sessionId, ...values});
      for (const peer of peers.values()) replaceTracks(peer).catch(error => {if (current(peer)) onError(error);});
      if (typeof MediaStream === 'function') onStream(selfId, new MediaStream(media.tracks()), true);
      publish();
    }
    listen('connect', publish);
    listen('disconnect', () => leave(false));
    listen('connect_error', () => {leave(false);onError(new Error('Room connection unavailable. Your music and personal focus tools still work.'));});
    listen('study:members', data => {if (data?.roomId === room?.id && Array.isArray(data.members) && data.members.some(member => member.id === selfId && member.sessionId === sessionId)) updateMembers(data.members);});
    listen('study:peer-left', data => {if (data?.roomId === room?.id && members.some(member => member.id === data.id && member.sessionId === data.sessionId)) updateMembers(members.filter(member => member.id !== data.id));});
    listen('study:signal', data => {
      if (data?.roomId !== room?.id || data.targetSessionId !== sessionId) return;
      const peer = peers.get(data.from);if (!peer || peer.sessionId !== data.sessionId || !current(peer)) return;
      peer.chain = peer.chain.then(async () => {
        if (!current(peer)) return;
        if (data.description) {
          await peer.pc.setRemoteDescription(data.description);if (!current(peer)) return;
          for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
          if (data.description.type === 'offer') {
            for (const transceiver of peer.pc.getTransceivers()) {const kind = transceiver.receiver.track?.kind;if (kind === 'audio' || kind === 'video') {transceiver.direction = 'sendrecv';peer.senders[kind] = transceiver.sender;}}
            await replaceTracks(peer);const answer = await peer.pc.createAnswer();if (!current(peer)) return;await peer.pc.setLocalDescription(answer);if (current(peer)) signal(peer, {description: {type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp}});
          }
        } else if (data.candidate) {if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);else peer.candidates.push(data.candidate);}
      }).catch(error => {if (current(peer)) onError(error);});
    });
    return {state, join, leave, updateMedia, request, destroy() {if (destroyed) return;leave();destroyed = true;for (const [event, callback] of handlers) socket?.off(event, callback);for (const done of [...requests]) done({ok: false, code: 'closed'});}};
  }

  function createAmbientMixer(win) {
    let context = null, master = null, channels = {}, thunderTimer = 0, generation = 0, enabled = false, mix = mixValue({});
    const stopThunder = () => {win.clearTimeout(thunderTimer);thunderTimer = 0;};
    function thunder() {
      stopThunder();if (!enabled || !context || mix.thunder <= .03) return;
      thunderTimer = win.setTimeout(() => {
        if (!enabled || !context) return;
        const ctx = context, oscillator = ctx.createOscillator(), gain = ctx.createGain(), time = ctx.currentTime;
        oscillator.type = 'sine';oscillator.frequency.setValueAtTime(48, time);oscillator.frequency.exponentialRampToValueAtTime(18, time + 1.4);
        gain.gain.setValueAtTime(.0001, time);gain.gain.exponentialRampToValueAtTime(.12 * mix.thunder, time + .12);gain.gain.exponentialRampToValueAtTime(.0001, time + 1.8);
        oscillator.connect(gain);gain.connect(master);oscillator.start();oscillator.stop(time + 2);oscillator.onended = () => {oscillator.disconnect();gain.disconnect();};thunder();
      }, 6000 + Math.random() * 11000);
    }
    function build() {
      if (context) return;
      const AudioContext = win.AudioContext || win.webkitAudioContext;if (!AudioContext) throw new Error('Ambient sound is unavailable in this browser. Music playback is still available.');
      context = new AudioContext();master = context.createGain();master.gain.value = 0;master.connect(context.destination);
      for (const [key, filterType, frequency] of [['rain', 'bandpass', 940], ['room', 'lowpass', 210], ['vinyl', 'highpass', 2600]]) {
        const source = context.createBufferSource(), buffer = context.createBuffer(1, Math.floor(context.sampleRate * 3), context.sampleRate), data = buffer.getChannelData(0);let last = 0;
        for (let index = 0; index < data.length; index++) {const white = Math.random() * 2 - 1;last = key === 'room' ? (last + .02 * white) / 1.02 : last * .97 + white * .03;data[index] = key === 'room' ? last * 3.5 : key === 'rain' ? white * .45 + last * 1.6 : white;}
        source.buffer = buffer;source.loop = true;const filter = context.createBiquadFilter(), gain = context.createGain();filter.type = filterType;filter.frequency.value = frequency;gain.gain.value = 0;
        source.connect(filter);filter.connect(gain);gain.connect(master);source.start();channels[key] = {source, filter, gain};
      }
    }
    function apply() {
      if (!context) return;
      const time = context.currentTime;master.gain.setTargetAtTime(enabled ? .82 : 0, time, .08);
      for (const [key, strength] of [['rain', .55], ['room', .18], ['vinyl', .055]]) channels[key].gain.gain.setTargetAtTime(mix[key] ** 2 * strength, time, .08);
      thunder();
    }
    return {async set(on, values, userGesture = false) {
      const token = ++generation;mix = mixValue(values);enabled = !!on;
      if (enabled && userGesture) {build();if (context.state === 'suspended') await context.resume();}
      if (token !== generation) return;
      if (!enabled && context) {stopThunder();await context.suspend();} else apply();
    }, close() {generation++;enabled = false;stopThunder();for (const channel of Object.values(channels)) {try {channel.source.stop();channel.source.disconnect();} catch {}}channels = {};const old = context;context = null;master = null;old?.close().catch(() => {});}};
  }

  function mount(win) {
    if (win.SwiflyStudy?.controller) return win.SwiflyStudy.controller;
    const controller = mountBrowser(win);if (win.SwiflyStudy) win.SwiflyStudy.controller = controller;return controller;
  }
  function mountBrowser(win) {
    const doc = win.document, root = doc.querySelector('[data-study-root]');if (!root) return null;
    const $ = selector => root.querySelector(selector), $$ = selector => [...root.querySelectorAll(selector)], listenCleanup = [], urls = new Set(), streams = new Map();
    const on = (target, event, callback, options) => {target?.addEventListener(event, callback, options);listenCleanup.push(() => target?.removeEventListener(event, callback, options));};
    const node = (tag, className, value) => {const element = doc.createElement(tag);if (className) element.className = className;if (value !== undefined) element.textContent = value;return element;};
    const action = (label, attribute, value, className = '') => {const button = node('button', className, label);button.type = 'button';button.setAttribute(attribute, value);return button;};
    const setPressed = (element, value) => element?.setAttribute('aria-pressed', String(!!value));
    const formatTime = seconds => {const value = Math.max(0, Math.ceil(Number(seconds) || 0));return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');};
    const status = (message, error = false) => {const output = $('[data-study-status]');output.textContent = message;output.dataset.error = String(error);};
    let state = defaultState(), store = null, owner = '', verified = false, accountReady = false, suspended = false, destroyed = false, catalog = null, scenes = [], localScene = null, socket = null, rooms = null, roomRows = [], interval = 0, saveTimeout = 0, focusGeneration = 0, focusQueue = Promise.resolve(), focusTracked = false, hasStartedTimer = false, playbackGeneration = 0, ownerGeneration = 0, ambientPlaying = false;
    const audio = new win.Audio();audio.preload = 'none';
    const ambient = createAmbientMixer(win), video = $('[data-study-video]'), poster = $('[data-study-poster]');
    const activity = createActivityTracker({now: () => win.performance.now(), wallNow: () => win.Date.now(), onElapsed: (_seconds, bounds) => {if (verified && !suspended) creditStudy(state.stats, bounds.startAt, bounds.endAt);}});
    const timer = createTimer({now: () => win.performance.now(), wallNow: () => win.Date.now(), onComplete: () => {
      state.stats.sessions++;hasStartedTimer = false;renderStats();persist();status('Session complete. Take a breath before the next one.');
      if (focusTracked) queueFocus('complete');
    }});
    const media = createMediaController({getUserMedia: win.navigator.mediaDevices?.getUserMedia?.bind(win.navigator.mediaDevices), getDisplayMedia: win.navigator.mediaDevices?.getDisplayMedia?.bind(win.navigator.mediaDevices), onChange: () => {rooms?.updateMedia();renderDevices();}, onError: error => status(error?.name === 'NotAllowedError' ? 'Device permission was not granted. You are still in the room with devices off.' : error.message || 'Device unavailable. You can stay without it.', true)});
    function canUse() {return verified && !suspended && !destroyed && !!catalog;}
    function persist() {if (!store || !verified || suspended || destroyed) return false;try {store.write(state);return true;} catch (error) {status(error.message, true);return false;}}
    function scheduleSave() {win.clearTimeout(saveTimeout);saveTimeout = win.setTimeout(persist, 300);}
    function settleTime() {activity.update({visible: canUse() && !doc.hidden, timerSeconds: canUse() && timer.running ? timer.remaining : 0});timer.tick();resetActivity();renderTimer();renderStats();}
    function resetActivity() {activity.update({visible: canUse() && !doc.hidden, timerSeconds: canUse() && timer.running ? timer.remaining : 0});}
    function renderTimer() {
      $('[data-study-timer]').textContent = formatTime(timer.remaining);$('[data-study-timer-start]').textContent = timer.running ? 'Pause focus' : timer.remaining === 0 ? 'Start again' : hasStartedTimer ? 'Resume focus' : 'Start focus';
      $('[data-study-timer-label]').textContent = timer.running ? 'One thing at a time' : timer.remaining === 0 ? 'Session complete' : hasStartedTimer ? 'Paused. Your space is here.' : 'Ready when you are';
      $$('[data-study-duration]').forEach(button => setPressed(button, Number(button.dataset.studyDuration) * 60 === timer.duration));
    }
    function renderStats() {const values = studyStats(state.stats, win.Date.now());for (const [key, value] of Object.entries({today: values.todayMinutes, total: values.totalMinutes, streak: values.streak, sessions: values.sessions, tasks: values.tasksDone})) $('[data-study-stat="' + key + '"]').textContent = String(value);}
    function renderClock() {const now = new win.Date();$('[data-study-clock]').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});$('[data-study-clock]').dateTime = now.toISOString();}
    function queueFocus(actionName, duration) {
      const generation = focusGeneration, name = cleanText($('[data-study-name]').value, 28) || 'Guest';
      focusQueue = focusQueue.then(async () => {
        if (generation !== focusGeneration || !rooms?.state().connected) return;
        const payload = {action: actionName, ...(duration ? {duration, name} : {})};
        let response = await rooms.request('study:focus', payload);
        if (actionName === 'complete' && response.code === 'not-complete' && response.remainingMs > 0 && response.remainingMs <= 1500) {
          await new Promise(resolve => win.setTimeout(resolve, response.remainingMs + 10));
          if (generation !== focusGeneration || destroyed) return;
          response = await rooms.request('study:focus', payload);
        }
        if (generation !== focusGeneration) return;
        if (actionName === 'start') focusTracked = response.ok;
        if (actionName === 'complete') {focusTracked = false;if (response.ok) renderBoard(response);else status('Session saved in this browser. The shared board could not confirm this timer.');}
      }).catch(() => {focusTracked = false;});
    }
    function timerSet(minutes) {
      if (!canUse()) return;
      if (!Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 180) {status('Choose a whole number from 1 to 180 minutes.', true);return;}
      settleTime();timer.set(Number(minutes) * 60);hasStartedTimer = false;focusGeneration++;focusTracked = false;rooms?.request('study:focus', {action: 'reset'});resetActivity();$('[data-study-timer-custom]').value = String(minutes);renderTimer();persist();
    }
    function currentScene() {return localScene || scenes.find(scene => scene.id === state.scene) || scenes[0];}
    function currentTrack() {return catalog?.tracks.find(track => track.id === state.track) || catalog?.tracks[0];}
    function filteredTracks(useSearch = true) {
      const query = useSearch ? $('[data-study-search]').value.trim().toLocaleLowerCase() : '';
      return (catalog?.tracks || []).filter(track => (state.station === 'all' || state.station === 'favorites' && state.favorites.includes(track.id) || track.station === state.station) && (!query || (track.title + ' ' + track.artist).toLocaleLowerCase().includes(query)));
    }
    function renderTracks() {
      const container = $('[data-study-tracks]'), tracks = filteredTracks();container.replaceChildren();$('[data-study-track-count]').textContent = tracks.length + (tracks.length === 1 ? ' track' : ' tracks');
      for (const track of tracks) {const button = action('', 'data-study-track', track.id, 'studyTrackRow');setPressed(button, track.id === state.track);const details = node('span');details.append(node('strong', '', track.title), node('small', '', track.artist + ' · ' + track.station + ' mix'));button.append(node('span', 'studyTrackNumber', String(catalog.tracks.indexOf(track) + 1).padStart(2, '0')), details);if (state.favorites.includes(track.id)) button.append(node('span', 'studyTrackStar', '♥'));button.append(node('time', '', formatTime(track.duration)));container.append(button);}
      if (!tracks.length) container.append(node('p', 'studyEmpty', state.station === 'favorites' ? 'Favorite a track to keep it here.' : 'No tracks match. Try another title or station.'));
    }
    function renderPlayback() {
      const playing = !audio.paused;setPressed($('[data-study-play]'), playing);$('[data-study-play]').setAttribute('aria-label', playing ? 'Pause music' : 'Play music');$('[data-study-play] path').setAttribute('d', playing ? 'M8 5v14M16 5v14' : 'm9 5 11 7-11 7Z');
      setPressed($('[data-study-favorite]'), state.favorites.includes(state.track));setPressed($('[data-study-mute]'), state.muted);setPressed($('[data-study-shuffle]'), state.shuffle);setPressed($('[data-study-repeat]'), state.repeat);
      $('[data-study-volume]').value = Math.round(state.volume * 100);$('[data-study-station]').value = state.station;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentTrack()?.duration || 0;
      $('[data-study-seek]').value = duration ? Math.min(1000, audio.currentTime / duration * 1000) : 0;$('[data-study-time]').textContent = formatTime(audio.currentTime);$('[data-study-track-duration]').textContent = formatTime(duration);
    }
    async function playMusic() {if (!canUse()) return;const generation = ++playbackGeneration;status('Loading ' + currentTrack().title + '…');try {if(audio.getAttribute('src')!==currentTrack().url){audio.src=currentTrack().url;audio.load();}await audio.play();if (generation !== playbackGeneration) return;if (!canUse()) audio.pause();else {renderPlayback();status('Playing ' + currentTrack().title + '.');}} catch {if (generation === playbackGeneration) status('Playback could not start. Select Play to try again.', true);}}
    function selectTrack(id, play = false) {
      const track = catalog?.tracks.find(item => item.id === id);if (!track) return;
      playbackGeneration++;audio.pause();audio.removeAttribute('src');audio.load();state.track = id;audio.currentTime = 0;audio.volume = state.volume;audio.muted = state.muted;$('[data-study-track-title]').textContent = track.title;$('[data-study-track-artist]').textContent = track.artist + ' · Lofi collection';renderPlayback();renderTracks();updateShare();if (play) playMusic();
    }
    function stepTrack(direction) {const tracks = filteredTracks(false);if (!tracks.length) {status('This station has no tracks yet. Choose another station.');return;}const index = tracks.findIndex(track => track.id === state.track);let next = (index + direction + tracks.length) % tracks.length;if (state.shuffle && tracks.length > 1) {do {next = Math.floor(Math.random() * tracks.length);} while (tracks[next].id === state.track);}selectTrack(tracks[next].id, true);persist();}
    function effective() {return win.SwiflyAppearance?.effective || win.SwiflyAppearance || {};}
    function applyVisuals() {
      const settings = effective(), reduced = !!settings.reduceMotion || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || ['xbox', 'minimal'].includes(settings.performancePreset), solid = settings.reduceTransparency || settings.glass === 'off' || win.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
      root.classList.toggle('studyReduced', reduced || state.visual.motion === 0);root.classList.toggle('studySolid', !!solid);root.classList.toggle('studyLargeTargets', !!settings.largeTargets);root.classList.toggle('studyHighContrast', !!settings.highContrast);root.classList.toggle('studyNight', state.night);
      root.classList.toggle('studyPaused', doc.hidden);
      root.dataset.studyLayout = state.layout;$('[data-study-layout]').value = state.layout;
      root.style.setProperty('--study-brightness', String(1 - state.visual.dim / 100));root.style.setProperty('--study-blur', (solid ? 0 : state.visual.blur) + 'px');root.style.setProperty('--study-rain', String(state.visual.rain / 100));root.style.setProperty('--study-rain-duration', (20 - state.visual.motion * .15) + 's');
      if (!doc.hidden && !reduced && state.visual.motion > 0 && canUse() && currentScene()?.video) {video.playbackRate = .5 + state.visual.motion / 100;video.play().catch(() => {});} else video.pause();
      for (const input of $$('[data-study-mix]')) {const key = input.dataset.studyMix;input.value = Math.round(state.mix[key] * 100);$('[data-study-mix-value="' + key + '"]').textContent = Math.round(state.mix[key] * 100) + '%';}
      for (const input of $$('[data-study-visual]')) {const key = input.dataset.studyVisual;input.value = state.visual[key];$('[data-study-visual-value="' + key + '"]').textContent = state.visual[key] + (key === 'blur' ? 'px' : '%');}
      setPressed($('[data-study-night]'), state.night);setPressed($('[data-study-clock-toggle]'), state.clock);$('[data-study-clock]').hidden = !state.clock;setPressed($('[data-study-ambient]'), ambientPlaying);$('[data-study-ambient]').textContent = ambientPlaying ? 'Ambient sound on' : state.ambient ? 'Start saved ambient mix' : 'Ambient sound off';
    }
    function renderScenes() {
      const container = $('[data-study-scenes]');container.replaceChildren();
      for (const scene of scenes) {const button = action('', 'data-study-scene', scene.id, 'studySceneChoice');setPressed(button, currentScene()?.id === scene.id);const image = node('img');image.src = scene.poster;image.alt = '';image.loading = 'lazy';const caption = node('span');caption.append(node('small', '', scene.mood), node('b', '', scene.title));button.append(image, caption);container.append(button);}
    }
    function selectScene(id, useSceneMood = false) {
      const scene = scenes.find(item => item.id === id);if (!scene) return;
      localScene = scene.local ? scene : null;if (!scene.local) state.scene = scene.id;
      if (useSceneMood) state.visual = {...state.visual, rain: scene.rain || 0, dim: scene.dim || 14, blur: scene.blur || 0};
      video.pause();video.classList.remove('studyVideoReady');video.removeAttribute('src');video.load();poster.src = scene.poster;video.poster = scene.poster;
      if (scene.video) {video.src = scene.video;video.load();}
      $('[data-study-scene-name]').textContent = scene.title;$('[data-study-scene-mood]').textContent = scene.mood;renderScenes();applyVisuals();updateShare();
    }
    function renderTasks() {
      const container = $('[data-study-tasks]');container.replaceChildren();
      for (const task of state.tasks) {const row = node('li');row.dataset.done = String(task.done);const toggle = action(task.done ? '✓' : '', 'data-study-task-toggle', task.id);toggle.setAttribute('aria-label', (task.done ? 'Mark incomplete: ' : 'Complete: ') + task.text);setPressed(toggle, task.done);const remove = action('×', 'data-study-task-delete', task.id);remove.setAttribute('aria-label', 'Delete task: ' + task.text);row.append(toggle, node('span', '', task.text), remove);container.append(row);}
      if (!state.tasks.length) container.append(node('li', 'studyEmpty', 'Add one small thing to get started.'));
    }
    function renderSetups() {
      const container = $('[data-study-setups]');container.replaceChildren();for (const setup of state.setups) {const row = node('div', 'studySavedItem');row.append(node('span', '', setup.name), action('Apply', 'data-study-apply-setup', setup.id), action('Copy link', 'data-study-copy-setup', setup.id), action('Delete', 'data-study-delete-setup', setup.id));container.append(row);}if (!state.setups.length) container.append(node('p', 'studyEmpty', 'Save a scene and sound mix for next time.'));
    }
    function setupNow() {return normalizeSetup({id: win.crypto?.randomUUID?.() || win.Date.now().toString(36), name: cleanText($('[data-study-setup-name]').value, 48) || currentScene()?.title, ...state});}
    function shareUrl(setup = state) {
      const roomId = rooms?.state().room?.id || (catalog?.rooms.some(room => room.id === root.dataset.studyRoom) ? root.dataset.studyRoom : '');
      const url = new win.URL('/study' + (roomId ? '/room/' + encodeURIComponent(roomId) : ''), win.location.origin);
      for (const key of ['scene', 'track', 'station', 'layout']) url.searchParams.set(key, setup[key]);
      for (const key of ['rain', 'dim', 'blur', 'motion']) url.searchParams.set(key, String(setup.visual[key]));
      for (const key of ['rain', 'room', 'vinyl', 'thunder']) url.searchParams.set('mix-' + key, String(Math.round(setup.mix[key] * 100)));
      if (setup.night) url.searchParams.set('night', '1');if (setup.ambient) url.searchParams.set('ambient', '1');return url.href;
    }
    function updateShare() {if (catalog) $('[data-study-share-url]').value = shareUrl();}
    function applySharedUrl() {
      if (win.location.search.length > 2048) return;const params = new win.URLSearchParams(win.location.search);
      if (sceneIds.includes(params.get('scene'))) state.scene = params.get('scene');if (validTrack(params.get('track'))) state.track = params.get('track');if (stations.includes(params.get('station'))) state.station = params.get('station');
      if (layouts.includes(params.get('layout'))) state.layout = params.get('layout');
      for (const key of ['rain', 'dim', 'blur', 'motion']) if (params.has(key)) state.visual[key] = clamp(params.get(key), 0, key === 'dim' ? 80 : key === 'blur' ? 6 : 100, state.visual[key]);
      for (const key of ['rain', 'room', 'vinyl', 'thunder']) if (params.has('mix-' + key)) state.mix[key] = clamp(params.get('mix-' + key), 0, 100, 0) / 100;
      if (params.has('night')) state.night = params.get('night') === '1';if (params.has('ambient')) state.ambient = params.get('ambient') === '1';
    }
    async function copy(value) {try {await win.navigator.clipboard.writeText(value);status('Link copied. Your friend chooses when to start playback.');} catch {$('[data-study-share-url]').value = value;$('[data-study-share-url]').focus();$('[data-study-share-url]').select();status('Select and copy the link from the share field.');}}
    function download(url, filename) {const link = doc.createElement('a');link.href = url;link.download = filename;doc.body.append(link);link.click();link.remove();}
    async function exportCard() {
      const generation = ownerGeneration, scene = currentScene();if (!scene) return;
      try {const image = new win.Image();image.src = scene.poster;await image.decode();if (destroyed || generation !== ownerGeneration) return;const canvas = doc.createElement('canvas');canvas.width = 1200;canvas.height = 800;const ctx = canvas.getContext('2d');if (!ctx) throw Error();const scale = Math.max(1200 / image.width, 800 / image.height);ctx.drawImage(image, (1200 - image.width * scale) / 2, (800 - image.height * scale) / 2, image.width * scale, image.height * scale);const shade = ctx.createLinearGradient(0, 200, 0, 800);shade.addColorStop(0, '#080c1266');shade.addColorStop(1, '#080c12ef');ctx.fillStyle = shade;ctx.fillRect(0, 0, 1200, 800);ctx.fillStyle = '#e7e2fa';ctx.font = '24px sans-serif';ctx.fillText('SWIFLY STUDY / A LITTLE SPACE TO FOCUS', 64, 80);ctx.font = '54px sans-serif';ctx.fillText(scene.title.slice(0, 40), 64, 535, 1070);const stats = studyStats(state.stats);ctx.font = '26px sans-serif';ctx.fillText(stats.todayMinutes + ' minutes today · ' + stats.streak + ' day streak', 64, 600);ctx.font = '22px sans-serif';ctx.fillText(currentTrack().title + ' / HoliznaCC0', 64, 648);ctx.fillText('swifly study', 64, 734);canvas.toBlob(blob => {if (!blob || destroyed || generation !== ownerGeneration) return;const url = win.URL.createObjectURL(blob);download(url, 'swifly-focus-card.png');win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);status('Focus card exported.');}, 'image/png');} catch {status('The focus card could not be exported in this browser. Try again after the scene loads.', true);}
    }
    function renderBoard(data) {const container = $('[data-study-board]');container.replaceChildren();for (const row of (Array.isArray(data.board) ? data.board : []).slice(0, 10)) {const element = node('li');element.append(node('strong', '', cleanText(row.name, 28) || 'Guest'), node('span', '', String(Math.max(0, Math.floor(Number(row.minutes) || 0))) + ' min'));container.append(element);}if (!container.children.length) container.append(node('li', 'studyEmpty', 'No completed timers on this server yet.'));$('[data-study-community]').textContent = String(Math.max(0, Math.floor(Number(data.communityMinutes) || 0)));}
    function renderRooms(data) {
      if (Array.isArray(data?.rooms)) roomRows = data.rooms;
      const container = $('[data-study-rooms]'), call = rooms?.state();container.replaceChildren();
      for (const room of roomRows.length ? roomRows : catalog?.rooms || []) {const joined = call?.room?.id === room.id, row = node('article', 'studyRoomCard');row.dataset.joined = String(joined);row.append(node('small', '', room.label), node('h3', '', room.title), node('p', '', room.mood));const footer = node('div'), count = Number.isInteger(room.online) ? room.online + (room.online === 1 ? ' in room' : ' in room') : 'Connect for presence', button = action(joined ? 'Joined' : 'Join room', 'data-study-join', room.id, 'studyButton studyQuiet');button.disabled = !canUse() || !call?.connected || call.joining || joined;footer.append(node('span', '', count), button);row.append(footer);container.append(row);}
    }
    function renderDevices() {const values = media.devices(), joined = !!rooms?.state().sessionId;for (const button of $$('[data-study-device]')) {const active = values[button.dataset.studyDevice];button.disabled = !joined || suspended;setPressed(button, active);button.querySelector('.studyDeviceState').textContent = active ? 'On' : 'Off';}}
    function renderMembers(members, selfId) {
      const container = $('[data-study-videos]'), currentIds = new Set(members.map(member => member.id));
      for (const tile of [...container.children]) if (!currentIds.has(tile.dataset.peerId)) tile.remove();
      for (const member of members) {
        let tile = [...container.children].find(element => element.dataset.peerId === member.id);
        if (!tile) {tile = node('article', 'studyVideoTile');tile.dataset.peerId = member.id;const initial = node('strong', '', (member.name || 'G').slice(0, 1).toLocaleUpperCase()), player = node('video');player.autoplay = true;player.playsInline = true;player.muted = member.id === selfId;player.setAttribute('aria-label', member.id === selfId ? 'Your muted local preview' : (member.name || 'Guest') + ' live stream');const pin = action('', 'data-study-pin', member.id), text = node('span');text.append(node('span'), node('small'));pin.append(text, node('small', '', 'Pin'));tile.append(initial, player, pin);container.append(tile);}
        const player = tile.querySelector('video'), stream = streams.get(member.id) || null;if (player.srcObject !== stream) {player.srcObject = stream;if (stream) player.play().catch(() => {});}player.muted = member.id === selfId;player.dataset.live = String(!!stream?.getVideoTracks().length && !!member.video);tile.querySelector('button span>span').textContent = (member.name || 'Guest') + (member.id === selfId ? ' (you)' : '');tile.querySelector('button span>small').textContent = cleanText(member.intention, 90) || (member.audio ? 'Microphone on' : 'Devices off');tile.querySelector('button').setAttribute('aria-label', 'Pin ' + (member.name || 'Guest'));
      }
    }
    function roomState(call) {const connected = $('[data-study-connection]');connected.textContent = call.joining ? 'Joining…' : call.connected ? 'Connected · ' + (call.room ? call.room.title : 'choose a room') : 'Room connection offline';connected.dataset.connected = String(call.connected);$('[data-study-call]').hidden = !call.room;if (call.room) $('[data-study-joined-name]').textContent = call.room.title;renderRooms();renderDevices();updateShare();}
    function connectRooms() {
      if (!socket && typeof win.io === 'function') {
        socket = win.io('/study', {autoConnect: false, reconnectionAttempts: 3, timeout: 8000});
        rooms = createRoomClient({socket, media, RTCPeerConnection: win.RTCPeerConnection, MediaStream: win.MediaStream, onState: roomState, onMembers: renderMembers, onStream: (id, stream) => {if (stream) streams.set(id, stream);else streams.delete(id);renderMembers(rooms?.state().members || [], rooms?.state().selfId);}, onError: error => status(error.message, true)});
        socket.on('study:presence', data => renderRooms(data));socket.on('study:focus-board', renderBoard);socket.on('disconnect', () => {focusTracked = false;focusGeneration++;});
      }
      if (socket && !socket.connected) socket.connect();else if (!socket) {$('[data-study-connection]').textContent = 'Rooms unavailable · music and focus work offline';renderRooms();}
    }
    function setTab(id, focus = false) {if (!$$('[data-study-tab]').some(tab => tab.dataset.studyTab === id)) return;for (const tab of $$('[data-study-tab]')) {const selected = tab.dataset.studyTab === id;tab.setAttribute('aria-selected', String(selected));tab.tabIndex = selected ? 0 : -1;doc.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;if (focus && selected) tab.focus();}}
    function back() {if (!root.classList.contains('studyFocusView')) return false;root.classList.remove('studyFocusView');setPressed($('[data-study-immersive]'), false);$('[data-study-immersive]').textContent = 'Focus view';$('[data-study-immersive]').focus();return true;}
    function renderAll() {selectScene(state.scene);selectTrack(state.track);renderTasks();renderSetups();renderStats();renderTimer();renderClock();applyVisuals();renderRooms();updateShare();}
    function releaseLocalScenes() {for (const url of urls) win.URL.revokeObjectURL(url);urls.clear();localScene = null;scenes = catalog ? [...catalog.scenes] : [];}
    function stopOwner() {
      settleTime();timer.pause();activity.update({visible: false, timerSeconds: 0});persist();playbackGeneration++;audio.pause();renderPlayback();ambient.close();ambientPlaying = false;rooms?.leave();streams.clear();focusGeneration++;focusTracked = false;hasStartedTimer = false;timer.set(1500);releaseLocalScenes();video.pause();video.classList.remove('studyVideoReady');
    }
    function switchOwner(user, shared = false) {
      if (destroyed || !catalog || !win.SwiflyStudioConfig?.ownerKey) return;
      let next;try {next = win.SwiflyStudioConfig.ownerKey(win.localStorage, user);} catch {status('Study storage is unavailable in this browser.', true);return;}
      if (verified && !suspended && owner === next) return;
      if (verified) stopOwner();ownerGeneration++;owner = next;store = createStore({storage: win.localStorage, owner});state = store.read();verified = true;suspended = false;root.inert = false;root.removeAttribute('aria-busy');if (shared) applySharedUrl();renderAll();resetActivity();connectRooms();status(state.ambient ? 'Your study space is ready. Select Ambient sound to start its saved mix.' : 'Your study space is ready. Press Play when you are.');
    }
    async function initialize() {
      root.setAttribute('aria-busy', 'true');status('Preparing your profile and study collection…');
      try {
        const account = win.SwiflyAccount;if (!account?.ready) throw new Error('Study is waiting for account verification. Reload the page to try again.');
        const [session, response] = await Promise.all([account.ready, win.fetch('/api/study/catalog', {credentials: 'same-origin', cache: 'no-store'})]);
        if (destroyed) return;if (session?.available === false) throw new Error('Account verification is unavailable. Reload before saving personal Study data.');if (!response.ok) throw new Error('The study collection could not load. Reload to try again.');
        const data = await response.json();if (!Array.isArray(data.tracks) || !data.tracks.length || !Array.isArray(data.scenes) || !data.scenes.length || !Array.isArray(data.rooms)) throw new Error('The study collection is unavailable.');
        accountReady = true;catalog = data;scenes = [...catalog.scenes];roomRows = [...catalog.rooms];if (suspended) return;switchOwner(account.user ?? session?.user ?? null, true);renderBoard({board: []});
        win.fetch('/api/study/focus', {credentials: 'same-origin', cache: 'no-store'}).then(response => response.ok ? response.json() : null).then(data => {if (data && !destroyed) renderBoard(data);}).catch(() => {});
        if (catalog.rooms.some(room => room.id === root.dataset.studyRoom)) {setTab('rooms');status('Shared room ready. Choose Join room when you want company. Devices start off.');}
      } catch (error) {if (!destroyed) {root.removeAttribute('aria-busy');status(error.message, true);}}
    }
    on(root, 'click', async event => {
      const button = event.target.closest('button');if (!button || !root.contains(button)) return;
      if (button.hasAttribute('data-study-tab')) {setTab(button.dataset.studyTab);return;}
      if (!canUse()) {status('Your profile and collection must finish loading before using Study.', true);return;}
      if (button.hasAttribute('data-study-play')) {if (audio.paused) playMusic();else {playbackGeneration++;audio.pause();renderPlayback();}}
      else if (button.hasAttribute('data-study-track')) {selectTrack(button.dataset.studyTrack, true);persist();}
      else if (button.hasAttribute('data-study-previous')) stepTrack(-1);
      else if (button.hasAttribute('data-study-next')) stepTrack(1);
      else if (button.hasAttribute('data-study-favorite')) {state.favorites = state.favorites.includes(state.track) ? state.favorites.filter(id => id !== state.track) : [...state.favorites, state.track];renderTracks();renderPlayback();persist();}
      else if (button.hasAttribute('data-study-mute')) {state.muted = !state.muted;audio.muted = state.muted;renderPlayback();persist();}
      else if (button.hasAttribute('data-study-shuffle') || button.hasAttribute('data-study-repeat')) {const key = button.hasAttribute('data-study-shuffle') ? 'shuffle' : 'repeat';state[key] = !state[key];renderPlayback();persist();}
      else if (button.hasAttribute('data-study-scene')) {selectScene(button.dataset.studyScene, true);persist();}
      else if (button.hasAttribute('data-study-night') || button.hasAttribute('data-study-clock-toggle')) {const key = button.hasAttribute('data-study-night') ? 'night' : 'clock';state[key] = !state[key];applyVisuals();updateShare();persist();}
      else if (button.hasAttribute('data-study-immersive')) {root.classList.toggle('studyFocusView');setPressed(button, root.classList.contains('studyFocusView'));button.textContent = root.classList.contains('studyFocusView') ? 'Exit focus view' : 'Focus view';}
      else if (button.hasAttribute('data-study-fullscreen')) {try {if (doc.fullscreenElement) await doc.exitFullscreen();else if (root.requestFullscreen) await root.requestFullscreen();else status('Fullscreen is unavailable in this browser.');} catch {status('Fullscreen could not open in this browser.', true);}}
      else if (button.hasAttribute('data-study-duration')) timerSet(button.dataset.studyDuration);
      else if (button.hasAttribute('data-study-timer-set')) timerSet($('[data-study-timer-custom]').value);
      else if (button.hasAttribute('data-study-timer-reset')) {settleTime();timer.reset();hasStartedTimer = false;focusGeneration++;focusTracked = false;rooms?.request('study:focus', {action: 'reset'});resetActivity();renderTimer();persist();}
      else if (button.hasAttribute('data-study-timer-start')) {settleTime();if (timer.running) {timer.pause();queueFocus('pause');} else {const fresh = !hasStartedTimer || timer.remaining <= 0;timer.start();hasStartedTimer = true;queueFocus('start', fresh ? timer.duration : undefined);}resetActivity();renderTimer();}
      else if (button.hasAttribute('data-study-ambient')) {ambientPlaying = !ambientPlaying;state.ambient = ambientPlaying;try {await ambient.set(ambientPlaying, state.mix, true);} catch (error) {ambientPlaying = false;state.ambient = false;status(error.message, true);}applyVisuals();updateShare();persist();}
      else if (button.hasAttribute('data-study-preset')) {const presets = {deep: {scene: 'garden-cat', track: 'track-15', station: 'study', volume: .58, visual: {rain: 12, dim: 18, blur: 0, motion: 42}, mix: {rain: .1, room: .12, vinyl: .08, thunder: 0}}, cram: {scene: 'forest-tape', track: 'track-13', station: 'cram', volume: .64, visual: {rain: 82, dim: 42, blur: 0, motion: 82}, mix: {rain: .44, room: .1, vinyl: .12, thunder: .12}}, sleep: {scene: 'raccoon-room', track: 'track-5', station: 'night', volume: .34, visual: {rain: 38, dim: 62, blur: 4, motion: 24}, mix: {rain: .34, room: .22, vinyl: .05, thunder: 0}}, morning: {scene: 'garden-cat', track: 'track-9', station: 'study', volume: .7, visual: {rain: 8, dim: 14, blur: 0, motion: 54}, mix: {rain: 0, room: .16, vinyl: .09, thunder: 0}}};Object.assign(state, presets[button.dataset.studyPreset]);state.ambient = true;ambientPlaying = true;renderAll();try {await ambient.set(true, state.mix, true);} catch (error) {ambientPlaying = false;state.ambient = false;status(error.message, true);applyVisuals();}persist();}
      else if (button.hasAttribute('data-study-task-toggle')) {const task = state.tasks.find(task => task.id === button.dataset.studyTaskToggle);if (task) {task.done = !task.done;if (task.done && !task.credited) {state.stats.tasksDone++;task.credited = true;}renderTasks();renderStats();persist();}}
      else if (button.hasAttribute('data-study-task-delete')) {state.tasks = state.tasks.filter(task => task.id !== button.dataset.studyTaskDelete);renderTasks();persist();}
      else if (button.hasAttribute('data-study-import-button')) $('[data-study-import]').click();
      else if (button.hasAttribute('data-study-download-scene')) {const scene = currentScene(), url = scene.video || scene.poster;download(url, (scene.title.replace(/[^a-z0-9]+/gi, '-') || 'study-scene') + (scene.video ? '.mp4' : scene.local ? scene.extension : '.webp'));}
      else if (button.hasAttribute('data-study-save-setup')) {if (localScene) {status('Choose a collection scene before saving a setup. Imported images stay in this tab.', true);return;}const setup = setupNow();if (setup) {state.setups = [setup, ...state.setups].slice(0, 12);renderSetups();if (persist()) status('Setup saved for this profile.');}}
      else if (button.hasAttribute('data-study-apply-setup')) {const setup = state.setups.find(item => item.id === button.dataset.studyApplySetup);if (setup) {for (const key of ['scene', 'track', 'station', 'layout', 'volume', 'night', 'ambient', 'mix', 'visual']) state[key] = structuredCopy(setup[key]);ambient.close();ambientPlaying = false;renderAll();if (persist()) status('Setup restored. Press Play to start its music, or Ambient sound for its mix.');}}
      else if (button.hasAttribute('data-study-delete-setup')) {state.setups = state.setups.filter(item => item.id !== button.dataset.studyDeleteSetup);renderSetups();persist();}
      else if (button.hasAttribute('data-study-copy-setup')) {const setup = state.setups.find(item => item.id === button.dataset.studyCopySetup);if (setup) copy(shareUrl(setup));}
      else if (button.hasAttribute('data-study-copy-link')) copy(shareUrl());
      else if (button.hasAttribute('data-study-share')) {try {if (win.navigator.share) await win.navigator.share({title: 'Swifly Study', text: 'A little space to focus.', url: shareUrl()});else copy(shareUrl());} catch (error) {if (error.name !== 'AbortError') copy(shareUrl());}}
      else if (button.hasAttribute('data-study-card')) exportCard();
      else if (button.hasAttribute('data-study-join')) {const joined = await rooms?.join(button.dataset.studyJoin, cleanText($('[data-study-name]').value, 28) || 'Guest', cleanText($('[data-study-intention]').value, 90) || 'Quiet focus');if (joined) status('You joined with devices off. Camera, microphone and screen sharing are optional.');}
      else if (button.hasAttribute('data-study-leave')) {rooms?.leave();status('You left the room. All of your devices are off.');}
      else if (button.hasAttribute('data-study-device')) {if (!rooms?.state().sessionId) return;button.disabled = true;try {if (button.dataset.studyDevice === 'screen') await media.toggleScreen();else await media.toggle(button.dataset.studyDevice === 'camera' ? 'video' : 'audio');} finally {renderDevices();}}
      else if (button.hasAttribute('data-study-listen')) {const players = $$('[data-study-videos] video').filter(player => !player.muted);const results = await Promise.allSettled(players.map(player => player.play()));status(results.some(result => result.status === 'rejected') ? 'Room audio is blocked by this browser. Check its sound permissions.' : 'Room audio enabled. Remote microphones remain under each person’s control.');}
      else if (button.hasAttribute('data-study-pin')) {const tile = button.closest('.studyVideoTile');const pinned = tile.dataset.pinned === 'true';$$('.studyVideoTile').forEach(element => {element.dataset.pinned = 'false';});tile.dataset.pinned = String(!pinned);}
    });
    on(root, 'input', event => {
      if (!canUse()) return;const input = event.target;
      if (input.hasAttribute('data-study-search')) renderTracks();
      else if (input.hasAttribute('data-study-volume')) {state.volume = clamp(input.value, 0, 100, 65) / 100;audio.volume = state.volume;scheduleSave();}
      else if (input.hasAttribute('data-study-seek')) {if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = clamp(input.value, 0, 1000) / 1000 * audio.duration;renderPlayback();}
      else if (input.hasAttribute('data-study-visual')) {state.visual[input.dataset.studyVisual] = Number(input.value);applyVisuals();updateShare();scheduleSave();}
      else if (input.hasAttribute('data-study-mix')) {state.mix[input.dataset.studyMix] = Number(input.value) / 100;state.ambient = true;ambientPlaying = true;ambient.set(true, state.mix, true).catch(error => {ambientPlaying = false;state.ambient = false;status(error.message, true);applyVisuals();});applyVisuals();updateShare();scheduleSave();}
    }, true);
    on(root, 'change', event => {
      if (!canUse()) return;const input = event.target;
      if (input.hasAttribute('data-study-station')) {state.station = stations.includes(input.value) ? input.value : 'all';renderTracks();updateShare();persist();}
      else if (input.hasAttribute('data-study-layout')) {state.layout = layouts.includes(input.value) ? input.value : 'balanced';applyVisuals();updateShare();persist();}
      else if (input.hasAttribute('data-study-import')) {
        for (const file of [...input.files || []].slice(0, 7)) {if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 12 * 1024 * 1024) {status('Choose a PNG, JPEG, WebP or GIF image up to 12 MB.', true);continue;}const url = win.URL.createObjectURL(file);urls.add(url);const scene = {id: 'local-' + win.Date.now() + '-' + scenes.length, mood: 'Your local image', title: cleanText(file.name.replace(/\.[^.]+$/, ''), 48) || 'Your image', poster: url, local: true, extension: '.' + file.type.split('/')[1]};scenes.push(scene);selectScene(scene.id);status('Your local image is ready. It stays in this tab.');}input.value = '';
      }
    }, true);
    on($('[data-study-task-form]'), 'submit', event => {event.preventDefault();if (!canUse()) return;const input = $('[data-study-task-input]'), text = cleanText(input.value);if (!text) return;if (state.tasks.length >= 30) {status('Keep up to 30 tasks. Delete one before adding another.', true);return;}state.tasks.push({id: win.crypto?.randomUUID?.() || win.Date.now().toString(36) + Math.random().toString(36).slice(2, 8), text, done: false});input.value = '';renderTasks();persist();});
    on(root, 'keydown', event => {
      const tab = event.target.closest('[data-study-tab]');if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {event.preventDefault();const tabs = $$('[data-study-tab]'), index = tabs.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;setTab(tabs[next].dataset.studyTab, true);}
      if (event.key === 'Escape' && back()) {event.preventDefault();event.stopPropagation();}
    });
    for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange']) on(audio, event, renderPlayback);
    on(audio, 'ended', () => {if (state.repeat) {audio.currentTime = 0;playMusic();} else stepTrack(1);});
    on(audio, 'waiting', () => {if (canUse() && !audio.paused) status('Buffering ' + currentTrack().title + '…');});
    on(audio, 'error', () => {if (canUse()) status('This music file could not load. Select another track or retry Play.', true);});
    on(video, 'playing', () => {if (canUse() && currentScene()?.video && video.getAttribute('src') === currentScene().video) video.classList.add('studyVideoReady');});
    on(video, 'error', () => video.classList.remove('studyVideoReady'));
    on(doc, 'visibilitychange', () => {settleTime();resetActivity();applyVisuals();persist();});
    on(doc, 'swifly:studio-change', applyVisuals);
    on(win.matchMedia?.('(prefers-reduced-motion: reduce)'), 'change', applyVisuals);
    on(win.matchMedia?.('(prefers-reduced-transparency: reduce)'), 'change', applyVisuals);
    on(doc, 'swifly:profile-changed', () => {if (verified && !suspended) switchOwner(win.SwiflyAccount?.user || null);});
    on(doc, 'swifly:account-hydrated', () => {if (accountReady && catalog) switchOwner(win.SwiflyAccount?.user || null);else if (!verified) suspended = false;});
    on(doc, 'swifly:account-suspended', () => {if (destroyed) return;stopOwner();suspended = true;root.inert = true;socket?.disconnect();status('Your account changed in another tab. Study is paused while your session is verified.', true);});
    on(win, 'storage', event => {if (event.key === 'swiflytv.activeProfile' && verified && !suspended) switchOwner(win.SwiflyAccount?.user || null);});
    const controller = {ready: null, back, destroy() {if (destroyed) return;stopOwner();destroyed = true;win.clearInterval(interval);win.clearTimeout(saveTimeout);listenCleanup.splice(0).forEach(remove => remove());rooms?.destroy();socket?.disconnect();media.stop();ambient.close();audio.pause();audio.removeAttribute('src');audio.load();video.pause();video.removeAttribute('src');video.load();releaseLocalScenes();streams.clear();}};
    on(win, 'pagehide', event => {if (!event.persisted) controller.destroy();else {settleTime();timer.pause();resetActivity();persist();rooms?.leave();audio.pause();ambient.close();ambientPlaying = false;}});
    on(win, 'pageshow', event => {if (event.persisted && canUse()) {resetActivity();applyVisuals();}});
    let saves = 0;interval = win.setInterval(() => {if (!canUse()) return;settleTime();renderClock();if (++saves % 15 === 0) persist();}, 1000);
    controller.ready = initialize();return controller;
  }
  function structuredCopy(value) {return value === undefined ? undefined : JSON.parse(JSON.stringify(value));}
  return {defaultState, normalizeState, normalizeSetup, createStore, creditStudy, studyStats, createTimer, createMediaController, createActivityTracker, createRoomClient, mount};
});
