'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {loadServer} = require('../ui-helpers.cjs');
const migration = '../..' + '/lib/react-document.cjs';

test('every page renders as a real React tree and retains its original styles and controls', async () => {
  const {compileDocument, renderDocument} = require(migration);
  const api = loadServer();
  try {
    for (const active of ['home','movies','tv','watch','social','profiles','account','settings','study']) {
      const html = api.pageShell({active, player:active==='watch', body:'<main id="fixture"><h1>Exact &amp; original</h1><input value="original" /><textarea>Notes</textarea><svg viewBox="0 0 24 24"><path stroke-width="2" d="M0 0h4"/></svg></main>'});
      const model = compileDocument(html);
      const result = await renderDocument(model, {entry:'/react-assets/app.js',css:['/react-assets/app.css']});
      const before = new JSDOM(html).window.document;
      const after = new JSDOM(result).window.document;
      assert.equal(after.querySelector('main').outerHTML, before.querySelector('main').outerHTML);
      assert.equal(after.title, before.title);
      const originalStyles = [...before.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href);
      assert.deepEqual([...after.querySelectorAll('link[rel=stylesheet]')].slice(0, originalStyles.length).map(x=>x.href), originalStyles);
      assert(after.querySelector('#controlPanel'), 'Studio stays on every applicable page');
      assert(after.querySelector('#swifly-react-data'));
      assert.equal(after.querySelector('script[type=module]').getAttribute('src'), '/react-assets/app.js');
      assert(!result.includes('/api/modern/source-page'));
      assert(!result.includes('http://127.0.0.1:3000'));
      before.defaultView.close();after.defaultView.close();
    }
  } finally {api.io.close();api.httpServer.close();}
});

test('seven cards render on the server, with every remaining title preserved in the React model', async () => {
  const {compileDocument,renderDocument} = require(migration);
  const cards=Array.from({length:20},(_,i)=>`<article class="movieCard dsCard"><a href="/movie/${i+1}">Movie ${i+1}</a><button data-watch-id="${i+1}" type="button">Save</button></article>`).join('');
  const html=`<!doctype html><html><head><title>Seven</title></head><body class="svCleanShell"><section class="dsRow svCatalogRow"><div class="svSectionHead"><h2>Popular</h2><div class="svSectionActions"><a href="/movies">View all</a></div></div><div class="movieRail dsRail">${cards}</div></section></body></html>`;
  const result=await renderDocument(compileDocument(html),{entry:'/react-assets/app.js'});
  const dom=new JSDOM(result),doc=dom.window.document;
  assert.equal(doc.querySelectorAll('.movieRail > .movieCard').length,7);
  assert.equal(doc.querySelector('.movieRail').dataset.svReactRail,'true');
  assert.equal(doc.querySelector('button[aria-label="Previous titles"]').disabled,true);
  assert.equal(doc.querySelector('button[aria-label="Next titles"]').disabled,false);
  assert.match(doc.querySelector('[data-sv-react-range]').textContent,/1–7 of 20/);
  assert.match(doc.getElementById('swifly-react-data').textContent,/Movie 20/);
  assert.equal(doc.querySelector('.svSectionActions > a').getAttribute('href'),'/movies');
  dom.window.close();
});

test('controller order and non-executable JSON survive the document compiler', () => {
  const {compileDocument} = require(migration);
  const model=compileDocument('<html><head><script>window.early=1;</script><script defer src="/assets/first.js"></script></head><body><script>window.inline=1;</script><script type="application/json" id="settings">{"name":"preserve"}</script><script defer src="/assets/last.js"></script><script type="module" src="/assets/model.js"></script></body></html>');
  assert.deepEqual(model.scripts.map(x=>x.src||x.code),['window.inline=1;','/assets/first.js','/assets/last.js','/assets/model.js']);
  assert.match(model.head,/window.early=1/);
  assert.doesNotMatch(model.head,/first.js/);
  assert.match(JSON.stringify(model.nodes),/application\/json/);
});

test('parser-blocking room scripts load before the inline controller that captures their socket',()=>{
  const {compileDocument}=require(migration);
  const model=compileDocument('<html><head><script src="/assets/early.js"></script><script defer src="/assets/deferred.js"></script></head><body><main>Room</main><script src="/socket.io/socket.io.js"></script><script>window.roomSocket=io();</script><script type="module" src="/assets/module.js"></script></body></html>');
  assert.match(model.head,/src="\/assets\/early.js"/);
  assert.deepEqual(model.scripts.map(x=>x.src||x.code),['/socket.io/socket.io.js','window.roomSocket=io();','/assets/deferred.js','/assets/module.js']);
});

test('boot payload cannot terminate its JSON script', async () => {
  const {compileDocument,renderDocument}=require(migration);
  const html='<html><head><title>Safe</title></head><body><div data-value="&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&lt;/script&gt;</div></body></html>';
  const dom=new JSDOM(await renderDocument(compileDocument(html),{entry:'/react-assets/app.js'}));
  assert.equal(dom.window.document.querySelectorAll('script').length,2);
  const model=JSON.parse(dom.window.document.getElementById('swifly-react-data').textContent);
  assert.match(JSON.stringify(model.nodes),/<\/script>/);
  dom.window.close();
});

test('saved Studio appearance is primed before page content and JSON remains readable',async()=>{
  const {compileDocument,renderDocument}=require(migration);
  const model=compileDocument('<html><head><title>Theme</title></head><body><script data-sv-studio-prime>document.body.dataset.theme="saved";</script><main>Page</main><script id="settings" type="application/json">{"label":"A & B"}</script></body></html>');
  const output=await renderDocument(model,{entry:'/test.js'}),dom=new JSDOM(output,{runScripts:'outside-only'});
  const doc=dom.window.document,prime=doc.querySelector('script[data-sv-studio-prime]');
  assert(prime,'The synchronous appearance prime is present in the initial document');
  assert(prime.compareDocumentPosition(doc.querySelector('main'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(JSON.parse(doc.getElementById('settings').textContent).label,'A & B');
  assert(!model.scripts.some(x=>x.attrs['data-sv-studio-prime']!==undefined));
  dom.window.close();
});
