'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createKids}=require('../lib/kids');

const secret='test-only-stable-kids-secret-'.repeat(3);
const titles={
 movie:{1:{id:1,title:'Cloud Friends',adult:false,genre_ids:[16,10751],genres:[{id:16},{id:10751}],overview:'A little bird makes new friends.',poster_path:'/cloud.jpg'},2:{id:2,title:'Night Frights',adult:false,genres:[{id:16},{id:27}],overview:'A haunted adventure.'},3:{id:3,title:'Unrated Cartoon',adult:false,genres:[{id:16}],overview:'A little adventure.'},4:{id:4,title:'Animated for Adults',adult:true,genres:[{id:16}],overview:'An adventure.'}},
 tv:{5:{id:5,name:'Little Garden',genres:[{id:10762},{id:16}],overview:'Friends grow a garden.',poster_path:'/garden.jpg'},6:{id:6,name:'Big Adventures',genres:[{id:16}],overview:'A family sets out.'},7:{id:7,name:'Mystery Monsters',genres:[{id:16},{id:80}],overview:'A mystery.'}}
};
async function tmdb(route){
 const match=/^\/(movie|tv)\/(\d+)(?:\/(release_dates|content_ratings))?$/.exec(route);
 if(match){const [_,type,id,suffix]=match,row=titles[type][id];if(!row)return {__error:true};
  if(suffix==='release_dates')return {results:[{iso_3166_1:'US',release_dates:[{certification:id==='3'?'':id==='4'?'R':'PG'}]}]};
  if(suffix==='content_ratings')return {results:[{iso_3166_1:'US',rating:id==='6'?'TV-PG':'TV-Y'}]};
  return structuredClone(row);
 }
 if(route.includes('movie'))return {results:Object.values(titles.movie),total_pages:2};
 if(route.includes('tv'))return {results:Object.values(titles.tv),total_pages:2};
 return {results:[],total_pages:0};
}
async function fixture(options={}){
 const app=express();app.use(express.json());const kids=createKids({secret,tmdb,...options});app.use(kids.protect);app.use('/api/kids',kids.router);
 app.get('/watch/:type/:id',(_req,res)=>res.send('verified player'));
 app.get('/movie/:id',(_req,res)=>res.send('general details'));
 app.get('/api/proxy-video-wait/:type/:id',(req,res)=>res.json({status:'ok',playbackUrl:req.query.external==='1'?'https://other.invalid/api/hls-proxy/external-token/master.m3u8':'/api/hls-proxy/safe-token/master.m3u8',subtitles:[{url:'/api/subtitle-proxy/safe-sub/track.vtt'}]}));
 app.get('/api/hls-proxy/:id/master.m3u8',(_req,res)=>res.send('#EXTM3U'));
 app.get('/api/hls-proxy/:id/asset',(_req,res)=>res.send('segment'));
 app.get('/api/subtitle-proxy/:id/track.vtt',(_req,res)=>res.send('WEBVTT'));
 app.get('/kids',(_req,res)=>res.send('kids home'));
 app.all('*',(_req,res)=>res.send('general catalog'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port,jar=new Map();
 async function request(path,{method='GET',body,cookie,...other}={}){
  const response=await fetch(base+path,{method,redirect:'manual',headers:{...(cookie!==undefined?{Cookie:cookie}:jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{}),...other.headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(cookie===undefined)for(const value of response.headers.getSetCookie()){const first=value.split(';')[0],at=first.indexOf('=');jar.set(first.slice(0,at),first.slice(at+1));}
  return response;
 }
 return {kids,request,jar,base,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('Kids requires positive conservative US certification and rejects adult, horror and unrated animation',async()=>{
 const kids=createKids({secret,tmdb});
 assert.equal((await kids.verifyTitle('movie','1')).allowed,true);
 assert.equal((await kids.verifyTitle('tv','5')).allowed,true);
 for(const [type,id]of [['movie','2'],['movie','3'],['movie','4'],['tv','6'],['tv','7'],['movie','99']])assert.equal((await kids.verifyTitle(type,id)).allowed,false,type+':'+id);
 const catalog=await kids.catalog({});assert.deepEqual(catalog.items.map(item=>item.type+':'+item.id),['movie:1','tv:5']);
});

test('Parent setup locks the browser, stores no clear password and cannot be overwritten',async()=>{
 const f=await fixture();try{
  const response=await f.request('/api/kids/setup',{method:'POST',body:{password:'my parent passphrase',confirm:'my parent passphrase'}});assert.equal(response.status,201);
  // Top-level links from another site must still carry the browser lock.
  assert(response.headers.getSetCookie().every(value=>/HttpOnly/i.test(value)&&/SameSite=Lax/i.test(value)&&/Path=\//i.test(value)));
  assert(![...f.jar.values()].join('').includes('my parent passphrase'));
  assert.equal((await (await f.request('/api/kids/status')).json()).locked,true);
  assert.equal((await f.request('/api/kids/setup',{method:'POST',body:{password:'replace password',confirm:'replace password'}})).status,409);
  assert.equal((await f.request('/api/kids/unlock',{method:'POST',body:{password:'wrong passphrase'}})).status,401);
  assert.equal((await f.request('/profiles')).headers.get('location'),'/kids?parent=1');
  assert.equal((await f.request('/api/connect/auth/logout',{method:'POST',body:{}})).status,423);
  assert.equal((await f.request('/api/kids/unlock',{method:'POST',body:{password:'my parent passphrase'}})).status,200);
  assert.equal((await f.request('/profiles')).status,200);
 }finally{await f.close();}
});

test('Locked direct routes and alternate APIs cannot reach adult or unverifiable content',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/setup',{method:'POST',body:{password:'a long parent password',confirm:'a long parent password'}});
  assert.equal((await f.request('/kids')).status,200);
  assert.equal((await f.request('/watch/movie/1')).status,200);
  for(const path of ['/watch/movie/2','/watch/movie/3','/watch/movie/4','/watch/tv/6','/browse-by-languages','/search?q=adult','/profiles','/social','/audiobooks'])assert.equal((await f.request(path)).status,303,path);
  for(const path of ['/api/discovery/search?q=adult','/api/provider/source-debug?id=4','/api/local/netmirror?id=4','/api/download-source/movie/1','/api/hls-proxy/other-token/master.m3u8','/api/connect/state'])assert.equal((await f.request(path)).status,423,path);
  const safe=await f.request('/movie/1');assert.equal(safe.status,303);assert.equal(safe.headers.get('location'),'/kids/title/movie/1');
  assert.equal((await f.request('/watch/movie/1?mode=trailer')).status,303);
 }finally{await f.close();}
});

test('Only proxy transports returned for a verified child title are granted to that browser',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/setup',{method:'POST',body:{password:'a long parent password',confirm:'a long parent password'}});
  assert.equal((await f.request('/api/hls-proxy/safe-token/master.m3u8')).status,423);
  assert.equal((await f.request('/api/proxy-video-wait/movie/1')).status,200);
  assert.equal((await f.request('/api/hls-proxy/safe-token/master.m3u8')).status,200);
  assert.equal((await f.request('/api/hls-proxy/safe-token/asset?url=segment')).status,200);
  assert.equal((await f.request('/api/subtitle-proxy/safe-sub/track.vtt')).status,200);
  assert.equal((await f.request('/api/hls-proxy/unrelated/asset')).status,423);
  assert.equal((await f.request('/api/proxy-video-wait/movie/4')).status,423);
 }finally{await f.close();}
});

test('A restart with the same secret preserves the lock; tampering and missing credentials fail closed',async()=>{
 const a=await fixture();let cookie;
 try{await a.request('/api/kids/setup',{method:'POST',body:{password:'a long parent password',confirm:'a long parent password'}});cookie=[...a.jar].map(([k,v])=>k+'='+v).join('; ');}finally{await a.close();}
 const b=await fixture();try{
  assert.equal((await b.request('/profiles',{cookie})).status,303);
  assert.equal((await b.request('/api/kids/unlock',{method:'POST',cookie,body:{password:'a long parent password'}})).status,200);
  const marker=cookie.split('; ').find(value=>value.startsWith('swifly_kids_mode='));assert(marker);
  assert.equal((await b.request('/profiles',{cookie:marker})).status,303);
  const bad=cookie.replace(/swifly_kids_guard=[^;]+/,'swifly_kids_guard=broken');assert.equal((await b.request('/profiles',{cookie:bad})).status,303);
  assert.equal((await b.request('/api/kids/setup',{method:'POST',cookie:marker,body:{password:'new parent password',confirm:'new parent password'}})).status,409);
 }finally{await b.close();}
 const changed=await fixture({secret:'a changed encryption secret that must fail closed'});try{assert.equal((await changed.request('/profiles',{cookie})).status,303);}finally{await changed.close();}
});

test('Parent state changes reject cross-site/non-JSON requests and short passwords',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('/api/kids/setup',{method:'POST',body:{password:'123',confirm:'123'}})).status,400);
  assert.equal((await f.request('/api/kids/setup',{method:'POST',body:{password:'long parent password',confirm:'long parent password'},headers:{Origin:'https://other.invalid'}})).status,403);
  assert.equal((await f.request('/api/kids/setup',{method:'POST'})).status,403);
 }finally{await f.close();}
});

test('A current authenticated mode marker rejects a partially rolled-back guard after restart',async()=>{
 const a=await fixture();let oldInitial,oldUnlocked,currentMarker;
 try{
  await a.request('/api/kids/status');oldInitial='swifly_kids_guard='+a.jar.get('swifly_kids_guard');
  await a.request('/api/kids/setup',{method:'POST',body:{password:'an established parent password',confirm:'an established parent password'}});
  await a.request('/api/kids/unlock',{method:'POST',body:{password:'an established parent password'}});
  oldUnlocked='swifly_kids_guard='+a.jar.get('swifly_kids_guard');
  await a.request('/api/kids/lock',{method:'POST',body:{}});currentMarker='swifly_kids_mode='+a.jar.get('swifly_kids_mode');
 }finally{await a.close();}
 const b=await fixture();try{
  for(const guard of [oldInitial,oldUnlocked]){
   const cookie=guard+'; '+currentMarker;
   assert.equal((await b.request('/profiles',{cookie})).status,303,'a stale guard cannot unlock the current configured browser');
   assert.equal((await b.request('/api/kids/setup',{method:'POST',cookie,body:{password:'a replacement password',confirm:'a replacement password'}})).status,409,'stale first-visit state cannot overwrite the parent password');
  }
  const cookie=oldUnlocked+'; '+currentMarker;
  assert.equal((await b.request('/api/kids/unlock',{method:'POST',cookie,body:{password:'an established parent password'}})).status,200,'the current parent password can recover a partial cookie rollback');
 }finally{await b.close();}
});

test('Concurrent first-time parent setups cannot replace the winning password',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/status');const cookie=[...f.jar].map(([key,value])=>key+'='+value).join('; ');
  const passwords=['the first parent password','a different parent password'];
  const responses=await Promise.all(passwords.map(password=>f.request('/api/kids/setup',{method:'POST',cookie,body:{password,confirm:password}})));
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409],'exactly one setup commits for one browser');
  const winner=responses.findIndex(response=>response.status===201),header=responses[winner].headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.equal((await f.request('/api/kids/unlock',{method:'POST',cookie:header,body:{password:passwords[1-winner]}})).status,401);
  assert.equal((await f.request('/api/kids/unlock',{method:'POST',cookie:header,body:{password:passwords[winner]}})).status,200);
 }finally{await f.close();}
});

