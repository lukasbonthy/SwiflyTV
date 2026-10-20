'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/clean/details-premium.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('premium details stylesheet is loaded after cinema and TV styles', () => {
  const cinema = server.indexOf('/assets/clean/cinema.css?v=');
  const television = server.indexOf('/assets/clean/tv.css?v=');
  const premium = server.indexOf('/assets/clean/details-premium.css?v=1');
  assert(cinema >= 0 && television > cinema && premium > television,
    'new rules must override the old detail layout without changing the global player');
});

test('film detail art direction is scoped and supports smaller screens', () => {
  assert.match(css, /\.svCinemaPage \.svDetailHero/);
  assert.match(css, /\.svDetailPosterCard/);
  assert.match(css, /\.svDetailChapterNav/);
  assert.match(css, /\.svDetailOverview/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((stripped.match(/\{/g) || []).length, (stripped.match(/\}/g) || []).length);
});

test('glass remains shared, immediate and user-configurable', () => {
  assert.match(css, /\.svDetailIdentity\[data-cinema-reveal\]/);
  assert.match(css, /animation:none !important; opacity:1 !important;/);
  assert.match(css, /data-st-glass="liquid"/);
  assert.match(css, /data-st-glass="off"/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /data-sv-xbox="true"/);
  assert.match(css, /data-sv-tv="true"/);
  // This design doesn't replace or recolor the existing refraction face.
  assert.doesNotMatch(css, /\.svNavMatchedLens\s*\{/);
  assert.match(server, /data-sv-download-type=/);
  assert.match(server, /data-sv-party-movie-id=/);
});
