'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {addonCandidates,resolveAddonProvider}=require('../lib/addon-provider-bridge');
const {verifyNuvioSource}=require('../lib/nuvio-provider');

// Same public fields as the observed addon response; no signed URLs or tokens.
const pengu=()=>({name:'Interstellar 2014 | 2160p',
  title:'interstellar.2014.2160p.uhd.bluray.x265-terminal.mkv|^|4KMP4BluRayHEVC',
  url:'https://media.example/signed/video.mp4',
  behaviorHints:{doomProviderId:'pengu',notWebReady:true,
    filename:'interstellar.2014.2160p.uhd.bluray.x265-terminal.mkv|^|4KMP4BluRayHEVC'}});

test('the configured addon Pengu MP4 is eligible for the verified 4K path',()=>{
  const rows=addonCandidates({streams:[pengu()]},{provider:'all',require4k:true});
  assert.equal(rows.length,1);
  assert.equal(rows[0].format,'mp4');
  assert.equal(rows[0].quality,'2160p');
  assert.equal(rows[0].codecName,'hevc');
  assert.equal(rows[0].requiresProxy,true);
  assert.notEqual(rows[0].mediaVerified,true);
  assert.match(rows[0].name,/^Pengu/);
});

test('Pengu verification retains the browser header required by its media host',async()=>{
  const addonUrl='https://addon.example/manifest.json';
  const media=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  const fetchResource=async(url,options={})=>{
    if(url==='https://addon.example/stream/movie/tt0816692.json')
      return new Response(JSON.stringify({streams:[pengu()]}));
    assert.equal(url,'https://media.example/signed/video.mp4');
    const headers=new Headers(options.headers);
    if(!/^Mozilla\/5\.0/.test(headers.get('user-agent')||''))return new Response('Blocked',{status:403});
    return new Response(options.method==='HEAD'?null:media,
      {status:options.method==='HEAD'?200:206,headers:{'content-type':'application/octet-stream'}});
  };
  const result=await resolveAddonProvider({provider:'all',tmdbId:'157336',imdbId:'tt0816692',require4k:true,
    addonUrl,fetchResource,verifySource:verifyNuvioSource});
  assert.equal(result.ok,true);
  assert.equal(result.source.mediaVerified,true);
  assert.equal(result.source.format,'mp4');
  assert.equal(result.source.quality,'2160p');
  assert.equal(result.source.codecName,'hevc');
  assert.match(result.source.headers['user-agent'],/^Mozilla\/5\.0/);
});

test('explicit source headers take precedence over bridge defaults',()=>{
  const item=pengu();
  item.behaviorHints.proxyHeaders={request:{'User-Agent':'ProviderPlayer/1',Referer:'https://origin.example/'}};
  const [source]=addonCandidates({streams:[item]},{provider:'pengu',require4k:true});
  assert(source);
  assert.equal(source.headers['user-agent'],'ProviderPlayer/1');
  assert.equal(source.headers.referer,'https://origin.example/');
});

test('adding Pengu does not promote MKV, unknown providers or HD as 4K',()=>{
  const mkv={...pengu(),url:'https://media.example/video.mkv'};
  const spoof={...pengu(),behaviorHints:{doomProviderId:'unknown'},name:'Another source',title:'Pengu 2160p'};
  const hd={...pengu(),name:'Interstellar 2014 | 1080p'};
  assert.deepEqual(addonCandidates({streams:[mkv,spoof,hd]},{provider:'all',require4k:true}),[]);
});

test('Pengu is listed as installed only when its external addon is configured',()=>{
  const script=`const {listNuvioProviders}=require('./lib/nuvio-provider');
    process.stdout.write(JSON.stringify(listNuvioProviders().filter(row=>row.id==='pengu')));`;
  const read=value=>JSON.parse(execFileSync(process.execPath,['-e',script],{
    cwd:require('node:path').join(__dirname,'..'),
    env:{...process.env,SWIFLY_STREMIO_ADDON_URL:value},encoding:'utf8'}));
  const disabled=read('');
  assert(disabled.length===0||disabled.every(row=>row.installed===false));
  const enabled=read('https://addon.example/manifest.json');
  assert.equal(enabled.length,1);
  assert.equal(enabled[0].name,'Pengu');
  assert.equal(enabled[0].installed,true);
  assert(enabled[0].formats.includes('mp4'));
});

test('a Pengu-only 4K search uses the shared addon lookup instead of a nonexistent local adapter',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const body=server.slice(server.indexOf('async function localNuvioGetStreams('),
    server.indexOf('async function localStreamProviderGetStreams('));
  let localCalls=0,addonCalls=0;
  const context={AbortController,Date,setTimeout,clearTimeout,
    NUVIO_ENABLED:true,NUVIO_PROVIDER_ORDER:['pengu'],NUVIO_PROVIDER_TIMEOUT_MS:9000,NUVIO_TIMEOUT_MS:20000,
    runProviderRace:require('../lib/provider-race').runProviderRace,
    has4kSourceQuality:require('../lib/playback-options').has4kSourceQuality,
    apiHasEmbeddableFileExtensionOrHlsProxy:(_url,source)=>source.mediaVerified&&source.format==='mp4',
    apiLooksDefinitelyNonMediaUrl:()=>false,verifyNuvioSource,
    resolveNuvioProvider:async()=>{localCalls++;return {ok:false};},
    resolveAddonProvider:async options=>{
      addonCalls++;assert.equal(options.provider,'all');assert.equal(options.imdbId,'tt0816692');
      return {ok:true,provider:'nuvio-all',source:{url:'https://media.example/movie.mp4',
        format:'mp4',quality:'2160p',mediaVerified:true}};
    }};
  vm.runInNewContext(body+'\nthis.resolve=localNuvioGetStreams;',context);
  const result=await context.resolve({tmdbId:'157336',imdbId:'tt0816692',mediaType:'movie',fourKOnly:true});
  assert.equal(result.winner?.source.quality,'2160p');
  assert.equal(addonCalls,1);
  assert.equal(localCalls,0);
});
