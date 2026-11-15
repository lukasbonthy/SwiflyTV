'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');
const { cleanHeaders } = require('../lib/nuvio-http');

// Run the real registry, rewriting, credential handling and HTTP handlers.
// Only the external upstream fetch is replaced so rejected requests can prove
// that no provider request occurred.
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const helpers = source.slice(source.indexOf('function hlsProxyEnabled('), source.indexOf('function normalizeRoomId('));
const handlers = source.slice(source.indexOf('async function handleHlsProxyMaster('), source.indexOf('const handleMediaFileProxy ='));
const routes = source.slice(source.indexOf('app.options("/api/hls-proxy/:id/master.m3u8"'), source.indexOf('app.get("/api/providers"'));

async function hlsFixture(t, options = {}) {
  const app = express(), entries = new Map(), requests = [];
  let bodyReads = 0;
  const registration = Object.fromEntries(['get', 'head', 'options'].map(method => [method, (route, handler) => {
    app[method](route, (req, res, next) => Promise.resolve(handler(req, res)).catch(next));
  }]));
  const context = {
    app: registration, URL, Headers, Buffer, crypto,
    process: { env: {} }, hlsProxySources: entries, subtitleProxySources: new Map(),
    cleanNuvioHeaders: cleanHeaders,
    fetch: async (url, init) => {
      requests.push({ url, ...init });
      const response = await options.upstream?.(url, init) || new Response('#EXTM3U\n#EXTINF:6,\nsegment.ts\n', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' }
      });
      for (const method of ['text', 'arrayBuffer']) {
        const read = response[method].bind(response);
        response[method] = async () => { bodyReads++; return read(); };
      }
      return response;
    }
  };
  const api = vm.runInNewContext(helpers + handlers + routes + '\n({ registerHlsProxySource, hlsProxyAssetUrl, rewriteHlsPlaylist })', context);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {
    base: 'http://127.0.0.1:' + server.address().port, entries, requests,
    register: api.registerHlsProxySource, asset: api.hlsProxyAssetUrl, rewrite: api.rewriteHlsPlaylist,
    counts: () => ({ fetches: requests.length, bodyReads })
  };
}

module.exports = { hlsFixture };
