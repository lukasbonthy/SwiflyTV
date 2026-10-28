'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,source,cleanup}=require('./ui-helpers.cjs'),{studioMarkup}=require('../ui/studio');
const C=require('../public/studio/config');
afterEach(cleanup);
function setup(before,options){const b=browser('<button id="controlToggleTop">Studio</button>'+studioMarkup(),options),w=b.window;before?.(w);w.eval(source('studio/config.js'));w.boot('studio/studio.js');w.SwiflyStudio.open();return w;}
const click=(w,s)=>{const n=w.document.querySelector(s);assert(n,'Missing '+s);n.click();return n;};
function edit(w,key,value){const n=w.document.querySelector('[data-st-input="'+key+'"]');assert(n);if(n.type==='checkbox')n.checked=value;else n.value=String(value);n.dispatchEvent(new w.Event(n.type==='range'?'input':'change',{bubbles:true}));return n;}
const mode=w=>w.document.querySelector('[data-st-advanced-toggle]');
test('utility-page headings do not masquerade as film titles in the live preview',()=>{
 const utility=setup(w=>w.document.body.insertAdjacentHTML('afterbegin','<main><h1>Account settings</h1></main>'));
 assert.equal(utility.document.querySelector('[data-st-preview-title]').textContent,'Movie night, your way.');
 const film=setup(w=>w.document.body.insertAdjacentHTML('afterbegin','<main><div class="dsHeroContent"><h1>Interstellar</h1></div></main>'));
 assert.equal(film.document.querySelector('[data-st-preview-title]').textContent,'Interstellar');
});
test('Simple starts with themes and hides technical controls and tabs with native hidden state',()=>{
 const w=setup(),d=w.document;assert.equal(mode(w)?.checked,false);assert.equal(d.querySelector('[data-st-tab][aria-selected="true"]').dataset.stTab,'looks');
 for(const key of ['accentColor','glassBlur','posterWidth','playerProgress','hudWidth','aiWidth','transitionSpeed'])assert(d.querySelector('[data-st-input="'+key+'"]').closest('[hidden]'),key+' is advanced');
 for(const key of ['navigation','atmosphere','hud','motion'])assert.equal(d.querySelector('[data-st-tab="'+key+'"]').hidden,true);
 assert.equal(d.querySelector('[data-st-preset="halloween"]').closest('[hidden]'),null);assert.equal(d.querySelector('[data-st-input="uiScale"]').closest('[hidden]')?.id,'stPanel-access');
});
test('Advanced preserves staged values, saves separately and safely returns focus when its panel hides',()=>{
 const w=setup(),d=w.document;mode(w).click();assert.equal(mode(w).checked,true);edit(w,'glassBlur',25);click(w,'[data-st-tab="hud"]');edit(w,'aiWidth',800);d.querySelector('[data-st-input="aiWidth"]').focus();
 mode(w).click();assert.equal(d.querySelector('[data-st-tab][aria-selected="true"]').dataset.stTab,'looks');assert(d.getElementById('controlPanel').contains(d.activeElement));assert.equal(d.activeElement.closest('[hidden]'),null);
 assert.equal(w.SwiflyStudio.getRawSettings().glassBlur,25);assert.equal(w.SwiflyStudio.getRawSettings().aiWidth,800);assert.equal(w.localStorage.getItem('swiflytv.appearance'),null);assert.equal(w.localStorage.getItem('swiflytv.studio.editorMode'),'simple');
 mode(w).click();click(w,'[data-st-tab="looks"]');assert.equal(d.querySelector('[data-st-input="glassBlur"]').closest('[hidden]'),null);assert.equal(d.querySelector('[data-st-input="glassBlur"]').value,'25');click(w,'[data-st-save]');assert.equal(JSON.parse(w.localStorage.getItem('swiflytv.appearance')).values.glassBlur,25);assert.equal(w.localStorage.getItem('swiflytv.studio.editorMode'),'advanced');assert(!('editorMode' in JSON.parse(d.querySelector('[data-st-export-output]').value).values));
});
test('arrow keys skip hidden sections and an advanced deep link reveals the requested panel',()=>{
 const w=setup(),d=w.document,tab=d.querySelector('[data-st-tab="player"]');tab.focus();tab.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(d.activeElement.dataset.stTab,'devices');
 const linked=setup(null,{path:'/?studio=1#stPanel-hud'});assert.equal(mode(linked).checked,true);assert.equal(linked.document.querySelector('[data-st-tab][aria-selected="true"]').dataset.stTab,'hud');assert.match(linked.document.querySelector('[data-st-mode-note]').textContent,/advanced/i);
});
test('all curated themes preserve every nonappearance setting including accessibility, navigation, library and AI',()=>{
 assert.equal(typeof C.applyTheme,'function');assert(C.curatedThemes.halloween);assert(C.curatedThemes.winter);
 const original=C.validate({...C.defaults,homeOrder:[...C.defaults.homeOrder].reverse(),homeHidden:['popular-tv'],navOrder:[...C.defaults.navOrder].reverse(),navLayout:'sidebar',layout:'posterwall',density:'compact',posterWidth:220,performancePreset:'xbox',tvScale:125,uiScale:115,highContrast:true,reduceMotion:true,reduceTransparency:true,largeTargets:true,focusStyle:'frame',smooth:false,captionSize:175,aiWidth:800,aiOptions:true});
 for(const id of Object.keys(C.curatedThemes)){const value=C.applyTheme(original,id);assert.equal(value.themeId,id);for(const key of Object.keys(original).filter(k=>!C.appearanceFields.includes(k)))assert.deepEqual(value[key],original[key],id+' preserves '+key);}
 assert.deepEqual(C.applyTheme(original,'missing'),original);assert.equal(C.validate({themeId:'<script>'}).themeId,C.defaults.themeId);
});
test('Halloween preview cancels, Save persists its identity, and the prepaint runtime restores it',()=>{
 const w=setup(),d=w.document;click(w,'[data-st-preset="halloween"]');assert.equal(d.body.dataset.stThemeId,'halloween');assert.equal(d.body.style.getPropertyValue('--st-canvas'),'#0d0a10');assert.equal(w.localStorage.getItem('swiflytv.appearance'),null);click(w,'[data-st-cancel]');assert.equal(d.body.dataset.stThemeId,'pure');
 w.SwiflyStudio.open();click(w,'[data-st-preset="halloween"]');click(w,'[data-st-save]');const record=w.localStorage.getItem('swiflytv.appearance');const next=browser(),n=next.window;n.localStorage.setItem('swiflytv.appearance',record);n.eval(source('studio/config.js'));n.SwiflyStudioConfig.apply(n.SwiflyStudioConfig.read(n.localStorage).values);assert.equal(n.document.body.dataset.stThemeId,'halloween');assert.equal(n.document.body.style.getPropertyValue('--st-accent'),'#ffa05c');
});
test('theme policies preserve raw choices and override decoration for high contrast, TV and reduced transparency',()=>{
 assert.equal(typeof C.applyTheme,'function');const raw=C.applyTheme({...C.defaults,highContrast:true,reduceMotion:true,reduceTransparency:true},'halloween');const effective=C.effective(raw,{tv:true});assert.equal(raw.themeId,'halloween');assert.equal(effective.themeId,'halloween');assert.equal(effective.canvasColor,'#000000');assert.equal(effective.glass,'off');assert.equal(effective.auroraMotion,'still');
 const w=setup();edit(w,'highContrast',true);click(w,'[data-st-preset="winter"]');assert.equal(w.SwiflyStudio.getRawSettings().highContrast,true);assert.equal(w.SwiflyStudio.getSettings().canvasColor,'#000000');
});
test('account import may reload saved appearance only while Studio has no active draft',()=>{
 const w=setup();assert.equal(typeof w.SwiflyStudio.reloadSaved,'function');click(w,'[data-st-preset="halloween"]');w.localStorage.setItem('swiflytv.appearance',JSON.stringify({version:2,values:C.applyTheme(C.defaults,'winter')}));
 assert.equal(w.SwiflyStudio.reloadSaved(),false);assert.equal(w.SwiflyStudio.getRawSettings().themeId,'halloween');click(w,'[data-st-cancel]');assert.equal(w.SwiflyStudio.reloadSaved(),true);assert.equal(w.document.body.dataset.stThemeId,'winter');
});
test('an invalid Advanced field keeps its text and explains how to resolve it from Simple',()=>{
 const w=setup(),d=w.document;mode(w).click();edit(w,'accentColor','#badxx');mode(w).click();assert.equal(d.querySelector('[data-st-save]').disabled,true);assert.match(d.querySelector('[data-st-status]').textContent,/advanced/i);mode(w).click();assert.equal(d.querySelector('[data-st-input="accentColor"]').value,'#badxx');edit(w,'accentColor','#bad');assert.equal(d.querySelector('[data-st-save]').disabled,false);
});
