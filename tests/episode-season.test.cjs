'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const {findAiredEpisode, renderEpisodeSeason} = require('../ui/episode-season');

const today = '2026-07-04';
const season = {season_number: 2, name: 'Season two', overview: 'A new chapter.'};
const row = (episode_number, air_date = '2026-01-01', options = {}) => ({episode_number, air_date, ...options});
function view(episodeData, options = {}) {
  const markup = renderEpisodeSeason({id: '51', season, total: 100, selected: true, kidsMode: false, episodeData, today, ...options});
  return JSDOM.fragment(markup).querySelector('details.svSeason');
}
const cards = panel => [...panel.querySelectorAll('[data-library-episode]')];
const ordinals = panel => cards(panel).map(card => Number(card.dataset.libraryEpisode));

test('server rendering and exact playback eligibility agree on sparse, duplicated, future and malformed metadata', () => {
  const aired = row(4, today, {season_number: 2, name: 'Only today'});
  const episodeData = {episodes: [
    null, row(-1), row(0), row(2.5), row('3'), row(10000), row(7, '2026-01-01', {season_number: 3}),
    row(11, '2026-07-05'), aired, row(8, null), row(9, '2026-02-31'), row(11), row(4, '2026-07-06')
  ]};
  const panel = view(episodeData);
  assert.equal(panel.dataset.episodeShow, '51');
  assert.equal(panel.dataset.episodeSeason, '2');
  assert(panel.open);
  assert.deepEqual(ordinals(panel), [4,8,9,11]);
  assert.equal(panel.querySelector('a.svDetailEpisodeTile').getAttribute('href'), '/watch/tv/51?mode=movie&s=2&e=4');
  assert.equal(panel.querySelector('a[data-sv-download]').getAttribute('href'), '/download/tv/51?s=2&e=4');
  for (const card of cards(panel).slice(1)) {
    assert.equal(card.dataset.episodeAvailable, 'false');
    assert.equal(card.querySelector('a,button'), null);
    assert.match(card.textContent, /Release date to be announced|Airs 2026-07-05/);
  }
  assert.equal(findAiredEpisode(episodeData, '4', today, 2), aired);
  for (const episode of [1,3,7,8,9,11]) assert.equal(findAiredEpisode(episodeData, episode, today, 2), null);
});

test('an unavailable season has a retry target and never makes count-based links', () => {
  for (const episodeData of [null, {__error: true, episodes: [row(1)]}, {episodes: [null, row(0)]}]) {
    for (const kidsMode of [false, true]) {
      const panel = view(episodeData, {kidsMode});
      assert.equal(panel.dataset.episodeLoaded, undefined);
      assert.equal(cards(panel).length, 0);
      assert.match(panel.querySelector('[data-episode-status]').textContent, /details are unavailable/i);
      const links = [...panel.querySelectorAll('a')];
      assert.deepEqual(links.map(link => link.getAttribute('href')), [kidsMode ? '/kids/title/tv/51?season=2#episodes' : '/tv/51?season=2#episodes']);
    }
  }
});

test('server paging reaches actual later episodes with at most 24 rows in adult and Kids views', () => {
  const numbers = Array.from({length: 51}, (_, index) => (index + 1) * 2);
  const data = {episodes: [...numbers].reverse().map(number => row(number))};
  for (const kidsMode of [false, true]) {
    const path = kidsMode ? '/kids/title/tv/51' : '/tv/51';
    const seasonHref = (number, page = 1) => path+'?season='+number+'&episodePage='+page+'#episodes';
    let page = '1';
    const reached = [];
    while (page) {
      const panel = view(data, {kidsMode, page, seasonHref});
      assert(cards(panel).length <= 24);
      reached.push(...ordinals(panel));
      assert.equal(panel.querySelector('a[href*="e=25"]'), null);
      const next = panel.querySelector('a[rel="next"]');
      if (next) {
        const destination = new URL(next.getAttribute('href'), 'https://swifly.fixture');
        assert.equal(destination.pathname, path);
        assert.equal(destination.searchParams.get('season'), '2');
        page = destination.searchParams.get('episodePage');
      } else page = null;
    }
    assert.deepEqual(reached, numbers);
  }
});

test('Kids gets an in-scope season destination and preserves spoiler hooks without adult actions', () => {
  const heading = '<script>alert(1)</script>', plot = '<img onerror=alert(1)>';
  const data = {episodes: [row(4, today, {name: heading, overview: plot, still_path: '/still.jpg'}), row(7, today, {still_path: '//untrusted.example/still.jpg'})]};
  const selected = view(data, {kidsMode: true});
  assert.equal(selected.dataset.episodeLoaded, 'true');
  assert.equal(selected.querySelector('a.svDetailEpisodeTile').getAttribute('aria-label'), 'Play season 2, episode 4');
  assert.equal(selected.querySelector('a.svDetailEpisodeTile').getAttribute('href'), '/kids/watch/tv/51?mode=movie&s=2&e=4');
  assert.equal(selected.querySelector('.svEpisodeBrowserCopy strong[data-library-spoiler]').textContent, heading);
  assert.equal(selected.querySelector('.svEpisodeBrowserPlot[data-library-spoiler]').textContent, plot);
  assert.equal(selected.querySelector('img.svEpisodeBrowserStill[data-library-spoiler]').getAttribute('src'), 'https://image.tmdb.org/t/p/w300/still.jpg');
  assert.equal(selected.querySelector('.svEpisodeThumbnailFallback').textContent, '07');
  assert.equal(selected.querySelector('[data-sv-download],[data-episode-watched],script,[onerror]'), null);
  const closed = view(data, {kidsMode: true, selected: false});
  assert.equal(closed.open, false);
  assert.equal(closed.dataset.episodeLoaded, undefined);
  assert.equal(closed.querySelector('a').getAttribute('href'), '/kids/title/tv/51?season=2#episodes');
  assert.equal(cards(closed).length, 0);
});
