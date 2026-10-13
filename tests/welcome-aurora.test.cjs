const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {browser, tick, cleanup} = require('./ui-helpers.cjs');
const {studioMarkup} = require('../ui/studio');
let welcomeMarkup;
try { ({welcomeMarkup} = require('../ui/welcome')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
test.afterEach(cleanup);

const appearanceKey = 'swiflytv.appearance';
const hero = {id:42, title:'Blade Runner 2049', release_date:'2017-10-04', poster_path:'/blade.jpg', backdrop_path:'/blade-scene.jpg'};
const movie = {id:17, title:'Arrival', release_date:'2016-11-10', poster_path:'/arrival.jpg'};
const series = {id:29, name:'Severance', first_air_date:'2022-02-18', poster_path:'/severance.jpg'};
const options = {
  siteName:'SwiflyTV', brand:'SwiflyTV', redirect:'%2Fprofiles', hero,
  trendingMovies:[hero,movie], popularMovies:[movie], popularTv:[series],
  renderRail:(title) => '<section class="dsWelcomeRail"><h2>'+title+'</h2></section>',
  backdropUrl:value => 'https://image.tmdb.org/t/p/w1280'+value,
  posterUrl:value => 'https://image.tmdb.org/t/p/w342'+value
};
function welcome(overrides = {}) {
  assert.equal(typeof welcomeMarkup, 'function', 'The new welcome renderer must be available');
  return welcomeMarkup({...options,...overrides});
}
function addStyle(env, file) {
  const style = env.window.document.createElement('style');
  const filename = path.join(__dirname, '../public', file);
  if (fs.existsSync(filename)) style.textContent = fs.readFileSync(filename, 'utf8');
  env.window.document.head.append(style);
}
function studio(values = {}, overrides = {}) {
  const env = browser('<button id="controlToggleTop">Studio</button>'+studioMarkup(), overrides);
  for (const [name,value] of Object.entries(values)) env.window.localStorage.setItem(name,value);
  addStyle(env, 'clean/aurora.css');
  env.window.boot('studio/studio.js');
  env.window.boot('clean/aurora.js');
  env.click = selector => {
    const element = env.window.document.querySelector(selector);
    assert(element, 'Missing Studio control '+selector);
    element.click();
  };
  return env;
}

test('Welcome showcases real catalog titles and artwork with bounded image loading', () => {
  const env = browser(welcome()), d = env.window.document;
  assert.equal(d.querySelectorAll('main.dsWelcomePage').length, 1);
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.equal(d.querySelectorAll('.dsWelcomeRail').length, 3);
  const spotlight = d.querySelector('.svWelcomeSpotlight');
  assert(spotlight.textContent.includes(hero.title));
  assert.equal(spotlight.querySelector('img').getAttribute('src'), options.posterUrl(hero.poster_path));
  assert.equal(d.querySelector('.dsWelcomeHeroBg img').getAttribute('src'), options.backdropUrl(hero.backdrop_path));
  assert.equal(d.querySelectorAll('.svWelcomeShowcase img').length, 3, 'The showcase must deduplicate titles');
  assert(d.querySelector('.svWelcomeShowcase').textContent.includes(series.name));
  assert.equal(d.querySelectorAll('img[loading="eager"]').length, 1, 'Only critical artwork is eager');
  assert([...d.querySelectorAll('.svWelcomeShowcase img')].every(image => image.loading === 'lazy' || image.getAttribute('loading') === 'lazy'));
  assert([...d.querySelectorAll('img')].every(image => image.getAttribute('decoding') === 'async'));
  assert(!d.querySelector('video,iframe,script'), 'The welcome page should remain a static introduction');
});

test('Welcome preserves signup and login redirects and real title destinations', () => {
  const redirect = '%2Fwatch%2Fmovie%2F42%3Fresume%3D120%26mode%3Dfull';
  const env = browser(welcome({redirect})), d = env.window.document;
  assert.equal(d.querySelector('.dsWelcomeActions .dsPrimaryBtn').getAttribute('href'), '/signup?redirect='+redirect);
  assert.equal(d.querySelector('.dsWelcomeActions .dsSecondaryBtn').getAttribute('href'), '/login?redirect='+redirect);
  assert.equal(d.querySelector('.dsWelcomeNavLinks a[href^="/login"]').getAttribute('href'), '/login?redirect='+redirect);
  const destination = new URL(d.querySelector('.svWelcomeSpotlight').href).searchParams.get('redirect');
  assert.equal(destination, '/movie/42');
  assert(d.querySelector('.dsWelcomeNavLinks a[href="#discovery"]'));
  assert(d.querySelector('#discovery'));
});

test('Welcome escapes catalog text, branding, redirects and artwork attributes independently', () => {
  const unsafe = 'A & B <img src=x onerror="alert(1)">';
  const artwork = 'https://image.tmdb.org/a.jpg?name=" onerror="alert(1)&extra=\'x';
  const env = browser(welcome({brand:unsafe,siteName:unsafe,redirect:'%2Fprofiles" data-attacker="true',
    hero:{...hero,title:unsafe},trendingMovies:[],popularMovies:[],popularTv:[],
    backdropUrl:() => artwork,posterUrl:() => artwork})), d = env.window.document;
  assert.equal(d.querySelector('.dsWelcomeBrand').textContent.trim(), unsafe);
  assert.equal(d.querySelector('.svWelcomeSpotlight strong').textContent, unsafe);
  assert.equal(d.querySelector('.dsWelcomeHeroBg img').getAttribute('src'), artwork);
  assert.equal(d.querySelector('.svWelcomeSpotlight img').getAttribute('alt'), unsafe+' poster');
  assert(!d.querySelector('[onerror],[data-attacker],script'));
  assert.equal(d.querySelector('.dsWelcomeActions .dsPrimaryBtn').getAttribute('href'), '/signup?redirect=%2Fprofiles" data-attacker="true');
});

test('Welcome keeps an honest empty-catalog fallback with working auth links', () => {
  const calls = [];
  const env = browser(welcome({hero:{},trendingMovies:[],popularMovies:[],popularTv:[],
    renderRail:(...args) => {calls.push(args);return '';}})), d = env.window.document;
  assert(d.querySelector('.dsWelcomeFallback').textContent.includes('Connect TMDB'));
  assert.equal(d.querySelector('.dsWelcomeFallback a').getAttribute('href'), '/signup?redirect=%2Fprofiles');
  assert(!d.querySelector('.svWelcomeShowcase,.dsWelcomeHeroBg'));
  assert.equal(calls.length, 0);
});

test('Welcome sends the existing catalog arrays to the existing rail renderer', () => {
  const calls = [];
  welcome({renderRail:(...args) => {calls.push(args);return '';}});
  assert.deepEqual(calls, [
    ['Trending movies', options.trendingMovies, 'movie'],
    ['Popular series', options.popularTv, 'tv'],
    ['Popular movies', options.popularMovies, 'movie']
  ]);
});

test('New users get Aurora without writing settings, while saved Clean and Film grain stay intact', () => {
  const initial = studio(), w = initial.window;
  assert.equal(w.document.body.dataset.stBackdrop, 'aurora');
  assert.equal(w.localStorage.getItem(appearanceKey), null);
  assert(w.document.querySelector('.svAuroraBackground[aria-hidden="true"]'));
  for (const backdrop of ['smooth','grain']) {
    const record = JSON.stringify({version:1,values:{backdrop}});
    const saved = studio({[appearanceKey]:record});
    assert.equal(saved.window.document.body.dataset.stBackdrop, backdrop);
    assert.equal(saved.window.localStorage.getItem(appearanceKey), record);
    const legacy = studio({['movieverse.backdrop']:backdrop});
    assert.equal(legacy.window.document.body.dataset.stBackdrop, backdrop);
    assert.equal(legacy.window.localStorage.getItem(appearanceKey), null);
  }
});

test('Aurora previews in Studio, Cancel restores the saved backdrop, and Save persists the choice', () => {
  const record = JSON.stringify({version:1,values:{backdrop:'smooth'}});
  const env = studio({[appearanceKey]:record}), w = env.window, d = w.document;
  env.click('#controlToggleTop');env.click('[data-st-field="backdrop"][data-st-value="aurora"]');
  assert.equal(d.body.dataset.stBackdrop, 'aurora');
  assert.notEqual(w.getComputedStyle(d.querySelector('[data-st-preview-aurora]')).display, 'none');
  assert.equal(w.localStorage.getItem(appearanceKey), record);
  env.click('[data-st-cancel]');
  assert.equal(d.body.dataset.stBackdrop, 'smooth');
  assert.equal(w.localStorage.getItem(appearanceKey), record);
  env.click('#controlToggleTop');env.click('[data-st-field="backdrop"][data-st-value="aurora"]');env.click('[data-st-save]');
  assert.equal(JSON.parse(w.localStorage.getItem(appearanceKey)).values.backdrop, 'aurora');
  assert.equal(d.getElementById('controlPanel').open, false);
});

test('Welcome exposes Studio through an accessible control and restores its focus on Cancel', () => {
  const env = browser(welcome()+studioMarkup()), w = env.window, d = w.document;
  w.boot('studio/studio.js');
  const trigger = d.querySelector('[data-st-open]');
  assert(trigger);trigger.click();
  assert(d.getElementById('controlPanel').open);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  d.querySelector('[data-st-cancel]').click();
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(d.activeElement, trigger);
});

test('Studio on Welcome previews the actual spotlight title and its existing artwork', () => {
  const env = browser(welcome()+studioMarkup()), w = env.window, d = w.document;
  w.boot('studio/studio.js');d.querySelector('[data-st-open]').click();
  assert.equal(d.querySelector('[data-st-preview-title]').textContent, hero.title);
  assert(d.querySelector('[data-st-preview-scene]').style.backgroundImage.includes(options.backdropUrl(hero.backdrop_path)));
  assert.equal(d.querySelector('.stPreviewPoster img').src, options.posterUrl(hero.poster_path));
});

test('Aurora has no frame loop and pauses when the document is hidden', () => {
  const env = studio(), w = env.window, d = w.document;
  assert(w.SwiflyAurora, 'A small Aurora lifecycle controller must initialize');
  assert.equal(d.body.dataset.svAuroraState, 'live');
  let hidden = true;
  Object.defineProperty(d, 'hidden', {configurable:true,get:() => hidden});
  d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(d.body.dataset.svAuroraState, 'still');
  hidden = false;d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(d.body.dataset.svAuroraState, 'live');
  w.boot('clean/aurora.js');
  assert.equal(w.frameCount(), 0, 'Ambient movement must use CSS rather than a scheduled frame loop');
});

test('Device and app reduced motion both keep Aurora still', async () => {
  const env = studio({}, {reduced:true}), w = env.window, d = w.document;
  assert.equal(d.body.dataset.svAuroraState, 'still');
  w.reduceMotion(false);assert.equal(d.body.dataset.svAuroraState, 'live');
  d.body.classList.add('reduceMotion');await tick();
  assert.equal(d.body.dataset.svAuroraState, 'still');
  d.body.classList.remove('reduceMotion');await tick();
  assert.equal(d.body.dataset.svAuroraState, 'live');
});

test('Watch pages suppress Aurora even when the user saved it', () => {
  const env = studio({}, {path:'/watch/movie/42'}), d = env.window.document;
  assert.equal(d.body.dataset.stBackdrop, 'aurora');
  assert.equal(d.body.dataset.svAuroraState, 'off');
  assert.equal(env.window.getComputedStyle(d.querySelector('.svAuroraBackground')).display, 'none');
  assert.equal(env.window.frameCount(), 0);
});

test('Aurora Lab previews color, strength and movement; Cancel reverses and Save persists', () => {
  const env=studio(), w=env.window, d=w.document;
  env.click('#controlToggleTop');
  const settings=d.querySelector('[data-st-aurora-settings]');
  assert.equal(settings.hidden,false);
  env.click('[data-st-field="auroraColor"][data-st-value="violet"]');
  const slider=d.querySelector('[data-st-aurora-strength]');
  slider.value='45';slider.dispatchEvent(new w.Event('input',{bubbles:true}));
  env.click('[data-st-field="auroraMotion"][data-st-value="still"]');
  assert.equal(d.body.dataset.stAuroraColor,'violet');
  assert.equal(d.body.dataset.stAuroraMotion,'still');
  assert.equal(d.body.style.getPropertyValue('--sv-aurora-strength'),'0.45');
  assert.equal(d.querySelector('[data-st-aurora-strength-value]').textContent,'45%');
  env.click('[data-st-cancel]');
  assert.equal(d.body.dataset.stAuroraColor,'glacier');
  assert.equal(d.body.style.getPropertyValue('--sv-aurora-strength'),'0.8');
  assert.equal(w.localStorage.getItem(appearanceKey),null);
  env.click('#controlToggleTop');
  env.click('[data-st-field="auroraColor"][data-st-value="rose"]');
  env.click('[data-st-save]');
  assert.equal(JSON.parse(w.localStorage.getItem(appearanceKey)).values.auroraColor,'rose');
});

test('Aurora Lab hides its extra controls for a non-Aurora backdrop', () => {
 const env=studio(), d=env.window.document;
 env.click('#controlToggleTop');
 env.click('[data-st-field="backdrop"][data-st-value="smooth"]');
 assert.equal(d.querySelector('[data-st-aurora-settings]').hidden,true);
 env.click('[data-st-field="backdrop"][data-st-value="aurora"]');
 assert.equal(d.querySelector('[data-st-aurora-settings]').hidden,false);
});
