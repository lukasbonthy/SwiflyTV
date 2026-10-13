'use strict';

const { classifyMediaCandidate, extractMediaCandidates } = require('./media-discovery');
const MAX_TEXT = 1024 * 1024;
const PLAY_CONTROLS = "button[aria-label*='play' i], button[title*='play' i], .vjs-big-play-button, .jw-icon-playback, .plyr__control--overlaid, .play-button, button.play";

/** Observe real responses across the context; DOM/JSON URLs must be verified. */
async function captureProviderMedia({
  getBrowser, provider = '', url = '', referer = '', signal = null,
  navigationTimeoutMs = 10000, streamTimeoutMs = 15000,
  isNonMediaUrl = () => false, extractUrls = () => [],
  makeHeaders = (_url, headers) => headers, now = Date.now
}) {
  signal?.throwIfAborted();
  let context, page, closing, winner = null, accepting = true, blocked = false, browserUserAgent = '', endAt = Infinity;
  const pending = new Set(), candidates = new Map(), verified = new Set(), seen = new Set(), listeners = [];
  const verifications = new Set();
  let wake;
  const stopped = new Promise(resolve => { wake = resolve; });
  // Slow navigation/DOM calls belong to this context and are cancelled by its
  // close. They must not hold a verified response or cancellation hostage.
  const untilStopped = task => Promise.race([task, stopped]);
  const diagnostics = { responses: 0, rejectedResponses: 0, candidates: 0, frames: 0, playActions: 0, navigationTimedOut: false };
  const closeContext = () => {
    if (!context) return Promise.resolve();
    if (!closing) closing = Promise.resolve().then(async () => {
      // BrowserContext.close alone need not cancel APIRequestContext verification.
      try { await context.request?.dispose?.(); } catch {}
      await context.close();
    }).catch(() => {});
    return closing;
  };
  const onAbort = () => { accepting = false; wake(); void closeContext(); };
  const active = () => accepting && !signal?.aborted;
  function note(value) { if (typeof value === 'string' && seen.size < 160) seen.add(value); }
  function queue(candidate, baseUrl) {
    if (!active() || !candidate || candidates.size >= 24 || verified.has(candidate.url)) return;
    note(candidate.url);
    candidates.set(candidate.url, { ...candidate, referer: baseUrl });
    diagnostics.candidates = candidates.size;
    verifyCandidates();
  }
  function queuePayload(payload, baseUrl) {
    for (const candidate of extractMediaCandidates(payload, { baseUrl, isNonMediaUrl })) queue(candidate, baseUrl);
  }
  function queueText(text, baseUrl) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return;
    try { queuePayload(JSON.parse(text), baseUrl); } catch {}
    for (const raw of extractUrls(text.replace(/\\\//g, '/').replace(/&amp;/g, '&')).slice(0, 24)) {
      queue(classifyMediaCandidate({ url: raw, baseUrl, confirmed: true, isNonMediaUrl }), baseUrl);
    }
  }
  function choose(candidate, headers, baseUrl) {
    if (!active() || !candidate || winner) return;
    winner = { ...candidate, mediaVerified: true, headers, referer: headers.referer || headers.Referer || baseUrl };
    wake();
  }
  async function responseHeaders(response) {
    try {
      const request = response.request?.();
      return request?.allHeaders ? await request.allHeaders() : request?.headers?.() || {};
    } catch { return {}; }
  }
  async function inspectResponse(response, { requestHeaders = null, baseUrl = '', verification = false, expectedType = '' } = {}) {
    if (!active()) return;
    const responseUrl = response.url();
    const status = response.status();
    const headers = response.headers() || {}, contentType = String(headers['content-type'] || '');
    diagnostics.responses++;
    note(responseUrl);
    if (status < 200 || status >= 300) {
      diagnostics.rejectedResponses++;
      if ([401, 403, 429].includes(status) && (verification || response.request?.()?.isNavigationRequest?.() || /mpegurl|dash\+xml|video\//i.test(contentType) || /\.(m3u8|mpd)(?:[?#]|$)/i.test(responseUrl))) blocked = true;
      return;
    }
    const base = baseUrl || page?.url() || url;
    let text = '';
    const canRead = ['m3u8', 'mpd'].includes(expectedType) || /mpegurl|dash\+xml|json|javascript|html|text|xml/i.test(contentType) || /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(responseUrl);
    if (canRead && Number(headers['content-length'] || 0) <= MAX_TEXT) {
      try { text = await response.text(); } catch {}
      if (!active()) return;
      if (text.length > MAX_TEXT) text = '';
    }
    const candidate = classifyMediaCandidate({ url: responseUrl, status, contentType, ...(text ? { bodyPrefix: text } : {}), isNonMediaUrl });
    if (candidate) choose(candidate, requestHeaders || await responseHeaders(response), base);
    else if (!verification) queueText(text, responseUrl);
  }
  function listen(target, name, callback) {
    target.on(name, callback); listeners.push(() => target.off?.(name, callback));
  }
  function onResponse(response) {
    if (!active() || pending.size >= 32) return;
    const mediaResponse = /mpegurl|dash\+xml|video\/|octet-stream|text\/(?:plain|xml)\b|application\/xml\b/i.test(String(response.headers()?.['content-type'] || '')) || /\.(?:m3u8|mpd|mp4|mkv|webm)(?:[?#]|$)/i.test(response.url()) || candidates.has(response.url());
    // Keep eight slots available for media while scripts/documents finish loading.
    if (!mediaResponse && pending.size >= 24) return;
    const task = inspectResponse(response).catch(() => {}).finally(() => pending.delete(task));
    pending.add(task);
    return task;
  }
  async function verifyCandidate(candidate) {
    let response;
    try {
      const isPlaylist = candidate.forceHls || candidate.format === 'mpd';
      // HEAD verifies direct files without buffering an entire movie in Node.
      const method = isPlaylist ? 'get' : 'head';
      if (typeof context.request[method] !== 'function' || winner || !active()) return;
      const headers = makeHeaders(candidate.referer || page.url() || url, browserUserAgent ? { 'user-agent': browserUserAgent } : {});
      response = await context.request[method](candidate.url, {
        headers, timeout: Math.max(1, Math.min(5000, endAt - now())), failOnStatusCode: false, maxRedirects: 5
      });
      signal?.throwIfAborted();
      if (winner || !active()) return;
      // APIResponse has no Request accessor. Read only cookies valid for the final media URL.
      const finalUrl = response.url();
      const cookies = typeof context.cookies === 'function' ? await context.cookies(finalUrl) : [];
      const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
      await inspectResponse(response, { requestHeaders: { ...headers, ...(cookieHeader ? { cookie: cookieHeader } : {}) }, baseUrl: candidate.referer, verification: true, expectedType: candidate.format });
    } catch { signal?.throwIfAborted(); }
    finally { await Promise.resolve(response?.dispose?.()).catch(() => {}); }
  }
  function verifyCandidates() {
    if (!context?.request || !Number.isFinite(endAt)) return;
    for (const candidate of candidates.values()) {
      if (winner || !active() || now() >= endAt || verifications.size >= 2) break;
      if (verified.has(candidate.url)) continue;
      verified.add(candidate.url);
      const task = verifyCandidate(candidate).catch(() => {}).finally(() => {
        verifications.delete(task);
        verifyCandidates();
      });
      verifications.add(task);
    }
  }
  async function inspectFrames(endAt, activated, clickAttempts) {
    const frames = page.frames?.() || [page];
    diagnostics.frames = Math.max(diagnostics.frames, frames.length);
    await Promise.all(frames.slice(0, 12).map(async frame => {
      signal?.throwIfAborted();
      if (winner || !active() || now() >= endAt) return;
      const frameUrl = frame.url?.() || page.url() || url;
      try {
        const sources = await frame.evaluate(() => {
          const out = [];
          for (const video of Array.from(document.querySelectorAll('video')).slice(0, 6)) {
            if (video.currentSrc || video.src) out.push({ url: video.currentSrc || video.src, type: video.getAttribute('type') || '' });
            for (const source of Array.from(video.querySelectorAll('source')).slice(0, 8)) out.push({ src: source.src, type: source.type });
            if (video.paused) { try { video.play()?.catch(() => {}); } catch {} }
          }
          return out;
        });
        signal?.throwIfAborted();
        if (winner || !active()) return;
        queuePayload({ sources }, frameUrl);
      } catch { signal?.throwIfAborted(); }
      if (!winner && active() && !activated.has(frame) && (clickAttempts.get(frame) || 0) < 3 && typeof frame.locator === 'function') {
        try {
          const control = frame.locator(PLAY_CONTROLS).first();
          if (await control.count()) {
            if (winner || !active()) return;
            clickAttempts.set(frame, (clickAttempts.get(frame) || 0) + 1);
            await control.click({ timeout: Math.max(1, Math.min(1200, endAt - now())) });
            activated.add(frame);
            diagnostics.playActions++;
          }
        } catch { signal?.throwIfAborted(); }
      }
      if (!winner && active()) {
        try { queueText(await frame.content(), frameUrl); } catch { signal?.throwIfAborted(); }
      }
    }));
  }
  try {
    const browser = await getBrowser();
    signal?.throwIfAborted();
    context = await browser.newContext({
      javaScriptEnabled: true, viewport: { width: 1365, height: 768 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9', ...(referer ? { Referer: referer } : {}) }
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    signal?.throwIfAborted();
    page = await context.newPage();
    signal?.throwIfAborted();
    try { const value = await page.evaluate(() => navigator.userAgent); if (typeof value === 'string') browserUserAgent = value; } catch { signal?.throwIfAborted(); }
    const eventTarget = typeof context.on === 'function' ? context : page;
    listen(eventTarget, 'request', request => { if (active()) note(request.url()); });
    listen(eventTarget, 'response', onResponse);
    endAt = now() + navigationTimeoutMs + streamTimeoutMs;
    try { await untilStopped(page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs })); }
    catch (error) {
      signal?.throwIfAborted();
      if (error.name !== 'TimeoutError') throw error;
      diagnostics.navigationTimedOut = true;
    }
    signal?.throwIfAborted();
    const activated = new Set(), clickAttempts = new Map();
    while (!winner && now() < endAt) {
      signal?.throwIfAborted();
      verifyCandidates();
      await untilStopped(inspectFrames(endAt, activated, clickAttempts));
      signal?.throwIfAborted();
      if (winner) break;
      await untilStopped(page.waitForTimeout(Math.min(350, Math.max(1, endAt - now()))).catch(() => {}));
    }
    signal?.throwIfAborted();
    if (!winner) return { ok: false, provider, code: blocked ? 'provider_blocked' : 'no_source', diagnostics };
    return {
      ok: true, provider, pageUrl: page.url() || url, diagnostics,
      source: {
        name: provider, quality: 'auto', url: winner.url, format: winner.format,
        forceHls: winner.forceHls, mediaVerified: true,
        headers: makeHeaders(winner.referer || page.url() || url, winner.headers)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    return { ok: false, provider, code: error.code === 'browser_unavailable' ? error.code : 'provider_failed', diagnostics };
  } finally {
    accepting = false;
    for (const remove of listeners) remove();
    signal?.removeEventListener('abort', onAbort);
    await closeContext();
    signal?.throwIfAborted();
  }
}

module.exports = { captureProviderMedia };
