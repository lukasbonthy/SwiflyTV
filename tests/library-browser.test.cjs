'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available=fs.existsSync(executablePath||chromium.executablePath());
let server,browser,origin;
before(async()=>{
 if(!available)return;
 const css=['base.css','clean.css','finish.css','polish.css','cinema.css','mobile.css','library.css'].map(file=>fs.readFileSync(path.join(__dirname,'../public/clean',file),'utf8')).join('\n');
 const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style>'+['library-state.js','continue.js','library-page.js'].map(file=>'<script defer src="/assets/'+file+'"></script>').join('')+'</head><body class="svCleanShell"><main data-library-page></main></body></html>';
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(/^\/assets\/(?:library-state|continue|library-page)\.js$/.test(pathname)){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'../public/clean',pathname.split('/').pop())));return;}
  res.setHeader('content-type','text/html');res.end(html);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}});
for(const [label,width,height]of [['desktop',1440,1000],['wide desktop',2560,1440],['mobile',390,844],['narrow mobile',320,740]])test('Real '+label+' List controls maintain folders, filters and profile isolation',{skip:!available&&'Chromium is not installed'},async()=>{
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 try{
  await context.addInitScript(()=>{
   localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'},{id:'second',name:'Second'}]));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));
   localStorage.setItem('movieverse.watchlist',JSON.stringify([{id:'42',type:'movie',title:'A quiet evening',year:'2026',rating:'8.2'},{id:'101',type:'tv',title:'A good series',year:'2025',rating:'8.6'}]));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/my-list');await page.waitForSelector('[data-library-card]');
  if(width>=1440)assert((await page.locator('[data-library-card]').first().boundingBox()).width>=200,'Rich library cards should retain readable action widths on desktop');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('select[data-library-type]').selectOption('tv');assert.equal(await page.locator('[data-library-card]').count(),1);
  await page.locator('[data-library-folder-open]').click();await page.locator('[data-library-folder-form] input').fill('Friday');await page.locator('[data-library-folder-form] button[type=submit]').click();
  const folder=await page.evaluate(()=>SwiflyLibrary.read().folders[0]);assert(folder.id);
  await page.locator('.svLibraryFolderMenu summary').click();await page.locator('[data-library-member]').check();await page.locator('[data-library-folder]').selectOption(folder.id);assert.equal(await page.locator('[data-library-card]').count(),1);
  await page.locator('[data-library-folder-rename]').click();await page.locator('[data-library-folder-form] input').fill('Weekend');await page.locator('[data-library-folder-form] button[type=submit]').click();assert.equal(await page.evaluate(()=>SwiflyLibrary.read().folders[0].name),'Weekend');
  await page.locator('[data-library-mark-key]').click();await page.locator('[data-library-tab="completed"]').click();assert.equal(await page.locator('[data-library-card]').count(),1);assert.equal(await page.locator('.svLibraryWatchedBadge').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'second',name:'Second'}));document.dispatchEvent(new Event('swifly:profile-changed'));});assert.equal(await page.locator('[data-library-card]').count(),0);assert.equal(await page.evaluate(()=>SwiflyLibrary.read().folders.length),0);assert(!(await page.locator('main').textContent()).includes('A good series'));
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
