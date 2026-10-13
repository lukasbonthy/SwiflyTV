'use strict';

const FAILURE_CODES = new Set(['no_source', 'provider_blocked', 'browser_unavailable', 'provider_failed', 'provider_timeout', 'provider_cancelled']);

/** Hedge slow captures without releasing their slots before actual cleanup. */
async function runProviderRace({
  jobs = [], run, signal = null, timeoutMs = 60000, hedgeDelayMs = 1800,
  maxConcurrent = 2, isPlayable = result => Boolean(result?.ok && result.source?.url && result.source.mediaVerified === true),
  now = Date.now, setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout
} = {}) {
  signal?.throwIfAborted();
  if (!Array.isArray(jobs)) throw new TypeError('jobs must be an array');
  if (!jobs.length) return { results: [], winner: null };
  if (typeof run !== 'function') throw new TypeError('run must be a function');
  const duration = Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 60000;
  const delay = Number.isFinite(hedgeDelayMs) ? Math.max(0, hedgeDelayMs) : 1800;
  const limit = Number.isFinite(maxConcurrent) ? Math.min(2, Math.max(1, Math.floor(maxConcurrent))) : 2;
  const endAt = now() + duration, active = new Map(), results = new Array(jobs.length);
  let next = 0, winner = null, stopping = false, hedgeTimer = null, routeTimer = null, finish;
  const complete = new Promise(resolve => { finish = resolve; });
  function reason(code) {
    const error = new Error(code === 'provider_timeout' ? 'provider timed out' : 'provider capture cancelled');
    error.code = code;
    return error;
  }
  function failure(provider, code, ms, diagnostics) {
    const result = { ok: false, provider, code, ms };
    if (diagnostics && typeof diagnostics === 'object') {
      // Diagnostics exposed to health checks contain counters, never upstream data.
      const safe = {};
      for (const key of ['responses', 'rejectedResponses', 'candidates', 'frames', 'playActions', 'navigationTimedOut']) {
        if (typeof diagnostics[key] === 'boolean' || (typeof diagnostics[key] === 'number' && Number.isFinite(diagnostics[key]))) safe[key] = diagnostics[key];
      }
      result.diagnostics = safe;
    }
    return result;
  }
  function clearHedge() {
    if (hedgeTimer !== null) cancel(hedgeTimer);
    hedgeTimer = null;
  }
  function finishIfDone() {
    if (!active.size && (stopping || next >= jobs.length)) finish();
  }
  function stop(error) {
    if (stopping) return;
    stopping = true;
    clearHedge();
    if (routeTimer !== null) cancel(routeTimer);
    routeTimer = null;
    for (const item of active.values()) {
      cancel(item.timer);
      if (!item.controller.signal.aborted) item.controller.abort(error);
    }
    finishIfDone();
  }
  function canStart() {
    if (stopping || next >= jobs.length || active.size >= limit) return false;
    // Search jobs can opt out of hedging until direct providers have settled.
    if (jobs[next].waitForPrevious && active.size) return false;
    if (now() >= endAt) { stop(reason('provider_timeout')); return false; }
    return true;
  }
  function scheduleHedge() {
    clearHedge();
    if (!canStart() || !active.size) return;
    const oldestStart = Math.min(...Array.from(active.values(), item => item.startedAt));
    hedgeTimer = schedule(() => {
      hedgeTimer = null;
      startNext();
    }, Math.max(0, delay - (now() - oldestStart)));
  }
  function settle(index, value, error) {
    const item = active.get(index);
    const finishedAt = now();
    // Timers may run after promise callbacks on a busy event loop. Enforce the
    // actual deadline too, so a late source cannot escape its child budget.
    if (!stopping && finishedAt >= endAt) stop(reason('provider_timeout'));
    if (!item.controller.signal.aborted && finishedAt >= item.deadline) item.controller.abort(reason('provider_timeout'));
    cancel(item.timer);
    active.delete(index);
    const ms = Math.max(0, finishedAt - item.startedAt), provider = item.job.provider || '';
    let result, playable = false;
    if (item.controller.signal.aborted) {
      result = failure(provider, item.controller.signal.reason?.code === 'provider_timeout' ? 'provider_timeout' : 'provider_cancelled', ms);
    } else if (error) {
      result = failure(provider, error.code === 'browser_unavailable' ? 'browser_unavailable' : 'provider_failed', ms);
    } else {
      try { playable = Boolean(isPlayable(value, item.job)); } catch {}
      result = playable ? { ...value, provider, ms }
        : failure(provider, FAILURE_CODES.has(value?.code) ? value.code : 'no_source', ms, value?.diagnostics);
    }
    results[index] = result;
    if (!stopping && playable) {
      winner = result;
      stop(reason('provider_cancelled'));
    } else if (!stopping && result.code === 'browser_unavailable') {
      stop(reason('provider_cancelled'));
    } else if (!stopping) {
      startNext();
      scheduleHedge();
    }
    finishIfDone();
  }
  function startNext() {
    if (!canStart()) return;
    const index = next++, job = jobs[index], startedAt = now();
    const providerCap = Number.isFinite(job.timeoutMs) ? Math.max(1, job.timeoutMs) : 27000;
    const budget = Math.max(1, Math.min(providerCap, endAt - startedAt));
    const item = { job, startedAt, deadline: startedAt + budget, controller: new AbortController(), timer: null };
    active.set(index, item);
    item.timer = schedule(() => {
      if (stopping || item.controller.signal.aborted) return;
      item.controller.abort(reason('provider_timeout'));
      // A timed-out capture retains its slot while it releases its resources.
      startNext();
      scheduleHedge();
    }, budget);
    Promise.resolve().then(() => {
      item.controller.signal.throwIfAborted();
      return run(job, { signal: item.controller.signal, timeoutMs: budget, index });
    }).then(value => settle(index, value, null), error => settle(index, null, error));
    scheduleHedge();
  }
  const onAbort = () => stop(signal.reason || reason('provider_cancelled'));
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    signal?.throwIfAborted();
    routeTimer = schedule(() => stop(reason('provider_timeout')), duration);
    startNext();
    await complete;
    signal?.throwIfAborted();
    return { results: results.filter(Boolean), winner };
  } finally {
    clearHedge();
    if (routeTimer !== null) cancel(routeTimer);
    signal?.removeEventListener('abort', onAbort);
  }
}

module.exports = { runProviderRace };
