'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSourceJobs } = require('../lib/source-jobs');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const sourceRoutes = serverSource.slice(serverSource.indexOf('app.get("/api/proxy-video-wait/:type/:id"'),
  serverSource.indexOf('app.get("/api/hls-source/movie/:id"'));

function fixture(t) {
  const discovered = [], routes = new Map();
  const jobs = createSourceJobs({ resolve(params) {
    discovered.push(params);
    return { status: 'ok', playbackUrl: '/api/hls-proxy/' + params.season + '-' + params.episode + '-' + params.provider + '/master.m3u8' };
  } });
  t.after(() => jobs.destroy());
  const context = {
    AbortController, Date,
    app: { get: (route, handler) => routes.set(route, handler) },
    movieSourceJobs: jobs,
    fetchProxyVideoSource: params => jobs.resolve(params, { retry: params.retry === true })
  };
  vm.runInNewContext(sourceRoutes, context, { filename: 'tv-source-api-routes.js' });
  async function request(route, query = {}, id = '1399') {
    const response = { statusCode: 200, writableEnded: false, headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; this.writableEnded = true; return this; },
      on() {}, off() {}
    };
    await routes.get(route)({ params: { type: 'tv', id }, query }, response, error => { throw error; });
    return response;
  }
  return { request, discovered };
}

const pollRoute = '/api/proxy-video-wait/:type/:id';
const resolveRoute = '/api/proxy-video/:type/:id';

test('TV source polling, waiting and resolving share the same selected episode job across query aliases', async t => {
  const f = fixture(t);
  const poll = await f.request(pollRoute, { season: '02', episode: '003', provider: ' StreamProvider ' }, '01399');
  const wait = await f.request(pollRoute, { s: '2', e: '3', provider: 'streamprovider', wait: '8000' });
  const resolve = await f.request(resolveRoute, { season: '2', episode: '3', provider: 'streamprovider' });
  assert.equal(poll.statusCode, 200);
  assert.equal(wait.body.status, 'ok');
  assert.equal(resolve.body.status, 'ok');
  assert.equal(wait.body.jobId, poll.body.jobId);
  assert.equal(resolve.body.jobId, poll.body.jobId);
  assert.equal(resolve.body.playbackUrl, '/api/hls-proxy/2-3-streamprovider/master.m3u8');
  assert.deepEqual(f.discovered, [{ type: 'tv', id: '1399', season: '2', episode: '3', provider: 'streamprovider' }]);
  assert.equal(resolve.headers['Cache-Control'], 'no-store');
});

test('successful TV sources are cached separately for each season, episode and provider', async t => {
  const f = fixture(t), results = [];
  for (const query of [
    { season: '2', episode: '3', provider: 'streamprovider' },
    { season: '2', episode: '4', provider: 'streamprovider' },
    { season: '3', episode: '3', provider: 'streamprovider' },
    { season: '2', episode: '3', provider: 'cinezo' }
  ]) {
    const response = await f.request(resolveRoute, query);
    assert.equal(response.body.status, 'ok');
    results.push(response.body);
  }
  assert.equal(f.discovered.length, 4);
  assert.equal(new Set(results.map(result => result.jobId)).size, 4);
  assert.equal(new Set(results.map(result => result.playbackUrl)).size, 4);
  const cached = await f.request(resolveRoute, { season: '2', episode: '3', provider: 'streamprovider' });
  assert.equal(cached.body.jobId, results[0].jobId);
  assert.equal(cached.body.playbackUrl, results[0].playbackUrl);
  assert.equal(f.discovered.length, 4);
});
