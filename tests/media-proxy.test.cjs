'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function fixture(overrides = {}) {
  const helpers = source.slice(source.indexOf('function apiClean('), source.indexOf('function apiTopList('));
  const handoff = source.slice(source.indexOf('function apiTopList('), source.indexOf('function apiSourceToProxyResult('));
  const proxy = source.slice(source.indexOf('function apiSourceToProxyResult('), source.indexOf('// ===== Local port of uploaded ScarperApi-zero'));
  const context = { URL, process: { env: {} }, hlsProxyEnabled: () => true,
    classifyMediaCandidate: require('../lib/media-discovery').classifyMediaCandidate,
    apiExtractMediaUrlsFromStringDeep: () => [],
    registerHlsProxySource: () => ({ enabled: true, id: 'local', url: '/api/hls-proxy/local/master.m3u8' }), ...overrides };
  vm.runInNewContext(helpers + handoff + proxy + '\nglobalThis.api = {normalize:apiNormalizeSources, playable:apiLooksPlayable, proxy:apiSourceToProxyResult, find:apiFindPlayableFromPayload};', context);
  return context.api;
}
test('verified HLS endpoints survive normalization and reach the local playlist proxy', () => {
  const f = fixture();
  for (const url of ['https://media.example/playlist?id=1&sig=%2B', 'https://media.example/play.php?token=SIGNED', 'https://media.example/?id=1']) {
    const sources = f.normalize({ sources: [{ url, format: 'm3u8', forceHls: true, mediaVerified: true, headers: { Referer: 'https://provider.example/watch' } }] });
    assert.equal(sources.length, 1);
    assert.equal(sources[0].forceHls, true);
    const result = f.proxy({ source: sources[0], provider: 'hexa', type: 'movie', id: '101' });
    assert.equal(result.playbackUrl, '/api/hls-proxy/local/master.m3u8');
    assert.equal(result.streamType, 'm3u8');
  }
});
test('verified extensionless MP4 and DASH preserve their format through the final player handoff', () => {
  const f = fixture();
  for (const [url, format, streamType] of [['https://media.example/movie?id=1', 'mp4', 'mp4'], ['https://media.example/manifest?id=1', 'mpd', 'dash']]) {
    const [source] = f.normalize({ sources: [{ url, format, mediaVerified: true }] });
    assert(source);
    const result = f.proxy({ source, provider: 'hexa', type: 'movie', id: '101' });
    assert.equal(result.playbackUrl, url);
    assert.equal(result.streamType, streamType);
    assert.equal(result.m3u8Embedded, false);
  }
});
test('manifest evidence never admits HTML, sitemaps, trailers, ad assets or arbitrary landing pages', () => {
  const f = fixture();
  for (const url of ['https://provider.example/player.html', 'https://provider.example/sitemap.xml', 'https://provider.example/hero-background-video.mp4', 'https://provider.example/wp-login.php', 'https://provider.example/ads/preroll.mp4', 'https://provider.example/trailer.mp4']) {
    assert.equal(f.playable(url, { format: 'm3u8', forceHls: true, mediaVerified: true }), false);
  }
  assert.equal(f.playable('https://provider.example/play.php', { forceHls: true }), false);
  assert.equal(f.playable('https://provider.example/'), false);
});
test('a nested raw URL does not overwrite the validated source and its request headers', () => {
  const f = fixture();
  const [value] = f.normalize({ sources: [{ url: 'https://media.example/movie.m3u8', format: 'm3u8', forceHls: true, mediaVerified: true, headers: { referer: 'https://provider.example/player', cookie: 'session=PRIVATE' } }] });
  assert.equal(value.mediaVerified, true);
  assert.equal(value.headers.cookie, 'session=PRIVATE');
});
test('a verified TV episode keeps its season and episode when registered with the HLS proxy', () => {
  const registrations = [];
  const f = fixture({ registerHlsProxySource: (url, headers, metadata) => {
    registrations.push({ url, headers, ...metadata });
    return { enabled: true, id: 'episode-' + metadata.episode, url: '/api/hls-proxy/episode-' + metadata.episode + '/master.m3u8' };
  } });
  for (const episode of ['3', '4']) {
    const [source] = f.normalize({ sources: [{ url: 'https://media.example/season-2/episode-' + episode + '.m3u8',
      format: 'm3u8', forceHls: true, mediaVerified: true, headers: { referer: 'https://provider.example/watch/tv/1399/2/' + episode } }] });
    const result = f.proxy({ source, provider: 'streamprovider-local', type: 'tv', id: '1399', season: '2', episode });
    assert.equal(result.streamType, 'm3u8');
    assert.equal(result.playbackUrl, '/api/hls-proxy/episode-' + episode + '/master.m3u8');
  }
  assert.deepEqual(registrations.map(({ movieId, type, season, episode }) => ({ movieId, type, season, episode })), [
    { movieId: '1399', type: 'tv', season: '2', episode: '3' },
    { movieId: '1399', type: 'tv', season: '2', episode: '4' }
  ]);
  assert.equal(registrations[0].headers.referer, 'https://provider.example/watch/tv/1399/2/3');
});

