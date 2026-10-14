'use strict';
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const zlib = require('node:zlib');

function untilAborted(task,signal) {
  return new Promise((resolve,reject)=> {
    const stop=()=>{signal.removeEventListener('abort',stop);reject(signal.reason);};
    signal.addEventListener('abort',stop,{once:true});
    Promise.resolve(task).then(value=>{signal.removeEventListener('abort',stop);resolve(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
    if(signal.aborted)stop();
  });
}

function isPublicAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || (b===0 && c<=2))) || (a===198 && (b===18 || b===19 || b===51)) || (a===203 && b===0 && c===113));
  }
  if (version === 6) return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  return false;
}

function cleanHeaders(input={}) {
  const result={};
  for(const [key,value] of new Headers(input)) {
    if (/^(?:host|connection|content-length|transfer-encoding|proxy-authorization|proxy-connection)$/i.test(key)) continue;
    if(value.length<=16384 && !/[\r\n]/.test(value)) result[key]=value;
  }
  return result;
}

/** Resolve and pin public addresses for every hop, including redirects. */
function createPublicFetcher({lookup=(host,options)=>dns.lookup(host,options),addressAllowed=isPublicAddress}={}) {
  return async function fetchResource(input,{method='GET',headers={},body=null,signal,maxBytes=1024*1024,timeoutMs=8000,redirect='follow'}={}) {
    const scope=new AbortController();
    const abort=()=>scope.abort(signal.reason);
    signal?.throwIfAborted(); signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>scope.abort(new Error('Nuvio request timed out')),Math.max(1,timeoutMs));
    try {
      let target=new URL(String(input)),requestHeaders=cleanHeaders(headers),requestMethod=String(method).toUpperCase();
      if(!['GET','POST','HEAD'].includes(requestMethod))throw new Error('Unsupported request method');
      if(body!=null && Buffer.byteLength(body)>512*1024)throw new Error('Request body too large');
      requestHeaders['accept-encoding']='identity';
      for(let hop=0;hop<=5;hop++) {
        scope.signal.throwIfAborted();
        if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.href.length>16384) throw new Error('Invalid remote URL');
        const hostname=target.hostname.replace(/^\[|\]$/g,'');
        const addresses=net.isIP(hostname)?[{address:hostname,family:net.isIP(hostname)}]:await untilAborted(lookup(hostname,{all:true,verbatim:true}),scope.signal);
        scope.signal.throwIfAborted();
        if(!addresses.length||addresses.some(item=>!addressAllowed(item.address))) throw new Error('Remote address is not public');
        const response=await new Promise((resolve,reject)=> {
          const request=(target.protocol==='https:'?https:http).request(target,{method:requestMethod,headers:requestHeaders,signal:scope.signal,
            lookup(_host,options,callback){if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);}
          },incoming=> {
            incoming.on('error',reject);
            if(!Number.isInteger(incoming.statusCode)||incoming.statusCode<200||incoming.statusCode>599){const error=new Error('Unsupported upstream status');reject(error);incoming.destroy(error);return;}
            const chunks=[];let bytes=0;
            const encoding=String(incoming.headers['content-encoding']||'').toLowerCase();
            const decoder=requestMethod==='HEAD'?null:encoding==='gzip'?zlib.createGunzip():encoding==='br'?zlib.createBrotliDecompress():encoding==='deflate'?zlib.createInflate():null;
            const stream=decoder?incoming.pipe(decoder):incoming;
            if(decoder)decoder.on('error',error=>{reject(error);incoming.destroy();});
            stream.on('data',chunk=> {
              bytes+=chunk.length;
              if(bytes>maxBytes){const error=new Error('Response body exceeds limit');reject(error);incoming.destroy(error);return;}
              chunks.push(chunk);
            });
            incoming.on('aborted',()=>reject(new Error('Response aborted')));
            stream.on('end',()=> {
              try {
              const status=incoming.statusCode;
              const raw={};for(const [key,value] of Object.entries(incoming.headers))if(value!=null)raw[key]=Array.isArray(value)?value.join(', '):value;
              const result=new Response(requestMethod==='HEAD'||[204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers:raw});
              Object.defineProperty(result,'url',{value:target.href});resolve(result);
              } catch(error) {reject(error);}
            });
          });
          request.on('error',reject);
          request.end(body);
        });
        if(redirect==='manual'||![301,302,303,307,308].includes(response.status)||!response.headers.get('location')) return response;
        if(hop===5)throw new Error('Redirect limit reached');
        const next=new URL(response.headers.get('location'),target);
        if(next.origin!==target.origin){delete requestHeaders.cookie;delete requestHeaders.authorization;}
        if(response.status===303||(requestMethod==='POST'&&[301,302].includes(response.status))){requestMethod='GET';body=null;delete requestHeaders['content-type'];}
        target=next;
      }
    } catch(error) { if(scope.signal.aborted) throw scope.signal.reason; throw error; }
    finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
}
module.exports={createPublicFetcher,isPublicAddress,cleanHeaders};
