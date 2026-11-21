'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{browser,tick,cleanup}=require('./ui-helpers.cjs');
const {renderEpisodeSeason}=require('../ui/episode-season');
test.afterEach(cleanup);
test('episodes default to a readable list and show real saved progress without changing episode identity',async()=>{
 const b=browser('<section id="episodes"><div class="svEpisodeBrowserControls"></div><details open data-episode-show="5" data-episode-season="1"><summary>Season 1</summary><div class="dsEpisodeChips"></div></details></section>'),w=b.window;
 w.SwiflyLibrary={read:()=>({watched:[{key:'tv:5:1:1',id:'5',type:'tv',season:1,episode:1}],history:[{key:'tv:5:1:2',id:'5',type:'tv',season:1,episode:2,currentTime:600,duration:1200}]}),isWatched:item=>Number(item.episode)===1,renderDecorations(){}};
 w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,name:'First',airDate:'2020-01-01',aired:true},{episode:2,name:'Second',airDate:'2020-01-02',aired:true}]})});w.boot('episode-browser.js');await tick();await tick();
 const list=w.document.querySelector('.dsEpisodeChips'),cards=[...list.children];assert.equal(list.dataset.episodeView,'rows');assert.equal(cards[0].querySelector('[data-episode-watched]').getAttribute('aria-pressed'),'true');assert.equal(cards[1].querySelector('[data-episode-progress]').getAttribute('aria-valuenow'),'50');assert.match(cards[1].querySelector('a').href,/s=1&e=2/);assert.match(w.document.querySelector('[data-season-progress]').textContent,/1 of 2 watched/);w.dispatchEvent(new w.Event('pagehide'));
});
test('season switching keeps only the selected season expanded and requests its actual metadata once',async()=>{
 const b=browser('<section id="episodes"><div class="svEpisodeBrowserControls"></div>'+[1,2].map(n=>'<details '+(n===1?'open':'')+' data-episode-show="5" data-episode-season="'+n+'"><summary>Season '+n+'</summary><div class="dsEpisodeChips"></div></details>').join('')+'</section>'),w=b.window,calls=[];
 w.fetch=async url=>{calls.push(url);return{ok:true,json:async()=>({episodes:[]})};};
 w.boot('episode-browser.js');await tick();
 const select=w.document.querySelector('[data-episode-jump]');
 select.value='2';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(calls.filter(url=>url.endsWith('/2')).length,1);
 await tick();await tick();
 assert.equal(w.document.querySelector('[data-episode-season="1"]').open,false);
 assert.equal(calls.filter(url=>url.endsWith('/2')).length,1);
 w.dispatchEvent(new w.Event('pagehide'));
});
test('long seasons render a bounded page and newest ordering applies before paging',async()=>{
 const b=browser('<section id="episodes"><select data-episode-sort><option value="oldest">Oldest</option><option value="newest">Newest</option></select><details open data-episode-show="5" data-episode-season="1"><summary tabindex="0">Season 1</summary><div class="dsEpisodeChips"></div></details></section>'),w=b.window,preferences={episodeView:'rows',episodeSort:'oldest'};
 w.SwiflyLibrary={preferences:()=>preferences,savePreferences:patch=>Object.assign(preferences,patch)};w.fetch=async()=>({ok:true,json:async()=>({episodes:Array.from({length:100},(_,i)=>({episode:i+1,name:'Episode '+(i+1),airDate:'2020-01-01',aired:true}))})});w.boot('episode-browser.js');await tick();await tick();
 assert.equal(w.document.querySelectorAll('[data-library-episode]').length,24);w.document.querySelector('[data-episode-page="1"]').click();assert.equal(w.document.querySelector('[data-library-episode]').dataset.libraryEpisode,'25');const sort=w.document.querySelector('[data-episode-sort]');sort.value='newest';sort.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.document.querySelector('[data-library-episode]').dataset.libraryEpisode,'100');assert.equal(w.document.querySelectorAll('[data-library-episode]').length,24);w.dispatchEvent(new w.Event('pagehide'));
});
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
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,name:'First',airDate:'2020-01-01',aired:true},{episode:1,name:'First repeated',airDate:'2020-01-01',aired:true},{episode:2,name:'Second',airDate:'2020-01-02',aired:true}]})});w.boot('episode-browser.js');await tick();await tick();
 assert.equal(w.document.querySelectorAll('[data-library-episode]').length,2);assert.equal(w.document.querySelectorAll('.svEpisodeBrowserThumbnail').length,2);assert.equal(w.document.querySelectorAll('.svEpisodePlaybackBadge').length,2);w.dispatchEvent(new w.Event('pagehide'));
});