test('a verified Reacher file requiring proxying retains its transport and selected episode', () => {
  const registrations = [];
  const f = fixture({ registerHlsProxySource(url, headers, metadata) {
    registrations.push({ url, headers, metadata });
    return { enabled: true, id: 'reacher-file', url: '/api/hls-proxy/reacher-file/master.m3u8' };
  } });
  const [source] = f.normalize({ sources: [{ url: 'https://media.example/reacher-1-1.mp4',
    format: 'mp4', mediaVerified: true, requiresProxy: true, codecName: 'hevc',
    headers: { referer: 'https://provider.example/', cookie: 'private=1' } }] });
  const result = f.proxy({ source, provider: 'streamprovider-local', type: 'tv', id: '108978', season: '1', episode: '1' });
  assert.equal(result.playbackUrl, '/api/media-file-proxy/reacher-file/video.mp4');
  assert.equal(result.streamType, 'mp4');
  assert.equal(result.streamCodec, 'hevc');
  assert.equal(result.m3u8Embedded, false);
  assert.equal(result.hlsProxyUrl, '');
  assert.equal(result.streamHeaders.cookie, undefined);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].metadata.sourceFormat, 'mp4');
  assert.equal(registrations[0].metadata.sourceCodec, 'hevc');
  assert.equal(registrations[0].metadata.season, '1');
  assert.equal(registrations[0].metadata.episode, '1');
  assert.equal(registrations[0].headers.cookie, 'private=1');
});

test('a required file proxy is never silently replaced with an unproxied file', () => {
  const f = fixture({ hlsProxyEnabled: () => false });
  const [source] = f.normalize({ sources: [{ url: 'https://media.example/reacher.mp4', format: 'mp4',
    mediaVerified: true, requiresProxy: true }] });
  assert.equal(f.proxy({ source, provider: 'streamprovider-local', type: 'tv', id: '108978', season: '1', episode: '1' }), null);
});

test('the actual provider handoff preserves required proxying for verified Reacher MP4', async () => {
  const registrations = [];
  const f = fixture({ registerHlsProxySource(url, headers, metadata) {
    registrations.push({ url, headers, metadata });
    return { enabled: true, id: 'reacher-file', url: '/api/hls-proxy/reacher-file/master.m3u8' };
  } });
  const result = await f.find({ payload: { sources: [{ url: 'https://media.example/reacher.mp4',
    format: 'mp4', mediaVerified: true, requiresProxy: true, codecName: 'hevc' }] },
    providerName: 'streamprovider-local', providerConfig: {}, mediaType: 'tv', id: '108978', season: '1', episode: '1' });
  assert.equal(result.playbackUrl, '/api/media-file-proxy/reacher-file/video.mp4');
  assert.equal(result.streamCodec, 'hevc');
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].metadata.sourceCodec, 'hevc');
});

test('the actual provider handoff cannot strip a required proxy when it is disabled', async () => {
  const f = fixture({ hlsProxyEnabled: () => false });
  const result = await f.find({ payload: { sources: [{ url: 'https://media.example/reacher.mp4',
    format: 'mp4', mediaVerified: true, requiresProxy: true }] },
    providerName: 'streamprovider-local', providerConfig: {}, mediaType: 'tv', id: '108978', season: '1', episode: '1' });
  assert.equal(result, null);
});
