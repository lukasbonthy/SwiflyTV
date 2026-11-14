'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function field({height=800,film=null}={}){
 const env=browser('<main class="svPlayerPage"><div data-player-waves><canvas></canvas></div><div data-player-stage><video data-player-video></video></div></main>'),w=env.window,d=w.document;
 const root=d.querySelector('main'),backdrop=d.querySelector('[data-player-waves]'),canvas=d.querySelector('canvas'),video=d.querySelector('video');
 let now=0,blocked=false,reads=0,src='/movie.mp4',paused=false,time=0,ready=true,measures=0,movieColors=[[245,32,24],[25,75,245]];
 const pixels=[],rects=[];
 backdrop.getBoundingClientRect=()=>{measures++;return {left:0,top:0,width:1200,height};};
 const paint={fillStyle:'#000',fillRect(x,y,width,height){if(this.fillStyle==='#000'){pixels.length=0;rects.length=0;}else{pixels.push(this.fillStyle.match(/[\d.]+/g).map(Number));rects.push([x,y,width,height]);}}};
 w.HTMLCanvasElement.prototype.getContext=function(){if(this===canvas)return paint;const sample=this;return {drawImage(){},getImageData(){reads++;if(blocked)throw new w.DOMException('Protected frame','SecurityError');const data=new Uint8ClampedArray(sample.width*sample.height*4);for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){const i=(y*sample.width+x)*4;data.set([...movieColors[x<sample.width/2?0:1],255],i);}return {data};}};};
 Object.defineProperties(video,{readyState:{get:()=>ready?4:0},videoWidth:{get:()=>1280},videoHeight:{get:()=>720},currentSrc:{get:()=>src},paused:{get:()=>paused},currentTime:{get:()=>time}});
 if(film)d.querySelector('[data-player-stage]').getBoundingClientRect=()=>film;
 w.boot('player/waves.js');
 return {...env,root,backdrop,canvas,pixels,rects,frameColors(left,right=left){movieColors=[left,right];},get reads(){return reads;},get measures(){return measures;},play(){root.dispatchEvent(new w.CustomEvent('swiflyplayer:play-intent',{bubbles:true}));},advance(ms){const end=now+ms;while(now<end){now+=16;if(!paused)time+=.016;w.flush(now);}},block(value){blocked=value;},source(value){src=value;},pause(){paused=true;},ready(value){ready=value;},hide(value){Object.defineProperty(d,'hidden',{configurable:true,value});d.dispatchEvent(new w.Event('visibilitychange'));}};
}

test('the ripple field waits for Play rather than source discovery',()=>{
 const f=field();f.advance(500);assert.equal(f.pixels.length,0,'browsing and source discovery must leave the backdrop quiet');
 f.root.dispatchEvent(new f.window.CustomEvent('swiflyplayer:state',{detail:{ready:true,status:'ready',source:'/movie.mp4'}}));f.advance(200);assert.equal(f.pixels.length,0);
 f.play();f.advance(32);assert(f.pixels.length>0,'Play emits the first center pulse');assert.equal(f.backdrop.dataset.waveState,'live');f.finish();
});

test('the entire ripple follows movie regions without a fixed green tint',()=>{
 const f=field();f.play();f.advance(1600);
 assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4),'warm frames must produce a warm ripple region');
 assert(f.pixels.some(([r,g,b])=>b>r*1.4&&b>g*1.2),'cool frames must produce a cool ripple region');
 assert(!f.pixels.some(([r,g,b])=>g>r*1.4&&g>b*1.4),'a red and blue movie cannot gain a synthetic green field');
 assert(f.reads<=14,'frame reads must be throttled rather than run at the ripple draw rate');f.finish();
});

test('a protected frame keeps neutral playback decoration and retries only a new source',()=>{
 const f=field();f.block(true);f.play();f.advance(1400);assert.equal(f.reads,1,'a blocked source cannot throw on every frame');
 assert(f.pixels.length>0&&f.pixels.every(([r,g,b])=>r===g&&g===b),'blocked sampling keeps a neutral field');
 f.block(false);f.source('/replacement.mp4');f.advance(1600);assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4),'a replacement source can supply colors');f.finish();
});

test('paused, hidden and reduced-motion playback stop unnecessary frame reads',()=>{
 const f=field();f.play();f.advance(800);f.pause();f.advance(600);const paused=f.reads;f.advance(700);assert.equal(f.reads,paused,'a paused frame must not be read repeatedly');
 f.hide(true);const hidden=f.reads;f.advance(500);assert.equal(f.reads,hidden);assert.equal(f.window.frameCount(),0);
 f.hide(false);f.window.reduceMotion(true);const reduced=f.reads;f.advance(500);assert.equal(f.reads,reduced);assert.equal(f.window.frameCount(),0);f.finish();
});

test('replacing a movie drops its old frame colors while the new video is loading',()=>{
 const f=field();f.play();f.advance(1600);assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4));
 f.source('/next-movie.mp4');f.ready(false);f.advance(100);assert(f.pixels.every(([r,g,b])=>r===g&&g===b),'loading the next movie cannot keep the previous frame palette');
 f.ready(true);f.advance(1600);assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4));f.finish();
});

test('losing permission to read an active movie restores the neutral palette',()=>{
 const f=field();f.play();f.advance(1600);assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4));
 f.block(true);f.advance(400);assert(f.pixels.every(([r,g,b])=>r===g&&g===b),'a protected source cannot retain stale movie colors');f.finish();
});

test('a rapid second Play adds a pulse without erasing the first pulse',()=>{
 const f=field();f.play();f.advance(300);const prior=f.rects.map(r=>r.slice());f.play();
 assert(prior.every(([x,y,width,height])=>f.rects.some(([nx,ny,nw,nh])=>x+width/2>=nx&&x+width/2<nx+nw&&y+height/2>=ny&&y+height/2<ny+nh)),'previously painted pulse centers must remain after another Play');f.finish();
});

test('Play reuses the prepared ripple grid instead of measuring the page again',()=>{
 const f=field(),prepared=f.measures;f.play();f.advance(200);f.play();assert.equal(f.measures,prepared,'input feedback must reuse the prepared canvas geometry');f.finish();
});

test('a running ripple responds to new movie colors without a second Play',()=>{
 const f=field();f.frameColors([245,25,20]);f.play();f.advance(800);assert(f.pixels.some(([r,g,b])=>r>g*1.4&&r>b*1.4));
 f.frameColors([20,40,245]);f.advance(400);assert(f.pixels.length>100&&f.pixels.every(([r,g,b])=>b>r*1.2&&b>g*1.2),'the current wave changes color before another pulse is requested');f.finish();
});

test('a tall player page keeps the ripple emission centered on its film',()=>{
 const f=field({height:1600,film:{left:100,top:100,width:1000,height:600}});f.play();const ys=f.rects.flatMap(([x,y,w,h])=>[y,y+h]);
 const center=(Math.min(...ys)+Math.max(...ys))/2;assert(Math.abs(center/f.canvas.height-.25)<.025,'the origin stays at the movie center rather than the full page center');assert(f.canvas.height<=900&&f.canvas.width<=1280);f.finish();
});
