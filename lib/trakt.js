'use strict';
const express=require('express');
const crypto=require('node:crypto');
const rateLimit=require('express-rate-limit');

const API='https://api.trakt.tv',AUTH='https://auth.trakt.tv';
const PAGE_SIZE=100,MAX_PAGES=20,MAX_ITEMS=5000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const fail=(status,message,code,extra={})=>Object.assign(new Error(message),{status,code,...extra});
const validId=value=>/^\d{1,10}$/.test(String(value||''))&&Number(value)>0;
const titleKey=item=>item.type+':'+item.id;
const itemKey=item=>titleKey(item)+(item.type==='tv'&&Number.isInteger(item.season)&&Number.isInteger(item.episode)?':'+item.season+':'+item.episode:'');
const list=value=>Array.isArray(value)?value:[];
const iso=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():'';
function profileKey(value){const id=String(value||'main');if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(id))throw fail(400,'Choose a valid profile.','invalid_profile');return 'swiflytv.library.'+id;}
function mergeItems(current,incoming,watched=false){
 const result=new Map();
 for(const item of [...list(current),...incoming]){
  if(!item||!validId(item.id)||!['movie','tv'].includes(item.type))continue;
  const key=watched?itemKey(item):titleKey(item),previous=result.get(key);
  if(previous&&watched&&Date.parse(previous.watchedAt)>Date.parse(item.watchedAt))continue;
  const merged={...previous,...item,key,...(watched?{titleKey:titleKey(item)}:{})};
  for(const field of ['poster','backdrop','rating','year'])if(!item[field]&&previous?.[field])merged[field]=previous[field];
  result.set(key,merged);
 }
 return [...result.values()];
}
function createTrakt({store,authenticate,tmdb,fetch:fetchImpl=globalThis.fetch,env=process.env}={}){
 if(!store||typeof authenticate!=='function')throw Error('Trakt requires the account store and verified account identity.');
 const router=express.Router(),locks=new Map(),lastPost=new Map();
 const timeoutMs=Math.max(100,Math.min(15000,Number(env.TRAKT_REQUEST_TIMEOUT_MS)||8000));
 const clientId=String(env.TRAKT_CLIENT_ID||'').trim(),clientSecret=String(env.TRAKT_CLIENT_SECRET||'').trim();
 let redirectUri='';
 try{const u=new URL(env.TRAKT_REDIRECT_URI);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/api/trakt/callback'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))redirectUri=u.href;}catch{}
 const configured=Boolean(clientId&&clientSecret&&redirectUri);
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 function requireConfig(){if(!configured)throw fail(503,'Trakt has not been configured on this SwiflyTV server.','trakt_setup_required');}
 function sessionUser(s,req){const session=s.sessions[req.traktIdentity.sessionHash],id=req.traktIdentity.user.id,u=s.users[id];if(!u||session?.userId!==id||session.expiresAt<=Date.now())throw fail(401,'Sign in again before connecting Trakt.','signin_required');return u;}
 async function serial(id,work){
  const before=locks.get(id)||Promise.resolve();let release,timer;
  const finished=new Promise(resolve=>{release=resolve;}),tail=before.catch(()=>{}).then(()=>finished);locks.set(id,tail);
  tail.then(()=>{if(locks.get(id)===tail)locks.delete(id);});
  try{await Promise.race([before.catch(()=>{}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail(409,'Another Trakt request is still running. Try again shortly.','trakt_busy')),10000);})]);clearTimeout(timer);return await work();}
  finally{clearTimeout(timer);release();}
 }
 function checkCooldown(connection){if(connection?.retryAt>Date.now())throw fail(429,'Trakt asked us to wait. Try again after the indicated delay.','trakt_rate_limited',{retryAfter:Math.max(1,Math.ceil((connection.retryAt-Date.now())/1000))});}
 async function raw(path,{token,body,method=body?'POST':'GET',auth=false}={}){
  const controller=new AbortController();let timer;
  try{
   return await Promise.race([
    (async()=>{
     const response=await fetchImpl((auth?AUTH:API)+path,{method,redirect:'error',signal:controller.signal,headers:{Accept:'application/json','Content-Type':'application/json','trakt-api-key':clientId,'trakt-api-version':'2',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
     const text=await response.text();let data;try{data=text?JSON.parse(text):{};}catch{throw fail(502,'Trakt returned an unreadable response. Try again later.','trakt_invalid_response');}
     if(response.status===429){const value=response.headers.get('retry-after');let seconds=Number(value);if(!Number.isFinite(seconds))seconds=Math.ceil((Date.parse(value)-Date.now())/1000);throw fail(429,'Trakt asked us to wait before trying again.','trakt_rate_limited',{retryAfter:Math.min(86400,Math.max(1,seconds||30))});}
     if(!response.ok)throw fail(response.status===401||data.error==='invalid_grant'?401:502,response.status===401||data.error==='invalid_grant'?'Reconnect Trakt to continue syncing.':'Trakt could not complete this request. Try again later.',response.status===401||data.error==='invalid_grant'?'trakt_reconnect_required':'trakt_unavailable',{providerStatus:response.status});
     return {data,headers:response.headers};
    })(),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail(504,'Trakt took too long to respond. Try again shortly.','trakt_timeout'));},timeoutMs);})
   ]);
  }catch(e){if(e.status)throw e;throw fail(502,'Trakt could not be reached. Try again later.','trakt_unavailable');}
  finally{clearTimeout(timer);controller.abort();}
 }
 function tokenData(data,previous={}){
  if(typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw fail(502,'Trakt did not return a complete connection. Please reconnect.','trakt_invalid_response');
  const created=Number(data.created_at)||Math.floor(Date.now()/1000);
  return {...previous,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:(created+Number(data.expires_in))*1000,reconnectRequired:false,retryAt:0};
 }
 async function credentials(req,forceToken=''){
  const s=await store.read(),u=sessionUser(s,req);if(!u.trakt?.accessToken)throw fail(409,'Connect your Trakt account first.','trakt_not_linked');if(u.trakt.reconnectRequired)throw fail(401,'Reconnect Trakt to continue syncing.','trakt_reconnect_required');checkCooldown(u.trakt);
  if(u.trakt.expiresAt>Date.now()+60000&&(!forceToken||u.trakt.accessToken!==forceToken))return u.trakt;
  // The store transaction also serializes rotating, single-use refresh tokens across server instances.
  let connection,refreshError;
  await store.transaction(async current=>{
   const user=sessionUser(current,req),previous=user.trakt;if(!previous?.accessToken)throw fail(409,'Connect your Trakt account first.','trakt_not_linked');if(previous.reconnectRequired)throw fail(401,'Reconnect Trakt to continue syncing.','trakt_reconnect_required');checkCooldown(previous);
   if(previous.expiresAt>Date.now()+60000&&(!forceToken||previous.accessToken!==forceToken)){connection=previous;return;}
   try{const reply=await raw('/oauth/token',{auth:true,body:{grant_type:'refresh_token',refresh_token:previous.refreshToken,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri}});user.trakt=tokenData(reply.data,previous);connection=user.trakt;}
   catch(e){refreshError=e;if(e.status===401)previous.reconnectRequired=true;if(e.status===429)previous.retryAt=Date.now()+e.retryAfter*1000;}
  });
  if(refreshError)throw refreshError;return connection;
 }
 async function request(req,path,{body,method}={}){
  let connection=await credentials(req);
  for(let attempt=0;attempt<2;attempt++){
   try{return await raw(path,{token:connection.accessToken,body,method});}
   catch(e){
    if(e.status===401&&!attempt){connection=await credentials(req,connection.accessToken);continue;}
    if(e.status===429||e.status===401)await store.transaction(s=>{const u=sessionUser(s,req);if(u.trakt?.generation!==connection.generation)return;if(e.status===429)u.trakt.retryAt=Date.now()+e.retryAfter*1000;else u.trakt.reconnectRequired=true;});
    throw e;
   }
  }
 }
 router.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.get('origin');if(origin){try{const u=new URL(origin);if(u.host!==req.get('host')||u.protocol!==(req.secure?'https:':'http:'))throw Error();}catch{return res.status(403).json({message:'Open SwiflyTV directly to change your Trakt connection.'});}}
   if(req.get('sec-fetch-site')==='cross-site'||!req.is('application/json'))return res.status(403).json({message:'Use the SwiflyTV app to change your Trakt connection.'});
  }
  next();
 });
 router.use(rateLimit({windowMs:60000,limit:100,standardHeaders:true,legacyHeaders:false,message:{message:'Please wait a moment before trying Trakt again.'}}));
 // Resolve only the server-verified session; browser account IDs are an extra stale-tab check.
 router.use((req,res,next)=>Promise.resolve().then(()=>authenticate(req)).then(identity=>{req.traktIdentity=identity;if(req.get('X-Swifly-Account')&&req.get('X-Swifly-Account')!==identity.user.id)throw fail(409,'Your account changed in another tab. Reload this page.','account_changed');next();}).catch(next));
 router.get('/status',wrap(async(req,res)=>{const u=sessionUser(await store.read(),req),c=u.trakt;res.json({configured,linked:Boolean(c?.accessToken),reconnectRequired:Boolean(c?.reconnectRequired),linkedAt:c?.linkedAt||null,lastSyncAt:c?.lastSyncAt||null,retryAt:c?.retryAt||0});}));
 router.post('/link',wrap(async(req,res)=>{
  requireConfig();const state=random(),verifier=random(),generation=random();
  await store.transaction(s=>{const u=sessionUser(s,req);u.traktOAuth={stateHash:hash(state),verifier,sessionHash:req.traktIdentity.sessionHash,expiresAt:Date.now()+10*60000,generation};u.traktGeneration=generation;});
  const url=new URL(AUTH+'/oauth/authorize');for(const [key,value]of Object.entries({response_type:'code',client_id:clientId,redirect_uri:redirectUri,state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);res.json({url:url.href});
 }));
 router.get('/callback',wrap(async(req,res)=>{
  requireConfig();const state=String(req.query.state||''),code=String(req.query.code||'');let attempt;
  await store.transaction(s=>{const u=sessionUser(s,req),pending=u.traktOAuth;if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!pending||pending.expiresAt<=Date.now()||pending.stateHash!==hash(state)||pending.sessionHash!==req.traktIdentity.sessionHash)throw fail(400,'This Trakt connection request expired or belongs to another session. Start again from Settings.','trakt_invalid_state');attempt=pending;delete u.traktOAuth;});
  if(req.query.error)throw fail(400,'Trakt access was not granted. You can connect again from Settings.','trakt_denied');
  if(!code||code.length>512)throw fail(400,'Trakt did not return an authorization code. Connect again from Settings.','trakt_invalid_code');
  await serial(req.traktIdentity.user.id,async()=>{
   const reply=await raw('/oauth/token',{auth:true,body:{code,code_verifier:attempt.verifier,client_id:clientId,redirect_uri:redirectUri,grant_type:'authorization_code'}});
   await store.transaction(s=>{const u=sessionUser(s,req);if(u.traktGeneration!==attempt.generation)throw fail(409,'Your Trakt connection changed. Start again from Settings.','trakt_connection_changed');u.trakt={...tokenData(reply.data),generation:attempt.generation,linkedAt:new Date().toISOString()};});
  });res.redirect(303,'/settings?trakt=linked');
 }));
 async function pages(req,path){
  const values=[];let truncated=false;
  for(let page=1;page<=MAX_PAGES;page++){
   if(Date.now()>req.traktDeadline)throw fail(504,'This Trakt import took too long. Your current library was kept. Try again later.','trakt_timeout');
   const join=path.includes('?')?'&':'?',reply=await request(req,path+join+'page='+page+'&limit='+PAGE_SIZE);
   if(!Array.isArray(reply.data))throw fail(502,'Trakt returned an invalid library page. Try again later.','trakt_invalid_response');
   values.push(...reply.data);const count=Number(reply.headers.get('x-pagination-page-count')),effective=Number(reply.headers.get('x-pagination-limit'))||PAGE_SIZE;
   if(count>0?page>=count:reply.data.length<effective)break;
   if(page===MAX_PAGES)truncated=true;
  }
  return {values,truncated};
 }
 function media(raw,type){if(!validId(raw?.ids?.tmdb))return null;const id=String(raw.ids.tmdb);return {id,type,key:type+':'+id,title:String(raw.title||'Untitled').slice(0,180),poster:'',backdrop:'',year:String(raw.year||'').slice(0,4),rating:''};}
 router.post('/sync',wrap(async(req,res)=>{
  requireConfig();const key=profileKey(req.body?.profileId);req.traktDeadline=Date.now()+45000;
  await serial(req.traktIdentity.user.id,async()=>{
   const initial=await credentials(req),generation=initial.generation,baseline=sessionUser(await store.read(),req).state?.[key]||{};
   const watchlist=await pages(req,'/sync/watchlist'),movies=await pages(req,'/sync/watched/movies'),shows=await pages(req,'/sync/watched/shows?extended=progress');
   const imported=[],watched=[];let skipped=0,episodeCount=0;
   for(const row of watchlist.values){const item=media(row.movie||row.show,row.movie?'movie':'tv');if(item)imported.push({...item,savedAt:iso(row.listed_at)||new Date().toISOString()});else skipped++;}
   for(const row of movies.values){const item=media(row.movie,'movie');if(item)watched.push({...item,titleKey:item.key,watchedAt:iso(row.last_watched_at)||new Date().toISOString(),source:'trakt'});else skipped++;}
   for(const row of shows.values){const item=media(row.show,'tv');if(!item){skipped++;continue;}if(!Array.isArray(row.seasons)){skipped++;continue;}
    for(const season of row.seasons)for(const episode of list(season.episodes)){
     if(!Number.isInteger(season.number)||season.number<0||!Number.isInteger(episode.number)||episode.number<1){skipped++;continue;}
     if(episodeCount++>=MAX_ITEMS){skipped++;continue;}
     watched.push({...item,titleKey:item.key,season:season.number,episode:episode.number,key:item.key+':'+season.number+':'+episode.number,watchedAt:iso(episode.last_watched_at)||iso(row.last_watched_at)||new Date().toISOString(),source:'trakt'});
    }
   }
   let revision,watchlistCount=0,watchedCount=0,capacityLimited=false;
   await store.transaction(s=>{
    const u=sessionUser(s,req);if(u.trakt?.generation!==generation)throw fail(409,'Your Trakt connection changed during the import. Try again.','trakt_connection_changed');
    const current=u.state?.[key]||{},currentWatchlist=new Set(list(current.watchlist).map(titleKey)),currentWatched=new Set(list(current.watched).map(itemKey));
    const removedWatchlist=new Set(list(baseline.watchlist).map(titleKey).filter(id=>!currentWatchlist.has(id))),removedWatched=new Set(list(baseline.watched).map(itemKey).filter(id=>!currentWatched.has(id)));
    const incomingWatchlist=imported.filter(item=>!removedWatchlist.has(titleKey(item))),incomingWatched=watched.filter(item=>!removedWatched.has(itemKey(item)));
    if(currentWatchlist.size>300||currentWatched.size>1000)throw fail(413,'This profile is larger than the supported library. Your current library was kept.','trakt_library_limit');
    const combinedWatchlist=mergeItems(current.watchlist,incomingWatchlist),combinedWatched=mergeItems(current.watched,incomingWatched,true);
    capacityLimited=combinedWatchlist.length>300||combinedWatched.length>1000;
    const next={...current,version:1,watchlist:combinedWatchlist.slice(0,300),watched:combinedWatched.slice(0,1000).sort((a,b)=>Date.parse(b.watchedAt)-Date.parse(a.watchedAt))};
    const keptWatchlist=new Set(next.watchlist.map(titleKey)),keptWatched=new Set(next.watched.map(itemKey));watchlistCount=incomingWatchlist.filter(item=>keptWatchlist.has(titleKey(item))).length;watchedCount=incomingWatched.filter(item=>keptWatched.has(itemKey(item))).length;
    const nextState={...u.state,[key]:next};if(Buffer.byteLength(JSON.stringify(nextState))>800000)throw fail(413,'Your library is too large to import safely. Your current library was kept.','trakt_library_limit');
    u.state=nextState;u.revision=(u.revision||0)+1;revision=u.revision;u.trakt.lastSyncAt=new Date().toISOString();
   });
   const truncated=watchlist.truncated||movies.truncated||shows.truncated||episodeCount>MAX_ITEMS||capacityLimited;
   res.json({ok:true,revision,profileId:String(req.body?.profileId||'main'),imported:{watchlist:watchlistCount,watched:watchedCount},skipped,truncated,limits:{watchlist:300,watched:1000},message:truncated?'Imported the supported pages and profile capacity. Some Trakt items remain outside this import.':'Trakt watchlist and watched titles were merged into this profile.'});
  });
 }));
 function change(value){
  const item=value?.item;if(!['watchlist','watched'].includes(value?.action)||!validId(item?.id)||!['movie','tv'].includes(item?.type)||value.removed!==undefined&&typeof value.removed!=='boolean')throw fail(400,'Choose a valid watchlist or watched change.','invalid_trakt_change');
  if(value.eventId!==undefined&&!/^[A-Za-z0-9_.:-]{1,100}$/.test(String(value.eventId)))throw fail(400,'Choose a valid library event.','invalid_trakt_change');
  const result={action:value.action,removed:value.removed===true,item:{id:String(item.id),type:item.type},eventId:value.eventId?String(value.eventId):random()};
  if(item.type==='tv'&&(item.season!==undefined||item.episode!==undefined)){if(!Number.isInteger(Number(item.season))||Number(item.season)<0||Number(item.season)>1000||!Number.isInteger(Number(item.episode))||Number(item.episode)<1||Number(item.episode)>10000)throw fail(400,'Choose a valid episode.','invalid_trakt_change');Object.assign(result.item,{season:Number(item.season),episode:Number(item.episode)});}
  if(result.action==='watched'&&item.type==='tv'&&result.item.episode===undefined)throw fail(400,'Only individual watched episodes can be sent to Trakt.','trakt_episode_required');
  if(item.watchedAt)result.item.watchedAt=iso(item.watchedAt);return result;
 }
 function payload(changes){
  const movies=[],shows=new Map();
  for(const {item,action,removed}of changes){const watched=action==='watched'&&!removed?{watched_at:item.watchedAt||new Date().toISOString()}:{};
   if(item.type==='movie')movies.push({ids:{tmdb:Number(item.id)},...watched});
   else if(item.episode!==undefined){const show=shows.get(item.id)||{ids:{tmdb:Number(item.id)},seasons:[]};let season=show.seasons.find(s=>s.number===item.season);if(!season){season={number:item.season,episodes:[]};show.seasons.push(season);}season.episodes.push({number:item.episode,...watched});shows.set(item.id,show);}
   else shows.set(item.id,{ids:{tmdb:Number(item.id)}});
  }
  return {...(movies.length?{movies}:{}),...(shows.size?{shows:[...shows.values()]}:{})};
 }
 router.post('/changes',wrap(async(req,res)=>{
  requireConfig();profileKey(req.body?.profileId);const values=req.body?.changes;if(!Array.isArray(values)||!values.length||values.length>50)throw fail(400,'Send up to 50 library changes at a time.','invalid_trakt_change');const changes=values.map(change);
  await serial(req.traktIdentity.user.id,async()=>{
   const connection=await credentials(req);let sent=0,notFound=0;const delivered=new Set(list(connection.deliveredChanges));
   for(const action of ['watchlist','watched'])for(const removed of [false,true]){
    const group=changes.filter(c=>c.action===action&&c.removed===removed&&!delivered.has(c.eventId));if(!group.length)continue;
    const delay=Math.max(0,(lastPost.get(req.traktIdentity.user.id)||0)+1050-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const path='/sync/'+(action==='watched'?'history':'watchlist')+(removed?'/remove':'');lastPost.set(req.traktIdentity.user.id,Date.now());
    const reply=await request(req,path,{body:payload(group)});sent+=group.length;notFound+=Object.values(reply.data.not_found||{}).reduce((n,v)=>n+list(v).length,0);
    for(const c of group)delivered.add(c.eventId);
    await store.transaction(s=>{const u=sessionUser(s,req);if(u.trakt?.generation===connection.generation)u.trakt.deliveredChanges=[...new Set([...list(u.trakt.deliveredChanges),...group.map(c=>c.eventId)])].slice(-500);});
   }
   res.json({ok:true,sent,notFound,message:notFound?'Some titles could not be matched on Trakt.':'Library changes sent to Trakt.'});
  });
 }));
 router.post('/unlink',wrap(async(req,res)=>{
  await serial(req.traktIdentity.user.id,async()=>{
   const s=await store.read(),u=sessionUser(s,req),connection=u.trakt;let revoked=!connection?.accessToken,warning='';
   if(connection?.accessToken&&configured){try{await raw('/oauth/revoke',{auth:true,body:{token:connection.accessToken,client_id:clientId,client_secret:clientSecret}});revoked=true;}catch(e){warning='Disconnected here. Trakt could not confirm revocation; remove SwiflyTV from your Trakt connected apps to revoke it there.';}}
   else if(connection?.accessToken)warning='Disconnected here. Remove SwiflyTV from your Trakt connected apps to revoke its access there.';
   await store.transaction(current=>{const user=sessionUser(current,req);delete user.trakt;delete user.traktOAuth;user.traktGeneration=random();});lastPost.delete(req.traktIdentity.user.id);res.json({ok:true,revoked,...(warning?{warning}:{})});
  });
 }));
 router.use((e,req,res,next)=>{if(res.headersSent)return next(e);if(e.retryAfter)res.set('Retry-After',String(e.retryAfter));res.status(e.status||503).json({message:e.status?e.message:'Trakt is temporarily unavailable. Try again shortly.',...(e.code?{code:e.code}:{}),...(e.retryAfter?{retryAfter:e.retryAfter}:{})});});
 return {router,async close(){await Promise.allSettled([...locks.values()]);locks.clear();lastPost.clear();}};
}
module.exports={createTrakt};
