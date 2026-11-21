'use strict';

const pageSize = 24;
const utcDay = () => new Date().toISOString().slice(0, 10);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const validOrdinal = value => Number.isSafeInteger(value) && value >= 1 && value <= 9999;

function validAirDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const day = new Date(value);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : '';
}

function episodesByNumber(episodeData, seasonNumber) {
  const episodes = new Map();
  if (episodeData?.__error || !Array.isArray(episodeData?.episodes)) return episodes;
  for (const row of episodeData.episodes) {
    const number = row?.episode_number;
    if (!validOrdinal(number) || episodes.has(number)) continue;
    if (seasonNumber != null && row.season_number != null && String(row.season_number) !== String(seasonNumber)) continue;
    episodes.set(number, row);
  }
  return episodes;
}

function orderedSeasonEpisodes(episodeData, seasonNumber) {
  return [...episodesByNumber(episodeData, seasonNumber).values()].sort((a, b) => a.episode_number - b.episode_number);
}

function findAiredEpisode(episodeData, episodeNumber, today = utcDay(), seasonNumber) {
  if (!/^[1-9]\d{0,3}$/.test(String(episodeNumber))) return null;
  const episode = episodesByNumber(episodeData, seasonNumber).get(Number(episodeNumber));
  const date = validAirDate(episode?.air_date);
  return date && date <= today ? episode : null;
}

function episodeCard(row, {id, number, today, kidsMode}) {
  const episode = row.episode_number;
  const ordinal = String(episode).padStart(2, '0');
  const date = validAirDate(row.air_date);
  const available = !!date && date <= today;
  const runtimeMinutes = Number(row.runtime);
  const runtime = runtimeMinutes > 0 && runtimeMinutes < 1440 ? Math.round(runtimeMinutes)+' min' : '';
  const meta = available ? [date, runtime].filter(Boolean).join(' · ') : date ? 'Airs '+date : 'Release date to be announced';
  const still = typeof row.still_path === 'string' && /^\/[A-Za-z0-9_.-]+$/.test(row.still_path)
    ? `<img class="svEpisodeBrowserStill" src="https://image.tmdb.org/t/p/w300${escapeHtml(row.still_path)}" alt="" width="300" height="169" loading="lazy" decoding="async" data-library-spoiler>`
    : `<span class="svEpisodeThumbnailFallback" aria-hidden="true">${ordinal}</span>`;
  const thumbnail = `<span class="svEpisodeBrowserThumbnail">${still}<span class="svEpisodePlaybackBadge" aria-hidden="true">${available?'▶':'Coming soon'}</span>${runtime?`<span class="svEpisodeRuntime" aria-hidden="true">${runtime}</span>`:''}</span>`;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name : 'Episode '+episode;
  const plot = typeof row.overview === 'string' && row.overview.trim() ? `<span class="svEpisodeBrowserPlot" data-library-spoiler>${escapeHtml(row.overview)}</span>` : '';
  const copy = `<span class="svEpisodeBrowserCopy"><small>EPISODE ${ordinal}</small><strong data-library-spoiler>${escapeHtml(name)}</strong><span class="svEpisodeBrowserMeta">${meta}</span>${plot}</span>`;
  const tile = available
    ? `<a class="svDetailEpisodeTile" href="${kidsMode?'/kids':''}/watch/tv/${id}?mode=movie&amp;s=${number}&amp;e=${episode}" aria-label="Play season ${number}, episode ${episode}">${thumbnail}${copy}</a>`
    : `<div class="svDetailEpisodeTile">${thumbnail}${copy}</div>`;
  const actions = available && !kidsMode
    ? `<span class="svEpisodeActions"><button type="button" class="svEpisodeWatched" data-episode-watched aria-pressed="false" aria-label="Mark watched, episode ${episode}" hidden disabled>○</button><a class="svDetailEpisodeDownload" href="/download/tv/${id}?s=${number}&amp;e=${episode}" data-sv-download data-sv-download-type="episode" aria-label="Download season ${number} episode ${episode}" title="Download episode">↓</a></span>`
    : '';
  return `<div class="svDetailEpisodeChoice svEpisodeBrowserCard" role="listitem" data-library-card data-library-id="${id}" data-library-type="tv" data-library-season="${number}" data-library-episode="${episode}" data-episode-available="${available}">${tile}${actions}</div>`;
}

function renderEpisodeSeason({id, season, total, selected, kidsMode, episodeData, seasonHref, today = utcDay(), page = 1}) {
  const number = Number(season?.season_number);
  if (!validOrdinal(number) || !/^[1-9]\d{0,11}$/.test(String(id))) return '';
  id = encodeURIComponent(id);
  const episodes = selected ? orderedSeasonEpisodes(episodeData, number) : [];
  const hasMetadata = episodes.length > 0;
  const count = Number.isSafeInteger(total) && total >= 0 ? total : episodes.length;
  const scope = kidsMode ? '/kids/title/tv/' : '/tv/';
  const sectionPath = scope + id;
  function href(episodePage = 1) {
    const fallback = sectionPath+'?season='+number+(episodePage > 1 ? '&episodePage='+episodePage : '')+'#episodes';
    const target = seasonHref?.(number, episodePage);
    return escapeHtml(typeof target === 'string' && target.startsWith(sectionPath+'?') ? target : fallback);
  }
  const lastPage = Math.max(1, Math.ceil(episodes.length / pageSize));
  const currentPage = Math.min(lastPage, /^[1-9]\d*$/.test(String(page)) ? Number(page) : 1);
  const offset = (currentPage - 1) * pageSize;
  const visible = episodes.slice(offset, offset + pageSize);
  const rows = visible.map(row => episodeCard(row, {id, number, today, kidsMode})).join('');
  const browse = `<a class="dsSecondaryBtn" href="${href()}">Browse season ${number}</a>`;
  const unavailable = `<div class="svEpisodeBrowserStatus" data-episode-status role="status">Episode details are unavailable. <a class="dsSecondaryBtn" href="${href()}">Retry</a></div>`;
  const overview = season.overview ? `<p data-library-spoiler>${escapeHtml(season.overview)}</p>` : '';
  let pager = '';
  if (lastPage > 1) {
    const previous = currentPage > 1 ? `<a class="dsSecondaryBtn" rel="prev" href="${href(currentPage - 1)}">Previous</a>` : '';
    const next = currentPage < lastPage ? `<a class="dsSecondaryBtn" rel="next" href="${href(currentPage + 1)}">Next</a>` : '';
    pager = `<nav class="svEpisodePages" data-episode-pages aria-label="Episode pages">${previous}<span>${offset+1}–${offset+visible.length} of ${episodes.length}</span>${next}</nav>`;
  }
  return `<details class="svSeason" data-episode-show="${id}" data-episode-season="${number}"${kidsMode?' data-episode-kids':''}${kidsMode&&hasMetadata?' data-episode-loaded="true"':''}${hasMetadata?` data-episode-metadata-count="${episodes.length}"`:''}${selected?` data-episode-initial-page="${currentPage}" open`:''}>
    <summary><span class="svSeasonIdentity"><b class="svSeasonNumber">${String(number).padStart(2, '0')}</b><strong>${escapeHtml(season.name || 'Season '+number)}</strong></span><span>${count} episode${count===1?'':'s'}</span></summary>
    ${overview}<div class="dsEpisodeChips" data-episode-view="rows"${hasMetadata?` role="list" aria-label="Season ${number} episodes"`:''}>${selected ? (rows || unavailable) : browse}</div>${pager}
  </details>`;
}

module.exports = {findAiredEpisode, orderedSeasonEpisodes, renderEpisodeSeason, validAirDate};
