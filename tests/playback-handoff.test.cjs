'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlaybackHandoff } = require('../lib/playback-handoff');
const { createVerifiedMediaEntryResolver } = require('../lib/native-source-entry');

function fixture() {
  const sources = [], captions = [];
  const prepare = createPlaybackHandoff({
    registerSource(url, headers, meta) { sources.push({ url, headers, meta }); return { id: String(sources.length), url: `/api/hls-proxy/${sources.length}/master.m3u8` }; },
    registerSubtitle(track) { captions.push(track); return { id: String(captions.length), url: `/api/subtitle-proxy/${captions.length}/track.vtt` }; }
  });
  return { sources, captions, prepare };
}
const primary = { url: 'https://media.example/high.mp4?sig=PRIVATE', format: 'mp4', quality: '1080p', codecName: 'hevc',
  audioLanguage: 'en', mediaVerified: true, requiresProxy: true, headers: { Cookie: 'private=1' } };
const result = { status: 'ok', playbackUrl: '/api/media-file-proxy/current/video.mp4', originalPlaybackUrl: primary.url,
  streamType: 'mp4', streamMode: 'video', streamQuality: '1080p', streamCodec: 'hevc' };

test('handoff includes the selected file and real opaque alternate qualities without exposing credentials', () => {
  const f = fixture();
  const output = f.prepare(result, { source: primary, sources: [primary, { ...primary, url: 'https://media.example/low.mp4?sig=SECRET', quality: '720p', mediaVerified: false }],
    metadata: { movieId: '108978', type: 'tv', season: '2', episode: '3' } });
  assert.deepEqual(output.playbackSources.map(s => [s.streamQuality, s.selected]), [['1080p', true], ['720p', false]]);
  assert.equal(output.playbackSources[0].playbackUrl, result.playbackUrl);
  assert.equal(output.playbackSources[1].playbackUrl, '/api/media-file-proxy/1/video.mp4');
  assert.equal(output.audioLanguage, 'en');
  assert.equal(f.sources[0].meta.verifyBeforePlayback, true);
  assert.equal(f.sources[0].meta.sourceFormat, 'mp4');
  assert.equal(f.sources[0].meta.season, '2');
  assert.equal(f.sources[0].headers.cookie, 'private=1');
  assert.doesNotMatch(JSON.stringify(output.playbackSources), /SECRET|PRIVATE|private=|headers/);
});

test('provider captions become local VTT records and duplicate selected candidates are not re-registered', () => {
  const f = fixture();
  const selected = { ...primary, subtitles: [{ url: 'https://media.example/en.srt?key=SECRET', language: 'English', label: 'English CC' }] };
  const output = f.prepare(result, { source: selected, sources: [selected, selected] });
  assert.equal(output.playbackSources.length, 1);
  assert.equal(output.subtitles.length, 1);
  assert.equal(output.subtitles[0].url, '/api/subtitle-proxy/1/track.vtt');
  assert.equal(output.subtitles[0].language, 'en');
  assert.equal(f.captions[0].headers.cookie, 'private=1');
  assert.doesNotMatch(JSON.stringify(output.subtitles), /SECRET|headers|text\.example/);
});

test('unverified manifests, mismatched episode coordinates and invalid URLs are excluded from options', () => {
  const f = fixture();
  const output = f.prepare(result, { source: primary, sources: [primary,
    { ...primary, url: 'https://media.example/other.mp4', mediaVerified: false, se: 1, ep: 1 },
    { url: 'https://media.example/master.m3u8', format: 'm3u8', mediaVerified: false },
    { url: 'file:///private/movie.mp4', format: 'mp4' }], metadata: { type: 'tv', season: '2', episode: '3' } });
  assert.equal(output.playbackSources.length, 1);
  assert.equal(f.sources.length, 0);
});

test('lazy native candidates are verified once, preserve exact headers, and remain opaque to the client', async () => {
  const entry = { sourceUrl: 'https://media.example/720.mp4', headers: { Referer: 'https://provider.example/', Cookie: 'secret' },
    meta: { sourceFormat: 'mp4', sourceCodec: 'hevc', verifyBeforePlayback: true }, expiresAt: Date.now() + 60000 };
  let calls = 0;
  const get = createVerifiedMediaEntryResolver({ getEntry: () => entry, verifySource: async source => {
    calls++; assert.equal(source.headers.Cookie, 'secret');
    return { url: source.url, format: 'mp4', mediaVerified: true, headers: source.headers, codecName: 'hevc' };
  } });
  assert.equal(await get('opaque', { method: 'OPTIONS' }), entry); assert.equal(calls, 0);
  const replies = await Promise.all([get('opaque'), get('opaque', { method: 'HEAD' })]);
  assert.equal(calls, 1); assert.equal(replies[0], entry); assert.equal(replies[1], entry);
  assert.equal((await get('opaque')).headers.Cookie, 'secret'); assert.equal(calls, 1);
});

