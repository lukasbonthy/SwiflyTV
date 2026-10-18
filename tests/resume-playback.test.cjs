'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {browser, cleanup, tick} = require('./ui-helpers.cjs');
const {playerMarkup} = require('../ui/player');
const root = path.resolve(__dirname, '..');
const profiles = [{id:'main', name:'Main'}, {id:'kids', name:'Kids', mode:'kids'}];
const movie = {profileId:'main', key:'movie:42', id:'42', type:'movie', title:'A quiet evening', poster:'/poster.jpg', backdrop:'/scene.jpg', year:'2026', currentTime:83, duration:600};
const episode = {...movie, key:'tv:101', id:'101', type:'tv', title:'The series', season:2, episode:8};
const ranges = rows => ({length:rows.length, start:i=>rows[i][0], end:i=>rows[i][1]});
const flush = async () => {for(let i=0;i<24;i++)await Promise.resolve();};
test.afterEach(cleanup);

function seed(w, rows=[], selected=profiles[0], configured=profiles) {
  w.localStorage.setItem('swiflytv.profiles', JSON.stringify(configured));
  if(selected)w.localStorage.setItem('swiflytv.activeProfile', JSON.stringify(selected));
  w.localStorage.setItem('movieverse.continue', JSON.stringify(rows));
}
function historyPage(rows=[], markup='<div id="continueGrid"></div>', selected=profiles[0], configured=profiles) {
  const env=browser(markup);seed(env.window,rows,selected,configured);env.window.boot('continue.js');return env;
}
async function playback(options={}, {stored=[], url, selected=profiles[0], configured=profiles, beforeBoot=()=>{}}={}) {
  const type=options.type||'movie', id=String(options.id||'42');
  const env=browser(playerMarkup({id,type,title:'A quiet evening',year:'2026',poster:'https://image.tmdb.org/t/p/w342/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/scene.jpg',mode:'movie',...options}), {path:url||`/watch/${type}/${id}?mode=movie`});
  const w=env.window, d=w.document, states=new WeakMap();let now=1800000000000;
  const state=v=>{if(!states.has(v))states.set(v,{paused:true,currentTime:0,duration:NaN,readyState:0,ended:false,seeking:false,volume:1,muted:false,playbackRate:1,buffered:ranges([]),seekable:ranges([]),textTracks:[],audioTracks:[],error:null});return states.get(v);};
  for(const name of ['paused','currentTime','duration','readyState','ended','seeking','volume','muted','playbackRate','buffered','seekable','textTracks','audioTracks','error'])Object.defineProperty(w.HTMLMediaElement.prototype,name,{configurable:true,get(){return state(this)[name];},set(value){state(this)[name]=value;}});
  w.HTMLMediaElement.prototype.load=function(){};
  w.HTMLMediaElement.prototype.canPlayType=()=>'';
  w.HTMLMediaElement.prototype.play=function(){state(this).paused=false;state(this).ended=false;this.dispatchEvent(new w.Event('play'));this.dispatchEvent(new w.Event('playing'));return Promise.resolve();};
  w.HTMLMediaElement.prototype.pause=function(){const changed=!state(this).paused;state(this).paused=true;if(changed)this.dispatchEvent(new w.Event('pause'));};
  w.Date.now=()=>now;
  w.fetch=async()=>({ok:true,json:async()=>({status:'ok',movieId:id,type,season:options.season,episode:options.episode,playbackUrl:'/media.mp4'})});
  seed(w,stored,selected,configured);w.boot('continue.js');beforeBoot(env);
  w.eval(fs.readFileSync(path.join(root,'public/player/player.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await flush();
  return {...env,w,d,state,api:w.SwiflyPlayer,video:()=>d.querySelector('[data-player-video]'),stored:()=>JSON.parse(w.localStorage.getItem('movieverse.continue')||'[]'),advance(ms){now+=ms;},event(name,video=this.video()){video.dispatchEvent(new w.Event(name));},ready(duration=600){const v=this.video();Object.assign(state(v),{duration,readyState:3,seekable:ranges([[0,duration]])});this.event('loadedmetadata',v);this.event('canplay',v);},time(seconds){state(this.video()).currentTime=seconds;this.event('timeupdate');},finish(){w.SwiflyPlayer?.destroy();env.finish();}};
}

test('Continue Watching owns progress per profile and removal leaves the other viewer intact',()=>{
  const env=historyPage([movie,{...movie,profileId:'kids',currentTime:31}]),w=env.window;
  assert.equal(typeof w.SwiflyContinue.saveProgress,'function');
  assert.equal(w.SwiflyContinue.read().length,1);
  assert.equal(w.SwiflyContinue.read()[0].currentTime,83);
  const href=new URL(w.document.querySelector('.svResumeLink').href);
  assert.equal(href.searchParams.get('resume'),'1');
  w.document.querySelector('[data-continue-remove]').click();
  assert.equal(w.SwiflyContinue.read().length,0);
  assert.equal(JSON.parse(w.localStorage.getItem('movieverse.continue'))[0].profileId,'kids');
});

test('Legacy metadata is preserved and progress is adopted only when its profile is unambiguous',()=>{
  const legacy={...episode};delete legacy.profileId;
  const ambiguous=historyPage([legacy]);
  assert.equal(ambiguous.window.SwiflyContinue.read().length,0,'Global history must not become another profile’s progress');
  assert.deepEqual(JSON.parse(ambiguous.window.localStorage.getItem('movieverse.continue')),[legacy]);
  const single=historyPage([legacy,{id:'99',type:'movie',title:'Opened before'}],undefined,profiles[0],[profiles[0]]),w=single.window;
  assert.equal(w.SwiflyContinue.read().length,2,'Click-only history remains available');
  assert.equal(w.SwiflyContinue.find('tv','101').episode,8);
  assert.equal(JSON.parse(w.localStorage.getItem('movieverse.continue'))[0].profileId,'main');
});

test('Selecting a legacy profile keeps the same progress owner before its identity is upgraded',()=>{
  const configured=[{name:'Main'}],legacy={...movie};delete legacy.profileId;
  const env=historyPage([legacy],undefined,null,configured),w=env.window;
  const owner=w.SwiflyContinue.profileId();assert.equal(w.SwiflyContinue.read().length,1);
  w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(configured[0]));
  assert.equal(w.SwiflyContinue.profileId(),owner);assert.equal(w.SwiflyContinue.read().length,1);
});

test('Duplicate legacy profile names retain their distinct selected profile IDs',()=>{
  const configured=[{name:'Viewer'},{name:'Viewer'}],selected={id:'legacy-1',name:'Viewer'};
  const env=historyPage([{...movie,profileId:'legacy-0'},{...movie,profileId:'legacy-1',currentTime:31}],undefined,selected,configured),w=env.window;
  assert.equal(w.SwiflyContinue.profileId(),'legacy-1');
  assert.equal(w.SwiflyContinue.find('movie','42').currentTime,31);
  w.SwiflyContinue.saveProgress({...movie,currentTime:49});
  const stored=JSON.parse(w.localStorage.getItem('movieverse.continue'));
  assert.equal(stored.find(row=>row.profileId==='legacy-0').currentTime,83);
  assert.equal(stored.find(row=>row.profileId==='legacy-1').currentTime,49);
});

test('Default Main and Kids profiles do not claim ambiguous unowned history',()=>{
  for(const selected of profiles){
    const env=browser('<div id="continueGrid"></div>'),w=env.window,legacy={...movie};delete legacy.profileId;
    w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(selected));
    w.localStorage.setItem('movieverse.continue',JSON.stringify([legacy]));
    w.boot('continue.js');
    assert.equal(w.SwiflyContinue.profileId(),selected.id);
    assert.equal(w.SwiflyContinue.read().length,0);
    assert.equal(JSON.parse(w.localStorage.getItem('movieverse.continue'))[0].profileId,undefined);
  }
});

test('Malformed numeric history cannot break valid Resume entries or the player',async()=>{
  const malformed={...movie,id:'43',currentTime:{toString:null},duration:{valueOf:null,toString:null}};
  const env=historyPage([malformed,movie]),w=env.window;
  assert.doesNotThrow(()=>w.SwiflyContinue.read());
  assert.equal(w.SwiflyContinue.find('movie','42').currentTime,83);
  assert.equal(w.SwiflyContinue.find('movie','43'),null);
  assert.equal(w.SwiflyContinue.saveProgress(malformed),false);
  const e=await playback({}, {stored:[malformed,movie],url:'/watch/movie/42?mode=movie&resume=1'});
  e.ready();assert.equal(e.video().currentTime,83);e.finish();
});

test('Completed and invalid positions never offer Resume or produce unsafe episode destinations',()=>{
  const env=historyPage([movie,{...episode,id:'102',key:'tv:102',season:-1,episode:'oops'},{...movie,id:'43',key:'movie:43',currentTime:600},{...movie,id:'44',key:'movie:44',completed:true},{...movie,id:'45',key:'movie:45',currentTime:-12},{...movie,id:'46',key:'movie:46',currentTime:900},{...movie,id:'<script>',key:'movie:bad'}]),w=env.window;
  assert.equal(w.SwiflyContinue.find('tv','102'),null);
  assert.equal(w.SwiflyContinue.find('movie','45'),null);
  const ids=w.SwiflyContinue.read().map(item=>item.id);
  assert(!ids.includes('43'));assert(!ids.includes('44'));assert(!ids.includes('46'));assert(!ids.includes('<script>'));
  for(const a of w.document.querySelectorAll('.svResumeLink'))assert(!/[<]|s=-1|e=oops/.test(a.getAttribute('href')));
});

test('Hero and details expose exact-episode Resume beside fresh Play and refresh on profile changes',()=>{
  const markup='<div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-type="tv" data-play-id="101" href="/watch/tv/101?mode=movie&s=1&e=1">Play</a></div><div class="svDetailActions"><a class="dsPrimaryBtn" data-play-type="movie" data-play-id="42" href="/watch/movie/42?mode=movie">Play</a><a data-play-type="movie" data-play-id="42" href="/watch/movie/42?mode=movie&roomId=room">Join party</a></div>';
  const env=historyPage([movie,episode],markup),w=env.window,d=w.document;
  assert.equal(d.querySelectorAll('[data-resume-action]').length,2);
  const resume=d.querySelector('.dsHeroActions [data-resume-action]'),url=new URL(resume.href);
  assert.match(resume.textContent,/Resume.*S2.*E8/);assert.equal(url.searchParams.get('s'),'2');assert.equal(url.searchParams.get('e'),'8');assert.equal(url.searchParams.get('resume'),'1');
  assert.equal(d.querySelector('.dsHeroActions [data-play-id]').getAttribute('href'),'/watch/tv/101?mode=movie&s=1&e=1');
  w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[1]));d.dispatchEvent(new w.Event('swifly:profile-changed'));w.flush();
  assert.equal(d.querySelectorAll('[data-resume-action]').length,0);
  assert.equal(d.querySelector('.dsHeroActions [data-play-id]').className,'dsPrimaryBtn');
});

