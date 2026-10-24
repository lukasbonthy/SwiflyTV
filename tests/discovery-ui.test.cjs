'use strict';
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');const {browser,tick,cleanup}=require('./ui-helpers.cjs');const {searchMarkup,recommendationsMarkup,audiobooksMarkup}=require('../ui/discovery');afterEach(cleanup);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('an exact movie opens immediately without downloading an AI model',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window;let workers=0;
 w.fetch=async()=>({ok:true,json:async()=>({mode:'title',candidates:[{id:'346698',type:'movie',title:'Barbie',year:'2023',match:'title',href:'/movie/346698'}]})});w.Worker=class{constructor(){workers++;}};w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='Barbie';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();
 assert.equal(workers,0);assert.equal(w.document.querySelector('.svDiscoveryCard h3')?.textContent,'Barbie');assert.match(w.document.querySelector('[data-ai-status]').textContent,/title|found/i);assert.equal(form.getAttribute('aria-busy'),'false');
});
test('semantic planning fetches a relevant catalog before the model ranks any movies',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window,requests=[],inputs=[],workers=[];
 w.fetch=async url=>{const u=new URL(url,w.location.href);requests.push(u);return {ok:true,json:async()=>u.searchParams.has('planned')?{candidates:[{id:'8',type:'movie',title:'The Prestige',overview:'Two rival magicians.',href:'/movie/8'}]}:{mode:'plan',semanticQuery:'rival magicians',candidates:[]}};};
 w.Worker=class{constructor(){workers.push(this);}addEventListener(name,fn){this[name]=fn;}removeEventListener(){}postMessage(value){inputs.push(value);}terminate(){}};w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='rival magicians';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(inputs[0]?.kind,'plan');
 workers[0].message({data:{kind:'planned',topics:['magic']}});await tick();assert.equal(requests[1]?.searchParams.get('topics'),'magic');assert.equal(inputs[1]?.candidates[0]?.title,'The Prestige');workers[0].message({data:{kind:'done',results:inputs[1].candidates}});await tick();assert.equal(w.document.querySelector('.svDiscoveryCard h3')?.textContent,'The Prestige');
});
test('search requests run only while open and old responses cannot replace a newer query',async()=>{
 const b=browser('<button id="svNavSearchToggle"></button>'+searchMarkup()),w=b.window,requests=[];w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));w.boot('clean.js');assert.equal(requests.length,0);
 w.document.getElementById('svNavSearchToggle').click();const input=w.document.getElementById('svNavSearchInput');input.value='first';input.dispatchEvent(new w.Event('input'));await delay(260);input.value='second';input.dispatchEvent(new w.Event('input'));await delay(260);assert.equal(requests.length,2);assert(requests[0].options.signal.aborted);
 requests[1].resolve({ok:true,json:async()=>({results:[{id:'2',title:'Second',type:'movie',href:'/movie/2'}]})});await tick();requests[0].resolve({ok:true,json:async()=>({results:[{id:'1',title:'First',type:'movie',href:'/movie/1'}]})});await tick();assert.match(w.document.querySelector('[data-search-results]').textContent,/Second/);assert(!w.document.querySelector('[data-search-results]').textContent.includes('First'));
 w.document.querySelector('[data-search-close]').click();assert(w.document.getElementById('svNavSearchPopup').hidden);assert.equal(w.document.activeElement.id,'svNavSearchToggle');
});
test('AI model is lazy, worker based, cancellable and only successful model output is labeled AI',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window,workers=[];w.fetch=async()=>({ok:true,json:async()=>({candidates:[{id:'1',type:'movie',title:'Film',overview:'A story',href:'/movie/1'}]})});w.Worker=class{constructor(url,options){this.options=options;workers.push(this);}postMessage(value){this.input=value;}terminate(){this.terminated=true;}addEventListener(name,fn){this[name]=fn;}};w.boot('discovery/recommendations.js');assert.equal(workers.length,0);
 const form=w.document.querySelector('form');form.elements.prompt.value='space adventure';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(workers.length,1);assert.equal(workers[0].options.type,'module');w.document.querySelector('[data-ai-cancel]').click();assert(workers[0].terminated);assert.match(w.document.querySelector('[data-ai-status]').textContent,/cancel/i);
 form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();workers[1].message({data:{kind:'done',results:[{id:'1',type:'movie',title:'Film',href:'/movie/1',score:.8}]}});await tick();assert.match(w.document.querySelector('[data-ai-status]').textContent,/AI/);
});
test('AI retrieval receives the current prompt and the model gets the resolved reference story',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window,requests=[],inputs=[];
 w.fetch=async url=>{requests.push(new URL(url,w.location.href));return {ok:true,json:async()=>({candidates:[{id:'1',type:'movie',title:'Arrival',overview:'An encounter with an alien language.',href:'/movie/1'}],references:[{title:'Interstellar',overview:'A father travels through a wormhole to find a new home for humanity.'}]})};};
 w.Worker=class{addEventListener(){}postMessage(value){inputs.push(value);}terminate(){}};w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='something like Interstellar';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();
 assert.equal(requests[0].searchParams.get('q'),'something like Interstellar');assert.match(inputs[0].query,/wormhole/);w.document.querySelector('[data-ai-cancel]').click();
});
test('AI sends the separate reference and extra preference to ranking and displays real filters',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window,inputs=[];
 const context={preferenceQuery:'more mystery',referenceQueries:['Interstellar. A space mission.'],type:'movie'};
 w.fetch=async()=>({ok:true,json:async()=>({semanticQuery:'A space mission with more mystery',ranking:context,filters:['Movies','mystery','No horror'],candidates:[{id:'1',type:'movie',title:'Arrival',href:'/movie/1'}]})});
 w.Worker=class{addEventListener(){}postMessage(m){inputs.push(m);}terminate(){}};w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='like Interstellar but with more mystery, no horror';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();
 assert.equal(inputs[0].context?.preferenceQuery,'more mystery');assert.equal(inputs[0].context?.referenceQueries[0],context.referenceQueries[0]);assert.match(w.document.querySelector('[data-query-filters]')?.textContent||'',/No horror/);w.document.querySelector('[data-ai-cancel]').click();
});
test('a verified broad genre search shows useful matches without downloading a model',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window;let workers=0;
 w.fetch=async()=>({ok:true,json:async()=>({ranking:{broad:true},filters:['comedy'],candidates:[{id:'1',type:'movie',title:'A comedy',href:'/movie/1',genres:[35],rating:7.5}]})});w.Worker=class{constructor(){workers++;}};w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='a funny movie';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(workers,0);assert.equal(w.document.querySelector('.svDiscoveryCard h3')?.textContent,'A comedy');assert.equal(form.getAttribute('aria-busy'),'false');
});
test('a corrected title is presented as a suggestion rather than an exact hit',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window;
 w.fetch=async()=>({ok:true,json:async()=>({mode:'title',correction:{query:'Intersteler',title:'Interstellar'},candidates:[{id:'1',type:'movie',title:'Interstellar',href:'/movie/1'}]})});w.boot('discovery/recommendations.js');
 const form=w.document.querySelector('form');form.elements.prompt.value='Intersteler';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.match(w.document.querySelector('[data-ai-status]').textContent,/did you mean|closest/i);assert.equal(w.document.querySelector('.svDiscoveryPoster').getAttribute('href'),'/movie/1');
});
test('a request with no matching candidates clears old picks and does not start a model',async()=>{
 const b=browser(recommendationsMarkup(),{path:'/recommendations'}),w=b.window;let workers=0;w.fetch=async()=>({ok:true,json:async()=>({candidates:[],message:'No close matches found. Try fewer filters.'})});w.Worker=class{constructor(){workers++;}};w.boot('discovery/recommendations.js');
 w.document.querySelector('[data-ai-results]').innerHTML='<article>Old result</article>';w.document.querySelector('.svRecommendationResults').hidden=false;
 const form=w.document.querySelector('form');form.elements.prompt.value='a rare movie';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();
 assert.equal(workers,0);assert(w.document.querySelector('.svRecommendationResults').hidden);assert.match(w.document.querySelector('[data-ai-status]').textContent,/No close matches/);assert.equal(form.querySelector('[type=submit]').disabled,false);
});
test('an unavailable audiobook cover keeps its real title and a usable listen button',async()=>{
 const b=browser(audiobooksMarkup(),{path:'/audiobooks'}),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({books:[{id:'52',title:'Pride and Prejudice',author:'Jane Austen',poster:'https://archive.org/services/img/missing'}]})});w.boot('discovery/audiobooks.js');await tick();
 w.document.querySelector('.svBookCover img').dispatchEvent(new w.Event('error'));
 const fallback=w.document.querySelector('.svBookCoverFallback');assert(fallback,'a failed image is replaced with a readable cover');assert.match(fallback.textContent,/Pride and Prejudice/);assert.equal(w.document.querySelector('.svBookCover').getAttribute('aria-label'),'Listen to Pride and Prejudice');
});
test('audiobook chapter player restores progress and end-of-chapter sleep prevents advancing',async()=>{
 const b=browser(audiobooksMarkup(),{path:'/audiobooks?book=52'}),w=b.window,book={id:'52',title:'Book',author:'Author',description:'A story',chapters:[{id:'1',title:'One',url:'https://archive.org/download/a/1.mp3'},{id:'2',title:'Two',url:'https://archive.org/download/a/2.mp3'}]};w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/books/52')?{book}:{books:[book],page:1}});w.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};w.HTMLMediaElement.prototype.pause=function(){this.wasPaused=true;};w.boot('discovery/audiobooks.js');await tick();await tick();
 w.document.querySelector('[data-book-chapter="0"]').click();const audio=w.document.querySelector('audio');audio.currentTime=65;audio.dispatchEvent(new w.Event('timeupdate'));const sleep=w.document.querySelector('[data-book-sleep]');sleep.value='chapter';sleep.dispatchEvent(new w.Event('change'));audio.dispatchEvent(new w.Event('ended'));assert.match(audio.src,/1\.mp3$/);assert(audio.wasPaused);assert.match(w.document.querySelector('[data-book-sleep-status]').textContent,/ended|complete|paused/i);
});
test('a book keeps its original profile owner when another tab switches the active profile',async()=>{
 const b=browser(audiobooksMarkup(),{path:'/audiobooks?book=52'}),w=b.window,book={id:'52',title:'Book',author:'Author',chapters:[{id:'1',title:'One',url:'https://archive.org/download/a/1.mp3'}]};w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'alice'}));w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/books/52')?{book}:{books:[book]}});w.HTMLMediaElement.prototype.pause=function(){};w.boot('discovery/audiobooks.js');await tick();await tick();const audio=w.document.querySelector('audio');w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'bob'}));audio.currentTime=55;audio.dispatchEvent(new w.Event('pause'));assert.equal(w.localStorage.getItem('swiflytv.library.audio.bob'),null);assert.equal(JSON.parse(w.localStorage.getItem('swiflytv.library.audio.alice'))['52'].time,55);
});
test('audiobook loading retains restored speed and the same speed on the following chapter',async()=>{
 const b=browser(audiobooksMarkup(),{path:'/audiobooks?book=52'}),w=b.window,book={id:'52',title:'Book',author:'Author',chapters:[{id:'1',title:'One',url:'https://archive.org/download/a/1.mp3'},{id:'2',title:'Two',url:'https://archive.org/download/a/2.mp3'}]};
 w.localStorage.setItem('swiflytv.library.audio.main',JSON.stringify({'52':{chapter:0,time:0,speed:1.5}}));w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/books/52')?{book}:{books:[book]}});w.HTMLMediaElement.prototype.load=function(){this.playbackRate=this.defaultPlaybackRate;};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};w.boot('discovery/audiobooks.js');await tick();await tick();const audio=w.document.querySelector('audio');assert.equal(audio.playbackRate,1.5);audio.dispatchEvent(new w.Event('ended'));assert.match(audio.src,/2\.mp3$/);assert.equal(audio.playbackRate,1.5);
});
