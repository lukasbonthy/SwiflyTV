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
   assert(graph,'supported segmented bars share an actual rounded lens');assert.equal(scale,180,'shared bars keep the measured lens depth');
  }
  await page.waitForFunction(()=>document.querySelector('.dsHeroActions .svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  const dispersion=await page.locator('.svNavMatchedLens filter').evaluateAll(filters=>filters.map(filter=>({
   scales:[...filter.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')))
  })));
  assert(dispersion.length>3,'hero and segmented surfaces retain real refraction');
  assert(dispersion.every(field=>JSON.stringify(field.scales)===JSON.stringify([-180,-170,-160])),
    'glass uses the measured three-channel field without stacked host filters');
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
  assert.equal(alpha,.2,'navigation keeps the backdrop visible instead of a milky fill');
  assert.deepEqual(rgba.slice(0,3),scheme==='dark'?[0,0,0]:[255,255,255],'the face follows the device color scheme');
  assert.equal(state.nav.image,'none','the measured material gets its reflection from the backdrop');
  assert.equal(state.nav.before,'none','no milky painted highlight on the glass');assert.equal(state.nav.after,'none','the lens edge is handled by its one quiet shadow');
  assert.notEqual(await page.locator('.netflixNav .navLinks>a').evaluate(node=>getComputedStyle(node).textShadow),'none','labels retain a local shadow over bright art without obscuring the whole pane');
  for(const {round,hero,host,pane,hit} of state.actions){
   const actionColor=pane.fill.match(/[\d.]+/g).map(Number);
   assert.deepEqual(actionColor.slice(0,3),rgba.slice(0,3),'buttons and navigation share neutral material colors');assert.equal(actionColor[3],.2,'all actions retain the navigation face');
   assert.equal(pane.shadow,state.nav.shadow,'buttons do not add a second brighter rim');
   assert.equal(pane.image,state.nav.image,'buttons use the exact same clear face treatment as navigation');
   assert.equal(pane.filter.replace(/url\([^)]+\)/,'url(shared-lens)'),state.nav.filter.replace(/url\([^)]+\)/,'url(shared-lens)'),'buttons share the navigation filter treatment');
   assert.equal(host.shadow,'none','host must not draw a second glass border');
   assert.equal(host.border,'0px');assert.equal(host.image,'none','component styles must not add a pale fill over the shared material');
   assert.equal(host.before,'none');assert.equal(host.after,'none');
   assert(host.rect.width>=44&&host.rect.height>=44);assert(hit);if(round)assert.equal(host.radius,'50%','round detail actions retain the shared control shape');
   for(const key of ['x','y','width','height'])assert(Math.abs(host.rect[key]-pane.rect[key])<=1,'buttons use the correctly bounded navbar glass, not an enlarged sampler');
   if(native)assert(!pane.filter.includes('url('),'Safari uses only native backdrop blur');
  }
  const reflections=await page.locator('.dsHeroActions>.dsPrimaryBtn>.svNavMatchedLens').evaluate(node=>({
   near:getComputedStyle(node,'::before').backgroundImage,
   edge:getComputedStyle(node,'::after').backgroundImage,
   backdrop:getComputedStyle(node).backdropFilter,
   clip:getComputedStyle(node).borderRadius
  }));
  assert.equal(reflections.near,'none','buttons do not add a painted face');
  assert.equal(reflections.edge,'none','buttons do not add another outline');
  if(native)assert(!reflections.backdrop.includes('url('),'native fallback keeps the shared browser blur');
  else assert.match(reflections.backdrop,/url\(/,'Chromium controls retain real refraction');
  assert.notEqual(reflections.clip,'0px','the same glass pane clips to the actual button shape');
  assert(state.repeat.every(control=>!control.filter.includes('url(')),'repeated action hosts must not stack another filter');
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

test('Standalone and watchroom player menus share one stationary nav lens while scrolling',{skip:!available&&'Chromium is not installed'},async()=>{
 const {playerMarkup}=require('../ui/player.js'),browser=await chromium.launch({headless:true});
 try{for(const embedded of [false,true]){
  const page=await browser.newPage({viewport:{width:900,height:700}});
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','player/player.css','liquid-glass/surfaces.css','liquid-glass/controls.css'].map(asset).join('\n')+'body{margin:0}.svPlayerStage{height:500px}.svPlayerPopoverBody{height:200px!important;max-height:200px!important}</style><body class="svCleanShell" data-st-glass="liquid">'+(embedded?'<main class="svPartyHub">':'')+playerMarkup({id:1,title:'Test film',embedded})+(embedded?'</main>':'')+'</body>');
  await page.evaluate(()=>{
   document.querySelector('[data-player-controls]').hidden=false;
   const settings=document.querySelector('[data-player-settings]');settings.open=true;
   const menu=settings.querySelector('[popover]');menu.style.setProperty('--player-menu-top','60px');menu.style.setProperty('--player-menu-left','40px');menu.showPopover();
  });
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  const menu=page.locator('.svPlayerSettingsBody');assert(await menu.evaluate(node=>node.classList.contains('svGlassSurface')),'menus inside the Party Hub must also receive the shared surface');await page.waitForFunction(()=>document.querySelector('.svPlayerSettingsBody').dataset.swiflyRenderer==='svg');await page.waitForTimeout(220);
  assert.equal(await menu.locator(':scope>svg.svLiquidPane__filters').count(),1,'one menu graph owns the whole surface');
  assert.equal(await menu.locator('.svLiquidPane').count(),0,'menu choices must not stack nested lenses');
  const before=await menu.boundingBox();
  const style=await menu.evaluate(node=>({position:getComputedStyle(node).position,fill:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter,overflow:getComputedStyle(node).overflow}));
  assert.equal(style.position,'fixed');assert.equal(style.fill,'rgba(255, 255, 255, 0.2)');assert.match(style.filter,/url\(/);assert.equal(style.overflow,'auto');
  await menu.evaluate(node=>node.scrollTop=node.scrollHeight);await page.waitForTimeout(30);
  assert(await menu.evaluate(node=>node.scrollTop>0),'settings remain scrollable');assert.deepEqual(await menu.boundingBox(),before,'scrolling content does not move its glass surface');
  await page.selectOption('[data-player-speed]','1.5');assert.equal(await page.locator('[data-player-speed]').inputValue(),'1.5');
  await menu.evaluate(node=>node.hidePopover());await page.waitForFunction(()=>!document.querySelector('.svPlayerSettingsBody>svg.svLiquidPane__filters'));
  await page.close();
 }}finally{await browser.close();}
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
  // Check the finished material, not the intentional dark fallback while
  // Chromium is still decoding the first displacement image.
  await page.waitForFunction(()=>document.querySelector('.ordinary .svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  const samples=await page.locator('.ordinary,.dsAccountActions a,.dsMiniBtn,#sv103RoomCode,.sv100Channel,.sv100RoomItem button,.stChoice').evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node),face=getComputedStyle(node.querySelector(':scope>.svLiquidPane')||node);return {class:node.className,fill:face.backgroundColor,image:face.backgroundImage,shadow:face.boxShadow,border:s.borderWidth,filter:face.backdropFilter,optic:!!node.querySelector(':scope>.svLiquidPane')};}));
  for(const sample of samples){
   const rgba=sample.fill.match(/[\d.]+/g).map(Number);
   assert.deepEqual(rgba.slice(0,3),[255,255,255],sample.class+' must share the clear white material');
   assert(rgba[3]>=.2&&rgba[3]<=.24,'every control family keeps the shared navigation fill');
   assert.equal(sample.image,'none','native controls do not add a painted reflection');assert.equal(sample.border,'0px','a single inset rim must replace the old outer border: '+sample.class);
   if(!sample.optic)assert(!sample.filter.includes('url('),'dense repeated choices do not allocate SVG graphs');
  }
  assert.equal(await page.locator('.ordinary').evaluate(node=>getComputedStyle(node).borderRadius),'13px','shared material must preserve a component’s shape');
  assert.equal(await page.locator('.partyLinkChoice summary').evaluate(node=>getComputedStyle(node,'::after').content),'"+"','disclosure affordances are functional content');
  assert.equal(await page.locator('.partyLinkChoice summary').evaluate(node=>getComputedStyle(node).borderRadius),'999px','the standalone link choice uses the shared rounded control shape');
  assert.equal(await page.locator('[data-action="new-channel"]').evaluate(node=>getComputedStyle(node,'::after').content),'"New channel"','mobile channel actions must retain their visible labels');
  assert.equal(await page.locator('.sv100RoomItem .svLiquidPane,#controlPanel .svLiquidPane').count(),2,'directory and settings actions have real panes');
  await page.evaluate(()=>document.body.dataset.stGlass='off');
  const off=await page.locator('.ordinary,.sv100Channel,.stChoice').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter})));
  assert(off.every(style=>style.filter==='none'&&!style.fill.startsWith('rgba(')),'selected native controls must also obey solid mode: '+JSON.stringify(off));
  await page.evaluate(()=>document.body.dataset.stGlass='liquid');
  const session=await page.context().newCDPSession(page);await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  const reduced=await page.locator('.ordinary,.sv100Channel,.stChoice').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).backgroundColor,filter:getComputedStyle(node).backdropFilter})));
  assert(reduced.every(style=>style.filter==='none'&&!style.fill.startsWith('rgba(')),'selected native controls must also obey reduced transparency: '+JSON.stringify(reduced));
 }finally{await browser.close();}
});

