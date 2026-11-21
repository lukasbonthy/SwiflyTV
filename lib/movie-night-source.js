'use strict';

const LOCAL_ORIGIN = 'https://swifly.invalid';
const PROXY_PREFIX = /^\/api\/(?:hls-proxy|media-file-proxy)(?:\/|$)/i;
const HLS_MASTER = /^\/api\/hls-proxy\/([\w-]+)\/master\.m3u8$/i;
const MEDIA_FILE = /^\/api\/media-file-proxy\/([\w-]+)\/video\.mp4$/i;
const STREAM_FIELDS = ['streamType', 'streamQuality', 'streamName', 'streamMode', 'streamCodec', 'audioLanguage'];

function parsePublicUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 16384 ||
      /[\s\u0000-\u001f\u007f\\<>"]/.test(value)) return null;
  if (!/^\/(?!\/)|^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function publicText(value) {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, 100) : '';
}

function publicSubtitles(rows) {
  if (!Array.isArray(rows)) return [];
  const subtitles = [];
  for (const row of rows.slice(0, 40)) {
    const url = row?.url || row?.src || row?.file;
    if (!parsePublicUrl(url)) continue;
    const track = {url};
    const language = publicText(row.language || row.lang || row.srclang);
    const label = publicText(row.label || row.name);
    if (language) track.language = language;
    if (label) track.label = label;
    if (row.kind === 'subtitles' || row.kind === 'captions') track.kind = row.kind;
    if (typeof row.default === 'boolean') track.default = row.default;
    subtitles.push(track);
  }
  return subtitles;
}

function publicMovieNightSource(result, {getProxyEntry, now = Date.now()} = {}) {
  if (result?.status !== 'ok') return {status: 'error'};
  const playbackUrl = result.playbackUrl || result.hlsProxyUrl || result.proxyVideo || result.m3u8;
  const url = parsePublicUrl(playbackUrl);
  if (!url) return {status: 'error'};

  let expiresAt;
  if (Object.hasOwn(result, 'expiresAt')) {
    expiresAt = result.expiresAt;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return {status: 'error'};
  }
  if (playbackUrl.startsWith('/') && PROXY_PREFIX.test(url.pathname)) {
    // Protected files and HLS masters share the same expiring source registry.
    const proxy = url.pathname.match(HLS_MASTER) || url.pathname.match(MEDIA_FILE);
    const proxyExpiry = proxy && getProxyEntry?.(proxy[1])?.expiresAt;
    if (!Number.isFinite(proxyExpiry) || proxyExpiry <= now) return {status: 'error'};
    expiresAt = Math.min(expiresAt ?? proxyExpiry, proxyExpiry);
  }

  const source = {status: 'ok', playbackUrl, playbackSources: [], subtitles: publicSubtitles(result.subtitles)};
  for (const field of STREAM_FIELDS) {
    const value = publicText(result[field]);
    if (value) source[field] = value;
  }
  if (typeof result.isLiveM3u8 === 'boolean') source.isLiveM3u8 = result.isLiveM3u8;
  if (expiresAt !== undefined) source.expiresAt = expiresAt;
  return source;
}

module.exports = {publicMovieNightSource};
