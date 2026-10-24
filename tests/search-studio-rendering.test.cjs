'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright-core'),{loadServer}=require('./ui-helpers.cjs');
const skip=!fs.existsSync(chromium.executablePath())&&'Chromium is not installed';
async function fixture(t){
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'swifly-search-')),previous=process.env.SWIFLY_DATA_DIR;process.env.SWIFLY_DATA_DIR=dir;const api=loadServer();previous===undefined?delete process.env.SWIFLY_DATA_DIR:process.env.SWIFLY_DATA_DIR=previous;
 const calls=[],items=Array.from({length:18},(_,i)=>({id:i+1,title:'A title '+(i+1),media_type:'movie',genre_ids:[35],overview:'A story of friends discovering a new adventure.',release_date:'2026-01-01',poster_path:'/poster.jpg'}));
 api.setTmdb(async(endpoint,p={})=>{calls.push([endpoint,p]);return{results:endpoint.includes('person')?[{id:31,name:'Tom Hanks',profile_path:'/poster.jpg'}]:p.query?[{...items[0],title:p.query}]:items,page:Number(p.page)||1,total_pages:3,total_results:54};});
 await new Promise(r=>api.httpServer.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+api.httpServer.address().port;
 const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1280,height:900}});
 await p.addInitScript(()=>{const add=window.addEventListener.bind(window);window.addEventListener=(type,listener,options)=>{if(type!=='gamepadconnected'&&type!=='gamepaddisconnected')add(type,listener,options);};Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('swiflytv.session',JSON.stringify({email:'search@example.test'}));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:'Viewer'}));});
 await p.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.hostname==='image.tmdb.org')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#293344"/></svg>'});return route.fulfill({body:'',contentType:'text/plain'});});
 t.after(async()=>{await b.close();await new Promise(r=>api.io.close(r));await fsp.rm(dir,{recursive:true,force:true});});return{p,api,origin,calls};
}
test('search is a centered six-column desktop page and fits narrow phones',{skip},async t=>{
 const {p,origin}=await fixture(t);await p.goto(origin+'/search');await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-sv-loading'));
 assert.equal(await p.locator('[data-search-mode]').count(),3);assert.match(await p.locator('h1').textContent(),/What would you like/);assert.equal(await p.locator('[data-studio-results]').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),6);
 await p.screenshot({path:'/tmp/swifly-search-studio-1280.png'});
 for(const width of [320,390,820,1280]){await p.setViewportSize({width,height:900});const bounds=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth,form:document.querySelector('[data-studio-search]').getBoundingClientRect().toJSON(),tabs:document.querySelector('.svSearchModes').getBoundingClientRect().toJSON()}));assert(bounds.overflow<=width,JSON.stringify(bounds));assert(bounds.form.left>=12&&bounds.form.right<=width-12);assert(bounds.tabs.left>=8&&bounds.tabs.right<=width-8);}
 await p.setViewportSize({width:320,height:844});await p.screenshot({path:'/tmp/swifly-search-studio-320.png'});
});
test('actual search typing, clear, pagination, people and saved actions work together',{skip},async t=>{
 const {p,origin}=await fixture(t);await p.goto(origin+'/search');await p.fill('#svStudioQuery','X');await p.waitForFunction(()=>document.querySelector('[data-studio-search]').getAttribute('aria-busy')==='false'&&location.search.includes('q=X'));
 assert.equal(await p.locator('.dsCardTitle').textContent(),'X');const save=p.locator('[data-watch-id="1"]');await save.click();assert.equal(await save.getAttribute('aria-pressed'),'true');await p.locator('[data-studio-clear]').click();await p.waitForFunction(()=>document.querySelector('[data-studio-results]').children.length===18);assert.equal(await p.locator('[data-watch-id="1"]').getAttribute('aria-pressed'),'true');
 await p.locator('[data-studio-pagination] a').filter({hasText:'Next'}).click();await p.waitForFunction(()=>location.search.includes('page=2')&&document.querySelector('[data-studio-search]').getAttribute('aria-busy')==='false');
 await p.fill('#svStudioQuery','Tom Hanks');await p.locator('[data-search-mode=person]').click();await p.waitForURL(/type=person/);assert.equal(await p.locator('#svStudioQuery').inputValue(),'Tom Hanks');assert(await p.locator('[href="/person/31"]').count()>0);
 await p.locator('[data-search-mode=ai]').click();await p.waitForURL(/recommendations/);assert.equal(await p.locator('[name=prompt]').inputValue(),'Tom Hanks');assert.equal(await p.locator('[data-mood]').count(),3);assert(await p.locator('[name=audience]').count());
});
