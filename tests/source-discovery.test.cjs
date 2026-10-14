'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const scraper = source.slice(source.indexOf('// ===== StreamProvider-main local media scrapers ====='), source.indexOf('// ===== Filmu m3u8 scraper:'));
const providerWarningHeaders = require('./fixtures/provider-warning-response.json');

function fixture() {
  let now = 0, serial = 0;
  const timers = new Map();
  const sandbox = {
    AbortController, URL, console, process: { env: {} },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    NUVIO_ENABLED: false,
    STREAMPROVIDER_ENABLED: true, STREAMPROVIDER_ORDER: ['hexa', 'cinezo'],
    STREAMPROVIDER_NAV_TIMEOUT_MS: 10, STREAMPROVIDER_STREAM_TIMEOUT_MS: 10,
    STREAMPROVIDER_ROUTE_TIMEOUT_MS: 30, STREAMPROVIDER_PROVIDER_TIMEOUT_MS: 20,
    STREAMPROVIDER_HEDGE_DELAY_MS: 5, STREAMPROVIDER_MAX_CONCURRENT: 2,
    STREAMPROVIDER_SFLIX_BASE_URL: 'https://search.example',
    apiClean: value => String(value || '').trim(), apiResolveTmdbIdForApi: async () => '101',
    apiIsYouTubeUrl: () => false, apiLooksDefinitelyNonMediaUrl: () => false,
    apiIsM3u8Url: value => /\.m3u8(?:[?#]|$)/i.test(value),
    apiIsAllowedMediaExtensionUrl: value => /\.(?:mp4|m3u8|mpd|mkv)(?:[?#]|$)/i.test(value),
    apiHasEmbeddableFileExtensionOrHlsProxy: (value, node) => node.forceHls || /\.(?:mp4|m3u8|mpd|mkv)(?:[?#]|$)/i.test(value),
    apiStreamFormatForUrl: value => /\.mp4/.test(value) ? 'mp4' : /\.mpd/.test(value) ? 'mpd' : 'm3u8',
    apiExtractMediaUrlsFromStringDeep: text => text.match(/https?:\/\/[^\s"<>]+\.(?:m3u8|mp4)(?:\?[^\s"<>]*)?/g) || [],
    apiFindPlayableFromPayload: async ({ payload }) => ({ status: 'ok', playbackUrl: payload.sources[0].url, streamType: payload.sources[0].format }),
    createBrowserRuntime: () => ({ getBrowser() { throw new Error('unexpected browser startup'); }, getStatus: () => ({ status: 'idle' }) }),
    runProviderRace: require('../lib/provider-race').runProviderRace,
    ...(fs.existsSync(path.join(root, 'lib/provider-capture.js')) ? { captureProviderMedia: require('../lib/provider-capture') .captureProviderMedia } : {})
  };
  vm.runInNewContext(scraper + `\nglobalThis.api = {
    capture: localStreamProviderCaptureMedia, streams: localStreamProviderGetStreams, result: localStreamProviderResult,
    setBrowser(fn) {localStreamProviderBrowser = fn;}, setCapture(fn) {localStreamProviderCaptureMedia = fn;}
  };`, sandbox);
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  }
  return { ...sandbox.api, advance, timers, now: () => now };
}

function network(f, { navigate, childFrame, domSources = [] } = {}) {
  const handlers = new Map(), contextHandlers = new Map();
  let closes = 0, clicks = 0;
  const page = {
    route: async () => {}, on: (name, fn) => handlers.set(name, fn), off: (name) => handlers.delete(name),
    url: () => 'https://provider.example/watch',
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
    mouse: { click: async () => {} }, waitForTimeout: async ms => f.advance(ms),
    content: async () => '', evaluate: async fn => fn.toString().includes('navigator.userAgent') ? 'Actual Chromium UA' : domSources,
    frames: () => childFrame ? [page, childFrame] : [page],
    goto: async () => { if (navigate) await navigate(emit); return null; }
  };
  const context = {
    newPage: async () => page, close: async () => { closes += 1; },
    on: (name, fn) => contextHandlers.set(name, fn), off: (name) => contextHandlers.delete(name),
    request: { get: async url => response(url, 200, 'application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\npart.ts') }
  };
  async function emit(name, event) { await (contextHandlers.get(name) || handlers.get(name))?.(event); }
  f.setBrowser(async () => ({ newContext: async () => context }));
  return { page, context, emit, counts: () => ({ closes, clicks }) };
}
function response(url, status = 200, contentType = 'video/mp4', text = '', requestHeaders = {}) {
  return {
    url: () => url, status: () => status, headers: () => ({ 'content-type': contentType }), text: async () => text,
    request: () => ({ headers: () => requestHeaders, allHeaders: async () => requestHeaders }), dispose: async () => {}
  };
}

function lazyPlayerFrame(markup, play) {
  const dom = new JSDOM(markup);
  dom.window.document.querySelector('[data-start]').addEventListener('click', play);
  return {
    url: () => 'https://embed.example/player', evaluate: async () => [], content: async () => markup,
    locator(selector) {
      const element = dom.window.document.querySelector(selector);
      return { first: () => ({
        count: async () => Number(Boolean(element)),
        click: async () => element?.click()
      }) };
    },
    close: () => dom.window.close()
  };
}
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('a provider protection MP4 cannot win before the selected episode playlist', async () => {
  const f = fixture();
  const warning = response('https://media.example/protected-content', 200, 'video/mp4');
  warning.headers = () => providerWarningHeaders;
  const n = network(f, { navigate: async emit => {
    await emit('response', warning);
    await emit('response', response('https://media.example/episode.m3u8', 200, 'application/x-mpegurl',
      '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nepisode.ts'));
  } });
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/episode.m3u8');
  assert.equal(result.source.format, 'm3u8');
});

test('a protection clip alone reports an upstream block instead of a playable episode', async () => {
  const f = fixture();
  const warning = response('https://media.example/protected-content', 200, 'video/mp4');
  warning.headers = () => providerWarningHeaders;
  const n = network(f, { navigate: emit => emit('response', warning) });
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'provider_blocked');
  assert.equal(n.counts().closes, 1);
});

test('legitimate small MP4 responses remain playable with a different entity identity', async () => {
  const f = fixture();
  const movie = response('https://media.example/short-film', 200, 'video/mp4');
  movie.headers = () => ({ ...providerWarningHeaders, etag: '"legitimate-short-film"' });
  const n = network(f, { navigate: emit => emit('response', movie) });
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/short-film');
  assert.equal(result.source.format, 'mp4');
});

test('retrieves a playlist that loads only after clicking a player surface', async t => {
  for (const markup of [
    '<div id="player" data-start></div>',
    '<div class="play" data-start></div>',
    '<div role="button" aria-label="Play movie" data-start></div>',
    '<video data-start></video>'
  ]) {
    const f = fixture(); let n;
    const frame = lazyPlayerFrame(markup, () => {
      void n.emit('response', response('https://media.example/movie.m3u8?sig=SIGNED', 200,
        'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
    });
    t.after(frame.close);
    n = network(f, { childFrame: frame });
    const result = await f.capture({ provider: 'hexa', url: n.page.url() });
    assert.equal(result.ok, true, 'the lazy player must be activated: ' + markup);
    assert.equal(result.source.url, 'https://media.example/movie.m3u8?sig=SIGNED');
    assert.equal(result.source.mediaVerified, true);
    assert.equal(result.diagnostics.playActions, 1);
    assert.equal(n.counts().closes, 1);
  }
});

test('a real play control is preferred over an inert video earlier in the document', async t => {
  const f = fixture(); let n;
  const frame = lazyPlayerFrame('<video></video><button aria-label="Play movie" data-start></button>', () => {
    void n.emit('response', response('https://media.example/movie.m3u8', 200,
      'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
  });
  t.after(frame.close);
  n = network(f, { childFrame: frame });
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/movie.m3u8');
});

test('a play-labeled wrapper cannot shadow the actual play button inside it', async t => {
  const f = fixture(); let n;
  const frame = lazyPlayerFrame('<div class="play"><button aria-label="Play movie" data-start></button></div>', () => {
    void n.emit('response', response('https://media.example/movie.m3u8', 200,
      'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
  });
  t.after(frame.close);
  n = network(f, { childFrame: frame });
  assert.equal((await f.capture({ provider: 'cinezo', url: n.page.url() })).ok, true);
});

test('verifies a playlist after a browser CORS failure using its original request headers', async () => {
  const f = fixture(), url = 'https://media.example/movie.m3u8?token=SIGNED';
  const headers = { referer: 'https://embed.example/player', origin: 'https://embed.example', authorization: 'Bearer SESSION' };
  const n = network(f, { navigate: emit => emit('requestfailed', {
    url: () => url, failure: () => ({ errorText: 'net::ERR_FAILED' }),
    headers: () => headers, allHeaders: async () => headers
  }) });
  n.context.request.get = async (target, options) => {
    assert.equal(target, url);
    assert.equal(options.headers.referer, headers.referer);
    assert.equal(options.headers.authorization, headers.authorization);
    return response(url, 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8');
  };
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.mediaVerified, true);
  assert.equal(result.source.url, url);
  assert.equal(result.source.headers.origin, headers.origin);
});

test('an inaccessible failed browser request remains rejected after server verification', async () => {
  const f = fixture();
  const n = network(f, { navigate: emit => emit('requestfailed', {
    url: () => 'https://media.example/expired.m3u8', failure: () => ({ errorText: 'net::ERR_FAILED' }), headers: () => ({})
  }) });
  n.context.request.get = async url => response(url, 403, 'text/html', '<html>Forbidden</html>');
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'provider_blocked');
});

test('a visible verification gate stops provider work without clicking the challenge', async () => {
  const f = fixture(); let clicks = 0;
  const dom = new JSDOM('<body><div>Verification Required</div><p>Please complete the verification to continue watching.</p><button>Verify you\'re human</button></body>');
  Object.defineProperty(dom.window.document.body, 'innerText', { get: () => dom.window.document.body.textContent });
  const n = network(f);
  n.page.evaluate = async fn => fn.toString().includes('navigator.userAgent') ? 'Actual Chromium UA'
    : vm.runInNewContext('(' + fn.toString() + ')()', { document: dom.window.document });
  n.page.locator = () => ({ first: () => ({ count: async () => 1, click: async () => { clicks++; } }) });
  try {
    const result = await f.capture({ provider: 'hexa', url: n.page.url() });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'provider_blocked');
    assert.equal(clicks, 0);
    assert.equal(f.timers.size, 0);
  } finally { dom.window.close(); }
});

test('a verification gate in the actual main Frame ends capture before its timeout', async t => {
  const f = fixture(); let clicks = 0;
  const dom = new JSDOM('<body><p>Verify you are human</p></body>');
  Object.defineProperty(dom.window.document.body, 'innerText', { get: () => dom.window.document.body.textContent });
  t.after(() => dom.window.close());
  const main = { url: () => 'https://provider.example/watch', content: async () => '',
    evaluate: async fn => vm.runInNewContext('(' + fn.toString() + ')()', { document: dom.window.document }),
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => { clicks++; } }) })
  };
  const n = network(f);
  n.page.mainFrame = () => main;
  n.page.frames = () => [main];
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.code, 'provider_blocked');
  assert.equal(f.now(), 0, 'a main-frame gate must release its slot immediately');
  assert.equal(clicks, 0);
});

test('an unrelated child-frame challenge cannot discard a playable sibling frame', async t => {
  const f = fixture(); let n;
  const dom = new JSDOM('<body><p>Verify you are human</p></body>');
  Object.defineProperty(dom.window.document.body, 'innerText', { get: () => dom.window.document.body.textContent });
  t.after(() => dom.window.close());
  const gated = { url: () => 'https://ad.example/challenge',
    evaluate: async fn => vm.runInNewContext('(' + fn.toString() + ')()', { document: dom.window.document }),
    content: async () => '', locator: () => { throw new Error('a challenge must never be clicked'); }
  };
  const player = lazyPlayerFrame('<button aria-label="Play movie" data-start></button>', () => {
    void n.emit('response', response('https://media.example/movie.m3u8', 200,
      'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
  });
  t.after(player.close);
  n = network(f);
  n.page.frames = () => [n.page, gated, player];
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/movie.m3u8');
});

test('capture skips decorative assets while preserving player styles, scripts and media', async () => {
  const f = fixture(), outcomes = {};
  let routeHandler;
  const n = network(f, { navigate: async emit => {
    for (const type of ['image', 'font', 'stylesheet', 'script', 'xhr', 'media']) {
      if (routeHandler) await routeHandler({
        request: () => ({ resourceType: () => type }),
        abort: async () => { outcomes[type] = 'abort'; },
        continue: async () => { outcomes[type] = 'continue'; }
      });
    }
    await emit('response', response('https://media.example/movie.m3u8', 200,
      'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
  } });
  n.page.route = async (_pattern, handler) => { routeHandler = handler; };
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.deepEqual(outcomes, { image: 'abort', font: 'abort', stylesheet: 'continue', script: 'continue', xhr: 'continue', media: 'continue' });
});

test('failed-request verification removes session headers on a cross-origin redirect', async () => {
  const f = fixture(), url = 'https://media.example/movie.m3u8', requests = [];
  const n = network(f, { navigate: emit => emit('requestfailed', {
    url: () => url, failure: () => ({ errorText: 'net::ERR_FAILED' }),
    headers: () => ({ referer: 'https://embed.example/player', cookie: 'session=PRIVATE', authorization: 'Bearer PRIVATE' })
  }) });
  n.context.request.get = async (target, options) => {
    requests.push({ target, headers: { ...options.headers }, maxRedirects: options.maxRedirects });
    if (target === url) return { ...response(url, 302), headers: () => ({ location: 'https://other.example/movie.m3u8' }) };
    return response(target, 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8');
  };
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(requests[0].headers.authorization, 'Bearer PRIVATE');
  assert.equal(requests[0].maxRedirects, 0);
  assert.equal(requests[1].headers.cookie, undefined);
  assert.equal(requests[1].headers.authorization, undefined);
  assert.equal(result.source.headers.authorization, undefined);
});

test('same-origin verification redirects use refreshed cookies from the shared request context', async t => {
  const cookies = [];
  const server = http.createServer((req, res) => {
    cookies.push(req.headers.cookie);
    if (req.url === '/movie.m3u8') {
      res.writeHead(302, { Location: '/manifest.m3u8', 'Set-Cookie': 'session=NEW; Path=/' });
      res.end();
    } else if (req.headers.cookie === 'session=NEW') {
      res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
      res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8');
    } else {
      res.writeHead(403, { 'Content-Type': 'text/html' }); res.end('Forbidden');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const api = await require('playwright-core').request.newContext();
  t.after(() => api.dispose());
  const f = fixture(), url = 'http://127.0.0.1:' + server.address().port + '/movie.m3u8';
  const n = network(f, { navigate: emit => emit('requestfailed', {
    url: () => url, failure: () => ({ errorText: 'net::ERR_FAILED' }), headers: () => ({ cookie: 'session=OLD' })
  }) });
  n.context.request = api;
  n.context.cookies = async () => (await api.storageState()).cookies;
  n.page.waitForTimeout = ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 20)));
  const result = await require('../lib/provider-capture').captureProviderMedia({
    getBrowser: async () => ({ newContext: async () => n.context }), provider: 'cinezo', url,
    navigationTimeoutMs: 2000, streamTimeoutMs: 2000
  });
  assert.equal(result.ok, true);
  assert.deepEqual(cookies, ['session=OLD', 'session=NEW']);
  assert.equal(result.source.headers.cookie, 'session=NEW');
});

test('actual failed-request headers can recover a URL first probed from a JSON source record', async () => {
  const f = fixture(), url = 'https://media.example/movie.m3u8';
  const requests = [];
  const failed = { url: () => url, failure: () => ({ errorText: 'net::ERR_FAILED' }),
    headers: () => ({ referer: 'https://embed.example/player', authorization: 'Bearer SESSION' }) };
  const n = network(f, { navigate: async emit => {
    await emit('response', response('https://provider.example/config', 200, 'application/json', JSON.stringify({ sources: [{ url }] })));
    await flush();
    await emit('requestfailed', failed);
    await emit('requestfailed', failed);
  } });
  n.context.request.get = async (target, options) => {
    requests.push(options.headers.authorization || '');
    return options.headers.authorization === 'Bearer SESSION'
      ? response(target, 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8')
      : response(target, 403, 'text/html', 'Forbidden');
  };
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.deepEqual(requests, ['', 'Bearer SESSION']);
});

test('a provider timeout reports its last capture phase without exposing source data', async t => {
  const f = fixture(), logged = [], original = console.info;
  console.info = (...args) => logged.push(args);
  t.after(() => { console.info = original; });
  const n = network(f, { navigate: emit => emit('response', response('https://provider.example/config?token=PRIVATE_TOKEN', 200, 'application/json', '{}')) });
  n.page.waitForTimeout = ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 20)));
  const result = await require('../lib/provider-race').runProviderRace({
    jobs: [{ provider: 'hexa', timeoutMs: 30 }], timeoutMs: 500,
    run: (_job, { signal }) => require('../lib/provider-capture').captureProviderMedia({
      getBrowser: async () => ({ newContext: async () => n.context }), provider: 'hexa',
      url: n.page.url(), signal, navigationTimeoutMs: 1000, streamTimeoutMs: 1000
    })
  });
  assert.equal(result.results[0].code, 'provider_timeout');
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1].responses, 1);
  assert.equal(logged[0][1].stage, 'waiting');
  assert.doesNotMatch(JSON.stringify(logged), /PRIVATE_TOKEN|https:\/\/|authorization|cookie/i);
});

test('provider timeouts also report browser startup, context creation and cleanup stalls', async t => {
  const original = console.info, logged = [];
  console.info = (...args) => logged.push(args);
  t.after(() => { console.info = original; });
  for (const stage of ['browser', 'context', 'closing']) {
    const f = fixture(), controller = new AbortController(), gate = deferred();
    const n = network(f, { navigate: emit => emit('response', response('https://media.example/movie.m3u8', 200,
      'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8')) });
    if (stage === 'closing') n.context.close = () => gate.promise;
    const getBrowser = stage === 'browser' ? () => gate.promise
      : async () => ({ newContext: () => stage === 'context' ? gate.promise : Promise.resolve(n.context) });
    const pending = require('../lib/provider-capture').captureProviderMedia({ getBrowser, provider: 'cinezo',
      url: n.page.url(), signal: controller.signal }).catch(error => error);
    await flush();
    const reason = Object.assign(new Error('timeout'), { code: 'provider_timeout' });
    controller.abort(reason);
    await flush();
    const diagnostic = logged.at(-1)?.[1];
    gate.resolve(stage === 'browser' ? { newContext: async () => n.context } : stage === 'context' ? n.context : undefined);
    assert.equal(await pending, reason);
    assert.equal(diagnostic?.stage, stage);
  }
});

test('a stuck frame cannot prevent discovery of a later playable iframe', async t => {
  const f = fixture(), read = deferred();
  const n = network(f);
  let attached = false, reads = 0;
  const stalled = { url: () => 'https://provider.example/watch', evaluate: () => { reads++; return read.promise; }, content: async () => '' };
  const player = { url: () => 'https://embed.example/player',
    evaluate: async () => [{ url: 'https://media.example/movie.m3u8', type: 'hls' }], content: async () => ''
  };
  n.page.mainFrame = () => stalled;
  n.page.frames = () => attached ? [stalled, player] : [stalled];
  n.page.waitForTimeout = ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 20)));
  n.context.close = async () => read.resolve([]);
  const attachment = setTimeout(() => { attached = true; }, 20);
  t.after(() => { clearTimeout(attachment); read.resolve([]); });
  const result = await require('../lib/provider-race').runProviderRace({
    jobs: [{ provider: 'cinezo', timeoutMs: 1000 }], timeoutMs: 1500,
    run: (_job, { signal }) => require('../lib/provider-capture').captureProviderMedia({
      getBrowser: async () => ({ newContext: async () => n.context }), provider: 'cinezo', url: n.page.url(),
      signal, navigationTimeoutMs: 1000, streamTimeoutMs: 1000
    })
  });
  assert.equal(result.winner?.source.url, 'https://media.example/movie.m3u8');
  assert.equal(reads, 1, 'pending frame reads must stay deduplicated');
});

