/* Portable personal data, never identity, credentials or arbitrary storage dumps. */
(function(root,factory){
 'use strict';const api=factory(typeof module==='object'&&module.exports?require('../studio/config.js'):root.SwiflyStudioConfig);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SwiflyAccountData=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis,function(config){
 'use strict';
 const MAX_BYTES=2*1024*1024,clone=value=>JSON.parse(JSON.stringify(value));
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const text=(value,max=200)=>typeof value==='string'||typeof value==='number'?String(value).replace(/[\u0000-\u001f]/g,'').slice(0,max):'';
 const integer=(value,min=1,max=9999999999)=>/^(?:0|[1-9]\d{0,9})$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
 const number=(value,min,max,fallback=0)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
 const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'1970-01-01T00:00:00.000Z';
 const profileId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value)?value:'';
 const array=(value,max,label)=>{if(!Array.isArray(value)||value.length>max)throw Error(label+' must contain at most '+max+' entries.');return value;};
 const image=value=>typeof value==='string'&&(/^(?:\/[-\w/]+\.(?:jpg|jpeg|png|webp)|https:\/\/image\.tmdb\.org\/t\/p\/[-\w/.]+)$/i.test(value))?value.slice(0,500):'';
 const prefs={spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:'grid',episodeSort:'oldest'};
 function bytes(value){let count=0;for(const c of value){const n=c.codePointAt(0);count+=n<=127?1:n<=2047?2:n<=65535?3:4;}return count;}
 function read(storage,key,fallback=null){try{return JSON.parse(storage.getItem(key)||'null')??fallback;}catch{return fallback;}}
 function keys(storage){return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(Boolean);}
 function safeStructure(value,depth=0){
  if(depth>20)throw Error('This backup is nested too deeply.');if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('This backup contains an unsafe field.');safeStructure(child,depth+1);}
 }
 function only(value,allowed,label){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unsupported '+label+' fields.');}
 function cleanProfile(value,index=0){
  if(!plain(value))throw Error('This backup contains an invalid profile.');
  const result={id:profileId(value.id)||'legacy-'+index,name:text(value.name,32).trim()||'Main',mode:value.mode==='kids'||value.kids===true?'kids':'standard'};
  const a=value.avatar;if(a?.type==='preset'&&['orbit','luna','ember','pixel','drift','nova','bloom','eclipse'].includes(a.id))result.avatar={type:'preset',id:a.id};
  else if(a?.type==='upload'&&typeof a.data==='string'&&a.data.length<=128000&&/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data))result.avatar={type:'upload',data:a.data};
  if(typeof value.icon==='string')result.icon=Array.from(value.icon).slice(0,8).join('');if(/^[a-z]{1,16}$/.test(value.color||''))result.color=value.color;return result;
 }
 function media(value,exact=false){
  if(!plain(value))return null;const id=integer(value.id??value.tmdbId),type=['tv','series'].includes(value.type??value.media_type)?'tv':(value.type??value.media_type??'movie')==='movie'?'movie':'';if(!id||!type)return null;
  const titleKey=type+':'+id,season=exact&&type==='tv'?integer(value.season??value.s,0,9999):null,episode=exact&&type==='tv'?integer(value.episode??value.e,1,9999):null;
  const result={key:season!==null&&episode!==null?titleKey+':'+season+':'+episode:titleKey,titleKey,id:String(id),type,title:text(value.title||value.name)||'Untitled',poster:image(value.poster||value.poster_path),backdrop:image(value.backdrop||value.backdrop_path),year:text(value.year,4),rating:text(value.rating,12)};
  if(season!==null&&episode!==null){result.season=season;result.episode=episode;}if(value.savedAt)result.savedAt=iso(value.savedAt);return result;
 }
 function unique(rows,normalize,max,label){
  const map=new Map();for(const row of array(rows,max,label)){const item=normalize(row);if(!item)throw Error(label+' contains an invalid title.');if(!map.has(item.key))map.set(item.key,item);}return [...map.values()];
 }
 function cleanLibrary(value={version:1}){
  if(!plain(value)||value.version!==1)throw Error('This library version is unsupported.');
  const result={version:1,watchlist:unique(value.watchlist||[],v=>media(v),300,'Saved titles'),liked:unique(value.liked||[],v=>media(v),300,'Favorites'),watched:[],history:[],folders:[],episodeRead:[],preferences:{...prefs}};
  for(const field of ['watched','history'])result[field]=unique(value[field]||[],v=>{const item=media(v,true);return item?{...item,watchedAt:iso(v.watchedAt),...(field==='history'?{currentTime:number(v.currentTime,0,43200),duration:number(v.duration,0,43200),completed:v.completed===true}:{} )}:null;},field==='watched'?1000:300,field);
  for(const f of array(value.folders||[],50,'Folders')){
   if(!plain(f)||!profileId(f.id)||!text(f.name,60).trim())throw Error('This backup contains an invalid folder.');
   const members=array(f.members||[],300,'Folder titles');if(members.some(key=>!/^(movie|tv):[1-9]\d{0,9}$/.test(key)))throw Error('This folder contains an invalid title.');
   if(!result.folders.some(row=>row.id===f.id))result.folders.push({id:f.id,name:text(f.name,60).trim(),members:[...new Set(members)],createdAt:iso(f.createdAt),updatedAt:iso(f.updatedAt)});
  }
  result.episodeRead=[...new Set(array(value.episodeRead||[],500,'Read episode notices').filter(v=>/^tv:[1-9]\d{0,9}:(?:0|[1-9]\d{0,3}):[1-9]\d{0,3}$/.test(v)))];
  for(const key of Object.keys(prefs))if(typeof prefs[key]==='boolean'&&typeof value.preferences?.[key]==='boolean')result.preferences[key]=value.preferences[key];
  if(['grid','rows'].includes(value.preferences?.episodeView))result.preferences.episodeView=value.preferences.episodeView;if(['oldest','newest'].includes(value.preferences?.episodeSort))result.preferences.episodeSort=value.preferences.episodeSort;return result;
 }
 function progress(rows){return unique(rows,v=>{const item=media(v,true);if(!item)return null;item.key=item.titleKey;return {...item,...(item.type==='tv'?{season:item.season??1,episode:item.episode??1}:{}),currentTime:number(v.currentTime??v.positionSeconds??v.position,0,43200),duration:number(v.duration??v.durationSeconds,0,43200),completed:v.completed===true||v.ended===true,nextEpisode:v.nextEpisode===true,watchedAt:iso(v.watchedAt)};},80,'Continue watching');}
 function appearance(value){
  if(!value)return null;if(!config)throw Error('Studio is still loading. Try again in a moment.');
  value=config.unpackRecord(value,{strict:true});
  const theme=config.parseImport(JSON.stringify({app:'SwiflyTV Studio',schemaVersion:2,name:'Account look',values:value.values}));
  const looks=array(value.looks||[],12,'Saved looks').map((v,index)=>{const parsed=config.parseImport(JSON.stringify({app:'SwiflyTV Studio',schemaVersion:2,name:text(v.name,64),description:text(v.description,160),values:v.values}));return{id:profileId(v.id)||'look-'+index,name:parsed.name,description:parsed.description,values:config.portable(parsed.values)};});return config.packRecord({values:theme.values,looks});
 }
 function study(value){
  if(!value)return null;if(!plain(value)||value.version!==1)throw Error('This Study data version is unsupported.');
  const scenes=['moon-cat','garden-cat','sunset-train','cozy-hobbit','frog-rain','raccoon-room','forest-tape'],track=v=>/^track-(?:[1-9]|1[0-9])$/.test(v),stations=['all','study','rain','night','cram','favorites'];
  const mix=v=>Object.fromEntries(['rain','room','vinyl','thunder'].map(k=>[k,number(v?.[k],0,1)])),visual=v=>({rain:number(v?.rain,0,100,8),dim:number(v?.dim,0,80,14),blur:number(v?.blur,0,6),motion:number(v?.motion,0,100,50)});
  const result={version:1,scene:scenes.includes(value.scene)?value.scene:'garden-cat',track:track(value.track)?value.track:'track-15',station:stations.includes(value.station)?value.station:'all',layout:['balanced','scenic','focus'].includes(value.layout)?value.layout:'balanced',volume:number(value.volume,0,1,.65),mix:mix(value.mix),visual:visual(value.visual),favorites:[...new Set(array(value.favorites||[],19,'Study favorites').filter(track))],tasks:[],setups:[],stats:{days:{}}};
  for(const k of ['muted','shuffle','repeat','night','clock','ambient'])result[k]=value[k]===true;
  result.tasks=array(value.tasks||[],30,'Study tasks').filter(v=>plain(v)&&text(v.id,64)&&text(v.text,120).trim()).map(v=>({id:text(v.id,64),text:text(v.text,120).trim(),done:v.done===true,credited:v.credited===true||v.done===true}));
  result.setups=array(value.setups||[],12,'Study setups').filter(v=>plain(v)&&scenes.includes(v.scene)&&track(v.track)).map(v=>({id:text(v.id,64),name:text(v.name,48).trim()||'My study room',scene:v.scene,track:v.track,station:stations.includes(v.station)?v.station:'all',layout:['balanced','scenic','focus'].includes(v.layout)?v.layout:'balanced',volume:number(v.volume,0,1,.65),night:v.night===true,ambient:v.ambient===true,mix:mix(v.mix),visual:visual(v.visual)}));
  for(const k of ['totalSeconds','sessions','tasksDone'])result.stats[k]=number(value.stats?.[k],0,1e10);for(const k of Object.keys(value.stats?.days||{}).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-400))result.stats.days[k]=number(value.stats.days[k],0,86400);return result;
 }
 function validate(value){
  safeStructure(value);only(value,['app','kind','version','createdAt','profiles'],'backup');if(value.app!=='SwiflyTV'||value.kind!=='account-backup'||value.version!==1)throw Error('Choose a SwiflyTV account backup (version 1). Studio theme files are imported in Studio.');
  const seen=new Set(),profiles=array(value.profiles,8,'Profiles').map((entry,index)=>{
   only(entry,['profile','library','continue','appearance','study'],'profile backup');const profile=cleanProfile(entry.profile,index);if(seen.has(profile.id))throw Error('This backup contains duplicate profile IDs.');seen.add(profile.id);
   return{profile,library:cleanLibrary(entry.library),continue:progress(entry.continue||[]),...(entry.appearance?{appearance:appearance(entry.appearance)}:{}),...(entry.study?{study:study(entry.study)}:{})};
  });if(!profiles.length)throw Error('This backup has no profiles.');return{app:'SwiflyTV',kind:'account-backup',version:1,createdAt:iso(value.createdAt),profiles};
 }
 function parse(input){if(typeof input!=='string'||bytes(input)>MAX_BYTES)throw Error('Account backup files must be 2 MB or smaller.');let value;try{value=JSON.parse(input);}catch{throw Error('This file is not valid JSON. Choose an exported SwiflyTV account backup.');}return validate(value);}
 function fromState(state,{owner='guest',storage,createdAt=new Date().toISOString()}={}){
  let raw=Array.isArray(state['swiflytv.profiles'])&&state['swiflytv.profiles'].length?state['swiflytv.profiles']:[{id:'main',name:'Main'}];
  raw=raw.map(cleanProfile);const ids=new Set(raw.map(v=>v.id));for(const key of Object.keys(state)){const match=/^swiflytv\.library\.([A-Za-z0-9_-]{1,80})$/.exec(key);if(match&&match[1]!=='__compat__'&&!ids.has(match[1])){raw.push({id:match[1],name:'Recovered profile',mode:'standard'});ids.add(match[1]);}}
  if(raw.length>8)throw Error('This browser has more than eight profiles to recover. Export profiles separately before importing.');
  const current=state['movieverse.continue']??state['swiflytv.continueWatching']??[];const entries=Array.isArray(current)?current:[];
  const profiles=raw.map((profile,index)=>{
   const library=state['swiflytv.library.'+profile.id]||{version:1,watchlist:index===0?state['movieverse.watchlist']||[]:[],liked:index===0?state['movieverse.liked']||[]:[]};
   const result={profile,library:cleanLibrary(library),continue:progress(entries.filter(v=>v?.profileId===profile.id||!v?.profileId&&index===0))};
   if(storage){const namespace=owner==='guest'?'guest'+(profile.id==='main'?'':':profile:'+encodeURIComponent(profile.id)):'account:'+encodeURIComponent(owner)+':profile:'+encodeURIComponent(profile.id);const own=read(storage,config?.storageKey(namespace));let a=own||read(storage,'swiflytv.appearance');if(a&&!own&&owner!=='guest'){a=config.unpackRecord(a,{strict:true});for(const v of [a.values,...a.looks.map(v=>v.values)]){v.wallpaperData='';v.wallpaperName='';if(v.wallpaper==='upload')v.wallpaper='theme';}}if(a?.version===1||a?.version===2)result.appearance=appearance(a);const s=read(storage,'swifly.study.v1.'+namespace);if(s)result.study=study(s);}
   return result;
  });return validate({app:'SwiflyTV',kind:'account-backup',version:1,createdAt,profiles});
 }
 function capture(storage,{owner='guest'}={}){const state={};for(const k of keys(storage))if(k==='swiflytv.profiles'||k==='swiflytv.continueWatching'||k.startsWith('swiflytv.library.')||['movieverse.watchlist','movieverse.liked','movieverse.continue'].includes(k))state[k]=read(storage,k);return fromState(state,{owner,storage});}
 function mergeRows(current,incoming,key,max,label,newer=false){const map=new Map(current.map(v=>[key(v),v]));for(const row of incoming){const id=key(row),old=map.get(id);if(!old||newer&&(Date.parse(row.watchedAt)>Date.parse(old.watchedAt)||row.watchedAt===old.watchedAt&&row.currentTime>old.currentTime))map.set(id,row);}if(map.size>max)throw Error(label+' exceeds the '+max+' entry limit. Nothing has been imported.');return [...map.values()];}
 function mergeLibrary(current,incoming){
  const result=clone(current);for(const [field,max]of [['watchlist',300],['liked',300],['watched',1000],['history',300]])result[field]=mergeRows(current[field],incoming[field],v=>v.key,max,field,['watched','history'].includes(field));
  result.folders=mergeRows(current.folders,incoming.folders,v=>v.id,50,'Folders').map(folder=>{const other=incoming.folders.find(v=>v.id===folder.id);if(!other)return folder;const members=[...new Set([...folder.members,...other.members])];if(members.length>300)throw Error('A folder exceeds the 300 title limit.');return{...folder,members};});result.episodeRead=[...new Set([...current.episodeRead,...incoming.episodeRead])].slice(-500);return result;
 }
 function hash(value){let n=2166136261;for(const c of value)n=Math.imul(n^c.codePointAt(0),16777619);return(n>>>0).toString(36);}
 function defaultMapping(incoming,current){
  const result={};for(const entry of incoming.profiles){const p=entry.profile,restored='restore-'+hash(p.id+'|'+p.name),same=current.profiles.find(v=>v.profile.id===p.id&&v.profile.name.toLowerCase()===p.name.toLowerCase())||current.profiles.find(v=>v.profile.id===restored)||current.profiles.find(v=>v.profile.name.toLowerCase()===p.name.toLowerCase());result[p.id]=same?.profile.id||'new';}return result;
 }
 function plan(input,currentInput,{mapping,personalization=false}={}){
  const incoming=validate(input),current=validate(currentInput),result=clone(current),selected=mapping||defaultMapping(incoming,current),actual={},added={titles:0,favorites:0,history:0,progress:0,profiles:0};
  for(const entry of incoming.profiles){const p=entry.profile,target=selected[p.id]||'new';let destination=target==='new'?null:result.profiles.find(v=>v.profile.id===target);if(target!=='new'&&!destination)throw Error('Choose a valid destination profile.');
   if(!destination){const id=result.profiles.some(v=>v.profile.id===p.id)?'restore-'+hash(p.id+'|'+p.name):p.id;destination=result.profiles.find(v=>v.profile.id===id);if(!destination){if(result.profiles.length>=8)throw Error('An account can have at most eight profiles. Merge into an existing profile to continue.');destination={profile:{...clone(p),id},library:cleanLibrary(),continue:[]};destination.library.preferences=clone(entry.library.preferences);result.profiles.push(destination);added.profiles++;}}
   actual[p.id]=destination.profile.id;const before=destination.library;destination.library=mergeLibrary(before,entry.library);for(const [key,field]of [['titles','watchlist'],['favorites','liked'],['history','history']])added[key]+=destination.library[field].length-before[field].length;
   const oldCount=destination.continue.length;destination.continue=mergeRows(destination.continue,entry.continue,v=>v.key,80,'Continue watching',true);added.progress+=destination.continue.length-oldCount;
   if(personalization){if(entry.appearance)destination.appearance=clone(entry.appearance);if(entry.study){const old=destination.study;destination.study=clone(entry.study);if(old){destination.study.tasks=mergeRows(old.tasks,entry.study.tasks,v=>v.id,30,'Study tasks');destination.study.setups=mergeRows(old.setups,entry.study.setups,v=>v.id,12,'Study setups');destination.study.favorites=[...new Set([...old.favorites,...entry.study.favorites])];destination.study.stats={days:{...old.stats.days}};for(const[k,v]of Object.entries(entry.study.stats.days))destination.study.stats.days[k]=Math.max(v,old.stats.days[k]||0);for(const k of ['totalSeconds','sessions','tasksDone'])destination.study.stats[k]=Math.max(old.stats[k],entry.study.stats[k]);}}}
   else{if(!destination.appearance&&entry.appearance)destination.appearance=clone(entry.appearance);if(!destination.study&&entry.study)destination.study=clone(entry.study);}
  }
  return{backup:validate(result),mapping:actual,added};
 }
 function statePatch(value,{activeProfile='main',owner='guest'}={}){
  const backup=validate(value),patch={'swiflytv.profiles':backup.profiles.map(v=>v.profile),'movieverse.continue':[]},local={};
  for(const entry of backup.profiles){const id=entry.profile.id;patch['swiflytv.library.'+id]=entry.library;patch['movieverse.continue'].push(...entry.continue.map(v=>({...v,profileId:id})));const namespace=owner==='guest'?'guest'+(id==='main'?'':':profile:'+encodeURIComponent(id)):'account:'+encodeURIComponent(owner)+':profile:'+encodeURIComponent(id);if(entry.appearance)local[config.storageKey(namespace)]=JSON.stringify(entry.appearance);if(entry.study)local['swifly.study.v1.'+namespace]=JSON.stringify(entry.study);}
  const active=backup.profiles.find(v=>v.profile.id===activeProfile)||backup.profiles[0];patch['movieverse.watchlist']=active.library.watchlist;patch['movieverse.liked']=active.library.liked;patch['swiflytv.library.__compat__']={version:1,owner:active.profile.id};return{patch,local};
 }
 function sources(storage,user){
  if(!user?.id)return[];const result=[];
  for(const key of keys(storage).filter(k=>k.startsWith('swiflytv.deviceState.'))){const owner=key.slice('swiflytv.deviceState.'.length),metadata=read(storage,'swiflytv.deviceOwner.'+owner),sameEmail=!!user.email&&typeof metadata?.email==='string'&&metadata.email===user.email.toLowerCase();if(!/^legacy(?:-[a-z0-9]+)?$/.test(owner)&&owner!==user.id&&!sameEmail)continue;
   try{const value=fromState(read(storage,key,{}),{storage,owner:owner.startsWith('legacy')?'guest':owner});const count=value.profiles.reduce((n,v)=>n+v.library.watchlist.length+v.library.liked.length+v.library.history.length+v.library.watched.length+v.library.folders.length+v.continue.length+(v.appearance?1:0)+(v.study?1:0),0);if(count)result.push({key,label:owner===user.id?'Earlier data for this account':sameEmail?'Earlier data for your email':'Earlier guest data on this browser',backup:value,count});}catch{}
  }return result;
 }
 function writeAtomic(storage,values){
  const prior=Object.fromEntries(Object.keys(values).map(k=>[k,storage.getItem(k)]));try{for(const[k,v]of Object.entries(values))storage.setItem(k,v);}catch(error){let restored=true;for(const k of Object.keys(prior))try{storage.removeItem(k);}catch{restored=false;}for(const[k,v]of Object.entries(prior))if(v!==null)try{storage.setItem(k,v);}catch{restored=false;}throw Error(restored?'Browser storage is full or unavailable. Nothing was imported. Export a backup, free some space, then try again.':'Browser storage could not be restored completely. Keep this page open and export a backup before continuing.',{cause:error});}
 }
 return{MAX_BYTES,bytes,parse,validate,capture,fromState,plan,defaultMapping,statePatch,sources,writeAtomic};
});
