'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
const playable = provider => ({ ok: true, provider, source: { url: `https://media.example/${provider}.m3u8`, format: 'm3u8', forceHls: true, mediaVerified: true } });
const failed = provider => ({ ok: false, provider, code: 'no_source' });

function fixture() {
  let time = 0, serial = 0;
  const timers = new Map(), module = { exports: {} };
  const file = path.resolve(__dirname, '../lib/provider-race.js');
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'module.exports = {};';
  vm.runInNewContext(source, {
    module, AbortController,
    Date: class extends Date { static now() { return time; } },
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  assert.equal(typeof module.exports.runProviderRace, 'function', 'the bounded provider race must be exported');
  function advance(ms) {
    const target = time + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      time = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    time = target;
  }
  return { race: module.exports.runProviderRace, advance, timers, now: () => time };
}

test('the preferred verified source avoids starting the hedge', async () => {
  const f = fixture(), calls = [];
  const result = await f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: async job => {
    calls.push(job.provider); return playable(job.provider);
  } });
  assert.deepEqual(calls, ['hexa']);
  assert.equal(result.winner.source.url, 'https://media.example/hexa.m3u8');
  assert.equal(f.timers.size, 0);
});

test('the hedge starts at its delay and a winner awaits the losing capture cleanup', async () => {
  const f = fixture(), losing = deferred(), calls = [], signals = new Map();
  let settled = false;
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: (job, { signal }) => {
    calls.push(job.provider); signals.set(job.provider, signal);
    return job.provider === 'hexa' ? losing.promise : playable(job.provider);
  } }).then(result => { settled = true; return result; });
  await flush();
  f.advance(1799); await flush();
  assert.deepEqual(calls, ['hexa']);
  f.advance(1); await flush();
  assert.deepEqual(calls, ['hexa', 'cinezo']);
  assert.equal(signals.get('hexa').aborted, true);
  assert.equal(settled, false, 'an abort signal does not stand in for actual cleanup');
  losing.resolve(failed('hexa'));
  const result = await pending;
  assert.equal(result.winner.provider, 'cinezo');
  assert.equal(result.results[0].code, 'provider_cancelled');
  assert.equal(result.results[1], result.winner);
  assert.equal(f.timers.size, 0);
});

test('a failed preferred capture hands off immediately before the hedge delay', async () => {
  const f = fixture(), calls = [];
  const result = await f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: job => {
    calls.push(job.provider); return job.provider === 'hexa' ? failed(job.provider) : playable(job.provider);
  } });
  assert.deepEqual(calls, ['hexa', 'cinezo']);
  assert.equal(result.winner.provider, 'cinezo');
  assert.equal(result.winner.ms, 0);
  assert.equal(f.timers.size, 0);
});

test('Nuvio failure counters survive the race while upstream details remain excluded',async()=>{
  const f=fixture();
  const result=await f.race({jobs:[{provider:'nuvio-vidsrc'}],now:f.now,run:async()=>({
    ok:false,code:'no_source',diagnostics:{requests:2,responses:2,rejectedResponses:1,requestErrors:0,dnsErrors:0,metadataStatus:200,upstreamStatus:403,
      url:'https://upstream.example/private',headers:{Authorization:'secret'},body:'secret',candidates:0}
  })});
  assert.deepEqual({...result.results[0].diagnostics},{requests:2,responses:2,rejectedResponses:1,candidates:0,requestErrors:0,dnsErrors:0,metadataStatus:200,upstreamStatus:403});
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(JSON.stringify(result).includes('upstream.example'),false);
});

test('candidate success without verification cannot win the default race', async () => {
  const f = fixture();
  const result = await f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: job => {
    return job.provider === 'hexa' ? { ok: true, source: { url: 'https://media.example/unverified.m3u8' } } : playable(job.provider);
  } });
  assert.equal(result.winner.provider, 'cinezo');
});

test('the default race requires an actual true verification flag', async () => {
  const f = fixture();
  const result = await f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: job => {
    const result = playable(job.provider);
    if (job.provider === 'hexa') result.source.mediaVerified = 'false';
    return result;
  } });
  assert.equal(result.winner.provider, 'cinezo');
});

test('a delayed provider timeout callback cannot admit a late successful source', async () => {
  const f = fixture(), first = deferred();
  let clock = 0;
  const pending = f.race({ jobs: [{ provider: 'hexa', timeoutMs: 10 }, { provider: 'cinezo' }], now: () => clock,
    timeoutMs: 100, run: job => job.provider === 'hexa' ? first.promise : playable(job.provider)
  });
  await flush();
  // Move wall time without dispatching timers, as when the event loop is busy.
  clock = 11;
  first.resolve(playable('hexa'));
  const result = await pending;
  assert.equal(result.winner.provider, 'cinezo');
  assert.equal(result.results[0].code, 'provider_timeout');
  assert.equal(f.timers.size, 0);
});

test('a delayed route timeout callback cannot admit a source or start fallback', async () => {
  const f = fixture(), first = deferred(), calls = [];
  let clock = 0;
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: () => clock,
    timeoutMs: 100, run: job => { calls.push(job.provider); return first.promise; }
  });
  await flush();
  clock = 101;
  first.resolve(playable('hexa'));
  const result = await pending;
  assert.equal(result.winner, null);
  assert.deepEqual(calls, ['hexa']);
  assert.equal(result.results[0].code, 'provider_timeout');
  assert.equal(f.timers.size, 0);
});

