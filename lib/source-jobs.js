'use strict';

const MESSAGES = {
  invalid_request: 'Choose a valid movie or episode and try again.',
  unavailable: 'No playable source is available right now. Please retry.',
  timeout: 'Source discovery took too long. Please retry.',
  busy: 'Source discovery is busy. Please try again shortly.',
  browser_unavailable: 'The playback service could not start its browser. The site owner needs to check the browser installation.',
  provider_blocked: 'The video source rejected the request. Please try again later.',
  no_source: 'The video sources returned no playable movie or episode. Please try again later.',
  destroyed: 'Source discovery is unavailable. Please try again.'
};
const PLAYBACK_FIELDS = ['playbackUrl', 'proxyVideo', 'm3u8', 'hlsProxyUrl', 'embeddedM3u8Url'];
const DIAGNOSTIC_FIELDS = new Set(['attempts', 'error', 'errors', 'reason', 'stack', 'details', 'debug', 'diagnostics', 'message', 'providerUrl', 'normalized']);
const DISCOVERY_CODES = new Set(['browser_unavailable', 'provider_blocked', 'no_source']);

function positiveInteger(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

function canonicalParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const type = typeof params.type === 'undefined' ? 'movie' : typeof params.type === 'string' ? params.type.trim().toLowerCase() : '';
  if (type !== 'movie' && type !== 'tv') return null;
  const id = positiveInteger(params.id);
  const season = type === 'tv' ? positiveInteger(params.season ?? '1') : '1';
  const episode = type === 'tv' ? positiveInteger(params.episode ?? '1') : '1';
  if (!id || !season || !episode) return null;
  const rawProvider = params.provider ?? '';
  if (typeof rawProvider !== 'string') return null;
  const provider = rawProvider.trim().toLowerCase();
  if (provider && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(provider)) return null;
  return { type, id, season, episode, provider };
}

function usablePlaybackUrl(value) {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || /[\u0000-\u0020\\]/.test(url)) return false;
  // Local HLS proxy URLs are intentional transport URLs, not a missing source.
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try { return ['http:', 'https:'].includes(new URL(url).protocol); }
  catch { return false; }
}

/**
 * Bounded, shared source discovery. poll() returns immediately; resolve() waits
 * for that same job. The supplied resolver receives (canonicalParams, { signal }).
 * Aborted work still occupies a resolver slot until its promise settles, with at
 * most two unresolved generations per key, so abort-ignoring work cannot grow
 * without bound through retries or cache expiry. Cache cleanup is lazy.
 */
