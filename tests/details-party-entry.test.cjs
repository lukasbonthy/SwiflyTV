const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, loadServer, tick, cleanup} = require('./ui-helpers.cjs');

const api = loadServer();
let base;
test.before(async () => {
  await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + api.httpServer.address().port;
});
test.after(async () => {await new Promise(resolve => api.io.close(resolve));});
test.afterEach(cleanup);

const movie = {id:101, title:'Arrival & The Visitors', release_date:'2016-11-11', poster_path:'/arrival.jpg', backdrop_path:'/arrival-wide.jpg', overview:'A linguist learns to understand visitors from another world.'};
function detailsMetadata(endpoint) {
  if (/^\/(movie|tv)\/[^/]+$/.test(endpoint)) {
    const id = endpoint.split('/').at(-1);
    return {...movie, id:Number(id) || movie.id, title:id === '202' ? 'The Other Film' : movie.title, name:'A series', first_air_date:'2016-11-11', seasons:[{season_number:1, episode_count:2}]};
  }
  if (endpoint.endsWith('/credits')) return {cast:[], crew:[]};
  if (endpoint.endsWith('/videos')) return {results:[{site:'YouTube', type:'Trailer', key:'trailerID'}]};
  return {results:[]};
}
async function details(type = 'movie', id = '101', modal = false) {
  api.setTmdb(async endpoint => detailsMetadata(endpoint));
  const response = await fetch(base + '/' + type + '/' + id + (modal ? '?view=modal' : ''));
  assert.equal(response.status, 200);
  return response.text();
}
const withoutStyles = html => html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
const parse = (html, options) => browser(withoutStyles(html), options);

test('Standalone movie details offer an accessible party action for the displayed title', async () => {
  const env = parse(await details()), d = env.window.document;
  const action = d.querySelector('.svDetailActions a[data-sv-party-movie-id="101"]');
  assert(action, 'Movie details need a Start a watch party link');
  assert.equal(action.getAttribute('href'), '/watch/movie/101?mode=movie&party=create');
  assert.equal(action.textContent.trim(), 'Start a watch party');
  assert.equal(action.getAttribute('aria-label'), 'Start a watch party for ' + movie.title);
  assert(action.classList.contains('dsSecondaryBtn'));
  assert.equal(action.querySelector('svg.svIcon')?.getAttribute('aria-hidden'), 'true');
  assert.equal(action.hasAttribute('data-play-id'), false, 'Starting a party must not count as playback');
  assert(d.querySelector('.svDetailActions a[href="/watch/movie/101?mode=movie"]'));
  assert(d.querySelector('.svDetailActions a[href="/watch/movie/101?mode=trailer"]'));
});

test('Modal movie details carry the actual selected movie into the party action', async () => {
  const html = await details('movie', '202', true), env = parse(html), d = env.window.document;
  assert(!/<!doctype/i.test(html));
  assert.equal(d.querySelector('h1').textContent.trim(), 'The Other Film');
  const action = d.querySelector('.svDetailActions a[data-sv-party-movie-id="202"]');
  assert(action, 'The shared details fragment needs its own movie party action');
  assert.equal(action.getAttribute('href'), '/watch/movie/202?mode=movie&party=create');
  assert.equal(action.getAttribute('aria-label'), 'Start a watch party for The Other Film');
});

test('Series details keep episode playback without claiming movie party support', async () => {
  for (const modal of [false, true]) {
    const env = parse(await details('tv', '101', modal)), d = env.window.document;
    assert.equal(d.querySelector('[data-sv-party-movie-id]'), null);
    assert(d.querySelector('.svDetailActions a[href="/watch/tv/101?mode=movie&s=1&e=1"]'));
    assert(d.querySelector('#episodes a[href="/watch/tv/101?mode=movie&s=1&e=2"]'));
  }
});

test('Movie details never create party links with invalid movie IDs', async () => {
  for (const id of ['0', '-1', '1.5', '00101', '101junk', '9007199254740992']) {
    const env = parse(await details('movie', id, true));
    assert.equal(env.window.document.querySelector('[data-sv-party-movie-id]'), null, id);
  }
});

