const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath());
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
   const pane=host.querySelector(':scope > .svNavMatchedLens'),a=host.getBoundingClientRect(),b=pane.getBoundingClientRect(),graph=pane.querySelector(':scope > svg').getBoundingClientRect();
   return {nested:host.querySelectorAll('.svNavMatchedLens').length,host:{x:a.x,y:a.y,width:a.width,height:a.height},pane:{x:b.x,y:b.y,width:b.width,height:b.height},graph:{width:graph.width,height:graph.height}};
  }));
  for(const {nested,host,pane,graph}of bounds){
   assert.equal(nested,1,'tab children must share the container lens');
   for(const key of ['x','y','width','height'])assert(Math.abs(host[key]-pane[key])<=2,'a pane must be bounded by its own host, never the page');
   for(const key of ['width','height'])assert(Math.abs(graph[key]-pane[key])<=1,'icon SVG rules must not shrink the optical coordinate system');
  }
  const dispersion=await page.locator('.svNavMatchedLens filter').evaluateAll(filters=>filters.map(filter=>{
   const scales=[...filter.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')));
   return scales.length?Math.max(...scales)-Math.min(...scales):0;
  }));
  assert(dispersion.length&&dispersion.every(value=>value<.75),'color separation must stay below a pixel even over high-contrast chat text');
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

for (const native of [false,true]) test((native?'Safari fallback':'Chromium')+' navigation and prominent actions share one readable neutral surface',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:800},...(native?{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'}:{})}),page=await context.newPage();
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/cinema.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body{margin:0;background:white;color:white}.dsHeroActions{position:absolute;top:200px;left:24px;display:flex;gap:12px}.dsHeroActions>*{height:40px;min-width:40px;padding:0 20px}.dsCardQuickActions{position:absolute;top:300px}.dsMiniBtn{width:32px;height:32px}a{color:white}.svCinemaPage{position:absolute;top:400px;left:24px}.svDetailActions button{height:40px;min-width:44px;padding:0 20px}</style><body class="svCleanShell" data-st-glass="liquid"><header class="topbar" data-sv-liquid-nav><nav class="container nav netflixNav"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".025"></div><div class="navLeftCluster"><b>SWIFLYTV</b><div class="navLinks"><a>Home</a></div></div><button class="svNavButton">Search</button></nav></header><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button><button class="dsIconBtn">+</button></div><div class="svCinemaPage"><div class="svDetailActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Watch party</button><button class="dsIconBtn">+</button></div></div><div class="dsCardQuickActions"><button class="dsMiniBtn">+</button></div><button class="dsRowArrow">Next</button></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelectorAll('.dsHeroActions>.svNavMatchedOptic>.svNavMatchedLens').length===3);
  await page.waitForTimeout(80);
  const state=await page.evaluate(()=>{
   const sample=node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter,shadow:s.boxShadow,border:s.borderWidth,radius:s.borderRadius,before:getComputedStyle(node,'::before').content,after:getComputedStyle(node,'::after').content,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};
   return {nav:sample(document.querySelector('.netflixNav>.svLiquidPane')),actions:[...document.querySelectorAll('.dsHeroActions>button,.svDetailActions>button')].map(host=>({round:host.matches('.svDetailActions .dsIconBtn'),host:sample(host),pane:sample(host.querySelector('.svNavMatchedLens')),hit:host.contains(document.elementFromPoint(host.getBoundingClientRect().x+host.offsetWidth/2,host.getBoundingClientRect().y+host.offsetHeight/2))})),repeat:[...document.querySelectorAll('.dsMiniBtn,.dsRowArrow')].map(sample),graphs:document.querySelectorAll('.svSharedGlassDefinitions,.svWebkitGlassOptics').length};
  });
  const rgba=state.nav.fill.match(/[\d.]+/g).map(Number),alpha=rgba[3]??1;
  assert(alpha>=.6,'white artwork must not wash out the navigation');
  assert.equal(state.nav.image,'none','one material fill must replace the stacked white gradients');
  assert.equal(state.nav.before,'none');assert.equal(state.nav.after,'none','the material edge must not stack another white frame');
  const composite=rgba.slice(0,3).map(c=>(c*alpha+255*(1-alpha))/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  assert(1.05/(composite[0]*.2126+composite[1]*.7152+composite[2]*.0722+.05)>=4.5,'navigation labels must retain readable contrast over white artwork');
  for(const {round,host,pane,hit} of state.actions){
   assert.equal(pane.fill,state.nav.fill,'Play, Details and icon actions use the navigation material');
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

test('Player pages retain the shared readable navigation without control overrides',{skip:!available&&'Chromium is not installed'},async()=>{
 const {loadServer}=require('./ui-helpers.cjs'),api=loadServer(),browser=await chromium.launch({headless:true});
 try{
  const html=api.pageShell({active:'watch',player:true,body:'<main data-player-root><button class="dsPrimaryBtn">Play video</button></main>'});
  assert(!html.includes('/liquid-glass/controls.css'),'the player owns its action surfaces');
  const inline=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^\"]+)"[^>]*>/g,(tag,url)=>url.startsWith('/assets/')?'<style>'+asset(url.slice(8).split('?')[0])+'</style>':'');
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.setContent(inline);
  await page.evaluate(()=>{document.body.dataset.stGlass='liquid';document.body.dataset.svScrolled='true';});
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  assert.equal(await page.locator('.netflixNav>.svLiquidPane').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(12, 15, 20, 0.62)','scrolling keeps the same neutral navigation material on player routes');
  assert.equal(await page.locator('[data-player-root] .svGlassSurface,[data-player-root] .svLiquidPane').count(),0);
 }finally{await browser.close();await new Promise(resolve=>api.io.close(resolve));}
});
