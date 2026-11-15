'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),WebSocket=require('ws');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-kids-integration-'));
process.env.SWIFLY_DATA_DIR=directory;
process.env.SWIFLY_KIDS_SECRET='isolated-test-kids-secret-'.repeat(3);
delete process.env.SWIFLY_ACCESS_PIN;
const {loadServer}=require('./ui-helpers.cjs');
const api=loadServer();let origin;const jar=new Map(),sockets=[];
function cookies(){return [...jar].map(([key,value])=>key+'='+value).join('; ');}
async function request(route,{method='GET',body,cookie}={}){
 const response=await fetch(origin+route,{method,redirect:'manual',headers:{Cookie:cookie??cookies(),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(cookie===undefined)for(const value of response.headers.getSetCookie()){const first=value.split(';')[0],at=first.indexOf('=');jar.set(first.slice(0,at),first.slice(at+1));}
 return response;
}
function socket(cookie){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(origin.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket',{headers:{Cookie:cookie}});sockets.push(ws);
 const timeout=setTimeout(()=>{ws.close();reject(Error('Socket did not finish the test handshake'));},2000);
 ws.on('error',reject);ws.on('message',raw=>{const text=raw.toString();if(text.startsWith('0'))ws.send('40');else if(text.startsWith('40')){clearTimeout(timeout);resolve(ws);}else if(text.startsWith('44')){clearTimeout(timeout);ws.close();reject(Error('Socket denied'));}else if(text==='2')ws.send('3');});
 });}
test.before(async()=>{
 api.setTmdb(async endpoint=>{
  if(endpoint.endsWith('/release_dates'))return {results:[{iso_3166_1:'US',release_dates:[{certification:endpoint.includes('/201/')?'R':'G'}]}]};
  if(endpoint.endsWith('/videos'))return {results:[]};
  if(endpoint.startsWith('/genre/'))return {genres:[{id:16,name:'Animation'}]};
  if(endpoint==='/movie/101')return {id:101,title:'Cloud Friends',adult:false,genres:[{id:16},{id:10751}],release_date:'2024-01-01',poster_path:'/cloud.jpg',backdrop_path:'/cloud-wide.jpg',overview:'A little bird finds new friends.'};
  if(endpoint==='/movie/201')return {id:201,title:'Adults Only',adult:true,genres:[{id:27}],overview:'Horror for adults.'};
  if(endpoint.includes('/discover/movie')||endpoint.includes('/search/movie'))return {results:[{id:101,title:'Cloud Friends',genre_ids:[16,10751]},{id:201,title:'Adults Only',adult:true,genre_ids:[27]}],total_pages:1};
  return {results:[],total_pages:1};
 });
 await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
});
test.after(async()=>{for(const ws of sockets)ws.close();await new Promise(resolve=>api.io.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});

test('The actual app keeps Kids safe through direct routes, old sockets, stale cookies and parent unlock',async()=>{
 let response=await request('/kids');assert.equal(response.status,200);const page=await response.text();assert.match(page,/data-kids-root/);assert(!page.includes('Adults Only'));assert(page.includes('/assets/kids/guard.js?v=2'));
 const preLock=cookies(),connected=await socket(preLock);
 const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Lock left a pre-existing Community socket active')),2000);connected.once('close',()=>{clearTimeout(timer);resolve();});});
 response=await request('/api/kids/setup',{method:'POST',body:{password:'a test parent passphrase',confirm:'a test parent passphrase'}});assert.equal(response.status,201);await closed;
 for(const route of ['/movies','/profiles','/social?tab=chat','/audiobooks'])assert.equal((await request(route)).headers.get('location'),'/kids?parent=1',route+' must stay inside Kids');
 assert.equal((await request('/movies',{cookie:preLock})).headers.get('location'),'/kids?parent=1','a still-open tab cannot replay its unlocked cookie');
 for(const route of ['/api/discovery/search?q=horror','/api/movie-source/movie/201','/api/proxy-video-wait/movie/201'])assert.equal((await request(route)).status,423,route+' must reject unrestricted content');
 assert.equal((await request('/api/connect/auth/logout',{method:'POST',body:{}})).status,423,'account switching cannot remove the parent lock');
 await assert.rejects(socket(cookies()),/Socket denied/,'Kids cannot open a new Community connection');
 assert.equal((await request('/movie/101')).headers.get('location'),'/kids/title/movie/101');
 response=await request('/kids/title/movie/101');assert.equal(response.status,200);assert.match(await response.text(),/Cloud Friends/);
 response=await request('/watch/movie/101?mode=movie');assert.equal(response.status,200);assert.match(await response.text(),/data-player-root data-player-kids-verified="true"/);
 assert.equal((await request('/watch/movie/201?mode=movie')).headers.get('location'),'/kids?parent=1');
 assert.equal((await request('/api/kids/unlock',{method:'POST',body:{password:'wrong test passphrase'}})).status,401);
 assert.equal((await request('/api/kids/unlock',{method:'POST',body:{password:'a test parent passphrase'}})).status,200);
 assert.equal((await request('/movies')).status,200);
});
