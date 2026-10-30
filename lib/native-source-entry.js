'use strict';
const { verifyNuvioSource } = require('./nuvio-provider');

/** Share lazy verification; successful alternates stay ready, failures retry after cooldown. */
function createVerifiedMediaEntryResolver({ getEntry, verifySource = verifyNuvioSource, timeoutMs = 8000, now = Date.now } = {}) {
  if (typeof getEntry !== 'function' || typeof verifySource !== 'function') throw new TypeError('Media entry resolver requires lookup and verification');
  const pending = new WeakMap();
  return async function resolveEntry(id, { method = 'GET' } = {}) {
    const entry = await getEntry(id);
    if (!entry || (entry.expiresAt != null && Number(entry.expiresAt) <= now())) return null;
    if (method === 'OPTIONS' || entry.meta?.verifyBeforePlayback !== true) return entry;
    const cached=pending.get(entry);
    if(cached&&(!cached.retryAt||now()<cached.retryAt))return cached.promise;
    const task={promise:null,retryAt:0};
    task.promise=(async () => {
      const scope = new AbortController();
      const timer = setTimeout(() => scope.abort(new Error('Source verification timed out')), Math.max(1, Math.min(8000, timeoutMs)));
      timer.unref?.();
      try {
        const verified = await verifySource({ url: entry.sourceUrl, type: 'mp4', format: 'mp4', headers: entry.headers,
          codecName: entry.meta.sourceCodec, requiresProxy: true }, { signal: scope.signal });
        scope.signal.throwIfAborted();
        if (!verified?.mediaVerified || verified.format !== 'mp4' || (entry.expiresAt != null && Number(entry.expiresAt) <= now())) return null;
        entry.sourceUrl = verified.url;
        entry.headers = verified.headers;
        entry.meta = { ...entry.meta, sourceCodec: verified.codecName || entry.meta.sourceCodec, verifyBeforePlayback: false };
        return entry;
      } catch { return null; }
      finally { clearTimeout(timer); }
    })().then(value=>{
      // A failed probe is a short cooldown, not a permanent verdict for an
      // otherwise live alternate. Concurrent retries still share one probe.
      if(value)pending.delete(entry);else task.retryAt=now()+1000;
      return value;
    });
    pending.set(entry,task);
    return task.promise;
  };
}
module.exports = { createVerifiedMediaEntryResolver };
