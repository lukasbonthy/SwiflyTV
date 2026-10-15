'use strict';
const { verifyNuvioSource } = require('./nuvio-provider');

/** Validate a registered alternate once, when first requested, not at startup. */
function createVerifiedMediaEntryResolver({ getEntry, verifySource = verifyNuvioSource, timeoutMs = 8000 } = {}) {
  if (typeof getEntry !== 'function' || typeof verifySource !== 'function') throw new TypeError('Media entry resolver requires lookup and verification');
  const pending = new WeakMap();
  return async function resolveEntry(id, { method = 'GET' } = {}) {
    const entry = await getEntry(id);
    if (!entry || (entry.expiresAt != null && Number(entry.expiresAt) <= Date.now())) return null;
    if (method === 'OPTIONS' || entry.meta?.verifyBeforePlayback !== true) return entry;
    if (!pending.has(entry)) pending.set(entry, (async () => {
      const scope = new AbortController();
      const timer = setTimeout(() => scope.abort(new Error('Source verification timed out')), Math.max(1, Math.min(8000, timeoutMs)));
      timer.unref?.();
      try {
        const verified = await verifySource({ url: entry.sourceUrl, type: 'mp4', format: 'mp4', headers: entry.headers,
          codecName: entry.meta.sourceCodec, requiresProxy: true }, { signal: scope.signal });
        scope.signal.throwIfAborted();
        if (!verified?.mediaVerified || verified.format !== 'mp4' || (entry.expiresAt != null && Number(entry.expiresAt) <= Date.now())) return null;
        entry.sourceUrl = verified.url;
        entry.headers = verified.headers;
        entry.meta = { ...entry.meta, sourceCodec: verified.codecName || entry.meta.sourceCodec, verifyBeforePlayback: false };
        return entry;
      } catch { return null; }
      finally { clearTimeout(timer); }
    })());
    return pending.get(entry);
  };
}
module.exports = { createVerifiedMediaEntryResolver };
