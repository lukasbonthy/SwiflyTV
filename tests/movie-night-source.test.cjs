'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {publicMovieNightSource} = require('../lib/movie-night-source');

const now = 1_800_000_000_000;
const expiresAt = now + 3_600_000;
const fileProxy = '/api/media-file-proxy/selected-file/video.mp4';
const hlsProxy = '/api/hls-proxy/selected-hls/master.m3u8';
const upstream = 'https://provider.example/movie.m3u8?private=upstream';
const direct = 'https://media.example/movie.mp4';

test('uses the selected file proxy lease when a protected MP4 has no HLS ID', () => {
  const queried = [];
  const source = publicMovieNightSource({
    status: 'ok', playbackUrl: fileProxy, proxyVideo: fileProxy, hlsProxyId: '',
    originalPlaybackUrl: direct, streamHeaders: {cookie: 'provider-session'}, streamMode: 'video'
  }, {
    now,
    getProxyEntry(id) {
      queried.push(id);
      return {expiresAt, sourceUrl: direct, headers: {cookie: 'provider-session'}};
    }
  });
  assert.deepEqual(queried, ['selected-file']);
  assert.deepEqual(source, {status: 'ok', playbackUrl: fileProxy, streamMode: 'video', expiresAt, playbackSources: [], subtitles: []});
});

test('publishes the selected HLS proxy and discards upstream and alternate cuts', () => {
  const queried = [];
  const source = publicMovieNightSource({
    status: 'ok', playbackUrl: '', hlsProxyUrl: hlsProxy, proxyVideo: direct, m3u8: upstream,
    hlsProxyId: 'stale-id', hlsProxyStatusUrl: '/api/hls-proxy/stale-id/status',
    apiProxyUrl: 'https://provider.example/api', originalPlaybackUrl: upstream, sourceUrl: upstream,
    downloadUrl: fileProxy, streamType: 'm3u8', streamQuality: '1080p', streamMode: 'hls',
    streamName: 'Film', audioLanguage: 'en', isLiveM3u8: false,
    headers: {authorization: 'provider-secret'}, providerKey: 'private-key',
    playbackSources: [{playbackUrl: fileProxy, audioLanguage: 'fr'}]
  }, {
    now,
    getProxyEntry(id) {
      queried.push(id);
      return {expiresAt};
    }
  });
  assert.deepEqual(queried, ['selected-hls']);
  assert.deepEqual(source, {
    status: 'ok', playbackUrl: hlsProxy, streamType: 'm3u8', streamQuality: '1080p',
    streamName: 'Film', streamMode: 'hls', audioLanguage: 'en', isLiveM3u8: false,
    expiresAt, playbackSources: [], subtitles: []
  });
});

test('rejects expired or missing local proxy handles without falling back upstream', () => {
  for (const playbackUrl of [fileProxy, hlsProxy]) {
    for (const entry of [undefined, null, {}, {expiresAt: now}, {expiresAt: now - 1}, {expiresAt: Infinity}, {expiresAt: String(expiresAt)}]) {
      assert.deepEqual(publicMovieNightSource({
        status: 'ok', playbackUrl, m3u8: upstream
      }, {now, getProxyEntry: () => entry}), {status: 'error'});
    }
    assert.deepEqual(publicMovieNightSource({status: 'ok', playbackUrl}, {now}), {status: 'error'});
  }
});

test('checks the browser-resolved proxy path and rejects non-playback proxy endpoints', () => {
  const queried = [];
  const getProxyEntry = id => {
    queried.push(id);
    return {expiresAt};
  };
  const playbackUrl = '/fixture/../api/media-file-proxy/selected-file/video.mp4?download=0';
  assert.equal(publicMovieNightSource({status: 'ok', playbackUrl}, {getProxyEntry, now}).expiresAt, expiresAt);
  assert.deepEqual(queried, ['selected-file']);
  assert.deepEqual(publicMovieNightSource({
    status: 'ok', playbackUrl: '/api/hls-proxy/selected-hls/status'
  }, {getProxyEntry, now}), {status: 'error'});
  assert.deepEqual(queried, ['selected-file']);
});

