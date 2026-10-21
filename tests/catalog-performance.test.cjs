'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function actualStyles(){return ['base.css','clean.css','details.css','motion.css','aurora.css','finish.css','polish.css','hero-fade.css','experience.css','cinema.css','performance.css'].map(name=>'<style>'+source(name)+'</style>').join('');}

test('The live Aurora drifts on one bounded layer without permanent promotion hints',()=>{
 const env=browser(actualStyles()+'<div class="svAuroraBackground"><i class="svAuroraRibbon svAuroraRibbon--first"></i><i class="svAuroraRibbon svAuroraRibbon--second"></i></div>'),w=env.window,d=w.document;
 d.body.dataset.stBackdrop='aurora';d.body.dataset.svAuroraState='live';
 const ribbon=d.querySelector('.svAuroraRibbon'),style=w.getComputedStyle(ribbon);
 assert(source('aurora.css').includes('aurora-ribbon.svg'),'The requested Aurora artwork stays present');
 assert.equal(style.animationName,'svAuroraDrift','the live Aurora honors the requested motion setting');
 assert.equal(style.willChange,'auto');env.finish();
});

test('Desktop catalog art, wordmark and primary action do not run obsolete continuous animations',()=>{
 const env=browser(actualStyles()+'<a class="netflixWordmark">SwiflyTV</a><main><section class="dsHero"><div class="dsHeroBg"></div><div class="dsHeroActions"><button class="dsPrimaryBtn">Watch</button></div></section></main>');
 for(const selector of ['.netflixWordmark','.dsHeroBg','.dsHeroActions>.dsPrimaryBtn']) {
  assert.equal(env.window.getComputedStyle(env.window.document.querySelector(selector)).animation,'none',selector+' must not invalidate styles on every idle frame');
 }
 env.finish();
});

test('Catalog cards and rails do not retain obsolete transform/filter promotion hints',()=>{
 const env=browser(actualStyles()+'<section class="dsRow svCatalogRow"><div class="movieRail dsRail"><article class="movieCard dsCard"><a class="posterWrap dsThumb">Title</a></article></div></section>'),w=env.window,d=w.document;
 for(const selector of ['.svCatalogRow','.movieRail','.movieCard','.dsThumb'])assert.equal(w.getComputedStyle(d.querySelector(selector)).willChange,'auto',selector+' should not reserve an idle compositor layer');
 assert.equal(w.getComputedStyle(d.querySelector('.movieRail')).transform,'none');env.finish();
});

test('Completed row reveals release their transform while pending rows can still rise',()=>{
 const env=browser(actualStyles()+'<section class="svMotionReveal svMotionVisible">Visible row</section><section class="svMotionReveal">Waiting row</section>'),w=env.window,d=w.document;
 assert.equal(w.getComputedStyle(d.querySelector('.svMotionVisible')).transform,'none');
 assert.notEqual(w.getComputedStyle(d.querySelector('.svMotionReveal:not(.svMotionVisible)')).transform,'none');env.finish();
});
