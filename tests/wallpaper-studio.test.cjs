'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup,tick}=require('./ui-helpers.cjs'),{studioMarkup}=require('../ui/studio');
afterEach(cleanup);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
test('oversized raster headers are rejected before allocating a decoded bitmap',async()=>{
 const {window:w}=browser();w.boot('studio/config.js');w.createImageBitmap=()=>Promise.reject(Error('Decoder must not allocate this image'));w.boot('studio/wallpapers.js');const bytes=Buffer.from(png.split(',')[1],'base64');bytes.writeUInt32BE(100000,16);bytes.writeUInt32BE(100000,20);await assert.rejects(w.SwiflyWallpapers.prepareUpload({type:'image/png',size:bytes.length,name:'huge.png',arrayBuffer:async()=>Uint8Array.from(bytes).buffer}),/8192|megapixels/);
});
function setup(){const {window:w}=browser('<button id="controlToggleTop">Studio</button>'+studioMarkup());let done;w.SwiflyWallpapers={prepareUpload:()=>new Promise(resolve=>{done=resolve;})};w.boot('studio/studio.js');w.SwiflyStudio.open();return{w,finish(){done({data:png,name:'My night.png',color:'#789abc',width:1,height:1});},upload(){const n=w.document.querySelector('[data-st-wallpaper-file]');assert(n,'Upload control must exist');Object.defineProperty(n,'files',{configurable:true,value:[{name:'My night.png'}]});n.dispatchEvent(new w.Event('change',{bubbles:true}));}};}
test('wallpaper upload blocks Save until preparation completes and saves an actual portable image',async()=>{
 const e=setup(),{w}=e;e.upload();assert.equal(w.document.querySelector('[data-st-save]').disabled,true);e.finish();await tick();assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,png);assert.equal(w.SwiflyStudio.getRawSettings().themeId,'pure');assert.equal(w.document.querySelector('[data-st-save]').disabled,false);assert.equal(w.document.body.dataset.stWallpaperData,undefined);assert.equal(w.document.body.dataset.stWallpaperName,undefined);w.document.querySelector('[data-st-save]').click();assert.equal(w.SwiflyStudioConfig.read(w.localStorage).values.wallpaperData,png);
});
test('cancelled upload completion cannot mutate saved settings or a later Studio draft',async()=>{
 const e=setup(),{w}=e;e.upload();w.SwiflyStudio.close();w.SwiflyStudio.open();e.finish();await tick();assert.equal(w.SwiflyStudio.getRawSettings().wallpaper,'theme');assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,'');assert.equal(w.localStorage.getItem('swiflytv.appearance'),null);
});
test('selecting another wallpaper invalidates an in-flight upload',async()=>{
 const e=setup(),{w}=e;e.upload();w.document.querySelector('[data-st-field="wallpaper"][data-st-value="winter"]').click();e.finish();await tick();assert.equal(w.SwiflyStudio.getRawSettings().wallpaper,'winter');assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,'');assert.equal(w.document.querySelector('[data-st-save]').disabled,false);
});
test('switching profile ignores late wallpaper preparation from the previous owner',async()=>{
 const e=setup(),{w}=e;e.upload();w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'other'}));w.document.dispatchEvent(new w.Event('swifly:profile-changed'));e.finish();await tick();assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,'');assert.equal(w.document.getElementById('controlPanel').open,false);assert.match(w.SwiflyStudio.getOwner(),/other/);
});
test('wallpaper framing and removal remain staged and Cancel restores the saved image',async()=>{
 const e=setup(),{w}=e;e.upload();e.finish();await tick();w.document.querySelector('[data-st-save]').click();w.SwiflyStudio.open();w.document.querySelector('[data-st-wallpaper-remove]').click();assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,'');w.SwiflyStudio.close();assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,png);
});

test('opening and cancelling the empty upload picker keeps the previously selected wallpaper',()=>{
 const {w}=setup();w.document.querySelector('[data-st-field="wallpaper"][data-st-value="winter"]').click();let opened=0;w.document.querySelector('[data-st-wallpaper-file]').click=()=>opened++;w.document.querySelector('[data-st-field="wallpaper"][data-st-value="upload"]').click();assert.equal(opened,1);assert.equal(w.SwiflyStudio.getRawSettings().wallpaper,'winter');assert.equal(w.SwiflyStudio.getRawSettings().wallpaperData,'');
});
