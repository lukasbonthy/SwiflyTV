'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
let browser,api;
test.before(async()=>{if(available){browser=await chromium.launch({headless:true,executablePath});api=loadServer();}});
test.after(async()=>{await browser?.close();api?.io.close();});
const film=id=>({id,title:id===346698?'First movie':'Feature '+id,images:id===2?{logos:[{file_path:'/logo-2.svg',iso_639_1:'en'}]}:undefined,media_type:'movie',backdrop_path:'/scene-'+id+'.svg',poster_path:'/poster.svg',vote_average:7.5,release_date:'2026-01-01',overview:id===2?'A longer second overview to verify anchored actions while the real copy is replaced. '.repeat(4):'A film for tonight.'});
async function open(width,{subtle=false,reduced=false,resume=false,height=936,tablet=false}={}){
 api.setTmdb(async endpoint=>endpoint==='/movie/346698'?film(346698):{results:[film(1),film(2),film(3),film(4)]});
 let html;await api.homePage({}, {send:value=>html=value});
 html=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attrs)=>/data-sv-featured-data/.test(attrs)?script:'');
 const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference',...(width<861?{isMobile:true,hasTouch:true}:{}),...(tablet?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}:{})}),page=await context.newPage();
 if(resume)await page.addInitScript(()=>localStorage.setItem('movieverse.continue',JSON.stringify([{profileId:'main',id:346698,type:'movie',title:'First movie',currentTime:3723,duration:7200}])));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),css=readShellStyle(url.pathname);
  if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:html});
  if(css!==undefined)return route.fulfill({contentType:'text/css',body:css});
  if(url.pathname.startsWith('/assets/')){const file=path.join(__dirname,'../public',url.pathname.slice(8));if(fs.existsSync(file)&&file.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(file)});}
  if(url.pathname==='/assets/brand/swiflytv-nav-logo.svg')return route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync(path.join(__dirname,'../public/brand/swiflytv-nav-logo.svg'))});
  if(url.hostname==='image.tmdb.org')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="'+(url.pathname.includes('scene-2.')?'#cf3926':'#2056b1')+'"/><circle cx="300" cy="250" r="180" fill="#ffffff" opacity=".12"/></svg>'});
  return route.fulfill({body:'',contentType:'text/plain'});
 });
 await page.goto('https://swifly.test/');
 await page.evaluate(subtle=>{document.body.dataset.stGlass=subtle?'subtle':'liquid';},subtle);
 for(const name of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js',...(resume?['clean/continue.js']:[]),'clean/featured.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public',name),'utf8')});
 await page.waitForFunction(()=>document.querySelector('.svHeroSpill').dataset.svFeaturedPrepared==='true');
 // Initial CSS entry motion can still translate the action row while the
 // artwork is ready. Measure settled geometry rather than a partial frame.
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dsHeroActions')).transform==='none');
 return {page,context};
}
for(const width of [390,1920])test(width+'px featured slide shares movie identity, uses prepared glow and leaves row geometry stable',{skip:!available},async()=>{
 const f=await open(width,{subtle:width===390}),page=f.page;
 try{
  const before=await page.evaluate(()=>{
   window.__featureActions=[...document.querySelectorAll('.dsHero > .dsHeroContent .dsHeroActions > :is(a,button)')];
   return {rows:document.querySelector('[data-st-home-rows]').getBoundingClientRect().top+scrollY,copy:document.querySelector('.dsHero > .dsHeroContent').getBoundingClientRect().toJSON()};
  });
  const moving=await page.evaluate(async()=>{
   await SwiflyFeatured.select(2);
   const hero=document.querySelector('[data-sv-featured]'),animations=hero.getAnimations({subtree:true}).concat(hero.nextElementSibling.getAnimations({subtree:true})).filter(a=>[700,1000].includes(a.effect.getTiming().duration));
   for(const a of animations){a.pause();a.currentTime=350;}
   await new Promise(requestAnimationFrame);
   const ghost=hero.querySelector('[data-sv-featured-ghost]');
   return {state:document.documentElement.dataset.svFeaturedMotion,copyTranslate:getComputedStyle(hero.querySelector(':scope>.dsHeroContent')).translate,artTranslate:getComputedStyle(hero.querySelector('.dsHeroBg[data-sv-featured-active="true"]')).translate,
    logoReady:hero.querySelector(':scope>.dsHeroContent h1').classList.contains('hasLogo')&&hero.querySelector(':scope>.dsHeroContent .dsHeroLogo').complete,sameActions:window.__featureActions.every(node=>node.isConnected),play:hero.querySelector('[data-play-id]').dataset.playId,details:hero.querySelector('.dsHeroActions > a:not([data-play-id])').getAttribute('href'),watch:hero.querySelector('[data-watch-id]').dataset.watchId,
    ghostFaces:[...ghost.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>({background:getComputedStyle(n).backgroundColor,face:getComputedStyle(n,'::before').backgroundColor,transform:getComputedStyle(n,'::before').transform,height:n.getBoundingClientRect().height,top:parseFloat(getComputedStyle(n,'::before').top),bottom:parseFloat(getComputedStyle(n,'::before').bottom)})),ghostInert:ghost?.inert,ghostActions:ghost?.querySelectorAll('[href],[data-play-id],[data-watch-id],.svLiquidPane,filter,[data-swifly-renderer]').length,ghostFilters:[...ghost.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>getComputedStyle(n).backdropFilter),
    glow:[...hero.nextElementSibling.querySelectorAll('[data-sv-featured-glow]')].map(n=>({id:n.dataset.svFeaturedId,filter:getComputedStyle(n).filter,opacity:Number(getComputedStyle(n).opacity),source:n.style.backgroundImage.slice(0,25)})),controls:[...hero.querySelectorAll('[data-sv-featured-controls] button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(moving.state,'true');assert.equal(moving.logoReady,true);assert.equal(moving.sameActions,true);assert.equal(moving.play,'2');assert.equal(moving.watch,'2');assert.equal(moving.details,'/movie/2');
  assert.notEqual(moving.artTranslate,'none');assert.notEqual(moving.artTranslate,'0px');assert.notEqual(moving.copyTranslate,'none');
  if(width<=860){assert(moving.ghostFaces.every(f=>f.background==='rgba(0, 0, 0, 0)'&&f.transform==='none'&&Math.abs(f.height-f.top-f.bottom-36)<1),JSON.stringify(moving.ghostFaces));assert.equal(moving.ghostFaces[0].face,'rgb(255, 255, 255)');}
  assert.equal(moving.ghostInert,true);assert.equal(moving.ghostActions,0);assert(moving.ghostFilters.every(v=>v==='none'),JSON.stringify(moving));
  assert(moving.glow.every(g=>g.filter==='none'&&g.source.startsWith('url("data:image/png;')));assert(moving.glow.some(g=>g.id==='2'&&g.opacity>0&&g.opacity<1));
  assert(moving.controls.every(c=>c.width>=(width<=860?40:44)&&c.height>=44));assert.equal(moving.overflow,false);
  await page.evaluate(()=>{for(const a of document.getAnimations())if([700,1000].includes(a.effect.getTiming().duration))a.finish();});
  await page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedState==='idle');
  const after=await page.evaluate(()=>({rows:document.querySelector('[data-st-home-rows]').getBoundingClientRect().top+scrollY,copy:document.querySelector('.dsHero > .dsHeroContent').getBoundingClientRect().toJSON(),ghost:!!document.querySelector('[data-sv-featured-ghost]'),state:document.documentElement.dataset.svFeaturedMotion,slots:document.querySelectorAll('.dsHeroBg').length,glows:document.querySelectorAll('[data-sv-featured-glow]').length}));
  assert(Math.abs(before.rows-after.rows)<1,JSON.stringify({before,after}));assert(Math.abs(before.copy.bottom-after.copy.bottom)<1);assert.equal(after.ghost,false);assert.equal(after.state,undefined);assert.equal(after.slots,2);assert.equal(after.glows,2);
  const color=await page.evaluate(async()=>{
   const glow=document.querySelector('[data-sv-featured-glow][data-sv-featured-active="true"]'),image=new Image();image.src=glow.style.backgroundImage.slice(5,-2);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width:image.width,height:image.height,pixel:[...context.getImageData(32,18,1,1).data]};
  });
  assert.equal(color.width,64);assert.equal(color.height,36);assert(color.pixel[0]>color.pixel[2]*2,'The second glow must actually carry the red artwork palette');
 }finally{await f.context.close();}
});
test('320px controls fit and reduced motion keeps manual navigation immediate',{skip:!available},async()=>{
 const f=await open(320,{subtle:true,reduced:true});try{
  await f.page.locator('[data-sv-featured-go="1"]').click();await f.page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedIndex==='1');
  const state=await f.page.evaluate(()=>({moving:document.documentElement.dataset.svFeaturedMotion,ghost:!!document.querySelector('[data-sv-featured-ghost]'),overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('[data-sv-featured-controls] button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect().toJSON()),status:document.querySelector('[data-sv-featured-status]').getBoundingClientRect().toJSON()}));
  assert.equal(state.moving,undefined);assert.equal(state.ghost,false);assert.equal(state.overflow,false);assert(state.controls.every(b=>b.width>=40&&b.height>=44&&b.left>=0&&b.right<=320),JSON.stringify(state));assert.equal(state.status.width,1);assert.equal(state.status.height,1);
 }finally{await f.context.close();}
});


test('featured controls use edge arrows and thin progress tracks below anchored actions',{skip:!available},async()=>{
 for(const width of [320,390,820,1363,1920]){
  const f=await open(width);try{
   const layout=await f.page.evaluate(()=>{
    const h=document.querySelector('[data-sv-featured]'),rect=n=>n.getBoundingClientRect().toJSON();
    return {hero:rect(h),copy:rect(h.querySelector(':scope>.dsHeroContent')),actions:rect(h.querySelector('.dsHeroActions')),
     footer:rect(h.querySelector('.svFeaturedFooter')),positions:rect(h.querySelector('.svFeaturedPositions')),
     arrows:[...h.querySelectorAll('[data-sv-featured-prev],[data-sv-featured-next]')].map(n=>({rect:rect(n),display:getComputedStyle(n).display,opacity:Number(getComputedStyle(n).opacity)})),
     tracks:[...h.querySelectorAll('.svFeaturedPositions button > span')].map(rect),
     controls:[...h.querySelectorAll('[data-sv-featured-controls] button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({rect:rect(n),filter:getComputedStyle(n).backdropFilter})),
     progress:h.getAnimations({subtree:true}).filter(a=>a.effect.target.matches('[data-sv-featured-progress]')).map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations})),
     overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(layout.overflow,false,JSON.stringify({width,layout}));
   assert(layout.controls.every(n=>n.rect.width>=(width<=860?40:44)&&n.rect.height>=44&&n.filter==='none'),JSON.stringify({width,layout}));
   assert(layout.footer.top>=layout.actions.bottom+8,JSON.stringify({width,layout}));
   assert(layout.tracks.every(n=>n.height===3&&n.width===(width<=860?32:48)),JSON.stringify({width,layout}));
   if(width<768)assert(layout.arrows.every(n=>n.display==='none'));
   else{
    assert(Math.abs(layout.arrows[0].rect.left-layout.hero.left-16)<1);
    assert(Math.abs(layout.hero.right-layout.arrows[1].rect.right-16)<1);
    assert(layout.arrows.every(n=>Math.abs((n.rect.top+n.rect.bottom-layout.hero.top-layout.hero.bottom)/2)<1));
   }
   if(width===820)assert(layout.arrows.every(n=>n.opacity===1),'Touch tablets need visible edge arrows without hovering');
   if(width<=860)assert(Math.abs((layout.positions.left+layout.positions.right)/2-layout.hero.width/2)<1);
   else assert(Math.abs(layout.footer.left-layout.copy.left)<1);
   assert.equal(layout.progress.length,1);assert.equal(layout.progress[0].duration,8000);assert.equal(layout.progress[0].iterations,1);
   assert.equal(await f.page.locator('[data-sv-featured-pause]').count(),0);
   const active=f.page.locator('[data-sv-featured-go][aria-current="true"]');await active.click();
   assert.match(await active.getAttribute('aria-label'),/Resume automatic rotation/);
   assert.equal(await f.page.evaluate(()=>document.querySelector('[data-sv-featured]').getAnimations({subtree:true}).filter(a=>a.effect.target.matches('[data-sv-featured-progress]')).length),0);
   await active.click();assert.match(await active.getAttribute('aria-label'),/Pause automatic rotation/);
   assert.equal(await f.page.evaluate(()=>document.querySelector('[data-sv-featured]').getAnimations({subtree:true}).filter(a=>a.effect.target.matches('[data-sv-featured-progress]')).length),1);
  }finally{await f.context.close();}
 }
});


test('Studio compact and banner controls clear the real action hit areas',{skip:!available},async()=>{
 for(const width of [320,390,820,1440]){
  const f=await open(width,{reduced:true});try{
   for(const mode of ['compact','banner']){
    await f.page.evaluate(mode=>{document.body.dataset.stHeroMode=mode;},mode);
    // Studio applies a style change between frames. Read the settled hit
    // areas rather than the preceding layout on the same mutation stack.
    try{await f.page.waitForFunction(()=>{const h=document.querySelector('[data-sv-featured]');return h.querySelector('.svFeaturedFooter').getBoundingClientRect().top>=h.querySelector('.dsHeroActions').getBoundingClientRect().bottom+8;},null,{timeout:5000});}
    catch(error){const state=await f.page.evaluate(()=>{const h=document.querySelector('[data-sv-featured]'),f=h.querySelector('.svFeaturedFooter');return {mode:document.body.dataset.stHeroMode,classes:document.body.className,bottom:getComputedStyle(f).bottom,transition:getComputedStyle(f).transition,footer:f.getBoundingClientRect().toJSON(),actions:h.querySelector('.dsHeroActions').getBoundingClientRect().toJSON()};});throw new Error(JSON.stringify({width,mode,state}),{cause:error});}
    const layout=await f.page.evaluate(()=>{
     const h=document.querySelector('[data-sv-featured]'),rect=n=>n.getBoundingClientRect().toJSON();
     return {mode:document.body.dataset.stHeroMode,footerBottom:getComputedStyle(h.querySelector('.svFeaturedFooter')).bottom,hero:rect(h),footer:rect(h.querySelector('.svFeaturedFooter')),actions:rect(h.querySelector('.dsHeroActions')),buttons:[...h.querySelectorAll('.svFeaturedFooter button')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
    },mode);
    assert(layout.footer.top>=layout.actions.bottom+8,JSON.stringify({width,mode,layout}));
    assert(layout.footer.bottom<=layout.hero.bottom,JSON.stringify({width,mode,layout}));
    assert(layout.buttons.every(b=>b.width>=(width<=860?40:44)&&b.height>=44&&b.left>=0&&b.right<=width));assert.equal(layout.overflow,false);
   }
  }finally{await f.context.close();}
 }
});
test('reduced motion disables edge-arrow fades on touch tablets',{skip:!available},async()=>{
 const f=await open(820,{reduced:true});try{
  const arrows=await f.page.locator('[data-sv-featured-prev],[data-sv-featured-next]').evaluateAll(nodes=>nodes.map(n=>({opacity:getComputedStyle(n).opacity,transition:getComputedStyle(n).transitionDuration})));
  assert(arrows.every(n=>n.opacity==='1'&&n.transition.split(',').every(value=>parseFloat(value)===0)),JSON.stringify(arrows));
 }finally{await f.context.close();}
});


test('phone features use slim visible pills, readable actions and a black tail across glass modes',{skip:!available},async()=>{
 for(const width of [320,390]){
  const f=await open(width,{reduced:true});try{
   for(const glass of ['liquid','subtle','off']){
    await f.page.evaluate(({glass,scale})=>{document.body.dataset.stGlass=glass;document.body.style.setProperty('--st-ui-scale',scale);},{glass,scale:width===320?'1.2':'1'});
    const result=await f.page.evaluate(()=>{
     const hero=document.querySelector('[data-sv-featured]'),r=n=>n.getBoundingClientRect().toJSON(),play=hero.querySelector('[data-play-id]');
     return {hero:r(hero),nav:r(document.querySelector('.netflixNav')),brand:getComputedStyle(document.querySelector('.svBrandLogo')).display,wordmark:!!document.querySelector('.netflixWordmark'),
      actions:[...hero.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>{const style=getComputedStyle(n,'::before'),pane=n.querySelector('.svNavMatchedLens');return {rect:r(n),top:parseFloat(style.top),bottom:parseFloat(style.bottom),face:style.backgroundColor,transform:style.transform,pane:pane?{height:r(pane).height,display:getComputedStyle(pane).display,filter:getComputedStyle(pane).backdropFilter}:null};}),
      playColor:getComputedStyle(play).color,shade:getComputedStyle(hero.querySelector('.dsHeroGlass')).backgroundImage,mask:getComputedStyle(hero.querySelector('.dsHeroGlass')).maskImage,glow:Number(getComputedStyle(document.querySelector('.svHeroSpill')).opacity),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(result.overflow,false,JSON.stringify({width,glass,result}));
    assert(result.actions.every(a=>a.rect.height>=44&&a.rect.width>=44&&a.rect.left>=0&&a.rect.right<=width),JSON.stringify({width,glass,result}));
    assert(result.actions.every(a=>Math.abs(a.rect.height-a.top-a.bottom-36)<1),JSON.stringify({width,glass,result}));
    assert(result.actions.every(a=>a.transform==='none'),'Legacy shine must not displace the visible pill');assert.equal(result.actions[0].face,'rgb(255, 255, 255)');assert.equal(result.playColor,'rgb(16, 17, 21)');
    if(glass==='liquid')assert(result.actions.every(a=>a.pane&&a.pane.display!=='none'&&Math.abs(a.pane.height-36)<1&&a.pane.filter!=='none'),'Liquid controls keep a visible, inset live optical pane');
    assert(result.nav.width<=220);assert.equal(result.wordmark,false);assert.notEqual(result.brand,'none');
    assert.equal(result.mask,'none');assert(result.shade.endsWith('rgb(0, 0, 0) 100%)'),result.shade);assert(result.glow<=.12);
    assert.equal(await f.page.getByRole('link',{name:'More info',exact:true}).getAttribute('href'),'/movie/346698');
   }
  }finally{await f.context.close();}
 }
});

test('holding Space on the active progress control pauses immediately and native keyup does not resume it',{skip:!available},async()=>{
 const f=await open(390);try{
  const active=f.page.locator('[data-sv-featured-go][aria-current="true"]');await active.focus();
  await f.page.keyboard.down('Space');assert.match(await active.getAttribute('aria-label'),/Resume automatic rotation/);
  await f.page.keyboard.up('Space');assert.match(await active.getAttribute('aria-label'),/Resume automatic rotation/);
  assert.equal(await f.page.evaluate(()=>document.querySelector('[data-sv-featured]').getAnimations({subtree:true}).filter(a=>a.effect.target.matches('[data-sv-featured-progress]')).length),0);
  await active.press('Enter');assert.match(await active.getAttribute('aria-label'),/Pause automatic rotation/);
 }finally{await f.context.close();}
});

test('saved movie actions fit small phones and outgoing copies preserve their layout',{skip:!available},async()=>{
 for(const width of [320,390]){
  const f=await open(width,{subtle:true,resume:true,height:720});try{
   await f.page.evaluate(()=>document.body.style.setProperty('--st-ui-scale','1.2'));
   const read=()=>f.page.evaluate(()=>{
    const hero=document.querySelector('[data-sv-featured]'),copy=hero.querySelector(':scope>.dsHeroContent'),r=n=>n.getBoundingClientRect().toJSON();
    return {hero:r(hero),copy:r(copy),nav:r(document.querySelector('.netflixNav')),footer:r(hero.querySelector('.svFeaturedFooter')),rows:r(document.querySelector('[data-st-home-rows]')).top+scrollY,
     actions:[...copy.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>({rect:r(n),scroll:n.scrollWidth,client:n.clientWidth,text:n.textContent.trim(),href:n.getAttribute('href'),filter:getComputedStyle(n).backdropFilter,faceFilter:getComputedStyle(n,'::before').backdropFilter})),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   const before=await read();assert.equal(before.actions.length,4);assert.equal(before.overflow,false);
   assert(before.copy.top>=before.nav.bottom+8,JSON.stringify({width,before}));
   assert(before.actions.every(a=>a.rect.left>=0&&a.rect.right<=width&&a.rect.height>=44&&a.scroll<=a.client+1),JSON.stringify({width,before}));
   assert.match(before.actions[0].text,/Resume.*1:02:03/);assert.match(before.actions[0].href,/resume=1/);assert(!before.actions[1].href.includes('resume='));
   assert(before.footer.top>=before.actions.at(-1).rect.bottom+8);
   assert(before.actions.every(a=>a.filter==='none'));assert.match(before.actions[2].faceFilter,/blur\(18px\)/);
   const moving=await f.page.evaluate(async()=>{
    await SwiflyFeatured.select(1);
    for(const a of document.getAnimations())if([700,1000].includes(a.effect.getTiming().duration)){a.pause();a.currentTime=350;}
    await new Promise(requestAnimationFrame);
    const ghost=document.querySelector('[data-sv-featured-ghost]');
    return {marker:ghost.querySelector('.dsHeroActions').classList.contains('svFeaturedResuming'),actions:[...ghost.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,filter:getComputedStyle(n,'::before').backdropFilter})),unsafe:ghost.querySelectorAll('[data-resume-action],[href]').length,faceFilter:getComputedStyle(document.querySelector('.dsHero > .dsHeroContent .svFeaturedInfo'),'::before').backdropFilter};
   });
   assert.equal(moving.marker,true);assert.equal(moving.unsafe,0);assert(moving.actions.every((a,i)=>Math.abs(a.width-before.actions[i].rect.width)<1&&a.filter==='none'),JSON.stringify({width,before,moving}));assert.match(moving.faceFilter,/blur\(4px\)/);
   await f.page.evaluate(()=>{for(const a of document.getAnimations())if([700,1000].includes(a.effect.getTiming().duration))a.finish();});
   await f.page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedState==='idle');
   const after=await read();assert.equal(after.actions.length,3);assert(Math.abs(after.rows-before.rows)<1);
   // Narrow decorated/live info widths must equal their inert copies, too.
   const widths=await f.page.evaluate(async()=>{
    const live=[...document.querySelectorAll('.dsHero > .dsHeroContent .dsHeroActions > :is(a,button)')].map(n=>n.getBoundingClientRect().width);
    await SwiflyFeatured.select(0);
    const ghost=[...document.querySelectorAll('[data-sv-featured-ghost] .dsHeroActions > :is(a,button)')].map(n=>n.getBoundingClientRect().width);return {live,ghost};
   });
   assert(widths.live.every((w,i)=>Math.abs(w-widths.ghost[i])<1),JSON.stringify({width,widths}));
   await f.page.evaluate(()=>{for(const a of document.getAnimations())if([700,1000].includes(a.effect.getTiming().duration))a.finish();});
   await f.page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedState==='idle');
   const restored=await read();assert.equal(restored.actions.length,4);assert(restored.actions.every(a=>a.rect.right<=width&&a.scroll<=a.client+1));
  }finally{await f.context.close();}
 }
});

test('iPad keeps a decoded featured image mounted after scrolling away and switching titles',{skip:!available},async()=>{
 const f=await open(820,{tablet:true});const page=f.page;
 try{
   await page.waitForFunction(()=>{
     const hero=document.querySelector('[data-sv-featured]');
     return document.documentElement.dataset.svAppleTablet==='true' &&
       hero?.querySelector('.dsHeroBg[data-sv-featured-active="true"] > .svFeaturedNativeArt');
   });
   await page.locator('[data-sv-featured-go="0"]').click();
   const first=await page.evaluate(()=>{
     const hero=document.querySelector('[data-sv-featured]');
     const active=hero.querySelector('.dsHeroBg[data-sv-featured-active="true"]');
     const image=active.querySelector('.svFeaturedNativeArt');
     window.__ipadFeaturedInitialImage=image;
     return {
       complete:image.complete,naturalWidth:image.naturalWidth,
       activeBackground:getComputedStyle(active).backgroundImage,
       masked:getComputedStyle(hero.querySelector('.dsHeroArt')).maskImage,
       rendered:getComputedStyle(image).display,
       source:image.currentSrc||image.src
     };
   });
   assert(first.complete&&first.naturalWidth>0,JSON.stringify(first));
   assert.equal(first.activeBackground,'none','decoded img—not a CSS background—owns the iPad art');
   assert.equal(first.masked,'none','full-hero mask is replaced by a simple fade overlay');
   assert.equal(first.rendered,'block');
   await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   const after=await page.evaluate(()=>{
     const active=document.querySelector('[data-sv-featured] .dsHeroBg[data-sv-featured-active="true"]');
     return {sameImage:active.querySelector('.svFeaturedNativeArt')===window.__ipadFeaturedInitialImage,
       visible:!active.hidden&&getComputedStyle(active).opacity!=='0',
       native:active.querySelector('.svFeaturedNativeArt').naturalWidth>0};
   });
   assert.deepEqual(after,{sameImage:true,visible:true,native:true},
     'returning to the featured area must not create another native image');
   await page.evaluate(()=>window.SwiflyFeatured.select(1));
   await page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedIndex==='1');
   const second=await page.evaluate(()=>{
     const hero=document.querySelector('[data-sv-featured]');
     const active=hero.querySelector('.dsHeroBg[data-sv-featured-active="true"]');
     const inactive=hero.querySelector('.dsHeroBg:not([data-sv-featured-active="true"])');
     return {newArt:active.querySelector('.svFeaturedNativeArt')?.complete,
       newWidth:active.querySelector('.svFeaturedNativeArt')?.naturalWidth,
       previousRetained:inactive.querySelector('.svFeaturedNativeArt')===window.__ipadFeaturedInitialImage,
       prevDisplay:getComputedStyle(inactive).display};
   });
   assert(second.newArt&&second.newWidth>0,JSON.stringify(second));
   assert.equal(second.previousRetained,true,'the previous image remains mounted through the transition');
   assert.equal(second.prevDisplay,'block','hidden secondary slot stays composed rather than display:none');
 }finally{await f.context.close();}
});
