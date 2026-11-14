'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {partyMarkup}=require('../ui/party');
const {browser,source,tick,cleanup}=require('./ui-helpers.cjs');
const {communityService}=require('./community-test-helpers.cjs');
test.afterEach(cleanup);
const defaultSelf={id:'account-ava',name:'Ava',authenticated:true};
async function setup(options={}){
 const initialTab=options.initialTab||'chat',env=browser(partyMarkup({initialTab,openRoomCreation:true,allowedCreators:options.allowedCreators}),{path:'/social?tab='+initialTab}),w=env.window,events=new Map(),sent=[],calls=[];
 let peer;const socket={id:'ava',connected:true,on(name,fn){events.set(name,fn);return this;},emit(name,data,ack){sent.push({name,data,ack});if(peer)peer.send(name,data).then(response=>{if(response!==undefined)ack?.(response);});return this;},receive(name,data){events.get(name)?.(data);}};
 if(options.service){peer=options.service.connect(options.account||{id:defaultSelf.id,name:defaultSelf.name},(name,data)=>socket.receive(name,data));socket.id=peer.socket.id;}
 w.io=()=>socket;w.localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:'main',name:options.profileName||'Ava'}));
 for(const [key,value] of Object.entries(options.storage||{}))w.localStorage.setItem(key,JSON.stringify(value));
 w.fetch=async(url,init={})=>{url=String(url);calls.push({url,init});if(options.permissionFails&&url.includes('/permissions'))throw Error('Permission fixture unavailable');const data=url.includes('/permissions')?{permissions:{canCreateWatchRooms:true,canCreateGroups:false,canCreateChannels:false}}:url.includes('/media/search')?{results:[{id:101,type:'movie',title:'Arrival',year:'2016',poster:'https://image.tmdb.org/t/p/w342/arrival.jpg'}]}:url.endsWith('/social/rooms')?{rooms:[{id:'channel-book-club',members:[],messages:[],createdAt:1}]}:{movies:[],rooms:[],results:[]};return {ok:true,json:async()=>data};};
 w.eval(source('party/party.js'));await tick();await tick();
 if(!options.service&&initialTab==='chat'&&options.self!==false)socket.receive('social:history',{roomId:'channel-general',messages:[],self:options.self||defaultSelf,selfName:(options.self||defaultSelf).name,scope:'server-session'});
 return {...env,socket,sent,calls};
}
function snapshot(socket,roomId,messages=[],self=defaultSelf){socket.receive('social:history',{roomId,messages,self,selfName:self.name,scope:'server-session'});}

function submit(w,form){form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}

test('Server history appears for a newcomer and active-channel changes exclude stale history',async()=>{const env=await setup(),d=env.window.document;env.socket.receive('social:history',{roomId:'channel-general',messages:[{id:'first',author:'Bo',text:'What are you watching?',createdAt:1800000000000}]});assert.match(d.querySelector('#sv100Messages').textContent,/What are you watching/);d.querySelector('[data-room="channel-recommendations"]').click();env.socket.receive('social:history',{roomId:'channel-general',messages:[{author:'Bo',text:'Wrong room history',createdAt:1}]});assert.doesNotMatch(d.querySelector('#sv100Messages').textContent,/Wrong room/);env.socket.receive('social:history',{roomId:'channel-recommendations',messages:[{id:'second',author:'Bo',text:'Try Arrival',createdAt:1800000000001}]});assert.match(d.querySelector('#sv100Messages').textContent,/Try Arrival/);assert.equal(new URL(env.window.location.href).searchParams.get('room'),'channel-recommendations');});

test('Online people use real presence and channel switching clears outdated member names',async()=>{const env=await setup(),d=env.window.document;env.socket.receive('social:members',{roomId:'channel-general',members:['Ava','Bo <script>']});assert.match(d.querySelector('[data-community-members]').textContent,/Ava/);assert.match(d.querySelector('[data-community-members]').textContent,/Bo <script>/);assert.equal(d.querySelector('[data-community-members] script'),null);assert.match(d.querySelector('[data-community-member-count]').textContent,/2/);d.querySelector('[data-room="channel-recommendations"]').click();assert.doesNotMatch(d.querySelector('[data-community-members]').textContent,/Bo/);});

test('A conversation starter fills a draft without sending it or changing channel',async()=>{const env=await setup(),d=env.window.document,button=d.querySelector('[data-community-prompt]');assert(button,'Useful starters should be available without an empty chat dead end.');button.click();assert(d.querySelector('#sv100Input').value.length>3);assert.equal(d.activeElement,d.querySelector('#sv100Input'));assert.equal(env.sent.filter(e=>e.name==='social:message').length,0);});

