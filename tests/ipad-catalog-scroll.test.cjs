'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const entry=require('../ui/artwork-entry.js');

function fixture(appleTablet){
  const dom=new JSDOM('<!doctype html><html><body class="svCleanShell"><main>'+
    '<section class="dsHero"><img id="featured" class="dsHeroLogo" src="/logo.png" alt=""></section>'+
    '<section class="dsContent"><div class="movieRail"><article class="movieCard">'+
    '<a class="posterWrap"><img id="poster" src="/poster.jpg" loading="lazy" decoding="async" alt="Poster"></a>'+
    '</article></div></section></main></body></html>',
    {url:'https://swiflytv.example',pretendToBeVisual:true,runScripts:'outside-only'});
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  if(appleTablet){
    Object.defineProperty(w.navigator,'platform',{configurable:true,value:'MacIntel'});
    Object.defineProperty(w.navigator,'maxTouchPoints',{configurable:true,value:5});
  }
  w.eval(entry);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return dom;
}

test('iPad posters retain their native lazy/async image and do not acquire an entry fade',()=>{
  const dom=fixture(true);
  try{
    const d=dom.window.document,poster=d.querySelector('#poster'),featured=d.querySelector('#featured');
    assert.equal(d.documentElement.dataset.svAppleTablet,'true');
    assert.equal(poster.loading||poster.getAttribute('loading'),'lazy');
    assert.equal(poster.getAttribute('decoding'),'async');
    assert(!poster.classList.contains('svArtworkAsset'),'visible and revisited catalog posters must not be fade-gated on iPad');
    assert(featured.classList.contains('svArtworkAsset'),'featured hero artwork retains the existing cinematic entry');
  }finally{dom.window.close();}
});

test('non-iPad catalog posters keep their original artwork entrance',()=>{
  const dom=fixture(false);
  try{
    const d=dom.window.document;
    assert.equal(d.documentElement.dataset.svAppleTablet,undefined);
    assert(d.querySelector('#poster').classList.contains('svArtworkAsset'));
  }finally{dom.window.close();}
});

test('iPad poster button material is static while navigation and details remain untouched',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/clean/performance.css'),'utf8');
  assert(css.includes('html[data-sv-apple-tablet="true"] body.svCleanShell .dsCardQuickActions'));
  assert(css.includes('-webkit-backdrop-filter:none !important;'));
  assert(!css.includes('content-visibility:auto'));
});
