'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  PROVIDERS,configuredAddonUrl,streamEndpoint,entryProvider,entryQuality,addonCandidates,resolveAddonProvider
}=require('../lib/addon-provider-bridge');

test('four adapter names are recognized only by their provider heading',()=>{
  assert.deepEqual(PROVIDERS,['4khdhub','uhdmovies','moviesdrive','showbox']);
  for(const [id,name] of [['4khdhub','4KHDHub'],['uhdmovies','UHDMovies'],['moviesdrive','MoviesDrive'],['showbox','ShowBox']]) {
    assert.equal(entryProvider({name:name+' - UHD'}),id);
  }
  assert.equal(entryProvider({name:'Other Provider',title:'4KHDHub 2160p'}),'');
  assert.equal(entryProvider({name:''}),'');
});

test('URL construction rejects invalid IDs, credentials and non-HTTPS addon origins',()=>{
  const input={tmdbId:'550',mediaType:'movie'};
  assert.equal(streamEndpoint('https://addon.example/manifest.json',input),'https://addon.example/stream/movie/tmdb:550.json');
  assert.equal(streamEndpoint('https://addon.example/private/manifest.json',{tmdbId:'66',mediaType:'tv',season:'2',episode:'7'}),
    'https://addon.example/private/stream/series/tmdb:66:2:7.json');
  for(const base of ['http://addon.example/manifest.json','https://user:secret@addon.example/manifest.json','https://addon.example/?token=abc','javascript:alert(1)'])
    assert.equal(streamEndpoint(base,input),'');
  for(const tmdbId of ['abc','0','12/3','1?4'])assert.equal(streamEndpoint('https://addon.example/',{...input,tmdbId}),'');
  assert.equal(streamEndpoint('https://addon.example/',{tmdbId:'550',mediaType:'tv',season:'0',episode:'1'}),'');
});

test('4K is not inferred from provider branding alone',()=>{
  assert.equal(entryQuality({name:'4KHDHub'},'4khdhub'),'');
  assert.equal(entryQuality({name:'4KHDHub - 1080p'},'4khdhub'),'1080p');
  assert.equal(entryQuality({name:'ShowBox | 4K HDR'},'showbox'),'2160p');
  assert.equal(entryQuality({name:'MoviesDrive',title:'Film [3840x2160] 2160p'},'moviesdrive'),'2160p');
});

test('stream candidates require direct web video and exact provider identification',()=>{
  const fixtures={streams:[
    {name:'4KHDHub',url:'https://cdn.example/non4k.mp4'},
    {name:'4KHDHub - 1080p',url:'https://cdn.example/hd.mp4'},
    {name:'4KHDHub - 2160p',url:'https://cdn.example/uhd.mp4'},
    {name:'Other',title:'4KHDHub 2160p',url:'https://cdn.example/wrong.mp4'},
    {name:'UHDMovies - 2160p',url:'https://cdn.example/movie.mkv'},
    {name:'4KHDHub - 2160p',url:'https://cdn.example/trailer.mp4'},
    {name:'4KHDHub - 2160p',url:'javascript:alert(1)'}
  ]};
  const matches=addonCandidates(fixtures,{provider:'4khdhub',require4k:true});
  assert.deepEqual(matches.map(v=>v.url),['https://cdn.example/uhd.mp4']);
  assert.equal(matches[0].quality,'2160p');
  assert.equal(matches[0].requiresProxy,true);
  assert.deepEqual(addonCandidates(fixtures,{provider:'uhdmovies',require4k:true}),[]);
});

