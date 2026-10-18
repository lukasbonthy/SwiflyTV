'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup,tick}=require('./ui-helpers.cjs');
const {tvScript}=require('../ui/tv');
const code=tvScript().replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
test.afterEach(cleanup);
function pad(index=0){return {id:'Xbox Wireless Controller',index,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};}
function setup(markup,rects={},initial=[],enabled=true){
 const env=browser(markup),w=env.window,d=w.document;let pads=initial,now=1000;
 w.navigator.getGamepads=()=>pads;w.Date.now=()=>now;w.localStorage.setItem('swiflytv.tvFocusMode',String(enabled));
 w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const [id,[left,top,width=120,height=48]]of Object.entries(rects))d.getElementById(id).getBoundingClientRect=()=>({left,top,width,height,right:left+width,bottom:top+height});
 w.eval(code);d.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {...env,w,d,frame(ms=16){now+=ms;w.flush(now);},connect(value){pads=value;w.dispatchEvent(new w.Event('gamepadconnected'));},press(p,index,ms=16){p.buttons[index]={pressed:true,value:1};this.frame(ms);},release(p,index){p.buttons[index]={pressed:false,value:0};this.frame();},focus(id){d.getElementById(id).focus();},active(){return d.activeElement.id;}};
}
function railMarkup(){return '<main>'+[0,1,2].map(row=>'<section class="dsRow" id="row'+row+'"><h2>Chapter '+row+'</h2><a class="svRowMore" id="more'+row+'" href="#more">View all</a><div class="movieRail" id="rail'+row+'">'+Array.from({length:8},(_,i)=>'<article class="movieCard"><a class="posterWrap" id="r'+row+'c'+i+'" href="#film'+i+'">Film '+row+' '+i+'</a><div class="dsCardInfo"><b class="dsCardTitle">Film '+row+' '+i+'</b><span class="dsCardMeta">2026</span></div></article>').join('')+'</div></section>').join('')+'</main>';}
function railRects(){const rects={};for(let row=0;row<3;row++){rects['rail'+row]=[40,180+row*340,800,280];rects['more'+row]=[400,160+row*340,120,48];for(let i=0;i<8;i++)rects['r'+row+'c'+i]=[50+i*200,200+row*340,180,220];}return rects;}
const player='<main class="svPlayerPage" data-player-root data-player-mode="movie" data-player-title="A cinema evening"><div id="stage" data-player-stage tabindex="0"><video id="movie" data-player-video controls></video><div data-player-controls><button id="backward" data-player-backward>Back 10s</button><button id="play" data-player-play>Play</button><button id="forward" data-player-forward>Forward 10s</button><details data-player-settings><summary id="settings">Settings</summary><button id="setting">Quality</button></details></div></div><a id="previous" data-player-episode-previous href="#previous">Previous</a><a id="next" data-player-episode-next href="#next">Next</a></main>';
const playerRects={stage:[50,100,900,500],movie:[50,100,900,500],backward:[200,520],play:[340,520],forward:[480,520],settings:[700,520],setting:[700,400],previous:[100,650],next:[700,650]};

