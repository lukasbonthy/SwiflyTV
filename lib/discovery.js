'use strict';
const express=require('express');const cheerio=require('cheerio');
const rateLimit=require('express-rate-limit');
const fail=(status,message)=>Object.assign(Error(message),{status});
const plain=value=>{const text=String(value||'').slice(0,20000);return cheerio.load(text).text().replace(/\s+/g,' ').trim();};
function catalogUrl(value){try{const url=new URL(String(value||''));if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!(/(^|\.)archive\.org$/.test(url.hostname)||url.hostname==='librivox.org'))return '';url.protocol='https:';return url.href;}catch{return '';}}
function bookRow(b,detail=false){
 if(!/^\d{1,10}$/.test(String(b?.id||''))||!b.title)return null;
 const authors=Array.isArray(b.authors)?b.authors:[],sections=Array.isArray(b.sections)?b.sections:[];
 return {id:String(b.id),type:'book',title:plain(b.title).slice(0,200),author:authors.map(a=>[a.first_name,a.last_name].filter(Boolean).join(' ')).join(', ').slice(0,240)||'LibriVox volunteers',language:String(b.language||''),description:plain(b.description).slice(0,5000),duration:String(b.totaltime||''),poster:catalogUrl(b.coverart_thumbnail||b.coverart_jpg),href:'/audiobooks?book='+b.id,
  ...(detail?{chapters:sections.slice(0,500).filter(s=>catalogUrl(s.listen_url)).map((s,i)=>({id:String(s.id||i+1),number:Number(s.section_number)||i+1,title:plain(s.title||'Chapter '+(i+1)),url:catalogUrl(s.listen_url),duration:Math.max(0,Number(s.playtime)||0)})).sort((a,b)=>a.number-b.number)}:{})};
}
function screenRow(v,fallback='movie'){
 const type=v?.media_type||fallback;if(!['movie','tv','person'].includes(type)||v?.adult||!Number.isSafeInteger(Number(v?.id))||Number(v.id)<1)return null;
 const title=v.title||v.name;if(!title)return null;
 const poster=v.poster_path||v.profile_path;
 return {id:String(v.id),type,title:String(title).slice(0,200),year:String(v.release_date||v.first_air_date||'').slice(0,4),overview:String(v.overview||'').slice(0,1800),poster:typeof poster==='string'&&/^\/[A-Za-z0-9_.-]+$/.test(poster)?'https://image.tmdb.org/t/p/w342'+poster:'',href:'/'+(type==='person'?'person':type)+'/'+v.id,rating:Number(v.vote_average)||0,genres:Array.isArray(v.genre_ids)?v.genre_ids:[]};
}
function createDiscovery({tmdb,fetch:fetcher=global.fetch,now=Date.now}={}){
 const router=express.Router(),cache=new Map(),pending=new Map();
 router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{message:'Give the catalog a moment, then try again.'}}));
 async function cached(key,fn,ttl=300000){const hit=cache.get(key);if(hit&&now()-hit.at<ttl)return hit.value;if(pending.has(key))return pending.get(key);const job=Promise.resolve().then(fn).then(value=>{cache.delete(key);cache.set(key,{value,at:now()});if(cache.size>180)cache.delete(cache.keys().next().value);return value;}).finally(()=>pending.delete(key));pending.set(key,job);return job;}
 async function json(url){const response=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'SwiflyTV/2.0 (LibriVox audiobook catalog)'}});if(!response.ok)throw fail(503,'The audiobook catalog is busy. Please try again shortly.');if(Number(response.headers?.get?.('content-length'))>6000000)throw fail(502,'The catalog response was too large. Please try another title.');return response.json();}
 async function books(q='',page=1,id=''){
  const params=new URLSearchParams({format:'json',extended:'1',coverart:'1',limit:id?'1':'24',...(id?{id}:{sort_order:'desc',offset:String((page-1)*24),...(q?{title:q}:{})})});
  return cached('books:'+params,async()=>{const data=await json('https://librivox.org/api/feed/audiobooks/?'+params);if(!Array.isArray(data.books))throw fail(502,'The audiobook catalog returned an unreadable response. Please try again.');return data.books.map(b=>bookRow(b,!!id)).filter(Boolean);},id?3600000:600000);
 }
 const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/search',handle(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,120),type=String(req.query.type||'screen');if(q.length<2)return res.json({results:[]});
  if(type==='book')return res.json({results:await books(q)});
  const endpoint=['movie','tv','person'].includes(type)?type:'multi';
  const rows=await cached('search:'+endpoint+':'+q,async()=>{const data=await tmdb('/search/'+endpoint,{query:q,include_adult:'false'});if(data.__error||!Array.isArray(data.results))throw fail(503,'Search is unavailable for a moment. Please try again.');return data.results.map(v=>screenRow(v,endpoint)).filter(v=>v&&(type==='screen'?v.type!=='person':endpoint==='multi'||v.type===type));});res.json({results:rows.slice(0,20)});
 }));
 router.get('/books',handle(async(req,res)=>{const page=Math.max(1,Math.min(200,parseInt(req.query.page,10)||1));res.json({books:await books(String(req.query.q||'').trim().slice(0,120),page),page});}));
 router.get('/books/:id',handle(async(req,res)=>{if(!/^\d{1,10}$/.test(req.params.id))throw fail(400,'Choose a valid audiobook.');const book=(await books('',1,req.params.id)).find(b=>b.id===req.params.id);if(!book)throw fail(404,'This audiobook is no longer in the catalog.');res.json({book});}));
 router.get('/candidates',handle(async(req,res)=>{
  const parse=value=>String(value||'').split(',').filter(v=>/^(movie|tv):[1-9]\d{0,9}$/.test(v));
  const seeds=parse(req.query.seeds).slice(0,3),exclude=new Set(parse(req.query.exclude).slice(0,200)),type=['movie','tv'].includes(req.query.type)?req.query.type:'mix';
  const paths=[...(type==='tv'?[]:['/movie/popular','/trending/movie/week']),...(type==='movie'?[]:['/tv/popular','/trending/tv/week']),...seeds.map(k=>'/'+k.replace(':','/')+'/recommendations')];
  const responses=await Promise.all(paths.map(p=>cached('candidates:'+p,()=>tmdb(p,{include_adult:'false'})).then(data=>({data,path:p})).catch(()=>null)));
  const unique=new Map();for(const response of responses){if(!response||response.data.__error)continue;for(const v of Array.isArray(response.data.results)?response.data.results:[]){const row=screenRow(v,response.path.includes('/tv/')?'tv':'movie'),key=row&&row.type+':'+row.id;if(row&&row.overview&&!exclude.has(key)&&(type==='mix'||row.type===type))unique.set(key,row);}}
  const candidates=[...unique.values()].slice(0,80);if(!candidates.length)throw fail(503,'There are no titles to recommend right now. Please try again shortly.');res.json({candidates});
 }));
 router.use((e,req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||503).json({message:e.status?e.message:'The catalog is temporarily unavailable. Please try again.'});});
 return {router,books};
}
module.exports={createDiscovery,bookRow,screenRow,catalogUrl};
