'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const {feedHome,feedBell,feedDialogs}=require('../ui/feed');
test.afterEach(cleanup);

test('home feed stays out of the catalog until usable personal content exists',async()=>{
 const b=browser('<main data-st-home>'+feedHome()+'<section class="dsRow">Trending movies</section></main>'+feedDialogs()),w=b.window,d=w.document;
 const sections=[...d.querySelectorAll('[data-st-home-section]')];
 assert(sections.every(n=>n.hidden),'empty server-rendered sections reserve no blank rows');
 let state={watchlist:[],watched:[],history:[],preferences:{}},owner='first';
 w.SwiflyLibrary={active:true,ready:Promise.resolve(),read:()=>state,contextId:()=>owner};
 let resolveRequest,calls=0;
 w.fetch=()=>{calls++;return new Promise(resolve=>{resolveRequest=body=>resolve({ok:true,json:async()=>body});});};
 w.boot('feed.js');await tick();
 assert.equal(calls,0);assert(sections.every(n=>n.hidden));
 state={...state,watchlist:[{type:'movie',id:'10',title:'Saved movie'}]};
 const pending=w.SwiflyFeed.refresh({force:true});await tick();
 assert(sections.every(n=>n.hidden),'empty loading status does not push the catalog down');
 resolveRequest({results:[{id:11,type:'movie',title:'A recommendation'}]});await pending;
 assert(d.querySelector('[data-feed-upcoming]').hidden);
 const recommended=d.querySelector('[data-feed-recommended]');assert.equal(recommended.hidden,false);assert.match(recommended.textContent,/A recommendation/);
 owner='second';state={watchlist:[],watched:[],history:[],preferences:{}};
 d.dispatchEvent(new w.Event('swifly:profile-changed'));await tick();
 assert(sections.every(n=>n.hidden),'switching to an empty profile clears visible personal content');
 assert(!recommended.textContent.includes('A recommendation'));
});

test('notification control shares navigation glass and remains keyboard accessible',()=>{
 const b=browser('<nav class="netflixNav"><span class="svLiquidPane"></span>'+feedBell()+'</nav><div class="dsHeroActions"><button>Play</button></div>'),w=b.window,d=w.document;
 w.SwiflyLiquidGlass={mount(){return {enabled:true,supported:true,destroy(){}};}};
 w.boot('liquid-glass/surfaces.js');const bell=d.querySelector('[data-feed-bell]');
 assert.equal(bell.querySelector('.svNavMatchedLens'),null,'a nav icon must not mount another refractive surface inside the navbar');
 bell.focus();assert.equal(d.activeElement,bell);assert.equal(bell.getAttribute('aria-label'),'New episodes');
 assert(d.querySelector('.dsHeroActions .svNavMatchedLens'),'standalone featured actions retain their optics');
 w.SwiflyGlassSurfaces.destroy();
});
for(const placement of ['before','after','lead'])test('a personal row disappearing after keyboard refresh keeps catalog focus: '+placement,async()=>{
 const catalog='<section class="dsRow"><a href="/movie/25">Trending film</a></section>',feeds=feedHome();
 const content=placement==='before'?feeds+catalog:placement==='after'?catalog+feeds:'<div data-st-home-lead>'+feeds+'</div><div data-st-home-rows>'+catalog+'</div>';
 const b=browser('<main>'+content+'</main>'+feedBell()+feedDialogs()),w=b.window,d=w.document;
 const state={watchlist:[{type:'movie',id:'10',title:'Saved movie'}],watched:[],history:[],preferences:{hideEpisodeBell:true}};
 w.SwiflyLibrary={active:true,ready:Promise.resolve(),read:()=>state,contextId:()=> 'first'};
 let results=[{id:11,type:'movie',title:'Recommendation'}];
 w.fetch=async()=>({ok:true,json:async()=>({results})});w.boot('feed.js');await tick();
 const row=d.querySelector('[data-feed-recommended]'),retry=row.querySelector('[data-feed-retry]');
 assert.equal(row.hidden,false);retry.focus();results=[];retry.click();await tick();
 assert(row.hidden);assert.equal(d.activeElement,d.querySelector('.dsRow a'),'focus remains on a visible catalog action');
});
