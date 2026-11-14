'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createDiscovery}=require('../lib/discovery');
const recording=(id,overrides={})=>({id:String(id),title:'Pride and Prejudice',authors:[{first_name:'Jane',last_name:'Austen'}],language:'English',totaltime:'10:01:00',sections:[{id:'1',section_number:'1',title:'Chapter one',listen_url:'https://archive.org/download/pride/chapter_01.mp3',playtime:600}],...overrides});
const response=(books,status=200)=>({ok:status>=200&&status<300,status,json:async()=>status===404?{error:'Audiobooks could not be found'}:{books}});

test('ordinary title searches also find editions whose initial indefinite article was omitted',async t=>{
 const calls=[],get=await fixture(t,async url=>{const p=new URL(url).searchParams;calls.push(p.get('title'));return response(p.get('title')==='^A Tale of Two Cities'?[recording(510,{title:'A Tale of Two Cities',authors:[{first_name:'Charles',last_name:'Dickens'}]})]:[],p.get('title')==='^A Tale of Two Cities'?200:404);});
 const result=await get('/books?q=Tale%20of%20Two%20Cities');assert.equal(result.status,200);assert.deepEqual(result.data.books.map(book=>book.id),['510']);assert(calls.includes('^A Tale of Two Cities'));
});
async function fixture(t,fetcher){const discovery=createDiscovery({tmdb:async()=>({results:[]}),fetch:fetcher});const app=express();app.use(discovery.router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});return async path=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path);return {status:r.status,data:await r.json()};};}

test('ordinary partial title queries use the official prefix syntax rather than an exact title',async t=>{const calls=[];const get=await fixture(t,async url=>{const p=new URL(url).searchParams;calls.push(p);return response(p.get('title')==='^pride'?[recording(52)]:[],p.get('title')==='^pride'?200:404);});const r=await get('/books?q=pride');assert.equal(r.status,200);assert.equal(r.data.books[0]?.id,'52');assert(calls.some(p=>p.get('title')==='^pride'));assert(calls.length<=4);});

test('a full author name finds that author’s recordings and deduplicates matching title branches',async t=>{const calls=[];const get=await fixture(t,async url=>{const p=new URL(url).searchParams;calls.push(p);return response(p.get('author')==='Austen'?[recording(52)]:[],p.get('author')==='Austen'?200:404);});const r=await get('/books?q=Jane%20Austen');assert.equal(r.status,200);assert.deepEqual(r.data.books.map(b=>b.id),['52']);assert(calls.some(p=>p.get('author')==='Austen'));});

test('an honest no-match LibriVox 404 becomes an empty library result',async t=>{const get=await fixture(t,async()=>response([],404));const r=await get('/books?q=nonexistent');assert.equal(r.status,200);assert.deepEqual(r.data.books,[]);assert.equal(r.data.hasMore,false);});

test('browsing and search hide silent recordings, unsafe URLs and catalog pages masquerading as audio',async t=>{const get=await fixture(t,async()=>response([recording(1),recording(2,{sections:[]}),recording(3,{sections:[{listen_url:'https://archive.org/details/a-book'}]}),recording(4,{sections:[{listen_url:'https://archive.org/download/a/cover.jpg'}]}),recording(5,{sections:[{listen_url:'http://169.254.169.254/audio.mp3'}]})]));const r=await get('/books');assert.deepEqual(r.data.books.map(b=>b.id),['1']);assert.equal(r.data.books[0].chapterCount,1);assert.equal(r.data.books[0].playable,true);});

test('a direct silent recording is unavailable instead of opening an unusable player',async t=>{const get=await fixture(t,async()=>response([recording(52,{sections:[]})]));const r=await get('/books/52');assert.equal(r.status,404);assert.match(r.data.message,/recording|audio|available/i);});

test('filtered pages retain raw offsets and explicit next-page information',async t=>{const offsets=[];const get=await fixture(t,async url=>{const p=new URL(url).searchParams;offsets.push(Number(p.get('offset')));const start=Number(p.get('offset'))||0;return response(Array.from({length:25},(_,i)=>recording(start+i+1,{sections:i%2?[]:recording(1).sections})));});const a=await get('/books'),b=await get('/books?page=2');assert.equal(a.data.hasMore,true);assert.equal(a.data.nextPage,2);assert.equal(b.data.nextPage,3);assert.deepEqual(offsets,[0,24]);assert(!a.data.books.some(x=>b.data.books.some(y=>x.id===y.id)));});

test('title by author uses both pieces as local match words without hiding the right title',async t=>{const get=await fixture(t,async url=>{const p=new URL(url).searchParams;return response(p.get('author')==='Austen'?[recording(52)]:[],p.get('author')==='Austen'?200:404);});const r=await get('/books?q=Pride%20and%20Prejudice%20by%20Jane%20Austen');assert.equal(r.status,200);assert.equal(r.data.books[0]?.id,'52');});

test('a failed catalog remains retryable and repeated concurrent queries share source requests',async t=>{let count=0;const get=await fixture(t,async()=>{count++;return response([recording(52)]);});await Promise.all([get('/books?q=pride'),get('/books?q=pride')]);assert(count<=3);const fail=await fixture(t,async()=>response([],503));assert.equal((await fail('/books?q=pride')).status,503);});

test('a recording can offer its trusted public-domain text without accepting arbitrary links',async t=>{const get=await fixture(t,async url=>response([recording(new URL(url).searchParams.get('id')||52,{url_text_source:new URL(url).searchParams.get('id')==='53'?'javascript:alert(1)':'https://www.gutenberg.org/ebooks/1342'})]));assert.equal((await get('/books/52')).data.book.textUrl,'https://www.gutenberg.org/ebooks/1342');assert.equal((await get('/books/53')).data.book.textUrl,'');});
