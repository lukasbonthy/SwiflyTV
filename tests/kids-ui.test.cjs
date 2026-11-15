'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
const {kidsMarkup}=require('../ui/kids');
test.afterEach(cleanup);
test('A Kids tab reconciles parent controls after another tab configures and unlocks the browser',async()=>{
 const b=browser(kidsMarkup({catalog:{items:[]},status:{configured:false,locked:false,available:true,recoveryRequired:false}}),{path:'/kids'}),w=b.window,d=w.document,calls=[];
 w.SwiflyKids={publish(){}};w.fetch=async(url)=>{calls.push(url);return {ok:false,json:async()=>({message:'Test response'})};};w.eval(source('kids/kids.js'));
 const notify=value=>d.dispatchEvent(new w.CustomEvent('swifly:kids-status',{detail:value}));
 notify({configured:true,locked:true,available:true,recoveryRequired:false});
 assert.equal(d.querySelector('[data-kids-root]').dataset.kidsLocked,'true');
 assert.equal(d.querySelector('[data-kids-confirm-wrap]').hidden,true);
 assert.match(d.querySelector('[data-kids-parent-submit]').textContent,/unlock/i);
 d.querySelector('[data-kids-password]').value='a parent password';d.querySelector('form[data-kids-parent-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(calls.at(-1),'/api/kids/unlock','a stale setup form must become the actual unlock action');
 notify({configured:true,locked:false,available:true,recoveryRequired:false});
 assert.match(d.querySelector('[data-kids-parent-submit]').textContent,/lock/i);
 assert.equal(d.querySelector('[data-kids-password-fields]').hidden,true);
});
test('Kids revalidates a restored player before permitting resume and pauses an unverified document',async()=>{
 for(const verified of [false,true]){
  const b=browser('<main data-player-root data-player-kids-verified="'+verified+'"><video></video></main>',{path:'/watch/movie/1'}),w=b.window;let paused=0,finish;
  w.HTMLMediaElement.prototype.pause=function(){paused++;};w.fetch=()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({locked:true,configured:true,available:true,recoveryRequired:false})}));
  w.eval(source('kids/guard.js'));
  assert.equal(typeof w.SwiflyKids.revalidatePlayer,'function');
  const gate=w.SwiflyKids.revalidatePlayer();finish();assert.equal(await gate,verified);
  if(!verified)assert(paused>0,'unverified buffered playback must stop before redirect');
  b.finish();
 }
});
test('A failed parental status check cannot authorize cached playback',async()=>{
 const b=browser('<main data-player-root data-player-kids-verified="true"></main>',{path:'/watch/movie/1'}),w=b.window;w.fetch=async()=>{throw Error('offline');};w.eval(source('kids/guard.js'));
 assert.equal(typeof w.SwiflyKids.revalidatePlayer,'function');assert.equal(await w.SwiflyKids.revalidatePlayer(),false);
});
test('A fresh player gate cannot reuse an unlocked response from an older visibility session',async()=>{
 const b=browser('<main data-player-root data-player-kids-verified="false"><video></video></main>',{path:'/watch/movie/1'}),w=b.window,pending=[];w.HTMLMediaElement.prototype.pause=function(){};
 w.fetch=()=>new Promise(resolve=>pending.push(value=>resolve({ok:true,json:async()=>value})));w.eval(source('kids/guard.js'));
 const first=w.SwiflyKids.revalidatePlayer(),second=w.SwiflyKids.revalidatePlayer();
 pending[1]({locked:false,configured:true,available:true});assert.equal(await first,false,'an old unlocked response is not permission for a later gate');
 pending[2]({locked:true,configured:true,available:true});assert.equal(await second,false);
});
test('Kids carries validated comfort preferences without applying adult themes, layouts or wallpaper',()=>{
 const {kidsAccessibilityPrime}=require('../ui/kids'),b=browser(kidsAccessibilityPrime(),{path:'/kids'}),w=b.window,d=w.document;
 w.localStorage.setItem('swiflytv.appearance',JSON.stringify({version:2,values:{themeId:'halloween',theme:'red',wallpaper:'winter',wallpaperName:'ADULT CUSTOM WALLPAPER',navLayout:'sidebar',homeHidden:['popular-movies'],font:'soft',reduceMotion:true,reduceTransparency:true,highContrast:true,largeTargets:true,uiScale:120,focusStyle:'frame',captionSize:150}}));
 w.eval(source('studio/config.js'));w.eval(d.querySelector('[data-kids-accessibility]').textContent);
 assert.equal(d.body.dataset.stFont,'soft');assert.equal(d.body.dataset.stUiScale,'120');assert.equal(d.body.dataset.stHighContrast,'true');assert.equal(d.body.dataset.stLargeTargets,'true');assert.equal(d.body.dataset.stCaptionSize,'150');assert(d.body.classList.contains('reduceMotion'));
 assert.equal(d.body.dataset.stThemeId,'pure');assert.equal(d.body.dataset.stTheme,'default');assert.equal(d.body.dataset.stNavLayout,'top');assert.equal(d.body.dataset.stWallpaperVisible,'false');assert.equal(w.SwiflyAppearance.wallpaperName,'');assert(!d.body.textContent.includes('ADULT CUSTOM WALLPAPER'));
});
test('A verified native child player revalidates its path without injecting adult navigation',async()=>{
 const b=browser('<main data-player-root data-player-kids-verified="true" data-player-type="tv" data-player-id="1"></main>',{path:'/kids/watch/tv/1'}),w=b.window;
 w.fetch=async()=>({ok:true,json:async()=>({locked:true,configured:true,available:true,recoveryRequired:false})});w.eval(source('kids/guard.js'));assert.equal(await w.SwiflyKids.revalidatePlayer(),true);assert.equal(w.document.documentElement.dataset.kidsLocked,'true');assert(!w.document.querySelector('[data-kids-mode-bar]'));
});


test('parent controls remain legible on phones and announce state changes in the dialog',()=>{
 const {kidsNavigation}=require('../ui/kids');
 const nav=kidsNavigation({navLink:(_href,label)=>'<a>'+label+'</a>',cleanIcon:()=>'<span></span>'});
 assert.match(nav.header,/class="kidsParentShort" aria-hidden="true">Parents<\/span>/);
 assert.match(nav.header,/aria-label="Open parent controls"/);
 const markup=kidsMarkup({status:{configured:false,locked:false,available:true,recoveryRequired:false}});
 assert.match(markup,/aria-describedby="kids-parent-copy kids-parent-scope"/);
 const b=browser(markup,{path:'/kids'}),w=b.window,d=w.document;
 w.eval(source('kids/kids.js'));
 d.dispatchEvent(new w.CustomEvent('swifly:kids-status',{detail:{configured:true,locked:true,available:false,recoveryRequired:true}}));
 assert.equal(d.querySelector('[data-kids-parent-title]').textContent,'Parent lock needs attention');
 assert.equal(d.querySelector('[data-kids-parent-submit]').disabled,true);
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/kids/kids.css'),'utf8');
 assert.match(css,/\.kidsParentButton>\.kidsParentShort\{display:inline/);
});