test('The synchronous party page passes only strict positive IDs into its selected-movie markup', () => {
  api.setTmdb(async () => {throw new Error('A party page GET must not load or select media');});
  for (const [input, expected] of [['101', '101'], ['1', '1'], [undefined, ''], ['0', ''], ['-1', ''], ['1.5', ''], [' 101', ''], ['101junk', ''], ['00101', ''], ['9007199254740992', ''], [['101', '202'], ''], [{id:'101'}, '']]) {
    let html;
    const result = api.socialPage({query:{tab:'watchrooms', movieId:input}}, {send:value => {html = value;}});
    assert.equal(result instanceof Promise, false, 'socialPage must remain synchronous');
    const env = parse(html);
    assert.equal(env.window.document.querySelector('.svPartyHub').getAttribute('data-selected-movie-id'), expected, String(input));
  }
});

test('Opening the party page with a movie does not create a room', async () => {
  api.setTmdb(async endpoint => detailsMetadata(endpoint));
  const before = await (await fetch(base + '/api/social/watchrooms')).json();
  const response = await fetch(base + '/social?tab=watchrooms&movieId=101');
  assert.equal(response.status, 200);
  const env = parse(await response.text());
  assert.equal(env.window.document.querySelector('.svPlayerPage').getAttribute('data-player-id'), '101');
  assert(env.window.document.querySelector('dialog.svWatchPartyDialog'));
  const after = await (await fetch(base + '/api/social/watchrooms')).json();
  assert.deepEqual(after.rooms, before.rooms);
});

test('Featured party choices come from real trending movies with valid public metadata', async () => {
  let request;
  api.setTmdb(async (endpoint, params, ttl) => {
    request = {endpoint, params, ttl};
    return {results:[{...movie, adult:true}, {...movie, id:0}, {...movie, id:1.5}, {...movie, id:'101junk'}, {id:7}, movie, {id:102, original_title:'A Different Film', release_date:'2024-03-01'}, ...[103,104,105,106,107].map(id => ({id, title:'Film ' + id}))]};
  });
  const response = await fetch(base + '/api/social/movies/featured');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(request.endpoint, '/trending/movie/week');
  assert(request.ttl > 0, 'Featured metadata should use the existing TMDB cache');
  assert.equal(data.ok, true);
  assert.deepEqual(data.movies.map(item => item.id), [101,102,103,104,105,106]);
  assert.deepEqual(data.movies[0], {id:101, title:movie.title, year:'2016', poster:'https://image.tmdb.org/t/p/w342/arrival.jpg', backdrop:'https://image.tmdb.org/t/p/w1280/arrival-wide.jpg', overview:movie.overview});
  assert.deepEqual(data.movies[1], {id:102, title:'A Different Film', year:'2024', poster:'', backdrop:'', overview:''});
});

test('Featured movie failures return a generic retry response without provider secrets', async () => {
  for (const failure of [{__error:true, status:500, message:'TMDB_API_KEY=secret-key'}, new Error('https://provider.example?api_key=secret-key')]) {
    api.setTmdb(async () => {if (failure instanceof Error) throw failure; return failure;});
    const response = await fetch(base + '/api/social/movies/featured');
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.match(data.message, /unavailable|try again/i);
    assert(!JSON.stringify(data).includes('secret-key'));
  }
});

test('A selected party movie loads its actual metadata by ID', async () => {
  let request;
  api.setTmdb(async (endpoint, params, ttl) => {request = {endpoint, params, ttl}; return movie;});
  const response = await fetch(base + '/api/social/movies/101');
  assert.equal(response.status, 200);
  assert.equal(request.endpoint, '/movie/101');
  assert(request.ttl > 0);
  assert.deepEqual(await response.json(), {ok:true, movie:{id:101, title:movie.title, year:'2016', poster:'https://image.tmdb.org/t/p/w342/arrival.jpg', backdrop:'https://image.tmdb.org/t/p/w1280/arrival-wide.jpg', overview:movie.overview}});
});

