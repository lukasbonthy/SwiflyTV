'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const filename=require('node:path').join(__dirname,'../public/clean/account-data.js');
const data=fs.existsSync(filename)?require(filename):{};
const item=(id,extra={})=>({id:String(id),type:'movie',title:'Title '+id,...extra});
const library=(watchlist=[])=>({version:1,watchlist,liked:[],watched:[],history:[],folders:[],episodeRead:[],preferences:{}});
const profile=(id,name,extra={})=>({profile:{id,name,mode:'standard'},library:library(),continue:[],...extra});
const backup=(profiles)=>({app:'SwiflyTV',kind:'account-backup',version:1,createdAt:'2026-10-27T12:00:00.000Z',profiles});
const storage=(values={})=>{const map=new Map(Object.entries(values).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]));return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),get length(){return map.size;},key:index=>[...map.keys()][index]??null};};

test('account backup exports only supported data and never account credentials or private services',()=>{
 assert.equal(typeof data.capture,'function','a real portable account backup is missing');
 const s=storage({'swiflytv.profiles':[{id:'main',name:'Luke',password:'never-export',email:'private@example.com'}],'swiflytv.library.main':library([item(1,{poster:'javascript:alert(1)',secret:'never-export'})]),'swiflytv.accounts':[{password:'never-export'}],'swiflytv.session':{id:'owner',email:'private@example.com'},'swiflytv.traktOutbox.owner':{secret:'never-export'},'movieverse.continue':[item(2,{profileId:'main',currentTime:15,duration:100,watchedAt:'2026-10-27T10:00:00Z'})]});
 const result=data.capture(s,{owner:'owner'}),text=JSON.stringify(result);
 assert.equal(result.profiles[0].profile.name,'Luke');assert.equal(result.profiles[0].library.watchlist[0].id,'1');assert.equal(result.profiles[0].library.watchlist[0].poster,'');assert.equal(result.profiles[0].continue[0].currentTime,15);assert(!/never-export|private@example|traktOutbox|session/.test(text));
});

test('parse validates the backup schema, byte limit and nested prototypes before any writes',()=>{
 assert.equal(typeof data.parse,'function');assert.equal(data.parse(JSON.stringify(backup([profile('main','Luke')]))).profiles.length,1);
 for(const value of ['{"app":"SwiflyTV","kind":"account-backup","version":99,"profiles":[]}',JSON.stringify({...backup([profile('main','Luke')]),sessions:{}}),'{"__proto__":{"polluted":true}}','x'.repeat(2097153),'{bad'])assert.throws(()=>data.parse(value));
 const nested=backup([profile('main','Luke',{library:library([item(1)])})]);nested.profiles[0].library.watchlist[0].constructor={prototype:{polluted:true}};assert.throws(()=>data.parse(JSON.stringify(nested)));assert.equal({}.polluted,undefined);
});

