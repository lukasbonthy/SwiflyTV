'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {browser,loadServer,cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);
const api = loadServer();

test('Font Awesome Free CSS is included once for the main Swifly shell',()=>{
  const html=api.pageShell({body:'<section><h1>Movies</h1></section>',active:'movies'});
  assert.match(html,/font-awesome\/6\.5\.2\/css\/all\.min\.css/);
  assert.equal((html.match(/font-awesome\/6\.5\.2\/css\/all\.min\.css/g)||[]).length,1);
  assert.match(html,/fontawesome-ui\.css\?v=1/);
  const doc=browser(html).window.document;
  assert(doc.querySelector('#svNavSearchToggle i.fa-magnifying-glass.fa-solid'));
  assert(doc.querySelector('.svNavPartyLink i.fa-user-group.fa-solid'));
  assert(doc.querySelector('#controlToggleTop i.fa-sliders.fa-solid'));
});

test('Every Font Awesome glyph stays decorative and the buttons keep accessible labels',()=>{
  const env=browser(api.pageShell({body:'<section>Catalog</section>',active:'movies'}));
  const d=env.window.document;
  for(const icon of d.querySelectorAll('i.svIcon.fa-solid,i.svIcon.fa-regular')){
    assert.equal(icon.getAttribute('aria-hidden'),'true');
    assert.equal(icon.textContent.trim(),'');
  }
  assert.equal(d.querySelector('#svNavSearchToggle').getAttribute('aria-label'),'Search movies and series');
  env.finish();
});

test('Font Awesome integration does not touch liquid-glass optics or the player bundle',()=>{
  const css=fs.readFileSync(path.resolve(__dirname,'../public/clean/fontawesome-ui.css'),'utf8');
  assert.match(css,/\.svIcon/);
  assert.doesNotMatch(css,/backdrop-filter|svg\s*\{|--sv-glass-|\.svNavMatchedLens/);
  assert.match(css,/fa-solid/);
});