test('Title recommendations search real media and remain a reviewable draft until Send',async()=>{const env=await setup(),w=env.window,d=w.document;d.querySelector('[data-community-share-toggle]').click();d.querySelector('[data-community-title-query]').value='Arrival';submit(w,d.querySelector('[data-community-title-form]'));await tick();await tick();assert(env.calls.some(c=>c.url.includes('/api/social/media/search?')&&c.url.includes('q=Arrival')));d.querySelector('[data-community-title-pick="movie:101"]').click();assert.match(d.querySelector('#sv100Input').value,/Arrival.*2016/);assert.match(d.querySelector('#sv100Input').value,/\/movie\/101/);assert.equal(env.sent.filter(e=>e.name==='social:message').length,0);submit(w,d.querySelector('#sv100Composer'));assert.equal(env.sent.filter(e=>e.name==='social:message').length,1);});

test('Shared local title links offer working details and party actions without interpreting HTML',async()=>{const env=await setup(),d=env.window.document;env.socket.receive('social:message',{roomId:'channel-general',author:'Bo',text:'Arrival (2016)\n/movie/101\n<img src=x onerror=alert(1)>',createdAt:1800000000000});const message=d.querySelector('.sv100Msg');assert.equal(message.querySelector('img'),null);assert.equal(message.querySelector('a[data-community-title-link]').getAttribute('href'),'/movie/101');assert.equal(message.querySelector('a[data-community-watch-link]').getAttribute('href'),'/social?tab=watchrooms&type=movie&movieId=101');assert.match(message.textContent,/<img/);});

test('Failed delivery preserves the message for retry and a server echo resolves pending delivery',async()=>{const env=await setup(),w=env.window,d=w.document;d.querySelector('#sv100Input').value='Want to watch together?';submit(w,d.querySelector('#sv100Composer'));const sent=env.sent.find(e=>e.name==='social:message');assert(sent.data.clientId);sent.ack({ok:false,code:'rate-limit'});assert.equal(d.querySelector('#sv100Input').value,'Want to watch together?');assert.match(d.querySelector('[data-community-compose-status]').textContent,/wait|again/i);d.querySelector('#sv100Input').value='Second message';submit(w,d.querySelector('#sv100Composer'));const second=env.sent.filter(e=>e.name==='social:message').at(-1);env.socket.receive('social:message',{...second.data,id:'server-id',author:'Ava',createdAt:1800000000000});assert.match(d.querySelector('#sv100Messages').textContent,/Second message/);assert.doesNotMatch(d.querySelector('[data-community-compose-status]').textContent,/Sending/);});

test('The community directory restores real custom lounges without claiming privacy',async()=>{const env=await setup(),d=env.window.document;assert(d.querySelector('[data-room="channel-book-club"]'),'Existing member channels must be reachable after a reload.');assert.doesNotMatch(d.querySelector('.partyCommunityNav').textContent,/Private Rooms|private conversation/);assert(d.querySelector('.partyCommunityNav a[href="/friends"]'));});

test('A restored unconfirmed draft keeps its original id on retry and clears on a late server confirmation',async()=>{const env=await setup(),w=env.window,d=w.document;d.querySelector('#sv100Input').value='One plan';submit(w,d.querySelector('#sv100Composer'));const first=env.sent.filter(e=>e.name==='social:message').at(-1);first.ack({ok:false,code:'rate-limit'});submit(w,d.querySelector('#sv100Composer'));const retry=env.sent.filter(e=>e.name==='social:message').at(-1);assert.equal(retry.data.clientId,first.data.clientId);retry.ack({ok:false,code:'rate-limit'});env.socket.receive('social:message',{...first.data,id:'accepted-on-server',author:'Ava',createdAt:1800000000000});assert.equal(d.querySelector('#sv100Input').value,'');assert.equal(d.querySelectorAll('.sv100Msg').length,1);});

test('Malformed cached/history records cannot break a conversation or inject invalid dates',async()=>{const env=await setup(),d=env.window.document;env.socket.receive('social:history',{roomId:'channel-general',messages:[null,1,{author:'Bo',text:'Valid message',createdAt:1e30}]});assert.match(d.querySelector('#sv100Messages').textContent,/Valid message/);assert.equal(d.querySelectorAll('.sv100Msg').length,1);env.socket.receive('social:message',{roomId:'channel-general',id:'after-malformed-history',author:'Bo',authorId:'account-bo',authenticated:true,text:'After malformed history fixture',createdAt:1800000000000});assert.equal(d.querySelectorAll('.sv100Msg').length,2);});


