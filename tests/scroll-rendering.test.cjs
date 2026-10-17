'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

test('Chromium wheels scroll at native browser speed without main-thread scrollTo writes', {skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  await page.setContent('<!doctype html><style>html{overflow-y:auto}body{margin:0;min-height:6800px;background:#111}.dsHero{height:900px}.svCatalogRow{height:400px}</style><body class="svCleanShell"><main class="dsHero"></main><section class="svCatalogRow"></section><section class="svCatalogRow"></section></body>');
  await page.evaluate(()=>{
    window.__wheelSamples=[];window.__scrollWrites=0;
    const native=window.scrollTo.bind(window);
    window.scrollTo=(...args)=>{window.__scrollWrites++;return native(...args);};
    window.addEventListener('wheel',event=>window.__wheelSamples.push(event.defaultPrevented),{passive:true});
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public/clean/motion.js'),'utf8')});
  await page.mouse.move(560,300);
  for(let i=0;i<4;i++)await page.mouse.wheel(0,160);
  await page.waitForFunction(()=>window.scrollY>=400);
  const result=await page.evaluate(()=>({y:window.scrollY,writes:window.__scrollWrites,events:window.__wheelSamples,frames:document.querySelector('.dsHero').style.getPropertyValue('--sv-hero-offset')}));
  assert(result.y>=400,'Chrome itself must perform the wheel movement');
  assert.equal(result.writes,0,'no JavaScript wheel-to-scroll writes in the rendering pipeline');
  assert(result.events.length>=1&&result.events.every(v=>v===false),'even coalesced Chromium wheel events stay uncanceled: '+JSON.stringify(result.events));
  assert.equal(result.frames,'','masked hero artwork remains static during wheel input');
 }finally{await browser.close();}
});
