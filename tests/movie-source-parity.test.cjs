'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const noEnvDefaults = source.slice(source.indexOf('if (process.env.SWIFLY_NO_ENV_MODE'), source.indexOf('configureBrowserEnvironment();'));
const providerConfig = source.slice(source.indexOf('const STREAMPROVIDER_ENABLED ='), source.indexOf('const API_PROVIDERS ='));
const scraper = source.slice(source.indexOf('// ===== StreamProvider-main local media scrapers ====='), source.indexOf('// ===== Filmu m3u8 scraper:'));
const reporting = source.slice(source.indexOf('app.get("/api/local/streamprovider-urls"'), source.indexOf('app.get("/api/local/filmu-debug"'));

function fixture(env = {}, { debugError } = {}) {
  const races = [], routes = new Map();
  const sandbox = {
    process: { env: { ...env } }, URL, AbortController, Date, setTimeout, clearTimeout, console,
    NUVIO_ENABLED: false, NUVIO_PROVIDER_ORDER: ['vidlink', 'vidsrc', 'videasy'], NUVIO_PROVIDER_TIMEOUT_MS: 9000, NUVIO_TIMEOUT_MS: 12000,
    app: { get(url, handler) { routes.set(url, handler); } },
    apiClean: value => String(value || '').trim(),
    apiHasEmbeddableFileExtensionOrHlsProxy: (_url, media) => media.mediaVerified === true,
    createBrowserRuntime: () => ({ getBrowser() { throw new Error('Unexpected browser startup'); }, getStatus: () => ({ status: 'idle' }) }),
    async debugFixture({ id }) {
      if (debugError) throw debugError;
      return { tmdbId: id, winner: { playbackUrl: '/api/media-file/fixture', streamType: 'mp4', apiProvider: 'nuvio-vidlink' }, payload: {} };
    },
    async runProviderRace(options) {
      races.push(options);
      const results = options.jobs.map(job => ({ ok: true, provider: job.provider, source: { url: 'https://media.example/verified.mp4', format: 'mp4', mediaVerified: true } }));
      return { results, winner: results[0] };
    }
  };
  vm.runInNewContext(noEnvDefaults + providerConfig + scraper + reporting + '\nglobalThis.streams = localStreamProviderGetStreams; localStreamProviderDebug = debugFixture;', sandbox);
  return { streams: sandbox.streams, races, async request(url, query = {}) {
    let body, status = 200;
    const res = { set() { return this; }, status(code) { status = code; return this; }, json(payload) { body = payload; return this; } };
    await routes.get(url)({ query }, res);
    return { status, body };
  } };
}

test('default movies offer the same direct providers as episodes using movie embed URLs', async t => {
  for (const noEnvMode of ['true', 'false']) await t.test('no-env mode ' + noEnvMode, async () => {
    const f = fixture({ SWIFLY_NO_ENV_MODE: noEnvMode });
    const movie = await f.streams({ tmdbId: '550', mediaType: 'movie', season: '2', episode: '3' });
    const tv = await f.streams({ tmdbId: '108978', mediaType: 'tv', season: '2', episode: '3' });
    assert.equal(movie.success, true);
    assert.deepEqual(Array.from(f.races[0].jobs, job => job.provider), ['vidrift', 'hexa', 'cinezo']);
    assert.deepEqual(Array.from(f.races[1].jobs, job => job.provider), ['vidrift', 'hexa', 'cinezo']);
    assert.deepEqual(Array.from(f.races[0].jobs, job => job.url), [
      'https://embed.vidrift.in/embed/movie/550',
      'https://hexa.su/watch/movie/550',
      'https://www.cinezo.net/watch/movie/550'
    ]);
    assert.deepEqual(Array.from(f.races[1].jobs, job => job.url), [
      'https://embed.vidrift.in/embed/tv/108978/2/3',
      'https://hexa.su/watch/tv/108978/2/3',
      'https://www.cinezo.net/watch/tv/108978?season=2&episode=3'
    ]);
    assert.equal(movie.season, '');
    assert.equal(movie.episode, '');
    assert.equal(tv.season, '2');
    assert.equal(tv.episode, '3');
  });
});

test('movie and TV provider overrides remain independent and remove duplicates', async () => {
  const f = fixture({ STREAMPROVIDER_MOVIE_ORDER: ' Cinezo, cinezo ', STREAMPROVIDER_TV_ORDER: 'hexa' });
  await f.streams({ tmdbId: '550', mediaType: 'movie' });
  await f.streams({ tmdbId: '108978', mediaType: 'tv', season: '3', episode: '5' });
  assert.deepEqual(Array.from(f.races[0].jobs, job => job.provider), ['cinezo']);
  assert.deepEqual(Array.from(f.races[1].jobs, job => job.provider), ['hexa']);
  assert.equal(f.races[1].jobs[0].url, 'https://hexa.su/watch/tv/108978/3/5');
});

test('an explicit shared provider order remains the movie fallback in either startup mode', async t => {
  for (const noEnvMode of ['true', 'false']) await t.test('no-env mode ' + noEnvMode, async () => {
    const f = fixture({ SWIFLY_NO_ENV_MODE: noEnvMode, STREAMPROVIDER_ORDER: 'cinezo' });
    await f.streams({ tmdbId: '550', mediaType: 'movie' });
    assert.deepEqual(Array.from(f.races[0].jobs, job => job.provider), ['cinezo']);
  });
});

test('movie VidRift selection retains the same deadline, hedge, concurrency and cancellation settings', async () => {
  const controller = new AbortController();
  const f = fixture({ SWIFLY_NO_ENV_MODE: 'false', STREAMPROVIDER_MOVIE_ORDER: 'vidrift', STREAMPROVIDER_ROUTE_TIMEOUT_MS: '24000', STREAMPROVIDER_PROVIDER_TIMEOUT_MS: '14000', STREAMPROVIDER_HEDGE_DELAY_MS: '1200', STREAMPROVIDER_MAX_CONCURRENT: '1' });
  await f.streams({ tmdbId: '550', mediaType: 'movie', signal: controller.signal });
  const [race] = f.races;
  assert.equal(race.jobs[0].url, 'https://embed.vidrift.in/embed/movie/550');
  assert.equal(race.jobs[0].timeoutMs, 14000);
  assert.equal(race.timeoutMs, 24000);
  assert.equal(race.hedgeDelayMs, 1200);
  assert.equal(race.maxConcurrent, 1);
  assert.equal(race.signal, controller.signal);
});

test('source URL reporting uses the effective movie order and offered movie VidRift URL', async () => {
  const f = fixture({ STREAMPROVIDER_MOVIE_ORDER: 'vidrift', STREAMPROVIDER_TV_ORDER: 'hexa' });
  const movie = await f.request('/api/local/streamprovider-urls', { tmdb: '550', type: 'movie' });
  const tv = await f.request('/api/local/streamprovider-urls', { tmdb: '108978', type: 'tv', s: '2', e: '3' });
  assert.equal(movie.status, 200);
  assert.deepEqual(Array.from(movie.body.order), ['vidrift']);
  assert.equal(movie.body.urls.vidrift, 'https://embed.vidrift.in/embed/movie/550');
  assert.deepEqual(Array.from(tv.body.order), ['hexa']);
  assert.equal(tv.body.urls.vidrift, 'https://embed.vidrift.in/embed/tv/108978/2/3');
});

test('playback health reports the effective movie and TV orders', async () => {
  const f = fixture({ STREAMPROVIDER_MOVIE_ORDER: 'cinezo', STREAMPROVIDER_TV_ORDER: 'hexa' });
  const { body } = await f.request('/api/playback/health');
  assert.deepEqual(Array.from(body.discovery.providers), ['cinezo']);
  assert.deepEqual(Array.from(body.discovery.tvProviders), ['hexa']);
});

test('movie debug success and failure report the effective movie order', async t => {
  for (const debugError of [undefined, Object.assign(new Error('Discovery failed'), { code: 'no_source' })]) await t.test(debugError ? 'failure' : 'success', async () => {
    const f = fixture({ STREAMPROVIDER_MOVIE_ORDER: 'cinezo', STREAMPROVIDER_TV_ORDER: 'hexa' }, { debugError });
    const { status, body } = await f.request('/api/local/streamprovider-debug', { tmdb: '550', type: 'movie' });
    assert.equal(status, debugError ? 504 : 200);
    assert.deepEqual(Array.from(body.providerOrder), ['cinezo']);
    assert.equal(body.season, '');
    assert.equal(body.episode, '');
  });
});
