'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {loadServer}=require('./ui-helpers.cjs');
const styles=require('../lib/shell-styles');

test('shared styles are available on a cold server, cacheable and preserve their cascade',async t=>{
 assert(styles,'prebuilt shell styles are required');
 const app=express();app.use(styles.serveShellStyle);const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 const href=styles.shellStyleLink('core').match(/href="([^"]+)"/)[1];
 const response=await fetch(origin+href),css=await response.text();
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/css/);
 assert.match(response.headers.get('cache-control'),/immutable/);
 const ordered=['liquid-glass/liquid-glass.css','clean/clean.css','clean/library.css','connect/connect.css','clean/feed.css','clean/catalog-updates.css','clean/details.css','clean/motion.css','vendor/lenis/lenis.css','liquid-glass/surfaces.css','studio/studio.css','clean/usability.css','clean/aurora.css'];
 let previous=-1;for(const file of ordered){const index=css.indexOf('/* '+file+' */');assert(index>previous,file+' stays in its original cascade position');previous=index;}
 assert.match(css,/url\(["']?\/assets\/clean\/aurora-ribbon\.svg\?v=170/);
 assert.match(css,/\.svLoadFeedback/);assert.match(css,/\.svArtworkAsset/,'cached styles include the artwork decode fade');
 assert(css.includes('data:image/svg+xml,'),'embedded textures survive rebasing');
 const late=await (await fetch(origin+styles.shellStyleLink('finish').match(/href="([^"]+)"/)[1])).text();
 assert.match(late,/url\("\/assets\/studio\/themes\/halloween-night\.webp"\)/);
 assert.match(late,/url\("\/assets\/clean\/aurora-ribbon\.svg"\)/);
 // An old HTML response can reach a newer instance during a rolling deploy.
 // Serve compatible current styles, but never cache them under the old hash.
 const stale=await fetch(origin+'/assets/shell/core-00000000000000000000.css');
 assert.equal(stale.status,200);assert.equal(stale.headers.get('cache-control'),'no-store');assert.equal(await stale.text(),css);
 assert.equal((await fetch(origin+'/assets/shell/not-a-group-00000000000000000000.css')).status,404);
 assert.equal((await fetch(origin+'/assets/shell/core-unknown.css')).status,404);
});

test('catalog needs at most eight stylesheets and preserves external and route-specific order',()=>{
 const api=loadServer();try{
  for(const active of ['home','welcome','login']){
   const html=api.pageShell({active}),links=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
   assert(links.length<=8,active+' requested '+links.length+' stylesheets');
   const joined=links.join('\n');assert(joined.indexOf('modern-normalize')<joined.indexOf('/assets/shell/core-'));
   assert(joined.indexOf('/assets/shell/core-')<joined.indexOf('/assets/shell/catalog-'));
   assert(joined.indexOf('/assets/shell/catalog-')<joined.indexOf('/assets/shell/finish-'));
   if(active==='welcome')assert(joined.indexOf('/clean/welcome.css')>joined.indexOf('/assets/shell/core-'));
  }
  const html=api.pageShell({active:'watch',player:true});
  assert.match(html,/\/assets\/shell\/player-/);assert.doesNotMatch(html,/\/assets\/shell\/catalog-/);
  assert(html.indexOf('/assets/shell/player-')<html.indexOf('/assets/player/player.css'));
  assert(html.indexOf('/assets/player/player.css')<html.indexOf('/assets/shell/finish-'));
 }finally{api.io.close();api.httpServer.close();}
});
