'use strict';

// A parent lock belongs to this browser, independently of a selectable profile
// or account. Its password verifier and state are authenticated and encrypted in
// an HttpOnly cookie, so a stable host secret preserves the lock across deploys.
const express=require('express');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {promisify}=require('node:util');
const rateLimit=require('express-rate-limit');
const {kidsMarkup,kidsUnavailableMarkup}=require('../ui/kids');
const scrypt=promisify(crypto.scrypt);
const COOKIE='swifly_kids_guard',MARKER='swifly_kids_mode',YEAR=365*86400000;
const HASH_OPTIONS={N:1<<17,r:8,p:1,maxmem:256*1024*1024};
const BAD_GENRES=new Set([27,53,80,10752,10768]);
const BAD_WORDS=/\b(?:horror|slasher|serial killer|murder|erotic|sexual|porn(?:ography)?|gore|suicide|rape|prostitut(?:e|ion)|exorcis[mt]|drug cartel|cocaine|stripper)\b/i;
const MOVIE_RATINGS=new Set(['G','PG']),TV_RATINGS=new Set(['TV-Y','TV-Y7','TV-G']);
const opaque=/^[A-Za-z0-9_-]{16,100}$/;
const id=value=>typeof value==='string'||typeof value==='number'?(/^[1-9]\d{0,9}$/.test(String(value))?String(value):''):'';
const plain=value=>String(value||'').slice(0,5000);
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);