test('failed, mismatched-format and expired lazy entries cannot reach the file proxy', async () => {
  for (const verified of [null, { url: 'https://media.example/wrong.m3u8', format: 'm3u8', mediaVerified: true }]) {
    let calls = 0;
    const entry = { sourceUrl: primary.url, headers: {}, meta: { sourceFormat: 'mp4', verifyBeforePlayback: true }, expiresAt: Date.now() + 60000 };
    const get = createVerifiedMediaEntryResolver({ getEntry: () => entry, verifySource: async () => { calls++; return verified; } });
    assert.equal(await get('opaque'), null); assert.equal(await get('opaque'), null); assert.equal(calls, 1);
  }
  let calls = 0;
  const get = createVerifiedMediaEntryResolver({ getEntry: () => ({ ...primary, expiresAt: Date.now() - 1 }), verifySource: () => { calls++; } });
  assert.equal(await get('expired'), null); assert.equal(calls, 0);
});

test('a verified directly playable primary MP4 gets a private download endpoint without changing playback', () => {
  const f = fixture();
  const direct={...primary,requiresProxy:false,mediaVerified:true};
  const original='https://media.example/high.mp4?sig=PRIVATE';
  const output=f.prepare({status:'ok',playbackUrl:original,streamType:'mp4'}, {
    source:direct,sources:[direct],metadata:{movieId:'101',type:'movie'}
  });
  assert.equal(output.playbackUrl,original,'direct playback is unchanged');
  assert.equal(output.downloadUrl,'/api/media-file-proxy/1/video.mp4');
  assert.equal(output.playbackSources[0].downloadUrl,output.downloadUrl);
  assert.equal(f.sources.length,1,'register the selected direct source only once');
  assert.equal(f.sources[0].meta.sourceFormat,'mp4');
  assert.equal(f.sources[0].meta.verifyBeforePlayback,undefined);
  assert.doesNotMatch(output.downloadUrl,/PRIVATE|private=|sig=/,'download endpoint never reveals provider credentials');
});

test('HLS and unverified direct URLs cannot become downloadable MP4s',()=>{
  for (const candidate of [
    {url:'https://media.example/master.m3u8',format:'m3u8',mediaVerified:true},
    {url:'https://media.example/unverified.mp4',format:'mp4',mediaVerified:false}
  ]) {
    const f=fixture();
    const output=f.prepare({status:'ok',playbackUrl:candidate.url}, {source:candidate,sources:[]});
    assert.equal(output.downloadUrl,'');
    assert.equal(f.sources.length,0);
  }
});

test('a transient alternate verification failure cools down then recovers with one shared retry',async()=>{
 let now=Date.now(),calls=0,complete;
 const entry={sourceUrl:'https://media.example/licensed-4k.mp4',headers:{Authorization:'Bearer private'},meta:{sourceFormat:'mp4',verifyBeforePlayback:true},expiresAt:now+60000};
 const get=createVerifiedMediaEntryResolver({getEntry:()=>entry,now:()=>now,verifySource:async source=>{
  calls++;if(calls===1)return null;await new Promise(done=>{complete=done;});return{url:source.url,format:'mp4',mediaVerified:true,headers:source.headers};
 }});
 assert.equal(await get('opaque'),null);assert.equal(calls,1);now+=999;assert.equal(await get('opaque'),null);assert.equal(calls,1);
 now++;const first=get('opaque'),second=get('opaque',{method:'HEAD'});for(let i=0;i<5;i++)await Promise.resolve();assert.equal(calls,2);complete();assert.equal(await first,entry);assert.equal(await second,entry);assert.equal(entry.headers.Authorization,'Bearer private');assert.equal(entry.meta.verifyBeforePlayback,false);assert.equal(await get('opaque'),entry);assert.equal(calls,2);
});
test('lazy retries keep failed entries unavailable during cooldown and cannot revive an expired source',async()=>{
 let now=Date.now(),calls=0;
 const entry={sourceUrl:'https://media.example/licensed.mp4',headers:{},meta:{sourceFormat:'mp4',verifyBeforePlayback:true},expiresAt:now+1500};
 const get=createVerifiedMediaEntryResolver({getEntry:()=>entry,now:()=>now,verifySource:async()=>{calls++;throw Error('temporary upstream failure');}});
 assert.equal(await get('opaque'),null);now+=1000;assert.equal(await get('opaque'),null);assert.equal(calls,2);now+=500;assert.equal(await get('opaque'),null);assert.equal(calls,2);
});
