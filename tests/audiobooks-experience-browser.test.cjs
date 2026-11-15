'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
const skip=!available&&'Chromium is not installed';
// Catalog and audio fixtures stay inside the test. Production only uses verified upstream recordings.
const titles=[['Pride and Prejudice','Jane Austen'],['The Adventures of Sherlock Holmes','Arthur Conan Doyle'],['Alice’s Adventures in Wonderland','Lewis Carroll'],['The Secret Garden','Frances Hodgson Burnett'],['Little Women','Louisa May Alcott'],['The Wind in the Willows','Kenneth Grahame'],['Anne of Green Gables','Lucy Maud Montgomery'],['The Wonderful Wizard of Oz','L. Frank Baum'],['A Room with a View','E. M. Forster'],['A Midsummer Night’s Dream','William Shakespeare'],['Treasure Island','Robert Louis Stevenson'],['The Time Machine','H. G. Wells']];
const rows=titles.map(([title,author],i)=>({id:String(i+52),title,author,language:'English',duration:'07:30:00',seconds:27000,chapterCount:3,playable:true,poster:''}));
const detail={...rows[0],description:'A thoughtful story, read at an unhurried pace by LibriVox volunteers. Choose a chapter, keep your place, or open the original public-domain text while you listen.',textUrl:'https://www.gutenberg.org/ebooks/1342',chapters:[1,2,3].map(i=>({id:String(i),number:i,title:'Chapter '+i+' — A new beginning',url:'https://archive.org/download/swifly-audio-fixture/chapter-'+i+'.wav',duration:600}))};
let api,browser,origin,dir;
test.before(async()=>{
 if(!available)return;dir=await fsp.mkdtemp(path.join(os.tmpdir(),'swifly-books-'));const old=process.env.SWIFLY_DATA_DIR;process.env.SWIFLY_DATA_DIR=dir;api=loadServer();old===undefined?delete process.env.SWIFLY_DATA_DIR:process.env.SWIFLY_DATA_DIR=old;api.setTmdb(async()=>({results:[]}));await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
});
test.after(async()=>{await browser?.close();if(api)await new Promise(resolve=>api.io.close(resolve));if(dir)await fsp.rm(dir,{recursive:true,force:true});});
function wav(){const data=Buffer.alloc(320044);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(16000,24);data.writeUInt32LE(32000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);return data;}
async function open(t,width=1440,{reduced=false,progress=false,values={},device={}}={}){
 const context=await browser.newContext({viewport:{width,height:width<700?900:1000},reducedMotion:reduced?'reduce':'no-preference'});t.after(()=>context.close());
 await context.addInitScript(({progress,values,device})=>{localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Viewer'}));if(Object.keys(values).length)localStorage.setItem('swiflytv.appearance',JSON.stringify({version:2,values,looks:[]}));if(Object.keys(device).length)localStorage.setItem('swiflytv.studio.device',JSON.stringify({version:2,values:device}));if(progress)localStorage.setItem('swiflytv.library.audio.main',JSON.stringify({'52':{chapter:0,time:2,speed:1.5,title:'Pride and Prejudice',author:'Jane Austen',at:Date.now()}}));},{progress,values,device});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 // A trailing books** glob does not cross the slash before a detail ID.
 // Intercept both endpoint shapes so playback never depends on a live recording.
 await page.route(url=>/^\/api\/discovery\/books(?:\/\d+)?$/.test(url.pathname),route=>{const u=new URL(route.request().url());if(/\/books\/\d+$/.test(u.pathname))return route.fulfill({json:{book:detail}});const q=u.searchParams.get('q')||'',n=Number(u.searchParams.get('page'))||1;const result=q?rows.filter(b=>(b.title+' '+b.author).toLowerCase().includes(q.toLowerCase())):n===1?rows:[rows[0],{...rows[1],id:'90',title:'A few more quiet stories'}];return route.fulfill({json:{books:result,page:n,hasMore:!q&&n===1,nextPage:!q&&n===1?2:null}});});
 await page.route('https://archive.org/download/swifly-audio-fixture/*',route=>route.fulfill({contentType:'audio/wav',body:wav()}));
 await page.goto(origin+'/audiobooks');await page.waitForFunction(()=>document.querySelector('[data-audiobooks]')?.dataset.bookState==='ready');await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
 return {page,errors,context};
}
async function screenshot(page,name){const target=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;if(!target)return;await fsp.mkdir(target,{recursive:true});await page.screenshot({path:path.join(target,name+'.png'),fullPage:true});}
for(const [variant,values,device]of [['default',{},{}],['saved-compact-opaque',{aiSpacing:'compact',aiWidth:880,aiGlass:'soft'},{reduceTransparency:true}]])for(const [name,width]of [['desktop',1440],['phone',390],['small-phone',320]])test('Audiobooks shares the actual AI Picks '+variant+' layout and final surfaces on '+name,{skip},async t=>{
 const {page,context,errors}=await open(t,width,{values,device}),ai=await context.newPage(),aiErrors=[];ai.on('pageerror',error=>aiErrors.push(error.message));
 await ai.goto(origin+'/recommendations');await ai.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
 const measure=p=>p.evaluate(()=>{
  const read=(selector,properties)=>{const element=document.querySelector(selector),style=getComputedStyle(element),box=element.getBoundingClientRect();return {x:box.x,width:box.width,...Object.fromEntries(properties.map(property=>[property,style[property]]))};};
  return {page:read('.svDiscoveryPage',['paddingTop','paddingLeft','paddingRight','maxWidth']),heading:read('.svDiscoveryHero h1',['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign']),hero:read('.svDiscoveryHero',['marginBottom']),modes:read('.svSearchModes',['gap','marginTop','marginBottom']),form:read('.svRecommendationForm',['maxWidth']),panel:read('.svMoodInput',['padding','backgroundColor','borderColor','borderRadius','boxShadow','backdropFilter']),query:read('.svPromptEntry [name]',['fontFamily','fontSize','lineHeight','height']),ideas:read('.svMoodIdeas',['marginTop','maxWidth']),chips:read('.svMoodChips',['gridTemplateColumns','gap']),chip:read('.svMoodChips button',['backgroundColor','borderColor','borderRadius','padding','minHeight'])};
 });
 const expected=await measure(ai),actual=await measure(page);assert.deepEqual(actual,expected,'the two real routes must use one component cascade');
 assert.equal(actual.heading.fontWeight,'650');assert.equal(actual.panel.backgroundColor,variant==='default'?'rgba(17, 20, 25, 0.92)':'rgb(17, 20, 25)');assert.equal(actual.chip.backgroundColor,'rgb(17, 20, 25)');
 if(variant!=='default'){assert.equal(actual.form.maxWidth,'880px');assert.equal(actual.query.height,'64px');assert.equal(actual.panel.backdropFilter,'none');}
 await screenshot(ai,'ai-picks-family-'+variant+'-'+name);await screenshot(page,'audiobooks-family-'+variant+'-'+name);
 await ai.route(url=>url.pathname==='/api/discovery/candidates',route=>route.fulfill({json:{mode:'title',candidates:rows.slice(0,4).map(row=>({id:row.id,type:'movie',title:row.title,href:'/movie/'+row.id}))}}));
 await ai.locator('[name=prompt]').fill('A title');await ai.locator('[data-recommendation-form]').evaluate(form=>form.requestSubmit());await ai.locator('.svRecommendationResults').waitFor({state:'visible'});
 const results=p=>p.locator('.svRecommendationResults').evaluate(element=>{const box=element.getBoundingClientRect(),grid=element.querySelector('.svDiscoveryGrid:not([hidden])'),style=getComputedStyle(grid),card=grid.querySelector('.svDiscoveryCard'),cardStyle=getComputedStyle(card),copyStyle=getComputedStyle(card.querySelector('.svDiscoveryCardCopy')),titleStyle=getComputedStyle(card.querySelector('h3'));return {x:box.x,width:box.width,gridWidth:grid.getBoundingClientRect().width,columns:style.gridTemplateColumns,gap:style.gap,card:{display:cardStyle.display,columns:cardStyle.gridTemplateColumns,padding:cardStyle.padding,borderRadius:cardStyle.borderRadius,background:cardStyle.backgroundColor,copyPadding:copyStyle.padding,titleFontSize:titleStyle.fontSize,titleLineHeight:titleStyle.lineHeight}};});
 const bookResults=await results(page);assert.deepEqual(bookResults,await results(ai),'recordings and picks share the effective results width, list columns and card presentation');assert.equal(bookResults.columns.split(' ').length,1,'the default Studio presentation is a list');assert(bookResults.gridWidth<=(values.aiWidth||720));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await screenshot(ai,'ai-picks-results-'+variant+'-'+name);await screenshot(page,'audiobooks-results-'+variant+'-'+name);
 assert.deepEqual(errors,[]);assert.deepEqual(aiErrors,[]);
});
for(const [name,width]of [['desktop',1440],['ipad',834],['phone',390],['small-phone',320]])test('the native audiobook library fits '+name+' and keeps its real controls reachable',{skip},async t=>{
 const {page,errors}=await open(t,width);assert.equal(await page.locator('.svBookCard').count(),12);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'the full shell must not overflow at '+width);
 const heading=await page.locator('.svBookHeader').boundingBox(),search=await page.locator('[data-book-search]').boundingBox();assert(heading.x>=0&&heading.x+heading.width<=width+1);assert(search.y>=heading.y+heading.height,'search follows the compact page heading');
 assert.equal(await page.locator('.svBookLandscape,[data-book-scene],[data-book-focus]').count(),0,'the library has no unrelated scenery controls');
 assert(await page.locator('[data-book-search] input').isVisible());assert(await page.locator('.svBookLibrary').isVisible());
 const submit=await page.locator('[data-book-search] button').boundingBox();assert(submit.width>=44&&submit.height>=44,'search remains a full touch target');
 await screenshot(page,'audiobooks-'+name);
 await page.locator('.svBookCover').first().focus();assert.notEqual(await page.locator('.svBookCover').first().evaluate(n=>getComputedStyle(n).outlineStyle),'none');assert.deepEqual(errors,[]);
});

test('audiobook search, navigation, deduplicated loading and empty state work in the real shell',{skip},async t=>{
 const {page,errors}=await open(t,390);await page.locator('[data-book-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.svBookCard').length===13);assert.equal(await page.locator('.svBookCard[data-book-card="52"]').count(),1);
 await page.locator('[data-book-search] input').fill('Jane Austen');await page.locator('[data-book-search] input').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.svBookCard').length===1);assert.match(page.url(),/q=Jane/);assert.match(await page.locator('[data-book-results]').textContent(),/Pride and Prejudice/);
 await page.locator('[data-book-search] input').fill('No matching recording');await page.locator('[data-book-search] input').press('Enter');await page.waitForFunction(()=>document.querySelector('[data-audiobooks]').dataset.bookState==='empty');assert(await page.locator('[data-book-more]').isHidden());await screenshot(page,'audiobooks-empty-phone');
 await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('.svBookCard').length===1);assert.equal(await page.locator('[data-book-search] input').inputValue(),'Jane Austen');assert.deepEqual(errors,[]);
});