test('Resume refresh retains the glass renderer pane mounted inside its button',()=>{
  const env=historyPage([movie],'<div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-id="42" data-play-type="movie" href="/watch/movie/42?mode=movie">Play</a></div>'),w=env.window,d=w.document;
  const resume=d.querySelector('[data-resume-action]'),pane=d.createElement('div');pane.className='svLiquidPane';resume.append(pane);
  w.SwiflyContinue.saveProgress({...movie,currentTime:97});w.flush();
  assert.equal(resume.querySelector('.svLiquidPane'),pane,'Updating the label must preserve the mounted optical pane');assert.match(resume.textContent,/1:37/);
});

test('Removing Resume restores button emphasis without stripping live glass classes',()=>{
  const env=historyPage([movie],'<div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-id="42" data-play-type="movie" href="/watch/movie/42?mode=movie">Play</a></div>'),w=env.window,d=w.document;
  const original=d.querySelector('[data-play-id]');original.classList.add('svGlassSurface','svGlassControl','svNavMatchedOptic');
  w.SwiflyContinue.remove('movie:42');w.flush();
  assert(original.classList.contains('dsPrimaryBtn'));assert(!original.classList.contains('dsSecondaryBtn'));
  for(const name of ['svGlassSurface','svGlassControl','svNavMatchedOptic'])assert(original.classList.contains(name),'Live glass class survives: '+name);
});

