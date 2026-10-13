'use strict';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const items = value => Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : [];
const titleOf = item => String(item?.title || item?.name || '');
const typeOf = item => item?.media_type === 'tv' || (!item?.title && item?.name) ? 'tv' : 'movie';
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const studioIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 14.7 9.3 21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/></svg>';

function welcomeMarkup({siteName = 'SwiflyTV', brand = 'SwiflyTV', redirect = '%2Fprofiles', hero = {}, trendingMovies = [], popularMovies = [], popularTv = [], renderRail = () => '', backdropUrl = () => '', posterUrl = () => ''} = {}) {
  const trending = items(trendingMovies), movies = items(popularMovies), television = items(popularTv);
  const hasTitles = [trending,movies,television].some(list => list.length);
  const signup = '/signup?redirect='+redirect, login = '/login?redirect='+redirect;
  const scene = hero?.backdrop_path ? backdropUrl(hero.backdrop_path) : '';
  const seen = new Set();
  const selection = [{item:hero,type:typeOf(hero)}, ...trending.map(item => ({item,type:'movie'})), ...television.map(item => ({item,type:'tv'})), ...movies.map(item => ({item,type:'movie'}))].filter(({item,type}) => {
    if (!titleOf(item) || item?.id == null || item.id === '') return false;
    const key = type+':'+item.id;
    if (seen.has(key)) return false;
    seen.add(key);return true;
  }).slice(0,3);
  const showcase = selection.map(({item,type},index) => {
    const title = titleOf(item), poster = item.poster_path ? posterUrl(item.poster_path) : '';
    const year = String(item.release_date || item.first_air_date || '').match(/^\d{4}/)?.[0];
    const href = '/signup?redirect='+encodeURIComponent('/'+type+'/'+encodeURIComponent(String(item.id)));
    return `<a class="svWelcomePoster ${index === 0 ? 'svWelcomeSpotlight' : 'svWelcomeSupportingPoster'}" href="${escape(href)}" aria-label="Sign up to discover ${escape(title)}">
      <div class="svWelcomePosterArt">${poster ? `<img src="${escape(poster)}" alt="${escape(title)} poster" width="342" height="513" loading="lazy" decoding="async">` : `<span class="svWelcomePosterFallback" aria-hidden="true">${escape(title.slice(0,1))}</span>`}</div>
      <div class="svWelcomePosterCaption">${index === 0 ? '<small>In the spotlight</small>' : ''}<strong>${escape(title)}</strong><span>${year ? escape(year)+' · ' : ''}${type === 'tv' ? 'Series' : 'Movie'}</span></div>
    </a>`;
  }).join('');

  return `<main class="dsWelcomePage svWelcomeClean">
    <a class="svWelcomeSkip" href="#discovery">Skip to titles</a>
    <nav class="dsWelcomeNav" aria-label="Welcome navigation">
      <div class="svLiquidPane" data-swifly-glass aria-hidden="true"></div>
      <a class="dsWelcomeBrand" href="/welcome">${escape(brand)}</a>
      <div class="dsWelcomeNavLinks"><a href="#discovery">Browse</a><a href="${escape(login)}">Log in</a><button class="svWelcomeStudio" type="button" data-st-open aria-label="Open appearance Studio" aria-controls="controlPanel" aria-expanded="false" title="Appearance Studio">${studioIcon}</button></div>
    </nav>
    <section class="dsWelcomeHero" aria-labelledby="svWelcomeTitle" data-has-art="${Boolean(showcase)}">
      ${scene ? `<div class="dsWelcomeHeroBg" aria-hidden="true"><img src="${escape(scene)}" alt="" width="1280" height="720" loading="eager" fetchpriority="high" decoding="async"></div>` : ''}
      <div class="svWelcomeHeroGrid">
        <div class="dsWelcomeHeroCopy">
          <span class="dsEyebrow"><i aria-hidden="true"></i>${escape(siteName)} · Movies &amp; series</span>
          <h1 id="svWelcomeTitle">Good stories.<br><span>Great nights.</span></h1>
          <p>Find your next favorite. Keep the ones you love.<br class="svWelcomeDesktopBreak"> Make movie night your own.</p>
          <div class="dsWelcomeActions"><a class="dsPrimaryBtn" href="${escape(signup)}">Get started ${arrow}</a><a class="dsSecondaryBtn" href="${escape(login)}">Log in</a></div>
          <div class="svWelcomePersonalNote"><span aria-hidden="true">${studioIcon}</span><span>Your profile. Your list. Your atmosphere.</span></div>
        </div>
        ${showcase ? `<div class="svWelcomeShowcase" aria-label="A selection from the catalog">${showcase}</div>` : ''}
      </div>
      <a class="svWelcomeDiscoverLink" href="#discovery"><span>A little inspiration for tonight</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m-5-5 5 5 5-5"/></svg></a>
    </section>
    <section id="discovery" class="dsWelcomeDiscovery" aria-labelledby="svWelcomeDiscoveryTitle" tabindex="-1">
      <div class="svWelcomeDiscoveryIntro"><div><span>FIND YOUR NEXT FAVORITE</span><h2 id="svWelcomeDiscoveryTitle">What are you in the mood for?</h2></div><p>A world of stories, ready to explore.</p></div>
      ${hasTitles ? renderRail('Trending movies',trending,'movie')+renderRail('Popular series',television,'tv')+renderRail('Popular movies',movies,'movie') : `<section class="dsWelcomeFallback"><h3>Discover movies and series</h3><p>Connect TMDB to show trending titles here. You can still create your profile and sign in.</p><a class="dsSecondaryBtn" href="${escape(signup)}">Create account ${arrow}</a></section>`}
    </section>
    <footer class="svWelcomeFooter"><a href="/welcome">${escape(brand)}</a><span>Make yourself comfortable.</span><a href="${escape(login)}">Already have an account? Log in ${arrow}</a></footer>
  </main>`;
}

module.exports = {welcomeMarkup};
