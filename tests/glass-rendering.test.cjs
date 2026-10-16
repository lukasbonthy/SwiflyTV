const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath()) || fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');

test('Visible optical panes stay inside their Party hosts and leave page content readable',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:768,height:800}});
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','liquid-glass/surfaces.css','party/party.css','liquid-glass/controls.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body{margin:0;background:repeating-linear-gradient(90deg,#778899 0 24px,#aabbcc 24px 48px);color:white}.svPartyHub{position:relative;min-height:700px;padding:80px 24px}.partyModeNav,.partyEntryTabs{display:flex;width:max-content;gap:8px;margin-bottom:32px;padding:5px;border-radius:24px}.partyModeNav button,.partyEntryTabs button{height:44px;padding:0 18px}.dsHeroActions{display:flex;gap:12px}.dsHeroActions button{height:40px;padding:0 24px}</style><body class="svCleanShell" data-st-glass="liquid"><main class="svPartyHub"><h1>Party Hub</h1><nav class="partyModeNav"><button class="partySecondaryBtn">Watch parties</button><button class="partySecondaryBtn">Community</button></nav><div class="partyEntryTabs"><button>Host a party</button><button>Join a party</button></div><section class="partySetup">Readable setup</section><div class="svPlayerEmbedded" data-player-root><button class="partyIconBtn">Play</button></div></main><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button></div></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.partyModeNav>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const bounds=await page.evaluate(()=>[...document.querySelectorAll('.partyModeNav,.partyEntryTabs')].map(host=>{
   const pane=host.querySelector(':scope > .svNavMatchedLens'),a=host.getBoundingClientRect(),b=pane.getBoundingClientRect();
   return {nested:host.querySelectorAll('.svNavMatchedLens').length,host:{x:a.x,y:a.y,width:a.width,height:a.height},pane:{x:b.x,y:b.y,width:b.width,height:b.height},graph:Boolean(pane.querySelector(':scope > svg')),scale:Math.max(...[...pane.querySelectorAll('feDisplacementMap')].map(node=>Math.abs(Number(node.getAttribute('scale')))))};
  }));
  for(const {nested,host,pane,graph,scale}of bounds){
   assert.equal(nested,1,'tab children must share the container lens');
   for(const key of ['x','y','width','height'])assert(Math.abs(host[key]-pane[key])<=2,'a pane must be bounded by its own host, never the page');
   assert(graph,'supported segmented bars share an actual rounded lens');assert.equal(scale,180,'shared bars use the observed reference optics');
  }
  await page.waitForFunction(()=>document.querySelector('.dsHeroActions .svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  const dispersion=await page.locator('.svNavMatchedLens filter').evaluateAll(filters=>filters.map(filter=>{
   const scales=[...filter.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')));
   return scales.length?Math.max(...scales)-Math.min(...scales):0;
  }));
  assert(dispersion.length&&dispersion.every(value=>value===20),'RGB separation follows the softened reference field');
  assert.equal(await page.locator('main>.svNavMatchedLens,[data-player-root] .svNavMatchedLens,.partySetup>.svNavMatchedLens').count(),0);
  assert.equal(await page.locator('h1').textContent(),'Party Hub');
 }finally{await browser.close();}
});

test('Prominent refractive actions retain 44px pointer targets',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:800}});
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','liquid-glass/surfaces.css','liquid-glass/controls.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body{margin:0;background:#394856}.dsHeroActions{padding:80px 24px;display:flex;gap:12px}.dsHeroActions button{height:40px;padding:0 24px}</style><body class="svCleanShell" data-st-glass="liquid"><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button></div></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.dsPrimaryBtn>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const targets=await page.locator('.dsHeroActions>button').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height};}));
  assert(targets.every(rect=>rect.width>=44&&rect.height>=44),'visible glass actions need at least a 44px target');
 }finally{await browser.close();}
});