test('An A button held while a page loads must be released before it can select',()=>{
 const p=pad();p.buttons[0]={pressed:true,value:1};const e=setup('<button id="play">Play</button>',{play:[50,100]},[p]);let clicked=0;e.d.getElementById('play').onclick=()=>clicked++;
 e.frame();e.frame();assert.equal(clicked,0,'Loading the next page must not activate it with the previous held A press');e.release(p,0);e.press(p,0);e.frame(500);assert.equal(clicked,1);
});
test('Returning focus to the browser does not replay a held Xbox button',()=>{
 const p=pad(),e=setup('<button id="play">Play</button>',{play:[50,100]},[p]);let clicked=0;e.d.getElementById('play').onclick=()=>clicked++;
 e.w.dispatchEvent(new e.w.Event('blur'));e.press(p,0);assert.equal(clicked,0,'Inactive browser windows do not consume controller input');e.w.dispatchEvent(new e.w.Event('focus'));e.frame();assert.equal(clicked,0);e.release(p,0);e.press(p,0);assert.equal(clicked,1);
});
test('A second active Xbox controller can take over from an idle first controller',()=>{
 const one=pad(0),two=pad(1),e=setup('<button id="left">Left</button><button id="right">Right</button>',{left:[50,100],right:[250,100]},[one,two]);e.frame();e.press(two,15);assert.equal(e.active(),'right');e.release(two,15);e.press(one,14);assert.equal(e.active(),'left');
});
test('Xbox left-stick navigation ignores drift and stays stable near the dead zone',()=>{
 const p=pad(),e=setup('<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>',{one:[50,100],two:[250,100],three:[450,100]},[p]);p.axes[0]=.4;e.frame();assert.equal(e.active(),'one','A small stick offset must not navigate');p.axes[0]=.7;e.frame();assert.equal(e.active(),'two');p.axes[0]=.32;e.frame();p.axes[0]=.7;e.frame();assert.equal(e.active(),'two','Stick noise must not generate another immediate direction edge');p.axes[0]=0;e.frame();p.axes[0]=.7;e.frame();assert.equal(e.active(),'three');
});
test('Xbox bumpers move focus by a visible page of posters instead of leaving focus behind',()=>{
 const p=pad(),e=setup(railMarkup(),railRects(),[p]);e.focus('r0c0');e.press(p,5);assert.equal(e.active(),'r0c4');e.release(p,5);e.press(p,4);assert.equal(e.active(),'r0c0');
});
test('Vertical poster navigation remembers the selected poster in each row',()=>{
 const e=setup(railMarkup(),railRects());e.focus('r0c3');e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(e.active(),'r1c3');e.focus('r1c1');e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(e.active(),'r0c3');
});
test('Xbox triggers move between content rows while keeping a visible focused card',()=>{
 const p=pad(),e=setup(railMarkup(),railRects(),[p]);e.focus('r0c2');e.press(p,7);assert.equal(e.active(),'r1c2');e.release(p,7);e.press(p,6);assert.equal(e.active(),'r0c2');
});
test('Xbox X and triggers use the real player play and ten-second seek controls',()=>{
 const p=pad(),e=setup(player,playerRects,[p]),actions=[];for(const name of ['play','backward','forward'])e.d.getElementById(name).onclick=()=>actions.push(name);e.focus('stage');
 e.press(p,2);e.release(p,2);e.press(p,6);e.release(p,6);e.press(p,7);assert.deepEqual(actions,['play','backward','forward']);
 e.release(p,2);e.d.getElementById('play').disabled=true;e.press(p,2);assert.equal(actions.length,3,'Party guest ownership cannot be bypassed');
});
test('Xbox bumpers use the previous and next episode actions during playback',()=>{
 const p=pad(),e=setup(player,playerRects,[p]),actions=[];for(const name of ['previous','next'])e.d.getElementById(name).onclick=event=>{event.preventDefault();actions.push(name);};e.focus('stage');e.press(p,5);e.release(p,5);e.press(p,4);assert.deepEqual(actions,['next','previous']);e.release(p,5);e.d.getElementById('next').setAttribute('aria-disabled','true');e.press(p,5);assert.equal(actions.length,2);
});
test('Xbox Y opens search and focuses the actual search field',()=>{
 const p=pad(),e=setup('<button id="svNavSearchToggle">Search</button><button id="play">Play</button><form id="svNavSearchPopup" hidden><input id="search" type="search"></form>',{svNavSearchToggle:[50,50],play:[50,200],search:[50,100]},[p]);
 e.d.getElementById('svNavSearchToggle').onclick=()=>{e.d.getElementById('svNavSearchPopup').hidden=false;e.d.getElementById('search').focus();};e.focus('play');e.press(p,3);assert.equal(e.active(),'search');
});
test('Xbox Menu opens player settings and Back closes them before leaving the page',()=>{
 const p=pad(),e=setup(player,playerRects,[p]);e.focus('stage');let backs=0;e.w.history.back=()=>backs++;e.press(p,9);assert.equal(e.d.querySelector('[data-player-settings]').open,true);assert.equal(e.active(),'setting');e.release(p,9);e.press(p,1);assert.equal(e.d.querySelector('[data-player-settings]').open,false);assert.equal(e.active(),'settings');assert.equal(backs,0);
});
test('Xbox View opens a controller help dialog and Back restores the original focus',()=>{
 const p=pad(),e=setup('<button id="play">Play</button>',{play:[50,100]},[p]);e.press(p,8);const help=e.d.getElementById('swiflyTvHelp');assert(help?.open,'View should provide an accessible control reference');assert.match(help.textContent,/Play.*pause/i);e.release(p,8);e.press(p,1);assert.equal(help.open,false);assert.equal(e.active(),'play');
});
test('A engages a select; B finishes editing instead of navigating away',()=>{
 const p=pad(),e=setup('<button id="before">Before</button><select id="season"><option>Season 1</option><option>Season 2</option></select><button id="after">After</button>',{before:[50,50],season:[50,150],after:[50,250]},[p]);let backs=0;e.w.history.back=()=>backs++;e.focus('season');e.press(p,0);e.release(p,0);e.press(p,13);assert.equal(e.d.getElementById('season').selectedIndex,1);assert.equal(e.active(),'season');e.release(p,13);e.press(p,1);assert.equal(backs,0);assert.equal(e.active(),'season');e.release(p,1);e.press(p,13);assert.equal(e.active(),'after','Leaving edit mode makes the next control reachable');
});
test('An open playback settings panel keeps directional focus inside its own controls',()=>{
 const e=setup(player+'<button id="outside">Outside</button>',{...playerRects,outside:[700,460]});e.d.querySelector('[data-player-settings]').open=true;e.focus('setting');e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert(e.d.querySelector('[data-player-settings]').contains(e.d.activeElement));
});
test('Camera previews are never mistaken for an interactive movie player',()=>{
 const e=setup('<button id="before">Before</button><div data-watchroom-call><video id="camera" autoplay></video><button id="mic">Microphone</button></div>',{before:[50,50],camera:[50,150,120,100],mic:[50,360]});e.focus('before');e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(e.active(),'mic');
});
test('The persistent TV guide names the current title and shows Xbox controls',()=>{
 const p=pad(),e=setup(railMarkup(),railRects(),[p]);e.focus('r0c2');const guide=e.d.getElementById('swiflyTvGuide');assert(guide&&!guide.hidden);assert.equal(guide.dataset.input,'gamepad');assert.match(guide.querySelector('.svTvGuideTitle').textContent,/Film 0 2/);assert.match(guide.textContent,/Search/);assert(e.d.getElementById('r0c2').closest('.movieCard').classList.contains('svTvFocusedCard'));assert(e.d.getElementById('row0').classList.contains('svTvFocusedRow'));
 e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true}));assert(guide.hidden);assert(!e.d.querySelector('.svTvFocusedCard'));
});
test('Holding keyboard Select cannot activate a button repeatedly in TV mode',()=>{
 const e=setup('<button id="play">Play</button>',{play:[50,100]});let clicks=0;e.d.getElementById('play').onclick=()=>clicks++;for(const repeat of [false,true,true])e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Enter',repeat,bubbles:true,cancelable:true}));assert.equal(clicks,1);
});
test('Controller input leaves the movie untouched when a call control has focus',()=>{
 const p=pad(),e=setup(player.replace('</main>','<div data-watchroom-call><button id="mic">Microphone</button></div></main>'),{...playerRects,mic:[50,800]},[p]);let played=0;e.d.getElementById('play').onclick=()=>played++;e.focus('mic');e.press(p,2);assert.equal(played,0);
});
test('Xbox search exits fullscreen before it focuses navigation outside the movie',async()=>{
 const p=pad(),e=setup(player+'<button id="svNavSearchToggle">Search</button><form id="svNavSearchPopup" hidden><input id="search" type="search"></form>',{...playerRects,svNavSearchToggle:[50,50],search:[50,100]},[p]);e.focus('stage');let full=e.d.getElementById('stage'),exits=0;
 Object.defineProperty(e.d,'fullscreenElement',{configurable:true,get:()=>full});e.d.exitFullscreen=async()=>{exits++;full=null;};e.d.getElementById('svNavSearchToggle').onclick=()=>{e.d.getElementById('svNavSearchPopup').hidden=false;e.d.getElementById('search').focus();};
 e.press(p,3);await tick();assert.equal(exits,1);assert.equal(e.active(),'search');assert.equal(full,null);
});
test('A fresh button on a second controller takes priority over continuous stick drift',()=>{
 const one=pad(0),two=pad(1),e=setup('<button id="play">Play</button>',{play:[50,100]},[one,two]);let clicks=0;e.d.getElementById('play').onclick=()=>clicks++;one.axes[3]=.3;e.frame();e.press(two,0);assert.equal(clicks,1);e.release(two,0);e.press(two,0);assert.equal(clicks,2);
});
test('An explicit TV-off preference stays off on reload with an already connected Xbox controller',()=>{
 const e=setup('<button id="play">Play</button>',{play:[50,100]},[pad()],false);assert.equal(e.d.documentElement.dataset.svTv,undefined);assert.equal(e.w.frameCount(),0);assert.equal(e.w.localStorage.getItem('swiflytv.tvFocusMode'),'false');
});
test('Re-enabling TV mode consumes an A button held while TV mode was off',()=>{
 const p=pad(),e=setup('<button id="play">Play</button>',{play:[50,100]},[p]);let clicks=0;e.d.getElementById('play').onclick=()=>clicks++;const toggle=()=>e.d.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true}));toggle();e.press(p,0);toggle();e.frame();assert.equal(clicks,0);e.release(p,0);e.press(p,0);assert.equal(clicks,1);
});
test('Closing controller help restores search even if search closed when the dialog took focus',()=>{
 const p=pad(),e=setup('<button id="svNavSearchToggle">Search</button><form id="svNavSearchPopup"><input id="search" type="search"></form>',{svNavSearchToggle:[50,50],search:[50,100]},[p]);e.d.getElementById('svNavSearchToggle').onclick=()=>{e.d.getElementById('svNavSearchPopup').hidden=false;e.d.getElementById('search').focus();};e.focus('search');e.press(p,8);e.d.getElementById('svNavSearchPopup').hidden=true;e.release(p,8);e.press(p,1);assert.equal(e.d.getElementById('swiflyTvHelp').open,false);assert.equal(e.active(),'search');assert.equal(e.d.getElementById('svNavSearchPopup').hidden,false);
});
test('Holding an Xbox trigger seeks at a controlled rate and stops repeating on release',()=>{
 const p=pad(),e=setup(player,playerRects,[p]);let seeks=0;e.d.getElementById('forward').onclick=()=>seeks++;e.focus('stage');e.press(p,7);assert.equal(seeks,1);e.frame(460);assert.equal(seeks,2);e.frame(16);assert.equal(seeks,2);e.frame(180);assert.equal(seeks,3);e.release(p,7);e.frame(500);assert.equal(seeks,3);
});
