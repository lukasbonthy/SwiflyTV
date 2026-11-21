'use strict';
const express=require('express'),rateLimit=require('express-rate-limit');
const {orderedSeasonEpisodes,validAirDate}=require('../ui/episode-season');
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
  const season=Number(req.params.season);
  const data=await get('/tv/'+req.params.id+'/season/'+season),today=new Date(now()).toISOString().slice(0,10);
  const episodes=orderedSeasonEpisodes(data,season).slice(0,1000).map(row=>{
   const airDate=validAirDate(row.air_date);
   return {
    episode:row.episode_number,
    season,
    name:String(row.name||'Episode '+row.episode_number).slice(0,180),
    overview:String(row.overview||'').slice(0,3000),
    airDate,
    aired:airDate!==''&&airDate<=today,
    still:typeof row.still_path==='string'&&/^\/[A-Za-z0-9_.-]+$/.test(row.still_path)?'https://image.tmdb.org/t/p/w300'+row.still_path:'',
    runtime:Number(row.runtime)||0,
   };
  });
  res.json({episodes});
 }));
 router.get('/next/tv/:id',wrap(async(req,res)=>{
  const id=req.params.id,s=String(req.query.s||''),e=String(req.query.e||'');if(!valid(id)||!valid(s)||!valid(e)||Number(s)>9999||Number(e)>9999)return res.status(400).json({message:'Choose a valid completed episode.'});
  const completedSeason=Number(s),completedEpisode=Number(e),details=await get('/tv/'+id);
  const seasonRows=Array.isArray(details.seasons)?details.seasons:[];
  const seasonNumbers=new Set(seasonRows.map(row=>Number(row?.season_number)).filter(number=>Number.isSafeInteger(number)&&number>=completedSeason&&number<=9999));
  const seasons=[...seasonNumbers].sort((a,b)=>a-b).slice(0,3),today=new Date(now()).toISOString().slice(0,10);
  for(const season of seasons){
   const data=await get('/tv/'+id+'/season/'+season);
   const lastEpisode=season===completedSeason?completedEpisode:0;
   const next=orderedSeasonEpisodes(data,season).find(row=>row.episode_number>lastEpisode);
   if(!next)continue;
   const airDate=validAirDate(next.air_date);
   if(!airDate||airDate>today)return res.json({next:null});
   return res.json({next:{season,episode:next.episode_number,title:String(next.name||'').slice(0,180),airDate}});
  }
  res.json({next:null});
 }));
 router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(503).json({message:'Episode metadata is unavailable. Please try again.'});});return router;
}
module.exports={searchOptions,filterSearch,certification,createCatalogRouter};
