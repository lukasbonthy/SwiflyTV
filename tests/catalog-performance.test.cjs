'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);

function actualStyles(){return ['base.css','clean.css','details.css','motion.css','aurora.css','finish.css','polish.css','hero-fade.css','experience.css','cinema.css','performance.css'].map(name=>'<style>'+source(name)+'</style>').join('');}

test('The Aurora retains its original artwork without continuous animation or permanent layer hints',()=>{
 const env=browser(actualStyles()+'<div class="svAuroraBackground"><i class="svAuroraRibbon svAuroraRibbon--first"></i><i class="svAuroraRibbon svAuroraRibbon--second"></i></div>'),w=env.window,d=w.document;
 d.body.dataset.stBackdrop='aurora';d.body.dataset.svAuroraState='live';
 const ribbon=d.querySelector('.svAuroraRibbon'),style=w.getComputedStyle(ribbon);
 assert(source('aurora.css').includes('aurora-ribbon.svg'),'The requested Aurora artwork stays present');
 assert.equal(style.animationName,'none','An idle catalog must not continually composite the large ribbon');
 assert.equal(style.willChange,'auto');env.finish();
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
