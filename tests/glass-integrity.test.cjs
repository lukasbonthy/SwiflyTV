const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath())||fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const styles=['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/cinema.css'];
async function boot(page){for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js'])await page.addScriptTag({content:asset(file)});}
async function pixels(page,shot){return page.evaluate(async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let colorful=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>8)colorful++;return {colorful,total:data.length/4};},shot.toString('base64'));}

test('Glass preserves grayscale without inventing rainbow seams',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:420,height:650},colorScheme:'light'});
  await page.setContent('<!doctype html><style>'+asset('liquid-glass/liquid-glass.css')+'*{box-sizing:border-box}body{margin:0;background:repeating-linear-gradient(37deg,#151515 0 6px,#eee 6px 12px);color:white}.lens{position:absolute;left:24px;top:70px;width:370px;height:60px}.svLiquidPane{--sv-glass-radius:26px}.words{position:absolute;left:30px;top:150px;font:24px sans-serif}</style><body class="svCleanShell"><div class="words">Continue watching</div><div class="lens"><div class="svLiquidPane" data-swifly-glass></div></div></body>');
  await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
  await page.waitForFunction(()=>document.querySelector('.svLiquidPane').dataset.swiflyRenderer==='svg');
  const sample=await pixels(page,await page.screenshot({clip:{x:24,y:70,width:370,height:60}}));
  assert.equal(sample.colorful,0,'a neutral scene must not acquire RGB streaks: '+JSON.stringify(sample));
 }finally{await browser.close();}
});

test('Glass cannot pull a distant row of text into a short control',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:420,height:650}});
  await page.setContent('<!doctype html><style>'+asset('liquid-glass/liquid-glass.css')+'.host{position:relative;width:360px;height:60px}.small{width:44px;height:44px}</style><body class="svCleanShell"><div class="host"><div class="svLiquidPane" data-swifly-glass></div></div><div class="host small"><div class="svLiquidPane" data-swifly-glass></div></div></body>');
  await page.addScriptTag({content:asset('liquid-glass/liquid-glass.js')});
  await page.waitForFunction(()=>document.querySelectorAll('[data-swifly-renderer="svg"]').length===2);
  const fields=await page.locator('.svLiquidPane').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,scales:[...n.querySelectorAll('feDisplacementMap')].map(x=>Number(x.getAttribute('scale')))})));
  for(const field of fields){assert(field.scales.length);for(const scale of field.scales)assert(Math.abs(scale)/2<=Math.min(field.width,field.height)*.1,'maximum sample distance must stay within 10% of the short side: '+JSON.stringify(field));}
 }finally{await browser.close();}
});

for(const native of [false,true])test((native?'Native':'Refractive')+' button material matches navigation without an extra outline',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:800},...(native?{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'}:{})});
  await page.setContent('<!doctype html><style>'+styles.map(asset).join('\n')+'*{box-sizing:border-box;animation:none!important;transition:none!important}body{margin:0;background:#667}.netflixNav{position:relative;width:580px;height:60px}.dsHeroActions{display:flex;gap:20px;padding:100px 24px}.dsHeroActions button{height:44px;padding:0 24px}</style><body class="svCleanShell" data-st-glass="liquid"><nav class="netflixNav"><div class="svLiquidPane" data-swifly-glass data-glass-tint=".14"></div></nav><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><button class="dsSecondaryBtn">Details</button></div></body>');
  await boot(page);await page.waitForFunction(()=>document.querySelectorAll('.svNavMatchedLens').length===2);
  if(!native)await page.waitForFunction(()=>document.querySelector('.svNavMatchedLens').dataset.swiflyRenderer==='svg');
  const material=await page.locator('.svLiquidPane').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {fill:s.backgroundColor,shadow:s.boxShadow,filter:s.backdropFilter.replace(/url\([^)]+\)/,'url(shared-lens)'),before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content};}));
  for(const button of material.slice(1))assert.deepEqual(button,material[0],'one shared material must style nav and buttons');
 }finally{await browser.close();}
});
