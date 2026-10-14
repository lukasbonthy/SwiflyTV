const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const streamSource = source.slice(source.indexOf('// ===== StreamProvider-main local media scrapers ====='), source.indexOf('// ===== Filmu m3u8 scraper:'));
const apiSource = source.slice(source.indexOf('async function fetchApiProviderSource('), source.indexOf('// ===== End backend-only provider API integration ====='));
const flush = async () => { for (let turn = 0; turn < 24; turn += 1) await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observe(promise) {
  const state = { settled: false };
  state.promise = promise.then(value => { state.settled = true; return { value }; }, error => { state.settled = true; return { error }; });
  return state;
}

function clock() {
  let time = 1000, serial = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    count: () => timers.size,
    advance(ms) {
      const target = time + ms;
      for (;;) {
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

function fixture(overrides = {}) {
  const time = clock();
  const context = {
    AbortController, URL, console,
    captureProviderMedia: require('../lib/provider-capture').captureProviderMedia,
    runProviderRace: require('../lib/provider-race').runProviderRace,
    Date: class extends Date { static now() { return time.now(); } },
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    NUVIO_ENABLED: false, NUVIO_PROVIDER_ORDER: ['vidsrc','vidlink','videasy'], NUVIO_PROVIDER_TIMEOUT_MS: 10, NUVIO_TIMEOUT_MS: 15,
    STREAMPROVIDER_ENABLED: true, STREAMPROVIDER_ORDER: ['hexa', 'cinezo'],
    STREAMPROVIDER_NAV_TIMEOUT_MS: 10, STREAMPROVIDER_STREAM_TIMEOUT_MS: 10, STREAMPROVIDER_ROUTE_TIMEOUT_MS: 30, STREAMPROVIDER_PROVIDER_TIMEOUT_MS: 20,
    STREAMPROVIDER_HEDGE_DELAY_MS: 5, STREAMPROVIDER_MAX_CONCURRENT: 2,
    STREAMPROVIDER_SFLIX_BASE_URL: 'https://search.example',
    DEFAULT_PLAY_PROVIDER: 'streamprovider', API_M3U8_PROVIDER_ORDER: ['streamprovider'], API_PROVIDERS: {},
    API_DETAILS_SEARCH_FALLBACK_PROVIDERS: [], USE_EXTERNAL_PROVIDER_API: false,
    process: { env: { LOCAL_DOWNLOAD_SITES: 'false' } }, CACHE_TTL: { long: 1000 },
    apiResolveTmdbIdForApi: async () => '101', tmdb: async () => ({ title: 'Arrival', release_date: '2016-01-01' }),
    getTitle: item => item.title || '', getYear: value => String(value || '').slice(0, 4), apiClean: value => String(value || '').trim(),
    apiIsYouTubeUrl: () => false, apiLooksDefinitelyNonMediaUrl: () => false,
    apiIsM3u8Url: value => /\.m3u8(?:[?#]|$)/.test(value), apiIsAllowedMediaExtensionUrl: value => /\.(?:mp4|m3u8)(?:[?#]|$)/.test(value),
    apiHasEmbeddableFileExtensionOrHlsProxy: (value, node) => node.forceHls || /\.(?:mp4|m3u8)(?:[?#]|$)/.test(value),
    apiStreamFormatForUrl: value => /\.mp4/.test(value) ? 'mp4' : 'm3u8', apiExtractMediaUrlsFromStringDeep: () => [],
    apiFindPlayableFromPayload: async ({ payload }) => ({ status: 'ok', playbackUrl: payload.sources[0].url, streamType: payload.sources[0].format }),
    ...overrides
  };
  vm.runInNewContext(streamSource + '\n' + apiSource + `
    globalThis.api = {
      capture: localStreamProviderCaptureMedia,
      search: localStreamProviderSflixWatchUrl,
      streams: localStreamProviderGetStreams,
      result: localStreamProviderResult,
      source: fetchApiProviderSource,
      setBrowser(fn) { localStreamProviderBrowser = fn; },
      setCapture(fn) { localStreamProviderCaptureMedia = fn; },
      setSearch(fn) { localStreamProviderSflixWatchUrl = fn; },
      setStreams(fn) { localStreamProviderGetStreams = fn; },
      setResult(fn) { localStreamProviderResult = fn; }
    };`, context, { filename: 'source-provider-fixture.js' });
  return { api: context.api, time, context };
}

function navigationFixture() {
  const navigation = deferred(), handlers = new Map();
  navigation.promise.catch(() => {}); // No navigation consumes this promise if context creation is cancelled.
  let contextCloses = 0, browserCloses = 0, pageCalls = 0, navigations = 0;
  const page = {
    route: async () => {}, on(name, fn) { handlers.set(name, fn); }, url: () => 'https://provider.example/watch',
    goto() { navigations += 1; return navigation.promise; },
    locator() { return { first() { return { count: async () => 0 }; } }; },
    mouse: { click: async () => {} }, waitForTimeout: async () => {}, content: async () => '', frames: () => [],
    evaluate: async () => [], close: async () => {}
  };
  const context = {
    async newPage() { pageCalls += 1; return page; },
    async close() { contextCloses += 1; navigation.reject(new Error('context closed')); }
  };
  const browser = { newContext: async () => context, async close() { browserCloses += 1; } };
  return { browser, context, page, handlers, navigation, counts: () => ({ contextCloses, browserCloses, pageCalls, navigations }) };
}

test('an already-aborted capture starts no browser or provider work', async () => {
  const f = fixture(), controller = new AbortController(), reason = new Error('cancelled');
  let browserCalls = 0;
  f.api.setBrowser(async () => { browserCalls += 1; throw new Error('should not launch'); });
  controller.abort(reason);
  const result = await observe(f.api.capture({ provider: 'hexa', url: 'https://provider.example/watch', signal: controller.signal })).promise;
  assert.equal(result.error, reason);
  assert.equal(browserCalls, 0);
});

test('abort closes the capture context and rejects a pending navigation without closing the shared browser', async t => {
  const f = fixture(), nav = navigationFixture(), controller = new AbortController(), reason = new Error('cancelled');
  t.after(() => nav.navigation.reject(new Error('test cleanup')));
  f.api.setBrowser(async () => nav.browser);
  const result = observe(f.api.capture({ provider: 'hexa', url: 'https://provider.example/watch', signal: controller.signal }));
  await flush();
  assert.equal(nav.counts().navigations, 1);
  controller.abort(reason);
  await flush();
  assert.equal(nav.counts().contextCloses, 1);
  assert.equal(nav.counts().browserCloses, 0);
  assert.equal(result.settled, true);
  assert.equal((await result.promise).error, reason);
});

test('a context created after cancellation is closed before it can open a page', async () => {
  const f = fixture(), nav = navigationFixture(), creation = deferred(), controller = new AbortController(), reason = new Error('cancelled');
  f.api.setBrowser(async () => ({ newContext: () => creation.promise }));
  const result = observe(f.api.capture({ provider: 'hexa', url: 'https://provider.example/watch', signal: controller.signal }));
  await flush();
  controller.abort(reason);
  creation.resolve(nav.context);
  await flush();
  assert.equal(nav.counts().contextCloses, 1);
  assert.equal(nav.counts().pageCalls, 0);
  assert.equal((await result.promise).error, reason);
});

test('capture page-creation failure still closes its newly created context', async () => {
  const f = fixture();
  let closes = 0;
  f.api.setBrowser(async () => ({ newContext: async () => ({ newPage: async () => { throw new Error('page unavailable'); }, close: async () => { closes += 1; } }) }));
  const result = await observe(f.api.capture({ provider: 'hexa', url: 'https://provider.example/watch' })).promise;
  assert.equal(result.value?.ok, false);
  assert.equal(closes, 1);
});

test('cancellation during successful capture cleanup rejects the source and closes only once', async () => {
  const f = fixture(), nav = navigationFixture(), cleanup = deferred(), controller = new AbortController(), reason = new Error('cancelled');
  let closes = 0;
  nav.page.goto = async () => nav.handlers.get('response')({ url: () => 'https://media.example/movie.mp4', status: () => 200, headers: () => ({ 'content-type': 'video/mp4' }), request: () => ({ allHeaders: async () => ({}) }) });
  nav.context.close = () => { closes += 1; return cleanup.promise; };
  f.api.setBrowser(async () => nav.browser);
  const result = observe(f.api.capture({ provider: 'hexa', url: 'https://provider.example/watch', signal: controller.signal }));
  await flush();
  assert.equal(closes, 1);
  controller.abort(reason);
  cleanup.resolve();
  assert.equal((await result.promise).error, reason);
  assert.equal(closes, 1);
});

test('abort closes a Sflix search context and rethrows cancellation', async t => {
  const f = fixture(), nav = navigationFixture(), controller = new AbortController(), reason = new Error('cancelled');
  t.after(() => nav.navigation.reject(new Error('test cleanup')));
  f.api.setBrowser(async () => nav.browser);
  const result = observe(f.api.search({ tmdbId: '101', signal: controller.signal }));
  await flush();
  assert.equal(nav.counts().navigations, 1);
  controller.abort(reason);
  await flush();
  assert.equal(nav.counts().contextCloses, 1);
  assert.equal(nav.counts().browserCloses, 0);
  assert.equal((await result.promise).error, reason);
});

test('cancellation after a provider attempt prevents the next provider from starting', async () => {
  const f = fixture(), controller = new AbortController(), reason = new Error('cancelled'), calls = [];
  f.api.setCapture(async ({ provider, signal }) => { calls.push(provider); assert.equal(signal.aborted, false); controller.abort(reason); assert.equal(signal.aborted, true); return { ok: false }; });
  const result = await observe(f.api.streams({ tmdbId: '101', signal: controller.signal })).promise;
  assert.equal(result.error, reason);
  assert.deepEqual(calls, ['hexa']);
});

test('a slow preferred provider is hedged without waiting for its full timeout', async () => {
  const f = fixture(), calls = [], cleanup = deferred(); let aborted = false;
  f.api.setCapture(async ({ provider, signal }) => {
    calls.push(provider);
    if (provider === 'cinezo') return { ok: true, source: { url: 'https://media.example/master.m3u8', format: 'm3u8', mediaVerified: true } };
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    return cleanup.promise;
  });
  const result = observe(f.api.streams({ tmdbId: '101' }));
  await flush(); f.time.advance(5); await flush();
  const hedged = calls.slice(), cancelled = aborted, returnedEarly = result.settled;
  cleanup.resolve({ ok: false, code: 'no_source' }); await result.promise;
  assert.deepEqual(hedged, ['hexa', 'cinezo']);
  assert.equal(cancelled, true); assert.equal(returnedEarly, false, 'wait for losing physical cleanup');
  assert.equal((await result.promise).value?.success, true);
  assert.equal(f.time.count(), 0);
});

test('successful route discovery clears its deadline and preserves real non-HLS formats', async () => {
  const f = fixture(), controller = new AbortController();
  let signal;
  f.api.setStreams(async options => { signal = options.signal; return { sources: [{ url: 'https://media.example/movie.mp4', format: 'mp4' }] }; });
  const result = await f.api.result({ id: '101', signal: controller.signal });
  assert.equal(result.playbackUrl, 'https://media.example/movie.mp4');
  assert.equal(result.streamType, 'mp4');
  assert.equal(signal?.aborted, false);
  assert.equal(f.time.count(), 0, 'success must remove the losing route timer');
});

test('the route deadline aborts and closes its active context before rejecting', async t => {
  const f = fixture({ STREAMPROVIDER_ORDER: ['hexa'], STREAMPROVIDER_PROVIDER_TIMEOUT_MS: 100 }), nav = navigationFixture(), attempts = [];
  t.after(() => nav.navigation.reject(new Error('test cleanup')));
  f.api.setBrowser(async () => nav.browser);
  const result = observe(f.api.result({ id: '101', attempts }));
  await flush();
  assert(f.time.count() >= 2, 'route and capture deadlines are active');
  f.time.advance(30);
  await flush();
  assert.equal(nav.counts().contextCloses, 1);
  assert.equal(nav.counts().browserCloses, 0);
  assert.match((await result.promise).error?.message || '', /timed out/);
  assert.equal(nav.counts().navigations, 1, 'the second provider cannot start after cancellation');
  assert.equal(f.time.count(), 0);
});

test('the Sflix search deadline closes losing work and retains an honest no-source result', async t => {
  const f = fixture({ STREAMPROVIDER_ORDER: ['sflix'] }), nav = navigationFixture(), attempts = [];
  t.after(() => nav.navigation.reject(new Error('test cleanup')));
  f.api.setBrowser(async () => nav.browser);
  const result = observe(f.api.streams({ tmdbId: '101', attempts }));
  await flush();
  assert.equal(nav.counts().navigations, 1);
  f.time.advance(10);
  await flush();
  assert.equal(nav.counts().contextCloses, 1);
  assert.equal((await result.promise).value?.success, false);
  assert.match(attempts.join(' '), /skipped after/);
  assert.equal(f.time.count(), 0);
});

test('quick Sflix lookup releases its search deadline before media capture', async () => {
  const f = fixture({ STREAMPROVIDER_ORDER: ['sflix'] });
  f.api.setSearch(async () => 'https://provider.example/watch');
  f.api.setCapture(async () => ({ ok: true, source: { url: 'https://media.example/movie.mp4', format: 'mp4' } }));
  const result = await f.api.streams({ tmdbId: '101' });
  assert.equal(result.success, true);
  assert.equal(f.time.count(), 0);
});

test('API provider discovery rejects an already-aborted request before metadata work', async () => {
  let metadataCalls = 0;
  const f = fixture({ apiResolveTmdbIdForApi: async () => { metadataCalls += 1; return '101'; } });
  const controller = new AbortController(), reason = new Error('cancelled');
  controller.abort(reason);
  const result = await observe(f.api.source({ id: '101', signal: controller.signal })).promise;
  assert.equal(result.error, reason);
  assert.equal(metadataCalls, 0);
});

test('a direct TMDB-id source can start without waiting for title metadata', async () => {
  const metadata = deferred(); let metadataCalls = 0;
  const f = fixture({ tmdb: () => { metadataCalls++; return metadata.promise; } });
  const playable = { status: 'ok', playbackUrl: 'https://media.example/movie.mp4' };
  f.api.setResult(async () => playable);
  const pending = observe(f.api.source({ id: '101' }));
  await flush(); const returnedDirectly = pending.settled;
  metadata.resolve({ title: 'Arrival' }); await pending.promise;
  assert.equal(returnedDirectly, true);
  assert.equal(metadataCalls, 0);
});

test('cancellation during fallback metadata never starts another source adapter', async () => {
  const metadata = deferred(), controller = new AbortController(), reason = new Error('cancelled');
  const f = fixture({ tmdb: () => metadata.promise });
  let streamCalls = 0;
  f.api.setResult(async () => { streamCalls += 1; return null; });
  const result = observe(f.api.source({ id: '101', signal: controller.signal }));
  await flush();
  controller.abort(reason);
  metadata.resolve({ title: 'Arrival' });
  assert.equal((await result.promise).error, reason);
  assert.equal(streamCalls, 1);
});

test('cancellation inside StreamProvider is rethrown instead of starting download adapters', async () => {
  const controller = new AbortController(), reason = new Error('cancelled');
  let downloadCalls = 0;
  const f = fixture({ process: { env: {} }, localDownloadSitesByTitle: async () => { downloadCalls += 1; return null; } });
  f.api.setResult(async ({ signal }) => { assert.equal(signal, controller.signal); controller.abort(reason); throw reason; });
  const result = await observe(f.api.source({ id: '101', signal: controller.signal })).promise;
  assert.equal(result.error, reason);
  assert.equal(downloadCalls, 0);
});

test('normal StreamProvider failure preserves the existing download-site adapter', async () => {
  let downloadCalls = 0;
  const playable = { status: 'ok', playbackUrl: 'https://media.example/movie.mp4', streamType: 'mp4' };
  const f = fixture({ process: { env: {} }, localDownloadSitesByTitle: async () => { downloadCalls += 1; return playable; } });
  f.api.setResult(async () => { throw new Error('no local media'); });
  const result = await f.api.source({ id: '101' });
  assert.equal(result, playable);
  assert.equal(downloadCalls, 1);
});

test('cancellation during an unabortable adapter rejects its late success', async () => {
  const controller = new AbortController(), reason = new Error('cancelled');
  const f = fixture({ process: { env: {} }, localDownloadSitesByTitle: async () => { controller.abort(reason); return { status: 'ok', playbackUrl: 'https://media.example/movie.mp4' }; } });
  f.api.setResult(async () => null);
  const result = await observe(f.api.source({ id: '101', signal: controller.signal })).promise;
  assert.equal(result.error, reason);
});

test('verified Nuvio media wins without starting browser capture', async () => {
  let browsers=0;
  const f=fixture({NUVIO_ENABLED:true,resolveNuvioProvider:async ({provider,mediaType,season,episode})=>{
    assert.equal(mediaType,'tv');assert.equal(season,'2');assert.equal(episode,'3');
    return {ok:true,provider:'nuvio-'+provider,source:{url:'https://media.example/master.m3u8',format:'m3u8',forceHls:true,mediaVerified:true}};
  }});
  f.api.setCapture(async()=>{browsers++;return {ok:false};});
  const result=await f.api.streams({tmdbId:'101',mediaType:'tv',season:'2',episode:'3'});
  assert.equal(result.success,true);
  assert.equal(result.sources[0].mediaVerified,true);
  assert.equal(browsers,0);
  assert(result.providersTried[0].startsWith('nuvio-'));
});
test('Nuvio failures and unverified URLs preserve the browser fallback', async () => {
  for(const nuvioResult of [{ok:false,code:'no_source'},{ok:true,source:{url:'https://media.example/master.m3u8',format:'m3u8'}}]) {
    let browsers=0;
    const f=fixture({NUVIO_ENABLED:true,resolveNuvioProvider:async()=>nuvioResult});
    f.api.setCapture(async()=>{browsers++;return {ok:true,source:{url:'https://media.example/fallback.m3u8',format:'m3u8',forceHls:true,mediaVerified:true}};});
    const result=await f.api.streams({tmdbId:'101'});
    assert.equal(result.sources[0].url,'https://media.example/fallback.m3u8');
    assert.equal(browsers,1);
  }
});
test('TV browser fallbacks keep the selected season and episode after all Nuvio providers fail', async () => {
  const nuvioRequests = [], browserRequests = [];
  const f = fixture({ NUVIO_ENABLED: true, resolveNuvioProvider: async ({ provider, tmdbId, mediaType, season, episode }) => {
    nuvioRequests.push({ provider, tmdbId, mediaType, season, episode });
    return { ok: false, provider: 'nuvio-' + provider, code: 'no_source' };
  } });
  f.api.setCapture(async ({ provider, url, signal }) => {
    browserRequests.push({ provider, url });
    assert.equal(signal.aborted, false);
    return provider === 'cinezo'
      ? { ok: true, source: { url: 'https://media.example/episode.m3u8', format: 'm3u8', forceHls: true, mediaVerified: true } }
      : { ok: false, code: 'provider_blocked' };
  });
  const result = await f.api.streams({ tmdbId: '101', mediaType: 'tv', season: '2', episode: '3' });
  assert.deepEqual(nuvioRequests, ['vidsrc', 'vidlink', 'videasy'].map(provider => ({
    provider, tmdbId: '101', mediaType: 'tv', season: '2', episode: '3'
  })));
  assert.deepEqual(browserRequests, [
    { provider: 'hexa', url: 'https://hexa.su/watch/tv/101/2/3' },
    { provider: 'cinezo', url: 'https://www.cinezo.net/watch/tv/101?season=2&episode=3' }
  ]);
  assert.equal(result.success, true);
  assert.equal(result.mediaType, 'tv');
  assert.equal(result.season, '2');
  assert.equal(result.episode, '3');
  assert.equal(result.sources[0].url, 'https://media.example/episode.m3u8');
  assert.equal(f.time.count(), 0);
});
test('cancellation during Nuvio extraction never opens a browser fallback', async () => {
  const signal=new AbortController(),reason=new Error('cancelled');let browsers=0;
  const f=fixture({NUVIO_ENABLED:true,resolveNuvioProvider:async()=>{signal.abort(reason);throw reason;}});
  f.api.setCapture(async()=>{browsers++;return {ok:false};});
  const result=await observe(f.api.streams({tmdbId:'101',signal:signal.signal})).promise;
  assert.equal(result.error,reason);
  assert.equal(browsers,0);
});
