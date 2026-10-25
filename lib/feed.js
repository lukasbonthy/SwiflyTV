'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const catalogError=()=>fail(503,'The catalog is temporarily unavailable. Please try again.');
const id=value=>/^[1-9]\d{0,9}$/.test(String(value??''))?String(value):'';
const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const art=value=>typeof value==='string'&&/^\/[A-Za-z0-9_.-]+$/.test(value)?'https://image.tmdb.org/t/p/w342'+value:'';
function date(value){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))return '';const timestamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value?value:'';}
function media(raw,type){
 if(!raw||raw.adult||!id(raw.id)||raw.media_type&&raw.media_type!==type)return null;
 const title=text(type==='movie'?raw.title:raw.name);if(!title)return null;
 const genres=Array.isArray(raw.genres)?raw.genres.filter(g=>Number.isSafeInteger(g?.id)&&g.id>0&&text(g.name)).map(g=>({id:g.id,name:text(g.name,80)})).slice(0,20):[];
 const genreIds=[...new Set((Array.isArray(raw.genre_ids)?raw.genre_ids:genres.map(g=>g.id)).filter(g=>Number.isSafeInteger(g)&&g>0))].slice(0,20);
 const released=date(type==='movie'?raw.release_date:raw.first_air_date),votes=Number.isSafeInteger(raw.vote_count)&&raw.vote_count>=0?raw.vote_count:0;
 return {id:String(raw.id),type,title,poster:art(raw.poster_path),backdrop:art(raw.backdrop_path),year:released.slice(0,4),released,overview:text(raw.overview,1200),rating:votes>0&&Number.isFinite(raw.vote_average)&&raw.vote_average>0&&raw.vote_average<=10?raw.vote_average:null,votes,genres,genreIds,href:'/'+type+'/'+raw.id};
}
function episode(raw,show){
 if(!raw||!Number.isSafeInteger(raw.season_number)||raw.season_number<0||raw.season_number>999||!Number.isSafeInteger(raw.episode_number)||raw.episode_number<1||raw.episode_number>9999||!date(raw.air_date))return null;
 const season=raw.season_number,number=raw.episode_number;
 return {id:'tv:'+show.id+':'+season+':'+number,showId:show.id,showTitle:show.title,type:'tv',season,episode:number,name:text(raw.name),airDate:raw.air_date,poster:show.poster,genreIds:show.genreIds,href:'/watch/tv/'+show.id+'?s='+season+'&e='+number,detailsHref:show.href};
}
function list(value,pattern,max,label){
 if(value==null||value==='')return [];
 if(typeof value!=='string'||value.length>12000)throw fail(400,'Choose valid '+label+'.');
 const values=[...new Set(value.split(',').map(v=>v.trim()))];
 if(values.length>max||values.some(v=>!pattern.test(v)))throw fail(400,'Choose up to '+max+' valid '+label+'.');
 return values;
}
const genres={all:{},drama:{movie:18,tv:18},comedy:{movie:35,tv:35},animation:{movie:16,tv:16},adventure:{movie:12,tv:10759},scifi:{movie:878,tv:10765}};
function createFeed({tmdb,now=Date.now,random=Math.random,metadataTimeoutMs=6000,cacheLimit=128}={}){
 const router=express.Router(),cache=new Map(),pending=new Map();
 const maxCache=Math.max(1,Math.min(256,Number(cacheLimit)||128)),timeout=Math.max(10,Math.min(15000,Number(metadataTimeoutMs)||6000));
 router.use(rateLimit({windowMs:60000,limit:90,standardHeaders:true,legacyHeaders:false,message:{message:'Give your feed a moment, then try again.'}}));
 const today=()=>new Date(now()).toISOString().slice(0,10);
 async function metadata(path,params={}){
  const key=path+JSON.stringify(params),hit=cache.get(key);
  if(hit&&now()-hit.at<300000){cache.delete(key);cache.set(key,hit);return hit.value;}
  if(pending.has(key))return pending.get(key);
  if(pending.size>=32||typeof tmdb!=='function')throw catalogError();
  const controller=new AbortController();let timer;
  const job=Promise.race([
   Promise.resolve().then(()=>tmdb(path,params,300000,controller.signal)),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(catalogError());},timeout);})
  ]).then(value=>{
   if(!value||typeof value!=='object'||Array.isArray(value)||value.__error)throw catalogError();
   cache.delete(key);cache.set(key,{at:now(),value});while(cache.size>maxCache)cache.delete(cache.keys().next().value);return value;
  }).finally(()=>{clearTimeout(timer);pending.delete(key);});
  pending.set(key,job);return job;
 }
 const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/episodes',handle(async(req,res)=>{
  const ids=list(req.query.shows,/^[1-9]\d{0,9}$/,8,'series IDs');
  const settled=await Promise.allSettled(ids.map(async identifier=>{
   const raw=await metadata('/tv/'+identifier),show=media(raw,'tv');if(!show||show.id!==identifier)throw catalogError();
   return {...show,nextEpisode:episode(raw.next_episode_to_air,show),lastEpisode:episode(raw.last_episode_to_air,show)};
  }));
  const shows=settled.filter(v=>v.status==='fulfilled').map(v=>v.value),partial=settled.some(v=>v.status==='rejected');
  if(ids.length&&!shows.length&&partial)throw catalogError();
  const day=today(),cutoff=new Date(now()-30*86400000).toISOString().slice(0,10);
  const upcoming=shows.map(s=>s.nextEpisode).filter(e=>e&&e.airDate>=day).sort((a,b)=>a.airDate.localeCompare(b.airDate)||a.id.localeCompare(b.id));
  const episodes=shows.map(s=>s.lastEpisode).filter(e=>e&&e.airDate<=day&&e.airDate>=cutoff).sort((a,b)=>b.airDate.localeCompare(a.airDate)||a.id.localeCompare(b.id));
  res.json({shows,upcoming,episodes,partial,generatedAt:new Date(now()).toISOString(),...(!shows.length?{message:'Save or watch a series to see its upcoming episodes.'}:{})});
 }));
 router.get('/recommendations',handle(async(req,res)=>{
  const seeds=list(req.query.seeds,/^(movie|tv):[1-9]\d{0,9}$/,4,'recommendation seeds'),excluded=new Set([...seeds,...list(req.query.exclude,/^(movie|tv):[1-9]\d{0,9}$/,300,'excluded titles')]);
  if(!seeds.length)return res.json({results:[],seeds:[],message:'Watch or save a title to get recommendations from your library.'});
  const settled=await Promise.allSettled(seeds.map(async key=>{
   const [type,identifier]=key.split(':'),[raw,related]=await Promise.all([metadata('/'+type+'/'+identifier),metadata('/'+type+'/'+identifier+'/recommendations',{page:'1',include_adult:'false'})]);
   const seed=media(raw,type);if(!seed||seed.id!==identifier||!Array.isArray(related.results))throw catalogError();
   return {seed,results:related.results.slice(0,20).map(v=>media(v,type)).filter(v=>v&&!excluded.has(v.type+':'+v.id)).map(v=>({...v,because:{key,id:seed.id,type,title:seed.title,href:seed.href}}))};
  }));
  const sources=settled.filter(v=>v.status==='fulfilled').map(v=>v.value),pools=sources.map(v=>v.results),partial=settled.some(v=>v.status==='rejected');if(!pools.length)throw catalogError();
  const unique=new Map();for(let index=0;index<20;index++)for(const pool of pools){const row=pool[index];if(row&&!unique.has(row.type+':'+row.id))unique.set(row.type+':'+row.id,row);}
  const results=[...unique.values()].slice(0,18);res.json({results,seeds:sources.map(v=>v.seed),partial,...(!results.length?{message:'No related titles are available for these library picks yet.'}:{})});
 }));
 router.get('/surprise',handle(async(req,res)=>{
  const type=req.query.type??'both',genre=req.query.genre??'all',rating=req.query.minRating==null||req.query.minRating===''?0:Number(req.query.minRating),year=Number(today().slice(0,4));
  const from=req.query.yearFrom==null||req.query.yearFrom===''?1900:Number(req.query.yearFrom),to=req.query.yearTo==null||req.query.yearTo===''?year:Number(req.query.yearTo);
  if(!['movie','tv','both'].includes(type)||typeof genre!=='string'||!Object.hasOwn(genres,genre)||!Number.isFinite(rating)||rating<0||rating>10||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<1900||to>year||from>to||['minRating','yearFrom','yearTo'].some(key=>req.query[key]!=null&&typeof req.query[key]!=='string'))throw fail(400,'Choose valid type, rating, genre and year filters.');
  const excluded=new Set(list(req.query.exclude,/^(movie|tv):[1-9]\d{0,9}$/,300,'excluded titles'));
  const settled=await Promise.allSettled((type==='both'?['movie','tv']:[type]).map(async kind=>{
   const field=kind==='movie'?'primary_release_date':'first_air_date',upper=to===year?today():to+'-12-31';
   const data=await metadata('/discover/'+kind,{sort_by:'vote_average.desc','vote_count.gte':'50','vote_average.gte':String(rating),include_adult:'false',page:'1',[field+'.gte']:from+'-01-01',[field+'.lte']:upper,...(genres[genre][kind]?{with_genres:String(genres[genre][kind])}:{})});
   if(!Array.isArray(data.results))throw catalogError();
   return data.results.slice(0,20).map(v=>media(v,kind)).filter(v=>v&&v.rating!==null&&v.rating>=rating&&v.votes>=50&&v.released&&v.released>=from+'-01-01'&&v.released<=upper&&(!genres[genre][kind]||v.genreIds.includes(genres[genre][kind]))&&!excluded.has(v.type+':'+v.id));
  }));
  const pools=settled.filter(v=>v.status==='fulfilled').map(v=>v.value);if(!pools.length)throw catalogError();
  const unique=new Map(pools.flat().map(v=>[v.type+':'+v.id,v])),pool=[...unique.values()],draw=Number(random()),index=Math.floor(Math.max(0,Math.min(.999999999,Number.isFinite(draw)?draw:0))*pool.length);
  res.json({result:pool[index]||null,partial:settled.some(v=>v.status==='rejected'),...(!pool.length?{message:'No catalog titles match these filters. Try a wider year range or lower rating.'}:{})});
 }));
 router.use((error,_req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status||503).json({message:error.status?error.message:catalogError().message});});
 return {router};
}
module.exports={createFeed};
