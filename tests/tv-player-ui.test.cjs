'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {playerMarkup,episodePickerMarkup}=require('../ui/player');
const {loadServer}=require('./ui-helpers.cjs');
const seasons=[{season_number:1,episode_count:9},{season_number:2,episode_count:10}];
const options={id:'101',type:'tv',title:'Severance',season:2,episode:8,episodeCount:10,seasons,provider:'cinezo',episodes:[{episode_number:8,name:'After Hours',runtime:48,still:'https://image.tmdb.org/t/p/w342/still.jpg'},{episode_number:9,name:'The Next Chapter',runtime:51}]};
const parse=html=>new JSDOM(html).window.document;

test('TV player names its playback and status controls for the selected episode',()=>{
  const d=parse(playerMarkup(options));
  assert.equal(d.querySelector('[data-player-stage]').getAttribute('aria-label'),'Episode player');
  assert.equal(d.querySelector('[data-player-seek]').getAttribute('aria-label'),'Seek through episode');
  assert.equal(d.querySelector('[data-player-play]').getAttribute('aria-label'),'Play episode');
  assert.equal(d.querySelector('[data-player-status-title]').textContent,'Getting your episode ready');
});
test('Episode picker exposes titles and selection while every navigation link retains the source choice',()=>{
  assert.equal(typeof episodePickerMarkup,'function');
  const d=parse(episodePickerMarkup(options));
  const selected=d.querySelector('[data-player-episode-link][aria-current="page"]');
  assert(selected);
  assert.match(selected.textContent,/After Hours/);
  assert.match(selected.textContent,/48 min/);
  assert.equal(new URL(selected.href,'https://swifly.test').searchParams.get('e'),'8');
  assert.equal(new URL(d.querySelector('[data-player-episode-next]').href,'https://swifly.test').searchParams.get('e'),'9');
  assert.equal(new URL(d.querySelector('[data-player-episode-previous]').href,'https://swifly.test').searchParams.get('e'),'7');
  for(const a of d.querySelectorAll('a')){
    const u=new URL(a.href,'https://swifly.test');
    assert.equal(u.searchParams.get('provider'),'cinezo');
    assert.equal(u.pathname,'/watch/tv/101');
    assert.equal(u.searchParams.get('mode'),'movie');
  }
});
test('Episode navigation stops at season boundaries and escapes episode metadata',()=>{
  assert.equal(typeof episodePickerMarkup,'function');
  const d=parse(episodePickerMarkup({...options,episode:1,episodes:[{episode_number:1,name:'<img src=x onerror=bad>',still:'javascript:alert(1)'}]}));
  assert(d.querySelector('[data-player-episode-previous][disabled]'));
  assert.equal(d.querySelector('[onerror],[src^="javascript:"]'),null);
  assert.match(d.querySelector('[aria-current="page"]').textContent,/<img src=x onerror=bad>/);
  const last=parse(episodePickerMarkup({...options,episode:10}));
  assert(last.querySelector('[data-player-episode-next][disabled]'));
});
test('A long season keeps the requested episode selectable without an unbounded episode grid',()=>{
  assert.equal(typeof episodePickerMarkup,'function');
  for(const [episode,episodeCount] of [[400,900],[10000,11000]]){
    const d=parse(episodePickerMarkup({...options,episode,episodeCount}));
    assert(d.querySelectorAll('[data-player-episode-link]').length<=200);
    const selected=d.querySelector('[data-player-episode-link][aria-current="page"]');
    assert(selected,`Accepted episode ${episode} should remain selected`);
    assert.equal(new URL(selected.href,'https://swifly.test').searchParams.get('e'),String(episode));
    assert(d.querySelector('[data-player-episode-next][href]'));
  }
});
test('Opening an episode reveals its card inside the picker without scrolling away from the player',()=>{
  const dom=new JSDOM(playerMarkup({...options,episodePickerHtml:episodePickerMarkup(options)}),{url:'https://swifly.test/watch/tv/101?s=2&e=8',runScripts:'outside-only'});
  const w=dom.window,d=w.document,grid=d.querySelector('.svPlayerEpisodeGrid'),selected=d.querySelector('[data-player-episode-link][aria-current="page"]');
  // jsdom has no layout: supply the selected card's actual offscreen geometry.
  grid.getBoundingClientRect=()=>({top:0,bottom:390,height:390});
  selected.getBoundingClientRect=()=>({top:700-grid.scrollTop,bottom:784-grid.scrollTop,height:84});
  w.fetch=()=>new Promise(()=>{});w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){};
  try{
    w.eval(fs.readFileSync(path.join(__dirname,'../public/player/player.js'),'utf8'));
    d.dispatchEvent(new w.Event('DOMContentLoaded'));
    const visible=selected.getBoundingClientRect();
    assert(visible.top>=0&&visible.bottom<=390,'Selected episode should be visible inside its scroller');
    assert.equal(w.scrollY,0,'Revealing an episode must keep the video at its current page position');
  }finally{w.SwiflyPlayer?.destroy();dom.window.close();}
});

const api=loadServer();let base,seasonUnavailable=false;
test.before(async()=>{
  api.setTmdb(async endpoint=>{
    if(endpoint==='/tv/101')return {id:101,name:'Severance',first_air_date:'2022-02-18',seasons};
    if(endpoint==='/tv/101/season/2'){
      if(seasonUnavailable)throw new Error('Metadata unavailable');
      return {episodes:options.episodes.map(row=>({...row,still_path:'/still.jpg'}))};
    }
    return {results:[]};
  });
  await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+api.httpServer.address().port;
});
test.after(async()=>{await new Promise(resolve=>api.io.close(resolve));});
test('TV watch route loads selected-season metadata and preserves source choice between episodes',async()=>{
  const response=await fetch(base+'/watch/tv/101?s=2&e=8&provider=cinezo');
  const d=parse(await response.text());
  assert.equal(response.status,200);
  assert.match(d.querySelector('[data-player-episode-link][aria-current="page"]')?.textContent||'',/After Hours/);
  const next=new URL(d.querySelector('[data-player-episode-next]')?.href||'/',base);
  assert.equal(next.searchParams.get('s'),'2');assert.equal(next.searchParams.get('e'),'9');assert.equal(next.searchParams.get('provider'),'cinezo');
  assert.equal(d.querySelector('.svPlayerPage').dataset.playerEpisode,'8');
});
test('Unavailable season metadata leaves the selected episode and basic navigation usable',async()=>{
  seasonUnavailable=true;
  try{
    const response=await fetch(base+'/watch/tv/101?s=2&e=8');const d=parse(await response.text());
    assert.equal(response.status,200);
    assert.equal(d.querySelector('.svPlayerPage').dataset.playerEpisode,'8');
    assert.match(d.querySelector('[data-player-episode-link][aria-current="page"]')?.textContent||'',/Episode 8/);
    assert(d.querySelector('[data-player-episode-next][href="/watch/tv/101?mode=movie&s=2&e=9"]'));
  }finally{seasonUnavailable=false;}
});
