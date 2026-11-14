'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hlsFixture } = require('./hls-proxy-fixture.cjs');

const sourceUrl = 'https://media.example/family/master.m3u8';
const segmentUrl = 'https://media.example/family/segment.ts?token=allowed';

for (const method of ['GET', 'HEAD']) {
  test(method + ' rejects a signed asset whose destination was changed before any upstream request', async t => {
    const f = await hlsFixture(t), entry = f.register(sourceUrl);
    const signed = new URL(f.asset(entry.id, segmentUrl), f.base);
    for (const other of ['https://media.example/other/segment.ts', 'https://other.example/video.mp4', segmentUrl + '&title=other']) {
      const tampered = new URL(signed);
      tampered.searchParams.set('u', Buffer.from(other).toString('base64url'));
      const response = await fetch(tampered, { method });
      assert.equal(response.status, 403);
      await response.text();
    }
    assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
  });

  test(method + ' rejects a signature copied to another source before any upstream request', async t => {
    const f = await hlsFixture(t), first = f.register(sourceUrl), second = f.register(sourceUrl);
    const signed = new URL(f.asset(first.id, segmentUrl), f.base);
    signed.pathname = '/api/hls-proxy/' + second.id + '/asset';
    const response = await fetch(signed, { method });
    assert.equal(response.status, 403);
    await response.text();
    assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
  });

  test(method + ' rejects unsigned and malformed asset signatures without a legacy fallback', async t => {
    const f = await hlsFixture(t), entry = f.register(sourceUrl);
    for (const signature of [null, '', 'bad-signature', 'A'.repeat(43), 'A'.repeat(1000)]) {
      const target = new URL(f.asset(entry.id, segmentUrl), f.base);
      if (signature === null) target.searchParams.delete('s');
      else target.searchParams.set('s', signature);
      const response = await fetch(target, { method });
      assert.equal(response.status, 403);
      await response.text();
    }
    assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
  });
}

test('an asset signature stops authorizing requests when its registered source changes or expires', async t => {
  const f = await hlsFixture(t), registered = f.register(sourceUrl);
  const signed = f.asset(registered.id, segmentUrl), entry = f.entries.get(registered.id);
  entry.sourceUrl = 'https://media.example/replaced/master.m3u8';
  let response = await fetch(f.base + signed);
  assert.equal(response.status, 403);
  await response.text();
  entry.sourceUrl = sourceUrl;
  entry.createdAt++;
  response = await fetch(f.base + signed);
  assert.equal(response.status, 403);
  await response.text();
  entry.expiresAt = Date.now() - 1;
  response = await fetch(f.base + signed);
  assert.equal(response.status, 404);
  await response.text();
  assert.equal(f.entries.has(registered.id), false);
  assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
});

test('a new process signing key cannot accept asset URLs from an earlier process', async t => {
  const first = await hlsFixture(t), registered = first.register(sourceUrl);
  const signed = first.asset(registered.id, segmentUrl);
  const second = await hlsFixture(t);
  second.entries.set(registered.id, { ...first.entries.get(registered.id) });
  const response = await fetch(second.base + signed);
  assert.equal(response.status, 403);
  await response.text();
  assert.deepEqual(second.counts(), { fetches: 0, bodyReads: 0 });
});

test('real playlist rewriting signs nested playlists, keys, maps and low-latency assets for playback', async t => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/en.m3u8"\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100,URI=iframe.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nvideo/main.m3u8\n';
  const nested = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../keys/main.key?version=1"\n#EXT-X-MAP:URI=\'init.mp4\'\n#EXT-X-PART:DURATION=0.3,URI=part.m4s\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="next.m4s"\n#EXT-X-CONTENT-STEERING:SERVER-URI="../steering.json"\n#PROVIDER:URL="https://cdn.example/extra.ts"\n#EXTINF:6,\nhttps://cdn.example/segment.ts?token=allowed\n';
  const f = await hlsFixture(t, { upstream: async (url, options) => {
    if (url === sourceUrl) return new Response(master, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    if (url === 'https://media.example/family/video/main.m3u8') return new Response(nested, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    return new Response('media bytes', { status: options.headers.range ? 206 : 200,
      headers: { 'content-type': 'video/mp2t', ...(options.headers.range ? { 'content-range': 'bytes 0-10/100' } : {}) } });
  } });
  const registered = f.register(sourceUrl, { cookie: 'session=PRIVATE', Authorization: 'Bearer PRIVATE', Referer: 'https://provider.example/watch' });
  let response = await fetch(f.base + registered.url);
  assert.equal(response.status, 200);
  const rewrittenMaster = await response.text();
  const assets = rewrittenMaster.match(/\/api\/hls-proxy\/[^\s"',]+/g);
  assert.equal(assets.length, 3);
  for (const asset of assets) assert.match(new URL(asset, f.base).searchParams.get('s') || '', /^[A-Za-z0-9_-]{43}$/);
  response = await fetch(f.base + assets[2]);
  assert.equal(response.status, 200);
  const rewrittenNested = await response.text();
  const nestedAssets = rewrittenNested.match(/\/api\/hls-proxy\/[^\s"',]+/g);
  const expected = ['https://media.example/family/keys/main.key?version=1', 'https://media.example/family/video/init.mp4',
    'https://media.example/family/video/part.m4s', 'https://media.example/family/video/next.m4s',
    'https://media.example/family/steering.json', 'https://cdn.example/extra.ts', 'https://cdn.example/segment.ts?token=allowed'];
  assert.equal(nestedAssets.length, expected.length);
  for (let index = 0; index < nestedAssets.length; index++) {
    const asset = new URL(nestedAssets[index], f.base);
    assert.equal(Buffer.from(asset.searchParams.get('u'), 'base64url').toString(), expected[index]);
    assert.match(asset.searchParams.get('s') || '', /^[A-Za-z0-9_-]{43}$/);
    response = await fetch(asset);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'media bytes');
    assert.equal(f.requests.at(-1).url, expected[index]);
  }
  response = await fetch(f.base + nestedAssets.at(-1), { headers: { Range: 'bytes=0-10' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-10/100');
  await response.text();
  assert.equal(f.requests.at(-1).headers.range, 'bytes=0-10');
  response = await fetch(f.base + nestedAssets[0], { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  const sameOrigin = f.requests.find(request => request.url.endsWith('main.key?version=1'));
  assert.equal(sameOrigin.headers.cookie, 'session=PRIVATE');
  const crossOrigin = f.requests.find(request => request.url.startsWith('https://cdn.example/'));
  assert.equal(crossOrigin.headers.cookie, undefined);
  assert.equal(crossOrigin.headers.authorization, undefined);
  assert.equal(crossOrigin.headers.referer, 'https://provider.example/watch');
});

test('provider playlist paths resembling local proxy URLs are signed as upstream destinations', async t => {
  const f = await hlsFixture(t), registered = f.register(sourceUrl);
  const rewritten = f.rewrite('#EXTM3U\n/api/hls-proxy/fake/asset?u=unsigned\n', sourceUrl, registered.id);
  const asset = new URL(rewritten.split('\n')[1], f.base);
  assert.equal(Buffer.from(asset.searchParams.get('u'), 'base64url').toString(), 'https://media.example/api/hls-proxy/fake/asset?u=unsigned');
  assert.match(asset.searchParams.get('s') || '', /^[A-Za-z0-9_-]{43}$/);
});
