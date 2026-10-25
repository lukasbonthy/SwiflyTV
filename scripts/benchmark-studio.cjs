#!/usr/bin/env node
'use strict';

// Repeatable local-fixture interaction measurements, not a hardware FPS score.
// node scripts/benchmark-studio.cjs --app-root=/path/to/checkout --output=/path/to/report.json
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright-core');
const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const appRoot=path.resolve(option('app-root')||path.join(__dirname,'..'));
const output=path.resolve(option('output')||path.join(__dirname,'../docs/evidence/performance-branch.json'));
const native=chromium.executablePath(),shell=native.replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH||[shell,native].find(file=>fs.existsSync(file));
const film={id:157336,media_type:'movie',title:'Interstellar',release_date:'2014-11-05',vote_average:8.5,vote_count:30000,genre_ids:[878],genres:[{id:878,name:'Science Fiction'}],overview:'A fixed catalog fixture for repeatable interaction measurements.',poster_path:'/fixture.jpg',backdrop_path:'/fixture.jpg',runtime:169,images:{logos:[]},release_dates:{results:[]}};
const art='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#28344c"/><path d="M0 800 600 0" stroke="#91b9b4" stroke-width="100"/></svg>';
const report={schemaVersion:1,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:appRoot,encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),method:'Identical 36-card fixture, same Chromium/headless host, fresh guest per device. One warmup then five samples per action. Action duration includes Playwright command overhead, readiness and two animation frames; scroll runs each record 30 renderer RAF gaps after an unrecorded warmup, not hardware/display FPS.',limitations:['Local metadata/artwork and silent VP8 fixtures replace external data.','Software-rendered headless Chromium; these results do not predict physical phone/Xbox performance.','No performance grade or statistical improvement claim; raw samples and medians are reported.'],devices:[]};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function frames(page){return page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now())))));}
async function measure(page,action,cleanup){const values=[];for(let n=0;n<6;n++){const start=await page.evaluate(()=>performance.now());await action(n);const elapsed=(await frames(page))-start;if(n)values.push(Number(elapsed.toFixed(2)));if(cleanup)await cleanup();}return {samplesMs:values,medianMs:median(values)};}

