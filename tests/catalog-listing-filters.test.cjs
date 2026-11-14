'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadServer, browser, cleanup} = require('./ui-helpers.cjs');

test.afterEach(cleanup);

// The real listing renderer talks to TMDB through this boundary. Keep its
// collection response dates separate from the genre-filtered discovery page.
async function listing(query, type = 'movie', dates) {
  const api = loadServer(), calls = [];
  api.setTmdb(async (path, params = {}) => {
    calls.push({path, params});
    if (path.startsWith('/genre/')) return {genres: [{id: 28, name: 'Action'}, {id: 18, name: 'Drama'}]};
    return {
      ...(dates === undefined ? {} : {dates}),
      page: Number(params.page) || 1, total_pages: 4, total_results: 80,
      results: [{id: 123, [type === 'tv' ? 'name' : 'title']: 'A matching story', genre_ids: [28, 18], adult: false, poster_path: '/poster.jpg', vote_average: 8.5, vote_count: 300, release_date: '2026-11-14', first_air_date: '2020-01-01'}],
    };
  });
  try {
    let html;
    await api.listingPage({query}, {send(value) {html = value;}}, type);
    return {calls, document: browser(html).window.document};
  } finally {api.io.close();}
}

for (const type of ['movie', 'tv']) {
  test(type + ' top-rated genre results rank by rating and keep collection/page navigation', async () => {
    const {calls, document: d} = await listing({sort: 'top_rated', genre: '28', page: '2'}, type);
    const request = calls.find(call => call.path === '/discover/' + type);
    assert(request, 'Genre filtering must use the paginated discovery endpoint');
    assert.equal(request.params.sort_by, 'vote_average.desc');
    assert.equal(request.params['vote_count.gte'], 200);
    assert.equal(request.params.with_genres, '28');
    assert.equal(request.params.page, 2);
    assert.equal(d.querySelector('[name=sort]').value, 'top_rated');
    const next = new URL([...d.querySelectorAll('.pagination a')].find(a => a.textContent.includes('Next')).href);
    assert.equal(next.searchParams.get('sort'), 'top_rated');
    assert.equal(next.searchParams.get('genre'), '28');
    assert.equal(next.searchParams.get('page'), '3');
  });
}

test('changing a genre collection does not submit an inferred popularity override', async () => {
  const first = await listing({sort: 'popular', genre: '28', party: '1', page: '2'});
  const form = first.document.querySelector('.svBrowseFilters');
  const query = Object.fromEntries(new first.document.defaultView.FormData(form));
  query.sort = 'top_rated';
  const second = await listing(query);
  const request = second.calls.find(call => call.path === '/discover/movie');
  assert.equal(request.params.sort_by, 'vote_average.desc', 'Native form collection changes must use their new collection defaults');
  assert.equal(second.document.querySelector('[name=party]').value, '1');
});

for (const [type, order] of [['movie', 'primary_release_date.desc'], ['tv', 'first_air_date.desc']]) {
  test(type + ' retains a supported explicit discovery order with its selected collection', async () => {
    const {calls, document: d} = await listing({sort: 'top_rated', genre: '28', sort_by: order, page: '2'}, type);
    assert.equal(calls.find(call => call.path === '/discover/' + type).params.sort_by, order);
    assert.equal(d.querySelector('[name=sort_by]').value, order);
    const next = new URL([...d.querySelectorAll('.pagination a')].find(a => a.textContent.includes('Next')).href);
    assert.equal(next.searchParams.get('sort_by'), order);
  });
}

for (const [sort, dates] of [
  ['upcoming', {minimum: '2026-11-15', maximum: '2026-12-05'}],
  ['now_playing', {minimum: '2026-10-03', maximum: '2026-11-14'}],
]) {
  test(sort + ' with a genre uses TMDB’s theatrical release window on the requested page', async () => {
    const {calls, document: d} = await listing({sort, genre: '28', page: '2'}, 'movie', dates);
    const calendar = calls.find(call => call.path === '/movie/' + sort);
    assert(calendar, 'Read the collection’s actual release window rather than invent a date range');
    assert.equal(calendar.params.page, 2);
    const request = calls.find(call => call.path === '/discover/movie');
    assert.equal(request.params['release_date.gte'], dates.minimum);
    assert.equal(request.params['release_date.lte'], dates.maximum);
    assert.equal(request.params.with_release_type, '2|3');
    assert.equal(request.params.with_genres, '28');
    assert.equal(request.params.page, 2);
    assert.equal(d.querySelector('[name=sort]').value, sort);
  });
}

test('missing, impossible, or reversed release dates never broaden a movie collection into generic popularity', async () => {
  for (const dates of [undefined, {minimum: '2026-02-30', maximum: '2026-11-14'}, {minimum: 'tomorrow', maximum: '2026-11-14'}, {minimum: '2026-12-01', maximum: '2026-11-14'}]) {
    const {calls, document: d} = await listing({sort: 'now_playing', genre: '28'}, 'movie', dates);
    assert.equal(calls.some(call => call.path === '/discover/movie'), false, 'Invalid metadata must not request an unbounded discovery collection');
    assert.equal(d.querySelectorAll('.movieCard').length, 0);
    assert.match(d.body.textContent, /couldn’t load the catalog|unavailable/i);
  }
});

for (const [sort, maximum] of [['airing_today', '2026-11-14'], ['on_the_air', '2026-11-21']]) {
  test(sort + ' with a TV genre filters episode dates in one explicit timezone', async t => {
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-14T23:30:00Z')});
    const {calls} = await listing({sort, genre: '18', page: '2'}, 'tv');
    const request = calls.find(call => call.path === '/discover/tv');
    assert.equal(request.params['air_date.gte'], '2026-11-14');
    assert.equal(request.params['air_date.lte'], maximum);
    assert.equal(request.params.timezone, 'UTC');
    assert.equal(request.params['first_air_date.gte'], undefined, 'Long-running shows with an episode this week must remain eligible');
    assert.equal(request.params.with_genres, '18');
    assert.equal(request.params.page, 2);
  });
}

test('unsupported cross-format discovery orders fall back to the collection’s own ranking', async () => {
  for (const [type, order] of [['movie', 'first_air_date.desc'], ['tv', 'primary_release_date.desc']]) {
    const {calls, document: d} = await listing({sort: 'top_rated', genre: '28', sort_by: order}, type);
    assert.equal(calls.find(call => call.path === '/discover/' + type).params.sort_by, 'vote_average.desc');
    assert.equal(d.querySelector('[name=sort_by]'), null, 'An unsupported order must not persist into the native form');
  }
});
