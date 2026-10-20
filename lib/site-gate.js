'use strict';
// The six-digit code is server-only. Every HTTP route and Socket.IO namespace
// must verify the signed, HttpOnly cookie; a client-side splash is not a gate.
const express=require('express');
const crypto=require('crypto');
const rateLimit=require('express-rate-limit');
const {accessPage}=require('../ui/access-page');
const COOKIE='swifly_access';
const TTL=14*24*60*60*1000;
function safeNext(input){
  if(typeof input!=='string'||!input.startsWith('/')||input.startsWith('//')||/[\r\n\\]/.test(input)||input.length>2048||input.startsWith('/access'))return '/';
  return input;
}
function createSiteGate(options={}){
 const pin=String(options.pin??process.env.SWIFLY_ACCESS_PIN??'').trim();
 if(pin&&!/^[0-9]{6}$/.test(pin))throw new Error('SWIFLY_ACCESS_PIN must be exactly six digits.');
 if(process.env.SWIFLY_ACCESS_REQUIRED==='true'&&!pin)throw new Error('Set SWIFLY_ACCESS_PIN before enabling SWIFLY_ACCESS_REQUIRED.');
 const enabled=Boolean(pin);
 const signingKey=crypto.createHmac('sha256',(options.secret ?? process.env.SWIFLY_ACCESS_SECRET) || crypto.randomBytes(32)).update('swifly-access:v1:'+pin).digest();
 const pinHash=crypto.createHash('sha256').update(pin).digest();
 function mac(t){return crypto.createHmac('sha256',signingKey).update('v1:'+t).digest('base64url');}
 function validCookie(header){
  if(!enabled)return true;
  const item=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  if(!item)return false;
  const m=/^([0-9]{13})\.([A-Za-z0-9_-]{43})$/.exec(item.slice(COOKIE.length+1));
  if(!m)return false;
  const age=Date.now()-Number(m[1]);
  if(!Number.isFinite(age)||age < -60000||age>TTL)return false;
  const a=Buffer.from(m[2],'base64url'),b=Buffer.from(mac(m[1]),'base64url');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
 }
 function verify(code){
  if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))return false;
  return crypto.timingSafeEqual(pinHash,crypto.createHash('sha256').update(code).digest());
 }
 const router=express.Router();
 if(enabled){
  const limiter=rateLimit({windowMs:15*60*1000,limit:7,standardHeaders:'draft-7',legacyHeaders:false,
   handler(req,res){res.set('Cache-Control','no-store').status(429).send(accessPage(safeNext(req.body?.next),false,true));}});
  router.get('/access',(req,res)=>{
   res.set('Cache-Control','no-store');
   const next=safeNext(req.query.next);
   return validCookie(req.headers.cookie)?res.redirect(303,next):res.send(accessPage(next));
  });
  router.post('/access',limiter,(req,res)=>{
   res.set('Cache-Control','no-store');
   if(req.headers.origin){
    let origin;try{origin=new URL(req.headers.origin);}catch{return res.sendStatus(403);}
    if(origin.host!==req.get('host')||origin.protocol!==(req.secure?'https:':'http:'))return res.sendStatus(403);
   }
   if(!verify(req.body?.code))return res.status(401).send(accessPage(safeNext(req.body?.next),true));
   const now=String(Date.now());
   res.cookie(COOKIE,now+'.'+mac(now),{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/',maxAge:TTL});
   res.redirect(303,safeNext(req.body?.next));
  });
  router.post('/access/logout',(req,res)=>{
   res.clearCookie(COOKIE,{path:'/',httpOnly:true,sameSite:'lax',secure:req.secure});res.redirect(303,'/access');
  });
 }
 function protect(req,res,next){
  if(validCookie(req.headers.cookie))return next();
  res.set('Cache-Control','no-store');
  if(req.path.startsWith('/api/')||req.xhr)return res.status(401).json({error:'Access code required.'});
  if(!['GET','HEAD'].includes(req.method))return res.status(401).send('Access code required.');
  return res.redirect(302,'/access?next='+encodeURIComponent(safeNext(req.originalUrl)));
 }
 return {enabled,router,protect,validCookie};
}
module.exports={createSiteGate};
