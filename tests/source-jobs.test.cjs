const test = require('node:test');
const assert = require('node:assert/strict');

function factory(options) {
  let sourceJobs;
  assert.doesNotThrow(() => { sourceJobs = require('../lib/source-jobs.js'); }, 'source job module is available');
  assert.equal(typeof sourceJobs.createSourceJobs, 'function');
  return sourceJobs.createSourceJobs(options);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function clock(start = 1000) {
  let time = start, serial = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    count: () => timers.size,
    advance(ms) {
      const target = time + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      time = target;
    }
  };
}

const flush = async () => { for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); };
const movie = { type: 'movie', id: '101' };
const playable = { status: 'ok', playbackUrl: 'https://media.example/video.mp4', proxyVideo: 'https://media.example/video.mp4', streamType: 'mp4' };

test('poll returns a pending snapshot immediately while discovery remains unresolved', async t => {
  const pending = deferred(), time = clock();
  let received;
  const jobs = factory({ ...time, deadlineMs: 75000, resolve(params, options) { received = { params, signal: options.signal }; return pending.promise; } });
  t.after(() => jobs.destroy());

  const result = jobs.poll(movie);
  assert.equal(result && typeof result.then, 'undefined', 'poll must return JSON state without awaiting the provider');
  assert.equal(result.status, 'loading');
  assert.equal(result.startedAt, 1000);
  assert.equal(result.deadlineAt, 76000);
  assert.equal(typeof result.jobId, 'string');
  assert.match(result.message, /source/i);
  assert(result.retryAfterMs > 0);
  assert.equal(received, undefined, 'the resolver cannot delay the synchronous poll');
  await flush();
  assert.deepEqual(received.params, { type: 'movie', id: '101', season: '1', episode: '1', provider: '' });
  assert.equal(received.signal.aborted, false);
});

test('player polls and room resolution share one discovery and one terminal promise', async t => {
  const pending = deferred(), time = clock();
  let calls = 0;
  const jobs = factory({ ...time, resolve() { calls += 1; return pending.promise; } });
  t.after(() => jobs.destroy());
  const first = jobs.poll(movie);
  const room = jobs.resolve({ type: 'MOVIE', id: 101, season: '9', episode: '8' });
  assert.equal(room, jobs.resolve({ id: '00101' }));
  assert.equal(jobs.poll(movie).jobId, first.jobId);
  await flush();
  assert.equal(calls, 1);
  pending.resolve(playable);
  const result = await room;
  assert.equal(result.status, 'ok');
  assert.equal(result.playbackUrl, playable.playbackUrl);
  assert.equal(result.jobId, first.jobId);
  assert.equal(jobs.poll(movie).status, 'ok');
  assert.equal(time.count(), 0, 'completion releases its deadline timer');
});

test('TV episodes and provider selections have separate jobs with canonical positive numbers', async t => {
  const time = clock(), received = [];
  const jobs = factory({ ...time, resolve(params) { received.push(params); return new Promise(() => {}); } });
  t.after(() => jobs.destroy());
  const first = jobs.poll({ type: ' tv ', id: '00101', season: '02', episode: '003', provider: ' HeXa ' });
  assert.equal(jobs.poll({ type: 'tv', id: 101, season: 2, episode: 3, provider: 'hexa' }).jobId, first.jobId);
  const nextEpisode = jobs.poll({ type: 'tv', id: 101, season: 2, episode: 4, provider: 'hexa' });
  const nextSeason = jobs.poll({ type: 'tv', id: 101, season: 3, episode: 3, provider: 'hexa' });
  const nextProvider = jobs.poll({ type: 'tv', id: 101, season: 2, episode: 3, provider: 'cinezo' });
  assert.equal(new Set([first.jobId, nextEpisode.jobId, nextSeason.jobId, nextProvider.jobId]).size, 4);
  await flush();
  assert.equal(received.length, 4);
  assert.deepEqual(received[0], { type: 'tv', id: '101', season: '2', episode: '3', provider: 'hexa' });
});

test('invalid identity or provider input returns a safe error without starting work', async t => {
  const time = clock();
  let calls = 0;
  const jobs = factory({ ...time, resolve() { calls += 1; return playable; } });
  t.after(() => jobs.destroy());
  for (const params of [null, {}, { id: 0 }, { id: -1 }, { id: '1.5' }, { id: '1e2' }, { id: Number.MAX_SAFE_INTEGER + 1 }, { id: ['101'] }, { type: 'music', id: 101 }, { type: 'tv', id: 101, episode: '0' }, { type: 'tv', id: 101, season: '-1' }, { id: 101, provider: 'https://private.example/?key=SECRET' }, { id: 101, provider: 'x'.repeat(65) }, { id: 101, provider: ['hexa'] }]) {
    const result = jobs.poll(params);
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'invalid_request');
    assert.doesNotMatch(JSON.stringify(result), /private\.example|SECRET/);
    assert.equal((await jobs.resolve(params)).status, 'error');
  }
  await flush();
  assert.equal(calls, 0);
  assert.equal(time.count(), 0);
});