test('imports add titles, retain newer progress and exact episode history, and union folder members',()=>{
 assert.equal(typeof data.plan,'function');
 const current=backup([profile('main','Luke',{library:{...library([item(1)]),liked:[item(3)],folders:[{id:'weekend',name:'My weekend',members:['movie:1'],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-10-27T01:00:00Z'}],history:[{id:'10',type:'tv',title:'Series',season:1,episode:2,currentTime:300,duration:600,watchedAt:'2026-10-27T01:00:00Z'}]},continue:[item(1,{currentTime:60,duration:100,watchedAt:'2026-10-27T01:00:00Z'})]})]);
 const incoming=backup([profile('main','Luke',{library:{...library([item(1),item(2)]),folders:[{id:'weekend',name:'Old weekend',members:['movie:2'],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z'}],history:[{id:'10',type:'tv',title:'Series',season:1,episode:1,currentTime:600,duration:600,completed:true,watchedAt:'2026-01-01T00:00:00Z'}]},continue:[item(1,{currentTime:30,duration:100,watchedAt:'2026-01-01T00:00:00Z'})]})]);
 const result=data.plan(incoming,current);assert.deepEqual(result.backup.profiles[0].library.watchlist.map(v=>v.id),['1','2']);assert.equal(result.backup.profiles[0].continue[0].currentTime,60);assert.equal(result.backup.profiles[0].library.history.length,2);assert.equal(result.backup.profiles[0].library.folders[0].name,'My weekend');assert.deepEqual(result.backup.profiles[0].library.folders[0].members,['movie:1','movie:2']);
 const again=data.plan(incoming,result.backup);assert.deepEqual(again.backup.profiles,result.backup.profiles);assert.equal(again.added.titles,0);
});

test('profile mapping is deliberate, repeatable and cannot silently discard a ninth profile',()=>{
 assert.equal(typeof data.plan,'function');const current=backup([profile('main','New account')]),incoming=backup([profile('main','Old profile',{library:library([item(2)])})]);
 const result=data.plan(incoming,current);assert.equal(result.backup.profiles.length,2);assert.notEqual(result.mapping.main,'main');assert.equal(data.plan(incoming,result.backup).backup.profiles.length,2);
 const mapped=data.plan(incoming,current,{mapping:{main:'main'}});assert.equal(mapped.backup.profiles.length,1);assert.equal(mapped.backup.profiles[0].profile.name,'New account');
 assert.throws(()=>data.plan(backup([profile('extra','Extra')]),backup(Array.from({length:8},(_,i)=>profile('p'+i,'P'+i)))),/eight|8|profile/i);
});

test('legacy recovery reads preserved guest sources without exposing another account partition',()=>{
 assert.equal(typeof data.sources,'function');const s=storage({'swiflytv.deviceState.legacy':{'swiflytv.profiles':[{id:'main',name:'Old guest'}],'movieverse.watchlist':[item(8)]},'swiflytv.deviceState.alice':{'movieverse.watchlist':[item(99)]},'swiflytv.deviceState.bob':{'movieverse.watchlist':[item(2)]}});
 const sources=data.sources(s,{id:'bob',email:'bob@example.com'});assert(sources.some(v=>v.key==='swiflytv.deviceState.legacy'));assert(sources.some(v=>v.key==='swiflytv.deviceState.bob'));assert(!sources.some(v=>v.key.includes('alice')));assert.equal(JSON.stringify(sources).includes('99'),false);assert.notEqual(s.getItem('swiflytv.deviceState.legacy'),null);
});

test('import bounds reject overflowing merged lists and sanitize executable URLs and profile fields',()=>{
 assert.equal(typeof data.plan,'function');const current=backup([profile('main','Luke',{library:library(Array.from({length:300},(_,i)=>item(i+1)))})]);assert.throws(()=>data.plan(backup([profile('main','Luke',{library:library([item(999)])})]),current),/300|limit|large/i);
 const result=data.parse(JSON.stringify(backup([profile('main','<img src=x>',{library:library([item(1,{poster:'https://evil.example/track',backdrop:'//evil.example/track'})])})])));assert.equal(result.profiles[0].library.watchlist[0].poster,'');assert.equal(result.profiles[0].library.watchlist[0].backdrop,'');
});

test('atomic browser writes restore the original data when storage runs out partway through',()=>{
 assert.equal(typeof data.writeAtomic,'function');const s=storage({a:'old-a',b:'old-b'}),set=s.setItem;let once=true;s.setItem=(key,value)=>{if(key==='b'&&once){once=false;throw Error('QuotaExceededError');}return set(key,value);};assert.throws(()=>data.writeAtomic(s,{a:'new-a',b:'new-b',c:'new-c'}));assert.equal(s.getItem('a'),'old-a');assert.equal(s.getItem('b'),'old-b');assert.equal(s.getItem('c'),null);
});

test('quota rollback frees enlarged replacement values before restoring previously shrunken values',()=>{
 const s=storage({a:'a'.repeat(100),b:'b'}),set=s.setItem,limit=110;s.setItem=(key,value)=>{const entries=Array.from({length:s.length},(_,i)=>[s.key(i),s.getItem(s.key(i))]),size=entries.reduce((n,[k,v])=>n+(k===key?0:v.length),0)+value.length;if(size>limit)throw Error('QuotaExceededError');set(key,value);};assert.throws(()=>data.writeAtomic(s,{a:'',b:'b'.repeat(100),c:'c'.repeat(100)}));assert.equal(s.getItem('a'),'a'.repeat(100));assert.equal(s.getItem('b'),'b');assert.equal(s.getItem('c'),null);
});

test('a newly restored profile keeps its backed-up preferences while existing destinations keep theirs',()=>{
 const incoming=backup([profile('old','Old profile',{library:{...library(),preferences:{spoilerMode:true,autoSkipIntro:true,episodeSort:'newest'}}})]),current=backup([profile('main','Main')]);const created=data.plan(incoming,current).backup.profiles.find(v=>v.profile.name==='Old profile');assert.equal(created.library.preferences.spoilerMode,true);assert.equal(created.library.preferences.autoSkipIntro,true);assert.equal(created.library.preferences.episodeSort,'newest');const merged=data.plan(incoming,current,{mapping:{old:'main'}}).backup.profiles[0];assert.equal(merged.library.preferences.spoilerMode,false);
});