for (const scheme of ['light','dark'])for (const native of [false,true]) test(scheme+' '+(native?'Safari fallback':'Chromium')+' navigation and prominent actions share optical glass',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:800},colorScheme:scheme,...(native?{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'}:{})}),page=await context.newPage();
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/cinema.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body{margin:0;background:white;color:white}.dsHeroActions{position:absolute;top:200px;left:24px;display:flex;gap:12px}.dsHeroActions>*{height:40px;min-width:40px;padding:0 20px}.dsCardQuickActions{position:absolute;top:300px}.dsMiniBtn{width:32px;height:32px}a{color:white}.svCinemaPage{position:absolute;top:400px;left:24px}.svDetailActions button{height:40px;min-width:44px;padding:0 20px}</style><body class="svCleanShell" data-st-glass="liquid"><header class="topbar" data-sv-liquid-nav><nav class="container nav netflixNav"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".2"></div><div class="navLeftCluster"><b>SWIFLYTV</b><div class="navLinks"><a>Home</a></div></div><button class="svNavButton">Search</button></nav></header><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button><button class="dsIconBtn">+</button></div><div class="svCinemaPage"><div class="svDetailActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Watch party</button><button class="dsIconBtn">+</button></div></div><div class="dsCardQuickActions"><button class="dsMiniBtn">+</button></div><button class="dsRowArrow">Next</button></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelectorAll('.dsHeroActions>.svNavMatchedOptic>.svNavMatchedLens').length===3);
  await page.waitForTimeout(80);
  const state=await page.evaluate(()=>{
   const sample=node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter,shadow:s.boxShadow,border:s.borderWidth,radius:s.borderRadius,before:getComputedStyle(node,'::before').content,after:getComputedStyle(node,'::after').content,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};
   return {nav:sample(document.querySelector('.netflixNav>.svLiquidPane')),actions:[...document.querySelectorAll('.dsHeroActions>button,.svDetailActions>button')].map(host=>({round:host.matches('.svDetailActions .dsIconBtn'),hero:!!host.closest('.dsHeroActions'),host:sample(host),pane:sample(host.querySelector('.svNavMatchedLens')),hit:host.contains(document.elementFromPoint(host.getBoundingClientRect().x+host.offsetWidth/2,host.getBoundingClientRect().y+host.offsetHeight/2))})),repeat:[...document.querySelectorAll('.dsMiniBtn,.dsRowArrow')].map(sample),graphs:document.querySelectorAll('.svSharedGlassDefinitions,.svWebkitGlassOptics').length};
  });
  const rgba=state.nav.fill.match(/[\d.]+/g).map(Number),alpha=rgba[3]??1;
  assert.equal(alpha,.2,'navigation follows the measured reference face');
  assert.deepEqual(rgba.slice(0,3),scheme==='dark'?[0,0,0]:[255,255,255],'the face follows the device color scheme');
  assert.equal(state.nav.image,'none','the reference gets its reflection from the backdrop, without a painted gradient');
  assert.equal(state.nav.before,'none');assert.equal(state.nav.after,'none','the optical rim must not stack another white frame');
  assert.notEqual(await page.locator('.netflixNav .navLinks>a').evaluate(node=>getComputedStyle(node).textShadow),'none','labels retain a local shadow over bright art without obscuring the whole pane');
  for(const {round,hero,host,pane,hit} of state.actions){
   const actionColor=pane.fill.match(/[\d.]+/g).map(Number);assert.deepEqual(actionColor.slice(0,3),rgba.slice(0,3),'all prominent actions use the same clear glass family');assert.equal(actionColor[3],hero?0:.2,'hero actions keep the reference’s untinted face');
   assert.equal(pane.shadow,state.nav.shadow,'one quiet edge belongs to the pane');
   assert.equal(host.shadow,'none');assert.equal(host.border,'0px');assert.equal(host.image,'none','component styles must not add a pale fill over the shared material');
   assert.equal(host.before,'none');assert.equal(host.after,'none');
   assert(host.rect.width>=44&&host.rect.height>=44);assert(hit);if(round)assert.equal(host.radius,'50%','round detail actions retain the shared control shape');
   for(const key of ['x','y','width','height'])assert(Math.abs(host.rect[key]-pane.rect[key])<=1,'the lens stays bounded to its action');
   if(native)assert(!pane.filter.includes('url('),'Safari uses only native backdrop blur');
  }
  assert(state.repeat.every(control=>!control.filter.includes('url(')),'repeated controls must stay lightweight');
  assert.equal(state.graphs,0,'removed optical renderers must not return');
  await page.locator('.dsHeroActions>.dsPrimaryBtn').hover();await page.waitForTimeout(220);
  assert.equal(await page.locator('.dsHeroActions>.dsPrimaryBtn').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)','hover changes the pane edge without adding another tinted host');
  await page.evaluate(()=>document.body.dataset.stGlass='off');await page.waitForTimeout(30);
  for(const control of await page.locator('.dsHeroActions>button').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backdropFilter)))assert.equal(control,'none');
  await page.evaluate(()=>document.body.dataset.stGlass='subtle');await page.waitForTimeout(30);
  assert(await page.locator('.dsHeroActions>button').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backdropFilter.includes('blur(')&&!getComputedStyle(node).backdropFilter.includes('url('))));
  await page.evaluate(()=>document.body.dataset.stGlass='liquid');
  const session=await context.newCDPSession(page);await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  assert(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches));
  await page.waitForFunction(()=>[...document.querySelectorAll('.netflixNav>.svLiquidPane,.dsHeroActions>button')].every(node=>getComputedStyle(node).backgroundColor==='rgb(21, 25, 30)'));
  const reduced=await page.locator('.netflixNav>.svLiquidPane,.dsHeroActions>button').evaluateAll(nodes=>nodes.map(node=>({background:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter})));
  assert(reduced.every(style=>style.filter==='none'&&style.background==='rgb(21, 25, 30)'),'reduced transparency uses solid readable surfaces: '+JSON.stringify(reduced));

 }finally{await browser.close();}
});