(async()=>{
 const data=await fsp.mkdtemp(path.join(os.tmpdir(),'swifly-benchmark-'));process.env.SWIFLY_DATA_DIR=data;
 let browser,api;
 try{
  api=require(path.join(appRoot,'tests/ui-helpers.cjs')).loadServer();api.setTmdb(async endpoint=>endpoint==='/movie/157336'?film:/\/credits$/.test(endpoint)?{cast:[],crew:[]}:/\/images$/.test(endpoint)?{logos:[]}:endpoint==='/movie/157336/watch/providers'?{results:{}}:{results:[],page:1,total_pages:1});
  await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+api.httpServer.address().port;
  const cards=Array.from({length:36},()=>api.movieCard(film,'movie')).join('');
  const catalog=api.pageShell({title:'Interaction benchmark',active:'home',body:'<main data-st-home><section class="dsContent" data-st-home-rows><section data-st-home-section="trending-movies"><h1>Fixed catalog</h1><div class="grid">'+cards+'</div></section></section></main>'});
  const {playerMarkup}=require(path.join(appRoot,'ui/player'));
  const player=api.pageShell({title:'Player benchmark',player:true,body:playerMarkup({id:'157336',type:'movie',title:'Fixture',managed:true})});
  const fixtureSource=fs.readFileSync(path.join(__dirname,'../tests/player-studio-browser.test.cjs'),'utf8').match(/const fixture=Buffer\.from\('([^']+)','base64'\)/);
  if(!fixtureSource)throw Error('The shared silent VP8 test fixture is missing.');
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const device of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'tv',width:1920,height:1080}]){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height}}),page=await context.newPage();page.setDefaultTimeout(12000);
   try{
    await context.addInitScript(({tv})=>{Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true});const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,...rest){if(type!=='gamepadconnected'&&type!=='gamepaddisconnected')return add.call(this,type,...rest);};if(tv)localStorage.setItem('swiflytv.tvFocusMode','true');},{tv:device.name==='tv'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin){if(u.pathname==='/__benchmark')return route.fulfill({contentType:'text/html',body:catalog});if(u.pathname==='/__benchmark-player')return route.fulfill({contentType:'text/html',body:player});if(u.pathname==='/__benchmark.webm')return route.fulfill({contentType:'video/webm',body:Buffer.from(fixtureSource[1],'base64')});return route.continue();}return route.fulfill({contentType:u.hostname==='image.tmdb.org'?'image/svg+xml':route.request().resourceType()==='stylesheet'?'text/css':'text/plain',body:u.hostname==='image.tmdb.org'?art:''});});
    await page.goto(origin+'/__benchmark',{waitUntil:'domcontentloaded'});await page.evaluate(()=>SwiflyAccount.ready);await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
    const result={...device,cardCount:await page.locator('.movieCard').count()};
    const scrollRuns=[];for(let run=0;run<6;run++){const gaps=await page.evaluate(()=>new Promise(resolve=>{const gaps=[];let last=performance.now(),n=0;function frame(now){if(n>1)gaps.push(Number((now-last).toFixed(2)));last=now;scrollTo(0,Math.min(1200,n*40));if(++n<32)requestAnimationFrame(frame);else{scrollTo(0,0);resolve(gaps);}}requestAnimationFrame(frame);}));if(run)scrollRuns.push(gaps);}result.scroll={runsMs:scrollRuns,samplesMs:scrollRuns.flat(),medianMs:median(scrollRuns.flat())};
    const card=page.locator('.movieCard').first();await card.scrollIntoViewIfNeeded();
    result.hoverOrFocus=await measure(page,async n=>{if(device.name==='desktop')await page.mouse.move(...(n%2?[1,1]:await card.boundingBox().then(b=>[b.x+b.width/2,b.y+b.height/2])));else await (n%2?page.locator('.brand'):card).focus();});
    result.detailsOpen=await measure(page,async()=>{await page.evaluate(()=>SwiflyDetails.open('/movie/157336',document.querySelector('.movieCard')));await page.waitForFunction(()=>document.querySelector('dialog[data-sv-detail-state="open"]'));await page.evaluate(()=>SwiflyDetails.close());await page.waitForFunction(()=>!document.querySelector('dialog[data-sv-detail-state]')?.open);});
    await page.evaluate(()=>SwiflyStudio.open());
    result.studioTab=await measure(page,async n=>{await page.locator('[data-st-tab="'+(n%2?'looks':'layout')+'"]').click();});
    await page.evaluate(()=>SwiflyStudio.close());
    await page.goto(origin+'/__benchmark-player',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.SwiflyPlayer?.loadSource);await page.evaluate(async()=>{await SwiflyPlayer.loadSource({status:'ok',playbackUrl:'/__benchmark.webm'});});await page.waitForFunction(()=>SwiflyPlayer.getState().ready);await page.evaluate(async()=>{document.querySelector('video').muted=true;await SwiflyPlayer.play({remote:true});});
    result.playerSettings=await measure(page,async()=>{await page.locator('[data-player-settings] > summary').click();},async()=>{await page.locator('[data-player-settings-close]').click();});
    result.playerKeptPlaying=await page.evaluate(()=>!document.querySelector('video').paused);report.devices.push(result);
   }finally{await context.close();}
  }
 }finally{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));await fsp.rm(data,{recursive:true,force:true});}
 report.finishedAt=new Date().toISOString();await fsp.mkdir(path.dirname(output),{recursive:true});await fsp.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,devices:report.devices.map(d=>({name:d.name,scroll:d.scroll.medianMs,hoverOrFocus:d.hoverOrFocus.medianMs,detailsOpenAndClose:d.detailsOpen.medianMs,studioTab:d.studioTab.medianMs,playerSettings:d.playerSettings.medianMs}))}));
})().catch(error=>{console.error(error);process.exitCode=1;});
