'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {classifyMediaCandidate,isProviderProtectionClip}=require('./media-discovery');
const {createPublicFetcher,cleanHeaders}=require('./nuvio-http');
const {normalizePlaybackSource,normalizeSubtitles,preferPlaybackSources}=require('./playback-options');
const PROVIDERS=Object.freeze(['vidlink','vidsrc','videasy','vidfast','vidrock','cineby','vidlove','goated','netmirror','nakios']);
const NUVIO_CATALOG=require('./nuvio-catalog.json');
function listNuvioProviders() {
  return NUVIO_CATALOG.providers.map(row=>({...row,installed:PROVIDERS.includes(row.id)}));
}
const publicFetch=createPublicFetcher();

// The pinned VidLink adapter understands playlists; the current source API also
// returns movie/episode-scoped file qualities. Read only its bounded response.
function currentVidlinkSources(body,{requestUrl,responseUrl,mediaType,season,episode}) {
  try {
    const target=new URL(requestUrl),final=new URL(responseUrl||requestUrl);
    const sourcePath=mediaType==='tv'?new RegExp('^/api/b/tv/[^/]+/'+Number(season)+'/'+Number(episode)+'$'):/^\/api\/b\/movie\/[^/]+$/;
    if(target.origin!=='https://vidlink.pro'||target.username||target.password||!sourcePath.test(target.pathname)||final.href!==target.href)return [];
    const stream=JSON.parse(Buffer.from(body).toString('utf8'))?.stream;
    if(stream?.type!=='file'||stream.deliveryType!=='file'||!stream.qualities||typeof stream.qualities!=='object'||Array.isArray(stream.qualities))return [];
    const sources=[];
    for(const [quality,file] of Object.entries(stream.qualities)) {
      if(!/^[1-9]\d{1,3}$/.test(quality)||file?.type!=='mp4'||typeof file.url!=='string')continue;
      if(mediaType==='tv') {
        if(String(file.se)!==String(Number(season))||String(file.ep)!==String(Number(episode)))continue;
      } else {
        // Current movie files use paired 0/0; legacy files omit both coordinates.
        if(!((file.se==null&&file.ep==null)||([0,'0'].includes(file.se)&&[0,'0'].includes(file.ep))))continue;
      }
      try {sources.push({url:file.url,type:'mp4',quality:quality+'p',name:'VidLink | '+quality+'p',headers:cleanHeaders(file.headers||{}),requiresProxy:file.requiresProxy===true,codecName:file.codecName,
        audioLanguage:file.audioLanguage||file.audio_language||file.language||file.lang||stream.audioLanguage||stream.audio_language||stream.language||stream.lang||'',
        subtitles:normalizeSubtitles(['captions','subtitles'].flatMap(key=>[...(Array.isArray(file[key])?file[key].slice(0,32):[]),...(Array.isArray(stream[key])?stream[key].slice(0,32):[])]),{baseUrl:requestUrl})});} catch {}
    }
    return sources.sort((a,b)=>parseInt(b.quality)-parseInt(a.quality)).slice(0,24);
  } catch {return [];}
}

async function verifyNuvioSource(source,{fetchResource=publicFetch,signal,isNonMediaUrl=()=>false}={}) {
  signal?.throwIfAborted();
  const candidate=normalizePlaybackSource(source,{isNonMediaUrl});
  if(!candidate)return null;
  const headers=cleanHeaders(source.headers||{});
  const manifest=['m3u8','mpd'].includes(candidate.format);
  const check=async(response,{readPlaylist=false,readPrefix=false}={})=>{
    signal?.throwIfAborted();
    const finalUrl=response.url||candidate.url;
    const verified=classifyMediaCandidate({
      url:finalUrl,status:response.status,contentType:response.headers.get('content-type'),
      responseHeaders:Object.fromEntries(response.headers),
      bodyPrefix:readPlaylist||readPrefix?await response.text():undefined,isNonMediaUrl
    });
    if(!verified||(manifest&&verified.confidence!==100))return null;
    // Redirects may move the media to another host; do not forward source
    // credentials across origins, even when verification has succeeded.
    if(new URL(finalUrl).origin!==new URL(candidate.url).origin){
      delete headers.cookie;delete headers.authorization;
    }
    const codecName=typeof source.codecName==='string'&&/^[a-z0-9][a-z0-9._+-]{0,31}$/i.test(source.codecName)?source.codecName.toLowerCase():'';
    return {...verified,mediaVerified:true,headers,name:candidate.name,quality:candidate.quality||'auto',audioLanguage:candidate.audioLanguage,subtitles:candidate.subtitles,
      ...(source.requiresProxy===true?{requiresProxy:true}:{}),...(codecName?{codecName}:{})};
  };
  try {
    if(manifest){
      const response=await fetchResource(candidate.url,{method:'GET',headers,signal,maxBytes:1024*1024});
      return await check(response,{readPlaylist:true});
    }
    // File hosts sometimes return 405/403/501 to HEAD while serving a
    // normally accessible video with GET. Never fetch the entire file to test.
    try {
      const response=await fetchResource(candidate.url,{method:'HEAD',headers,signal,maxBytes:1024*1024});
      const evidence=Object.fromEntries(response.headers);
      if(isProviderProtectionClip({contentType:response.headers.get('content-type'),responseHeaders:evidence}))return null;
      const found=await check(response);
      if(found)return found;
    }catch(error){signal?.throwIfAborted();}
    // Inspect a bounded Range prefix so hosts honoring Range also supply enough
    // bytes to recognize an HTML error page mislabeled as video. Retain
    // the existing SSRF, redirect, response-size and cancellation protections.
    const response=await fetchResource(candidate.url,{
      method:'GET',headers:{...headers,range:'bytes=0-4095'},signal,maxBytes:4096,readPrefix:true
    });
    return await check(response,{readPrefix:true});
  }catch{
    signal?.throwIfAborted();
    return null;
  }
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
  const currentStreams=[];
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
          if(provider==='vidlink'&&response.ok&&message.options.method==='GET'&&!scope.signal.aborted)currentStreams.push(...currentVidlinkSources(body,{requestUrl:message.url,responseUrl:response.url,mediaType,season,episode}));
          if(!scope.signal.aborted)worker.postMessage({id:message.id,status:response.status,headers:Object.fromEntries(response.headers),url:response.url||message.url,body});
        }).catch(()=>{if(!scope.signal.aborted)worker.postMessage({id:message.id,error:true});}).finally(()=>{requests.delete(message.id);scope.signal.removeEventListener('abort',cancel);});
      });
    });
    scope.signal.throwIfAborted();
    const candidates=[...currentStreams,...(Array.isArray(streams)?streams:[])].slice(0,48)
      .map(source=>normalizePlaybackSource(source,{isNonMediaUrl})).filter(Boolean);
    const sources=preferPlaybackSources(Array.from(new Map(candidates.map(source=>[source.url,{...source,mediaVerified:false}])).values()));
    diagnostics.candidates=sources.length;
    for(let index=0;index<sources.length;index++) {
      const source=sources[index];
      const verified=await verifyNuvioSource(source,{fetchResource:observedFetch,signal:scope.signal,isNonMediaUrl});
      if(verified) {
        const selected={...verified,name:verified.name||'Nuvio '+provider};
        return {ok:true,provider:'nuvio-'+provider,source:selected,sources:[selected,...sources.slice(index+1)],subtitles:selected.subtitles,diagnostics:snapshot()};
      }
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
module.exports={PROVIDERS,NUVIO_CATALOG,listNuvioProviders,resolveNuvioProvider,verifyNuvioSource};