function createSourceJobs({
  resolve: discover,
  deadlineMs = 75000,
  successTtlMs = 120000,
  errorTtlMs = 10000,
  maxEntries = 100,
  maxConcurrentResolvers = 6,
  now = Date.now,
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout
} = {}) {
  if (typeof discover !== 'function') throw new TypeError('A source resolver is required.');
  for (const value of [deadlineMs, maxEntries, maxConcurrentResolvers]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Source job limits must be positive integers.');
  }
  for (const value of [successTtlMs, errorTtlMs]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Source job TTLs must be nonnegative integers.');
  }
  const jobs = new Map();
  const running = new Set();
  let serial = 0, destroyed = false;

  function metadata(job) {
    const timestamp = job ? job.startedAt : now();
    return { startedAt: timestamp, deadlineAt: job ? job.deadlineAt : timestamp, jobId: job ? job.jobId : '' };
  }

  function errorSnapshot(code, job) {
    return Object.freeze({ status: 'error', code, ...metadata(job), retryAfterMs: code === 'busy' ? 1500 : 0, message: MESSAGES[code] });
  }

  function snapshot(job) {
    if (job.status === 'error') return errorSnapshot(job.code, job);
    if (job.status === 'ok') return Object.freeze({ ...job.source, status: 'ok', ...metadata(job), retryAfterMs: 0, message: 'Playable source ready.' });
    return Object.freeze({ status: 'loading', ...metadata(job), retryAfterMs: Math.max(1, Math.min(1500, job.deadlineAt - now())), message: 'Finding a playable source...' });
  }

  function immediate(code, job) {
    const result = errorSnapshot(code, job);
    return { snapshot: result, promise: Promise.resolve(result) };
  }

  function finish(job, code = '', source = null) {
    if (job.status !== 'loading' || jobs.get(job.key) !== job) return;
    job.status = code ? 'error' : 'ok';
    job.code = code;
    job.source = source;
    job.expiresAt = now() + (code ? errorTtlMs : successTtlMs);
    cancel(job.timer);
    job.timer = null;
    job.complete(snapshot(job));
    if (code === 'timeout' || code === 'destroyed') job.controller.abort();
  }

  function checkDeadline(job) {
    if (job.status === 'loading' && now() >= job.deadlineAt) finish(job, 'timeout');
  }

  function prune() {
    const timestamp = now();
    for (const [key, job] of jobs) {
      checkDeadline(job);
      if (job.status !== 'loading' && job.rawSettled && timestamp >= job.expiresAt) jobs.delete(key);
    }
  }

  function releaseRoom() {
    if (jobs.size < maxEntries) return true;
    let oldest = null;
    for (const job of jobs.values()) {
      if (job.status !== 'loading' && job.rawSettled && (!oldest || job.touchedAt < oldest.touchedAt)) oldest = job;
    }
    if (!oldest) return false;
    jobs.delete(oldest.key);
    return true;
  }

  function rawComplete(job, source, rejected) {
    job.rawSettled = true;
    running.delete(job);
    checkDeadline(job);
    if (job.status !== 'loading') return;
    try {
      if (rejected || !source || source.status !== 'ok' || !PLAYBACK_FIELDS.some(field => usablePlaybackUrl(source[field]))) {
        finish(job, DISCOVERY_CODES.has(source?.code) ? source.code : 'unavailable');
        return;
      }
      const publicSource = {};
      for (const [field, value] of Object.entries(source)) {
        if (DIAGNOSTIC_FIELDS.has(field)) continue;
        if (field === 'streamHeaders' || field === 'headers') {
          publicSource[field] = Object.fromEntries(Object.entries(value || {}).filter(([key]) => !/^(cookie|authorization|proxy-authorization)$/i.test(key)));
        } else publicSource[field] = value;
      }
      finish(job, '', publicSource);
    } catch {
      finish(job, 'unavailable');
    }
  }

  function start(key, params) {
    const startedAt = now();
    const job = {
      key, params, status: 'loading', code: '', source: null,
      jobId: `source-${++serial}`, startedAt, deadlineAt: startedAt + deadlineMs,
      touchedAt: startedAt, expiresAt: Infinity, rawSettled: false,
      controller: new AbortController(), timer: null
    };
    job.promise = new Promise(complete => { job.complete = complete; });
    jobs.set(key, job);
    running.add(job);
    job.timer = schedule(() => finish(job, 'timeout'), deadlineMs);
    job.timer?.unref?.();
    // Handle both outcomes immediately, including late rejection after abort.
    Promise.resolve().then(() => {
      if (job.controller.signal.aborted) return null;
      return discover(params, { signal: job.controller.signal });
    }).then(source => rawComplete(job, source, false), error => rawComplete(job, { code: error?.code }, true));
    return job;
  }

  function acquire(params, { retry = false } = {}) {
    if (destroyed) return immediate('destroyed');
    const canonical = canonicalParams(params);
    if (!canonical) return immediate('invalid_request');
    prune();
    const key = JSON.stringify([canonical.type, canonical.id, canonical.season, canonical.episode, canonical.provider]);
    const existing = jobs.get(key);
    if (existing) {
      existing.touchedAt = now();
      if (existing.status === 'loading' || !retry) return existing;
    }
    let pendingForKey = 0;
    for (const job of running) if (job.key === key) pendingForKey += 1;
    if (running.size >= maxConcurrentResolvers || pendingForKey >= 2) return immediate('busy', existing);
    if (!existing && !releaseRoom()) return immediate('busy');
    return start(key, canonical);
  }

  function wait(params, { retry = false, timeoutMs = 8000, signal = null } = {}) {
    signal?.throwIfAborted();
    const job = acquire(params, { retry });
    if (job.snapshot || job.status !== 'loading') return Promise.resolve(job.snapshot || snapshot(job));
    const timeout = Math.min(8000, Math.max(0, Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 8000));
    if (!timeout) return Promise.resolve(snapshot(job));
    return new Promise((resolve, reject) => {
      let timer, settled = false;
      const finish = (result, error) => {
        if (settled) return;
        settled = true; cancel(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(result);
      };
      const onAbort = () => finish(null, signal.reason || new Error('Source wait cancelled.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      // A viewer's wait never cancels the shared source job or creates another resolver.
      timer = schedule(() => { checkDeadline(job); finish(snapshot(job)); }, timeout);
      timer?.unref?.();
      job.promise.then(result => finish(result));
      if (signal?.aborted) onAbort();
    });
  }

  return {
    poll(params, options) { const job = acquire(params, options); return job.snapshot || snapshot(job); },
    resolve(params, options) { return acquire(params, options).promise; },
    wait,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const job of jobs.values()) finish(job, 'destroyed');
      for (const job of running) { cancel(job.timer); job.controller.abort(); }
      jobs.clear();
      running.clear();
    }
  };
}

module.exports = { createSourceJobs };
