'use strict';

const MAX_URL_LENGTH = 16384;
const MAX_BODY_PREFIX = 65536;
const MAX_PAYLOAD_TEXT = 262144;
const MAX_NODES = 2000;
const MAX_DEPTH = 12;
const MAX_FIELDS = 256;
const MAX_CANDIDATES = 64;

const FILE_FORMATS = new Set(['m3u8', 'mpd', 'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'mpeg', 'mpg', 'wmv', 'ogv', '3gp', '3g2', 'm2ts', 'mts', 'vob']);
const MIME_FORMATS = new Map([
  ['application/vnd.apple.mpegurl', 'm3u8'], ['application/x-mpegurl', 'm3u8'],
  ['application/mpegurl', 'm3u8'], ['application/mpeg-url', 'm3u8'],
  ['audio/mpegurl', 'm3u8'], ['audio/x-mpegurl', 'm3u8'],
  ['application/dash+xml', 'mpd'], ['video/mp4', 'mp4'], ['video/x-m4v', 'm4v'],
  ['video/webm', 'webm'], ['video/x-matroska', 'mkv'], ['video/quicktime', 'mov'],
  ['video/x-msvideo', 'avi'], ['video/avi', 'avi'], ['video/x-flv', 'flv'],
  ['video/mpeg', 'mpeg'], ['video/ogg', 'ogv'], ['video/x-ms-wmv', 'wmv'],
  ['video/3gpp', '3gp'], ['video/3gpp2', '3g2']
]);
const URL_FIELDS = new Set(['url', 'file', 'fileurl', 'src', 'source', 'sourceurl', 'stream', 'streamurl', 'streamingurl', 'video', 'videourl', 'playbackurl', 'playlist', 'playlisturl', 'manifest', 'manifesturl', 'directurl', 'proxyvideo']);
const SOURCE_CONTAINERS = new Set(['sources', 'source', 'streams', 'stream', 'videos', 'video', 'playback', 'playlist', 'manifest']);
const SOURCE_WRAPPERS = new Set(['data', 'items', 'results']);

function mime(value) {
  return typeof value === 'string' && value.length <= 256 ? value.split(';', 1)[0].trim().toLowerCase() : '';
}

function isProviderProtectionClip({ contentType, responseHeaders = {} } = {}) {
  // Verified 2026-10-14: VidLove's 20-second "only available" origin warning.
  // Its strong entity tag and exact size exclude this asset without size or
  // duration heuristics that would reject legitimate short videos.
  const fullSize=String(responseHeaders['content-range']||'').match(/^bytes \d+-\d+\/(\d+)$/)?.[1];
  return mime(contentType) === 'video/mp4' && responseHeaders.etag === '"dkrle0ht61g2od5"'
    && (String(responseHeaders['content-length']) === '31577'||fullSize==='31577');
}

function rawSegmentMime(value) {
  return /^(?:video\/(?:mp2t|mpeg2?-?ts|m2ts|iso\.segment)|application\/(?:mp2t|iso\.segment))$/.test(value);
}

function formatForType(value) {
  const type = mime(value);
  if (!type || rawSegmentMime(type)) return '';
  if (MIME_FORMATS.has(type)) return MIME_FORMATS.get(type);
  if (type === 'hls' || type === 'mpegurl' || type === 'mpeg-url') return 'm3u8';
  if (type === 'dash') return 'mpd';
  if (type === 'direct') return 'direct';
  if (FILE_FORMATS.has(type)) return type;
  return /^video\/[a-z0-9.+_-]+$/.test(type) ? 'direct' : '';
}

function normalizeUrl(value, baseUrl) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  // Decode ampersand entities only. Percent escapes and query order carry signatures.
  const url = value.trim().replace(/&(?:amp|#0*38|#x0*26);/gi, '&');
  if (!url || /[\u0000-\u0020\u007f\\<>"']/.test(url)) return null;
  try {
    let base;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      if (typeof baseUrl !== 'string') return null;
      base = new URL(baseUrl);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
    }
    const parsed = new URL(url, base);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function obviouslyNonMedia(parsed) {
  const path = parsed.pathname.toLowerCase();
  // These extensions describe transport pieces, keys, or web assets, not sources.
  if (/\.(?:ts|m4s|fmp4|cmfv|cmfa|aac|mp3|key|pem|jpe?g|png|webp|gif|avif|svg|ico|bmp|css|js|mjs|map|json|webmanifest|html?|srt|ass|vtt|zip|rar|7z|tar|gz|torrent|pdf|woff2?|ttf|eot|wasm)$/.test(path)) return true;
  if (/(?:^|\/)(?:sitemap(?:[_-][^/]*)?\.xml|ads?|advertisements?|trailers?|teasers?)(?:[/.]|$)/.test(path)) return true;
  if (/(?:^|\/)(?:hero[-_]background(?:[-_]video)?|background(?:[-_]video)?|demo(?:[_-]?2x)?|sample|placeholder|test|trailer|teaser)\.(?:mp4|webm|mov|m4v|mkv)$/.test(path)) return true;
  if (/(?:^|\/)(?:init(?:[-_.][^/]*)?|(?:seg(?:ment)?|chunk|fragment|frag)[-_]?\d+(?:[-_.][^/]*)?)\.(?:mp4|m4v|webm)$/.test(path)) return true;
  return false;
}

function xmlRootPrefix(text) {
  let value = text.replace(/^\ufeff/, '').trimStart();
  for (let pass = 0; pass < 8; pass += 1) {
    const prefix = value.match(/^(?:<\?xml\b[\s\S]*?\?>|<!--[\s\S]*?-->)/i);
    if (!prefix) break;
    value = value.slice(prefix[0].length).trimStart();
  }
  return value;
}

function playlistFormat(text) {
  if (!text) return '';
  const root = xmlRootPrefix(text);
  if (/^<(?:[a-z_][\w.-]*:)?MPD(?:\s|>)/.test(root)) return 'mpd';
  const lines = text.replace(/^\ufeff/, '').trimStart().split(/\r\n|\n|\r/, 512).map(line => line.trim());
  if (lines[0] !== '#EXTM3U') return '';
  const nextUri = (index) => {
    for (let next = index + 1; next < lines.length; next += 1) {
      if (!lines[next] || lines[next].startsWith('#')) continue;
      return !/[\s<>"']/.test(lines[next]);
    }
    return false;
  };
  if (lines.some((line, index) => /^#EXT-X-STREAM-INF:/.test(line) && nextUri(index))) return 'm3u8';
  if (lines.some(line => /^#EXT-X-(?:I-FRAME-STREAM-INF|MEDIA):/.test(line) && /\bURI="[^"<>]+"/.test(line))) return 'm3u8';
  if (!lines.some(line => /^#EXT-X-TARGETDURATION:\d+\s*$/.test(line))) return '';
  if (lines.some((line, index) => /^#EXTINF:\d+(?:\.\d+)?(?:,.*)?$/.test(line) && nextUri(index))) return 'm3u8';
  if (lines.some(line => /^#EXT-X-PART:/.test(line) && /\bURI="[^"<>]+"/.test(line))) return 'm3u8';
  return '';
}

/**
 * Classify source evidence without performing any I/O. A request URL alone is
 * not confirmation. A 2xx status, an explicit source type, or confirmed DOM
 * source can establish a candidate; callers may still validate DOM/API sources.
 * Failed status, HTML, segment paths, and the caller's filter are absolute vetoes.
 */
function classifyMediaCandidate({ url, baseUrl, contentType, responseHeaders, status, bodyPrefix, type, confirmed = false, isNonMediaUrl } = {}) {
  const parsed = normalizeUrl(url, baseUrl);
  if (!parsed || obviouslyNonMedia(parsed)) return null;
  if (typeof isNonMediaUrl === 'function') {
    try { if (isNonMediaUrl(parsed.href)) return null; } catch { return null; }
  }

  const hasStatus = status !== undefined && status !== null && status !== '';
  const statusNumber = typeof status === 'number' ? status : typeof status === 'string' && /^\d{3}$/.test(status.trim()) ? Number(status) : NaN;
  const successfulResponse = hasStatus && Number.isInteger(statusNumber) && statusNumber >= 200 && statusNumber < 300;
  if (hasStatus && !successfulResponse) return null;

  const contentMime = mime(contentType);
  if (isProviderProtectionClip({ contentType: contentMime, responseHeaders })) return null;
  if (rawSegmentMime(contentMime) || rawSegmentMime(mime(type))) return null;
  if (/^(?:text\/(?:html|css|javascript)|application\/(?:xhtml\+xml|(?:ld\+)?json|(?:x-)?javascript)|image\/|font\/)/.test(contentMime)) return null;
  const body = typeof bodyPrefix === 'string' ? bodyPrefix.slice(0, MAX_BODY_PREFIX) : '';
  if (/^<(?:!doctype\s+html\b|(?:[a-z_][\w.-]*:)?(?:html|head|body|script|iframe)\b)/i.test(xmlRootPrefix(body))) return null;

  const bodyFormat = (successfulResponse || confirmed) ? playlistFormat(body) : '';
  const responseFormat = successfulResponse ? formatForType(contentMime) : '';
  const typedFormat = mime(type) === 'direct' && !confirmed ? '' : formatForType(type);
  const extension = parsed.pathname.toLowerCase().match(/\.([a-z0-9]{2,8})$/)?.[1] || '';
  const fileFormat = FILE_FORMATS.has(extension) && (successfulResponse || confirmed) ? extension : '';
  const format = bodyFormat || responseFormat || typedFormat || fileFormat;
  if (!format) return null;
  // When supplied, a textual manifest prefix must actually contain a playlist.
  if ((format === 'm3u8' || format === 'mpd') && body.trim() && !bodyFormat) return null;

  const confidence = bodyFormat ? 100 : responseFormat ? 90 : successfulResponse ? 75 : typedFormat ? 65 : 50;
  const rank = confidence + (format === 'm3u8' ? 2 : format === 'mpd' ? 1 : 0);
  return { url: parsed.href, format, forceHls: format === 'm3u8', confidence, rank };
}

function ownValue(node, key) {
  const descriptor = Object.getOwnPropertyDescriptor(node, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function nodeFormat(node) {
  if (ownValue(node, 'forceHls') === true) return 'm3u8';
  for (const field of ['type', 'format', 'mimeType', 'mime', 'contentType', 'streamType']) {
    const format = formatForType(ownValue(node, field));
    if (format) return format;
  }
  return '';
}

function fieldFormat(field) {
  if (/^(?:hls\d*|hlsurl|m3u8|m3u8url)$/.test(field)) return 'm3u8';
  if (/^(?:dash|dashurl|mpd|mpdurl)$/.test(field)) return 'mpd';
  return FILE_FORMATS.has(field) ? field : '';
}

/**
 * Read source records and explicit HLS/DASH fields in bounded JSON payloads.
 * Free text, links, embed pages, and download subtrees are never URL-scraped.
 * Format hints propagate through source containers, not unrelated metadata.
 * Candidates describe evidence; this function does not fetch or expand them.
 */
function extractMediaCandidates(payload, { baseUrl, isNonMediaUrl } = {}) {
  if (typeof payload === 'string') {
    if (payload.length > MAX_PAYLOAD_TEXT) return [];
    try { payload = JSON.parse(payload); } catch { return []; }
  }
  if (!payload || typeof payload !== 'object') return [];

  const candidates = new Map();
  const visited = new WeakSet();
  let nodes = 0, textLength = 0;

  function add(url, type) {
    textLength += url.length;
    if (textLength > MAX_PAYLOAD_TEXT) return;
    const candidate = classifyMediaCandidate({ url, baseUrl, type, confirmed: true, isNonMediaUrl });
    if (!candidate) return;
    const existing = candidates.get(candidate.url);
    if (existing && candidate.rank <= existing.rank) return;
    if (existing || candidates.size < MAX_CANDIDATES) candidates.set(candidate.url, candidate);
  }

  function walk(node, depth = 0, hint = '', sourceContext = false) {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH || textLength > MAX_PAYLOAD_TEXT) return;
    if (typeof node === 'string') {
      if (sourceContext) add(node, hint);
      else textLength += node.length;
      return;
    }
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length && nodes < MAX_NODES && textLength <= MAX_PAYLOAD_TEXT; index += 1) {
        walk(ownValue(node, String(index)), depth + 1, hint, sourceContext);
      }
      return;
    }

    const explicitType = nodeFormat(node);
    let fields = 0;
    for (const key in node) {
      if (!Object.hasOwn(node, key)) continue;
      fields += 1;
      if (fields > MAX_FIELDS || nodes >= MAX_NODES || textLength > MAX_PAYLOAD_TEXT) break;
      if (key.length > 64) continue;
      const field = key.toLowerCase().replace(/[_-]/g, '');
      if (/^(?:download|downloads|downloadlinks|downloadurl|paid|purchase|subscription)/.test(field)) continue;
      const value = ownValue(node, key);
      const type = fieldFormat(field);
      const sourceField = type || URL_FIELDS.has(field) || SOURCE_CONTAINERS.has(field);
      if (typeof value === 'string' && sourceField) {
        nodes += 1;
        add(value, type || explicitType || (sourceContext ? hint : ''));
      } else {
        const container = Boolean(type) || SOURCE_CONTAINERS.has(field);
        const wrapper = sourceContext && SOURCE_WRAPPERS.has(field);
        walk(value, depth + 1, container || wrapper ? type || explicitType || hint : '', container || wrapper);
      }
    }
  }

  walk(payload);
  return Array.from(candidates.values());
}

module.exports = { classifyMediaCandidate, extractMediaCandidates, isProviderProtectionClip };