test('one addon response can scan all four providers without naming a single winner in advance',async()=>{
  const sources=addonCandidates({streams:[
    {name:'4KHDHub - 1080p',url:'https://cdn.example/hd.mp4'},
    {name:'UHDMovies - 2160p',url:'https://cdn.example/uhd.mp4'},
    {name:'ShowBox - 2160p',url:'https://cdn.example/showbox.mp4'}
  ]},{provider:'all',require4k:true});
  assert.deepEqual(sources.map(row=>row.quality),['2160p','2160p']);
  assert.equal(sources.some(row=>row.url==='https://cdn.example/hd.mp4'),false);
  const urls=[];
  const result=await resolveAddonProvider({
    provider:'all',tmdbId:'550',mediaType:'movie',require4k:true,
    addonUrl:'https://addon.example/manifest.json',
    fetchResource:async url=>{urls.push(url);return new Response(JSON.stringify({streams:[
      {name:'4KHDHub - 1080p',url:'https://cdn.example/hd.mp4'},
      {name:'UHDMovies - 2160p',url:'https://cdn.example/uhd.mp4'}
    ]}));},
    verifySource:async item=>({...item,mediaVerified:true})
  });
  assert.equal(urls.length,1,'one request covers the configured provider set');
  assert.equal(result.ok,true);
  assert.equal(result.source.quality,'2160p');
});

test('modern addon supports IMDb paths and provider IDs even when display names are movie titles',()=>{
  assert.equal(streamEndpoint('https://addon.example/addons/quality-4k/manifest.json',
    {tmdbId:'157336',imdbId:'tt0816692',mediaType:'movie'}),
    'https://addon.example/addons/quality-4k/stream/movie/tt0816692.json');
  assert.equal(streamEndpoint('https://addon.example/addons/quality-4k/manifest.json',
    {tmdbId:'94997',imdbId:'tt0944947',mediaType:'tv',season:'1',episode:'2'}),
    'https://addon.example/addons/quality-4k/stream/series/tt0944947:1:2.json');
  assert.equal(entryProvider({name:'Interstellar 2014 | 2160p',
    behaviorHints:{doomProviderId:'4khdhub'}}),'4khdhub');
  assert.equal(entryProvider({name:'Interstellar | 2160p',
    behaviorHints:{doomProviderId:'moviesdrive'}}),'moviesdrive');
  assert.equal(entryProvider({name:'Interstellar | 2160p',
    behaviorHints:{doomProviderId:'not-a-provider'}}),'');
  const streams=addonCandidates({streams:[
    {name:'Interstellar 2014 | 2160p',url:'https://cdn.example/movie.mp4',
     behaviorHints:{doomProviderId:'4khdhub',proxyHeaders:{request:{Referer:'https://origin.example/'}}}},
    {name:'Interstellar 2014 | 1080p',url:'https://cdn.example/other.mp4',
     behaviorHints:{doomProviderId:'uhdmovies'}}
  ]},{provider:'all',require4k:true});
  assert.equal(streams.length,1);
  assert.equal(streams[0].quality,'2160p');
  assert.equal(streams[0].headers.referer,'https://origin.example/');
});

test('4K candidate diagnostics separate incompatible containers from failed verification',async()=>{
  const result=await resolveAddonProvider({provider:'all',tmdbId:'550',imdbId:'tt0123456',mediaType:'movie',
    require4k:true,addonUrl:'https://addon.example/manifest.json',
    fetchResource:async()=>new Response(JSON.stringify({streams:[
      {name:'Movie | 2160p',url:'https://media.example/uhd.mkv',behaviorHints:{doomProviderId:'4khdhub'}},
      {name:'Movie | 2160p',url:'https://media.example/uhd.m4v',behaviorHints:{doomProviderId:'uhdmovies'}},
      {name:'Movie | 1080p',url:'https://media.example/hd.mp4',behaviorHints:{doomProviderId:'moviesdrive'}}
    ]}),{headers:{'content-type':'application/json'}}),
    verifySource:async()=>null
  });
  assert.equal(result.ok,false);
  assert.equal(result.diagnostics.responses,1);
  assert.equal(result.diagnostics.candidates,1);
  assert.equal(result.diagnostics.rejectedResponses,1);
  assert.equal(result.diagnostics.requestErrors,1);
});

