const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { loadServer } = require('./ui-helpers.cjs');
const {readShellStyle}=require('../lib/shell-styles');
const artworkEntry = require('../ui/artwork-entry');
const asset = name => readShellStyle('/assets/'+name)??fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const available = fs.existsSync(chromium.executablePath()) || fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

async function artworkEvidence(page,name,details){
 const dir=process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR;
 if(dir)fs.mkdirSync(dir,{recursive:true});
 const screenshot=await page.screenshot({scale:'device',...(dir?{path:path.join(dir,name+'.png')}:{})});
 if(dir){
  const state=await page.evaluate(()=>{const style=selector=>{const node=document.querySelector(selector),css=node&&getComputedStyle(node);return node&&{classes:node.className,opacity:css.opacity,visibility:css.visibility,background:css.backgroundImage,mask:css.maskImage,box:node.getBoundingClientRect().toJSON()};};return {artworkState:document.documentElement.dataset.svArtworkState,scene:style('[data-sv-browse-scene]'),hero:style('.dsHero'),art:style('.dsHeroArt'),background:style('.dsHeroBg'),curtain:style('#svArtworkCurtain')};});
  fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({state,...details},null,2));
 }
 return screenshot;
}

async function pixelDifference(page, first, second) {
  return page.evaluate(async ({ first, second }) => {
    const decode = async source => {
      const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await decode(first), b = await decode(second); let sum = 0, count = 0;
    for (let index = 0; index < a.length; index += 4) for (let channel = 0; channel < 3; channel++) {
      sum += Math.abs(a[index + channel] - b[index + channel]); count++;
    }
    return sum / count;
  }, { first, second });
}

test('receding full-bleed artwork keeps feathered edges and a continuous fade at fractional pixel scales',{skip:!available&&'Chromium is not installed'},async()=>{
 const api=loadServer(),browser=await chromium.launch({headless:true});
 try{
  const movie={id:346698,title:'Edge study',backdrop_path:'/edge.jpg',images:{logos:[]}};
  api.setTmdb(async endpoint=>endpoint==='/movie/346698'?movie:{results:[]});let html;await api.homePage({},{send:value=>html=value});
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g,(_tag,url)=>url.startsWith('/assets/')?'<style>'+asset(url.slice(8).split('?')[0])+'</style>':'');
  for(const deviceScaleFactor of [1,1.25,2]){
   const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor});
   const evidence='details-receding-artwork-dpr-'+String(deviceScaleFactor).replace('.','-');
   try{
   // Keep the real responsive URL, decoding and artwork-entry lifecycle.
   // Empty image responses plus a late CSS gradient do not represent the
   // decoded scene that the details controller actually recedes.
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='image.tmdb.org'?route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><path fill="#4ca5df" d="M0 0h1600v900H0z"/></svg>'}):route.fulfill({body:''}));await page.setContent(html);
   await page.addStyleTag({content:'body.svCleanShell{background:#000!important}body::before,body::after{display:none!important}.topbar,.mobileNav,[data-st-home] .dsHeroContent,[data-st-home] .dsContent,[data-st-home] .svHeroLightBridge{visibility:hidden!important}body.svCleanShell main[data-st-home]>.dsHero>.dsHeroGlass{background:none!important}'});
   await page.addScriptTag({content:artworkEntry});
   await page.waitForFunction(()=>document.documentElement.dataset.svArtworkState==='ready'&&document.querySelector('.dsHeroBg').classList.contains('svArtworkReady')&&getComputedStyle(document.querySelector('.dsHeroBg')).opacity==='1'&&getComputedStyle(document.querySelector('#svArtworkCurtain')).visibility==='hidden');
   await artworkEvidence(page,evidence+'-decoded');
   const motions=await page.evaluate(()=>{const root=document.documentElement,scene=document.querySelector('[data-sv-browse-scene]');root.style.setProperty('--sv-detail-page-width',root.clientWidth+'px');root.style.setProperty('--sv-detail-depth-time','1000ms');root.style.setProperty('--sv-detail-depth-ease','linear');root.classList.add('svDetailsOpen');getComputedStyle(scene).maskImage;root.dataset.svDetailDepth='back';getComputedStyle(scene).scale;const motions=scene.getAnimations();for(const motion of motions){motion.pause();motion.currentTime=0;}window.__edgeMotions=motions;return motions.map(motion=>motion.transitionProperty);});
   assert(motions.includes('scale')&&motions.includes('--sv-detail-feather'),'artwork scale and edge softness must animate together');
   for(const time of [500,1000]){
    const geometry=await page.evaluate(time=>{for(const motion of __edgeMotions)motion.currentTime=time;const scene=document.querySelector('[data-sv-browse-scene]').getBoundingClientRect(),hero=document.querySelector('.dsHero').getBoundingClientRect();return {left:scene.left,width:scene.width,top:hero.top,height:hero.height,dpr:devicePixelRatio};},time);
    const screenshot=await artworkEvidence(page,evidence+'-time-'+time,{geometry});
    const samples=await page.evaluate(async({encoded,g})=>{
     const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
     const at=(x,y)=>{const i=(Math.max(0,Math.min(canvas.height-1,Math.round(y*g.dpr)))*canvas.width+Math.max(0,Math.min(canvas.width-1,Math.round(x*g.dpr))))*4;return Math.max(data[i],data[i+1],data[i+2]);};
     const row=[];for(let x=g.left-4;x<g.left+32;x+=1/g.dpr)row.push(at(x,g.top+g.height*.3));const fade=[];for(let y=g.top+g.height*.55;y<g.top+g.height*.98;y+=1/g.dpr)fade.push(at(g.left+g.width*.72,y));
     const jump=values=>Math.max(...values.slice(1).map((value,index)=>Math.abs(value-values[index])));
     return {edgeJump:jump(row),peak:Math.max(...row),fadeJump:jump(fade),fadeDrop:fade[0]-fade.at(-1)};
    },{encoded:screenshot.toString('base64'),g:geometry});
    if(process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR)fs.writeFileSync(path.join(process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR,evidence+'-time-'+time+'-samples.json'),JSON.stringify(samples,null,2));
    assert(samples.peak>140,'the test must actually render the bright artwork: '+JSON.stringify({deviceScaleFactor,time,...samples}));
    assert(samples.edgeJump<45,'the shrunken crop must blend into the page instead of exposing a hard line: '+JSON.stringify({deviceScaleFactor,time,...samples}));
    assert(samples.fadeJump<12&&samples.fadeDrop>20,'the artwork fade must remain continuous while receding: '+JSON.stringify({deviceScaleFactor,time,...samples}));
   }
   }catch(error){await artworkEvidence(page,evidence+'-failure',{error:error.message});throw error;}finally{await page.close();}
  }
 }finally{await browser.close();api.io.close();}
});