test('Player pages share clear navigation and outer actions while retaining transport ownership',{skip:!available&&'Chromium is not installed'},async()=>{
 const {loadServer}=require('./ui-helpers.cjs'),api=loadServer(),browser=await chromium.launch({headless:true});
 try{
  const html=api.pageShell({active:'watch',player:true,body:'<main data-player-root><button class="dsPrimaryBtn">Play video</button></main>'});
  assert(html.includes('/liquid-glass/controls.css'),'outer player actions share the shell material');
  const inline=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^\"]+)"[^>]*>/g,(tag,url)=>url.startsWith('/assets/')?'<style>'+asset(url.slice(8).split('?')[0])+'</style>':'');
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.setContent(inline);
  await page.evaluate(()=>{document.body.dataset.stGlass='liquid';document.body.dataset.svScrolled='true';});
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  assert.equal(await page.locator('.netflixNav>.svLiquidPane').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(255, 255, 255, 0.2)','scrolling preserves the shared navigation material on player routes');
  assert.equal(await page.locator('[data-player-root] .svGlassSurface,[data-player-root] .svLiquidPane').count(),0);
 }finally{await browser.close();await new Promise(resolve=>api.io.close(resolve));}
});

test('Opacity entrances have visible refraction before pointer, keyboard or scroll input',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:500}});
  await page.setContent('<!doctype html><style>'+asset('liquid-glass/liquid-glass.css')+asset('clean/motion.css')+
   '*{box-sizing:border-box}body{margin:0;background:repeating-linear-gradient(37deg,#153351 0 14px,#dfb47f 14px 28px,#bc4366 28px 42px);height:900px}.entrance{position:absolute;top:50px;left:50px;width:580px;height:60px;border-radius:24px}</style><body class="svCleanShell" data-st-glass="liquid"><section class="entrance svMotionReveal"><div class="svLiquidPane" data-swifly-glass></div></section></body>');
  await page.evaluate(()=>{window.glassInputs=[];for(const type of ['pointermove','pointerdown','click','keydown','wheel','scroll'])document.addEventListener(type,event=>{if(event.isTrusted)glassInputs.push(type);},true);});
  await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.svLiquidPane').getAttribute('data-swifly-renderer'),'svg','the geometry must be ready while opacity is still zero');
  await page.evaluate(()=>document.querySelector('.entrance').classList.add('svMotionVisible'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.entrance')).opacity==='1'&&getComputedStyle(document.querySelector('.entrance')).transform==='none');
  assert.deepEqual(await page.evaluate(()=>glassInputs),[],'initial optical rendering must not depend on user input');
  const clip={x:45,y:45,width:590,height:70},initial=await page.screenshot({clip});
  await page.mouse.move(800,400);const afterInput=await page.screenshot({clip});
  assert(initial.equals(afterInput),'a pointer event must not activate or alter the optical graph');
  await page.evaluate(()=>document.querySelectorAll('feDisplacementMap').forEach(node=>node.setAttribute('scale','0')));
  assert(!initial.equals(await page.screenshot({clip})),'the first visible image must contain real rounded refraction rather than only a filter attribute');
 }finally{await browser.close();}
});

