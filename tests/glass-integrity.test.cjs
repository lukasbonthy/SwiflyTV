const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath())||fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const styles=['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/cinema.css','studio/studio.css','party/party.css'];
async function boot(page){for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});}
test('Studio restores its independent selected tab without adding an optical pane',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:650}});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'#controlPanel{position:static!important;display:block!important}.stNavigation{display:flex}</style><body class="svCleanShell" data-st-glass="liquid"><div id="controlPanel"><nav class="stNavigation"><button role="tab" aria-selected="true">Appearance</button><button role="tab" aria-selected="false">Layout</button></nav></div></body>');
  await boot(page);
  assert.equal(await page.locator('#controlPanel .svLiquidPane').count(),0,'Studio owns its button styles and must not acquire duplicated SVG lenses');
  const [selected,normal]=await page.locator('.stNavigation button').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).backgroundImage,color:getComputedStyle(node).color,border:getComputedStyle(node).borderColor})));
  assert.notDeepEqual(selected,normal,'Studio must keep its original distinguishable selected tab');
 }finally{await browser.close();}
});
test('Continue-watching remove actions keep their overlay position and compact size',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:650}});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'.svResumeArtwork{position:relative;width:300px;height:170px;margin:60px}</style><body class="svCleanShell" data-st-glass="liquid"><div class="svResumeArtwork"><button class="svResumeRemove" aria-label="Remove film">×</button></div></body>');
  const before=await page.locator('.svResumeRemove').boundingBox();await boot(page);
  await page.waitForFunction(()=>document.querySelector('.svResumeRemove>.svLiquidPane')?.dataset.swiflyRenderer==='svg');
  assert.equal(await page.locator('.svResumeRemove').evaluate(node=>getComputedStyle(node).position),'absolute');
  assert.deepEqual(await page.locator('.svResumeRemove').boundingBox(),before,'adding glass must not shift overlay controls');
 }finally{await browser.close();}
});
test('Party movie choices retain fallback artwork and flexible title labels with glass',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:650}});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'.svPartyHub{padding:24px!important}</style><body class="svCleanShell" data-st-glass="liquid"><main class="svPartyHub"><div class="partyMovieResults"><button><span data-art><svg viewBox="0 0 24 24"></svg></span><span data-title><b>A film title that needs to wrap in a narrow movie picker</b><small>2026</small></span><i>+</i></button></div></main></body>');
  const before=await page.locator('[data-art]').boundingBox();await boot(page);
  await page.waitForFunction(()=>document.querySelector('.partyMovieResults .svLiquidPane')?.dataset.swiflyRenderer==='svg');
  const after=await page.locator('[data-art]').boundingBox();assert.equal(after.width,before.width);assert.equal(after.height,before.height);
  assert.equal(await page.locator('[data-title]').evaluate(node=>getComputedStyle(node).minWidth),'0px');
 }finally{await browser.close();}
});
test('Glass keeps the reference filter and field inside each actual control',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:420,height:650}});
  await page.setContent('<!doctype html><style>'+asset('liquid-glass/liquid-glass.css')+'.host{position:relative;width:360px;height:60px}.small{width:44px;height:44px}</style><body class="svCleanShell"><div class="host"><div class="svLiquidPane" data-swifly-glass></div></div><div class="host small"><div class="svLiquidPane" data-swifly-glass></div></div></body>');
  await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
  await page.waitForFunction(()=>document.querySelectorAll('[data-swifly-renderer="svg"]').length===2);
  const fields=await page.locator('.svLiquidPane').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,scales:[...n.querySelectorAll('feDisplacementMap')].map(x=>Number(x.getAttribute('scale')))})));
  for(const field of fields){assert.deepEqual(field.scales,[-180,-170,-160],'controls retain the measured channel depth');assert(field.width>0&&field.height>0);}
  assert(await page.locator('.svLiquidPane filter').evaluateAll(nodes=>nodes.every(n=>n.getAttribute('x')==='0%'&&n.getAttribute('y')==='0%'&&n.getAttribute('width')==='100%'&&n.getAttribute('height')==='100%')),'filter bounds must match their pane, without an enlarged sampler');
 }finally{await browser.close();}
});

for(const native of [false,true])test((native?'Native':'Refractive')+' button material matches navigation without an extra outline',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1400},...(native?{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'}:{})});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'*{box-sizing:border-box;animation:none!important;transition:none!important}body{margin:0;background:#667}.netflixNav{position:relative;width:580px;height:60px}.dsHeroActions{display:flex;gap:20px;padding:100px 24px}.dsHeroActions button{height:44px;padding:0 24px}#controlPanel{position:static!important;display:block!important;opacity:1!important;width:400px!important;min-height:0!important;height:auto!important;max-height:none!important}.svPartyHub{padding:0!important;min-height:0!important}.dsCardQuickActions{position:static!important;display:flex!important;opacity:1!important}.sampleActions{display:flex;align-items:center;gap:12px}</style><body class="svCleanShell" data-st-glass="liquid"><nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".2"></div></nav><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button></div><div class="sampleActions"><a class="dsRowBtn">View all</a><button class="dsRowArrow">Next</button><div class="dsCardQuickActions"><button class="dsMiniBtn">Save</button></div><nav class="pagination"><a>2</a></nav><div class="dsEpisodeChips"><a>Episode</a></div></div><section id="controlPanel"><button class="stChoice styleBtn">Appearance</button></section><main class="svPartyHub"><button class="sv100Channel">General</button><div class="sv100RoomItem"><button class="partySecondaryBtn">Join</button></div><div class="partyMovieResults"><button>Choose film</button></div></main></body>');
  await boot(page);await page.waitForFunction(()=>document.querySelectorAll('.svNavMatchedLens').length===10);
  assert.equal(await page.locator('#controlPanel .svLiquidPane').count(),0,'Studio keeps its original buttons');
  if(!native)await page.waitForFunction(()=>[...document.querySelectorAll('.svNavMatchedLens')].every(p=>p.dataset.swiflyRenderer==='svg'));
  const material=await page.locator('.svLiquidPane').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {fill:s.backgroundColor,shadow:s.boxShadow,filter:s.backdropFilter.replace(/url\([^)]+\)/,'url(shared-lens)'),before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content};}));
  const {fill,...nav}=material[0];assert.equal(fill,'rgba(255, 255, 255, 0.2)');
  for(const {fill,...button} of material.slice(1)){assert.equal(fill,'rgba(255, 255, 255, 0.2)','all action families must share the navigation face');assert.deepEqual(button,nav,'one shared lens and rim must style nav and buttons');}
 }finally{await browser.close();}
});