test('a verified response returns before unrelated navigation finishes', async () => {
  const f = fixture(), navigation = deferred();
  const n = network(f, { navigate: async emit => {
    await emit('response', response('https://media.example/master.m3u8', 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
    await navigation.promise;
  } });
  let settled = false;
  const pending = f.capture({ provider: 'hexa', url: n.page.url() }).then(result => { settled = true; return result; });
  await flush();
  const returnedBeforeNavigation = settled;
  navigation.resolve();
  const result = await pending;
  assert.equal(returnedBeforeNavigation, true, 'confirmed media must not wait for domcontentloaded');
  assert.equal(result.source.url, 'https://media.example/master.m3u8');
  assert.equal(n.counts().closes, 1);
});

test('a verified network response interrupts an unfinished frame inspection', async () => {
  const f = fixture(), frameRead = deferred();
  const frame = { url: () => 'https://embed.example/player', evaluate: () => frameRead.promise, content: async () => '' };
  const n = network(f, { childFrame: frame });
  let settled = false;
  const pending = f.capture({ provider: 'cinezo', url: n.page.url() }).then(result => { settled = true; return result; });
  await flush();
  await n.emit('response', response('https://media.example/movie.mp4'));
  await flush();
  const returnedBeforeFrame = settled;
  frameRead.resolve([]);
  const result = await pending;
  assert.equal(returnedBeforeFrame, true, 'confirmed media must interrupt an unrelated frame read');
  assert.equal(result.source.format, 'mp4');
  assert.equal(n.counts().closes, 1);
});

test('a native playlist is verified while another frame is still loading', async () => {
  const f = fixture(), frameRead = deferred();
  const frame = { url: () => 'https://embed.example/player', evaluate: () => frameRead.promise, content: async () => '' };
  const n = network(f, { childFrame: frame, domSources: [{ url: 'https://media.example/playlist', type: 'hls' }] });
  let settled = false;
  const pending = f.capture({ provider: 'hexa', url: n.page.url() }).then(result => { settled = true; return result; });
  await flush();
  const returnedBeforeFrame = settled;
  frameRead.resolve([]);
  const result = await pending;
  assert.equal(returnedBeforeFrame, true, 'a usable DOM source must be verified before slower frames finish');
  assert.equal(result.source.mediaVerified, true);
});

test('a slow candidate cannot hold up a second verified playlist', async () => {
  const f = fixture(), firstRequest = deferred(), requests = [];
  const n = network(f, { domSources: [
    { url: 'https://media.example/slow.m3u8', type: 'hls' },
    { url: 'https://media.example/ready.m3u8', type: 'hls' }
  ] });
  n.context.request.get = async url => {
    requests.push(url);
    return url.includes('slow') ? firstRequest.promise : response(url, 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8');
  };
  n.context.request.dispose = async () => firstRequest.reject(new Error('request disposed'));
  let settled = false;
  const pending = f.capture({ provider: 'hexa', url: n.page.url() }).then(result => { settled = true; return result; });
  await flush();
  const returnedBeforeFirstRequest = settled;
  firstRequest.resolve(response('https://media.example/slow.m3u8', 403, 'text/html', 'Forbidden'));
  const result = await pending;
  assert.equal(returnedBeforeFirstRequest, true, 'verification must permit a bounded second candidate');
  assert.equal(result.source.url, 'https://media.example/ready.m3u8');
  assert.equal(requests.length, 2);
});

test('cancellation interrupts navigation and awaits the own-context close', async () => {
  const f = fixture(), controller = new AbortController(), navigation = deferred(), closing = deferred();
  const n = network(f, { navigate: () => navigation.promise });
  let closes = 0, settled = false;
  n.context.close = () => { closes++; return closing.promise; };
  const pending = f.capture({ provider: 'hexa', url: n.page.url(), signal: controller.signal }).catch(error => { settled = true; return error; });
  await flush();
  const reason = new Error('cancelled');
  controller.abort(reason);
  await flush();
  assert.equal(closes, 1);
  assert.equal(settled, false, 'cancellation must await resource cleanup');
  closing.resolve();
  await flush();
  const returnedBeforeNavigation = settled;
  navigation.reject(reason);
  assert.equal(await pending, reason);
  assert.equal(returnedBeforeNavigation, true, 'a cancelled capture must not await unrelated navigation after its context is closed');
});

test('an observed winning response is not fetched again for API verification', async () => {
  const f = fixture(), url = 'https://media.example/master.m3u8';
  const n = network(f, { domSources: [{ url, type: 'hls' }], navigate: emit => emit('response', response(url, 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8')) });
  let requests = 0;
  n.context.request.get = async () => { requests++; throw new Error('duplicate verification'); };
  assert.equal((await f.capture({ provider: 'hexa', url: n.page.url() })).ok, true);
  assert.equal(requests, 0);
});

test('successful extensionless HLS response is found and retains its signed query', async () => {
  const f = fixture(), url = 'https://media.example/playlist?token=keep-this';
  const n = network(f, { navigate: emit => emit('response', response(url, 200, 'application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\npart.ts')) });
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, url);
  assert.equal(result.source.forceHls, true);
  assert.equal(n.counts().closes, 1);
});

test('a failed manifest request cannot win over a later successful video response', async () => {
  const f = fixture();
  const n = network(f, { navigate: async emit => {
    await emit('request', { url: () => 'https://media.example/expired.m3u8', headers: () => ({}) });
    await emit('response', response('https://media.example/expired.m3u8', 403, 'text/html', '<html>Forbidden</html>'));
    await emit('response', response('https://media.example/movie.mp4'));
  } });
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.source.url, 'https://media.example/movie.mp4');
  assert.equal(result.source.forceHls, false);
});

test('a partial navigation timeout does not discard a successful captured response', async () => {
  const f = fixture();
  const n = network(f, { navigate: async emit => {
    await emit('response', response('https://media.example/movie.mp4'));
    const error = new Error('navigation timeout'); error.name = 'TimeoutError'; throw error;
  } });
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/movie.mp4');
});

test('the getter activates the play control inside a child iframe', async () => {
  const f = fixture();
  let clickCount = 0, n;
  const frame = {
    url: () => 'https://embed.example/player', content: async () => '', evaluate: async () => [],
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => { clickCount++; await n.emit('response', response('https://media.example/movie.m3u8', 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8')); } }) })
  };
  n = network(f, { childFrame: frame });
  const result = await f.capture({ provider: 'cinezo', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(clickCount, 1);
});

test('native video currentSrc is inspected and verified before being returned', async () => {
  const f = fixture();
  const n = network(f, { domSources: [{ url: 'https://media.example/live-playlist', type: 'application/x-mpegurl' }] });
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/live-playlist');
});

test('the next provider gets a turn after the first provider consumes its own budget', async () => {
  const f = fixture(), controller = new AbortController(), calls = [];
  f.setCapture(({ provider, signal }) => {
    calls.push(provider);
    if (provider === 'cinezo') return Promise.resolve({ ok: true, source: { url: 'https://media.example/movie.mp4', format: 'mp4' } });
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const pending = f.result({ id: '101', signal: controller.signal }).catch(error => error);
  await flush(); f.advance(15); await flush();
  const startedSecond = calls.includes('cinezo');
  controller.abort(new Error('test cleanup'));
  await pending;
  assert.equal(startedSecond, true);
  assert.equal(f.timers.size, 0);
});

test('provider handoff accepts verified HLS endpoints without a file suffix', async () => {
  const f = fixture();
  f.setCapture(async () => ({ ok: true, source: { url: 'https://media.example/playlist', format: 'm3u8', forceHls: true, mediaVerified: true } }));
  const result = await f.streams({ tmdbId: '101' });
  assert.equal(result.success, true);
  assert.equal(result.sources[0].url, 'https://media.example/playlist');
});

test('typed extensionless playlists delivered as octet-stream are verified by their body', async () => {
  const f = fixture(), url = 'https://media.example/get?id=1';
  const n = network(f, { domSources: [{ url, type: 'hls' }] });
  n.context.request.get = async () => response(url, 200, 'application/octet-stream', '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\npart.ts');
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.forceHls, true);
});

test('API verification preserves the session cookie and browser user agent for the HLS proxy', async () => {
  const f = fixture(), url = 'https://media.example/get?id=1';
  const n = network(f, { domSources: [{ url, type: 'hls' }] });
  n.context.cookies = async urls => { assert.equal(urls, url); return [{ name: 'session', value: 'PRIVATE' }]; };
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(result.source.headers.cookie, 'session=PRIVATE');
  assert.equal(result.source.headers['user-agent'], 'Actual Chromium UA');
});

test('unfinished script bodies cannot prevent a successful playlist response from being inspected', async () => {
  const f = fixture();
  const n = network(f, { navigate: async emit => {
    for (let i = 0; i < 32; i++) {
      const stuck = response('https://provider.example/script' + i + '.js', 200, 'text/javascript');
      stuck.text = () => new Promise(() => {});
      void emit('response', stuck);
    }
    await emit('response', response('https://media.example/master.m3u8', 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
  } });
  assert.equal((await f.capture({ provider: 'hexa', url: n.page.url() })).ok, true);
});

test('generic text and XML playlist responses also retain priority while scripts are pending', async () => {
  for (const [contentType, body, format] of [['text/plain', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8', 'm3u8'], ['application/xml', '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period/></MPD>', 'mpd']]) {
    const f = fixture();
    const n = network(f, { navigate: async emit => {
      for (let i = 0; i < 24; i++) {
        const stuck = response('https://provider.example/script' + i + '.js', 200, 'text/javascript');
        stuck.text = () => new Promise(() => {}); void emit('response', stuck);
      }
      await emit('response', response('https://media.example/playlist', 200, contentType, body));
    } });
    const result = await f.capture({ provider: 'hexa', url: n.page.url() });
    assert.equal(result.ok, true); assert.equal(result.source.format, format);
  }
});

test('a transient failed play click can succeed during the next inspection', async () => {
  const f = fixture(); let clicks = 0, n;
  const frame = {
    url: () => 'https://embed.example/player', content: async () => '', evaluate: async () => [],
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => {
      if (++clicks === 1) throw new Error('temporary overlay');
      await n.emit('response', response('https://media.example/master.m3u8', 200, 'application/x-mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8'));
    } }) })
  };
  n = network(f, { childFrame: frame });
  // Give polling another turn while keeping the fake clock within its budget.
  n.page.waitForTimeout = async () => f.advance(1);
  const result = await f.capture({ provider: 'hexa', url: n.page.url() });
  assert.equal(result.ok, true);
  assert.equal(clicks, 2);
});

test('cancellation disposes an active API verification request before releasing its context', async () => {
  const f = fixture(), controller = new AbortController();
  const n = network(f, { domSources: [{ url: 'https://media.example/playlist', type: 'hls' }] });
  let rejectRequest, disposed = 0;
  n.context.request.get = () => new Promise((_, reject) => { rejectRequest = reject; });
  n.context.request.dispose = async () => { disposed++; rejectRequest?.(new Error('request disposed')); };
  const pending = f.capture({ provider: 'hexa', url: n.page.url(), signal: controller.signal }).catch(error => error);
  await flush();
  assert.equal(typeof rejectRequest, 'function');
  const reason = new Error('cancelled'); controller.abort(reason); await flush();
  const disposedOnAbort = disposed;
  rejectRequest(new Error('test cleanup')); await pending;
  assert.equal(disposedOnAbort, 1);
  assert.equal(n.counts().closes, 1);
});