test('Native control material has one clear rim and preserves functional generated labels',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:740,height:900}});
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','liquid-glass/surfaces.css','studio/studio.css','liquid-glass/controls.css','party/party.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body{margin:0;padding:30px;background:#345}main{position:relative}.ordinary{border-radius:13px;padding:12px}.dsAccountActions{margin:20px}.svPartyHub{padding:20px}.stChoice{min-height:44px}body.svCleanShell .svGlassControl{transition:none!important}</style><body class="svCleanShell" data-st-glass="liquid"><main><button class="ordinary">Refresh</button><div class="dsAccountActions"><a class="dsSecondaryBtn">Switch profile</a></div><div class="dsCardQuickActions"><button class="dsMiniBtn">+</button></div><main class="svPartyHub"><button id="sv103RoomCode">ABCD</button><button class="sv100Channel active" aria-current="true">General</button><details class="partyLinkChoice"><summary>Use a video link</summary></details><section class="sv100ChannelGroup"><header><button class="partyIconBtn" data-action="new-channel"><svg viewBox="0 0 24 24"></svg></button></header></section><div class="sv100RoomItem"><button class="partySecondaryBtn">Join party</button></div></main><div id="controlPanel"><button class="stChoice" aria-pressed="true">Selected choice</button></div></main></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.ordinary').classList.contains('svGlassControl'));
  const samples=await page.locator('.ordinary,.dsAccountActions a,.dsMiniBtn,#sv103RoomCode,.sv100Channel,.sv100RoomItem button,.stChoice').evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node),face=getComputedStyle(node.querySelector(':scope>.svLiquidPane')||node);return {class:node.className,fill:face.backgroundColor,image:face.backgroundImage,shadow:face.boxShadow,border:s.borderWidth,filter:face.backdropFilter,optic:!!node.querySelector(':scope>.svLiquidPane')};}));
  for(const sample of samples){
   const rgba=sample.fill.match(/[\d.]+/g).map(Number);
   assert.deepEqual(rgba.slice(0,3),[255,255,255],sample.class+' must share the clear white material');
   assert(rgba[3]>=.2&&rgba[3]<=.24,'controls keep the shared face at rest and when selected');
   assert.equal(sample.image,'none','controls do not stack a fake highlight');assert.equal(sample.border,'0px','a single inset rim must replace the old outer border: '+sample.class);
   if(!sample.optic)assert(!sample.filter.includes('url('),'dense repeated choices do not allocate SVG graphs');
  }
  assert.equal(await page.locator('.ordinary').evaluate(node=>getComputedStyle(node).borderRadius),'13px','shared material must preserve a component’s shape');
  assert.equal(await page.locator('.partyLinkChoice summary').evaluate(node=>getComputedStyle(node,'::after').content),'"+"','disclosure affordances are functional content');
  assert.equal(await page.locator('.partyLinkChoice summary').evaluate(node=>getComputedStyle(node).borderRadius),'999px','the standalone link choice uses the shared rounded control shape');
  assert.equal(await page.locator('[data-action="new-channel"]').evaluate(node=>getComputedStyle(node,'::after').content),'"New channel"','mobile channel actions must retain their visible labels');
  assert.equal(await page.locator('.sv100RoomItem svg.svLiquidPane__filters,#controlPanel svg.svLiquidPane__filters').count(),0);
  await page.evaluate(()=>document.body.dataset.stGlass='off');
  const off=await page.locator('.ordinary,.sv100Channel,.stChoice').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter})));
  assert(off.every(style=>style.filter==='none'&&!style.fill.startsWith('rgba(')),'selected native controls must also obey solid mode: '+JSON.stringify(off));
  await page.evaluate(()=>document.body.dataset.stGlass='liquid');
  const session=await page.context().newCDPSession(page);await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  const reduced=await page.locator('.ordinary,.sv100Channel,.stChoice').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter})));
  assert(reduced.every(style=>style.filter==='none'&&!style.fill.startsWith('rgba(')),'selected native controls must also obey reduced transparency: '+JSON.stringify(reduced));
 }finally{await browser.close();}
});