test('accepts fallback transports without inventing an expiry for direct media', () => {
  const options = {now, getProxyEntry() { assert.fail('Direct media does not use the local proxy registry'); }};
  assert.deepEqual(publicMovieNightSource({
    status: 'ok', proxyVideo: direct, m3u8: upstream, hlsProxyId: 'stale-id'
  }, options), {status: 'ok', playbackUrl: direct, playbackSources: [], subtitles: []});
  assert.deepEqual(publicMovieNightSource({
    status: 'ok', m3u8: 'http://media.example/movie.m3u8', expiresAt
  }, options), {status: 'ok', playbackUrl: 'http://media.example/movie.m3u8', expiresAt, playbackSources: [], subtitles: []});
  assert.deepEqual(publicMovieNightSource({
    status: 'ok', playbackUrl: '/fixtures/movie.mp4'
  }, options), {status: 'ok', playbackUrl: '/fixtures/movie.mp4', playbackSources: [], subtitles: []});
});

test('rejects an explicitly invalid expiry and honors an earlier known expiry', () => {
  for (const expiry of [undefined, null, now, now - 1, NaN, Infinity, String(expiresAt)]) {
    assert.deepEqual(publicMovieNightSource({status: 'ok', playbackUrl: direct, expiresAt: expiry}, {now}), {status: 'error'});
  }
  const options = {now, getProxyEntry: () => ({expiresAt})};
  const local = {status: 'ok', playbackUrl: fileProxy};
  assert.deepEqual(publicMovieNightSource({...local, expiresAt: NaN}, options), {status: 'error'});
  assert.equal(publicMovieNightSource({...local, expiresAt: expiresAt - 1000}, options).expiresAt, expiresAt - 1000);
  assert.equal(publicMovieNightSource({...local, expiresAt: expiresAt + 1000}, options).expiresAt, expiresAt);
});

test('rejects missing, unsafe and unsuccessful transports', () => {
  for (const playbackUrl of [
    'javascript:alert(1)', 'data:video/mp4,abc', '//media.example/movie.mp4',
    'https://user:secret@media.example/movie.mp4', 'https://', '/\\media.example/movie.mp4',
    '#movie', 'https://media.example/\nmovie.mp4'
  ]) {
    assert.deepEqual(publicMovieNightSource({status: 'ok', playbackUrl, proxyVideo: direct}, {now}), {status: 'error'});
  }
  assert.deepEqual(publicMovieNightSource({status: 'ok', apiProxyUrl: direct}, {now}), {status: 'error'});
  assert.deepEqual(publicMovieNightSource({status: 'placeholder', playbackUrl: direct, message: upstream}, {now}), {status: 'error'});
  assert.deepEqual(publicMovieNightSource(undefined, {now}), {status: 'error'});
});

test('keeps only usable subtitle URLs and the fields used to identify tracks', () => {
  const subtitles = [
    {url: '/api/subtitle-proxy/english/track.vtt', language: 'en', label: 'English', kind: 'captions',
      default: true, headers: {authorization: 'private'}, cookie: 'private', sourceUrl: upstream, id: 'private'},
    {src: 'https://captions.example/fr.vtt', lang: 'fr', name: 'French', arbitrary: 'private'},
    {file: '/tracks/es.vtt', srclang: 'es', label: {secret: 'private'}},
    {url: '//captions.example/unsafe.vtt'}, {url: 'data:text/vtt,WEBVTT'},
    {url: 'https://account:private@captions.example/unsafe.vtt'}, {label: 'Missing URL'}, null
  ];
  assert.deepEqual(publicMovieNightSource({
    status: 'ok', playbackUrl: direct, subtitles, streamName: {token: 'private'}
  }, {now}), {
    status: 'ok', playbackUrl: direct, playbackSources: [], subtitles: [
      {url: '/api/subtitle-proxy/english/track.vtt', language: 'en', label: 'English', kind: 'captions', default: true},
      {url: 'https://captions.example/fr.vtt', language: 'fr', label: 'French'},
      {url: '/tracks/es.vtt', language: 'es'}
    ]
  });
});
