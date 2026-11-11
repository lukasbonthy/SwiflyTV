'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
let browser,api;
test.before(async()=>{if(available){browser=await chromium.launch({headless:true,executablePath});api=loadServer();}});
test.after(async()=>{await browser?.close();api?.io.close();});
const film=id=>({id,title:id===346698?'First movie':'Feature '+id,images:id===2?{logos:[{file_path:'/logo-2.svg',iso_639_1:'en'}]}:undefined,media_type:'movie',backdrop_path:'/scene-'+id+'.svg',poster_path:'/poster.svg',vote_average:7.5,release_date:'2026-01-01',overview:id===2?'A longer second overview to verify anchored actions while the real copy is replaced. '.repeat(4):'A film for tonight.'});
async function open(width,{subtle=false,reduced=false}={}){
 api.setTmdb(async endpoint=>endpoint==='/movie/346698'?film(346698):{results:[film(1),film(2),film(3),film(4)]});
 let html;await api.homePage({}, {send:value=>html=value});
 html=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attrs)=>/data-sv-featured-data/.test(attrs)?script:'');
 const context=await browser.newContext({viewport:{width,height:936},reducedMotion:reduced?'reduce':'no-preference',...(width<861?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage();
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),css=readShellStyle(url.pathname);
  if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:html});
  if(css!==undefined)return route.fulfill({contentType:'text/css',body:css});
  if(url.pathname.startsWith('/assets/')){const file=path.join(__dirname,'../public',url.pathname.slice(8));if(fs.existsSync(file)&&file.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(file)});}
  if(url.hostname==='image.tmdb.org')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="'+(url.pathname.includes('scene-2.')?'#cf3926':'#2056b1')+'"/><circle cx="300" cy="250" r="180" fill="#ffffff" opacity=".12"/></svg>'});
  return route.fulfill({body:'',contentType:'text/plain'});
 });
 await page.goto('https://swifly.test/');
 await page.evaluate(subtle=>{document.body.dataset.stGlass=subtle?'subtle':'liquid';},subtle);
 for(const name of ['liquid-glass/liquid-glass.js','liquid-glass/surfaces.js','clean/featured.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public',name),'utf8')});
 await page.waitForFunction(()=>document.querySelector('.svHeroSpill').dataset.svFeaturedPrepared==='true');
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
    ghostInert:ghost?.inert,ghostActions:ghost?.querySelectorAll('[href],[data-play-id],[data-watch-id],.svLiquidPane,filter,[data-swifly-renderer]').length,ghostFilters:[...ghost.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>getComputedStyle(n).backdropFilter),
    glow:[...hero.nextElementSibling.querySelectorAll('[data-sv-featured-glow]')].map(n=>({id:n.dataset.svFeaturedId,filter:getComputedStyle(n).filter,opacity:Number(getComputedStyle(n).opacity),source:n.style.backgroundImage.slice(0,25)})),controls:[...hero.querySelectorAll('[data-sv-featured-controls] button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(moving.state,'true');assert.equal(moving.logoReady,true);assert.equal(moving.sameActions,true);assert.equal(moving.play,'2');assert.equal(moving.watch,'2');assert.equal(moving.details,'/movie/2');
  assert.notEqual(moving.artTranslate,'none');assert.notEqual(moving.artTranslate,'0px');assert.notEqual(moving.copyTranslate,'none');
  assert.equal(moving.ghostInert,true);assert.equal(moving.ghostActions,0);assert(moving.ghostFilters.every(v=>v==='none'),JSON.stringify(moving));
  assert(moving.glow.every(g=>g.filter==='none'&&g.source.startsWith('url("data:image/png;')));assert(moving.glow.some(g=>g.id==='2'&&g.opacity>0&&g.opacity<1));
  assert(moving.controls.every(c=>c.width>=44&&c.height>=44));assert.equal(moving.overflow,false);
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
  assert.equal(state.moving,undefined);assert.equal(state.ghost,false);assert.equal(state.overflow,false);assert(state.controls.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=320),JSON.stringify(state));assert.equal(state.status.width,1);assert.equal(state.status.height,1);
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
   assert(layout.controls.every(n=>n.rect.width>=44&&n.rect.height>=44&&n.filter==='none'),JSON.stringify({width,layout}));
   assert(layout.footer.top>=layout.actions.bottom+8,JSON.stringify({width,layout}));
   assert(layout.tracks.every(n=>n.height===3&&n.width===(width<=860?32:48)),JSON.stringify({width,layout}));
   if(width<768)assert(layout.arrows.every(n=>n.display==='none'));
   else{
    assert(Math.abs(layout.arrows[0].rect.left-layout.hero.left-16)<1);
    assert(Math.abs(layout.hero.right-layout.arrows[1].rect.right-16)<1);
    assert(layout.arrows.every(n=>Math.abs((n.rect.top+n.rect.bottom-layout.hero.top-layout.hero.bottom)/2)<1));
   }
   if(width===820)assert(layout.arrows.every(n=>n.opacity===1),'Touch tablets need visible edge arrows without hovering');
   if(width<=860)assert(Math.abs((layout.positions.left+layout.controls.at(-1).rect.right)/2-layout.hero.width/2)<1);
   else assert(Math.abs(layout.footer.left-layout.copy.left)<1);
   assert.equal(layout.progress.length,1);assert.equal(layout.progress[0].duration,8000);assert.equal(layout.progress[0].iterations,1);
   await f.page.locator('[data-sv-featured-pause]').click();
   assert.equal(await f.page.locator('[data-sv-featured-pause]').getAttribute('aria-label'),'Resume featured movies');
   assert.equal(await f.page.evaluate(()=>document.querySelector('[data-sv-featured]').getAnimations({subtree:true}).filter(a=>a.effect.target.matches('[data-sv-featured-progress]')).length),0);
  }finally{await f.context.close();}
 }
});


test('Studio compact and banner controls clear the real action hit areas',{skip:!available},async()=>{
 for(const width of [320,390,820,1440]){
  const f=await open(width,{reduced:true});try{
   for(const mode of ['compact','banner']){
    const layout=await f.page.evaluate(mode=>{
     document.body.dataset.stHeroMode=mode;
     const h=document.querySelector('[data-sv-featured]'),rect=n=>n.getBoundingClientRect().toJSON();
     return {hero:rect(h),footer:rect(h.querySelector('.svFeaturedFooter')),actions:rect(h.querySelector('.dsHeroActions')),buttons:[...h.querySelectorAll('.svFeaturedFooter button')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
    },mode);
    assert(layout.footer.top>=layout.actions.bottom+8,JSON.stringify({width,mode,layout}));
    assert(layout.footer.bottom<=layout.hero.bottom,JSON.stringify({width,mode,layout}));
    assert(layout.buttons.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=width));assert.equal(layout.overflow,false);
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
