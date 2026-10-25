'use strict';
const express=require('express'),rateLimit=require('express-rate-limit');
const number=(value,min,max,fallback)=>Number.isFinite(Number(value))&&value!==''?Math.max(min,Math.min(max,Number(value))):fallback;
function searchOptions(query={}){return{media:['movie','tv'].includes(query.media)?query.media:'all',minRating:number(query.minRating,0,10,0),yearFrom:Number(query.yearFrom)>0?Math.floor(number(query.yearFrom,1870,2200,0)):0,yearTo:Number(query.yearTo)>0?Math.floor(number(query.yearTo,1870,2200,0)):0,sort:['rating','date'].includes(query.sort)?query.sort:'relevance'};}
function filterSearch(rows,options={}){
 const o=searchOptions(options),date=row=>String(row.release_date||row.first_air_date||''),year=row=>Number(date(row).slice(0,4));
 const filtered=(Array.isArray(rows)?rows:[]).filter(row=>row&&!row.adult&&(o.media==='all'||(row.media_type||(row.name?'tv':'movie'))===o.media)&&(!o.minRating||Number(row.vote_average)>=o.minRating)&&(!o.yearFrom||year(row)>=o.yearFrom)&&(!o.yearTo||year(row)>0&&year(row)<=o.yearTo));
 if(o.sort==='rating')filtered.sort((a,b)=>Number(b.vote_average||0)-Number(a.vote_average||0));else if(o.sort==='date')filtered.sort((a,b)=>date(b).localeCompare(date(a)));return filtered;
}
function certification(details,type){
 const rows=type==='tv'?details?.content_ratings?.results:details?.release_dates?.results;
 const us=Array.isArray(rows)?rows.find(row=>row.iso_3166_1==='US'):null;
 const label=type==='tv'?us?.rating:(Array.isArray(us?.release_dates)?[...us.release_dates].sort((a,b)=>Number(a.type!==3)-Number(b.type!==3)).find(row=>row.certification)?.certification:null);
 if(typeof label!=='string'||!label.trim()||label.length>16)return null;
 return{label:label.trim(),severity:['G','PG','TV-Y','TV-Y7','TV-G','TV-PG'].includes(label)?'family':['PG-13','TV-14'].includes(label)?'teen':['R','NC-17','TV-MA'].includes(label)?'mature':'unrated',country:'US'};
}
function createCatalogRouter({tmdb,now=Date.now}={}){
 const router=express.Router(),pending=new Map(),cache=new Map();
 router.use(rateLimit({windowMs:60000,limit:90,standardHeaders:true,legacyHeaders:false}));
 const valid=v=>/^[1-9]\d{0,9}$/.test(String(v));
 async function get(path){
  const hit=cache.get(path);if(hit&&now()-hit.at<300000)return hit.value;if(pending.has(path))return pending.get(path);
  const controller=new AbortController();let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Catalog timed out'));},6500);});
  const job=Promise.race([Promise.resolve().then(()=>tmdb(path,{},undefined,controller.signal)),timeout]).then(value=>{if(!value||value.__error)throw Error('Catalog unavailable');cache.set(path,{at:now(),value});if(cache.size>80)cache.delete(cache.keys().next().value);return value;}).finally(()=>{clearTimeout(timer);pending.delete(path);});pending.set(path,job);return job;
 }
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/episodes/tv/:id/:season',wrap(async(req,res)=>{
  if(!valid(req.params.id)||!valid(req.params.season)||Number(req.params.season)>9999)return res.status(400).json({message:'Choose a valid season.'});
  const data=await get('/tv/'+req.params.id+'/season/'+req.params.season),today=new Date(now()).toISOString().slice(0,10);
  res.json({episodes:(Array.isArray(data.episodes)?data.episodes:[]).slice(0,1000).filter(e=>valid(e.episode_number)).map(e=>({episode:Number(e.episode_number),season:Number(req.params.season),name:String(e.name||'Episode '+e.episode_number).slice(0,180),overview:String(e.overview||'').slice(0,3000),airDate:/^\d{4}-\d{2}-\d{2}$/.test(e.air_date||'')?e.air_date:'',aired:!!e.air_date&&e.air_date<=today,still:/^\/[A-Za-z0-9_.-]+$/.test(e.still_path||'')?'https://image.tmdb.org/t/p/w300'+e.still_path:'',runtime:Number(e.runtime)||0}))});
 }));
 router.get('/next/tv/:id',wrap(async(req,res)=>{
  const id=req.params.id,s=String(req.query.s||''),e=String(req.query.e||'');if(!valid(id)||!valid(s)||!valid(e)||Number(s)>9999||Number(e)>9999)return res.status(400).json({message:'Choose a valid completed episode.'});
  const details=await get('/tv/'+id),seasons=(Array.isArray(details.seasons)?details.seasons:[]).map(v=>Number(v.season_number)).filter(n=>Number.isSafeInteger(n)&&n>=Number(s)&&n>0).sort((a,b)=>a-b).slice(0,3),today=new Date(now()).toISOString().slice(0,10);
  for(const season of seasons){const data=await get('/tv/'+id+'/season/'+season),episodes=(Array.isArray(data.episodes)?data.episodes:[]).filter(v=>Number.isSafeInteger(v.episode_number)&&v.episode_number>0&&(season>Number(s)||v.episode_number>Number(e))).sort((a,b)=>a.episode_number-b.episode_number);
   const next=episodes[0];if(next){if(!/^\d{4}-\d{2}-\d{2}$/.test(next.air_date||'')||next.air_date>today)return res.json({next:null});return res.json({next:{season,episode:next.episode_number,title:String(next.name||'').slice(0,180),airDate:next.air_date}});}}
  res.json({next:null});
 }));
 router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(503).json({message:'Episode metadata is unavailable. Please try again.'});});return router;
}
module.exports={searchOptions,filterSearch,certification,createCatalogRouter};
