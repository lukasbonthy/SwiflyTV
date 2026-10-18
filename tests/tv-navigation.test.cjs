'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,tick}=require('./ui-helpers.cjs');
const api=loadServer(),shell=api.pageShell({active:'home',body:'<main>Catalog</main>'});
const source=browser(shell).window.document;
const code=[...source.querySelectorAll('script:not([src])')].find(node=>node.textContent.includes('var FOCUSABLE_SELECTOR')).textContent;
test.afterEach(cleanup);test.after(()=>api.io.close());
function setup(markup,rects={},options={}){
 const env=browser(markup,options),w=env.window,d=w.document,scrolled=[];let pads=[];
 w.navigator.getGamepads=()=>pads;
 for(const [id,box]of Object.entries(rects))d.getElementById(id).getBoundingClientRect=()=>{const [left,top,width=120,height=48]=box;return {left,top,width,height,right:left+width,bottom:top+height};};
 w.HTMLElement.prototype.scrollIntoView=function(value){scrolled.push({id:this.id,...value});};
 if(options.enabled!==false)w.localStorage.setItem('swiflytv.tvFocusMode','true');
 if(options.savedMode!==undefined)w.localStorage.setItem('swiflytv.tvFocusMode',String(options.savedMode));
 if(options.legacyMode)w.localStorage.setItem('swiflytv.tvControllerMode','true');
 if(options.focusHistory)w.sessionStorage.setItem('swiflytv.tvFocusHistory',options.focusHistory);
 w.eval(code);d.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {...env,w,d,scrolled,key(key,target=d.activeElement,extra={}){const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;},pads(value){pads=value;}};
}
test('The profile menu provides a visible TV mode switch and every page loads its TV styles',()=>{
 const env=browser(shell),d=env.window.document;
 assert(d.querySelector('.dsProfileDropdown [data-sv-tv-toggle]'),'TV mode must be discoverable without F8');
 assert(d.querySelector('script[data-sv-tv-gate]'),'Saved TV layout must apply before the first paint');
 assert(d.querySelector('link[href="/assets/clean/tv.css?v=1"]'));
});
test('TV mode leaves ordinary desktop arrow and Enter keys native until explicitly enabled',()=>{
 const env=setup('<button id="first">Play</button>',{first:[40,80]},{enabled:false});
 for(const key of ['ArrowDown','Enter','Escape'])assert.equal(env.key(key,env.d.body).defaultPrevented,false,key);
 assert.equal(env.w.localStorage.getItem('swiflytv.tvFocusMode'),null);
 env.key('F8',env.d.body);assert.equal(env.d.documentElement.dataset.svTv,'true');assert.equal(env.w.localStorage.getItem('swiflytv.tvFocusMode'),'true');
 env.key('F8');assert.equal(env.d.documentElement.dataset.svTv,undefined);assert.equal(env.w.localStorage.getItem('swiflytv.tvFocusMode'),'false');
});
test('TV focus can leave the navigation bar and reach the content below',()=>{
 const env=setup('<nav class="netflixNav"><a id="home" href="/">Home</a><a id="movies" href="/movies">Movies</a></nav><main><a id="card" href="/movie/1">Film</a></main>',{home:[50,40],movies:[200,40],card:[50,220]});
 env.d.getElementById('home').focus();env.key('ArrowRight');assert.equal(env.d.activeElement.id,'movies');env.key('ArrowDown');assert.equal(env.d.activeElement.id,'card');
});
test('A TV details page starts on its primary Play action',()=>{
 const env=setup('<nav><a id="brand" href="/">SwiflyTV</a></nav><main><div class="svDetailActions"><a class="dsPrimaryBtn" id="play" href="/watch/movie/1">Play</a></div></main>',{brand:[50,40],play:[50,350]});assert.equal(env.d.activeElement.id,'play');
});
test('An explicit TV-mode off preference wins over a legacy controller preference',()=>{
 const env=setup('<button id="first">Play</button>',{first:[50,50]},{enabled:false,savedMode:false,legacyMode:true});assert.equal(env.d.documentElement.dataset.svTv,undefined);assert.equal(env.w.localStorage.getItem('swiflytv.tvFocusMode'),'false');
});
test('A restored browser page adopts the latest saved TV-mode setting',()=>{
 const env=setup('<button id="first">Play</button>',{first:[50,50]});env.w.localStorage.setItem('swiflytv.tvFocusMode','false');env.w.dispatchEvent(new env.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(env.d.documentElement.dataset.svTv,undefined);
 env.w.localStorage.setItem('swiflytv.tvFocusMode','true');env.w.dispatchEvent(new env.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(env.d.documentElement.dataset.svTv,'true');
});
test('Horizontal TV navigation reaches the next offscreen card without entering tiny quick actions',()=>{
 const env=setup('<div class="movieRail dsRail"><article class="movieCard"><a class="dsThumb" id="first" href="/movie/1">One</a><div class="dsCardQuickActions"><button id="tiny">Like</button></div></article><article class="movieCard" id="secondCard"><a class="dsThumb" id="next" href="/movie/2">Two</a><div>Film title · 2026</div></article></div>',{first:[850,200,150,220],tiny:[980,380,30,30],next:[1060,200,150,220]});
 env.d.getElementById('first').focus();env.key('ArrowRight');assert.equal(env.d.activeElement.id,'next');assert(env.scrolled.some(row=>row.id==='secondCard'),'The whole card, including its date, must scroll into view');
 env.key('ArrowLeft');assert.equal(env.d.activeElement.id,'first');
});
test('Directional focus skips inert, aria-disabled and closed disclosure content',()=>{
 const env=setup('<button id="first">Start</button><div inert><button id="inert">Hidden</button></div><button id="disabled" aria-disabled="true">Guest only</button><details><summary id="summary">Options</summary><button id="closed">Closed</button></details><button id="last">End</button>',{first:[50,50],inert:[50,110],disabled:[50,150],summary:[400,170],closed:[50,190],last:[50,240]});
 env.d.getElementById('first').focus();env.key('ArrowDown');assert.equal(env.d.activeElement.id,'last');
});
test('Remote Back closes the profile menu before navigating away',()=>{
 const env=setup('<details open class="dsProfileMenu"><summary id="profile">Profile</summary><button id="inside">Account</button></details>',{profile:[50,40],inside:[50,110]});
 env.d.getElementById('inside').focus();let back=0;env.w.history.back=()=>back++;
 const event=env.key('BrowserBack');assert.equal(event.defaultPrevented,true);assert.equal(env.d.querySelector('details').open,false);assert.equal(env.d.activeElement.id,'profile');assert.equal(back,0);
});
test('TV remote media keys route through the player controls',()=>{
 const env=setup('<main class="svPlayerPage" data-player-root><div data-player-stage tabindex="0" id="stage"><video id="video"></video><button id="play" data-player-play>Play</button><button id="forward" data-player-forward>Forward</button></div></main>',{stage:[50,100,800,450],video:[50,100,800,450],play:[200,450],forward:[350,450]});
 let played=0,forward=0;env.d.getElementById('play').onclick=()=>played++;env.d.getElementById('forward').onclick=()=>forward++;
 env.d.getElementById('stage').focus();env.key('MediaPlayPause');env.key('MediaFastForward');assert.equal(played,1);assert.equal(forward,1);
});
test('TV Select never bypasses a managed player’s disabled transport through the raw video',()=>{
 const env=setup('<main class="svPlayerPage" data-player-root><div data-player-stage tabindex="0" id="stage"><video tabindex="0" id="video"></video><button disabled data-player-play>Host controls</button></div></main>',{stage:[50,100,800,450],video:[50,100,800,450]});
 let played=0;env.d.getElementById('video').play=()=>{played++;return Promise.resolve();};env.d.getElementById('video').focus();env.key('Enter');env.key('MediaPlayPause');assert.equal(played,0);
});
test('Fullscreen targets the movie stage and remote Back exits fullscreen first',async()=>{
 const env=setup('<main><div data-player-root><div data-player-stage tabindex="0" id="stage">Video</div></div></main>',{stage:[50,100,800,450]});let target='',exits=0;
 env.d.getElementById('stage').requestFullscreen=async()=>{target='stage';};env.key('f');assert.equal(target,'stage');
 Object.defineProperty(env.d,'fullscreenElement',{configurable:true,value:env.d.getElementById('stage')});env.d.exitFullscreen=async()=>{exits++;};env.key('BrowserBack');await tick();assert.equal(exits,1);
});
test('TV navigation does not hijack native typing, selection or seek inputs',()=>{
 const env=setup('<input id="search" type="search"><button id="submit">Search</button><input id="timeline" type="range" min="0" max="300" value="20" step="0.1" data-player-seek><select id="select"><option>English</option><option>Spanish</option></select>',{search:[50,50],submit:[50,120],timeline:[50,220,500,48],select:[50,300]});
 env.d.getElementById('search').focus();for(const key of ['ArrowLeft','Backspace','Enter'])assert.equal(env.key(key).defaultPrevented,false,key);
 env.key('ArrowDown');assert.equal(env.d.activeElement.id,'submit');
 const timeline=env.d.getElementById('timeline');let changes=0;timeline.onchange=()=>changes++;timeline.focus();env.key('ArrowRight');assert.equal(timeline.value,'30');assert.equal(changes,1);
 env.d.getElementById('select').focus();assert.equal(env.key('ArrowDown').defaultPrevented,false,'Native select menus keep their own arrow behavior');
});
test('Keyboard-only TV mode performs no gamepad animation work until a controller is connected',()=>{
 const env=setup('<button id="first">Play</button>',{first:[50,50]});assert.equal(env.w.frameCount(),0);
 env.pads([{id:'Remote controller',axes:[0,0,0,0],buttons:[]}]);env.w.dispatchEvent(new env.w.Event('gamepadconnected'));assert.equal(env.w.frameCount(),1);
 env.pads([]);env.w.dispatchEvent(new env.w.Event('gamepaddisconnected'));assert.equal(env.w.frameCount(),0);
});
test('Holding a controller direction over the timeline uses a controlled repeat rate',()=>{
 const env=setup('<input id="seek" type="range" data-player-seek min="0" max="300" value="20">',{seek:[50,200,500,48]});let now=1000;env.w.Date.now=()=>now;
 env.pads([{axes:[0,0,0,0],buttons:Array.from({length:17},(_,index)=>({pressed:index===15}))}]);env.w.dispatchEvent(new env.w.Event('gamepadconnected'));
 env.w.flush(16);assert.equal(env.d.getElementById('seek').value,'30');now=1400;env.w.flush(416);assert.equal(env.d.getElementById('seek').value,'40');now=1416;env.w.flush(432);assert.equal(env.d.getElementById('seek').value,'40','A held direction must not seek on every animation frame');
});
test('Controller stick scrolling covers the same distance on 60 Hz and 144 Hz screens',()=>{
 function distance(frames){const env=setup('<button id="first">Play</button>',{first:[50,50]});let total=0;env.w.scrollBy=options=>total+=options.top||0;
  env.pads([{axes:[0,0,0,1],buttons:[]}]);env.w.dispatchEvent(new env.w.Event('gamepadconnected'));for(let frame=1;frame<=frames;frame++)env.w.flush(frame*1000/frames);return total;
 }
 assert(Math.abs(distance(60)-distance(144))<20,'Stick speed must follow elapsed time, not refresh rate');
});
test('An idle connected controller polls input without measuring the page on every frame',()=>{
 const env=setup('<button id="first">Play</button>',{first:[50,50]});env.pads([{axes:[0,0,0,0],buttons:[]}]);env.w.dispatchEvent(new env.w.Event('gamepadconnected'));
 let reads=0;env.d.getElementById('first').getBoundingClientRect=()=>{reads++;return {left:50,top:50,width:120,height:48,right:170,bottom:98};};
 for(let frame=1;frame<=12;frame++)env.w.flush(frame*16);assert.equal(reads,0,'Idle input polling must not repeatedly read layout');
});
test('Returning to a catalog restores the remembered card without overwriting native scroll restoration',()=>{
 const markup='<main><a id="first" href="/movie/1">One</a><a id="second" href="/movie/2">Two</a></main>',rects={first:[50,200],second:[250,200]};
 const env=setup(markup,rects);env.d.getElementById('second').focus();env.w.dispatchEvent(new env.w.PageTransitionEvent('pagehide',{persisted:false}));
 const history=env.w.sessionStorage.getItem('swiflytv.tvFocusHistory');assert(history,'TV focus must survive a normal document navigation');
 const returned=setup(markup,rects,{focusHistory:history});assert.equal(returned.d.activeElement.id,'second');assert.equal(returned.scrolled.length,0,'The browser retains ownership of scroll restoration');
});
