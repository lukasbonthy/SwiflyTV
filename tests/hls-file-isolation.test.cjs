'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const handlers = source.slice(source.indexOf('async function handleHlsProxyMaster('), source.indexOf('const handleMediaFileProxy ='));
const routes = source.slice(source.indexOf('app.options("/api/hls-proxy/:id/master.m3u8"'), source.indexOf('app.get("/api/providers"'));
const playlist = '#EXTM3U\n#EXTINF:6,\nsegment.ts\n';

async function fixture(t, nativeFile) {
  const app = express();
  let fetches = 0, bodyReads = 0;
  const registration = Object.fromEntries(['get', 'head', 'options'].map(method => [method, (route, handler) => {
    app[method](route, (req, res, next) => Promise.resolve(handler(req, res)).catch(next));
  }]));
  vm.runInNewContext(handlers + routes, {
    app: registration, URL, Headers, Buffer,
    getHlsProxyEntry: () => ({ id: 'entry', sourceUrl: 'https://media.example/reacher.mp4', headers: {},
      meta: nativeFile ? { sourceFormat: 'mp4' } : {} }),
    setHlsProxyCors: res => res.set('Access-Control-Allow-Origin', '*'),
    fetchHlsProxyUrl: async () => {
      fetches++;
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl' }),
        text: async () => { bodyReads++; return playlist; },
        arrayBuffer: async () => { bodyReads++; return Buffer.from('video'); } };
    },
    rewriteHlsPlaylist: body => body, recordHlsProxyRequest: () => {},
    hlsProxyBase64UrlDecode: value => Buffer.from(value, 'base64url').toString(),
    isHlsLikeResponse: () => true, hlsProxyResponseHeaders: () => ({})
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { base: 'http://127.0.0.1:' + server.address().port,
    counts: () => ({ fetches, bodyReads }) };
}

for (const route of ['master.m3u8', 'asset?u=' + Buffer.from('https://media.example/child.m3u8').toString('base64url'), 'debug-master', 'status']) {
  test('native file entries cannot enter the HLS ' + route.split('?')[0] + ' route', async t => {
    const f = await fixture(t, true);
    const response = await fetch(f.base + '/api/hls-proxy/entry/' + route);
    assert.equal(response.status, 404);
    await response.text();
    assert.deepEqual(f.counts(), { fetches: 0, bodyReads: 0 });
  });
}

test('the existing HLS entry remains available through the HLS content routes', async t => {
  const f = await fixture(t, false);
  for (const route of ['master.m3u8', 'asset?u=' + Buffer.from('https://media.example/child.m3u8').toString('base64url'), 'debug-master']) {
    const response = await fetch(f.base + '/api/hls-proxy/entry/' + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), playlist);
  }
  assert.deepEqual(f.counts(), { fetches: 3, bodyReads: 3 });
});
