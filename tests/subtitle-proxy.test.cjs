'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { subtitleTextToVtt, createSubtitleProxy } = require('../lib/subtitle-proxy');

const srt = '1\r\n00:00:01,250 --> 00:00:03,000\r\nHello there\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,500\r\nSecond line\r\n';

test('SRT captions are converted to WebVTT with only valid cue timing', () => {
  assert.equal(subtitleTextToVtt(srt), 'WEBVTT\n\n00:00:01.250 --> 00:00:03.000\nHello there\n\n00:00:04.000 --> 00:00:06.500\nSecond line\n');
  assert.equal(subtitleTextToVtt('1\n00:00:03,000 --> 00:00:01,000\nBackward\n\n2\n00:00:04,000 --> 00:00:05,000\nValid'), 'WEBVTT\n\n00:00:04.000 --> 00:00:05.000\nValid\n');
});

test('VTT style and non-caption responses cannot be passed through as raw HTML or executable markup', () => {
  assert.equal(subtitleTextToVtt('WEBVTT\n\nSTYLE\n::cue { color: red }\n\n00:01.000 --> 00:02.000\n<b>Hello</b><script>private()</script>'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
  for(const body of ['<html>private upstream</html>','{"url":"private"}','WEBVTT\n\nNOTE no cues','1\n99:88:10,000 --> 99:89:00,000\nInvalid']) assert.equal(subtitleTextToVtt(body), null);
});

async function serve(t, handler) {
  const server=http.createServer(handler);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  return `http://127.0.0.1:${server.address().port}`;
}
async function proxyFixture(t, entries, options={}) {
  const handler=createSubtitleProxy({getEntry:id=>entries[id],...options});
  return serve(t, (req,res)=>{req.params={id:req.url.split('/')[1]};void handler(req,res);});
}

test('an opaque subtitle token serves converted text with correct GET, HEAD and OPTIONS headers', async t => {
  const upstream=await serve(t, (_req,res)=>{res.writeHead(200,{'Content-Type':'application/x-subrip'});res.end(srt);});
  const base=await proxyFixture(t,{known:{sourceUrl:upstream+'/captions.srt',headers:{}}},{addressAllowed:()=>true});
  const result=await fetch(base+'/known/track.vtt');
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'text/vtt; charset=utf-8');
  assert.equal(result.headers.get('x-content-type-options'),'nosniff');
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'),'*');
  assert.match(await result.text(),/^WEBVTT\n/);
  const head=await fetch(base+'/known/track.vtt',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  const options=await fetch(base+'/known/track.vtt',{method:'OPTIONS'});
  assert.equal(options.status,204);assert.equal(await options.text(),'');
  assert.match(options.headers.get('access-control-allow-methods'),/GET/);
});

test('subtitle failures are bounded and generic while tokens cannot fetch arbitrary query URLs', async t => {
  const upstream=await serve(t, (req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(req.url==='/large'?'x'.repeat(4096):'<html>private signed upstream</html>');});
  const base=await proxyFixture(t,{html:{sourceUrl:upstream+'/html',headers:{}},large:{sourceUrl:upstream+'/large',headers:{}}},{addressAllowed:()=>true,maxBytes:1024});
  for(const endpoint of ['/html/track.vtt','/large/track.vtt','/missing/track.vtt?url='+encodeURIComponent(upstream+'/html')]) {
    const response=await fetch(base+endpoint);assert([404,502].includes(response.status));
    const body=await response.text();assert.equal(/private|signed|127\.0\.0\.1|html>/.test(body),false);
  }
  const denied=await proxyFixture(t,{known:{sourceUrl:upstream+'/captions.srt',headers:{}}});
  assert.equal((await fetch(denied+'/known/track.vtt')).status,502);
});

test('disconnecting a subtitle consumer cancels its owned upstream request', async t => {
  let requestSignal,notifyStarted;
  const started=new Promise(resolve=>{notifyStarted=resolve;});
  const base=await proxyFixture(t,{known:{sourceUrl:'https://captions.example/slow.srt',headers:{}}},{fetchResource:async(_url,options)=>{
    requestSignal=options.signal;notifyStarted();return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  }});
  const request=http.get(base+'/known/track.vtt');request.on('error',()=>{});
  await started;request.destroy();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(requestSignal.aborted,true);
});

test('subtitle timeouts return a generic unavailable response without leaking the upstream failure', async t => {
  const base=await proxyFixture(t,{known:{sourceUrl:'https://captions.example/slow.srt?private=secret',headers:{}}},{timeoutMs:20,fetchResource:async(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('private upstream token')),{once:true}))});
  const result=await fetch(base+'/known/track.vtt');
  assert.equal(result.status,502);
  assert.equal(await result.text(),'Subtitles unavailable');
});
