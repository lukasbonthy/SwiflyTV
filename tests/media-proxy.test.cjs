'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function fixture() {
  const helpers = source.slice(source.indexOf('function apiClean('), source.indexOf('function apiTopList('));
  const proxy = source.slice(source.indexOf('function apiSourceToProxyResult('), source.indexOf('// ===== Local port of uploaded ScarperApi-zero'));
  const context = { URL, process: { env: {} }, hlsProxyEnabled: () => true,
    classifyMediaCandidate: require('../lib/media-discovery').classifyMediaCandidate,
    apiExtractMediaUrlsFromStringDeep: () => [],
    registerHlsProxySource: () => ({ enabled: true, id: 'local', url: '/api/hls-proxy/local/master.m3u8' }) };
  vm.runInNewContext(helpers + proxy + '\nglobalThis.api = {normalize:apiNormalizeSources, playable:apiLooksPlayable, proxy:apiSourceToProxyResult};', context);
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
