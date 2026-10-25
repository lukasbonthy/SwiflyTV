'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser,tick,cleanup,source}=require('./ui-helpers.cjs');
const {recommendationsMarkup}=require('../ui/discovery');
const {loadingHead,loadingMarkup}=require('../ui/loading');
afterEach(cleanup);
const settings={homeOrder:['continue','trending-movies','trending-tv','popular-movies','popular-tv','top-movies','top-tv','new-releases'],homeHidden:[],heroMode:'cinematic',heroPosition:'first',posterWidth:180,homeColumns:6,rowShape:'rail',navOrder:['home','movies','tv','discover','list','study'],navLayout:'top',navLabels:true,navIcons:'line',navDensity:'comfortable',navActive:'pill',hudPosition:'right',hudWidth:360,hudDensity:'comfortable',hudTransparency:85,hudIcons:'line',hudMotion:'subtle',notificationPreview:'expanded',toastPosition:'bottom',aiSpacing:'comfortable',aiWidth:720,aiCards:'grid',aiGlass:'inherit',aiOptions:false,loaderStyle:'cinematic',transitionSpeed:220,loaderDim:90,pageMotion:true,posterHover:'lift',posterActions:'auto',focusStyle:'ring',adaptiveCinema:false,adaptiveStrength:35,performancePreset:'auto',glass:'liquid',reduceMotion:false,reduceTransparency:false,tvScale:110,tvControls:'standard'};
function start(markup,values={},options={}){
 const b=browser('<style>'+source('studio/experience.css')+'</style>'+markup,options),w=b.window;
 w.SwiflyAppearance={...settings,...values};w.boot('studio/experience.js');
 return {...b,w,change(next){w.document.dispatchEvent(new w.CustomEvent('swifly:studio-change',{detail:{values:{...settings,...next},effective:{...settings,...next}}}));}};
}
function home(){return '<main data-st-home><section class="dsHero"><div class="dsHeroBg"></div><h1>A real title</h1><a href="/watch/movie/1">Play</a></section><section class="dsContent" data-st-home-rows><section id="continueWatchingSection" data-st-home-section="continue" hidden><div id="continueWatchingRail"></div></section><section class="dsRow" data-st-home-section="trending-movies"><a href="/movie/1">One</a></section><section class="dsRow" data-st-home-section="popular-movies"><a href="/movie/2">Two</a></section></section></main>';}
test('homepage rearrangement preserves real row nodes and restores a default when saved rows are unavailable',()=>{
 const b=start(home()),d=b.w.document,one=d.querySelector('[data-st-home-section="trending-movies"]'),two=d.querySelector('[data-st-home-section="popular-movies"]');let clicks=0;two.firstElementChild.addEventListener('click',e=>{e.preventDefault();clicks++;});
 b.change({homeOrder:['top-tv','popular-movies','continue','trending-movies'],homeHidden:['continue','trending-movies','popular-movies']});
 assert.equal(d.querySelector('[data-st-home-rows]').firstElementChild,two);
 assert.equal(two.dataset.stHomeHidden,'false','an actual populated row remains available when all available rows were hidden');
 assert.equal(one.dataset.stHomeHidden,'true');two.firstElementChild.click();assert.equal(clicks,1);
 b.change({});assert.equal(d.querySelector('[data-st-home-rows]').children[1],one);assert.equal(d.querySelector('[data-st-home-rows]').children[2],two);assert.equal(one.dataset.stHomeHidden,'false');
});
test('Continue Watching data updates cannot revive a builder-hidden row',async()=>{
 const b=start(home(),{homeHidden:['continue']}),w=b.w,d=w.document;
 w.localStorage.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Main'}]));w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Main'}));w.boot('continue.js');
 w.SwiflyContinue.saveProgress({id:'42',type:'movie',title:'A film',currentTime:20,duration:200});w.flush();await tick();
 const row=d.getElementById('continueWatchingSection');assert.equal(row.hidden,false,'the history owns whether actual progress is empty');assert.equal(row.dataset.stHomeHidden,'true');assert.equal(w.getComputedStyle(row).display,'none');
 b.change({homeHidden:[]});assert.equal(row.dataset.stHomeHidden,'false');assert.notEqual(w.getComputedStyle(row).display,'none');
});
test('a populated Continue Watching row cannot hide the final available catalog row',()=>{
 const b=start(home().replace('data-st-home-section="continue" hidden','data-st-home-section="continue"').replace('<div id="continueWatchingRail"></div>','<div id="continueWatchingRail"><a href="/watch/movie/42">Resume</a></div>'),{homeHidden:['continue','trending-movies','popular-movies']}),d=b.w.document;
 assert.equal(d.querySelector('[data-st-home-section="continue"]').dataset.stHomeHidden,'true');
 assert.equal(d.querySelector('[data-st-home-section="trending-movies"]').dataset.stHomeHidden,'false','catalog access remains available even when progress exists');
});
test('removing the visible catalog row reveals an available row without changing the saved layout',async()=>{
 const hidden=['trending-movies','popular-movies'],b=start(home(),{homeHidden:hidden}),d=b.w.document;
 d.querySelector('[data-st-home-section="trending-movies"]').remove();await tick();
 assert.equal(d.querySelector('[data-st-home-section="popular-movies"]').dataset.stHomeHidden,'false');
 b.change({homeHidden:hidden});assert.equal(d.querySelector('[data-st-home-section="popular-movies"]').dataset.stHomeHidden,'false');
});
test('after-first hero placement changes reading order and Cancel can restore the same hero and rows',()=>{
 const b=start(home()),d=b.w.document,hero=d.querySelector('.dsHero'),row=d.querySelector('[data-st-home-section="trending-movies"]');
 b.change({heroPosition:'after-first',heroMode:'compact',posterWidth:220,homeColumns:4,rowShape:'grid'});
 assert.equal(hero.parentElement,d.querySelector('main'),'existing direct hero CSS remains valid');assert.equal(d.querySelector('[data-st-home-lead]').firstElementChild,row);assert(d.querySelector('[data-st-home-lead]').compareDocumentPosition(hero)&b.w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(d.querySelector('main').style.getPropertyValue('--st-home-poster-width'),'220px');assert.equal(d.body.dataset.stRowShape,'grid');
 b.change({});assert.equal(d.querySelector('[data-st-home-lead]'),null);assert.equal(d.querySelector('.dsHero'),hero);assert.equal(d.querySelector('[data-st-home-rows]').children[1],row);
});
test('navigation uses real DOM order and retains critical controls and accessible icon labels',()=>{
 const links='<a data-st-nav="home" href="/">Home</a><a data-st-nav="movies" href="/movies">Movies</a><a data-st-nav="study" href="/study">Study</a>';
 const b=start('<header class="topbar"><div class="netflixNav"><nav class="navLinks">'+links+'</nav><button id="controlToggleTop">Studio</button><button data-connect-notifications>Notifications</button><details class="dsProfileMenu"><summary>Account</summary></details></div></header><nav class="mobileNav">'+links+'</nav>'),d=b.w.document,button=d.getElementById('controlToggleTop');let opens=0;button.addEventListener('click',()=>opens++);
 const focused=d.querySelector('[data-st-nav="movies"]');focused.focus();
 b.change({navOrder:['study','movies','home'],navLabels:false,navLayout:'sidebar',navIcons:'filled'});
 for(const nav of d.querySelectorAll('.navLinks,.mobileNav'))assert.deepEqual([...nav.querySelectorAll('[data-st-nav]')].map(n=>n.dataset.stNav),['study','movies','home']);
 assert.equal(d.activeElement,focused);assert.equal(focused.getAttribute('aria-label'),'Movies');assert(focused.querySelector('svg'));assert.equal(d.getElementById('controlToggleTop'),button);button.click();assert.equal(opens,1);assert(d.querySelector('[data-connect-notifications]'));assert(d.querySelector('.dsProfileMenu summary'));
});
test('AI presentation preserves the full live form, entered values, authenticated taste path and result actions',async()=>{
 const b=start(recommendationsMarkup(),{}, {path:'/recommendations'}),w=b.w,d=w.document,form=d.querySelector('[data-recommendation-form]'),prompt=form.elements.prompt,requests=[];
 w.SwiflyAccount={ready:Promise.resolve({user:{id:'viewer'}}),request:async(path)=>{assert.equal(path,'/home/taste');return {titles:[{id:'5',type:'movie'}]};}};
 w.fetch=async url=>{requests.push(new URL(url,w.location.href));return {ok:true,json:async()=>({mode:'title',filters:['Movies'],candidates:[{id:'6',type:'movie',title:'A real result',href:'/movie/6',year:'2026',overview:'A story.'}]})};};
 w.boot('discovery/recommendations.js');prompt.value='a title I remember';form.elements.type.value='movie';form.elements.audience.value='home';form.elements.unseen.checked=false;prompt.focus();
 b.change({aiSpacing:'compact',aiWidth:880,aiCards:'list',aiGlass:'soft',aiOptions:true,hudPosition:'left'});
 assert.equal(d.querySelector('[data-recommendation-form]'),form);assert.equal(form.elements.prompt,prompt);assert.equal(d.activeElement,prompt);assert.equal(prompt.value,'a title I remember');assert.equal(d.querySelectorAll('[data-mood]').length,3);assert(d.querySelector('.svRecommendationPreferences').open);
 form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();
 assert.equal(requests[0].searchParams.get('q'),'a title I remember');assert.equal(requests[0].searchParams.get('type'),'movie');assert.equal(requests[0].searchParams.get('seeds'),'movie:5');assert.equal(requests[0].searchParams.get('exclude'),'');assert.equal(d.querySelector('.svDiscoveryCard h3').textContent,'A real result');assert(d.querySelector('[data-share-title]'));assert.equal(form.getAttribute('aria-busy'),'false');
 b.change({});assert.equal(d.querySelector('.svRecommendationPreferences').open,false);assert.equal(prompt.value,'a title I remember');assert.equal(form.elements.audience.value,'home');
});
test('unrelated style adjustments do not collapse More options a viewer opened',()=>{
 const b=start(recommendationsMarkup()),details=b.w.document.querySelector('.svRecommendationPreferences');details.open=true;b.change({hudWidth:480});assert.equal(details.open,true);
 b.change({aiOptions:true});b.change({aiOptions:false});assert.equal(details.open,false);
});
test('all loader styles keep real readiness and do not extend loading holds',async()=>{
 for(const loaderStyle of ['minimal','cinematic','artwork','aurora','basic']){
  const b=browser(loadingMarkup()),w=b.window,tasks=new Map();let next=0;w.setTimeout=(fn,ms)=>{tasks.set(++next,{fn,ms});return next;};w.clearTimeout=id=>tasks.delete(id);
  w.eval(loadingHead().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);const release=w.SwiflySiteLoading.hold('Loading actual titles…');await tick();for(const [id,task] of [...tasks])if(task.ms===120){tasks.delete(id);task.fn();}
  w.SwiflyAppearance={...settings,loaderStyle,transitionSpeed:400};w.boot('studio/experience.js');assert.equal(w.document.body.dataset.stLoaderStyle,loaderStyle);assert.equal(w.document.documentElement.dataset.svLoading,'initial');release();assert.equal(w.document.documentElement.hasAttribute('data-sv-loading'),false);assert.equal(tasks.size,0,'Studio adds no delay or loading timer');b.finish();
 }
});
test('effective low-power and accessibility settings flatten decorative effects without changing scroll policy',()=>{
 const b=start(home(),{performancePreset:'xbox',reduceMotion:true,reduceTransparency:true,posterHover:'zoom',adaptiveCinema:true}),d=b.w.document;d.body.dataset.svPerformance='console';d.body.dataset.svScroll='smooth';
 b.change({performancePreset:'minimal',reduceMotion:true,reduceTransparency:true,posterHover:'zoom',adaptiveCinema:true});
 assert.equal(d.body.dataset.stPerformancePreset,'minimal');assert.equal(d.body.dataset.stExperienceLight,'true');assert.equal(d.body.dataset.stPosterHover,'flat');assert.equal(d.body.dataset.stAdaptiveActive,'false');assert.equal(d.body.dataset.svPerformance,'console');assert.equal(d.body.dataset.svScroll,'smooth');assert.equal(b.w.frameCount(),0,'no decorative animation frame loop');
});
test('turning glass off also flattens HUD and AI effects independently of reduced transparency',()=>{
 const b=start(recommendationsMarkup(),{glass:'off',aiGlass:'soft'});assert.equal(b.w.document.body.dataset.stExperienceOpaque,'true');
 b.change({glass:'subtle'});assert.equal(b.w.document.body.dataset.stExperienceOpaque,'false');
});