test('successful discovery preserves relative HLS transport and source metadata', async t => {
  const time = clock();
  const source = {
    status: 'ok', playbackUrl: '/api/hls-proxy/opaque/master.m3u8', proxyVideo: '/api/hls-proxy/opaque/master.m3u8',
    m3u8: 'https://media.example/master.m3u8?token=PLAYBACK', originalPlaybackUrl: 'https://media.example/master.m3u8?token=PLAYBACK',
    embeddedM3u8Url: '/api/hls-proxy/opaque/master.m3u8', hlsProxyUrl: '/api/hls-proxy/opaque/master.m3u8',
    hlsProxyId: 'opaque', hlsProxyStatusUrl: '/api/hls-proxy/opaque/status', streamType: 'm3u8', streamMode: 'hls',
    streamQuality: '1080p', providerKind: 'local_hls_proxy', streamHeaders: { Referer: 'https://media.example/' },
    subtitles: [{ url: 'https://media.example/subtitles.vtt', language: 'en' }],
    attempts: ['https://provider.example/?api_key=SECRET'], message: 'https://provider.example/?api_key=SECRET'
  };
  const jobs = factory({ ...time, resolve: async () => source });
  t.after(() => jobs.destroy());
  const result = await jobs.resolve(movie);
  for (const key of Object.keys(source).filter(key => !['attempts', 'message'].includes(key))) assert.deepEqual(result[key], source[key], key);
  assert.doesNotMatch(JSON.stringify(result), /provider\.example|api_key|SECRET/);
  assert.match(result.message, /ready/i);
});

test('direct media without an extension stays direct and is not relabeled as HLS', async t => {
  const time = clock();
  const source = { status: 'ok', playbackUrl: 'https://media.example/play?id=101', proxyVideo: 'https://media.example/play?id=101', streamType: 'video', streamMode: 'video' };
  const jobs = factory({ ...time, resolve: () => source });
  t.after(() => jobs.destroy());
  const result = await jobs.resolve(movie);
  assert.equal(result.status, 'ok');
  assert.equal(result.playbackUrl, source.playbackUrl);
  assert.equal(result.streamType, 'video');
  assert.equal(result.streamMode, 'video');
  assert.equal(Object.hasOwn(result, 'm3u8'), false);
});

test('provider errors and unusable source responses become generic terminal errors', async t => {
  const time = clock();
  const diagnostics = 'https://provider.example/path?api_key=SECRET';
  const cases = [null, { status: 'ok' }, { status: 'disabled', reason: diagnostics }, { status: 'error', message: diagnostics, attempts: [diagnostics], error: diagnostics }, { status: 'ok', playbackUrl: 'javascript:alert(1)' }, { status: 'ok', playbackUrl: 'data:video/mp4;base64,AA' }, { status: 'ok', playbackUrl: '//provider.example/path?api_key=SECRET' }];
  for (let index = 0; index < cases.length; index += 1) {
    const jobs = factory({ ...time, resolve: () => cases[index] });
    t.after(() => jobs.destroy());
    const result = await jobs.resolve({ id: index + 1 });
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'unavailable');
    assert.match(result.message, /retry|try again/i);
    assert.doesNotMatch(JSON.stringify(result), /provider\.example|api_key|SECRET|javascript|base64/);
    assert.equal(time.count(), 0);
  }
});

test('synchronous throws and rejected promises cannot leak diagnostics or reject the public promise', async t => {
  const time = clock();
  for (const resolve of [() => { throw new Error('https://provider.example/?token=SECRET'); }, () => Promise.reject(new Error('API_KEY=SECRET'))]) {
    const jobs = factory({ ...time, resolve });
    t.after(() => jobs.destroy());
    const result = await jobs.resolve(movie);
    assert.equal(result.status, 'error');
    assert.doesNotMatch(JSON.stringify(result), /provider\.example|token|API_KEY|SECRET/);
  }
});

test('the whole-job deadline ends a response-body hang and aborts the resolver signal', async t => {
  const body = deferred(), time = clock();
  let headersReceived = false, signal;
  const jobs = factory({ ...time, deadlineMs: 75, resolve: async (_params, options) => { signal = options.signal; await Promise.resolve(); headersReceived = true; return body.promise; } });
  t.after(() => jobs.destroy());
  const first = jobs.poll(movie), room = jobs.resolve(movie);
  await flush();
  assert.equal(headersReceived, true);
  assert.equal(time.count(), 1, 'deadline must stay live after headers while the body remains unresolved');
  time.advance(74);
  assert.equal(jobs.poll(movie).status, 'loading');
  time.advance(1);
  const result = await room;
  assert.equal(result.status, 'error');
  assert.equal(result.code, 'timeout');
  assert.equal(result.jobId, first.jobId);
  assert.equal(signal.aborted, true);
  assert.equal(time.count(), 0);
  body.resolve(playable);
  await flush();
  assert.equal(jobs.poll(movie).status, 'error', 'a late body cannot turn a timeout into success');
});

