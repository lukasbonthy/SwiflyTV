'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{playerMarkup}=require('../ui/player'),{tvSource}=require('../ui/tv');
const root=path.join(__dirname,'../public'),videoFile=path.join(__dirname,'fixtures/tv-controller.webm'),executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api,server,origin,html;
test.before(async()=>{
 if(!available)return;api=loadServer();html=api.pageShell({title:'Controller playback',active:'movies',extraHead:'<link rel="stylesheet" href="/assets/player/player.css"><link rel="stylesheet" href="/assets/player/assist.css">',body:playerMarkup({id:42,title:'Controller playback',type:'movie',mode:'movie',managed:true})}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(s,a)=>/data-sv-studio-(?:config|prime)/.test(a)?s:'');
 server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/media.webm'){
  const size=fs.statSync(videoFile).size,match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  res.writeHead(match?206:200,{'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Length':end-start+1,...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});fs.createReadStream(videoFile,{start,end}).pipe(res);return;
 }if(pathname.startsWith('/assets/')){const file=path.resolve(root,pathname.slice(8));if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'application/javascript');fs.createReadStream(file).pipe(res);return;}}
 res.setHeader('Content-Type',pathname.startsWith('/api/')?'application/json':'text/html');res.end(pathname.startsWith('/api/')?'{}':html);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(api)await new Promise(resolve=>api.io.close(resolve));});
async function open(width,height){
 const context=await browser.newContext({viewport:{width,height}});await context.addInitScript(()=>{
  localStorage.setItem('swiflytv.tvFocusMode','true');
  const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,...args){if(type==='gamepadconnected'||type==='gamepaddisconnected')return;return add.call(this,type,...args);};
  const windowAdd=window.addEventListener.bind(window);window.addEventListener=(type,...args)=>{if(type!=='gamepadconnected'&&type!=='gamepaddisconnected')windowAdd(type,...args);};
  window.testPad={id:'Standard controller',mapping:'standard',index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
 });const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.fulfill({body:'',contentType:r.request().resourceType()==='stylesheet'?'text/css':'text/plain'}));await page.goto(origin+'/watch/movie/42');
 await page.evaluate(()=>{document.documentElement.dataset.svTv='true';for(const n of document.querySelectorAll('.dsNavActions>.svNavButton'))n.hidden=false;});await page.addScriptTag({content:fs.readFileSync(path.join(root,'player/player.js'),'utf8')});await page.addScriptTag({content:tvSource()});
 await page.evaluate(async()=>{const app=document.querySelector('[data-player-root]');app.dataset.playerControlsTimeoutMs='700';document.querySelector('video').muted=true;await SwiflyPlayer.loadSource({status:'ok',playbackUrl:'/media.webm'});});
 await page.waitForFunction(()=>SwiflyPlayer.getState().ready);await page.evaluate(async()=>{SwiflyPlayer.seek(20,{remote:true});await SwiflyPlayer.play({remote:true});window.transportActions=[];document.querySelector('[data-player-root]').addEventListener('swiflyplayer:action',e=>transportActions.push(e.detail));});return{context,page,errors};
}
for(const [width,height]of [[1280,720],[1920,1080]])test('native video/controller zones, single scrub commits and TV geometry at '+width+'×'+height,{skip},async()=>{
 const {context,page,errors}=await open(width,height);try{
  const nav=await page.locator('.netflixNav').evaluate(n=>[...n.querySelectorAll('.navLinks>a,.dsNavActions>.svNavButton,.dsProfileMenu>summary,.brand')].map(a=>({name:a.getAttribute('aria-label')||a.textContent.trim(),r:a.getBoundingClientRect().toJSON()})));
  for(const {name,r}of nav){assert(r.width>=44&&r.height>=44,name+' target size');assert(r.left>=0&&r.right<=width+1,name+' outside viewport '+JSON.stringify(r));}
  for(let i=0;i<nav.length;i++)for(let j=i+1;j<nav.length;j++){const a=nav[i].r,b=nav[j].r;assert(!(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1),'Overlapping nav: '+nav[i].name+' / '+nav[j].name);}
  await page.locator('[data-player-stage]').focus();const before=await page.evaluate(()=>SwiflyPlayer.getState().currentTime);await page.keyboard.press('ArrowRight');assert((await page.evaluate(()=>SwiflyPlayer.getState().currentTime))-before>=9.8);
  await page.keyboard.press('ArrowUp');assert.equal(await page.locator('[data-player-seek]').evaluate(n=>n===document.activeElement),true);
  await page.evaluate(()=>{transportActions.length=0;testPad.buttons[15]={pressed:true,value:1};});await page.waitForFunction(()=>Number(document.querySelector('[data-player-seek]').value)>45,{},{timeout:5000});assert.equal(await page.evaluate(()=>transportActions.length),0);await page.evaluate(()=>testPad.buttons[15]={pressed:false,value:0});await page.waitForFunction(()=>transportActions.length===1);assert.equal(await page.evaluate(()=>transportActions[0].action),'set');
  await page.locator('[data-player-play]').focus();await page.waitForFunction(()=>document.querySelector('[data-player-root]').dataset.playerControlsVisibility==='hidden');assert.equal(await page.locator('[data-player-stage]').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('ArrowDown');assert.equal(await page.locator('[data-player-play]').evaluate(n=>n===document.activeElement),true);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>SwiflyPlayer.getState().paused),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>SwiflyPlayer.getState().paused),false);
  await page.locator('[data-player-fullscreen]').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.locator('[data-player-seek]').focus();const geometry=await page.locator('[data-player-controls]').evaluate(dock=>{const timeline=dock.querySelector('.svPlayerTimelineRow').getBoundingClientRect(),row=dock.querySelector('.svPlayerDockRow').getBoundingClientRect(),r=dock.getBoundingClientRect();return{timeline:timeline.toJSON(),row:row.toJSON(),dock:r.toJSON()};});assert(geometry.timeline.width>=geometry.dock.width*.85);assert(geometry.timeline.bottom<=geometry.row.top+1);assert(geometry.dock.left>=0&&geometry.dock.right<=width&&geometry.dock.bottom<=height);
  if(process.env.SWIFLY_CAPTURE_EVIDENCE){const dir=path.join(__dirname,'../docs/evidence/wallpapers-tv');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'tv-player-'+width+'.png')});}
  await page.evaluate(()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack',bubbles:true,cancelable:true}));});assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'First Back hides the dock');await page.evaluate(()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack',bubbles:true,cancelable:true}));});await page.waitForFunction(()=>!document.fullscreenElement);
  await page.evaluate(()=>SwiflyPlayer.setRemoteMode({enabled:true,isHost:false}));await page.locator('[data-player-stage]').focus();const guest=await page.evaluate(()=>SwiflyPlayer.getState().currentTime);await page.keyboard.press('ArrowRight');assert(Math.abs((await page.evaluate(()=>SwiflyPlayer.getState().currentTime))-guest)<1);assert.equal(await page.locator('[data-player-play]').isDisabled(),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
