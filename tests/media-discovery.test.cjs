'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helperPath = path.join(__dirname, '..', 'lib', 'media-discovery.js');
function discovery() {
  assert.ok(fs.existsSync(helperPath), 'The media discovery helper has not been implemented.');
  return require(helperPath);
}

const masterPlaylist = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n720/index.m3u8\n';
const mediaPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment-1.ts\n#EXT-X-ENDLIST\n';

test('recognizes an extensionless successful HLS response and preserves its signed query', () => {
  const { classifyMediaCandidate } = discovery();
  const url = 'https://cdn.example/play?id=7&sig=a%2Fb%2B%3D&expires=99&literal=x+y';
  const result = classifyMediaCandidate({ url, status: 200, contentType: 'application/vnd.apple.mpegurl; charset=utf-8' });
  assert.equal(result.url, url);
  assert.equal(result.format, 'm3u8');
  assert.equal(result.forceHls, true);
  assert.equal(typeof result.rank, 'number');
});

test('recognizes HLS playlist bodies delivered as generic text', () => {
  const { classifyMediaCandidate } = discovery();
  for (const bodyPrefix of [masterPlaylist, '\ufeff  ' + mediaPlaylist]) {
    const result = classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, contentType: 'text/plain', bodyPrefix });
    assert.equal(result.format, 'm3u8');
    assert.equal(result.forceHls, true);
  }
});

test('does not mistake a text mention of EXTM3U or an ordinary M3U list for HLS', () => {
  const { classifyMediaCandidate } = discovery();
  for (const bodyPrefix of ['The player uses #EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2\nfile.m3u8', '#EXTM3U\n#EXTINF:10,Song\nsong.mp3\n', '#EXTM3U\n#EXT-X-VERSION:3\n']) {
    assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, contentType: 'text/plain', bodyPrefix }), null);
  }
});

test('recognizes extensionless DASH MIME and an XML MPD root', () => {
  const { classifyMediaCandidate } = discovery();
  for (const input of [
    { contentType: 'application/dash+xml' },
    { contentType: 'application/xml', bodyPrefix: '<?xml version="1.0"?>\n<!-- manifest -->\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period/></MPD>' },
    { contentType: 'text/plain', bodyPrefix: '<dash:MPD xmlns:dash="urn:mpeg:dash:schema:mpd:2011"><dash:Period/></dash:MPD>' }
  ]) {
    const result = classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, ...input });
    assert.equal(result.format, 'mpd');
    assert.equal(result.forceHls, false);
  }
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, bodyPrefix: '<root><MPD/></root>' }), null);
});

test('rejects unsuccessful HTTP responses before considering extensions or explicit types', () => {
  const { classifyMediaCandidate } = discovery();
  for (const status of [0, 199, 301, 304, 403, 404, 429, 500]) {
    assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8', status, contentType: 'application/x-mpegurl', type: 'hls', confirmed: true, bodyPrefix: masterPlaylist }), null);
  }
});

test('rejects HTML returned under a playlist URL or a misleading media MIME', () => {
  const { classifyMediaCandidate } = discovery();
  for (const input of [
    { contentType: 'text/html', bodyPrefix: masterPlaylist },
    { contentType: 'application/x-mpegurl', bodyPrefix: '<!doctype html><html><body>Access denied</body></html>' },
    { contentType: 'video/mp4', bodyPrefix: '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml">Forbidden</html>' },
    { contentType: 'application/x-mpegurl', bodyPrefix: '<html><script>const value = "#EXTM3U";</script></html>' }
  ]) {
    assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8', status: 200, ...input }), null);
  }
});

test('requires source evidence instead of accepting an outgoing request by extension alone', () => {
  const { classifyMediaCandidate } = discovery();
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8' }), null);
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/play', contentType: 'application/x-mpegurl' }), null);
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8', confirmed: true }).format, 'm3u8');
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8', status: 206 }).format, 'm3u8');
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/play', type: 'hls' }).format, 'm3u8');
});

test('preserves confirmed progressive media formats including MKV and less common full files', () => {
  const { classifyMediaCandidate } = discovery();
  for (const format of ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'mpeg', 'mpg', 'wmv', 'ogv', '3gp', 'm2ts']) {
    const result = classifyMediaCandidate({ url: 'https://cdn.example/movie.' + format + '?sig=SIGNED', confirmed: true });
    assert.equal(result.format, format);
    assert.equal(result.forceHls, false);
  }
});

test('recognizes extensionless progressive video responses and uses a direct fallback for unfamiliar video MIME', () => {
  const { classifyMediaCandidate } = discovery();
  for (const [contentType, format] of [['video/mp4', 'mp4'], ['video/webm', 'webm'], ['video/x-matroska', 'mkv'], ['video/quicktime', 'mov'], ['video/vendor-special', 'direct']]) {
    const result = classifyMediaCandidate({ url: 'https://cdn.example/video', status: 206, contentType });
    assert.equal(result.format, format);
    assert.equal(result.forceHls, false);
  }
});