for (const width of [360, 1024]) for (const native of [false, true]) {
  test(`${width}px ${native ? 'native' : 'refractive'} hero keeps a clear Play action and refractive secondary actions`, { skip: !available && 'Chromium is not installed' }, async () => {
    const api = loadServer(), browser = await chromium.launch({ headless: true });
    try {
      const hero = { id: 1236045, title: 'Animals', backdrop_path: '/test.jpg', poster_path: '/poster.jpg', release_date: '2026-01-01', vote_average: 7.2, overview: 'When the son of a mayoral candidate is kidnapped, his parents have a few hours to find the ransom payment.' };
      api.setTmdb(async () => ({ results: [hero] }));
      let html; await api.homePage({}, { send(value) { html = value; } });
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*href="([^\"]+)"[^>]*>/g, (_tag, url) => url.startsWith('/assets/') ? '<style>' + asset(url.slice(8).split('?')[0]) + '</style>' : '');
      const page = await browser.newPage({ viewport: { width, height: width === 360 ? 650 : 900 }, colorScheme: 'dark', ...(native ? { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15' } : {}) });
      await page.route('**/*', route => route.fulfill({ status: 200, body: '' })); await page.setContent(html);
      // Use a textured photograph substitute, retaining the real hero hierarchy,
      // styles and entrance animations that previously blocked the backdrop.
      await page.addStyleTag({ content: 'body.svCleanShell .dsHeroBg{background-image:repeating-linear-gradient(31deg,#ddd 0 8px,#222 8px 16px)!important}.dsHeroActions>:is(a,button){transition:none!important}' });
      for (const name of ['liquid-glass/liquid-glass.js', 'liquid-glass/surfaces.js']) await page.addScriptTag({ content: asset(name) });
      await page.waitForFunction(() => document.querySelectorAll('.dsHeroActions .svNavMatchedLens').length === 3);
      if (!native) await page.waitForFunction(() => [...document.querySelectorAll('.dsHeroActions .svNavMatchedLens')].every(pane => pane.dataset.swiflyRenderer === 'svg'));
      await page.waitForTimeout(1100);
      const controls = page.locator('.dsHeroActions > :is(a,button)'); assert.equal(await controls.count(), 3);
      const primary=await controls.first().evaluate(node=>({color:getComputedStyle(node).color,fill:getComputedStyle(node.querySelector('.svNavMatchedLens')).backgroundColor}));
      assert.equal(primary.color,'rgb(16, 17, 21)');assert.equal(primary.fill,'rgba(255, 255, 255, 0.94)','Play has an intentionally bright face');
      for (let index = 1; index < 3; index++) {
        const control = controls.nth(index), pane = control.locator('.svNavMatchedLens');
        const first = (await control.screenshot()).toString('base64');
        await pane.evaluate((node, native) => {
          if (native) node.style.setProperty('backdrop-filter', 'none', 'important');
          else node.querySelectorAll('feDisplacementMap').forEach(map => map.setAttribute('scale', '0'));
        }, native);
        const second = (await control.screenshot()).toString('base64');
        const difference = await pixelDifference(page, first, second);
        assert(difference > 1.2, `${await control.innerText()} must visibly filter the artwork, not an empty ancestor layer (RGB delta ${difference.toFixed(2)})`);
      }
      assert.equal(await page.locator('.dsHeroActions').evaluate(node => getComputedStyle(node).filter), 'none', 'a completed entrance must release its backdrop boundary');
      assert.equal(await page.locator('.dsHeroActions').evaluate(node => getComputedStyle(node).animationName), 'svGlassSafeRise', 'the existing glass-safe entrance must remain');
    } finally { await browser.close(); await new Promise(resolve => api.io.close(resolve)); }
  });
}
