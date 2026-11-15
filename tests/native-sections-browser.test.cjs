'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const fixtureRoot=path.join(__dirname,'fixtures/native-catalog'),titles=require('./fixtures/native-catalog/titles.json');
let api,browser,origin;
function movies(page=1){return Array.from({length:18},(_,index)=>{const row=titles[index%titles.length];return{id:Number(row.id)+(page-1)*100000+index*1000000,title:row.title,overview:row.overview,adult:false,genres:[{id:16},{id:10751}],genre_ids:[16,10751],poster_path:'/native-'+index%titles.length+'.jpg',backdrop_path:'',release_date:row.year+'-01-01',vote_average:8};});}
test.before(async()=>{
 if(!available)return;
 api=loadServer();api.setTmdb(async(endpoint,params={})=>{
  if(endpoint.startsWith('/genre/'))return{genres:[{id:16,name:'Animation'},{id:10751,name:'Family'},{id:35,name:'Comedy'}]};
  if(endpoint.endsWith('/release_dates'))return{results:[{iso_3166_1:'US',release_dates:[{certification:'PG'}]}]};
  if(endpoint.endsWith('/content_ratings'))return{results:[{iso_3166_1:'US',rating:'TV-Y'}]};
  if(/^\/(movie|tv)\/\d+$/.test(endpoint))return{...movies().find(row=>row.id===Number(endpoint.split('/').pop())),runtime:110};
  return{results:endpoint.includes('/tv')?[]:movies(Number(params.page)||1),total_pages:3,total_results:54,page:Number(params.page)||1};
 });
 await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));});

for(const [label,width,height]of [['desktop',1440,1000],['ipad',834,1112],['phone',390,844]])test('native sections share the real cinema shell on '+label,{skip:!available,timeout:90000},async()=>{
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('https://image.tmdb.org/**',route=>{const index=Number(/native-(\d)/.exec(route.request().url())?.[1]||0);return route.fulfill({contentType:'image/jpeg',body:fs.readFileSync(path.join(fixtureRoot,'poster-'+index+'.jpg'))});});
  await page.route('**/api/discovery/books**',route=>route.fulfill({json:{books:[['Pride and Prejudice','Jane Austen'],['The Adventures of Sherlock Holmes','Arthur Conan Doyle'],['Alice’s Adventures in Wonderland','Lewis Carroll'],['The Secret Garden','Frances Hodgson Burnett'],['Little Women','Louisa May Alcott'],['Treasure Island','Robert Louis Stevenson']].map(([title,author],i)=>({id:String(i+52),title,author,language:'English',duration:'07:30:00',seconds:27000,chapterCount:3,playable:true,poster:''})),page:1,hasMore:false}}));
  let referenceFont,discoveryReference;
  for(const [slug,url,ready]of [['movies','/movies','.svCatalogPage'],['kids','/kids','.kidsWorld .movieCard'],['recommendations','/recommendations','.svRecommendationsPage'],['audiobooks','/audiobooks','.svBookCard'],['languages','/browse-by-languages','.svLanguageDestination'],['study','/study','[data-study-track]']]){
   await page.goto(origin+url);await page.waitForSelector(ready,{state:'attached'});await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
   if(slug==='study')await page.locator('[data-study-poster]').evaluate(image=>image.decode());
   const layout=await page.evaluate(()=>{const main=document.querySelector('main'),header=main.querySelector('h1');return{font:getComputedStyle(main).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily,headerFont:getComputedStyle(header).fontFamily,header:header.getBoundingClientRect().toJSON(),width:innerWidth,scrollWidth:document.documentElement.scrollWidth};});
   if(slug==='movies')referenceFont=layout.bodyFont;
   assert.equal(layout.font,referenceFont,slug+' inherits the cinema typeface');
   assert.equal(layout.headerFont,referenceFont,slug+' uses the same heading family');
   assert(layout.scrollWidth<=width,slug+' fits the full shell');
   assert(layout.header.y>=80&&layout.header.right<=width+1,slug+' heading clears navigation');
   if(slug==='recommendations'||slug==='audiobooks'){
    const discovery=await page.evaluate(()=>{const main=document.querySelector('main'),hero=main.querySelector('.svDiscoveryHero'),h=hero.querySelector('h1'),surface=main.querySelector('.svMoodInput'),nav=main.querySelector('.svSearchModes');const style=(node,keys)=>Object.fromEntries(keys.map(key=>[key,getComputedStyle(node)[key]]));return{heading:style(h,['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign']),hero:style(hero,['textAlign','maxWidth','marginLeft','marginRight']),surface:style(surface,['backgroundColor','borderTopColor','borderTopWidth','borderRadius','boxShadow']),modes:nav.querySelectorAll('a').length,mainWidth:main.getBoundingClientRect().width,heroWidth:hero.getBoundingClientRect().width};});
    if(slug==='recommendations')discoveryReference=discovery;
    else{assert.deepEqual(discovery.heading,discoveryReference.heading,'Audiobooks uses AI Picks actual final heading typography');assert.deepEqual(discovery.hero,discoveryReference.hero,'Audiobooks uses the same centered discovery header');assert.deepEqual(discovery.surface,discoveryReference.surface,'Audiobooks uses AI Picks actual form material');assert.equal(discovery.mainWidth,discoveryReference.mainWidth);assert.equal(discovery.heroWidth,discoveryReference.heroWidth);}
    assert.equal(discovery.modes,4);assert.equal(discovery.heading.textAlign,'center');
    const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(dir)fs.writeFileSync(path.join(dir,'reference-'+label+'-'+slug+'.json'),JSON.stringify(discovery,null,2));
   }

   const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
   if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'native-'+label+'-'+slug+'.png')});}
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
