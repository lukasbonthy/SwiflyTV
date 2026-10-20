
'use strict';
const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeArtwork=url=>/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[a-z0-9/_\-.]+$/i.test(String(url||''))?String(url):'';
const downloadIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
function downloadOptionsMarkup({type='movie',id='',title='Untitled',year='',rating='',runtime='',overview='',poster='',backdrop='',genres=[],season=1,episode=1,episodeTitle=''}={}){
  const kind=type==='tv'?'tv':'movie';
  const safeId=/^[1-9]\d{0,11}$/.test(String(id))?String(id):'';
  const s=Math.max(1,Math.min(9999,Number(season)||1)),e=Math.max(1,Math.min(9999,Number(episode)||1));
  const series=kind==='tv',episodeLabel=series?'Season '+s+' · Episode '+e:'Movie';
  const posterUrl=safeArtwork(poster),backdropUrl=safeArtwork(backdrop);
  const synopsis=String(overview||'').trim();
  const shownGenres=(Array.isArray(genres)?genres:[]).slice(0,4).map(item=>typeof item==='string'?item:item?.name).filter(Boolean);
  const home='/'+kind+'/'+encodeURIComponent(safeId);
  const watch='/watch/'+kind+'/'+encodeURIComponent(safeId)+'?mode=movie'+(series?'&s='+s+'&e='+e:'');
  return `<main class="svDownloadPage" data-sv-download-options data-download-type="${kind}" data-download-id="${escape(safeId)}" data-download-season="${s}" data-download-episode="${e}">
    <div class="svDownloadBackdrop" aria-hidden="true"${backdropUrl?` style="--sv-download-backdrop:url('${escape(backdropUrl)}')"`:''}></div>
    <div class="svDownloadContainer">
      <nav class="svDownloadBreadcrumb" aria-label="Breadcrumb"><a href="${home}">← Back to details</a><span aria-hidden="true">/</span><span>Downloads</span></nav>
      <header class="svDownloadHero">
        <div class="svDownloadPoster">${posterUrl?`<img src="${escape(posterUrl)}" alt="${escape(title)} poster" decoding="async"/>`:'<span class="svDownloadPosterFallback">SWIFLYTV</span>'}</div>
        <div class="svDownloadInfo">
          <p class="svDownloadEyebrow">SWIFLYTV <span aria-hidden="true">·</span> DOWNLOADS</p>
          <h1>${escape(title)}</h1>
          <div class="svDownloadMetadata"><span>${series?'▣ Series':'▣ Movie'}</span>${year?`<span>${escape(year)}</span>`:''}${rating?`<span class="svDownloadRating">★ ${escape(rating)}</span>`:''}${runtime?`<span>${escape(runtime)}</span>`:''}</div>
          ${shownGenres.length?`<div class="svDownloadGenres">${shownGenres.map(genre=>`<span>${escape(genre)}</span>`).join('')}</div>`:''}
          ${series?`<p class="svDownloadEpisodeLabel">${escape(episodeLabel)}${episodeTitle?' · '+escape(episodeTitle):''}</p>`:''}
          ${synopsis?`<p class="svDownloadSynopsis">${escape(synopsis)}</p>`:''}
          <div class="svDownloadHeroActions"><a href="${watch}" class="svDownloadWatchLink">▶ Watch ${series?'episode':'movie'}</a><a href="${home}" class="svDownloadBackLink">View details ↗</a></div>
        </div>
      </header>
      <section class="svDownloadOptionsSection" aria-labelledby="svDownloadOptionsHeading">
        <div class="svDownloadSectionHeader">
          <div class="svDownloadHeading"><span class="svDownloadHeadingIcon">${downloadIcon}</span><h2 id="svDownloadOptionsHeading">Download Options</h2><span class="svDownloadCount" data-sv-download-count aria-label="Available downloads">—</span></div>
          <button class="svDownloadRefresh" type="button" data-sv-download-refresh aria-label="Refresh available downloads" hidden>↻ Refresh</button>
        </div>
        <div class="svDownloadChoices" data-sv-download-choices aria-live="polite" aria-busy="true">
          <div class="svDownloadEmpty" data-sv-download-state="loading"><div class="svDownloadProgressIcon">${downloadIcon}</div><strong>Checking available downloads…</strong><p>Finding compatible files for ${escape(series?episodeLabel:'this title')}.</p></div>
        </div>
        <p class="svDownloadNotice">Downloads depend on the file source and your browser. Only download media you have permission to save.</p>
      </section>
      <footer class="svDownloadFooter"><span>SWIFLYTV</span><span>Premium viewing, simpler downloads</span></footer>
    </div>
  </main>`;
}
module.exports={downloadOptionsMarkup};
