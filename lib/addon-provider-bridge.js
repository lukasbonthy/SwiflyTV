'use strict';

// Adapter for user-configured, Stremio-compatible stream services.
// Addon code runs outside SwiflyTV; all returned links are untrusted.
const { createPublicFetcher } = require('./nuvio-http');
const { normalizePlaybackSource, preferPlaybackSources, has4kSourceQuality } = require('./playback-options');

const PROVIDERS = Object.freeze(['4khdhub', 'uhdmovies', 'moviesdrive', 'showbox']);
const NAMES = Object.freeze({ '4khdhub': '4KHDHub', uhdmovies: 'UHDMovies', moviesdrive: 'MoviesDrive', showbox: 'ShowBox' });
const fetchPublic = createPublicFetcher();
const PLAYABLE = new Set(['mp4', 'webm', 'm3u8', 'mpd']);

function configuredAddonUrl() {
  const value = String(process.env.SWIFLY_STREMIO_ADDON_URL || '').trim();
  if (!value || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash ? url.toString() : '';
  } catch { return ''; }
}

function streamEndpoint(base, { tmdbId, mediaType, season = '1', episode = '1' } = {}) {
  if (!/^[1-9]\d{0,9}$/.test(String(tmdbId)) || !['movie','tv'].includes(mediaType)) return '';
  if (mediaType === 'tv' && (!/^[1-9]\d{0,3}$/.test(String(season)) || !/^[1-9]\d{0,3}$/.test(String(episode)))) return '';
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return '';
    const prefix = url.pathname.replace(/\/manifest\.json$/i,'').replace(/\/$/,'');
    const id = 'tmdb:' + tmdbId + (mediaType === 'tv' ? ':' + season + ':' + episode : '');
    return url.origin + prefix + '/stream/' + (mediaType === 'tv' ? 'series' : 'movie') + '/' + id + '.json';
  } catch { return ''; }
}

function entryProvider(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const name = String(entry.name || '').trim().replace(/^[^\p{L}\p{N}]+/u,'');
  return PROVIDERS.find(key => new RegExp('^' + NAMES[key] + '(?:\\b|\\s|\\-|\\|)', 'i').test(name)) || '';
}

function entryQuality(entry, provider) {
  const name = String(entry.name || '').replace(new RegExp('^\\s*' + NAMES[provider] + '\\b','i'),'');
  const text = (name + ' ' + String(entry.title || '')).slice(0,320);
  const p = text.match(/\b(4320|2160|1440|1080|720|576|480|360)\s*p\b/i);
  if (p) return p[1] + 'p';
  if (/\b8k\b/i.test(text)) return '4320p';
  if (/\b(?:4k|uhd)\b/i.test(text)) return '2160p';
  return '';
}

function addonCandidates(json, { provider, require4k = false } = {}) {
  if (!json || !Array.isArray(json.streams)) return [];
  const result = [], seen = new Set();
  for (const item of json.streams.slice(0, 500)) {
    const key = entryProvider(item);
    if (!key || (provider !== 'all' && key !== provider) || typeof item.url !== 'string' || seen.has(item.url)) continue;
    const source = normalizePlaybackSource({
      url: item.url, quality: entryQuality(item,key),
      name: NAMES[key] + ' | ' + String(item.title || item.name || '').slice(0,72),
      requiresProxy: true
    });
    if (!source || !PLAYABLE.has(source.format)) continue;
    if (require4k && !has4kSourceQuality(source)) continue;
    seen.add(source.url); result.push(source);
    if (result.length >= 48) break;
  }
  return preferPlaybackSources(result);
}

async function resolveAddonProvider({ provider, tmdbId, mediaType = 'movie', season = '1', episode = '1',
    signal, timeoutMs = 9000, require4k = false, addonUrl = configuredAddonUrl(),
    fetchResource = fetchPublic, verifySource, isNonMediaUrl = () => false } = {}) {
  const failure = (code = 'no_source') => ({ ok:false, provider:'nuvio-' + provider, code });
  if ((provider !== 'all' && !PROVIDERS.includes(provider)) || typeof verifySource !== 'function' || !addonUrl) return failure();
  const endpoint = streamEndpoint(addonUrl,{tmdbId,mediaType,season,episode});
  if (!endpoint) return failure();
  signal?.throwIfAborted();
  const scope = new AbortController();
  const abort = () => scope.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(() => scope.abort(new Error('addon deadline')),Math.max(1,Math.min(50000,timeoutMs)));
  timer.unref?.();
  try {
    const response = await fetchResource(endpoint,{signal:scope.signal,maxBytes:512*1024,
      timeoutMs:Math.max(1000,Math.min(37000,timeoutMs-5000))});
    if (!response.ok) return failure();
    const rows = addonCandidates(JSON.parse(await response.text()),{provider,require4k});
    for (const candidate of rows.slice(0,24)) {
      scope.signal.throwIfAborted();
      const checked = await verifySource(candidate,{fetchResource,signal:scope.signal,isNonMediaUrl});
      if (!checked?.mediaVerified || !PLAYABLE.has(checked.format)) continue;
      if (require4k && !has4kSourceQuality(checked)) continue;
      return {ok:true,provider:'nuvio-'+provider,source:checked,
        sources:[checked,...rows.filter(source=>source.url!==checked.url)],subtitles:checked.subtitles||[]};
    }
    return failure();
  } catch {
    signal?.throwIfAborted();
    return failure(scope.signal.aborted?'provider_timeout':'provider_failed');
  } finally {
    clearTimeout(timer);
    scope.abort();
    signal?.removeEventListener('abort',abort);
  }
}

module.exports = { PROVIDERS, configuredAddonUrl, streamEndpoint, entryProvider, entryQuality, addonCandidates, resolveAddonProvider };