test('An empty server snapshot never replays cached Community messages from another account or server',async()=>{
 const env=await setup({storage:{'swiflytv.social.v103.channel-general':[{id:'old-session',author:'Past viewer',text:'Old server or account fixture',createdAt:1800000000000}]}}),d=env.window.document;
 assert.equal(d.querySelectorAll('.sv100Msg').length,0);
 assert.doesNotMatch(d.querySelector('#sv100Messages').textContent,/Old server or account/);
 env.socket.receive('social:message',{roomId:'channel-general',id:'current-server',author:'Bo',authorId:'account-bo',authenticated:true,text:'Current server fixture',createdAt:1800000000001});
 assert.match(d.querySelector('#sv100Messages').textContent,/Current server fixture/);
 snapshot(env.socket,'channel-general');
 assert.equal(d.querySelectorAll('.sv100Msg').length,0,'Even live messages must yield to an authoritative empty snapshot.');
});

test('A delayed send acknowledgement remains in its original channel after switching conversations',async()=>{
 const env=await setup(),w=env.window,d=w.document;
 d.querySelector('#sv100Input').value='General channel fixture';submit(w,d.querySelector('#sv100Composer'));const sent=env.sent.find(row=>row.name==='social:message');
 d.querySelector('[data-room="channel-recommendations"]').click();snapshot(env.socket,'channel-recommendations');
 d.querySelector('#sv100Input').value='Recommendations draft';
 const message={...sent.data,id:'general-confirmation',author:'Ava',authorId:'account-ava',authenticated:true,createdAt:1800000000000};
 sent.ack({ok:true,message});
 assert.doesNotMatch(d.querySelector('#sv100Messages').textContent,/General channel fixture/);
 assert.equal(d.querySelector('#sv100Input').value,'Recommendations draft');
 assert.equal(w.localStorage.getItem('swiflytv.social.v103.channel-recommendations'),null);
 d.querySelector('[data-room="channel-general"]').click();snapshot(env.socket,'channel-general',[message]);
 assert.equal(d.querySelectorAll('.sv100Msg').length,1);assert.match(d.querySelector('.sv100Msg').textContent,/General channel fixture/);
});

test('A mismatched-room acknowledgement cannot render or confirm the pending send',async()=>{
 const env=await setup(),w=env.window,d=w.document;
 d.querySelector('#sv100Input').value='Original room fixture';submit(w,d.querySelector('#sv100Composer'));const sent=env.sent.find(row=>row.name==='social:message');
 sent.ack({ok:true,message:{...sent.data,roomId:'channel-recommendations',id:'wrong-room',author:'Ava',authorId:'account-ava',authenticated:true,createdAt:1800000000000}});
 assert.equal(d.querySelectorAll('.sv100Msg').length,0);assert.match(d.querySelector('[data-community-compose-status]').textContent,/Sending/);
 sent.ack({ok:true,message:{...sent.data,id:'right-room',author:'Ava',authorId:'account-ava',authenticated:true,createdAt:1800000000000}});
 assert.equal(d.querySelectorAll('.sv100Msg').length,1);assert.equal(d.querySelector('[data-community-compose-status]').textContent,'');
});

test('A failed send stays scoped to its verified account and channel, including late acknowledgements',async()=>{
 const env=await setup(),w=env.window,d=w.document;
 d.querySelector('#sv100Input').value='Private draft fixture';submit(w,d.querySelector('#sv100Composer'));const first=env.sent.find(row=>row.name==='social:message');
 d.querySelector('[data-room="channel-recommendations"]').click();snapshot(env.socket,'channel-recommendations');
 first.ack({ok:false,code:'rate-limit'});
 assert.equal(d.querySelector('#sv100Input').value,'');assert.equal(d.querySelector('[data-community-compose-status]').textContent,'');
 d.querySelector('[data-room="channel-general"]').click();snapshot(env.socket,'channel-general');
 assert.equal(d.querySelector('#sv100Input').value,'Private draft fixture');
 const sameNameOtherAccount={id:'account-ava-imposter',name:'Ava',authenticated:true};snapshot(env.socket,'channel-general',[],sameNameOtherAccount);
 assert.equal(d.querySelector('#sv100Input').value,'','A new account must not inherit the prior account’s failed draft.');
 assert.equal(d.querySelector('[data-community-compose-status]').textContent,'');
 d.querySelector('#sv100Input').value='Private draft fixture';submit(w,d.querySelector('#sv100Composer'));const second=env.sent.filter(row=>row.name==='social:message').at(-1);
 assert.notEqual(second.data.clientId,first.data.clientId);
 first.ack({ok:true,message:{...first.data,id:'old-account-confirmation',author:'Ava',authorId:'account-ava',authenticated:true,createdAt:1800000000000}});
 assert.equal(d.querySelectorAll('.sv100Msg').length,0);assert.match(d.querySelector('[data-community-compose-status]').textContent,/Sending/);
});

