'use strict';
const express=require('express');const rateLimit=require('express-rate-limit');const {spawn}=require('node:child_process');const path=require('node:path');
const fail=(status,message)=>Object.assign(Error(message),{status});
function validateSample(b){
 if(!Buffer.isBuffer(b)||b.length<44||b.length>416044||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,16)!=='WAVEfmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||b.readUInt32LE(4)!==b.length-8)throw fail(400,'Send a short sample from the movie’s audio.');
 const duration=(b.length-44)/32000;if(duration<9||duration>13)throw fail(400,'Listen to 12 seconds of the movie, then try again.');return {duration};
}
function recognizeProcess(sample,{signal}={}){return new Promise((resolve,reject)=>{
 const executable=process.env.SWIFLY_SONG_PYTHON||'python3';
 const child=spawn(executable,[path.join(__dirname,'..','scripts','identify-song.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONUNBUFFERED:'1'}});let output='',finished=false;
 const finish=(err,value)=>{if(finished)return;finished=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);err?reject(err):resolve(value);};
 const abort=()=>{child.kill('SIGKILL');finish(fail(503,'Song identification was cancelled.'));};
 const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(fail(503,'Song identification took too long. Please try again.'));},35000);timeout.unref?.();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
 child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>32000){child.kill('SIGKILL');finish(fail(503,'The song service returned an unreadable result.'));}});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
 child.on('error',()=>finish(fail(503,'Song identification is not available on this server yet.')));
 child.on('close',code=>{if(finished)return;try{if(code!==0)throw Error();const data=JSON.parse(output);if(data.error)throw Error();finish(null,data.track||null);}catch{finish(fail(503,'Song identification is unavailable for a moment. Please try again.'));}});child.stdin.end(sample);
 });}
