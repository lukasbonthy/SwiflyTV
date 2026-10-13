'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const scraper = source.slice(source.indexOf('// ===== StreamProvider-main local media scrapers ====='), source.indexOf('// ===== Filmu m3u8 scraper:'));

function fixture() {
  let now = 0, serial = 0;
  const timers = new Map();
  const sandbox = {
    AbortController, URL, console, process: { env: {} },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
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
  return { ...sandbox.api, advance, timers };
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
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

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
