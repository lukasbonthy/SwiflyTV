const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const fixture=path.join(__dirname,'fixtures/glass');
const reference=require('./fixtures/glass/reference.json');
const available=fs.existsSync(chromium.executablePath())||fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/,'chromium_headless_shell-$1/chrome-linux/headless_shell'));
const asset=file=>fs.readFileSync(path.join(__dirname,'../public/liquid-glass',file),'utf8');

// Golden panes use the material measured from ShuttleTV's live navigation
// and hero controls. Their backdrop is synthetic; no movie artwork is stored.
for(const c of reference.cases)test('Glass matches the observed ShuttleTV '+c.name+' lens',{skip:!available&&'Chromium is not installed'},async t=>{
 const browser=await chromium.launch({headless:true});
 try{
  const profile=Number((await browser.version()).split('.')[0])>=155?'chromium-155':'chromium-131';
  const page=await browser.newPage({viewport:{width:600,height:220},colorScheme:'light'});
  await page.setContent('<style>'+asset('liquid-glass.css')+'*{box-sizing:border-box}body.svCleanShell{margin:0;min-height:220px;background:'+reference.background+'!important}.host{position:absolute;left:24px;top:70px;width:'+c.width+'px;height:'+c.height+'px}</style><body class="svCleanShell"><div class="host"><div class="svLiquidPane" data-swifly-glass data-glass-tint="'+c.tint+'" data-glass-radius="'+c.radius+'" data-glass-lens-blur="'+c.blur+'"></div></div></body>');
  await page.addScriptTag({content:asset('liquid-glass.js')});
  await page.waitForFunction(()=>document.querySelector('.svLiquidPane').dataset.swiflyRenderer==='svg');
  const actual=(await page.screenshot({clip:{x:24,y:70,width:c.width,height:c.height}})).toString('base64');
  const expected=fs.readFileSync(path.join(fixture,profile,c.name+'.png')).toString('base64');
  const error=await page.evaluate(async({actual,expected})=>{
   const decode=async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const context=canvas.getContext('2d');context.drawImage(im,0,0);return context.getImageData(0,0,im.width,im.height).data;};
   const a=await decode(actual),b=await decode(expected);let sum=0,count=0;
   for(let i=0;i<a.length;i+=4)for(let channel=0;channel<3;channel++){sum+=Math.abs(a[i+channel]-b[i+channel]);count++;}return sum/count;
  },{actual,expected});
  t.diagnostic('reference pixel error: '+error.toFixed(3));
  assert(error<2,'match the reference lens and quiet rim instead of substituting another glass effect; mean pixel error '+error.toFixed(3));
 }finally{await browser.close();}
});