function marker(value){const start=Number(value?.start_sec??Number(value?.start_ms)/1000),end=Number(value?.end_sec??Number(value?.end_ms)/1000),confidence=value?.confidence;if(!value||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>43200||end-start>1800||confidence!=null&&(!Number.isFinite(Number(confidence))||Number(confidence)<.6))return null;return {start,end};}
const segmentKinds=['intro','recap','credits','preview','outro','postCredits'];
const emptyWindows=()=>Object.fromEntries(segmentKinds.map(kind=>[kind,[]]));
function v4Marker(value){
 if(!value||!Object.hasOwn(value,'start_ms')||!Object.hasOwn(value,'end_ms'))return null;
 const start=value.start_ms===null?0:value.start_ms,end=value.end_ms;
 if(!Number.isSafeInteger(start)||start<0||start>43200000||end!==null&&(!Number.isSafeInteger(end)||end<=start||end>43200000))return null;
 return {start:start/1000,end:end===null?null:end/1000};
}
function createPlayerAssist({tmdb,fetch:fetcher=global.fetch,recognize=recognizeProcess,now=Date.now,segmentTimeoutMs=5000}={}){
 const router=express.Router(),cache=new Map(),pending=new Map(),jobs=new Set();let active=0;
 async function segmentLookup(work){
  const controller=new AbortController();jobs.add(controller);let timer,onAbort;
  const deadline=new Promise((_,reject)=>{onAbort=()=>reject(Error('Segment lookup timed out'));controller.signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(5000,Number(segmentTimeoutMs)||5000)));});
  try{return await Promise.race([Promise.resolve().then(()=>work(controller.signal)),deadline]);}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);jobs.delete(controller);}
 }
 router.use('/segments',rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false,message:{message:'Try another episode in a moment.'}}));
 const empty=()=>({intro:null,recap:null,outro:null,postCredits:null});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/segments/:type/:id',wrap(async(req,res)=>{
  const {type,id}=req.params,s=String(req.query.s||''),e=String(req.query.e||'');if(!['tv','movie'].includes(type)||!/^\d{1,10}$/.test(id)||Number(id)<1||type==='tv'&&(!/^[1-9]\d{0,3}$/.test(s)||!/^[1-9]\d{0,3}$/.test(e)))throw fail(400,'Choose a valid movie or episode.');
  const key=[type,id,s,e].join(':'),hit=cache.get(key);if(hit&&now()-hit.at<3600000)return res.json(hit.data);
  if(!pending.has(key)){const task=(async()=>{
    let windows=emptyWindows(),source=null;
    try{
     const params=new URLSearchParams({tmdb_id:id,type,...(type==='tv'?{season:s,episode:e,mapping:'official'}:{})});
     const body=await segmentLookup(async signal=>{const response=await fetcher('https://api.theintrodb.org/v4/media?'+params,{signal,headers:{Accept:'application/json'}});return response.ok?response.json():null;});
     if(body&&(!body.type||body.type===type)&&(body.tmdb_id==null||String(body.tmdb_id)===id)&&(type!=='tv'||(body.season==null||Number(body.season)===Number(s))&&(body.episode==null||Number(body.episode)===Number(e))))for(const kind of ['intro','recap','credits','preview'])windows[kind]=(Array.isArray(body[kind])?body[kind].slice(0,64):[]).map(v4Marker).filter(Boolean);
     if(Object.values(windows).some(rows=>rows.length))source='theintrodb';
    }catch{}
    // Older coverage is still useful when the current community has no entry.
    // Keep the two databases labeled separately and never guess a timestamp.
    if(!source)try{
     const body=await segmentLookup(async signal=>{
      const external=await tmdb(`/${type}/${id}/external_ids`,{},undefined,signal);signal.throwIfAborted();
      if(!/^tt\d{5,12}$/.test(external?.imdb_id||''))return null;
      const params=new URLSearchParams({imdb_id:external.imdb_id,...(type==='tv'?{season:s,episode:e}:{is_movie:'true'})});
      const response=await fetcher('https://api.introdb.app/segments?'+params,{signal,headers:{Accept:'application/json'}});return response.ok?response.json():null;
     });
     if(body){for(const kind of ['intro','recap','outro','postCredits']){const value=marker(body[kind==='postCredits'?'post_credits':kind]);if(value)windows[kind]=[value];}if(Object.values(windows).some(rows=>rows.length))source='introdb';}
    }catch{}
    const segments={...empty(),...Object.fromEntries(segmentKinds.map(kind=>[kind,windows[kind][0]||null]))};
    const data={segments,windows,source,contributionUrl:'https://theintrodb.org'};cache.set(key,{data,at:now()});if(cache.size>300)cache.delete(cache.keys().next().value);return data;
   })().finally(()=>pending.delete(key));pending.set(key,task);}
  res.json(await pending.get(key));
 }));
 router.post('/song',rateLimit({windowMs:60000,limit:4,standardHeaders:true,legacyHeaders:false,message:{message:'Try another song in a moment.'}}),(req,res,next)=>{
  const origin=req.get('origin');if(origin){try{const u=new URL(origin);if(u.host!==req.get('host')||u.protocol!==(req.secure?'https:':'http:'))throw Error();}catch{return next(fail(403,'Identify songs from SwiflyTV directly.'));}}
  if(req.get('sec-fetch-site')==='cross-site'||!req.is('audio/wav'))return next(fail(400,'Send audio from the movie player.'));next();
 },express.raw({type:'audio/wav',limit:420000}),wrap(async(req,res)=>{
  validateSample(req.body);if(active>=1)throw fail(429,'Someone is identifying a song. Try again in a few seconds.');active++;const controller=new AbortController();jobs.add(controller);const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
  try{const track=await recognize(req.body,{signal:controller.signal});let normalized=null;if(track?.title&&track?.artist){let url='';try{const u=new URL(track.url);if(u.protocol==='https:'&&!u.username&&!u.password&&['www.shazam.com','www.shazam.com','shazam.com','music.apple.com','open.spotify.com'].includes(u.hostname))url=u.href;}catch{}normalized={title:String(track.title).slice(0,200),artist:String(track.artist).slice(0,200),url};}res.set('Cache-Control','no-store').json({track:normalized});}
  catch(e){if(!res.destroyed)throw fail(503,e.status?e.message:'Song identification is unavailable right now. Please try again.');}
  finally{active--;jobs.delete(controller);res.removeListener('close',disconnect);}
 }));
 router.use((e,req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||e.statusCode||503).json({message:e.status?e.message:'The player service is unavailable. Please try again.'});});
 return {router,close(){for(const controller of jobs)controller.abort();jobs.clear();}};
}
module.exports={createPlayerAssist,validateSample,recognizeProcess};
