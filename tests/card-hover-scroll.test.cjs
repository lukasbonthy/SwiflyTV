'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {browser,source,cleanup} = require('./ui-helpers.cjs');
test.afterEach(cleanup);

test('vertical wheel input above a movie rail marks active scrolling, then settles without a RAF loop', async () => {
  const env=browser('<div class="movieRail"><article class="movieCard"><div class="dsCardArtwork"><a class="dsThumb">Film</a></div></article></div>');
  const w=env.window, d=w.document, card=d.querySelector('.dsThumb');
  w.boot('scroll.js');
  const events=[];
  d.addEventListener('swifly:card-scroll-start',()=>events.push('start'));
  d.addEventListener('swifly:card-scroll-end',()=>events.push('end'));
  card.dispatchEvent(new w.WheelEvent('wheel',{deltaY:180,bubbles:true,cancelable:true}));
  assert.equal(d.documentElement.dataset.svCardScrolling,'true');
  assert.deepEqual(events,['start']);
  card.dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
  assert.deepEqual(events,['start'],'moving through more cards must not re-announce scrolling');
  assert.equal(w.frameCount(),0,'the guard has no animation loop');
  await new Promise(resolve=>setTimeout(resolve,210));
  assert.equal(d.documentElement.dataset.svCardScrolling,undefined);
  assert.deepEqual(events,['start','end']);
  w.SwiflyPremiumScroll.destroy();env.finish();
});

test('nested rail movement and focused controls do not interrupt normal UI', async () => {
  const env=browser('<div class="movieRail"><a class="dsThumb">Film</a></div><div class="svDetailViewport"></div>');
  const w=env.window,d=w.document;
  w.boot('scroll.js');
  d.querySelector('.dsThumb').dispatchEvent(new w.WheelEvent('wheel',{deltaX:120,deltaY:10,bubbles:true,cancelable:true}));
  assert.equal(d.documentElement.dataset.svCardScrolling,undefined,'horizontal rail movement stays native');
  d.querySelector('.svDetailViewport').dispatchEvent(new w.Event('scroll',{bubbles:false}));
  assert.equal(d.documentElement.dataset.svCardScrolling,undefined,'nested modal scroll is not page scroll');
  d.dispatchEvent(new w.Event('scroll'));
  assert.equal(d.documentElement.dataset.svCardScrolling,'true');
  w.SwiflyPremiumScroll.destroy();
  assert.equal(d.documentElement.dataset.svCardScrolling,undefined);
  env.finish();
});

test('scrolling caches the hovered lens, defers new hover optics and keeps focus responsive', async () => {
  const markup='<div class="dsHeroActions"><button class="dsPrimaryBtn">Play featured</button></div>'+
    '<article class="movieCard"><div class="dsCardArtwork"><a class="dsThumb">Poster</a>'+
    '<div class="dsCardQuickActions"><a class="dsMiniBtn">Play</a><button class="dsMiniBtn">Save</button><button class="dsMiniBtn">Like</button></div></div></article>';
  const env=browser(markup), w=env.window, d=w.document;
  const media=w.matchMedia;
  w.matchMedia=query=>query==='(hover: hover)'?{matches:true,addEventListener(){},removeEventListener(){}}:media(query);
  const observed=new Set();let callback;
  w.IntersectionObserver=class {
    constructor(cb){callback=cb;}
    observe(node){observed.add(node);}
    unobserve(node){observed.delete(node);}
    disconnect(){observed.clear();}
  };
  const mounts=new Set();
  w.SwiflyLiquidGlass={mount(node){mounts.add(node);return {enabled:true,supported:true,destroy(){mounts.delete(node);}};}};
  w.boot('scroll.js');w.boot('liquid-glass/surfaces.js');
  callback([...observed].map(target=>({target,isIntersecting:true})));
  const artwork=d.querySelector('.dsCardArtwork'), controls=[...d.querySelectorAll('.dsMiniBtn')],hero=d.querySelector('.dsPrimaryBtn');
  const quickCount=()=>controls.filter(host=>mounts.has(host.querySelector('.svNavMatchedLens'))).length;
  assert(mounts.has(hero.querySelector('.svNavMatchedLens')));
  artwork.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(quickCount(),3,'stationary hover retains the original glass refraction');
  const oldMatches=artwork.matches.bind(artwork);
  artwork.matches=selector=>selector===':hover'?true:oldMatches(selector);
  artwork.dispatchEvent(new w.WheelEvent('wheel',{deltaY:130,bubbles:true,cancelable:true}));
  assert.equal(quickCount(),3,'wheel input preserves the existing lens while CSS switches it to soft glass');
  artwork.matches=selector=>selector===':hover'?false:oldMatches(selector);
  artwork.dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true,relatedTarget:d.body}));
  assert.equal(quickCount(),0,'a departing card releases its lens');
  artwork.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(quickCount(),0,'new passing hover must not mount optics while moving');
  controls[1].focus();
  assert.equal(quickCount(),3,'focus keeps glass reachable even while scrolling');
  controls[1].blur();
  artwork.matches=selector=>selector===':hover'?false:oldMatches(selector);
  // Reset currently hovered optics with a real pointer departure.
  artwork.dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true,relatedTarget:d.body}));
  await new Promise(resolve=>setTimeout(resolve,200));
  artwork.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(quickCount(),3,'normal hover comes back once the page stops');
  assert(mounts.has(hero.querySelector('.svNavMatchedLens')),'main hero lens never changes');
  w.SwiflyGlassSurfaces.destroy();w.SwiflyPremiumScroll.destroy();env.finish();
});

test('scroll guard continues to defer incidental metadata prefetch',()=>{
  const css=source('performance.css');
  assert.match(css,/data-sv-card-scrolling="true"/);
  assert.match(css,/@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 861px\)/);
  assert.match(css,/\.dsCardArtwork:not\(:focus-within\)/);
  assert.match(css,/\.dsCardQuickActions \.svLiquidPane/);
  assert.doesNotMatch(css,/data-sv-card-scrolling="true"[^\n]*\.netflixNav/);
  const detail=source('details.js');
  assert.match(detail,/swifly:card-scroll-start/);
  assert.match(detail,/dataset\.svCardScrolling/);
});