test('A selected movie with no artwork keeps empty art fields and its original title', async () => {
  api.setTmdb(async () => ({id:202, original_title:'The Original Title'}));
  const response = await fetch(base + '/api/social/movies/202');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true, movie:{id:202, title:'The Original Title', year:'', poster:'', backdrop:'', overview:''}});
});

test('Selected-movie metadata rejects malformed IDs before contacting the provider', async () => {
  let calls = 0;
  api.setTmdb(async () => {calls++; return movie;});
  for (const id of ['0', '-1', '1.5', '00101', '101junk', '1e2', '9007199254740992', '%20101', '%2F101']) {
    const response = await fetch(base + '/api/social/movies/' + id);
    assert.equal(response.status, 400, id);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.match(data.message, /valid|invalid/i);
  }
  assert.equal(calls, 0);
});

test('Selected-movie lookup separates missing movies from service failures without leaking errors', async () => {
  for (const [failure, status] of [[{__error:true, status:404, message:'secret-key movie not found'}, 404], [{__error:true, status:401, message:'secret-key invalid API key'}, 503], [new Error('secret-key network error'), 503]]) {
    api.setTmdb(async () => {if (failure instanceof Error) throw failure; return failure;});
    const response = await fetch(base + '/api/social/movies/101');
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.match(data.message, status === 404 ? /not found|unavailable/i : /unavailable|try again/i);
    assert(!JSON.stringify(data).includes('secret-key'));
  }
});

test('Selected-movie lookup does not present adult or mismatched provider results', async () => {
  for (const [value, status] of [[{...movie, adult:true}, 404], [{...movie, id:202}, 503], [{id:101}, 503], [null, 503]]) {
    api.setTmdb(async () => value);
    const response = await fetch(base + '/api/social/movies/101');
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    assert.equal((await response.json()).ok, false);
  }
});

test('The metadata ID route leaves the existing movie title search route available', async () => {
  let endpoint;
  api.setTmdb(async path => {endpoint = path; return {results:[movie]};});
  const response = await fetch(base + '/api/social/movies/search?q=Arrival');
  assert.equal(response.status, 200);
  assert.equal(endpoint, '/search/movie');
  assert.equal((await response.json()).results[0].title, movie.title);
});

test('A normal standalone party click remembers its title page and preserves playback context', async () => {
  const env = parse(await details(), {path:'/movie/101?source=search#overview'}), w = env.window, d = w.document;
  w.sessionStorage.setItem('swiflytv.playReturn', '/search?q=previous&media=movie-99');
  w.sessionStorage.setItem('swiflytv.playContext', '{"previous":true}');
  w.localStorage.setItem('movieverse.continue', '[{"id":"99","title":"Previous movie"}]');
  const library = [...d.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('function syncLibraryButtons()'));
  assert(library, 'The actual watch-history controller should be exercised');
  w.eval(library.textContent);
  w.boot('details.js');
  const action = d.querySelector('[data-sv-party-movie-id]');
  assert(action);
  const click = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  action.querySelector('svg').dispatchEvent(click);
  assert.equal(click.defaultPrevented, false, 'The party link should navigate normally');
  assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/movie/101?source=search#overview');
  assert.equal(w.sessionStorage.getItem('swiflytv.playReturn'), '/search?q=previous&media=movie-99');
  assert.equal(w.sessionStorage.getItem('swiflytv.playContext'), '{"previous":true}');
  assert.equal(w.localStorage.getItem('movieverse.continue'), '[{"id":"99","title":"Previous movie"}]');
  assert.equal(d.querySelector('.svDetailDialog'), null);
});

test('A normal modal party click preserves catalog filters, selected movie, and hash', async () => {
  const fragment = await details('movie', '202', true), env = browser('<a id="open" href="/movie/202">Open movie</a>', {path:'/search?q=visitors&genre=18#results'}), w = env.window, d = w.document;
  let requests = 0;
  w.fetch = async () => {requests++; return {ok:true, text:async () => fragment};};
  w.boot('details.js');
  await w.SwiflyDetails.open('/movie/202', d.getElementById('open'));
  const action = d.querySelector('.svDetailDialog [data-sv-party-movie-id="202"]');
  assert(action);
  const click = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  action.dispatchEvent(click);
  await tick();
  assert.equal(click.defaultPrevented, false);
  assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/search?q=visitors&genre=18&media=movie-202#results');
  assert.equal(requests, 1, 'The party click must not request another details overlay');
});

