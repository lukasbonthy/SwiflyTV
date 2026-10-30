'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),zlib=require('node:zlib');
const {createPublicFetcher}=require('../lib/nuvio-http');
const {verifyNuvioSource}=require('../lib/nuvio-provider');
const warning=require('./fixtures/provider-warning-response.json');
async function fixture(t){
 const requests=[],server=http.createServer((req,res)=>{
  const row={method:req.method,path:req.url,sent:0,headers:req.headers};row.closed=new Promise(done=>res.on('close',done));requests.push(row);
  if(req.method==='HEAD'){res.writeHead(405);return res.end();}
  if(req.url==='/ranged-html.mp4'){
   const body=Buffer.from('<!doctype html><html>Source unavailable</html>'),range=req.headers.range?.match(/^bytes=(\d+)-(\d+)$/),start=range?Number(range[1]):0,end=range?Math.min(body.length-1,Number(range[2])):body.length-1;
   res.writeHead(range?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${body.length}`}:{})});return res.end(body.subarray(start,end+1));
  }
  if(req.url==='/small-html.mp4'){res.writeHead(200,{'Content-Type':'video/mp4'});return res.end('<!doctype html><html>Source unavailable</html>');}
  if(req.url==='/warning.mp4'){res.writeHead(206,{'Content-Type':'video/mp4',ETag:warning.etag,'Content-Range':'bytes 0-0/31577','Content-Length':'1'});return res.end(Buffer.from([0]));}
  if(req.url==='/compressed'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Encoding':'gzip'});return res.end(zlib.gzipSync(Buffer.alloc(65536,97)));}
  if(req.url==='/compressed-stall'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Encoding':'gzip'});res.write(zlib.gzipSync(Buffer.alloc(32,97)));return;}
  res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':String(1024*1024)});res.flushHeaders();if(req.url==='/stall')return;
  const timer=setInterval(()=>{row.sent+=2048;res.write(Buffer.alloc(2048,97));if(row.sent>=1024*1024){clearInterval(timer);res.end();}},1);res.on('close',()=>clearInterval(timer));
 });await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>{server.closeAllConnections();return new Promise(done=>server.close(done));});
 return{base:'http://127.0.0.1:'+server.address().port,requests,fetch:createPublicFetcher({addressAllowed:()=>true})};
}
test('explicit prefix fetch stops at its bound when an authorized file server ignores Range',async t=>{
 const f=await fixture(t),r=await f.fetch(f.base+'/licensed.mp4',{headers:{Range:'bytes=0-0'},maxBytes:4096,readPrefix:true});assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,4096);await f.requests[0].closed;assert(f.requests[0].sent<1024*1024,'prefix verification must close the full-file transfer');assert.equal(f.requests[0].headers.range,'bytes=0-0');
});
test('ordinary bounded fetch still rejects oversize bodies',async t=>{
 const f=await fixture(t);await assert.rejects(f.fetch(f.base+'/licensed.mp4',{maxBytes:4096}),/exceeds limit/);
});
test('source verification accepts a public media file when HEAD is unsupported and Range is ignored',async t=>{
 const f=await fixture(t),source=await verifyNuvioSource({url:f.base+'/licensed.mp4',quality:'4K HDR'},{fetchResource:f.fetch});assert.equal(source?.mediaVerified,true);assert.equal(source.quality,'2160p');assert.equal(source.format,'mp4');await f.requests.at(-1).closed;assert(f.requests.at(-1).sent<1024*1024);
});
test('file verification rejects HTML even if it is mislabeled as video',async t=>{
 const f=await fixture(t);assert.equal(await verifyNuvioSource({url:f.base+'/small-html.mp4'},{fetchResource:f.fetch}),null);
});
test('file verification inspects enough bytes to reject HTML from a server honoring Range',async t=>{
 const f=await fixture(t);assert.equal(await verifyNuvioSource({url:f.base+'/ranged-html.mp4'},{fetchResource:f.fetch}),null);
});
test('a partial known protection clip remains unavailable when HEAD is unsupported',async t=>{
 const f=await fixture(t);assert.equal(await verifyNuvioSource({url:f.base+'/warning.mp4'},{fetchResource:f.fetch}),null);
});
test('prefix bounds apply to decoded compressed data while strict reads retain their limit',async t=>{
 const f=await fixture(t),r=await f.fetch(f.base+'/compressed',{maxBytes:1024,readPrefix:true});assert.equal((await r.arrayBuffer()).byteLength,1024);await assert.rejects(f.fetch(f.base+'/compressed',{maxBytes:1024}),/exceeds limit/);
});
test('aborting a prefix request closes a stalled upstream and retains the caller reason',async t=>{
 const f=await fixture(t),controller=new AbortController();const pending=f.fetch(f.base+'/stall',{maxBytes:1024,readPrefix:true,signal:controller.signal});while(!f.requests.length)await new Promise(setImmediate);controller.abort(Error('prefix cancelled'));await assert.rejects(pending,/prefix cancelled/);await f.requests[0].closed;
});
test('cancelling a compressed prefix before its cap closes the real decoder',async t=>{
 const f=await fixture(t),controller=new AbortController(),original=Object.getOwnPropertyDescriptor(zlib,'createGunzip');let decoder,closed,decoded;
 const received=new Promise(done=>decoded=done);
 Object.defineProperty(zlib,'createGunzip',{...original,value:(...args)=>{decoder=original.value(...args);closed=new Promise(done=>decoder.once('close',done));decoder.once('data',decoded);return decoder;}});
 t.after(()=>{controller.abort();decoder?.destroy();Object.defineProperty(zlib,'createGunzip',original);});
 const pending=f.fetch(f.base+'/compressed-stall',{maxBytes:4096,readPrefix:true,signal:controller.signal});await received;controller.abort(Error('compressed prefix cancelled'));await assert.rejects(pending,/compressed prefix cancelled/);
 assert.equal(decoder.destroyed,true,'cancellation must free the native decoder before returning');await closed;assert.equal(decoder.closed,true);await f.requests[0].closed;
});