test('retains a confirmed direct fallback when a verified progressive source is handed off', () => {
  const { classifyMediaCandidate, extractMediaCandidates } = discovery();
  const result = classifyMediaCandidate({ url: 'https://cdn.example/video', type: 'direct', confirmed: true });
  assert.equal(result.format, 'direct');
  assert.equal(result.forceHls, false);
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/video', type: 'direct' }), null);
  assert.equal(extractMediaCandidates({ sources: [{ file: 'https://cdn.example/video', type: 'video/vendor-special' }] })[0].format, 'direct');
});

test('rejects raw transport segments and keys even when typed as media', () => {
  const { classifyMediaCandidate } = discovery();
  for (const file of ['segment.ts', 'chunk.m4s', 'init.fmp4', 'part.cmfv', 'part.cmfa', 'enc.key', 'sitemap.xml', 'site.webmanifest', 'poster.jpg', 'player.js']) {
    assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/' + file, status: 200, contentType: 'video/mp4', type: 'hls', confirmed: true }), null);
  }
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/segment', status: 200, contentType: 'video/mp2t' }), null);
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/segment', status: 200, contentType: 'video/iso.segment' }), null);
});

test('rejects obvious background, advertising, trailer and test assets', () => {
  const { classifyMediaCandidate } = discovery();
  for (const file of ['hero-background-video.mp4', 'demo_2x.webm', 'background.mp4', 'sample.mp4', 'test.mp4', 'trailer.mp4', 'ads/preroll.mp4']) {
    assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/' + file, confirmed: true }), null);
  }
  assert.equal(classifyMediaCandidate({ url: 'https://cdn.example/movie.mp4', confirmed: true, isNonMediaUrl: url => url.includes('cdn.example') }), null);
});

test('rejects browser blob URLs and unsafe or malformed URL schemes', () => {
  const { classifyMediaCandidate } = discovery();
  for (const url of ['blob:https://provider.example/token', 'data:video/mp4;base64,AAAA', 'javascript:play()', 'file:///movie.mp4', 'ftp://cdn.example/movie.mp4', 'https://cdn.example/movie.mp4\n?token=2', 'https://cdn.example/video\\movie.mp4', 'https://user:password@cdn.example/movie.mp4']) {
    assert.equal(classifyMediaCandidate({ url, type: 'hls', confirmed: true }), null);
  }
});

test('resolves known relative sources only with an HTTP base and decodes HTML ampersands without decoding signatures', () => {
  const { classifyMediaCandidate } = discovery();
  const result = classifyMediaCandidate({ url: '../media/master.m3u8?sig=a%26b&amp;foo=x+y&#38;last=%2f', baseUrl: 'https://provider.example/embed/player', confirmed: true });
  assert.equal(result.url, 'https://provider.example/media/master.m3u8?sig=a%26b&foo=x+y&last=%2f');
  assert.equal(classifyMediaCandidate({ url: '/master.m3u8', confirmed: true }), null);
  assert.equal(classifyMediaCandidate({ url: '/master.m3u8', baseUrl: 'file:///player.html', confirmed: true }), null);
});

test('gives stronger playlist response evidence a higher rank than DOM extension evidence', () => {
  const { classifyMediaCandidate } = discovery();
  const dom = classifyMediaCandidate({ url: 'https://cdn.example/master.m3u8', confirmed: true });
  const response = classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, contentType: 'application/x-mpegurl' });
  const body = classifyMediaCandidate({ url: 'https://cdn.example/play', status: 200, bodyPrefix: masterPlaylist });
  assert.ok(response.rank > dom.rank);
  assert.ok(body.rank >= response.rank);
});

test('extracts explicitly typed extensionless file, src and URL fields from nested JSON', () => {
  const { extractMediaCandidates } = discovery();
  const results = extractMediaCandidates({ data: { sources: [
    { file: 'https://cdn.example/play?id=1&sig=%2B%3D', type: 'hls' },
    { src: 'https://cdn.example/dash?id=2', type: 'application/dash+xml' },
    { url: 'https://cdn.example/movie?id=3', format: 'video/mp4' }
  ] } });
  assert.deepEqual(results.map(({ url, format, forceHls }) => ({ url, format, forceHls })), [
    { url: 'https://cdn.example/play?id=1&sig=%2B%3D', format: 'm3u8', forceHls: true },
    { url: 'https://cdn.example/dash?id=2', format: 'mpd', forceHls: false },
    { url: 'https://cdn.example/movie?id=3', format: 'mp4', forceHls: false }
  ]);
});

