'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright-core');
const {playerMarkup} = require('../ui/player');
const executablePath = process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available = fs.existsSync(executablePath || chromium.executablePath());
let server, browser, origin;

// A real, local media timeline avoids provider/network variability. Chromium
// decodes this PCM track through the same HTMLVideoElement used for movies.
function mediaFixture() {
  const samples=8000*30, data=Buffer.alloc(44+samples*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);
  data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples*2,40);
  return data;
}
test.before(async()=>{
  if(!available)return;
  const media=mediaFixture();
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(['/continue.js','/player.js'].includes(url.pathname)){
      res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'../public',url.pathname==='/continue.js'?'clean/continue.js':'player/player.js')));return;
    }
    if(url.pathname==='/media.wav'){
      const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
      res.setHeader('content-type','audio/wav');res.setHeader('accept-ranges','bytes');
      if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),media.length-1):media.length-1;res.writeHead(206,{'content-range':`bytes ${start}-${end}/${media.length}`});res.end(media.subarray(start,end+1));}
      else res.end(media);return;
    }
    if(url.pathname.startsWith('/api/proxy-video-wait/')){
      const [,type,id]=url.pathname.match(/\/api\/proxy-video-wait\/(movie|tv)\/(\d+)/);
      res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok',movieId:id,type,season:Number(url.searchParams.get('season'))||1,episode:Number(url.searchParams.get('episode'))||1,playbackUrl:'/media.wav'}));return;
    }
    const watch=url.pathname.match(/^\/watch\/(movie|tv)\/(\d+)$/);
    const type=watch?.[1]||url.searchParams.get('type')||'movie',id=watch?.[2]||(type==='tv'?'101':'42');
    const body=watch?playerMarkup({id,type,title:'Resume fixture',season:Number(url.searchParams.get('s'))||1,episode:Number(url.searchParams.get('e'))||1,mode:'movie'}):`<main><div class="dsHeroActions"><a class="dsPrimaryBtn" data-play-id="${id}" data-play-type="${type}" href="/watch/${type}/${id}?mode=movie${type==='tv'?'&s=1&e=1':''}">Play</a></div><div id="continueGrid"></div></main>`;
    res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><script defer src="/continue.js"></script>'+ (watch?'<script defer src="/player.js"></script>':'')+'</head><body>'+body+'</body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

for(const type of ['movie','tv'])test(`Real ${type} playback persists progress and restores it across navigation and reload`,{skip:!available&&'Chromium is not installed'},async()=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>{if(!localStorage.getItem('swiflytv.activeProfile')){localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'}]));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));}});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const id=type==='tv'?'101':'42';
    await page.goto(origin+`/watch/${type}/${id}?mode=movie${type==='tv'?'&s=2&e=8':''}`);
    await page.waitForFunction(()=>window.SwiflyPlayer?.getState().ready);
    await page.locator('[data-player-play]').click();await page.evaluate(()=>SwiflyPlayer.seek(12));
    await page.waitForFunction(()=>SwiflyPlayer.getState().currentTime>12.2);
    await page.locator('[data-player-play]').click();
    const saved=await page.evaluate(()=>SwiflyContinue.read()[0]);
    assert(saved.currentTime>=12.2&&saved.currentTime<15);assert.equal(saved.duration,30);assert.equal(saved.profileId,'main');
    if(type==='tv'){assert.equal(saved.season,2);assert.equal(saved.episode,8);}
    await page.goto(origin+'/browse?type='+type);
    const href=await page.locator('[data-resume-action]').getAttribute('href');
    assert.match(href,/resume=1/);if(type==='tv')assert.match(href,/s=2&e=8/);
    assert.equal(await page.locator('.svResumeLink').getAttribute('href'),href);
    await page.locator('[data-resume-action]').click();
    await page.waitForFunction(expected=>SwiflyPlayer.getState().ready&&Math.abs(SwiflyPlayer.getState().currentTime-expected)<.2,saved.currentTime);
    await page.reload();
    await page.waitForFunction(expected=>SwiflyPlayer.getState().ready&&Math.abs(SwiflyPlayer.getState().currentTime-expected)<.2,saved.currentTime);
    await page.goto(origin+'/browse?type='+type);await page.locator('.dsHeroActions [data-play-id]').click();
    await page.waitForFunction(()=>SwiflyPlayer.getState().ready);assert.equal(await page.evaluate(()=>SwiflyPlayer.getState().currentTime),0,'The original Play action still starts fresh');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
