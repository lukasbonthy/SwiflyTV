'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{playerMarkup}=require('../ui/player');
const {createPublicFetcher}=require('../lib/nuvio-http'),{verifyNuvioSource}=require('../lib/nuvio-provider');
const root=path.join(__dirname,'../public'),videoFile=path.join(__dirname,'fixtures/source-4k.webm'),executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath()),skip=!available&&'Chromium is not installed';
let browser,api,server,origin,html;const requests=[];
test.before(async()=>{
 if(!available)return;api=loadServer();html=api.pageShell({title:'Original 4K playback',active:'movies',extraHead:'<link rel="stylesheet" href="/assets/player/player.css">',body:playerMarkup({id:42,title:'Original 4K test pattern',type:'movie',mode:'movie',managed:true})}).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(s,a)=>/data-sv-studio-(?:config|prime)/.test(a)?s:'');
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/licensed.webm'){
   requests.push({method:req.method,range:req.headers.range});
   if(req.method==='HEAD'){res.writeHead(405);return res.end();}
   // This authorized fixture deliberately ignores Range, like some file servers.
   res.writeHead(200,{'Content-Type':'video/webm','Content-Length':fs.statSync(videoFile).size});const stream=fs.createReadStream(videoFile);res.on('close',()=>stream.destroy());stream.pipe(res);return;
  }
  if(pathname.startsWith('/assets/')){const file=path.resolve(root,pathname.slice(8));if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'application/javascript');fs.createReadStream(file).pipe(res);return;}}
  res.setHeader('Content-Type',pathname.startsWith('/api/')?'application/json':'text/html');res.end(pathname.startsWith('/api/')?'{}':html);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(api)await new Promise(resolve=>api.io.close(resolve));});
test('verified 4K survives a Range-ignoring host and plays with actual 3840×2160 dimensions',{skip},async()=>{
 const source=await verifyNuvioSource({url:origin+'/licensed.webm',quality:'4K'},{fetchResource:createPublicFetcher({addressAllowed:()=>true})});
 assert.equal(source?.mediaVerified,true);assert.equal(source.format,'webm');assert.equal(source.quality,'2160p');assert.deepEqual(requests.slice(0,2).map(r=>r.method),['HEAD','GET']);assert.equal(requests[1].range,'bytes=0-4095');
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/plain'}));
  await page.goto(origin+'/watch/movie/42');await page.addScriptTag({content:fs.readFileSync(path.join(root,'player/player.js'),'utf8')});
  await page.evaluate(async data=>{document.querySelector('video').muted=true;await SwiflyPlayer.loadSource(data);},{status:'ok',playbackUrl:source.url,streamType:source.format,streamQuality:source.quality});
  await page.waitForFunction(()=>SwiflyPlayer.getState().ready&&document.querySelector('video').videoHeight===2160);
  assert.deepEqual(await page.locator('video').evaluate(v=>[v.videoWidth,v.videoHeight]),[3840,2160]);
  assert.match(await page.locator('[data-player-quality]').textContent(),/4K \(2160p\)/);
  await page.evaluate(async()=>{const video=document.querySelector('video');window.played4K=false;video.addEventListener('playing',()=>{window.played4K=!video.paused&&video.readyState>=2;},{once:true});await SwiflyPlayer.play({remote:true});});
  await page.waitForFunction(()=>window.played4K===true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
