'use strict';
const { createPublicFetcher, cleanHeaders } = require('./nuvio-http');
const MAX_BYTES=512*1024;

function cueTime(value) {
  const match=value.match(/^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)[.,](\d{3})$/);
  if(!match)return null;
  const hours=Number(match[1]||0),minutes=Number(match[2]),seconds=Number(match[3]),millis=Number(match[4]);
  const total=((hours*60+minutes)*60+seconds)*1000+millis;
  if(total>48*60*60*1000)return null;
  return {total,label:`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${match[4]}`};
}

/** Rebuild cue text, rather than forwarding provider HTML, CSS or metadata. */
function subtitleTextToVtt(input) {
  if(typeof input!=='string'||Buffer.byteLength(input)>MAX_BYTES||input.includes('\u0000'))return null;
  const text=input.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n').trim();
  if(!text||/^(?:<|\{|\[)/.test(text))return null;
  const body=text.replace(/^WEBVTT(?:[^\n]*)?(?:\n|$)/,'').trim();
  const cues=[];
  for(const block of body.split(/\n[\t ]*\n/).slice(0,12000)) {
    const lines=block.split('\n');
    if(/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]))continue;
    const index=lines[0]?.includes('-->')?0:1;
    const timing=lines[index]?.match(/^(\S+)\s+-->\s+(\S+)(?:[\t ]+[^\n]*)?$/);
    if(!timing)continue;
    const start=cueTime(timing[1]),end=cueTime(timing[2]);
    if(!start||!end||end.total<=start.total)continue;
    const caption=lines.slice(index+1).join('\n')
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi,'')
      .replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
    if(!caption||caption.length>16384)continue;
    cues.push(`${start.label} --> ${end.label}\n${caption}`);
  }
  return cues.length?'WEBVTT\n\n'+cues.join('\n\n')+'\n':null;
}

/** Opaque entry lookup only; no request field can supply a remote subtitle URL. */
function createSubtitleProxy({getEntry,fetchResource,lookup,addressAllowed,timeoutMs=8000,maxBytes=MAX_BYTES}={}) {
  if(typeof getEntry!=='function')throw new TypeError('Subtitle entry lookup required');
  const fetchText=fetchResource||createPublicFetcher({...(lookup?{lookup}:{}),...(addressAllowed?{addressAllowed}:{})});
  const limit=Math.max(1,Math.min(MAX_BYTES,Number(maxBytes)||MAX_BYTES));
  return async function subtitleProxy(req,res) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');res.writeHead(405);res.end('Subtitles unavailable');return;}
    const scope=new AbortController();
    const cancel=()=>{if(!res.writableEnded)scope.abort(new Error('Subtitle request cancelled'));};
    req.once('aborted',cancel);res.once('close',cancel);
    const timer=setTimeout(()=>scope.abort(new Error('Subtitle request timed out')),Math.max(1,Math.min(8000,Number(timeoutMs)||8000)));
    try {
      const entry=await getEntry(String(req.params?.id||''));
      scope.signal.throwIfAborted();
      if(!entry?.sourceUrl){res.writeHead(404);res.end('Subtitles unavailable');return;}
      const upstream=await fetchText(entry.sourceUrl,{method:'GET',headers:cleanHeaders(entry.headers||{}),signal:scope.signal,maxBytes:limit,timeoutMs:Math.max(1,Math.min(8000,Number(timeoutMs)||8000))});
      scope.signal.throwIfAborted();
      if(!upstream.ok)throw new Error('Subtitle response unavailable');
      const contentType=String(upstream.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(contentType&&!/^(?:text\/(?:vtt|plain)|application\/(?:x-subrip|octet-stream))$/.test(contentType))throw new Error('Subtitle response invalid');
      if(Number(upstream.headers.get('content-length')||0)>limit)throw new Error('Subtitle response exceeds limit');
      const body=await upstream.text();
      scope.signal.throwIfAborted();
      if(Buffer.byteLength(body)>limit)throw new Error('Subtitle response exceeds limit');
      const vtt=subtitleTextToVtt(body);
      if(!vtt)throw new Error('Subtitle response invalid');
      res.setHeader('Content-Type','text/vtt; charset=utf-8');
      res.setHeader('Content-Length',Buffer.byteLength(vtt));
      res.writeHead(200);res.end(req.method==='HEAD'?undefined:vtt);
    } catch {
      if(!res.destroyed&&!res.headersSent){res.writeHead(502);res.end('Subtitles unavailable');}
      else if(!res.destroyed&&!res.writableEnded)res.destroy();
    } finally {clearTimeout(timer);req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
  };
}
module.exports={subtitleTextToVtt,createSubtitleProxy};
