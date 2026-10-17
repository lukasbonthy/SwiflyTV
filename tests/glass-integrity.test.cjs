const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath())||fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const styles=['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/cinema.css'];
async function boot(page){for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});}
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
  const page=await browser.newPage({viewport:{width:1024,height:800},...(native?{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'}:{})});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'*{box-sizing:border-box;animation:none!important;transition:none!important}body{margin:0;background:#667}.netflixNav{position:relative;width:580px;height:60px}.dsHeroActions{display:flex;gap:20px;padding:100px 24px}.dsHeroActions button{height:44px;padding:0 24px}</style><body class="svCleanShell" data-st-glass="liquid"><nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".2"></div></nav><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button></div></body>');
  await boot(page);await page.waitForFunction(()=>document.querySelectorAll('.svNavMatchedLens').length===2);
  if(!native)await page.waitForFunction(()=>document.querySelector('.svNavMatchedLens').dataset.swiflyRenderer==='svg');
  const material=await page.locator('.svLiquidPane').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {fill:s.backgroundColor,shadow:s.boxShadow,filter:s.backdropFilter.replace(/url\([^)]+\)/,'url(shared-lens)'),before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content};}));
  const {fill,...nav}=material[0];assert.equal(fill,'rgba(255, 255, 255, 0.2)');
  for(const {fill,...button} of material.slice(1)){assert.equal(fill,'rgba(255, 255, 255, 0)','reference hero actions have a clear face');assert.deepEqual(button,nav,'one shared lens and rim must style nav and buttons');}
 }finally{await browser.close();}
});
