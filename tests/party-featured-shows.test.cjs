'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadServer } = require('./ui-helpers.cjs');
const api = loadServer(); let base;
test.before(async () => { await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + api.httpServer.address().port; });
test.after(async () => { await new Promise(resolve => api.io.close(resolve)); });
test('Featured TV choices use trending TV and normalize six valid nonadult shows', async () => {
  let called;
  api.setTmdb(async (endpoint, params) => { called = { endpoint, params }; return { results: [null, { id: 3, name: 'Adult', adult: true }, { id: 'bad', name: 'Invalid' }, { id: 4 }, ...Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, name: 'Show ' + i, first_air_date: '2024-01-01', poster_path: '/show.jpg', overview: 'A series' }))] }; });
  const response = await fetch(base + '/api/social/media/featured?type=tv'); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.ok, true); assert.equal(called.endpoint, '/trending/tv/week'); assert.equal(data.results.length, 6); assert.equal(data.results[0].type, 'tv'); assert.equal(data.results[0].title, 'Show 0'); assert.equal(data.results[0].year, '2024'); assert.match(data.results[0].poster, /image\.tmdb\.org/);
});
test('Featured media rejects unsupported types before contacting TMDB', async () => {
  let calls = 0; api.setTmdb(async () => { calls++; return { results: [] }; });
  for (const type of ['', 'movie', 'person', 'tv&type=movie']) { const response = await fetch(base + '/api/social/media/featured' + (type ? '?type=' + type : '')); assert.equal(response.status, 400); assert.equal((await response.json()).ok, false); }
  assert.equal(calls, 0);
});
test('TV choices expose an empty response and safe retry errors for upstream failures', async () => {
  api.setTmdb(async () => ({ results: [] })); assert.deepEqual(await (await fetch(base + '/api/social/media/featured?type=tv')).json(), { ok: true, results: [] });
  for (const result of [null, { __error: true, message: 'private-upstream-secret' }, { results: 'broken' }]) { api.setTmdb(async () => result); const response = await fetch(base + '/api/social/media/featured?type=tv'); assert.equal(response.status, 503); const error = await response.json(); assert.equal(error.ok, false); assert.match(error.message, /try again/i); assert.doesNotMatch(JSON.stringify(error), /private-upstream-secret/); }
  api.setTmdb(async () => { throw Error('private-upstream-secret'); }); assert.equal((await fetch(base + '/api/social/media/featured?type=tv')).status, 503);
});
test('Existing featured movie endpoint retains its legacy payload', async () => {
  let endpoint; api.setTmdb(async path => { endpoint = path; return { results: [{ id: 101, title: 'Arrival', release_date: '2016-01-01' }] }; });
  const response = await fetch(base + '/api/social/movies/featured'); assert.equal(response.status, 200); assert.equal(endpoint, '/trending/movie/week'); const data = await response.json(); assert.equal(data.movies[0].title, 'Arrival'); assert.equal(data.results, undefined);
});
