'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cleanHeaders } = require('../lib/nuvio-http');

// Use the real production registration functions so this catches accidental
// header mutation between VidLink HEAD verification and the native proxy.
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('function sanitizeHlsProxyHeaders(');
const end = server.indexOf('function getHlsProxyEntry(');
assert.ok(start >= 0 && end > start, 'could not locate production registration');

function registration() {
  const entries = new Map();
  let serial = 0;
  const context = {
    URL,
    Date,
    cleanNuvioHeaders: cleanHeaders,
    hlsProxySources: entries,
    hlsProxyId: () => 'proxy-' + ++serial,
    hlsProxyEnabled: () => true,
    process: { env: { HLS_PROXY_USER_AGENT: 'HLS-ONLY-DEFAULT-UA/1.0' } }
  };
  const api = vm.runInNewContext(server.slice(start, end) + '\n({ registerHlsProxySource })', context);
  return { entries, register: api.registerHlsProxySource };
}

test('verified MP4 registration retains provider headers without adding HLS defaults', () => {
  const { entries, register } = registration();
  const supplied = {
    Origin: 'https://vidlink.pro',
    Referer: 'https://vidlink.pro/embed/tv/108978/1/1',
    'X-Playback-Token': 'verified-token',
    Authorization: 'Bearer verified',
    Host: 'forbidden.invalid',
    Connection: 'keep-alive'
  };

  const registered = register('https://files.example/reacher.mp4', supplied, { sourceFormat: 'mp4' });
  const stored = entries.get(registered.id);
  assert.ok(stored);
  assert.equal(stored.sourceUrl, 'https://files.example/reacher.mp4');
  assert.deepEqual({ ...stored.headers }, cleanHeaders(supplied));
  assert.equal(stored.headers['user-agent'], undefined);
  assert.equal(stored.headers.accept, undefined);
  assert.equal(stored.headers.host, undefined);
  assert.equal(stored.headers.connection, undefined);
  assert.equal(stored.headers['x-playback-token'], 'verified-token');
});

test('native MP4 registration preserves an explicit verified user-agent', () => {
  const { entries, register } = registration();
  const registered = register('https://files.example/reacher.mp4', {
    'User-Agent': 'VidLink-Required-UA/2.0',
    Accept: 'video/mp4'
  }, { sourceFormat: 'mp4' });
  const headers = entries.get(registered.id).headers;
  assert.equal(headers['user-agent'], 'VidLink-Required-UA/2.0');
  assert.equal(headers.accept, 'video/mp4');
});

test('playlist registration still supplies HLS fallback headers', () => {
  const { entries, register } = registration();
  const registered = register('https://files.example/playlist.m3u8', { Referer: 'https://provider.example/' });
  const headers = entries.get(registered.id).headers;
  assert.equal(headers['user-agent'], 'HLS-ONLY-DEFAULT-UA/1.0');
  assert.equal(headers.accept, '*/*');
  assert.equal(headers.referer, 'https://provider.example/');
});
