'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { getEventListeners } = require('node:events');
const { Worker } = require('node:worker_threads');
const { spawnSync } = require('node:child_process');
const { createPublicFetcher, isPublicAddress } = require('../lib/nuvio-http');
const { resolveNuvioProvider, verifyNuvioSource } = require('../lib/nuvio-provider');

const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n';
async function fixture(t) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, method: req.method, headers: req.headers });
    if (req.url === '/redirect') { res.writeHead(302, { Location: `http://127.0.0.1:${server.address().port}/playlist`, 'Set-Cookie': 'changed=1' }); return res.end(); }
    if (req.url === '/bad.m3u8') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>unavailable</html>'); }
    if (req.url === '/missing.m3u8') { res.writeHead(404, { 'Content-Type': 'application/vnd.apple.mpegurl' }); return res.end(playlist); }
    if (req.url === '/empty.m3u8') { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); return res.end(); }
    if (req.url === '/large') { res.writeHead(200); return res.end('x'.repeat(4096)); }
    if (req.url === '/gzip') { res.writeHead(200, { 'Content-Type':'application/json', 'Content-Encoding':'gzip' }); return res.end(zlib.gzipSync('{"sources":[]}')); }
    if (req.url === '/slow') { res.writeHead(200); res.write('waiting'); return; }
    if (req.url === '/movie.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '999999999' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(playlist);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetchResource = createPublicFetcher({ addressAllowed: () => true });
  return { base, requests, fetchResource };
}

