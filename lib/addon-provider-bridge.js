'use strict';

// Adapter for user-configured, Stremio-compatible stream services.
// Addon code runs outside SwiflyTV; all returned links are untrusted.
const { createPublicFetcher } = require('./nuvio-http');
const { normalizePlaybackSource, preferPlaybackSources, has4kSourceQuality } = require('./playback-options');

const PROVIDERS = Object.freeze(['4khdhub', 'uhdmovies', 'moviesdrive', 'showbox']);
const NAMES = Object.freeze({ '4khdhub': '4KHDHub', uhdmovies: 'UHDMovies', moviesdrive: 'MoviesDrive', showbox: 'ShowBox' });
const fetchPublic = createPublicFetcher();
const PLAYABLE = new Set(['mp4', 'm4v', 'webm', 'm3u8', 'mpd']);
// The maintained addon publishes the original provider identifier in
// behaviorHints, while displaying the movie title in its name field.
const PROVIDER_HINTS = Object.freeze({
  '4khdhub':'4khdhub','4khdhubtv':'4khdhub','4khdhub_yoruix':'4khdhub',
  '4khdhub_murph':'4khdhub','4khdhubnew':'4khdhub',
  'flix_streams_4khdhub':'4khdhub','uhdmovies':'uhdmovies',
  'uhdmovies_yoruix':'uhdmovies','flix_streams_uhdmovies':'uhdmovies',
  'moviesdrive':'moviesdrive','showbox':'showbox'
});

function configuredAddonUrl() {
  const value = String(process.env.SWIFLY_STREMIO_ADDON_URL || '').trim();
  if (!value || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash ? url.toString() : '';
  } catch { return ''; }
}

function streamEndpoint(base, { tmdbId, mediaType, season = '1', episode = '1', imdbId = '' } = {}) {
  if (!/^[1-9]\d{0,9}$/.test(String(tmdbId)) || !['movie','tv'].includes(mediaType)) return '';
  if (mediaType === 'tv' && (!/^[1-9]\d{0,3}$/.test(String(season)) || !/^[1-9]\d{0,3}$/.test(String(episode)))) return '';
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return '';
    const prefix = url.pathname.replace(/\/manifest\.json$/i,'').replace(/\/$/,'');
    const id = (/^tt\d{5,12}$/.test(String(imdbId)) ? imdbId : 'tmdb:' + tmdbId)
      + (mediaType === 'tv' ? ':' + season + ':' + episode : '');
    return url.origin + prefix + '/stream/' + (mediaType === 'tv' ? 'series' : 'movie') + '/' + id + '.json';
  } catch { return ''; }
}

function entryProvider(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const hint=entry.behaviorHints?.doomProviderId;
  if (typeof hint==='string' && Object.prototype.hasOwnProperty.call(PROVIDER_HINTS,hint))
    return PROVIDER_HINTS[hint];
  const name = String(entry.name || '').trim().replace(/^[^\p{L}\p{N}]+/u,'');
  return PROVIDERS.find(key => new RegExp('^' + NAMES[key] + '(?:\\b|\\s|\\-|\\|)', 'i').test(name)) || '';
}

function entryQuality(entry, provider) {
  const name = String(entry.name || '').replace(new RegExp('^\\s*' + NAMES[provider] + '\\b','i'),'');
  // The description can mention every available quality, even when this
  // particular stream is only HD. Trust its name-specific label first.
  const text = name.slice(0,160);
  const fallback=String(entry.title || entry.description || '').slice(0,320);
  const p = text.match(/\b(4320|2160|1440|1080|720|576|480|360)\s*p\b/i);
  if (p) return p[1] + 'p';
  if (/\b8k\b/i.test(text)) return '4320p';
  if (/\b(?:4k|uhd)\b/i.test(text)) return '2160p';
  const other=fallback.match(/\b(4320|2160|1440|1080|720|576|480|360)\s*p\b/i);
  if(other) return other[1]+'p';
  if (/\b(?:4k|uhd)\b/i.test(fallback)) return '2160p';
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
      name: NAMES[key] + ' | ' + String(item.name || item.title || '').slice(0,72),
      headers: item.behaviorHints?.proxyHeaders?.request || {},
      requiresProxy: true
    });
    if (!source || !PLAYABLE.has(source.format)) continue;
    if (require4k && !has4kSourceQuality(source)) continue;
    seen.add(source.url); result.push(source);
    if (result.length >= 48) break;
  }
  return preferPlaybackSources(result);
}

async function resolveAddonProvider({ provider, tmdbId, mediaType = 'movie', season = '1', episode = '1', imdbId = '',
    signal, timeoutMs = 9000, require4k = false, addonUrl = configuredAddonUrl(),
    fetchResource = fetchPublic, verifySource, isNonMediaUrl = () => false } = {}) {
  const diagnostics={responses:0,upstreamStatus:0,candidates:0,rejectedResponses:0,requestErrors:0};
  const failure = (code = 'no_source') => ({ ok:false, provider:'nuvio-' + provider, code, diagnostics:{...diagnostics} });
  if ((provider !== 'all' && !PROVIDERS.includes(provider)) || typeof verifySource !== 'function' || !addonUrl) return failure();
  const endpoint = streamEndpoint(addonUrl,{tmdbId,mediaType,season,episode,imdbId});
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
    diagnostics.responses=1;
    diagnostics.upstreamStatus=response.status;
    if (!response.ok) return failure();
    const payload=JSON.parse(await response.text());
    const eligible=Array.isArray(payload.streams)?payload.streams.filter(item=>{
      const id=entryProvider(item);
      return id&&(provider==='all'||provider===id)&&(!require4k||has4kSourceQuality({quality:entryQuality(item,id)}));
    }):[];
    const rows=addonCandidates(payload,{provider,require4k});
    diagnostics.candidates=rows.length;
    // These are counts only, no upstream URLs, titles, headers or identifiers.
    diagnostics.rejectedResponses=Math.max(0,eligible.length-rows.length);
    for (const candidate of rows.slice(0,24)) {
      scope.signal.throwIfAborted();
      const checked = await verifySource(candidate,{fetchResource,signal:scope.signal,isNonMediaUrl});
      if (!checked?.mediaVerified || !PLAYABLE.has(checked.format)) {
        diagnostics.requestErrors++;
        continue;
      }
      if (require4k && !has4kSourceQuality(checked)) {
        diagnostics.requestErrors++;
        continue;
      }
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