test('per-provider deadlines pass a child signal and prevent a late source from winning', async () => {
  const f = fixture(), first = deferred(), second = deferred(), calls = [];
  const pending = f.race({ jobs: [{ provider: 'hexa', timeoutMs: 10 }, { provider: 'cinezo', timeoutMs: 20 }], now: f.now,
    timeoutMs: 100, hedgeDelayMs: 50, run: (job, options) => {
      calls.push({ provider: job.provider, ...options });
      return job.provider === 'hexa' ? first.promise : second.promise;
    } });
  await flush();
  assert.equal(calls[0].timeoutMs, 10);
  assert.equal(calls[0].index, 0);
  f.advance(10); await flush();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].provider, 'cinezo');
  assert.equal(calls[1].timeoutMs, 20);
  second.resolve(playable('cinezo')); await flush();
  first.resolve(playable('hexa'));
  const result = await pending;
  assert.equal(result.winner.provider, 'cinezo');
  assert.equal(result.results[0].code, 'provider_timeout');
  assert.equal(f.timers.size, 0);
});

test('the route deadline stops launches and waits for both active cleanups', async () => {
  const f = fixture(), tasks = [deferred(), deferred()], calls = [];
  let settled = false;
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }, { provider: 'third' }], now: f.now,
    timeoutMs: 100, hedgeDelayMs: 10, run: (job, options) => {
      calls.push({ provider: job.provider, ...options }); return tasks[options.index].promise;
    } }).then(result => { settled = true; return result; });
  await flush(); f.advance(10); await flush();
  assert.equal(calls[0].timeoutMs, 100);
  assert.equal(calls[1].timeoutMs, 90, 'a late hedge cannot exceed the remaining route budget');
  f.advance(90); await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.signal.aborted), true);
  assert.equal(settled, false);
  tasks[0].resolve(failed('hexa')); await flush();
  assert.equal(settled, false);
  tasks[1].resolve(failed('cinezo'));
  const result = await pending;
  assert.equal(result.winner, null);
  assert.equal(result.results.every(item => item.code === 'provider_timeout'), true);
  assert.equal(f.timers.size, 0);
});

test('client cancellation rejects with its reason only after active work has settled', async () => {
  const f = fixture(), controller = new AbortController(), cleanup = deferred();
  let childSignal, settled = false;
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, signal: controller.signal,
    run: (_job, { signal }) => { childSignal = signal; return cleanup.promise; }
  }).catch(error => { settled = true; return error; });
  await flush();
  const reason = new Error('client left'); controller.abort(reason); await flush();
  assert.equal(childSignal.aborted, true);
  assert.equal(settled, false);
  cleanup.resolve(failed('hexa'));
  assert.equal(await pending, reason);
  assert.equal(f.timers.size, 0);
});

test('a shared browser startup failure stops fallback without exposing error details', async () => {
  const f = fixture(), calls = [];
  const result = await f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }], now: f.now, run: job => {
    calls.push(job.provider);
    const error = new Error('PRIVATE upstream authorization and cookies'); error.code = 'browser_unavailable'; throw error;
  } });
  assert.deepEqual(calls, ['hexa']);
  assert.equal(result.winner, null);
  assert.equal(result.results[0].code, 'browser_unavailable');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(f.timers.size, 0);
});

test('optional title search waits until all preceding direct captures fail', async () => {
  const f = fixture(), first = deferred(), second = deferred(), calls = [];
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }, { provider: 'sflix', waitForPrevious: true }], now: f.now,
    run: job => { calls.push(job.provider); return job.provider === 'hexa' ? first.promise : job.provider === 'cinezo' ? second.promise : playable(job.provider); }
  });
  await flush(); f.advance(1800); await flush();
  first.resolve(failed('hexa')); await flush();
  assert.deepEqual(calls, ['hexa', 'cinezo']);
  second.resolve(failed('cinezo'));
  const result = await pending;
  assert.deepEqual(calls, ['hexa', 'cinezo', 'sflix']);
  assert.equal(result.winner.provider, 'sflix');
  assert.equal(f.timers.size, 0);
});

test('concurrency is capped at two and results retain provider order', async () => {
  const f = fixture(), tasks = [deferred(), deferred(), deferred()], calls = [];
  let active = 0, maximumActive = 0;
  const pending = f.race({ jobs: [{ provider: 'hexa' }, { provider: 'cinezo' }, { provider: 'third' }], now: f.now,
    maxConcurrent: 8, hedgeDelayMs: 10, run: (job, { index }) => {
      calls.push(job.provider); active++; maximumActive = Math.max(maximumActive, active);
      return tasks[index].promise.finally(() => { active--; });
    }
  });
  await flush(); f.advance(10); await flush(); f.advance(10); await flush();
  assert.deepEqual(calls, ['hexa', 'cinezo']);
  tasks[1].resolve(failed('cinezo')); await flush();
  assert.deepEqual(calls, ['hexa', 'cinezo', 'third']);
  tasks[2].resolve(playable('third')); await flush();
  tasks[0].resolve(failed('hexa'));
  const result = await pending;
  assert.equal(maximumActive, 2);
  assert.deepEqual(Array.from(result.results, item => item.provider), ['hexa', 'cinezo', 'third']);
  assert.equal(result.winner.provider, 'third');
  assert.equal(f.timers.size, 0);
});
