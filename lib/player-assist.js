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
function createPlayerAssist({tmdb,fetch:fetcher=global.fetch,recognize=recognizeProcess,now=Date.now}={}){
 const router=express.Router(),cache=new Map(),pending=new Map(),jobs=new Set();let active=0;
 router.use('/segments',rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false,message:{message:'Try another episode in a moment.'}}));
 const empty=()=>({intro:null,recap:null,outro:null,postCredits:null});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/segments/:type/:id',wrap(async(req,res)=>{
  const {type,id}=req.params,s=String(req.query.s||''),e=String(req.query.e||'');if(!['tv','movie'].includes(type)||!/^\d{1,10}$/.test(id)||Number(id)<1||type==='tv'&&(!/^[1-9]\d{0,3}$/.test(s)||!/^[1-9]\d{0,3}$/.test(e)))throw fail(400,'Choose a valid movie or episode.');
  const key=[type,id,s,e].join(':'),hit=cache.get(key);if(hit&&now()-hit.at<3600000)return res.json(hit.data);
  if(!pending.has(key)){const task=(async()=>{let segments=empty();try{const external=await tmdb(`/${type}/${id}/external_ids`);if(/^tt\d{5,12}$/.test(external.imdb_id||'')){const params=new URLSearchParams({imdb_id:external.imdb_id,...(type==='tv'?{season:s,episode:e}:{is_movie:'true'})});const response=await fetcher('https://api.introdb.app/segments?'+params,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});if(response.ok){const data=await response.json();segments={intro:marker(data.intro),recap:marker(data.recap),outro:marker(data.outro),postCredits:marker(data.post_credits)};}}}catch{}
    const data={segments,source:'introdb'};cache.set(key,{data,at:now()});if(cache.size>300)cache.delete(cache.keys().next().value);return data;})().finally(()=>pending.delete(key));pending.set(key,task);}
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