function localKey(options){
 const configured=options.secret??process.env.SWIFLY_KIDS_SECRET??process.env.SWIFLY_ACCESS_SECRET;
 if(typeof configured==='string'&&Buffer.byteLength(configured)>=24)return crypto.createHash('sha256').update('swifly-kids:v1:'+configured).digest();
 if(options.secret!==undefined||process.env.RENDER)return null;
 // Local development has the same durable-file option as the account store.
 try{
  const directory=options.directory||process.env.SWIFLY_DATA_DIR||path.join(process.cwd(),'.swifly-data');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const filename=path.join(directory,'kids-signing-key');
  try{fs.writeFileSync(filename,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  const key=fs.readFileSync(filename);return key.length===32?key:null;
 }catch{return null;}
}
function cookieValues(header){
 const entries=String(header||'').split(';').map(value=>value.trim()),find=name=>entries.filter(value=>value.startsWith(name+'=')).map(value=>value.slice(name.length+1));
 return {guard:find(COOKIE),marker:find(MARKER)};
}
function createKids(options={}){
 const tmdb=options.tmdb;if(typeof tmdb!=='function')throw new TypeError('Kids needs the title catalog.');
 const key=localKey(options),now=options.now||Date.now,router=express.Router();
 const cache=new Map(),pending=new Map(),devices=new Map(),transports=new Map(),mutations=new Set();
 let hashesRunning=0;
 const available=Boolean(key),staticPath=value=>value.startsWith('/assets/')||value.startsWith('/react-assets/')||value==='/favicon.ico';
 function seal(value,purpose='guard'){
  const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('swifly-kids:v1:'+purpose));
  return Buffer.concat([nonce,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64url');
 }
 function open(value,purpose='guard'){
  if(!key||typeof value!=='string'||value.length>1800||!/^[A-Za-z0-9_-]+$/.test(value))return null;
  try{
   const packet=Buffer.from(value,'base64url');if(packet.length<40)return null;
   const decipher=crypto.createDecipheriv('aes-256-gcm',key,packet.subarray(0,12));decipher.setAAD(Buffer.from('swifly-kids:v1:'+purpose));decipher.setAuthTag(packet.subarray(-16));
   const record=JSON.parse(Buffer.concat([decipher.update(packet.subarray(12,-16)),decipher.final()]).toString('utf8'));
   if(record.v!==1||!opaque.test(record.id||'')||typeof record.locked!=='boolean'||!Number.isSafeInteger(record.revision)||record.revision<0||!Number.isFinite(record.at)||record.at>now()+60000)return null;
   if(record.hash!==undefined&&(!/^[a-f0-9]{32}$/.test(record.salt||'')||!/^[a-f0-9]{128}$/.test(record.hash)))return null;
   if(record.locked&&!record.hash)return null;
   return record;
  }catch{return null;}
 }
 function state(header){
  const values=cookieValues(header),present=values.guard.length||values.marker.length;
  const decoded=values.guard.length===1?open(values.guard[0]):null;
  const closed=()=>({record:null,configured:Boolean(present),locked:Boolean(present),recoveryRequired:Boolean(present),available});
  if(!decoded)return closed();
  const marker=values.marker.length===1?open(values.marker[0],'mode'):null;
  if((decoded.hash||values.marker.length)&&(!marker?.hash||marker.id!==decoded.id))return closed();
  // Existing sockets may still hold the pre-lock cookie. The server remembers
  // the latest record so that old open/unconfigured credentials cannot reset it.
  const remembered=devices.get(decoded.id)?.record;
  let record=[decoded,marker,remembered].filter(Boolean).sort((a,b)=>b.revision-a.revision||b.at-a.at)[0];
  // Both cookies authenticate the same complete revision. A partially rolled
  // back browser stays locked after restart/eviction; the current password can
  // recover it. Replacing the entire browser identity is outside this lock.
  if(marker&&[decoded.revision===marker.revision,decoded.hash===marker.hash,decoded.salt===marker.salt,decoded.locked===marker.locked,decoded.at===marker.at].some(equal=>!equal))record={...record,locked:true};
  return {record,configured:Boolean(record.hash),locked:record.locked,recoveryRequired:false,available};
 }
 function status(value){return {configured:value.configured,locked:value.locked,available,recoveryRequired:value.recoveryRequired,scope:'this-browser',ratings:'G / PG · TV-Y / TV-Y7 / TV-G'};}
 function fresh(){return {v:1,id:crypto.randomBytes(24).toString('base64url'),locked:false,revision:0,at:now()};}
 function issue(req,res,record){
  // Lax includes the lock on top-level GET links from other sites; Strict
  // would omit it on that first navigation. Mutations also require JSON and
  // an exact same-origin Origin header (when supplied) below.
  const settings={path:'/',httpOnly:true,secure:req.secure,sameSite:'lax',maxAge:YEAR};
  res.cookie(COOKIE,seal(record),settings);
  // A separately authenticated copy preserves the latest lock revision even
  // when the guard is stale and the process-local acceleration map is empty.
  if(record.hash)res.cookie(MARKER,seal(record,'mode'),settings);
 }
 function remember(record){
  devices.delete(record.id);devices.set(record.id,{record:{...record},at:now()});
  while(devices.size>2000)devices.delete(devices.keys().next().value);
 }
 function mutate(fn){return wrap(async(req,res)=>{
  let current=req.kids||state(req.headers.cookie);
  const latest=state(req.headers.cookie);if(latest.record||latest.configured)current=latest;
  const device=current.record?.id||req.ip||'unverified';
  if(mutations.has(device))return res.status(409).json({message:'Parent controls are already updating in another tab. Try again in a moment.'});
  mutations.add(device);
  try{return await fn(req,res,current);}finally{mutations.delete(device);}
 });}
 const advance=(current,changes={})=>({...current.record,...changes,revision:(current.record?.revision||0)+1,at:now()});
 function deviceForHeader(header){return state(header).record?.id||'';}
 function socketAllowed(socket){return !state(socket?.handshake?.headers?.cookie).locked;}
 async function derive(password,salt){
  if(hashesRunning>=2)throw Object.assign(Error('The parent lock is busy. Try again in a moment.'),{status:429});
  hashesRunning++;try{return await scrypt(password,salt,64,HASH_OPTIONS);}finally{hashesRunning--;}
 }
 function password(value){return typeof value==='string'&&Array.from(value).length>=8&&Array.from(value).length<=128&&Buffer.byteLength(value)<=512?value:'';}
 async function verifyPassword(value,record){
  if(typeof value!=='string'||!value||Buffer.byteLength(value)>512||!record?.hash)return false;
  return crypto.timingSafeEqual(await derive(value,record.salt),Buffer.from(record.hash,'hex'));
 }
 function deny(req,res,message='A grown-up needs to unlock Kids first.'){
  res.set('Cache-Control','private, no-store');
  if(req.path.startsWith('/api/')||!['GET','HEAD'].includes(req.method))return res.status(423).json({message,code:'kids_locked',next:'/kids?parent=1'});
  return res.redirect(303,'/kids?parent=1');
 }
 async function verifyTitle(type,rawId){
  const titleId=id(rawId);if(!['movie','tv'].includes(type)||!titleId)return {allowed:false};
  const cacheKey=type+':'+titleId,hit=cache.get(cacheKey);if(hit&&hit.expires>now())return hit.value;if(pending.has(cacheKey))return pending.get(cacheKey);
  const task=Promise.resolve().then(async()=>{
   const suffix=type==='movie'?'release_dates':'content_ratings';
   const [details,ratings]=await Promise.all([tmdb('/'+type+'/'+titleId,{},21600000),tmdb('/'+type+'/'+titleId+'/'+suffix,{},21600000)]);
   if(!details||details.__error||!ratings||ratings.__error||details.adult===true)return {allowed:false};
   const genres=(Array.isArray(details.genres)?details.genres.map(value=>value.id):details.genre_ids||[]).map(Number);
   if(genres.some(value=>BAD_GENRES.has(value))||!genres.some(value=>(type==='movie'?[16,10751]:[16,10751,10762]).includes(value)))return {allowed:false};
   if(BAD_WORDS.test(plain(details.title||details.name)+' '+plain(details.overview)))return {allowed:false};
   const us=(Array.isArray(ratings.results)?ratings.results:[]).filter(value=>value.iso_3166_1==='US');
   const certificates=type==='movie'?us.flatMap(value=>Array.isArray(value.release_dates)?value.release_dates.map(row=>String(row.certification||'').trim()):[]):us.map(value=>String(value.rating||'').trim());
   const known=[...new Set(certificates.filter(Boolean))],allowedRatings=type==='movie'?MOVIE_RATINGS:TV_RATINGS;
   if(!known.length||known.some(value=>!allowedRatings.has(value)))return {allowed:false};
   const safeImage=value=>typeof value==='string'&&/^\/[A-Za-z0-9_.-]+$/.test(value)?value:'';
   return {allowed:true,id:titleId,type,title:plain(details.title||details.name).slice(0,180),overview:plain(details.overview),rating:known.includes('PG')?'PG':known[0],poster:safeImage(details.poster_path),backdrop:safeImage(details.backdrop_path),year:String(details.release_date||details.first_air_date||'').slice(0,4),genres,details};
  }).catch(()=>({allowed:false})).then(value=>{
   cache.delete(cacheKey);cache.set(cacheKey,{value,expires:now()+(value.allowed?21600000:600000)});while(cache.size>500)cache.delete(cache.keys().next().value);return value;
  }).finally(()=>pending.delete(cacheKey));pending.set(cacheKey,task);return task;
 }
 function transport(pathname){
  const match=/^\/api\/(hls-proxy|media-file-proxy|subtitle-proxy)\/([A-Za-z0-9_-]{4,100})\/(?:master\.m3u8|video\.mp4|asset|track\.vtt|status)$/.exec(pathname);
  return match?match[1]+':'+match[2]:'';
 }
 function grant(record,value){
  if(!record)return;let grants=transports.get(record.id);if(!grants){grants=new Map();transports.set(record.id,grants);}let visited=0;
  const walk=(item,depth)=>{
   if(++visited>500||depth>8)return;
   if(typeof item==='string'&&item.length<4096){try{const u=new URL(item,'https://kids.invalid');if(u.origin==='https://kids.invalid'){const token=transport(u.pathname);if(token)grants.set(token,now()+7200000);}}catch{}}
   else if(Array.isArray(item))for(const child of item)walk(child,depth+1);
   else if(item&&typeof item==='object')for(const child of Object.values(item))walk(child,depth+1);
  };walk(value,0);
  for(const [token,expires]of grants)if(expires<now())grants.delete(token);
  while(grants.size>64)grants.delete(grants.keys().next().value);
  while(transports.size>2000)transports.delete(transports.keys().next().value);
 }
 async function protect(req,res,next){
  try{
   const pathname=req.path.replace(/\/+$/,'')||'/';if(staticPath(pathname))return next();
   let current=state(req.headers.cookie);req.kids=current;
   if(available&&!current.record&&!current.configured){const record=fresh();current={...current,record};req.kids=current;issue(req,res,record);}
   if(current.configured)res.set('Cache-Control','private, no-store');
   if(pathname==='/kids'||pathname.startsWith('/kids/')||pathname.startsWith('/api/kids/'))return next();
   if(!current.locked)return next();
   if(!['GET','HEAD'].includes(req.method))return deny(req,res);
   if(pathname==='/api/nuvio/providers')return next();
   const token=transport(pathname);
   if(token)return transports.get(current.record?.id)?.get(token)>now()?next():deny(req,res);
   const titleMatch=/^\/(movie|tv)\/([1-9]\d{0,9})$/.exec(pathname);
   const watchMatch=/^\/watch\/(movie|tv)\/([1-9]\d{0,9})$/.exec(pathname);
   const sourceMatch=/^\/api\/(?:proxy-video-wait|proxy-video|movie-source|hls-source|player\/(?:server|find-4k)|player-assist\/segments)\/(movie|tv)\/([1-9]\d{0,9})$/.exec(pathname);
   const episodeMatch=/^\/api\/library\/episodes\/(tv)\/([1-9]\d{0,9})\/[1-9]\d{0,3}$/.exec(pathname);
   const match=titleMatch||watchMatch||sourceMatch||episodeMatch;if(!match)return deny(req,res);
   const checked=await verifyTitle(match[1],match[2]);if(!checked.allowed)return deny(req,res,'This title is outside the Kids collection.');
   req.kidsTitle=checked;
   if(titleMatch)return res.redirect(303,'/kids/title/'+match[1]+'/'+match[2]);
   if(watchMatch&&(req.query.mode==='trailer'||req.query.roomId||req.query.embedUrl)){
    const params=new URLSearchParams({mode:'movie',...(match[1]==='tv'?{s:id(req.query.s||req.query.season)||'1',e:id(req.query.e||req.query.episode)||'1'}:{})});
    return res.redirect(303,pathname+'?'+params);
   }
   if(sourceMatch){const original=res.json;res.json=function(value){grant(current.record,value);return original.call(this,value);};}
   next();
  }catch(error){if(req.kids?.locked)return deny(req,res,'The Kids safety check is unavailable. Please try again.');next(error);}
 }
 router.use((req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  if(!['GET','HEAD'].includes(req.method)){
   if(!req.is('application/json')||req.get('sec-fetch-site')==='cross-site')return res.status(403).json({message:'Use the parent controls on SwiflyTV.'});
   if(req.get('origin')){try{const origin=new URL(req.get('origin'));if(origin.host!==req.get('host')||origin.protocol!==(req.secure?'https:':'http:'))throw Error();}catch{return res.status(403).json({message:'Open SwiflyTV directly to change parent controls.'});}}
  }
  next();
 });
 const limiter=rateLimit({windowMs:15*60000,limit:12,standardHeaders:true,legacyHeaders:false,message:{message:'Too many parent password attempts. Try again in 15 minutes.'}});
 const deviceLimiter=rateLimit({windowMs:15*60000,limit:8,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>'kids:'+crypto.createHash('sha256').update(req.kids?.record?.id||state(req.headers.cookie).record?.id||req.ip||'unknown').digest('hex'),message:{message:'Too many parent password attempts. Try again in 15 minutes.'}});
 router.get('/status',(req,res)=>res.json(status(req.kids||state(req.headers.cookie))));
 router.post('/setup',limiter,deviceLimiter,mutate(async(req,res,current)=>{
  if(current.configured)return res.status(409).json({message:'A parent password is already set for this browser. Unlock with that password.'});
  if(!available)return res.status(503).json({message:'Parent locking needs a stable server secret before it can be enabled. Ask the site owner to configure it.'});
  const value=password(req.body?.password);if(!value||value!==req.body?.confirm)return res.status(400).json({message:'Use a password of 8–128 characters and enter it twice.'});
  const record=advance(current,{...(current.record?{}:fresh()),salt:crypto.randomBytes(16).toString('hex'),locked:true});record.hash=(await derive(value,record.salt)).toString('hex');
  remember(record);issue(req,res,record);options.onLock?.(record.id);res.status(201).json({ok:true,...status({...current,configured:true,locked:true,recoveryRequired:false}),next:'/kids'});
 }));
 router.post('/lock',limiter,mutate(async(req,res,current)=>{
  if(!available||!current.record?.hash)return res.status(409).json({message:'Set up a parent password first.',recoveryRequired:current.recoveryRequired});
  const record=advance(current,{locked:true});remember(record);issue(req,res,record);options.onLock?.(record.id);res.json({ok:true,...status({...current,locked:true}),next:'/kids'});
 }));
 router.post('/unlock',limiter,deviceLimiter,mutate(async(req,res,current)=>{
  if(current.recoveryRequired)return res.status(409).json({message:'This parent lock cannot be verified. The site owner needs to restore the original server secret. The browser stays in Kids.',recoveryRequired:true});
  if(!await verifyPassword(req.body?.password,current.record))return res.status(401).json({message:'That parent password did not match. Try again.'});
  const record=advance(current,{locked:false});remember(record);issue(req,res,record);transports.delete(record.id);
  res.json({ok:true,...status({...current,locked:false}),next:'/'});
 }));
 router.post('/password',limiter,deviceLimiter,mutate(async(req,res,current)=>{
  const value=password(req.body?.password);
  if(!await verifyPassword(req.body?.currentPassword,current.record))return res.status(401).json({message:'Enter the current parent password to change it.'});
  if(!value||value!==req.body?.confirm)return res.status(400).json({message:'Use a password of 8–128 characters and enter it twice.'});
  const record=advance(current,{salt:crypto.randomBytes(16).toString('hex')});record.hash=(await derive(value,record.salt)).toString('hex');remember(record);issue(req,res,record);res.json({ok:true});
 }));
 async function catalog({category='all',q='',page=1}={}){
  const selected=['all','movies','shows','tiny','animation','family'].includes(category)?category:'all';
  const query=typeof q==='string'?q.trim().slice(0,80):'',number=Math.max(1,Math.min(500,parseInt(page,10)||1));
  const types=selected==='movies'?['movie']:selected==='shows'||selected==='tiny'?['tv']:['movie','tv'];
  const data=await Promise.all(types.map(async type=>{
   const params={include_adult:'false',page:number,...(query?{query}:{sort_by:'popularity.desc',with_genres:selected==='animation'?'16':selected==='family'?'10751':selected==='tiny'?'10762':type==='movie'?'16|10751':'16|10751|10762',without_genres:'27,53,80,10752,10768',...(type==='movie'?{certification_country:'US','certification.lte':'PG'}:{})})};
   try{return {type,...await tmdb('/'+(query?'search':'discover')+'/'+type,params,600000)};}catch{return {type,__error:true,results:[]};}
  }));
  const candidates=[],seen=new Set();for(const section of data)for(const row of (section.results||[]).slice(0,20)){const titleId=id(row.id),key=section.type+':'+titleId;if(titleId&&!seen.has(key)){seen.add(key);candidates.push([section.type,titleId]);}}
  const verified=Array(candidates.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{while(cursor<candidates.length){const at=cursor++;verified[at]=await verifyTitle(...candidates[at]);}}));
  const items=verified.filter(value=>value.allowed);
  return {items,category:selected,q:query,page:number,totalPages:Math.max(1,...data.map(value=>Math.min(500,Number(value.total_pages)||1))),unavailable:data.every(value=>value.__error)};
 }
 router.get('/catalog',wrap(async(req,res)=>res.json(await catalog(req.query))));
 router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status||503).json({message:error.status?error.message:'Kids is taking a little break. Please try again.'});});
 async function page(req){
  const current=req.kids||state(req.headers.cookie),selection=req.params?.type&&req.params?.id?await verifyTitle(req.params.type,req.params.id):null;
  const data=selection?null:await catalog(req.query);
  return {description:'A cheerful collection of carefully rated family movies and little-kid shows.',body:selection&&!selection.allowed?kidsUnavailableMarkup():kidsMarkup({catalog:data,status:status(current),selection,parentRequested:req.query?.parent==='1'}),extraHead:'<script defer src="/assets/kids/kids.js?v=2"></script>'};
 }
 return {protect,router,page,catalog,verifyTitle,socketAllowed,deviceForHeader,status:header=>status(state(header)),available};
}
module.exports={createKids};