test('Server socket authorization follows lock state and denies an older open credential after locking',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/status');const open=[...f.jar].map(([k,v])=>k+'='+v).join('; ');
  assert.equal(f.kids.socketAllowed({handshake:{headers:{cookie:open}}}),true);
  await f.request('/api/kids/setup',{method:'POST',body:{password:'long parent password',confirm:'long parent password'}});
  assert.equal(f.kids.socketAllowed({handshake:{headers:{cookie:open}}}),false);
  assert.equal((await f.request('/api/kids/setup',{method:'POST',cookie:open,body:{password:'replacement password',confirm:'replacement password'}})).status,409);
 }finally{await f.close();}
});

test('Parent password guesses are limited for the browser and cannot silently unlock on error',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/setup',{method:'POST',body:{password:'long parent password',confirm:'long parent password'}});
  let response;for(let i=0;i<8;i++)response=await f.request('/api/kids/unlock',{method:'POST',body:{password:'incorrect parent password'}});
  assert.equal(response.status,429);assert.equal((await (await f.request('/api/kids/status')).json()).locked,true);
 }finally{await f.close();}
});

test('Locked source API grants never accept an absolute third-party URL disguised as local transport',async()=>{
 const f=await fixture();try{
  await f.request('/api/kids/setup',{method:'POST',body:{password:'long parent password',confirm:'long parent password'}});
  assert.equal((await f.request('/api/hls-proxy/safe-token/status')).status,423);
  assert.equal((await f.request('/api/proxy-video-wait/movie/1')).status,200);
  assert.equal((await f.request('/api/hls-proxy/safe-token/status')).status,200);
  assert.equal((await f.request('/api/proxy-video-wait/movie/1?external=1')).status,200);
  assert.equal((await f.request('/api/hls-proxy/external-token/master.m3u8')).status,423);
 }finally{await f.close();}
});
test('Verified Kids identity rejects mismatched IDs, media types and conflicting detail shapes',async()=>{
 for(const override of [{id:99},{media_type:'tv'},{title:undefined,name:'A TV response on a movie endpoint'}]){
  const kids=createKids({secret,tmdb:async route=>route.endsWith('/release_dates')?tmdb(route):({...titles.movie[1],...override})});
  assert.equal((await kids.verifyTitle('movie','1')).allowed,false);
 }
 const kids=createKids({secret,tmdb:async route=>route.endsWith('/release_dates')?tmdb(route):({...titles.movie[1],poster_path:'https://untrusted.invalid/adult.jpg',backdrop_path:'//untrusted.invalid/background.jpg'})});
 const verified=await kids.verifyTitle('movie','1');assert.equal(verified.allowed,true);assert.equal(verified.poster,'');assert.equal(verified.details.poster_path,'');assert.equal(verified.details.backdrop_path,'');
});
