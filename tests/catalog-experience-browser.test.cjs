'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
let browser,api,origin,catalogState='normal',catalogRequests=[];
const paragraph='A performer and filmmaker whose work moves between intimate character stories and large cinematic worlds. Over many years, their collaborations have brought a distinct perspective to film and television. ';
function titles(tag,type='movie',page=1,count=20){let salt=[...tag].reduce((n,c)=>n+c.charCodeAt(0),0);return Array.from({length:count},(_,i)=>({id:page*100000+salt*100+i+1,media_type:type,[type==='tv'?'name':'title']:(['The Quiet Atlas','Across the Blue','A Small Beginning','After the Rain','Northern Lights','Tomorrow, Again'][i%6])+' '+(i+1),poster_path:'/poster-'+i+'.jpg',backdrop_path:'/scene-'+i+'.jpg',overview:paragraph,vote_average:7.8,release_date:'2024-01-01',first_air_date:type==='tv'?'2024-01-01':undefined,popularity:100-i}));}
test.before(async()=>{if(!available)return;browser=await chromium.launch({headless:true,executablePath});api=loadServer();api.setTmdb(async(endpoint,params={})=>{
 catalogRequests.push({endpoint,params});
 if(endpoint.startsWith('/genre/'))return{genres:[{id:18,name:'Drama'},{id:35,name:'Comedy'},{id:28,name:'Action'},{id:10765,name:'Sci-Fi & Fantasy'},{id:99,name:'Documentary'},{id:16,name:'Animation'}]};
 if(endpoint==='/person/1')return{id:1,name:'Alex Morgan',known_for_department:'Acting',birthday:'1985-03-14',place_of_birth:'London, England',profile_path:'/person.jpg',biography:paragraph.repeat(5)+'\n\n'+paragraph.repeat(2)};
 if(endpoint==='/person/1/combined_credits')return{cast:titles('person','movie',1,44).map((item,index)=>({...item,character:'Character '+index})).concat(titles('person','tv',1,11)),crew:titles('person','movie',1,4).map(item=>({...item,department:'Directing',job:'Director'}))};
 if(/^\/movie\/\d+$/.test(endpoint))return{...titles('hero','movie',1,1)[0],id:Number(endpoint.split('/').pop()),title:'The Quiet Atlas',runtime:112,genres:[{name:'Drama'}],images:{logos:[]}};
 if(catalogState==='error'&&endpoint.startsWith('/discover/'))return{__error:true,message:'Upstream catalog temporarily unavailable'};
 return{page:Number(params.page)||1,total_pages:4,total_results:80,results:catalogState==='empty'?[]:titles(endpoint+(params.with_genres||params.with_original_language||''),endpoint.includes('/tv')?'tv':'movie',Number(params.page)||1)};
 });await new Promise(done=>api.httpServer.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{await browser?.close();if(api)await new Promise(done=>api.io.close(done));});
const scenery='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#8ca9ad"/><stop offset=".65" stop-color="#d8c2a8"/><stop offset="1" stop-color="#334439"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1280v800H0z"/><circle fill="#e4d4b6" cx="960" cy="235" r="78"/><path fill="#435f59" d="m0 650 230-360 270 295 225-200 270 220 285-325v520H0Z"/><path fill="#213e37" d="m0 800 280-265 210 120 290-150 310 180 190-160v275Z"/></svg>';
const portrait='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect width="500" height="750" fill="#55535b"/><ellipse cx="250" cy="760" rx="260" ry="320" fill="#29282e"/><ellipse cx="250" cy="265" rx="115" ry="150" fill="#b3a79d"/><path d="M130 240q-15-180 120-180t120 180q-60-110-120-60t-120 60" fill="#353036"/></svg>';
const viewports=[[1440,'desktop'],[834,'ipad'],[390,'phone'],[320,'narrow']];
async function open(url,width=1440,height=1000,options={}){
 const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',...options}),page=await context.newPage(),errors=[],trace=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())trace.push({event:'navigation',url:frame.url()});});
 page.on('requestfailed',request=>{if(request.isNavigationRequest())trace.push({event:'navigation-failed',url:request.url(),error:request.failure()?.errorText});});
 page.on('response',response=>{if(response.request().isNavigationRequest())trace.push({event:'navigation-response',url:response.url(),status:response.status()});});
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:route.request().url().endsWith('/person.jpg')?portrait:scenery}));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto(origin+url);
 await page.waitForSelector(url.startsWith('/person')?'.svPersonPage':url.startsWith('/browse-by-languages')?'.svLanguagePage':'.svCatalogPage');
 await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
 return{context,page,errors,trace};
}
const artifactName=value=>String(value).replace(/[^a-z0-9-]+/gi,'-').toLowerCase();
async function shot(page,name){
 const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
 if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,artifactName(name)+'.png')});}
}
async function layout(page){
 return page.evaluate(()=>{
  const box=node=>node.getBoundingClientRect().toJSON(),shown=node=>{const r=box(node),style=getComputedStyle(node),disclosure=node.closest('details');return r.width>0&&r.height>0&&style.visibility!=='hidden'&&!node.closest('[hidden],[inert]')&&(!disclosure||disclosure.open||node.closest('summary'));},control=node=>({label:node.getAttribute('aria-label')||node.getAttribute('name')||node.textContent.trim(),box:box(node)});
  const owned='main .svCatalogButton,main :is(.svPersonFilters,.svBrowseFilters,.svLanguageFilters) select,main .svPeriodTabs a,main .svPeriodTrigger,main .svPeriodMenu a,main .svCatalogPager a,main [data-language-search],main [data-person-biography] summary';
  const destinations=[...document.querySelectorAll('.svLanguageDestinationGrid')].filter(shown).map(grid=>({box:box(grid),cards:[...grid.querySelectorAll('.svLanguageDestination')].filter(shown).map(card=>({label:card.textContent.trim(),box:box(card),aspectRatio:getComputedStyle(card).aspectRatio,minHeight:getComputedStyle(card).minHeight}))}));
  const rails=[...document.querySelectorAll('main .svCatalogRow > .movieRail')].filter(shown).map(rail=>{
   const bounds=box(rail),cards=[...rail.querySelectorAll(':scope > .movieCard')].filter(shown),fullyShown=cards.filter(card=>{const r=box(card);return r.left>=bounds.left-1&&r.right<=bounds.right+1;});
   return{box:bounds,overflowX:getComputedStyle(rail).overflowX,scrollLeft:rail.scrollLeft,scrollWidth:rail.scrollWidth,clientWidth:rail.clientWidth,cards:cards.length,fullyShown:fullyShown.length,clippedCards:cards.filter(card=>{const r=box(card);return r.left<bounds.left-1||r.right>bounds.right+1;}).length,fullyShownControls:fullyShown.flatMap(card=>[...card.querySelectorAll('button')].filter(shown).map(control))};
  });
  return{url:location.href,readyState:document.readyState,loading:document.documentElement.getAttribute('data-sv-loading'),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,ownedControls:[...document.querySelectorAll(owned)].filter(shown).map(control),otherControls:[...document.querySelectorAll('main select,main button')].filter(node=>!node.closest('.movieRail')&&shown(node)).map(control),rails,destinations,results:[...document.querySelectorAll('.svLanguageResults,.svCatalogResults,[data-person-filmography]')].map(node=>{const links=[...node.querySelectorAll('.dsCardTitle')];return{container:node.className,count:links.length,first:links[0]?.href,last:links.at(-1)?.href};}),headings:[...document.querySelectorAll('main h1,main h2')].map(node=>node.textContent.trim()),pagers:[...document.querySelectorAll('main .pagination')].map(node=>({text:node.textContent.trim(),links:[...node.querySelectorAll('a')].map(link=>({rel:link.rel,href:link.href}))})),filters:[...document.querySelectorAll('main form')].map(form=>({action:form.action,values:Object.fromEntries(new FormData(form))}))};
 });
}
async function diagnostics(f,name,extra={}){
 const state={...await layout(f.page),errors:f.errors,trace:f.trace,...extra},dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
 if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,artifactName(name)+'.json'),JSON.stringify(state,null,2));await shot(f.page,name);}
 return state;
}
async function fits(f,label){
 // Save evidence before the first assertion, including when a layout fails.
 const state=await diagnostics(f,'catalog-layout-'+label),inside=({box})=>box.left>=-1&&box.right<=state.width+1;
 for(const grid of state.destinations){
  assert(inside(grid),label+' language destination grid must fit the page: '+JSON.stringify(grid));
  assert(grid.cards.length>0,label+' must reveal language destinations');
  assert(grid.cards.every(({box})=>box.left>=grid.box.left-1&&box.right<=grid.box.right+1),label+' destination art must fit its grid tracks: '+JSON.stringify(grid));
  assert(grid.cards.every((card,index)=>{const previous=grid.cards[index-1];return !previous||Math.abs(previous.box.top-card.box.top)>1||previous.box.right<=card.box.left+1;}),label+' language destination cards must not overlap their neighbors: '+JSON.stringify(grid));
 }
 assert(state.scrollWidth<=state.width,label+' must not overflow: '+JSON.stringify({width:state.width,scrollWidth:state.scrollWidth}));
 assert(state.ownedControls.length>0,label+' must expose its catalog controls');
 assert(state.ownedControls.every(inside),label+' catalog controls must fit: '+JSON.stringify(state.ownedControls.filter(control=>!inside(control))));
 // A translated 44px box can report 43.99994px in Chromium's float geometry.
 const fullTarget=({box})=>box.width>=44-.01&&box.height>=44-.01;
 assert(state.ownedControls.every(fullTarget),label+' catalog controls must have 44px targets: '+JSON.stringify(state.ownedControls.filter(control=>!fullTarget(control))));
 assert(state.otherControls.every(inside),label+' controls outside native rails must fit: '+JSON.stringify(state.otherControls.filter(control=>!inside(control))));
 // Native rails intentionally keep later cards outside their horizontal clip.
 // Check the scrollport and fully revealed controls, not offscreen descendants.
 for(const rail of state.rails){
  assert(inside(rail),label+' native rail must fit the page: '+JSON.stringify(rail));
  assert(['auto','scroll','hidden','clip'].includes(rail.overflowX),label+' rail must clip its offscreen cards: '+JSON.stringify(rail));
  assert(rail.fullyShown>0,label+' rail must reveal complete cards: '+JSON.stringify(rail));
  assert(rail.fullyShownControls.every(({box})=>box.left>=rail.box.left-1&&box.right<=rail.box.right+1),label+' revealed rail actions must fit their scrollport: '+JSON.stringify(rail));
 }
}
async function nativeRail(f,label){
 const rail=f.page.locator('main .svCatalogRow > .movieRail').first();
 if(!await rail.count())return;
 const before=await rail.evaluate(node=>({left:node.scrollLeft,count:node.querySelectorAll(':scope > .movieCard').length,overflow:node.scrollWidth>node.clientWidth}));
 if(!before.overflow)return;
 await rail.scrollIntoViewIfNeeded();
 await rail.evaluate(node=>node.scrollTo({left:node.scrollWidth,behavior:'instant'}));
 await f.page.waitForFunction(()=>{const rail=document.querySelector('main .svCatalogRow > .movieRail'),last=rail?.querySelector(':scope > .movieCard:last-child');if(!last)return false;const a=rail.getBoundingClientRect(),b=last.getBoundingClientRect();return b.left>=a.left-1&&b.right<=a.right+1;});
 await fits(f,label+'-rail-end');
 assert.equal(await rail.locator(':scope > .movieCard').count(),before.count,'Native scrolling must preserve mounted poster cards');
 await rail.evaluate((node,left)=>node.scrollTo({left,behavior:'instant'}),before.left);
 await f.page.waitForFunction(left=>Math.abs(document.querySelector('main .svCatalogRow > .movieRail').scrollLeft-left)<=1,before.left);
}
async function clickThrough(f,control,label,pathname,params){
 await control.scrollIntoViewIfNeeded();
 const requested=await control.getAttribute('href');
 await diagnostics(f,'catalog-before-'+label,{requested,expected:{pathname,params}});
 // DOM readiness and the resulting controls are the navigation contract.
 // A remote image load must not stand in for successful native navigation.
 await Promise.all([
  f.page.waitForURL(url=>url.pathname===pathname&&Object.entries(params).every(([key,value])=>url.searchParams.get(key)===value),{waitUntil:'domcontentloaded'}),
  control.click(),
 ]);
 await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
 await diagnostics(f,'catalog-after-'+label,{requested,expected:{pathname,params}});
}
async function failed(f,name,error){
 try{await diagnostics(f,name,{failure:String(error?.stack||error)});}catch(diagnosticError){console.error('Catalog diagnostics failed:',diagnosticError.message);}
 throw error;
}
test('person biography and native format/role filmography filters work in the entire shell at desktop, phone and iPad widths',{skip:!available,timeout:90000},async()=>{
 for(const [width,label]of viewports){
  const f=await open('/person/1',width);
  try{
   await fits(f,'person-'+width);assert.equal(await f.page.locator('[data-person-credits-count]').textContent(),'55 titles');await shot(f.page,'catalog-person-'+label);
   await nativeRail(f,'person-'+width);
   await f.page.locator('[data-person-biography] summary').click();assert(await f.page.locator('[data-person-biography]').getAttribute('open')!==null);
   await f.page.locator('.svPersonFilters select[name=media]').selectOption('tv');
   await clickThrough(f,f.page.locator('.svPersonFilters button'),'person-filter-'+label,'/person/1',{media:'tv'});
   assert.equal(await f.page.locator('[data-person-credits-count]').textContent(),'11 titles');
   const links=await f.page.locator('[data-person-filmography] .dsCardTitle').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname));
   assert(links.length===11&&links.every(link=>link.startsWith('/tv/')));await fits(f,'filtered-person-'+width);
   await f.page.locator('#filmography').scrollIntoViewIfNeeded();await shot(f.page,'catalog-person-credits-'+label);assert.deepEqual(f.errors,[]);
  }catch(error){await failed(f,'catalog-person-failed-'+label,error);}finally{await f.context.close();}
 }
});
test('language destinations filter by native name and preserve real filters through next-page navigation',{skip:!available,timeout:90000},async()=>{
 for(const [width,label]of viewports){
  const f=await open('/browse-by-languages',width);
  try{
   await fits(f,'languages-'+width);await shot(f.page,'catalog-languages-'+label);
   await f.page.locator('[data-language-search]').fill('한국어');assert.equal(await f.page.locator('[data-language-name]:visible').count(),1);
   await f.page.locator('[data-language-search]').fill('not a language');assert(await f.page.locator('[data-language-empty]').isVisible());await f.page.locator('[data-language-search]').fill('');
   await f.page.locator('[data-language-destinations]').scrollIntoViewIfNeeded();await shot(f.page,'catalog-language-destinations-'+label);
   await f.page.locator('form[aria-label="Browse filters"] select[name=media]').selectOption('tv');await f.page.locator('form[aria-label="Browse filters"] select[name=language]').selectOption('ko');await f.page.locator('form[aria-label="Browse filters"] select[name=sort]').selectOption('title');
   await clickThrough(f,f.page.locator('form[aria-label="Browse filters"] button'),'language-filter-'+label,'/browse-by-languages',{media:'tv',language:'ko',sort:'title'});
   const before=await f.page.locator('.svLanguageResults .dsCardTitle').first().getAttribute('href');
   await clickThrough(f,f.page.locator('.svLanguageResults .pagination a[rel=next]'),'language-next-'+label,'/browse-by-languages',{media:'tv',language:'ko',sort:'title',page:'2'});
   assert.equal(new URL(f.page.url()).searchParams.get('language'),'ko');assert.equal(new URL(f.page.url()).searchParams.get('sort'),'title');assert.match(await f.page.locator('.svLanguageResults .pagination').textContent(),/Page 2 of 4/);
   assert.notEqual(await f.page.locator('.svLanguageResults .dsCardTitle').first().getAttribute('href'),before);await fits(f,'language-page2-'+width);assert.deepEqual(f.errors,[]);
  }catch(error){await failed(f,'catalog-languages-failed-'+label,error);}finally{await f.context.close();}
 }
});
test('catalog periods change the source, subsequent pages advance, and empty/error language pages remain useful',{skip:!available,timeout:60000},async()=>{
 const f=await open('/movies?period=today',390);
 try{
  await fits(f,'popular-movies');await shot(f.page,'catalog-popular-movies-phone');assert.equal(await f.page.locator('[data-movie-periods] a[aria-current=page]').textContent(),'Today');
  await nativeRail(f,'popular-movies');const first=await f.page.locator('.svCatalogRow .dsCardTitle').first().getAttribute('href');
  await clickThrough(f,f.page.locator('.svCatalogPager a[rel=next]'),'movies-next-phone','/movies',{period:'today',page:'2'});
  assert.equal(await f.page.locator('.dsHero').count(),0);assert.notEqual(await f.page.locator('.svCatalogResults .dsCardTitle').first().getAttribute('href'),first);assert.equal(new URL(f.page.url()).searchParams.get('period'),'today');await fits(f,'movie-page2');
  assert(await f.page.locator('.dsBrowseTop h1').evaluate(node=>node.getBoundingClientRect().top>=90),'Page two heading must clear fixed navigation');
  catalogState='empty';await f.page.goto(origin+'/browse-by-languages?language=ko');await diagnostics(f,'catalog-languages-empty-phone');assert(await f.page.getByRole('heading',{name:'No titles match these filters.'}).isVisible());
  catalogState='error';await f.page.goto(origin+'/browse-by-languages?language=ko');await diagnostics(f,'catalog-languages-error-phone');assert(await f.page.getByRole('link',{name:/Try again/}).isVisible());assert.deepEqual(f.errors,[]);
 }catch(error){await failed(f,'catalog-periods-failed-phone',error);}finally{catalogState='normal';await f.context.close();}
});