test('Malformed artwork metadata cannot break the Continue Watching component',()=>{
  const env=historyPage([{...movie,poster:{bad:true},backdrop:123}]);assert.doesNotThrow(()=>env.window.SwiflyContinue.render());
});

test('Opening a cached details sheet uses the latest progress when adding Resume',async()=>{
  const env=historyPage([episode],'<a id="open" href="/tv/101">Details</a>'),w=env.window,d=w.document;let requests=0;
  w.fetch=async()=>{requests++;return {ok:true,text:async()=>'<article class="svTitleDetails"><h1>The series</h1><div class="svDetailActions"><a class="dsPrimaryBtn" data-play-id="101" data-play-type="tv" href="/watch/tv/101?mode=movie&s=1&e=1">Play S1 E1</a></div></article>'};};
  w.boot('details.js');await w.SwiflyDetails.open('/tv/101',d.getElementById('open'));await tick();
  assert.match(d.querySelector('.svDetailDialog [data-resume-action]')?.textContent||'',/Resume.*S2.*E8/);
  assert.equal(requests,1);
  w.SwiflyContinue.saveProgress({...episode,episode:9,currentTime:113});w.flush();
  await w.SwiflyDetails.open('/tv/101');await tick();
  assert.match(d.querySelector('.svDetailDialog [data-resume-action]')?.textContent||'',/Resume.*E9/);
  assert.equal(requests,1,'A cached fragment must still refresh its Resume control');
});

