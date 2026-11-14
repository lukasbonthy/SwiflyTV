'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{browser,tick,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
const markup='<section id="episodes"><select data-episode-view><option value="grid">Grid</option><option value="rows">Row</option></select><select data-episode-sort><option value="oldest">Old</option><option value="newest">New</option></select><details open data-episode-show="5" data-episode-season="1"><summary>Season 1</summary><div class="dsEpisodeChips">Fallback</div></details></section>';
test('episode browser loads actual metadata, sorts real nodes and persists row mode',async()=>{
 const b=browser(markup),w=b.window,prefs={episodeView:'grid',episodeSort:'oldest'};w.SwiflyLibrary={preferences:()=>prefs,savePreferences:p=>Object.assign(prefs,p),renderDecorations(){}};w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,season:1,name:'First',airDate:'2020-01-01',aired:true},{episode:2,season:1,name:'Second',airDate:'2020-01-02',aired:true}]})});w.boot('episode-browser.js');await tick();await tick();assert(w.SwiflyEpisodes);let items=[...w.document.querySelectorAll('[data-library-episode]')];assert.equal(items.length,2);const sort=w.document.querySelector('[data-episode-sort]');sort.value='newest';sort.dispatchEvent(new w.Event('change',{bubbles:true}));items=[...w.document.querySelectorAll('[data-library-episode]')];assert.equal(items[0].dataset.libraryEpisode,'2');const view=w.document.querySelector('[data-episode-view]');view.value='rows';view.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(prefs.episodeView,'rows');assert.equal(w.document.querySelector('.dsEpisodeChips').dataset.episodeView,'rows');w.dispatchEvent(new w.Event('pagehide'));
});
test('future episodes remain labelled as unaired with no playback or download action',async()=>{
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:3,season:1,name:'Future',airDate:'2999-01-01',aired:false}]})});w.boot('episode-browser.js');await tick();await tick();const item=w.document.querySelector('[data-library-episode]');assert(item);assert.equal(item.querySelector('a[href^="/watch/"]'),null);assert.match(item.textContent,/2999-01-01/);assert.equal(item.querySelector('a[href^="/download/"]'),null);w.dispatchEvent(new w.Event('pagehide'));
});

test('an explicitly unaired episode with no published date has no playable or download control',async()=>{
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:4,name:'Coming soon',airDate:'',aired:false}]})});w.boot('episode-browser.js');await tick();await tick();
 const card=w.document.querySelector('[data-library-episode]');assert(card);assert.equal(card.querySelector('a[href^="/watch/"]'),null);assert.equal(card.querySelector('a[href^="/download/"]'),null);assert.match(card.textContent,/Coming soon|announced/);w.dispatchEvent(new w.Event('pagehide'));
});

test('season navigation opens the requested real season and focuses its summary without a new page',async()=>{
 const b=browser('<section id="episodes"><div class="svEpisodeBrowserHead"><h2>Episodes</h2><div class="svEpisodeBrowserControls"></div></div><details data-episode-show="5" data-episode-season="1"><summary><strong>Season one</strong></summary><div class="dsEpisodeChips"></div></details><details data-episode-show="5" data-episode-season="2"><summary><strong>Season two</strong></summary><div class="dsEpisodeChips"></div></details></section>'),w=b.window;
 w.fetch=async()=>({ok:true,json:async()=>({episodes:[]})});w.HTMLElement.prototype.scrollIntoView=function(){};w.boot('episode-browser.js');await tick();
 const jump=w.document.querySelector('[data-episode-jump]');assert(jump,'the season picker should use actual season metadata');assert.equal(jump.options.length,2);jump.value='2';jump.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
 assert.equal(w.document.querySelector('[data-episode-season="2"]').open,true);assert.equal(w.document.activeElement,w.document.querySelector('[data-episode-season="2"] summary'));assert.equal(jump.value,'2');w.dispatchEvent(new w.Event('pagehide'));
});

test('season picker keeps the newly opened season selected when an earlier season remains open',async()=>{
 const b=browser('<section id="episodes"><div class="svEpisodeBrowserControls"></div>'+[1,2].map(season=>'<details '+(season===1?'open ':'')+'data-episode-show="5" data-episode-season="'+season+'"><summary>Season '+season+'</summary><div class="dsEpisodeChips"></div></details>').join('')+'</section>'),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[]})});w.boot('episode-browser.js');await tick();
 const panel=w.document.querySelector('[data-episode-season="2"]');panel.open=true;panel.dispatchEvent(new w.Event('toggle',{bubbles:true}));assert.equal(w.document.querySelector('[data-episode-jump]').value,'2');w.dispatchEvent(new w.Event('pagehide'));
});

test('duplicate upstream episodes render once and still reserve a stable thumbnail when artwork is absent',async()=>{
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,name:'First',aired:true},{episode:1,name:'First repeated',aired:true},{episode:2,name:'Second',aired:true}]})});w.boot('episode-browser.js');await tick();await tick();
 assert.equal(w.document.querySelectorAll('[data-library-episode]').length,2);assert.equal(w.document.querySelectorAll('.svEpisodeBrowserThumbnail').length,2);assert.equal(w.document.querySelectorAll('.svEpisodePlaybackBadge').length,2);w.dispatchEvent(new w.Event('pagehide'));
});

test('an unavailable episode still falls back to its ordinal without losing the playback target',async()=>{
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,name:'A beginning',aired:true,still:'https://image.tmdb.org/t/p/w300/missing.jpg'}]})});w.boot('episode-browser.js');await tick();await tick();
 const image=w.document.querySelector('.svEpisodeBrowserStill');assert(image);image.dispatchEvent(new w.Event('error'));assert.equal(w.document.querySelector('.svEpisodeBrowserStill'),null);assert.equal(w.document.querySelector('.svEpisodeThumbnailFallback').textContent,'01');assert(w.document.querySelector('a[href^="/watch/tv/5"]'));w.dispatchEvent(new w.Event('pagehide'));
});