test('Navigation uses an even reference face over a dark page',{skip:!available&&'Chromium is not installed'},async()=>{
 const {loadServer}=require('./ui-helpers.cjs'),api=loadServer(),browser=await chromium.launch({headless:true});
 try{
  const html=api.pageShell({active:'account',body:'<main style="height:1000px"></main>'}).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^\"]+)"[^>]*>/g,(tag,url)=>url.startsWith('/assets/')?'<style>'+asset(url.slice(8).split('?')[0])+'</style>':'');
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>route.fulfill({status:200,body:''}));await page.setContent(html);
  await page.addStyleTag({content:'*{animation:none!important;transition:none!important}body.svCleanShell{background:#000!important}.netflixNav :is(.navLeftCluster,.navRightCluster){visibility:hidden!important}'});
  await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
  await page.waitForFunction(()=>document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const bounds=await page.locator('.netflixNav>.svLiquidPane').boundingBox(),shot=(await page.screenshot()).toString('base64');
  const pixels=await page.evaluate(async({shot,bounds:r})=>{
   const img=new Image();img.src='data:image/png;base64,'+shot;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const context=c.getContext('2d');context.drawImage(img,0,0);
   return [.3,.5,.7].map(f=>[...context.getImageData(Math.round(r.x+r.width*f),Math.round(r.y+r.height*.5),1,1).data].slice(0,3));
  },{shot,bounds});
  assert(pixels.every(pixel=>pixel.every(channel=>Math.abs(channel-26)<=1)),'the reference face must be even, without an extra highlight gradient: '+JSON.stringify(pixels));
 }finally{await browser.close();await new Promise(resolve=>api.io.close(resolve));}
});

// Measured from the requested reference: crossed channel gradients under a
// softened 50% neutral interior, with a 3.5% inset and 10-unit RGB dispersion.
function referenceMap(width,height,radius) {
 const inset=Math.min(width,height)*.035;
 return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="x" x1="100%" y1="0%" x2="0%" y2="0%"><stop stop-color="#0000"/><stop offset="1" stop-color="red"/></linearGradient><linearGradient id="y" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="#0000"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="${width}" height="${height}" fill="black"/><rect width="${width}" height="${height}" rx="${radius}" fill="url(#x)"/><rect width="${width}" height="${height}" rx="${radius}" fill="url(#y)" style="mix-blend-mode:screen"/><rect x="${inset}" y="${inset}" width="${width-2*inset}" height="${height-2*inset}" rx="${radius}" fill="hsl(0 0% 50% / .93)" style="filter:blur(7px)"/></svg>`);
}
test('Glass pixels match the observed reference over detailed and dark backdrops',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:800,height:500}});
  for(const scheme of ['light','dark'])for(const [width,height,radius] of [[580,60,24],[180,44,14],[44,44,22]])for(const scene of ['repeating-linear-gradient(37deg,#153351 0 14px,#dfb47f 14px 28px,#bc4366 28px 42px)','#080a0e']){
   await page.goto('about:blank');await page.emulateMedia({colorScheme:scheme});
   await page.setContent('<!doctype html><style>'+asset('liquid-glass/liquid-glass.css')+'body{margin:0;background:'+scene+'}.host{position:absolute;left:90px;top:80px;width:'+width+'px;height:'+height+'px}.host>.svLiquidPane{--sv-glass-radius:'+radius+'px}</style><body class="svCleanShell"><div class="host"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".2"></div></div></body>');
   await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
   await page.waitForFunction(()=>document.querySelector('.svLiquidPane')?.dataset.swiflyRenderer==='svg');
   const clip={x:90,y:80,width,height},actual=(await page.screenshot({clip})).toString('base64');
   await page.evaluate(({map,scheme})=>{
    const pane=document.querySelector('.svLiquidPane');pane.querySelector('feImage').setAttribute('href',map);
    pane.querySelectorAll('feDisplacementMap').forEach((n,i)=>n.setAttribute('scale',-180+i*10));pane.querySelector('feGaussianBlur').setAttribute('stdDeviation','.5');
    pane.style.setProperty('background',scheme==='dark'?'rgba(0,0,0,.2)':'rgba(255,255,255,.2)','important');pane.style.setProperty('box-shadow',scheme==='dark'?'inset 0 0 0 .5px rgba(255,255,255,.1),0 4px 16px rgba(0,0,0,.1),0 8px 24px rgba(0,0,0,.08)':'inset 0 0 0 .5px rgba(255,255,255,.15),0 4px 16px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.04)','important');
   },{map:referenceMap(width,height,radius),scheme});
   const expected=(await page.screenshot({clip})).toString('base64');
   const error=await page.evaluate(async({actual,expected})=>{
    const decode=async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const a=await decode(actual),b=await decode(expected);let sum=0;for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*.75);
   },{actual,expected});
   assert(error<1.5,`${scheme} ${width}x${height} lens differs from the reference by ${error.toFixed(2)} RGB levels per channel`);
  }
 }finally{await browser.close();}
});
