'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const {Server} = require('socket.io');
const {createAccountStore} = require('../lib/account-store');
const {createMovieNights} = require('../lib/movie-nights');

const FRIDAY = Date.parse('2026-11-20T21:00:00Z');
const START = Date.parse('2026-11-21T01:00:00Z');
const CLOSE = START - 5 * 60000;
const FILM = {status: 'ok', playbackUrl: '/assets/test-screening.mp4', streamType: 'mp4'};

function catalogue(overrides = {}) {
  const calls = [];
  const tmdb = async (path, query = {}) => {
    calls.push({path, query});
    if (path === '/discover/movie') {
      const page = Number(query.page) || 1;
      return {results: Array.from({length: 20}, (_, index) => ({id: (page - 1) * 20 + index + 1})), total_pages: 2};
    }
    const id = Number(path.split('/').at(-1));
    return {
      id, adult: false, title: 'Film ' + id, runtime: 120,
      release_date: '2020-01-01', poster_path: '/poster-' + id + '.jpg',
      backdrop_path: '/backdrop-' + id + '.jpg', overview: 'Overview for film ' + id,
      ...overrides[id]
    };
  };
  return {tmdb, calls};
}

async function setup(t, options = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'swifly-movie-nights-'));
  const store = options.store || createAccountStore({directory, connectionString: ''});
  const makeClock = {time: options.time ?? FRIDAY};
  const catalog = catalogue(options.catalogue);
  const calls = [];
  const accounts = new Map([
    ['alice', {id: 'account-private-alice', name: 'Alice', email: 'secret-alice@example.invalid'}],
    ['bob', {id: 'account-private-bob', name: 'Bob'}]
  ]);
  const session = req => {
    const value = String(req.headers.cookie || '').match(/\btest_session=(\w+)/)?.[1];
    return accounts.get(value) || null;
  };
  const settings = {
    store, io, now: options.now || (() => makeClock.time), tmdb: options.tmdb || catalog.tmdb,
    autoStart: options.autoStart ?? false, schedule: options.schedule,
    authorizeSocket: options.authorizeSocket || (socket => !String(socket.handshake.headers.cookie || '').includes('blocked=true')),
    authenticate: options.authenticate || (req => {
      const user = session(req);
      if (!user) throw Object.assign(new Error('Sign in'), {status: 401});
      return {user};
    }),
    resolveSource: async (movieId, context) => {
      calls.push(movieId);
      return options.resolveSource ? options.resolveSource(movieId, calls.length, context) : FILM;
    }
  };
  const service = createMovieNights(settings);
  options.middleware?.(app);
  app.use('/api/movie-nights', service.router);
  t.after(async () => {
    service.close();
    await new Promise(resolve => io.close(resolve));
    await store.close?.();
    await fs.rm(directory, {recursive: true, force: true});
  });
  return {
    service, server, io, app, store, directory, settings, accounts, calls, catalog,
    setTime: time => { makeClock.time = time; },
    request: (who = '') => ({headers: {cookie: who ? 'test_session=' + who : ''}})
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}

function post(base, path, body, who = 'alice', headers = {}) {
  return fetch(base + '/api/movie-nights' + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: base, Cookie: 'test_session=' + who, ...headers},
    body: JSON.stringify(body)
  });
}

async function waitFor(read, predicate) {
  let value;
  for (let attempt = 0; attempt < 100; attempt++) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for expected state: ' + JSON.stringify(value));
}

module.exports = {FRIDAY, START, CLOSE, FILM, setup, listen, post, waitFor};