test('Actual movie progress survives pause and a new player restores it from Continue Watching',async()=>{
  const first=await playback();first.ready();await first.api.play();first.time(96);first.api.pause();
  const saved=first.stored();assert.equal(saved.length,1);assert.equal(saved[0].currentTime,96);assert.equal(saved[0].duration,600);assert.equal(saved[0].profileId,'main');assert.equal(saved[0].title,'A quiet evening');assert.equal(saved[0].year,'2026');
  const rail=first.d.createElement('div');rail.id='continueGrid';first.d.body.append(rail);first.w.SwiflyContinue.render();
  const destination=new URL(rail.querySelector('.svResumeLink').href);first.finish();
  const next=await playback({}, {stored:saved,url:destination.pathname+destination.search});
  assert.equal(next.video().currentTime,0,'Restore waits for real media metadata');next.ready();assert.equal(next.video().currentTime,96);next.finish();
});

test('TV progress reopens the exact saved season and episode at its saved timestamp',async()=>{
  const first=await playback({id:'101',type:'tv',title:'The series',season:2,episode:8});first.ready();await first.api.play();first.time(178);first.api.pause();
  const saved=first.stored();assert.equal(saved[0].season,2);assert.equal(saved[0].episode,8);
  const rail=first.d.createElement('div');rail.id='continueGrid';first.d.body.append(rail);first.w.SwiflyContinue.render();
  const href=new URL(rail.querySelector('.svResumeLink').href);assert.equal(href.searchParams.get('s'),'2');assert.equal(href.searchParams.get('e'),'8');assert.equal(href.searchParams.get('resume'),'1');first.finish();
  const next=await playback({id:'101',type:'tv',title:'The series',season:2,episode:8},{stored:saved,url:href.pathname+href.search});next.ready();assert.equal(next.video().currentTime,178);next.finish();
});

test('An explicit fresh play or a different TV episode cannot inherit another position',async()=>{
  const fresh=await playback({}, {stored:[movie]});fresh.ready();assert.equal(fresh.video().currentTime,0);fresh.finish();
  const other=await playback({id:'101',type:'tv',season:2,episode:9},{stored:[episode],url:'/watch/tv/101?mode=movie&s=2&e=9&resume=1'});other.ready();assert.equal(other.video().currentTime,0);other.finish();
  const wrongProfile=await playback({}, {stored:[movie],selected:profiles[1],url:'/watch/movie/42?mode=movie&resume=1'});wrongProfile.ready();assert.equal(wrongProfile.video().currentTime,0);wrongProfile.finish();
});

test('A saved position waits for finite duration and starts fresh if it exceeds the current movie',async()=>{
  const e=await playback({}, {stored:[movie],url:'/watch/movie/42?mode=movie&resume=1'});
  Object.assign(e.state(e.video()),{duration:Infinity,readyState:3,seekable:ranges([[0,20]])});e.event('loadedmetadata');e.event('canplay');
  assert.equal(e.video().currentTime,0,'An incomplete seekable window must not truncate the saved timestamp');
  e.ready(60);assert.equal(e.video().currentTime,0,'A stale timestamp beyond the actual movie starts at the beginning');assert.equal(e.stored()[0].currentTime,83,'Loading alone must not erase progress');e.finish();
});

test('Progress saves are bounded and pagehide flushes the last position before media reset',async()=>{
  const e=await playback();e.ready();await e.api.play();e.time(12);assert.equal(e.stored()[0]?.currentTime,12);
  e.time(14);e.time(16);assert.equal(e.stored()[0].currentTime,12,'Each media event must not write the full history');
  e.advance(5001);e.time(19);assert.equal(e.stored()[0].currentTime,19);
  e.time(23);e.w.dispatchEvent(new e.w.Event('pagehide'));assert.equal(e.stored()[0].currentTime,23);e.event('timeupdate');assert.equal(e.stored()[0].currentTime,23);e.finish();
});