test('real audiobook audio preserves speed across chapters and its reading dialog fits a narrow phone',{skip},async t=>{
 const {page,errors}=await open(t,320,{progress:true});await page.locator('.svBookCover').first().click();await page.locator('[data-book-playback]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-book-speed]').inputValue(),'1.5');assert.equal(await page.locator('audio').evaluate(n=>n.playbackRate),1.5);
 assert.equal(await page.locator('.svBookTextLink').getAttribute('href'),'https://www.gutenberg.org/ebooks/1342');
 await page.locator('audio').evaluate(n=>n.play());await page.locator('[data-book-next]').click();await page.waitForFunction(()=>document.querySelector('audio').src.endsWith('/chapter-2.wav'));assert.equal(await page.locator('audio').evaluate(n=>n.playbackRate),1.5);
 const box=await page.locator('[data-book-dialog]').boundingBox();assert(box.x>=0&&box.x+box.width<=321);assert.equal(await page.locator('[data-book-dialog]').evaluate(n=>n.scrollWidth>n.clientWidth),false);await screenshot(page,'audiobooks-listening-phone');
 await page.locator('[data-book-sleep]').selectOption('chapter');await page.locator('audio').evaluate(n=>n.dispatchEvent(new Event('ended')));assert.match(await page.locator('audio').getAttribute('src'),/chapter-2/);assert(await page.locator('audio').evaluate(n=>n.paused));
 await page.locator('[data-book-close]').click();await page.waitForFunction(()=>!document.querySelector('[data-book-dialog]').open);
 // Native dialog exits retain their display for the shared discrete animation.
 await page.locator('[data-book-dialog]').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('audio').hasAttribute('src'));assert.deepEqual(errors,[]);
});

test('audiobook reduced motion removes cover movement without losing keyboard feedback',{skip},async t=>{
 const {page,errors}=await open(t,834,{reduced:true});const cover=page.locator('.svBookCover').first();await cover.hover();assert.equal(await cover.evaluate(n=>getComputedStyle(n).transform),'none');await cover.focus();assert.notEqual(await cover.evaluate(n=>getComputedStyle(n).outlineStyle),'none');assert.equal(await page.locator('.svBookLandscapeArt').count(),0);assert.deepEqual(errors,[]);
});
