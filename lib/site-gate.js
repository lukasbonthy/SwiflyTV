'use strict';
// The six-digit code is server-only. Every HTTP route and Socket.IO namespace
// must verify the signed, HttpOnly cookie; a client-side splash is not a gate.
const express=require('express');
const crypto=require('crypto');
const rateLimit=require('express-rate-limit');
const COOKIE='swifly_access';
const TTL=14*24*60*60*1000;
function safeNext(input){
  if(typeof input!=='string'||!input.startsWith('/')||input.startsWith('//')||/[\r\n\\]/.test(input)||input.length>2048||input.startsWith('/access'))return '/';
  return input;
}
function htmlEscape(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function accessPage(next,invalid=false){
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070b15"><title>Private access · SwiflyTV</title>'
 +'<style>*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 6%,#1d3760,transparent 48%),radial-gradient(ellipse at 100% 100%,#39234c,transparent 50%),#070b15;color:#f8f9ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}main{width:min(100%,440px);padding:clamp(25px,6vw,44px);border:1px solid #ffffff36;border-radius:30px;background:linear-gradient(140deg,#ffffff18,#ffffff06 64%,#ffffff10);box-shadow:0 30px 100px #0009,inset 0 1px #ffffff34;backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5)}.brand{font-size:14px;letter-spacing:.24em;font-weight:800;color:#e7e9ff}.eyebrow{margin:42px 0 8px;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:#b2c5ed}h1{margin:0;font-size:clamp(29px,7vw,38px);line-height:1.1;letter-spacing:-.045em}p{color:#bdc5d5;line-height:1.55}label{display:block;margin:27px 0 10px;color:#f1f3ff;font-size:14px}input{display:block;width:100%;height:68px;padding:0 10px;border:1px solid #ffffff47;border-radius:17px;outline:none;background:#060b19a6;color:white;font:600 32px/1 system-ui;letter-spacing:.29em;text-align:center;font-variant-numeric:tabular-nums}input:focus{border-color:#c6deff;box-shadow:0 0 0 4px #9ac7fa25}button{display:block;width:100%;min-height:58px;margin-top:18px;border:1px solid #ffffff6e;border-radius:17px;background:linear-gradient(#f1f5ff,#d6deed);color:#111726;font:700 17px system-ui;cursor:pointer}button:focus-visible{outline:3px solid #a8d7ff;outline-offset:4px}.fine{margin:18px 0 0;font-size:12px;text-align:center}.error{color:#ffb6c3;font-size:14px}</style></head>'
 +'<body><main><div class="brand">SWIFLYTV</div><p class="eyebrow">Friends-only viewing</p><h1>Enter your access code.</h1><p>Ask the host for the six-digit code to continue.</p>'
 +(invalid?'<p class="error" role="alert">Incorrect access code. Please try again.</p>':'')
 +'<form method="post" action="/access"><input type="hidden" name="next" value="'+htmlEscape(next)+'"><label for="code">6-digit access code</label><input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" enterkeyhint="go" required autofocus><button type="submit">Unlock SwiflyTV →</button></form><p class="fine">Only share the code with people you trust.</p></main>'
 +'<script>document.getElementById("code").addEventListener("input",function(){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})</script></body></html>';
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
   handler(req,res){res.set('Cache-Control','no-store').status(429).send(accessPage(safeNext(req.body?.next),true));}});
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
