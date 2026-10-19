'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createSiteGate}=require('../lib/site-gate');
async function fixture(pin='123456'){
 const app=express();app.use(express.urlencoded({extended:true}));
 const gate=createSiteGate({pin,secret:'testing-only-not-a-real-secret'});
 app.use(gate.router,gate.protect);
 app.get('/',(req,res)=>res.send('private home'));
 app.get('/api/private',(req,res)=>res.json({ok:true}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 return {gate,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('unconfigured gate maintains compatibility until PIN is set',()=>{
 const gate=createSiteGate({pin:''});assert.equal(gate.enabled,false);assert.equal(gate.validCookie(''),true);
});
test('PIN configuration accepts only six digits',()=>{
 assert.throws(()=>createSiteGate({pin:'abc123'}),/six digits/);
 assert.throws(()=>createSiteGate({pin:'12345'}),/six digits/);
});
test('pages, assets, APIs and cookies require server-side authorization',async t=>{
 const f=await fixture();t.after(f.close);
 let r=await fetch(f.url+'/',{redirect:'manual'});
 assert.equal(r.status,302);assert.match(r.headers.get('location'),/^\/access/);
 r=await fetch(f.url+'/api/private',{redirect:'manual'});
 assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'Access code required.'});
 r=await fetch(f.url+'/assets/private.css',{redirect:'manual'});
 assert.equal(r.status,302);
 r=await fetch(f.url+'/access');
 assert.equal(r.status,200);assert.match(await r.text(),/name="code"/);
 r=await fetch(f.url+'/access',{method:'POST',body:new URLSearchParams({code:'000000',next:'/'}),redirect:'manual'});
 assert.equal(r.status,401);
 r=await fetch(f.url+'/access',{method:'POST',body:new URLSearchParams({code:'123456',next:'/api/private'}),redirect:'manual'});
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/api/private');
 const cookie=r.headers.get('set-cookie').split(';')[0];
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);
 assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
 r=await fetch(f.url+'/api/private',{headers:{cookie}});
 assert.deepEqual(await r.json(),{ok:true});
 r=await fetch(f.url+'/',{headers:{cookie:cookie.slice(0,-1)+'!'},redirect:'manual'});
 assert.equal(r.status,302);
});
test('redirects never send the PIN visitor to another origin',async t=>{
 const f=await fixture();t.after(f.close);
 const r=await fetch(f.url+'/access',{method:'POST',body:new URLSearchParams({code:'123456',next:'//other.example'}),redirect:'manual'});
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');
});
test('PIN guesses are rate-limited before they can brute force the site',async t=>{
 const f=await fixture();t.after(f.close);
 let response;
 for(let i=0;i<8;i++)response=await fetch(f.url+'/access',{method:'POST',body:new URLSearchParams({code:'111111'}),redirect:'manual'});
 assert.equal(response.status,429);
});
