const test=require('node:test'),assert=require('node:assert/strict');
const {loadServer}=require('./ui-helpers.cjs');const api=loadServer();let base;
test.before(async()=>{await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+api.httpServer.address().port;});
test.after(async()=>{await new Promise(resolve=>api.io.close(resolve));});
test('Party film search returns actual movie metadata through the server',async()=>{
 let called;api.setTmdb(async(endpoint,params)=>{called={endpoint,params};return {results:[{id:101,title:'Arrival',release_date:'2016-11-11',poster_path:'/poster.jpg'}]};});
 const response=await fetch(base+'/api/social/movies/search?q=Arrival');assert.equal(response.status,200);const data=await response.json();assert.equal(called.endpoint,'/search/movie');assert.equal(called.params.query,'Arrival');assert.equal(data.results[0].title,'Arrival');assert.equal(data.results[0].year,'2016');assert.match(data.results[0].poster,/image\.tmdb\.org/);
});
test('A failed metadata lookup returns a usable retry error',async()=>{
 api.setTmdb(async()=>({__error:true,message:'Unavailable'}));const response=await fetch(base+'/api/social/movies/search?q=Arrival');assert.equal(response.status,503);const data=await response.json();assert.equal(data.ok,false);assert.match(data.message,/unavailable|try again/i);
});
test('Traditional Create links register a party before redirecting to its invite',async()=>{
 const response=await fetch(base+'/watchrooms/new?social=1&creator=Ava&name=Movie+night',{redirect:'manual'});assert.equal(response.status,302);const target=new URL(response.headers.get('location'),base),id=target.searchParams.get('roomId');assert(id);
 const lookup=await fetch(base+'/api/date-room/'+id+'/state');assert.equal(lookup.status,200);assert.equal((await lookup.json()).room.name,'Movie night');
});
