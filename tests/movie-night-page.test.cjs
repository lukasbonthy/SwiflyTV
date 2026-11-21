'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{loadServer}=require('./ui-helpers.cjs');
test('personalized screening HTML and its error paths are private and never cacheable',async()=>{
 const api=loadServer();await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+api.httpServer.address().port;
 try{api.movieNights.snapshot=async()=>({event:{id:'2030-01-04',title:'A screening',startsAt:Date.now()+3600000,votingClosesAt:Date.now()+3300000,phase:'voting',candidates:[],totalVotes:0,viewers:0,messages:[]},upcoming:[],viewer:{signedIn:true,name:'A private member'},serverTime:Date.now()});
  for(const route of ['/movie-nights','/movie-night/2030-01-04']){const response=await fetch(base+route);assert.equal(response.status,200);assert.match(await response.text(),/A private member/);assert.equal(response.headers.get('cache-control'),'private, no-store');}
  api.movieNights.snapshot=async()=>{throw Object.assign(Error('The screening is unavailable.'),{status:503});};const failed=await fetch(base+'/movie-nights');assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'private, no-store');
 }finally{api.movieNights.close();await new Promise(resolve=>api.io.close(resolve));}
});
