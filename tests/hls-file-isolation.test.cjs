'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hlsFixture } = require('./hls-proxy-fixture.cjs');
const playlist = '#EXTM3U\n#EXTINF:6,\nsegment.ts\n';

async function fixture(t, nativeFile) {
  const f = await hlsFixture(t);
  const registered = f.register('https://media.example/' + (nativeFile ? 'reacher.mp4' : 'master.m3u8'), {},
    nativeFile ? { sourceFormat: 'mp4' } : {});
  return { ...f, registered, prefix: '/api/hls-proxy/' + registered.id + '/' };
}

for (const route of ['master.m3u8', 'asset?u=' + Buffer.from('https://media.example/child.m3u8').toString('base64url'), 'debug-master', 'status']) {
  test('native file entries cannot enter the HLS ' + route.split('?')[0] + ' route', async t => {
    const f = await fixture(t, true);
    const response = await fetch(f.base + f.prefix + route);
    assert.equal(response.status, 404);
    await response.text();
    assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
  });
}

test('the existing HLS entry remains available through the HLS content routes', async t => {
  const f = await fixture(t, false);
  for (const route of [f.registered.url, f.asset(f.registered.id, 'https://media.example/child.m3u8'), f.prefix + 'debug-master']) {
    const response = await fetch(f.base + route);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body, f.rewrite(playlist, 'https://media.example/master.m3u8', f.registered.id));
  }
  assert.deepEqual(f.counts(), { fetches: 3, bodyReads: 3 });
});
