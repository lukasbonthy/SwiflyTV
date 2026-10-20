'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const asset=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const available=fs.existsSync(chromium.executablePath())||fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const styles=['liquid-glass/liquid-glass.css','clean/clean.css','clean/details.css','clean/cinema.css','clean/details-premium.css','liquid-glass/surfaces.css','liquid-glass/controls.css','clean/performance.css'].map(asset).join('\n');
const fragment='<article class="svTitleDetails"><div class="svDetailHero" style="background:repeating-linear-gradient(31deg,#b5bed0 0 14px,#17212a 14px 24px)"><div class="svDetailIdentity"><h1>Fluid motion</h1><div class="svDetailActions"><a class="dsPrimaryBtn" href="/watch/movie/101">Play</a><button class="dsIconBtn" aria-label="Save movie">+</button></div></div></div><section class="svDetailSection"><h2>Story</h2><p>Movie details stay readable throughout the entrance.</p></section></article>';

async function fixture(browser,cssFallback=false){
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('/movie/101')?fragment:'<!doctype html><style>'+styles+'*{box-sizing:border-box}body{margin:0;background:#17212a;color:white}main{padding:100px 20px;min-height:2200px}.svDetailIdentity{position:absolute;bottom:45px;left:45px}.svDetailActions{display:flex;gap:12px}</style><body class="svCleanShell" data-st-glass="liquid"><main><a id="open" href="/movie/101">Open details</a></main></body>'}));
 await page.goto('http://motion.fixture/');
 if(cssFallback)await page.evaluate(()=>{window.nativeAnimate=Element.prototype.animate;Element.prototype.animate=undefined;});
 for(const file of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js','clean/details.js'])await page.addScriptTag({content:asset(file)});
 return page;
}

for(const cssFallback of [false,true])test((cssFallback?'CSS fallback':'Native animation')+' detail movement does not relayout the sheet on every frame',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await fixture(browser,cssFallback),cdp=await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.evaluate(async()=>{
   const opening=window.SwiflyDetails.open('/movie/101',document.getElementById('open'));
   const dialog=document.querySelector('dialog');
   const animation=dialog.getAnimations().find(item=>item.effect.target===dialog);
   window.entryFrames=animation.effect.getKeyframes();window.entryTiming=animation.effect.getTiming();
   animation.finish();
   await opening;
  });
  await page.waitForFunction(()=>document.querySelector('dialog')?.dataset.svDetailState==='open');
  await page.waitForFunction(()=>document.querySelector('.svDetailActions .svNavMatchedLens')?.dataset.swiflyRenderer==='svg');
  // Replay the actual browser-resolved entry with a deterministic clock, so
  // this checks layout work rather than the speed of the CI runner's CPU.
  await page.evaluate(()=>{
   const dialog=document.querySelector('dialog'),animate=window.nativeAnimate||Element.prototype.animate;
   dialog.dataset.svDetailState='opening';
   window.probeAnimation=animate.call(dialog,entryFrames,{...entryTiming,duration:1000,fill:'both'});
   probeAnimation.pause();probeAnimation.currentTime=0;dialog.getBoundingClientRect();
  });
  const before=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='LayoutCount').value;
  const positions=await page.evaluate(()=>{
   const dialog=document.querySelector('dialog'),positions=[];
   for(const time of [100,200,300,400,500,600,700,800,900]){probeAnimation.currentTime=time;positions.push(dialog.getBoundingClientRect().top);}
   probeAnimation.currentTime=650;dialog.getBoundingClientRect();return positions;
  });
  const after=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='LayoutCount').value;
  assert(positions[0]>positions.at(-1)+10,'The sheet must actually rise, rather than disabling its animation');
  assert(after-before<=1,'Moving an already-laid-out sheet must not trigger layout at every sample: '+(after-before));
  // Slow a genuinely running animation until subpixel motion is negligible
  // between screenshots. Pausing the layer can hide compositor-only bugs.
  await page.evaluate(async()=>{probeAnimation.effect.updateTiming({duration:100000000});probeAnimation.currentTime=65000000;probeAnimation.play();await probeAnimation.ready;});
  const running=await page.evaluate(()=>({state:probeAnimation.playState,pending:probeAnimation.pending}));
  assert.deepEqual(running,{state:'running',pending:false});
  const pane=page.locator('.svDetailActions .svNavMatchedLens').first(),box=await pane.boundingBox();
  const refracted=(await page.screenshot({clip:box})).toString('base64');
  await pane.evaluate(node=>node.querySelectorAll('feDisplacementMap').forEach(map=>map.setAttribute('scale','0')));
  const flat=(await page.screenshot({clip:box})).toString('base64');
  const delta=await page.evaluate(async({refracted,flat})=>{
   const pixels=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;};
   const a=await pixels(refracted),b=await pixels(flat);let sum=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)sum+=Math.abs(a[i+j]-b[i+j]);return sum/(a.length*.75);
  },{refracted,flat});
  await page.evaluate(()=>{probeAnimation.cancel();document.querySelector('dialog').dataset.svDetailState='open';});
  assert(delta>1.2,'The moving Play button must retain real visible refraction: '+delta);
 }finally{await browser.close();}
});

test('Preparing page reveals batches geometry before changing section styles',{skip:!available&&'Chromium is not installed'},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  await page.setContent('<!doctype html><style>'+asset('clean/motion.css')+'body{margin:0}main{padding-top:1600px}section{height:300px}</style><body class="svCleanShell"><main></main></body>');
  await page.addScriptTag({content:asset('clean/motion.js')});
  await page.evaluate(()=>{
   const root=document.querySelector('main');
   for(let index=0;index<12;index++){const section=document.createElement('section');section.dataset.cinemaReveal='';section.textContent='Collection '+index;root.append(section);}
   root.getBoundingClientRect();
  });
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  // Freeze animation time so compositor frames between CDP messages do not
  // count as reveal-registration work on a busy CI runner.
  await cdp.send('Emulation.setVirtualTimePolicy',{policy:'pause'});
  const before=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='RecalcStyleCount').value;
  const result=await page.evaluate(()=>{
   const root=document.querySelector('main'),nativeBox=Element.prototype.getBoundingClientRect;let readsAfterWrites=0;
   Element.prototype.getBoundingClientRect=function(){
    if(this.matches('[data-cinema-reveal]')&&root.querySelector('.svMotionReveal'))readsAfterWrites++;
    return nativeBox.call(this);
   };
   try{SwiflyMotion.refresh(root);root.getBoundingClientRect();return {count:root.querySelectorAll('.svMotionReveal').length,readsAfterWrites};}
   finally{Element.prototype.getBoundingClientRect=nativeBox;}
  });
  const after=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='RecalcStyleCount').value;
  await cdp.send('Emulation.setVirtualTimePolicy',{policy:'advance'});
  assert.equal(result.count,12,'Offscreen sections retain their entrance animations');
  assert.equal(result.readsAfterWrites,0,'A reveal style change must not force the next section geometry read to flush styles');
  // Allow transition setup passes; the cost must stay below a pass per section.
  assert(after-before<=4,'Registering reveals must not flush styles once per section: '+(after-before));
 }finally{await browser.close();}
});