test('an unavailable episode still falls back to its ordinal without losing the playback target',async()=>{
 const b=browser(markup),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:1,name:'A beginning',airDate:'2020-01-01',aired:true,still:'https://image.tmdb.org/t/p/w300/missing.jpg'}]})});w.boot('episode-browser.js');await tick();await tick();
 const image=w.document.querySelector('.svEpisodeBrowserStill');assert(image);image.dispatchEvent(new w.Event('error'));assert.equal(w.document.querySelector('.svEpisodeBrowserStill'),null);assert.equal(w.document.querySelector('.svEpisodeThumbnailFallback').textContent,'01');assert(w.document.querySelector('a[href^="/watch/tv/5"]'));w.dispatchEvent(new w.Event('pagehide'));
});

test('a library change indexes one normalized snapshot for a thousand episodes and honors whole-title watched status',async()=>{
 const {window:w}=browser(markup),active={value:true};let reads=0,lookups=0;
 const watched=[{key:'tv:5:1:1',titleKey:'tv:5',type:'tv',id:'5',season:1,episode:1},{key:'tv:6',titleKey:'tv:6',type:'tv',id:'6'}];
 const history=[{key:'tv:5:1:2',titleKey:'tv:5',type:'tv',id:'5',season:1,episode:2,currentTime:40,duration:100},{key:'tv:5:2:2',titleKey:'tv:5',type:'tv',id:'5',season:2,episode:2,currentTime:99,duration:100}];
 const state={watched,history,preferences:{episodeView:'rows',episodeSort:'oldest'}};
 w.SwiflyLibrary={
  read(){reads++;return active.value?state:{watched:[],history:[],preferences:{}};},
  isWatched(item){lookups++;return this.read().watched.some(row=>row.key==='tv:'+item.id||row.key==='tv:'+item.id+':'+item.season+':'+item.episode);},
  get active(){return active.value;},
 };
 w.fetch=async()=>({ok:true,json:async()=>({episodes:Array.from({length:1000},(_,i)=>({episode:i+1,airDate:'2020-01-01',aired:true}))})});
 w.boot('episode-browser.js');await tick();await tick();
 const refresh=()=>{reads=0;lookups=0;w.dispatchEvent(new w.Event('swifly:library-change'));assert.equal(reads,1);assert.equal(lookups,0);};
 const meter=episode=>w.document.querySelector('[data-library-episode="'+episode+'"] [data-episode-progress]')?.getAttribute('aria-valuenow');
 const summary=w.document.querySelector('[data-season-progress]');
 refresh();assert.equal(summary.textContent,'1 of 1000 watched');assert.equal(meter(1),'100');assert.equal(meter(2),'40');
 watched.push({key:'tv:5',titleKey:'tv:5',type:'tv',id:'5'});
 refresh();assert.equal(summary.textContent,'1000 of 1000 watched');assert.equal(meter(2),'100');
 active.value=false;
 refresh();assert.equal(summary.textContent,'0 of 1000 watched');assert.equal(meter(2),undefined);assert(w.document.querySelector('[data-episode-watched]').hidden);
 w.dispatchEvent(new w.Event('pagehide'));
});

test('spoiler mode removes an episode title from its playback name, including after preferences change',async()=>{
 const {window:w}=browser(markup);
 w.localStorage.setItem('swiflytv.library.main',JSON.stringify({version:1,preferences:{spoilerMode:true}}));
 w.boot('library-state.js');
 w.fetch=async()=>({ok:true,json:async()=>({episodes:[{episode:7,name:'The revealed ending',overview:'It was the neighbor.',still:'https://image.tmdb.org/t/p/w300/still.jpg',airDate:'2020-01-01',aired:true}]})});
 w.boot('episode-browser.js');await tick();await tick();
 const tile=w.document.querySelector('.svDetailEpisodeTile');
 assert.equal(tile.getAttribute('aria-label'),'Play season 1, episode 7');
 const spoilers=[...tile.querySelectorAll('[data-library-spoiler]')];
 assert.deepEqual(spoilers.map(node=>node.tagName),['IMG','STRONG','SPAN']);
 assert(spoilers.every(node=>node.getAttribute('aria-hidden')==='true'));
 w.SwiflyLibrary.savePreferences({spoilerMode:false});
 assert.equal(tile.getAttribute('aria-label'),'Play season 1, episode 7: The revealed ending');
 assert(spoilers.every(node=>!node.hasAttribute('aria-hidden')));
 w.SwiflyLibrary.savePreferences({spoilerMode:true});
 assert.equal(tile.getAttribute('aria-label'),'Play season 1, episode 7');
 w.dispatchEvent(new w.Event('pagehide'));
});

