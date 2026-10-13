/* Rendering regression: run after installing Playwright WebKit/Chromium.
   node scripts/verify-safari-glass.cjs [--webkit-only] [--art=/path/to/photo.jpg]
   SWIFLY_GLASS_QA_OUTPUT selects the screenshot directory (default: OS temp). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {webkit, chromium} = require('playwright-core');
const root = path.resolve(__dirname,'..');
const output = process.env.SWIFLY_GLASS_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'swifly-glass-'));
fs.mkdirSync(output,{recursive:true});
const read = file => fs.readFileSync(path.join(root,'public/liquid-glass',file),'utf8');
const artPath=process.argv.find(arg=>arg.startsWith('--art='))?.slice(6);
const art=artPath?'data:image/jpeg;base64,'+fs.readFileSync(artPath).toString('base64'):'';
const poster='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="#c89666"/><circle cx="40" cy="40" r="24" fill="#752f49"/></svg>');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${read('liquid-glass.css')}${read('controls.css')}
*{box-sizing:border-box}body{margin:0;background:#080b13;color:white;font-family:Arial,sans-serif}
.topbar{z-index:1400}
main{min-height:2300px}.scene{position:relative;height:1200px;overflow:hidden}
.art{position:absolute;inset:0;background-image:${art?'url("'+art+'")':'repeating-linear-gradient(105deg,#16396b 0 34px,#36619a 34px 68px,#64b7bf 68px 102px,#a24777 102px 136px)'};background-size:cover;background-position:center 42%;filter:brightness(1.1) saturate(1.24) contrast(1.035);mask-image:linear-gradient(to bottom,black 0%,black 60%,transparent 100%)}
.shade{position:absolute;inset:0;background:linear-gradient(0deg,#080b13,transparent 85%)}
h1{position:absolute;top:80px;left:80px;font-size:54px;line-height:1.1;margin:0}
.dsHeroActions{position:absolute;top:340px;left:80px;display:flex;gap:15px}
.nearbyDescription{position:absolute;top:280px;left:80px;width:580px;margin:0;font-size:19px;line-height:24px}
.dsPrimaryBtn,.dsSecondaryBtn{display:inline-flex;align-items:center;justify-content:center;padding:16px 32px;min-width:150px;min-height:56px;border-radius:28px;text-decoration:none;font-size:17px;font-weight:700;cursor:pointer}
.catalog{height:1100px;padding:45px;background:repeating-linear-gradient(90deg,#193547 0 30px,#591f3d 30px 60px)}
.fixturePosterWrap{position:absolute;top:24px;right:110px;width:80px;height:80px;mask-image:linear-gradient(black,transparent);filter:brightness(.9)}
.fixturePoster{display:block;width:80px;height:80px;transition:opacity .08s linear}
.navLeftCluster,.navRightCluster{font-weight:700;font-size:18px}.navLinks a{color:white;text-decoration:none}
</style></head><body class="svCleanShell" data-st-glass="liquid">
<header class="topbar" data-sv-liquid-nav><div class="container nav netflixNav">
<div class="svLiquidPane" data-swifly-glass data-glass-tint="0.035" data-glass-blur="3.6" data-glass-distortion="-220" data-glass-border-width="0.15" data-glass-map-opacity="0.98" aria-hidden="true"></div>
<div class="navLeftCluster">SwiflyTV<div class="navLinks"><a href="#home">Home</a><a href="#movies">Movies</a></div></div><div class="navRightCluster">Your profile</div>
</div></header><main><section class="scene"><div class="art"></div><div class="shade"></div><div class="fixturePosterWrap"><img class="fixturePoster" src="${poster}" alt="Poster"></div><h1>A film worth finding.</h1><p class="nearbyDescription">They have to get their hands dirty and expose a side of their lives they never intended to share.</p><div class="dsHeroActions"><button class="dsPrimaryBtn">Play</button><a class="dsSecondaryBtn" href="#details">Details</a></div></section><section class="catalog">Discovery</section></main>
</body></html>`;
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
function launchOptions(type) {
  const options={headless:true};
  if (type === chromium) options.args=['--no-sandbox'];
  // Optional local dependency bundle for restricted Linux QA environments.
  // Standard Playwright installations need no override.
  if (type === webkit && process.env.SWIFLY_WEBKIT_LIB_DIR) {
    const bundle=path.join(path.dirname(webkit.executablePath()),'minibrowser-wpe');
    options.executablePath=path.join(bundle,'bin/MiniBrowser');
    options.env={...process.env,LD_LIBRARY_PATH:[path.join(bundle,'lib'),path.join(bundle,'sys/lib'),process.env.SWIFLY_WEBKIT_LIB_DIR].join(':'),
      WEBKIT_EXEC_PATH:path.join(bundle,'bin'),WEBKIT_INJECTED_BUNDLE_PATH:path.join(bundle,'lib'),WEBKIT_INSPECTOR_RESOURCES_PATH:path.join(bundle,'share'),WEBKIT_SKIA_ENABLE_CPU_RENDERING:'1'};
  }
  return options;
}
async function verify(type,size,identity) {
  const browser=await type.launch(launchOptions(type));
  const name=type.name()+'-'+size.width;
  try {
    const context=await browser.newContext({viewport:size,...identity});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(fixture);
    await page.addScriptTag({content:read('liquid-glass.js')});
    await page.addScriptTag({content:read('surfaces.js')});
    const mode=type === webkit ? 'webkit-svg' : 'svg';
    await page.waitForFunction(mode=>document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer===mode,mode);
    await paint(page);
    const pane=page.locator('.netflixNav>.svLiquidPane');
    assert.equal(await page.locator('.dsHeroActions .svLiquidPane[data-swifly-renderer="'+mode+'"]').count(),2);
    if (type === webkit) {
      assert.equal(await pane.locator('[data-sv-glass-scene]').count(),1);
      assert.equal(await pane.locator('[data-sv-glass-scene] foreignObject').count(),0);
      assert.equal(await pane.locator('[data-sv-glass-scene]').textContent(),'');
      assert(await pane.evaluate(node=>{
        const scene=node.querySelector('[data-sv-glass-scene]'),url=document.querySelector('.fixturePoster').currentSrc;
        const image=[...scene.querySelectorAll('image')].find(image=>image.getAttribute('href')===url);
        return image&&scene.contains(image.closest('[mask]'))&&scene.contains(image.closest('[filter]'));
      }),'source wrapper fades and filters must include their descendant image');
      assert.equal(await page.locator('.dsHeroActions [data-sv-glass-scene]').allTextContents().then(texts=>texts.join('')),'','nearby description must not be reprinted on the buttons');
      const bodyBlur=pane.locator('filter[id$="-body"] > feGaussianBlur');
      assert.equal(await bodyBlur.count(),1,'the SVG must render the glass body as well as the bent rim');
      const box=await pane.boundingBox();
      const middle={x:Math.round(box.x+box.width*.40),y:Math.round(box.y+box.height*.5)-1,width:24,height:2};
      if(art){
        const soft=await page.screenshot({clip:middle});
        const deviation=await bodyBlur.getAttribute('stdDeviation');
        await bodyBlur.evaluate(node=>node.setAttribute('stdDeviation','0'));await paint(page);
        const sharp=await page.screenshot({clip:middle});
        assert(!soft.equals(sharp),'the SVG body must visibly soften photographic artwork');
        await bodyBlur.evaluate((node,value)=>node.setAttribute('stdDeviation',value),deviation);await paint(page);
      }
      const center=await page.screenshot({clip:middle});
      await pane.evaluate(node=>node.querySelector('[data-sv-glass-scene]').closest('[mask]').style.opacity='0');await paint(page);
      const withoutArtwork=await page.screenshot({clip:middle});
      assert(center.equals(withoutArtwork),'the refracted edge must remain clipped away from the soft glass body');
      await pane.evaluate(node=>node.querySelector('[data-sv-glass-scene]').closest('[mask]').style.removeProperty('opacity'));await paint(page);
      const bent=await pane.screenshot();
      const scales=await pane.evaluate(node=>[...node.querySelectorAll('feDisplacementMap[in2="map"]')].map(map=>{
        const scale=map.getAttribute('scale');map.setAttribute('scale','0');return scale;
      }));
      await paint(page);
      const straight=await pane.screenshot();
      assert(!bent.equals(straight),'changing displacement must change visible pixels in WebKit');
      await pane.evaluate((node,scales)=>node.querySelectorAll('feDisplacementMap[in2="map"]').forEach((map,i)=>map.setAttribute('scale',scales[i])),scales);
      await paint(page);
      await page.screenshot({path:path.join(output,name+'.png')});
      const graph=await pane.locator('filter').first().getAttribute('id');
      const sourceY=()=>pane.locator('[data-sv-glass-scene] g > rect').first().evaluate(node=>Number(node.getAttribute('y')));
      const yBefore=await sourceY();
      await page.evaluate(()=>window.scrollTo(0,280));await paint(page);
      await page.waitForFunction(()=>{
        const pane=document.querySelector('.netflixNav>.svLiquidPane'),source=document.querySelector('.scene');
        const layer=pane.querySelector('[data-sv-glass-scene] g > rect');
        const y=Number(layer.getAttribute('y'));
        return Math.abs(y-(source.getBoundingClientRect().top-pane.getBoundingClientRect().top))<1;
      });
      const yAfter=await sourceY();
      assert(Math.abs(Number(yAfter)-(Number(yBefore)-280))<1,'fixed navigation must sample the current scrolled background');
      assert.equal(await pane.locator('filter').first().getAttribute('id'),graph,'scrolling should reuse the graph');
      await page.evaluate(()=>document.querySelector('.art').style.backgroundImage='repeating-linear-gradient(90deg,#11cc55 0 22px,#9d2174 22px 44px)');
      await paint(page);
      assert((await pane.locator('[data-sv-glass-scene]').innerHTML()).includes('17, 204, 85'),'dynamic artwork must update');
      await page.evaluate(()=>{
        window.sampleChanges=0;
        window.sampleObserver=new MutationObserver(()=>window.sampleChanges++);
        window.sampleObserver.observe(document.querySelector('[data-sv-glass-scene]'),{childList:true,subtree:true});
      });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>window.sampleChanges),0,'the SVG must remain idle without mutation feedback');
      await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('h1').textContent='New featured movie';});
      await paint(page);assert.equal(await pane.locator('[data-sv-glass-scene]').textContent(),'');
      await page.evaluate(()=>document.querySelector('.fixturePoster').style.opacity='0');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fixturePoster')).opacity==='0');await paint(page);
      await page.evaluate(()=>document.querySelector('.fixturePoster').style.opacity='1');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fixturePoster')).opacity==='1');await paint(page);
      const sampledOpacity=await pane.evaluate(node=>{
        const url=document.querySelector('.fixturePoster').currentSrc;
        const image=[...node.querySelectorAll('[data-sv-glass-scene] image')].find(image=>image.getAttribute('href')===url);
        return image?Number(image.closest('g[opacity]')?.getAttribute('opacity')||1):0;
      });
      assert.equal(sampledOpacity,1,'completed fades must update the sampled source opacity');
    } else {
      assert.equal(await pane.locator('.svWebkitGlassOptics').count(),0);
      await page.screenshot({path:path.join(output,name+'.png')});
    }
    await page.evaluate(()=>{window.playClicks=0;document.querySelector('.dsPrimaryBtn').addEventListener('click',()=>window.playClicks++);});
    await page.locator('.dsPrimaryBtn').click();assert.equal(await page.evaluate(()=>window.playClicks),1);
    await page.evaluate(()=>document.body.dataset.stGlass='off');await paint(page);
    assert.equal(await pane.locator('svg').count(),0);
    await page.evaluate(()=>document.body.dataset.stGlass='liquid');await paint(page);
    await page.waitForFunction(mode=>document.querySelector('.netflixNav>.svLiquidPane')?.dataset.swiflyRenderer===mode,mode);
    assert.deepEqual(errors,[]);
    console.log(name+': visible refraction, scroll alignment, source updates, idle lifecycle and interaction PASS');
    await context.close();
  } finally {await browser.close();}
}
(async()=>{
  const ipad={userAgent:'Mozilla/5.0 (iPad; CPU OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/155.0.8059.37 Mobile/15E148 Safari/604.1',hasTouch:true,isMobile:true};
  await verify(webkit,{width:1024,height:768},ipad);
  await verify(webkit,{width:768,height:1024},ipad);
  await verify(webkit,{width:1366,height:900},{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'});
  if (!process.argv.includes('--webkit-only')) await verify(chromium,{width:1280,height:800},{});
  console.log('Screenshots: '+output);
})().catch(error=>{console.error(error);process.exitCode=1;});
