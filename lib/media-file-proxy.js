'use strict';
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const { pipeline } = require('node:stream/promises');
const { cleanHeaders, isPublicAddress } = require('./nuvio-http');

const redirects = new Set([301, 302, 303, 307, 308]);
const mp4ContentTypes = new Set(['video/mp4', 'application/mp4', 'video/x-m4v', 'application/octet-stream', 'binary/octet-stream']);
const fileHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-encoding', 'cache-control', 'etag', 'last-modified'];

function setCors(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Origin, Referer, User-Agent');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
}

function sendError(req, res, status, message) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(message));
  res.setHeader('Cache-Control', 'no-store');
  res.end(req.method === 'HEAD' ? undefined : message);
}

function validRange(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) return BigInt(match[2]) > 0n;
  return !match[2] || BigInt(match[2]) >= BigInt(match[1]);
}

function untilAborted(task, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(task).then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); }
    );
    if (signal.aborted) abort();
  });
}

/** Streams an opaque, verified MP4 entry without retaining its body in memory. */
function createMediaFileProxy({
  getEntry,
  lookup = (hostname, options) => dns.lookup(hostname, options),
  addressAllowed = isPublicAddress,
  headersTimeoutMs = 15_000,
  idleTimeoutMs = 30_000
} = {}) {
  if (typeof getEntry !== 'function') throw new TypeError('getEntry must be a function');
  const headersTimeout = Math.max(1, Number(headersTimeoutMs) || 15_000);
  const idleTimeout = Math.max(1, Number(idleTimeoutMs) || 30_000);

  return async function handleMediaFileProxy(req, res) {
    setCors(res);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      sendError(req, res, 405, 'Unsupported media proxy method.');
      return;
    }

    const scope = new AbortController();
    let upstreamRequest, upstreamResponse, headersTimer, timedOut = false;
    const destroyUpstream = () => { upstreamResponse?.destroy(); upstreamRequest?.destroy(); };
    const abort = () => { if (!scope.signal.aborted) scope.abort(new Error('Media request cancelled')); destroyUpstream(); };
    const clientClosed = () => { if (!res.writableFinished) abort(); };
    const timeout = () => { timedOut = true; abort(); };
    req.once('aborted', abort);
    res.once('close', clientClosed);

    try {
      if (req.aborted || res.destroyed) { abort(); return; }
      const entry = await untilAborted(getEntry(req.params?.id), scope.signal);
      if (!entry || String(entry.meta?.sourceFormat || '').toLowerCase() !== 'mp4' ||
          (entry.expiresAt != null && (!Number.isFinite(Number(entry.expiresAt)) || Number(entry.expiresAt) <= Date.now()))) {
        sendError(req, res, 404, 'Media proxy source expired or missing.');
        return;
      }
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      const range = req.headers.range;
      if (range != null && !validRange(range)) {
        sendError(req, res, 416, 'Invalid media byte range.');
        return;
      }

      let target = new URL(String(entry.sourceUrl || ''));
      const headers = cleanHeaders(entry.headers || {});
      // A verification probe's byte range must not truncate subsequent playback.
      for (const name of ['range', 'if-range', 'te', 'trailer', 'upgrade', 'keep-alive']) delete headers[name];
      if (range != null) headers.range = range.trim();
      headers['accept-encoding'] = 'identity';

      for (let hop = 0; hop <= 5; hop++) {
        scope.signal.throwIfAborted();
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.href.length > 16_384) {
          throw new Error('Invalid media target');
        }
        headersTimer = setTimeout(timeout, headersTimeout);
        headersTimer.unref?.();
        const hostname = target.hostname.replace(/^\[|\]$/g, '');
        const family = net.isIP(hostname);
        const addresses = family ? [{ address: hostname, family }] :
          await untilAborted(lookup(hostname, { all: true, verbatim: true }), scope.signal);
        scope.signal.throwIfAborted();
        if (!Array.isArray(addresses) || !addresses.length || addresses.some(item => !addressAllowed(item.address, target))) {
          throw new Error('Invalid media address');
        }

        upstreamResponse = await new Promise((resolve, reject) => {
          upstreamRequest = (target.protocol === 'https:' ? https : http).request(target, {
            method: req.method,
            headers,
            signal: scope.signal,
            // Do not reuse a socket whose DNS resolution belongs to another hop.
            agent: false,
            lookup(_hostname, options, callback) {
              if (options.all) callback(null, addresses);
              else callback(null, addresses[0].address, addresses[0].family);
            }
          }, incoming => {
            incoming.on('error', reject);
            resolve(incoming);
          });
          upstreamRequest.on('error', reject);
          upstreamRequest.end();
        });
        clearTimeout(headersTimer);
        headersTimer = null;
        scope.signal.throwIfAborted();

        const status = upstreamResponse.statusCode;
        if (redirects.has(status) && upstreamResponse.headers.location) {
          if (hop === 5) throw new Error('Media redirect limit reached');
          const next = new URL(upstreamResponse.headers.location, target);
          if (next.origin !== target.origin) { delete headers.cookie; delete headers.authorization; }
          destroyUpstream();
          upstreamRequest = upstreamResponse = null;
          target = next;
          continue;
        }

        if (status !== 200 && status !== 206) {
          if (status === 416 && upstreamResponse.headers['content-range']) {
            res.setHeader('Content-Range', upstreamResponse.headers['content-range']);
          }
          destroyUpstream();
          sendError(req, res, status >= 400 && status <= 599 ? status : 502, 'Media upstream is unavailable.');
          return;
        }
        const contentType = String(upstreamResponse.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (contentType && !mp4ContentTypes.has(contentType)) {
          destroyUpstream();
          sendError(req, res, 502, 'Media upstream did not return a video file.');
          return;
        }
        res.statusCode = status;
        for (const name of fileHeaders) {
          if (upstreamResponse.headers[name] != null) res.setHeader(name, upstreamResponse.headers[name]);
        }
        res.setHeader('Content-Type', 'video/mp4');
        if (req.method === 'HEAD') { destroyUpstream(); res.end(); return; }

        upstreamResponse.setTimeout(idleTimeout, timeout);
        await pipeline(upstreamResponse, res, { signal: scope.signal });
        return;
      }
    } catch (_) {
      destroyUpstream();
      if (!scope.signal.aborted || timedOut) {
        sendError(req, res, timedOut ? 504 : 502, timedOut ? 'Media upstream timed out.' : 'Media proxy request failed.');
      }
    } finally {
      clearTimeout(headersTimer);
      req.removeListener('aborted', abort);
      res.removeListener('close', clientClosed);
      destroyUpstream();
    }
  };
}

module.exports = { createMediaFileProxy };
