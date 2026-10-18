'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const {partyMarkup}=require('../ui/party');
test.afterEach(cleanup);
const shows=Array.from({length:8},(_,index)=>({id:101+index,type:'tv',title:index?'Show '+(index+1):'The Office',year:'2005',poster:'https://image.tmdb.org/t/p/w342/show.jpg'}));
const movie={id:101,type:'movie',title:'Arrival',year:'2016',backdrop:'https://image.tmdb.org/t/p/w1280/movie.jpg'};
function setup(options={}){
 const env=browser(partyMarkup({initialTab:'rooms',openRoomCreation:true}),{path:'/social?tab=watchrooms'}),w=env.window,handlers={},sent=[],calls=[];
 const room={id:'show-discovery-room',name:'Series night',mediaKind:'blank',syncedMovie:{status:'idle',movieId:''}};
 const socket={connected:true,on(name,fn){handlers[name]=fn;return this;},emit(name,data){sent.push({name,data});},disconnect(){this.connected=false;},connect(){this.connected=true;}};w.io=()=>socket;
 w.fetch=async(url,init={})=>{const u=new URL(String(url),w.location.href);calls.push(u.pathname+u.search);let data;
  if(u.pathname.endsWith('/permissions'))data={permissions:{canCreateWatchRooms:true}};
  else if(u.pathname.endsWith('/movies/featured'))data={movies:[movie]};
  else if(u.pathname.endsWith('/media/featured')){assert.equal(u.searchParams.get('type'),'tv');return options.featured?options.featured():response({results:shows});}
  else if(u.pathname.endsWith('/media/tv/101'))data={media:{...shows[0],season:u.searchParams.get('season')||'1',episode:u.searchParams.get('episode')||'1',seasons:[{season_number:1},{season_number:2}],episodes:[{episode_number:1,name:'First'},{episode_number:2,name:'Second'},{episode_number:3,name:'Third'}]}};
  else if(u.pathname.endsWith('/create')){assert.equal(init.method,'POST');data={room};}
  else data={rooms:[]};return response(data);
 };
 if(options.lobby)w.boot('party/lobby.js');w.boot('party/party.js');return {...env,w,handlers,sent,calls,room};
}
const response=data=>({ok:true,json:async()=>({ok:true,...data})});
const ready=async()=>{await tick();await tick();};
const submit=(w,form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));

test('Party Hub visibly suggests six TV shows alongside its unchanged movie inspiration',async()=>{
 const env=setup();await ready();const d=env.w.document,section=d.querySelector('section[aria-labelledby="partyShowTitle"]');
 assert(section,'A dedicated TV show section must be visible in the lobby');assert.equal(section.hidden,false);assert.match(d.getElementById('partyShowTitle').textContent,/shows|series/i);
 const link=section.querySelector('a');assert.equal(link.getAttribute('href'),'/tv');assert.match(link.textContent,/Browse TV shows/);
 const cards=[...section.querySelectorAll('[data-party-featured-show-id]')];assert.equal(cards.length,6);assert(cards.every(card=>card.dataset.partyType==='tv'&&card.getAttribute('aria-label').startsWith('Choose ')));
 assert.equal(d.getElementById('partyHeroTitle').textContent,'Arrival');assert.equal(d.querySelectorAll('#partyFeaturedMovies [data-party-featured-id]').length,1);assert(!env.calls.some(url=>url.endsWith('/create')));
});

test('Same-ID show and movie cards retain typed selection and hosting uses the chosen episode',async()=>{
 const env=setup();await ready();const d=env.w.document,film=d.querySelector('#partyFeaturedMovies [data-party-featured-id="101"]'),show=d.querySelector('[data-party-featured-show-id="101"]');
 assert(show,'TV suggestions must be selectable');film.click();assert.equal(film.getAttribute('aria-pressed'),'true');assert.equal(show.getAttribute('aria-pressed'),'false');
 show.click();await ready();assert.equal(show.getAttribute('aria-pressed'),'true');assert.equal(film.getAttribute('aria-pressed'),'false');assert.match(d.getElementById('partySelectedMovie').textContent,/The Office/);assert.equal(d.querySelector('#partySelectedMovie a').getAttribute('href'),'/tv/101');
 const season=d.querySelector('[data-party-lobby-season]');assert(season);season.value='2';season.dispatchEvent(new env.w.Event('change',{bubbles:true}));await ready();
 const episode=d.querySelector('[data-party-lobby-episode]');episode.value='3';episode.dispatchEvent(new env.w.Event('change',{bubbles:true}));submit(env.w,d.getElementById('sv100CreateRoomForm'));await ready();
 assert(!env.sent.some(event=>event.name==='watchroom:movie-select'));env.handlers['watchroom:joined']({room:env.room,isHost:true,messages:[]});
 const selected=env.sent.find(event=>event.name==='watchroom:movie-select');assert(selected);assert.deepEqual(JSON.parse(JSON.stringify(selected.data)),{roomId:env.room.id,movieId:'101',type:'tv',season:'2',episode:'3',name:'Guest'});
});

test('TV suggestions announce loading, offer retry after failure and recover into cards',async()=>{
 let release,attempt=0;const env=setup({featured:()=>{attempt++;return attempt===1?new Promise(resolve=>release=resolve):response({results:shows});}}),d=env.w.document,rail=d.getElementById('partyFeaturedShows');
 assert(rail,'TV suggestions need a loading region');assert.equal(rail.getAttribute('aria-busy'),'true');assert.match(rail.textContent,/finding|loading/i);
 release({ok:false,json:async()=>({ok:false})});await ready();assert.equal(rail.getAttribute('aria-busy'),'false');assert.match(rail.textContent,/unavailable/i);assert.equal(d.getElementById('partyHeroTitle').textContent,'Arrival');
 rail.querySelector('[data-action="retry-featured-shows"]').click();assert.equal(rail.getAttribute('aria-busy'),'true');await ready();assert.equal(rail.getAttribute('aria-busy'),'false');assert.equal(rail.querySelectorAll('[data-party-featured-show-id]').length,6);
});

test('An empty TV selection offers search, catalog browsing and another attempt',async()=>{
 const env=setup({featured:()=>response({results:[]})});await ready();const d=env.w.document,rail=d.getElementById('partyFeaturedShows');
 assert(rail);assert.match(rail.textContent,/search/i);assert.match(rail.textContent,/no|unavailable|nothing/i);assert(rail.querySelector('[data-action="retry-featured-shows"]'));assert.equal(d.querySelector('[aria-labelledby="partyShowTitle"] a').getAttribute('href'),'/tv');assert.equal(d.querySelector('#sv100CreateRoomForm button[type="submit"]').disabled,false);
});

test('Choosing a suggested show from Join reveals the existing host form and episode picker',async()=>{
 const env=setup({lobby:true});await ready();const d=env.w.document;d.querySelector('[data-party-entry="join"]').click();assert.equal(d.querySelector('[data-party-entry-panel="create"]').hidden,true);
 d.querySelector('[data-party-featured-show-id="101"]').click();await ready();assert.equal(d.querySelector('[data-party-entry-panel="create"]').hidden,false);assert.equal(d.querySelector('[data-party-entry-panel="join"]').hidden,true);assert.equal(d.activeElement,d.getElementById('partyRoomName'));assert(d.querySelector('[data-party-lobby-season]'));assert(!env.calls.some(url=>url.endsWith('/create')));
});
