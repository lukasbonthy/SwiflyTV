const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer,browser,cleanup,source}=require('./ui-helpers.cjs');
const api=loadServer();
test.afterEach(cleanup);
api.setTmdb(async endpoint=>endpoint.startsWith('/genre/')?{genres:[{id:28,name:'Action'}]}:{results:[{id:101,title:'Arrival',release_date:'2016-11-11',poster_path:'/art.jpg',backdrop_path:'/wide.jpg'}]});
async function catalog(party=true){let html;await api.listingPage({query:party?{party:'1'}:{},params:{},protocol:'http',get:()=> 'localhost:3000'},{send:value=>html=value},'movie');return browser(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,''));}
function styles(env){for(const file of ['clean/clean.css','liquid-glass/surfaces.css','studio/studio.css','player/watch-party.css']){const style=env.window.document.createElement('style');style.textContent=source(file);env.window.document.head.append(style);}}
test('Party tools follow the hero in catalog content instead of appearing under the fixed navigation',async()=>{
 const env=await catalog(),d=env.window.document,hero=d.querySelector('.dsHero'),tools=d.querySelector('[data-party-browse]'),content=d.querySelector('.dsContent');
 assert(hero.compareDocumentPosition(tools)&env.window.Node.DOCUMENT_POSITION_FOLLOWING,'Party tools must appear after the hero, outside the navigation area');
 assert(content.contains(tools),'Party tools must share the rows’ content gutter');
 assert.equal(content.firstElementChild,tools);assert.equal(d.querySelectorAll('.dsHero').length,1);assert(d.querySelector('.dsBrowseTop .genreDropdown'));
});
test('The party section uses the catalog gutter without an extra boxed banner',async()=>{
 const env=await catalog();styles(env);const css=env.window.getComputedStyle(env.window.document.querySelector('[data-party-browse]'));
 assert.equal(parseFloat(css.marginLeft),0);assert.equal(parseFloat(css.marginRight),0);assert.equal(parseFloat(css.borderTopWidth),0);assert.equal(parseFloat(css.borderRadius),0);
});
test('Party browsing controls use the same pill corners as catalog actions',async()=>{
 const env=await catalog();styles(env);const w=env.window,d=w.document,heroButton=d.querySelector('.dsHeroActions .dsSecondaryBtn');
 const radius=w.getComputedStyle(heroButton).borderRadius;assert.equal(radius,'999px');
 for(const control of d.querySelectorAll('[data-party-browse] .dsSecondaryBtn'))assert.equal(w.getComputedStyle(control).borderRadius,radius);
 assert.equal(w.getComputedStyle(d.querySelector('[data-party-browse] input')).borderRadius,radius);
});
test('The party entry anchor leaves space for the floating navigation',async()=>{
 const env=await catalog();styles(env);const tools=env.window.document.getElementById('watch-together');assert(tools);assert.equal(tools.getAttribute('data-party-browse'),'');
 assert(parseFloat(env.window.getComputedStyle(tools).scrollMarginTop)>=100);
});
test('Ordinary movie browsing keeps its original catalog without party tools',async()=>{
 const env=await catalog(false),d=env.window.document;assert(d.querySelector('.dsHero'));assert(d.querySelector('.dsContent'));assert.equal(d.querySelector('[data-party-browse]'),null);assert.equal(d.querySelector('link[href*="player/watch-party.css"]'),null);
});
