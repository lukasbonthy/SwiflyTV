'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createMediaFileProxy } = require('../lib/media-file-proxy');

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function entry(sourceUrl, overrides = {}) {
  return { sourceUrl, headers: {}, meta: { sourceFormat: 'mp4' }, expiresAt: Date.now() + 60_000, ...overrides };
}

async function proxy(t, source, options = {}) {
  const handler = createMediaFileProxy({
    getEntry: () => source,
    addressAllowed: address => address === '127.0.0.1',
    ...options
  });
  return listen(t, (req, res) => {
    req.params = { id: 'opaque-id' };
    Promise.resolve(handler(req, res)).catch(error => {
      assert.fail(`The handler leaked a rejection: ${error.message}`);
    });
  });
}

function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outbound = http.request(url, { method, headers, agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    outbound.on('error', reject);
    outbound.end();
  });
}

const movie = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
async function rangeSource(t, seen = []) {
  return listen(t, (req, res) => {
    seen.push({ method: req.method, headers: req.headers });
    let start = 0, end = movie.length - 1;
    if (req.headers.range) {
      const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      start = first ? Number(first) : Math.max(0, movie.length - Number(last));
      end = first && last ? Math.min(Number(last), end) : end;
      if (start >= movie.length) {
        res.writeHead(416, { 'content-range': `bytes */${movie.length}` });
        res.end('Private upstream diagnostic');
        return;
      }
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${movie.length}`);
    }
    res.setHeader('content-type', 'video/mp4');
    res.setHeader('content-length', end - start + 1);
    res.setHeader('accept-ranges', 'bytes');
    res.end(req.method === 'HEAD' ? undefined : movie.subarray(start, end + 1));
  });
}

test('GET streams a full MP4 and removes a stored verification range', async t => {
  const seen = [];
  const upstream = await rangeSource(t, seen);
  const url = await proxy(t, entry(upstream, {
    headers: { Range: 'bytes=0-3', Referer: 'https://provider.example/watch', Cookie: 'session=verified', Authorization: 'Bearer verified' }
  }));
  const response = await request(url);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, movie);
  assert.equal(response.headers['content-type'], 'video/mp4');
  assert.equal(response.headers['content-length'], String(movie.length));
  assert.equal(response.headers['accept-ranges'], 'bytes');
  assert.equal(response.headers['access-control-allow-origin'], '*');
  assert.match(response.headers['access-control-expose-headers'], /Content-Range/i);
  assert.equal(seen[0].headers.range, undefined);
  assert.equal(seen[0].headers.referer, 'https://provider.example/watch');
  assert.equal(seen[0].headers.cookie, 'session=verified');
  assert.equal(seen[0].headers.authorization, 'Bearer verified');
  assert.equal(seen[0].headers['accept-encoding'], 'identity');
});

test('Explicit MP4 download uses the same temporary proxy source but streams an attachment', async t => {
  const upstream = await rangeSource(t);
  const url = await proxy(t, entry(upstream));
  const regular = await request(url);
  assert.equal(regular.headers['content-disposition'], undefined, 'Normal inline playback is unchanged');
  const downloading = await request(url + '?download=1');
  assert.equal(downloading.status, 200);
  assert.deepEqual(downloading.body, movie, 'The complete video is streamed from the existing verified MP4');
  assert.match(downloading.headers['content-disposition'] || '', /^attachment; filename="swiflytv-opaque-id\.mp4"$/);
  const head = await request(url + '?download=1', {method:'HEAD'});
  assert.equal(head.status, 200);
  assert.match(head.headers['content-disposition'] || '', /^attachment/);
  const partial = await request(url + '?download=1', {headers:{Range:'bytes=0-3'}});
  assert.equal(partial.status, 206);
  assert.deepEqual(partial.body, movie.subarray(0,4),'Resume/range support is preserved');
});

for (const [range, start, end] of [
  ['bytes=0-3', 0, 3], ['bytes=10-17', 10, 17], ['bytes=30-', 30, movie.length - 1], ['bytes=-5', movie.length - 5, movie.length - 1]
]) {
  test(`GET forwards ${range} and preserves the partial response`, async t => {
    const seen = [];
    const url = await proxy(t, entry(await rangeSource(t, seen)));
    const response = await request(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.deepEqual(response.body, movie.subarray(start, end + 1));
    assert.equal(response.headers['content-length'], String(end - start + 1));
    assert.equal(response.headers['content-range'], `bytes ${start}-${end}/${movie.length}`);
    assert.equal(seen[0].headers.range, range);
  });
}

test('HEAD forwards HEAD and preserves file headers without a body', async t => {
  const seen = [];
  const url = await proxy(t, entry(await rangeSource(t, seen)));
  const response = await request(url, { method: 'HEAD', headers: { Range: 'bytes=4-8' } });
  assert.equal(response.status, 206);
  assert.equal(response.body.length, 0);
  assert.equal(response.headers['content-length'], '5');
  assert.equal(response.headers['content-range'], `bytes 4-8/${movie.length}`);
  assert.equal(seen[0].method, 'HEAD');
});

test('a successful HTML response cannot be served at the media proxy origin', async t => {
  const upstream = await listen(t, (_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<script>PRIVATE_UPSTREAM_SCRIPT</script>');
  });
  const response = await request(await proxy(t, entry(upstream)));
  assert.equal(response.status, 502);
  assert.doesNotMatch(response.body.toString(), /PRIVATE_UPSTREAM_SCRIPT|<script/);
});

test('a verified MP4 with a generic binary MIME is served as video with nosniff', async t => {
  const upstream = await listen(t, (_, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(movie);
  });
  const response = await request(await proxy(t, entry(upstream)));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, movie);
  assert.equal(response.headers['content-type'], 'video/mp4');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('OPTIONS answers preflight without contacting the upstream', async t => {
  let hits = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.end(); });
  const url = await proxy(t, entry(upstream));
  const response = await request(url, { method: 'OPTIONS' });
  assert.equal(response.status, 204);
  assert.equal(response.body.length, 0);
  assert.equal(response.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
  assert.match(response.headers['access-control-allow-headers'], /Range/i);
  assert.equal(hits, 0);
});

test('missing, expired, and non-MP4 entries return 404 before lookup or HTTP', async t => {
  let hits = 0, lookups = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.end(); });
  for (const source of [null, entry(upstream, { expiresAt: Date.now() - 1 }), entry(upstream, { meta: {} }), entry(upstream, { meta: { sourceFormat: 'm3u8' } })]) {
    const url = await proxy(t, source, { lookup: async () => { lookups++; return []; } });
    assert.equal((await request(url)).status, 404);
    assert.equal((await request(url, { method: 'OPTIONS' })).status, 404);
  }
  assert.equal(hits, 0);
  assert.equal(lookups, 0);
});

test('unsupported methods and malformed byte ranges never contact the upstream', async t => {
  let hits = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.end(); });
  const url = await proxy(t, entry(upstream));
  const post = await request(url, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD, OPTIONS');
  for (const range of ['bytes=', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'items=0-1', 'bytes=banana-']) {
    assert.equal((await request(url, { headers: { Range: range } })).status, 416);
  }
  assert.equal(hits, 0);
});

test('an unsatisfiable range preserves 416 metadata without exposing upstream diagnostics', async t => {
  const url = await proxy(t, entry(await rangeSource(t)));
  const response = await request(url, { headers: { Range: 'bytes=100-' } });
  assert.equal(response.status, 416);
  assert.equal(response.headers['content-range'], `bytes */${movie.length}`);
  assert.doesNotMatch(response.body.toString(), /Private upstream diagnostic/);
});

test('the first chunk arrives before completion and abort destroys the upstream stream', { timeout: 5_000 }, async t => {
  let produced = 0, completed = false, upstreamClosed;
  const closed = new Promise(resolve => { upstreamClosed = resolve; });
  const upstream = await listen(t, (req, res) => {
    res.setHeader('content-type', 'video/mp4');
    res.setHeader('content-length', 1024 * 1024);
    produced += 1024;
    res.write(Buffer.alloc(1024, 0x41));
    const timer = setInterval(() => {
      produced += 1024;
      res.write(Buffer.alloc(1024, 0x42));
      if (produced === 1024 * 1024) { completed = true; clearInterval(timer); res.end(); }
    }, 20);
    res.on('close', () => { clearInterval(timer); upstreamClosed(); });
  });
  const url = await proxy(t, entry(upstream));
  await new Promise((resolve, reject) => {
    const client = http.get(url, { agent: false }, response => {
      response.on('error', () => {});
      response.once('data', chunk => {
        try {
          assert(chunk.length > 0);
          assert.equal(completed, false);
          assert(produced < 1024 * 1024);
          response.destroy();
          client.destroy();
          resolve();
        } catch (error) { reject(error); }
      });
    });
    client.on('error', reject);
  });
  await closed;
  const stoppedAt = produced;
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(produced, stoppedAt);
  assert.equal(completed, false);
});

test('every redirect is resolved and pinned, and cross-origin credentials are stripped', async t => {
  const seen = [], resolved = [];
  const target = await listen(t, (req, res) => { seen.push(req.headers); res.setHeader('content-type', 'video/mp4'); res.end(movie); });
  const targetUrl = target.replace('127.0.0.1', 'target.test');
  const origin = await listen(t, (req, res) => {
    seen.push(req.headers);
    res.writeHead(302, { location: req.url === '/start' ? '/same-origin' : targetUrl });
    res.end();
  });
  const sourceUrl = origin.replace('127.0.0.1', 'source.test') + '/start';
  const url = await proxy(t, entry(sourceUrl, { headers: { Cookie: 'session=SECRET', Authorization: 'Bearer SECRET', Referer: 'https://provider.example/watch' } }), {
    lookup: async (hostname, options) => {
      resolved.push(hostname);
      assert.equal(options.all, true);
      return [{ address: '127.0.0.1', family: 4 }];
    }
  });
  const response = await request(url);
  assert.deepEqual(response.body, movie);
  assert.deepEqual(resolved, ['source.test', 'source.test', 'target.test']);
  assert.equal(seen[0].cookie, 'session=SECRET');
  assert.equal(seen[1].authorization, 'Bearer SECRET');
  assert.equal(seen[2].cookie, undefined);
  assert.equal(seen[2].authorization, undefined);
  assert.equal(seen[2].referer, 'https://provider.example/watch');
});

test('private literal and DNS targets are refused before connecting', async t => {
  let hits = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.end('SECRET'); });
  const direct = await proxy(t, entry(upstream), { addressAllowed: undefined });
  assert.equal((await request(direct)).status, 502);
  const named = await proxy(t, entry(upstream.replace('127.0.0.1', 'private.test')), {
    addressAllowed: undefined,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }]
  });
  assert.equal((await request(named)).status, 502);
  const mixed = await proxy(t, entry(upstream.replace('127.0.0.1', 'mixed.test')), {
    addressAllowed: undefined,
    lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]
  });
  assert.equal((await request(mixed)).status, 502);
  assert.equal(hits, 0);
});

test('redirects to private addresses are refused before contacting the destination', async t => {
  let hits = 0;
  const privateTarget = await listen(t, (_, res) => { hits++; res.end('SECRET'); });
  const origin = await listen(t, (_, res) => { res.writeHead(302, { location: privateTarget }); res.end(); });
  const url = await proxy(t, entry(origin.replace('127.0.0.1', 'public.test')), {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    addressAllowed: (address, url) => address === '127.0.0.1' && url?.hostname === 'public.test'
  });
  const response = await request(url);
  assert.equal(response.status, 502);
  assert.equal(hits, 0);
});

test('credential-bearing and non-HTTP source URLs return a safe error', async t => {
  let hits = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.end(); });
  for (const sourceUrl of [upstream.replace('http://', 'http://user:SECRET@'), 'file:///SECRET/movie.mp4']) {
    const url = await proxy(t, entry(sourceUrl));
    const response = await request(url);
    assert.equal(response.status, 502);
    assert.doesNotMatch(response.body.toString(), /SECRET|127\.0\.0\.1|file:/);
  }
  assert.equal(hits, 0);
});

test('redirect chains stop after five hops', async t => {
  let hits = 0;
  const upstream = await listen(t, (_, res) => { hits++; res.writeHead(302, { location: '/again' }); res.end(); });
  const url = await proxy(t, entry(upstream));
  const response = await request(url);
  assert.equal(response.status, 502);
  assert.equal(hits, 6);
});

test('headers timeout returns a safe error and closes a stalled upstream request', { timeout: 5_000 }, async t => {
  let reportClosed;
  const closed = new Promise(resolve => { reportClosed = resolve; });
  const upstream = await listen(t, (_, res) => { res.on('close', reportClosed); });
  const url = await proxy(t, entry(upstream + '/signed?token=SECRET'), { headersTimeoutMs: 40 });
  const response = await request(url);
  assert.equal(response.status, 504);
  assert.doesNotMatch(response.body.toString(), /SECRET|127\.0\.0\.1/);
  await closed;
});

test('idle timeout closes an upstream body that stalls after headers', { timeout: 5_000 }, async t => {
  let reportClosed;
  const closed = new Promise(resolve => { reportClosed = resolve; });
  const upstream = await listen(t, (_, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '100' });
    res.write('first');
    res.on('close', reportClosed);
  });
  const url = await proxy(t, entry(upstream), { idleTimeoutMs: 40 });
  await new Promise((resolve, reject) => {
    const client = http.get(url, { agent: false }, response => {
      response.on('error', () => {});
      response.once('aborted', resolve);
      response.once('end', () => reject(new Error('A stalled incomplete body must be aborted')));
      response.resume();
    });
    client.on('error', reject);
  });
  await closed;
});

// Synthetic metadata only: no third-party video is retained in these fixtures.
function hevcFile() {
  const box = (type, ...parts) => {
    const payload = Buffer.concat(parts), header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8);
    header.write(type, 4);
    return Buffer.concat([header, payload]);
  };
  const config = Buffer.alloc(23);
  config[0] = 1; config[21] = 3; config[22] = 3;
  const hvcc = box('hvcC', config, ...[32, 33, 34].map(type => Buffer.from([type, 0, 1, 0, 3, type << 1, 1, 128])));
  const count = Buffer.alloc(8); count.writeUInt32BE(1, 4);
  return Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stsd', count, box('hev1', Buffer.alloc(78), hvcc))))))),
    box('mdat', Buffer.from('unchanged encoded bytes: hev1 hvcC'))
  ]);
}

async function hevcSource(t, { seen = [], probeStatus = 206, probeType = 'video/mp4', probeDelay = 0, changed = false } = {}) {
  const file = hevcFile();
  const url = await listen(t, (req, res) => {
    seen.push({ method: req.method, headers: req.headers });
    const isProbe = req.headers.range === 'bytes=0-65535';
    let start = 0, end = file.length - 1;
    if (req.headers.range) {
      const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      start = first ? Number(first) : Math.max(0, file.length - Number(last));
      end = first && last ? Math.min(Number(last), end) : end;
      res.statusCode = isProbe ? probeStatus : 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${file.length}`);
    }
    res.setHeader('content-type', isProbe ? probeType : 'video/mp4');
    res.setHeader('content-length', end - start + 1);
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('etag', !isProbe && changed ? '"replacement"' : '"original"');
    res.setHeader('last-modified', 'Wed, 14 Oct 2026 00:00:00 GMT');
    const finish = () => res.end(req.method === 'HEAD' ? undefined : file.subarray(start, end + 1));
    if (isProbe && probeDelay) setTimeout(finish, probeDelay); else finish();
  });
  return { url, file };
}

