'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright-core');
const {settingsMarkup}=require('../ui/settings');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH||chromium.executablePath();
const skip=!fs.existsSync(executablePath)&&'Chromium is not installed';
let server,browser,base;
before(async()=>{
 if(skip)return;const app=express();app.use('/clean',express.static(path.join(__dirname,'../public/clean')));app.get('/api/trakt/status',(req,res)=>res.json({configured:false,linked:false}));
 app.get('/settings',(req,res)=>res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#08080b;color:#f2f2f5;font-family:Arial,sans-serif}.svFeatureIcon{width:18px;height:18px}</style><link rel="stylesheet" href="/clean/settings.css"></head><body class="svCleanShell">'+settingsMarkup()+'<script>window.SwiflyAccount={user:{id:"fixture"},ready:Promise.resolve({user:{id:"fixture"}})};window.SwiflyLibrary={ready:Promise.resolve(),preferences:()=>({spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:"grid",episodeSort:"oldest"}),savePreferences:()=>true};</script><script src="/clean/settings.js"></script></body></html>'));
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
for(const viewport of [{width:1440,height:1100},{width:390,height:844}])test('Settings fits '+viewport.width+'px and exposes usable preference controls',{skip},async()=>{
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/settings');await page.waitForFunction(()=>document.querySelector('[data-trakt-status]').textContent.includes('not configured'));
 assert.equal(await page.locator('h1').innerText(),'Your settings.');assert.equal(await page.getByRole('checkbox').count(),5);assert.equal(await page.locator('[data-trakt-link]').isDisabled(),true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings must not scroll horizontally');
 const checkbox=page.locator('[data-preference="spoilerMode"]');await checkbox.focus();assert.equal(await checkbox.evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Space');assert.equal(await checkbox.isChecked(),true);assert.match(await page.locator('[data-preference-status]').innerText(),/saved/i);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/swifly-settings-'+viewport.width+'.png',fullPage:true});await page.close();
});