test('the Nuvio HTTP boundary rejects local, reserved, and mapped addresses', async () => {
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','100.64.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:7f00:1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  const fetchResource = createPublicFetcher({ lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
  await assert.rejects(fetchResource('https://public.example/'), /public|remote|address/i);
});

test('redirects strip media credentials when crossing origins', async t => {
  const f = await fixture(t);
  const input = f.base.replace('127.0.0.1', 'localhost') + '/redirect';
  await f.fetchResource(input, { headers: { Cookie: 'private=1', Authorization: 'Bearer private', Referer: 'https://player.example/' } });
  assert.equal(f.requests[0].headers.cookie, 'private=1');
  assert.equal(f.requests[1].headers.cookie, undefined);
  assert.equal(f.requests[1].headers.authorization, undefined);
  assert.equal(f.requests[1].headers.referer, 'https://player.example/');
});

test('HTTP body limits and cancellation end owned requests', async t => {
  const f = await fixture(t);
  await assert.rejects(f.fetchResource(f.base+'/large', { maxBytes: 1024 }), /large|limit/i);
  const abort = new AbortController();
  const request = f.fetchResource(f.base+'/slow', { signal: abort.signal });
  setTimeout(() => abort.abort(new Error('lookup cancelled')), 30);
  await assert.rejects(request, /cancel|abort/i);
});
test('compressed API bodies are decoded like native fetch', async t => {
  const f=await fixture(t);
  const response=await f.fetchResource(f.base+'/gzip');
  assert.deepEqual(await response.json(),{sources:[]});
});
test('invalid URLs and aborted DNS leave no request listeners behind', async () => {
  const signal=new AbortController();
  const fetchResource=createPublicFetcher({lookup:()=>new Promise(()=>{})});
  await assert.rejects(fetchResource('invalid',{signal:signal.signal}));
  assert.equal(getEventListeners(signal.signal,'abort').length,0);
  const pending=fetchResource('https://public.example/',{signal:signal.signal});
  setTimeout(()=>signal.abort(new Error('lookup cancelled')),20);
  await assert.rejects(pending,/lookup cancelled/);
  assert.equal(getEventListeners(signal.signal,'abort').length,0);
});

test('only a successful manifest becomes a verified source, preserving its headers', async t => {
  const f = await fixture(t);
  for (const endpoint of ['/bad.m3u8','/missing.m3u8']) assert.equal(await verifyNuvioSource({ url: f.base+endpoint }, { fetchResource: f.fetchResource }), null);
  const source = await verifyNuvioSource({ url: f.base+'/playlist', type: 'hls', headers: { Referer: 'https://player.example/', Cookie: 'session=1' } }, { fetchResource: f.fetchResource });
  assert.equal(source.format, 'm3u8');
  assert.equal(source.mediaVerified, true);
  assert.equal(source.headers.cookie, 'session=1');
  assert.equal(f.requests.at(-1).headers.referer, 'https://player.example/');
});
test('empty manifest responses never become playable sources',async t=>{
  const f=await fixture(t);
  assert.equal(await verifyNuvioSource({url:f.base+'/empty.m3u8'},{fetchResource:f.fetchResource}),null);
});

test('direct movie files are verified with HEAD without buffering the movie', async t => {
  const f = await fixture(t);
  const source = await verifyNuvioSource({ url: f.base+'/movie.mp4' }, { fetchResource: f.fetchResource });
  assert.equal(source.format, 'mp4');
  assert.equal(f.requests[0].method, 'HEAD');
});

test('Nuvio verification rejects the known protection clip instead of forwarding it to the player', async () => {
  const source = await verifyNuvioSource({ url: 'https://media.example/protected-content', type: 'mp4' }, {
    fetchResource: async () => new Response(null, { headers: require('./fixtures/provider-warning-response.json') })
  });
  assert.equal(source, null);
});

function workerFactory(filename, options) {
  return new Worker(filename, { ...options, workerData: { ...options.workerData, adapterPath: path.join(__dirname,'fixtures','nuvio-adapter.cjs') } });
}
function currentVidlinkQuality(quality, overrides = {}) {
  return { type: 'mp4', url: `https://media.example/${quality}.mp4?token=fixture`, codecName: 'hevc', se: 1, ep: 1, headers: {}, requiresProxy: true, ...overrides };
}
function currentVidlinkPayload(qualities) {
  return { sourceId: 'fixture-source', stream: { id: 'fixture-stream', type: 'file', deliveryType: 'file', qualities, captions: [] } };
}
function pinnedVidlinkUpstream({ payload, status = 200, finalUrl, helperPayload = {}, metadataPayload = {}, mediaResponse = () => new Response(null, { headers: { 'content-type': 'video/mp4' } }) }) {
  const requests = [];
  return { requests, fetchResource: async (url, options = {}) => {
    requests.push({ url, ...options });
    const target = new URL(url);
    if (target.hostname === 'enc-dec.app') return new Response(JSON.stringify({ result: 'encrypted-title-id', ...helperPayload }), { headers: { 'content-type': 'application/json' } });
    if (target.hostname === 'api.themoviedb.org') return new Response(JSON.stringify({ name: 'Test show', first_air_date: '2022-01-01', ...metadataPayload }), { headers: { 'content-type': 'application/json' } });
    if (target.hostname === 'vidlink.pro') {
      const response = new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
      if (finalUrl) Object.defineProperty(response, 'url', { value: finalUrl });
      return response;
    }
    if (target.hostname === 'media.example') return mediaResponse(url, options);
    throw new Error('Unexpected fixture upstream');
  } };
}
test('the pinned VidLink worker verifies the highest current file quality and preserves proxy metadata', async () => {
  const upstream = pinnedVidlinkUpstream({ payload: currentVidlinkPayload({
    360: currentVidlinkQuality(360),
    480: currentVidlinkQuality(480),
    1080: currentVidlinkQuality(1080, { codecName: 'HEVC', headers: { Host: 'media.example', Connection: 'keep-alive', 'Content-Length': '1', Referer: 'https://vidlink.pro/' } })
  }) });
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', season: '1', episode: '1', timeoutMs: 2000, fetchResource: upstream.fetchResource });
  assert.equal(result.ok, true);
  assert.equal(result.source.url, 'https://media.example/1080.mp4?token=fixture');
  assert.equal(result.source.quality, '1080p');
  assert.equal(result.source.format, 'mp4');
  assert.equal(result.source.mediaVerified, true);
  assert.equal(result.source.requiresProxy, true);
  assert.equal(result.source.codecName, 'hevc');
  assert.deepEqual(result.source.headers, { referer: 'https://vidlink.pro/' });
  assert.deepEqual(upstream.requests.filter(request => new URL(request.url).hostname === 'media.example').map(request => ({ method: request.method, maxBytes: request.maxBytes })), [{ method: 'HEAD', maxBytes: 1024 * 1024 }]);
});
test('current VidLink files must pass HTTP verification before falling back to a lower quality', async () => {
  const upstream = pinnedVidlinkUpstream({ payload: currentVidlinkPayload({
    360: currentVidlinkQuality(360, { codecName: 'hevc\nprivate' }),
    480: currentVidlinkQuality(480),
    1080: currentVidlinkQuality(1080)
  }), mediaResponse: url => new URL(url).pathname === '/1080.mp4'
    ? new Response(null, { status: 403, headers: { 'content-type': 'video/mp4' } })
    : new URL(url).pathname === '/480.mp4'
      ? new Response('<html>unavailable</html>', { headers: { 'content-type': 'text/html' } })
      : new Response(null, { headers: { 'content-type': 'video/mp4' } }) });
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', timeoutMs: 2000, fetchResource: upstream.fetchResource });
  assert.equal(result.ok, true);
  assert.equal(result.source.quality, '360p');
  assert.equal(result.source.codecName, undefined);
  assert.equal(result.source.requiresProxy, true);
  assert.deepEqual(upstream.requests.filter(request => request.method === 'HEAD').map(request => new URL(request.url).pathname), ['/1080.mp4', '/480.mp4', '/360.mp4']);
});
test('current VidLink file qualities must belong to the selected TV season and episode', async () => {
  const upstream = pinnedVidlinkUpstream({ payload: currentVidlinkPayload({
    2160: currentVidlinkQuality(2160),
    1080: currentVidlinkQuality(1080, { se: 2, ep: 4 }),
    720: currentVidlinkQuality(720, { se: undefined, ep: undefined }),
    480: currentVidlinkQuality(480, { se: 2, ep: 3 })
  }) });
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', season: '2', episode: '3', timeoutMs: 2000, fetchResource: upstream.fetchResource });
  assert.equal(result.ok, true);
  assert.equal(result.source.quality, '480p');
  assert.deepEqual(upstream.requests.filter(request => request.method === 'HEAD').map(request => new URL(request.url).pathname), ['/480.mp4']);
  assert(upstream.requests.some(request => new URL(request.url).pathname === '/api/b/tv/encrypted-title-id/2/3'));
});
test('current VidLink compatibility only reads successful responses from the requested source endpoint', async t => {
  const current = currentVidlinkPayload({ 1080: currentVidlinkQuality(1080) });
  for (const [name, response] of [
    ['helper and metadata bodies', { payload: {}, helperPayload: current, metadataPayload: current }],
    ['rejected source response', { payload: current, status: 403 }],
    ['another response host', { payload: current, finalUrl: 'https://other.example/api/b/tv/encrypted-title-id/1/1' }],
    ['another media type', { payload: current, finalUrl: 'https://vidlink.pro/api/b/movie/encrypted-title-id' }],
    ['another episode', { payload: current, finalUrl: 'https://vidlink.pro/api/b/tv/encrypted-title-id/1/2' }],
    ['another encrypted title', { payload: current, finalUrl: 'https://vidlink.pro/api/b/tv/another-title-id/1/1' }]
  ]) await t.test(name, async () => {
    const upstream = pinnedVidlinkUpstream(response);
    const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', timeoutMs: 2000, fetchResource: upstream.fetchResource });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'no_source');
    assert.equal(upstream.requests.some(request => request.method === 'HEAD'), false);
  });
});
test('legacy VidLink playlists remain verified when current file qualities are rejected', async () => {
  const payload = currentVidlinkPayload({ 1080: currentVidlinkQuality(1080) });
  payload.stream.playlist = 'https://media.example/master.m3u8';
  const upstream = pinnedVidlinkUpstream({ payload, mediaResponse: url => new URL(url).pathname === '/master.m3u8'
    ? new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
    : new Response(null, { status: 404, headers: { 'content-type': 'video/mp4' } }) });
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', timeoutMs: 2000, fetchResource: upstream.fetchResource });
  assert.equal(result.ok, true);
  assert.equal(result.source.format, 'm3u8');
  assert.equal(result.source.mediaVerified, true);
  assert.equal(result.source.url, payload.stream.playlist);
  assert.equal(upstream.requests.some(request => request.method === 'HEAD'), true);
});
test('current VidLink compatibility does not bypass the broker body limit', async () => {
  const payload = currentVidlinkPayload({ 1080: currentVidlinkQuality(1080) });
  payload.padding = 'x'.repeat(1024 * 1024);
  const upstream = pinnedVidlinkUpstream({ payload });
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', timeoutMs: 2000, fetchResource: upstream.fetchResource });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no_source');
  assert.equal(upstream.requests.some(request => request.method === 'HEAD'), false);
});
test('cancelling current VidLink file verification aborts the owned request', async () => {
  const signal = new AbortController();
  let started;
  const verificationStarted = new Promise(resolve => { started = resolve; });
  let verificationSignal;
  const upstream = pinnedVidlinkUpstream({ payload: currentVidlinkPayload({ 1080: currentVidlinkQuality(1080) }), mediaResponse: (_url, options) => {
    verificationSignal = options.signal;
    started();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const lookup = resolveNuvioProvider({ provider: 'vidlink', tmdbId: '108978', mediaType: 'tv', signal: signal.signal, timeoutMs: 2000, fetchResource: upstream.fetchResource });
  await Promise.race([verificationStarted, lookup.then(() => { throw new Error('No file verification was attempted'); })]);
  signal.abort(new Error('lookup cancelled'));
  await assert.rejects(lookup, /lookup cancelled/);
  assert.equal(verificationSignal.aborted, true);
});
test('the worker calls the movie/episode adapter and verifies its result in the parent', async () => {
  process.env.NUVIO_TEST_SECRET = 'do-not-pass';
  try {
    let calls=0;
    const result = await resolveNuvioProvider({ provider:'vidsrc', tmdbId:'1', mediaType:'tv', season:'2', episode:'3', createWorker:workerFactory, timeoutMs:2000,
      fetchResource:async (url, options) => {
        calls++;
        if (url.includes('/sources/')) {
          const args = JSON.parse(options.body);
          assert.deepEqual(args, { tmdbId:'1', mediaType:'tv', season:2, episode:3, secret:null });
          return new Response(JSON.stringify([{ url:'https://media.example/master.m3u8', headers:{Referer:'https://player.example/'} }]), {headers:{'content-type':'application/json'}});
        }
        return new Response(playlist, {headers:{'content-type':'application/vnd.apple.mpegurl'}});
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.source.mediaVerified, true);
    assert.equal(result.source.headers.referer, 'https://player.example/');
    assert.equal(calls, 2);
  } finally { delete process.env.NUVIO_TEST_SECRET; }
});
test('cancelling a hung adapter terminates it before returning the slot', async () => {
  const signal = new AbortController();
  let workerExited=false;
  const run=resolveNuvioProvider({provider:'vidsrc',tmdbId:'2',mediaType:'movie',signal:signal.signal,timeoutMs:2000,
    createWorker(filename, options) { const worker=workerFactory(filename,options); worker.once('exit',()=>{workerExited=true;}); return worker; },
    fetchResource:async()=>new Response('')});
  setTimeout(()=>signal.abort(new Error('lookup cancelled')),80);
  await assert.rejects(run,/lookup cancelled/);
  assert.equal(workerExited,true);
});
test('an adapter deadline terminates a hung worker with a safe failure code', async () => {
  const result=await resolveNuvioProvider({provider:'vidsrc',tmdbId:'2',mediaType:'movie',createWorker:workerFactory,timeoutMs:100,fetchResource:async()=>new Response('')});
  assert.equal(result.ok,false);
  assert.equal(result.code,'provider_timeout');
});
test('all three pinned adapters run through the HTTP broker with upstream failures', async () => {
  for (const provider of ['vidsrc','vidlink','videasy']) {
    let requests=0;
    const result=await resolveNuvioProvider({provider,tmdbId:'329865',mediaType:'movie',timeoutMs:2000,
      fetchResource:async()=>{requests++;return new Response('{}',{status:404,headers:{'content-type':'application/json'}});}});
    assert.equal(result.ok,false,provider);
    assert.equal(result.code,'no_source',provider);
    assert(requests>0,provider);
  }
});
test('the pinned VidSrc adapter reports working metadata and a rejected source request without upstream data',async()=>{
  const result=await resolveNuvioProvider({provider:'vidsrc',tmdbId:'550',timeoutMs:2000,
    fetchResource:async url=>new URL(url).hostname==='api.themoviedb.org'
      ?new Response('{"imdb_id":"tt0137523"}')
      :new Response('unavailable',{status:403})});
  assert.equal(result.ok,false);
  assert.equal(result.diagnostics.requests,2);
  assert.equal(result.diagnostics.responses,2);
  assert.equal(result.diagnostics.metadataStatus,200);
  assert.equal(result.diagnostics.upstreamStatus,403);
  assert.equal(result.diagnostics.rejectedResponses,1);
  assert.equal(result.diagnostics.requestErrors,0);
  assert.equal(/https?:|tt0137523|unavailable/.test(JSON.stringify(result.diagnostics)),false);
});
test('the pinned VidLink adapter reports a DNS failure even when it catches the request error',async()=>{
  const result=await resolveNuvioProvider({provider:'vidlink',tmdbId:'550',timeoutMs:2000,
    fetchResource:async()=>{throw Object.assign(new Error('private upstream error'),{code:'EAI_AGAIN'});}});
  assert.equal(result.ok,false);
  assert.equal(result.diagnostics.requests,1);
  assert.equal(result.diagnostics.requestErrors,1);
  assert.equal(result.diagnostics.dnsErrors,1);
  assert.equal(result.diagnostics.responses,0);
  assert.equal(JSON.stringify(result).includes('private upstream error'),false);
});
test('the real VidLink movie adapter uses movie endpoints rather than season one of a TV show',async()=>{
  const paths=[];
  await resolveNuvioProvider({provider:'vidlink',tmdbId:'329865',mediaType:'movie',timeoutMs:2000,
    fetchResource:async url=>{
      paths.push(new URL(url).pathname);
      return new Response(url.includes('enc-vidlink')?'{"result":"encrypted-title-id"}':'{}',{headers:{'content-type':'application/json'}});
    }});
  assert(paths.includes('/3/movie/329865'));
  assert(paths.includes('/api/b/movie/encrypted-title-id'));
  assert.equal(paths.some(path=>path.includes('/tv/')),false);
});
test('the real VidLink TV adapter requests the selected episode in metadata and source endpoints', async () => {
  const paths = [];
  const result = await resolveNuvioProvider({ provider: 'vidlink', tmdbId: '1399', mediaType: 'tv', season: '2', episode: '3', timeoutMs: 2000,
    fetchResource: async url => {
      paths.push(new URL(url).pathname);
      const body = url.includes('enc-vidlink') ? { result: 'encrypted-title-id' }
        : new URL(url).hostname === 'api.themoviedb.org' ? { name: 'Test show', first_air_date: '2011-01-01' } : {};
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no_source');
  assert(paths.includes('/3/tv/1399'));
  assert(paths.includes('/3/tv/1399/season/2/episode/3'));
  assert(paths.includes('/api/b/tv/encrypted-title-id/2/3'));
  assert.equal(paths.some(path => path.includes('/movie/')), false);
});
test('empty or null movie episode arguments still reach the pinned adapter',async()=>{
  for(const value of ['',null]){
    const paths=[];
    await resolveNuvioProvider({provider:'vidlink',tmdbId:'329865',mediaType:'movie',season:value,episode:value,timeoutMs:2000,
      fetchResource:async url=>{paths.push(new URL(url).pathname);return new Response(url.includes('enc-vidlink')?'{"result":"encrypted-title-id"}':'{}',{headers:{'content-type':'application/json'}});}});
    assert(paths.includes('/3/movie/329865'));
  }
});
test('the real VidEasy fanout reaches all ten servers including the final two',async()=>{
  const servers=[];
  await resolveNuvioProvider({provider:'videasy',tmdbId:'329865',mediaType:'movie',timeoutMs:2000,
    fetchResource:async url=>{
      if(url.includes('api.themoviedb.org'))return new Response(JSON.stringify({title:'Test movie',release_date:'2020-01-01',runtime:120,external_ids:{imdb_id:'tt12345'}}));
      if(url.includes('/seed?'))return new Response('{"seed":"test"}');
      servers.push(new URL(url).pathname);
      await new Promise(resolve=>setTimeout(resolve,50));return new Response('{}',{status:404});
    }});
  assert.equal(servers.length,10);
  assert(servers.includes('/superflix/sources-with-title'));
  assert(servers.includes('/1movies/sources-with-title'));
});
test('an invalid upstream status rejects the request without crashing the server process',()=>{
  const script=`
    const http=require('node:http');
    const fetchResource=require('./lib/nuvio-http').createPublicFetcher({addressAllowed:()=>true});
    const server=http.createServer((req,res)=>{res.writeHead(600);res.end('broken upstream');});
    server.listen(0,'127.0.0.1',async()=>{
      try {await fetchResource('http://127.0.0.1:'+server.address().port);process.exitCode=2;}
      catch {console.log('request rejected');}
      finally {server.closeAllConnections();server.close();}
    });`;
  const result=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:2000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/request rejected/);
});