test('Movies keeps its original hierarchy and the underlined period popout supports native selection and keyboard closing',{skip:!available,timeout:90000},async()=>{
 for(const [width,label]of viewports){
  const f=await open('/movies?period=week&party=1',width);
  try{
   const picker=f.page.locator('[data-movie-periods]'),trigger=picker.locator('summary'),menu=picker.locator('.svPeriodMenu');
   assert.equal(await f.page.locator('.dsBrowseTop h1').textContent(),'Movies');
   assert.equal(await f.page.locator('.svBrowseHeading,.svBrowseFilters').count(),0);
   assert.deepEqual(await f.page.locator('main .svCatalogRow h2').allTextContents(),['Action Movies','Popular movies','Comedies','Suspense Movies','Critically Acclaimed Movies','Browse Movies']);
   assert.equal(await picker.getAttribute('open'),null);assert.equal(await menu.isVisible(),false);
   assert(await trigger.locator('span').evaluate(node=>getComputedStyle(node).textDecorationLine.includes('underline')));
   await trigger.scrollIntoViewIfNeeded();await diagnostics(f,'catalog-period-closed-'+label);
   await trigger.click();await f.page.waitForFunction(()=>{const menu=document.querySelector('.svPeriodMenu');return document.querySelector('[data-movie-periods]').dataset.periodState==='open'&&getComputedStyle(menu).opacity==='1';});
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   const bounds=await menu.boundingBox();assert(bounds.x>=17&&bounds.x+bounds.width<=width-17,'The small period popout must fit the viewport');
   assert.equal(await menu.locator('a').count(),3);await fits(f,'period-open-'+label);await diagnostics(f,'catalog-period-open-'+label);
   await trigger.press('ArrowDown');assert(await menu.locator('a[aria-current=page]').evaluate(node=>node===document.activeElement));
   await f.page.keyboard.press('End');assert(await menu.locator('a[href*="period=month"]').evaluate(node=>node===document.activeElement));
   await f.page.keyboard.press('Escape');await f.page.waitForFunction(()=>!document.querySelector('[data-movie-periods]').open);
   assert(await trigger.evaluate(node=>node===document.activeElement));
   await trigger.click();await f.page.locator('.dsBrowseTop h1').click();await f.page.waitForFunction(()=>!document.querySelector('[data-movie-periods]').open);
   await trigger.click();await clickThrough(f,menu.locator('a[href*="period=month"]'),'period-month-'+label,'/movies',{period:'month',party:'1'});
   assert.equal(new URL(f.page.url()).searchParams.has('page'),false);assert.equal(await f.page.locator('.svPeriodTrigger').textContent(),'This month');
   assert.equal(await f.page.locator('.svPeriodTrigger').getAttribute('title'),'Popular releases this month');
   const first=await f.page.locator('.svCatalogRow:has([data-movie-periods]) .dsCardTitle').first().getAttribute('href');
   await clickThrough(f,f.page.locator('.pagination a[rel=next]'),'period-month-next-'+label,'/movies',{period:'month',page:'2',party:'1'});
   assert.equal(await f.page.locator('.dsHero').count(),0);assert.notEqual(await f.page.locator('.svCatalogResults .dsCardTitle').first().getAttribute('href'),first);
   assert(catalogRequests.some(call=>call.endpoint==='/discover/movie'&&call.params.page===2&&call.params.sort_by==='popularity.desc'&&/^\d{4}-\d{2}-01$/.test(call.params['primary_release_date.gte'])&&/^\d{4}-\d{2}-\d{2}$/.test(call.params['primary_release_date.lte'])),'The native month page must request supported, bounded release discovery');
   assert.equal(catalogRequests.some(call=>call.endpoint==='/trending/movie/month'),false);
   await fits(f,'period-month-page2-'+label);assert.deepEqual(f.errors,[]);
  }catch(error){await failed(f,'catalog-popout-failed-'+label,error);}finally{await f.context.close();}
 }
});

test('period popout respects reduced motion and closes when keyboard focus leaves',{skip:!available,timeout:45000},async()=>{
 const f=await open('/movies?period=week',390,1000,{reducedMotion:'reduce'});
 try{
  const trigger=f.page.locator('.svPeriodTrigger'),menu=f.page.locator('.svPeriodMenu');
  await trigger.focus();await trigger.press('ArrowDown');
  assert.equal(await menu.evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  assert.equal(await f.page.locator('[data-movie-periods]').getAttribute('data-period-state'),'open');
  await f.page.locator('.pagination a[rel=next]').focus();
  assert.equal(await f.page.locator('[data-movie-periods]').getAttribute('open'),null);
  await trigger.click();await f.page.keyboard.press('Escape');
  assert.equal(await f.page.locator('[data-movie-periods]').getAttribute('open'),null);assert(await trigger.evaluate(node=>node===document.activeElement));
  await diagnostics(f,'catalog-period-reduced-motion');assert.deepEqual(f.errors,[]);
 }catch(error){await failed(f,'catalog-popout-reduced-motion-failed',error);}finally{await f.context.close();}
});
