'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {classifyMediaCandidate,extractMediaCandidates}=require('./media-discovery');
const {createPublicFetcher,cleanHeaders}=require('./nuvio-http');
const PROVIDERS=Object.freeze(['vidsrc','vidlink','videasy']);
const publicFetch=createPublicFetcher();

async function verifyNuvioSource(source,{fetchResource=publicFetch,signal,isNonMediaUrl=()=>false}={}) {
  signal?.throwIfAborted();
  const [candidate]=extractMediaCandidates({sources:[source]},{isNonMediaUrl});
  if(!candidate)return null;
  const headers=cleanHeaders(source.headers||{});
  try {
    const manifest=['m3u8','mpd'].includes(candidate.format);
    const response=await fetchResource(candidate.url,{method:manifest?'GET':'HEAD',headers,signal,maxBytes:1024*1024});
    signal?.throwIfAborted();
    const finalUrl=response.url||candidate.url;
    const verified=classifyMediaCandidate({url:finalUrl,status:response.status,contentType:response.headers.get('content-type'),bodyPrefix:manifest?await response.text():undefined,isNonMediaUrl});
    if(!verified||(manifest&&verified.confidence!==100))return null;
    if(new URL(finalUrl).origin!==new URL(candidate.url).origin){delete headers.cookie;delete headers.authorization;}
    return {...verified,mediaVerified:true,headers,name:String(source.name||'').slice(0,100),quality:String(source.quality||'auto').slice(0,32)};
  } catch {signal?.throwIfAborted();return null;}
}

/** Pinned local code only; each lookup owns one bounded, terminable worker. */
async function resolveNuvioProvider({provider,tmdbId,mediaType='movie',season='1',episode='1',signal,timeoutMs=9000,fetchResource=publicFetch,createWorker=(file,options)=>new Worker(file,options),isNonMediaUrl=()=>false}) {
  signal?.throwIfAborted();
  if(!PROVIDERS.includes(provider)||!/^\d{1,10}$/.test(String(tmdbId))||!['movie','tv'].includes(mediaType)||(mediaType==='tv'&&(!/^[1-9]\d{0,3}$/.test(String(season))||!/^[1-9]\d{0,3}$/.test(String(episode)))))return {ok:false,provider:'nuvio-'+provider,code:'no_source'};
  const scope=new AbortController(),requests=new Map();
  const abort=()=>scope.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>scope.abort(Object.assign(new Error('Provider timeout'),{code:'provider_timeout'})),Math.max(1,timeoutMs));
  let worker,fetchCount=0,totalBytes=0;
  const diagnostics={responses:0,rejectedResponses:0,requestErrors:0,dnsErrors:0,metadataStatus:0,upstreamStatus:0,candidates:0};
  async function observedFetch(url,options) {
    try {
      const response=await fetchResource(url,options);
      diagnostics.responses++;
      if(!response.ok)diagnostics.rejectedResponses++;
      const key=new URL(url).hostname==='api.themoviedb.org'?'metadataStatus':'upstreamStatus';
      diagnostics[key]=response.status;
      return response;
    } catch(error) {
      diagnostics.requestErrors++;
      if(['EAI_AGAIN','ENOTFOUND'].includes(error.code))diagnostics.dnsErrors++;
      throw error;
    }
  }
  const snapshot=()=>({...diagnostics,requests:fetchCount});
  try {
    worker=createWorker(path.join(__dirname,'nuvio-worker.js'),{env:{},stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:48,maxYoungGenerationSizeMb:8},workerData:{adapterPath:path.join(__dirname,'..','vendor','nuvio',provider+'.cjs'),tmdbId:String(tmdbId),mediaType,season:mediaType==='tv'?Number(season):null,episode:mediaType==='tv'?Number(episode):null}});
    worker.stdout?.resume();worker.stderr?.resume();
    const streams=await new Promise((resolve,reject)=> {
      const stop=()=>reject(scope.signal.reason);
      scope.signal.addEventListener('abort',stop,{once:true});
      worker.once('error',()=>reject(new Error('Adapter worker failed')));
      worker.once('exit',()=>reject(new Error('Adapter worker stopped')));
      worker.on('message',message=> {
        if(message.kind==='result'){scope.signal.removeEventListener('abort',stop);resolve(message.streams);return;}
        if(message.kind==='failed'){reject(new Error('Adapter failed'));return;}
        if(message.kind==='cancel'){requests.get(message.id)?.abort();return;}
        if(message.kind!=='fetch'||scope.signal.aborted)return;
        if(++fetchCount>32||requests.size>=10){worker.postMessage({id:message.id,error:true});return;}
        const request=new AbortController();requests.set(message.id,request);
        const cancel=()=>request.abort(scope.signal.reason);scope.signal.addEventListener('abort',cancel,{once:true});
        Promise.resolve().then(async()=> {
          const response=await observedFetch(message.url,{...message.options,signal:request.signal,maxBytes:1024*1024,timeoutMs:Math.min(8000,timeoutMs)});
          const body=new Uint8Array(await response.arrayBuffer());totalBytes+=body.length;
          if(body.length>1024*1024||totalBytes>8*1024*1024)throw new Error('Adapter response limit');
          if(!scope.signal.aborted)worker.postMessage({id:message.id,status:response.status,headers:Object.fromEntries(response.headers),url:response.url||message.url,body});
        }).catch(()=>{if(!scope.signal.aborted)worker.postMessage({id:message.id,error:true});}).finally(()=>{requests.delete(message.id);scope.signal.removeEventListener('abort',cancel);});
      });
    });
    scope.signal.throwIfAborted();
    diagnostics.candidates=streams.length;
    for(const source of streams.slice(0,24)) {
      const verified=await verifyNuvioSource(source,{fetchResource:observedFetch,signal:scope.signal,isNonMediaUrl});
      if(verified)return {ok:true,provider:'nuvio-'+provider,source:{...verified,name:verified.name||'Nuvio '+provider},diagnostics:snapshot()};
    }
    return {ok:false,provider:'nuvio-'+provider,code:'no_source',diagnostics:snapshot()};
  } catch(error) {
    signal?.throwIfAborted();
    return {ok:false,provider:'nuvio-'+provider,code:scope.signal.reason?.code==='provider_timeout'?'provider_timeout':'provider_failed',diagnostics:snapshot()};
  } finally {
    scope.abort();clearTimeout(timer);signal?.removeEventListener('abort',abort);
    for(const request of requests.values())request.abort();
    if(worker)await worker.terminate();
  }
}
module.exports={PROVIDERS,resolveNuvioProvider,verifyNuvioSource};