test('Modified or new-tab party clicks do not overwrite the current tab return context', async () => {
  const env = parse(await details(), {path:'/movie/101'}), w = env.window, action = w.document.querySelector('[data-sv-party-movie-id]');
  assert(action);
  w.boot('details.js');
  w.sessionStorage.setItem('swiflytv.partyReturn', '/movies?genre=18');
  for (const modifier of [{ctrlKey:true}, {metaKey:true}, {altKey:true}, {shiftKey:true}, {button:1}]) {
    action.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true, ...modifier}));
    assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/movies?genre=18');
  }
  for (const [attribute, value] of [['target', '_blank'], ['download', '']]) {
    action.setAttribute(attribute, value);
    action.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
    assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/movies?genre=18');
    action.removeAttribute(attribute);
  }
  const prevented = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  prevented.preventDefault(); action.dispatchEvent(prevented);
  assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/movies?genre=18');
});

test('Party return storage ignores external destinations and mismatched title selection', async () => {
  const html = await details();
  for (const [source, destination] of [['/movie/101', 'https://unrelated.example/social?movieId=101'], ['/movie/101', 'javascript:alert(1)'], ['/movie/101', '/social?movieId=202'], ['/movie/101', '/watch/movie/101'], ['/watch/movie/101', '/social?movieId=101'], ['/search?media=movie-202', '/social?movieId=101']]) {
    const env = parse(html, {path:source}), w = env.window, action = w.document.querySelector('[data-sv-party-movie-id]');
    assert(action);
    w.fetch = async () => ({ok:true, text:async () => '<article class="svTitleDetails"><h1>Other movie</h1></article>'});
    w.boot('details.js');
    action.href = destination;
    w.sessionStorage.setItem('swiflytv.partyReturn', '/movies?genre=18');
    action.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
    assert.equal(w.sessionStorage.getItem('swiflytv.partyReturn'), '/movies?genre=18', source + ' → ' + destination);
    await tick();
  }
});

test('Party Return navigates to standalone details while ordinary movie links still open overlays', async () => {
  const fragment = await details('movie', '202', true);
  let html;
  api.socialPage({query:{tab:'watchrooms'}}, {send:value => {html = value;}});
  const env = parse(html, {path:'/social?tab=watchrooms'}), w = env.window, d = w.document;
  const back = d.querySelector('[data-party-return]');
  assert(back, 'The production Party page needs its browsing Return link');
  back.setAttribute('href', '/movie/101?source=search#overview');
  const requests = [];
  w.fetch = async url => {requests.push(String(url)); return {ok:true, text:async () => fragment};};
  w.boot('details.js');

  const handled = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  handled.preventDefault(); back.dispatchEvent(handled);
  await tick();
  assert.deepEqual(requests, [], 'A Return event handled by the Party page must stay handled');
  assert.equal(back.getAttribute('href'), '/movie/101?source=search#overview');

  const returnClick = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  back.dispatchEvent(returnClick);
  await tick();
  assert.equal(returnClick.defaultPrevented, false, 'Return should navigate to the saved title document');
  assert.deepEqual(requests, [], 'Return must not fetch a details overlay on the Party page');
  assert.equal(d.querySelector('.svDetailDialog'), null);

  const titleLink = d.createElement('a');
  titleLink.href = '/movie/202'; titleLink.textContent = 'The Other Film';
  d.querySelector('.svPartyHub').append(titleLink);
  const titleClick = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  titleLink.dispatchEvent(titleClick);
  await tick();
  assert.equal(titleClick.defaultPrevented, true, 'An ordinary title link should keep details behavior');
  assert.deepEqual(requests, ['/movie/202?view=modal']);
  assert.equal(d.querySelector('.svDetailDialog')?.open, true);
  assert.equal(d.querySelector('.svDetailDialog h1').textContent.trim(), 'The Other Film');
});
