'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,source,cleanup,tick}=require('./ui-helpers.cjs');
const {studioMarkup}=require('../ui/studio');
const C=require('../public/studio/config');
afterEach(cleanup);
const markup='<nav class="netflixNav"><button id="realSearch">Search</button></nav><main><form class="svStudioSearchForm"><input aria-label="Search titles"></form><section class="svSettingsCard"><button id="realControl">Existing control</button></section></main>';
function setup(theme='halloween',extra={}){
 const b=browser(markup+studioMarkup()),w=b.window;w.eval(source('studio/config.js'));
 const values=w.SwiflyStudioConfig.applyTheme({...w.SwiflyStudioConfig.defaults,...extra},theme);
 w.SwiflyStudioConfig.apply(values);w.boot('studio/theme-details.js');return w;
}
function change(w,patch){const values={...w.SwiflyAppearance,...patch};const effective=w.SwiflyStudioConfig.apply(values);w.document.dispatchEvent(new w.CustomEvent('swifly:studio-change',{detail:{values,effective}}));}
const owned=w=>w.document.querySelectorAll('[data-theme-owned]');
test('Blossom and the detail switch roundtrip as portable settings without changing other preferences',()=>{
 assert(C.curatedThemes.blossom,'Blossom is a selectable theme');
 const initial={...C.defaults,themeDetails:false,reduceMotion:true,aiOptions:true,navLayout:'sidebar'};
 const next=C.applyTheme(initial,'blossom');assert.equal(next.themeId,'blossom');assert.equal(next.themeDetails,false);assert.equal(next.reduceMotion,true);assert.equal(next.aiOptions,true);assert.equal(next.navLayout,'sidebar');
 const imported=C.parseImport(JSON.stringify(C.exportTheme(next)));assert.equal(imported.values.themeId,'blossom');assert.equal(imported.values.themeDetails,false);assert.equal(C.validate({}).themeDetails,true);
});
test('Halloween puts inert webs on actual navigation and form corners without replacing controls',()=>{
 const w=setup(),d=w.document,nav=d.querySelector('.netflixNav'),form=d.querySelector('.svStudioSearchForm');
 assert(nav.querySelector('[data-theme-ornament="web"]'),'Navigation has a real web');assert(form.querySelector('[data-theme-ornament="web"]'),'Search has its own corner web');
 assert.equal(d.querySelector('#realSearch').textContent,'Search');assert.equal(d.querySelector('#realControl').textContent,'Existing control');
 for(const node of d.querySelectorAll('[data-theme-root]')){assert.equal(node.getAttribute('aria-hidden'),'true');assert(node.hasAttribute('inert'));}
 assert.equal(d.querySelector('[data-theme-particles]').querySelectorAll('[data-theme-particle="ember"]').length,9);
});
test('Blossom has falling petals and flowering branches; changing to Winter removes those motifs',()=>{
 const w=setup('blossom'),d=w.document;
 assert(d.querySelector('[data-theme-particle="petal"]'),'Blossom mounts petals');assert(d.querySelector('[data-theme-ornament="blossom"]'),'Blossom mounts branches');
 const values=w.SwiflyStudioConfig.applyTheme(w.SwiflyAppearance,'winter');change(w,values);
 assert.equal(d.querySelector('[data-theme-particle="petal"]'),null);assert.equal(d.querySelector('[data-theme-ornament="blossom"]'),null);assert(d.querySelector('[data-theme-particle="snow"]'));assert(d.querySelector('[data-theme-ornament="lights"]'));
});
test('turning details off removes every ornament and particle but keeps original elements and focus',()=>{
 const w=setup(),d=w.document,button=d.querySelector('#realControl');button.focus();change(w,{themeDetails:false});
 assert.equal(owned(w).length,0);assert.equal(d.activeElement,button);assert.equal(button.parentElement.className,'svSettingsCard');assert.equal(d.querySelector('.netflixNav').querySelector('#realSearch').textContent,'Search');
});
test('high contrast, opaque preferences, lightweight devices and playback suppress decorations',async()=>{
 for(const extra of [{highContrast:true},{reduceTransparency:true},{performancePreset:'xbox'},{performancePreset:'minimal'},{themeDetails:false}]){const w=setup('halloween',extra);assert.equal(owned(w).length,0,JSON.stringify(extra));}
 const w=setup();const player=w.document.createElement('main');player.className='svPlayerPage';w.document.body.append(player);await tick();assert.equal(owned(w).length,0,'Entering real playback removes decoration');player.remove();await tick();assert(w.document.querySelector('[data-theme-ornament="web"]'),'Leaving playback restores details');
});
test('reduced motion keeps static theme ornaments and omits moving particles',()=>{
 const w=setup('halloween',{reduceMotion:true});assert(w.document.querySelector('[data-theme-ornament="web"]'));assert.equal(w.document.querySelector('[data-theme-particle]'),null);assert.equal(w.document.body.dataset.svThemeMotion,'still');
 change(w,{reduceMotion:false});assert(w.document.querySelector('[data-theme-particle="ember"]'));assert.equal(w.document.body.dataset.svThemeMotion,'live');
});
test('switching TV mode on after page load removes decoration and switching back restores it',async()=>{
 const w=setup('blossom');assert(w.document.querySelector('[data-theme-particle="petal"]'));
 w.document.documentElement.dataset.svTv='true';await tick();assert.equal(owned(w).length,0);
 w.document.documentElement.dataset.svTv='false';await tick();assert(w.document.querySelector('[data-theme-particle="petal"]'));
});
test('particle and ornament budgets remain bounded through repeated and duplicate initialization',async()=>{
 const w=setup('blossom'),d=w.document;
 for(let i=0;i<20;i++){change(w,{themeId:i%2?'blossom':'halloween'});w.boot('studio/theme-details.js');}
 await tick();assert.equal(d.querySelectorAll('[data-theme-particles]').length,1);assert(d.querySelectorAll('[data-theme-particles] [data-theme-particle]').length<=14);assert(d.querySelectorAll('[data-theme-ornament]').length<=6);assert.equal(w.frameCount(),0,'Effects do not schedule JavaScript frame loops');
 const mobile=setup('blossom',{performancePreset:'mobile'});assert.equal(mobile.document.querySelectorAll('[data-theme-particles] [data-theme-particle]').length,8);
});
test('dynamic panels acquire one ornament each without observer feedback or losing their positioning',async()=>{
 const w=setup(),d=w.document,panel=d.createElement('section');panel.className='svSettingsCard';panel.style.position='absolute';d.querySelector('main').append(panel);await tick();
 assert.equal(panel.querySelectorAll('[data-theme-ornament="web"]').length,1);assert.equal(panel.style.position,'absolute');const count=owned(w).length;await tick();assert.equal(owned(w).length,count);
 panel.remove();await tick();assert(d.querySelectorAll('[data-theme-ornament]').length<=6);change(w,{themeDetails:false});assert.equal(panel.style.position,'absolute');
});
test('refreshing a decorated panel content restores exactly one ornament without disturbing the new control',async()=>{
 const w=setup(),d=w.document,panel=d.querySelector('.svSettingsCard'),control=d.createElement('button');control.textContent='Updated panel control';panel.replaceChildren(control);control.focus();await tick();
 assert.equal(panel.querySelectorAll('[data-theme-ornament="web"]').length,1);assert.equal(d.activeElement,control);await tick();assert.equal(panel.querySelectorAll('[data-theme-ornament="web"]').length,1);
});
test('page visibility and native dialogs pause the background while Studio previews stay local',async()=>{
 const w=setup('blossom'),d=w.document;Object.defineProperty(d,'hidden',{configurable:true,value:true});d.dispatchEvent(new w.Event('visibilitychange'));assert.equal(d.body.dataset.svThemePaused,'true');
 Object.defineProperty(d,'hidden',{configurable:true,value:false});d.dispatchEvent(new w.Event('visibilitychange'));assert.equal(d.body.dataset.svThemePaused,'false');
 const dialog=d.querySelector('#controlPanel');dialog.showModal();await tick();assert.equal(d.body.dataset.svThemePaused,'true');assert(d.querySelector('[data-theme-preview] [data-theme-particle="petal"]'));assert(d.querySelectorAll('[data-theme-preview] [data-theme-particle]').length<=5);
 dialog.close();await tick();assert.equal(d.body.dataset.svThemePaused,'false');
});
test('responsive changes move the sole preview to the active stage even when particle counts match',async()=>{
 const w=setup('cinema'),d=w.document,media=w.matchMedia('(max-width: 800px)');
 assert(d.querySelector('[data-theme-preview]').closest('[data-st-preview]'));
 media.matches=true;for(const fn of media.listeners)fn({matches:true});await tick();
 assert(d.querySelector('[data-theme-preview]').closest('[data-st-theme-mobile-preview]'),'Compact layout owns the preview');assert.equal(d.querySelectorAll('[data-theme-preview]').length,1);
 media.matches=false;for(const fn of media.listeners)fn({matches:false});await tick();
 assert(d.querySelector('[data-theme-preview]').closest('[data-st-preview]'),'Desktop layout owns the preview again');assert.equal(d.querySelectorAll('[data-theme-preview]').length,1);
});
test('Studio selection and the detail switch preview immediately, Cancel restores, and Save persists',()=>{
 const w=setup('pure'),d=w.document;w.boot('studio/studio.js');w.SwiflyStudio.open();d.querySelector('[data-st-preset="blossom"]').click();assert(d.querySelector('[data-theme-particle="petal"]'));
 const input=d.querySelector('[data-st-input="themeDetails"]');assert(input);input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(owned(w).length,0);d.querySelector('[data-st-cancel]').click();assert.equal(d.body.dataset.stThemeId,'pure');assert.equal(w.localStorage.getItem('swiflytv.appearance'),null);
 w.SwiflyStudio.open();d.querySelector('[data-st-preset="blossom"]').click();d.querySelector('[data-st-save]').click();const saved=JSON.parse(w.localStorage.getItem('swiflytv.appearance'));assert.equal(saved.values.themeId,'blossom');assert.equal(saved.values.themeDetails,true);assert(d.querySelector('[data-theme-particle="petal"]'));
});
test('changing to a custom palette removes the old seasonal effects and applying a named preset restores them',()=>{
 const w=setup(),d=w.document;change(w,{themeId:'custom',accentColor:'#aabbcc'});assert.equal(owned(w).length,0);change(w,w.SwiflyStudioConfig.applyTheme(w.SwiflyAppearance,'forest'));assert(d.querySelector('[data-theme-particle="leaf"]'));assert(d.querySelector('[data-theme-ornament="fern"]'));
});
