/* SwiflyTV resolver fallback / safety shim.
   Purpose: stop the watch page from hanging forever on "Loading resolver script...".
   This file is intentionally tiny, safe to load multiple times, and exposes the common resolver globals/events
   the watch page can use before booting Vidstack.
*/
(function () {
  'use strict';

  if (window.__SWIFLY_RESOLVER_FALLBACK_LOADED__) {
    return;
  }
  window.__SWIFLY_RESOLVER_FALLBACK_LOADED__ = true;

  var RESOLVER_TIMEOUT_MS = 18000;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || 'resolver') + ' timed out after ' + ms + 'ms'));
      }, ms);

      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function readWatchInfo() {
    var path = location.pathname || '';
    var parts = path.split('/').filter(Boolean);
    var query = new URLSearchParams(location.search || '');

    var type = query.get('type') || query.get('mode') || '';
    var id = query.get('id') || query.get('movieId') || query.get('tmdbId') || '';
    var season = query.get('season') || query.get('s') || '';
    var episode = query.get('episode') || query.get('e') || '';

    var watchIndex = parts.indexOf('watch');
    if (watchIndex >= 0) {
      type = type || parts[watchIndex + 1] || '';
      id = id || parts[watchIndex + 2] || '';
      season = season || parts[watchIndex + 3] || '';
      episode = episode || parts[watchIndex + 4] || '';
    }

    if (!type && parts[0] === 'movie') type = 'movie';
    if (!id && parts[0] === 'movie') id = parts[1] || '';

    type = String(type || 'movie').toLowerCase();
    if (type === 'tvshow' || type === 'series' || type === 'show') type = 'tv';

    return { type: type, id: id, season: season, episode: episode };
  }

  function pickSource(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;

    var queue = [input];
    var seen = [];
    var keys = [
      'm3u8', 'm3u8Url', 'm3u8URL', 'proxyM3u8', 'proxiedM3u8', 'proxiedUrl',
      'src', 'url', 'videoUrl', 'streamUrl', 'stream', 'source', 'sourceUrl', 'file', 'playlist'
    ];

    while (queue.length) {
      var item = queue.shift();
      if (!item || seen.indexOf(item) !== -1) continue;
      seen.push(item);

      if (typeof item === 'string') {
        if (/\.m3u8(\?|#|$)/i.test(item) || /^https?:\/\//i.test(item) || item.charAt(0) === '/') return item;
        continue;
      }

      for (var i = 0; i < keys.length; i += 1) {
        var value = item[keys[i]];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }

      if (Array.isArray(item)) {
        for (var a = 0; a < item.length; a += 1) queue.push(item[a]);
      } else if (typeof item === 'object') {
        if (item.data) queue.push(item.data);
        if (item.result) queue.push(item.result);
        if (item.sources) queue.push(item.sources);
        if (item.source) queue.push(item.source);
        if (item.streams) queue.push(item.streams);
      }
    }

    return '';
  }

  async function requestJson(url) {
    var res = await withTimeout(fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }), RESOLVER_TIMEOUT_MS, url);

    var text = await res.text();
    if (!res.ok) throw new Error(url + ' returned HTTP ' + res.status);

    try {
      return JSON.parse(text);
    } catch (err) {
      return { raw: text };
    }
  }

  function buildCandidates(info) {
    var id = encodeURIComponent(info.id || '');
    var type = encodeURIComponent(info.type || 'movie');
    var season = encodeURIComponent(info.season || '');
    var episode = encodeURIComponent(info.episode || '');
    var current = location.pathname + location.search;
    var sep = current.indexOf('?') === -1 ? '?' : '&';

    var urls = [
      current + sep + 'resolve=1',
      '/api/resolve?type=' + type + '&id=' + id + (season ? '&season=' + season : '') + (episode ? '&episode=' + episode : ''),
      '/api/m3u8?type=' + type + '&id=' + id + (season ? '&season=' + season : '') + (episode ? '&episode=' + episode : ''),
      '/resolve?type=' + type + '&id=' + id + (season ? '&season=' + season : '') + (episode ? '&episode=' + episode : ''),
      '/m3u8?type=' + type + '&id=' + id + (season ? '&season=' + season : '') + (episode ? '&episode=' + episode : '')
    ];

    if (info.type === 'tv' && season && episode) {
      urls.push('/api/resolve/tv/' + id + '/' + season + '/' + episode);
      urls.push('/api/m3u8/tv/' + id + '/' + season + '/' + episode);
      urls.push('/v3/m3u8/tv/' + id + '/' + season + '/' + episode);
    } else {
      urls.push('/api/resolve/movie/' + id);
      urls.push('/api/m3u8/movie/' + id);
      urls.push('/v3/m3u8/' + id);
    }

    return urls.filter(function (url, index, arr) {
      return id && arr.indexOf(url) === index;
    });
  }

  async function resolveM3u8FromServer(options) {
    options = options || {};
    var info = Object.assign(readWatchInfo(), options);
    var candidates = options.candidates || buildCandidates(info);
    var lastError = null;

    for (var i = 0; i < candidates.length; i += 1) {
      var url = candidates[i];
      try {
        var json = await requestJson(url);
        var source = pickSource(json);
        if (source) {
          window.SWIFLY_RESOLVED_M3U8 = source;
          window.dispatchEvent(new CustomEvent('swifly:m3u8-resolved', {
            detail: { source: source, url: url, response: json }
          }));
          return source;
        }
      } catch (err) {
        lastError = err;
        console.warn('[SwiflyTV] resolver candidate failed:', url, err && err.message ? err.message : err);
        await sleep(250);
      }
    }

    throw lastError || new Error('No m3u8 source returned from server resolver');
  }

  window.SWIFLY_RESOLVER_READY = true;
  window.__SWIFLY_RESOLVER_READY__ = true;
  window.swiflyResolverReady = true;

  window.SwiflyResolver = Object.assign(window.SwiflyResolver || {}, {
    ready: true,
    fallback: true,
    readWatchInfo: readWatchInfo,
    pickSource: pickSource,
    resolve: resolveM3u8FromServer,
    resolveM3u8: resolveM3u8FromServer,
    resolveM3u8FromServer: resolveM3u8FromServer
  });

  // Common names used by older SwiflyTV builds.
  window.resolveSwiflyM3u8 = window.resolveSwiflyM3u8 || resolveM3u8FromServer;
  window.resolveM3u8 = window.resolveM3u8 || resolveM3u8FromServer;
  window.getM3u8Source = window.getM3u8Source || resolveM3u8FromServer;
  window.loadM3u8Source = window.loadM3u8Source || resolveM3u8FromServer;

  window.dispatchEvent(new CustomEvent('swifly:resolver-script-ready', { detail: { fallback: true } }));
  window.dispatchEvent(new CustomEvent('swifly:resolver-ready', { detail: { fallback: true } }));
})();
