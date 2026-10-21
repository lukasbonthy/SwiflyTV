'use strict';
const express=require('express');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const rateLimit=require('express-rate-limit');
const scrypt=promisify(crypto.scrypt);
const COOKIE='swifly_session',TTL=14*86400000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const uid=()=>crypto.randomUUID();
const error=(status,message,code)=>Object.assign(new Error(message),{status,code});
const publicUser=u=>({id:u.id,name:u.name,handle:u.handle,avatar:u.avatar||'orbit'});
const blocked=(s,a,b)=>s.blocks.some(r=>r.from===a&&r.to===b||r.from===b&&r.to===a);
const friends=(s,a,b)=>!blocked(s,a,b)&&s.friends.some(r=>r.a===a&&r.b===b||r.a===b&&r.b===a);
const stateKey=k=>['swiflytv.profiles','movieverse.watchlist','movieverse.liked','movieverse.continue'].includes(k)||/^swiflytv\.(?:resume|continue|library)\.[A-Za-z0-9_.:-]{1,100}$/.test(k);
function cookieToken(req){const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return cookie&&/^[A-Za-z0-9_-]{43}$/.test(cookie.slice(COOKIE.length+1))?cookie.slice(COOKIE.length+1):'';}
async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64,{maxmem:64*1024*1024})).toString('hex');}
async function passwordValid(password,encoded){const [salt,key]=String(encoded||'').split(':');if(!salt||!key)return false;const expected=Buffer.from(key,'hex'),actual=await scrypt(password,salt,64,{maxmem:64*1024*1024});return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function credentials(body,signup){
 const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<(signup?8:1)||Buffer.byteLength(password)>128)throw error(400,signup?'Use a valid email and a password of 8–128 characters.':'Enter your email and password.');
 const name=String(body?.name||'').trim().slice(0,40),requested=String(body?.handle||'').trim().toLowerCase();
 const handle=requested||(name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,16)||'viewer')+crypto.randomBytes(3).toString('hex');
 if(signup&&(!name||!/^[a-z0-9][a-z0-9_]{2,23}$/.test(handle)))throw error(400,'Choose a name and a handle with 3–24 letters, numbers or underscores.');
 return {email,password,name,handle};
}
function createConnect({store,resolveMedia,createParty,now=Date.now}={}){
 const router=express.Router(),streams=new Set(),activity=new Map();
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.get('origin');
   if(origin){try{const u=new URL(origin);if(u.host!==req.get('host')||u.protocol!==(req.secure?'https:':'http:'))throw Error();}catch{return res.status(403).json({message:'Open SwiflyTV directly to make this change.'});}}
   if(req.get('sec-fetch-site')==='cross-site'||!req.is('application/json'))return res.status(403).json({message:'Use the SwiflyTV app to make this change.'});
  }
  next();
 });
 router.use('/auth',rateLimit({windowMs:15*60000,limit:30,standardHeaders:true,legacyHeaders:false,message:{message:'Too many sign-in attempts. Try again in a few minutes.'}}));
 router.use(rateLimit({windowMs:60000,limit:180,standardHeaders:true,legacyHeaders:false,message:{message:'Slow down a little and try again.'}}));
 async function identity(req){
  const token=cookieToken(req),s=await store.read(),session=token?s.sessions[hash(token)]:null;
  if(!session||session.expiresAt<=now()||!s.users[session.userId])throw error(401,'Sign in to use your friends, messages and shared home.','signin_required');
  return {state:s,user:s.users[session.userId],sessionHash:hash(token)};
 }
 const requireUser=async(req,res,next)=>{try{Object.assign(req,await identity(req));if(req.get('X-Swifly-Account')&&req.get('X-Swifly-Account')!==req.user.id)throw error(409,'Your account changed in another tab. Reload this page.','account_changed');next();}catch(e){next(e);}};
 function notify(ids){for(const stream of streams)if(ids.includes(stream.id)&&!stream.res.writableEnded){stream.res.write('event: change\ndata: {}\n\n');stream.res.flush?.();}}
 function notification(s,to,kind,from,text,href){
  s.notifications.push({id:uid(),to,kind,from,text:String(text).slice(0,180),href,createdAt:now(),readAt:0});
  const mine=s.notifications.filter(r=>r.to===to);if(mine.length>200){const remove=new Set(mine.slice(0,mine.length-200).map(r=>r.id));s.notifications=s.notifications.filter(r=>!remove.has(r.id));}
 }
 function active(s,viewer,id){const a=activity.get(id);return friends(s,viewer,id)&&s.users[id]?.settings?.shareWatching&&a&&now()-a.at<90000?{media:a.media,since:a.since}:null;}
 function homeData(s,u){const h=s.homes[u.homeId];return h?{id:h.id,name:h.name,members:h.members.map(id=>publicUser(s.users[id])).filter(Boolean),titles:h.titles}:null;}
 function bootstrap(s,u){
  const peers=s.friends.filter(r=>r.a===u.id||r.b===u.id).map(r=>r.a===u.id?r.b:r.a).filter(id=>!blocked(s,u.id,id)&&s.users[id]);
  return {user:{...publicUser(u),email:u.email,settings:u.settings},
   friends:peers.map(id=>{const messages=s.messages.filter(m=>m.from===u.id&&m.to===id||m.to===u.id&&m.from===id);return {...publicUser(s.users[id]),activity:active(s,u.id,id),unread:messages.filter(m=>m.to===u.id&&!m.readAt).length,lastMessage:messages.at(-1)||null};}),
   requests:{incoming:s.requests.filter(r=>r.to===u.id&&!blocked(s,r.from,u.id)).map(r=>({...publicUser(s.users[r.from]),createdAt:r.createdAt})),outgoing:s.requests.filter(r=>r.from===u.id&&!blocked(s,r.to,u.id)).map(r=>publicUser(s.users[r.to]))},
   notifications:s.notifications.filter(n=>n.to===u.id).slice(-200).reverse().map(({to,...n})=>n),home:homeData(s,u),blocked:s.blocks.filter(r=>r.from===u.id).map(r=>publicUser(s.users[r.to])),stateRevision:u.revision||0};
 }
 async function issue(req,res,user,status=200){const token=crypto.randomBytes(32).toString('base64url');await store.transaction(s=>{for(const [k,v]of Object.entries(s.sessions))if(v.expiresAt<=now())delete s.sessions[k];s.sessions[hash(token)]={userId:user.id,expiresAt:now()+TTL};const mine=Object.entries(s.sessions).filter(([,v])=>v.userId===user.id);for(const[k]of mine.slice(0,Math.max(0,mine.length-12)))delete s.sessions[k];});res.cookie(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:req.secure,maxAge:TTL,path:'/'});res.status(status).json({user:{...publicUser(user),email:user.email}});}
 router.get('/session',wrap(async(req,res)=>{if(!store.available)return res.json({user:null,available:false,code:'storage_setup_required'});try{const {user}=await identity(req);res.json({user:{...publicUser(user),email:user.email},available:true});}catch(e){if(e.status!==401)throw e;res.json({user:null,available:true});}}));
 router.post('/auth/signup',wrap(async(req,res)=>{
  if(!store.available)throw error(503,'Account sync needs persistent storage before sign-up can open.','storage_setup_required');
  const c=credentials(req.body,true),encoded=await passwordHash(c.password);
  const user=await store.transaction(s=>{
   if(Object.values(s.users).some(u=>u.email===c.email||u.handle===c.handle))throw error(409,'That email or handle already has an account.');
   if(Object.keys(s.users).length>=10000)throw error(503,'New accounts are temporarily unavailable.');
   const u={id:uid(),name:c.name,handle:c.handle,email:c.email,password:encoded,createdAt:now(),settings:{shareWatching:false,shareTaste:true},state:{},revision:0};s.users[u.id]=u;return publicUser(u);
  });const s=await store.read();await issue(req,res,s.users[user.id],201);
 }));
 router.post('/auth/login',wrap(async(req,res)=>{const c=credentials(req.body,false),s=await store.read(),u=Object.values(s.users).find(u=>u.email===c.email);if(!u){await scrypt(c.password,'swifly-unknown-user-salt',64,{maxmem:64*1024*1024});throw error(401,'Email or password is incorrect.');}if(!await passwordValid(c.password,u.password))throw error(401,'Email or password is incorrect.');await issue(req,res,u);}));
 router.use(requireUser);
 router.post('/auth/logout',wrap(async(req,res)=>{await store.transaction(s=>{delete s.sessions[req.sessionHash];});for(const stream of streams)if(stream.session===req.sessionHash)stream.res.end();res.clearCookie(COOKIE,{path:'/',httpOnly:true,sameSite:'lax',secure:req.secure});res.json({ok:true});}));
 router.get('/bootstrap',wrap(async(req,res)=>res.json(bootstrap(req.state,req.user))));
 router.get('/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 5000\nevent: ready\ndata: {}\n\n');res.flush?.();
  const stream={id:req.user.id,session:req.sessionHash,res};
  const existing=[...streams].filter(r=>r.session===stream.session);for(const old of existing.slice(0,Math.max(0,existing.length-3)))old.res.end();streams.add(stream);
  req.on('close',()=>streams.delete(stream));
 });
 router.get('/people',wrap(async(req,res)=>{const q=String(req.query.q||'').trim().replace(/^@/,'').toLowerCase().slice(0,24);const s=req.state;const people=q.length<2?[]:Object.values(s.users).filter(u=>u.id!==req.user.id&&!blocked(s,u.id,req.user.id)&&u.handle.includes(q)).slice(0,20).map(u=>({...publicUser(u),relationship:friends(s,u.id,req.user.id)?'friend':s.requests.some(r=>r.from===req.user.id&&r.to===u.id)?'pending':s.requests.some(r=>r.from===u.id&&r.to===req.user.id)?'incoming':'none'}));res.json({people});}));
 router.post('/friends/request',wrap(async(req,res)=>{
  const handle=String(req.body?.handle||'').replace(/^@/,'').trim().toLowerCase();let target;
  await store.transaction(s=>{const u=Object.values(s.users).find(u=>u.handle===handle);if(!u||u.id===req.user.id||blocked(s,u.id,req.user.id))throw error(404,'That viewer could not be found.');target=u.id;
   if(friends(s,target,req.user.id)||s.requests.some(r=>r.from===req.user.id&&r.to===target||r.from===target&&r.to===req.user.id))throw error(409,'You already have a friendship or a pending request.');
   if(s.requests.filter(r=>r.from===req.user.id).length>=50)throw error(429,'You have too many pending requests.');
   s.requests.push({from:req.user.id,to:target,createdAt:now()});notification(s,target,'friend_request',req.user.id,req.user.name+' wants to be friends.','/friends?tab=requests');
  });notify([req.user.id,target]);res.status(201).json({ok:true});
 }));
 router.post('/friends/:id/:action',wrap(async(req,res)=>{
  const other=req.params.id,action=req.params.action;if(!['accept','decline','remove','block','unblock'].includes(action)||other===req.user.id)throw error(400,'Choose a valid friend action.');
  await store.transaction(s=>{
   if(!s.users[other])throw error(404,'Viewer not found.');
   if(action==='accept'){
    if(blocked(s,other,req.user.id)||!s.requests.some(r=>r.from===other&&r.to===req.user.id))throw error(404,'That friend request is no longer available.');
    if(!friends(s,other,req.user.id))s.friends.push({a:req.user.id,b:other,createdAt:now()});notification(s,other,'friend_accept',req.user.id,req.user.name+' accepted your friend request.','/friends?friend='+req.user.id);
   }
   if(action==='block'&&!s.blocks.some(r=>r.from===req.user.id&&r.to===other))s.blocks.push({from:req.user.id,to:other});
   if(action==='unblock')s.blocks=s.blocks.filter(r=>r.from!==req.user.id||r.to!==other);
   if(['remove','block'].includes(action))s.friends=s.friends.filter(r=>!(r.a===req.user.id&&r.b===other||r.a===other&&r.b===req.user.id));
   if(action!=='unblock')s.requests=s.requests.filter(r=>!(r.from===req.user.id&&r.to===other||r.from===other&&r.to===req.user.id));
  });notify([req.user.id,other]);res.json({ok:true});
 }));
 async function media(value){if(!['movie','tv'].includes(value?.type)||!/^\d{1,10}$/.test(String(value?.id||''))||Number(value.id)<1)throw error(400,'Choose a movie or series.');if(!resolveMedia)throw error(503,'The title catalog is unavailable.');const m=await resolveMedia(value.type,String(value.id));if(!m?.title)throw error(404,'This title is unavailable.');return {id:String(value.id),type:value.type,title:String(m.title).slice(0,180),poster:/^https:\/\/image\.tmdb\.org\//.test(m.poster||'')?m.poster:'',href:`/${value.type}/${value.id}`,year:String(m.year||'').slice(0,4)};}
 router.get('/messages/:id',wrap(async(req,res)=>{if(!friends(req.state,req.user.id,req.params.id))throw error(403,'Only accepted friends can open a conversation.');res.json({messages:req.state.messages.filter(m=>m.from===req.user.id&&m.to===req.params.id||m.from===req.params.id&&m.to===req.user.id).slice(-200)});}));
 router.post('/messages/:id',wrap(async(req,res)=>{
  const other=req.params.id,text=String(req.body?.text||'').trim(),kind=req.body?.kind||'text',clientId=String(req.body?.clientId||'').slice(0,64);
  if(!friends(req.state,req.user.id,other))throw error(403,'Only accepted friends can send messages.');if(!['text','title','party'].includes(kind)||text.length>2000||kind==='text'&&!text)throw error(400,'Write a message of up to 2,000 characters.');
  const selected=kind==='text'?null:await media(req.body?.media);let message;
  await store.transaction(async s=>{
   if(!friends(s,req.user.id,other))throw error(403,'This conversation is no longer available.');
   const duplicate=clientId&&s.messages.find(m=>m.from===req.user.id&&m.to===other&&m.clientId===clientId);if(duplicate){message=duplicate;return;}
   if(s.messages.filter(m=>m.from===req.user.id&&now()-m.createdAt<60000).length>=40)throw error(429,'Give your friend a moment to catch up.');
   const partyUrl=kind==='party'?await createParty?.(selected,req.user):'';if(kind==='party'&&(!partyUrl||!partyUrl.startsWith('/')||partyUrl.startsWith('//')))throw error(503,'A watchparty could not be created. Try again.');
   message={id:uid(),from:req.user.id,to:other,kind,text,createdAt:now(),readAt:0,...(clientId?{clientId}:{}),...(selected?{media:selected}:{}),...(partyUrl?{partyUrl}:{})};s.messages.push(message);
   const thread=s.messages.filter(m=>m.from===req.user.id&&m.to===other||m.from===other&&m.to===req.user.id);if(thread.length>1000){const remove=new Set(thread.slice(0,thread.length-1000).map(m=>m.id));s.messages=s.messages.filter(m=>!remove.has(m.id));}
   notification(s,other,kind==='party'?'party_invite':'message',req.user.id,req.user.name+(kind==='party'?' invited you to watch '+selected.title:kind==='title'?' sent you '+selected.title:': '+text),'/friends?friend='+req.user.id);
  });notify([req.user.id,other]);res.status(201).json({message});
 }));
 router.post('/messages/:id/read',wrap(async(req,res)=>{if(!friends(req.state,req.user.id,req.params.id))throw error(403,'This conversation is unavailable.');await store.transaction(s=>{for(const m of s.messages)if(m.from===req.params.id&&m.to===req.user.id&&!m.readAt)m.readAt=now();for(const n of s.notifications)if(n.to===req.user.id&&n.from===req.params.id&&['message','party_invite'].includes(n.kind))n.readAt=now();});notify([req.user.id,req.params.id]);res.json({ok:true});}));
 router.post('/notifications/read',wrap(async(req,res)=>{const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,200):[];await store.transaction(s=>{for(const n of s.notifications)if(n.to===req.user.id&&(req.body?.all===true||ids.includes(n.id)))n.readAt=now();});notify([req.user.id]);res.json({ok:true});}));
 router.post('/settings',wrap(async(req,res)=>{const patch=req.body||{};if(Object.keys(patch).some(k=>!['shareWatching','shareTaste'].includes(k))||Object.values(patch).some(v=>typeof v!=='boolean'))throw error(400,'Choose valid privacy settings.');await store.transaction(s=>Object.assign(s.users[req.user.id].settings,patch));if(patch.shareWatching===false)activity.delete(req.user.id);notify([req.user.id,...req.state.friends.filter(r=>r.a===req.user.id||r.b===req.user.id).map(r=>r.a===req.user.id?r.b:r.a)]);res.json({ok:true});}));
 router.post('/presence',wrap(async(req,res)=>{
  const previous=activity.get(req.user.id),value=req.body?.media;
  if(req.body?.playing===true&&req.user.settings.shareWatching){const selected=previous?.media.id===String(value?.id)&&previous.media.type===value?.type?previous.media:await media(value);activity.set(req.user.id,{media:selected,at:now(),since:previous?.media.id===selected.id&&previous.media.type===selected.type?previous.since:now()});}else activity.delete(req.user.id);
  const peers=req.state.friends.filter(r=>r.a===req.user.id||r.b===req.user.id).map(r=>r.a===req.user.id?r.b:r.a);notify(peers);res.json({ok:true});
 }));
 router.get('/state',wrap(async(req,res)=>res.json({state:req.user.state||{},revision:req.user.revision||0})));
 router.patch('/state',wrap(async(req,res)=>{
  const patch=req.body?.patch;if(!patch||Array.isArray(patch)||typeof patch!=='object'||Object.entries(patch).some(([k,v])=>!stateKey(k)||['swiflytv.profiles','movieverse.watchlist','movieverse.liked','movieverse.continue'].includes(k)&&(!Array.isArray(v)||v.length>(k==='swiflytv.profiles'?8:1000)))||Buffer.byteLength(JSON.stringify(patch))>400000)throw error(400,'This library update is invalid or too large.');
  let response;await store.transaction(s=>{const u=s.users[req.user.id];if(req.body.revision!==(u.revision||0))throw Object.assign(error(409,'Your library changed on another device.'),{current:{state:u.state||{},revision:u.revision||0}});const next={...u.state,...patch};if(Buffer.byteLength(JSON.stringify(next))>800000)throw error(413,'Your library is too large to sync.');u.state=next;u.revision=(u.revision||0)+1;response={revision:u.revision};});notify([req.user.id]);res.json(response);
 }));
 router.post('/home/invite',wrap(async(req,res)=>{const token=crypto.randomBytes(24).toString('base64url');let expiresAt;
  await store.transaction(s=>{let h=s.homes[s.users[req.user.id].homeId];if(!h){h={id:uid(),name:'Our movie nights',members:[req.user.id],titles:[]};s.homes[h.id]=h;s.users[req.user.id].homeId=h.id;}if(h.members.length>=2)throw error(409,'Your shared home already has two people.');for(const [key,v]of Object.entries(s.invites))if(v.homeId===h.id)delete s.invites[key];expiresAt=now()+86400000;s.invites[hash(token)]={homeId:h.id,from:req.user.id,expiresAt,usedAt:0};});notify([req.user.id]);res.status(201).json({token,expiresAt});
 }));
 router.post('/home/accept',wrap(async(req,res)=>{const token=String(req.body?.token||'');if(!/^[A-Za-z0-9_-]{32}$/.test(token))throw error(400,'That invitation is invalid.');let members;
  await store.transaction(s=>{const invite=s.invites[hash(token)];if(!invite||invite.usedAt)throw error(409,'This invitation has already been used or replaced.');if(invite.expiresAt<=now())throw error(410,'This invitation expired. Ask your partner for a new one.');const h=s.homes[invite.homeId],u=s.users[req.user.id];if(!h||h.members.length>=2||u.homeId)throw error(409,'Leave your current home before joining another, or ask for a new invitation.');h.members.push(u.id);u.homeId=h.id;invite.usedAt=now();members=[...h.members];notification(s,invite.from,'home_join',u.id,u.name+' joined your shared home.','/friends?tab=home');});notify(members);res.json({ok:true});
 }));
 router.post('/home/leave',wrap(async(req,res)=>{let members=[];await store.transaction(s=>{const u=s.users[req.user.id],h=s.homes[u.homeId];if(!h)return;members=[...h.members];h.members=h.members.filter(id=>id!==u.id);delete u.homeId;for(const [k,v]of Object.entries(s.invites))if(v.homeId===h.id)delete s.invites[k];if(!h.members.length)delete s.homes[h.id];});notify(members);res.json({ok:true});}));
 router.post('/home/titles',wrap(async(req,res)=>{const selected=await media(req.body?.media);let members;await store.transaction(s=>{const h=s.homes[s.users[req.user.id].homeId];if(!h)throw error(400,'Create or join a shared home first.');const key=selected.type+':'+selected.id;h.titles=h.titles.filter(m=>m.type+':'+m.id!==key);if(req.body.remove!==true)h.titles.unshift({...selected,addedBy:req.user.id});h.titles=h.titles.slice(0,200);members=h.members;});notify(members);res.json({ok:true});}));
 router.get('/home/taste',wrap(async(req,res)=>{const h=req.state.homes[req.user.homeId];if(!h)throw error(404,'Create or join a shared home first.');const titles=h.members.flatMap(id=>{const u=req.state.users[id];return u.settings.shareTaste?[...(Array.isArray(u.state['movieverse.liked'])?u.state['movieverse.liked']:[]),...(Array.isArray(u.state['movieverse.watchlist'])?u.state['movieverse.watchlist']:[])].filter(v=>v&&/^\d+$/.test(String(v.id))&&['movie','tv'].includes(v.type)).slice(0,30).map(v=>({id:String(v.id),type:v.type,title:String(v.title||v.name||'').slice(0,180)})):[];});res.json({titles:[...h.titles,...titles].slice(0,60)});}));
 router.use((e,req,res,next)=>{if(res.headersSent)return next(e);if(!e.status)console.error('[accounts]',e.code||e.name||'unavailable');res.status(e.status||503).json({message:e.status?e.message:'Accounts are temporarily unavailable. Try again shortly.',...(e.code?{code:e.code}:{}),...(e.current?{current:e.current}:{})});});
 const heartbeat=setInterval(()=>{const expired=[];for(const [id,a]of activity)if(now()-a.at>=90000){activity.delete(id);expired.push(id);}for(const stream of streams){if(!stream.res.writableEnded){stream.res.write(': keepalive\n\n');if(expired.length)stream.res.write('event: change\ndata: {}\n\n');stream.res.flush?.();}}},25000);heartbeat.unref?.();
 return {router,identity,notify,async close(){clearInterval(heartbeat);for(const stream of streams)stream.res.end();streams.clear();activity.clear();}};
}
module.exports={createConnect,stateKey};
