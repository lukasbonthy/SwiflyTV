'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const available=fs.existsSync(chromium.executablePath()) ||
  fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

test('Chromium keeps premium wheel easing without a main-thread animation loop', {skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  await page.setContent('<!doctype html><style>html{overflow-y:auto}body{margin:0;min-height:6800px;background:#111}.dsHero{height:900px}.svCatalogRow{height:400px}</style><body class="svCleanShell"><main class="dsHero"></main><section class="svCatalogRow"></section><section class="svCatalogRow"></section></body>');
  await page.evaluate(()=>{
    window.__wheelSamples=[];window.__scrollWrites=[];
    const native=window.scrollTo.bind(window);
    window.scrollTo=(...args)=>{window.__scrollWrites.push(args[0]);return native(...args);};
    window.addEventListener('wheel',event=>window.__wheelSamples.push(event.defaultPrevented),{passive:true});
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public/clean/motion.js'),'utf8')});
  await page.mouse.move(560,300);
  for(let i=0;i<4;i++)await page.mouse.wheel(0,160);
  await page.waitForFunction(()=>window.scrollY>=400);
  const result=await page.evaluate(()=>({y:window.scrollY,writes:window.__scrollWrites,events:window.__wheelSamples,frames:document.querySelector('.dsHero').style.getPropertyValue('--sv-hero-offset')}));
  assert(result.y>=400,'Chrome itself must perform the wheel movement');
  assert(result.writes.length>=1,'mouse-wheel pulses should trigger the premium browser smoothing');
  assert(result.writes.every(call=>call.behavior==='smooth'),'the compositor gets native eased destinations');
  assert(result.events.length>=1&&result.events.every(v=>v===true),'mouse wheel notches are owned by the native-smooth route: '+JSON.stringify(result.events));
  assert.equal(result.frames,'','masked hero artwork remains static during wheel input');
  const trackpad=await page.evaluate(()=>{
    const element=document.querySelector('.dsHero');
    const event=new WheelEvent('wheel',{deltaY:2.5,deltaMode:0,bubbles:true,cancelable:true});
    const count=window.__scrollWrites.length;
    element.dispatchEvent(event);
    return {canceled:event.defaultPrevented,newWrites:window.__scrollWrites.length-count};
  });
  assert.equal(trackpad.canceled,false,'precision events must not be intercepted');
  assert.equal(trackpad.newWrites,0,'precision events never dispatch programmatic scroll commands');
 }finally{await browser.close();}
});
