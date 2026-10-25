'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const {loadServer}=require('./ui-helpers.cjs');
const available=fs.existsSync(chromium.executablePath());
let server,browser,origin;
test.before(async()=>{
  if(!available)return;
  server=loadServer();
  server.setTmdb(async endpoint=>{
    if(endpoint==='/tv/101')return {id:101,name:'Series fixture',first_air_date:'2025-01-01',seasons:[{season_number:1,episode_count:2},{season_number:2,episode_count:3}]};
    const season=endpoint.match(/^\/tv\/101\/season\/(\d+)$/);
    if(season)return {episodes:Array.from({length:season[1]==='1'?2:3},(_,index)=>({episode_number:index+1,name:'Chapter '+(index+1)}))};
    return {results:[]};
  });
  await new Promise(resolve=>server.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.io.close(resolve));});

for(const viewport of [{width:1440,height:960},{width:390,height:844},{width:320,height:740}])test(`Episode controls keep visible labels and navigate seasons at ${viewport.width}px`,{skip:!available&&'Chromium is not installed'},async()=>{
  const context=await browser.newContext({viewport});
  try{
    await context.addInitScript(()=>{
      localStorage.setItem('swiflytv.session',JSON.stringify({email:'episodes@example.test'}));
      localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'fixture',name:'Viewer'}));
      const add=window.addEventListener.bind(window);
      window.addEventListener=(type,listener,options)=>{if(type!=='gamepadconnected'&&type!=='gamepaddisconnected')add(type,listener,options);};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
    });
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/api/proxy-video-wait/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'Local navigation fixture'})});
      if(url.origin===origin)return route.continue();
      return route.fulfill({body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/plain'});
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/watch/tv/101?s=1&e=2&provider=fixture');
    await page.waitForFunction(()=>Boolean(window.SwiflyPlayer));
    const controls=page.locator('[data-player-episode-navigation]');
    await controls.scrollIntoViewIfNeeded();
    const geometry=await controls.evaluate(element=>{
      const box=element.getBoundingClientRect();
      return {box:{top:box.top,left:box.left,right:box.right},theaterBottom:document.querySelector('.svPlayerTheater').getBoundingClientRect().bottom,
        viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        buttons:[...element.querySelectorAll('.svPlayerEpisodeStep')].map(button=>{
          const rect=button.getBoundingClientRect(),label=button.querySelector('.svNavMatchedLabel')||button.querySelector(':scope > span:not(.svLiquidPane)');
          return {height:rect.height,left:rect.left,right:rect.right,client:button.clientWidth,scroll:button.scrollWidth,label:getComputedStyle(label).display,text:button.textContent.trim()};
        })};
    });
    assert(geometry.box.top>=geometry.theaterBottom&&geometry.box.top-geometry.theaterBottom<=20,'Controls sit immediately under the video');
    assert(geometry.scrollWidth<=geometry.viewport,'The player must not overflow horizontally');
    assert.deepEqual(geometry.buttons.map(button=>button.text),['Previous episode','Next episode']);
    for(const button of geometry.buttons){assert.notEqual(button.label,'none');assert(button.height>=44);assert(button.left>=0&&button.right<=geometry.viewport);assert(button.scroll<=button.client+1,'Button labels must fit without clipping');}
    assert.equal(await page.locator('[data-player-episode-next]').count(),1);
    await page.getByRole('link',{name:'Next episode',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/watch/tv/101'&&url.searchParams.get('s')==='2'&&url.searchParams.get('e')==='1');
    assert.equal(new URL(page.url()).searchParams.get('provider'),'fixture');
    await page.getByRole('link',{name:'Previous episode',exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get('s')==='1'&&url.searchParams.get('e')==='2');
    assert.equal(new URL(page.url()).searchParams.get('provider'),'fixture');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