test('Community account and guest labels stay visible when display names match',async()=>{
 const env=await setup(),d=env.window.document;
 env.socket.receive('social:members',{roomId:'channel-general',members:['Ava','Ava'],people:[defaultSelf,{id:'guest:another-socket',name:'Ava',authenticated:false}]});
 const people=[...d.querySelectorAll('.communityPerson')];
 assert.match(people[0].textContent,/Signed in/);assert.match(people[0].textContent,/You/);
 assert.match(people[1].textContent,/Guest/);assert.doesNotMatch(people[1].textContent,/You/);
 env.socket.receive('social:message',{roomId:'channel-general',id:'guest-message',author:'Ava',authorId:'guest:another-socket',authenticated:false,text:'Same name guest fixture',createdAt:1800000000000});
 env.socket.receive('social:message',{roomId:'channel-general',id:'account-message',author:'Ava',authorId:'account-ava',authenticated:true,text:'Account fixture',createdAt:1800000000001});
 const messages=[...d.querySelectorAll('.sv100Msg')];assert.match(messages[0].textContent,/Guest/);assert.equal(messages[0].classList.contains('mine'),false);assert.match(messages[1].textContent,/Signed in/);assert.equal(messages[1].classList.contains('mine'),true);
 env.socket.receive('social:typing',{roomId:'channel-general',id:'guest:another-socket',name:'Ava',authenticated:false});
 assert.match(d.querySelector('[data-community-typing]').textContent,/Ava.*Guest.*typing/);
});

test('The Watch together lobby joins no Community presence and tab changes leave and rejoin the selected channel',async()=>{
 const env=await setup({initialTab:'rooms'}),d=env.window.document;
 assert.equal(env.sent.filter(row=>row.name==='social:join').length,0);
 env.socket.receive('connect');assert.equal(env.sent.filter(row=>row.name==='social:join').length,0);
 d.querySelector('[data-tab="chat"]').click();assert.equal(env.sent.filter(row=>row.name==='social:join').at(-1)?.data.roomId,'channel-general');
 snapshot(env.socket,'channel-general');d.querySelector('[data-room="channel-recommendations"]').click();snapshot(env.socket,'channel-recommendations');
 const leaves=env.sent.filter(row=>row.name==='social:leave').length;d.querySelector('[data-tab="rooms"]').click();
 assert.equal(env.sent.filter(row=>row.name==='social:leave').length,leaves+1);
 const joins=env.sent.filter(row=>row.name==='social:join').length;env.socket.receive('connect');assert.equal(env.sent.filter(row=>row.name==='social:join').length,joins);
 d.querySelector('[data-tab="chat"]').click();assert.equal(env.sent.filter(row=>row.name==='social:join').at(-1)?.data.roomId,'channel-recommendations');
});


test('Actual controller presence follows the Community tab instead of the connected lobby socket',async()=>{
 const service=communityService(),a=await setup({service}),b=await setup({service,initialTab:'rooms',account:{id:'account-bo',name:'Bo'}});
 const people=()=>a.window.document.querySelector('[data-community-members]').textContent;
 assert.doesNotMatch(people(),/Bo/);assert.deepEqual([...service.rooms.get('channel-general').members.values()],['Ava']);
 b.socket.receive('connect');await tick();await tick();assert.doesNotMatch(people(),/Bo/);
 b.window.document.querySelector('[data-tab="chat"]').click();await tick();await tick();assert.match(people(),/Bo/);
 b.window.document.querySelector('[data-room="channel-recommendations"]').click();await tick();await tick();assert.doesNotMatch(people(),/Bo/);assert.equal(service.rooms.get('channel-recommendations').members.size,1);
 b.window.document.querySelector('[data-tab="rooms"]').click();await tick();await tick();assert.equal(service.rooms.get('channel-recommendations').members.size,0);
 b.socket.receive('connect');await tick();await tick();assert.equal(service.rooms.get('channel-general').members.size,1);assert.equal(service.rooms.get('channel-recommendations').members.size,0);
 b.window.document.querySelector('[data-tab="chat"]').click();await tick();await tick();assert.equal(service.rooms.get('channel-recommendations').members.size,1);assert.doesNotMatch(people(),/Bo/);
});