test('the adult browser hydrates the requested server page and then navigates through verified metadata in place',async()=>{
 const episodes=Array.from({length:26},(_,index)=>({episode:(index+1)*2,airDate:'2020-01-01',aired:true}));
 const panelMarkup=renderEpisodeSeason({id:'5',season:{season_number:1},total:99,selected:true,episodeData:{episodes:episodes.map(row=>({episode_number:row.episode,air_date:row.airDate}))},page:2});
 const {window:w}=browser('<section id="episodes">'+panelMarkup+'</section>');
 const current=()=>[...w.document.querySelectorAll('[data-library-episode]')].map(card=>Number(card.dataset.libraryEpisode));
 assert.deepEqual(current(),[50,52]);
 w.fetch=async()=>({ok:true,json:async()=>({episodes})});
 w.boot('episode-browser.js');await tick();await tick();
 assert.deepEqual(current(),[50,52]);
 w.document.querySelector('[data-episode-page="0"]').click();
 assert.deepEqual(current(),episodes.slice(0,24).map(row=>row.episode));
 w.dispatchEvent(new w.Event('pagehide'));
});

test('a partial API list preserves later verified pages on the server',async()=>{
 const rows=Array.from({length:26},(_,index)=>({episode_number:(index+1)*2,air_date:'2020-01-01'}));
 const panelMarkup=renderEpisodeSeason({id:'5',season:{season_number:1},total:30,selected:true,episodeData:{episodes:rows}});
 const {window:w}=browser('<section id="episodes">'+panelMarkup+'</section>');
 w.fetch=async()=>({ok:true,json:async()=>({episodes:rows.slice(0,24).map(row=>({episode:row.episode_number,airDate:row.air_date}))})});
 w.boot('episode-browser.js');await tick();await tick();
 assert.equal(w.document.querySelector('a[rel="next"]').getAttribute('href'),'/tv/5?season=1&episodePage=2#episodes');
 assert.equal(w.document.querySelectorAll('[data-library-episode]').length,24);
 w.dispatchEvent(new w.Event('pagehide'));
});

test('unusable API metadata leaves the failed season retryable',async()=>{
 const {window:w}=browser(markup);let requests=0;
 w.fetch=async()=>({ok:true,json:async()=>({episodes:++requests===1?[null,{episode:0}]:[{episode:5,airDate:'2020-01-01',aired:true}]})});
 w.boot('episode-browser.js');await tick();await tick();
 const panel=w.document.querySelector('[data-episode-season]');
 assert.equal(panel.dataset.episodeLoaded,undefined);
 assert.equal(panel.querySelector('.svDetailEpisodeTile'),null);
 assert.match(panel.querySelector('[data-episode-status]').textContent,/details are unavailable/i);
 panel.querySelector('[data-episode-retry]').click();await tick();await tick();
 assert.equal(panel.dataset.episodeLoaded,'true');
 assert(panel.querySelector('[data-library-episode="5"] a[href^="/watch/"]'));
 assert.equal(panel.querySelector('[data-episode-status]'),null);
 w.dispatchEvent(new w.Event('pagehide'));
});

test('a missing or invalid API date cannot produce playback, download or watched actions',async()=>{
 const {window:w}=browser(markup);
 w.fetch=async()=>({ok:true,json:async()=>({episodes:[
  {episode:1,airDate:'',aired:true},
  {episode:2,airDate:'2024-02-30',aired:true},
  {episode:3,airDate:'2020-01-01',aired:true},
 ]})});
 w.boot('episode-browser.js');await tick();await tick();
 for(const episode of [1,2]){
  const card=w.document.querySelector('[data-library-episode="'+episode+'"]');
  assert.equal(card.dataset.episodeAvailable,'false');
  assert.equal(card.querySelector('a,button'),null);
  assert.match(card.textContent,/Release date to be announced/);
 }
 assert(w.document.querySelector('[data-library-episode="3"] a[href^="/watch/"]'));
 w.dispatchEvent(new w.Event('pagehide'));
});

test('Kids season panels never request the general library endpoint',async()=>{
 const {window:w}=browser('<details open data-episode-kids data-episode-show="5" data-episode-season="1"><summary>Season 1</summary><div class="dsEpisodeChips"></div><a href="/kids/title/tv/5?season=1#episodes">Retry</a></details>');
 const requests=[];
 w.fetch=async url=>{requests.push(url);return{ok:true,json:async()=>({episodes:[]})};};
 w.boot('episode-browser.js');await tick();await tick();
 assert.deepEqual(requests,[]);
 assert(w.document.querySelector('a[href^="/kids/"]'));
 w.dispatchEvent(new w.Event('pagehide'));
});