test('A completed movie leaves Continue Watching without deleting another profile’s position',async()=>{
  const e=await playback({}, {stored:[movie,{...movie,profileId:'kids',currentTime:51}]});e.ready();await e.api.play();e.time(599);Object.assign(e.state(e.video()),{currentTime:600,ended:true});e.event('ended');
  assert.equal(e.w.SwiflyContinue.read().length,0);assert.equal(e.stored().length,1);assert.equal(e.stored()[0].profileId,'kids');e.api.destroy();assert.equal(e.stored()[0].currentTime,51);e.finish();
});

test('Replaying a completed legacy entry creates new resumable progress',()=>{
  const env=historyPage([{...movie,completed:true,ended:true}]),w=env.window;
  assert(w.SwiflyContinue.saveProgress({...movie,currentTime:35}));
  assert.equal(w.SwiflyContinue.find('movie','42')?.currentTime,35);
});

test('Room, remote, and manual playback obey the party clock and preserve solo history',async()=>{
  for(const kind of ['managed','remote','manual','room-url']){
    const e=await playback({managed:kind==='managed'}, {stored:[movie],url:'/watch/movie/42?mode=movie&resume=1'+(kind==='room-url'?'&roomId=room':'')});
    if(kind==='remote')e.api.setRemoteMode({enabled:true,isHost:true});
    if(kind==='manual')e.api.setRemoteMode({enabled:false,manual:true,isHost:true});
    await e.api.loadSource({status:'ok',movieId:'42',type:'movie',playbackUrl:'/party.mp4'},{resumeAt:47});e.ready();assert.equal(e.video().currentTime,47,kind+' must obey the supplied room offset');
    await e.api.play({remote:true});e.time(111);e.api.pause({remote:true});assert.equal(e.stored()[0].currentTime,83,kind+' must not overwrite solo progress');e.finish();
  }
});

test('Joining and leaving a party cannot adopt its shared position as solo progress',async()=>{
  const e=await playback({id:'101',type:'tv',season:2,episode:8});e.ready();await e.api.play();e.time(37);e.time(41);
  e.api.setRemoteMode({enabled:true,isHost:true});assert.equal(e.stored()[0].currentTime,41,'Joining first flushes legitimate solo progress');
  await e.api.loadSource({status:'ok',movieId:'101',type:'tv',season:3,episode:4,playbackUrl:'/shared.mp4'},{resumeAt:91});e.ready();await e.api.play({remote:true});e.time(115);
  e.api.pause({remote:true});e.api.setRemoteMode({enabled:false});await e.api.resolve();e.ready();await e.api.play();e.time(151);e.api.pause();
  assert.equal(e.stored()[0].currentTime,41);assert.equal(e.stored()[0].season,2);assert.equal(e.stored()[0].episode,8);e.finish();
});

test('Repeated room ownership updates retain a pending party resume timestamp',async()=>{
  const e=await playback({managed:true},{stored:[movie],url:'/watch/movie/42?mode=movie&roomId=room&resume=1'});
  await e.api.loadSource({status:'ok',movieId:'42',type:'movie',playbackUrl:'/party.mp4'},{resumeAt:47});
  e.api.setRemoteMode({enabled:true,isHost:true});e.api.setRemoteMode({enabled:true,isHost:true});e.ready();
  assert.equal(e.video().currentTime,47);assert.equal(e.stored()[0].currentTime,83);e.finish();
});

test('A profile switch in another tab cannot assign the old player to the new viewer',async()=>{
  const e=await playback();e.ready();await e.api.play();e.time(37);e.w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify(profiles[1]));e.time(49);e.api.pause();
  assert.equal(e.stored().length,1);assert.equal(e.stored()[0].profileId,'main');assert.equal(e.stored()[0].currentTime,49);assert.equal(e.w.SwiflyContinue.read().length,0);e.finish();
});

test('Unavailable browser storage cannot stop playback or throw on progress events',async()=>{
  const e=await playback({}, {beforeBoot:env=>{env.window.Storage.prototype.setItem=function(){throw new Error('Storage unavailable');};}});e.ready();await e.api.play();assert.doesNotThrow(()=>{e.time(34);e.api.pause();});assert.equal(e.api.getState().ready,true);e.finish();
});