const hevcEntry = sourceUrl => entry(sourceUrl, { meta: { sourceFormat: 'mp4', sourceCodec: 'hevc' },
  headers: { Range: 'bytes=0-1', 'If-Range': 'old', Referer: 'https://provider.example/', 'X-Playback-Token': 'verified' } });

test('HEVC proxy serves hvc1 and complete parameter sets without changing media bytes or lengths', async t => {
  const seen = [], { url: upstream, file } = await hevcSource(t, { seen });
  const url = await proxy(t, hevcEntry(upstream));
  const response = await request(url);
  const expected = Buffer.from(file), sample = file.indexOf('hev1'), config = file.indexOf('hvcC') + 4;
  expected.write('hvc1', sample);
  for (const offset of [config + 23, config + 31, config + 39]) expected[offset] |= 128;
  assert.deepEqual(response.body, expected);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-length'], String(file.length));
  assert.equal(response.headers.etag, undefined);
  assert.equal(response.headers['last-modified'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(seen.filter(r => r.headers.range === 'bytes=0-65535').length, 1);
  for (const r of seen) {
    assert.equal(r.headers['if-range'], undefined);
    assert.equal(r.headers.referer, 'https://provider.example/');
    assert.equal(r.headers['x-playback-token'], 'verified');
    assert.equal(r.headers['user-agent'], undefined);
  }
});

test('HEVC compatibility preserves Safari two-byte probes, split header ranges and seeks using one cached probe', async t => {
  const seen = [], { url: upstream, file } = await hevcSource(t, { seen, probeDelay: 25 });
  const url = await proxy(t, hevcEntry(upstream));
  const sample = file.indexOf('hev1');
  const ranges = [['bytes=0-1', 0, 1], [`bytes=${sample + 1}-${sample + 2}`, sample + 1, sample + 2],
    [`bytes=${file.length - 10}-`, file.length - 10, file.length - 1], ['bytes=-5', file.length - 5, file.length - 1]];
  const replies = await Promise.all(ranges.map(async ([range, start, end]) => {
    const response = await request(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers['content-range'], `bytes ${start}-${end}/${file.length}`);
    assert.equal(response.headers['content-length'], String(end - start + 1));
    return response.body;
  }));
  assert.deepEqual(replies[0], file.subarray(0, 2));
  assert.equal(replies[1].toString(), 'vc');
  assert.deepEqual(replies[2], file.subarray(file.length - 10));
  assert.deepEqual(replies[3], file.subarray(file.length - 5));
  assert.equal(seen.filter(r => r.headers.range === 'bytes=0-65535').length, 1);
});

test('HEVC HEAD and OPTIONS do not fetch a compatibility body', async t => {
  const seen = [], { url: upstream, file } = await hevcSource(t, { seen });
  const url = await proxy(t, hevcEntry(upstream));
  const head = await request(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], String(file.length));
  assert.equal(head.headers.etag, undefined);
  assert.equal(head.body.length, 0);
  assert.equal((await request(url, { method: 'OPTIONS' })).status, 204);
  assert.deepEqual(seen.map(r => r.method), ['HEAD']);
});

test('unusable compatibility probes leave the original media untouched', async t => {
  for (const options of [{ probeStatus: 200 }, { probeType: 'text/html' }, { changed: true }]) {
    const { url: upstream, file } = await hevcSource(t, options);
    const response = await request(await proxy(t, hevcEntry(upstream)));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, file);
  }
});

test('an unusable HEVC header is inspected only once for the registered entry lifetime', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const seen = [], { url: upstream, file } = await hevcSource(t, { seen, probeStatus: 200 });
  const url = await proxy(t, hevcEntry(upstream));
  assert.deepEqual((await request(url)).body, file);
  t.mock.timers.tick(6_000);
  assert.deepEqual((await request(url)).body, file);
  assert.equal(seen.filter(r => r.headers.range === 'bytes=0-65535').length, 1);
});
