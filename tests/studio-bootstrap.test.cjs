'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,loadServer,cleanup}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
test('prepaint uses the same effective tokens as live Studio without mutating raw choices',()=>{
 const b=browser('',{reduced:true}),w=b.window;w.eval(source('studio/config.js'));const C=w.SwiflyStudioConfig,raw=C.validate({customColors:true,accentColor:'#137abc',canvasColor:'#111111',glassBlur:23,reduceMotion:false});
 assert.equal(typeof C.apply,'function');const e=C.apply(raw,C.context());assert.equal(e.reduceMotion,true);assert.equal(raw.reduceMotion,false);assert.equal(w.document.body.style.getPropertyValue('--st-accent'),'#137abc');assert.equal(w.document.body.dataset.stGlassBlur,'23');assert.equal(w.document.body.dataset.stAuroraMotion,'still');assert.equal(w.document.body.classList.contains('reduceMotion'),true);
});
test('prepaint exposes real TV and mobile safeguards with shared bounded glass tokens',()=>{
 const b=browser(),w=b.window;w.eval(source('studio/config.js'));const C=w.SwiflyStudioConfig;w.document.documentElement.dataset.svTv='true';assert.equal(C.context().tv,true);const e=C.apply({...C.defaults,glass:'liquid'});assert.equal(e.performancePreset,'xbox');assert.equal(w.document.body.dataset.stGlass,'off');assert.equal(w.document.body.style.getPropertyValue('--st-glass-blur'),'18px');assert.equal(w.document.body.dataset.svPerformance,undefined,'Aurora retains ownership of its own performance state');
});
test('all seven accent presets also update the Aurora color without changing its motion controls',()=>{
 const b=browser(),w=b.window;w.eval(source('studio/config.js'));const C=w.SwiflyStudioConfig,hues=new Set();for(const theme of ['purple','blue','red','green','orange','pink','cyan']){C.apply({...C.defaults,theme,auroraMotion:'slow'});assert.equal(w.document.body.dataset.stAccentAurora,'true');hues.add(w.document.body.style.getPropertyValue('--st-accent-hue'));assert.equal(w.document.body.dataset.stAuroraMotion,'slow');}assert.equal(hues.size,7);C.apply(C.defaults);assert.equal(w.document.body.dataset.stAccentAurora,'false');
});
test('shell primes settings before content and loads runtime dependencies for the native Study route',()=>{
 const api=loadServer();try{const html=api.pageShell({active:'study',body:'<main data-study-root></main>'}),b=browser(html),d=b.window.document;assert(d.querySelector('script[data-sv-studio-config]'));assert(d.querySelector('body > script[data-sv-studio-prime]'));assert(d.querySelector('script[src^="/socket.io/socket.io.js"]'));assert(d.querySelector('script[src^="/assets/studio/experience.js"]'));assert(d.querySelector('link[href^="/assets/studio/experience.css"]'));assert(d.querySelector('.navLinks [data-st-nav="study"][href="/study"]'));assert(d.querySelector('.mobileNav [data-st-nav="study"]'));}finally{api.io.close();}
});
test('real home rows and artwork expose stable customization markers',async()=>{
 const api=loadServer();try{api.setTmdb(async p=>p==='/movie/346698'?{id:346698,title:'Film',backdrop_path:'/scene.jpg'}:{results:[{id:123,title:'Catalog',poster_path:'/poster.jpg',backdrop_path:'/scene.jpg'}]});let html;await api.homePage({}, {send:v=>html=v});const b=browser(html),d=b.window.document;assert(d.querySelector('main[data-st-home] > .dsHero[data-sv-palette-src]'));assert.equal(d.querySelectorAll('[data-st-home-rows] [data-st-home-section]').length,10);assert.equal(d.querySelector('[data-st-home-section="continue"]').id,'continueWatchingSection');}finally{api.io.close();}
});
