'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs');
const {connectMarkup,connectDialogs}=require('../ui/connect');
const fs=require('node:fs');
afterEach(cleanup);
const alice={id:'alice',name:'Alice',handle:'alice',settings:{shareWatching:false,shareTaste:true}};
const bob={id:'bob',name:'Bob <img src=x onerror=alert(1)>',handle:'bob',activity:null,unread:1};
function setup(data={}){
 const b=browser(connectMarkup()+connectDialogs(),{path:'/friends'}),w=b.window,calls=[];
 const payload={user:alice,friends:[bob],requests:{incoming:[],outgoing:[]},notifications:[],home:null,blocked:[],stateRevision:0,...data};
 w.SwiflyAccount={ready:Promise.resolve({user:alice,available:true}),request:async(route,options={})=>{calls.push({route,...options});if(route==='/bootstrap')return payload;if(route.startsWith('/messages/')&&!options.body)return {messages:[{id:'1',from:'bob',to:'alice',text:'<script>hello</script>',kind:'text',createdAt:1}]};if(route.startsWith('/people'))return {people:[]};return {ok:true};}};
 w.EventSource=class {addEventListener(){}close(){this.closed=true;}};
 return {...b,w,calls,payload};
}
test('private inbox renders untrusted names and messages as text, then sends through the authenticated API',async()=>{
 const b=setup();b.w.boot('connect/connect.js');await tick();await tick();
 b.w.document.querySelector('[data-connect-friend="bob"]').click();await tick();
 assert(b.w.document.body.textContent.includes('<script>hello</script>'));assert.equal(b.w.document.querySelector('.svMessageLog script'),null);
 const input=b.w.document.querySelector('[data-message-text]');input.value='Tonight?';b.w.document.querySelector('[data-message-form]').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert(b.calls.some(c=>c.route==='/messages/bob'&&c.body?.text==='Tonight?'));assert(b.calls.some(c=>c.route==='/messages/bob/read'));
});
test('friend requests and privacy settings call the server and shared invitations are accepted explicitly',async()=>{
 const b=setup({requests:{incoming:[bob],outgoing:[]}});b.w.boot('connect/connect.js');await tick();await tick();
 b.w.document.querySelector('[data-friend-accept="bob"]').click();await tick();assert(b.calls.some(c=>c.route==='/friends/bob/accept'));
 const share=b.w.document.querySelector('[data-share-watching]');share.checked=true;share.dispatchEvent(new b.w.Event('change',{bubbles:true}));await tick();assert(b.calls.some(c=>c.route==='/settings'&&c.body.shareWatching));
 const join=b.w.document.querySelector('[data-home-token]');join.value='a'.repeat(32);b.w.document.querySelector('[data-home-join]').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert(b.calls.some(c=>c.route==='/home/accept'&&c.body.token==='a'.repeat(32)));
});
test('share a title and invite to a watchparty are explicit actions to a selected friend',async()=>{
 const b=setup();b.w.boot('connect/connect.js');await tick();await tick();
 await b.w.SwiflyConnect.share({id:'101',type:'movie'});b.w.document.querySelector('[data-share-friend="bob"]').click();await tick();
 assert(b.calls.some(c=>c.route==='/messages/bob'&&c.body.kind==='title'&&c.body.media.id==='101'));
 await b.w.SwiflyConnect.share({id:'101',type:'movie'},{party:true});b.w.document.querySelector('[data-share-friend="bob"]').click();await tick();assert(b.calls.some(c=>c.body?.kind==='party'));
});
test('signed-out private social screen offers server sign-in without exposing cached conversations',async()=>{
 const b=browser(connectMarkup()+connectDialogs(),{path:'/friends'});b.window.SwiflyAccount={ready:Promise.resolve({user:null,available:true})};b.window.boot('connect/connect.js');await tick();assert(b.window.document.querySelector('[data-connect-signin]'));assert.equal(b.window.document.querySelector('[data-message-form]'),null);
});
test('account activation isolates private library state and never keeps plaintext browser passwords',async()=>{
 const b=browser(),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({user:null,available:true})});w.localStorage.setItem('swiflytv.accounts','[{"password":"secret"}]');w.localStorage.setItem('swiflytv.accountOwner','old');w.localStorage.setItem('movieverse.watchlist','[{"id":99}]');w.boot('account.js');await w.SwiflyAccount.ready;
 w.SwiflyAccount.activate({id:'new',name:'New',email:'new@example.com'});assert.equal(w.localStorage.getItem('movieverse.watchlist'),null);assert.equal(w.localStorage.getItem('swiflytv.accounts'),null);w.SwiflyAccount.activate({id:'old',name:'Old'});assert.equal(JSON.parse(w.localStorage.getItem('movieverse.watchlist'))[0].id,99);
});
test('sign-in errors remain visible and never create a local account as a fallback',async()=>{
 const b=browser('<main class="dsAuthPage" data-auth-mode="login"><form id="safeAuthForm"><input name="email" value="a@example.com"><input name="password" value="wrong"><button type="submit">Log in</button><p data-auth-error hidden></p></form></main>',{path:'/login'}),w=b.window;
 w.fetch=async(url)=>({ok:!String(url).endsWith('/auth/login'),status:401,json:async()=>String(url).endsWith('/session')?{user:null,available:true}:{message:'Email or password is incorrect.'}});w.boot('account.js');await w.SwiflyAccount.ready;
 w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(w.document.querySelector('[data-auth-error]').textContent,/incorrect/);assert.equal(w.localStorage.getItem('swiflytv.session'),null);assert.equal(w.localStorage.getItem('swiflytv.accounts'),null);
});
test('the shared server sign-in script reveals and conceals the password accessibly',async()=>{
 const b=browser('<main data-auth-mode="login"><form id="safeAuthForm"><input name="password" type="password"><button type="button" data-auth-toggle-password aria-pressed="false">Show</button><button type="submit">Log in</button></form></main>',{path:'/login'}),w=b.window;w.fetch=async()=>({ok:true,json:async()=>({user:null,available:true})});w.boot('account.js');const toggle=w.document.querySelector('[data-auth-toggle-password]'),input=w.document.querySelector('input');toggle.click();assert.equal(input.type,'text');assert.equal(toggle.getAttribute('aria-pressed'),'true');toggle.click();assert.equal(input.type,'password');
});
test('private conversation content is cleared when a page enters history and is reauthenticated on return',async()=>{
 const b=setup();b.w.boot('connect/connect.js');await tick();await tick();b.w.document.querySelector('[data-connect-friend="bob"]').click();await tick();assert(b.w.document.querySelector('.svMessageLog').textContent.includes('hello'));b.w.dispatchEvent(new b.w.Event('pagehide'));assert.equal(b.w.document.querySelector('.svMessageLog'),null,'a history snapshot must not retain a previous account’s conversation');
});
test('returning from history ignores a bootstrap response issued under an earlier account session',async()=>{
 const b=setup();let release,calls=0;const fresh={...b.payload,user:{...alice,id:'new',name:'New viewer',handle:'newviewer'},friends:[]};b.w.SwiflyAccount.request=async route=>{if(route==='/bootstrap'){calls++;return calls===1?new Promise(r=>release=r):fresh;}return {ok:true};};b.w.boot('connect/connect.js');await tick();b.w.dispatchEvent(new b.w.Event('pagehide'));const back=new b.w.Event('pageshow');Object.defineProperty(back,'persisted',{value:true});b.w.dispatchEvent(back);await tick();assert.equal(calls,2,'history restoration must start a fresh authenticated request');release(b.payload);await tick();await tick();assert.match(b.w.document.querySelector('[data-connect-content]').textContent,/@newviewer/);assert(!b.w.document.querySelector('[data-connect-content]').textContent.includes('@bob'));
});
test('shared-home invitations stay visible through their own live refresh and unrelated notifications',async()=>{
 const home={id:'our-home',members:[alice],titles:[]},b=setup({home});let changed;
 b.w.EventSource=class{addEventListener(name,fn){if(name==='change')changed=fn;}close(){}};
 const original=b.w.SwiflyAccount.request;b.w.SwiflyAccount.request=async(route,options)=>route==='/home/invite'?{token:'a'.repeat(32),expiresAt:Date.now()+86400000}:original(route,options);
 b.w.boot('connect/connect.js');await tick();await tick();b.w.document.querySelector('.svHomeCard > button').click();await tick();
 assert.match(b.w.document.querySelector('.svHomeInvite input')?.value||'',/invite=a{32}/);changed();await tick();await tick();assert.match(b.w.document.querySelector('.svHomeInvite input')?.value||'',/invite=a{32}/);
 home.members.push(bob);changed();await tick();await tick();assert.equal(b.w.document.querySelector('.svHomeInvite'),null,'consumed invitations must disappear');
});
function libraryBrowser(){
 const b=browser('<div id="watchlistGrid"></div><div id="likedGrid"></div>',{path:'/my-list'}),source=fs.readFileSync(require.resolve('../server.js'),'utf8');
 b.window.structuredClone=structuredClone;b.window.eval(source.slice(source.indexOf('    function readLibrary(key)'),source.indexOf('    (function enablePremiumPosterTilt(){')));return b;
}
test('server account hydration redraws the actual saved-list and liked grids',async()=>{
 const b=libraryBrowser(),w=b.window,entry={id:'1',key:'movie:1',type:'movie',title:'Remote favorite'};
 w.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('/session')?{user:alice,available:true}:{revision:1,state:{'movieverse.watchlist':[entry],'movieverse.liked':[entry]}}});w.boot('account.js');await w.SwiflyAccount.ready;
 assert.match(w.document.getElementById('watchlistGrid').textContent,/Remote favorite/);assert.match(w.document.getElementById('likedGrid').textContent,/Remote favorite/);
});
test('history restoration revalidates identity before hydrating the new account and clears the old private grid',async()=>{
 const b=libraryBrowser(),w=b.window;let current=alice;const requests=[];
 w.fetch=async(url,options)=>{requests.push({url,account:options.headers['X-Swifly-Account']});return {ok:true,json:async()=>String(url).endsWith('/session')?{user:current,available:true}:{revision:1,state:{'movieverse.watchlist':[{id:'1',type:'movie',title:current.id+' private list'}]}}};};w.boot('account.js');await w.SwiflyAccount.ready;
 w.dispatchEvent(new w.Event('pagehide'));assert(!w.document.getElementById('watchlistGrid').textContent.includes('alice private list'),'history snapshots must clear private library rows');current={...alice,id:'bob',name:'Bob'};const back=new w.Event('pageshow');Object.defineProperty(back,'persisted',{value:true});w.dispatchEvent(back);await tick();await tick();
 assert.equal(w.SwiflyAccount.user.id,'bob');assert.match(w.document.getElementById('watchlistGrid').textContent,/bob private list/);assert(!w.document.getElementById('watchlistGrid').textContent.includes('alice private list'));assert.equal(requests.at(-1).account,'bob');
});
test('an account_changed response revalidates the session instead of retaining an old identity',async()=>{
 const b=libraryBrowser(),w=b.window;let current=alice;
 w.fetch=async(url,options)=>{if(String(url).endsWith('/session'))return {ok:true,json:async()=>({user:current,available:true})};const mismatch=options.headers['X-Swifly-Account']!==current.id;return {ok:!mismatch,status:mismatch?409:200,json:async()=>mismatch?{code:'account_changed',message:'Account changed'}:{revision:1,state:{'movieverse.watchlist':[{id:'1',type:'movie',title:current.id+' private list'}]}}};};w.boot('account.js');await w.SwiflyAccount.ready;current={...alice,id:'bob',name:'Bob'};await w.SwiflyAccount.refreshState().catch(()=>{});await tick();await tick();
 assert.equal(w.SwiflyAccount.user.id,'bob');assert.match(w.document.getElementById('watchlistGrid').textContent,/bob private list/);
});