test('Navigation keeps a continuous clear coating over a dark page',{skip:!available&&'Chromium is not installed'},async()=>{
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
  assert(pixels.every(pixel=>pixel.every(channel=>Math.abs(channel-51)<=1)),'the shared reflection must remain translucent over a dark page: '+JSON.stringify(pixels));
  assert(pixels.every(pixel=>Math.max(...pixel)-Math.min(...pixel)<=1),'the coating must stay neutral: '+JSON.stringify(pixels));
 }finally{await browser.close();await new Promise(resolve=>api.io.close(resolve));}
});

test('Hero button visibly bends a diagonal backdrop instead of only drawing a translucent pill',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:420,height:220}});
  await page.setContent('<!doctype html><style>'+['liquid-glass/liquid-glass.css','clean/clean.css','liquid-glass/surfaces.css','liquid-glass/controls.css'].map(asset).join('\n')+
   '*{box-sizing:border-box}body.svCleanShell{margin:0;background:repeating-linear-gradient(31deg,#737373 0 10px,#353535 10px 16px)!important;min-height:220px}body::before{display:none}.dsHeroActions{position:absolute;left:120px;top:88px}.dsHeroActions button{width:96px;height:44px}</style><body class="svCleanShell" data-st-glass="liquid"><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button></div></body>');
  for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});
  await page.waitForFunction(()=>document.querySelector('.dsHeroActions .svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  const box=await page.locator('.dsHeroActions button').boundingBox();
  const distorted=(await page.screenshot({clip:box})).toString('base64');
  await page.locator('.dsHeroActions .svNavMatchedLens').evaluate(pane=>pane.querySelectorAll('feDisplacementMap').forEach(map=>map.setAttribute('scale','0')));
  const flat=(await page.screenshot({clip:box})).toString('base64');
  const error=await page.evaluate(async({distorted,flat})=>{
    const decode=async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,c.width,c.height).data;};
    const a=await decode(distorted),b=await decode(flat);let sum=0,count=0;
    for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++){sum+=Math.abs(a[i+c]-b[i+c]);count++;}
    return sum/count;
  },{distorted,flat});
  assert(error>1.2,'real button refraction must measurably bend the line behind it; RGB delta was '+error.toFixed(2));
 }finally{await browser.close();}
});
