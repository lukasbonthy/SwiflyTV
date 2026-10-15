'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { loadServer } = require('./ui-helpers.cjs');
const { createSourceJobs } = require('../lib/source-jobs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('the install command uses the installed Playwright CLI and the configured browser cache', () => {
  const env = { PLAYWRIGHT_BROWSERS_PATH: '0' }; let invocation, exited;
  const requireFixture = name => {
    if (name === 'dotenv') return { config() {} };
    if (name === '../lib/browser-runtime') return { configureBrowserEnvironment: () => require('../lib/browser-runtime').configureBrowserEnvironment({ env, platform: 'win32' }) };
    if (name === 'node:child_process') return { spawnSync(binary, args, options) { invocation = { binary, args, options }; return { status: 0 }; } };
    return require(name);
  };
  requireFixture.resolve = require.resolve;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/install-browser.cjs'), 'utf8'), { require: requireFixture, console, process: { env, execPath: process.execPath, exit(code) { exited = code; } } });
  assert.equal(invocation.binary, process.execPath);
  assert(fs.existsSync(invocation.args[0]));
  assert.equal(invocation.args[1], 'install'); assert.equal(invocation.args[2], 'chromium');
  assert.equal(invocation.options.env.PLAYWRIGHT_BROWSERS_PATH, '0');
  assert.equal(exited, 0);
});

test('playback health is safe and does not start a browser', async () => {
  const api = loadServer();
  await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + api.httpServer.address().port + '/api/playback/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.browser.status, 'idle'); assert.equal(data.browser.ready, false);
    assert.deepEqual(data.discovery.providers, ['vidrift', 'hexa', 'cinezo']);
    assert.equal(data.discovery.routeTimeoutMs, 60000);
    assert.doesNotMatch(JSON.stringify(data), /executablePath|API_KEY|cookie|authorization|ms-playwright|Users|workspace/i);
  } finally { await new Promise(resolve => api.io.close(resolve)); }
});

test('source polling never exposes captured credentials or raw provider payloads', async t => {
  const jobs = createSourceJobs({ resolve: () => ({ status: 'ok', playbackUrl: '/api/hls-proxy/private/master.m3u8', streamHeaders: { cookie: 'SECRET', Authorization: 'SECRET', Referer: 'https://provider.example/watch' }, normalized: { sources: [{ headers: { cookie: 'SECRET' } }] } }) });
  t.after(() => jobs.destroy());
  const result = await jobs.resolve({ id: '101' });
  assert.equal(result.streamHeaders.Referer, 'https://provider.example/watch');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|normalized/);
});

function proxyFixture(fetch) {
  const headers = source.slice(source.indexOf('function hlsProxyRequestHeaders('), source.indexOf('function hlsProxyAssetUrl('));
  const getter = source.slice(source.indexOf('async function fetchHlsProxyUrl('), source.indexOf('function isHlsLikeResponse('));
  const context = { URL, fetch };
  vm.runInNewContext(headers + getter + '\nglobalThis.api = {headers:hlsProxyRequestHeaders, fetch:fetchHlsProxyUrl};', context);
  return context.api;
}
test('HLS session headers stay on the source origin through assets and redirects', async () => {
  const requests = [], entry = { sourceUrl: 'https://media.example/master', headers: { cookie: 'session=PRIVATE', authorization: 'Bearer PRIVATE', referer: 'https://provider.example/watch' } };
  const f = proxyFixture(async (url, options) => {
    requests.push({ url, ...options });
    if (requests.length === 1) return { status: 302, headers: { get: () => 'https://other.example/playlist' }, body: { cancel: async () => {} } };
    return { status: 200, headers: { get: () => null } };
  });
  await f.fetch(entry, entry.sourceUrl);
  assert.equal(requests[0].headers.cookie, 'session=PRIVATE');
  assert.equal(requests[0].headers.authorization, 'Bearer PRIVATE');
  assert.equal(requests[1].headers.cookie, undefined);
  assert.equal(requests[1].headers.authorization, undefined);
  assert.equal(requests[1].headers.referer, 'https://provider.example/watch');
  assert.equal(f.headers(entry, null, 'https://media.example/segment.ts').cookie, 'session=PRIVATE');
  assert.equal(f.headers(entry, null, 'https://other.example/segment.ts').cookie, undefined);
});

test('HLS redirects stop at a bounded hop count', async () => {
  let requests = 0;
  const f = proxyFixture(async () => { requests++; return { status: 302, headers: { get: () => '/again' }, body: { cancel: async () => {} } }; });
  await assert.rejects(f.fetch({ sourceUrl: 'https://media.example/master', headers: {} }, 'https://media.example/master'), /redirect limit/);
  assert.equal(requests, 6);
});
