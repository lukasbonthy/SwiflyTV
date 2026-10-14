'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = serverSource.indexOf('app.get("/api/tmdb/:path(*)",');
const routeSource = serverSource.slice(start, serverSource.indexOf('\n});', start) + 5);

async function requestMetadata(t, payload, endpoint = '/tv/108978') {
  const app = express();
  // Catch the async route rejection so a bad HTTP status can be asserted over
  // real HTTP without terminating the test runner like the production server.
  const routes = { get(route, handler) {
    app.get(route, (req, res, next) => Promise.resolve(handler(req, res)).catch(next));
  } };
  vm.runInNewContext(routeSource, {
    app: routes, CACHE_TTL: { short: 100 },
    tmdb: async actualEndpoint => { assert.equal(actualEndpoint, endpoint); return payload; }
  });
  app.use((error, req, res, next) => res.status(500).json({ errorCode: error.code }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/tmdb' + endpoint);
  return { status: response.status, body: await response.json() };
}

test('Reacher metadata returns HTTP 200 while preserving its Returning Series status', async t => {
  const payload = { id: 108978, name: 'Reacher', status: 'Returning Series' };
  const result = await requestMetadata(t, payload);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, payload);
});

test('movie metadata keeps Released as title data instead of an HTTP status', async t => {
  const payload = { id: 550, title: 'Fight Club', status: 'Released' };
  const result = await requestMetadata(t, payload, '/movie/550');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, payload);
});

test('missing TMDB titles retain their upstream HTTP 404', async t => {
  const payload = { __error: true, status: 404, message: 'Not found' };
  const result = await requestMetadata(t, payload);
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, payload);
});

test('TMDB transport failures retain HTTP 500', async t => {
  const payload = { __error: true, status: 500, message: 'Could not reach TMDB.' };
  const result = await requestMetadata(t, payload);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, payload);
});
