'use strict';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function mediaUrl(value) {
  const text = String(value || '').trim();
  if (!text || /[\u0000-\u001f]/.test(text)) return '';
  try { const url = new URL(text, 'https://swifly.invalid'); return ['https:','http:'].includes(url.protocol) ? text : ''; }
  catch { return ''; }
}
const paths = {
  back:'m14 6-6 6 6 6',play:'m9 5 11 7-11 7V5Z',pause:'M8 5v14M16 5v14',rewind:'M11 5 3 12l8 7V5Zm10 0-8 7 8 7V5Z',forward:'m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z',volume:'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',mute:'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3-1 2 3-2 2 1 3 2 1-2 3-3-1-2 3h-4l-1-3-3 1-2-3 2-2-1-3-2-1 2-3 3 1 2-3Z',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',pip:'M3 4h18v16H3V4Zm9 8h7v6h-7v-6Z',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',retry:'M20 7v5h-5m5-1a8 8 0 1 0-1 6',film:'M4 3h16v18H4V3Zm0 5h16M4 16h16M8 3v5m8-5v5M8 16v5m8-5v5'
};
const icon = name => `<svg class="svPlayerIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const button = (attribute, name, glyph, extra='') => `<button type="button" class="dsIconBtn svPlayerControl" ${attribute} aria-label="${name}" title="${name}" ${extra}>${icon(glyph)}</button>`;

function playerMarkup(options = {}) {
  const type = options.type === 'tv' ? 'tv' : 'movie';
  const mode = options.mode === 'trailer' ? 'trailer' : 'movie';
  const id = String(options.id || '');
  const title = String(options.title || (type === 'tv' ? 'TV series' : 'Movie'));
  const season = Math.max(1, parseInt(options.season,10) || 1);
  const episode = Math.max(1, parseInt(options.episode,10) || 1);
  const poster = mediaUrl(options.poster), backdrop = mediaUrl(options.backdrop), trailer = mediaUrl(options.trailerUrl);
  const detailUrl = `/${type}/${encodeURIComponent(id)}`;
  const watchUrl = `/watch/${type}/${encodeURIComponent(id)}`;
  const query = (choice) => '?' + new URLSearchParams({mode:choice,... (type==='tv' ? {s:String(season),e:String(episode)} : {}), ...(options.provider ? {provider:String(options.provider)} : {})}).toString();
  const episodeCopy = type === 'tv' ? `Season ${season} · Episode ${episode}` : 'Movie';
  const meta = [options.year,episodeCopy,mode==='trailer' ? 'Official trailer' : 'Now watching'].filter(Boolean).map(escape).join('<span aria-hidden="true">·</span>');
  const statusTitle = options.managed ? 'Waiting for your party' : 'Getting your movie ready';
  const statusCopy = options.managed ? 'Your host will choose when to start.' : 'Making your seat comfortable. This should only take a moment.';
  const movieSurface = `<div class="svPlayerStage" data-player-stage tabindex="0" role="group" aria-label="Movie player" aria-describedby="svPlayerTransportNote">
    ${backdrop ? `<img class="svPlayerScene" data-player-art src="${escape(backdrop)}" alt="" aria-hidden="true"/>` : ''}
    <video class="svPlayerVideo" data-player-video controls playsinline preload="metadata" ${poster ? `poster="${escape(backdrop || poster)}"` : ''} aria-label="${escape(title)}"></video>
    <div class="svPlayerShade" aria-hidden="true"></div>
    <div class="svPlayerStatus" data-player-status role="status" aria-live="polite" aria-atomic="true">
      <span class="svPlayerStatusMark" data-player-status-mark aria-hidden="true">${icon('film')}</span>
      <span class="svPlayerEyebrow" data-player-status-label>YOUR MOVIE NIGHT</span>
      <h2 data-player-status-title>${statusTitle}</h2><p data-player-status-copy>${statusCopy}</p>
      <button type="button" class="dsPrimaryBtn svPlayerRetry" data-player-retry hidden>${icon('retry')}Retry playback</button>
    </div>
    <div class="svPlayerDock" data-player-controls hidden>
      <div class="svPlayerTimeline"><div class="svPlayerTimelineTrack" aria-hidden="true"><i data-player-buffered></i><b data-player-progress></b></div><input data-player-seek type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek through movie" aria-valuetext="0:00" disabled/></div>
      <div class="svPlayerDockRow"><div class="svPlayerTransport">
        ${button('data-player-play','Play movie','play','disabled')}${button('data-player-backward','Back 10 seconds','rewind','disabled')}${button('data-player-forward','Forward 10 seconds','forward','disabled')}
        <span class="svPlayerTime"><span data-player-current>0:00</span><span aria-hidden="true">/</span><span data-player-duration>—</span></span>
      </div><div class="svPlayerTools">
        <details class="svPlayerPopover svPlayerVolume" data-player-volume-menu><summary class="dsIconBtn svPlayerControl" aria-label="Volume" title="Volume">${icon('volume')}</summary><div class="svPlayerPopoverBody"><label for="svPlayerVolume">Volume</label><input id="svPlayerVolume" data-player-volume type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume"/>${button('data-player-mute','Mute movie','mute')}</div></details>
        <details class="svPlayerPopover" data-player-settings><summary class="dsIconBtn svPlayerControl" aria-label="Playback settings" title="Playback settings">${icon('settings')}</summary><div class="svPlayerPopoverBody svPlayerSettingsBody">
          <label for="svPlayerQuality">Picture quality<select id="svPlayerQuality" data-player-quality disabled><option value="-1">Original</option></select></label>
          <label for="svPlayerSpeed">Playback speed<select id="svPlayerSpeed" data-player-speed><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          <label for="svPlayerCaptions">Captions<select id="svPlayerCaptions" data-player-captions disabled><option value="-1">Unavailable</option></select></label>
        </div></details>
        ${button('data-player-pip','Picture in picture','pip','hidden')}${button('data-player-fullscreen','Enter fullscreen','fullscreen','hidden')}
      </div></div>
    </div>
    <button type="button" class="dsPrimaryBtn svPlayerUnlock" data-player-unlock hidden>${icon('play')}<span>Start playback</span></button>
    <span class="svPlayerToast" data-player-toast role="status" hidden></span>
  </div>`;
  const trailerSurface = `<div class="svPlayerStage svPlayerStage--trailer">${trailer ? `<iframe class="svPlayerTrailer" src="${escape(trailer)}" title="${escape(title)} — official trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` : `<div class="svPlayerStatus"><span class="svPlayerEyebrow">OFFICIAL TRAILER</span><h2>There isn’t a trailer here yet.</h2><p>You can return to the movie when you’re ready.</p><a class="dsPrimaryBtn" href="${escape(watchUrl+query('movie'))}">Watch ${type==='tv'?'episode':'movie'}</a></div>`}</div>`;
  return `<main class="svPlayerPage" data-player-id="${escape(id)}" data-player-type="${type}" data-player-season="${season}" data-player-episode="${episode}" data-player-provider="${escape(options.provider || '')}" data-player-mode="${mode}" data-player-managed="${options.managed ? 'true':'false'}" data-player-state="${mode==='trailer'?'trailer':options.managed?'waiting':'loading'}">
    <header class="svPlayerPageHead"><a class="dsSecondaryBtn svPlayerBack" href="${escape(detailUrl)}" data-sv-player-back>${icon('back')}<span>Back to details</span></a>
      <nav class="svPlayerModes" aria-label="Watch mode"><a data-player-mode-link class="${mode==='movie'?'active':''}" href="${escape(watchUrl+query('movie'))}" ${mode==='movie'?'aria-current="page"':''}>${type==='tv'?'Episode':'Movie'}</a>${trailer ? `<a data-player-mode-link class="${mode==='trailer'?'active':''}" href="${escape(watchUrl+query('trailer'))}" ${mode==='trailer'?'aria-current="page"':''}>Trailer</a>` : ''}</nav>
    </header>
    <div class="svPlayerLayout"><section class="svPlayerMain" aria-labelledby="svPlayerTitle">${mode==='trailer'?trailerSurface:movieSurface}
      <div class="svPlayerBelow"><div class="svPlayerFilm">${poster ? `<a class="svPlayerPoster" href="${escape(detailUrl)}" tabindex="-1" aria-hidden="true"><img src="${escape(poster)}" alt=""/></a>`:''}<div><div class="svPlayerMetadata">${meta}</div><h1 id="svPlayerTitle">${escape(title)}</h1><p class="svPlayerTransportNote" id="svPlayerTransportNote" data-player-transport-note>${mode==='trailer'?'A first look at the story.':'Settle in. The rest can wait.'}</p></div></div>
      ${type==='movie'&&mode==='movie' ? `<button type="button" class="dsSecondaryBtn svPlayerPartyButton" data-player-party-open>${icon('people')}<span>Watch together</span></button>`:''}</div>
      ${type==='tv'&&options.episodePickerHtml ? `<div class="svPlayerEpisodePicker">${options.episodePickerHtml}</div>` : ''}
      <noscript><p class="svPlayerNoScript">Enable JavaScript to prepare movie playback.</p></noscript>
    </section><aside class="svPlayerPartySlot" data-player-party-slot aria-label="Watch party">${options.partyPanelHtml || ''}</aside></div>
  </main>`;
}

module.exports = {playerMarkup};