test('A failed permissions request never derives creator access from a local profile name',async()=>{
 const env=await setup({permissionFails:true,profileName:'Lukas',allowedCreators:['Lukas']}),permissions=env.window.SwiflySocial.permissions();
 assert.equal(permissions.canCreateChannels,false);assert.equal(permissions.canCreateGroups,false);assert.equal(permissions.canManageSocial,false);assert.equal(permissions.canCreateWatchRooms,true);
});


test('Watchroom message deduplication also prevents duplicate local cache writes',async()=>{
 const env=await setup(),w=env.window,d=w.document,room={id:'duplicate-watchroom',name:'Watchroom fixture',mediaKind:'blank'};
 w.SwiflySocial.openNativeWatchRoom(room);env.socket.receive('watchroom:joined',{room,isHost:false,messages:[]});
 const message={roomId:room.id,name:'Bo',text:'One watchroom fixture',at:1800000000000};env.socket.receive('watchroom:message',message);env.socket.receive('watchroom:message',message);
 assert.equal(d.querySelectorAll('.sv100Msg').length,1);assert.equal(JSON.parse(w.localStorage.getItem('swiflytv.social.v103.watchroom-'+room.id)).length,1);
});

test('Reconnecting in Community keeps its channel while restoring an active watchroom subscription',async()=>{
 const env=await setup(),w=env.window,d=w.document,room={id:'reconnect-watchroom',name:'Watchroom fixture',mediaKind:'blank'};
 w.SwiflySocial.openNativeWatchRoom(room);env.socket.receive('watchroom:joined',{room,isHost:false,messages:[]});
 d.querySelector('[data-tab="chat"]').click();d.querySelector('[data-room="channel-recommendations"]').click();snapshot(env.socket,'channel-recommendations');
 const joins=env.sent.filter(row=>row.name==='watchroom:join').length;env.socket.receive('disconnect');env.socket.receive('connect');
 assert.equal(d.querySelector('.svPartyHub').dataset.partyView,'chat');assert.equal(env.sent.filter(row=>row.name==='social:join').at(-1).data.roomId,'channel-recommendations');assert.equal(env.sent.filter(row=>row.name==='watchroom:join').length,joins+1);
 snapshot(env.socket,'channel-recommendations',[{id:'community-snapshot',author:'Bo',authorId:'account-bo',authenticated:true,text:'Current Community fixture',createdAt:1800000000000}]);
 env.socket.receive('watchroom:joined',{room,isHost:false,messages:[{name:'Bo',text:'Late watchroom fixture',at:1800000000001}]});
 assert.match(d.querySelector('#sv100Messages').textContent,/Current Community fixture/);assert.doesNotMatch(d.querySelector('#sv100Messages').textContent,/Late watchroom fixture/);
});

test('A confirmed draft in a new server snapshot cannot restore its earlier failed text after a channel switch',async()=>{
 const env=await setup(),w=env.window,d=w.document;
 d.querySelector('#sv100Input').value='Confirmed while away fixture';submit(w,d.querySelector('#sv100Composer'));const sent=env.sent.find(row=>row.name==='social:message');sent.ack({ok:false,code:'rate-limit'});
 d.querySelector('[data-room="channel-recommendations"]').click();snapshot(env.socket,'channel-recommendations');d.querySelector('[data-room="channel-general"]').click();
 snapshot(env.socket,'channel-general',[{...sent.data,id:'confirmed-while-away',author:'Ava',authorId:'account-ava',authenticated:true,createdAt:1800000000000}]);
 assert.equal(d.querySelector('#sv100Input').value,'');assert.equal(d.querySelector('[data-community-compose-status]').textContent,'');assert.equal(d.querySelectorAll('.sv100Msg').length,1);
});

test('Sending before a verified Community join preserves the typed text until the account and room are confirmed',async()=>{
 const env=await setup({self:false}),w=env.window,d=w.document;
 d.querySelector('#sv100Input').value='Wait for verified room fixture';submit(w,d.querySelector('#sv100Composer'));
 assert.equal(env.sent.filter(row=>row.name==='social:message').length,0);assert.equal(d.querySelector('#sv100Input').value,'Wait for verified room fixture');assert.match(d.querySelector('[data-community-compose-status]').textContent,/joining|connect/i);
 snapshot(env.socket,'channel-general');assert.equal(d.querySelector('#sv100Input').disabled,false);submit(w,d.querySelector('#sv100Composer'));assert.equal(env.sent.filter(row=>row.name==='social:message').length,1);
});
