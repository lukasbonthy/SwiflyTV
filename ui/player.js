'use strict';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function mediaUrl(value) {
  const text = String(value || '').trim();
  if (!text || /[\u0000-\u001f]/.test(text)) return '';
  try { const url = new URL(text, 'https://swifly.invalid'); return ['https:','http:'].includes(url.protocol) ? text : ''; }
  catch { return ''; }
}
const paths = {
  close:'m6 6 12 12M6 18 18 6',back:'m14 6-6 6 6 6',play:'m9 5 11 7-11 7V5Z',pause:'M8 5v14M16 5v14',rewind:'M5 8a8 8 0 1 1-1 8M5 8V3M5 8h5',forward:'M19 8a8 8 0 1 0 1 8M19 8V3M19 8h-5',volume:'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',mute:'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6',settings:'m9.5 3-.6 2.3-2 1.2-2.3-.6-2.5 4.2 1.7 1.7v2.4l-1.7 1.7 2.5 4.2 2.3-.6 2 1.2.6 2.3h5l.6-2.3 2-1.2 2.3.6 2.5-4.2-1.7-1.7v-2.4l1.7-1.7-2.5-4.2-2.3.6-2-1.2L14.5 3h-5ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',pip:'M3 4h18v16H3V4Zm9 8h7v6h-7v-6Z',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',retry:'M20 7v5h-5m5-1a8 8 0 1 0-1 6',film:'M4 3h16v18H4V3Zm0 5h16M4 16h16M8 3v5m8-5v5M8 16v5m8-5v5'
};
const icon = name => `<svg class="svPlayerIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/>${name==='rewind'||name==='forward'?'<text x="12" y="15.5" text-anchor="middle" stroke="none" fill="currentColor">10</text>':''}</svg>`;
const button = (attribute, name, glyph, extra='') => `<button type="button" class="svPlayerControl${attribute==='data-player-play'?' svPlayerPlay':''}" ${attribute} aria-label="${name}" title="${name}" ${extra}>${icon(glyph)}</button>`;

function episodePickerMarkup(options={}) {
  const season=Math.max(1,parseInt(options.season,10)||1),episode=Math.max(1,parseInt(options.episode,10)||1);
  const rows=new Map((Array.isArray(options.episodes)?options.episodes:[]).filter(row=>Number.isSafeInteger(row.episode_number)&&row.episode_number>0).map(row=>[row.episode_number,row]));
  let count=Math.max(1,Number(options.episodeCount)||1,episode);
  for(const number of rows.keys())count=Math.max(count,number);
  count=Math.floor(Math.min(Number.MAX_SAFE_INTEGER,count));
  const seasons=(Array.isArray(options.seasons)?options.seasons:[]).filter(row=>Number.isSafeInteger(row.season_number)&&row.season_number>0).slice(0,40);
  const link=(s,e)=>`/watch/tv/${encodeURIComponent(String(options.id||''))}?`+new URLSearchParams({mode:'movie',s:String(s),e:String(e),...(options.provider?{provider:String(options.provider)}:{})});
  const step=(attribute,e,label,glyph)=>e<1||e>count
    ?`<button type="button" class="dsSecondaryBtn svPlayerEpisodeStep" ${attribute} disabled aria-label="${label}">${icon(glyph)}<span>${label}</span></button>`
    :`<a class="dsSecondaryBtn svPlayerEpisodeStep" ${attribute} href="${escape(link(season,e))}" aria-label="${label}">${icon(glyph)}<span>${label}</span></a>`;
  const selected=rows.get(episode),first=Math.max(1,Math.min(episode-20,count-199)),shown=Math.min(200,count);
  const episodes=Array.from({length:shown},(_,index)=>{
    const number=first+index,row=rows.get(number),name=String(row?.name||`Episode ${number}`),still=mediaUrl(row?.still);
    const runtime=Number(row?.runtime)>0&&Number.isFinite(Number(row.runtime))?`${Math.round(Number(row.runtime))} min`:'';
    const overview=String(row?.overview||'').trim();
    return `<a class="svPlayerEpisode${number===episode?' active':''}" data-player-episode-link href="${escape(link(season,number))}" ${number===episode?'aria-current="page"':''} aria-label="${escape(`Play season ${season}, episode ${number}: ${name}`)}">
      <span class="svPlayerEpisodeThumb">${still?`<img src="${escape(still)}" loading="lazy" decoding="async" alt=""/>`:icon('film')}<b aria-hidden="true">${String(number).padStart(2,'0')}</b>${number===episode?'<span class="svPlayerEpisodeSelected">Selected</span>':''}<span class="svPlayerEpisodePlay" aria-hidden="true">${icon('play')}</span></span>
      <span class="svPlayerEpisodeText"><span class="svPlayerEpisodeKicker">Episode ${number}${runtime?`<span aria-hidden="true"> · </span>${runtime}`:''}</span><strong>${escape(name)}</strong>${overview?`<span class="svPlayerEpisodeOverview">${escape(overview)}</span>`:''}</span></a>`;
  }).join('');
  return `<section class="svPlayerEpisodes svGlassSurface svGlassPanel" data-cinema-reveal aria-labelledby="svPlayerEpisodesTitle">
    <div class="svPlayerEpisodesHead"><div><span class="svPlayerEyebrow">KEEP THE STORY GOING</span><h2 id="svPlayerEpisodesTitle">Episodes<span class="svPlayerEpisodeSeason">Season ${season}</span></h2><p>Season ${season} · Episode ${episode}${selected?.name?` — ${escape(selected.name)}`:''}</p></div>
      <nav class="svPlayerEpisodeSteps" aria-label="Episode navigation">${step('data-player-episode-previous',episode-1,'Previous episode','back')}${step('data-player-episode-next',episode+1,'Next episode','forward')}</nav></div>
    ${seasons.length?`<nav class="svPlayerSeasons" aria-label="Seasons">${seasons.map(row=>`<a class="dsSecondaryBtn svPlayerSeason${row.season_number===season?' active':''}" data-player-season-link href="${escape(link(row.season_number,1))}" ${row.season_number===season?'aria-current="true"':''}><span>Season ${row.season_number}</span>${Number.isSafeInteger(row.episode_count)&&row.episode_count>0?`<small class="svPlayerSeasonCount">${row.episode_count} episodes</small>`:''}</a>`).join('')}</nav>`:''}
    <nav class="svPlayerEpisodeGrid" aria-label="Season ${season} episodes">${episodes}</nav>
  </section>`;
}