test('active Retry calls reuse the same discovery instead of duplicating scraper work', async t => {
  const pending = deferred(), time = clock();
  let calls = 0;
  const jobs = factory({ ...time, resolve() { calls += 1; return pending.promise; } });
  t.after(() => jobs.destroy());
  const first = jobs.poll(movie), room = jobs.resolve(movie);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(jobs.poll(movie, { retry: true }).jobId, first.jobId);
    assert.equal(jobs.resolve(movie, { retry: true }), room);
  }
  await flush();
  assert.equal(calls, 1);
  pending.resolve(playable);
  assert.equal((await room).status, 'ok');
});

test('Retry starts one new generation after a settled error while concurrent retries share it', async t => {
  const first = deferred(), second = deferred(), time = clock();
  let calls = 0;
  const jobs = factory({ ...time, resolve() { calls += 1; return calls === 1 ? first.promise : second.promise; } });
  t.after(() => jobs.destroy());
  const initial = jobs.poll(movie), oldRoom = jobs.resolve(movie);
  await flush();
  first.reject(new Error('unavailable'));
  assert.equal((await oldRoom).status, 'error');
  time.advance(2);
  const retry = jobs.poll(movie, { retry: true });
  assert.equal(retry.status, 'loading');
  assert.notEqual(retry.jobId, initial.jobId);
  assert.equal(retry.startedAt, 1002);
  assert.equal(jobs.poll(movie, { retry: true }).jobId, retry.jobId);
  await flush();
  assert.equal(calls, 2);
  second.resolve(playable);
  assert.equal((await jobs.resolve(movie)).status, 'ok');
});

test('a late result from an aborted generation cannot overwrite its replacement', async t => {
  const first = deferred(), second = deferred(), time = clock();
  const signals = [];
  const jobs = factory({ ...time, deadlineMs: 50, resolve(_params, { signal }) { signals.push(signal); return signals.length === 1 ? first.promise : second.promise; } });
  t.after(() => jobs.destroy());
  const initial = jobs.poll(movie), oldRoom = jobs.resolve(movie);
  await flush();
  time.advance(50);
  assert.equal((await oldRoom).code, 'timeout');
  const retry = jobs.poll(movie, { retry: true });
  assert.notEqual(retry.jobId, initial.jobId);
  await flush();
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  first.resolve({ ...playable, playbackUrl: 'https://media.example/stale.mp4' });
  await flush();
  assert.equal(jobs.poll(movie).status, 'loading');
  assert.equal(jobs.poll(movie).jobId, retry.jobId);
  second.resolve(playable);
  const current = await jobs.resolve(movie);
  assert.equal(current.status, 'ok');
  assert.equal(current.playbackUrl, playable.playbackUrl);
  assert.equal(current.jobId, retry.jobId);
});

test('repeated timed-out Retry calls allow at most two unresolved generations for one title', async t => {
  const pending = [], time = clock();
  const jobs = factory({ ...time, deadlineMs: 50, maxConcurrentResolvers: 6, resolve() { const next = deferred(); pending.push(next); return next.promise; } });
  t.after(() => jobs.destroy());
  jobs.poll(movie);
  await flush();
  time.advance(50);
  const second = jobs.poll(movie, { retry: true });
  await flush();
  time.advance(50);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = jobs.poll(movie, { retry: true });
    assert.equal(result.status, 'error');
    assert.equal(result.jobId, second.jobId);
  }
  await flush();
  assert.equal(pending.length, 2, 'an abort-ignoring scraper must not multiply on every retry');
  pending[0].resolve(playable);
  await flush();
  const third = jobs.poll(movie, { retry: true });
  assert.equal(third.status, 'loading');
  assert.notEqual(third.jobId, second.jobId);
  await flush();
  assert.equal(pending.length, 3);
});