test('extracts explicit HLS and DASH fields and confirmed progressive source extensions', () => {
  const { extractMediaCandidates } = discovery();
  const results = extractMediaCandidates({ data: {
    hls_url: '/play?sig=1&amp;token=%2f',
    dash: { url: '../mpd?id=2' },
    sources: [{ file: '../movie.mkv?token=3' }, { src: '//cdn.example/movie.webm' }]
  } }, { baseUrl: 'https://provider.example/embed/player' });
  assert.deepEqual(results.map(value => [value.url, value.format]), [
    ['https://provider.example/play?sig=1&token=%2f', 'm3u8'],
    ['https://provider.example/mpd?id=2', 'mpd'],
    ['https://provider.example/movie.mkv?token=3', 'mkv'],
    ['https://cdn.example/movie.webm', 'webm']
  ]);
});

test('inherits a format through source containers without labeling unrelated metadata URLs as sources', () => {
  const { extractMediaCandidates } = discovery();
  const results = extractMediaCandidates({ type: 'hls', sources: [{ file: '/play?id=7' }], metadata: { url: '/about' }, poster: 'https://cdn.example/poster.m3u8' }, { baseUrl: 'https://provider.example/embed' });
  assert.deepEqual(results.map(value => value.url), ['https://provider.example/play?id=7']);
});

test('does not extract random prose, untyped extensionless URL values, embed pages or download links', () => {
  const { extractMediaCandidates } = discovery();
  const result = extractMediaCandidates({
    description: 'https://cdn.example/master.m3u8',
    poster: 'https://cdn.example/master.m3u8',
    url: 'https://provider.example/watch/7',
    embedUrl: 'https://provider.example/player',
    downloadUrl: 'https://cdn.example/movie.mkv',
    downloadLinks: [{ url: 'https://cdn.example/movie.mp4' }],
    href: 'https://cdn.example/master.m3u8'
  });
  assert.deepEqual(result, []);
});

test('parses bounded JSON text without broad URL scraping', () => {
  const { extractMediaCandidates } = discovery();
  const text = JSON.stringify({ sources: [{ file: 'https://cdn.example/play?sig=a%2Bb&token=%26', type: 'application/x-mpegurl' }] });
  assert.equal(extractMediaCandidates(text)[0].url, 'https://cdn.example/play?sig=a%2Bb&token=%26');
  assert.deepEqual(extractMediaCandidates('const sources = ' + text), []);
  assert.deepEqual(extractMediaCandidates('x'.repeat(600000)), []);
});

test('deduplicates identical sources and keeps stronger explicit typing', () => {
  const { extractMediaCandidates } = discovery();
  const result = extractMediaCandidates({ sources: [
    { url: 'https://cdn.example/master.m3u8' },
    { file: 'https://cdn.example/master.m3u8', type: 'hls' },
    { file: 'https://cdn.example/master.m3u8', type: 'hls' }
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0].format, 'm3u8');
  assert.equal(result[0].forceHls, true);
  assert.ok(result[0].rank > discovery().classifyMediaCandidate({ url: result[0].url, confirmed: true }).rank);
});

test('bounds traversal of cyclic, deeply nested and excessive payloads', () => {
  const { extractMediaCandidates } = discovery();
  const cyclic = { sources: [{ file: 'https://cdn.example/movie.mp4' }] };
  cyclic.self = cyclic;
  assert.equal(extractMediaCandidates(cyclic).length, 1);
  let deep = { url: 'https://cdn.example/movie.mp4' };
  for (let depth = 0; depth < 100; depth += 1) deep = { data: deep };
  assert.deepEqual(extractMediaCandidates(deep), []);
  const excessive = { sources: Array.from({ length: 10000 }, (_, index) => ({ file: 'https://cdn.example/movie-' + index + '.mp4' })) };
  const results = extractMediaCandidates(excessive);
  assert.ok(results.length > 0 && results.length <= 64);
});

test('ignores executable accessors and inherited properties in payload objects', () => {
  const { extractMediaCandidates } = discovery();
  const payload = Object.create({ url: 'https://cdn.example/inherited.mp4' });
  Object.defineProperty(payload, 'sources', { enumerable: true, get() { throw new Error('Getter should not run.'); } });
  payload.data = { file: 'https://cdn.example/movie.mp4' };
  assert.deepEqual(extractMediaCandidates(payload).map(value => value.url), ['https://cdn.example/movie.mp4']);
});

test('honors a caller non-media filter during JSON extraction', () => {
  const { extractMediaCandidates } = discovery();
  const result = extractMediaCandidates({ sources: [
    { file: 'https://ads.example/master.m3u8', type: 'hls' },
    { file: 'https://cdn.example/movie.mkv' }
  ] }, { isNonMediaUrl: url => url.includes('ads.example') });
  assert.deepEqual(result.map(value => value.url), ['https://cdn.example/movie.mkv']);
});
