'use strict';
const { normalizePlaybackSource, normalizeSubtitles, normalizeAudioLanguage } = require('./playback-options');

/** Prepare only opaque transport URLs; provider credentials stay in registries. */
function createPlaybackHandoff({ registerSource, registerSubtitle, enabled = () => true } = {}) {
  if (typeof registerSource !== 'function' || typeof registerSubtitle !== 'function') throw new TypeError('Playback registries are required');
  return function prepare(result, { source, sources = [], subtitles = [], metadata = {} } = {}) {
    const selected = normalizePlaybackSource(source) || {};
    const captionCache = new Map();
    function captions(input, parent = selected) {
      return normalizeSubtitles(input, { headers: parent.headers || {}, baseUrl: parent.url }).map(track => {
        const key = track.url + JSON.stringify(track.headers);
        if (!captionCache.has(key)) {
          const registered = registerSubtitle(track);
          captionCache.set(key, registered?.url ? { id: registered.id, url: registered.url, language: track.language,
            label: track.label, kind: 'subtitles', default: track.default === true } : null);
        }
        return captionCache.get(key);
      }).filter(Boolean);
    }
    const selectedCaptions = captions([...(selected.subtitles || []), ...(Array.isArray(subtitles) ? subtitles : [])]);
    // A verified primary MP4 can play directly from its provider URL but the
    // download UI only accepts same-origin attachment URLs. Register a separate
    // opaque download entry without changing the chosen playback transport.
    const primaryProxy = /^\/api\/media-file-proxy\/[^/?]+\/video\.mp4(?:[?#]|$)/.test(String(result.playbackUrl || ''));
    let downloadUrl = primaryProxy ? result.playbackUrl : '';
    if (!downloadUrl && enabled() && selected.format === 'mp4' && selected.mediaVerified === true) {
      const entry = registerSource(selected.url, selected.headers, {
        ...metadata, streamName: selected.name, streamQuality: selected.quality,
        sourceFormat: 'mp4', sourceCodec: selected.codecName || ''
      });
      if (entry?.id && entry.url) downloadUrl = '/api/media-file-proxy/' + entry.id + '/video.mp4';
    }
    const choices = [{ id: result.hlsProxyId || 'selected', playbackUrl: result.playbackUrl, downloadUrl,
      streamType: result.streamType || selected.format || '', streamMode: result.streamMode || 'video',
      streamQuality: result.streamQuality || selected.quality || '', streamCodec: result.streamCodec || selected.codecName || '',
      streamName: result.streamName || selected.name || '', audioLanguage: normalizeAudioLanguage(selected.audioLanguage),
      selected: true, subtitles: selectedCaptions }];
    const seen = new Set([selected.url || result.originalPlaybackUrl]);
    for (const raw of (Array.isArray(sources) ? sources : []).slice(0, 24)) {
      if (metadata.type === 'tv' && ((raw?.se != null && String(raw.se) !== String(metadata.season)) ||
          (raw?.ep != null && String(raw.ep) !== String(metadata.episode)))) continue;
      const candidate = normalizePlaybackSource(raw);
      if (!candidate || seen.has(candidate.url) || !enabled()) continue;
      const native = candidate.format === 'mp4';
      if (!native && !(candidate.format === 'm3u8' && candidate.mediaVerified === true)) continue;
      const registered = registerSource(candidate.url, candidate.headers, { ...metadata,
        streamName: candidate.name, streamQuality: candidate.quality,
        ...(native ? { sourceFormat: 'mp4', sourceCodec: candidate.codecName || '', verifyBeforePlayback: candidate.mediaVerified !== true } : {}) });
      if (!registered?.id || !registered.url) continue;
      choices.push({ id: registered.id, playbackUrl: native ? `/api/media-file-proxy/${registered.id}/video.mp4` : registered.url,
        streamType: candidate.format, streamMode: native ? 'video' : 'hls', streamQuality: candidate.quality,
        streamCodec: candidate.codecName || '', streamName: candidate.name, audioLanguage: candidate.audioLanguage,
        selected: false, subtitles: captions(candidate.subtitles, candidate) });
      seen.add(candidate.url);
      if (choices.length >= 24) break;
    }
    return { ...result, downloadUrl, audioLanguage: choices[0].audioLanguage, playbackSources: choices, subtitles: selectedCaptions };
  };
}
module.exports = { createPlaybackHandoff };
