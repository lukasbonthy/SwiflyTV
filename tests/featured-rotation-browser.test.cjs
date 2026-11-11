'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs'),{readShellStyle}=require('../lib/shell-styles');
const executablePath=process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH,available=fs.existsSync(executablePath||chromium.executablePath());
let browser,api;
test.before(async()=>{if(available){browser=await chromium.launch({headless:true,executablePath});api=loadServer();}});
test.after(async()=>{await browser?.close();api?.io.close();});
const film=id=>({id,title:id===346698?'First movie':'Feature '+id,media_type:'movie',backdrop_path:'/scene-'+id+'.svg',poster_path:'/poster.svg',vote_average:7.5,release_date:'2026-01-01',overview:id===2?'A longer second overview to verify stable reserved geometry while the real copy is replaced. '.repeat(4):'A film for tonight.'});
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
    sameActions:window.__featureActions.every(node=>node.isConnected),play:hero.querySelector('[data-play-id]').dataset.playId,details:hero.querySelector('.dsHeroActions > a:not([data-play-id])').getAttribute('href'),watch:hero.querySelector('[data-watch-id]').dataset.watchId,
    ghostInert:ghost?.inert,ghostActions:ghost?.querySelectorAll('[href],[data-play-id],[data-watch-id],.svLiquidPane,filter,[data-swifly-renderer]').length,ghostFilters:[...ghost.querySelectorAll('.dsHeroActions > :is(a,button)')].map(n=>getComputedStyle(n).backdropFilter),
    glow:[...hero.nextElementSibling.querySelectorAll('[data-sv-featured-glow]')].map(n=>({id:n.dataset.svFeaturedId,filter:getComputedStyle(n).filter,opacity:Number(getComputedStyle(n).opacity),source:n.style.backgroundImage.slice(0,25)})),controls:[...hero.querySelectorAll('[data-sv-featured-controls] button')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(moving.state,'true');assert.equal(moving.sameActions,true);assert.equal(moving.play,'2');assert.equal(moving.watch,'2');assert.equal(moving.details,'/movie/2');
  assert.notEqual(moving.artTranslate,'none');assert.notEqual(moving.artTranslate,'0px');assert.notEqual(moving.copyTranslate,'none');
  assert.equal(moving.ghostInert,true);assert.equal(moving.ghostActions,0);assert(moving.ghostFilters.every(v=>v==='none'),JSON.stringify(moving));
  assert(moving.glow.every(g=>g.filter==='none'&&g.source.startsWith('url("data:image/png;')));assert(moving.glow.some(g=>g.id==='2'&&g.opacity>0&&g.opacity<1));
  assert(moving.controls.every(c=>c.width>=44&&c.height>=44));assert.equal(moving.overflow,false);
  await page.evaluate(()=>{for(const a of document.getAnimations())if([700,1000].includes(a.effect.getTiming().duration))a.finish();});
  await page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedState==='idle');
  const after=await page.evaluate(()=>({rows:document.querySelector('[data-st-home-rows]').getBoundingClientRect().top+scrollY,copy:document.querySelector('.dsHero > .dsHeroContent').getBoundingClientRect().toJSON(),ghost:!!document.querySelector('[data-sv-featured-ghost]'),state:document.documentElement.dataset.svFeaturedMotion,slots:document.querySelectorAll('.dsHeroBg').length,glows:document.querySelectorAll('[data-sv-featured-glow]').length}));
  assert(Math.abs(before.rows-after.rows)<1,JSON.stringify({before,after}));assert(Math.abs(before.copy.y-after.copy.y)<1);assert.equal(after.ghost,false);assert.equal(after.state,undefined);assert.equal(after.slots,2);assert.equal(after.glows,2);
  const color=await page.evaluate(async()=>{
   const glow=document.querySelector('[data-sv-featured-glow][data-sv-featured-active="true"]'),image=new Image();image.src=glow.style.backgroundImage.slice(5,-2);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width:image.width,height:image.height,pixel:[...context.getImageData(32,18,1,1).data]};
  });
  assert.equal(color.width,64);assert.equal(color.height,36);assert(color.pixel[0]>color.pixel[2]*2,'The second glow must actually carry the red artwork palette');
 }finally{await f.context.close();}
});
test('320px controls fit and reduced motion keeps manual navigation immediate',{skip:!available},async()=>{
 const f=await open(320,{subtle:true,reduced:true});try{
  await f.page.getByRole('button',{name:'Next featured movie',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('[data-sv-featured]').dataset.svFeaturedIndex==='1');
  const state=await f.page.evaluate(()=>({moving:document.documentElement.dataset.svFeaturedMotion,ghost:!!document.querySelector('[data-sv-featured-ghost]'),overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('[data-sv-featured-controls] button')].map(n=>n.getBoundingClientRect().toJSON()),status:document.querySelector('[data-sv-featured-status]').getBoundingClientRect().toJSON()}));
  assert.equal(state.moving,undefined);assert.equal(state.ghost,false);assert.equal(state.overflow,false);assert(state.controls.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=320),JSON.stringify(state));assert.equal(state.status.width,1);assert.equal(state.status.height,1);
 }finally{await f.context.close();}
});