function playerMarkup(options = {}) {
  const type = options.type === 'tv' ? 'tv' : 'movie';
  const mode = !options.embedded && options.mode === 'trailer' ? 'trailer' : 'movie';
  const id = String(options.id || '');
  const title = String(options.title || (type === 'tv' ? 'TV series' : 'Movie'));
  const season = Math.max(1, parseInt(options.season,10) || 1);
  const episode = Math.max(1, parseInt(options.episode,10) || 1);
  const poster = mediaUrl(options.poster), backdrop = mediaUrl(options.backdrop), trailer = mediaUrl(options.trailerUrl);
  const detailUrl = `/${type}/${encodeURIComponent(id)}`;
  const watchUrl = `/watch/${type}/${encodeURIComponent(id)}`;
  const query = (choice) => '?' + new URLSearchParams({mode:choice,... (type==='tv' ? {s:String(season),e:String(episode)} : {}), ...(options.provider ? {provider:String(options.provider)} : {})}).toString();
  const episodeCopy = type === 'tv' ? `Season ${season} · Episode ${episode}` : 'Movie';
  const chapter = type === 'tv' ? `S${String(season).padStart(2,'0')} · E${String(episode).padStart(2,'0')}` : mode==='trailer'?'OFFICIAL TRAILER':'FEATURE FILM';
  const mediaNoun=type==='tv'?'episode':'movie';
  const meta = [options.year,episodeCopy,mode==='trailer' ? 'Official trailer' : 'Now watching'].filter(Boolean).map(escape).join('<span aria-hidden="true">·</span>');
  const statusTitle = options.managed ? 'Waiting for your party' : `Getting your ${mediaNoun} ready`;
  const statusCopy = options.managed ? 'Your host will choose when to start.' : 'Making your seat comfortable. This should only take a moment.';
  const controlPrefix = options.embedded ? String(options.videoId || 'svEmbeddedPlayer') : 'svPlayer';
  const noteId = controlPrefix + 'TransportNote';
  const rootAttributes = `data-player-root data-player-id="${escape(id)}" data-player-type="${type}" data-player-season="${season}" data-player-episode="${episode}" data-player-provider="${escape(options.provider || '')}" data-player-mode="${mode}" data-player-managed="${options.managed ? 'true':'false'}" data-player-state="${mode==='trailer'?'trailer':options.managed?'waiting':'loading'}"`;
  const movieSurface = `<div class="svPlayerStage" data-player-stage tabindex="0" role="group" aria-label="${type==='tv'?'Episode':'Movie'} player" aria-describedby="${escape(noteId)}">
    ${backdrop ? `<img class="svPlayerScene" data-player-art src="${escape(backdrop)}" alt="" aria-hidden="true"/>` : ''}
    <video ${options.videoId ? `id="${escape(options.videoId)}"` : ''} class="svPlayerVideo" data-player-video controls playsinline preload="metadata" ${poster ? `poster="${escape(backdrop || poster)}"` : ''} aria-label="${escape(title)}"></video>
    <div class="svPlayerShade" aria-hidden="true"></div>
    <div class="svPlayerStageChrome" aria-hidden="true"><span class="svPlayerStageBrand"><i></i>SWIFLYTV CINEMA</span><span>${chapter}</span></div>
    <div class="svPlayerStatus" data-player-status role="status" aria-live="polite" aria-atomic="true">
      <span class="svPlayerStatusMark" data-player-status-mark aria-hidden="true">${icon('film')}</span>
      <span class="svPlayerEyebrow" data-player-status-label>${type==='tv'?'YOUR EPISODE':'YOUR MOVIE NIGHT'}</span>
      <h2 data-player-status-title>${statusTitle}</h2><p data-player-status-copy>${statusCopy}</p>
      <button type="button" class="svPlayerAction svPlayerRetry" data-player-retry hidden>${icon('retry')}Retry playback</button>
    </div>
    <div class="svPlayerDock" data-player-controls hidden>
      <div class="svPlayerTimelineRow"><span class="svPlayerTime svPlayerTimeCurrent" data-player-current>0:00</span><div class="svPlayerTimeline"><div class="svPlayerTimelineTrack" aria-hidden="true"><i data-player-buffered></i><b data-player-progress></b></div><input data-player-seek type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek through ${mediaNoun}" aria-valuetext="0:00" disabled/></div><span class="svPlayerTime svPlayerTimeDuration" data-player-duration>—</span></div>
      <div class="svPlayerDockRow"><div class="svPlayerTransport">
        ${button('data-player-play',`Play ${mediaNoun}`,'play','disabled')}${button('data-player-backward','Back 10 seconds','rewind','disabled')}${button('data-player-forward','Forward 10 seconds','forward','disabled')}
      </div><div class="svPlayerTools">
        <details class="svPlayerPopover svPlayerVolume" data-player-volume-menu><summary class="svPlayerControl" aria-label="Volume" title="Volume">${icon('volume')}</summary><div class="svPlayerPopoverBody svPlayerVolumeBody" popover="manual"><div class="svPlayerPopoverHeading"><span>Volume</span><button type="button" class="svPlayerMenuClose" data-player-volume-close aria-label="Close volume">${icon('close')}</button></div><div class="svPlayerVolumeRow">${button('data-player-mute',`Mute ${mediaNoun}`,'mute')}<input id="${escape(controlPrefix)}Volume" data-player-volume type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume"/></div><span class="svPlayerMenuHint">Your sound. Just for you.</span></div></details>
        <details class="svPlayerPopover" data-player-settings><summary class="svPlayerControl" aria-label="Playback settings" title="Playback settings">${icon('settings')}</summary><div class="svPlayerPopoverBody svPlayerSettingsBody" popover="manual"><div class="svPlayerPopoverHeading"><span>Playback settings</span><button type="button" class="svPlayerMenuClose" data-player-settings-close aria-label="Close playback settings">${icon('close')}</button></div>
          <label for="${escape(controlPrefix)}Quality">Picture quality<select id="${escape(controlPrefix)}Quality" data-player-quality disabled><option value="-1">Original</option></select></label>
          <label for="${escape(controlPrefix)}Speed">Playback speed<select id="${escape(controlPrefix)}Speed" data-player-speed><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          <label for="${escape(controlPrefix)}Captions">Captions<select id="${escape(controlPrefix)}Captions" data-player-captions disabled><option value="-1">Unavailable</option></select></label>
          <button type="button" class="svPlayerMenuAction" data-player-pip aria-label="Picture in picture" hidden>${icon('pip')}<span>Picture in picture</span></button>
          ${options.embedded ? `<button type="button" class="svPlayerMenuAction" data-player-sync>${icon('retry')}Sync playback</button>` : ''}
        </div></details>
        ${button('data-player-fullscreen','Enter fullscreen','fullscreen','hidden')}
      </div></div>
    </div>
    <button type="button" class="svPlayerAction svPlayerUnlock" data-player-unlock hidden>${icon('play')}<span>Start playback</span></button>
    <span class="svPlayerToast" data-player-toast role="status" hidden></span>
  </div>`;
  const trailerSurface = `<div class="svPlayerStage svPlayerStage--trailer">${trailer ? `<iframe class="svPlayerTrailer" src="${escape(trailer)}" title="${escape(title)} — official trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` : `<div class="svPlayerStatus"><span class="svPlayerEyebrow">OFFICIAL TRAILER</span><h2>There isn’t a trailer here yet.</h2><p>You can return to the movie when you’re ready.</p><a class="dsPrimaryBtn" href="${escape(watchUrl+query('movie'))}">Watch ${type==='tv'?'episode':'movie'}</a></div>`}</div>`;
  if (options.embedded) return `<section class="svPlayer svPlayerEmbedded" ${rootAttributes} aria-label="${escape(title)}">${movieSurface}<p class="svPlayerEmbeddedNote" id="${escape(noteId)}" data-player-transport-note>Your host controls playback. Your volume and captions are yours.</p></section>`;
  return `<main class="svPlayer svPlayerPage svCinemaPage" data-cinema-page="player" ${rootAttributes}>
    ${backdrop?`<div class="svPlayerAmbient" aria-hidden="true"><img src="${escape(backdrop)}" alt="" decoding="async"/></div>`:''}
    <header class="svPlayerPageHead" data-cinema-reveal><div class="svPlayerPageReturn"><a class="dsSecondaryBtn svPlayerBack" href="${escape(detailUrl)}" data-sv-player-back>${icon('back')}<span>Back to details</span></a><span class="svPlayerHeadNote">Your theater. Your time.</span></div>
      <nav class="svPlayerModes svGlassSurface svGlassPanel" aria-label="Watch mode"><a data-player-mode-link class="${mode==='movie'?'active':''}" href="${escape(watchUrl+query('movie'))}" ${mode==='movie'?'aria-current="page"':''}>${type==='tv'?'Episode':'Movie'}</a>${trailer ? `<a data-player-mode-link class="${mode==='trailer'?'active':''}" href="${escape(watchUrl+query('trailer'))}" ${mode==='trailer'?'aria-current="page"':''}>Trailer</a>` : ''}</nav>
    </header>
    <div class="svPlayerLayout"><section class="svPlayerMain" aria-labelledby="svPlayerTitle"><div class="svPlayerTheater" data-cinema-reveal>${mode==='trailer'?trailerSurface:movieSurface}</div>
      <div class="svPlayerBelow svGlassSurface svGlassPanel" data-cinema-reveal><div class="svPlayerFilm">${poster ? `<a class="svPlayerPoster" href="${escape(detailUrl)}" tabindex="-1" aria-hidden="true"><img src="${escape(poster)}" alt="" decoding="async"/></a>`:''}<div class="svPlayerIdentity"><div class="svPlayerIdentityHead"><span class="svPlayerChapter">${chapter}</span><div class="svPlayerMetadata">${meta}</div></div><h1 id="svPlayerTitle">${escape(title)}</h1>${type==='tv'&&options.episodeTitle&&mode==='movie'?`<p class="svPlayerEpisodeName">${escape(options.episodeTitle)}</p>`:''}<p class="svPlayerTransportNote" id="${escape(noteId)}" data-player-transport-note>${mode==='trailer'?'A first look at the story.':'Settle in. The rest can wait.'}</p></div></div>
      ${type==='movie'&&mode==='movie' ? `<div class="svPlayerTogether"><span>Better with company</span><button type="button" class="dsSecondaryBtn svPlayerPartyButton" data-player-party-open>${icon('people')}<span>Watch together</span></button></div>`:''}</div>
      ${type==='tv'&&options.episodePickerHtml ? `<div class="svPlayerEpisodePicker">${options.episodePickerHtml}</div>` : ''}
      <noscript><p class="svPlayerNoScript">Enable JavaScript to prepare ${mediaNoun} playback.</p></noscript>
    </section><aside class="svPlayerPartySlot" data-player-party-slot aria-label="Watch party">${options.partyPanelHtml || ''}</aside></div>
  </main>`;
}

module.exports = {playerMarkup,episodePickerMarkup};