test('signed 2160p MP4 URLs are considered only with an explicit addon filename',()=>{
  const streams={streams:[
    {name:'Interstellar | 2160p',url:'https://cdn.example/get?video=1',
      behaviorHints:{doomProviderId:'4khdhub',filename:'Interstellar.2160p.mp4'}},
    {name:'Interstellar | 2160p',url:'https://cdn.example/get?video=2',
      behaviorHints:{doomProviderId:'4khdhub',filename:'Interstellar.2160p.mkv'}},
    {name:'Interstellar | 2160p',url:'https://cdn.example/get?video=3',
      behaviorHints:{doomProviderId:'4khdhub'}}
  ]};
  const found=addonCandidates(streams,{provider:'4khdhub',require4k:true});
  assert.deepEqual(found.map(s=>s.url),['https://cdn.example/get?video=1']);
  assert.equal(found[0].format,'mp4');
  assert.equal(found[0].mediaVerified,true===false);
});

test('slow 4K link does not block a second verified candidate',async()=>{
  const checked=[];
  const result=await resolveAddonProvider({
    provider:'all',tmdbId:'157336',imdbId:'tt0816692',
    mediaType:'movie',require4k:true,
    addonUrl:'https://addon.example/addons/quality-4k/manifest.json',
    fetchResource:async()=>new Response(JSON.stringify({streams:[
      {name:'Interstellar | 2160p',url:'https://cdn.example/slow.mp4',
        behaviorHints:{doomProviderId:'4khdhub'}},
      {name:'Interstellar | 2160p',url:'https://cdn.example/fast.mp4',
        behaviorHints:{doomProviderId:'uhdmovies'}},
      {name:'Interstellar | 2160p',url:'https://cdn.example/third.mp4',
        behaviorHints:{doomProviderId:'moviesdrive'}}
    ]})),
    verifySource:async(source,{signal})=>{
      checked.push(source.url);
      if(source.url.endsWith('/fast.mp4'))return {...source,mediaVerified:true};
      return new Promise((resolve,reject)=>{
        if(signal.aborted)return reject(new Error('cancelled'));
        signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});
      });
    }
  });
  assert.equal(result.ok,true);
  assert.equal(result.source.url,'https://cdn.example/fast.mp4');
  assert.equal(result.source.quality,'2160p');
  assert(checked.includes('https://cdn.example/slow.mp4'));
});

test('only a verified 2160p link becomes a playable bridge source',async()=>{
  const lookups=[];
  const fetchResource=async url=>{
    lookups.push(url);
    return new Response(JSON.stringify({streams:[
      {name:'ShowBox - 1080p',url:'https://cdn.example/hd.mp4'},
      {name:'ShowBox - 2160p',url:'https://cdn.example/uhd.mp4'}
    ]}),{headers:{'content-type':'application/json'}});
  };
  const checks=[];
  const result=await resolveAddonProvider({provider:'showbox',tmdbId:'550',mediaType:'movie',addonUrl:'https://addon.example/manifest.json',require4k:true,
    fetchResource,verifySource:async s=>{checks.push(s.url);return {...s,mediaVerified:true};}});
  assert.equal(result.ok,true);
  assert.equal(result.source.quality,'2160p');
  assert.deepEqual(checks,['https://cdn.example/uhd.mp4']);
  assert.equal(lookups[0],'https://addon.example/stream/movie/tmdb:550.json');
});

test('unverified sources, missing config and malformed addon responses remain unavailable',async()=>{
  const input={provider:'moviesdrive',tmdbId:'550',mediaType:'movie',addonUrl:'https://addon.example/'};
  const fake=async()=>new Response(JSON.stringify({streams:[{name:'MoviesDrive - 2160p',url:'https://cdn.example/movie.mp4'}]}));
  const rejected=await resolveAddonProvider({...input,fetchResource:fake,verifySource:async()=>null});
  assert.equal(rejected.ok,false);
  const malformed=await resolveAddonProvider({...input,fetchResource:async()=>new Response('not json'),verifySource:async()=>null});
  assert.equal(malformed.ok,false);
  assert.equal((await resolveAddonProvider({...input,addonUrl:'',fetchResource:fake,verifySource:async()=>null})).ok,false);
});
