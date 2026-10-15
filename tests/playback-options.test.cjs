'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAudioLanguage, normalizePlaybackSource, normalizeSubtitles, preferPlaybackSources } = require('../lib/playback-options');

test('provider audio language is canonical when explicit and unknown labels stay unknown', () => {
  for (const [input, wanted] of [['English','en'],['eng','en'],['EN-us','en-US'],['Spanish','es'],['pt-br','pt-BR'],['und',''],['Original Audio',''],['Multi-Audio',''],['Unknown',''],['English / Hindi',''],['constructor',''],['__proto__',''],['toString',''],[null,'']]) {
    assert.equal(normalizeAudioLanguage(input), wanted, String(input));
  }
});

test('playback metadata keeps actual quality and audio without inventing English from original audio', () => {
  const source = normalizePlaybackSource({ url:'https://media.example/movie.mp4?token=fixture', type:'mp4', quality:'1080p', name:'VidLink | Original Audio', audioLanguage:'eng', codecName:'HEVC', requiresProxy:true, headers:{Referer:'https://player.example/',Host:'media.example'}, subtitles:[{file:'https://media.example/en.srt',label:'English',language:'eng'}] });
  assert.equal(source.format, 'mp4');
  assert.equal(source.quality, '1080p');
  assert.equal(source.audioLanguage, 'en');
  assert.equal(source.codecName, 'hevc');
  assert.equal(source.requiresProxy, true);
  assert.deepEqual(source.headers, {referer:'https://player.example/'});
  assert.equal(source.subtitles[0].language, 'en');
  const unknown = normalizePlaybackSource({url:'https://media.example/a.mp4',name:'Movie | Original Audio'});
  assert.equal(unknown.audioLanguage, '');
  assert.equal(unknown.quality, '');
  assert.equal(normalizePlaybackSource({url:'https://media.example/trailer.mp4'}), null);
});

test('provider quality labels remain available when adapters put the real resolution in the name', () => {
  assert.equal(normalizePlaybackSource({url:'https://media.example/a.m3u8',name:'VidEasy | 720p | Hindi',quality:''}).quality, '720p');
  assert.equal(normalizePlaybackSource({url:'https://media.example/b.mp4',name:'VidEasy | Original Audio',quality:'auto'}).quality, 'auto');
});

test('known English audio wins before resolution while unknown audio is never relabeled', () => {
  const ordered = preferPlaybackSources([
    {url:'https://media.example/hi.mp4',quality:'2160p',audioLanguage:'hi'},
    {url:'https://media.example/unknown.mp4',quality:'1080p',audioLanguage:''},
    {url:'https://media.example/en.mp4',quality:'720p',audioLanguage:'en-US'},
    {url:'https://media.example/en1080.mp4',quality:'1080p',audioLanguage:'en'}
  ]);
  assert.deepEqual(ordered.map(source => new URL(source.url).pathname), ['/en1080.mp4','/en.mp4','/unknown.mp4','/hi.mp4']);
  assert.equal(ordered[2].audioLanguage, '');
});

test('subtitle metadata accepts provider URL fields and keeps credentials scoped to their origin', () => {
  const tracks = normalizeSubtitles([
    {file:'/english.srt',language:'English',label:'English CC',default:true},
    {src:'https://captions.example/spanish.vtt',lang:'es',name:'Español'},
    {url:'https://captions.example/unknown.vtt',label:'Unspecified'},
    {url:'https://user:secret@captions.example/private.vtt',language:'en'},
    {url:'javascript:alert(1)',language:'en'},
    {url:'https://captions.example/movie.mp4',type:'vtt',language:'en'},
    {url:'/english.srt',language:'English',label:'duplicate'}
  ], {baseUrl:'https://media.example/movie.mp4',headers:{Cookie:'session=fixture',Authorization:'Bearer fixture',Referer:'https://player.example/'}});
  assert.equal(tracks.length, 3);
  assert.equal(tracks[0].url, 'https://media.example/english.srt');
  assert.equal(tracks[0].language, 'en');
  assert.equal(tracks[0].label, 'English CC');
  assert.equal(tracks[0].default, true);
  assert.equal(tracks[0].format, 'srt');
  assert.equal(tracks[0].headers.cookie, 'session=fixture');
  assert.deepEqual(tracks[1].headers, {referer:'https://player.example/'});
  assert.equal(tracks[1].language, 'es');
  assert.equal(tracks[2].language, '');
});

test('subtitle metadata is bounded and malformed providers cannot propagate headers or extra data', () => {
  const tracks = normalizeSubtitles(Array.from({length:80}, (_, i) => ({url:`https://captions.example/${i}.vtt`,label:'x'.repeat(500),headers:{Host:'private',Referer:'https://player.example/'},extra:'private'})));
  assert.equal(tracks.length, 32);
  assert.equal(tracks[0].label.length, 100);
  assert.equal(tracks[0].headers.host, undefined);
  assert.equal(tracks[0].extra, undefined);
  assert.deepEqual(normalizeSubtitles([{url:'https://captions.example/a.vtt',headers:{Referer:'bad\nheader'}}]), []);
});

test('nested caption URLs cannot substitute for a missing or rejected video source', () => {
  assert.equal(normalizePlaybackSource({name:'missing source',subtitles:[{url:'https://captions.example/video.mp4',type:'mp4'}]}),null);
  assert.equal(normalizePlaybackSource({url:'https://media.example/detail.html',subtitles:[{url:'https://captions.example/master.m3u8',type:'hls'}]}),null);
});

test('pinned VidEasy audio labels retain known language while original audio and arbitrary titles stay unknown', () => {
  const source=name=>normalizePlaybackSource({url:'https://media.example/movie.mp4',name,language:''});
  assert.equal(source('VidEasy | 1080p | Normal Hindi').audioLanguage,'hi');
  assert.equal(source('VidEasy | 720p | English Audio').audioLanguage,'en');
  assert.equal(source('VidEasy | 2160p | Original Audio').audioLanguage,'');
  assert.equal(source('Movie title | English').audioLanguage,'');
});