test('global raw-resolver capacity counts hung generations after timeout separately from cached snapshots', async t => {
  const pending = [], time = clock();
  const jobs = factory({ ...time, deadlineMs: 50, maxEntries: 100, maxConcurrentResolvers: 2, resolve() { const next = deferred(); pending.push(next); return next.promise; } });
  t.after(() => jobs.destroy());
  jobs.poll({ id: 1 });
  jobs.poll({ id: 2 });
  assert.equal(jobs.poll({ id: 3 }).code, 'busy');
  await flush();
  time.advance(50);
  const busy = jobs.poll({ id: 3 });
  assert.equal(busy.status, 'error');
  assert.equal(busy.code, 'busy');
  assert.match(busy.message, /busy|try again/i);
  assert(busy.retryAfterMs > 0);
  assert.equal(pending.length, 2);
  pending[0].reject(new Error('late failure'));
  await flush();
  assert.equal(jobs.poll({ id: 3 }).status, 'loading');
  await flush();
  assert.equal(pending.length, 3);
});

test('cache capacity evicts settled snapshots while keeping all active discovery jobs', async t => {
  const active = deferred(), third = deferred(), time = clock();
  const calls = [];
  const jobs = factory({ ...time, maxEntries: 2, maxConcurrentResolvers: 6, resolve(params) { calls.push(params.id); return params.id === '1' ? active.promise : params.id === '2' ? playable : third.promise; } });
  t.after(() => jobs.destroy());
  const original = jobs.poll({ id: 1 });
  assert.equal((await jobs.resolve({ id: 2 })).status, 'ok');
  const replacement = jobs.poll({ id: 3 });
  assert.equal(replacement.status, 'loading');
  assert.equal(jobs.poll({ id: 1 }).jobId, original.jobId);
  assert.equal(jobs.poll({ id: 4 }).code, 'busy');
  assert.equal(jobs.poll({ id: 3 }).jobId, replacement.jobId);
  await flush();
  assert.deepEqual(calls, ['1', '2', '3']);
});

test('success and error TTLs start at completion and permit fresh work only after expiry', async t => {
  const time = clock();
  let calls = 0;
  const jobs = factory({ ...time, successTtlMs: 20, errorTtlMs: 5, resolve(params) { calls += 1; return params.id === '1' ? playable : null; } });
  t.after(() => jobs.destroy());
  const success = await jobs.resolve({ id: 1 });
  const failure = await jobs.resolve({ id: 2 });
  assert.equal(calls, 2);
  time.advance(4);
  assert.equal(jobs.poll({ id: 2 }).jobId, failure.jobId);
  time.advance(1);
  assert.equal(jobs.poll({ id: 2 }).status, 'loading');
  await flush();
  assert.equal(calls, 3);
  time.advance(14);
  assert.equal(jobs.poll({ id: 1 }).jobId, success.jobId);
  time.advance(1);
  const restarted = jobs.poll({ id: 1 });
  assert.equal(restarted.status, 'loading');
  assert.notEqual(restarted.jobId, success.jobId);
  await flush();
  assert.equal(calls, 4);
});

test('TTL expiry does not automatically respawn a resolver that ignored its abort', async t => {
  const time = clock();
  let calls = 0;
  const jobs = factory({ ...time, deadlineMs: 50, errorTtlMs: 5, resolve() { calls += 1; return new Promise(() => {}); } });
  t.after(() => jobs.destroy());
  const first = jobs.poll(movie);
  await flush();
  time.advance(5000);
  for (let attempt = 0; attempt < 20; attempt += 1) assert.equal(jobs.poll(movie).jobId, first.jobId);
  await flush();
  assert.equal(calls, 1);
  assert.equal(jobs.poll(movie).code, 'timeout');
});

test('a result completed beyond the deadline stays timed out even before the timer callback runs', async t => {
  const pending = deferred(), timers = new Set();
  let time = 1000, signal;
  const jobs = factory({ deadlineMs: 50, now: () => time, setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }, resolve(_params, options) { signal = options.signal; return pending.promise; } });
  t.after(() => jobs.destroy());
  const room = jobs.resolve(movie);
  await flush();
  time = 1051;
  pending.resolve(playable);
  assert.equal((await room).code, 'timeout');
  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
});

test('destroy aborts current and replaced work, settles waiters, and releases every timer', async () => {
  const time = clock(), pending = [], signals = [];
  const jobs = factory({ ...time, deadlineMs: 50, resolve(_params, { signal }) { const next = deferred(); pending.push(next); signals.push(signal); return next.promise; } });
  jobs.poll(movie);
  await flush();
  time.advance(50);
  jobs.poll(movie, { retry: true });
  const room = jobs.resolve(movie);
  await flush();
  assert.equal(time.count(), 1);
  jobs.destroy();
  assert.equal((await room).code, 'destroyed');
  assert.equal(time.count(), 0);
  assert(signals.every(signal => signal.aborted));
  jobs.destroy();
  assert.equal(jobs.poll(movie).code, 'destroyed');
  assert.equal((await jobs.resolve(movie)).code, 'destroyed');
  for (const task of pending) task.reject(new Error('https://provider.example/?key=SECRET'));
  await flush();
  assert.equal(pending.length, 2, 'destroyed jobs never restart');
});
