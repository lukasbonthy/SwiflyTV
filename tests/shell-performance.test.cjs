'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadServer } = require('./ui-helpers.cjs');

test('catalog pages reuse cached styles instead of repeating the entire theme', () => {
  const api = loadServer();
  const html = api.pageShell({ title: 'Catalog', active: 'home', body: '<main>Catalog</main>' });
  assert.match(html, /href="\/assets\/clean\/base\.css\?v=163"/);
  assert(Buffer.byteLength(html) < 160000, 'The shared shell should stay below 160 KB');
  assert.doesNotMatch(html, /<style>\s*:root/);
  api.io.close(); api.httpServer.close();
});

test('catalog and welcome do not load player or unused UI frameworks', () => {
  const api = loadServer();
  for (const active of ['home', 'welcome']) {
    const html = api.pageShell({ active, body: '<main>Fixture</main>' });
    assert.doesNotMatch(html, /<script[^>]+src="[^"]*(?:hls\.js|video\.min|socket\.io|driver\.js|notyf)/);
    assert.doesNotMatch(html, /<link[^>]+href="[^"]*(?:daisyui|flowbite|atropos|overlayscrollbars|simplebar|tippy|animate\.css)/);
  }
  const player = api.pageShell({ active: 'watch', player: true, body: '<main>Player</main>' });
  assert.match(player, /<script defer src="[^"]*hls\.js/);
  assert.match(player, /<script defer src="\/socket\.io\/socket\.io\.js"/);
  const party = api.pageShell({ active: 'social', body: '<main>Party</main>' });
  assert.match(party, /<script defer src="\/socket\.io\/socket\.io\.js"/);
  api.io.close(); api.httpServer.close();
});

test('the complete shared theme is served with a cache policy and CSS content type', async () => {
  const api = loadServer();
  await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + api.httpServer.address().port + '/assets/clean/base.css?v=163');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/css/);
    assert.match(response.headers.get('cache-control'), /max-age=86400/);
    const css = await response.text();
    assert.equal(css, fs.readFileSync(path.join(__dirname, '../public/clean/base.css'), 'utf8'));
    assert.match(css, /\.dsWelcomeHero/);
    assert.match(css, /\.movieCard/);
    assert.match(css, /\.netflixNav/);
  } finally { await new Promise(resolve => api.io.close(resolve)); }
});

test('versioned glass assets are browser-cacheable without changing their material', async () => {
  const api = loadServer();
  await new Promise(resolve => api.httpServer.listen(0, '127.0.0.1', resolve));
  try {
    const origin = 'http://127.0.0.1:' + api.httpServer.address().port;
    for (const file of ['liquid-glass.js?v=226', 'surfaces.js?v=224']) {
      const response = await fetch(origin + '/assets/liquid-glass/' + file);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /max-age=86400/);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
    const html = api.pageShell({ active: 'home' });
    assert(html.includes('/assets/liquid-glass/liquid-glass.js?v=226'));
    assert(html.includes('/assets/liquid-glass/surfaces.js?v=225'));
  } finally { await new Promise(resolve => api.io.close(resolve)); }
});
